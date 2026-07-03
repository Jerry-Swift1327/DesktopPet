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
| `process_pet_actions.py` | 统一资源处理 CLI 入口：抽帧、抠像、增强、循环选取、方向采样 |
| `pet_actions/` | 资源处理 Python 包，按职责拆分到子模块 |
| `build_quality_previews.py` | 生成当前帧、候选帧和并排对比预览视频 |
| `process_pet_videos.py` | （已弃用）旧版批量处理脚本，功能已合并到 `process_pet_actions.py` |
| `replace_action_video.py` | （已弃用）旧版替换单个动作脚本，功能已合并到 `process_pet_actions.py` |

## process_pet_actions.py

统一资源处理脚本，包含三个子命令：`process`、`replace` 和 `audit`。

### 处理流程

```
视频 → 抽帧(raw_frames) → 抠像+保源画布构图归一化+256px增强(processed_frames/本机最终素材池)
                              ↓
                     亮色毛发 alpha 稳定化（内部针孔/低透明裂纹修复）
                              ↓
                     [默认] 亮度异常检测 → 确定 excludedFrames
                              ↓
                     [默认] 选取循环片段 → transparent_frames/ (跨机器同步的最终运行帧)
                              ↓
                     生成 loop.json + 更新 manifest
                              ↓
                     [可选 --clean-raw] 删除 raw_frames/
```

### process 子命令

用途：为指定宠物变体批量处理动作视频，生成 `processed_frames`、`transparent_frames`、`loop.json`，并写入 manifest。

示例：

```powershell
# 使用外部视频处理 tabby 变体的 look 动作
python tools\process_pet_actions.py process --variant tabby --actions look --video path\to\look.mp4 --direction-count 64

# 使用动作目录内的视频处理 dog 变体（需要目录下有 .mp4 文件）
python tools\process_pet_actions.py process --variant dog --actions squat walk feed ball

# 只生成素材池，不选取循环
python tools\process_pet_actions.py process --variant tabby --actions look --video path\to\look.mp4 --no-loop

# 手动指定排除前 6 帧
python tools\process_pet_actions.py process --variant tabby --actions look --video path\to\look.mp4 --skip-frames 6 --direction-count 64
```

常用参数：

| 参数 | 作用 |
| --- | --- |
| `--variant` | 宠物变体名，如 `tabby`、`dog`、`cat` |
| `--actions` | 要处理的动作名列表（不含变体前缀） |
| `--video` | 源视频路径。省略时从动作目录内查找 `.mp4` 文件 |
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
| `--trim-ground-alpha-auto` | 在生成素材池时安全检测并清理底部低透明 alpha 残留 |
| `--normalization-mode` | 帧归一化模式，默认 `source-canvas` 保留源视频完整画布构图；`crop` 使用旧版裁剪贴地归一化 |
| `--visible-height` / `--visible-max-width` | 覆盖可见高度/宽度，仅适用于 `--normalization-mode crop` |
| `--center-visible-action-x` | 对整个动作的素材池帧应用同一个 X 平移，让中位可见中心位于画布中心，保留帧内运动 |
| `--center-visible-target-x` / `--center-visible-max-shift` | 覆盖动作级 X 居中的目标位置和最大平移量 |
| `--align-reference-action` | 使用指定动作首帧作为几何对齐参考 |
| `--align-reference-center-x` / `--align-reference-bottom` | 将素材池帧的可见中心 X 或底线对齐到参考动作；未指定参考动作时默认使用同变体 `squat` |
| `--keep-raw` | 保留 `raw_frames` 中间产物；当前为默认行为，保留该参数用于兼容旧命令 |
| `--clean-raw` | 处理完成后删除 `raw_frames` 中间产物，用于恢复旧的自动清理行为 |

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

### alpha 稳定化

抠像后的归一化帧会自动执行亮色毛发安全处理：对高亮、低饱和的近白前景采用更保守的绿幕判定，并在 256px/128px 帧内修复局部前景密度较高区域中的透明针孔和低透明裂纹。该步骤用于避免 ragdoll、van、pomeranian 等浅色毛发在播放时因 alpha 破洞产生闪烁，同时不会整体外扩外轮廓。

### 画布归一化

默认 `--normalization-mode source-canvas` 会保留源视频完整画布坐标，把抠像后的整张源帧等比缩放到 256px 透明画布中，避免因动作全局裁剪框或局部残留把主体推偏。`loop.json` 和 manifest 会记录 `normalizationMode` 与 `sourceCanvasSize`，用于审计不同动作的源分辨率。

