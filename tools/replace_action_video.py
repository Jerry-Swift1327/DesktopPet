from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TOOLS_ROOT = Path(__file__).resolve().parent
ANIMATIONS_ROOT = PROJECT_ROOT / "assets" / "animations"

if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

from build_quality_previews import normalize_candidate_frame  # noqa: E402
from process_pet_videos import (  # noqa: E402
    chroma_key_green_image,
    clear_frame_dir,
    extract_frames,
    find_best_loop,
    find_ffmpeg,
    get_global_bounds,
    frame_signature,
    motion_distance,
    process_frames,
    signature_distance,
)


FRAME_MS = 30
SOURCE_FRAME_SIZE = 128
ENHANCED_FRAME_SIZE = 256
QUALITY_PROFILE = "enhanced_2x_conservative"


def copy_tree_frames(source_dir: Path, target_dir: Path) -> int:
    clear_frame_dir(target_dir)
    count = 0
    for frame in sorted(source_dir.glob("frame_*.png")):
        shutil.copy2(frame, target_dir / frame.name)
        count += 1
    return count


def write_json(path: Path, data: object) -> None:
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


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


def build_enhanced_loop_frames(
    raw_dir: Path,
    output_dir: Path,
    source_start: int,
    source_end: int,
    trim_ground_alpha: int,
    trim_ground_padding: int,
    visible_height: int | None,
    visible_max_width: int | None,
) -> int:
    raw_frames = sorted(raw_dir.glob("frame_*.png"))
    if not raw_frames:
        raise RuntimeError(f"No raw frames found in {raw_dir}")
    if source_start < 0 or source_end >= len(raw_frames) or source_start > source_end:
        raise RuntimeError(f"Invalid loop range {source_start}..{source_end} for {len(raw_frames)} raw frames")

    clear_frame_dir(output_dir)
    global_bounds = get_global_bounds(raw_frames)
    output_index = 0
    for source_index in range(source_start, source_end + 1):
        raw_frame = raw_dir / f"frame_{source_index:03d}.png"
        keyed = chroma_key_green_image(raw_frame)
        normalize_kwargs = {}
        if visible_height is not None:
            normalize_kwargs["visible_height"] = visible_height
        if visible_max_width is not None:
            normalize_kwargs["visible_max_width"] = visible_max_width
        enhanced = normalize_candidate_frame(keyed, global_bounds, **normalize_kwargs)
        enhanced = trim_ground_alpha_remnants(enhanced, trim_ground_alpha, trim_ground_padding)
        enhanced.save(output_dir / f"frame_{output_index:03d}.png")
        output_index += 1

    return output_index


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


