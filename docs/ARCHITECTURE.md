# Architecture

Desktop-Pet 当前是一个 Electron 桌面宠物应用。主进程负责窗口、状态、资源、系统集成和移动逻辑；渲染层负责展示宠物帧、菜单、悬停状态面板和气泡。

## 运行时主链路

```text
electron-app/package.json
  -> electron/main.cjs
    -> 读取宠物变体配置
    -> 创建透明宠物窗口
    -> 创建菜单/悬停面板/气泡等辅助窗口
    -> 加载 assets 或 .runtime-assets 中的透明帧和 loop.json
    -> 通过 preload.cjs 暴露 IPC API
  -> static/index.html
    -> static/renderer.js
      -> 按 hash 渲染 pet/menu/hover/bubble 模式
```

模块加载顺序：`main.cjs` 启动时优先加载 `core/` 下的基础模块（先 `app-constants.cjs` 提供常量，再 `logger.cjs` 提供日志能力，随后 `runtime-config.cjs` 读取变体配置和用户数据目录，`preferences-store.cjs` 在需要时读取偏好），之后按需加载 `pet/`（`pet-states.cjs` 构建状态、`asset-loader.cjs` 加载帧和元数据）和 `shared/`（`bounds.cjs` 提供几何计算、`messaging.cjs` 在窗口创建后用于向渲染层广播）。生命周期注册模块 `lifecycle/register-app-lifecycle.cjs` 同样在启动时 require，`requestSingleInstanceLock` 由 `main.cjs` 顶层执行后，`registerAppLifecycle(context)` 在所有 handler 函数定义完成后、窗口创建前调用，集中绑定 `app.whenReady`、`before-quit`、`window-all-closed`、`second-instance`、`activate`、`display-metrics-changed` 事件，handler 通过 context 注入。`main.cjs` 仍保留窗口、IPC 和系统能力编排，纯逻辑优先委托给子目录模块。

## 主进程职责

`electron-app/electron/main.cjs` 是当前最大、最核心的文件，主要负责：

- 应用生命周期和单实例锁。
- 用户数据目录、日志目录和状态文件。
- 宠物窗口、右键菜单窗口、悬停面板窗口、启动气泡窗口。
- 动作状态切换、一次性动作完成、默认蹲坐状态恢复。
- 透明帧路径加载、可见像素区域计算、缩放、落地点和窗口位置计算。
- 任务栏行走、窗口贴靠、拖拽、窗口候选探测、窗口漫游。
- 拖拽运行态（dragTimer/dragState/lastDragSample）所有权在 `behavior/drag-controller.cjs`，`main.cjs` 保留 6 个拖拽函数同名薄包装委托控制器，并保留 IPC handler 映射（`dragStart`/`dragEnd`）和 `dockPetAfterDrag`/`applyDockSurfaceAfterDrag` 对 dockController 的委托。
- 亲密度、饱食度、健康值、每日/周期衰减和提示消息。
- Windows 自启动薄包装委托 `autoStartController`，偏好状态由 `preferencesStore` 统一管理。
- IPC 事件处理。

