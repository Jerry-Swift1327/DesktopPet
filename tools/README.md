# Tools

本目录存放宠物动作资源处理脚本，用于从视频生成素材池和运行帧、替换动作视频和生成画质对比预览。

## 环境依赖

脚本使用 Python，并依赖：

- `numpy`
- `Pillow`
- `ffmpeg`

`ffmpeg` 查找顺序：

1. 命令参数 `--ffmpeg`
2. 环境变量 `FFMPEG_PATH`
3. 系统 `PATH`
4. 脚本中保留的本机兜底路径

## 脚本说明

| 文件 | 作用 |
| --- | --- |
| `process_pet_actions.py` | 统一资源处理脚本：抽帧、抠像、增强、循环选取、方向采样 |
| `build_quality_previews.py` | 生成当前帧、候选帧和并排对比预览视频 |
| `process_pet_videos.py` | （已弃用）旧版批量处理脚本，功能已合并到 `process_pet_actions.py` |
| `replace_action_video.py` | （已弃用）旧版替换单个动作脚本，功能已合并到 `process_pet_actions.py` |

## process_pet_actions.py

统一资源处理脚本，包含两个子命令：`process` 和 `replace`。

### 处理流程

```
视频 → 抽帧(raw_frames) → 抠像+归一化+256px增强(processed_frames/素材池)
                              ↓
                     [默认] 亮度异常检测 → 确定 excludedFrames
                              ↓
                     [默认] 选取循环片段 → transparent_frames/ (运行时素材)
                              ↓
                     生成 loop.json + 更新 manifest
                              ↓
                     [默认] 删除 raw_frames/
```

### process 子命令

用途：为指定宠物变体批量处理动作视频，生成 `processed_frames`、`transparent_frames`、`loop.json`，并写入 manifest。

示例：

```powershell
# 处理 tabby 变体的 look 动作（自动检测亮度异常）
python tools\process_pet_actions.py process --variant tabby --actions look --direction-count 64

# 处理 dog 变体的全部动作
python tools\process_pet_actions.py process --variant dog --actions squat walk feed ball

# 只生成素材池，不选取循环
python tools\process_pet_actions.py process --variant tabby --actions look --no-loop

# 手动指定排除前 6 帧
python tools\process_pet_actions.py process --variant tabby --actions look --skip-frames 6 --direction-count 64
```

常用参数：

| 参数 | 作用 |
| --- | --- |
| `--variant` | 宠物变体名，如 `tabby`、`dog`、`cat` |
| `--actions` | 要处理的动作名列表（不含变体前缀） |
| `--ffmpeg` | 指定 ffmpeg 路径 |
| `--fps` | 抽帧帧率，默认 `100/3` |
| `--no-loop` | 跳过循环选取，只生成素材池 |
| `--skip-frames` | 排除素材池前 N 帧：`auto`（默认，自动检测亮度异常）、`0`（不排除）、数字（手动指定） |
| `--direction-count` | 采样 N 帧方向帧（用于眼球追踪动作如 `tabby_look`） |
| `--long-loop` | 倾向选择更长循环段 |
| `--source-start` / `--source-end` | 手动指定源循环范围 |
| `--search-start` / `--search-end` | 限制自动寻找循环段的源范围 |
| `--use-full-range` | 使用完整抽帧范围 |
| `--trim-ground-alpha` | 清理落地点以下残留透明边 |
| `--visible-height` / `--visible-max-width` | 覆盖可见高度/宽度 |
| `--keep-raw` | 保留 `raw_frames` 中间产物 |

### replace 子命令

用途：替换单个动作视频，重新生成 `processed_frames`、`transparent_frames`，更新 `loop.json` 和 manifest。

示例：

```powershell
python tools\process_pet_actions.py replace --action tabby_look --video path\to\new.mp4 --manifest tabby_actions_manifest.json --direction-count 64
```

常用参数：

| 参数 | 作用 |
| --- | --- |
| `--action` | 目标动作目录名，如 `tabby_look` |
| `--video` | 替换视频路径 |
| `--manifest` | 要更新的 manifest 文件名 |
| 其他参数 | 与 `process` 子命令相同 |

### 亮度异常检测

脚本自动检测素材池前几帧是否存在亮度异常（如 `tabby_look` 的 source 0..5 偏亮）：

1. 计算每张 `processed_frame` 的 alpha 区域平均亮度（只算 alpha > 12 的像素）
2. 对比头部帧和尾部稳定帧的亮度
3. 如果头部帧亮度显著高于稳定帧，自动加入 `excludedFrames`
4. 可通过 `--skip-frames auto`（默认）、`--skip-frames 6` 或 `--skip-frames 0` 控制

### 方向采样（眼球追踪动作）

使用 `--direction-count 64` 启用方向帧采样：

- 采样策略：`visual-motion-even`（按运动量均匀分布采样点）
- 排除 `excludedFrames` 中的偏亮帧
- `frame_000` 使用尾部同方向帧（`sourceStartPolicy: tail-matched-first-frame`）
- `frame_001` 起从第一个稳定帧开始接续

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

## 推荐资源处理流程

1. 使用 `process_pet_actions.py process` 处理新变体动作。
2. 检查 `processed_frames`、`transparent_frames` 和 `loop.json`。
3. 使用 `build_quality_previews.py` 生成预览。
4. 启动 Electron 应用检查动作播放、循环和落地点。
5. 如需替换单个动作，使用 `process_pet_actions.py replace`。
6. 更新 `assets/animations/README.md` 中的资源说明。

## 修改注意

- 脚本会写入资源目录，运行前确认目标 `--action`/`--variant` 和 `--manifest`。
- 不要把 `__pycache__` 当作源码。
- `processed_frames` 和 `raw_frames` 已加入 `.gitignore`，不应提交到仓库。
- 修改脚本参数或默认行为后，同步更新本 README、`../assets/animations/README.md` 和 `../docs/PROJECT_MAP.md`。
