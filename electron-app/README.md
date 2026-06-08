# Electron App

本目录是 Desktop-Pet 当前正在使用的 Electron 桌面宠物应用。

## 运行和测试

开发运行：

```powershell
npm.cmd start
```

测试：

```powershell
npm.cmd test
```

## Windows 打包

便携版目录包：

```powershell
npm.cmd run package:win
```

安装包：

```powershell
npm.cmd run installer:win
```

准备运行资源：

```powershell
npm.cmd run prepare:runtime-assets
```

## 关键目录

| 路径 | 作用 | 常见修改场景 |
| --- | --- | --- |
| `electron` | 主进程、预加载桥、变体配置、行走时钟、Windows 窗口探测脚本 | 桌宠核心行为、IPC、窗口吸附、状态值、变体能力 |
| `static` | 宠物窗口、菜单、悬停面板、气泡的渲染入口 | UI、按钮、动作播放、样式 |
| `test` | Node 内置测试 | 变体配置、行走时钟和后续核心纯逻辑测试 |
| `build` | 图标和 NSIS 自定义脚本 | 安装包图标、自启动安装选项、卸载行为 |
| `.runtime-assets` | 运行资源临时目录 | 由脚本生成，已加入忽略规则，通常不要手工修改 |

## 关键文件

| 文件 | 作用 |
| --- | --- |
| `package.json` | npm scripts、Electron 入口和 electron-builder 配置 |
| `prepare-runtime-assets.ps1` | 复制指定宠物变体的运行帧和 `pet_variant.json` |
| `build-electron-win.ps1` | 手工组装 Windows 便携版目录包 |
| `build-installer-win.ps1` | 构建 Windows NSIS 安装包 |
| `package-lock.json` | npm 依赖锁文件，用于固定 Electron/electron-builder 等依赖版本 |

## 当前入口说明

当前 npm 入口是：

```json
"main": "electron/main.cjs"
```

当前打包脚本复制的是：

- `electron-app/electron`
- `electron-app/static`
- `electron-app/package.json`
- 指定变体的运行资源

`electron-app` 根目录下旧的同名入口文件已经清理。修改运行时行为时只进入 `electron` 和 `static` 目录。

## 宠物变体

脚本参数支持：

- `dog`
- `cat`
- `shorthair`

示例：

```powershell
powershell -ExecutionPolicy Bypass -File build-electron-win.ps1 -PetVariant cat
powershell -ExecutionPolicy Bypass -File build-installer-win.ps1 -PetVariant shorthair
powershell -ExecutionPolicy Bypass -File prepare-runtime-assets.ps1 -PetVariant dog -PetChannel release
```

变体能力和默认配置见 `electron/pet-variants.cjs`。

## 输出目录

| 目录 | 来源 | 说明 |
| --- | --- | --- |
| `release` | `build-electron-win.ps1 -PetVariant dog` | 狗狗便携版目录包 |
| `cat_release` | `build-electron-win.ps1 -PetVariant cat` | 猫咪便携版目录包 |
| `shorthair_release` | `build-electron-win.ps1 -PetVariant shorthair` | 英短便携版目录包 |
| `installer` | `build-installer-win.ps1 -PetVariant dog` | 狗狗安装包 |
| `cat_installer` | `build-installer-win.ps1 -PetVariant cat` | 猫咪安装包 |
| `shorthair_installer` | `build-installer-win.ps1 -PetVariant shorthair` | 英短安装包 |

这些目录是生成产物，除排查打包问题外，通常不作为源码修改入口。

安装包目录当前只保留最终安装向导 `.exe`：

- `installer/宠伴 1.1.exe`
- `cat_installer/宠伴 1.2.exe`
- `shorthair_installer/宠伴 1.0.exe`

`win-unpacked`、`.blockmap`、`builder-debug.yml` 是安装包构建过程中的中间/调试产物。当前 `build-installer-win.ps1` 会在构建结束后清理它们，交付时不需要携带。

## 修改注意

- 新增 IPC 时同步修改 `electron/preload.cjs`、`electron/main.cjs` 和 `static/renderer.js`。
- 新增宠物变体时同步修改 `electron/pet-variants.cjs`、资源目录、打包脚本和测试。
- 修改打包输出、应用名、图标或安装包行为时，同步检查 `package.json`、`build/*.nsh` 和根文档。
- 修改后按影响范围运行 `npm.cmd test` 或手动启动应用验证。

相关总览见 `../docs/PROJECT_MAP.md`、`../docs/ARCHITECTURE.md` 和 `../docs/AI_GUIDE.md`。
