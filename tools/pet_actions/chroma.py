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
    CROP_NORMALIZATION,
    ENHANCED_FRAME_SIZE,
    MAX_PET_SIZE,
    NORMALIZATION_MODES,
    PET_GROUND_PADDING,
    SOURCE_CANVAS_NORMALIZATION,
    VISIBLE_PET_MAX_WIDTH,
    VISIBLE_PET_TARGET_HEIGHT,
)
from .files import clear_frame_dir


def _flood_connected_to_border(mask: np.ndarray) -> np.ndarray:
    """Return mask pixels connected to the image border."""
    height, width = mask.shape
    connected = np.zeros(mask.shape, dtype=bool)
    stack: list[tuple[int, int]] = []

    for x in range(width):
        if mask[0, x]:
            stack.append((0, x))
        if height > 1 and mask[height - 1, x]:
            stack.append((height - 1, x))
    for y in range(1, max(1, height - 1)):
        if mask[y, 0]:
            stack.append((y, 0))
        if width > 1 and mask[y, width - 1]:
            stack.append((y, width - 1))

    while stack:
        y, x = stack.pop()
        if connected[y, x] or not mask[y, x]:
            continue
        connected[y, x] = True
        if y > 0:
            stack.append((y - 1, x))
        if y + 1 < height:
            stack.append((y + 1, x))
        if x > 0:
            stack.append((y, x - 1))
        if x + 1 < width:
            stack.append((y, x + 1))

    return connected


def _iter_components(mask: np.ndarray):
    """Yield connected components from a boolean mask."""
    height, width = mask.shape
    visited = np.zeros(mask.shape, dtype=bool)
    starts_y, starts_x = np.nonzero(mask)

    for start_y, start_x in zip(starts_y, starts_x):
        sy = int(start_y)
        sx = int(start_x)
        if visited[sy, sx]:
            continue

        stack = [(sy, sx)]
        ys: list[int] = []
        xs: list[int] = []
        visited[sy, sx] = True

        while stack:
            y, x = stack.pop()
            ys.append(y)
            xs.append(x)

            if y > 0 and mask[y - 1, x] and not visited[y - 1, x]:
                visited[y - 1, x] = True
                stack.append((y - 1, x))
            if y + 1 < height and mask[y + 1, x] and not visited[y + 1, x]:
                visited[y + 1, x] = True
                stack.append((y + 1, x))
            if x > 0 and mask[y, x - 1] and not visited[y, x - 1]:
                visited[y, x - 1] = True
                stack.append((y, x - 1))
            if x + 1 < width and mask[y, x + 1] and not visited[y, x + 1]:
                visited[y, x + 1] = True
                stack.append((y, x + 1))

        yield np.array(ys, dtype=np.intp), np.array(xs, dtype=np.intp)


def _fill_component_rgb_from_neighbors(
    pixels: np.ndarray,
    ys: np.ndarray,
    xs: np.ndarray,
    *,
    visible_threshold: int,
) -> None:
    alpha = pixels[:, :, 3]
    component_mask = np.zeros(alpha.shape, dtype=bool)
    component_mask[ys, xs] = True
    neighbor_values: list[np.ndarray] = []
    height, width = alpha.shape

    for y, x in zip(ys, xs):
        for ny, nx in ((int(y) - 1, int(x)), (int(y) + 1, int(x)), (int(y), int(x) - 1), (int(y), int(x) + 1)):
            if 0 <= ny < height and 0 <= nx < width and not component_mask[ny, nx] and alpha[ny, nx] > visible_threshold:
                neighbor_values.append(pixels[ny, nx, :3])

    if not neighbor_values:
        return

    current_rgb = pixels[ys, xs, :3]
    if float(current_rgb.mean()) <= 3.0:
        pixels[ys, xs, :3] = np.mean(neighbor_values, axis=0)