需要旧版“按可见区域裁剪、缩放、贴地”的素材时，使用 `--normalization-mode crop`。`--visible-height`、`--visible-max-width` 只在 `crop` 模式下生效。

### 方向采样（眼球追踪动作）

使用 `--direction-count 64` 启用方向帧采样：

- 采样策略：`visual-motion-even`（按运动量均匀分布采样点）
- 排除 `excludedFrames` 中的偏亮帧
- `frame_000` 使用尾部同方向帧（`sourceStartPolicy: tail-matched-first-frame`）
- `frame_001` 起从第一个稳定帧开始接续

## pet_actions/ 包

`process_pet_actions.py` 的资源处理函数已按职责拆分到 `pet_actions/` Python 包中。包内各模块用相对导入，`__init__.py` 只定义全局常量，不导入子模块。

| 模块 | 作用 |
| --- | --- |
| `__init__.py` | 全局常量（PROJECT_ROOT、ANIMATIONS_ROOT、帧尺寸、FRAME_MS 等） |
| `ffmpeg.py` | ffmpeg 查找和视频抽帧（find_ffmpeg、extract_frames） |
| `files.py` | 帧目录和文件操作（clear_frame_dir、find_video、write_json、copy_tree_frames） |
| `chroma.py` | 绿幕抠像、帧归一化和增强（chroma_key_green_image、normalize_source_canvas_frame、normalize_candidate_frame 等） |
| `frames.py` | 帧签名、运动分析、方向采样和循环帧构建（frame_signature、detect_brightness_anomaly、sample_direction_frames 等） |
| `loops.py` | 循环片段选取（find_best_loop、find_best_long_loop、resolve_source_range） |
| `manifest.py` | manifest 文件更新（update_manifest） |
| `audit.py` | 动作帧几何审计、参考动作差异和风险排序 |

`process_pet_actions.py` 通过 `from pet_actions.xxx import ...` 导入所需函数和常量，仅保留 CLI 入口（process_action_core、cmd_process、cmd_replace、main）。

### audit 子命令

用途：只读审计当前动作帧几何，不修改资源目录。审计内容包括帧尺寸、可见包围盒、视觉中心、alpha 重心、底线、画布中心偏移、左右透明边距差、首尾 seam、底部低透明 alpha 残留、内部 alpha 针孔/低透明裂纹，以及相对同变体 `squat` 的差异和风险排序。

示例：

```powershell
python tools\process_pet_actions.py audit --output .tmp\pet-action-audit.json --top 25
python tools\process_pet_actions.py audit --variants tabby van bshmitted
```

### 素材池和运行帧边界

- `raw_frames` 默认保留，便于查看源帧分辨率和排查抠像问题；需要节省本地空间时使用 `--clean-raw` 删除。
- `processed_frames` 是本机处理时的最终素材池，默认保留源画布构图并输出 256px 增强透明帧；使用 `crop` 模式时可包含裁剪、贴地、底部 alpha 清理和参考动作对齐结果，但仍属于可再生成维护产物，不提交到 Git。
- `transparent_frames` 是从素材池选取或采样出的最终运行帧，需要随 `loop.json` 和 manifest 提交，保证跨机器运行一致。
- 修复动作资源时，先修生成素材池的参数和处理逻辑，再从素材池导出运行帧；不要只手动改 `transparent_frames`，否则后续重新导出会覆盖修复。

### 新资源几何建议
- 对新加入的变体和动作，优先使用默认 `source-canvas` 保留源视频构图；如果源视频本身主体整体偏左或偏右，再用 `--center-visible-action-x` 修正动作级画布 X 偏心。该参数只计算一次中位可见中心并对所有帧应用同一个平移，不会逐帧抵消动作本身的运动。
- 对 `squat/lick/shake/yawn/hiss/look` 等近蹲坐动作，可在 squat 自身构图正确后，再叠加 `--align-reference-center-x --align-reference-bottom` 约束首帧和底线。
- 对 `walk/ball/feed/sleep/lie/stretch` 等动作，不要默认强行匹配 squat 宽高；优先保证动作级构图、底线稳定和帧内漂移合理。

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
- `processed_frames` 和 `raw_frames` 已加入 `.gitignore`，不应提交到仓库；`raw_frames` 默认保留但可用 `--clean-raw` 清理。
- 修改脚本参数或默认行为后，同步更新本 README、`../assets/animations/README.md` 和 `../docs/PROJECT_MAP.md`。
