// overlay 窗口公共创建 helper，归纳 BrowserWindow 选项和后处理。
// 由 main.cjs 中 createPetWindow/createStartupBubbleWindow/createMenuWindow/
// createHoverWindow/createCustomizationWindow 共享，差异通过参数注入。

function createOverlayWindow({
  BrowserWindow,
  path,
  __dirname,
  getAppPageUrl,
  getAppIconPath,
  log,
  process,
  hash,
  width,
  height,
  focusable = false,
  movable = false,
  frame = false,
  transparent = true,
  hasShadow = false,
  backgroundColor = "#00000000",
  title = null,
  minimizable = true,
  maximizable = true,
  onReady = null,
  onClose = null,
  onBlur = null,
  onDidFailLoad = null,
  skipTaskbar = true
}) {
  // 获取应用图标，缺失时回退 undefined 让 Electron 使用默认图标
  const iconPath = getAppIconPath();

  // 合并公共选项与差异参数创建 BrowserWindow
  const window = new BrowserWindow({
    title: title,
    width: width,
    height: height,
    frame: frame,
    transparent: transparent,
    resizable: false,
    movable: movable,
    hasShadow: hasShadow,
    skipTaskbar: skipTaskbar,
    alwaysOnTop: true,
    show: false,
    focusable: focusable,
    minimizable: minimizable,
    maximizable: maximizable,
    icon: iconPath || undefined,
    backgroundColor: backgroundColor,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  // 统一置顶层级：macOS 用 floating，其他平台用 screen-saver
  window.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver");

  // 加载对应 hash 页面，失败时记录日志
  window.loadURL(getAppPageUrl(hash)).catch((error) => {
    log(`${hash} window load failed: ${error.stack || error.message}`);
  });

  // 按需注册生命周期回调
  if (onReady) {
    window.once("ready-to-show", onReady);
  }
  if (onClose) {
    window.on("closed", onClose);
  }
  if (onBlur) {
    window.on("blur", onBlur);
  }
  if (onDidFailLoad) {
    window.webContents.on("did-fail-load", onDidFailLoad);
  }

  return window;
}

module.exports = { createOverlayWindow };
