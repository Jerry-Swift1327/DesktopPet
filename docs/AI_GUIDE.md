# AI Guide

本文件给后续 AI 使用。处理需求时先读这里，再按场景进入对应 README 或脚本。

## 基本规则

- 先定位功能域，再读相关目录 README，再打开具体脚本。
- 不要把 `node_modules`、`release`、`installer`、`.runtime-assets`、`__pycache__` 当作优先修改入口。
- 修改业务逻辑后，同步更新对应目录 README 和本文件中相关条目。
- 修改启动、打包、资源处理、目录结构、宠物变体时，同步检查 `PROJECT_MAP.md`、`ARCHITECTURE.md`、`STATUS.md`。
- 如果只改文档，不运行会修改产物的构建脚本；可运行只读检查或测试命令。

## 按需求定位

| 用户需求 | 优先查看 | 可能修改 |
| --- | --- | --- |
| 修改桌宠主窗口行为 | `electron-app/electron/README.md` | `electron-app/electron/main.cjs` |
| 新增右键菜单项 | `electron-app/electron/preload.cjs`、`electron-app/static/renderer.js` | 主进程 IPC、菜单渲染、样式 |
| 调整悬停状态面板 | `electron-app/static/README.md` | `static/renderer.js`、`static/styles.css`、必要时 `main.cjs` |
| 调整气泡文案或显示时机 | `electron-app/electron/main.cjs`、`electron-app/static/renderer.js` | 主进程消息调度、气泡渲染 |
| 调整拖拽、贴靠窗口、任务栏行走 | `docs/ARCHITECTURE.md`、`electron-app/electron/README.md` | `main.cjs`、`window-surfaces.ps1`、`window-from-point.ps1` |
| 修改行走倒计时或暂停恢复 | `electron-app/electron/walk-clock.cjs`、`electron-app/test/walk-clock.test.cjs` | 时钟逻辑和测试 |
| 新增宠物变体 | `assets/animations/README.md`、`electron-app/electron/pet-variants.cjs` | 变体配置、资源目录、打包脚本、测试 |
| 替换某个动作视频 | `tools/README.md`、`assets/animations/README.md` | 使用 `replace_action_video.py` 生成资源，检查 manifest |
| 重新处理一批视频 | `tools/process_pet_videos.py` | 运行脚本并检查 `loop.json`/manifest |
| 调整资源画质 | `tools/build_quality_previews.py` | 生成预览，确认后再替换正式帧 |
| 修改 Windows 便携版打包 | `electron-app/README.md` | `build-electron-win.ps1` |
| 修改 Windows 安装包 | `electron-app/README.md` | `build-installer-win.ps1`、`build/installer.nsh`、`package.json` |
| 修改测试 | `electron-app/test/README.md` | `test/*.test.cjs` |

## 修改前检查清单

1. 看根 `README.md` 和 `docs/PROJECT_MAP.md` 确认目录职责。
2. 看目标目录 README。
3. 用 `rg` 搜索具体函数、IPC channel、脚本参数或动作名。
4. 确认是否会影响打包资源、运行资源和测试。
5. 完成改动后运行与范围匹配的验证命令。

## 常用搜索词

| 目标 | 搜索词 |
| --- | --- |
| IPC 通道 | `pet:`、`ipcMain`、`desktopPet` |
| 宠物状态 | `activeState`、`selectedState`、`states` |
| 动作资源 | `transparent_frames`、`loop.json`、`animationPrefix` |
| 行走 | `advanceWalkStep`、`walkLoop`、`WALK_` |
| 悬停面板 | `hover`、`HOVER_` |
| 右键菜单 | `menu`、`quick-menu` |
| 气泡 | `bubble`、`startupBubble` |
| 自启动 | `autoStart`、`WINDOWS_STARTUP_RUN_KEY` |
| 窗口漫游/贴靠 | `windowRoam`、`windowSurface`、`dock` |
| 变体 | `PetVariant`、`pet_variant.json`、`buildPetRuntimeConfig` |

## 验证建议

| 改动类型 | 建议验证 |
| --- | --- |
| 文档改动 | 链接路径检查、`git diff --stat` |
| `pet-variants.cjs` | `cd electron-app; npm.cmd test` |
| `walk-clock.cjs` | `cd electron-app; npm.cmd test` |
| `static` UI | `cd electron-app; npm.cmd start` 后人工检查窗口、菜单、悬停面板 |
| 打包脚本 | 在确认源码无误后运行对应 npm 脚本 |
| 资源处理脚本 | 先用单个动作和 `--keep-work` 验证，再批量运行 |

## 文档同步目标

改动完成后，按影响范围更新：

- 全局结构变化：`README.md`、`docs/PROJECT_MAP.md`
- 架构/数据流变化：`docs/ARCHITECTURE.md`
- 维护流程变化：`docs/MAINTENANCE.md`
- 当前状态/风险变化：`docs/STATUS.md`
- 目录职责变化：对应目录的 `README.md`
