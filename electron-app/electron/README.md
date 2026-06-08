# Electron Runtime

本目录包含 Electron 主进程和与系统能力相关的运行时代码，是桌宠行为的核心目录。

## 关键文件

| 文件 | 作用 | 常见修改场景 |
| --- | --- | --- |
| `main.cjs` | 主进程核心逻辑 | 窗口创建、动作状态、菜单、悬停面板、拖拽、贴靠、行走、状态值、自启动 |
| `preload.cjs` | 安全暴露 IPC API 给渲染层 | 新增或调整 `window.desktopPet` 方法 |
| `pet-variants.cjs` | 宠物变体、动作 ID、渠道配置 | 新增变体、调整默认缩放、开关自启动或窗口漫游 |
| `walk-clock.cjs` | 行走循环暂停/恢复计时 | 修改行走倒计时或暂停恢复规则 |
| `window-surfaces.ps1` | Windows 窗口候选列表探测 | 修复窗口贴靠/漫游候选问题 |
| `window-from-point.ps1` | 根据屏幕点查找窗口 | 修复拖拽吸附命中问题 |

## 主进程功能域

`main.cjs` 当前承载多个功能域，修改前建议用 `rg` 定位具体区域：

| 功能域 | 搜索词 |
| --- | --- |
| 应用生命周期 | `app.whenReady`、`before-quit`、`requestSingleInstanceLock` |
| IPC | `ipcMain.handle`、`ipcMain.on`、`pet:` |
| 宠物动作 | `states`、`setState`、`completeOneShotState` |
| 行走 | `advanceWalkStep`、`walkLoop`、`WALK_` |
| 拖拽 | `dragState`、`drag-start`、`drag-end` |
| 窗口贴靠 | `WINDOW_DOCK_`、`windowSurface`、`dockPetAfterDrag` |
| 窗口漫游 | `windowRoam` |
| 菜单 | `menuWindow`、`PET_MENU_` |
| 悬停面板 | `hoverWindow`、`HOVER_` |
| 气泡 | `startupBubble`、`bubble` |
| 状态值 | `petStats`、`fullness`、`health`、`intimacy` |
| 自启动 | `autoStart`、`WINDOWS_STARTUP_RUN_KEY` |

## IPC 修改流程

新增一个渲染层能力时，通常需要：

1. 在 `main.cjs` 中添加 `ipcMain.handle` 或 `ipcMain.on`。
2. 在 `preload.cjs` 中暴露 `window.desktopPet` 方法。
3. 在 `../static/renderer.js` 中调用该方法。
4. 如涉及 UI 状态，更新 `../static/styles.css`。
5. 更新 `../static/README.md` 和本文件。

## 变体修改流程

新增或修改宠物变体时，优先修改 `pet-variants.cjs`：

- `PET_VARIANT_PROFILES`
- `PET_CHANNEL_PROFILES`
- `getVariantAnimationFolders`
- `getVariantManifestName`

然后同步：

- `../../assets/animations` 下的资源目录和 manifest。
- `../prepare-runtime-assets.ps1`。
- `../build-electron-win.ps1`。
- `../build-installer-win.ps1`。
- `../test/pet-variants.test.cjs`。
- `../../docs/PROJECT_MAP.md` 和 `../../docs/AI_GUIDE.md`。

## 验证

核心纯逻辑修改后运行：

```powershell
cd electron-app
npm.cmd test
```

涉及窗口、拖拽、菜单、悬停面板、贴靠或自启动时，还需要手动启动应用验证：

```powershell
cd electron-app
npm.cmd start
```
