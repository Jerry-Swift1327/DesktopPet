// 窗口漫游控制器，管理宠物在窗口表面上的漫游目标选取、附着、回退与轮询。
// 从 main.cjs 提取，依赖通过 createWindowRoamController(context) 注入；
// 运行时可变状态通过访问器读取，避免创建瞬间固化快照；私有变量保存轮询状态。

function createWindowRoamController(context) {
  const {
    // 窗口与状态访问器（实时读取，避免快照）
    getPetWindow,
    getActiveState,
    getWalkDirection,
    getDragState,
    getWindowDockInProgress,
    getWindowRoamEnabled,
    canToggleWindowRoam,
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
    // 常量
    WINDOW_ROAM_MAX_MISSING_TICKS,
    WINDOW_ROAM_POLL_INTERVAL_MS
  } = context;

  // 控制器私有状态：轮询定时器与漫游目标记录
  let windowRoamPollTimer = null;
  let windowRoamLastTargetId = "";
  let windowRoamPreferredTargetId = "";
  let windowRoamSuppressedWindowId = "";
  let windowRoamDragFallbackSuppressedUntil = 0;
  let windowRoamMissingTicks = 0;
  let lastWindowSurfaceHeavyCheckAt = 0;

  // 选取首个可附着的窗口表面，可排除指定窗口与当前抑制的窗口
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

  // 将宠物附着到指定窗口表面，更新缩放、位置与行走轨道
  function attachPetToWindowRoamSurface(surface) {
    const petWindow = getPetWindow();
    if (!petWindow || petWindow.isDestroyed()) {
      return false;
    }
    const activeState = getActiveState();
    const walkDirection = getWalkDirection();
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

  // 当前无可用窗口表面时，回退到任务栏
  function fallbackWindowRoamToTaskbar(reason = "window-roam-no-target") {
    const petWindow = getPetWindow();
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }
    if (getCurrentSurface().type === "window") {
      fallbackCurrentSurfaceToTaskbar(reason);
    }
  }

  // 单次轮询：选取优先或首个窗口表面并附着，缺失超过阈值则回退
  function tickWindowRoam() {
    const petWindow = getPetWindow();
    if (!getWindowRoamEnabled() || getDragState() || getWindowDockInProgress() || !petWindow || petWindow.isDestroyed()) {
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
      const activeState = getActiveState();
      const walkDirection = getWalkDirection();
      setCurrentSurface(surface);
      groundPetToSurface(activeState, walkDirection, getCurrentSurface());
      return;
    }

    if (attachPetToWindowRoamSurface(surface)) {
      windowRoamLastTargetId = targetId;
      windowRoamSuppressedWindowId = "";
    }
  }

  // 启动轮询定时器，仅在可切换且未启动时生效
  function startWindowRoamPolling() {
    if (windowRoamPollTimer || !canToggleWindowRoam()) {
      return;
    }
    tickWindowRoam();
    windowRoamPollTimer = setInterval(tickWindowRoam, WINDOW_ROAM_POLL_INTERVAL_MS);
  }

  // 停止轮询定时器并清空目标记录
  function stopWindowRoamPolling() {
    if (!windowRoamPollTimer) {
      return;
    }
    clearInterval(windowRoamPollTimer);
    windowRoamPollTimer = null;
    windowRoamLastTargetId = "";
    windowRoamPreferredTargetId = "";
  }

  // 根据启用状态切换轮询
  function updateWindowRoamPolling() {
    if (getWindowRoamEnabled()) {
      startWindowRoamPolling();
    } else {
      stopWindowRoamPolling();
    }
  }

  // 启用漫游时，如当前在窗口表面，记录当前窗口为优先目标（对应 setWindowRoamPreference）
  function prepareWindowRoamAfterPreferenceEnabled(currentSurface) {
    windowRoamPreferredTargetId = "";
    if (currentSurface?.type === "window") {
      windowRoamPreferredTargetId = parseWindowHwnd(currentSurface.sourceWindowId);
      windowRoamLastTargetId = windowRoamPreferredTargetId;
    }
  }

  // 清空优先目标、抑制目标、miss 计数与回退抑制（对应 setWindowRoamPreference 前半段）
  function resetWindowRoamState() {
    windowRoamPreferredTargetId = "";
    windowRoamSuppressedWindowId = "";
    windowRoamDragFallbackSuppressedUntil = 0;
    windowRoamMissingTicks = 0;
  }

  // 贴靠成功后记录窗口目标并清空回退抑制（对应 dockPetAfterDrag 成功分支）
  function rememberDockedWindowRoamTarget(surface) {
    if (!getWindowRoamEnabled() || !surface || surface.type !== "window") {
      return;
    }
    windowRoamLastTargetId = parseWindowHwnd(surface.sourceWindowId);
    windowRoamPreferredTargetId = windowRoamLastTargetId;
    windowRoamDragFallbackSuppressedUntil = 0;
  }

  // 拖拽贴靠失败后抑制旧窗口（对应 dockPetAfterDrag 失败分支前半段）
  function suppressPreviousWindowAfterDockMiss(previousWindowId) {
    if (!getWindowRoamEnabled() || !previousWindowId) {
      return;
    }
    windowRoamSuppressedWindowId = previousWindowId;
  }

  // 设置回退抑制时间戳（对应 dockPetAfterDrag 失败分支后半段）
  function setDragFallbackSuppressionUntil(timestamp) {
    windowRoamDragFallbackSuppressedUntil = timestamp;
  }

  // 清理抑制窗口（对应 dockPetAfterDrag 成功分支末尾）
  function clearWindowRoamSuppression() {
    windowRoamSuppressedWindowId = "";
  }

  // 窗口表面轮询切换成功时记录目标并清空 miss 计数（对应 startWindowSurfacePolling 漫游切换成功分支）
  function markWindowRoamAttached(surface) {
    if (!surface) {
      return;
    }
    windowRoamLastTargetId = parseWindowHwnd(surface.sourceWindowId);
    windowRoamSuppressedWindowId = "";
    windowRoamMissingTicks = 0;
  }

  // settlePetQuietly 时记录当前窗口为抑制目标并清空 lastTargetId（对应 settlePetQuietly window 分支）
  function suppressCurrentWindowForSettle(surface) {
    if (!surface || surface.type !== "window") {
      return;
    }
    windowRoamSuppressedWindowId = parseWindowHwnd(surface.sourceWindowId);
    windowRoamLastTargetId = "";
  }

  return {
    getTopWindowRoamSurface,
    attachPetToWindowRoamSurface,
    fallbackWindowRoamToTaskbar,
    tickWindowRoam,
    startWindowRoamPolling,
    stopWindowRoamPolling,
    updateWindowRoamPolling,
    prepareWindowRoamAfterPreferenceEnabled,
    resetWindowRoamState,
    rememberDockedWindowRoamTarget,
    suppressPreviousWindowAfterDockMiss,
    clearWindowRoamSuppression,
    markWindowRoamAttached,
    suppressCurrentWindowForSettle,
    setDragFallbackSuppressionUntil
  };
}

module.exports = { createWindowRoamController };
