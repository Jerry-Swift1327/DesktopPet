// 悬停面板控制器，管理悬停面板的创建、显示、隐藏、定位、轮询和可见性更新。
// 从 main.cjs 提取的悬停面板逻辑，依赖通过 createHoverController(context) 注入；
// 函数实现与 main.cjs 保持一致，窗口创建复用 overlay-window.cjs 的 createOverlayWindow。

const { createOverlayWindow } = require("./overlay-window.cjs");
const { normalizeBounds, boundsAreEqual } = require("../shared/bounds.cjs");

function createHoverController(context) {
  const {
    // Electron 与运行时
    BrowserWindow,
    path,
    __dirname,
    process,
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
    isCursorInsideHoverPanel,
    isCursorInsideSpriteRect,
    // 悬停面板辅助
    shouldSuppressHoverPanel,
    updatePetWindowMousePassthrough,
    updateMenuVisibilityFromCursor,
    // 交互暂停
    addInteractionPause,
    removeInteractionPause,
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
  // 仅用于保持与 main.cjs setFixedWindowBounds 签名一致，本控制器不使用 menu 缓存
  let lastMenuBounds = null;

  // 与 main.cjs setFixedWindowBounds 实现一致，缓存 lastHoverBounds 避免重复 setBounds
  function setFixedWindowBounds(targetWindow, bounds, width, height, cacheKey) {
    if (!targetWindow || targetWindow.isDestroyed()) {
      return;
    }

    const nextBounds = normalizeBounds(bounds, width, height);
    const lastBounds = cacheKey === "menu" ? lastMenuBounds : lastHoverBounds;
    if (boundsAreEqual(lastBounds, nextBounds)) {
      return;
    }

    targetWindow.setBounds(nextBounds, false);
    if (cacheKey === "menu") {
      lastMenuBounds = nextBounds;
    } else {
      lastHoverBounds = nextBounds;
    }
  }

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

  function getHoverAnchorRect(anchorRect = null) {
    if (anchorRect) {
      return anchorRect;
    }
    if (hoverFrozenPetRect) {
      return hoverFrozenPetRect;
    }
    if (getTaskbarWalkRunway() && isTaskbarWalkActive()) {
      return getTaskbarWalkOverlayPetRect() || getPetSpriteRect() || getVisiblePetRect();
    }
    return getWindowRect(getPetWindow()) || getPetSpriteRect() || getVisiblePetRect();
  }

  function getHoverBodyHitPaddingForState(stateId = getActiveState()) {
    const basePadding = getScaledHoverBodyHitPadding();
    const state = getState(stateId);
    if (!state?.moving) {
      return basePadding;
    }
    if (isTaskbarWalkActive()) {
      return Math.max(0, basePadding - 1);
    }
    // Moving states are sampled while the sprite keeps shifting, so use a
    // slightly wider tolerance to avoid hover misses between poll ticks.
    return basePadding + 2;
  }

  function getHoverHitRect() {
    const rect = hoverFrozenPetRect
      ? getOverlayPlacementRect(hoverFrozenPetRect)
      : getRenderedFrameVisibleRect() || getVisiblePetRect();
    return expandRect(rect, getHoverBodyHitPaddingForState());
  }

  function getHoverAvoidRect(anchorRect = null) {
    const rect = getOverlayPlacementRect(anchorRect);
    return expandRect(rect, getScaledHoverAvoidPadding());
  }

  function freezeHoverPetRect() {
    hoverFrozenPetRect = getHoverAnchorRect(null);
    return hoverFrozenPetRect;
  }

  function getHoverPosition(anchorRect = hoverAnchorRect) {
    const fullPetRect = getHoverAnchorRect(anchorRect);
    const petRect = getOverlayPlacementRect(fullPetRect);
    const avoidRect = getHoverAvoidRect(fullPetRect);
    const panelGap = getOverlayVisualGap(HOVER_PANEL_GAP_OFFSET, HOVER_PANEL_SCALE_GAP_FACTOR);
    const rawArea = getOverlayWorkArea(avoidRect);
    const area = getOverlaySafeArea(rawArea, panelGap);
    const areaRight = area.x + area.width;
    const areaBottom = area.y + area.height;
    const verticalOffset = getOverlayVerticalOffset(HOVER_PANEL_VERTICAL_OFFSET);
    const centeredX = petRect.x + Math.round((petRect.width - HOVER_PANEL_WIDTH) / 2);
    const sideY = petRect.y + Math.round((petRect.height - HOVER_PANEL_HEIGHT) / 2) + verticalOffset;

    const above = {
      x: clamp(centeredX, area.x, areaRight - HOVER_PANEL_WIDTH),
      y: Math.round(avoidRect.y - HOVER_PANEL_HEIGHT - panelGap + verticalOffset),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
    if (above.y >= area.y && !rectsOverlap(above, avoidRect)) {
      return above;
    }

    const right = {
      x: Math.round(avoidRect.x + avoidRect.width + panelGap),
      y: clamp(sideY, area.y, areaBottom - HOVER_PANEL_HEIGHT),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
    const left = {
      x: Math.round(avoidRect.x - HOVER_PANEL_WIDTH - panelGap),
      y: clamp(sideY, area.y, areaBottom - HOVER_PANEL_HEIGHT),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
    const rightFits = right.x + HOVER_PANEL_WIDTH <= areaRight && !rectsOverlap(right, avoidRect);
    const leftFits = left.x >= area.x && !rectsOverlap(left, avoidRect);
    if (rightFits && leftFits) {
      const rightSpace = areaRight - (avoidRect.x + avoidRect.width);
      const leftSpace = avoidRect.x - area.x;
      return rightSpace >= leftSpace ? right : left;
    } else if (rightFits) {
      return right;
    } else if (leftFits) {
      return left;
    }

    const below = {
      x: clamp(centeredX, area.x, areaRight - HOVER_PANEL_WIDTH),
      y: Math.round(avoidRect.y + avoidRect.height + panelGap + verticalOffset),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
    if (below.y + HOVER_PANEL_HEIGHT <= areaBottom && !rectsOverlap(below, avoidRect)) {
      return below;
    }

    const preferred = {
      x: Math.round(above.x),
      y: Math.round(above.y),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
    const fallbackCandidates = [above, right, left, below]
      .map((candidate) => {
        const rounded = {
          x: Math.round(candidate.x),
          y: Math.round(candidate.y),
          width: HOVER_PANEL_WIDTH,
          height: HOVER_PANEL_HEIGHT
        };
        const clamped = clampPanelRect(rounded, area, HOVER_PANEL_WIDTH, HOVER_PANEL_HEIGHT);
        const shift = Math.abs(clamped.x - rounded.x) + Math.abs(clamped.y - rounded.y);
        return { rect: clamped, shift };
      })
      .filter((entry) => !rectsOverlap(entry.rect, avoidRect));
    if (fallbackCandidates.length > 0) {
      return pickBestOverlayCandidate(
        fallbackCandidates,
        preferred,
        area,
        rawArea,
        Math.max(8, Math.round(panelGap * 0.45))
      );
    }

    const forcedRightX = Math.min(Math.max(avoidRect.x + avoidRect.width + panelGap, area.x), areaRight - HOVER_PANEL_WIDTH);
    const forcedLeftX = Math.max(Math.min(avoidRect.x - HOVER_PANEL_WIDTH - panelGap, areaRight - HOVER_PANEL_WIDTH), area.x);
    const forcedSide = avoidRect.x - area.x > areaRight - (avoidRect.x + avoidRect.width)
      ? { ...left, x: forcedLeftX }
      : { ...right, x: forcedRightX };
    const forcedY = avoidRect.y >= area.y + Math.round(area.height / 2)
      ? Math.max(area.y, avoidRect.y - HOVER_PANEL_HEIGHT - panelGap + verticalOffset)
      : Math.min(areaBottom - HOVER_PANEL_HEIGHT, avoidRect.y + avoidRect.height + panelGap + verticalOffset);
    return {
      x: Math.round(forcedSide.x),
      y: Math.round(forcedY),
      width: HOVER_PANEL_WIDTH,
      height: HOVER_PANEL_HEIGHT
    };
  }

  function repositionHoverWindow() {
    if (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible()) {
      return;
    }
    setFixedWindowBounds(hoverWindow, getHoverPosition(), HOVER_PANEL_WIDTH, HOVER_PANEL_HEIGHT, "hover");
  }

  function repositionOverlays() {
    repositionMenuWindow();
    repositionHoverWindow();
    repositionStartupBubbleWindow();
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

  return {
    createHoverWindow,
    showHoverPanel,
    hideHoverPanel,
    repositionHoverWindow,
    getHoverPosition,
    getHoverAnchorRect,
    getHoverHitRect,
    getHoverAvoidRect,
    getHoverBodyHitPaddingForState,
    beginHoverFromPointer,
    scheduleHoverIntent,
    startHoverPolling,
    stopHoverPolling,
    updateHoverVisibilityFromCursor,
    freezeHoverPetRect,
    repositionOverlays,
    clearHoverIntent,
    scheduleHideHoverPanel,
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
