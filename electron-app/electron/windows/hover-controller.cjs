// 悬停面板控制器，管理悬停面板的创建、显示、隐藏、定位、轮询和可见性更新。
// 从 main.cjs 提取的悬停面板逻辑，依赖通过 createHoverController(context) 注入；
// 函数实现与 main.cjs 保持一致，窗口创建复用 overlay-window.cjs 的 createOverlayWindow。

const { createOverlayWindow } = require("./overlay-window.cjs");

function createHoverController(context) {
  const {
    // Electron 与运行时
    BrowserWindow,
    path,
    __dirname,
    process,
    screen,
    // 应用基础
    getAppIconPath,
    getAppPageUrl,
    log,
    safeSend,
    buildPetConfig,
    // 宠物窗口与状态访问器
    getPetWindow,
    getActiveState,
    getCurrentSurface,
    getDragState,
    getMenuWindow,
    // 几何计算
    getOverlayPlacementRect,
    expandRect,
    getOverlayWorkArea,
    getOverlaySafeArea,
    getOverlayVisualGap,
    getOverlayVerticalOffset,
    getScaledHoverBodyHitPadding,
    getScaledHoverAvoidPadding,
    clamp,
    cloneRect,
    rectsOverlap,
    rectFitsInArea,
    clampPanelRect,
    pickBestOverlayCandidate,
    // 几何计算（从 overlay-geometry 注入）
    getHoverPosition,
    getHoverAnchorRect,
    getHoverHitRect,
    getHoverAvoidRect,
    getHoverBodyHitPaddingForState,
    // 宠物精灵
    getPetSpriteRect,
    getVisiblePetRect,
    getWindowRect,
    getState,
    getRenderedFrameVisibleRect,
    // 任务栏行走
    isTaskbarWalkActive,
    getTaskbarWalkOverlayPetRect,
    getTaskbarWalkRunway,
    // 光标检测
    isCursorInsidePetVisibleRect,
    isCursorInsideHoverIntentTarget,
    isCursorInsideSpriteRect,
    // bounds 工具
    isPointInsideRect,
    // 悬停面板辅助
    shouldSuppressHoverPanel,
    updatePetWindowMousePassthrough,
    updateMenuVisibilityFromCursor,
    // 交互暂停
    addInteractionPause,
    removeInteractionPause,
    // 窗口 bounds 辅助
    setFixedWindowBounds,
    // 其他窗口
    hideStartupBubble,
    hidePetMenu,
    repositionStartupBubbleWindow,
    repositionMenuWindow,
    // 诊断
    logWalkDiagnostic,
    // 常量
    HOVER_PANEL_WIDTH,
    HOVER_PANEL_HEIGHT,
    HOVER_PANEL_GAP_OFFSET,
    HOVER_PANEL_VERTICAL_OFFSET,
    HOVER_PANEL_SCALE_GAP_FACTOR,
    HOVER_POLL_INTERVAL_MS,
    HOVER_HIDE_DELAY_MS,
    HOVER_INTENT_DELAY_MS,
    TASKBAR_WALK_HOVER_INTENT_DELAY_MS,
    WALK_DIAGNOSTICS_ENABLED
  } = context;

  // 悬停相关状态（原 main.cjs 中的全局变量）
  let hoverWindow;
  let hoverWindowReady = false;
  let hoverAnchorRect = null;
  let hoverFrozenPetRect = null;
  let hoverHideTimer = null;
  let hoverIntentTimer = null;
  let hoverPollTimer = null;
  let isPointerOverHoverPanel = false;
  let isPointerOverPet = false;
  let lastHoverBounds = null;

  function clearHoverIntent({ keepFrozenRect = false } = {}) {
    if (hoverIntentTimer) {
      clearTimeout(hoverIntentTimer);
      hoverIntentTimer = null;
    }
    if (!keepFrozenRect && (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible())) {
      hoverFrozenPetRect = null;
    }
    removeInteractionPause("hover-intent");
  }

  function scheduleHideHoverPanel() {
    if (hoverHideTimer) {
      clearTimeout(hoverHideTimer);
    }
    hoverHideTimer = setTimeout(() => {
      hoverHideTimer = null;
      if (getDragState()) {
        hideHoverPanel();
        return;
      }
      if (isPointerOverPet || isPointerOverHoverPanel || isCursorInsidePetVisibleRect() || isCursorInsideHoverPanel()) {
        return;
      }
      hideHoverPanel();
    }, HOVER_HIDE_DELAY_MS);
  }

  function freezeHoverPetRect() {
    hoverFrozenPetRect = getHoverAnchorRect(null);
    return hoverFrozenPetRect;
  }

  function repositionHoverWindow() {
    if (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible()) {
      return;
    }
    setFixedWindowBounds(hoverWindow, getHoverPosition(), HOVER_PANEL_WIDTH, HOVER_PANEL_HEIGHT, "hover");
  }

  function isCursorInsideHoverPanel() {
    if (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible()) {
      return false;
    }
    return isPointInsideRect(screen.getCursorScreenPoint(), hoverWindow.getBounds());
  }

  function updateHoverVisibilityFromCursor() {
    updatePetWindowMousePassthrough();
    const cursorInsideSprite = isCursorInsideHoverIntentTarget();
    const menuVisible = getMenuWindow() && !getMenuWindow().isDestroyed() && getMenuWindow().isVisible();
    if (shouldSuppressHoverPanel()) {
      return;
    }
    if (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible()) {
      if (!getDragState() && !menuVisible && cursorInsideSprite && !hoverIntentTimer) {
        beginHoverFromPointer();
      } else if (!cursorInsideSprite) {
        isPointerOverPet = false;
        if (hoverIntentTimer) {
          clearHoverIntent();
        }
      }
      return;
    }
    const cursorInsideHover = isCursorInsideHoverPanel();
    if (cursorInsideSprite || isPointerOverHoverPanel || cursorInsideHover) {
      if (cursorInsideSprite) {
        isPointerOverPet = true;
      }
      if (hoverHideTimer) {
        clearTimeout(hoverHideTimer);
        hoverHideTimer = null;
      }
      return;
    }

    isPointerOverPet = false;
    if (!hoverHideTimer) {
      scheduleHideHoverPanel();
    }
  }

  function startHoverPolling() {
    if (hoverPollTimer) {
      return;
    }
    hoverPollTimer = setInterval(() => {
      if (!getPetWindow() || getPetWindow().isDestroyed()) {
        return;
      }
      updateMenuVisibilityFromCursor();
      updateHoverVisibilityFromCursor();
    }, HOVER_POLL_INTERVAL_MS);
  }

  function stopHoverPolling() {
    if (!hoverPollTimer) {
      return;
    }
    clearInterval(hoverPollTimer);
    hoverPollTimer = null;
  }

  function createHoverWindow() {
    // 通过 createOverlayWindow 统一创建 BrowserWindow，内部处理 setAlwaysOnTop 与 loadURL
    hoverWindow = createOverlayWindow({
      BrowserWindow, path, __dirname, getAppPageUrl, getAppIconPath, log, process,
      hash: "hover",
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT,
      movable: false,
      focusable: false,
      onReady: () => {
        hoverWindowReady = true;
        if (hoverWindow?.isVisible()) {
          safeSend(hoverWindow, "pet:hover-data", buildPetConfig());
        }
      },
      onBlur: () => {
        if (!isCursorInsideHoverPanel() && !isCursorInsideSpriteRect()) {
          scheduleHideHoverPanel();
        }
      },
      onClose: () => {
        removeInteractionPause("hover");
        removeInteractionPause("hover-intent");
        hoverWindow = null;
        hoverWindowReady = false;
        lastHoverBounds = null;
        isPointerOverHoverPanel = false;
      }
    });
  }

  function showHoverPanel() {
    if (!getPetWindow() || getPetWindow().isDestroyed() || getDragState()) {
      return;
    }
    if (shouldSuppressHoverPanel()) {
      return;
    }

    clearHoverIntent({ keepFrozenRect: true });
    addInteractionPause("hover");
    if (hoverHideTimer) {
      clearTimeout(hoverHideTimer);
      hoverHideTimer = null;
    }
    hideStartupBubble();
    hidePetMenu();
    hoverAnchorRect = hoverFrozenPetRect || freezeHoverPetRect();

    if (!hoverWindow || hoverWindow.isDestroyed()) {
      createHoverWindow();
    }

    setFixedWindowBounds(hoverWindow, getHoverPosition(hoverAnchorRect), HOVER_PANEL_WIDTH, HOVER_PANEL_HEIGHT, "hover");
    hoverWindow.showInactive();
    if (hoverWindowReady && !hoverWindow.webContents.isLoading()) {
      safeSend(hoverWindow, "pet:hover-data", buildPetConfig());
    }
  }

  function hideHoverPanel() {
    if (!hoverWindow || hoverWindow.isDestroyed()) {
      removeInteractionPause("hover");
      removeInteractionPause("hover-intent");
      hoverFrozenPetRect = null;
      return;
    }
    hoverWindow.hide();
    hoverAnchorRect = null;
    hoverFrozenPetRect = null;
    isPointerOverHoverPanel = false;
    removeInteractionPause("hover");
    removeInteractionPause("hover-intent");
  }

  function beginHoverFromPointer() {
    if (!isCursorInsideHoverIntentTarget()) {
      isPointerOverPet = false;
      clearHoverIntent();
      return;
    }
    isPointerOverPet = true;
    if (getDragState()) {
      hideHoverPanel();
      return;
    }
    if (hoverWindow && !hoverWindow.isDestroyed() && hoverWindow.isVisible()) {
      if (hoverHideTimer) {
        clearTimeout(hoverHideTimer);
        hoverHideTimer = null;
      }
      return;
    }
    if (!hoverIntentTimer) {
      scheduleHoverIntent();
    }
  }

  function scheduleHoverIntent() {
    clearHoverIntent();
    if (getDragState() || shouldSuppressHoverPanel() || !isCursorInsideHoverIntentTarget()) {
      return;
    }
    const taskbarWalkIntent = isTaskbarWalkActive();
    if (!taskbarWalkIntent) {
      addInteractionPause("hover-intent");
      freezeHoverPetRect();
    }
    const menuVisible = getMenuWindow() && !getMenuWindow().isDestroyed() && getMenuWindow().isVisible();
    if (menuVisible) {
      hoverFrozenPetRect = null;
      if (!taskbarWalkIntent) {
        removeInteractionPause("hover-intent");
      }
      return;
    }
    if (WALK_DIAGNOSTICS_ENABLED) {
      logWalkDiagnostic(`hover-intent schedule surface=${getCurrentSurface()?.type || "unknown"} activeState=${getActiveState()} taskbarWalk=${taskbarWalkIntent}`);
    }
    const intentDelayMs = taskbarWalkIntent ? TASKBAR_WALK_HOVER_INTENT_DELAY_MS : HOVER_INTENT_DELAY_MS;
    hoverIntentTimer = setTimeout(() => {
      hoverIntentTimer = null;
      if (getDragState() || shouldSuppressHoverPanel() || !isCursorInsideHoverIntentTarget()) {
        hoverFrozenPetRect = null;
        if (!taskbarWalkIntent) {
          removeInteractionPause("hover-intent");
        }
        return;
      }
      const nextMenuVisible = getMenuWindow() && !getMenuWindow().isDestroyed() && getMenuWindow().isVisible();
      if (nextMenuVisible) {
        hoverFrozenPetRect = null;
        if (!taskbarWalkIntent) {
          removeInteractionPause("hover-intent");
        }
        return;
      }
      hideStartupBubble();
      showHoverPanel();
    }, intentDelayMs);
  }

  // 缩放后刷新悬停锚点（对照 main.cjs refreshHoverAnchorAfterScale）
  function refreshHoverAnchorAfterScale() {
    if (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible()) {
      return;
    }
    hoverFrozenPetRect = null;
    hoverAnchorRect = freezeHoverPetRect();
    repositionHoverWindow();
  }

  // before-quit 清理悬停隐藏计时器
  function clearHoverHideTimer() {
    if (hoverHideTimer) {
      clearTimeout(hoverHideTimer);
      hoverHideTimer = null;
    }
  }

  return {
    createHoverWindow,
    showHoverPanel,
    hideHoverPanel,
    repositionHoverWindow,
    beginHoverFromPointer,
    scheduleHoverIntent,
    startHoverPolling,
    stopHoverPolling,
    updateHoverVisibilityFromCursor,
    freezeHoverPetRect,
    clearHoverIntent,
    scheduleHideHoverPanel,
    refreshHoverAnchorAfterScale,
    clearHoverHideTimer,
    getHoverWindow: () => hoverWindow,
    getHoverWindowReady: () => hoverWindowReady,
    getHoverAnchorRectValue: () => hoverAnchorRect,
    getHoverFrozenPetRect: () => hoverFrozenPetRect,
    getHoverHideTimer: () => hoverHideTimer,
    getHoverIntentTimer: () => hoverIntentTimer,
    getHoverPollTimer: () => hoverPollTimer,
    getIsPointerOverHoverPanel: () => isPointerOverHoverPanel,
    getIsPointerOverPet: () => isPointerOverPet,
    getLastHoverBounds: () => lastHoverBounds,
    setHoverWindow: (value) => { hoverWindow = value; },
    setHoverWindowReady: (value) => { hoverWindowReady = value; },
    setHoverAnchorRect: (value) => { hoverAnchorRect = value; },
    setHoverFrozenPetRect: (value) => { hoverFrozenPetRect = value; },
    setHoverHideTimer: (value) => { hoverHideTimer = value; },
    setHoverIntentTimer: (value) => { hoverIntentTimer = value; },
    setHoverPollTimer: (value) => { hoverPollTimer = value; },
    setIsPointerOverHoverPanel: (value) => { isPointerOverHoverPanel = value; },
    setIsPointerOverPet: (value) => { isPointerOverPet = value; },
    setLastHoverBounds: (value) => { lastHoverBounds = value; }
  };
}

module.exports = { createHoverController };
