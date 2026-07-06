# Scripts

本目录存放 Electron 应用侧的维护脚本。

## 关键文件

| 文件 | 作用 |
| --- | --- |
| `variant-cli.cjs` | 查询变体、按 species/tier/date 筛选、新建 V2 变体、bootstrap 动作源视频和生成本地图鉴 |

## 使用方式

```powershell
cd electron-app
npm.cmd run variant:list
npm.cmd run variant:show -- --id pet2605
npm.cmd run variant:show -- --id pet2606
npm.cmd run variant:query -- --species cat --tier advanced
npm.cmd run variant:new -- --species cat --scope custom --tier basic --date 2026-07-06
npm.cmd run variant:bootstrap -- --scope custom --species cat --tier basic --date 2026-07-06 --source C:\path\to\source-videos
npm.cmd run variant:bootstrap -- --scope custom --species cat --tier basic --date 2026-07-06 --source C:\path\to\source-videos --apply
npm.cmd run variant:rename-assets -- --id pet2610 --from C:\path\to\source-videos
npm.cmd run variant:gallery
npm.cmd run variant:species
```

`variant:bootstrap` 默认 dry-run，只有传入 `--apply` 后才写入元数据、复制视频并调用 `../../tools/process_pet_actions.py`。源视频默认从 Downloads 查找，也可以用 `--source` 指定目录；视频名支持 `squat.mp4` 或 `<任意前缀>_squat.mp4`。未知动作会严格报错，需要先注册到动作池。

变体元数据使用 V2 字段：`species`、`scope`、`tier`、`notes`、`assetPrefix`、`actions.buttons`、`actions.assets` 和 `features.enable/disable`。`notes` 由 `scope + tier` 自动生成，custom 默认版本 `1.0`，internal 版本按当前最大 internal 版本递增。

## 修改注意

- 新增 CLI 子命令时同步更新 `../README.md`、`../../docs/PROJECT_MAP.md` 和相关测试。
- `variant:bootstrap` 只负责编排；视频抽帧、抠像、循环选取和 manifest 写入仍由 `../../tools/process_pet_actions.py` 完成。