def stabilize_alpha_mask_pixels(
    pixels: np.ndarray,
    *,
    visible_threshold: int = ALPHA_CROP_THRESHOLD,
    fill_alpha: int = 255,
) -> tuple[np.ndarray, dict[str, int]]:
    """Repair small enclosed alpha holes without expanding the outer contour."""
    alpha = pixels[:, :, 3]
    transparent = alpha <= visible_threshold
    outside = _flood_connected_to_border(transparent)
    interior = transparent & ~outside
    if not np.any(interior):
        return pixels, {"components": 0, "pixels": 0, "maxArea": 0}

    height, width = transparent.shape
    area_limit = max(96, int(height * width * 0.006))
    span_limit = max(10, int(min(height, width) * 0.12))
    repaired_components = 0
    repaired_pixels = 0
    max_area = 0

    for ys, xs in _iter_components(interior):
        area = int(len(ys))
        box_height = int(ys.max() - ys.min() + 1)
        box_width = int(xs.max() - xs.min() + 1)
        if area > area_limit or box_height > span_limit or box_width > span_limit:
            continue

        _fill_component_rgb_from_neighbors(pixels, ys, xs, visible_threshold=visible_threshold)
        alpha[ys, xs] = np.maximum(alpha[ys, xs], float(fill_alpha))
        repaired_components += 1
        repaired_pixels += area
        max_area = max(max_area, area)

    pixels[:, :, 3] = alpha
    return pixels, {"components": repaired_components, "pixels": repaired_pixels, "maxArea": max_area}


def _dense_low_alpha_mask(
    alpha: np.ndarray,
    *,
    visible_threshold: int = ALPHA_CROP_THRESHOLD,
    low_alpha_threshold: int = 48,
    radius: int = 2,
    min_density: int = 176,
) -> np.ndarray:
    visible = np.where(alpha > visible_threshold, 255, 0).astype(np.uint8)
    density = np.array(Image.fromarray(visible, "L").filter(ImageFilter.BoxBlur(radius))).astype(np.float32)
    return (alpha <= low_alpha_threshold) & (density >= float(min_density))


def _visible_slice(
    alpha: np.ndarray,
    *,
    visible_threshold: int = ALPHA_CROP_THRESHOLD,
    padding: int = 3,
):
    visible_pixels = np.argwhere(alpha > visible_threshold)
    if visible_pixels.size == 0:
        return None
    top, left = visible_pixels.min(axis=0)
    bottom, right = visible_pixels.max(axis=0) + 1
    return (
        slice(max(0, int(top) - padding), min(alpha.shape[0], int(bottom) + padding)),
        slice(max(0, int(left) - padding), min(alpha.shape[1], int(right) + padding)),
    )


def _fill_mask_from_local_neighbors(
    pixels: np.ndarray,
    repair_mask: np.ndarray,
    *,
    visible_threshold: int = ALPHA_CROP_THRESHOLD,
    radius: int = 2,
) -> None:
    alpha = pixels[:, :, 3]
    height, width = alpha.shape
    ys, xs = np.nonzero(repair_mask)
    for y_value, x_value in zip(ys, xs):
        y = int(y_value)
        x = int(x_value)
        top = max(0, y - radius)
        bottom = min(height, y + radius + 1)
        left = max(0, x - radius)
        right = min(width, x + radius + 1)
        region = pixels[top:bottom, left:right, :]
        visible = region[:, :, 3] > visible_threshold
        if not np.any(visible):
            continue
        pixels[y, x, :3] = np.mean(region[:, :, :3][visible], axis=0)
        pixels[y, x, 3] = max(float(pixels[y, x, 3]), float(np.mean(region[:, :, 3][visible])))


def repair_dense_low_alpha_cracks(
    pixels: np.ndarray,
    *,
    visible_threshold: int = ALPHA_CROP_THRESHOLD,
    low_alpha_threshold: int = 48,
    iterations: int = 2,
) -> tuple[np.ndarray, dict[str, int]]:
    """Fill tiny low-alpha cracks whose local neighborhood is mostly foreground."""
    visible_slice = _visible_slice(pixels[:, :, 3], visible_threshold=visible_threshold)
    if visible_slice is None:
        return pixels, {"passes": 0, "pixels": 0, "maxPixelsPerPass": 0}
    y_slice, x_slice = visible_slice
    work_pixels = pixels[y_slice, x_slice, :]
    total_pixels = 0
    max_pixels = 0
    passes = 0
    for _ in range(max(1, iterations)):
        alpha = work_pixels[:, :, 3]
        repair_mask = _dense_low_alpha_mask(
            alpha,
            visible_threshold=visible_threshold,
            low_alpha_threshold=low_alpha_threshold,
        )
        count = int(repair_mask.sum())
        if count == 0:
            break
        _fill_mask_from_local_neighbors(work_pixels, repair_mask, visible_threshold=visible_threshold)
        total_pixels += count
        max_pixels = max(max_pixels, count)
        passes += 1

    pixels[y_slice, x_slice, :] = work_pixels
    return pixels, {"passes": passes, "pixels": total_pixels, "maxPixelsPerPass": max_pixels}


