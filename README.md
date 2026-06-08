# Desktop-Pet

Desktop-Pet 是一个基于 Electron 的桌面宠物项目，当前主应用位于 `electron-app`，运行资源位于 `assets/animations`，视频处理和资源替换脚本位于 `tools`。

项目当前重点是 Windows 桌面宠物体验：透明宠物窗口、动作播放、右键菜单、悬停状态面板、拖拽、贴靠窗口/任务栏行走、多宠物变体资源，以及 Windows 打包/安装包流程。

## 快速入口

| 场景 | 优先查看 |
| --- | --- |
| 理解项目整体结构 | `docs/PROJECT_MAP.md` |
| 让 AI 快速定位修改范围 | `docs/AI_GUIDE.md` |
| 理解 Electron 主流程 | `docs/ARCHITECTURE.md` |
| 修改文档同步规则 | `docs/MAINTENANCE.md` |
| 查看当前进度和风险点 | `docs/STATUS.md` |
| 开发或打包应用 | `electron-app/README.md` |
| 处理宠物动作资源 | `tools/README.md` 和 `assets/animations/README.md` |

## 目录概览

| 路径 | 作用 |
| --- | --- |
| `electron-app/electron` | Electron 主进程、预加载桥、宠物变体配置、行走时钟、Windows 窗口探测脚本 |
| `electron-app/static` | 宠物窗口、菜单窗口、悬停面板和气泡窗口共用的渲染入口 |
| `electron-app/test` | Node 内置测试，当前覆盖宠物变体配置和行走时钟 |
| `assets/animations` | 宠物动作源视频、透明运行帧、循环元数据和动作清单 |
| `tools` | 视频抽帧、绿幕抠像、动作替换、画质预览脚本 |
| `docs` | 面向维护者和 AI 的项目索引、架构、维护规则和状态文档 |

## 开发运行

```powershell
cd electron-app
npm.cmd start
```

## 测试

```powershell
cd electron-app
npm.cmd test
```

## Windows 打包

便携版目录包：

```powershell
cd electron-app
npm.cmd run package:win
```

NSIS 安装包：

```powershell
cd electron-app
npm.cmd run installer:win
```

打包脚本支持 `dog`、`cat`、`shorthair` 三个宠物变体。更多细节见 `electron-app/README.md`。

安装包目录当前只保留最终安装向导 `.exe`。`win-unpacked`、`.blockmap`、`builder-debug.yml`、`.tmp`、`.runtime-assets`、`quality_previews` 等均为可再生成产物或调试输出，不作为交付内容保留。

## 动作资源处理

批量处理默认狗狗动作：

```powershell
python tools\process_pet_videos.py --actions dog_ball dog_feed dog_squat dog_walk
```

替换单个动作视频：

```powershell
python tools\replace_action_video.py --action dog_feed --video path\to\new.mp4 --manifest dog_actions_manifest.json
```

资源目录规范见 `assets/README.md` 和 `assets/animations/README.md`。

## 文档维护约定

后续新增功能、优化功能或修复 bug 时，应优先按 `docs/AI_GUIDE.md` 定位相关文件；改动完成后同步更新对应目录 README 和 `docs` 下的索引文档。

如果修改了启动、打包、资源处理、目录结构、动作命名、宠物变体或测试入口，至少检查并更新：

- `README.md`
- `docs/PROJECT_MAP.md`
- `docs/AI_GUIDE.md`
- 相关目录下的 `README.md`
