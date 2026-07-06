# Electron Runtime

本目录包含 Electron 主进程和系统能力相关代码，是桌宠行为的核心目录。

## 关键文件

| 文件 | 作用 |
| --- | --- |
| `main.cjs` | 主进程核心逻辑，负责菜单、拖拽、贴靠、行走、状态机薄包装、surface 缩放薄包装和自启动；宠物窗口对象已委托 `windows/pet-window-controller.cjs` |
| `preload.cjs` | 安全暴露 IPC API 给渲染层 |
| `pet-variant-metadata.json` | V2 宠物变体元数据 |
| `pet-catalog.cjs` | 动作池、功能池、tier profile 和 notes pool |
| `pet-variants.cjs` | 将 V2 元数据和 catalog 展开为动作 ID、渠道配置、运行时配置和打包 profile |
| `walk-clock.cjs` | 行走循环暂停/恢复计时 |
| `window-surfaces.ps1` | Windows 窗口候选列表探测 |
| `window-from-point.ps1` | 根据屏幕点查找窗口 |
| `core/app-constants.cjs` | 应用级常量定义，按功能域分组 |
| `core/logger.cjs` | 日志模块，提供文件日志和行走诊断日志 |
| `core/runtime-config.cjs` | 运行时配置，负责变体配置读取和用户数据目录定位 |
| `core/preferences-store.cjs` | 偏好存储，统一管理 autoStart/windowRoam/eyeTracking/scale 偏好 |
| `pet/pet-states.cjs` | 宠物状态定义，含 buildPetState 工厂和 sharedGreetings |
| `pet/asset-loader.cjs` | 宠物资源加载，含帧列表、元数据、图标路径 |
| `pet/pet-stats-rules.cjs` | pet stats 纯规则模块（clamp/normalize/daily decay/natural tick/action stats 规则），不依赖 electron/fs/Date.now/Math.random/中文文案 |
| `pet/pet-stats-store.cjs` | pet stats 读写边界模块（base64 编码/解码、文件读写、legacy fallback），工厂形式注入 fs/log |
| `pet/pet-stats-controller.cjs` | pet stats 控制器（持有 stats 状态、读写、自然衰减 timer、交互统计、动作结算、状态摘要），工厂形式注入 rules/store/回调/常量，不直接接触窗口/IPC/bubble |
| `pet/frame-geometry.cjs` | 宠物帧纯几何计算（spriteRect、visibleInsets、frameVisibleRect、stableGroundBottom、bottomAnchor、centerWindowX），不依赖 electron/fs/nativeImage/缓存 |
| `pet/frame-visible-bounds.cjs` | 帧可见区域 bitmap 扫描纯规则（scanVisibleBounds、scanHeadBounds），不依赖 electron/fs/nativeImage/缓存 |
| `pet/frame-bounds-controller.cjs` | 帧缓存与读图控制器（visible/head/pixel 缓存、nativeImage 读图、state bounds 合并），工厂形式注入 nativeImage/getState/listFramePaths/常量，不直接接触窗口/IPC/bubble |
| `pet/frame-hit-test.cjs` | 透明像素命中检测纯规则（point→imageX/imageY 镜像/缩放、alpha 半径扫描），不依赖 electron/fs/nativeImage/缓存/窗口/screen |
| `pet/pet-scale-rules.cjs` | pet scale 与 spriteSize 纯计算（clampPetScale、windowWidth/Height/SpriteSize、spriteLocalX、overlay/hover padding），不依赖 electron/fs/窗口/IPC/screen/bubble |
| `pet/surface-fit-rules.cjs` | surface-fit 纯规则（visibleTop/windowY、window 位置约束、scale 候选适配、visible edge/center 互推、taskbar/window walk center limits、safe window X），不依赖 electron/fs/窗口/IPC/screen/bubble |
| `pet/surface-scale-controller.cjs` | surface 缩放副作用编排控制器（petScale/preferredPetScale 运行态、surface 缩放适配、落地编排、overlay 锚点刷新、偏好持久化），工厂形式注入依赖，不直接接触窗口/IPC/bubble |
| `shared/bounds.cjs` | 纯几何工具函数，无副作用 |
| `shared/messaging.cjs` | 封装 webContents.send 安全发送和多窗口广播 |
| `windows/overlay-window.cjs` | overlay 窗口公共创建 helper，归纳 BrowserWindow 选项；overlay 默认不进任务栏，宠物主窗口可单独显示任务栏图标 |
| `windows/overlay-geometry.cjs` | overlay 定位几何，含菜单/悬停/自定义面板位置计算 |
| `windows/bubble-controller.cjs` | 气泡窗口控制器（创建、显示、隐藏、定位） |
| `windows/menu-controller.cjs` | 菜单窗口控制器（创建、显示、隐藏、定位、可见性） |
| `windows/hover-controller.cjs` | 悬停面板控制器（创建、显示、隐藏、轮询、可见性） |
| `windows/customization-controller.cjs` | 自定义面板控制器（创建、显示、隐藏、定位） |
| `behavior/walk-controller.cjs` | 行走控制器（行走循环、步进、任务栏跑道） |
| `behavior/dock-controller.cjs` | 贴靠控制器（拖拽后贴靠、窗口表面轮询、回退） |
| `behavior/drag-controller.cjs` | 拖拽控制器（拖拽运行态、拖拽开始/更新/结束流程），工厂形式注入依赖，持有 dragTimer/dragState/lastDragSample，不直接接触窗口/IPC/bubble |
| `behavior/state-controller.cjs` | 状态控制器（状态切换、one-shot 动作结算、起点复位、静默归位），工厂形式注入依赖，持有 pendingActionStatsState，不直接接触窗口/IPC/bubble |
| `behavior/window-roam-controller.cjs` | 窗口漫游控制器（最近/锁定目标选取、附着、轮询） |
| `behavior/eye-tracking-controller.cjs` | 眼球追踪控制器（光标追踪、轮询） |
| `platform/auto-start.cjs` | 开机自启平台能力适配器（注册表读写、运行态，业务偏好状态由 preferencesStore 统一管理） |
| `platform/window-surfaces.cjs` | 窗口候选探测（PowerShell 调用、解析、评分） |
| `platform/screen-metrics.cjs` | 屏幕度量（任务栏表面、跑道、显示器） |
| `ipc/register-ipc-handlers.cjs` | IPC 注册模块，集中注册所有 ipcMain.handle/on，handler 由 main.cjs 注入 |
| `lifecycle/register-app-lifecycle.cjs` | 应用生命周期注册模块，集中注册 app.whenReady、before-quit、window-all-closed、second-instance、activate、display-metrics-changed 事件，handler 由 main.cjs 注入 |

