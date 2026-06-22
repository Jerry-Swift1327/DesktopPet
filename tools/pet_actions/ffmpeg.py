"""ffmpeg 查找和视频抽帧。"""

from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path

from .files import clear_frame_dir


def find_ffmpeg(explicit_path: str | None) -> str:
    """按优先级查找 ffmpeg 可执行文件：命令参数 > 环境变量 > PATH > 兜底路径。"""
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


def extract_frames(ffmpeg: str, video: Path, raw_dir: Path, fps: str) -> None:
    """使用 ffmpeg 从视频抽取帧到 raw_dir。"""
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
