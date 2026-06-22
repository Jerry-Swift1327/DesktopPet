// 窗口漫游控制器，管理宠物在窗口表面上的漫游目标选取、附着、回退与轮询。
// 从 main.cjs 提取，依赖通过 createWindowRoamController(context) 注入；
// 函数实现与 main.cjs 保持一致，不修改控制流与逻辑。

function createWindowRoamController(context) {
  const {
    // 依赖函数
    refreshWindowSurfaceCandidatesAsync,
    parseWindowHwnd,
    getCachedWindowSurfaceCandidates,
    buildWindowSurfaceFromItem,
    applySurfaceScale,
    setCurrentSurface,
    groundPetToSurface,
    getVisibleSpriteInsets,
    getPetSpriteSize,
    getPetWindowPositionForVisibleRect,
    getSurfaceVisibleTop,
    clampPetWindowPositionToSurface,
    setPetWindowPosition,
    syncWalkTrackX,
    isWalkingState,
    refreshWalkLoopAfterSurfaceChange,
    safeSend,
    buildScaleSummary,
    getCurrentSurface,
    fallbackCurrentSurfaceToTaskbar,
    getWindowRoamSurfaceById,
    canToggleWindowRoam,
    // 外部状态（只读）
    petWindow,
    activeState,
    walkDirection,
    dragState,
    windowDockInProgress,
    // 常量
    WINDOW_ROAM_MAX_MISSING_TICKS,
    WINDOW_ROAM_POLL_INTERVAL_MS
  } = context;

  // 窗口漫游相关状态（原 main.cjs 中的全局变量）
  let windowRoamPollTimer = null;
  let windowRoamLastTargetId = "";
  let windowRoamPreferredTargetId = "";
  let windowRoamSuppressedWindowId = "";
  let windowRoamEnabledCache = false;
  let windowRoamDragFallbackSuppressedUntil = 0;
  let windowRoamMissingTicks = 0;
  let lastWindowSurfaceHeavyCheckAt = 0;

  function getTopWindowRoamSurface(excludedWindowId = "") {
    refreshWindowSurfaceCandidatesAsync();
    const excludedId = parseWindowHwnd(excludedWindowId);
    const candidates = getCachedWindowSurfaceCandidates();
    for (const item of candidates) {
      const itemWindowId = parseWindowHwnd(item.hwnd);
      if (itemWindowId === windowRoamSuppressedWindowId || (excludedId && itemWindowId === excludedId)) {
        continue;
      }
      const built = buildWindowSurfaceFromItem(item);
      if (built.surface) {
        return built.surface;
      }
    }
    return null;
  }

  function attachPetToWindowRoamSurface(surface) {
    if (!petWindow || petWindow.isDestroyed()) {
      return false;
    }
    if (!surface || !applySurfaceScale(surface, activeState, walkDirection)) {
      return false;
    }

    const nextSurface = setCurrentSurface(surface);
    groundPetToSurface(activeState, walkDirection, nextSurface);
    const visibleInsets = getVisibleSpriteInsets(activeState, walkDirection);
    const visibleWidth = getPetSpriteSize() - visibleInsets.left - visibleInsets.right;
    const visibleLeft = nextSurface.right - visibleWidth;
    const target = getPetWindowPositionForVisibleRect(
      visibleLeft,
      getSurfaceVisibleTop(nextSurface, activeState, walkDirection),
      activeState,
      walkDirection
    );
    const next = clampPetWindowPositionToSurface(target.x, target.y, nextSurface, activeState, walkDirection);
    setPetWindowPosition(next.x, next.y);
    syncWalkTrackX(next.x);
    lastWindowSurfaceHeavyCheckAt = Date.now();
    if (isWalkingState()) {
      refreshWalkLoopAfterSurfaceChange();
    } else {
      safeSend(petWindow, "pet:scale-changed", buildScaleSummary());
    }
    return true;
  }

  function fallbackWindowRoamToTaskbar(reason = "window-roam-no-target") {
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }
    if (getCurrentSurface().type === "window") {
      fallbackCurrentSurfaceToTaskbar(reason);
    }
  }

  function tickWindowRoam() {
    if (!windowRoamEnabledCache || dragState || windowDockInProgress || !petWindow || petWindow.isDestroyed()) {
      return;
    }
    if (Date.now() < windowRoamDragFallbackSuppressedUntil) {
      return;
    }

    const preferredSurface = windowRoamPreferredTargetId
      ? getWindowRoamSurfaceById(windowRoamPreferredTargetId)
      : null;
    windowRoamPreferredTargetId = "";
    const surface = preferredSurface || getTopWindowRoamSurface();
    if (!surface) {
      windowRoamMissingTicks += 1;
      if (windowRoamMissingTicks >= WINDOW_ROAM_MAX_MISSING_TICKS) {
        windowRoamLastTargetId = "";
        fallbackWindowRoamToTaskbar();
      }
      return;
    }

    windowRoamMissingTicks = 0;
    const targetId = parseWindowHwnd(surface.sourceWindowId);
    if (targetId === windowRoamLastTargetId && getCurrentSurface().type === "window") {
      setCurrentSurface(surface);
      groundPetToSurface(activeState, walkDirection, getCurrentSurface());
      return;
    }

    if (attachPetToWindowRoamSurface(surface)) {
      windowRoamLastTargetId = targetId;
      windowRoamSuppressedWindowId = "";
    }
  }

  function startWindowRoamPolling() {
    if (windowRoamPollTimer || !canToggleWindowRoam()) {
      return;
    }
    tickWindowRoam();
    windowRoamPollTimer = setInterval(tickWindowRoam, WINDOW_ROAM_POLL_INTERVAL_MS);
  }

  function stopWindowRoamPolling() {
    if (!windowRoamPollTimer) {
      return;
    }
    clearInterval(windowRoamPollTimer);
    windowRoamPollTimer = null;
    windowRoamLastTargetId = "";
    windowRoamPreferredTargetId = "";
  }

  function updateWindowRoamPolling() {
    if (windowRoamEnabledCache) {
      startWindowRoamPolling();
    } else {
      stopWindowRoamPolling();
    }
  }

  return {
    getTopWindowRoamSurface,
    attachPetToWindowRoamSurface,
    fallbackWindowRoamToTaskbar,
    tickWindowRoam,
    startWindowRoamPolling,
    stopWindowRoamPolling,
    updateWindowRoamPolling
  };
}

module.exports = { createWindowRoamController };
