# Animations

本目录存放桌宠动作资源。每个动作目录使用 `<variant>_<action>` 命名，manifest 使用 `<variant>_actions_manifest.json` 命名。

## 变体和动作

| 变体 | 动作目录 |
| --- | --- |
| `dog` | `dog_squat`、`dog_walk`、`dog_feed`、`dog_ball` |
| `cat` | `cat_squat`、`cat_walk`、`cat_feed`、`cat_ball` |
| `shorthair` | `shorthair_squat`、`shorthair_walk`、`shorthair_feed`、`shorthair_ball` |
| `tabby` | `tabby_squat`、`tabby_walk`、`tabby_feed`、`tabby_ball`、`tabby_lie`、`tabby_lick`、`tabby_belly`、`tabby_stretch`、`tabby_look` |
| `brit` | `brit_squat`、`brit_walk`、`brit_feed`、`brit_ball` |
| `pomeranian` | `pomeranian_squat`、`pomeranian_walk`、`pomeranian_feed`、`pomeranian_ball` |

## 单个动作目录

| 路径 | 作用 | 运行时必需 |
| --- | --- | --- |
| `<action>.mp4` | 动作源视频 | 否 |
| `transparent_frames/frame_*.png` | Electron 实际加载的透明 PNG 帧 | 是 |
| `loop.json` | 帧数、帧间隔、循环段和质量元数据 | 是 |
| `raw_frames` | 抽帧中间产物 | 否 |
| `_replacement_work` | 替换视频时的临时工作目录 | 否 |

## Manifest

当前 manifest：

- `dog_actions_manifest.json`
- `cat_actions_manifest.json`
- `shorthair_actions_manifest.json`
- `tabby_actions_manifest.json`
- `brit_actions_manifest.json`
- `pomeranian_actions_manifest.json`

manifest 记录动作视频、帧数、循环段和画质配置，可由资源处理脚本写入或更新。

## 常用命令

从项目根目录执行。

重新处理一批动作：

```powershell
python tools\process_pet_videos.py --actions dog_ball dog_feed dog_squat dog_walk
```

替换单个动作视频：

```powershell
python tools\replace_action_video.py --action dog_feed --video path\to\new.mp4 --manifest dog_actions_manifest.json
```

生成画质预览：

```powershell
python tools\build_quality_previews.py --actions dog_feed --clean
```

## 修改注意

- `electron-app/electron/pet-variants.cjs` 定义变体、动作顺序和打包资源列表。
- 打包脚本只复制运行需要的 `transparent_frames`、`loop.json` 和 manifest。
- 替换资源后，先检查 `loop.json` 和 manifest，再启动应用确认动作播放、落地点和循环是否正常。
- 如果动作帧尺寸或命名规则变化，需要同步主进程资源加载、渲染层播放逻辑和测试。
