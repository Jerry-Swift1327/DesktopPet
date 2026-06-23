// 自定义面板控制器，管理联系作者面板的创建、显示、隐藏和定位。
// 从 main.cjs 提取，依赖通过 createCustomizationController(context) 注入；
// 函数实现与 main.cjs 保持一致，窗口创建复用 overlay-window.cjs 的 createOverlayWindow。

const { createOverlayWindow } = require("./overlay-window.cjs");

function createCustomizationController(context) {
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
    getPetWindow,
    hidePetMenu,
    hideHoverPanel,
    addInteractionPause,
    removeInteractionPause,
    getPetSpriteRect,
    getVisiblePetRect,
    getWindowRect,
    isTaskbarWalkActive,
    getTaskbarWalkOverlayPetRect,
    getTaskbarWalkRunway,
    getOverlayPlacementRect,
    expandRect,
    getOverlayWorkArea,
    getOverlaySafeArea,
    getOverlayVisualGap,
    getOverlayVerticalOffset,
    getScaledOverlayCollisionPadding,
    setFixedWindowBounds,
    clamp,
    rectsOverlap,
    clampPanelRect,
    pickBestOverlayCandidate,
    // 常量
    CUSTOMIZATION_PANEL_WIDTH,
    CUSTOMIZATION_PANEL_HEIGHT,
    HOVER_PANEL_SCALE_GAP_FACTOR
  } = context;

  // 自定义面板相关状态（原 main.cjs 中的全局变量）
  let customizationWindow = null;
  let customizationWindowReady = false;
  let customizationAnchorRect = null;
  let customizationFrozenPetRect = null;

  function freezeCustomizationPetRect() {
    customizationFrozenPetRect = getCustomizationAnchorRect(null);
    return customizationFrozenPetRect;
  }

  function getCustomizationAnchorRect(anchorRect = null) {
    if (anchorRect) {
      return anchorRect;
    }
    if (customizationFrozenPetRect) {
      return customizationFrozenPetRect;
    }
    if (getTaskbarWalkRunway() && isTaskbarWalkActive()) {
      return getTaskbarWalkOverlayPetRect() || getPetSpriteRect() || getVisiblePetRect();
    }
    return getWindowRect(getPetWindow()) || getPetSpriteRect() || getVisiblePetRect();
  }

  function createCustomizationWindow() {
    customizationWindowReady = false;
    customizationWindow = createOverlayWindow({
      BrowserWindow,
      path,
      __dirname,
      getAppPageUrl,
      getAppIconPath,
      log,
      process,
      hash: "customization",
      width: CUSTOMIZATION_PANEL_WIDTH,
      height: CUSTOMIZATION_PANEL_HEIGHT,
      focusable: true,
      movable: false,
      frame: true,
      transparent: false,
      hasShadow: true,
      backgroundColor: "#fff9f0",
      title: "联系作者",
      minimizable: false,
      maximizable: false,
      onReady: () => {
        customizationWindowReady = true;
        customizationWindow.setMenu(null);
        customizationWindow.setTitle("联系创作者");
      },
      onClose: () => {
        removeInteractionPause("customization");
        customizationWindow = null;
        customizationWindowReady = false;
        customizationAnchorRect = null;
        customizationFrozenPetRect = null;
      }
    });
  }

  function showCustomizationPanel() {
    const petWindow = getPetWindow();
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }
    hidePetMenu();
    hideHoverPanel();
    addInteractionPause("customization");
    customizationAnchorRect = freezeCustomizationPetRect();

    if (!customizationWindow || customizationWindow.isDestroyed()) {
      createCustomizationWindow();
    }

    setFixedWindowBounds(customizationWindow, getCustomizationPosition(customizationAnchorRect), CUSTOMIZATION_PANEL_WIDTH, CUSTOMIZATION_PANEL_HEIGHT, "customization");
    customizationWindow.show();
    customizationWindow.focus();
  }

  function hideCustomizationPanel() {
    if (!customizationWindow || customizationWindow.isDestroyed()) {
      removeInteractionPause("customization");
      customizationFrozenPetRect = null;
      return;
    }
    customizationWindow.hide();
    customizationAnchorRect = null;
    customizationFrozenPetRect = null;
    removeInteractionPause("customization");
  }

  function isCustomizationVisible() {
    return Boolean(customizationWindow && !customizationWindow.isDestroyed() && customizationWindow.isVisible());
  }

  function refreshCustomizationAnchorAfterScale() {
    if (!customizationWindow || customizationWindow.isDestroyed() || !customizationWindow.isVisible()) {
      return;
    }
    customizationFrozenPetRect = null;
    customizationAnchorRect = freezeCustomizationPetRect();
    setFixedWindowBounds(customizationWindow, getCustomizationPosition(customizationAnchorRect), CUSTOMIZATION_PANEL_WIDTH, CUSTOMIZATION_PANEL_HEIGHT, "customization");
  }

  function getCustomizationPosition(anchorRect = customizationAnchorRect) {
    const fullPetRect = getCustomizationAnchorRect(anchorRect);
    const petRect = getOverlayPlacementRect(fullPetRect);
    const avoidRect = expandRect(petRect, getScaledOverlayCollisionPadding());
    const panelGap = getOverlayVisualGap(0, HOVER_PANEL_SCALE_GAP_FACTOR);
    const rawArea = getOverlayWorkArea(avoidRect);
    const area = getOverlaySafeArea(rawArea, panelGap);
    const areaRight = area.x + area.width;
    const areaBottom = area.y + area.height;
    const verticalOffset = getOverlayVerticalOffset(0);
    const centeredX = petRect.x + Math.round((petRect.width - CUSTOMIZATION_PANEL_WIDTH) / 2);
    const sideY = petRect.y + Math.round((petRect.height - CUSTOMIZATION_PANEL_HEIGHT) / 2) + verticalOffset;

    const above = {
      x: clamp(centeredX, area.x, areaRight - CUSTOMIZATION_PANEL_WIDTH),
      y: Math.round(avoidRect.y - CUSTOMIZATION_PANEL_HEIGHT - panelGap + verticalOffset),
      width: CUSTOMIZATION_PANEL_WIDTH,
      height: CUSTOMIZATION_PANEL_HEIGHT
    };
    if (above.y >= area.y && !rectsOverlap(above, avoidRect)) {
      return above;
    }

    const right = {
      x: Math.round(avoidRect.x + avoidRect.width + panelGap),
      y: clamp(sideY, area.y, areaBottom - CUSTOMIZATION_PANEL_HEIGHT),
      width: CUSTOMIZATION_PANEL_WIDTH,
      height: CUSTOMIZATION_PANEL_HEIGHT
    };
    const left = {
      x: Math.round(avoidRect.x - CUSTOMIZATION_PANEL_WIDTH - panelGap),
      y: clamp(sideY, area.y, areaBottom - CUSTOMIZATION_PANEL_HEIGHT),
      width: CUSTOMIZATION_PANEL_WIDTH,
      height: CUSTOMIZATION_PANEL_HEIGHT
    };
    const rightFits = right.x + CUSTOMIZATION_PANEL_WIDTH <= areaRight && !rectsOverlap(right, avoidRect);
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
      x: clamp(centeredX, area.x, areaRight - CUSTOMIZATION_PANEL_WIDTH),
      y: Math.round(avoidRect.y + avoidRect.height + panelGap + verticalOffset),
      width: CUSTOMIZATION_PANEL_WIDTH,
      height: CUSTOMIZATION_PANEL_HEIGHT
    };
    if (below.y + CUSTOMIZATION_PANEL_HEIGHT <= areaBottom && !rectsOverlap(below, avoidRect)) {
      return below;
    }

    const preferred = {
      x: Math.round(above.x),
      y: Math.round(above.y),
      width: CUSTOMIZATION_PANEL_WIDTH,
      height: CUSTOMIZATION_PANEL_HEIGHT
    };
    const fallbackCandidates = [above, right, left, below]
      .map((candidate) => {
        const rounded = {
          x: Math.round(candidate.x),
          y: Math.round(candidate.y),
          width: CUSTOMIZATION_PANEL_WIDTH,
          height: CUSTOMIZATION_PANEL_HEIGHT
        };
        const clamped = clampPanelRect(rounded, area, CUSTOMIZATION_PANEL_WIDTH, CUSTOMIZATION_PANEL_HEIGHT);
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

    return clampPanelRect(preferred, area, CUSTOMIZATION_PANEL_WIDTH, CUSTOMIZATION_PANEL_HEIGHT);
  }

  return {
    createCustomizationWindow,
    showCustomizationPanel,
    hideCustomizationPanel,
    getCustomizationPosition,
    getCustomizationAnchorRect,
    freezeCustomizationPetRect,
    isCustomizationVisible,
    refreshCustomizationAnchorAfterScale,
    getCustomizationWindow: () => customizationWindow,
    getCustomizationWindowReady: () => customizationWindowReady,
    setCustomizationWindow: (value) => { customizationWindow = value; },
    setCustomizationWindowReady: (value) => { customizationWindowReady = value; }
  };
}

module.exports = { createCustomizationController };
