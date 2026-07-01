# Animations

本目录存放桌宠动作资源。每个动作目录使用 `<variant>_<action>` 命名，manifest 使用 `<variant>_actions_manifest.json` 命名。现有变体保留旧动画前缀；新增定制变体的 `<variant>` 使用 `pet<yy><seq>`，例如 `pet2610`。

## 变体和动作

| 变体 | 动作目录 |
| --- | --- |
| `dog` | `dog_squat`、`dog_walk`、`dog_feed`、`dog_ball` |
| `cat` | `cat_squat`、`cat_walk`、`cat_feed`、`cat_ball` |
| `shorthair` | `shorthair_squat`、`shorthair_walk`、`shorthair_feed`、`shorthair_ball` |
| `tabby` | 中华狸花猫历史 ID：`tabby_squat`、`tabby_walk`、`tabby_feed`、`tabby_ball`、`tabby_lie`、`tabby_lick`、`tabby_belly`、`tabby_stretch`、`tabby_look`、`tabby_shake`、`tabby_yawn`、`tabby_sleep`、`tabby_hiss` |
| `ragdoll` | `ragdoll_squat`、`ragdoll_walk`、`ragdoll_feed`、`ragdoll_ball`、`ragdoll_spin`、`ragdoll_lick`、`ragdoll_stretch`、`ragdoll_belly`、`ragdoll_shake`、`ragdoll_yawn`、`ragdoll_hiss` |
| `brit` | `brit_squat`、`brit_walk`、`brit_feed`、`brit_ball` |
| `bshmitted` | `bshmitted_squat`、`bshmitted_walk`、`bshmitted_feed`、`bshmitted_ball` |
| `van` | `van_squat`、`van_walk`、`van_feed`、`van_ball` |
| `pomeranian` | `pomeranian_squat`、`pomeranian_walk`、`pomeranian_feed`、`pomeranian_ball` |
| `pet2610` | `pet2610_squat`、`pet2610_walk`、`pet2610_feed`、`pet2610_ball`、`pet2610_shake`、`pet2610_yawn` |

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

- `processed_frames`：本机处理时的最终素材池，存放从源视频生成并完成裁剪、贴地、底部 alpha 清理或参考动作对齐后的全部 256px 增强透明帧。
- `transparent_frames`：跨机器同步的最终运行帧，从素材池中选取的最佳循环片段或方向采样帧。Electron 应用只加载此目录。

对于使用完整帧范围的动作（`loopSelection: "full"`），`transparent_frames` 的内容与 `processed_frames` 一致。
对于选取循环段的动作，`transparent_frames` 只包含循环段内的帧。
对于方向采样动作（如 `tabby_look`），`transparent_frames` 包含 64 帧均匀采样方向帧。

`processed_frames` 和源视频用于本机维护，不提交到 Git；`transparent_frames`、`loop.json` 和 manifest 需要提交以保证跨机器运行一致。修复资源时应先通过处理脚本修正素材池生成结果，再导出运行帧，避免只改运行帧导致下次重新导出时丢失修复。

新加入变体或动作时，优先在素材池生成阶段检查动作级画布居中：如果主体整体偏左或偏右，可使用 `--center-visible-action-x` 对该动作全部素材池帧应用同一个 X 平移，使中位可见中心靠近 256px 画布中心。不要逐帧单独居中，否则会抵消走路、扑球、转身等动作本身的自然位移。近蹲坐动作可在 squat 自身构图正确后，再使用 `--align-reference-center-x --align-reference-bottom` 对齐到同变体 squat。

对亮白或低饱和毛色的变体，处理脚本会自动执行 alpha 稳定化，减少主体内部透明针孔和低透明裂纹。新增或替换此类资源后，建议使用 `process_pet_actions.py audit` 检查 `interiorAlphaHoles` 和 `denseLowAlphaCracks` 指标，再抽查 `processed_frames` 与 `transparent_frames` 的关键帧。

## Manifest

当前 manifest：

- `dog_actions_manifest.json`
- `cat_actions_manifest.json`
- `shorthair_actions_manifest.json`
- `tabby_actions_manifest.json`
- `ragdoll_actions_manifest.json`
- `brit_actions_manifest.json`
- `bshmitted_actions_manifest.json`
- `van_actions_manifest.json`
- `pomeranian_actions_manifest.json`
- `pet2610_actions_manifest.json`

manifest 记录动作视频、帧数、循环段和画质配置，可由资源处理脚本写入或更新。

## 常用命令

从项目根目录执行。

处理变体动作：

```powershell
python tools\process_pet_actions.py process --variant dog --actions squat walk feed ball --video path\to\source.mp4
```

新增定制变体时，先通过 `electron-app` 下的变体 CLI 生成 ID 并复制源视频：

```powershell
cd electron-app
npm.cmd run variant:new -- --breed lihua --date 2026-06-30
npm.cmd run variant:rename-assets -- --id pet2610 --from C:\path\to\source-videos
```

处理方向采样动作（如 tabby_look）：

```powershell
python tools\process_pet_actions.py process --variant tabby --actions look --video path\to\look.mp4 --direction-count 64
```

替换单个动作视频：

```powershell
python tools\process_pet_actions.py replace --action dog_feed --video path\to\new.mp4 --manifest dog_actions_manifest.json
```

审计当前动作几何：

```powershell
python tools\process_pet_actions.py audit --output .tmp\pet-action-audit.json --top 25
```

生成画质预览：

```powershell
python tools\build_quality_previews.py --actions dog_feed --clean
```

## 修改注意

- `electron-app/electron/pet-variant-metadata.json` 维护精简变体元数据，`electron-app/electron/pet-variants.cjs` 展开动作顺序和打包资源列表。
- 打包脚本只复制运行需要的 `transparent_frames`、`loop.json` 和 manifest。
- `processed_frames` 和 `raw_frames` 已加入 `.gitignore`，不应提交到仓库。
- 底部低透明 alpha、动作级画布偏心、动作偏移或缩放突变应优先在素材池生成阶段处理，再重新导出 `transparent_frames`。
- 替换资源后，先检查 `loop.json` 和 manifest，再启动应用确认动作播放、落地点和循环是否正常。
- 如果动作帧尺寸或命名规则变化，需要同步主进程资源加载、渲染层播放逻辑和测试。
