// 拖拽控制器，管理宠物窗口拖拽运行态与拖拽开始、更新、结束流程。
// 从 main.cjs 提取，依赖通过 createDragController(context) 注入；
// 函数实现与 main.cjs 保持一致，不修改控制流与逻辑。
//
// 本控制器持有拖拽运行态（dragTimer/dragState/lastDragSample），
// 不直接 require electron/fs/path，不注册 IPC，不直接访问窗口/IPC/bubble；
// 窗口经 getPetWindow 注入，screen.getCursorScreenPoint 经 getCursorScreenPoint 回调注入，
// safeSend 经回调注入，dockPetAfterDrag 经回调注入（仍委托 dockController，不内联）。

function createDragController(context) {
  const {
    // 依赖函数
    safeSend,
    removeInteractionPause,
    clampPetWindowPosition,
    setPetWindowPosition,
    syncWalkTrackX,
    getLastWindowSurfaceAsyncRefreshAt,
    refreshWindowSurfaceCandidatesAsync,
    getCursorScreenPoint,
    isScreenPoint,
    isCustomizationVisible,
    materializeTaskbarWalkRunway,
    isPetWindowLayoutPending = () => false,
    whenPetWindowLayoutSettled = (callback) => callback({ completed: true }),
    recordUserOperation,
    addInteractionPause,
    clearHoverIntent,
    hideStartupBubble,
    hidePetMenu,
    hideHoverPanel,
    hideCustomizationPanel,
    setIsPointerOverHoverPanel,
    log,
    logWalkDiagnostic,
    isInteractionPaused,
    getInteractionPauseSummary,
    // dock 回调，委托给 main.cjs 薄包装后的 dockPetAfterDrag（仍委托 dockController）
    dockPetAfterDrag,
    settlePetInPlaceAfterDrag,
    // 外部状态访问器（实时读取 main.cjs 状态，避免快照）
    getPetWindow,
    getActiveState,
    getWalkDirection,
    getCurrentSurface,
    getTaskbarWalkRunway,
    getWindowDockInProgress,
    setWindowDockInProgress,
    isWindowDockingEnabled,
    // 常量
    WINDOW_SURFACE_DRAG_REFRESH_MIN_MS
  } = context;

  let dragTimer = null;
  let dragState = null;
  let lastDragSample = null;
  let dragStartToken = 0;

  function sendDragState(isDragging) {
    const petWindow = getPetWindow();
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }
    safeSend(petWindow, "pet:drag-state-changed", isDragging);
  }

  function clearDragState({ notify = true, keepPause = false } = {}) {
    dragState = null;
    if (dragTimer) {
      clearInterval(dragTimer);
      dragTimer = null;
    }
    if (!keepPause) {
      removeInteractionPause("drag");
    }
    if (notify) {
      sendDragState(false);
    }
  }

  function updateDragPosition() {
    const petWindow = getPetWindow();
    if (!petWindow || petWindow.isDestroyed() || !dragState) {
      return;
    }
    if (dragState.lastPoint) {
      const now = Date.now();
      const dx = dragState.lastPoint.x - dragState.originPoint.x;
      const dy = dragState.lastPoint.y - dragState.originPoint.y;
      const dt = Math.max(1, now - dragState.lastPoint.at);
      const distance = Math.hypot(dx, dy);
      const speedPxPerSec = Math.round((distance * 1000) / dt);
      dragState.lastSample = {
        at: now,
        speedPxPerSec
      };
    }
    const point = getCursorScreenPoint();
    const now = Date.now();
    if (dragState.lastPoint) {
      dragState.originPoint = dragState.lastPoint;
    }
    dragState.lastPoint = {
      x: point.x,
      y: point.y,
      at: now
    };
    const next = clampPetWindowPosition(point.x - dragState.offsetX, point.y - dragState.offsetY);
    setPetWindowPosition(next.x, next.y);
    syncWalkTrackX(next.x);
    if (isWindowDockingEnabled()) {
      const sinceLastRefresh = now - getLastWindowSurfaceAsyncRefreshAt();
      if (sinceLastRefresh >= WINDOW_SURFACE_DRAG_REFRESH_MIN_MS) {
        refreshWindowSurfaceCandidatesAsync();
      }
    }
  }

  function startDragTimer() {
    if (dragTimer) {
      clearInterval(dragTimer);
    }
    updateDragPosition();
    dragTimer = setInterval(updateDragPosition, 16);
  }

  function beginDrag(point, token) {
    const petWindow = getPetWindow();
    if (token !== dragStartToken || !petWindow || petWindow.isDestroyed()) {
      return;
    }
    const bounds = petWindow.getBounds();
    recordUserOperation();
    clearDragState({ notify: false });
    addInteractionPause("drag");
    clearHoverIntent();
    hideStartupBubble({ force: true });
    hidePetMenu();
    hideHoverPanel();
    hideCustomizationPanel();
    setIsPointerOverHoverPanel(false);
    const now = Date.now();

    dragState = {
      offsetX: point.screenX - bounds.x,
      offsetY: point.screenY - bounds.y,
      originPoint: { x: point.screenX, y: point.screenY, at: now },
      lastPoint: { x: point.screenX, y: point.screenY, at: now },
      lastSample: { at: now, speedPxPerSec: 0 }
    };
    lastDragSample = dragState.lastSample;
    log(`drag-start cursor=${point.screenX},${point.screenY} bounds=${bounds.x},${bounds.y},${bounds.width},${bounds.height}`);
    sendDragState(true);
    startDragTimer();
  }

  function handleDragStart(_event, point) {
    const petWindow = getPetWindow();
    if (!petWindow || petWindow.isDestroyed() || !isScreenPoint(point) || isCustomizationVisible()) {
      return;
    }

    const token = ++dragStartToken;
    if (getTaskbarWalkRunway()) {
      materializeTaskbarWalkRunway({ stateId: getActiveState(), direction: getWalkDirection() });
      if (isPetWindowLayoutPending()) {
        whenPetWindowLayoutSettled((result) => {
          if (result?.completed) {
            beginDrag(point, token);
          }
        });
        return;
      }
    }
    beginDrag(point, token);
  }

  function handleDragEnd() {
    dragStartToken += 1;
    const petWindow = getPetWindow();
    if (dragState && petWindow && !petWindow.isDestroyed()) {
      if (getWindowDockInProgress()) {
        clearDragState({ notify: true });
        return;
      }
      const bounds = petWindow.getBounds();
      if (dragState?.lastSample) {
        lastDragSample = dragState.lastSample;
      }
      log(`drag-end bounds=${bounds.x},${bounds.y},${bounds.width},${bounds.height}`);
      if (!isWindowDockingEnabled()) {
        settlePetInPlaceAfterDrag(bounds, "window-docking-disabled");
        clearDragState({ notify: true });
        return;
      }
      setWindowDockInProgress(true);
      logWalkDiagnostic(`drag-end dock-start state=${getActiveState()} surface=${getCurrentSurface()?.type || "unknown"} paused=${isInteractionPaused()} reasons=${getInteractionPauseSummary()}`);
      setImmediate(() => {
        dockPetAfterDrag();
      });
      clearDragState({ notify: true, keepPause: true });
      return;
    }
    clearDragState({ notify: true });
  }

  return {
    clearDragState,
    startDragTimer,
    updateDragPosition,
    handleDragStart,
    handleDragEnd,
    getDragState: () => dragState,
    getLastDragSample: () => lastDragSample,
    getDragTimer: () => dragTimer,
    sendDragState
  };
}

module.exports = { createDragController };
