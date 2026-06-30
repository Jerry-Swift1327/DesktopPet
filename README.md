# Desktop-Pet

Desktop-Pet 是一个基于 Electron 的桌面宠物应用。项目包含透明桌宠窗口、动作播放、右键菜单、悬停状态面板、拖拽移动、窗口贴靠/任务栏行走、多宠物变体资源，以及 Windows 和 macOS 打包脚本。

当前应用主体位于 `electron-app`，宠物动画资源位于 `assets/animations`，资源处理脚本位于 `tools`。

## 功能特性

- 透明桌宠窗口和 PNG 帧动画播放。
- 右键快捷菜单、悬停状态面板和提示气泡。
- 拖拽移动、滚轮缩放、任务栏行走和 Windows 窗口贴靠。
- 亲密度、饱食度、健康值等本地状态。
- 多宠物变体资源：`pet2601`、`pet2602`、`pet2603`、`pet2604`、`pet2605`、`pet2606`、`pet2607`、`pet2608`、`pet2609`，新增定制变体使用 `pet<yy><seq>` ID。
- Windows 便携版目录包、Windows NSIS 安装向导和 macOS DMG 打包脚本。
- 视频抽帧、绿幕抠像、动作替换和画质预览工具。

## 技术栈

- Electron
- Node.js / npm
- electron-builder
- PowerShell 打包脚本
- Python 资源处理脚本
- ffmpeg、Pillow、numpy，用于处理动作资源

## 环境要求

- Node.js 和 npm。
- Windows 开发或打包时建议使用 PowerShell，并在命令中使用 `npm.cmd`。
- macOS DMG 必须在 macOS 上生成。
- 只运行应用不需要 Python；处理动作资源时需要 Python、`Pillow`、`numpy` 和 `ffmpeg`。

## 安装依赖

```powershell
cd electron-app
npm.cmd install
```

依赖目录 `electron-app/node_modules` 是本机生成内容，不应提交。

## 本地运行

```powershell
cd electron-app
npm.cmd start
```

## 测试

```powershell
cd electron-app
npm.cmd test
```

## 打包

Windows 便携版目录包：

```powershell
cd electron-app
npm.cmd run package:win
```

Windows NSIS 安装向导：

```powershell
cd electron-app
npm.cmd run installer:win
```

Electron Builder Windows 目录包：

```powershell
cd electron-app
npm.cmd run pack:win
```

macOS DMG，在 macOS 终端执行：

```bash
cd electron-app
npm install
npm run installer:mac -- --pet-variant=pet2604
```

Windows 打包脚本只能在 Windows 上执行，可通过 `-PetVariant` 指定任一支持 Windows 的变体 ID。可用变体可通过 `cd electron-app; npm.cmd run variant:list` 查询。`PET_VARIANT` 本地启动调试不受打包平台限制。macOS 打包说明见 `docs/MAC_BUILD.md`。

## 变体管理

新增定制变体时先选择精简品种名，再由 CLI 按同年日期顺序生成 `pet<yy><seq>` ID。`aliases` 是可选字符串；为空时 CLI 显示 `-`：

```powershell
cd electron-app
npm.cmd run variant:new -- --breed lihua --date 2026-06-30
npm.cmd run variant:rename-assets -- --id pet2610 --from C:\path\to\source-videos
```

现有变体只迁移元数据 ID，运行资源仍保留原动画前缀；新增变体使用 `pet<yy><seq>_<action>` 作为动作目录和源视频前缀。Windows 打包路径为 `<scope>/<id>/<channel>`。

## 安装和产物

Windows 安装向导生成后，双击输出目录中的 `.exe` 并按向导安装。便携版目录包可直接运行生成目录中的应用程序。

常见输出目录：

| 类型 | 位置 |
| --- | --- |
| Windows 便携版 | `electron-app/deliverables/<scope>/<id>/release` |
| Windows 安装向导 | `electron-app/deliverables/<scope>/<id>/installer` |
| macOS DMG | `electron-app/mac_installer/<variant>/<arch>` |

这些目录都是可再生成产物，已在 `.gitignore` 中忽略。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `electron-app` | Electron 应用、npm scripts、打包脚本和测试 |
| `electron-app/electron` | 主进程、预加载桥、宠物变体配置、行走计时和系统能力脚本 |
| `electron-app/scripts` | 变体元数据查询、新建和资源重命名 CLI |
| `electron-app/static` | 宠物窗口、快捷菜单、悬停面板和气泡的渲染层 |
| `electron-app/test` | Node 内置测试 |
| `assets` | 宠物动作资源 |
| `tools` | 动作资源处理和画质预览脚本 |
| `docs` | 面向贡献者的架构、目录和打包说明 |

## 资源处理

批量处理动作视频：

```powershell
python tools\process_pet_actions.py process --variant dog --actions squat walk feed ball
```

替换单个动作视频：

```powershell
python tools\process_pet_actions.py replace --action dog_feed --video path\to\new.mp4 --manifest dog_actions_manifest.json
```

更多说明见 `tools/README.md` 和 `assets/animations/README.md`。

## 文档

| 文档 | 内容 |
| --- | --- |
| `docs/PROJECT_MAP.md` | 项目目录和关键文件说明 |
| `docs/ARCHITECTURE.md` | Electron 运行链路、IPC、资源加载和状态数据 |
| `docs/MAINTENANCE.md` | 公开文档和目录 README 的维护规则 |
| `docs/MAC_BUILD.md` | macOS 打包和 DMG 生成说明 |

## 贡献说明

- 修改前先阅读对应目录的 README 和相关脚本说明。
- 修改启动、打包、资源、目录结构或测试入口时，同步更新相关文档。
- 不提交依赖目录、缓存、日志、用户数据、构建目录或安装包。
- 提交前至少运行 `cd electron-app; npm.cmd test`。

## 许可证

当前仓库尚未包含许可证文件。正式开源发布前请补充 `LICENSE`，并在本节说明许可证类型。
