# Project Map

本文档帮助贡献者按目录定位代码、脚本和资源。修改前请先阅读目标目录的 README，再打开具体源码或脚本。

## 顶层结构

| 路径 | 作用 | 常见修改场景 |
| --- | --- | --- |
| `README.md` | 项目介绍、运行、测试、打包和贡献说明 | 项目入口、安装命令、打包方式变化 |
| `AGENTS.md` | 自动化协作者操作规则 | 协作规则、验证要求、提交信息要求变化 |
| `docs` | 架构、目录、文档维护和 macOS 打包说明 | 文档结构、架构说明、平台打包说明变化 |
| `electron-app` | Electron 桌面宠物应用主体 | 主进程、渲染层、测试、打包和安装包 |
| `assets` | 宠物动画资源 | 新增变体、动作或替换动作素材 |
| `tools` | 资源处理 Python 脚本 | 抽帧、抠像、循环段选择、动作替换、画质预览 |
| `app_icon.ico` | Windows 应用图标源文件 | 更新应用图标 |

## Electron 应用

| 路径 | 作用 | 常见修改场景 |
| --- | --- | --- |
| `electron-app/package.json` | npm 脚本、Electron 入口和 electron-builder 配置 | 新增脚本、调整依赖或打包配置 |
| `electron-app/electron/main.cjs` | 主进程核心逻辑 | 窗口、菜单、悬停面板、状态值、拖拽、吸附、行走、自启动 |
| `electron-app/electron/preload.cjs` | 暴露安全 IPC API 给渲染层 | 新增渲染层调用主进程能力 |
| `electron-app/electron/pet-variants.cjs` | 宠物变体、动作 ID、渠道配置和打包 profile | 新增变体、调整动作顺序、修改打包输出 |
| `electron-app/electron/walk-clock.cjs` | 行走循环暂停/恢复计时 | 修改行走倒计时或暂停恢复规则 |
| `electron-app/electron/window-surfaces.ps1` | Windows 可贴靠窗口候选探测 | 修复窗口贴靠或漫游候选问题 |
| `electron-app/electron/window-from-point.ps1` | 根据屏幕点查找窗口 | 修复拖拽吸附命中问题 |
| `electron-app/static/index.html` | 渲染窗口 HTML 入口 | 页面加载入口变化 |
| `electron-app/static/renderer.js` | 宠物、菜单、悬停面板、气泡窗口渲染逻辑 | UI 行为、按钮、动画播放、IPC 调用 |
| `electron-app/static/styles.css` | 渲染层样式 | 宠物窗口、菜单、悬停面板和气泡视觉调整 |
| `electron-app/test` | Node 内置测试 | 修改变体配置、行走时钟或新增纯逻辑后补测试 |

## 运行和打包脚本

| 文件 | 作用 |
| --- | --- |
| `electron-app/prepare-runtime-assets.cjs` | 将指定变体资源复制到 `.runtime-assets`，供 electron-builder 使用 |
| `electron-app/prepare-runtime-assets.ps1` | PowerShell 包装脚本 |
| `electron-app/build-electron-win.ps1` | 在 Windows 上组装 Windows 便携版目录包 |
| `electron-app/build-installer-win.ps1` | 在 Windows 上构建 Windows NSIS 安装向导 |
| `electron-app/build-installer-mac.cjs` | 在 macOS 上构建 `.app` 和 `.dmg` |

常用 npm 命令：

```powershell
cd electron-app
npm.cmd start
npm.cmd test
npm.cmd run package:win
npm.cmd run installer:win
npm.cmd run pack:win
```

## 宠物变体和资源

| 变体 | 平台 | 动作 |
| --- | --- | --- |
| `dog` | Windows、macOS | `squat`、`walk`、`feed`、`ball` |
| `cat` | Windows、macOS | `squat`、`walk`、`feed`、`ball` |
| `shorthair` | Windows | `squat`、`walk`、`feed`、`ball` |
| `tabby` | Windows | `squat`、`walk`、`feed`、`ball`、`lie`、`lick`、`belly`、`stretch`，额外资源 `look`、`shake`、`yawn`、`hiss`、`sleep` |
| `brit` | Windows | `squat`、`walk`、`feed`、`ball` |
| `bshmitted` | Windows | `squat`、`walk`、`feed`、`ball` |
| `van` | Windows | `squat`、`walk`、`feed`、`ball` |
| `pomeranian` | macOS | `squat`、`walk`、`feed`、`ball` |

资源目录命名为 `assets/animations/<variant>_<action>`，运行时主要使用：

- `transparent_frames/frame_*.png`
- `loop.json`
- `<variant>_actions_manifest.json`

## 工具脚本

| 文件 | 作用 |
| --- | --- |
| `tools/process_pet_actions.py` | 统一资源处理脚本：抽帧、抠像、增强、循环选取、方向采样 |
| `tools/build_quality_previews.py` | 生成当前/候选/对比预览视频 |
| `tools/process_pet_videos.py` | （已弃用）旧版批量处理脚本，功能已合并到 `process_pet_actions.py` |
| `tools/replace_action_video.py` | （已弃用）旧版替换单个动作脚本，功能已合并到 `process_pet_actions.py` |

## 生成产物和本地目录

以下目录通常不作为源码修改入口，并已通过 `.gitignore` 忽略：

- `electron-app/node_modules`
- `electron-app/.runtime-assets`
- `electron-app/.npm-cache*`
- `electron-app/.electron-builder-cache`
- `electron-app/.mac-builder-cache`
- `electron-app/.tmp`
- `electron-app/.user-data`
- `electron-app/deliverables`
- `electron-app/mac_installer`
- `electron-app/release`
- `electron-app/cat_release`
- `electron-app/shorthair_release`
- `electron-app/installer`
- `electron-app/cat_installer`
- `electron-app/shorthair_installer`
- `quality_previews`
- `tools/__pycache__`
- `assets/animations/*/_replacement_work`
- `assets/animations/*/processed_frames`
- `assets/animations/*/raw_frames`