def detect_dense_low_alpha_cracks(
    image: Image.Image,
    *,
    visible_threshold: int = ALPHA_CROP_THRESHOLD,
    low_alpha_threshold: int = 48,
) -> dict[str, int]:
    """Detect low-alpha pixels in locally dense foreground neighborhoods."""
    alpha = np.array(image.convert("RGBA").getchannel("A")).astype(np.float32)
    visible_slice = _visible_slice(alpha, visible_threshold=visible_threshold)
    if visible_slice is None:
        return {"components": 0, "pixels": 0, "maxArea": 0}
    y_slice, x_slice = visible_slice
    mask = _dense_low_alpha_mask(
        alpha[y_slice, x_slice],
        visible_threshold=visible_threshold,
        low_alpha_threshold=low_alpha_threshold,
    )
    components = 0
    max_area = 0
    if np.any(mask):
        for ys, _xs in _iter_components(mask):
            area = int(len(ys))
            components += 1
            max_area = max(max_area, area)
    return {"components": components, "pixels": int(mask.sum()), "maxArea": max_area}


def detect_interior_alpha_holes(
    image: Image.Image,
    *,
    visible_threshold: int = ALPHA_CROP_THRESHOLD,
) -> dict[str, int]:
    """Detect transparent pinholes in locally dense foreground neighborhoods."""
    alpha = np.array(image.convert("RGBA").getchannel("A")).astype(np.float32)
    visible_slice = _visible_slice(alpha, visible_threshold=visible_threshold)
    if visible_slice is None:
        return {"components": 0, "pixels": 0, "maxArea": 0}
    y_slice, x_slice = visible_slice
    interior = _dense_low_alpha_mask(
        alpha[y_slice, x_slice],
        visible_threshold=visible_threshold,
        low_alpha_threshold=visible_threshold,
    )
    if not np.any(interior):
        return {"components": 0, "pixels": 0, "maxArea": 0}

    components = 0
    pixels = 0
    max_area = 0
    for ys, _xs in _iter_components(interior):
        area = int(len(ys))
        components += 1
        pixels += area
        max_area = max(max_area, area)

    return {"components": components, "pixels": pixels, "maxArea": max_area}


def repair_interior_alpha_holes(image: Image.Image) -> Image.Image:
    """Repair enclosed alpha pinholes after a frame has been normalized."""
    pixels = np.array(image.convert("RGBA")).astype(np.float32)
    pixels, _crack_info = repair_dense_low_alpha_cracks(pixels)
    pixels[pixels[:, :, 3] < 8.0, :3] = 0.0
    return Image.fromarray(np.clip(pixels, 0.0, 255.0).astype(np.uint8), "RGBA")


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
    min_rgb = np.minimum(np.minimum(r, g), b)
    max_rgb = np.maximum(np.maximum(r, g), b)
    low_saturation = (max_rgb - min_rgb) < 72.0
    bright_neutral_foreground = (min_rgb > 145.0) & (max_rgb > 178.0) & low_saturation & (green_strength < 46.0)
    confidence = np.where(bright_neutral_foreground, np.minimum(confidence, 0.04), confidence)

    alpha = np.full(g.shape, 255.0, dtype=np.float32)
    alpha = np.where(confidence > 0.05, 255.0 * (1.0 - confidence), alpha)
    alpha = np.where(confidence > 0.68, 0.0, alpha)
    alpha = np.where(confidence < 0.07, 255.0, alpha)

    spill = (g > 45.0) & (green_strength > 3.0) & (green_ratio > 0.32)
    rgb[:, :, 1] = np.where(spill, np.minimum(g, max_rb * 0.96 + 4.0), g)

    pixels[:, :, :3] = np.clip(rgb, 0.0, 255.0)
    pixels[:, :, 3] = np.clip(alpha, 0.0, 255.0)
    pixels[pixels[:, :, 3] < 8.0, :3] = 0.0
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