## 主进程功能域

`main.cjs` 当前承载多个功能域，修改前建议用 `rg` 定位具体区域：

| 功能域 | 搜索词 |
| --- | --- |
| 应用生命周期 | `app.whenReady`、`before-quit`、`requestSingleInstanceLock` |
| IPC | `ipcMain.handle`、`ipcMain.on`、`pet:` |
| 宠物动作 | `states`、`setState`（薄包装）、`completeOneShotState`（薄包装） |
| 状态控制 | `behavior/state-controller.cjs`、`createStateController`、`setState`、`completeOneShotState`、`moveToStartPosition`、`settlePetQuietly`、`setWalkDirection`、`isWalkingState` |
| 行走 | `advanceWalkStep`、`walkLoop`、`WALK_` |
| 拖拽 | `dragController`、`dragState`、`drag-start`、`drag-end`、`behavior/drag-controller.cjs` |
| 窗口贴靠 | `WINDOW_DOCK_`、`windowSurface`、`dockPetAfterDrag` |
| 窗口漫游 | `windowRoam` |
| 菜单 | `menuWindow`、`PET_MENU_` |
| 悬停面板 | `hoverWindow`、`HOVER_` |
| 气泡 | `startupBubble`、`bubble` |
| 状态值 | `petStats`、`fullness`、`health`、`intimacy` |
| pet stats 控制 | `pet/pet-stats-controller.cjs`、`readPetStats`、`applyNaturalStatsTick`、`applyActionStats` |
| 自启动 | `autoStart`、`WINDOWS_STARTUP_RUN_KEY` |
| 常量 | `core/app-constants.cjs` |
| 日志 | `core/logger.cjs`、`log(` |
| 运行时配置 | `core/runtime-config.cjs`、`petRuntimeConfig` |
| 偏好存储 | `core/preferences-store.cjs`、`readPreferences`、`writePreference` |
| 宠物状态 | `pet/pet-states.cjs`、`buildPetStates`、`sharedGreetings` |
| 资源加载 | `pet/asset-loader.cjs`、`listFrames`、`getAssetsRoot` |
| 几何工具 | `shared/bounds.cjs`、`clamp`、`isPointInsideRect` |
| 帧几何 | `pet/frame-geometry.cjs`、`getSpriteRectFromBounds`、`getVisiblePetRectFromBounds`、`getFrameVisibleRectFromBounds` |
| 帧可见区域扫描 | `pet/frame-visible-bounds.cjs`、`getFrameVisibleBounds`、`getFrameHeadBounds`、`scanVisibleBoundsFromBitmap`、`scanHeadBoundsFromBitmap` |
| 帧缓存与读图 | `pet/frame-bounds-controller.cjs`、`getFrameVisibleBounds`、`getFramePixelData`、`getFrameHeadBounds`、`getStateVisibleBounds`、`getStateHeadBounds` |
| 像素命中检测 | `pet/frame-hit-test.cjs`、`isPointInsideRenderedFrame`、`isPointInsideVisiblePixels` |
| 缩放纯计算 | `pet/pet-scale-rules.cjs`、`clampPetScale`、`getPetWindowWidth`、`getPetWindowHeight`、`getPetSpriteSize`、`getSpriteLocalXForWindowWidth`、`getScaledOverlayCollisionPadding`、`getScaledHoverBodyHitPadding`、`getScaledHoverAvoidPadding`、`buildScaleSummaryFromState`（main.cjs 保留薄包装委托 surfaceScaleController） |
| surface-fit 纯规则 | `pet/surface-fit-rules.cjs`、`getSurfaceVisibleTop`、`getGroundedWindowYForSurface`、`clampPetWindowPositionToSurface`、`getScaleForSurface`、`getWindowXForVisibleEdge`、`getVisibleRectFromSpriteLeft`、`getWindowXForVisibleCenter`、`getTaskbarWalkCenterLimits`、`getWindowSurfaceWalkCenterLimits`、`getSafeWindowXForDirection`、`validateWindowSurfaceBounds`、`getSurfaceGroundYFromSurface`（main.cjs 保留薄包装委托 surfaceScaleController） |
| surface 缩放编排 | `pet/surface-scale-controller.cjs`、`createSurfaceScaleController`、`applySurfaceScale`、`setPetScale`、`groundPetToSurface` |
| 消息广播 | `shared/messaging.cjs`、`safeSend`、`broadcastToWindows` |
| IPC 注册 | `ipc/register-ipc-handlers.cjs`、`registerIpcHandlers` |
| 窗口创建 | `windows/overlay-window.cjs`、`createOverlayWindow`、`windows/pet-window-controller.cjs`、`createPetWindow`、`ensurePetWindow` |
| 窗口定位 | `windows/overlay-geometry.cjs`、`getOverlayPlacementRect`、`getMenuPosition` |
| 气泡控制 | `windows/bubble-controller.cjs`、`showStartupBubble`、`hideStartupBubble` |
| 菜单控制 | `windows/menu-controller.cjs`、`showPetMenu`、`hidePetMenu` |
| 悬停控制 | `windows/hover-controller.cjs`、`showHoverPanel`、`hideHoverPanel` |
| 自定义面板 | `windows/customization-controller.cjs`、`showCustomizationPanel` |
| 行走控制 | `behavior/walk-controller.cjs`、`advanceWalkStep`、`startWalkLoop` |
| 贴靠控制 | `behavior/dock-controller.cjs`、`dockPetAfterDrag`、`windowSurfacePoll` |
| 拖拽控制 | `behavior/drag-controller.cjs`、`handleDragStart`、`handleDragEnd`、`updateDragPosition`、`clearDragState` |
| 窗口漫游控制 | `behavior/window-roam-controller.cjs`、`tickWindowRoam` |
| 眼球追踪控制 | `behavior/eye-tracking-controller.cjs`、`tickEyeTracking` |
| 开机自启 | `platform/auto-start.cjs`、`createAutoStartController`、`autoStartController`、`setAutoStartEnabled` |
| 窗口候选探测 | `platform/window-surfaces.cjs`、`listWindowSurfaceCandidates` |
| 屏幕度量 | `platform/screen-metrics.cjs`、`getTaskbarSurface`、`getSurfaceDisplay` |

