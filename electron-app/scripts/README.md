# Scripts

本目录存放 Electron 应用侧的维护脚本。

## 关键文件

| 文件 | 作用 |
| --- | --- |
| `variant-cli.cjs` | 查询变体、按品种和日期筛选、新建定制变体、复制并重命名动作源视频 |

## 使用方式

```powershell
cd electron-app
npm.cmd run variant:list
npm.cmd run variant:show -- --id tabby
npm.cmd run variant:show -- --id bsh-2602
npm.cmd run variant:query -- --breed bsh
npm.cmd run variant:new -- --breed lihua --date 2026-06-30
npm.cmd run variant:rename-assets -- --id lihua-2602 --from C:\path\to\source-videos
```

新增变体时，`variant:new` 只写入精简元数据并生成 `<breed>-<yy><seq>` id；新变体默认 `aliases: []`。`aliases` 只用于人工查询、CLI 输入兼容和历史名称兼容，命令内部都会解析为真实 id。动作视频进入项目前后续用 `variant:rename-assets` 复制到 `assets/animations/<id>_<action>/<id>_<action>.mp4`。

## 修改注意

- 新增 CLI 子命令时同步更新 `../README.md`、`../../docs/PROJECT_MAP.md` 和相关测试。
- 脚本默认不处理视频帧；视频抽帧和抠像仍由 `../../tools/process_pet_actions.py` 完成。