def center_frames_to_canvas_x(
    frames: list[tuple[str, Image.Image]],
    *,
    enabled: bool = False,
    target_x: float | None = None,
    max_shift: int = 32,
) -> tuple[list[tuple[str, Image.Image]], dict[str, float | int | bool]]:
    """Apply one action-level X shift so median visible center reaches the canvas center."""
    resolved_target_x = float(target_x) if target_x is not None else 0.0
    empty_info: dict[str, float | int | bool] = {
        "applied": False,
        "dx": 0,
        "targetX": resolved_target_x,
        "medianCenterX": 0.0,
    }
    if not enabled or not frames:
        return frames, empty_info

    if target_x is None:
        resolved_target_x = float(frames[0][1].width / 2.0)

    centers: list[float] = []
    for _name, frame in frames:
        geometry = get_frame_geometry(frame)
        if geometry is not None:
            centers.append(float(geometry["centerX"]))

    if not centers:
        return frames, {**empty_info, "targetX": resolved_target_x}

    median_center_x = float(np.median(centers))
    dx = int(round(resolved_target_x - median_center_x))
    dx = int(np.clip(dx, -max_shift, max_shift))
    info: dict[str, float | int | bool] = {
        "applied": dx != 0,
        "dx": dx,
        "targetX": resolved_target_x,
        "medianCenterX": median_center_x,
    }
    if dx == 0:
        return frames, info

    return [(name, translate_frame(frame, dx, 0)) for name, frame in frames], info


def _alpha_component_records(alpha: np.ndarray, threshold: int) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for ys, xs in _iter_components(alpha > threshold):
        area = int(len(ys))
        if area <= 0:
            continue
        records.append({
            "ys": ys,
            "xs": xs,
            "area": area,
            "left": int(xs.min()),
            "top": int(ys.min()),
            "right": int(xs.max()),
            "bottom": int(ys.max()),
            "width": int(xs.max() - xs.min() + 1),
            "height": int(ys.max() - ys.min() + 1),
            "maxAlpha": int(alpha[ys, xs].max()),
        })
    return records


def _select_subject_component(alpha: np.ndarray, subject_threshold: int) -> dict[str, object] | None:
    components = _alpha_component_records(alpha, subject_threshold)
    if not components:
        return None
    return max(components, key=lambda item: (int(item["area"]), int(item["height"]), int(item["width"])))


def _ground_artifact_analysis(
    alpha: np.ndarray,
    *,
    subject_threshold: int,
    component_threshold: int,
    bottom_gap: int,
    artifact_area_ratio: float,
    artifact_max_area: int,
    artifact_max_span: int,
) -> tuple[dict[str, object] | None, list[dict[str, object]], list[dict[str, object]], dict[str, int | bool]]:
    subject = _select_subject_component(alpha, subject_threshold)
    if subject is None:
        return None, [], [], {
            "hasSubject": False,
            "subjectBottom": -1,
            "subjectArea": 0,
            "strayComponents": 0,
            "strayPixels": 0,
            "maxStrayArea": 0,
            "largeBottomComponents": 0,
            "largeBottomPixels": 0,
        }

    subject_area = int(subject["area"])
    subject_bottom = int(subject["bottom"])
    area_limit = max(16, min(max(16, int(artifact_max_area)), int(max(16.0, subject_area * artifact_area_ratio))))
    span_limit = max(1, int(artifact_max_span))
    gap = max(0, int(bottom_gap))
    stray_components: list[dict[str, object]] = []
    large_components: list[dict[str, object]] = []

    for component in _alpha_component_records(alpha, component_threshold):
        if int(component["top"]) <= subject_bottom + gap:
            continue
        is_small = (
            int(component["area"]) <= area_limit
            and int(component["width"]) <= span_limit
            and int(component["height"]) <= span_limit
        )
        if is_small:
            stray_components.append(component)
        else:
            large_components.append(component)

    return subject, stray_components, large_components, {
        "hasSubject": True,
        "subjectBottom": subject_bottom,
        "subjectArea": subject_area,
        "strayComponents": len(stray_components),
        "strayPixels": sum(int(component["area"]) for component in stray_components),
        "maxStrayArea": max((int(component["area"]) for component in stray_components), default=0),
        "largeBottomComponents": len(large_components),
        "largeBottomPixels": sum(int(component["area"]) for component in large_components),
    }


