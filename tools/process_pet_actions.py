"""Unified pet action resource processing script.

Merges the functionality of process_pet_videos.py and replace_action_video.py
into a single script with two subcommands: ``process`` and ``replace``.

资源处理函数已拆分到 ``pet_actions`` 包中，本文件仅保留 CLI 入口和核心处理流程。

Usage:
    python tools/process_pet_actions.py process --variant tabby --actions look walk
    python tools/process_pet_actions.py replace --action tabby_look --video new.mp4
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from PIL import Image

# 确保 tools/ 目录在 sys.path 中，以便导入 pet_actions 包
TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

from pet_actions import (  # noqa: E402
    ANIMATIONS_ROOT,
    CROP_NORMALIZATION,
    ENHANCED_FRAME_SIZE,
    FRAME_MS,
    NORMALIZATION_MODES,
    QUALITY_PROFILE,
    SOURCE_CANVAS_NORMALIZATION,
    SOURCE_FRAME_SIZE,
)
from pet_actions.chroma import align_frame_to_reference, process_frames_to_processed, validate_normalization_options  # noqa: E402
from pet_actions.ffmpeg import extract_frames, find_ffmpeg  # noqa: E402
from pet_actions.files import find_video, write_json  # noqa: E402
from pet_actions.frames import (  # noqa: E402
    build_enhanced_frames_from_source_indices,
    build_enhanced_loop_frames,
    detect_brightness_anomaly,
    frame_signature,
    motion_distance,
    sample_direction_frames,
    signature_distance,
)
from pet_actions.loops import resolve_source_range  # noqa: E402
from pet_actions.manifest import update_manifest  # noqa: E402
from pet_actions.audit import build_variant_audit, write_audit_report  # noqa: E402


# ---------------------------------------------------------------------------
# Core action processing
# ---------------------------------------------------------------------------
def align_runtime_frames_bottom_to_reference(
    transparent_dir: Path,
    reference: dict[str, float | int] | None,
    max_shift: int,
) -> None:
    if not reference:
        return
    for frame_path in sorted(transparent_dir.glob("frame_*.png")):
        image = Image.open(frame_path).convert("RGBA")
        aligned, _delta = align_frame_to_reference(
            image,
            reference,
            align_center_x=False,
            align_bottom=True,
            max_shift=max_shift,
        )
        aligned.save(frame_path)


def score_explicit_source_frames(processed_frame_list: list[Path], source_frames: list[int]) -> float:
    """Score the loop seam for an explicit runtime frame sequence."""
    if not source_frames or not processed_frame_list:
        return 0.0
    first_source = source_frames[0]
    last_source = source_frames[-1]
    if first_source < 0 or last_source < 0 or first_source >= len(processed_frame_list) or last_source >= len(processed_frame_list):
        return 0.0

    first_signature = frame_signature(processed_frame_list[first_source])
    last_signature = frame_signature(processed_frame_list[last_source])
    score = signature_distance(first_signature, last_signature)
    if first_source > 0 and last_source < len(processed_frame_list) - 1:
        score += motion_distance(
            frame_signature(processed_frame_list[first_source - 1]),
            first_signature,
            last_signature,
            frame_signature(processed_frame_list[last_source + 1]),
        ) * 0.45
    return round(float(score), 6)


def process_action_core(
    action: str,
    ffmpeg: str,
    fps: str,
    frame_ms: int = FRAME_MS,
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
    source_frames: list[int] | None = None,
    source_frames_dedupe_threshold: float | None = None,
    trim_ground_alpha: int = 0,
    trim_ground_padding: int = 1,
    trim_ground_alpha_auto: bool = False,
    clean_detached_artifacts: bool = False,
    detached_artifact_max_area: int = 256,
    detached_artifact_max_span: int = 64,
    detached_artifact_min_gap: int = 2,
    stable_ground: bool = False,
    stable_ground_max_shift: int = 32,
    visible_height: int | None = None,
    visible_max_width: int | None = None,
    normalization_mode: str = SOURCE_CANVAS_NORMALIZATION,
    center_visible_action_x: bool = False,
    center_visible_target_x: float | None = None,
    center_visible_max_shift: int = 32,
    align_reference_action: str | None = None,
    align_reference_center_x: bool = False,
    align_reference_bottom: bool = False,
    align_reference_bottom_per_frame: bool = False,
    align_reference_max_shift: int = 32,
    keep_raw: bool = False,
    clean_raw: bool = False,
    is_replace: bool = False,
    direction_count: int | None = None,
    freeze_last_frame: bool = False,
) -> dict[str, object]:
    """Core processing logic shared by process and replace subcommands."""
    action_dir = ANIMATIONS_ROOT / action
    validate_normalization_options(normalization_mode, visible_height, visible_max_width)

    if is_replace:
        if not action_dir.exists():
            raise FileNotFoundError(f"Missing action directory: {action_dir}")

    # Locate video
    if video_path is not None:
        if not video_path.exists():
            raise FileNotFoundError(f"Missing video: {video_path}")
    else:
        try:
            video_path = find_video(action_dir)
        except FileNotFoundError:
            raise FileNotFoundError(
                f"No .mp4 found in {action_dir}. "
                f"Use --video to specify an external video path."
            )

    raw_dir = action_dir / "raw_frames"
    processed_dir = action_dir / "processed_frames"
    transparent_dir = action_dir / "transparent_frames"

    print(f"\n[{action}] video: {video_path.name}")

    # Step 1: Extract frames
    extract_frames(ffmpeg, video_path, raw_dir, fps)

    # Step 2: Generate processed_frames (256px enhanced asset pool)
    processed_trim_ground_alpha = trim_ground_alpha if trim_ground_alpha > 0 else 128
    align_reference = load_reference_geometry(align_reference_action) if align_reference_action else None
    _processed_frames, processing_info = process_frames_to_processed(
        raw_dir,
        processed_dir,
        visible_height,
        visible_max_width,
        normalization_mode,
        trim_ground_alpha_auto=trim_ground_alpha_auto,
        trim_ground_alpha=processed_trim_ground_alpha,
        trim_ground_padding=trim_ground_padding,
        clean_detached_artifacts_enabled=clean_detached_artifacts,
        detached_artifact_max_area=detached_artifact_max_area,
        detached_artifact_max_span=detached_artifact_max_span,
        detached_artifact_min_gap=detached_artifact_min_gap,
        stable_ground=stable_ground,
        stable_ground_max_shift=stable_ground_max_shift,
        center_visible_action_x=center_visible_action_x,
        center_visible_target_x=center_visible_target_x,
        center_visible_max_shift=center_visible_max_shift,
        align_reference=align_reference,
        align_center_x=align_reference_center_x,
        align_bottom=align_reference_bottom,
        align_bottom_per_frame=align_reference_bottom_per_frame,
        align_max_shift=align_reference_max_shift,
    )
    processed_frame_count = len(list(processed_dir.glob("frame_*.png")))
    print(f"[{action}] processed_frames: {processed_frame_count} frames")

    # Step 3: Loop selection / direction sampling
    metadata: dict[str, object] = {
        "action": action,
        "video": f"{action}.mp4",
        "frameMs": int(frame_ms),
        "sourceFrameSize": SOURCE_FRAME_SIZE,
        "frameSize": ENHANCED_FRAME_SIZE,
        "qualityProfile": QUALITY_PROFILE,
        "sourceFrameCount": processed_frame_count,
    }
    metadata.update(processing_info)
    if freeze_last_frame:
        metadata["freezeLastFrame"] = True
    if trim_ground_alpha_auto:
        metadata["trimGroundAlphaMode"] = "processed-auto"
        metadata["trimGroundAlpha"] = processed_trim_ground_alpha
        metadata["trimGroundPadding"] = max(0, trim_ground_padding)
    if stable_ground:
        metadata["stableGroundMode"] = "processed-subject-components"
        metadata["stableGroundMaxShift"] = int(stable_ground_max_shift)
    if clean_detached_artifacts:
        metadata["detachedArtifactMode"] = "processed-subject-components"
        metadata["detachedArtifactMaxArea"] = int(detached_artifact_max_area)
        metadata["detachedArtifactMaxSpan"] = int(detached_artifact_max_span)
        metadata["detachedArtifactMinGap"] = int(detached_artifact_min_gap)
    if center_visible_action_x:
        metadata["centerVisibleActionX"] = True
        metadata["centerVisibleTargetX"] = (
            float(center_visible_target_x) if center_visible_target_x is not None else float(ENHANCED_FRAME_SIZE / 2)
        )
        metadata["centerVisibleMaxShift"] = int(center_visible_max_shift)
    if align_reference_action:
        metadata["alignReferenceAction"] = align_reference_action
        metadata["alignReferenceCenterX"] = bool(align_reference_center_x)
        metadata["alignReferenceBottom"] = bool(align_reference_bottom)
        if align_reference_bottom_per_frame:
            metadata["alignReferenceBottomPerFrame"] = True
        metadata["alignReferenceMaxShift"] = int(align_reference_max_shift)

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
            if source_frames:
                frame_count = build_enhanced_frames_from_source_indices(
                    processed_dir,
                    transparent_dir,
                    source_frames,
                    trim_ground_alpha,
                    trim_ground_padding,
                )
                src_start = int(min(source_frames))
                src_end = int(max(source_frames))
                loop: dict[str, int | float | str] = {
                    "loopStart": src_start,
                    "loopEnd": src_end,
                    "score": score_explicit_source_frames(processed_frame_list, source_frames),
                    "loopSelection": "manual-deduplicated" if source_frames_dedupe_threshold is not None else "manual-frames",
                }
            else:
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
            if align_reference_bottom_per_frame:
                align_runtime_frames_bottom_to_reference(
                    transparent_dir,
                    align_reference,
                    align_reference_max_shift,
                )

            metadata["frameCount"] = frame_count
            metadata["loopStart"] = 0
            metadata["loopEnd"] = frame_count - 1
            metadata["sourceLoopStart"] = src_start
            metadata["sourceLoopEnd"] = src_end
            metadata["score"] = float(loop["score"])

            if "loopSelection" in loop:
                metadata["loopSelection"] = str(loop["loopSelection"])
            if source_frames:
                metadata["sourceFrames"] = source_frames
                if source_frames_dedupe_threshold is not None:
                    metadata["sourceSampling"] = "explicit-adjacent-deduplicated"
                    metadata["droppedDuplicateFrames"] = max(0, src_end - src_start + 1 - len(source_frames))
                    metadata["dedupeThreshold"] = float(source_frames_dedupe_threshold)
                else:
                    metadata["sourceSampling"] = "explicit"
            if long_loop:
                metadata["qualityScore"] = float(loop.get("qualityScore", loop["score"]))
                metadata["targetLength"] = int(loop.get("targetLength", frame_count))
            if trim_ground_alpha > 0 and not trim_ground_alpha_auto:
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

    preserve_existing_metadata(action_dir, metadata)

    # Step 4: Write loop.json
    write_json(action_dir / "loop.json", metadata)

    # Step 5: Update manifest
    if manifest_name:
        update_manifest(action, metadata, manifest_name)

    # Step 6: Copy video file to action directory
    official_video = action_dir / f"{action}.mp4"
    if video_path.resolve() != official_video.resolve():
        shutil.copy2(video_path, official_video)
        print(f"[{action}] video copied: {official_video.name}")
    else:
        print(f"[{action}] video already in place: {official_video.name}")

    # Step 7: Keep raw_frames by default; --clean-raw restores the old cleanup behavior.
    if clean_raw and raw_dir.exists():
        shutil.rmtree(raw_dir)
        print(f"[{action}] raw_frames removed")
    elif raw_dir.exists():
        reason = "--keep-raw" if keep_raw else "default"
        print(f"[{action}] raw_frames kept ({reason})")

    return metadata


def load_reference_geometry(action: str) -> dict[str, float | int] | None:
    """Load first-frame geometry from an already processed reference action."""
    from pet_actions.chroma import get_frame_geometry
    from PIL import Image

    reference_frame = ANIMATIONS_ROOT / action / "processed_frames" / "frame_000.png"
    if not reference_frame.exists():
        reference_frame = ANIMATIONS_ROOT / action / "transparent_frames" / "frame_000.png"
    if not reference_frame.exists():
        raise FileNotFoundError(f"Missing reference frame for alignment: {reference_frame}")
    image = Image.open(reference_frame).convert("RGBA")
    geometry = get_frame_geometry(image)
    if geometry is None:
        raise RuntimeError(f"Reference frame has no visible pixels: {reference_frame}")
    return geometry


def preserve_existing_metadata(action_dir: Path, metadata: dict[str, object]) -> None:
    """Keep hand-authored playback metadata when regenerating action frames."""
    metadata_path = action_dir / "loop.json"
    if not metadata_path.exists():
        return
    try:
        existing = json.loads(metadata_path.read_text(encoding="utf-8"))
    except Exception:
        return
    for key in ("tailLoopStart", "freezeLastFrame"):
        if key in existing and key not in metadata:
            metadata[key] = existing[key]


def resolve_align_reference_action(
    explicit_reference: str | None,
    variant: str | None,
    action: str,
    align_center_x: bool,
    align_bottom: bool,
) -> str | None:
    """Resolve default squat reference when any alignment option is enabled."""
    if explicit_reference:
        return explicit_reference
    if not (align_center_x or align_bottom):
        return None
    if variant:
        return f"{variant}_squat"
    if "_" in action:
        return f"{action.split('_', 1)[0]}_squat"
    return None


def parse_source_frames(value: str | None) -> list[int] | None:
    """Parse an explicit comma/space separated source frame list."""
    if value is None or str(value).strip() == "":
        return None
    frames: list[int] = []
    for item in str(value).replace(",", " ").split():
        try:
            frame = int(item)
        except ValueError as exc:
            raise ValueError(f"Invalid source frame index: {item}") from exc
        if frame < 0:
            raise ValueError(f"Invalid source frame index: {frame}")
        frames.append(frame)
    return frames or None


def parse_optional_non_negative_float(value: str | None, name: str) -> float | None:
    """Parse an optional non-negative float CLI value."""
    if value is None or str(value).strip() == "":
        return None
    try:
        parsed = float(value)
    except ValueError as exc:
        raise ValueError(f"Invalid {name}: {value}") from exc
    if parsed < 0:
        raise ValueError(f"Invalid {name}: {value}")
    return parsed


# ---------------------------------------------------------------------------
# CLI: process subcommand
# ---------------------------------------------------------------------------
def cmd_process(args: argparse.Namespace) -> None:
    ffmpeg = find_ffmpeg(args.ffmpeg)
    print(f"Using ffmpeg: {ffmpeg}")

    # Derive manifest name from variant
    manifest_name = f"{args.variant}_actions_manifest.json"

    # Resolve video path
    video_path = Path(args.video) if args.video else None
    source_frames = parse_source_frames(args.source_frames)
    source_frames_dedupe_threshold = parse_optional_non_negative_float(
        args.source_frames_dedupe_threshold,
        "--source-frames-dedupe-threshold",
    )

    results = []
    for action in args.actions:
        action_name = f"{args.variant}_{action}"
        align_reference_action = resolve_align_reference_action(
            args.align_reference_action,
            args.variant,
            action_name,
            args.align_reference_center_x,
            args.align_reference_bottom,
        )
        metadata = process_action_core(
            action=action_name,
            ffmpeg=ffmpeg,
            fps=args.fps,
            frame_ms=args.frame_ms,
            video_path=video_path,
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
            source_frames=source_frames,
            source_frames_dedupe_threshold=source_frames_dedupe_threshold,
            trim_ground_alpha=args.trim_ground_alpha,
            trim_ground_padding=args.trim_ground_padding,
            trim_ground_alpha_auto=args.trim_ground_alpha_auto,
            clean_detached_artifacts=args.clean_detached_artifacts,
            detached_artifact_max_area=args.detached_artifact_max_area,
            detached_artifact_max_span=args.detached_artifact_max_span,
            detached_artifact_min_gap=args.detached_artifact_min_gap,
            stable_ground=args.stable_ground,
            stable_ground_max_shift=args.stable_ground_max_shift,
            visible_height=args.visible_height,
            visible_max_width=args.visible_max_width,
            normalization_mode=args.normalization_mode,
            center_visible_action_x=args.center_visible_action_x,
            center_visible_target_x=args.center_visible_target_x,
            center_visible_max_shift=args.center_visible_max_shift,
            align_reference_action=align_reference_action,
            align_reference_center_x=args.align_reference_center_x,
            align_reference_bottom=args.align_reference_bottom,
            align_reference_bottom_per_frame=args.align_reference_bottom_per_frame,
            align_reference_max_shift=args.align_reference_max_shift,
            keep_raw=args.keep_raw,
            clean_raw=args.clean_raw,
            direction_count=args.direction_count,
            freeze_last_frame=args.freeze_last_frame,
        )
        results.append(metadata)

    print(f"\nProcessed {len(results)} action(s) for variant '{args.variant}'")


# ---------------------------------------------------------------------------
# CLI: replace subcommand
# ---------------------------------------------------------------------------
def cmd_replace(args: argparse.Namespace) -> None:
    ffmpeg = find_ffmpeg(args.ffmpeg)
    print(f"Using ffmpeg: {ffmpeg}")
    source_frames = parse_source_frames(args.source_frames)
    source_frames_dedupe_threshold = parse_optional_non_negative_float(
        args.source_frames_dedupe_threshold,
        "--source-frames-dedupe-threshold",
    )

    metadata = process_action_core(
        action=args.action,
        ffmpeg=ffmpeg,
        fps=args.fps,
        frame_ms=args.frame_ms,
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
        source_frames=source_frames,
        source_frames_dedupe_threshold=source_frames_dedupe_threshold,
        trim_ground_alpha=args.trim_ground_alpha,
        trim_ground_padding=args.trim_ground_padding,
        trim_ground_alpha_auto=args.trim_ground_alpha_auto,
        clean_detached_artifacts=args.clean_detached_artifacts,
        detached_artifact_max_area=args.detached_artifact_max_area,
        detached_artifact_max_span=args.detached_artifact_max_span,
        detached_artifact_min_gap=args.detached_artifact_min_gap,
        stable_ground=args.stable_ground,
        stable_ground_max_shift=args.stable_ground_max_shift,
        visible_height=args.visible_height,
        visible_max_width=args.visible_max_width,
        normalization_mode=args.normalization_mode,
        center_visible_action_x=args.center_visible_action_x,
        center_visible_target_x=args.center_visible_target_x,
        center_visible_max_shift=args.center_visible_max_shift,
        align_reference_action=resolve_align_reference_action(
            args.align_reference_action,
            None,
            args.action,
            args.align_reference_center_x,
            args.align_reference_bottom,
        ),
        align_reference_center_x=args.align_reference_center_x,
        align_reference_bottom=args.align_reference_bottom,
        align_reference_bottom_per_frame=args.align_reference_bottom_per_frame,
        align_reference_max_shift=args.align_reference_max_shift,
        keep_raw=args.keep_raw,
        clean_raw=args.clean_raw,
        is_replace=True,
        direction_count=args.direction_count,
        freeze_last_frame=args.freeze_last_frame,
    )

    print(f"\nReplaced action '{args.action}'")


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------
def add_common_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--ffmpeg", default=None, help="Path to ffmpeg.exe.")
    parser.add_argument("--fps", default="100/3", help="Extraction frame rate. Default matches 30ms playback.")
    parser.add_argument("--frame-ms", type=int, default=FRAME_MS, help="Runtime playback duration per frame in loop.json.")
    parser.add_argument("--no-loop", action="store_true", help="Skip loop selection, only generate processed_frames.")
    parser.add_argument("--skip-frames", default="auto", help="Exclude head frames from processed_frames. 'auto' (default), '0' (none), or a number like '6'.")
    parser.add_argument("--long-loop", action="store_true", help="Prefer a longer seamless loop when selecting source frames.")
    parser.add_argument("--loop-min", type=int, default=None, help="Minimum source loop frame count for --long-loop.")
    parser.add_argument("--loop-target", type=int, default=None, help="Preferred source loop frame count for --long-loop.")
    parser.add_argument("--loop-max", type=int, default=None, help="Maximum source loop frame count for --long-loop.")
    parser.add_argument("--length-bias", type=float, default=0.025, help="Penalty for loops shorter than --loop-target.")
    parser.add_argument("--source-start", type=int, default=None, help="Manual source start frame after extraction.")
    parser.add_argument("--source-end", type=int, default=None, help="Manual source end frame after extraction.")
    parser.add_argument("--source-frames", default=None, help="Explicit comma/space separated processed frame indices to copy to runtime frames.")
    parser.add_argument("--source-frames-dedupe-threshold", default=None, help="Record explicit source frames as an adjacent-deduplicated manual selection with this threshold.")
    parser.add_argument("--search-start", type=int, default=None, help="Limit automatic loop selection to this source start frame.")
    parser.add_argument("--search-end", type=int, default=None, help="Limit automatic loop selection to this source end frame.")
    parser.add_argument("--use-full-range", action="store_true", help="Use the full extracted frame range instead of auto loop selection.")
    parser.add_argument("--trim-ground-alpha", type=int, default=0, help="Clear rows below last solid-alpha row. Disabled by default.")
    parser.add_argument("--trim-ground-padding", type=int, default=1, help="Rows to keep below last solid-alpha row when --trim-ground-alpha is enabled.")
    parser.add_argument("--trim-ground-alpha-auto", action="store_true", help="Apply safe ground-alpha cleanup to processed_frames before runtime frames are selected.")
    parser.add_argument("--clean-detached-artifacts", action="store_true", help="Remove small detached alpha components outside the main subject in processed_frames.")
    parser.add_argument("--detached-artifact-max-area", type=int, default=256, help="Maximum area for --clean-detached-artifacts components.")
    parser.add_argument("--detached-artifact-max-span", type=int, default=64, help="Maximum width/height for --clean-detached-artifacts components.")
    parser.add_argument("--detached-artifact-min-gap", type=int, default=2, help="Minimum pixel gap from the subject for --clean-detached-artifacts components.")
    parser.add_argument("--stable-ground", action="store_true", help="Use subject-component analysis to clear small bottom artifacts and align frames to a stable subject bottom.")
    parser.add_argument("--stable-ground-max-shift", type=int, default=32, help="Maximum vertical shift for --stable-ground.")
    parser.add_argument("--visible-height", type=int, default=None, help="Override sprite visible height for this action.")
    parser.add_argument("--visible-max-width", type=int, default=None, help="Override sprite visible max width for this action.")
    parser.add_argument(
        "--normalization-mode",
        choices=NORMALIZATION_MODES,
        default=SOURCE_CANVAS_NORMALIZATION,
        help=f"Frame normalization mode. Default {SOURCE_CANVAS_NORMALIZATION}; use {CROP_NORMALIZATION} for the legacy crop-and-anchor layout.",
    )
    parser.add_argument("--center-visible-action-x", action="store_true", help="Apply one action-level X shift so processed_frames median visible center is centered on the canvas.")
    parser.add_argument("--center-visible-target-x", type=float, default=None, help="Canvas X target for --center-visible-action-x. Defaults to half of frameSize.")
    parser.add_argument("--center-visible-max-shift", type=int, default=32, help="Maximum X shift for --center-visible-action-x.")
    parser.add_argument("--align-reference-action", default=None, help="Action folder whose first frame is used as geometry alignment reference.")
    parser.add_argument("--align-reference-center-x", action="store_true", help="Align processed_frames visible center X to --align-reference-action.")
    parser.add_argument("--align-reference-bottom", action="store_true", help="Align processed_frames visible bottom to --align-reference-action.")
    parser.add_argument("--align-reference-bottom-per-frame", action="store_true", help="Align each processed frame bottom to --align-reference-action instead of applying the first-frame bottom shift to the whole action.")
    parser.add_argument("--align-reference-max-shift", type=int, default=32, help="Maximum per-axis pixel shift for reference alignment.")
    raw_group = parser.add_mutually_exclusive_group()
    raw_group.add_argument("--keep-raw", action="store_true", help="Keep raw_frames after processing. This is the default.")
    raw_group.add_argument("--clean-raw", action="store_true", help="Remove raw_frames after processing.")
    parser.add_argument("--direction-count", type=int, default=None, help="Sample N direction frames (for eye-tracking actions like tabby_look).")
    parser.add_argument("--freeze-last-frame", action="store_true", help="Freeze the final runtime frame instead of looping the selected frame range.")


def cmd_audit(args: argparse.Namespace) -> None:
    variants = args.variants if args.variants else None
    report = build_variant_audit(ANIMATIONS_ROOT, variants=variants, frame_folder=args.frame_folder)
    if args.output:
        write_audit_report(report, Path(args.output))
        print(f"Audit report written: {args.output}")
    risks = report.get("risks", [])
    if isinstance(risks, list):
        print("Top geometry risks:")
        for item in risks[: args.top]:
            if not isinstance(item, dict):
                continue
            print(
                f"{float(item['score']):6.1f} "
                f"{item.get('variant')} {item.get('action')} "
                f"frames={item.get('frameCount')}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Unified pet action resource processing: extract, chroma-key, enhance, and select loop frames."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # process subcommand
    process_parser = subparsers.add_parser("process", help="Process actions for a pet variant.")
    process_parser.add_argument("--variant", required=True, help="Pet variant name, e.g. tabby, dog, cat.")
    process_parser.add_argument("--actions", nargs="*", default=["squat", "walk", "feed", "ball"], help="Action names to process (without variant prefix).")
    process_parser.add_argument("--video", default=None, help="Source .mp4 path. If omitted, looks for <action>.mp4 inside the action directory.")
    add_common_args(process_parser)

    # replace subcommand
    replace_parser = subparsers.add_parser("replace", help="Replace a single action video.")
    replace_parser.add_argument("--action", required=True, help="Full action directory name, e.g. tabby_look.")
    replace_parser.add_argument("--video", required=True, help="Replacement .mp4 path.")
    replace_parser.add_argument("--manifest", required=True, help="Manifest file name to update, e.g. tabby_actions_manifest.json.")
    add_common_args(replace_parser)

    audit_parser = subparsers.add_parser("audit", help="Audit current action frame geometry without modifying resources.")
    audit_parser.add_argument("--variants", nargs="*", default=None, help="Variant names to audit. Defaults to all variants.")
    audit_parser.add_argument("--frame-folder", default="transparent_frames", help="Frame folder to inspect, default transparent_frames.")
    audit_parser.add_argument("--output", default=None, help="Optional JSON report output path.")
    audit_parser.add_argument("--top", type=int, default=20, help="Number of top risks to print.")

    args = parser.parse_args()

    if args.command == "process":
        cmd_process(args)
    elif args.command == "replace":
        cmd_replace(args)
    elif args.command == "audit":
        cmd_audit(args)


if __name__ == "__main__":
    main()
