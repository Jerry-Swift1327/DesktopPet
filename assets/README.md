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
  -> processed_frames (256px 增强素材池) + transparent_frames (运行帧) + loop.json + <variant>_actions_manifest.json
  -> electron-app/prepare-runtime-assets.cjs 或打包脚本
  -> Electron 运行时加载
```

正式运行时主要使用：

- `animations/<variant>_<action>/transparent_frames`
- `animations/<variant>_<action>/loop.json`
- `animations/<variant>_actions_manifest.json`

源视频、`processed_frames` 和中间帧用于维护、替换和重新生成资源。

## 当前变体

| 变体 | 说明 |
| --- | --- |
| `dog` | 默认狗狗资源 |
| `cat` | 默认猫咪资源 |
| `shorthair` | 英短资源 |
| `tabby` | 虎斑猫资源，包含额外动作 |
| `brit` | 英短双色资源 |
| `pomeranian` | 博美资源，当前用于 macOS 打包 |

## 修改注意

- 新增宠物变体时，目录命名应保持 `<variant>_<action>`。
- 新增动作类型时，需要同步 Electron 变体配置、主进程状态、渲染层动作按钮和打包脚本。
- 替换动作视频后，检查 `loop.json`、manifest 和正式 `transparent_frames` 是否一致。
- 不要把 `raw_frames`、`processed_frames`、`_replacement_work` 或质量预览输出当作运行时必需资源。
- `processed_frames` 和 `raw_frames` 已加入 `.gitignore`，不应提交到仓库。

相关说明见：

- `animations/README.md`
- `../tools/README.md`
- `../docs/PROJECT_MAP.md`
