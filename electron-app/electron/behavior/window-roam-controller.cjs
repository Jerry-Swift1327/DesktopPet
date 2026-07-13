// Window roam controller: selects, attaches, falls back, and polls window surfaces.

function createWindowRoamController(context) {
  const {
    getPetWindow,
    getActiveState,
    getWalkDirection,
    getDragState,
    getWindowDockInProgress,
    getWindowRoamEnabled,
    canToggleWindowRoam,
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
    syncWalkTrackX,
    getWalkVisibleCenterFromWindowX,
    ensureTaskbarWalkRunwayForCenter,
    isWalkingState,
    refreshWalkLoopAfterSurfaceChange,
    safeSend,
    buildScaleSummary,
    getCurrentSurface,
    fallbackCurrentSurfaceToTaskbar,
    getWindowRoamSurfaceById,
    WINDOW_ROAM_MAX_MISSING_TICKS,
    WINDOW_ROAM_POLL_INTERVAL_MS,
    WINDOW_ROAM_START_ATTACH_DELAY_MS
  } = context;

  let windowRoamPollTimer = null;
  let windowRoamLastTargetId = "";
  let windowRoamPreferredTargetId = "";
  let windowRoamSuppressedWindowId = "";
  let windowRoamStartSuppressedUntil = 0;
  let manualTaskbarHold = false;
  let windowRoamInvalidFallbackSuppressedUntil = 0;
  let windowRoamMissingTicks = 0;
  let lastWindowSurfaceHeavyCheckAt = 0;

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

  function attachPetToWindowRoamSurface(surface) {
    const petWindow = getPetWindow();
    if (!petWindow || petWindow.isDestroyed()) {
      return false;
    }
    const activeState = getActiveState();
    const walkDirection = getWalkDirection();
    if (!surface) {
      return false;
    }

    const nextSurface = setCurrentSurface(surface);
    if (!applySurfaceScale(nextSurface, activeState, walkDirection)) {
      return false;
    }
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
      const centerX = getWalkVisibleCenterFromWindowX(next.x, next.y, activeState, walkDirection);
      ensureTaskbarWalkRunwayForCenter(centerX, next.y, walkDirection, nextSurface, {
        force: true,
        reason: "window-roam-attach"
      });
    } else {
      setPetWindowPosition(next.x, next.y);
      syncWalkTrackX(next.x);
    }
    lastWindowSurfaceHeavyCheckAt = Date.now();
    manualTaskbarHold = false;
    if (isWalkingState()) {
      refreshWalkLoopAfterSurfaceChange();
    } else {
      safeSend(petWindow, "pet:scale-changed", buildScaleSummary());
    }
    return true;
  }

  function fallbackWindowRoamToTaskbar(reason = "window-roam-no-target") {
    const petWindow = getPetWindow();
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }
    if (getCurrentSurface().type === "window") {
      fallbackCurrentSurfaceToTaskbar(reason);
    }
  }

  function tickWindowRoam() {
    const petWindow = getPetWindow();
    if (!getWindowRoamEnabled() || getDragState() || getWindowDockInProgress() || !petWindow || petWindow.isDestroyed()) {
      return;
    }
    if (Date.now() < windowRoamStartSuppressedUntil) {
      return;
    }
    if (Date.now() < windowRoamInvalidFallbackSuppressedUntil) {
      return;
    }
    if (manualTaskbarHold && getCurrentSurface().type !== "window") {
      return;
    }

    const currentSurface = getCurrentSurface();
    const currentLockedId = currentSurface?.type === "window"
      ? parseWindowHwnd(currentSurface.sourceWindowId)
      : "";
    if (currentLockedId && currentLockedId === windowRoamLastTargetId) {
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

  function startWindowRoamPolling() {
    if (windowRoamPollTimer || !canToggleWindowRoam()) {
      return;
    }
    refreshWindowSurfaceCandidatesAsync({ force: true });
    manualTaskbarHold = false;
    windowRoamStartSuppressedUntil = Math.max(
      windowRoamStartSuppressedUntil,
      Date.now() + WINDOW_ROAM_START_ATTACH_DELAY_MS
    );
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
    windowRoamStartSuppressedUntil = 0;
    windowRoamInvalidFallbackSuppressedUntil = 0;
    manualTaskbarHold = false;
  }

  function updateWindowRoamPolling() {
    if (getWindowRoamEnabled()) {
      startWindowRoamPolling();
    } else {
      stopWindowRoamPolling();
    }
  }

  function prepareWindowRoamAfterPreferenceEnabled(currentSurface) {
    windowRoamPreferredTargetId = "";
    if (currentSurface?.type === "window") {
      windowRoamPreferredTargetId = parseWindowHwnd(currentSurface.sourceWindowId);
      windowRoamLastTargetId = windowRoamPreferredTargetId;
    }
  }

  function resetWindowRoamState() {
    windowRoamPreferredTargetId = "";
    windowRoamSuppressedWindowId = "";
    windowRoamStartSuppressedUntil = 0;
    windowRoamInvalidFallbackSuppressedUntil = 0;
    manualTaskbarHold = false;
    windowRoamMissingTicks = 0;
  }

  function rememberDockedWindowRoamTarget(surface) {
    if (!getWindowRoamEnabled() || !surface || surface.type !== "window") {
      return;
    }
    windowRoamLastTargetId = parseWindowHwnd(surface.sourceWindowId);
    windowRoamPreferredTargetId = windowRoamLastTargetId;
    windowRoamStartSuppressedUntil = 0;
    windowRoamInvalidFallbackSuppressedUntil = 0;
    manualTaskbarHold = false;
  }

  function clearWindowRoamSuppression() {
    windowRoamSuppressedWindowId = "";
  }

  function markManualTaskbarHold(surface) {
    manualTaskbarHold = true;
    if (surface && surface.type === "window") {
      windowRoamPreferredTargetId = parseWindowHwnd(surface.sourceWindowId);
    }
  }

  function markWindowInvalidTaskbarSettleUntil(timestamp) {
    windowRoamInvalidFallbackSuppressedUntil = timestamp;
  }

  function markWindowRoamAttached(surface) {
    if (!surface) {
      return;
    }
    windowRoamLastTargetId = parseWindowHwnd(surface.sourceWindowId);
    windowRoamSuppressedWindowId = "";
    windowRoamInvalidFallbackSuppressedUntil = 0;
    manualTaskbarHold = false;
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
    markManualTaskbarHold,
    markWindowInvalidTaskbarSettleUntil,
    markWindowRoamAttached
  };
}

module.exports = { createWindowRoamController };
