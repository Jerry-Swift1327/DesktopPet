"""宠物动作资源处理包。

将原 process_pet_actions.py 中的函数按职责拆分到子模块：
- ffmpeg: ffmpeg 查找和视频抽帧
- files: 帧目录和文件操作工具
- chroma: 绿幕抠像、帧归一化和增强
- frames: 帧签名、运动分析、方向采样和循环帧构建
- loops: 循环片段选取
- manifest: manifest 文件更新

本模块只定义全局常量，不导入子模块，避免循环导入。
各子模块用 ``from . import CONSTANT`` 导入常量。
"""

from __future__ import annotations

from pathlib import Path

# 项目路径
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ANIMATIONS_ROOT = PROJECT_ROOT / "assets" / "animations"

# ---------------------------------------------------------------------------
# 帧尺寸常量
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

# ---------------------------------------------------------------------------
# 元数据常量
# ---------------------------------------------------------------------------
FRAME_MS = 30
SOURCE_FRAME_SIZE = 128
QUALITY_PROFILE = "enhanced_2x_conservative"