def detect_ground_artifacts(
    image: Image.Image,
    *,
    subject_threshold: int = 128,
    component_threshold: int = 0,
    bottom_gap: int = 1,
    artifact_area_ratio: float = 0.012,
    artifact_max_area: int = 96,
    artifact_max_span: int = 16,
) -> dict[str, int | bool]:
    """Detect small detached foreground components below the main subject."""
    alpha = np.array(image.convert("RGBA").getchannel("A"))
    _subject, _stray, _large, info = _ground_artifact_analysis(
        alpha,
        subject_threshold=subject_threshold,
        component_threshold=component_threshold,
        bottom_gap=bottom_gap,
        artifact_area_ratio=artifact_area_ratio,
        artifact_max_area=artifact_max_area,
        artifact_max_span=artifact_max_span,
    )
    return info


def clean_detached_artifacts(
    image: Image.Image,
    *,
    enabled: bool = False,
    subject_threshold: int = 128,
    component_threshold: int = 0,
    max_area: int = 256,
    max_span: int = 64,
    min_gap: int = 2,
) -> tuple[Image.Image, dict[str, object]]:
    """Remove small detached alpha components outside the main subject."""
    empty_info: dict[str, object] = {
        "enabled": bool(enabled),
        "applied": False,
        "cleanedComponents": 0,
        "cleanedPixels": 0,
        "maxCleanedArea": 0,
        "keptComponents": 0,
        "warningCount": 0,
        "warnings": [],
    }
    if not enabled:
        return image, empty_info

    output = image.convert("RGBA")
    pixels = np.array(output)
    alpha = pixels[:, :, 3]
    subject = _select_subject_component(alpha, subject_threshold)
    if subject is None:
        return output, {**empty_info, "warningCount": 1, "warnings": ["no subject component"]}

    clean_masks: list[tuple[np.ndarray, np.ndarray, int]] = []
    kept_components = 0
    warnings: list[str] = []
    subject_left = int(subject["left"])
    subject_top = int(subject["top"])
    subject_right = int(subject["right"])
    subject_bottom = int(subject["bottom"])
    resolved_max_area = max(1, int(max_area))
    resolved_max_span = max(1, int(max_span))
    resolved_gap = max(0, int(min_gap))

    for component in _alpha_component_records(alpha, component_threshold):
        if component is subject:
            continue
        if int(component["left"]) == subject_left and int(component["right"]) == subject_right and int(component["top"]) == subject_top and int(component["bottom"]) == subject_bottom:
            continue
        separated = (
            int(component["bottom"]) < subject_top - resolved_gap
            or int(component["top"]) > subject_bottom + resolved_gap
            or int(component["right"]) < subject_left - resolved_gap
            or int(component["left"]) > subject_right + resolved_gap
        )
        is_small = (
            int(component["area"]) <= resolved_max_area
            and int(component["width"]) <= resolved_max_span
            and int(component["height"]) <= resolved_max_span
        )
        if separated and is_small:
            clean_masks.append((component["ys"], component["xs"], int(component["area"])))
        elif separated:
            kept_components += 1
            warnings.append(f"detached component kept area={component['area']} box={component['left']},{component['top']},{component['right']},{component['bottom']}")

    for ys, xs, _area in clean_masks:
        pixels[ys, xs, 3] = 0
        pixels[ys, xs, :3] = 0

    if clean_masks:
        output = Image.fromarray(pixels, "RGBA")

    return output, {
        **empty_info,
        "applied": bool(clean_masks),
        "cleanedComponents": len(clean_masks),
        "cleanedPixels": sum(area for _ys, _xs, area in clean_masks),
        "maxCleanedArea": max((area for _ys, _xs, area in clean_masks), default=0),
        "keptComponents": kept_components,
        "warningCount": len(warnings),
        "warnings": warnings[:12],
    }


