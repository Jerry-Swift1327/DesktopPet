"""帧签名、运动分析、方向采样和循环帧构建。"""

from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
from PIL import Image

from . import ALPHA_CROP_THRESHOLD
from .chroma import trim_ground_alpha_remnants
from .files import clear_frame_dir


def frame_signature(frame: Path) -> dict[str, np.ndarray | float]:
    """计算帧的签名特征：预乘 alpha 向量、中心点、包围盒和质量。"""
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
    """计算两个帧签名的距离。"""
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
    """计算帧间的运动距离（起始和结束运动向量差的均值）。"""
    start_motion = a["vector"] - before_a["vector"]  # type: ignore[operator]
    end_motion = after_b["vector"] - b["vector"]  # type: ignore[operator]
    return float(np.mean(np.abs(start_motion - end_motion)))


def compute_alpha_brightness(frame_path: Path) -> float:
    """计算 alpha 可见区域的平均亮度。"""
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
    """检测素材池头部是否存在亮度异常帧，返回需要排除的帧索引列表。"""
    processed_frames = sorted(processed_dir.glob("frame_*.png"))
    if not processed_frames:
        return []

    total = len(processed_frames)

    # 计算头部帧亮度
    head_count = min(check_head_count, total)
    head_brightness = [compute_alpha_brightness(processed_frames[i]) for i in range(head_count)]

    # 计算尾部帧亮度（稳定参考）
    tail_start = min(compare_tail_start, total)
    tail_brightness = [compute_alpha_brightness(processed_frames[i]) for i in range(tail_start, total)]

    if not tail_brightness:
        return []

    tail_mean = float(np.mean(tail_brightness))

    # 从头部开始找连续的异常帧
    excluded: list[int] = []
    for i in range(head_count):
        if head_brightness[i] > tail_mean * (1.0 + threshold):
            excluded.append(i)
        else:
            break

    return excluded


def compute_frame_motion_vectors(frames: list[Path]) -> list[float]:
    """基于签名差异计算每帧的运动量。"""
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
    """使用 visual-motion-even 策略从 processed_frames 采样方向帧。

    - 排除 excluded_frames 中的异常帧。
    - frame_000 使用尾部匹配帧（与第一个稳定帧方向相同）。
    - 其余帧按运动量均匀分布采样。
    """
    excluded = set(excluded_frames or [])
    processed_frames = sorted(processed_dir.glob("frame_*.png"))
    total = len(processed_frames)

    if total == 0:
        raise RuntimeError(f"No processed frames found in {processed_dir}")

    # 构建候选索引（排除异常帧）
    candidates = [i for i in range(total) if i not in excluded]
    if not candidates:
        raise RuntimeError("All frames excluded, no candidates for direction sampling")

    # 计算候选帧的运动向量
    candidate_paths = [processed_frames[i] for i in candidates]
    motions = compute_frame_motion_vectors(candidate_paths)

    # 累积运动量用于均匀采样
    cum_motion = [0.0]
    for m in motions:
        cum_motion.append(cum_motion[-1] + max(m, 0.001))

    total_motion = cum_motion[-1]

    # 使用 visual-motion-even 分布采样 count 帧
    source_indices: list[int] = []
    for i in range(count):
        target_motion = total_motion * (i + 0.5) / count
        # 二分查找正确位置
        lo, hi = 0, len(cum_motion) - 1
        while lo < hi:
            mid = (lo + hi) // 2
            if cum_motion[mid] < target_motion:
                lo = mid + 1
            else:
                hi = mid
        # lo 是 candidates 中的索引
        candidate_idx = min(lo, len(candidates) - 1)
        source_indices.append(candidates[candidate_idx])

    # frame_000 使用尾部匹配帧替代第一个候选帧
    # 从尾部找一个与第一个稳定帧姿态相似的帧
    first_stable = candidates[0]
    first_stable_sig = frame_signature(processed_frames[first_stable])

    best_tail_idx = total - 1
    best_tail_dist = float("inf")
    for tail_i in range(total - 1, max(total - 30, -1), -1):
        if tail_i in excluded:
            continue
        dist = signature_distance(first_stable_sig, frame_signature(processed_frames[tail_i]))
        if dist < best_tail_dist:
            best_tail_dist = dist
            best_tail_idx = tail_i

    # 用尾部匹配帧替换第一个源帧
    source_indices[0] = best_tail_idx

    # 去重并保持顺序
    seen: set[int] = set()
    unique_sources: list[int] = []
    for idx in source_indices:
        if idx not in seen:
            seen.add(idx)
            unique_sources.append(idx)
    # 如果因去重丢失了帧，从剩余候选中补充
    remaining = [i for i in candidates if i not in seen and i != best_tail_idx]
    for idx in remaining:
        if len(unique_sources) >= count:
            break
        unique_sources.append(idx)
        seen.add(idx)

    source_indices = unique_sources[:count]

    # 写入 transparent_frames
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


def build_enhanced_loop_frames(
    processed_dir: Path,
    output_dir: Path,
    source_start: int,
    source_end: int,
    trim_ground_alpha: int,
    trim_ground_padding: int,
) -> int:
    """从 processed_frames 复制选中帧到 transparent_frames，可选清理地面透明残留。"""
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


def build_enhanced_frames_from_source_indices(
    processed_dir: Path,
    output_dir: Path,
    source_indices: list[int],
    trim_ground_alpha: int,
    trim_ground_padding: int,
) -> int:
    """Copy explicitly selected processed frame indices into transparent_frames."""
    processed_frames = sorted(processed_dir.glob("frame_*.png"))
    if not processed_frames:
        raise RuntimeError(f"No processed frames found in {processed_dir}")
    if not source_indices:
        raise RuntimeError("No source frames were provided.")

    clear_frame_dir(output_dir)
    for output_index, source_index in enumerate(source_indices):
        if source_index < 0 or source_index >= len(processed_frames):
            raise RuntimeError(f"Invalid source frame {source_index} for {len(processed_frames)} processed frames")
        src = processed_dir / f"frame_{source_index:03d}.png"
        if not src.exists():
            raise RuntimeError(f"Missing processed frame: {src}")

        frame = Image.open(src).convert("RGBA")
        frame = trim_ground_alpha_remnants(frame, trim_ground_alpha, trim_ground_padding)
        frame.save(output_dir / f"frame_{output_index:03d}.png")

    return len(source_indices)
