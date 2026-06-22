"""循环片段选取。"""

from __future__ import annotations

from pathlib import Path

from .frames import frame_signature, motion_distance, signature_distance


def find_best_loop(frames: list[Path]) -> dict[str, int | float]:
    """基于签名距离和运动连续性选取最佳循环片段。"""
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
    """选取更长的循环片段，支持自定义长度范围和长度偏好。"""
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
    """解析源帧范围：支持全范围、手动指定、搜索范围和自动循环选取。"""
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
