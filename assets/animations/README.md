# Animations

本目录存放桌宠动作资源。每个动作目录使用 `<variant>_<action>` 命名，manifest 使用 `<variant>_actions_manifest.json` 命名。

## 变体和动作

| 变体 | 动作目录 |
| --- | --- |
| `dog` | `dog_squat`、`dog_walk`、`dog_feed`、`dog_ball` |
| `cat` | `cat_squat`、`cat_walk`、`cat_feed`、`cat_ball` |
| `shorthair` | `shorthair_squat`、`shorthair_walk`、`shorthair_feed`、`shorthair_ball` |
| `tabby` | `tabby_squat`、`tabby_walk`、`tabby_feed`、`tabby_ball`、`tabby_lie`、`tabby_lick`、`tabby_belly`、`tabby_stretch`、`tabby_look`、`tabby_shake`、`tabby_yawn`、`tabby_sleep`、`tabby_hiss` |
| `brit` | `brit_squat`、`brit_walk`、`brit_feed`、`brit_ball` |
| `bshmitted` | `bshmitted_squat`、`bshmitted_walk`、`bshmitted_feed`、`bshmitted_ball` |
| `van` | `van_squat`、`van_walk`、`van_feed`、`van_ball` |
| `pomeranian` | `pomeranian_squat`、`pomeranian_walk`、`pomeranian_feed`、`pomeranian_ball` |

## 单个动作目录

| 路径 | 作用 | 运行时必需 |
| --- | --- | --- |
| `<action>.mp4` | 动作源视频 | 否 |
| `processed_frames/frame_*.png` | 256px 增强素材池（全部帧） | 否 |
| `transparent_frames/frame_*.png` | Electron 实际加载的透明 PNG 帧（从素材池选取的循环片段） | 是 |
| `loop.json` | 帧数、帧间隔、循环段和质量元数据 | 是 |
| `raw_frames` | 抽帧中间产物，处理后默认删除 | 否 |
| `_replacement_work` | 替换视频时的临时工作目录 | 否 |

### processed_frames 与 transparent_frames 的关系

- `processed_frames`：素材池，存放从源视频生成的全部 256px 增强透明帧。
- `transparent_frames`：运行时帧，从素材池中选取的最佳循环片段或方向采样帧。Electron 应用只加载此目录。

对于使用完整帧范围的动作（`loopSelection: "full"`），`transparent_frames` 的内容与 `processed_frames` 一致。
对于选取循环段的动作，`transparent_frames` 只包含循环段内的帧。
对于方向采样动作（如 `tabby_look`），`transparent_frames` 包含 64 帧均匀采样方向帧。

## Manifest

当前 manifest：

- `dog_actions_manifest.json`
- `cat_actions_manifest.json`
- `shorthair_actions_manifest.json`
- `tabby_actions_manifest.json`
- `brit_actions_manifest.json`
- `bshmitted_actions_manifest.json`
- `van_actions_manifest.json`
- `pomeranian_actions_manifest.json`

manifest 记录动作视频、帧数、循环段和画质配置，可由资源处理脚本写入或更新。

## 常用命令

从项目根目录执行。

处理变体动作：

```powershell
python tools\process_pet_actions.py process --variant dog --actions squat walk feed ball --video path\to\source.mp4
```

处理方向采样动作（如 tabby_look）：

```powershell
python tools\process_pet_actions.py process --variant tabby --actions look --video path\to\look.mp4 --direction-count 64
```

替换单个动作视频：

```powershell
python tools\process_pet_actions.py replace --action dog_feed --video path\to\new.mp4 --manifest dog_actions_manifest.json
```

生成画质预览：

```powershell
python tools\build_quality_previews.py --actions dog_feed --clean
```

## 修改注意

- `electron-app/electron/pet-variants.cjs` 定义变体、动作顺序和打包资源列表。
- 打包脚本只复制运行需要的 `transparent_frames`、`loop.json` 和 manifest。
- `processed_frames` 和 `raw_frames` 已加入 `.gitignore`，不应提交到仓库。
- 替换资源后，先检查 `loop.json` 和 manifest，再启动应用确认动作播放、落地点和循环是否正常。
- 如果动作帧尺寸或命名规则变化，需要同步主进程资源加载、渲染层播放逻辑和测试。
