# Tools

本目录存放宠物动作资源处理脚本，主要用于从视频生成透明运行帧、替换动作视频、生成画质对比预览。

## 环境依赖

脚本使用 Python，并依赖：

- `numpy`
- `Pillow`
- `ffmpeg`

`ffmpeg` 查找顺序：

1. 命令参数 `--ffmpeg`
2. 环境变量 `FFMPEG_PATH`
3. 系统 `PATH`
4. 脚本中保留的本机剪映 ffmpeg 路径

## 脚本说明

| 文件 | 作用 | 常见修改场景 |
| --- | --- | --- |
| `process_pet_videos.py` | 批量抽帧、绿幕抠像、归一化尺寸、寻找循环段、写 manifest | 调整抠像参数、批量处理默认动作 |
| `replace_action_video.py` | 替换单个动作视频，生成 2x 透明帧并更新 `loop.json`/manifest | 新动作素材上线、手动选择循环段 |
| `build_quality_previews.py` | 生成当前帧、候选帧和并排对比预览视频 | 上线前检查画质和动作循环 |

## process_pet_videos.py

用途：从动作目录内的视频批量生成 `raw_frames`、`transparent_frames`、`loop.json`，并写入默认狗狗 manifest。

示例：

```powershell
python tools\process_pet_videos.py --actions dog_ball dog_feed dog_squat dog_walk
```

常用参数：

| 参数 | 作用 |
| --- | --- |
| `--actions` | 指定要处理的动作目录 |
| `--ffmpeg` | 指定 ffmpeg 路径 |
| `--fps` | 抽帧帧率，默认 `100/3` |

注意：脚本内默认 `ACTIONS` 和输出 manifest 目前偏向狗狗动作。处理其他变体时需显式传入 `--actions`，并确认 manifest 是否需要手动调整或改脚本。

## replace_action_video.py

用途：替换某个动作视频，生成增强 2x 透明运行帧，并更新动作目录和 manifest。

示例：

```powershell
python tools\replace_action_video.py --action dog_feed --video path\to\new.mp4 --manifest dog_actions_manifest.json
```

常用参数：

| 参数 | 作用 |
| --- | --- |
| `--action` | 目标动作目录，例如 `dog_feed` |
| `--video` | 替换视频路径 |
| `--manifest` | 要更新的 manifest 文件名 |
| `--keep-work` | 保留 `_replacement_work` 中间产物 |
| `--long-loop` | 倾向选择更长循环段 |
| `--source-start` / `--source-end` | 手动指定源循环范围 |
| `--search-start` / `--search-end` | 限制自动寻找循环段的源范围 |
| `--use-full-range` | 使用完整抽帧范围 |
| `--trim-ground-alpha` | 清理落地点以下残留透明边 |
| `--visible-height` / `--visible-max-width` | 覆盖可见高度/宽度 |

## build_quality_previews.py

用途：生成资源画质预览，输出到 `quality_previews`。

示例：

```powershell
python tools\build_quality_previews.py --actions dog_walk --clean
```

输出包括：

- 当前运行帧预览
- 增强候选帧预览
- 并排对比预览
- `quality_previews/README.md` 报告

## 推荐资源替换流程

1. 使用 `replace_action_video.py --keep-work` 替换单个动作。
2. 检查 `_replacement_work`、`transparent_frames` 和 `loop.json`。
3. 使用 `build_quality_previews.py` 生成预览。
4. 启动 Electron 应用检查动作播放、循环和落地点。
5. 确认后删除不需要的中间产物。
6. 更新 `assets/animations/README.md` 中的资源状态。

## 修改注意

- 脚本会写入资源目录，运行前确认目标 `--action` 和 `--manifest`。
- 不要把 `__pycache__` 当作源码。
- 修改脚本参数或默认行为后，同步更新本 README、`../assets/animations/README.md` 和 `../docs/AI_GUIDE.md`。
