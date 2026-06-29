"""绿幕抠像、帧归一化和增强。"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

from . import (
    ALPHA_CROP_THRESHOLD,
    CANDIDATE_GROUND_PADDING,
    CANDIDATE_VISIBLE_HEIGHT,
    CANDIDATE_VISIBLE_MAX_WIDTH,
    ENHANCED_FRAME_SIZE,
    MAX_PET_SIZE,
    PET_GROUND_PADDING,
    VISIBLE_PET_MAX_WIDTH,
    VISIBLE_PET_TARGET_HEIGHT,
)
from .files import clear_frame_dir


def chroma_key_green_image(input_path: Path) -> Image.Image:
    """对绿幕帧进行抠像，生成 RGBA 图像。"""
    image = Image.open(input_path).convert("RGBA")
    pixels = np.array(image).astype(np.float32)
    rgb = pixels[:, :, :3]
    r = rgb[:, :, 0]
    g = rgb[:, :, 1]
    b = rgb[:, :, 2]
    max_rb = np.maximum(r, b)

    green_strength = g - max_rb
    green_ratio = g / np.maximum(1.0, r + g + b)
    green_brightness = np.clip((g - 38.0) / 150.0, 0.0, 1.0)
    dominance = np.clip((green_strength - 4.0) / 70.0, 0.0, 1.0)
    chroma_ratio = np.clip((green_ratio - 0.34) / 0.18, 0.0, 1.0)
    ratio_gate = (g > 45.0) & (g > r * 1.02) & (g > b * 1.02)
    confidence = np.where(ratio_gate, np.maximum(dominance, chroma_ratio) * green_brightness, 0.0)

    alpha = np.full(g.shape, 255.0, dtype=np.float32)
    alpha = np.where(confidence > 0.05, 255.0 * (1.0 - confidence), alpha)
    alpha = np.where(confidence > 0.68, 0.0, alpha)
    alpha = np.where(confidence < 0.07, 255.0, alpha)

    spill = (g > 45.0) & (green_strength > 3.0) & (green_ratio > 0.32)
    rgb[:, :, 1] = np.where(spill, np.minimum(g, max_rb * 0.96 + 4.0), g)
    rgb[alpha < 8.0] = 0.0

    pixels[:, :, :3] = np.clip(rgb, 0.0, 255.0)
    pixels[:, :, 3] = np.clip(alpha, 0.0, 255.0)
    return Image.fromarray(pixels.astype(np.uint8), "RGBA")


def get_visible_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    """计算图像中 alpha 可见区域的边界 (left, top, right, bottom)。"""
    alpha = np.array(image.getchannel("A"))
    visible_pixels = np.argwhere(alpha > ALPHA_CROP_THRESHOLD)
    if visible_pixels.size == 0:
        return None

    top, left = visible_pixels.min(axis=0)
    bottom, right = visible_pixels.max(axis=0) + 1
    return left, top, right, bottom


def get_frame_geometry(image: Image.Image, alpha_threshold: int = ALPHA_CROP_THRESHOLD) -> dict[str, float | int] | None:
    """Return visible alpha geometry for a normalized RGBA frame."""
    alpha = np.array(image.convert("RGBA").getchannel("A"))
    visible_pixels = np.argwhere(alpha > alpha_threshold)
    if visible_pixels.size == 0:
        return None

    top, left = visible_pixels.min(axis=0)
    bottom, right = visible_pixels.max(axis=0)
    width = int(right - left + 1)
    height = int(bottom - top + 1)
    return {
        "left": int(left),
        "top": int(top),
        "right": int(right),
        "bottom": int(bottom),
        "width": width,
        "height": height,
        "centerX": float((left + right + 1) / 2.0),
        "centerY": float((top + bottom + 1) / 2.0),
    }


def align_frame_to_reference(
    image: Image.Image,
    reference: dict[str, float | int] | None,
    *,
    align_center_x: bool = False,
    align_bottom: bool = False,
    max_shift: int = 32,
) -> tuple[Image.Image, dict[str, int | bool]]:
    """Translate a frame so its visible center/bottom matches a reference."""
    output = image.convert("RGBA")
    current = get_frame_geometry(output)
    if not current or not reference:
        return output, {"applied": False, "dx": 0, "dy": 0}

    dx = 0
    dy = 0
    if align_center_x and "centerX" in reference:
        dx = int(round(float(reference["centerX"]) - float(current["centerX"])))
    if align_bottom and "bottom" in reference:
        dy = int(round(float(reference["bottom"]) - float(current["bottom"])))

    dx = int(np.clip(dx, -max_shift, max_shift))
    dy = int(np.clip(dy, -max_shift, max_shift))
    if dx == 0 and dy == 0:
        return output, {"applied": False, "dx": 0, "dy": 0}

    shifted = Image.new("RGBA", output.size, (0, 0, 0, 0))
    shifted.alpha_composite(output, (dx, dy))
    return shifted, {"applied": True, "dx": dx, "dy": dy}


def translate_frame(image: Image.Image, dx: int, dy: int) -> Image.Image:
    """Apply a transparent-canvas translation to one RGBA frame."""
    output = Image.new("RGBA", image.size, (0, 0, 0, 0))
    output.alpha_composite(image.convert("RGBA"), (dx, dy))
    return output


def get_global_bounds(raw_frames: list[Path]) -> tuple[int, int, int, int]:
    """计算所有帧的全局可见边界（含 6px padding）。"""
    lefts: list[int] = []
    tops: list[int] = []
    rights: list[int] = []
    bottoms: list[int] = []

    for raw_frame in raw_frames:
        bounds = get_visible_bounds(chroma_key_green_image(raw_frame))
        if bounds is None:
            continue
        left, top, right, bottom = bounds
        lefts.append(left)
        tops.append(top)
        rights.append(right)
        bottoms.append(bottom)

    if not lefts:
        raise RuntimeError("No visible pixels found after chroma keying.")

    padding = 6
    return (
        int(max(0, min(lefts) - padding)),
        int(max(0, min(tops) - padding)),
        int(max(rights) + padding),
        int(max(bottoms) + padding),
    )


def normalize_pet_frame(image: Image.Image, bounds: tuple[int, int, int, int]) -> Image.Image:
    """将帧裁剪、缩放到 128px 画布（legacy 管线，用于 transparent_frames）。"""
    left, top, right, bottom = bounds
    cropped = image.crop((left, top, right, bottom))
    width, height = cropped.size
    scale = min(VISIBLE_PET_TARGET_HEIGHT / height, VISIBLE_PET_MAX_WIDTH / width)
    target_width = max(1, round(width * scale))
    target_height = max(1, round(height * scale))
    resized = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)

    output = Image.new("RGBA", (MAX_PET_SIZE, MAX_PET_SIZE), (0, 0, 0, 0))
    x = (MAX_PET_SIZE - target_width) // 2
    y = MAX_PET_SIZE - PET_GROUND_PADDING - target_height
    output.alpha_composite(resized, (x, y))
    return despill_normalized_frame(output)


def despill_normalized_frame(image: Image.Image) -> Image.Image:
    """去除归一化帧边缘的绿色溢出。"""
    pixels = np.array(image).astype(np.float32)
    r = pixels[:, :, 0]
    g = pixels[:, :, 1]
    b = pixels[:, :, 2]
    a = pixels[:, :, 3]
    max_rb = np.maximum(r, b)

    green_edge = (a > 0.0) & (g > 45.0) & (g > r * 1.03) & (g > b * 1.03)
    pixels[:, :, 1] = np.where(green_edge, np.minimum(g, max_rb * 0.88 + 5.0), g)

    weak_green_edge = green_edge & (a < 180.0)
    pixels[:, :, 3] = np.where(weak_green_edge, a * 0.72, a)

    return Image.fromarray(np.clip(pixels, 0.0, 255.0).astype(np.uint8), "RGBA")


def hard_clean_alpha(image: Image.Image) -> Image.Image:
    """硬性清理 alpha 通道和绿色边缘。"""
    pixels = np.array(image.convert("RGBA")).astype(np.float32)
    r = pixels[:, :, 0]
    g = pixels[:, :, 1]
    b = pixels[:, :, 2]
    a = pixels[:, :, 3]
    max_rb = np.maximum(r, b)

    green_edge = (a > 0.0) & (g > 42.0) & (g > r * 1.02) & (g > b * 1.02) & ((g - max_rb) > 2.0)
    pixels[:, :, 1] = np.where(green_edge, np.minimum(g, max_rb * 0.86 + 6.0), g)

    alpha = np.where(a < 10.0, 0.0, a)
    alpha = np.where(alpha > 248.0, 255.0, alpha)
    pixels[:, :, 3] = alpha
    pixels[alpha == 0.0, :3] = 0.0
    return Image.fromarray(np.clip(pixels, 0.0, 255.0).astype(np.uint8), "RGBA")


def enhance_rgba(image: Image.Image) -> Image.Image:
    """增强 RGBA 图像：对比度、锐度和硬性 alpha 清理。"""
    image = hard_clean_alpha(image)
    alpha = image.getchannel("A")
    rgb = image.convert("RGB")
    rgb = ImageEnhance.Contrast(rgb).enhance(1.035)
    rgb = ImageEnhance.Sharpness(rgb).enhance(1.08)
    rgb = rgb.filter(ImageFilter.UnsharpMask(radius=0.65, percent=70, threshold=4))
    output = rgb.convert("RGBA")
    output.putalpha(alpha)
    return hard_clean_alpha(output)


def normalize_candidate_frame(
    image: Image.Image,
    bounds: tuple[int, int, int, int],
    visible_height: int = CANDIDATE_VISIBLE_HEIGHT,
    visible_max_width: int = CANDIDATE_VISIBLE_MAX_WIDTH,
) -> Image.Image:
    """将帧裁剪、缩放到 256px 增强画布（用于 processed_frames 素材池）。"""
    left, top, right, bottom = bounds
    cropped = image.crop((left, top, right, bottom))
    width, height = cropped.size
    scale = min(visible_height / height, visible_max_width / width)
    target_width = max(1, round(width * scale))
    target_height = max(1, round(height * scale))
    resized = cropped.resize((target_width, target_height), Image.Resampling.LANCZOS)
    resized = enhance_rgba(resized)

    output = Image.new("RGBA", (ENHANCED_FRAME_SIZE, ENHANCED_FRAME_SIZE), (0, 0, 0, 0))
    x = (ENHANCED_FRAME_SIZE - target_width) // 2
    y = ENHANCED_FRAME_SIZE - CANDIDATE_GROUND_PADDING - target_height
    output.alpha_composite(resized, (x, y))
    return hard_clean_alpha(output)


def process_frames_to_processed(
    raw_dir: Path,
    processed_dir: Path,
    visible_height: int | None = None,
    visible_max_width: int | None = None,
    trim_ground_alpha_auto: bool = False,
    trim_ground_alpha: int = 0,
    trim_ground_padding: int = 1,
    align_reference: dict[str, float | int] | None = None,
    align_center_x: bool = False,
    align_bottom: bool = False,
    align_max_shift: int = 32,
) -> list[Path]:
    """生成 256px 增强帧到 processed_frames（素材池）。"""
    clear_frame_dir(processed_dir)
    raw_frames = sorted(raw_dir.glob("frame_*.png"))
    if not raw_frames:
        raise RuntimeError(f"No PNG frames found in {raw_dir}")

    global_bounds = get_global_bounds(raw_frames)
    enhanced_frames: list[tuple[str, Image.Image]] = []
    for raw_frame in raw_frames:
        keyed = chroma_key_green_image(raw_frame)
        kwargs = {}
        if visible_height is not None:
            kwargs["visible_height"] = visible_height
        if visible_max_width is not None:
            kwargs["visible_max_width"] = visible_max_width
        enhanced = normalize_candidate_frame(keyed, global_bounds, **kwargs)
        enhanced, _trim_info = trim_ground_alpha_remnants_auto(
            enhanced,
            enabled=trim_ground_alpha_auto,
            solid_threshold=trim_ground_alpha,
            row_padding=trim_ground_padding,
        )
        enhanced_frames.append((raw_frame.name, enhanced))

    align_delta = {"dx": 0, "dy": 0}
    if enhanced_frames and align_reference and (align_center_x or align_bottom):
        _aligned, align_delta = align_frame_to_reference(
            enhanced_frames[0][1],
            align_reference,
            align_center_x=align_center_x,
            align_bottom=align_bottom,
            max_shift=align_max_shift,
        )

    for name, enhanced in enhanced_frames:
        if align_delta["dx"] or align_delta["dy"]:
            enhanced = translate_frame(enhanced, int(align_delta["dx"]), int(align_delta["dy"]))
        enhanced.save(processed_dir / name)

    return sorted(processed_dir.glob("frame_*.png"))


def process_frames_legacy(raw_dir: Path, transparent_dir: Path) -> list[Path]:
    """生成 128px 帧到 transparent_frames（legacy 管线）。"""
    clear_frame_dir(transparent_dir)
    raw_frames = sorted(raw_dir.glob("frame_*.png"))
    if not raw_frames:
        raise RuntimeError(f"No PNG frames found in {raw_dir}")

    global_bounds = get_global_bounds(raw_frames)
    for raw_frame in raw_frames:
        keyed = chroma_key_green_image(raw_frame)
        normalize_pet_frame(keyed, global_bounds).save(transparent_dir / raw_frame.name)

    return sorted(transparent_dir.glob("frame_*.png"))


def trim_ground_alpha_remnants(
    image: Image.Image,
    solid_threshold: int,
    row_padding: int,
) -> Image.Image:
    """清理落地点以下的残留透明边。"""
    if solid_threshold <= 0:
        return image

    pixels = np.array(image.convert("RGBA"))
    alpha = pixels[:, :, 3]
    solid_rows = np.argwhere(alpha > solid_threshold)
    if solid_rows.size == 0:
        return image

    solid_bottom = int(solid_rows[:, 0].max())
    trim_from = min(alpha.shape[0], solid_bottom + max(0, row_padding) + 1)
    if trim_from < alpha.shape[0]:
        pixels[trim_from:, :, 3] = 0
        pixels[trim_from:, :, :3] = 0

    return Image.fromarray(pixels, "RGBA")


def detect_ground_alpha_remnants(
    image: Image.Image,
    solid_threshold: int = 128,
    low_alpha_threshold: int = 48,
) -> dict[str, int | bool]:
    """Detect low-alpha rows below the last solid body row."""
    pixels = np.array(image.convert("RGBA"))
    alpha = pixels[:, :, 3]
    solid_rows = np.argwhere(alpha > solid_threshold)
    if solid_rows.size == 0:
        return {"hasSolid": False, "lowRows": 0, "lowPixels": 0, "solidBottom": -1, "lowBottom": -1}

    solid_bottom = int(solid_rows[:, 0].max())
    below = alpha[solid_bottom + 1 :, :]
    if below.size == 0:
        return {"hasSolid": True, "lowRows": 0, "lowPixels": 0, "solidBottom": solid_bottom, "lowBottom": solid_bottom}

    low_mask = (below > 0) & (below <= low_alpha_threshold)
    rows = np.argwhere(low_mask)
    if rows.size == 0:
        return {"hasSolid": True, "lowRows": 0, "lowPixels": 0, "solidBottom": solid_bottom, "lowBottom": solid_bottom}

    low_bottom = solid_bottom + 1 + int(rows[:, 0].max())
    return {
        "hasSolid": True,
        "lowRows": int(low_bottom - solid_bottom),
        "lowPixels": int(low_mask.sum()),
        "solidBottom": solid_bottom,
        "lowBottom": low_bottom,
    }


def trim_ground_alpha_remnants_auto(
    image: Image.Image,
    *,
    enabled: bool,
    solid_threshold: int = 128,
    low_alpha_threshold: int = 48,
    row_padding: int = 1,
    min_low_rows: int = 1,
) -> tuple[Image.Image, dict[str, int | bool]]:
    """Safely clear only low-alpha ground residue below the solid body."""
    output = image.convert("RGBA")
    info = detect_ground_alpha_remnants(output, solid_threshold, low_alpha_threshold)
    info = {**info, "applied": False}
    if not enabled or int(info["lowRows"]) < min_low_rows:
        return output, info

    pixels = np.array(output)
    trim_from = min(pixels.shape[0], int(info["solidBottom"]) + max(0, row_padding) + 1)
    if trim_from >= pixels.shape[0]:
        return output, info

    tail = pixels[trim_from:, :, 3]
    if np.any(tail > low_alpha_threshold):
        return output, info

    pixels[trim_from:, :, 3] = 0
    pixels[trim_from:, :, :3] = 0
    info["applied"] = True
    return Image.fromarray(pixels, "RGBA"), info
