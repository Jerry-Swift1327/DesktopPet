# Assets

本目录存放 Desktop-Pet 的资源文件，当前核心内容是宠物动作动画。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `animations` | 宠物动作视频、透明运行帧、循环元数据和变体 manifest |

## 资源流向

```text
动作源视频
  -> tools/process_pet_actions.py (process 或 replace 子命令)
  -> raw_frames (默认保留的抽帧中间产物) + processed_frames (256px 增强素材池) + transparent_frames (运行帧) + loop.json + <variant>_actions_manifest.json
  -> electron-app/prepare-runtime-assets.cjs 或打包脚本
  -> Electron 运行时加载
```

正式运行时主要使用：

- `animations/<variant>_<action>/transparent_frames`
- `animations/<variant>_<action>/loop.json`
- `animations/<variant>_actions_manifest.json`

源视频、`raw_frames`、`processed_frames` 和中间帧用于维护、替换和重新生成资源。`raw_frames` 默认保留，便于核对源帧分辨率和抠像前后差异；需要节省本地空间时可在处理命令中使用 `--clean-raw` 删除。

## 当前变体

| 变体 | 说明 |
| --- | --- |
| `dog` | 默认狗狗资源 |
| `cat` | 默认猫咪资源 |
| `shorthair` | 英短资源，历史变体 ID |
| `tabby` | 中华狸花猫资源，`tabby` 作为历史 ID 和花纹标签保留，包含额外动作 |
| `ragdoll` | 布偶猫资源，包含转圈、舔爪、伸展、劈叉和闲置动作 |
| `brit` | 英短双色资源 |
| `bshmitted` | 英短蓝色手套资源 |
| `van` | 英短红梵资源 |
| `pomeranian` | 博美资源，当前用于 macOS 打包 |
| `pet2610` | 定制狸花猫资源，包含基础动作和 `shake`、`yawn` 额外资源 |
| `pet2611` | 定制基础猫资源，包含基础动作和 `yawn` 额外资源 |

## 修改注意

- 新增定制宠物变体时，优先用 `npm.cmd run variant:bootstrap -- --scope custom --species cat --tier basic --date YYYY-MM-DD --source <source-dir>` 生成 `pet<yy><seq>` ID、写入 V2 元数据并处理动作资源。
- 从外部目录手动复制已存在变体的源视频时，仍可使用 `npm.cmd run variant:rename-assets -- --id <id> --from <source-dir>` 统一重命名为 `<assetPrefix>_<action>.mp4`。
- 新增动作类型时，需要先注册动作池，再同步 Electron 状态、渲染层动作按钮和相关测试；bootstrap 会拒绝未知动作。
- 替换动作视频后，检查 `loop.json`、manifest 和正式 `transparent_frames` 是否一致。
- 不要把 `raw_frames`、`processed_frames`、`_replacement_work` 或质量预览输出当作运行时必需资源；`raw_frames` 默认保留但仍是本地中间产物。
- `processed_frames` 和 `raw_frames` 已加入 `.gitignore`，不应提交到仓库。

相关说明见：

- `animations/README.md`
- `../tools/README.md`
- `../docs/PROJECT_MAP.md`
