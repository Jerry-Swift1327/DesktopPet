# macOS 打包说明

本项目的 macOS 安装包必须在 macOS 终端生成。Windows 本机只能做脚本语法和资源检查。

## 标准 DMG 构建

```bash
cd /path/to/DesktopPet/electron-app
npm install
npm run installer:mac -- --pet-variant=pomeranian --arch=arm64
```

Intel Mac 改用：

```bash
npm run installer:mac -- --pet-variant=pomeranian --arch=x64
```

产物目录：

```bash
electron-app/mac_installer/pomeranian
```

构建脚本会先生成 `.runtime-assets`，再调用 electron-builder 生成 `.app` 和 `.dmg`。macOS 图标使用：

```bash
electron-app/build/app_icon.icns
```

## dmgbuild 下载失败时

如果 `.app` 已生成但 `.dmg` 因 `dmgbuild-bundle` 下载失败中断，先重试一次：

```bash
cd /path/to/DesktopPet/electron-app
npm run installer:mac -- --pet-variant=pomeranian --arch=arm64
```

仍失败时，清理 electron-builder 缓存后再试：

```bash
rm -rf .mac-builder-cache
npm run installer:mac -- --pet-variant=pomeranian --arch=arm64
```

如果交付时间紧，可以用 macOS 自带 `hdiutil` 基于已生成的 `.app` 兜底生成 DMG：

```bash
cd /path/to/DesktopPet/electron-app/mac_installer/pomeranian
APP_PATH="$(find . -type d -name '*.app' -print -quit)"
hdiutil create -volname "宠伴 Pomeranian" -srcfolder "$APP_PATH" -ov -format UDZO "宠伴 Pomeranian-pomeranian-installer-arm64.dmg"
```

生成后先在客户同架构 Mac 上双击 `.app` 或挂载 `.dmg` 做冒烟测试。
