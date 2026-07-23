# Electron App

本目录包含 Desktop-Pet 的 Electron 应用、测试和打包脚本。

## 运行

安装依赖：

```powershell
npm.cmd install
```

开发运行：

```powershell
npm.cmd start
```

测试：

```powershell
npm.cmd test
```

PowerShell 下建议使用 `npm.cmd`，避免 `npm.ps1` 被执行策略拦截。

## 打包命令

Windows 便携版目录包：

```powershell
npm.cmd run package:win
```

Windows NSIS 安装向导：

```powershell
npm.cmd run installer:win
```

electron-builder Windows 目录包：

```powershell
npm.cmd run pack:win
```

macOS DMG，在 macOS 上执行：

```bash
npm run installer:mac -- --pet-variant=pet2604
```

## 变体参数

Windows 打包脚本支持：

```powershell
powershell -ExecutionPolicy Bypass -File build-electron-win.ps1 -PetVariant pet2605
powershell -ExecutionPolicy Bypass -File build-installer-win.ps1 -PetVariant pet2606
```

Windows 打包脚本只能在 Windows 上执行；`PET_VARIANT` 本地启动调试不受打包平台限制。Windows 打包参数由变体元数据校验，不再在 PowerShell 脚本中硬编码变体列表。Windows 产物会在打包后只保留 Electron `locales/zh-CN.pak`，其他 Electron locale 文件会从生成产物中移除以降低体积。

查询可用变体：

```powershell
npm.cmd run variant:list
npm.cmd run variant:show -- --id pet2605
npm.cmd run variant:query -- --species cat
npm.cmd run variant:query -- --id pet2606
npm.cmd run variant:species
```

新增定制变体推荐使用 bootstrap，默认 dry-run，追加 `--apply` 后才写入元数据、复制视频并调用资源处理脚本：

```powershell
npm.cmd run variant:bootstrap -- --scope custom --species cat --date 2026-07-06 --source C:\path\to\source-videos
npm.cmd run variant:bootstrap -- --scope custom --species cat --date 2026-07-06 --source C:\path\to\source-videos --apply
```

变体输入只使用真实 id，不再解析 aliases。`scope` 会生成默认 `notes`，internal 版本号按当前最大值递增，custom 默认 `1.0`。所有动作来自统一注册表，变体通过 `actions.enabled` 选择动作；现有变体保留旧动画资源前缀并通过 `assetPrefix` 读取，新变体的动作目录和源视频默认使用 `<id>_<action>`。

macOS 打包脚本使用 Node 参数：

```bash
npm run installer:mac -- --pet-variant=pet2604 --arch=arm64
npm run installer:mac -- --pet-variant=pet2604 --arch=x64
```

## Internal Devtools

从应用工作区启动内部开发者窗口：

```powershell
npm.cmd run devtools
```

Devtools 支持新增宠物、宠物库、维护宠物、运行与打包和删除测试宠物；维护页可替换动作资源、从目录内标准视频补建 `processed_frames` 素材池、按 Start/End 范围或复选框重选运行帧，以及维护普通 yawn 的末帧休眠状态。“运行与打包”可按变体和渠道启动开发态宠物，或执行 Windows 便携版/安装版打包；打包成功后可直接打开产物目录。方向采样和专属尾段循环动作保持只读。Devtools 源码位于 `devtools/`，不包含在正常交付包中。

## 关键目录

| 路径 | 作用 |
| --- | --- |
| `devtools` | 内部维护工具窗口，用于新增、查询、检查、维护、运行、打包和删除测试宠物，不进入正常交付包 |
| `electron` | 主进程、预加载桥、变体配置、行走计时和 Windows 窗口探测脚本 |
| `scripts` | 变体元数据查询、新建和资源重命名 CLI |
| `static` | 宠物窗口、快捷菜单、悬停面板和气泡的渲染入口 |
| `test` | Node 内置测试 |
| `build` | 图标和 NSIS 自定义脚本 |
| `.runtime-assets` | 打包前生成的运行资源目录，已忽略 |

## 关键文件

| 文件 | 作用 |
| --- | --- |
| `package.json` | npm scripts、Electron 入口和 electron-builder 配置 |
| `package-lock.json` | npm 依赖锁文件 |
| `prepare-runtime-assets.cjs` | 复制指定宠物变体的运行资源 |
| `prepare-runtime-assets.ps1` | PowerShell 包装入口 |
| `build-electron-win.ps1` | 组装 Windows 便携版目录包 |
| `build-installer-win.ps1` | 构建 Windows NSIS 安装向导 |
| `build-installer-mac.cjs` | 构建 macOS `.app` 和 `.dmg` |
| `scripts/prune-packaged-runtime.cjs` | 精简 Windows 产物中的 Electron 运行时语言包 |
| `scripts/variant-cli.cjs` | 查询/新增宠物变体、bootstrap、资源检查、复制重命名动作源视频和生成本地图鉴 |

## 输出目录

| 类型 | 位置 |
| --- | --- |
| Windows 便携版 | `deliverables/<scope>/<id>/release` |
| Windows 安装向导 | `deliverables/<scope>/<id>/installer` |
| macOS DMG | `mac_installer/<variant>/<arch>` |

这些目录是生成产物。除排查打包问题外，不应作为源码修改入口。

## 修改注意

- 新增 IPC 时同步修改 `electron/main.cjs`、`electron/preload.cjs` 和 `static/renderer.js`。
- 新增宠物变体时优先使用 `npm.cmd run variant:bootstrap`，让元数据、资源处理、manifest、图鉴和资源预检走同一入口。
- 修改打包输出、应用名、图标或安装行为时，同步检查根 `README.md`、`docs/PROJECT_MAP.md` 和本文件。
- 修改后按影响范围运行 `npm.cmd test` 或手动启动应用验证。

相关总览见 `../docs/PROJECT_MAP.md` 和 `../docs/ARCHITECTURE.md`。
