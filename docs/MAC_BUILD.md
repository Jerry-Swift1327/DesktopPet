# macOS 打包说明

本项目的 macOS 安装包必须在 macOS 终端生成。Windows 本机只能做脚本语法和资源检查。

## 同时生成 arm64 和 x64

不确定目标 Mac 架构时，直接生成两个 DMG：

```bash
cd /path/to/DesktopPet/electron-app
npm install
npm run installer:mac -- --pet-variant=pomeranian
```

产物目录：

```bash
electron-app/mac_installer/pomeranian/arm64
electron-app/mac_installer/pomeranian/x64
```

DMG 名称：

```bash
宠伴 1.0.dmg
```

DMG 挂载窗口标题：

```bash
宠伴 1.0
```

App 名称：

```bash
宠伴 1.0.app
```

## 单独生成某个架构

Apple Silicon Mac，也就是 M1/M2/M3/M4：

```bash
npm run installer:mac -- --pet-variant=pomeranian --arch=arm64
```

Intel Mac：

```bash
npm run installer:mac -- --pet-variant=pomeranian --arch=x64
```

macOS 图标使用：

```bash
electron-app/build/app_icon.icns
```

## dmgbuild 下载失败时

如果 `.app` 已生成但 `.dmg` 因 `dmgbuild-bundle` 下载失败中断，先重试一次：

```bash
cd /path/to/DesktopPet/electron-app
npm run installer:mac -- --pet-variant=pomeranian
```

仍失败时，清理 electron-builder 缓存后再试：

```bash
rm -rf .mac-builder-cache
npm run installer:mac -- --pet-variant=pomeranian
```

如果需要临时兜底，可以用 macOS 自带 `hdiutil` 基于已生成的 `.app` 生成 DMG。以 arm64 为例：

```bash
cd /path/to/DesktopPet/electron-app/mac_installer/pomeranian/arm64
APP_PATH="$(find . -type d -name '*.app' -print -quit)"
hdiutil create -volname "宠伴 1.0" -srcfolder "$APP_PATH" -ov -format UDZO "宠伴 1.0.dmg"
```

x64 时进入 `mac_installer/pomeranian/x64` 执行同一条 `hdiutil` 命令。

生成后先在同架构 Mac 上双击 `.app` 或挂载 `.dmg` 做冒烟测试。

## 用户数据目录

macOS 打包版本的用户数据目录：

```bash
~/Library/Application Support/Chongban 1.0/pomeranian
```

用户把 `.app` 放入废纸篓时，macOS 不会自动删除该目录。如需彻底清理本地数据，可手动删除上面的目录；如果 `Chongban 1.0` 下已经没有其他宠物数据，也可以删除 `~/Library/Application Support/Chongban 1.0`。
