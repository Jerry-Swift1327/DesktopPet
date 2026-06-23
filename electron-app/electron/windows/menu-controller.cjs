// 菜单窗口控制器，管理快捷菜单的创建、显示、隐藏、定位和可见性更新。
// 从 main.cjs 提取的菜单窗口逻辑，依赖通过 createMenuController(context) 注入；
// 几何计算函数从 overlay-geometry 注入，窗口创建复用 overlay-window.cjs 的 createOverlayWindow。

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
    isCustomizationVisible,
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
    isPointInsideRect,
    // overlay 辅助函数（isCursorInsidePetForMenu 使用）
    getOverlayVisualGap,
    // 帧与可视区域辅助（buildMenuPlacementSnapshot 使用）
    isResolvedOverlayPetRect,
    getFrameVisibleRectFromBounds,
    getVisiblePetRectFromBounds,
    getRenderedFrameInfo,
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
    // 几何方法（从 overlay-geometry 注入）
    getMenuPosition,
    getMenuPlacementArea,
    getMenuCandidateGaps,
    getMenuHeadAnchorRect,
    getMenuAnchorRect,
    // 常量
    PET_MENU_WIDTH,
    PET_MENU_COLLAPSED_HEIGHT,
    PET_MENU_MIN_HEIGHT,
    PET_MENU_MAX_HEIGHT,
    PET_MENU_PADDING_Y,
    PET_MENU_ITEM_HEIGHT,
    PET_MENU_HIDE_DELAY_MS,
    PET_MENU_GAP_OFFSET,
    PET_MENU_SCALE_GAP_FACTOR
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

  function freezeMenuPetRect() {
    menuFrozenPetRect = getMenuAnchorRect(null);
    return menuFrozenPetRect;
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
    if (isCustomizationVisible()) {
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

  // 缩放后刷新菜单锚点（对照 main.cjs refreshMenuAnchorAfterScale）
  function refreshMenuAnchorAfterScale() {
    if (!menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) {
      return;
    }
    menuFrozenPetRect = null;
    menuAnchorRect = freezeMenuPetRect();
    menuPlacementSnapshot = buildMenuPlacementSnapshot(menuAnchorRect);
    repositionMenuWindow();
  }

  // before-quit 清理菜单隐藏计时器
  function clearMenuHideTimer() {
    if (menuHideTimer) {
      clearTimeout(menuHideTimer);
      menuHideTimer = null;
    }
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
    // 菜单高度与锚点
    getQuickMenuHeight,
    freezeMenuPetRect,
    buildMenuPlacementSnapshot,
    refreshMenuAnchorAfterScale,
    clearMenuHideTimer,
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
