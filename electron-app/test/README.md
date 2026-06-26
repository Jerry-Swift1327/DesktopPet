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
| `walk-clock.test.cjs` | 行走循环暂停、恢复、剩余时间计算 | `../electron/walk-clock.cjs` |
| `walk-controller-accessor.test.cjs` | walk-controller 访问器与 main.cjs 接线结构断言 | `../electron/behavior/walk-controller.cjs`、`../electron/main.cjs` |
| `dock-controller-accessor.test.cjs` | dock-controller 访问器、windowRoam 双状态源清除与 main.cjs 薄包装接线结构断言 | `../electron/behavior/dock-controller.cjs`、`../electron/main.cjs` |
| `ipc-contract.test.cjs` | IPC 契约一致性结构断言（preload invoke/send/onXxx、register-ipc-handlers.cjs 注册模块、renderer 调用、高风险 channel 名称、main→renderer 事件推送） | `../electron/preload.cjs`、`../electron/main.cjs`、`../electron/ipc/register-ipc-handlers.cjs`、`../static/renderer/**` |
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
| `scale-surface-fit-wiring-accessor.test.cjs` | main.cjs 缩放与 surface-fit 薄包装接线结构护栏（9 个原薄包装委托 petScaleRules./surfaceFitRules.、buildScaleSummary/validateWindowSurface/getSurfaceGroundY 转薄包装委托、applySurfaceScale/setPetScale/handleResetScale 仍以 function 声明在 main.cjs） | `../electron/main.cjs` |
| `drag-behavior-guard.test.cjs` | main.cjs 拖拽链路结构护栏（dragTimer/dragState/lastDragSample 仍在 main.cjs、pet:drag-start/drag-end IPC 接线、clearDragState/handleDragStart/updateDragPosition/handleDragEnd 关键调用、dockPetAfterDrag/applyDockSurfaceAfterDrag 委托 dockController） | `../electron/main.cjs`、`../electron/ipc/register-ipc-handlers.cjs`、`../electron/behavior/dock-controller.cjs` |

## 何时补测试

- 修改 `pet-variants.cjs` 的变体、动作、渠道或默认配置。
- 修改 `walk-clock.cjs` 的计时逻辑。
- 从 `main.cjs` 中抽出纯逻辑模块后。
- 新增不依赖真实 Electron 窗口的核心规则。

## 测试风格

- 使用 Node 内置 `node:test` 和 `node:assert/strict`。
- 优先测试纯函数和配置输出。
- 避免在单元测试中启动真实 Electron 窗口。
- 文件命名保持 `*.test.cjs`。