## IPC 修改流程

新增一个渲染层能力时，通常需要：

1. 在 `ipc/register-ipc-handlers.cjs` 中添加 `ipcMain.handle` 或 `ipcMain.on`，并在 `main.cjs` 中提供对应 handler 函数注入 context.handlers。
2. 在 `preload.cjs` 中暴露 `window.desktopPet` 方法。
3. 在 `../static/renderer.js` 中调用该方法。
4. 如涉及 UI 状态，更新 `../static/styles.css`。
5. 更新 `../static/README.md` 和本文件。

## 变体修改流程

新增或修改宠物变体时，优先使用 `../scripts/variant-cli.cjs` 的 `variant:bootstrap` 流程或修改 `pet-variant-metadata.json`。动作 ID、功能池、tier 和 notes 规则维护在 `pet-catalog.cjs`；`pet-variants.cjs` 只维护派生规则、渠道配置和打包 profile 展开逻辑。

然后同步：

- `../../assets/animations` 下的资源目录和 manifest。
- `../scripts/variant-cli.cjs`，如果新增或改变变体维护流程。
- `../prepare-runtime-assets.cjs`。
- `../build-electron-win.ps1`。
- `../build-installer-win.ps1`。
- `../build-installer-mac.cjs`，如果变体支持 macOS。
- `../test/pet-variants.test.cjs`。
- 新增动作类型时，同步 `pet/pet-states.cjs`、`main.cjs` 中的 one-shot/stats 接线和对应测试。
- `../../docs/PROJECT_MAP.md`。

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
