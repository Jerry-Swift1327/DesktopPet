// 贴靠控制器，管理宠物窗口拖拽结束后的窗口表面贴靠、表面校验、轮询与回退逻辑。
// 从 main.cjs 提取，依赖通过 createDockController(context) 注入；
// 函数实现与 main.cjs 保持一致，不修改控制流与逻辑。

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
    // 只读状态
    petWindow,
    currentSurface,
    activeState,
    walkDirection,
    petRuntimeConfig,
    petScale,
    preferredPetScale,
    dragState,
    windowRoamEnabledCache,
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

  // 贴靠相关状态（原 main.cjs 中的全局变量，迁移函数内被重新赋值，故用 let 声明为模块内部状态）
  let windowSurfacePollTimer = null;
  let lastWindowSurfaceHeavyCheckAt = 0;
  let windowSurfaceMissingTicks = 0;
  let windowDockInProgress = false;
  let windowDockHoverSuppressedUntil = 0;
  let windowRoamLastTargetId = "";
  let windowRoamPreferredTargetId = "";
  let windowRoamSuppressedWindowId = "";
  let windowRoamDragFallbackSuppressedUntil = 0;
  let windowRoamMissingTicks = 0;

  function shouldRetryDockAfterDrag(reason) {
    return reason === "empty-cache" || reason === "no-window-candidates";
  }

  function applyDockSurfaceAfterDrag(surface, draggedX) {
    const nextSurface = setCurrentSurface(surface);
    applySurfaceScale(nextSurface, activeState, walkDirection);
    groundPetToSurface(activeState, walkDirection, nextSurface);
    if (nextSurface.type === "window") {
      windowDockHoverSuppressedUntil = Date.now() + WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS;
      const snappedBounds = petWindow.getBounds();
      const target = clampPetWindowPositionToSurface(draggedX, snappedBounds.y, nextSurface, activeState, walkDirection);
      setPetWindowPosition(target.x, target.y);
      syncWalkTrackX(target.x);
      lastWindowSurfaceHeavyCheckAt = Date.now();
    }
    if (isWalkingState()) {
      refreshWalkLoopAfterSurfaceChange();
    }
    return nextSurface;
  }

  function finishWindowDockAfterDrag() {
    clearDragState({ notify: true });
    windowDockInProgress = false;
    refreshWindowSurfaceCandidatesAsync();
    if (petRuntimeConfig.variant === "tabby" && activeState !== STATE_SHAKE) {
      setState(STATE_SHAKE, false);
    }
  }

  function dockPetAfterDrag({ retry = false } = {}) {
    if (!petWindow || petWindow.isDestroyed()) {
      finishWindowDockAfterDrag();
      return;
    }
    const bounds = petWindow.getBounds();
    const draggedX = bounds.x;
    const previousWindowId = currentSurface?.type === "window"
      ? parseWindowHwnd(currentSurface.sourceWindowId)
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

      if (surface && applySurfaceScale(surface, activeState, walkDirection)) {
        const nextSurface = applyDockSurfaceAfterDrag(surface, draggedX);
        if (windowRoamEnabledCache && nextSurface.type === "window") {
          windowRoamLastTargetId = parseWindowHwnd(nextSurface.sourceWindowId);
          windowRoamPreferredTargetId = windowRoamLastTargetId;
          windowRoamDragFallbackSuppressedUntil = 0;
        }
        windowRoamSuppressedWindowId = "";
      } else {
        if (windowRoamEnabledCache && previousWindowId) {
          windowRoamSuppressedWindowId = previousWindowId;
        }
        if (windowRoamEnabledCache) {
          windowRoamDragFallbackSuppressedUntil = Date.now() + WINDOW_ROAM_DRAG_FALLBACK_SUPPRESS_MS;
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
      log(`dock-after-drag reason=${diagnostic.reason} elapsedMs=${diagnostic.elapsedMs || 0} surface=${resolvedSurface.type} title=${resolvedSurface.title || ""} scale=${petScale} preferred=${preferredPetScale}`);
    }
  }

  function validateCurrentWindowSurface({ useCache = true } = {}) {
    if (!currentSurface || currentSurface.type !== "window") {
      return true;
    }
    const sourceWindowId = currentSurface.sourceWindowId;
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

  function isPetStillDockedOnWindowSurface(surface = currentSurface) {
    if (!petWindow || petWindow.isDestroyed() || !surface || surface.type !== "window") {
      return false;
    }
    const visibleRect = getVisiblePetRectFromBounds(petWindow.getBounds(), activeState, walkDirection);
    const centerX = visibleRect.x + Math.round(visibleRect.width / 2);
    const bottomY = visibleRect.y + visibleRect.height;
    return centerX >= surface.left
      && centerX <= surface.right
      && Math.abs(bottomY - surface.groundY) <= WINDOW_DOCK_COARSE_CORRECTION_LIMIT;
  }

  function fallbackCurrentSurfaceToTaskbar(reason = "window-surface-invalidated") {
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }
    const previousBounds = petWindow.getBounds();
    const previousVisibleRect = getVisiblePetRectFromBounds(previousBounds, activeState, walkDirection);
    const previousCenterX = previousVisibleRect.x + Math.round(previousVisibleRect.width / 2);
    const fallback = resetToTaskbarSurface(previousBounds);
    applySurfaceScale(fallback, activeState, walkDirection);
    const groundedY = getGroundedWindowYForSurface(fallback, activeState, walkDirection);
    const nextBounds = petWindow.getBounds();
    const nextVisibleInsets = getVisibleSpriteInsets(activeState, walkDirection);
    const nextVisibleWidth = getPetSpriteSize() - nextVisibleInsets.left - nextVisibleInsets.right;
    const nextVisibleLeft = previousCenterX - Math.round(nextVisibleWidth / 2);
    const target = getPetWindowPositionForVisibleRect(nextVisibleLeft, getSurfaceVisibleTop(fallback, activeState, walkDirection), activeState, walkDirection);
    const next = clampPetWindowPositionToSurface(target.x, groundedY, fallback, activeState, walkDirection);
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
      log(`${reason} -> fallback taskbar target=${next.x},${next.y} state=${activeState}`);
    }
    windowSurfaceMissingTicks = 0;
  }

  function startWindowSurfacePolling() {
    if (windowSurfacePollTimer || !ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
      return;
    }
    windowSurfacePollTimer = setInterval(() => {
      if (!petWindow || petWindow.isDestroyed()) {
        return;
      }
      if (dragState) {
        return;
      }
      if (!currentSurface || currentSurface.type !== "window") {
        return;
      }
      maybeRefreshWindowSurfaceCandidatesBackground();
      const quickValid = refreshCurrentWindowSurfaceBoundsFromCache();
      if (quickValid) {
        windowSurfaceMissingTicks = 0;
      } else {
        windowSurfaceMissingTicks += 1;
        if (windowSurfaceMissingTicks < 1) {
          return;
        }
      }
      if (!windowRoamEnabledCache && !isPetStillDockedOnWindowSurface(currentSurface)) {
        fallbackCurrentSurfaceToTaskbar("window-surface-detached");
        return;
      }
      const now = Date.now();
      if (now - lastWindowSurfaceHeavyCheckAt < WINDOW_SURFACE_HEAVY_RECHECK_MS) {
        if (quickValid) {
          return;
        }
      }
      lastWindowSurfaceHeavyCheckAt = now;
      if (!validateCurrentWindowSurface()) {
        const invalidWindowId = parseWindowHwnd(currentSurface?.sourceWindowId);
        const roamSurface = windowRoamEnabledCache ? getTopWindowRoamSurface(invalidWindowId) : null;
        if (roamSurface && attachPetToWindowRoamSurface(roamSurface)) {
          windowRoamLastTargetId = parseWindowHwnd(roamSurface.sourceWindowId);
          windowRoamSuppressedWindowId = "";
          windowRoamMissingTicks = 0;
          return;
        }
        const fallback = resetToTaskbarSurface(petWindow.getBounds());
        applySurfaceScale(fallback, activeState, walkDirection);
        groundPetToSurface(activeState, walkDirection, fallback);
        if (isWalkingState()) {
          refreshWalkLoopAfterSurfaceChange();
        }
        if (WINDOW_DOCK_DEBUG) {
          log("window-surface invalidated -> fallback taskbar");
        }
        windowSurfaceMissingTicks = 0;
      }
    }, WINDOW_SURFACE_POLL_INTERVAL_MS);
  }

  function stopWindowSurfacePolling() {
    if (!windowSurfacePollTimer) {
      return;
    }
    clearInterval(windowSurfacePollTimer);
    windowSurfacePollTimer = null;
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
