// 菜单窗口控制器，管理快捷菜单的创建、显示、隐藏、定位和可见性更新。
// 从 main.cjs 提取的菜单窗口逻辑，依赖通过 createMenuController(context) 注入；
// 函数实现与 main.cjs 保持一致，窗口创建复用 overlay-window.cjs 的 createOverlayWindow。

const { createOverlayWindow } = require("./overlay-window.cjs");

function createMenuController(context) {
  const {
    // Electron 与运行时
    BrowserWindow,
    path,
    __dirname,
    process,
    screen,
    // 全局状态访问器
    getPetWindow,
    getActiveState,
    getWalkDirection,
    getCustomizationWindow,
    getTaskbarWalkRunway,
    // 应用辅助函数
    getAppIconPath,
    getAppPageUrl,
    log,
    safeSend,
    buildPetConfig,
    // 菜单项特性
    buildMenuFeatures,
    // bounds 工具（shared/bounds.cjs）
    clamp,
    cloneRect,
    expandRect,
    rectsOverlap,
    rectFitsInArea,
    isPointInsideRect,
    getRectClosestEdgeDistance,
    // overlay 辅助函数
    getOverlayPlacementRect,
    getOverlayVisualGap,
    getOverlayWorkArea,
    getScaledOverlayCollisionPadding,
    clampPanelRect,
    getCurrentSurface,
    // 宠物 rect 辅助函数
    getWindowRect,
    getPetSpriteRect,
    getVisiblePetRect,
    getVisiblePetRectFromBounds,
    // 状态与帧辅助函数
    getState,
    getStateVisibleBounds,
    getStateHeadBounds,
    getSpriteRectFromBounds,
    getRenderedFrameHeadRectFromBounds,
    getRenderedFrameInfo,
    getFrameVisibleRectFromBounds,
    // overlay pet rect 辅助函数
    isResolvedOverlayPetRect,
    isTaskbarWalkActive,
    getTaskbarWalkOverlayPetRect,
    // 光标辅助函数
    isCursorInsidePetVisibleRect,
    // 窗口 bounds 辅助函数
    setFixedWindowBounds,
    // 交互暂停
    addInteractionPause,
    removeInteractionPause,
    // 跨控制器动作
    refreshAutoStartCacheAsync,
    clearHoverIntent,
    hideStartupBubble,
    hideHoverPanel,
    // 常量
    PET_MENU_WIDTH,
    PET_MENU_COLLAPSED_HEIGHT,
    PET_MENU_MIN_HEIGHT,
    PET_MENU_MAX_HEIGHT,
    PET_MENU_PADDING_Y,
    PET_MENU_ITEM_HEIGHT,
    PET_MENU_HIDE_DELAY_MS,
    PET_MENU_GAP_OFFSET,
    PET_MENU_SCALE_GAP_FACTOR,
    PET_MENU_HEAD_X_OFFSET,
    PET_MENU_HEAD_Y_OFFSET
  } = context;

  // 菜单相关状态（原 main.cjs 中的全局变量）
  let menuWindow = null;
  let menuWindowReady = false;
  let menuAnchorRect = null;
  let menuFrozenPetRect = null;
  let menuPlacementSnapshot = null;
  let currentMenuHeight = PET_MENU_COLLAPSED_HEIGHT;
  let isPointerOverMenuPanel = false;
  let lastMenuBounds = null;
  let menuHideTimer = null;

  // ===== 内部辅助函数 =====

  function getQuickMenuItemCount() {
    const features = buildMenuFeatures();
    let itemCount = 3;
    if (features.windowRoam) {
      itemCount += 1;
    }
    if (features.autoStart) {
      itemCount += 1;
    }
    if (features.eyeTracking) {
      itemCount += 1;
    }
    if (features.customization) {
      itemCount += 1;
    }
    if (features.switchPet) {
      itemCount += 1;
    }
    return itemCount;
  }

  function buildMenuPlacementSnapshot(anchorRect = menuAnchorRect) {
    const baseAnchorRect = cloneRect(anchorRect || getMenuAnchorRect(null));
    if (!baseAnchorRect) {
      return null;
    }

    const frameInfo = getRenderedFrameInfo();
    const snapshotState = frameInfo?.stateId || getActiveState();
    const snapshotDirection = Number.isFinite(frameInfo?.direction) ? frameInfo.direction : getWalkDirection();
    const snapshotFrameIndex = Number.isFinite(frameInfo?.frameIndex) ? Math.max(0, Math.round(frameInfo.frameIndex)) : 0;
    const frameRect = isResolvedOverlayPetRect(baseAnchorRect)
      ? baseAnchorRect
      : getFrameVisibleRectFromBounds(
        baseAnchorRect,
        snapshotState,
        snapshotFrameIndex,
        snapshotDirection
      );
    const petRect = cloneRect(frameRect || getVisiblePetRectFromBounds(baseAnchorRect, snapshotState, snapshotDirection));
    if (!petRect) {
      return null;
    }

    return {
      anchorRect: baseAnchorRect,
      petRect,
      stateId: snapshotState,
      direction: snapshotDirection,
      frameIndex: snapshotFrameIndex
    };
  }

  function isMenuCandidateSpacingValid(rect, kind, petRect, minHorizontalGap, minVerticalGap) {
    const gaps = getMenuCandidateGaps(rect, kind, petRect);
    return gaps.horizontal >= minHorizontalGap && gaps.vertical >= minVerticalGap;
  }

  function scoreMenuCandidate(entry, petRect, minHorizontalGap, minVerticalGap, area) {
    const gaps = getMenuCandidateGaps(entry.rect, entry.kind, petRect);
    const horizontalShortfall = Math.max(0, minHorizontalGap - gaps.horizontal);
    const verticalShortfall = Math.max(0, minVerticalGap - gaps.vertical);
    const edgeDistance = getRectClosestEdgeDistance(entry.rect, area);
    const edgePenalty = edgeDistance < 8 ? (8 - edgeDistance) * 36 : 0;
    return entry.priority * 1200
      + horizontalShortfall * 120
      + verticalShortfall * 120
      + Math.max(0, entry.shift || 0) * 12
      + edgePenalty;
  }

  function isCursorInsidePetForMenu() {
    const point = screen.getCursorScreenPoint();
    const padding = getOverlayVisualGap(PET_MENU_GAP_OFFSET, PET_MENU_SCALE_GAP_FACTOR);
    return isCursorInsidePetVisibleRect()
      || isPointInsideRect(point, expandRect(getMenuAnchorRect(), padding));
  }

  function isCursorInsideMenuPanel() {
    if (!menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) {
      return false;
    }
    return isPointInsideRect(screen.getCursorScreenPoint(), menuWindow.getBounds());
  }

  // ===== 导出函数 =====

  function getQuickMenuHeight() {
    const menuChromeHeight = PET_MENU_COLLAPSED_HEIGHT - PET_MENU_PADDING_Y - 3 * PET_MENU_ITEM_HEIGHT;
    return clamp(
      PET_MENU_PADDING_Y + getQuickMenuItemCount() * PET_MENU_ITEM_HEIGHT + menuChromeHeight,
      PET_MENU_MIN_HEIGHT,
      PET_MENU_MAX_HEIGHT
    );
  }

  function getMenuHeadAnchorRect(anchorRect = null, stateId = getActiveState(), direction = getWalkDirection()) {
    const fullRect = anchorRect || getWindowRect(getPetWindow());
    if (isResolvedOverlayPetRect(fullRect)) {
      return cloneRect(fullRect);
    }
    if (!fullRect) {
      return getOverlayPlacementRect(anchorRect, stateId, direction);
    }

    const frameHeadRect = getRenderedFrameHeadRectFromBounds(fullRect, stateId, direction);
    if (frameHeadRect) {
      return frameHeadRect;
    }

    const spriteRect = getSpriteRectFromBounds(fullRect);
    const visibleBounds = getStateVisibleBounds(stateId);
    const headBounds = getStateHeadBounds(stateId) || visibleBounds;
    if (!headBounds || !headBounds.imageWidth || !headBounds.imageHeight) {
      return getOverlayPlacementRect(fullRect, stateId, direction);
    }

    const state = getState(stateId);
    const shouldMirror = state?.defaultFacing === "left" ? direction > 0 : direction < 0;
    const rawLeft = shouldMirror
      ? headBounds.imageWidth - 1 - headBounds.right
      : headBounds.left;
    const rawRight = shouldMirror
      ? headBounds.imageWidth - 1 - headBounds.left
      : headBounds.right;
    const xScale = spriteRect.width / headBounds.imageWidth;
    const yScale = spriteRect.height / headBounds.imageHeight;
    return {
      x: Math.round(spriteRect.x + rawLeft * xScale + PET_MENU_HEAD_X_OFFSET),
      y: Math.round(spriteRect.y + headBounds.top * yScale + PET_MENU_HEAD_Y_OFFSET),
      width: Math.max(1, Math.round((rawRight - rawLeft + 1) * xScale)),
      height: Math.max(1, Math.round((headBounds.bottom - headBounds.top + 1) * yScale))
    };
  }

  function getMenuAnchorRect(anchorRect = null) {
    if (anchorRect) {
      return anchorRect;
    }
    if (menuFrozenPetRect) {
      return menuFrozenPetRect;
    }
    if (getTaskbarWalkRunway() && isTaskbarWalkActive()) {
      return getTaskbarWalkOverlayPetRect() || getPetSpriteRect() || getVisiblePetRect();
    }
    return getWindowRect(getPetWindow()) || getPetSpriteRect() || getVisiblePetRect();
  }

  function freezeMenuPetRect() {
    menuFrozenPetRect = getMenuAnchorRect(null);
    return menuFrozenPetRect;
  }

  function getMenuPlacementArea(area, surface, edgeGap) {
    const safeGap = Math.max(0, Math.round(edgeGap));
    const isWindowSurface = surface?.type === "window";
    const inset = {
      left: safeGap,
      right: safeGap,
      top: safeGap,
      bottom: isWindowSurface ? safeGap : Math.max(safeGap, safeGap + 4)
    };
    const width = Math.max(1, area.width - inset.left - inset.right);
    const height = Math.max(1, area.height - inset.top - inset.bottom);
    if (width <= 36 || height <= 36) {
      return area;
    }
    return {
      x: area.x + inset.left,
      y: area.y + inset.top,
      width,
      height
    };
  }

  function getMenuCandidateGaps(rect, kind, petRect) {
    const horizontalGap = kind.startsWith("right")
      ? rect.x - (petRect.x + petRect.width)
      : petRect.x - (rect.x + rect.width);
    const verticalGap = kind.endsWith("up")
      ? petRect.y - (rect.y + rect.height)
      : rect.y - (petRect.y + petRect.height);
    return {
      horizontal: Math.round(horizontalGap),
      vertical: Math.round(verticalGap)
    };
  }

  function getMenuPosition(anchorRect = menuAnchorRect, height = currentMenuHeight) {
    const snapshot = menuPlacementSnapshot
      && menuPlacementSnapshot.anchorRect
      && anchorRect
      && menuPlacementSnapshot.anchorRect.x === Math.round(anchorRect.x)
      && menuPlacementSnapshot.anchorRect.y === Math.round(anchorRect.y)
      && menuPlacementSnapshot.anchorRect.width === Math.round(anchorRect.width)
      && menuPlacementSnapshot.anchorRect.height === Math.round(anchorRect.height)
        ? menuPlacementSnapshot
        : null;
    const fullPetRect = snapshot?.anchorRect || getMenuAnchorRect(anchorRect);
    const petRect = snapshot?.petRect || getOverlayPlacementRect(fullPetRect);
    const baseGap = getOverlayVisualGap(PET_MENU_GAP_OFFSET, PET_MENU_SCALE_GAP_FACTOR);
    const horizontalGap = clamp(Math.round(baseGap * 0.95), 14, 36);
    const verticalGap = clamp(Math.round(baseGap * 0.7), 10, 28);
    const minHorizontalGap = Math.max(10, Math.round(horizontalGap * 0.78));
    const minVerticalGap = Math.max(8, Math.round(verticalGap * 0.78));
    const edgeGap = clamp(Math.round(verticalGap * 0.7), 8, 16);
    const avoidRect = expandRect(petRect, getScaledOverlayCollisionPadding());
    const surface = getCurrentSurface();
    const rawArea = getOverlayWorkArea(petRect);
    const area = getMenuPlacementArea(rawArea, surface, edgeGap);
    const menuHeight = clamp(Math.ceil(Number(height) || PET_MENU_COLLAPSED_HEIGHT), PET_MENU_MIN_HEIGHT, PET_MENU_MAX_HEIGHT);
    const candidates = [
      {
        kind: "right-up",
        x: petRect.x + petRect.width + horizontalGap,
        y: petRect.y - menuHeight - verticalGap,
        width: PET_MENU_WIDTH,
        height: menuHeight,
        priority: 0
      },
      {
        kind: "left-up",
        x: petRect.x - PET_MENU_WIDTH - horizontalGap,
        y: petRect.y - menuHeight - verticalGap,
        width: PET_MENU_WIDTH,
        height: menuHeight,
        priority: 1
      },
      {
        kind: "right-down",
        x: petRect.x + petRect.width + horizontalGap,
        y: petRect.y + petRect.height + verticalGap,
        width: PET_MENU_WIDTH,
        height: menuHeight,
        priority: 2
      },
      {
        kind: "left-down",
        x: petRect.x - PET_MENU_WIDTH - horizontalGap,
        y: petRect.y + petRect.height + verticalGap,
        width: PET_MENU_WIDTH,
        height: menuHeight,
        priority: 3
      }
    ];

    const normalizedCandidates = candidates.map((candidate) => ({
      ...candidate,
      rect: {
        x: Math.round(candidate.x),
        y: Math.round(candidate.y),
        width: PET_MENU_WIDTH,
        height: menuHeight
      }
    }));

    for (const candidate of normalizedCandidates) {
      if (!rectFitsInArea(candidate.rect, area)) {
        continue;
      }
      if (rectsOverlap(candidate.rect, avoidRect)) {
        continue;
      }
      if (!isMenuCandidateSpacingValid(candidate.rect, candidate.kind, petRect, minHorizontalGap, minVerticalGap)) {
        continue;
      }
      return candidate.rect;
    }

    const clampedCandidates = normalizedCandidates.map((candidate) => {
      const clamped = clampPanelRect(candidate.rect, area, PET_MENU_WIDTH, menuHeight);
      const shift = Math.abs(clamped.x - candidate.rect.x) + Math.abs(clamped.y - candidate.rect.y);
      return {
        ...candidate,
        rect: clamped,
        shift
      };
    });

    for (const candidate of clampedCandidates) {
      if (rectsOverlap(candidate.rect, avoidRect)) {
        continue;
      }
      if (!isMenuCandidateSpacingValid(candidate.rect, candidate.kind, petRect, minHorizontalGap, minVerticalGap)) {
        continue;
      }
      return candidate.rect;
    }

    const nonOverlappingCandidates = clampedCandidates.filter((candidate) => !rectsOverlap(candidate.rect, avoidRect));
    if (nonOverlappingCandidates.length > 0) {
      return nonOverlappingCandidates
        .map((candidate) => ({
          rect: candidate.rect,
          score: scoreMenuCandidate(candidate, petRect, minHorizontalGap, minVerticalGap, area)
        }))
        .sort((left, right) => left.score - right.score)[0].rect;
    }

    for (const candidate of candidates) {
      const forced = clampPanelRect(candidate, area, PET_MENU_WIDTH, menuHeight);
      if (!rectsOverlap(forced, avoidRect)) {
        return forced;
      }
    }

    return clampPanelRect(candidates[0], area, PET_MENU_WIDTH, menuHeight);
  }

  function repositionMenuWindow() {
    if (!menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) {
      return;
    }
    setFixedWindowBounds(menuWindow, getMenuPosition(), PET_MENU_WIDTH, currentMenuHeight, "menu");
  }

  function scheduleHidePetMenu() {
    if (menuHideTimer) {
      clearTimeout(menuHideTimer);
    }
    menuHideTimer = setTimeout(() => {
      menuHideTimer = null;
      if (isCursorInsidePetForMenu() || isPointerOverMenuPanel || isCursorInsideMenuPanel()) {
        return;
      }
      hidePetMenu();
    }, PET_MENU_HIDE_DELAY_MS);
  }

  function updateMenuVisibilityFromCursor() {
    if (!menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) {
      return;
    }
    if (isCursorInsidePetForMenu() || isPointerOverMenuPanel || isCursorInsideMenuPanel()) {
      if (menuHideTimer) {
        clearTimeout(menuHideTimer);
        menuHideTimer = null;
      }
      return;
    }
    if (!menuHideTimer) {
      scheduleHidePetMenu();
    }
  }

  function createMenuWindow() {
    menuWindowReady = false;
    // 通过 createOverlayWindow 统一创建 BrowserWindow，内部处理 setAlwaysOnTop 与 loadURL
    menuWindow = createOverlayWindow({
      BrowserWindow, path, __dirname, getAppPageUrl, getAppIconPath, log, process,
      hash: "menu",
      width: PET_MENU_WIDTH,
      height: getQuickMenuHeight(),
      movable: false,
      focusable: true,
      onReady: () => {
        menuWindowReady = true;
        if (menuWindow?.isVisible()) {
          safeSend(menuWindow, "pet:menu-data", buildPetConfig());
        }
      },
      onBlur: () => {
        scheduleHidePetMenu();
      },
      onClose: () => {
        removeInteractionPause("menu");
        menuWindow = null;
        menuWindowReady = false;
        lastMenuBounds = null;
        menuAnchorRect = null;
        menuFrozenPetRect = null;
        menuPlacementSnapshot = null;
        isPointerOverMenuPanel = false;
      }
    });
  }

  function resizePetMenu(height) {
    if (!menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) {
      return;
    }
    const nextHeight = clamp(Math.ceil(Number(height) || getQuickMenuHeight()), PET_MENU_MIN_HEIGHT, PET_MENU_MAX_HEIGHT);
    currentMenuHeight = nextHeight;
    setFixedWindowBounds(menuWindow, getMenuPosition(menuAnchorRect, currentMenuHeight), PET_MENU_WIDTH, currentMenuHeight, "menu");
  }

  function showPetMenu() {
    const petWin = getPetWindow();
    if (!petWin || petWin.isDestroyed()) {
      return;
    }
    const customWin = getCustomizationWindow();
    if (customWin && !customWin.isDestroyed() && customWin.isVisible()) {
      return;
    }
    refreshAutoStartCacheAsync();
    if (menuHideTimer) {
      clearTimeout(menuHideTimer);
      menuHideTimer = null;
    }
    clearHoverIntent();
    addInteractionPause("menu");
    hideStartupBubble({ force: true });
    hideHoverPanel();
    menuFrozenPetRect = freezeMenuPetRect();
    menuAnchorRect = menuFrozenPetRect;
    menuPlacementSnapshot = buildMenuPlacementSnapshot(menuAnchorRect);
    currentMenuHeight = getQuickMenuHeight();
    if (!menuWindow || menuWindow.isDestroyed()) {
      createMenuWindow();
    }

    setFixedWindowBounds(menuWindow, getMenuPosition(menuAnchorRect, currentMenuHeight), PET_MENU_WIDTH, currentMenuHeight, "menu");
    menuWindow.show();
    menuWindow.focus();
    if (menuWindowReady && !menuWindow.webContents.isLoading()) {
      safeSend(menuWindow, "pet:menu-data", buildPetConfig());
    }
  }

  function hidePetMenu() {
    if (!menuWindow || menuWindow.isDestroyed()) {
      removeInteractionPause("menu");
      menuFrozenPetRect = null;
      return;
    }
    if (menuHideTimer) {
      clearTimeout(menuHideTimer);
      menuHideTimer = null;
    }
    menuWindow.hide();
    menuAnchorRect = null;
    menuFrozenPetRect = null;
    menuPlacementSnapshot = null;
    isPointerOverMenuPanel = false;
    currentMenuHeight = getQuickMenuHeight();
    removeInteractionPause("menu");
  }

  // ===== getter / setter =====

  function getMenuWindow() {
    return menuWindow;
  }

  function setMenuWindow(value) {
    menuWindow = value;
  }

  function getMenuWindowReady() {
    return menuWindowReady;
  }

  function setMenuWindowReady(value) {
    menuWindowReady = value;
  }

  function getMenuAnchorRectValue() {
    return menuAnchorRect;
  }

  function setMenuAnchorRect(value) {
    menuAnchorRect = value;
  }

  function getMenuFrozenPetRect() {
    return menuFrozenPetRect;
  }

  function setMenuFrozenPetRect(value) {
    menuFrozenPetRect = value;
  }

  function getMenuPlacementSnapshot() {
    return menuPlacementSnapshot;
  }

  function setMenuPlacementSnapshot(value) {
    menuPlacementSnapshot = value;
  }

  function getCurrentMenuHeight() {
    return currentMenuHeight;
  }

  function setCurrentMenuHeight(value) {
    currentMenuHeight = value;
  }

  function getIsPointerOverMenuPanel() {
    return isPointerOverMenuPanel;
  }

  function setIsPointerOverMenuPanel(value) {
    isPointerOverMenuPanel = value;
  }

  function getLastMenuBounds() {
    return lastMenuBounds;
  }

  function setLastMenuBounds(value) {
    lastMenuBounds = value;
  }

  function getMenuHideTimer() {
    return menuHideTimer;
  }

  function setMenuHideTimer(value) {
    menuHideTimer = value;
  }

  return {
    // 菜单窗口核心函数
    createMenuWindow,
    resizePetMenu,
    showPetMenu,
    hidePetMenu,
    scheduleHidePetMenu,
    repositionMenuWindow,
    updateMenuVisibilityFromCursor,
    // 菜单定位函数
    getMenuPosition,
    getMenuPlacementArea,
    getMenuCandidateGaps,
    getQuickMenuHeight,
    getMenuAnchorRect,
    getMenuHeadAnchorRect,
    freezeMenuPetRect,
    // getter / setter
    getMenuWindow,
    setMenuWindow,
    getMenuWindowReady,
    setMenuWindowReady,
    getMenuAnchorRectValue,
    setMenuAnchorRect,
    getMenuFrozenPetRect,
    setMenuFrozenPetRect,
    getMenuPlacementSnapshot,
    setMenuPlacementSnapshot,
    getCurrentMenuHeight,
    setCurrentMenuHeight,
    getIsPointerOverMenuPanel,
    setIsPointerOverMenuPanel,
    getLastMenuBounds,
    setLastMenuBounds,
    getMenuHideTimer,
    setMenuHideTimer
  };
}

module.exports = { createMenuController };