def stabilize_frames_to_ground(
    frames: list[tuple[str, Image.Image]],
    *,
    enabled: bool = False,
    subject_threshold: int = 128,
    component_threshold: int = 0,
    bottom_gap: int = 1,
    artifact_area_ratio: float = 0.012,
    artifact_max_area: int = 96,
    artifact_max_span: int = 16,
    target_percentile: float = 90.0,
    max_shift: int = 32,
) -> tuple[list[tuple[str, Image.Image]], dict[str, object]]:
    """Remove small bottom artifacts and align frames to a stable subject bottom."""
    empty_info: dict[str, object] = {
        "enabled": bool(enabled),
        "applied": False,
        "targetBottom": -1,
        "targetPercentile": float(target_percentile),
        "maxShift": int(max_shift),
        "cleanedComponents": 0,
        "cleanedPixels": 0,
        "maxCleanedArea": 0,
        "alignedFrames": 0,
        "maxAbsShift": 0,
        "clampedFrames": 0,
        "warningCount": 0,
        "warnings": [],
    }
    if not enabled or not frames:
        return frames, empty_info

    prepared: list[tuple[str, Image.Image, int | None]] = []
    subject_bottoms: list[int] = []
    warnings: list[str] = []
    cleaned_components = 0
    cleaned_pixels = 0
    max_cleaned_area = 0

    for name, frame in frames:
        output = frame.convert("RGBA")
        pixels = np.array(output)
        alpha = pixels[:, :, 3]
        subject, stray_components, large_components, artifact_info = _ground_artifact_analysis(
            alpha,
            subject_threshold=subject_threshold,
            component_threshold=component_threshold,
            bottom_gap=bottom_gap,
            artifact_area_ratio=artifact_area_ratio,
            artifact_max_area=artifact_max_area,
            artifact_max_span=artifact_max_span,
        )
        if subject is None:
            warnings.append(f"{name}: no subject component")
            prepared.append((name, output, None))
            continue

        if large_components:
            warnings.append(f"{name}: large detached bottom component kept")

        for component in stray_components:
            ys = component["ys"]
            xs = component["xs"]
            pixels[ys, xs, 3] = 0
            pixels[ys, xs, :3] = 0

        if stray_components:
            output = Image.fromarray(pixels, "RGBA")
            cleaned_components += int(artifact_info["strayComponents"])
            cleaned_pixels += int(artifact_info["strayPixels"])
            max_cleaned_area = max(max_cleaned_area, int(artifact_info["maxStrayArea"]))

        subject_bottom = int(subject["bottom"])
        subject_bottoms.append(subject_bottom)
        prepared.append((name, output, subject_bottom))

    if not subject_bottoms:
        return frames, {**empty_info, "warningCount": len(warnings), "warnings": warnings[:12]}

    target_bottom = int(round(float(np.percentile(subject_bottoms, float(target_percentile)))))
    resolved_max_shift = max(0, int(max_shift))
    aligned_frames: list[tuple[str, Image.Image]] = []
    aligned_count = 0
    max_abs_shift = 0
    clamped_frames = 0

    for name, frame, subject_bottom in prepared:
        dy = 0
        if subject_bottom is not None:
            requested_dy = int(round(target_bottom - subject_bottom))
            dy = int(np.clip(requested_dy, -resolved_max_shift, resolved_max_shift))
            if dy != requested_dy:
                clamped_frames += 1
            geometry = get_frame_geometry(frame, alpha_threshold=0)
            if geometry is not None:
                min_dy = -int(geometry["top"])
                max_dy = frame.height - 1 - int(geometry["bottom"])
                clipped_dy = int(np.clip(dy, min_dy, max_dy))
                if clipped_dy != dy:
                    clamped_frames += 1
                dy = clipped_dy
        if dy:
            frame = translate_frame(frame, 0, dy)
            aligned_count += 1
            max_abs_shift = max(max_abs_shift, abs(dy))
        aligned_frames.append((name, frame))

    if clamped_frames:
        warnings.append("vertical shift clamped to avoid clipping")

    info: dict[str, object] = {
        **empty_info,
        "applied": cleaned_components > 0 or aligned_count > 0,
        "targetBottom": target_bottom,
        "cleanedComponents": cleaned_components,
        "cleanedPixels": cleaned_pixels,
        "maxCleanedArea": max_cleaned_area,
        "alignedFrames": aligned_count,
        "maxAbsShift": max_abs_shift,
        "clampedFrames": clamped_frames,
        "warningCount": len(warnings),
        "warnings": warnings[:12],
    }
    return aligned_frames, info


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
    return repair_interior_alpha_holes(despill_normalized_frame(output))


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
    resized = repair_interior_alpha_holes(resized)

    output = Image.new("RGBA", (ENHANCED_FRAME_SIZE, ENHANCED_FRAME_SIZE), (0, 0, 0, 0))
    x = (ENHANCED_FRAME_SIZE - target_width) // 2
    y = ENHANCED_FRAME_SIZE - CANDIDATE_GROUND_PADDING - target_height
    output.alpha_composite(resized, (x, y))
    return repair_interior_alpha_holes(hard_clean_alpha(output))


