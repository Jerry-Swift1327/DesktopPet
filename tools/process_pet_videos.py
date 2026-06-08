from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
ANIMATIONS_ROOT = PROJECT_ROOT / "assets" / "animations"
ACTIONS = ("dog_ball", "dog_feed", "dog_squat", "dog_walk")
MAX_PET_SIZE = 128
VISIBLE_PET_TARGET_HEIGHT = 108
VISIBLE_PET_MAX_WIDTH = 122
PET_GROUND_PADDING = 8
ALPHA_CROP_THRESHOLD = 12


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


def process_frames(raw_dir: Path, transparent_dir: Path) -> list[Path]:
    clear_frame_dir(transparent_dir)
    raw_frames = sorted(raw_dir.glob("frame_*.png"))
    if not raw_frames:
        raise RuntimeError(f"No PNG frames found in {raw_dir}")

    global_bounds = get_global_bounds(raw_frames)
    for raw_frame in raw_frames:
        keyed = chroma_key_green_image(raw_frame)
        normalize_pet_frame(keyed, global_bounds).save(transparent_dir / raw_frame.name)

    return sorted(transparent_dir.glob("frame_*.png"))


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


def process_action(action: str, ffmpeg: str, fps: str) -> dict[str, int | float | str]:
    action_dir = ANIMATIONS_ROOT / action
    video = find_video(action_dir)
    raw_dir = action_dir / "raw_frames"
    transparent_dir = action_dir / "transparent_frames"

    print(f"\n[{action}] video: {video.name}")
    extract_frames(ffmpeg, video, raw_dir, fps)
    transparent_frames = process_frames(raw_dir, transparent_dir)
    loop = find_best_loop(transparent_frames)

    metadata: dict[str, int | float | str] = {
        "action": action,
        "video": video.name,
        "frameCount": len(transparent_frames),
        "frameMs": 30,
        "loopStart": int(loop["loopStart"]),
        "loopEnd": int(loop["loopEnd"]),
        "score": float(loop["score"]),
    }
    (action_dir / "loop.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(
        f"[{action}] frames={metadata['frameCount']} loop={metadata['loopStart']}..{metadata['loopEnd']} score={metadata['score']}"
    )
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract, chroma-key, normalize, and loop-analyze pet videos.")
    parser.add_argument("--actions", nargs="*", default=list(ACTIONS), help="Action folder names to process.")
    parser.add_argument("--ffmpeg", default=None, help="Path to ffmpeg.exe.")
    parser.add_argument("--fps", default="100/3", help="Extraction frame rate. Default matches 30ms playback.")
    args = parser.parse_args()

    ffmpeg = find_ffmpeg(args.ffmpeg)
    print(f"Using ffmpeg: {ffmpeg}")

    results = [process_action(action, ffmpeg, args.fps) for action in args.actions]
    summary_path = ANIMATIONS_ROOT / "dog_actions_manifest.json"
    summary_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nWrote manifest: {summary_path}")


if __name__ == "__main__":
    main()
