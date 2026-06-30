// 宠物主窗口生命周期与位置包装控制器，持有 petWindow 运行态。
// 从 main.cjs 提取，依赖通过 createPetWindowController(context) 工厂注入；
// 函数实现与 main.cjs 保持一致，不修改控制流与逻辑。
//
// 本控制器持有宠物主窗口对象（petWindow），暴露 getPetWindow 只读访问器；
// 不直接 require electron/fs/path，不注册 IPC，不直接访问窗口/IPC/bubble 通道；
// 所有副作用经 context 回调注入（createOverlayWindow、moveToStartPosition、sendPetState、
// showStartupBubble、repositionStartupBubbleWindow、recordUserOperation 等）。

function createPetWindowController(context) {
  const {
    BrowserWindow,
    createOverlayWindow,
    path,
    __dirname,
    getAppPageUrl,
    getAppIconPath,
    log,
    process,
    screen,
    getPetWindowWidth,
    getPetWindowHeight,
    getVisiblePetRectFromBounds,
    moveToStartPosition,
    sendPetState,
    showStartupBubble,
    repositionStartupBubbleWindow,
    recordUserOperation,
    clamp,
    VISIBLE_SIDE_GAP,
    VISIBLE_TOP_GAP,
    VISIBLE_BOTTOM_GAP
  } = context;

  let petWindow = null;

  function getPetWindow() {
    return petWindow;
  }

  function createPetWindow() {
    log("creating pet window");
    petWindow = createOverlayWindow({
      BrowserWindow, path, __dirname, getAppPageUrl, getAppIconPath, log, process,
      hash: "pet",
      width: getPetWindowWidth(),
      height: getPetWindowHeight(),
      skipTaskbar: false,
      movable: true,
      focusable: true,
      onDidFailLoad: (_event, errorCode, errorDescription, validatedURL) => {
        log(`pet did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
      },
      onReady: () => {
        log("pet window ready-to-show");
        moveToStartPosition(false);
        petWindow.show();
        if (process.platform === "darwin") {
          moveToStartPosition(false);
        }
        sendPetState();
        showStartupBubble();
      }
    });
  }

  function ensurePetWindow() {
    if (!petWindow || petWindow.isDestroyed()) {
      createPetWindow();
      return;
    }
    petWindow.show();
    sendPetState();
  }

  function handleHidePet() {
    recordUserOperation();
    petWindow?.hide();
  }

  function setPetWindowPosition(x, y) {
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }
    petWindow.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: getPetWindowWidth(),
      height: getPetWindowHeight()
    }, false);
    repositionStartupBubbleWindow();
  }

  function clampPetWindowPosition(x, y) {
    const windowWidth = getPetWindowWidth();
    const windowHeight = getPetWindowHeight();
    const pointRect = {
      x: Math.round(x),
      y: Math.round(y),
      width: windowWidth,
      height: windowHeight
    };
    const area = screen.getDisplayMatching(pointRect).workArea;
    const visibleRect = getVisiblePetRectFromBounds(pointRect);
    const minX = x + area.x + VISIBLE_SIDE_GAP - visibleRect.x;
    const maxX = x + area.x + area.width - VISIBLE_SIDE_GAP - (visibleRect.x + visibleRect.width);
    const minY = y + area.y + VISIBLE_TOP_GAP - visibleRect.y;
    const maxY = y + area.y + area.height - VISIBLE_BOTTOM_GAP - (visibleRect.y + visibleRect.height);
    return {
      x: clamp(Math.round(x), Math.round(minX), Math.round(maxX)),
      y: clamp(Math.round(y), Math.round(minY), Math.round(maxY))
    };
  }

  return {
    getPetWindow,
    createPetWindow,
    ensurePetWindow,
    handleHidePet,
    setPetWindowPosition,
    clampPetWindowPosition
  };
}

module.exports = { createPetWindowController };