`main.cjs` 正在逐步将职责委托给 `core/`、`pet/`、`shared/` 子目录的模块：`core/` 收口常量、日志、运行时配置和偏好存储等基础能力；`pet/` 收口宠物状态定义、资源加载、pet stats 纯规则（`pet/pet-stats-rules.cjs`，不依赖 electron/fs/Date.now/Math.random）和 stats 文件读写边界（`pet/pet-stats-store.cjs`，工厂形式注入 fs/log）；`shared/` 收口无副作用的几何工具和跨窗口消息广播。`main.cjs` 保留 stats 相关函数名作为薄包装委托 rules/store，运行时状态（petStats、last*At 时间戳、intimacyDecayTimer）所有权在 `pet/pet-stats-controller.cjs`，`main.cjs` 保留 stats 函数同名薄包装委托控制器，并持有副作用编排（sendStats、showStatMessages、IPC 广播、气泡提示）等接线。`pet/` 还收口帧纯几何（`pet/frame-geometry.cjs`，含第 10 个 API `getWindowPositionForVisibleRect`）、帧可见区域 bitmap 扫描纯规则（`pet/frame-visible-bounds.cjs`）、帧缓存与读图控制器（`pet/frame-bounds-controller.cjs`，持有 visible/head/pixel 缓存和 nativeImage 读图边界，工厂形式注入依赖，不直接接触窗口/IPC/bubble）和透明像素命中检测纯规则（`pet/frame-hit-test.cjs`），`main.cjs` 保留 5 个帧 bounds 函数和 `isPointInsideRenderedFrame` 的同名薄包装委托控制器/纯模块，`main.cjs` 保留 `nativeImage` 注入与文件路径解析，帧缓存所有权迁移到 `pet/frame-bounds-controller.cjs`，纯计算委托给这些模块。`pet/` 还收口缩放纯计算（`pet/pet-scale-rules.cjs`，含 clampPetScale、windowWidth/Height/SpriteSize、spriteLocalX、overlay/hover padding、buildScaleSummaryFromState）、surface-fit 纯规则（`pet/surface-fit-rules.cjs`，含 visibleTop/windowY、window 位置约束、scale 候选适配、visible edge/center 互推、taskbar/window walk center limits、window surface 固定跑道 bounds、safe window X、validateWindowSurfaceBounds、getSurfaceGroundYFromSurface）和 surface 缩放副作用编排控制器（`pet/surface-scale-controller.cjs`，持有 `petScale`/`preferredPetScale` 运行态、surface 缩放适配、落地编排、overlay 锚点刷新、偏好持久化，工厂形式注入依赖，不直接接触窗口/IPC/bubble），`main.cjs` 保留 9 个薄包装委托 surfaceScaleController（readPetScalePreference/writePetScalePreference/getScaleForSurface/applySurfaceScale/groundPetToSurface/buildScaleSummary/sendScaleState/setPetScale/resetPetScale），纯计算委托给 rules 模块。后续拆分应继续沿此方向，把纯逻辑从 `main.cjs` 抽到对应子目录，避免在 `main.cjs` 中新增可独立的逻辑。

截至第十七轮完成（最终入口收束），`main.cjs` 约 3427 行，已删除 12 个无调用方的 helper（如 `getActionAssetFolder`、`getWalkArea`、`groundPetToWorkArea` 等），自启动 5 个函数已转为薄包装委托 `autoStartController`。`setState` 已迁出（第十三轮 state-controller），`applySurfaceScale`/`groundPetToSurface` 已迁出 `pet/surface-scale-controller.cjs`（第十四轮），宠物主窗口 `petWindow` 所有权与 6 个窗口函数已迁出 `windows/pet-window-controller.cjs`（第十五轮），第十六轮保守复核确认偏好/平台/菜单接线边界并新增 preference-platform-wiring-accessor.test.cjs 护栏测试（未触碰运行时代码），第十七轮删除 `clampStat`/`applyDailyDecay`/`getStableGroundBottom`/`getGroundedVisibleTop` 4 个死代码（共 18 行），薄包装去重评估确认无可安全去重项，`main.cjs` 保留薄包装委托。

