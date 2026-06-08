# Animations

本目录是桌宠动作资源目录。每个动作目录使用 `<variant>_<action>` 命名，当前支持三种宠物变体和四种动作。

## 变体和动作

当前变体：

- `dog`
- `cat`
- `shorthair`

当前动作：

- `squat`
- `walk`
- `feed`
- `ball`

目录示例：

```text
dog_squat
dog_walk
dog_feed
dog_ball
cat_squat
shorthair_walk
```

## 单个动作目录结构

| 路径 | 作用 | 是否运行时必需 |
| --- | --- | --- |
| `<action>.mp4` | 动作源视频 | 否 |
| `transparent_frames/frame_*.png` | Electron 实际加载的透明 PNG 帧 | 是 |
| `loop.json` | 帧数、帧间隔、循环段和质量元数据 | 是 |
| `raw_frames` | 抽帧中间产物 | 否 |
| `_replacement_work` | 替换视频时的临时工作目录 | 否 |

## Manifest

| 文件 | 作用 |
| --- | --- |
| `dog_actions_manifest.json` | 狗狗动作清单 |
| `cat_actions_manifest.json` | 猫咪动作清单 |
| `shorthair_actions_manifest.json` | 英短动作清单 |

manifest 由资源处理脚本写入或更新，用于记录动作视频、帧数、循环段和画质配置。

## 当前资源状态

| 动作目录 | 帧数 | 帧间隔 | 循环段 | 帧尺寸 | 质量配置 |
| --- | ---: | ---: | --- | ---: | --- |
| `dog_squat` | 92 | 30ms | `0..91` | 256 | `enhanced_2x_conservative` |
| `dog_walk` | 74 | 30ms | `0..73` | 256 | `enhanced_2x_conservative` |
| `dog_feed` | 104 | 30ms | `0..103` | 256 | `enhanced_2x_conservative` |
| `dog_ball` | 142 | 30ms | `0..141` | 256 | `enhanced_2x_conservative` |
| `cat_squat` | 167 | 30ms | `0..166` | 256 | `enhanced_2x_conservative` |
| `cat_walk` | 93 | 30ms | `0..92` | 256 | `enhanced_2x_conservative` |
| `cat_feed` | 98 | 30ms | `0..97` | 256 | `enhanced_2x_conservative` |
| `cat_ball` | 136 | 30ms | `0..135` | 256 | `enhanced_2x_conservative` |
| `shorthair_squat` | 111 | 30ms | `0..110` | 256 | `enhanced_2x_conservative` |
| `shorthair_walk` | 89 | 30ms | `0..88` | 256 | `enhanced_2x_conservative` |
| `shorthair_feed` | 82 | 30ms | `0..81` | 256 | `enhanced_2x_conservative` |
| `shorthair_ball` | 125 | 30ms | `0..124` | 256 | `enhanced_2x_conservative` |

## 常用命令

重新处理默认狗狗动作：

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

从项目根目录 `DesktopPetPackage` 执行上述命令。

## 修改注意

- `electron-app/electron/pet-variants.cjs` 定义变体和动作顺序。
- `electron-app/prepare-runtime-assets.ps1` 和 Windows 打包脚本会复制指定变体的四个动作目录。
- 替换资源后，先检查 `loop.json`，再启动应用确认动作播放、落地点和循环是否正常。
- 如果动作帧尺寸或命名规则变化，需要同步主进程资源加载、渲染层播放逻辑和测试。
