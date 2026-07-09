# Chongban Devtools

内部维护宠物资源和元数据的独立 Electron 工具窗口。

## 启动

从应用工作区启动：

```powershell
cd electron-app
npm.cmd run devtools
```

## 当前范围

当前窗口支持新增宠物、宠物库、维护宠物和删除宠物。宠物库覆盖 `variant:list/show/query/check/gallery` 的可视化查询、检查和本地图鉴生成；新增宠物复用 `variant:bootstrap`；维护宠物包含动作资源替换、`variant:rename-assets` 批量导入、结构化元数据编辑 diff 预览与确认写入；删除能力只允许 `scope: "test"` 的 `pettest<seq>` 测试宠物。单独视频处理和打包控制仍不在这个窗口中提供。

## 新增宠物流程

1. 选择 `scope`、`tier`、`species`、`platforms` 和 `date`。
2. 在主表单中选择动作和功能；`windowDocking` 是独立的拖拽吸附窗口开关，`windowRoam` 依赖它；基础四个按钮动作默认固定包含，只有被选中的额外动作才会要求上传源视频。
3. 选择源视频文件夹，或在每个动作卡片上手动选择 `.mp4` 文件。
4. 每个动作卡片都可以选择运行帧段模式：完整帧、自动选取或手动范围，默认使用完整帧。
5. 点击“生成预览”生成预览。
6. 检查元数据草稿、视频复制目标、处理命令、预检命令和警告。
7. 二次确认后点击“开始生成”执行生成。

工具会把选中的视频暂存到 `electron-app/.devtools-staging/`，再把暂存目录交给现有的 `variant:bootstrap` 流程处理。该暂存目录已被 `.gitignore` 忽略。

## 宠物库

1. 按 `species`、`tier`、`scope` 和 `date` 筛选宠物列表。
2. 选择宠物后查看摘要、资源路径和 manifest 信息。
3. 点击“检查资源”查看动作目录、manifest、Windows release/installer 输出路径和已存在资源。
4. 点击“生成图鉴”写入 `electron-app/.variant-gallery/index.html`，再点击“打开图鉴”从系统浏览器查看。主进程只允许打开这个 Devtools 生成的固定文件。

## 维护宠物流程

1. 在“维护宠物”中选择已有宠物。
2. 替换资源时选择动作和新的 `.mp4`，设置运行帧段模式，生成替换预览后确认执行。动作下拉包含当前变体已配置动作和动作池中的已知动作（例如尚未写入 metadata 的 `yawn`），便于先导入/替换资源后再更新 `actions.assets`。底层调用 `tools/process_pet_actions.py replace` 更新动作资源和 manifest。
3. 批量导入动作源视频时选择源文件夹，生成 `rename-assets` 复制预览后确认执行。
4. 修改信息/元数据时通过下拉、多选和 notes 标准项/自定义输入编辑 `species`、`tier`、`notes`、动作列表和功能列表。工具会先生成 diff 预览；若动作列表引用缺失的资源目录，或启用 `idleYawn` 但没有可用 `yawn` 动作资源，会阻止写入并提示先替换或生成资源。
5. 修改信息前可点击“取消修改并清空记录”恢复当前宠物元数据草稿，并清空 diff 和执行记录。
6. 确认 diff 后再写入 `electron/pet-variant-metadata.json`。

## 删除宠物

“删除宠物”只允许删除 `scope: "test"` 的 `pettest<seq>` 测试宠物。预览会列出将删除的 metadata、`assets/animations/<assetPrefix>_*`、manifest、开发态 `.user-data/<variant>`；只有 `.runtime-assets/pet_variant.json` 当前指向被删宠物时，才会同时清理 `.runtime-assets`。

## 失败行为

执行失败时会停在失败阶段，并保留当前日志。工具不会自动删除已经写入的元数据、复制的视频、处理出的帧、manifest 或图鉴输出。

如果元数据已经写入，而后续阶段失败，再次生成同一个 id 前需要先手动清理这个半成品变体。

## 打包边界

本目录不属于客户或上级交付包内容。正常 Electron 构建只包含 `electron/**/*`、`static/**/*`、`.runtime-assets/**/*` 和 `package.json`，不包含 `devtools/**/*`。
