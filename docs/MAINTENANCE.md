# Documentation Maintenance

本文件说明公开文档的维护规则。除根目录 `AGENTS.md` 外，仓库中的 Markdown 都应面向开源社区浏览者，介绍项目、目录、脚本和使用方式。

## 文档分层

| 文档 | 读者 | 内容 |
| --- | --- | --- |
| `README.md` | 首次进入仓库的用户和贡献者 | 项目介绍、运行、测试、打包、目录结构 |
| `docs/PROJECT_MAP.md` | 贡献者 | 目录职责、关键文件和常见修改入口 |
| `docs/ARCHITECTURE.md` | 需要理解系统设计的贡献者 | 运行链路、IPC、资源加载、状态数据 |
| `docs/MAC_BUILD.md` | 需要生成 macOS 包的贡献者 | macOS 打包命令、输出目录和故障处理 |
| 各目录 `README.md` | 准备修改该目录的贡献者 | 同目录文件职责、运行方式和注意事项 |
| `AGENTS.md` | 自动化协作者和维护者 | 操作约束、阅读范围、验证和提交要求 |

## 同步规则

| 改动类型 | 需要检查 |
| --- | --- |
| 新增或删除顶层目录 | `README.md`、`docs/PROJECT_MAP.md` |
| 修改 Electron 主进程能力 | `docs/ARCHITECTURE.md`、`electron-app/electron/README.md` |
| 修改渲染层 UI 或交互 | `electron-app/static/README.md` |
| 新增 IPC 通道 | `docs/ARCHITECTURE.md`、`electron-app/electron/README.md`、`electron-app/static/README.md` |
| 新增宠物变体或动作 | `assets/README.md`、`assets/animations/README.md`、`electron-app/electron/README.md`、`electron-app/test/README.md` |
| 修改资源处理脚本 | `tools/README.md`、`assets/animations/README.md` |
| 修改构建或安装脚本 | `README.md`、`electron-app/README.md`、`docs/PROJECT_MAP.md` |
| 修改测试命令或测试覆盖 | `README.md`、`electron-app/test/README.md` |
| 修改文档维护规则 | 本文件和 `AGENTS.md` |

## 目录 README 建议结构

新增核心目录时，建议补充 README，并使用下面的简洁结构：

```md
# Directory Name

## 作用

说明这个目录负责什么。

## 关键文件

| 文件 | 作用 |
| --- | --- |

## 使用方式

列出必要命令或入口。

## 修改注意

说明修改该目录时需要同步检查的文件。
```

## 不应写入公开文档的内容

以下内容不应放入常规公开文档：

- 交接记录。
- 临时排查过程。
- 功能开发进度清单。
- 面向单个本机环境的路径或账号信息。
- 只给自动化工具看的操作提示。

确实需要保留时，放入 `.gitignore` 已忽略的位置，例如 `.codex-temp/` 或 `.tmp/`。

## 提交前检查

文档改动提交前建议执行：

```powershell
rg -n "交接|进度|New project|DesktopPetPackage"
git diff --stat
cd electron-app
npm.cmd test
```

如果新增可再生成目录、安装包、缓存或临时文档，同步检查 `.gitignore`。
