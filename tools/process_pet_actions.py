"""Unified pet action resource processing script.

Merges the functionality of process_pet_videos.py and replace_action_video.py
into a single script with two subcommands: ``process`` and ``replace``.

Usage:
    python tools/process_pet_actions.py process --variant tabby --actions look walk
    python tools/process_pet_actions.py replace --action tabby_look --video new.mp4
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ANIMATIONS_ROOT = PROJECT_ROOT / "assets" / "animations"

# ---------------------------------------------------------------------------
# Frame size constants
# ---------------------------------------------------------------------------
MAX_PET_SIZE = 128
VISIBLE_PET_TARGET_HEIGHT = 108
VISIBLE_PET_MAX_WIDTH = 122
PET_GROUND_PADDING = 8
ALPHA_CROP_THRESHOLD = 12

ENHANCED_FRAME_SIZE = 256
CANDIDATE_VISIBLE_HEIGHT = 216
CANDIDATE_VISIBLE_MAX_WIDTH = 244
CANDIDATE_GROUND_PADDING = 16

FRAME_MS = 30
SOURCE_FRAME_SIZE = 128
QUALITY_PROFILE = "enhanced_2x_conservative"


# ---------------------------------------------------------------------------
# ffmpeg helpers
# ---------------------------------------------------------------------------
def find_ffmpeg(explicit_path: str | None) -> str:
    candidates: list[str] = []
    if explicit_path:
        candidates.append(explicit_path)
    if os.environ.get("FFMPEG_PATH"):
        candidates.append(os.environ["FFMPEG_PATH"])
    path_ffmpeg = shutil.which("ffmpeg")
    if path_ffmpeg:
        candidates.append(path_ffmpeg)
    candidates.append(r"D:\Jianying\JianyingPro\9.7.1.13727\ffmpeg.exe")

    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate

    raise FileNotFoundError("ffmpeg.exe was not found. Pass --ffmpeg or set FFMPEG_PATH.")


# ---------------------------------------------------------------------------
# Directory helpers
# ---------------------------------------------------------------------------
def clear_frame_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)
    for frame in path.glob("frame_*.png"):
        frame.unlink()


def find_video(action_dir: Path) -> Path:
    preferred = action_dir / f"{action_dir.name}.mp4"
    if preferred.exists():
        return preferred

    videos = sorted(action_dir.glob("*.mp4"))
    if not videos:
        raise FileNotFoundError(f"No .mp4 file found in {action_dir}")
    return videos[0]


def write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def copy_tree_frames(source_dir: Path, target_dir: Path) -> int:
    clear_frame_dir(target_dir)
    count = 0
    for frame in sorted(source_dir.glob("frame_*.png")):
        shutil.copy2(frame, target_dir / frame.name)
        count += 1
    return count


# ---------------------------------------------------------------------------
# Frame extraction
# ---------------------------------------------------------------------------
def extract_frames(ffmpeg: str, video: Path, raw_dir: Path, fps: str) -> None:
    clear_frame_dir(raw_dir)
    output_pattern = raw_dir / "frame_%03d.png"
    command = [
        ffmpeg,
        "-hide_banner",
        "-y",
        "-i",
        str(video),
        "-vf",
        f"fps={fps}",
        "-start_number",
        "0",
        str(output_pattern),
    ]
    subprocess.run(command, check=True)


# ---------------------------------------------------------------------------
# Chroma key / green screen removal
# ---------------------------------------------------------------------------
def chroma_key_green_image(input_path: Path) -> Image.Image:
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


# ---------------------------------------------------------------------------
# Visible bounds / normalization
# ---------------------------------------------------------------------------
def get_visible_bounds(image: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = np.array(image.getchannel("A"))
    visible_pixels = np.argwhere(alpha > ALPHA_CROP_THRESHOLD)
    if visible_pixels.size == 0:
        return None

    top, left = visible_pixels.min(axis=0)
    bottom, right = visible_pixels.max(axis=0) + 1
    return left, top, right, bottom


def get_global_bounds(raw_frames: list[Path]) -> tuple[int, int, int, int]:
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


# ---------------------------------------------------------------------------
# 128px normalization (legacy, used by process_frames for transparent_frames
# when not using enhanced mode)
# ---------------------------------------------------------------------------
def normalize_pet_frame(image: Image.Image, bounds: tuple[int, int, int, int]) -> Image.Image:
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


# ---------------------------------------------------------------------------
# 256px enhanced normalization (for processed_frames)
# ---------------------------------------------------------------------------
def hard_clean_alpha(image: Image.Image) -> Image.Image:
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


# ---------------------------------------------------------------------------
# Frame processing pipelines
# ---------------------------------------------------------------------------
def process_frames_to_processed(
    raw_dir: Path, processed_dir: Path, visible_height: int | None = None, visible_max_width: int | None = None
) -> list[Path]:
    """Generate 256px enhanced frames into processed_frames (asset pool)."""
    clear_frame_dir(processed_dir)
    raw_frames = sorted(raw_dir.glob("frame_*.png"))
    if not raw_frames:
        raise RuntimeError(f"No PNG frames found in {raw_dir}")

    global_bounds = get_global_bounds(raw_frames)
    for raw_frame in raw_frames:
        keyed = chroma_key_green_image(raw_frame)
        kwargs = {}
        if visible_height is not None:
            kwargs["visible_height"] = visible_height
        if visible_max_width is not None:
            kwargs["visible_max_width"] = visible_max_width
        enhanced = normalize_candidate_frame(keyed, global_bounds, **kwargs)
        enhanced.save(processed_dir / raw_frame.name)

    return sorted(processed_dir.glob("frame_*.png"))


def process_frames_legacy(raw_dir: Path, transparent_dir: Path) -> list[Path]:
    """Generate 128px frames into transparent_frames (legacy pipeline)."""
    clear_frame_dir(transparent_dir)
    raw_frames = sorted(raw_dir.glob("frame_*.png"))
    if not raw_frames:
        raise RuntimeError(f"No PNG frames found in {raw_dir}")

    global_bounds = get_global_bounds(raw_frames)
    for raw_frame in raw_frames:
        keyed = chroma_key_green_image(raw_frame)
        normalize_pet_frame(keyed, global_bounds).save(transparent_dir / raw_frame.name)

    return sorted(transparent_dir.glob("frame_*.png"))


# ---------------------------------------------------------------------------
# Trim ground alpha remnants
# ---------------------------------------------------------------------------
def trim_ground_alpha_remnants(
    image: Image.Image,
    solid_threshold: int,
    row_padding: int,
) -> Image.Image:
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


# ---------------------------------------------------------------------------
# Loop selection: signature-based
# ---------------------------------------------------------------------------
def frame_signature(frame: Path) -> dict[str, np.ndarray | float]:
    image = Image.open(frame).convert("RGBA")
    small = image.resize((32, 32), Image.Resampling.BILINEAR)
    data = np.array(small).astype(np.float32) / 255.0
    alpha = data[:, :, 3]
    premultiplied = data[:, :, :3] * alpha[:, :, None]
    vector = np.concatenate([premultiplied.flatten(), alpha.flatten()])

    full_alpha = np.array(image.getchannel("A")).astype(np.float32) / 255.0
    visible = np.argwhere(full_alpha > 0.05)
    if visible.size == 0:
        center = np.array([0.5, 0.5], dtype=np.float32)
        box = np.array([0.0, 0.0], dtype=np.float32)
    else:
        top, left = visible.min(axis=0)
        bottom, right = visible.max(axis=0) + 1
        center = np.array([(left + right) / 256.0, (top + bottom) / 256.0], dtype=np.float32)
        box = np.array([(right - left) / 128.0, (bottom - top) / 128.0], dtype=np.float32)

    return {"vector": vector, "center": center, "box": box, "mass": float(alpha.mean())}


def signature_distance(a: dict[str, np.ndarray | float], b: dict[str, np.ndarray | float]) -> float:
    vector_distance = float(np.mean(np.abs(a["vector"] - b["vector"])))  # type: ignore[operator]
    center_distance = float(np.linalg.norm(a["center"] - b["center"]))  # type: ignore[operator]
    box_distance = float(np.linalg.norm(a["box"] - b["box"]))  # type: ignore[operator]
    mass_distance = abs(float(a["mass"]) - float(b["mass"]))
    return vector_distance + center_distance * 0.25 + box_distance * 0.15 + mass_distance * 0.6


def motion_distance(
    before_a: dict[str, np.ndarray | float],
    a: dict[str, np.ndarray | float],
    b: dict[str, np.ndarray | float],
    after_b: dict[str, np.ndarray | float],
) -> float:
    start_motion = a["vector"] - before_a["vector"]  # type: ignore[operator]
    end_motion = after_b["vector"] - b["vector"]  # type: ignore[operator]
    return float(np.mean(np.abs(start_motion - end_motion)))


def find_best_loop(frames: list[Path]) -> dict[str, int | float]:
    count = len(frames)
    if count < 4:
        return {"loopStart": 0, "loopEnd": max(0, count - 1), "score": 0.0}

    signatures = [frame_signature(frame) for frame in frames]
    min_length = min(max(36, count // 3), count - 2)
    max_length = min(count - 1, max(min_length, round(count * 0.88)))
    target_length = min(max(min_length, round(count * 0.62)), max_length)

    best: tuple[float, int, int] | None = None
    for start in range(1, count - min_length):
        end_min = start + min_length
        end_max = min(count - 2, start + max_length)
        for end in range(end_min, end_max + 1):
            length = end - start + 1
            pose_score = signature_distance(signatures[start], signatures[end])
            continuity_score = motion_distance(signatures[start - 1], signatures[start], signatures[end], signatures[end + 1])
            length_penalty = abs(length - target_length) / max(1, target_length) * 0.015
            score = pose_score + continuity_score * 0.45 + length_penalty
            if best is None or score < best[0]:
                best = (score, start, end)

    if best is None:
        return {"loopStart": 0, "loopEnd": count - 1, "score": 0.0}

    score, start, end = best
    return {"loopStart": start, "loopEnd": end, "score": round(float(score), 6)}


def find_best_long_loop(
    frames: list[Path],
    min_length: int | None,
    target_length: int | None,
    max_length: int | None,
    length_bias: float,
) -> dict[str, int | float]:
    count = len(frames)
    if count < 4:
        return {"loopStart": 0, "loopEnd": max(0, count - 1), "score": 0.0}

    lower = max(4, min_length or 36)
    upper = max_length or count - 1
    upper = min(count - 1, max(lower, upper))
    lower = min(lower, upper)
    target = target_length or upper
    target = min(max(lower, target), upper)

    signatures = [frame_signature(frame) for frame in frames]
    best: tuple[float, float, int, int] | None = None
    for start in range(1, count - lower):
        end_min = start + lower - 1
        end_max = min(count - 2, start + upper - 1)
        for end in range(end_min, end_max + 1):
            length = end - start + 1
            pose_score = signature_distance(signatures[start], signatures[end])
            continuity_score = motion_distance(signatures[start - 1], signatures[start], signatures[end], signatures[end + 1])
            quality_score = pose_score + continuity_score * 0.45
            length_distance = abs(length - target) / max(1, target)
            shortfall = max(0, target - length) / max(1, target)
            score = quality_score + length_distance * 0.015 + shortfall * max(0.0, length_bias)
            if best is None or score < best[0]:
                best = (score, quality_score, start, end)

    if best is None:
        return find_best_loop(frames)

    score, quality_score, start, end = best
    return {
        "loopStart": start,
        "loopEnd": end,
        "score": round(float(score), 6),
        "qualityScore": round(float(quality_score), 6),
        "targetLength": target,
    }


def resolve_source_range(
    transparent_frames: list[Path],
    source_start: int | None,
    source_end: int | None,
    search_start: int | None,
    search_end: int | None,
    use_full_range: bool,
    long_loop: bool,
    loop_min: int | None,
    loop_target: int | None,
    loop_max: int | None,
    length_bias: float,
) -> dict[str, int | float | str]:
    count = len(transparent_frames)
    if count <= 0:
        raise RuntimeError("No transparent frames available for loop selection.")

    if use_full_range:
        return {
            "loopStart": 0,
            "loopEnd": count - 1,
            "score": 0.0,
            "loopSelection": "full",
        }

    has_manual_start = source_start is not None
    has_manual_end = source_end is not None
    if has_manual_start or has_manual_end:
        start = 0 if source_start is None else source_start
        end = count - 1 if source_end is None else source_end
        if start < 0 or end >= count or start > end:
            raise RuntimeError(f"Invalid manual source range {start}..{end} for {count} transparent frames")
        return {
            "loopStart": start,
            "loopEnd": end,
            "score": 0.0,
            "loopSelection": "manual",
        }

    search_offset = 0
    search_frames = transparent_frames
    has_search_start = search_start is not None
    has_search_end = search_end is not None
    if has_search_start or has_search_end:
        start = 0 if search_start is None else search_start
        end = count - 1 if search_end is None else search_end
        if start < 0 or end >= count or start > end:
            raise RuntimeError(f"Invalid search source range {start}..{end} for {count} transparent frames")
        search_offset = start
        search_frames = transparent_frames[start : end + 1]

    loop = find_best_long_loop(search_frames, loop_min, loop_target, loop_max, length_bias) if long_loop else find_best_loop(search_frames)
    loop["loopStart"] = int(loop["loopStart"]) + search_offset
    loop["loopEnd"] = int(loop["loopEnd"]) + search_offset
    if long_loop:
        loop["loopSelection"] = "long"
    return loop


# ---------------------------------------------------------------------------
# Brightness anomaly detection
# ---------------------------------------------------------------------------
def compute_alpha_brightness(frame_path: Path) -> float:
    """Compute average brightness of the alpha-visible region only."""
    image = Image.open(frame_path).convert("RGBA")
    pixels = np.array(image).astype(np.float32)
    alpha = pixels[:, :, 3]
    mask = alpha > ALPHA_CROP_THRESHOLD
    if mask.sum() == 0:
        return 0.0
    r = pixels[:, :, 0]
    g = pixels[:, :, 1]
    b = pixels[:, :, 2]
    brightness = (0.299 * r + 0.587 * g + 0.114 * b) * (alpha / 255.0)
    return float(brightness[mask].mean())


def detect_brightness_anomaly(
    processed_dir: Path,
    check_head_count: int = 9,
    compare_tail_start: int = 150,
    threshold: float = 0.12,
) -> list[int]:
    """Detect anomalously bright frames at the start of the processed frame pool.

    Returns a list of source frame indices to exclude (e.g. [0, 1, 2, 3, 4, 5]).
    """
    processed_frames = sorted(processed_dir.glob("frame_*.png"))
    if not processed_frames:
        return []

    total = len(processed_frames)

    # Compute head brightness
    head_count = min(check_head_count, total)
    head_brightness = [compute_alpha_brightness(processed_frames[i]) for i in range(head_count)]

    # Compute tail brightness (stable reference)
    tail_start = min(compare_tail_start, total)
    tail_brightness = [compute_alpha_brightness(processed_frames[i]) for i in range(tail_start, total)]

    if not tail_brightness:
        return []

    tail_mean = float(np.mean(tail_brightness))

    # Find consecutive frames from the start that exceed the threshold
    excluded: list[int] = []
    for i in range(head_count):
        if head_brightness[i] > tail_mean * (1.0 + threshold):
            excluded.append(i)
        else:
            break

    return excluded


# ---------------------------------------------------------------------------
# Direction frame sampling (visual-motion-even) for eye-tracking actions
# ---------------------------------------------------------------------------
def compute_frame_motion_vectors(frames: list[Path]) -> list[float]:
    """Compute motion magnitude for each frame based on signature differences."""
    if len(frames) < 2:
        return [0.0] * len(frames)

    signatures = [frame_signature(f) for f in frames]
    motions: list[float] = []
    for i in range(len(frames)):
        if i == 0:
            motions.append(signature_distance(signatures[0], signatures[1]))
        elif i == len(frames) - 1:
            motions.append(signature_distance(signatures[-2], signatures[-1]))
        else:
            motions.append(signature_distance(signatures[i - 1], signatures[i + 1]) * 0.5)
    return motions


def sample_direction_frames(
    processed_dir: Path,
    output_dir: Path,
    count: int = 64,
    excluded_frames: list[int] | None = None,
) -> dict[str, object]:
    """Sample direction frames from processed_frames using visual-motion-even strategy.

    - Excludes frames in excluded_frames from the candidate pool.
    - frame_000 uses a tail-matched frame (same direction as first stable frame).
    - Remaining frames are sampled with even spacing weighted by motion.
    """
    excluded = set(excluded_frames or [])
    processed_frames = sorted(processed_dir.glob("frame_*.png"))
    total = len(processed_frames)

    if total == 0:
        raise RuntimeError(f"No processed frames found in {processed_dir}")

    # Build candidate indices (excluding anomalous frames)
    candidates = [i for i in range(total) if i not in excluded]
    if not candidates:
        raise RuntimeError("All frames excluded, no candidates for direction sampling")

    # Compute motion vectors for candidates
    candidate_paths = [processed_frames[i] for i in candidates]
    motions = compute_frame_motion_vectors(candidate_paths)

    # Cumulative motion for even sampling
    cum_motion = [0.0]
    for m in motions:
        cum_motion.append(cum_motion[-1] + max(m, 0.001))

    total_motion = cum_motion[-1]

    # Sample `count` frames using visual-motion-even distribution
    source_indices: list[int] = []
    for i in range(count):
        target_motion = total_motion * (i + 0.5) / count
        # Binary search for the right position
        lo, hi = 0, len(cum_motion) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if cum_motion[mid] < target_motion:
                lo = mid + 1
            else:
                hi = mid
        # lo is the index into candidates
        candidate_idx = min(lo, len(candidates) - 1)
        source_indices.append(candidates[candidate_idx])

    # For frame_000, use a tail-matched frame instead of the first candidate.
    # Find a tail frame that has similar direction to the first stable frame.
    first_stable = candidates[0]
    first_stable_sig = frame_signature(processed_frames[first_stable])

    # Search from the tail for a frame with similar pose
    best_tail_idx = total - 1
    best_tail_dist = float("inf")
    for tail_i in range(total - 1, max(total - 30, -1), -1):
        if tail_i in excluded:
            continue
        dist = signature_distance(first_stable_sig, frame_signature(processed_frames[tail_i]))
        if dist < best_tail_dist:
            best_tail_dist = dist
            best_tail_idx = tail_i

    # Replace first source frame with tail-matched frame
    source_indices[0] = best_tail_idx

    # Remove duplicates while preserving order
    seen: set[int] = set()
    unique_sources: list[int] = []
    for idx in source_indices:
        if idx not in seen:
            seen.add(idx)
            unique_sources.append(idx)
    # If we lost frames due to dedup, fill from remaining candidates
    remaining = [i for i in candidates if i not in seen and i != best_tail_idx]
    for idx in remaining:
        if len(unique_sources) >= count:
            break
        unique_sources.append(idx)
        seen.add(idx)

    source_indices = unique_sources[:count]

    # Write transparent_frames
    clear_frame_dir(output_dir)
    for output_idx, source_idx in enumerate(source_indices):
        src = processed_frames[source_idx]
        dst = output_dir / f"frame_{output_idx:03d}.png"
        shutil.copy2(src, dst)

    return {
        "sourceFrames": source_indices,
        "sourceStartPolicy": "tail-matched-first-frame",
        "sourceExcludedFrames": sorted(excluded),
        "sourceSampling": "visual-motion-even",
        "directionFrameCount": len(source_indices),
    }


# ---------------------------------------------------------------------------
# Build enhanced loop frames from processed_frames (for standard loop actions)
# ---------------------------------------------------------------------------
def build_enhanced_loop_frames(
    processed_dir: Path,
    output_dir: Path,
    source_start: int,
    source_end: int,
    trim_ground_alpha: int,
    trim_ground_padding: int,
) -> int:
    """Copy selected frames from processed_frames to transparent_frames with optional ground trim."""
    processed_frames = sorted(processed_dir.glob("frame_*.png"))
    if not processed_frames:
        raise RuntimeError(f"No processed frames found in {processed_dir}")
    if source_start < 0 or source_end >= len(processed_frames) or source_start > source_end:
        raise RuntimeError(f"Invalid loop range {source_start}..{source_end} for {len(processed_frames)} processed frames")

    clear_frame_dir(output_dir)
    output_index = 0
    for source_index in range(source_start, source_end + 1):
        src = processed_dir / f"frame_{source_index:03d}.png"
        if not src.exists():
            raise RuntimeError(f"Missing processed frame: {src}")

        frame = Image.open(src).convert("RGBA")
        frame = trim_ground_alpha_remnants(frame, trim_ground_alpha, trim_ground_padding)
        frame.save(output_dir / f"frame_{output_index:03d}.png")
        output_index += 1

    return output_index


# ---------------------------------------------------------------------------
# Manifest update
# ---------------------------------------------------------------------------
def update_manifest(action: str, metadata: dict[str, object], manifest_name: str) -> None:
    manifest_path = ANIMATIONS_ROOT / manifest_name
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            manifest = []
    else:
        manifest = []

    if not isinstance(manifest, list):
        manifest = []

    updated = False
    for index, entry in enumerate(manifest):
        if isinstance(entry, dict) and entry.get("action") == action:
            manifest[index] = metadata
            updated = True
            break

    if not updated:
        manifest.append(metadata)

    write_json(manifest_path, manifest)


# ---------------------------------------------------------------------------
# Core action processing
# ---------------------------------------------------------------------------
def process_action_core(
    action: str,
    ffmpeg: str,
    fps: str,
    video_path: Path | None = None,
    manifest_name: str | None = None,
    no_loop: bool = False,
    skip_frames: str = "auto",
    long_loop: bool = False,
    loop_min: int | None = None,
    loop_target: int | None = None,
    loop_max: int | None = None,
    length_bias: float = 0.025,
    source_start: int | None = None,
    source_end: int | None = None,
    search_start: int | None = None,
    search_end: int | None = None,
    use_full_range: bool = False,
    trim_ground_alpha: int = 0,
    trim_ground_padding: int = 1,
    visible_height: int | None = None,
    visible_max_width: int | None = None,
    keep_raw: bool = False,
    is_replace: bool = False,
    direction_count: int | None = None,
) -> dict[str, object]:
    """Core processing logic shared by process and replace subcommands."""
    action_dir = ANIMATIONS_ROOT / action

    if is_replace:
        if not action_dir.exists():
            raise FileNotFoundError(f"Missing action directory: {action_dir}")

    # Locate video
    if video_path is not None:
        if not video_path.exists():
            raise FileNotFoundError(f"Missing video: {video_path}")
    else:
        video_path = find_video(action_dir)

    raw_dir = action_dir / "raw_frames"
    processed_dir = action_dir / "processed_frames"
    transparent_dir = action_dir / "transparent_frames"

    print(f"\n[{action}] video: {video_path.name}")

    # Step 1: Extract frames
    extract_frames(ffmpeg, video_path, raw_dir, fps)

    # Step 2: Generate processed_frames (256px enhanced asset pool)
    process_frames_to_processed(raw_dir, processed_dir, visible_height, visible_max_width)
    processed_frame_count = len(list(processed_dir.glob("frame_*.png")))
    print(f"[{action}] processed_frames: {processed_frame_count} frames")

    # Step 3: Loop selection / direction sampling
    metadata: dict[str, object] = {
        "action": action,
        "video": f"{action}.mp4",
        "frameMs": FRAME_MS,
        "sourceFrameSize": SOURCE_FRAME_SIZE,
        "frameSize": ENHANCED_FRAME_SIZE,
        "qualityProfile": QUALITY_PROFILE,
        "sourceFrameCount": processed_frame_count,
    }

    if not no_loop:
        # Detect brightness anomaly
        excluded_frames: list[int] = []
        if skip_frames == "auto":
            excluded_frames = detect_brightness_anomaly(processed_dir)
            if excluded_frames:
                print(f"[{action}] brightness anomaly detected, excluded source frames: {excluded_frames}")
        elif skip_frames != "0":
            try:
                n = int(skip_frames)
                excluded_frames = list(range(n))
                if excluded_frames:
                    print(f"[{action}] manually excluded source frames: {excluded_frames}")
            except ValueError:
                pass

        # Direction sampling (for eye-tracking actions like tabby_look)
        if direction_count is not None and direction_count > 0:
            result = sample_direction_frames(
                processed_dir,
                transparent_dir,
                count=direction_count,
                excluded_frames=excluded_frames if excluded_frames else None,
            )
            frame_count = int(result["directionFrameCount"])
            metadata["frameCount"] = frame_count
            metadata["loopStart"] = 0
            metadata["loopEnd"] = frame_count - 1
            metadata["sourceLoopStart"] = 0
            metadata["sourceLoopEnd"] = processed_frame_count - 1
            metadata["loopSelection"] = "full"
            metadata["directionFrameCount"] = result["directionFrameCount"]
            metadata["sourceSampling"] = result["sourceSampling"]
            metadata["sourceFrames"] = result["sourceFrames"]
            metadata["sourceStartPolicy"] = result["sourceStartPolicy"]
            if excluded_frames:
                metadata["sourceExcludedFrames"] = result["sourceExcludedFrames"]
            metadata["score"] = 0.0
            print(f"[{action}] direction frames: {frame_count}, excluded: {excluded_frames}")
        else:
            # Standard loop selection from processed_frames
            processed_frame_list = sorted(processed_dir.glob("frame_*.png"))
            loop = resolve_source_range(
                processed_frame_list,
                source_start,
                source_end,
                search_start,
                search_end,
                use_full_range,
                long_loop,
                loop_min,
                loop_target,
                loop_max,
                length_bias,
            )

            src_start = int(loop["loopStart"])
            src_end = int(loop["loopEnd"])
            frame_count = build_enhanced_loop_frames(
                processed_dir,
                transparent_dir,
                src_start,
                src_end,
                trim_ground_alpha,
                trim_ground_padding,
            )
            if frame_count <= 0:
                raise RuntimeError("Loop frame generation did not produce any frames.")

            metadata["frameCount"] = frame_count
            metadata["loopStart"] = 0
            metadata["loopEnd"] = frame_count - 1
            metadata["sourceLoopStart"] = src_start
            metadata["sourceLoopEnd"] = src_end
            metadata["score"] = float(loop["score"])

            if "loopSelection" in loop:
                metadata["loopSelection"] = str(loop["loopSelection"])
            if long_loop:
                metadata["qualityScore"] = float(loop.get("qualityScore", loop["score"]))
                metadata["targetLength"] = int(loop.get("targetLength", frame_count))
            if trim_ground_alpha > 0:
                metadata["trimGroundAlpha"] = trim_ground_alpha
                metadata["trimGroundPadding"] = max(0, trim_ground_padding)
            if search_start is not None:
                metadata["searchStart"] = search_start
            if search_end is not None:
                metadata["searchEnd"] = search_end

            print(
                f"[{action}] frames={frame_count} sourceLoop={src_start}..{src_end} "
                f"score={metadata['score']}"
            )
    else:
        print(f"[{action}] skipping loop selection (--no-loop)")

    # Step 4: Write loop.json
    write_json(action_dir / "loop.json", metadata)

    # Step 5: Update manifest
    if manifest_name:
        update_manifest(action, metadata, manifest_name)

    # Step 6: Replace video file (for replace subcommand)
    if is_replace:
        official_video = action_dir / f"{action}.mp4"
        shutil.copy2(video_path, official_video)
        print(f"[{action}] video replaced: {official_video.name}")

    # Step 7: Clean up raw_frames
    if not keep_raw and raw_dir.exists():
        shutil.rmtree(raw_dir)
        print(f"[{action}] raw_frames removed")
    elif raw_dir.exists():
        print(f"[{action}] raw_frames kept (--keep-raw)")

    return metadata


# ---------------------------------------------------------------------------
# CLI: process subcommand
# ---------------------------------------------------------------------------
def cmd_process(args: argparse.Namespace) -> None:
    ffmpeg = find_ffmpeg(args.ffmpeg)
    print(f"Using ffmpeg: {ffmpeg}")

    # Derive manifest name from variant
    manifest_name = f"{args.variant}_actions_manifest.json"

    results = []
    for action in args.actions:
        action_name = f"{args.variant}_{action}"
        metadata = process_action_core(
            action=action_name,
            ffmpeg=ffmpeg,
            fps=args.fps,
            manifest_name=manifest_name,
            no_loop=args.no_loop,
            skip_frames=args.skip_frames,
            long_loop=args.long_loop,
            loop_min=args.loop_min,
            loop_target=args.loop_target,
            loop_max=args.loop_max,
            length_bias=args.length_bias,
            source_start=args.source_start,
            source_end=args.source_end,
            search_start=args.search_start,
            search_end=args.search_end,
            use_full_range=args.use_full_range,
            trim_ground_alpha=args.trim_ground_alpha,
            trim_ground_padding=args.trim_ground_padding,
            visible_height=args.visible_height,
            visible_max_width=args.visible_max_width,
            keep_raw=args.keep_raw,
            direction_count=args.direction_count,
        )
        results.append(metadata)

    print(f"\nProcessed {len(results)} action(s) for variant '{args.variant}'")


# ---------------------------------------------------------------------------
# CLI: replace subcommand
# ---------------------------------------------------------------------------
def cmd_replace(args: argparse.Namespace) -> None:
    ffmpeg = find_ffmpeg(args.ffmpeg)
    print(f"Using ffmpeg: {ffmpeg}")

    metadata = process_action_core(
        action=args.action,
        ffmpeg=ffmpeg,
        fps=args.fps,
        video_path=Path(args.video),
        manifest_name=args.manifest,
        no_loop=args.no_loop,
        skip_frames=args.skip_frames,
        long_loop=args.long_loop,
        loop_min=args.loop_min,
        loop_target=args.loop_target,
        loop_max=args.loop_max,
        length_bias=args.length_bias,
        source_start=args.source_start,
        source_end=args.source_end,
        search_start=args.search_start,
        search_end=args.search_end,
        use_full_range=args.use_full_range,
        trim_ground_alpha=args.trim_ground_alpha,
        trim_ground_padding=args.trim_ground_padding,
        visible_height=args.visible_height,
        visible_max_width=args.visible_max_width,
        keep_raw=args.keep_raw,
        is_replace=True,
        direction_count=args.direction_count,
    )

    print(f"\nReplaced action '{args.action}'")


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------
def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--ffmpeg", default=None, help="Path to ffmpeg.exe.")
    parser.add_argument("--fps", default="100/3", help="Extraction frame rate. Default matches 30ms playback.")
    parser.add_argument("--no-loop", action="store_true", help="Skip loop selection, only generate processed_frames.")
    parser.add_argument("--skip-frames", default="auto", help="Exclude head frames from processed_frames. 'auto' (default), '0' (none), or a number like '6'.")
    parser.add_argument("--long-loop", action="store_true", help="Prefer a longer seamless loop when selecting source frames.")
    parser.add_argument("--loop-min", type=int, default=None, help="Minimum source loop frame count for --long-loop.")
    parser.add_argument("--loop-target", type=int, default=None, help="Preferred source loop frame count for --long-loop.")
    parser.add_argument("--loop-max", type=int, default=None, help="Maximum source loop frame count for --long-loop.")
    parser.add_argument("--length-bias", type=float, default=0.025, help="Penalty for loops shorter than --loop-target.")
    parser.add_argument("--source-start", type=int, default=None, help="Manual source start frame after extraction.")
    parser.add_argument("--source-end", type=int, default=None, help="Manual source end frame after extraction.")
    parser.add_argument("--search-start", type=int, default=None, help="Limit automatic loop selection to this source start frame.")
    parser.add_argument("--search-end", type=int, default=None, help="Limit automatic loop selection to this source end frame.")
    parser.add_argument("--use-full-range", action="store_true", help="Use the full extracted frame range instead of auto loop selection.")
    parser.add_argument("--trim-ground-alpha", type=int, default=0, help="Clear rows below last solid-alpha row. Disabled by default.")
    parser.add_argument("--trim-ground-padding", type=int, default=1, help="Rows to keep below last solid-alpha row when --trim-ground-alpha is enabled.")
    parser.add_argument("--visible-height", type=int, default=None, help="Override sprite visible height for this action.")
    parser.add_argument("--visible-max-width", type=int, default=None, help="Override sprite visible max width for this action.")
    parser.add_argument("--keep-raw", action="store_true", help="Keep raw_frames after processing.")
    parser.add_argument("--direction-count", type=int, default=None, help="Sample N direction frames (for eye-tracking actions like tabby_look).")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Unified pet action resource processing: extract, chroma-key, enhance, and select loop frames."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # process subcommand
    process_parser = subparsers.add_parser("process", help="Process actions for a pet variant.")
    process_parser.add_argument("--variant", required=True, help="Pet variant name, e.g. tabby, dog, cat.")
    process_parser.add_argument("--actions", nargs="*", default=["squat", "walk", "feed", "ball"], help="Action names to process (without variant prefix).")
    add_common_args(process_parser)

    # replace subcommand
    replace_parser = subparsers.add_parser("replace", help="Replace a single action video.")
    replace_parser.add_argument("--action", required=True, help="Full action directory name, e.g. tabby_look.")
    replace_parser.add_argument("--video", required=True, help="Replacement .mp4 path.")
    replace_parser.add_argument("--manifest", required=True, help="Manifest file name to update, e.g. tabby_actions_manifest.json.")
    add_common_args(replace_parser)

    args = parser.parse_args()

    if args.command == "process":
        cmd_process(args)
    elif args.command == "replace":
        cmd_replace(args)


if __name__ == "__main__":
    main()
