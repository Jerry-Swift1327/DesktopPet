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
| `tools` | 资源处理 Python 脚本 | 抽帧、抠像、保源画布归一化、稳定贴地、循环段选择、动作替换、画质预览 |
| `app_icon.ico` | Windows 应用图标源文件 | 更新应用图标 |

## Electron 应用

| 路径 | 作用 | 常见修改场景 |
| --- | --- | --- |
| `electron-app/package.json` | npm 脚本、Electron 入口和 electron-builder 配置 | 新增脚本、调整依赖或打包配置 |
| `electron-app/electron/main.cjs` | 主进程核心逻辑 | 窗口、菜单、悬停面板、状态值、拖拽、吸附、行走、自启动 |
| `electron-app/electron/preload.cjs` | 暴露安全 IPC API 给渲染层 | 新增渲染层调用主进程能力 |
| `electron-app/electron/pet-variant-metadata.json` | V2 宠物变体元数据（id、species、tier、notes、scope、actions、features） | 新增定制变体、调整套餐、平台或资源前缀 |
| `electron-app/electron/pet-catalog.cjs` | 动作池、功能池、tier profile 和 notes pool | 新增动作 ID、功能开关（如 `windowDocking`）、套餐默认值或 notes 规则 |
| `electron-app/electron/pet-variants.cjs` | 将 V2 元数据和 catalog 展开为运行时配置、动作 ID、渠道配置和打包 profile | 调整派生规则、动作顺序、feature 平台 gating 或打包输出 |
| `electron-app/scripts/variant-cli.cjs` | 查询/新增/bootstrap 变体，按 species/tier/date/scope 筛选，资源检查，维护预览/应用纯函数，生成本地图鉴 | 新增变体流程、维护中心能力或 CLI 能力 |
| `electron-app/devtools/` | 内部 Electron 开发者工具窗口，用于新增宠物、宠物库查询/检查/图鉴、替换或批量导入动作资源、编辑元数据和删除测试宠物 | 维护内部宠物向导、维护中心、预览执行流程或工具窗口文档 |
| `electron-app/electron/walk-clock.cjs` | 行走循环暂停/恢复计时 | 修改行走倒计时或暂停恢复规则 |
| `electron-app/electron/window-surfaces.ps1` | Windows 可贴靠窗口候选探测 | 修复窗口贴靠或漫游候选问题 |
| `electron-app/electron/window-from-point.ps1` | 根据屏幕点查找窗口 | 修复拖拽吸附命中问题 |
| `electron-app/electron/core/` | 主进程基础模块（常量、日志、运行时配置、偏好存储） | 新增应用级常量、调整日志格式、修改变体配置读取或偏好读写 |
| `electron-app/electron/pet/` | 宠物状态定义和资源加载 | 调整宠物状态机、帧列表加载或资源根路径 |
| `electron-app/electron/shared/` | 共享工具（几何函数、消息广播） | 修改几何计算或跨窗口消息发送逻辑 |
| `electron-app/electron/windows/` | 窗口创建和控制器（overlay 公共创建、定位几何、菜单/悬停/气泡/自定义面板控制器） | 调整 overlay 窗口创建选项、定位计算或各窗口控制器的显示/隐藏/可见性逻辑 |
| `electron-app/electron/behavior/` | 行为控制器（行走、贴靠、窗口漫游、眼球追踪） | 调整行走步进、贴靠回退、漫游目标选取或眼球追踪轮询 |
| `electron-app/electron/platform/` | 平台能力（开机自启、窗口候选探测、屏幕度量） | 修改注册表读写、PowerShell 窗口枚举或任务栏/显示器度量 |
| `electron-app/electron/ipc/` | IPC 注册模块（集中注册 ipcMain.handle/on） | 新增 IPC channel、调整 IPC 注册方式 |
| `electron-app/static/index.html` | 渲染窗口 HTML 入口，按顺序加载 renderer/ 下各模块 | 页面加载入口变化 |
| `electron-app/static/renderer.js` | 渲染层轻入口，按 hash 分发到对应渲染模块 | 调整渲染模式分发逻辑 |
| `electron-app/static/renderer/` | 渲染层模块（公共工具、宠物/菜单/悬停/气泡/定制面板渲染） | 调整各渲染模式的 UI 行为、动画播放、IPC 调用 |
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
| `electron-app/scripts/prune-packaged-runtime.cjs` | 精简 Windows Electron 运行时产物，默认只保留 `locales/zh-CN.pak` |

