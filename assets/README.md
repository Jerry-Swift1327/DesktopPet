# Assets

本目录存放 Desktop-Pet 的资源文件，当前核心资源是宠物动作动画。

## 目录结构

| 路径 | 作用 |
| --- | --- |
| `animations` | 宠物动作视频、透明运行帧、循环元数据和变体 manifest |

## 资源流向

```text
动作源视频 .mp4
  -> tools/process_pet_videos.py 或 tools/replace_action_video.py
  -> transparent_frames + loop.json + <variant>_actions_manifest.json
  -> electron-app/prepare-runtime-assets.ps1 或 build 脚本
  -> Electron 运行时加载
```

正式运行时主要使用：

- `animations/<variant>_<action>/transparent_frames`
- `animations/<variant>_<action>/loop.json`
- `animations/<variant>_actions_manifest.json`

源视频和中间帧用于维护、替换和重新生成资源。

## 修改注意

- 新增宠物变体时，目录命名应保持 `<variant>_<action>`。
- 新增动作类型时，需要同步 Electron 变体配置、主进程状态、渲染层动作按钮和打包脚本。
- 替换动作视频后，检查 `loop.json`、manifest 和正式 `transparent_frames` 是否一致。
- 不要把 `raw_frames` 或 `_replacement_work` 当作运行时必需资源。

相关说明见：

- `animations/README.md`
- `../tools/README.md`
- `../docs/PROJECT_MAP.md`