窗口创建和控制器逻辑已拆分到 `electron-app/electron/windows/` 目录：`main.cjs` 通过 `windows/overlay-window.cjs` 的 `createOverlayWindow` 工厂创建 overlay 窗口（归纳 BrowserWindow 选项），定位几何由 `windows/overlay-geometry.cjs` 提供（含菜单/悬停/自定义面板位置计算），宠物主窗口由 `windows/pet-window-controller.cjs` 以 `createPetWindowController(context)` 工厂封装创建、显示/隐藏、bounds/position 包装和动画过渡，持有 `petWindow` 运行态，`main.cjs` 不再亲自管理宠物窗口细节；气泡、菜单、悬停面板、自定义面板分别由 `windows/bubble-controller.cjs`、`windows/menu-controller.cjs`、`windows/hover-controller.cjs`、`windows/customization-controller.cjs` 以 `createXController(context)` 形式封装创建、显示、隐藏、定位和可见性等行为。`main.cjs` 负责在启动时构造这些控制器并注入上下文，窗口相关逻辑修改应优先落到对应控制器模块，而非 `main.cjs`。

行为控制器逻辑已拆分到 `electron-app/electron/behavior/` 目录：行走循环和步进由 `behavior/walk-controller.cjs` 封装；任务栏与窗口表面共用固定透明跑道，普通步进只推进渲染层 `spriteOffsetX`，不逐帧调用原生窗口定位，`walkTrackX` 在 walk 状态统一表示宠物可见中心 X。拖拽、缩放、状态切换和 surface 变化时先把跑道内位置实体化为普通窗口 bounds；walk 拖拽释放到普通 floating surface 时，在解除拖拽暂停前按最终可见中心原子恢复跑道，避免窗口左边界被误作行走中心。拖拽后贴靠和窗口表面轮询由 `behavior/dock-controller.cjs` 封装并由变体 feature `windowDocking` 控制，拖拽运行态与拖拽开始/更新/结束流程由 `behavior/drag-controller.cjs` 封装（持有 `dragTimer`/`dragState`/`lastDragSample`，`dockPetAfterDrag` 经回调注入仍委托 dockController，不内联；`windowDocking` 关闭时拖拽释放只落成当前位置 floating surface），状态切换、one-shot 动作结算、起点复位与静默归位编排由 `behavior/state-controller.cjs` 封装（持有 `pendingActionStatsState`，`activeState`/`selectedState`/`walkDirection` 仍由 `main.cjs` 持有经 getter/setter 注入，surface/scale/window 副作用已迁出 `pet/surface-scale-controller.cjs`），窗口漫游目标选取和轮询由 `behavior/window-roam-controller.cjs` 封装，眼球追踪光标跟随由 `behavior/eye-tracking-controller.cjs` 封装。各模块以 `createXController(context)` 形式暴露，依赖通过 context 注入，控制流和执行顺序与 `main.cjs` 原逻辑一致。

平台能力已拆分到 `electron-app/electron/platform/` 目录：开机自启注册表读写与运行态由 `platform/auto-start.cjs` 封装（平台能力适配器，业务偏好状态由 `preferencesStore` 统一管理），窗口候选探测（PowerShell 调用、解析、评分）由 `platform/window-surfaces.cjs` 封装，屏幕度量（任务栏表面、跑道、显示器）由 `platform/screen-metrics.cjs` 封装。各模块以 `createXController(context)` 形式暴露，依赖通过 context 注入。

IPC 注册已抽分到 `electron-app/electron/ipc/` 目录：所有 `ipcMain.handle` / `ipcMain.on` 集中在 `ipc/register-ipc-handlers.cjs` 的 `registerIpcHandlers(context)` 中注册，handler 函数由 `main.cjs` 通过 context 注入，模块本身不包含业务逻辑。新增 IPC channel 时需同步修改 `register-ipc-handlers.cjs`、`preload.cjs` 和 `static/renderer/` 下对应模块。

应用生命周期注册已抽分到 `electron-app/electron/lifecycle/` 目录：所有 `app.whenReady`、`before-quit`、`window-all-closed`、`second-instance`、`activate`、`display-metrics-changed` 事件注册集中在 `lifecycle/register-app-lifecycle.cjs` 的 `registerAppLifecycle(context)` 中，handler 函数由 `main.cjs` 通过 context 注入，模块本身不包含业务逻辑。`requestSingleInstanceLock` 仍由 `main.cjs` 顶层执行，结果通过 context 注入。

