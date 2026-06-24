// 贴靠控制器，管理宠物窗口拖拽结束后的窗口表面贴靠、表面校验、轮询与回退逻辑。
// 从 main.cjs 提取，依赖通过 createDockController(context) 注入；
// 函数实现与 main.cjs 保持一致，不修改控制流与逻辑。
//
// 本控制器为无状态函数束：所有运行时可变状态（petWindow、currentSurface、activeState、
// walkDirection、dragState、petRuntimeConfig、petScale、preferredPetScale、windowRoamEnabled
// 以及 5 个贴靠轮询状态）均不在 controller 内部持有副本，而是通过 context 注入的
// 访问器（getter）读取 main.cjs 的实时状态，通过 setter 回写 main.cjs 状态，
// 避免快照固化与双状态源风险。windowRoam 相关状态由 window-roam-controller 统一维护，
// 本控制器仅通过注入的协作方法间接操作。

function createDockController(context) {
  const {
    // Electron 与运行时
    process,
    // 依赖函数
    log,
    setCurrentSurface,
    getCurrentSurface,
    applySurfaceScale,
    groundPetToSurface,
    clampPetWindowPositionToSurface,
    setPetWindowPosition,
    syncWalkTrackX,
    isWalkingState,
    refreshWalkLoopAfterSurfaceChange,
    clearDragState,
    refreshWindowSurfaceCandidatesAsync,
    setState,
    parseWindowHwnd,
    diagnoseDockTargetFromCache,
    fallbackToTaskbarAfterDrag,
    findCandidateByHwnd,
    buildWindowSurfaceFromItem,
    getVisiblePetRectFromBounds,
    resetToTaskbarSurface,
    getGroundedWindowYForSurface,
    getVisibleSpriteInsets,
    getPetSpriteSize,
    getPetWindowPositionForVisibleRect,
    getSurfaceVisibleTop,
    animatePetWindowTo,
    maybeRefreshWindowSurfaceCandidatesBackground,
    refreshCurrentWindowSurfaceBoundsFromCache,
    getTopWindowRoamSurface,
    attachPetToWindowRoamSurface,
    // window-roam-controller 协作方法（状态由 window-roam-controller 统一维护）
    rememberDockedWindowRoamTarget,
    clearWindowRoamSuppression,
    suppressPreviousWindowAfterDockMiss,
    setDragFallbackSuppressionUntil,
    markWindowRoamAttached,
    // 外部状态访问器（读取 main.cjs 实时状态）
    getPetWindow,
    getActiveState,
    getWalkDirection,
    getDragState,
    getPetRuntimeConfig,
    getPetScale,
    getPreferredPetScale,
    getWindowRoamEnabled,
    // 贴靠轮询状态访问器（读 getter / 写 setter，状态存储于 main.cjs）
    getWindowSurfacePollTimer,
    setWindowSurfacePollTimer,
    getLastWindowSurfaceHeavyCheckAt,
    setLastWindowSurfaceHeavyCheckAt,
    getWindowSurfaceMissingTicks,
    setWindowSurfaceMissingTicks,
    getWindowDockInProgress,
    setWindowDockInProgress,
    getWindowDockHoverSuppressedUntil,
    setWindowDockHoverSuppressedUntil,
    // 常量
    STATE_SHAKE,
    ENABLE_WINDOW_DOCKING,
    WINDOW_DOCK_DEBUG,
    WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS,
    WINDOW_DOCK_DRAG_RETRY_DELAY_MS,
    WINDOW_DOCK_COARSE_CORRECTION_LIMIT,
    WINDOW_SURFACE_FALLBACK_BLEND_MS,
    WINDOW_SURFACE_HEAVY_RECHECK_MS,
    WINDOW_SURFACE_POLL_INTERVAL_MS,
    WINDOW_ROAM_DRAG_FALLBACK_SUPPRESS_MS
  } = context;

  function shouldRetryDockAfterDrag(reason) {
    return reason === "empty-cache" || reason === "no-window-candidates";
  }

  function applyDockSurfaceAfterDrag(surface, draggedX) {
    const nextSurface = setCurrentSurface(surface);
    applySurfaceScale(nextSurface, getActiveState(), getWalkDirection());
    groundPetToSurface(getActiveState(), getWalkDirection(), nextSurface);
    if (nextSurface.type === "window") {
      setWindowDockHoverSuppressedUntil(Date.now() + WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS);
      const snappedBounds = getPetWindow().getBounds();
      const target = clampPetWindowPositionToSurface(draggedX, snappedBounds.y, nextSurface, getActiveState(), getWalkDirection());
      setPetWindowPosition(target.x, target.y);
      syncWalkTrackX(target.x);
      setLastWindowSurfaceHeavyCheckAt(Date.now());
    }
    if (isWalkingState()) {
      refreshWalkLoopAfterSurfaceChange();
    }
    return nextSurface;
  }

  function finishWindowDockAfterDrag() {
    clearDragState({ notify: true });
    setWindowDockInProgress(false);
    refreshWindowSurfaceCandidatesAsync();
    if (getPetRuntimeConfig().variant === "tabby" && getActiveState() !== STATE_SHAKE) {
      setState(STATE_SHAKE, false);
    }
  }

  function dockPetAfterDrag({ retry = false } = {}) {
    if (!getPetWindow() || getPetWindow().isDestroyed()) {
      finishWindowDockAfterDrag();
      return;
    }
    const bounds = getPetWindow().getBounds();
    const draggedX = bounds.x;
    const previousWindowId = getCurrentSurface()?.type === "window"
      ? parseWindowHwnd(getCurrentSurface().sourceWindowId)
      : "";
    let surface = null;
    let diagnostic = { ok: false, reason: "disabled", elapsedMs: 0, surface: null };
    let retryScheduled = false;

    try {
      diagnostic = ENABLE_WINDOW_DOCKING
        ? diagnoseDockTargetFromCache(bounds)
        : { ok: false, reason: "disabled", elapsedMs: 0, surface: null };
      surface = diagnostic.surface;

      if (!surface && !retry && ENABLE_WINDOW_DOCKING && shouldRetryDockAfterDrag(diagnostic.reason)) {
        refreshWindowSurfaceCandidatesAsync({ force: true });
        retryScheduled = true;
        setTimeout(() => dockPetAfterDrag({ retry: true }), WINDOW_DOCK_DRAG_RETRY_DELAY_MS);
        return;
      }

      if (surface && applySurfaceScale(surface, getActiveState(), getWalkDirection())) {
        const nextSurface = applyDockSurfaceAfterDrag(surface, draggedX);
        if (getWindowRoamEnabled() && nextSurface.type === "window") {
          rememberDockedWindowRoamTarget(nextSurface);
        }
        clearWindowRoamSuppression();
      } else {
        if (getWindowRoamEnabled() && previousWindowId) {
          suppressPreviousWindowAfterDockMiss(previousWindowId);
        }
        if (getWindowRoamEnabled()) {
          setDragFallbackSuppressionUntil(Date.now() + WINDOW_ROAM_DRAG_FALLBACK_SUPPRESS_MS);
        }
        fallbackToTaskbarAfterDrag(bounds, diagnostic.reason || "snap-missed");
      }
    } catch (error) {
      fallbackToTaskbarAfterDrag(bounds, `dock-exception:${error.message}`);
      log(`dock-after-drag exception: ${error.stack || error.message}`);
    } finally {
      if (!retryScheduled) {
        finishWindowDockAfterDrag();
      }
    }

    if (WINDOW_DOCK_DEBUG) {
      const resolvedSurface = getCurrentSurface();
      log(`dock-after-drag reason=${diagnostic.reason} elapsedMs=${diagnostic.elapsedMs || 0} surface=${resolvedSurface.type} title=${resolvedSurface.title || ""} scale=${getPetScale()} preferred=${getPreferredPetScale()}`);
    }
  }

  function validateCurrentWindowSurface({ useCache = true } = {}) {
    if (!getCurrentSurface() || getCurrentSurface().type !== "window") {
      return true;
    }
    const sourceWindowId = getCurrentSurface().sourceWindowId;
    if (!sourceWindowId) {
      return false;
    }
    const candidate = useCache
      ? findCandidateByHwnd(sourceWindowId, { cacheOnly: true }) || findCandidateByHwnd(sourceWindowId, { useCache: false })
      : findCandidateByHwnd(sourceWindowId, { useCache: false });
    if (!candidate) {
      return false;
    }
    const built = buildWindowSurfaceFromItem(candidate);
    if (!built.surface) {
      return false;
    }
    setCurrentSurface(built.surface);
    return true;
  }

  function isPetStillDockedOnWindowSurface(surface = getCurrentSurface()) {
    if (!getPetWindow() || getPetWindow().isDestroyed() || !surface || surface.type !== "window") {
      return false;
    }
    const visibleRect = getVisiblePetRectFromBounds(getPetWindow().getBounds(), getActiveState(), getWalkDirection());
    const centerX = visibleRect.x + Math.round(visibleRect.width / 2);
    const bottomY = visibleRect.y + visibleRect.height;
    return centerX >= surface.left
      && centerX <= surface.right
      && Math.abs(bottomY - surface.groundY) <= WINDOW_DOCK_COARSE_CORRECTION_LIMIT;
  }

  function fallbackCurrentSurfaceToTaskbar(reason = "window-surface-invalidated") {
    if (!getPetWindow() || getPetWindow().isDestroyed()) {
      return;
    }
    const previousBounds = getPetWindow().getBounds();
    const previousVisibleRect = getVisiblePetRectFromBounds(previousBounds, getActiveState(), getWalkDirection());
    const previousCenterX = previousVisibleRect.x + Math.round(previousVisibleRect.width / 2);
    const fallback = resetToTaskbarSurface(previousBounds);
    applySurfaceScale(fallback, getActiveState(), getWalkDirection());
    const groundedY = getGroundedWindowYForSurface(fallback, getActiveState(), getWalkDirection());
    const nextBounds = getPetWindow().getBounds();
    const nextVisibleInsets = getVisibleSpriteInsets(getActiveState(), getWalkDirection());
    const nextVisibleWidth = getPetSpriteSize() - nextVisibleInsets.left - nextVisibleInsets.right;
    const nextVisibleLeft = previousCenterX - Math.round(nextVisibleWidth / 2);
    const target = getPetWindowPositionForVisibleRect(nextVisibleLeft, getSurfaceVisibleTop(fallback, getActiveState(), getWalkDirection()), getActiveState(), getWalkDirection());
    const next = clampPetWindowPositionToSurface(target.x, groundedY, fallback, getActiveState(), getWalkDirection());
    if (isWalkingState() || (Math.abs(next.x - nextBounds.x) <= 2 && Math.abs(next.y - nextBounds.y) <= 2)) {
      setPetWindowPosition(next.x, next.y);
    } else {
      animatePetWindowTo(next.x, next.y, WINDOW_SURFACE_FALLBACK_BLEND_MS);
    }
    syncWalkTrackX(next.x);
    if (isWalkingState()) {
      refreshWalkLoopAfterSurfaceChange();
    }
    if (WINDOW_DOCK_DEBUG) {
      log(`${reason} -> fallback taskbar target=${next.x},${next.y} state=${getActiveState()}`);
    }
    setWindowSurfaceMissingTicks(0);
  }

  function startWindowSurfacePolling() {
    if (getWindowSurfacePollTimer() || !ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
      return;
    }
    setWindowSurfacePollTimer(setInterval(() => {
      if (!getPetWindow() || getPetWindow().isDestroyed()) {
        return;
      }
      if (getDragState()) {
        return;
      }
      if (!getCurrentSurface() || getCurrentSurface().type !== "window") {
        return;
      }
      maybeRefreshWindowSurfaceCandidatesBackground();
      const quickValid = refreshCurrentWindowSurfaceBoundsFromCache();
      if (quickValid) {
        setWindowSurfaceMissingTicks(0);
      } else {
        setWindowSurfaceMissingTicks(getWindowSurfaceMissingTicks() + 1);
        if (getWindowSurfaceMissingTicks() < 1) {
          return;
        }
      }
      if (!getWindowRoamEnabled() && !isPetStillDockedOnWindowSurface(getCurrentSurface())) {
        fallbackCurrentSurfaceToTaskbar("window-surface-detached");
        return;
      }
      const now = Date.now();
      if (now - getLastWindowSurfaceHeavyCheckAt() < WINDOW_SURFACE_HEAVY_RECHECK_MS) {
        if (quickValid) {
          return;
        }
      }
      setLastWindowSurfaceHeavyCheckAt(now);
      if (!validateCurrentWindowSurface()) {
        const invalidWindowId = parseWindowHwnd(getCurrentSurface()?.sourceWindowId);
        const roamSurface = getWindowRoamEnabled() ? getTopWindowRoamSurface(invalidWindowId) : null;
        if (roamSurface && attachPetToWindowRoamSurface(roamSurface)) {
          markWindowRoamAttached(roamSurface);
          return;
        }
        const fallback = resetToTaskbarSurface(getPetWindow().getBounds());
        applySurfaceScale(fallback, getActiveState(), getWalkDirection());
        groundPetToSurface(getActiveState(), getWalkDirection(), fallback);
        if (isWalkingState()) {
          refreshWalkLoopAfterSurfaceChange();
        }
        if (WINDOW_DOCK_DEBUG) {
          log("window-surface invalidated -> fallback taskbar");
        }
        setWindowSurfaceMissingTicks(0);
      }
    }, WINDOW_SURFACE_POLL_INTERVAL_MS));
  }

  function stopWindowSurfacePolling() {
    if (!getWindowSurfacePollTimer()) {
      return;
    }
    clearInterval(getWindowSurfacePollTimer());
    setWindowSurfacePollTimer(null);
  }

  return {
    applyDockSurfaceAfterDrag,
    finishWindowDockAfterDrag,
    dockPetAfterDrag,
    validateCurrentWindowSurface,
    isPetStillDockedOnWindowSurface,
    fallbackCurrentSurfaceToTaskbar,
    startWindowSurfacePolling,
    stopWindowSurfacePolling
  };
}

module.exports = { createDockController };
