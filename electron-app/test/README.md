# Tests

本目录包含 Electron 应用的 Node 内置测试。

## 运行

```powershell
cd electron-app
npm.cmd test
```

`package.json` 中当前测试命令：

```powershell
node --test "test/**/*.test.cjs"
```

## 当前测试

| 文件 | 覆盖内容 | 相关源码 |
| --- | --- | --- |
| `pet-variants.test.cjs` | 默认变体、渠道配置、动作 ID、资源目录命名 | `../electron/pet-variants.cjs` |
| `variant-cli.test.cjs` | 变体 CLI 的新建、校验和动作源视频复制重命名 | `../scripts/variant-cli.cjs` |
| `walk-clock.test.cjs` | 行走循环暂停、恢复、剩余时间计算 | `../electron/walk-clock.cjs` |
| `walk-controller-accessor.test.cjs` | walk-controller 访问器与 main.cjs 接线结构断言 | `../electron/behavior/walk-controller.cjs`、`../electron/main.cjs` |
| `dock-controller-accessor.test.cjs` | dock-controller 访问器、windowRoam 双状态源清除与 main.cjs 薄包装接线结构断言 | `../electron/behavior/dock-controller.cjs`、`../electron/main.cjs` |
| `ipc-contract.test.cjs` | IPC 契约一致性结构断言（preload invoke/send/onXxx、register-ipc-handlers.cjs 注册模块、renderer 调用、高风险 channel 名称、main→renderer 事件推送） | `../electron/preload.cjs`、`../electron/main.cjs`、`../electron/ipc/register-ipc-handlers.cjs`、`../static/renderer/**` |
| `pet-frame-cache.test.cjs` | 宠物帧缓存、首帧解码门禁、失败降级、响应式缩放布局和 renderer 接线结构 | `../static/renderer/pet-frame-cache.js`、`../static/renderer/pet-window.js`、`../static/index.html` |
| `state-visual-commit.test.cjs` | 状态切换视觉提交事务（旧帧贴地保持、目标首帧上报后落地/启动行走） | `../electron/behavior/state-controller.cjs`、`../electron/main.cjs` |
| `contact-qrcode.test.cjs` | 联系二维码查找辅助模块结构断言（开发/打包路径构造、Downloads fallback、文件存在/不存在、读取异常跳过、返回结构） | `../electron/ipc/contact-qrcode.cjs` |
| `app-lifecycle-contract.test.cjs` | 应用生命周期契约结构断言（单实例锁、whenReady 启动序列、before-quit 退出清理、window-all-closed、activate、display-metrics-changed、switch-variant 重启、启动/退出顺序） | `../electron/main.cjs` |
| `register-app-lifecycle.test.cjs` | 生命周期注册模块结构断言（导出函数、事件注册、darwin 条件、不包含业务逻辑函数） | `../electron/lifecycle/register-app-lifecycle.cjs` |
| `taskbar-surface-window-lifecycle.test.cjs` | 任务栏表面回退避免读取已销毁宠物窗口 bounds 的结构断言（控制器 destroyed window guard、main.cjs 薄包装委托） | `../electron/platform/screen-metrics.cjs`、`../electron/main.cjs` |
| `screen-metrics-accessor.test.cjs` | screen-metrics 控制器访问器注入与 main.cjs 薄包装接线结构断言（不直接 require electron、不按值捕获可变状态、getSurfaceDisplay 默认参数使用 getCurrentSurfaceValue、导出 clearDisplayMetricsSettleTimer、8 个薄包装委托、退出清理调用 clearDisplayMetricsSettleTimer） | `../electron/platform/screen-metrics.cjs`、`../electron/main.cjs` |
| `window-surfaces-accessor.test.cjs` | window-surfaces 控制器访问器护栏与 main.cjs 薄包装接线结构断言（不直接 require electron/child_process/fs/path、不按值捕获 petWindow/dragState/lastDragSample/userDataRoot、normalizeWindowRectToDip 保留 isDestroyed guard、getCachedWindowSurfaceCandidates 内部化、导出 16 个核心函数含 maybeRefreshWindowSurfaceCandidatesBackground、main.cjs 构造 windowSurfaceController、16 个薄包装委托、删除 5 个旧缓存状态变量、updateDragPosition 使用 getLastWindowSurfaceAsyncRefreshAt()） | `../electron/platform/window-surfaces.cjs`、`../electron/main.cjs` |
| `bounds.test.cjs` | 纯几何工具函数 | `../electron/shared/bounds.cjs` |
| `messaging.test.cjs` | webContents.send 安全发送和广播 | `../electron/shared/messaging.cjs` |
| `pet-states.test.cjs` | 宠物状态工厂和状态数组构建 | `../electron/pet/pet-states.cjs` |
| `ragdoll-assets.test.cjs` | ragdoll 动作资源、manifest 和 yawn 尾段循环元数据 | `../../assets/animations` |
| `pet2610-assets.test.cjs` | pet2610 动作资源、manifest 和 yawn 尾段循环元数据 | `../../assets/animations` |
| `pet-stats-rules.test.cjs` | pet stats 纯规则（clampStat/daysBetween/createDefaultPetStats/normalizePetStats/applyDailyDecay/applyPromptStateRules/applyNaturalStatsTickRules/applyActionStatsRules/applyCompletedWalkStatsRules/recordInteractionRules） | `../electron/pet/pet-stats-rules.cjs` |
| `pet-stats-store.test.cjs` | pet stats 读写边界（encode/decode 往返、readPetStatsFile 主文件与 legacy fallback、读取异常、writePetStatsFile 写入内容） | `../electron/pet/pet-stats-store.cjs` |
| `pet-stats-controller-accessor.test.cjs` | pet-stats-controller 控制器访问器护栏与 main.cjs 薄包装接线结构断言（不直接 require electron/fs/path、不直接访问窗口/IPC/bubble、不使用 Math.random/new Date、context 注入完整、调用 rules/store 不重写、timer 所有权在控制器、main 不再持有 stats 运行态） | `../electron/pet/pet-stats-controller.cjs`、`../electron/main.cjs` |
| `frame-geometry.test.cjs` | 帧纯几何计算（spriteRect、visibleInsets、frameVisibleRect、stableGroundBottom、bottomAnchor、centerWindowX） | `../electron/pet/frame-geometry.cjs` |
| `frame-visible-bounds.test.cjs` | 帧可见区域 bitmap 扫描纯规则（scanVisibleBounds、scanHeadBounds） | `../electron/pet/frame-visible-bounds.cjs` |
| `frame-bounds-controller.test.cjs` | frame-bounds 控制器缓存命中、无效图片 fallback、state bounds 合并、moving stable bottom 修正、结构断言 | `../electron/pet/frame-bounds-controller.cjs` |
| `frame-hit-test.test.cjs` | 透明像素命中检测纯规则（命中/不命中/镜像/hitPadding 半径/边界 clamp） | `../electron/pet/frame-hit-test.cjs` |
| `frame-bounds-controller-accessor.test.cjs` | main.cjs 帧接线结构护栏（不声明帧缓存、不直接 nativeImage.createFromPath、5 个 frame bounds 函数委托 frameBoundsController、isPointInsideRenderedFrame 委托 frameHitTest、getPetWindowPositionForVisibleRect 委托 frameGeometry） | `../electron/main.cjs` |
| `pet-scale-rules.test.cjs` | pet scale 纯计算（clampPetScale NaN/min/max/四舍五入、windowWidth/Height/SpriteSize、spriteLocalX、overlay/hover padding 边界值、buildScaleSummaryFromState） | `../electron/pet/pet-scale-rules.cjs` |
| `surface-fit-rules.test.cjs` | surface-fit 纯规则（visibleTop/groundedWindowY、clampWindowPositionToSurface、getScaleCandidateForSurface 候选适配、edge/center 互推、taskbarWalkCenterLimits、safeWindowXForDirection、validateWindowSurfaceBounds、getSurfaceGroundYFromSurface） | `../electron/pet/surface-fit-rules.cjs` |
| `scale-surface-fit-wiring-accessor.test.cjs` | main.cjs 缩放与 surface-fit 薄包装接线结构护栏（getPetWindowWidth/Height/SpriteSize/clampPetScale 委托 petScaleRules、getSurfaceVisibleTop/getGroundedWindowYForSurface/clampPetWindowPositionToSurface/getSafeWindowXForDirection 委托 surfaceFitRules、applySurfaceScale/setPetScale 反转为薄包装委托 surfaceScaleController、buildScaleSummary/getScaleForSurface 改读控制器源、validateWindowSurface/getSurfaceGroundY 委托 surfaceFitRules、handleResetScale 保留 main.cjs） | `../electron/main.cjs`、`../electron/pet/surface-scale-controller.cjs` |
| `drag-behavior-guard.test.cjs` | drag-controller 拖拽链路结构护栏（dragTimer/dragState/lastDragSample 迁入 drag-controller、main.cjs 不再直接声明、pet:drag-start/drag-end IPC 接线、clearDragState/handleDragStart/updateDragPosition/handleDragEnd 关键调用、dockPetAfterDrag/applyDockSurfaceAfterDrag 委托 dockController） | `../electron/behavior/drag-controller.cjs`、`../electron/main.cjs`、`../electron/ipc/register-ipc-handlers.cjs`、`../electron/behavior/dock-controller.cjs` |
| `drag-controller-accessor.test.cjs` | drag-controller 控制器访问器护栏与 main.cjs 薄包装接线结构断言（不直接 require electron/fs/path、不注册 IPC、不直接访问窗口/IPC/bubble、createDragController 导出、内部持有 3 个运行态、context 注入完整、导出 9 个函数、main.cjs 构造 dragController、main.cjs 不再声明运行态、6 个薄包装委托 dragController、6 个控制器 context 的 getDragState/getLastDragSample 改走 dragController、dockPetAfterDrag/applyDockSurfaceAfterDrag 仍委托 dockController 不被内联、IPC 契约不变） | `../electron/behavior/drag-controller.cjs`、`../electron/main.cjs`、`../electron/ipc/register-ipc-handlers.cjs`、`../electron/behavior/dock-controller.cjs` |
| `state-controller-accessor.test.cjs` | state-controller 控制器边界与 main.cjs 薄包装接线结构护栏（11 个断言：controller 不直接 require electron/fs/path、不出现 ipcMain/broadcastToWindows/showBubbleMessage/petWindow、导出 createStateController、内部持有 pendingActionStatsState、context 注入完整含 getter/setter、导出 6 个方法、main.cjs 构造 stateController、main.cjs 不再声明 pendingActionStatsState、6 个薄包装委托 stateController、IPC 契约不变、handlers 映射不变） | `../electron/behavior/state-controller.cjs`、`../electron/main.cjs`、`../electron/ipc/register-ipc-handlers.cjs` |
| `surface-scale-controller-accessor.test.cjs` | surface-scale-controller 控制器边界与 main.cjs 薄包装接线结构护栏（12 个断言：controller 不直接 require electron/fs/path、不出现 ipcMain/petWindow./safeSend(/BrowserWindow、导出 createSurfaceScaleController、内部声明 petScale/preferredPetScale、暴露 11 个方法、main.cjs 构造 surfaceScaleController、不再声明运行态、9 个薄包装委托、context getPetScale/getPreferredPetScale 改读 controller、纯计算函数改读 controller getter、handleResetScale 保留 main.cjs、getScaleForSurface 临时改写语义保持） | `../electron/pet/surface-scale-controller.cjs`、`../electron/main.cjs` |
| `surface-scale-anchor.test.cjs` | surface-scale-controller 缩放锚点行为回归（缩放前后可见中心保持不变、可见底边保持贴合 surface、窗口尺寸按 scale 更新） | `../electron/pet/surface-scale-controller.cjs` |
| `auto-start-controller-accessor.test.cjs` | auto-start 控制器边界与 main.cjs 薄包装接线结构护栏（13 个断言：controller 不直接 require electron/fs/path、不匹配 ipcMain/petWindow/safeSend/broadcastToWindows/showBubbleMessage、导出 createAutoStartController、不声明 autoStartEnabledCache/autoStartPreferenceLoaded 业务状态、声明 autoStartRefreshInFlight 运行态、context 注入 10 个必要依赖、不导出 buildAutoStartSummary/canToggleAutoStart、导出 6 个函数、main.cjs 引入并构造 autoStartController、main.cjs 不再声明 3 个 auto-start 状态变量、5 个 function 转薄包装委托 autoStartController、buildAutoStartSummary 委托 preferencesStore、readAutoStartPreference/writeAutoStartPreference 委托 preferencesStore） | `../electron/platform/auto-start.cjs`、`../electron/main.cjs` |
| `pet-window-controller-accessor.test.cjs` | pet-window-controller 控制器边界与 main.cjs 薄包装接线结构护栏（18 个断言：控制器不直接 require electron/fs/path、不出现 ipcMain/safeSend/broadcastToWindows/showBubbleMessage、不直接 new BrowserWindow、导出 createPetWindowController、内部声明 petWindow、context 注入 21 个必要依赖、暴露 7 个方法、main.cjs 引入并构造 petWindowController、main.cjs 不再声明 let petWindow、7 个薄包装委托、context getPetWindow 改读控制器、main.cjs 不再出现裸 petWindow?.引用/petWindow.方法调用/petWindow =赋值/petWindow 作为参数、IPC show/hide 映射不变、runAppReadyStartupSequence 顺序不变） | `../electron/windows/pet-window-controller.cjs`、`../electron/main.cjs`、`../electron/ipc/register-ipc-handlers.cjs` |
| `taskbar-icon-window.test.cjs` | 运行期任务栏图标策略结构护栏（overlay 默认 `skipTaskbar: true`，仅宠物主窗口显式 `skipTaskbar: false`） | `../electron/windows/overlay-window.cjs`、`../electron/windows/pet-window-controller.cjs`、`../electron/windows/*-controller.cjs` |
| `menu-feedback-delay.test.cjs` | 快捷菜单可切换按钮反馈延迟结构护栏（统一 200ms 隐藏、窗口跟随/眼神追踪/自动开机立即发起 IPC、切换宠物复用短延迟） | `../static/renderer/menu-window.js` |
| `preference-platform-wiring-accessor.test.cjs` | 偏好/平台/菜单接线结构护栏（11 个断言：main.cjs 不重新声明偏好状态、buildAutoStartSummary/buildWindowRoamSummary/buildEyeTrackingSummary 委托 preferencesStore、read/write preference 委托 preferencesStore/surfaceScaleController、平台注册表读写委托 autoStartController、buildMenuFeatures 调用 getPetPlatformFeatures + ENABLE_WINDOW_DOCKING、setAutoStartPreference/setWindowRoamPreference/setEyeTrackingPreference 保留 main.cjs、auto-start.cjs 不声明业务状态且不接触窗口/IPC/bubble、preferences-store.cjs 不接触窗口/IPC/bubble 且导出摘要/守卫方法） | `../electron/main.cjs`、`../electron/platform/auto-start.cjs`、`../electron/core/preferences-store.cjs` |
| `bubble-position.test.cjs` | 启动气泡锚点冻结行为结构断言（可见时冻结锚点、resize 不刷新锚点、repositionStartupBubbleWindow 按 refreshAnchor 参数刷新、setPetWindowPosition 触发 reposition、showBubbleMessage 刷新锚点、hideStartupBubble 清空锚点）；setPetScale 函数体改读 surface-scale-controller 源，setPetWindowPosition 函数体改读 pet-window-controller 源（与 setPetScale 改读控制器源模式一致），保留 repositionStartupBubbleWindow({ refreshAnchor: true }) 断言 | `../electron/windows/bubble-controller.cjs`、`../electron/pet/surface-scale-controller.cjs`、`../electron/windows/pet-window-controller.cjs` |
| `pet-scale-preference.test.cjs` | pet 偏好与变体数据存储结构断言（preferences.dat 加密存储、pet-stats.json 变体隔离、打包 userDataRoot 跟随 base 变体、启动序列 readPetScalePreference 先于 createPetWindow、legacy 偏好文件迁移、legacy auto-start json 迁移清理、installer 不再写 split json、refreshAutoStartCacheAsync 持久化注册表状态到偏好、setPetScale 持久化 preferredPetScale 并使用 surface-fit scale、preferred variant 存储路径、打包读取 legacy roaming 文件）；setPetScale 函数体改读控制器源，保留 preferredPetScale 持久化与 surface-fit scale 行为断言 | `../electron/main.cjs`、`../electron/pet/surface-scale-controller.cjs`、`../electron/core/preferences-store.cjs`、`../electron/core/runtime-config.cjs`、`../electron/platform/auto-start.cjs`、`../electron/ipc/register-ipc-handlers.cjs`、`../electron/core/app-constants.cjs`、`../build/installer.nsh` |

## 何时补测试

- 修改 `pet-variant-metadata.json` 或 `pet-variants.cjs` 的变体、动作、渠道或默认配置。
- 修改 `scripts/variant-cli.cjs` 的新增变体、查询或资源重命名流程。
- 修改 `walk-clock.cjs` 的计时逻辑。
- 从 `main.cjs` 中抽出纯逻辑模块后。
- 新增不依赖真实 Electron 窗口的核心规则。

## 测试风格

- 使用 Node 内置 `node:test` 和 `node:assert/strict`。
- 优先测试纯函数和配置输出。
- 避免在单元测试中启动真实 Electron 窗口。
- 文件命名保持 `*.test.cjs`。
