# Chongban Devtools

内部维护宠物资源和元数据的独立 Electron 工具窗口。

## 启动

从应用工作区启动：

```powershell
cd electron-app
npm.cmd run devtools
```

## 当前范围

当前窗口支持新增宠物、宠物库、维护宠物和删除宠物。宠物库覆盖 `variant:list/show/query/check/gallery` 的可视化查询、检查和本地图鉴生成；新增宠物复用 `variant:bootstrap`；维护宠物包含批量动作资源替换、素材池生成、运行帧重选，以及带新增动作视频处理的结构化元数据编辑；删除能力只允许 `scope: "test"` 的 `pettest<seq>` 测试宠物。打包控制仍不在这个窗口中提供。

## 新增宠物流程

1. 选择 `scope`、`species`、`platforms` 和 `date`。
2. 在主表单中选择动作和功能；功能默认只启用 `autoStart`，`windowDocking` 和依赖它的 `windowRoam` 可按需开启；基础四个按钮动作默认固定包含，只有被选中的额外动作才会要求上传源视频。
3. 如果动作池中没有需要的动作，在“注册新动作”板块输入纯英文小驼峰 `actionKey` 和 `label`，选择播放一次、指定分钟或持续循环。系统生成 `petXxx` stateId，注册后自动加入当前宠物。
4. 选择源视频文件夹，或在每个动作卡片上手动选择 `.mp4` 文件。
5. 每个动作卡片都可以选择运行帧段模式（完整帧、自动选取或手动范围）并逐动作设置“允许清理离散组件”。清理开关初值来自全局动作注册表，默认参数为 `maxArea=256`、`maxSpan=32`、`minGap=0`。
6. 点击“生成预览”并检查元数据草稿、视频复制目标、处理命令、预检命令和警告。
7. 二次确认后点击“开始生成”执行生成。

工具会把选中的视频暂存到 `electron-app/.devtools-staging/`，再把暂存目录交给现有的 `variant:bootstrap` 流程处理。该暂存目录已被 `.gitignore` 忽略。

## 宠物库

1. 按 `species`、`scope` 和 `date` 筛选宠物列表。
2. 选择宠物后查看摘要、资源路径和 manifest 信息。
3. 点击“检查资源”查看动作目录、manifest、Windows release/installer 输出路径和已存在资源。
4. 点击“生成图鉴”写入 `electron-app/.variant-gallery/index.html`，再点击“打开图鉴”从系统浏览器查看。主进程只允许打开这个 Devtools 生成的固定文件。

## 维护宠物流程

1. 在“维护宠物”中选择已有宠物。
2. “替换动作资源”直接显示当前变体已有动作，也会标出磁盘或 manifest 中存在但元数据未登记的孤立动作。为一个或多个动作选择新的 `.mp4`，分别设置运行帧范围和“允许清理离散组件”，生成批量替换预览后统一确认执行。已有 `loop.json` 中明确记录的清理开关优先于注册表默认值，本次界面选择优先级最高。底层按顺序调用 `tools/process_pet_actions.py replace` 更新动作资源和 manifest。
3. “注册新动作”板块与新增宠物页共用全局动作注册能力；注册成功后自动加入当前维护宠物，并显示对应源视频卡片。
4. 修改信息/元数据时编辑 `species`、`version` 和 notes，并通过 `actions.enabled` 多选及功能列表维护变体能力。
5. 新勾选的动作会显示在“新增动作源视频”卡片区。每个新增动作都必须选择 `.mp4`，并可覆盖运行帧模式和离散组件清理开关；元数据预览会同时列出字段 diff 和动作处理命令。新增动作使用 `process --variant <assetPrefix> --actions <action> --video <source>` 创建资源目录、帧、`loop.json` 和 manifest 条目；已有动作替换继续使用 `replace`。
6. 确认元数据修改后，工具先处理全部新增动作视频；全部成功后才写入 `electron/pet-variant-metadata.json`。视频处理失败不会提前写入元数据。
7. 修改信息前可点击“取消修改并清空记录”恢复当前宠物元数据草稿，并清空新增动作视频选择、diff 和执行记录。
8. 动作卡片中的“删除资源”会先预览动作目录、manifest 条目和动作级元数据变更，确认后同步删除资源目录、manifest 条目、`actions` 声明、`actionLabelOverrides` 与 `actionStatEffects`。四个系统必需动作、仍被功能依赖的动作以及被其他变体共用的动作资源禁止删除。
9. “素材池管理”使用动作目录内标准 `<actionName>.mp4` 仅生成 `processed_frames`，不上传或替换视频，也不改 `transparent_frames`、`loop.json` 和 manifest。
10. “重新选择运行帧”可浏览带 `frame_000` 索引的素材池、放大查看、任意多选，并在预览后按索引升序重建 `transparent_frames`，同步写入 `loop.json` 和 manifest。缺少素材池时只读展示当前运行帧。
11. `yawn` 动作卡片提供“末帧休眠（5 分钟）”选项；开启时保留现有运行逻辑：末帧冻结，5 分钟后切换到 `walk`。使用 `direction64` 或 `tailLoopStart` 的专属动作在替换、素材池和运行帧维护中均为只读。

所有导航页分别记忆滚动锚点和焦点，按钮、下拉框、复选框、任务进度与日志更新后保持当前位置；切换页面后再次返回会恢复该页面上次位置。

## 删除宠物

“删除宠物”只允许删除 `scope: "test"` 的 `pettest<seq>` 测试宠物。预览会列出将删除的 metadata、`assets/animations/<assetPrefix>_*`、manifest、开发态 `.user-data/<variant>`；只有 `.runtime-assets/pet_variant.json` 当前指向被删宠物时，才会同时清理 `.runtime-assets`。

## 失败行为

执行失败时会停在失败阶段，并保留当前日志。工具不会自动删除已经处理出的帧、manifest 或图鉴输出。新增动作维护会在视频全部处理成功后才写元数据，但多个视频中途失败时，先前动作已经生成的资源仍会保留。

如果元数据已经写入，而后续阶段失败，再次生成同一个 id 前需要先手动清理这个半成品变体。

## 打包边界

本目录不属于客户或上级交付包内容。正常 Electron 构建只包含 `electron/**/*`、`static/**/*`、`.runtime-assets/**/*` 和 `package.json`，不包含 `devtools/**/*`。
