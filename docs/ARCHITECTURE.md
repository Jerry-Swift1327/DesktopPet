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

## 主进程职责

`electron-app/electron/main.cjs` 是当前最大、最核心的文件，主要负责：

- 应用生命周期和单实例锁。
- 用户数据目录、日志目录和状态文件。
- 宠物窗口、右键菜单窗口、悬停面板窗口、启动气泡窗口。
- 动作状态切换、一次性动作完成、默认蹲坐状态恢复。
- 透明帧路径加载、可见像素区域计算、缩放、落地点和窗口位置计算。
- 任务栏行走、窗口贴靠、拖拽、窗口候选探测、窗口漫游。
- 亲密度、饱食度、健康值、每日/周期衰减和提示消息。
- Windows 自启动偏好和注册表写入。
- IPC 事件处理。

如果要降低未来维护成本，可考虑在独立需求中逐步拆分 `main.cjs`。

## 渲染层职责

`electron-app/static/renderer.js` 根据 `window.location.hash` 切换渲染模式：

| 模式 | hash | 作用 |
| --- | --- | --- |
| pet | 默认 | 展示宠物帧、处理拖拽、右键菜单、滚轮缩放、双击互动 |
| menu | `#menu` | 右键快捷菜单，包含重置位置、窗口漫游、自启动、重置大小、退出 |
| hover | `#hover` | 悬停状态面板，展示属性、计时器和动作按钮 |
| bubble | `#bubble` | 启动或提示气泡 |

渲染层不直接访问 Node API，而是通过 `preload.cjs` 暴露的 `window.desktopPet` 调用主进程。

## IPC 边界

`electron-app/electron/preload.cjs` 是主进程和渲染层之间的安全边界。新增渲染层能力时通常需要三处同步：

1. `main.cjs` 增加 `ipcMain.handle` 或 `ipcMain.on`。
2. `preload.cjs` 暴露新的 `window.desktopPet` 方法。
3. `static/renderer.js` 调用该方法并处理 UI 状态。

## 宠物变体

变体配置集中在 `electron-app/electron/pet-variants.cjs`：

| 变体 | 动画前缀 | 默认缩放 | 平台 | 自启动 | 窗口漫游 |
| --- | --- | --- | --- | --- | --- |
| `dog` | `dog` | `1.1` | Windows、macOS | Windows 支持 | Windows 支持 |
| `cat` | `cat` | `1` | Windows、macOS | Windows 支持 | Windows 支持 |
| `shorthair` | `shorthair` | `1.1` | Windows | 不支持 | 不支持 |
| `tabby` | `tabby` | `1.1` | Windows | Windows 支持 | Windows 支持 |
| `brit` | `brit` | `1.1` | Windows | Windows 支持 | Windows 支持 |
| `pomeranian` | `pomeranian` | `1.1` | macOS | 不支持 | 不支持 |

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
- `main.cjs` 中的 `WINDOW_DOCK_*`、`WINDOW_SURFACE_*`、`windowRoam*` 相关逻辑做缓存、验证、回退。

上述窗口候选和命中逻辑当前属于 Windows 实现。进入 macOS 适配时，不应直接复用 PowerShell/Win32 路径；建议新增平台适配层，将窗口枚举、窗口命中、Dock/任务栏边界、自启动等系统能力收口到平台 provider 中。macOS provider 未完成前，相关功能应降级或隐藏，避免影响基础桌宠启动、动画、拖拽、菜单和缩放。

macOS 适配建议分阶段推进：

1. 基础运行版：启动、透明窗口、动画播放、拖拽、右键菜单、悬停面板、气泡、缩放和退出。
2. 系统能力版：窗口枚举、窗口吸附/跟随、Dock 避让、自启动、权限申请。
3. 分发能力版：`.app/.dmg` 打包、签名、公证、Gatekeeper 和目标机器冒烟测试。

## 状态数据

运行状态存储在 Electron `userData` 下，主要包括：

- `pet-stats.json`
- `auto-start-<variant>.json`
- `window-roam-<variant>.json`
- `logs/main.log`

开发模式通常位于 `electron-app/.user-data/<variant>`；打包后通常位于用户本机 LocalAppData 下。

## 测试覆盖

当前测试位于 `electron-app/test`，使用 Node 内置 `node:test`：

- `pet-variants.test.cjs` 覆盖变体、渠道、动作顺序和资源命名。
- `walk-clock.test.cjs` 覆盖行走倒计时暂停/恢复。

高风险修改应补充或更新测试，尤其是变体配置、动作 ID、行走计时逻辑。