def normalize_source_canvas_frame(image: Image.Image) -> Image.Image:
    """Scale the full source canvas into the enhanced runtime canvas."""
    source = image.convert("RGBA")
    width, height = source.size
    if width <= 0 or height <= 0:
        raise RuntimeError("Source frame has invalid dimensions.")

    scale = min(ENHANCED_FRAME_SIZE / width, ENHANCED_FRAME_SIZE / height)
    target_width = max(1, round(width * scale))
    target_height = max(1, round(height * scale))
    resized = source.resize((target_width, target_height), Image.Resampling.LANCZOS)
    resized = enhance_rgba(resized)
    resized = repair_interior_alpha_holes(resized)

    output = Image.new("RGBA", (ENHANCED_FRAME_SIZE, ENHANCED_FRAME_SIZE), (0, 0, 0, 0))
    x = (ENHANCED_FRAME_SIZE - target_width) // 2
    y = (ENHANCED_FRAME_SIZE - target_height) // 2
    output.alpha_composite(resized, (x, y))
    return repair_interior_alpha_holes(hard_clean_alpha(output))


def validate_normalization_options(
    normalization_mode: str,
    visible_height: int | None = None,
    visible_max_width: int | None = None,
) -> None:
    if normalization_mode not in NORMALIZATION_MODES:
        raise ValueError(f"Invalid normalization mode: {normalization_mode}")
    if normalization_mode == SOURCE_CANVAS_NORMALIZATION and (
        visible_height is not None or visible_max_width is not None
    ):
        raise ValueError("--visible-height and --visible-max-width are only supported with --normalization-mode crop.")