如果要降低未来维护成本，可考虑在独立需求中逐步拆分 `main.cjs`。

## 渲染层职责

`electron-app/static/renderer.js` 是渲染层轻入口，根据 `window.location.hash` 分发到 `renderer/` 目录下对应模块。公共变量（app、mode）和工具函数在 `renderer/shared.js` 中定义，各渲染模式函数在对应模块文件中定义，`index.html` 按顺序加载各模块：

| 模式 | hash | 模块文件 | 作用 |
| --- | --- | --- | --- |
| pet | 默认 | `renderer/pet-window.js` | 展示宠物帧、处理拖拽、右键菜单、滚轮缩放、双击互动 |
| menu | `#menu` | `renderer/menu-window.js` | 右键快捷菜单，包含重置位置、窗口漫游、自启动、重置大小、退出 |
| hover | `#hover` | `renderer/hover-window.js` | 悬停状态面板，展示属性、计时器和动作按钮 |
| bubble | `#bubble` | `renderer/bubble-window.js` | 启动或提示气泡 |
| customization | `#customization` | `renderer/customization-window.js` | 形象定制面板，展示变体切换、联系二维码和复制信息 |

渲染层不直接访问 Node API，而是通过 `preload.cjs` 暴露的 `window.desktopPet` 调用主进程。

## IPC 边界

`electron-app/electron/preload.cjs` 是主进程和渲染层之间的安全边界。新增渲染层能力时通常需要三处同步：

1. 在 `ipc/register-ipc-handlers.cjs` 中添加 `ipcMain.handle` 或 `ipcMain.on`，并在 `main.cjs` 中提供对应 handler 函数。
2. `preload.cjs` 暴露新的 `window.desktopPet` 方法。
3. `static/renderer.js` 调用该方法并处理 UI 状态。

## 宠物变体

全局动作定义集中在 `electron-app/electron/pet-action-registry.json`，普通原地动作可由 DevTools 注册；动作记录包含 stateId、悬浮面板展示、播放方式、移动方式和资源处理预设。变体人工维护数据集中在 `pet-variant-metadata.json`，V3 通过 `actions.enabled` 引用全局动作，不再使用 tier。`pet-catalog.cjs` 负责加载动作、功能和 notes 规则，`pet-variants.cjs` 展开运行时与打包 profile。`windowDocking` 是拖拽释放后吸附窗口的独立 feature；`windowRoam` 只有在 `windowDocking` 和平台能力同时可用时才暴露。真实 `id` 使用 `pet<yy><seq>`，现有变体通过 `assetPrefix` 继续读取旧资源目录和 manifest，Windows 打包路径为 `deliverables/<scope>/<id>/<channel>`。

| 变体 | species | 范围 | 资源前缀 | 默认缩放 | 平台 | 自启动 | 窗口漫游 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `pet2601` | dog | internal | `dog` | `1.1` | Windows、macOS | Windows 支持 | Windows 支持 |
| `pet2602` | cat | internal | `cat` | `1` | Windows、macOS | Windows 支持 | Windows 支持 |
| `pet2603` | cat | custom | `shorthair` | `1.1` | Windows | 不支持 | 不支持 |
| `pet2604` | dog | custom | `pomeranian` | `1.1` | macOS | 不支持 | 不支持 |
| `pet2605` | cat | custom | `tabby` | `1.1` | Windows | Windows 支持 | Windows 支持 |
| `pet2606` | cat | custom | `brit` | `1.1` | Windows | Windows 支持 | Windows 支持 |
| `pet2607` | cat | custom | `van` | `1.1` | Windows | Windows 支持 | Windows 支持 |
| `pet2608` | cat | custom | `bshmitted` | `1.1` | Windows | Windows 支持 | Windows 支持 |
| `pet2609` | cat | internal | `ragdoll` | `1.1` | Windows | Windows 支持 | Windows 支持 |

