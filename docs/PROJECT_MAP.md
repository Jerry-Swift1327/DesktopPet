# Project Map

本文件是 Desktop-Pet 的项目地图，目标是让维护者和 AI 先按功能定位目录，再进入具体脚本，避免每次全项目扫描。

## 顶层结构

| 路径 | 当前作用 | 常见修改场景 |
| --- | --- | --- |
| `README.md` | 项目总览、运行入口、文档索引 | 项目定位、运行方式、打包方式变化 |
| `docs` | AI 导航、架构、维护规则、项目状态 | 新增功能域、目录结构变化、维护流程变化 |
| `electron-app` | Electron 桌面宠物应用主体 | 主进程、渲染 UI、打包、测试、安装包 |
| `assets` | 宠物动画资源根目录 | 新增宠物变体、新增动作、替换动作素材 |
| `tools` | 资源处理和画质预览 Python 脚本 | 抠像、抽帧、循环段选择、替换动作视频 |
| `app_icon.ico` | 应用图标源文件 | 更新应用图标 |

## Electron 应用结构

| 路径 | 当前作用 | 常见修改场景 |
| --- | --- | --- |
| `electron-app/package.json` | npm 脚本、Electron Builder 配置 | 新增脚本、调整打包配置、升级依赖 |
| `electron-app/electron/main.cjs` | 主进程核心逻辑 | 窗口、菜单、悬停面板、状态值、拖拽、吸附、行走、自启动 |
| `electron-app/electron/preload.cjs` | 暴露安全 IPC API 给渲染层 | 新增渲染层调用主进程能力 |
| `electron-app/electron/pet-variants.cjs` | 宠物变体、动作 ID、渠道配置 | 新增宠物变体、调整默认缩放、渠道能力开关 |
| `electron-app/electron/walk-clock.cjs` | 行走循环暂停/恢复计时 | 修改行走倒计时或暂停恢复规则 |
| `electron-app/electron/window-surfaces.ps1` | Windows 可贴靠窗口候选探测 | 贴靠窗口枚举异常 |
| `electron-app/electron/window-from-point.ps1` | 根据屏幕点查找窗口 | 拖拽吸附命中异常 |
| `electron-app/static/index.html` | 渲染窗口 HTML 入口 | 页面加载入口变化 |
| `electron-app/static/renderer.js` | 宠物/菜单/悬停/气泡窗口渲染逻辑 | UI 行为、按钮、动画播放、IPC 调用 |
| `electron-app/static/styles.css` | 渲染层样式 | 宠物窗口、菜单、悬停面板和气泡视觉调整 |
| `electron-app/test` | Node 测试 | 修改变体配置或行走时钟后补测试 |

## 打包和运行脚本

| 文件 | 当前作用 | 备注 |
| --- | --- | --- |
| `electron-app/prepare-runtime-assets.ps1` | 将指定变体的运行帧和 `pet_variant.json` 复制到 `.runtime-assets` | `pack:win` 和 `package:mac` 使用 |
| `electron-app/build-electron-win.ps1` | 手工组装 Windows 便携版目录包 | 输出到 `release` 或 `<variant>_release` |
| `electron-app/build-installer-win.ps1` | 构建 NSIS 安装包，并在结束后清理 `win-unpacked`、`.blockmap`、`builder-debug.yml` | 输出到 `installer` 或 `<variant>_installer` |

## 资源结构

| 路径 | 当前作用 | 常见修改场景 |
| --- | --- | --- |
| `assets/animations/<variant>_<action>/<action>.mp4` | 动作源视频 | 替换动作素材 |
| `assets/animations/<variant>_<action>/transparent_frames` | 运行时实际加载的透明 PNG 帧 | 抠像质量、动作循环、运行时视觉 |
| `assets/animations/<variant>_<action>/loop.json` | 帧数、帧间隔、循环段、质量元数据 | 调整循环段或资源规格 |
| `assets/animations/<variant>_actions_manifest.json` | 某个变体的动作清单 | 动作资源批量处理或替换后同步 |
| `assets/animations/<variant>_<action>/raw_frames` | 抽帧中间产物 | 通常不进入打包运行资源 |
| `assets/animations/<variant>_<action>/_replacement_work` | 替换动作视频时的临时工作目录 | 调试替换流程时可能保留 |

当前变体：

- `dog`
- `cat`
- `shorthair`

当前动作后缀：

- `squat`
- `walk`
- `feed`
- `ball`

## 工具脚本结构

| 文件 | 当前作用 | 常见修改场景 |
| --- | --- | --- |
| `tools/process_pet_videos.py` | 批量抽帧、绿幕抠像、统一尺寸、选择循环段、写 manifest | 新增批量处理策略、调整抠像参数 |
| `tools/replace_action_video.py` | 替换单个动作视频并提升 2x 透明帧 | 单动作素材替换、手动循环段、长循环选择 |
| `tools/build_quality_previews.py` | 生成当前/候选/对比预览视频 | 资源画质验证、候选帧预览 |

## 生成产物和依赖目录

以下目录通常不作为业务源码修改入口：

- `electron-app/node_modules`
- `electron-app/.runtime-assets`
- `electron-app/.electron-builder-cache`
- `electron-app/release`
- `electron-app/cat_release`
- `electron-app/shorthair_release`
- `electron-app/installer`
- `electron-app/cat_installer`
- `electron-app/shorthair_installer`
- `electron-app/.tmp`
- `quality_previews`
- `tools/__pycache__`

修改这些目录前应先确认目标是修构建产物还是修源码。
