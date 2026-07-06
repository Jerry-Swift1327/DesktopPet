# Chongban Devtools

内部维护宠物变体的独立 Electron 工具窗口。

## 启动

从应用工作区启动：

```powershell
cd electron-app
npm.cmd run devtools
```

## 当前范围

第一版只支持新增变体。替换视频、单独处理视频、图鉴管理和打包控制暂不在这个窗口中提供。

## 新增变体流程

1. 选择 `scope`、`tier`、`species`、`platforms` 和 `date`。
2. 选择源视频文件夹，或在每个动作卡片上手动选择 `.mp4` 文件。
3. 点击“生成预览”生成预览。
4. 检查元数据草稿、视频复制目标、处理命令、预检命令和警告。
5. 二次确认后点击“开始生成”执行生成。

工具会把选中的视频暂存到 `electron-app/.devtools-staging/`，再把暂存目录交给现有的 `variant:bootstrap` 流程处理。该暂存目录已被 `.gitignore` 忽略。

## 失败行为

执行失败时会停在失败阶段，并保留当前日志。工具不会自动删除已经写入的元数据、复制的视频、处理出的帧、manifest 或图鉴输出。

如果元数据已经写入，而后续阶段失败，再次生成同一个 id 前需要先手动清理这个半成品变体。

## 打包边界

本目录不属于客户或上级交付包内容。正常 Electron 构建只包含 `electron/**/*`、`static/**/*`、`.runtime-assets/**/*` 和 `package.json`，不包含 `devtools/**/*`。
