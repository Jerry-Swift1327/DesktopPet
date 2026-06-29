// surface 缩放副作用编排控制器，管理 petScale/preferredPetScale 运行态、surface 缩放适配、
// 落地编排、overlay 锚点刷新与偏好持久化。从 main.cjs 提取，依赖通过
// createSurfaceScaleController(context) 注入。
//
// 本控制器持有 petScale/preferredPetScale 运行态，不直接 require electron/fs/path，
// 不注册 IPC，不直接访问窗口/IPC/bubble；窗口经 getPetWindow 注入，
// safeSend 的 "pet:scale-changed" 通知经 sendScaleChanged 回调注入，
// overlay 锚点刷新回调经 context 注入（仍保留在 main.cjs 各 overlay 控制器中），
// currentSurface/taskbarWalkRunway/walkTrackX 所有权仍由 main.cjs 持有，经 getter/setter 注入。
// 函数实现与 main.cjs 保持一致，不修改控制流与逻辑语义。

const petScaleRules = require("./pet-scale-rules.cjs");
const surfaceFitRules = require("./surface-fit-rules.cjs");
const { clamp } = require("../shared/bounds.cjs");

function createSurfaceScaleController(context) {
  const {
    // 纯计算委托（main.cjs function 声明，hoisted 可用）
    clampPetScale,
    getPetWindowWidth,
    getPetWindowHeight,
    getPetSpriteSize,
    getSpriteLocalXForWindowWidth,
    // surface/落地回调
    getSurfaceWorkArea,
    getVisibleSpriteInsets,
    getGroundedWindowYForSurface,
    clampPetWindowPositionToSurface,
    getTaskbarWalkCenterLimits,
    ensureTaskbarWalkRunwayForCenter,
    isTaskbarWalkActive,
    clearPetWindowHitRegion,
    getWalkVisibleCenterFromWindowX,
    getTaskbarWalkRunwayWindowWidth,
    setPetWindowPosition,
    syncWalkTrackX,
    updatePetWindowMousePassthrough,
    scheduleWalkLoopTimeout,
    // surface 状态回调
    resetToTaskbarSurface,
    setCurrentSurface,
    getCurrentSurface,
    getVisiblePetRectFromBounds,
    getWindowXForVisibleCenter,
    setWalkWindowPosition,
    setTaskbarWalkWindowPositionForCenter,
    isWalkingState,
    // overlay 刷新回调（经箭头函数注入，延迟访问各 overlay 控制器）
    refreshMenuAnchorAfterScale,
    refreshHoverAnchorAfterScale,
    refreshCustomizationAnchorAfterScale,
    repositionStartupBubbleWindow,
    // 通知回调（封装 safeSend 的 "pet:scale-changed" 通知，避免控制器直接访问 safeSend）
    sendScaleChanged,
    // 偏好持久化
    preferencesStore,
    // 窗口与运行态访问器（实时读写 main.cjs 状态，避免快照）
    getPetWindow,
    getActiveState,
    getWalkDirection,
    getTaskbarWalkRunway,
    setTaskbarWalkRunway,
    getWalkTrackX,
    setWalkTrackX,
    // 日志
    log,
    // 常量
    DEFAULT_PET_SCALE,
    PET_SCALE_MIN,
    PET_SCALE_MAX,
    PET_SCALE_STEP,
    VISIBLE_TOP_GAP,
    WINDOW_DOCK_DEBUG,
    WINDOW_DOCK_COARSE_CORRECTION_LIMIT,
    WINDOW_DOCK_FINE_CORRECTION_LIMIT
  } = context;

  // 运行态：缩放当前值与偏好值，所有权迁入控制器
  let petScale = DEFAULT_PET_SCALE;
  let preferredPetScale = DEFAULT_PET_SCALE;

  function readPetScalePreference() {
    preferencesStore.readPetScalePreference();
    // 同步运行时变量
    petScale = preferencesStore.getPetScale();
    preferredPetScale = preferencesStore.getPreferredPetScale();
  }

  function writePetScalePreference() {
    // 同步到模块后写入
    preferencesStore.setPreferredPetScale(preferredPetScale);
    preferencesStore.writePetScalePreference();
  }

  function getScaleForSurface(surface, requestedScale = preferredPetScale, stateId = getActiveState(), direction = getWalkDirection()) {
    const currentScale = petScale;
    const area = getSurfaceWorkArea(surface);
    const computeFitForScale = (scale) => {
      // 临时改写控制器内部 petScale，让注入的 getVisibleSpriteInsets/getPetSpriteSize
      // 回调读取候选 scale（回调在 main.cjs 中经 surfaceScaleController.getPetScale() 取值）
      petScale = scale;
      const visibleInsets = getVisibleSpriteInsets(stateId, direction);
      const spriteSize = getPetSpriteSize();
      petScale = currentScale;
      return {
        visibleWidth: spriteSize - visibleInsets.left - visibleInsets.right,
        visibleHeight: spriteSize - visibleInsets.top - visibleInsets.bottom
      };
    };
    const result = surfaceFitRules.getScaleCandidateForSurface(
      surface.left,
      surface.right,
      surface.groundY,
      area.y,
      VISIBLE_TOP_GAP,
      requestedScale,
      PET_SCALE_MIN,
      PET_SCALE_MAX,
      PET_SCALE_STEP,
      computeFitForScale
    );
    petScale = currentScale;
    return result;
  }

  function applySurfaceScale(surface, stateId = getActiveState(), direction = getWalkDirection()) {
    const nextScale = surface?.type === "window"
      ? getScaleForSurface(surface, preferredPetScale, stateId, direction)
      : preferredPetScale;
    if (!Number.isFinite(nextScale)) {
      return false;
    }
    const changed = Math.abs(petScale - nextScale) >= 0.001;
    const win = getPetWindow();
    if (!win || win.isDestroyed()) {
      petScale = clampPetScale(nextScale);
      return true;
    }
    const bounds = win.getBounds();
    const taskbarWalkActive = isTaskbarWalkActive(surface);
    if (!changed && !taskbarWalkActive) {
      const wasRunwayActive = Boolean(getTaskbarWalkRunway());
      const needsResize = bounds.width !== getPetWindowWidth() || bounds.height !== getPetWindowHeight();
      setTaskbarWalkRunway(null);
      if (wasRunwayActive) {
        clearPetWindowHitRegion();
      }
      if (needsResize) {
        const anchorX = getVisibleCenterAnchorFromBounds(bounds, stateId, direction)
          ?? bounds.x + Math.round(bounds.width / 2);
        const groundedY = getGroundedWindowYForSurface(surface, stateId, direction);
        const next = clampPetWindowPositionToSurface(
          getWindowXForVisibleCenterAnchor(anchorX, stateId, direction),
          groundedY,
          surface,
          stateId,
          direction
        );
        win.setBounds({
          x: next.x,
          y: next.y,
          width: getPetWindowWidth(),
          height: getPetWindowHeight()
        }, false);
      }
      if (wasRunwayActive || needsResize) {
        sendScaleChanged(buildScaleSummary());
        refreshMenuAnchorAfterScale();
        refreshHoverAnchorAfterScale();
        refreshCustomizationAnchorAfterScale();
        repositionStartupBubbleWindow({ refreshAnchor: true });
      }
      return true;
    }
    const taskbarCenterAnchor = taskbarWalkActive
      ? (getTaskbarWalkRunway()?.centerX
        ?? getWalkTrackX()
        ?? getWalkVisibleCenterFromWindowX(
          bounds.x,
          getGroundedWindowYForSurface(surface, stateId, direction),
          stateId,
          direction
        ))
      : null;
    petScale = clampPetScale(nextScale);
    if (taskbarWalkActive) {
      const runway = getTaskbarWalkRunway();
      const needsRunwayRefresh = !runway
        || runway.windowWidth !== getTaskbarWalkRunwayWindowWidth(surface)
        || runway.windowHeight !== getPetWindowHeight();
      if (!changed && !needsRunwayRefresh) {
        return true;
      }
      const groundedY = getGroundedWindowYForSurface(surface, stateId, direction);
      const centerLimits = getTaskbarWalkCenterLimits(surface, stateId);
      ensureTaskbarWalkRunwayForCenter(
        clamp(Math.round(taskbarCenterAnchor), centerLimits.left, centerLimits.right),
        groundedY,
        direction,
        surface,
        { force: true, reason: "scale" }
      );
      sendScaleChanged(buildScaleSummary());
      refreshMenuAnchorAfterScale();
      refreshHoverAnchorAfterScale();
      refreshCustomizationAnchorAfterScale();
      repositionStartupBubbleWindow({ refreshAnchor: true });
      return true;
    }
    setTaskbarWalkRunway(null);
    clearPetWindowHitRegion();
    const anchorX = getVisibleCenterAnchorFromBounds(bounds, stateId, direction)
      ?? bounds.x + Math.round(bounds.width / 2);
    const newWidth = getPetWindowWidth();
    const newHeight = getPetWindowHeight();
    const groundedY = getGroundedWindowYForSurface(surface, stateId, direction);
    const next = clampPetWindowPositionToSurface(
      getWindowXForVisibleCenterAnchor(anchorX, stateId, direction),
      groundedY,
      surface,
      stateId,
      direction
    );
    win.setBounds({
      x: next.x,
      y: next.y,
      width: newWidth,
      height: newHeight
    }, false);
    sendScaleChanged(buildScaleSummary());
    refreshMenuAnchorAfterScale();
    refreshHoverAnchorAfterScale();
    refreshCustomizationAnchorAfterScale();
    repositionStartupBubbleWindow({ refreshAnchor: true });
    return true;
  }

  function groundPetToSurface(stateId = getActiveState(), direction = getWalkDirection(), surface = getCurrentSurface()) {
    const win = getPetWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    const bounds = win.getBounds();
    let activeSurface = surface;
    if (!applySurfaceScale(activeSurface, stateId, direction)) {
      activeSurface = resetToTaskbarSurface(bounds);
      applySurfaceScale(activeSurface, stateId, direction);
    }
    setCurrentSurface(activeSurface);
    const groundedY = getGroundedWindowYForSurface(activeSurface, stateId, direction);
    if (isTaskbarWalkActive(activeSurface)) {
      const centerLimits = getTaskbarWalkCenterLimits(activeSurface, stateId);
      const centerX = clamp(
        getTaskbarWalkRunway()?.centerX
          ?? getWalkTrackX()
          ?? getWalkVisibleCenterFromWindowX(bounds.x, groundedY, stateId, direction),
        centerLimits.left,
        centerLimits.right
      );
      ensureTaskbarWalkRunwayForCenter(centerX, groundedY, direction, activeSurface, {
        force: true,
        reason: "ground"
      });
      return;
    }
    setTaskbarWalkRunway(null);
    clearPetWindowHitRegion();
    const next = clampPetWindowPositionToSurface(bounds.x, groundedY, activeSurface, stateId, direction);
    setPetWindowPosition(next.x, next.y);
    if (activeSurface.type === "window") {
      const applyWindowDockCorrection = (limit, label = "coarse") => {
        const correctionWin = getPetWindow();
        const correctedBounds = correctionWin.getBounds();
        const visible = getVisiblePetRectFromBounds(correctedBounds, stateId, direction);
        const deltaY = Math.round(activeSurface.groundY - (visible.y + visible.height));
        if (Math.abs(deltaY) > 0 && Math.abs(deltaY) <= limit) {
          setPetWindowPosition(correctedBounds.x, correctedBounds.y + deltaY);
          if (WINDOW_DOCK_DEBUG && Math.abs(deltaY) > WINDOW_DOCK_FINE_CORRECTION_LIMIT) {
            log(`window-dock ${label}-correct deltaY=${deltaY} surfaceTop=${activeSurface.groundY} visibleBottom=${visible.y + visible.height}`);
          }
          return true;
        }
        return false;
      };
      applyWindowDockCorrection(WINDOW_DOCK_COARSE_CORRECTION_LIMIT, "coarse");
      setImmediate(() => {
        const currentWin = getPetWindow();
        if (!currentWin || currentWin.isDestroyed() || getCurrentSurface().type !== "window") {
          return;
        }
        applyWindowDockCorrection(WINDOW_DOCK_FINE_CORRECTION_LIMIT, "fine");
      });
    } else {
      const correctedBounds = win.getBounds();
      const fallback = clampPetWindowPositionToSurface(correctedBounds.x, correctedBounds.y, activeSurface, stateId, direction);
      if (fallback.y !== correctedBounds.y || fallback.x !== correctedBounds.x) {
        setPetWindowPosition(fallback.x, fallback.y);
      }
    }
    syncWalkTrackX(next.x);
  }

  function buildScaleSummary() {
    const runway = getTaskbarWalkRunway();
    const runwayActive = Boolean(runway && isTaskbarWalkActive());
    const windowWidth = runwayActive ? runway.windowWidth : getPetWindowWidth();
    const spriteOffsetX = runwayActive
      ? runway.spriteOffsetX
      : getSpriteLocalXForWindowWidth(windowWidth);
    return petScaleRules.buildScaleSummaryFromState(
      petScale,
      PET_SCALE_MIN,
      PET_SCALE_MAX,
      PET_SCALE_STEP,
      windowWidth,
      getPetWindowHeight(),
      getPetSpriteSize(),
      spriteOffsetX,
      runwayActive
    );
  }

  function sendScaleState() {
    const win = getPetWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    sendScaleChanged(buildScaleSummary());
  }

  function setPetScale(nextScale) {
    const win = getPetWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    preferredPetScale = clampPetScale(nextScale);
    writePetScalePreference();
    const previousScale = petScale;
    const surface = getCurrentSurface();
    const clampedScale = surface?.type === "window"
      ? getScaleForSurface(surface, preferredPetScale, getActiveState(), getWalkDirection())
      : clampPetScale(nextScale);
    if (!Number.isFinite(clampedScale)) {
      sendScaleChanged(buildScaleSummary());
      return;
    }
    if (Math.abs(previousScale - clampedScale) < 0.001) {
      sendScaleChanged(buildScaleSummary());
      return;
    }

    const bounds = win.getBounds();
    const walkScaleAnchor = getWalkTrackAnchorForScale(bounds, surface);
    if (isWalkingState() && isTaskbarWalkActive(surface)) {
      petScale = clampedScale;
      const surfaceAfterScale = getCurrentSurface();
      if (!restoreWalkTrackAnchorAfterScale(walkScaleAnchor, surfaceAfterScale)) {
        groundPetToSurface(getActiveState(), getWalkDirection(), surfaceAfterScale);
      }
      sendScaleChanged(buildScaleSummary());
      refreshMenuAnchorAfterScale();
      refreshHoverAnchorAfterScale();
      refreshCustomizationAnchorAfterScale();
      repositionStartupBubbleWindow({ refreshAnchor: true });
      syncWalkTrackX();
      updatePetWindowMousePassthrough();
      scheduleWalkLoopTimeout();
      return;
    }
    const anchorX = getVisibleCenterAnchorFromBounds(bounds, getActiveState(), getWalkDirection())
      ?? bounds.x + Math.round(bounds.width / 2);
    petScale = clampedScale;
    const newWidth = getPetWindowWidth();
    const newHeight = getPetWindowHeight();
    const groundedY = getGroundedWindowYForSurface(surface, getActiveState(), getWalkDirection());
    const next = clampPetWindowPositionToSurface(
      getWindowXForVisibleCenterAnchor(anchorX, getActiveState(), getWalkDirection()),
      groundedY,
      surface,
      getActiveState(),
      getWalkDirection()
    );
    win.setBounds({
      x: next.x,
      y: next.y,
      width: newWidth,
      height: newHeight
    }, false);
    const surfaceAfterResize = getCurrentSurface();
    if (isWalkingState() && surfaceAfterResize?.type !== "window") {
      if (!restoreWalkTrackAnchorAfterScale(walkScaleAnchor, surfaceAfterResize)) {
        groundPetToSurface(getActiveState(), getWalkDirection(), surfaceAfterResize);
      }
    } else {
      groundPetToSurface(getActiveState(), getWalkDirection(), surfaceAfterResize);
    }
    sendScaleChanged(buildScaleSummary());
    refreshMenuAnchorAfterScale();
    refreshHoverAnchorAfterScale();
    refreshCustomizationAnchorAfterScale();
    repositionStartupBubbleWindow({ refreshAnchor: true });
    if (isWalkingState()) {
      syncWalkTrackX();
      scheduleWalkLoopTimeout();
    }
  }

  function resetPetScale() {
    setPetScale(DEFAULT_PET_SCALE);
    groundPetToSurface(getActiveState(), getWalkDirection(), getCurrentSurface());
  }

  function getWalkTrackAnchorForScale(bounds = getPetWindow()?.getBounds(), surface = getCurrentSurface()) {
    if (!bounds || !isWalkingState()) {
      return null;
    }
    if (isTaskbarWalkActive(surface)) {
      const groundedY = getGroundedWindowYForSurface(surface, getActiveState(), getWalkDirection());
      return {
        type: "taskbar-center",
        value: getTaskbarWalkRunway()?.centerX
          ?? getWalkTrackX()
          ?? getWalkVisibleCenterFromWindowX(bounds.x, groundedY, getActiveState(), getWalkDirection())
      };
    }
    return {
      type: "window-center",
      value: bounds.x + Math.round(bounds.width / 2)
    };
  }

  function getVisibleCenterAnchorFromBounds(bounds, stateId = getActiveState(), direction = getWalkDirection()) {
    if (!bounds) {
      return null;
    }
    const visibleRect = getVisiblePetRectFromBounds(bounds, stateId, direction);
    if (!visibleRect) {
      return null;
    }
    return Math.round(visibleRect.x + visibleRect.width / 2);
  }

  function getWindowXForVisibleCenterAnchor(centerX, stateId = getActiveState(), direction = getWalkDirection()) {
    const rawX = getWindowXForVisibleCenter(centerX, stateId, direction);
    const probe = {
      x: rawX,
      y: 0,
      width: getPetWindowWidth(),
      height: getPetWindowHeight()
    };
    const visibleRect = getVisiblePetRectFromBounds(probe, stateId, direction);
    if (!visibleRect) {
      return rawX;
    }
    const actualCenterX = Math.round(visibleRect.x + visibleRect.width / 2);
    return Math.round(rawX + (centerX - actualCenterX));
  }

  function restoreWalkTrackAnchorAfterScale(anchor, surface = getCurrentSurface()) {
    const win = getPetWindow();
    if (!anchor || !win || win.isDestroyed() || !isWalkingState()) {
      return false;
    }
    const groundedY = getGroundedWindowYForSurface(surface, getActiveState(), getWalkDirection());
    if (anchor.type === "taskbar-center" && isTaskbarWalkActive(surface)) {
      const centerLimits = getTaskbarWalkCenterLimits(surface, getActiveState());
      const centerX = clamp(Math.round(anchor.value), centerLimits.left, centerLimits.right);
      setTaskbarWalkWindowPositionForCenter(centerX, groundedY, getWalkDirection());
      return true;
    }
    const targetX = Math.round(anchor.value - getPetWindowWidth() / 2);
    setWalkWindowPosition(targetX, groundedY, surface, getWalkDirection());
    return true;
  }

  function getPetScale() {
    return petScale;
  }

  function getPreferredPetScale() {
    return preferredPetScale;
  }

  return {
    applySurfaceScale,
    setPetScale,
    resetPetScale,
    groundPetToSurface,
    sendScaleState,
    buildScaleSummary,
    getScaleForSurface,
    writePetScalePreference,
    readPetScalePreference,
    getPetScale,
    getPreferredPetScale
  };
}

module.exports = { createSurfaceScaleController };
