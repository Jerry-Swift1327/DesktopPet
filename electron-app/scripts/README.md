# Scripts

本目录存放 Electron 应用侧的维护脚本。

## 关键文件

| 文件 | 作用 |
| --- | --- |
| `prune-packaged-runtime.cjs` | 精简已生成的 Windows Electron 运行时产物，默认只保留 `locales/zh-CN.pak` |
| `variant-cli.cjs` | 查询变体、按 species/tier/date/scope 筛选、新建 V2 变体、bootstrap 动作源视频、资源检查、维护预览/应用纯函数和生成本地图鉴 |

## 使用方式

```powershell
cd electron-app
npm.cmd run variant:list
npm.cmd run variant:show -- --id pet2605
npm.cmd run variant:show -- --id pet2606
npm.cmd run variant:query -- --species cat --tier advanced
npm.cmd run variant:new -- --species cat --scope custom --tier basic --date 2026-07-06
npm.cmd run variant:new -- --species cat --scope test --tier basic --date 2026-07-06
npm.cmd run variant:bootstrap -- --scope custom --species cat --tier basic --date 2026-07-06 --source C:\path\to\source-videos
npm.cmd run variant:bootstrap -- --scope custom --species cat --tier basic --date 2026-07-06 --source C:\path\to\source-videos --apply
npm.cmd run variant:rename-assets -- --id pet2610 --from C:\path\to\source-videos
npm.cmd run variant:gallery
npm.cmd run variant:species
node scripts/prune-packaged-runtime.cjs --root installer/win-unpacked
```

`prune-packaged-runtime.cjs` 只处理已生成的打包目录，不修改 `node_modules/electron/dist` 或源资源；如果目标目录缺少 `locales/zh-CN.pak` 会直接报错，避免生成语言资源不完整的 Windows 产物。

`variant:bootstrap` 默认 dry-run，只有传入 `--apply` 后才写入元数据、复制视频并调用 `../../tools/process_pet_actions.py`。源视频默认从 Downloads 查找，也可以用 `--source` 指定目录；视频名支持 `squat.mp4` 或 `<任意前缀>_squat.mp4`。未知动作会严格报错，需要先注册到动作池。

bootstrap 会按动作池的 `processPreset` 组装资源处理参数：`grounded` 和 `nearSquat` 默认启用 `--stable-ground`，清理底部小型离散残点并按稳定主体底线对齐；`nearSquat` 仍会额外对齐到同变体 squat；`direction64` 保持方向采样，不做稳定贴地强修。

变体元数据使用 V2 字段：`species`、`scope`、`tier`、`notes`、`assetPrefix`、`actions.buttons`、`actions.assets` 和 `features.enable/disable`。`notes` 由 `scope + tier` 自动生成，custom 和 test 默认版本 `1.0`，internal 版本按当前最大 internal 版本递增。正式变体 ID 使用 `pet<yy><seq>`；测试变体必须使用独立的 `pettest<seq>`，且不会影响正式 ID 序列。

`variant-cli.cjs` 还导出维护中心复用的纯函数：资源检查结果、动作源视频重命名计划/应用、动作替换计划、元数据编辑 diff 预览/应用、测试变体删除预览/应用。删除函数只允许 `scope: "test"` 变体，并在应用前校验删除路径位于允许的资源根目录内。

## 修改注意

- 新增 CLI 子命令时同步更新 `../README.md`、`../../docs/PROJECT_MAP.md` 和相关测试。
- `variant:bootstrap` 只负责编排；视频抽帧、抠像、循环选取和 manifest 写入仍由 `../../tools/process_pet_actions.py` 完成。
