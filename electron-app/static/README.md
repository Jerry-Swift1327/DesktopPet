# Static Renderer

本目录是 Electron 渲染层入口，负责显示宠物、右键菜单、悬停状态面板和提示气泡。

## 文件说明

| 文件 | 作用 | 常见修改场景 |
| --- | --- | --- |
| `index.html` | 渲染窗口 HTML 入口 | 页面结构或资源入口变化 |
| `renderer.js` | 根据 hash 渲染不同窗口模式，并通过 `window.desktopPet` 与主进程通信 | UI 行为、按钮、动画播放、状态面板、气泡 |
| `styles.css` | 所有渲染模式的样式 | 宠物显示尺寸、菜单样式、悬停面板、气泡样式 |

## 渲染模式

`renderer.js` 通过 `window.location.hash` 选择模式：

| 模式 | hash | 入口函数 | 作用 |
| --- | --- | --- | --- |
| 宠物窗口 | 默认 | `renderPetWindow` | 播放宠物帧、处理拖拽、滚轮缩放、右键菜单、双击互动 |
| 快捷菜单 | `#menu` | `renderQuickMenuWindow` | 显示重置位置、窗口漫游、自启动、重置大小、退出 |
| 悬停面板 | `#hover` | `renderHoverWindow` | 显示属性条、计时器和动作按钮 |
| 提示气泡 | `#bubble` | `renderStartupBubbleWindow` | 显示启动问候或主进程推送消息 |

## 与主进程通信

渲染层只通过 `window.desktopPet` 调用主进程能力。该对象由 `../electron/preload.cjs` 暴露。

新增按钮或 UI 行为时，通常需要同步：

- `../electron/main.cjs` 增加 IPC 处理。
- `../electron/preload.cjs` 暴露方法。
- `renderer.js` 调用方法。
- `styles.css` 增加样式。

## 动画播放注意

- 宠物帧来自主进程返回的 `config.states[].frames`。
- 行走状态通过 `advanceWalkStep` 让主进程计算真实窗口位置。
- `loopStart`、`loopEnd`、`frameSequence` 会影响播放帧序列。
- 一次性动作完成后，渲染层会调用 `completeOneShot` 通知主进程恢复默认状态。

## 修改注意

- 不要直接访问 Node API，保持通过 preload 暴露的安全接口通信。
- 调整菜单项时同步检查菜单窗口高度上报逻辑。
- 调整悬停面板高度时同步检查 `pet-variants.cjs` 中的渠道高度配置。
- 调整动画播放节奏时同步检查 `loop.json`、`frameMs` 和主进程行走逻辑。
