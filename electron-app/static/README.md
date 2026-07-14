# Static Renderer

本目录是 Electron 渲染层入口，负责显示宠物、右键菜单、悬停状态面板和提示气泡。

## 文件说明

| 文件 | 作用 | 常见修改场景 |
| --- | --- | --- |
| `index.html` | 渲染窗口 HTML 入口，按顺序加载 renderer/ 下各模块和 renderer.js | 页面结构或资源入口变化 |
| `renderer.js` | 渲染层轻入口，按 hash 分发到对应渲染模块 | 调整渲染模式分发逻辑 |
| `renderer/shared.js` | 公共变量（app、mode）和工具函数（logWalkDiagnostic 等） | 修改全局变量或公共工具 |
| `renderer/pet-frame-cache.js` | 宠物帧预热、解码缓存和响应式缩放布局 helper | 帧加载、动作切换平滑度、缩放布局同步 |
| `renderer/pet-window.js` | 宠物窗口渲染（帧播放、拖拽、缩放、状态切换、行走步进） | UI 行为、动画播放、拖拽、缩放 |
| `renderer/menu-window.js` | 快捷菜单窗口渲染（菜单项、按钮交互、状态显示；切换项显示短反馈后关闭） | 菜单项、按钮、状态显示 |
| `renderer/hover-window.js` | 悬停面板渲染（属性、计时器、动作按钮） | 属性条、计时器、动作按钮 |
| `renderer/bubble-window.js` | 启动气泡窗口渲染（气泡内容、显示动画） | 气泡内容、显示逻辑 |
| `renderer/customization-window.js` | 形象定制面板渲染（变体切换、二维码显示、复制信息） | 变体切换、二维码、复制 |
| `styles.css` | 所有渲染模式的样式 | 宠物显示尺寸、菜单样式、悬停面板、气泡样式 |

## 渲染模式

`renderer.js` 通过 `window.location.hash` 选择模式，公共变量和工具在 `renderer/shared.js` 中定义，各模式渲染函数在 `renderer/` 下对应模块文件中定义：

| 模式 | hash | 入口函数 | 模块文件 | 作用 |
| --- | --- | --- | --- | --- |
| 宠物窗口 | 默认 | `renderPetWindow` | `renderer/pet-window.js` | 播放宠物帧、处理拖拽、滚轮缩放、右键菜单、双击互动 |
| 快捷菜单 | `#menu` | `renderQuickMenuWindow` | `renderer/menu-window.js` | 显示重置位置、窗口漫游、自启动、重置大小、退出 |
| 悬停面板 | `#hover` | `renderHoverWindow` | `renderer/hover-window.js` | 显示属性条、计时器和动作按钮 |
| 提示气泡 | `#bubble` | `renderStartupBubbleWindow` | `renderer/bubble-window.js` | 显示启动问候或主进程推送消息 |
| 形象定制 | `#customization` | `renderCustomizationWindow` | `renderer/customization-window.js` | 显示变体切换、联系二维码和复制信息 |

## 与主进程通信

渲染层只通过 `window.desktopPet` 调用主进程能力。该对象由 `../electron/preload.cjs` 暴露。

新增按钮或 UI 行为时，通常需要同步：

- `../electron/main.cjs` 增加 IPC 处理。
- `../electron/preload.cjs` 暴露方法。
- `renderer.js` 调用方法。
- `styles.css` 增加样式。

## 动画播放注意

- 宠物帧来自主进程返回的 `config.states[].frames`。
- 行走状态通过 `advanceWalkStep` 让主进程推进固定透明跑道内的 `spriteOffsetX`；任务栏和窗口表面均不在普通逐帧步进中移动原生宠物窗口。
- 拖拽、缩放、状态切换或 surface 变化前，主进程会把跑道内位置实体化为普通宠物窗口 bounds；walk 拖拽释放时按最终可见中心原子恢复跑道，避免把窗口左边界误作行走中心造成横向跳变。渲染层继续只消费返回的 scale 与 sprite offset。
- `loopStart`、`loopEnd`、`frameSequence` 会影响播放帧序列。
- yawn 动作元数据可声明 `freezeLastFrame: true`，渲染层会在最后一帧定格并把它视为睡眠阶段；未声明时仍按 `tailLoopStart` 尾段循环。
- 一次性动作完成后，渲染层会调用 `completeOneShot` 通知主进程恢复默认状态。

## 修改注意

- 不要直接访问 Node API，保持通过 preload 暴露的安全接口通信。
- 调整菜单项时同步检查菜单窗口高度上报逻辑。
- 调整悬停面板高度时同步检查 `pet-variants.cjs` 中的渠道高度配置。
- 调整动画播放节奏时同步检查 `loop.json`、`frameMs` 和主进程行走逻辑。
