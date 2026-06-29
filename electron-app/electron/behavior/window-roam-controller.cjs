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
    getVisiblePetRectFromBounds,
    applySurfaceScale,
    setCurrentSurface,
    groundPetToSurface,
    getVisibleSpriteInsets,
    getPetSpriteSize,
    getPetWindowPositionForVisibleRect,
    getSurfaceVisibleTop,
    clampPetWindowPositionToSurface,
    setPetWindowPosition,
    animatePetWindowTo,
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
    WINDOW_ROAM_POLL_INTERVAL_MS,
    WINDOW_ROAM_START_ATTACH_DELAY_MS,
    WINDOW_ROAM_ATTACH_BLEND_MS
  } = context;

  // 控制器私有状态：轮询定时器与漫游目标记录
  let windowRoamPollTimer = null;
  let windowRoamLastTargetId = "";
  let windowRoamPreferredTargetId = "";
  let windowRoamSuppressedWindowId = "";
  let windowRoamDragFallbackSuppressedUntil = 0;
  let pendingManualTaskbarSettle = null;
  let windowRoamMissingTicks = 0;
  let lastWindowSurfaceHeavyCheckAt = 0;

  // 选取首个可附着的窗口表面，可排除指定窗口与当前抑制的窗口
  function collectWindowRoamSurfaceEntries(excludedWindowId = "") {
    const excludedId = parseWindowHwnd(excludedWindowId);
    const candidates = getCachedWindowSurfaceCandidates();
    const entries = [];
    for (const item of candidates) {
      const itemWindowId = parseWindowHwnd(item.hwnd);
      if (itemWindowId === windowRoamSuppressedWindowId || (excludedId && itemWindowId === excludedId)) {
        continue;
      }
      const built = buildWindowSurfaceFromItem(item);
      if (built.surface) {
        entries.push({ id: itemWindowId, surface: built.surface });
      }
    }
    return entries;
  }

  function findWindowRoamSurfaceById(windowId, entries) {
    const targetId = parseWindowHwnd(windowId);
    if (!targetId || targetId === windowRoamSuppressedWindowId) {
      return null;
    }
    const entry = entries.find((item) => item.id === targetId);
    if (entry?.surface) {
      return entry.surface;
    }
    const surface = getWindowRoamSurfaceById(targetId);
    return parseWindowHwnd(surface?.sourceWindowId) === targetId ? surface : null;
  }

  function getPetVisibleCenter() {
    const petWindow = getPetWindow();
    if (!petWindow || petWindow.isDestroyed()) {
      return null;
    }
    const visibleRect = getVisiblePetRectFromBounds(
      petWindow.getBounds(),
      getActiveState(),
      getWalkDirection()
    );
    if (!visibleRect) {
      return null;
    }
    return {
      x: visibleRect.x + Math.round(visibleRect.width / 2),
      y: visibleRect.y + Math.round(visibleRect.height / 2)
    };
  }

  function getDistanceToWindowSurface(surface, point) {
    const surfaceX = Math.max(surface.left, Math.min(point.x, surface.right));
    const surfaceY = surface.groundY;
    return Math.pow(point.x - surfaceX, 2) + Math.pow(point.y - surfaceY, 2);
  }

  function doWindowRectsOverlap(a, b) {
    if (!a || !b) {
      return false;
    }
    return Math.min(a.right, b.right) > Math.max(a.left, b.left)
      && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
  }

  function chooseNearestWindowRoamSurface(entries) {
    if (entries.length <= 1) {
      return entries[0]?.surface || null;
    }
    const petCenter = getPetVisibleCenter();
    if (!petCenter) {
      return entries[0].surface;
    }

    let best = null;
    for (const entry of entries) {
      const score = getDistanceToWindowSurface(entry.surface, petCenter);
      if (!best) {
        best = { ...entry, score };
        continue;
      }
      if (doWindowRectsOverlap(best.surface.bounds, entry.surface.bounds)) {
        continue;
      }
      if (score < best.score) {
        best = { ...entry, score };
      }
    }
    return best?.surface || null;
  }

  function selectWindowRoamSurface(excludedWindowId = "") {
    refreshWindowSurfaceCandidatesAsync();
    const entries = collectWindowRoamSurfaceEntries(excludedWindowId);
    const currentLockedId = getCurrentSurface().type === "window" ? windowRoamLastTargetId : "";
    const preferredSurface = windowRoamPreferredTargetId
      ? findWindowRoamSurfaceById(windowRoamPreferredTargetId, entries)
      : null;
    const lockedSurface = !preferredSurface && currentLockedId
      ? findWindowRoamSurfaceById(currentLockedId, entries)
      : null;
    windowRoamPreferredTargetId = "";
    return preferredSurface || lockedSurface || chooseNearestWindowRoamSurface(entries);
  }

  function getTopWindowRoamSurface(excludedWindowId = "") {
    refreshWindowSurfaceCandidatesAsync();
    return collectWindowRoamSurfaceEntries(excludedWindowId)[0]?.surface || null;
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
    if (isWalkingState()) {
      setPetWindowPosition(next.x, next.y);
    } else {
      animatePetWindowTo(next.x, next.y, WINDOW_ROAM_ATTACH_BLEND_MS);
    }
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
    if (pendingManualTaskbarSettle) {
      return;
    }

    const surface = selectWindowRoamSurface();
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
    refreshWindowSurfaceCandidatesAsync({ force: true });
    windowRoamDragFallbackSuppressedUntil = Math.max(
      windowRoamDragFallbackSuppressedUntil,
      Date.now() + WINDOW_ROAM_START_ATTACH_DELAY_MS
    );
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
    windowRoamDragFallbackSuppressedUntil = 0;
    pendingManualTaskbarSettle = null;
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
    pendingManualTaskbarSettle = null;
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
    pendingManualTaskbarSettle = null;
  }

  // 清理抑制窗口（对应 dockPetAfterDrag 成功分支末尾）
  function clearWindowRoamSuppression() {
    windowRoamSuppressedWindowId = "";
  }

  // 手动回任务栏冷却：设置冷却时间戳并把当前窗口记为下一次优先恢复目标，
  // 保留 sticky target（不清空 lastTargetId、不写入 suppressedWindowId）
  function markManualTaskbarSettleUntil(timestamp, surface, options = {}) {
    const deferUntilState = typeof options.deferUntilState === "string" ? options.deferUntilState : "";
    if (deferUntilState) {
      pendingManualTaskbarSettle = {
        durationMs: Math.max(0, timestamp - Date.now()),
        state: deferUntilState
      };
    } else {
      pendingManualTaskbarSettle = null;
      windowRoamDragFallbackSuppressedUntil = timestamp;
    }
    if (surface && surface.type === "window") {
      windowRoamPreferredTargetId = parseWindowHwnd(surface.sourceWindowId);
    }
  }

  function completePendingManualTaskbarSettle(state) {
    if (!pendingManualTaskbarSettle || state !== pendingManualTaskbarSettle.state) {
      return;
    }
    windowRoamDragFallbackSuppressedUntil = Date.now() + pendingManualTaskbarSettle.durationMs;
    pendingManualTaskbarSettle = null;
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
    clearWindowRoamSuppression,
    markManualTaskbarSettleUntil,
    completePendingManualTaskbarSettle,
    markWindowRoamAttached
  };
}

module.exports = { createWindowRoamController };
