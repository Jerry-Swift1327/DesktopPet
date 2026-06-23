// 气泡窗口控制器，管理启动气泡的创建、显示、隐藏和定位。
// 从 main.cjs 提取的气泡窗口逻辑，依赖通过 createBubbleController(context) 注入。

const { createOverlayWindow } = require("./overlay-window.cjs");

function createBubbleController(context) {
  const {
    // Electron 与运行时
    BrowserWindow,
    path,
    __dirname,
    process,
    // 依赖函数
    getAppIconPath,
    getAppPageUrl,
    log,
    safeSend,
    buildPetConfig,
    getOverlayPlacementRect,
    expandRect,
    getOverlayWorkArea,
    getOverlaySafeArea,
    getOverlayVisualGap,
    getOverlayVerticalOffset,
    getScaledOverlayCollisionPadding,
    setFixedWindowBounds,
    getPetWindow,
    getMenuWindow,
    getHoverWindow,
    getActiveState,
    getWalkDirection,
    getCurrentSurface,
    addInteractionPause,
    removeInteractionPause,
    isWalkingState,
    hidePetMenu,
    hideHoverPanel,
    restoreHoverAfterBubbleIfNeeded,
    getTaskbarWalkRunway,
    isTaskbarWalkActive,
    getTaskbarWalkOverlayPetRect,
    getCurrentPetVisualRect,
    getRenderedFrameVisibleRect,
    getVisiblePetRect,
    getPetSpriteRect,
    clamp,
    cloneRect,
    rectsOverlap,
    rectFitsInArea,
    clampPanelRect,
    pickBestOverlayCandidate,
    sharedGreetings,
    // 常量
    STARTUP_BUBBLE_DEFAULT_WIDTH,
    STARTUP_BUBBLE_MIN_WIDTH,
    STARTUP_BUBBLE_MAX_WIDTH,
    STARTUP_BUBBLE_HEIGHT,
    STARTUP_BUBBLE_GAP_OFFSET,
    STARTUP_BUBBLE_SCALE_GAP_FACTOR,
    STARTUP_BUBBLE_DURATION_MS,
    STARTUP_BUBBLE_HOVER_LOCK_MS,
    DEFAULT_STATE
  } = context;

  // 气泡相关状态
  let startupBubbleWindow;
  let startupBubbleWindowReady = false;
  let startupBubbleAnchorRect = null;
  let startupBubbleTimer = null;
  let startupBubbleHideAt = 0;
  let pendingWalkBubbleMessage = null;
  let bubbleHoverSuppressedUntil = 0;

  function createStartupBubbleWindow() {
    // 通过 createOverlayWindow 统一创建 BrowserWindow，内部处理 setAlwaysOnTop 与 loadURL
    startupBubbleWindow = createOverlayWindow({
      BrowserWindow,
      path,
      __dirname,
      getAppPageUrl,
      getAppIconPath,
      log,
      process,
      hash: "bubble",
      width: STARTUP_BUBBLE_DEFAULT_WIDTH,
      height: STARTUP_BUBBLE_HEIGHT,
      movable: false,
      focusable: false,
      onReady: () => {
        startupBubbleWindowReady = true;
        if (startupBubbleWindow?.isVisible()) {
          safeSend(startupBubbleWindow, "pet:bubble-data", {
            ...buildPetConfig(),
            message: startupBubbleWindow.__pendingMessage || null
          });
        }
      },
      onClose: () => {
        startupBubbleWindow = null;
        startupBubbleWindowReady = false;
      }
    });
  }

  function getStartupBubblePosition(width = STARTUP_BUBBLE_DEFAULT_WIDTH, height = STARTUP_BUBBLE_HEIGHT, anchorRect = startupBubbleAnchorRect) {
    const bubbleWidth = clamp(Math.ceil(Number(width) || STARTUP_BUBBLE_DEFAULT_WIDTH), STARTUP_BUBBLE_MIN_WIDTH, STARTUP_BUBBLE_MAX_WIDTH);
    const bubbleHeight = Math.ceil(Number(height) || STARTUP_BUBBLE_HEIGHT);
    const petRect = cloneRect(anchorRect || getBubbleAnchorRect());
    const rawArea = getOverlayWorkArea(petRect);
    const bubbleGap = getOverlayVisualGap(STARTUP_BUBBLE_GAP_OFFSET, STARTUP_BUBBLE_SCALE_GAP_FACTOR);
    const area = getOverlaySafeArea(rawArea, bubbleGap);
    const areaRight = area.x + area.width;
    if (!petRect) {
      return clampPanelRect({
        x: area.x + Math.round((area.width - bubbleWidth) / 2),
        y: area.y,
        width: bubbleWidth,
        height: bubbleHeight
      }, area, bubbleWidth, bubbleHeight);
    }

    const avoidRect = expandRect(petRect, getScaledOverlayCollisionPadding());
    const centeredX = petRect.x + Math.round((petRect.width - bubbleWidth) / 2);
    const sideY = Math.round(petRect.y);
    const candidates = [
      {
        kind: "top",
        rect: {
          x: clamp(centeredX, area.x, areaRight - bubbleWidth),
          y: Math.round(avoidRect.y - bubbleHeight - bubbleGap),
          width: bubbleWidth,
          height: bubbleHeight
        }
      },
      {
        kind: "right",
        rect: {
          x: Math.round(avoidRect.x + avoidRect.width + bubbleGap),
          y: sideY,
          width: bubbleWidth,
          height: bubbleHeight
        }
      },
      {
        kind: "left",
        rect: {
          x: Math.round(avoidRect.x - bubbleWidth - bubbleGap),
          y: sideY,
          width: bubbleWidth,
          height: bubbleHeight
        }
      }
    ];

    if (rectFitsInArea(candidates[0].rect, area) && !rectsOverlap(candidates[0].rect, avoidRect)) {
      return candidates[0].rect;
    }

    const rightFits = rectFitsInArea(candidates[1].rect, area) && !rectsOverlap(candidates[1].rect, avoidRect);
    const leftFits = rectFitsInArea(candidates[2].rect, area) && !rectsOverlap(candidates[2].rect, avoidRect);
    if (rightFits && leftFits) {
      const rightSpace = areaRight - (avoidRect.x + avoidRect.width);
      const leftSpace = avoidRect.x - area.x;
      return rightSpace >= leftSpace ? candidates[1].rect : candidates[2].rect;
    } else if (rightFits) {
      return candidates[1].rect;
    } else if (leftFits) {
      return candidates[2].rect;
    }

    const clampedCandidates = candidates.map((candidate) => {
      const clamped = clampPanelRect(candidate.rect, area, bubbleWidth, bubbleHeight);
      return {
        ...candidate,
        rect: clamped,
        shift: Math.abs(clamped.x - candidate.rect.x) + Math.abs(clamped.y - candidate.rect.y)
      };
    });
    const nonOverlappingCandidates = clampedCandidates.filter((candidate) => !rectsOverlap(candidate.rect, avoidRect));
    if (nonOverlappingCandidates.length > 0) {
      return pickBestOverlayCandidate(nonOverlappingCandidates, candidates[0].rect, area, rawArea, Math.max(8, Math.round(bubbleGap * 0.45)));
    }

    return clampPanelRect(candidates[0].rect, area, bubbleWidth, bubbleHeight);
  }

  function getBubbleAnchorRect() {
    if (getTaskbarWalkRunway() && isTaskbarWalkActive()) {
      return getTaskbarWalkOverlayPetRect() || getCurrentPetVisualRect() || getVisiblePetRect() || getPetSpriteRect();
    }
    return getRenderedFrameVisibleRect() || getVisiblePetRect() || getPetSpriteRect();
  }

  function refreshStartupBubbleAnchor() {
    startupBubbleAnchorRect = cloneRect(getBubbleAnchorRect());
  }

  function resizeStartupBubble(width, height = STARTUP_BUBBLE_HEIGHT) {
    if (!startupBubbleWindow || startupBubbleWindow.isDestroyed() || !startupBubbleWindow.isVisible()) {
      return;
    }

    startupBubbleWindow.__lastWidth = width;
    startupBubbleWindow.__lastHeight = height;
    const bubbleBounds = getStartupBubblePosition(width, height);
    startupBubbleWindow.setBounds(bubbleBounds, false);
    log(`startup-bubble resize target=${bubbleBounds.x},${bubbleBounds.y},${bubbleBounds.width},${bubbleBounds.height}`);
  }

  function repositionStartupBubbleWindow({ refreshAnchor = false } = {}) {
    if (!startupBubbleWindow || startupBubbleWindow.isDestroyed() || !startupBubbleWindow.isVisible()) {
      return;
    }
    if (refreshAnchor || !startupBubbleAnchorRect) {
      refreshStartupBubbleAnchor();
    }
    const width = startupBubbleWindow.__lastWidth || startupBubbleWindow.getBounds().width;
    const height = startupBubbleWindow.__lastHeight || startupBubbleWindow.getBounds().height;
    const bubbleBounds = getStartupBubblePosition(width, height);
    startupBubbleWindow.setBounds(bubbleBounds, false);
  }

  function showStartupBubble() {
    showBubbleMessage(sharedGreetings[0]);
  }

  function showBubbleMessage(message = null, durationMs = STARTUP_BUBBLE_DURATION_MS, options = {}) {
    const petWindow = getPetWindow();
    if (!petWindow || petWindow.isDestroyed()) {
      return false;
    }
    if (isWalkingState()) {
      pendingWalkBubbleMessage = { message, durationMs, options };
      return true;
    }
    const menuWindow = getMenuWindow();
    const hoverWindow = getHoverWindow();
    const isMenuVisible = menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible();
    const isHoverVisible = hoverWindow && !hoverWindow.isDestroyed() && hoverWindow.isVisible();
    if (isMenuVisible || isHoverVisible) {
      if (!options.forceHideOverlays) {
        return false;
      }
      hidePetMenu();
      hideHoverPanel();
    }

    if (!startupBubbleWindow || startupBubbleWindow.isDestroyed()) {
      createStartupBubbleWindow();
    }

    startupBubbleWindow.__pendingMessage = message;
    refreshStartupBubbleAnchor();
    if (Number.isFinite(options.suppressHoverMs) && options.suppressHoverMs > 0) {
      bubbleHoverSuppressedUntil = Date.now() + Math.round(options.suppressHoverMs);
    }
    const bubbleBounds = getStartupBubblePosition();
    startupBubbleWindow.setBounds(bubbleBounds, false);
    log(`startup-bubble target=${bubbleBounds.x},${bubbleBounds.y},${bubbleBounds.width},${bubbleBounds.height}`);
    startupBubbleWindow.showInactive();
    if (startupBubbleWindowReady && !startupBubbleWindow.webContents.isLoading()) {
      safeSend(startupBubbleWindow, "pet:bubble-data", {
        ...buildPetConfig(),
        message
      });
    }

    if (startupBubbleTimer) {
      clearTimeout(startupBubbleTimer);
    }
    startupBubbleHideAt = Date.now() + durationMs;
    startupBubbleTimer = setTimeout(() => {
      startupBubbleTimer = null;
      hideStartupBubble({ force: true });
      restoreHoverAfterBubbleIfNeeded();
    }, durationMs);
    return true;
  }

  function hideStartupBubble(options = {}) {
    if (options.force) {
      pendingWalkBubbleMessage = null;
    }
    if (!options.force && startupBubbleTimer && Date.now() < startupBubbleHideAt) {
      return;
    }
    if (startupBubbleTimer) {
      clearTimeout(startupBubbleTimer);
      startupBubbleTimer = null;
    }
    startupBubbleHideAt = 0;
    startupBubbleAnchorRect = null;
    if (!startupBubbleWindow || startupBubbleWindow.isDestroyed()) {
      return;
    }
    startupBubbleWindow.hide();
  }

  function showPendingWalkBubbleMessage() {
    if (!pendingWalkBubbleMessage || getActiveState() !== DEFAULT_STATE) {
      return;
    }
    const next = pendingWalkBubbleMessage;
    pendingWalkBubbleMessage = null;
    showBubbleMessage(next.message, next.durationMs, next.options);
  }

  function isStartupBubbleVisible() {
    return Boolean(startupBubbleWindow && !startupBubbleWindow.isDestroyed() && startupBubbleWindow.isVisible());
  }

  function getBubbleHoverSuppressionMs() {
    return Math.max(0, bubbleHoverSuppressedUntil - Date.now());
  }

  function clearPendingWalkBubbleMessage() {
    pendingWalkBubbleMessage = null;
  }

  function clearStartupBubbleTimer() {
    if (startupBubbleTimer) {
      clearTimeout(startupBubbleTimer);
      startupBubbleTimer = null;
    }
  }

  function getStartupBubbleWindow() {
    return startupBubbleWindow;
  }

  function getStartupBubbleWindowReady() {
    return startupBubbleWindowReady;
  }

  function setStartupBubbleWindow(value) {
    startupBubbleWindow = value;
  }

  function setStartupBubbleWindowReady(value) {
    startupBubbleWindowReady = value;
  }

  return {
    createStartupBubbleWindow,
    getStartupBubblePosition,
    getBubbleAnchorRect,
    resizeStartupBubble,
    repositionStartupBubbleWindow,
    showStartupBubble,
    showBubbleMessage,
    showPendingWalkBubbleMessage,
    isStartupBubbleVisible,
    getBubbleHoverSuppressionMs,
    hideStartupBubble,
    clearPendingWalkBubbleMessage,
    clearStartupBubbleTimer,
    getStartupBubbleWindow,
    getStartupBubbleWindowReady,
    setStartupBubbleWindow,
    setStartupBubbleWindowReady
  };
}

module.exports = { createBubbleController };