常用 npm 命令：

```powershell
cd electron-app
npm.cmd start
npm.cmd test
npm.cmd run package:win
npm.cmd run installer:win
npm.cmd run pack:win
npm.cmd run variant:list
npm.cmd run variant:bootstrap -- --scope custom --species cat --tier basic --date 2026-07-06 --source C:\path\to\source-videos
```

## 宠物变体和资源

| 变体 | species | tier | 范围 | 平台 | 动作 |
| --- | --- | --- | --- | --- | --- |
| `pet2601` | dog | basic | internal | Windows、macOS | `squat`、`walk`、`feed`、`ball` |
| `pet2602` | cat | basic | internal | Windows、macOS | `squat`、`walk`、`feed`、`ball` |
| `pet2603` | cat | basic | custom | Windows | `squat`、`walk`、`feed`、`ball` |
| `pet2604` | dog | basic | custom | macOS | `squat`、`walk`、`feed`、`ball` |
| `pet2605` | cat | advanced | custom | Windows | `squat`、`walk`、`feed`、`ball`、`lie`、`lick`、`belly`、`stretch`，额外资源 `look`、`shake`、`yawn`、`sleep`、`hiss` |
| `pet2606` | cat | basic | custom | Windows | `squat`、`walk`、`feed`、`ball` |
| `pet2607` | cat | basic | custom | Windows | `squat`、`walk`、`feed`、`ball` |
| `pet2608` | cat | basic | custom | Windows | `squat`、`walk`、`feed`、`ball` |
| `pet2609` | cat | advanced | internal | Windows | `squat`、`walk`、`feed`、`ball`、`spin`、`lick`、`stretch`、`splits`，额外资源 `yawn`、`hiss` |
| `pet2610` | cat | advanced | custom | Windows | `squat`、`walk`、`feed`、`ball`，额外资源 `shake`、`yawn` |

资源目录命名为 `assets/animations/<variant>_<action>`，运行时主要使用：

- `transparent_frames/frame_*.png`
- `loop.json`
- `<variant>_actions_manifest.json`

新增 custom 变体推荐通过 `variant:bootstrap` 生成 `pet<yy><seq>` ID 并接入资源，Windows 产物路径派生为 `deliverables/<scope>/<id>/<channel>`。测试变体使用独立的 `pettest<seq>` ID 和 `scope: "test"`，不参与正式 `pet<yy><seq>` 序列；删除测试宠物应走 devtools/variant-cli 的预览与白名单清理流程。需要让运行帧使用完整素材池范围时，可给 bootstrap 追加 `--use-full-range`，或在 devtools 中为每个动作单独选择完整帧、自动选取或手动范围。变体只按真实 id 解析，不再使用 aliases。

## 工具脚本

| 文件 | 作用 |
| --- | --- |
| `tools/process_pet_actions.py` | 统一资源处理 CLI 入口：抽帧、抠像、保源画布 256px 增强、稳定贴地、循环选取、方向采样和几何审计 |
| `tools/pet_actions/` | 资源处理 Python 包，按职责拆分到子模块（ffmpeg、files、chroma 归一化与稳定贴地、frames、loops、manifest、audit） |
| `tools/build_quality_previews.py` | 生成当前/候选/对比预览视频 |
| `tools/process_pet_videos.py` | （已弃用）旧版批量处理脚本，功能已合并到 `process_pet_actions.py` |
| `tools/replace_action_video.py` | （已弃用）旧版替换单个动作脚本，功能已合并到 `process_pet_actions.py` |
| `electron-app/scripts/variant-cli.cjs` | 变体元数据查询、新建/bootstrap、资源检查、动作源视频复制重命名和本地图鉴生成 |

## 生成产物和本地目录

以下目录通常不作为源码修改入口，并已通过 `.gitignore` 忽略：

- `electron-app/node_modules`
- `electron-app/.runtime-assets`
- `electron-app/.npm-cache*`
- `electron-app/.electron-builder-cache`
- `electron-app/.mac-builder-cache`
- `electron-app/.devtools-staging`
- `electron-app/.variant-gallery`
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
- `tools/pet_actions/__pycache__`
- `assets/animations/*/_replacement_work`
- `assets/animations/*/processed_frames`
- `assets/animations/*/raw_frames`