变体维护 CLI 位于 `electron-app/scripts/variant-cli.cjs`，可通过 `npm.cmd run variant:list`、`variant:query`、`variant:new`、`variant:bootstrap`、`variant:gallery` 和 `variant:species` 查询、生成或接入变体。

渠道配置：

| 渠道 | 作用 |
| --- | --- |
| `release` | 显示调试计时器，悬停面板高度 180 |
| `installer` | 隐藏调试计时器，悬停面板高度 150 |

## 资源加载

开发运行时，主进程可直接使用项目资源目录。

打包/安装时，脚本会复制指定变体的运行资源：

- `transparent_frames`
- `loop.json`
- `<variant>_actions_manifest.json`
- `pet_variant.json`

正式运行只依赖透明帧和循环元数据，不依赖源视频或 `raw_frames`。

yawn 动作可在 `loop.json` 或 manifest 元数据中声明 `freezeLastFrame: true`，渲染层会把最后一帧定格为睡眠阶段；未声明时继续使用 `tailLoopStart` 尾段循环。

## 行走与贴靠

行走由渲染层动画帧驱动，主进程计算实际移动：

1. 渲染层播放当前动作帧。
2. 行走状态下调用 `desktopPet.advanceWalkStep(frameStep, elapsedMs)`。
3. 主进程根据当前 surface、可见区域、方向、边缘阈值计算下一位置。
4. 主进程返回方向、位置、缩放等结果。
5. 渲染层按返回方向镜像宠物帧。

Windows 贴靠逻辑使用：

- `window-surfaces.ps1` 获取可贴靠窗口候选。
- `window-from-point.ps1` 辅助拖拽命中判断。
- `main.cjs` 保留 `WINDOW_DOCK_*`、`WINDOW_SURFACE_*` 薄包装函数作为验证、回退入口，窗口候选缓存与异步刷新状态由 `platform/window-surfaces.cjs` 的 `windowSurfaceController` 统一维护；拖拽吸附入口由 `windowDocking` feature 和 `ENABLE_WINDOW_DOCKING` 总开关共同 gating，`windowRoam*` 状态与目标选取由 `behavior/window-roam-controller.cjs` 负责。

上述窗口候选和命中逻辑当前属于 Windows 实现。进入 macOS 适配时，不应直接复用 PowerShell/Win32 路径；建议新增平台适配层，将窗口枚举、窗口命中、Dock/任务栏边界、自启动等系统能力收口到平台 provider 中。macOS provider 未完成前，相关功能应降级或隐藏，避免影响基础桌宠启动、动画、拖拽、菜单和缩放。

macOS 适配建议分阶段推进：

1. 基础运行版：启动、透明窗口、动画播放、拖拽、右键菜单、悬停面板、气泡、缩放和退出。
2. 系统能力版：窗口枚举、窗口吸附/跟随、Dock 避让、自启动、权限申请。
3. 分发能力版：`.app/.dmg` 打包、签名、公证、Gatekeeper 和目标机器冒烟测试。

## 状态数据

运行状态存储在 Electron `userData` 下，打包后的 Windows 数据根目录按基础安装包变体隔离，当前显示变体的数据位于 `variants/<variant>`，主要包括：

- `variants/<variant>/pet-stats.json`
- `variants/<variant>/preferences.dat`
- `logs/main.log`

开发模式通常位于 `electron-app/.user-data/<variant>`；打包后通常位于用户本机 LocalAppData 下。

## 测试覆盖

当前测试位于 `electron-app/test`，使用 Node 内置 `node:test`：

- `pet-variants.test.cjs` 覆盖变体、渠道、动作顺序和资源命名。
- `walk-clock.test.cjs` 覆盖行走倒计时暂停/恢复。

高风险修改应补充或更新测试，尤其是变体配置、动作 ID、行走计时逻辑。
