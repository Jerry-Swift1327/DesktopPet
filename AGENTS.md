# AGENTS.md

本文件用于约束自动化协作者和维护者在本仓库中的操作方式，目标是减少误改、漏改和由上下文混乱造成的 bug。

## 12 条操作规则

1. 先判断需求影响范围，再阅读对应目录的 README、相关配置和必要源码；不要为了“了解项目”而全局扫描全部文件。
2. 修改前明确假设、边界和可能影响的目录；如果需求存在多种解释，先向用户确认。
3. 只修改与当前需求直接相关的文件，不做顺手重构、格式化或风格迁移。
4. 优先沿用项目已有命名、脚本、目录结构和测试方式，避免引入不必要的新抽象。
5. 变更运行、构建、打包、依赖、资源生成、目录结构或公开 API 时，必须同步检查相关 README 和 `docs/` 文档。
6. 新增依赖、缓存、构建输出、安装包、临时目录、交接文档或进度文档时，必须检查并按需更新 `.gitignore`，避免提交可再生成或本地专用内容。
7. 公开文档必须面向开源社区浏览者，说明项目、目录、脚本和使用方式；不要写成交接记录、开发进度或 AI 提示。
8. 如确实需要临时交接、排查记录或功能进度文档，放入 `.gitignore` 已忽略的位置，不纳入提交。
9. 修改逻辑代码时补充或更新与风险匹配的测试；只改文档时也要运行项目现有测试，除非依赖缺失或环境不支持，并说明原因。
10. 不提交密钥、用户私有路径、本机缓存、日志、依赖目录、运行时用户数据或打包产物。
11. 完成修改后给出清晰的验证结果、文档同步情况和是否更新 `.gitignore` 的说明。
12. 每次变更结束时提供规范中文提交信息，建议格式为 `类型: 简短说明`，例如 `docs: 优化开源文档和协作规则`。

## 常用范围定位

| 需求类型 | 优先阅读 |
| --- | --- |
| 项目入口、运行、打包、安装 | `README.md`、`electron-app/README.md`、`electron-app/package.json` |
| Electron 主进程、窗口、IPC、系统能力 | `docs/ARCHITECTURE.md`、`electron-app/electron/README.md` |
| 渲染层 UI、菜单、悬停面板、气泡 | `electron-app/static/README.md` |
| 宠物变体、动作资源、manifest | `assets/README.md`、`assets/animations/README.md`、`electron-app/electron/pet-variants.cjs` |
| 视频抽帧、抠像、动作替换、画质预览 | `tools/README.md` |
| 测试 | `electron-app/test/README.md`、`electron-app/package.json` |
| 文档同步规则 | `docs/MAINTENANCE.md`、`docs/PROJECT_MAP.md` |

## 变更后检查

- 运行与改动范围匹配的验证命令，默认至少执行 `cd electron-app; npm.cmd test`。
- 用 `rg` 检查被删除或改名文档是否仍被引用。
- 用 `git diff --stat` 确认变更范围符合需求。
- 若新增大体积或可再生成文件，确认 `.gitignore` 已覆盖。
- 最终回复中给出建议中文提交信息。