def process_frames_to_processed(
    raw_dir: Path,
    processed_dir: Path,
    visible_height: int | None = None,
    visible_max_width: int | None = None,
    normalization_mode: str = SOURCE_CANVAS_NORMALIZATION,
    trim_ground_alpha_auto: bool = False,
    trim_ground_alpha: int = 0,
    trim_ground_padding: int = 1,
    clean_detached_artifacts_enabled: bool = False,
    detached_artifact_max_area: int = 256,
    detached_artifact_max_span: int = 64,
    detached_artifact_min_gap: int = 2,
    stable_ground: bool = False,
    stable_ground_max_shift: int = 32,
    center_visible_action_x: bool = False,
    center_visible_target_x: float | None = None,
    center_visible_max_shift: int = 32,
    align_reference: dict[str, float | int] | None = None,
    align_center_x: bool = False,
    align_bottom: bool = False,
    align_bottom_per_frame: bool = False,
    align_max_shift: int = 32,
) -> tuple[list[Path], dict[str, object]]:
    """生成 256px 增强帧到 processed_frames（素材池）。"""
    validate_normalization_options(normalization_mode, visible_height, visible_max_width)
    clear_frame_dir(processed_dir)
    raw_frames = sorted(raw_dir.glob("frame_*.png"))
    if not raw_frames:
        raise RuntimeError(f"No PNG frames found in {raw_dir}")

    source_canvas_size: list[int] | None = None
    global_bounds = get_global_bounds(raw_frames) if normalization_mode == CROP_NORMALIZATION else None
    enhanced_frames: list[tuple[str, Image.Image]] = []
    detached_artifact_info: dict[str, object] = {
        "enabled": bool(clean_detached_artifacts_enabled),
        "applied": False,
        "cleanedComponents": 0,
        "cleanedPixels": 0,
        "maxCleanedArea": 0,
        "keptComponents": 0,
        "warningCount": 0,
        "warnings": [],
    }
    for raw_frame in raw_frames:
        keyed = chroma_key_green_image(raw_frame)
        if source_canvas_size is None:
            source_canvas_size = [int(keyed.width), int(keyed.height)]
        if normalization_mode == SOURCE_CANVAS_NORMALIZATION:
            enhanced = normalize_source_canvas_frame(keyed)
        else:
            kwargs = {}
            if visible_height is not None:
                kwargs["visible_height"] = visible_height
            if visible_max_width is not None:
                kwargs["visible_max_width"] = visible_max_width
            enhanced = normalize_candidate_frame(keyed, global_bounds, **kwargs)  # type: ignore[arg-type]
        enhanced, _trim_info = trim_ground_alpha_remnants_auto(
            enhanced,
            enabled=trim_ground_alpha_auto,
            solid_threshold=trim_ground_alpha,
            row_padding=trim_ground_padding,
        )
        enhanced, frame_detached_info = clean_detached_artifacts(
            enhanced,
            enabled=clean_detached_artifacts_enabled,
            max_area=detached_artifact_max_area,
            max_span=detached_artifact_max_span,
            min_gap=detached_artifact_min_gap,
        )
        if clean_detached_artifacts_enabled:
            detached_artifact_info["applied"] = bool(detached_artifact_info["applied"] or frame_detached_info["applied"])
            detached_artifact_info["cleanedComponents"] = int(detached_artifact_info["cleanedComponents"]) + int(frame_detached_info["cleanedComponents"])
            detached_artifact_info["cleanedPixels"] = int(detached_artifact_info["cleanedPixels"]) + int(frame_detached_info["cleanedPixels"])
            detached_artifact_info["maxCleanedArea"] = max(int(detached_artifact_info["maxCleanedArea"]), int(frame_detached_info["maxCleanedArea"]))
            detached_artifact_info["keptComponents"] = int(detached_artifact_info["keptComponents"]) + int(frame_detached_info["keptComponents"])
            warnings = list(detached_artifact_info["warnings"])
            warnings.extend(f"{raw_frame.name}: {warning}" for warning in frame_detached_info.get("warnings", []))
            detached_artifact_info["warnings"] = warnings[:12]
            detached_artifact_info["warningCount"] = int(detached_artifact_info["warningCount"]) + int(frame_detached_info["warningCount"])
        enhanced_frames.append((raw_frame.name, enhanced))

    enhanced_frames, stable_ground_info = stabilize_frames_to_ground(
        enhanced_frames,
        enabled=stable_ground,
        max_shift=stable_ground_max_shift,
    )

    enhanced_frames, _center_info = center_frames_to_canvas_x(
        enhanced_frames,
        enabled=center_visible_action_x,
        target_x=center_visible_target_x,
        max_shift=center_visible_max_shift,
    )

    align_delta = {"dx": 0, "dy": 0}
    if enhanced_frames and align_reference and (align_center_x or align_bottom):
        _aligned, align_delta = align_frame_to_reference(
            enhanced_frames[0][1],
            align_reference,
            align_center_x=align_center_x,
            align_bottom=align_bottom and not align_bottom_per_frame,
            max_shift=align_max_shift,
        )

    for name, enhanced in enhanced_frames:
        if align_delta["dx"] or align_delta["dy"]:
            enhanced = translate_frame(enhanced, int(align_delta["dx"]), int(align_delta["dy"]))
        if align_reference and align_bottom and align_bottom_per_frame:
            enhanced, _frame_align_delta = align_frame_to_reference(
                enhanced,
                align_reference,
                align_center_x=False,
                align_bottom=True,
                max_shift=align_max_shift,
            )
        enhanced.save(processed_dir / name)

    info: dict[str, object] = {"normalizationMode": normalization_mode}
    if normalization_mode == SOURCE_CANVAS_NORMALIZATION and source_canvas_size is not None:
        info["sourceCanvasSize"] = source_canvas_size
    if stable_ground:
        info["stableGround"] = stable_ground_info
    if clean_detached_artifacts_enabled:
        info["detachedArtifacts"] = detached_artifact_info
    return sorted(processed_dir.glob("frame_*.png")), info


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
