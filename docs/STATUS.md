# Status

本文件记录当前项目状态，帮助后续开发和 AI 协作快速理解进度。

## 当前状态

- 主应用是 Electron 桌面宠物，位于 `electron-app`。
- 主进程核心逻辑集中在 `electron-app/electron/main.cjs`。
- 渲染层入口集中在 `electron-app/static`。
- 宠物资源集中在 `assets/animations`，当前有 `dog`、`cat`、`shorthair` 三个变体。
- 当前动作命名约定为 `<variant>_squat`、`<variant>_walk`、`<variant>_feed`、`<variant>_ball`。
- 资源处理工具位于 `tools`。
- 测试位于 `electron-app/test`，当前覆盖宠物变体配置和行走时钟。

## 已有能力

- 透明宠物窗口。
- 宠物动作播放。
- 右键快捷菜单。
- 悬停状态面板。
- 启动/提示气泡。
- 拖拽移动。
- 滚轮缩放。
- 任务栏行走。
- Windows 窗口贴靠和窗口漫游。
- 亲密度、饱食度、健康值等状态。
- Windows 自启动能力。
- 多宠物变体打包。
- 视频抽帧、绿幕抠像、循环段选择和动作替换工具。
- 画质预览对比工具。

## 当前维护重点

- 通过文档索引减少后续 AI 全项目扫描。
- 保持 README 与真实目录、脚本和进度同步。
- 后续功能变更时优先补充小范围测试。
- 资源处理后要检查 `loop.json`、manifest 和运行帧是否一致。

## 已知注意点

- `electron-app/electron/main.cjs` 体量较大，多个功能域耦合在同一文件中，修改前需用搜索定位具体函数和常量。
- `electron-app/static/renderer.js` 和 `electron-app/static/styles.css` 是当前打包脚本复制的渲染入口；根目录同名旧入口文件已清理。
- `package.json`、主进程和部分 UI 文案中存在显示为乱码的中文字符串，当前文档不修复业务文本，仅记录现状。
- 当前交付安装包只保留最终 `.exe`，安装包目录中的 `win-unpacked`、`.blockmap`、`builder-debug.yml` 已不作为交付内容保留。
- `tools/process_pet_videos.py` 默认 `ACTIONS` 只覆盖狗狗动作，处理猫或英短资源时需要显式传入 `--actions` 并确认 manifest 名称。

## 建议后续优化

- 将 `main.cjs` 按窗口管理、资源加载、状态值、行走/贴靠、系统集成逐步拆分。
- 为 `static/renderer.js` 的关键 UI 模式增加更细的测试或快照检查。
- 增加文档巡检脚本，检查 README 中提到的关键文件是否存在。
- 梳理并修复乱码中文字符串，修复时同步检查安装包和 Windows 元数据。
- 如未来重新需要单文件便携启动器，应按当前 `Chongban/宠伴` 命名重新设计脚本，不要直接恢复旧 `PetMate/PawPal` 版本。
