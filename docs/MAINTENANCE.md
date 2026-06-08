# Maintenance

本文件定义 Desktop-Pet 的文档维护规则，目标是让后续功能开发、优化和 bug 修复可以快速定位相关文件，并在改动后保持文档可信。

## 文档分层

| 文档 | 目标读者 | 更新时机 |
| --- | --- | --- |
| `README.md` | 人类维护者和首次进入项目的 AI | 项目入口、运行方式、目录结构变化 |
| `docs/PROJECT_MAP.md` | AI 和维护者 | 文件/目录职责、生成产物、关键入口变化 |
| `docs/AI_GUIDE.md` | 后续 AI | 新增功能域、新增常见需求、定位路径变化 |
| `docs/ARCHITECTURE.md` | 需要理解系统的人或 AI | 主链路、数据流、IPC、变体、状态模型变化 |
| `docs/STATUS.md` | 项目维护者 | 当前进度、风险点、后续建议变化 |
| 各目录 `README.md` | 进入该目录修改的人或 AI | 目录内文件职责、常见修改场景变化 |

## 修改后同步规则

| 改动类型 | 必查文档 |
| --- | --- |
| 新增或删除顶层目录 | `README.md`、`docs/PROJECT_MAP.md`、`docs/AI_GUIDE.md` |
| 新增 Electron 主进程能力 | `electron-app/electron/README.md`、`docs/ARCHITECTURE.md`、`docs/AI_GUIDE.md` |
| 新增渲染层 UI 或交互 | `electron-app/static/README.md`、`docs/AI_GUIDE.md` |
| 新增 IPC 通道 | `electron-app/electron/README.md`、`electron-app/static/README.md`、`docs/ARCHITECTURE.md` |
| 新增宠物变体 | `assets/animations/README.md`、`electron-app/electron/README.md`、`electron-app/test/README.md`、`docs/PROJECT_MAP.md` |
| 替换或新增动作资源 | `assets/animations/README.md`、`tools/README.md`、必要时 `docs/STATUS.md` |
| 修改构建/安装包脚本 | `electron-app/README.md`、`docs/PROJECT_MAP.md` |
| 修改测试入口或测试覆盖 | `electron-app/test/README.md` |
| 修改文档维护方式 | `docs/MAINTENANCE.md` |

## 目录 README 模板

新增核心目录时，建议加入 README，并使用以下结构：

```md
# Directory Name

## 作用

这个目录负责什么。

## 关键文件

| 文件 | 作用 | 常见修改场景 |
| --- | --- | --- |

## 修改注意

改这里时需要同步检查什么。

## 相关文档

- `../docs/PROJECT_MAP.md`
```

## 定期巡检建议

建议每周或每个功能批次结束后做一次轻量文档巡检：

1. 扫描关键目录是否缺 README。
2. 检查 README 中列出的文件是否仍存在。
3. 检查打包脚本、npm scripts、测试命令是否与文档一致。
4. 检查新增功能是否已经写入 `AI_GUIDE.md` 的定位表。
5. 检查 `STATUS.md` 是否仍反映当前进度。

## 不应纳入常规文档维护的目录

以下目录多为依赖、缓存、临时文件或打包产物，一般只在构建排查时查看：

- `electron-app/node_modules`
- `electron-app/.runtime-assets`
- `electron-app/.electron-builder-cache`
- `electron-app/.tmp`
- `electron-app/release`
- `electron-app/cat_release`
- `electron-app/shorthair_release`
- `electron-app/installer`
- `electron-app/cat_installer`
- `electron-app/shorthair_installer`
- `quality_previews`
- `tools/__pycache__`
- `assets/animations/*/raw_frames`
- `assets/animations/*/_replacement_work`

## 提交前建议

文档改动提交前至少执行：

```powershell
git diff --stat
git diff -- README.md docs electron-app/README.md assets tools
```

如果改动涉及代码逻辑，再按影响范围运行测试或手动启动应用。
