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

Windows 打包脚本只能在 Windows 上执行；`PET_VARIANT` 本地启动调试不受打包平台限制。Windows 打包参数由变体元数据校验，不再在 PowerShell 脚本中硬编码变体列表。

查询可用变体：

```powershell
npm.cmd run variant:list
npm.cmd run variant:show -- --id pet2605
npm.cmd run variant:query -- --breed bsh
npm.cmd run variant:query -- --id pet2606
```

新增定制变体：

```powershell
npm.cmd run variant:new -- --breed lihua --date 2026-06-30
npm.cmd run variant:rename-assets -- --id pet2610 --from C:\path\to\source-videos
```

变体输入使用真实 id；`aliases` 是可选字符串字段，未填写时 CLI 显示 `-`。新增 custom 变体 id 使用 `pet<yy><seq>`，例如当前 2026 年已有 `pet2609` 时会生成 `pet2610`。现有变体保留旧动画资源前缀，新变体的动作目录和源视频会使用 `<id>_<action>`。

macOS 打包脚本使用 Node 参数：

```bash
npm run installer:mac -- --pet-variant=pet2604 --arch=arm64
npm run installer:mac -- --pet-variant=pet2604 --arch=x64
```

## 关键目录

| 路径 | 作用 |
| --- | --- |
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
| `scripts/variant-cli.cjs` | 查询/新增变体并复制重命名动作源视频 |

## 输出目录

| 类型 | 位置 |
| --- | --- |
| Windows 便携版 | `deliverables/<scope>/<id>/release` |
| Windows 安装向导 | `deliverables/<scope>/<id>/installer` |
| macOS DMG | `mac_installer/<variant>/<arch>` |

这些目录是生成产物。除排查打包问题外，不应作为源码修改入口。

## 修改注意

- 新增 IPC 时同步修改 `electron/main.cjs`、`electron/preload.cjs` 和 `static/renderer.js`。
- 新增宠物变体时优先使用 `npm.cmd run variant:new` 写入 `electron/pet-variant-metadata.json`，再补资源目录、测试和文档。
- 修改打包输出、应用名、图标或安装行为时，同步检查根 `README.md`、`docs/PROJECT_MAP.md` 和本文件。
- 修改后按影响范围运行 `npm.cmd test` 或手动启动应用验证。

相关总览见 `../docs/PROJECT_MAP.md` 和 `../docs/ARCHITECTURE.md`。
