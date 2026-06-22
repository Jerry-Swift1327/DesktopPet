"""帧目录和文件操作工具。"""

from __future__ import annotations

import json
import shutil
from pathlib import Path


def clear_frame_dir(path: Path) -> None:
    """创建目录（如不存在）并清除所有 frame_*.png 文件。"""
    path.mkdir(parents=True, exist_ok=True)
    for frame in path.glob("frame_*.png"):
        frame.unlink()


def find_video(action_dir: Path) -> Path:
    """在动作目录中查找视频文件，优先匹配 <action>.mp4。"""
    preferred = action_dir / f"{action_dir.name}.mp4"
    if preferred.exists():
        return preferred

    videos = sorted(action_dir.glob("*.mp4"))
    if not videos:
        raise FileNotFoundError(f"No .mp4 file found in {action_dir}")
    return videos[0]


def write_json(path: Path, data: object) -> None:
    """将数据以 JSON 格式写入文件。"""
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def copy_tree_frames(source_dir: Path, target_dir: Path) -> int:
    """将源目录中的 frame_*.png 复制到目标目录，返回复制的帧数。"""
    clear_frame_dir(target_dir)
    count = 0
    for frame in sorted(source_dir.glob("frame_*.png")):
        shutil.copy2(frame, target_dir / frame.name)
        count += 1
    return count