def replace_action_video(
    action: str,
    video: Path,
    ffmpeg: str,
    fps: str,
    keep_work: bool,
    manifest_name: str,
    long_loop: bool,
    loop_min: int | None,
    loop_target: int | None,
    loop_max: int | None,
    length_bias: float,
    trim_ground_alpha: int,
    trim_ground_padding: int,
    visible_height: int | None,
    visible_max_width: int | None,
    source_start: int | None,
    source_end: int | None,
    search_start: int | None,
    search_end: int | None,
    use_full_range: bool,
) -> dict[str, object]:
    action_dir = ANIMATIONS_ROOT / action
    if not action_dir.exists():
        raise FileNotFoundError(f"Missing action directory: {action_dir}")
    if not video.exists():
        raise FileNotFoundError(f"Missing replacement video: {video}")

    work_dir = action_dir / "_replacement_work"
    raw_dir = work_dir / "raw_frames_new"
    transparent_dir = work_dir / "transparent_frames_new"
    enhanced_dir = work_dir / "enhanced_frames_2x_new"

    if work_dir.exists():
        shutil.rmtree(work_dir)
    raw_dir.mkdir(parents=True, exist_ok=True)
    transparent_dir.mkdir(parents=True, exist_ok=True)
    enhanced_dir.mkdir(parents=True, exist_ok=True)

    print(f"[{action}] replacement video: {video}")
    extract_frames(ffmpeg, video, raw_dir, fps)
    transparent_frames = process_frames(raw_dir, transparent_dir)
    loop = resolve_source_range(
        transparent_frames,
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

    source_start = int(loop["loopStart"])
    source_end = int(loop["loopEnd"])
    frame_count = build_enhanced_loop_frames(
        raw_dir,
        enhanced_dir,
        source_start,
        source_end,
        trim_ground_alpha,
        trim_ground_padding,
        visible_height,
        visible_max_width,
    )
    if frame_count <= 0:
        raise RuntimeError("Enhanced loop did not produce any frames.")

    official_video = action_dir / f"{action}.mp4"
    official_frames = action_dir / "transparent_frames"
    shutil.copy2(video, official_video)
    copy_tree_frames(enhanced_dir, official_frames)

    metadata: dict[str, object] = {
        "action": action,
        "video": official_video.name,
        "frameCount": frame_count,
        "frameMs": FRAME_MS,
        "loopStart": 0,
        "loopEnd": frame_count - 1,
        "sourceLoopStart": source_start,
        "sourceLoopEnd": source_end,
        "sourceFrameSize": SOURCE_FRAME_SIZE,
        "frameSize": ENHANCED_FRAME_SIZE,
        "qualityProfile": QUALITY_PROFILE,
        "score": float(loop["score"]),
    }
    if "loopSelection" in loop:
        metadata["loopSelection"] = str(loop["loopSelection"])
    if long_loop:
        metadata["qualityScore"] = float(loop.get("qualityScore", loop["score"]))
        metadata["targetLength"] = int(loop.get("targetLength", frame_count))
    if trim_ground_alpha > 0:
        metadata["trimGroundAlpha"] = trim_ground_alpha
        metadata["trimGroundPadding"] = max(0, trim_ground_padding)
    if visible_height is not None:
        metadata["visibleHeight"] = visible_height
    if visible_max_width is not None:
        metadata["visibleMaxWidth"] = visible_max_width
    if search_start is not None:
        metadata["searchStart"] = search_start
    if search_end is not None:
        metadata["searchEnd"] = search_end

    write_json(action_dir / "loop.json", metadata)
    update_manifest(action, metadata, manifest_name)

    if not keep_work:
        shutil.rmtree(work_dir)

    print(
        f"[{action}] official frames={frame_count} "
        f"sourceLoop={source_start}..{source_end} score={metadata['score']}"
    )
    return metadata


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Replace one pet action video and promote its enhanced seamless loop frames."
    )
    parser.add_argument("--action", required=True, help="Action folder name, for example dog_ball.")
    parser.add_argument("--video", required=True, help="Replacement .mp4 path.")
    parser.add_argument("--ffmpeg", default=None, help="Path to ffmpeg.exe.")
    parser.add_argument("--fps", default="100/3", help="Extraction frame rate. Default matches 30ms playback.")
    parser.add_argument("--keep-work", action="store_true", help="Keep intermediate extracted/keyed frames.")
    parser.add_argument("--manifest", default="dog_actions_manifest.json", help="Manifest file name to update.")
    parser.add_argument("--long-loop", action="store_true", help="Prefer a longer seamless loop when selecting source frames.")
    parser.add_argument("--loop-min", type=int, default=None, help="Minimum source loop frame count for --long-loop.")
    parser.add_argument("--loop-target", type=int, default=None, help="Preferred source loop frame count for --long-loop.")
    parser.add_argument("--loop-max", type=int, default=None, help="Maximum source loop frame count for --long-loop.")
    parser.add_argument("--length-bias", type=float, default=0.025, help="Penalty for loops shorter than --loop-target.")
    parser.add_argument("--source-start", type=int, default=None, help="Use a manual source start frame after extraction.")
    parser.add_argument("--source-end", type=int, default=None, help="Use a manual source end frame after extraction.")
    parser.add_argument("--search-start", type=int, default=None, help="Limit automatic loop selection to this extracted source start frame.")
    parser.add_argument("--search-end", type=int, default=None, help="Limit automatic loop selection to this extracted source end frame.")
    parser.add_argument("--use-full-range", action="store_true", help="Use the full extracted source frame range instead of auto loop selection.")
    parser.add_argument("--trim-ground-alpha", type=int, default=0, help="Clear rows below the last solid-alpha row in promoted frames. Disabled by default.")
    parser.add_argument("--trim-ground-padding", type=int, default=1, help="Rows to keep below the last solid-alpha row when --trim-ground-alpha is enabled.")
    parser.add_argument("--visible-height", type=int, default=None, help="Override promoted sprite visible height for this action only.")
    parser.add_argument("--visible-max-width", type=int, default=None, help="Override promoted sprite visible max width for this action only.")
    args = parser.parse_args()

    ffmpeg = find_ffmpeg(args.ffmpeg)
    print(f"Using ffmpeg: {ffmpeg}")
    replace_action_video(
        args.action,
        Path(args.video),
        ffmpeg,
        args.fps,
        args.keep_work,
        args.manifest,
        args.long_loop,
        args.loop_min,
        args.loop_target,
        args.loop_max,
        args.length_bias,
        args.trim_ground_alpha,
        args.trim_ground_padding,
        args.visible_height,
        args.visible_max_width,
        args.source_start,
        args.source_end,
        args.search_start,
        args.search_end,
        args.use_full_range,
    )


if __name__ == "__main__":
    main()
