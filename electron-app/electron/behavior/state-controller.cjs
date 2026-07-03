// 状态控制器，管理宠物状态切换、one-shot 动作结算、起点复位与静默归位编排。
// 从 main.cjs 提取，依赖通过 createStateController(context) 注入；
// 函数实现与 main.cjs 保持一致，不修改控制流与逻辑。
//
// 本控制器持有 one-shot 动作统计待结算状态（pendingActionStatsState），
// 不直接 require electron/fs/path，不注册 IPC，不直接访问窗口/IPC/bubble；
// activeState/selectedState/walkDirection 仍由 main.cjs 持有，经 getter/setter 注入；
// 宠物窗口经 getPetWindow 注入，homeDisplayId/homeWorkArea 经 setter 注入，
// sendPetState/sendWalkDirection 作为通知广播器经回调注入，
// surface/scale/window 副作用经回调注入（仍保留在 main.cjs，待第十四轮迁出）。

function createStateController(context) {
  const {
    // 通知广播器回调
    sendPetState,
    sendWalkDirection,
    // surface/scale/window 回调（不迁移，保留在 main.cjs）
    groundPetToSurface,
    applySurfaceScale,
    resetToTaskbarSurface,
    setCurrentSurface,
    getCurrentSurface,
    getSurfaceDisplay,
    getSurfaceWorkArea,
    getTaskbarHomeVisibleRight,
    getSurfaceVisibleTop,
    getVisibleSpriteInsets,
    getPetSpriteSize,
    getPetWindowPositionForVisibleRect,
    clampPetWindowPositionToSurface,
    setPetWindowPosition,
    syncWalkTrackX,
    markManualTaskbarHold,
    preserveBottomAnchorForState,
    // walk 回调
    resetWalkRuntime,
    startWalkLoop,
    clearTabbySleepPoseTimer,
    scheduleTabbySleepPose,
    applyInterruptedWalkStats,
    applyActionStats,
    shouldDelayActionStats,
    clearPendingWalkBubbleMessage,
    showPendingWalkBubbleMessage,
    materializeTaskbarWalkRunwayForState,
    // 菜单/hover/bubble 回调
    hideStartupBubble,
    hidePetMenu,
    hideHoverPanel,
    showStatMessages,
    // stats 回调
    recordUserOperation,
    recordInteraction,
    // 状态查询回调
    getDefaultDirectionForState,
    getTransitionBottomAnchor,
    getState,
    // 拖拽回调
    clearDragState,
    // home display setter（moveToStartPosition 写入 homeDisplayId/homeWorkArea）
    setHomeDisplayId,
    setHomeWorkArea,
    // 日志
    log,
    // 共享运行态 getter/setter（实时读写 main.cjs 状态，避免快照）
    getActiveState,
    setActiveState,
    getSelectedState,
    setSelectedState,
    getWalkDirection,
    setWalkDirectionValue,
    // 共享运行态访问器
    getTaskbarWalkRunway,
    // 窗口访问器
    getPetWindow,
    // 常量
    DEFAULT_STATE,
    STATE_WALK,
    STATE_SLEEP,
    STATE_YAWN,
    STATE_HISS,
    TABBY_IDLE_STATES,
    ONE_SHOT_STATES,
    states
  } = context;

  let pendingActionStatsState = null;
  let pendingVisualStateCommit = null;

  function setWalkDirection(nextDirection) {
    const normalizedDirection = nextDirection >= 0 ? 1 : -1;
    if (getWalkDirection() === normalizedDirection) {
      return;
    }
    setWalkDirectionValue(normalizedDirection);
    sendWalkDirection();
  }

  function setState(state, shouldRecordInteraction = true) {
    if (!states.some((item) => item.id === state)) {
      return;
    }

    if (shouldRecordInteraction && TABBY_IDLE_STATES.has(state)) {
      return;
    }
    const previousState = getActiveState();
    const previousDirection = getWalkDirection();
    const nextState = getState(state);
    const transitionAnchor = previousState !== state
      ? getTransitionBottomAnchor(previousState, previousDirection)
      : null;
    const leavingMovingState = Boolean(getState(previousState)?.moving && !nextState?.moving);
    const leavingTaskbarWalkRunway = Boolean(getTaskbarWalkRunway() && previousState === STATE_WALK && !nextState?.moving);
    if (leavingMovingState) {
      setWalkDirectionValue(getDefaultDirectionForState(state));
    }
    if (leavingTaskbarWalkRunway) {
      materializeTaskbarWalkRunwayForState(state, getWalkDirection(), { notifyScale: false });
      sendWalkDirection();
    }

    let statMessagesToShow = [];
    if (shouldRecordInteraction) {
      recordUserOperation();
      recordInteraction();
      if (previousState === STATE_WALK && state !== STATE_WALK) {
        applyInterruptedWalkStats();
      }
      if (shouldDelayActionStats(state)) {
        pendingActionStatsState = state;
      } else if (state === STATE_WALK) {
        pendingActionStatsState = null;
      } else {
        pendingActionStatsState = null;
        if (!(previousState === STATE_WALK && state === DEFAULT_STATE)) {
          statMessagesToShow = applyActionStats(state);
        }
      }
    }
    setSelectedState(state);
    setActiveState(state);
    if (previousState !== state) {
      clearTabbySleepPoseTimer();
    }
    if (previousState === STATE_WALK && getActiveState() !== DEFAULT_STATE) {
      clearPendingWalkBubbleMessage();
    }
    pendingVisualStateCommit = null;
    const deferredVisualCommit = previousState !== state
      && transitionAnchor
      && preserveBottomAnchorForState(transitionAnchor, previousState, previousDirection, getCurrentSurface());
    if (getState(getActiveState())?.moving) {
      hideStartupBubble({ force: true });
      hidePetMenu();
      hideHoverPanel();
      resetWalkRuntime();
      if (deferredVisualCommit) {
        pendingVisualStateCommit = { state, moving: true };
      } else {
        startWalkLoop();
      }
    } else {
      resetWalkRuntime();
      if (deferredVisualCommit) {
        pendingVisualStateCommit = { state, moving: false };
      } else {
        groundPetToSurface(getActiveState(), getWalkDirection(), getCurrentSurface());
        preserveBottomAnchorForState(transitionAnchor, getActiveState(), getWalkDirection(), getCurrentSurface());
      }
    }
    sendPetState();
    if (getActiveState() === STATE_SLEEP) {
      scheduleTabbySleepPose(getActiveState());
    }
    showStatMessages(statMessagesToShow);
    showPendingWalkBubbleMessage();
  }

  function completeVisualStateCommit(renderedState) {
    if (!pendingVisualStateCommit) {
      return false;
    }
    if (getActiveState() !== pendingVisualStateCommit.state) {
      pendingVisualStateCommit = null;
      return false;
    }
    if (renderedState !== pendingVisualStateCommit.state) {
      return false;
    }

    const commit = pendingVisualStateCommit;
    pendingVisualStateCommit = null;
    if (commit.moving) {
      startWalkLoop();
    } else {
      groundPetToSurface(getActiveState(), getWalkDirection(), getCurrentSurface());
    }
    return true;
  }

  function completeOneShotState(state) {
    if (!ONE_SHOT_STATES.has(state) || getActiveState() !== state) {
      return;
    }
    const shouldApplyPendingStats = pendingActionStatsState === state;
    setState(DEFAULT_STATE, false);
    if (shouldApplyPendingStats) {
      pendingActionStatsState = null;
      showStatMessages(applyActionStats(state));
    }
  }

  function isWalkingState() {
    return Boolean(getState(getActiveState())?.moving);
  }

  function moveToStartPosition(options = true) {
    const hasOptionsObject = options && typeof options === "object";
    const shouldRecordOperation = hasOptionsObject
      ? options.shouldRecordOperation !== false
      : options;
    const forceTaskbar = hasOptionsObject ? Boolean(options.forceTaskbar) : false;
    const notifyState = hasOptionsObject ? options.notifyState !== false : true;
    const win = getPetWindow();
    if (!win || win.isDestroyed()) {
      return;
    }
    clearDragState({ notify: true });
    hideStartupBubble({ force: true });
    hidePetMenu();
    hideHoverPanel();

    let surface = forceTaskbar ? resetToTaskbarSurface(win.getBounds()) : getCurrentSurface();
    if (!forceTaskbar && surface.type !== "window") {
      surface = resetToTaskbarSurface();
    }
    if (!applySurfaceScale(surface, getActiveState(), getWalkDirection())) {
      surface = resetToTaskbarSurface();
      applySurfaceScale(surface, getActiveState(), getWalkDirection());
    }
    setCurrentSurface(surface);
    const display = getSurfaceDisplay(surface);
    const area = getSurfaceWorkArea(surface);
    setHomeDisplayId(display.id);
    setHomeWorkArea(area);
    setWalkDirectionValue(-1);
    const visibleInsets = getVisibleSpriteInsets(getActiveState(), getWalkDirection());
    const visibleWidth = getPetSpriteSize() - visibleInsets.left - visibleInsets.right;
    const visibleLeft = getTaskbarHomeVisibleRight(surface, getActiveState(), getWalkDirection()) - visibleWidth;
    const { x, y } = getPetWindowPositionForVisibleRect(visibleLeft, getSurfaceVisibleTop(surface, getActiveState(), getWalkDirection()), getActiveState(), getWalkDirection());
    const next = clampPetWindowPositionToSurface(x, y, surface, getActiveState(), getWalkDirection());
    setPetWindowPosition(next.x, next.y);
    syncWalkTrackX(next.x);
    const bounds = win.getBounds();
    log(`reset-position target=${next.x},${next.y} actual=${bounds.x},${bounds.y},${bounds.width},${bounds.height} surface=${surface.type} state=${getActiveState()}`);
    if (shouldRecordOperation) {
      recordUserOperation();
    }
    if (notifyState) {
      sendPetState();
    } else {
      sendWalkDirection();
    }
  }

  function settlePetQuietly() {
    const win = getPetWindow();
    if (!win || win.isDestroyed()) {
      return;
    }

    pendingActionStatsState = null;
    clearDragState({ notify: true });
    hideStartupBubble({ force: true });
    hidePetMenu();
    hideHoverPanel();
    const surface = getCurrentSurface();
    if (surface.type === "window") {
      markManualTaskbarHold(surface);
      resetToTaskbarSurface(win.getBounds());
    } else {
      markManualTaskbarHold(null);
    }
    const wasDefaultState = getActiveState() === DEFAULT_STATE;
    resetWalkRuntime();
    if (!wasDefaultState) {
      setSelectedState(DEFAULT_STATE);
      setActiveState(DEFAULT_STATE);
    }
    setWalkDirectionValue(-1);
    moveToStartPosition({ shouldRecordOperation: true, forceTaskbar: true, notifyState: !wasDefaultState });
  }

  return {
    setState,
    completeOneShotState,
    moveToStartPosition,
    settlePetQuietly,
    setWalkDirection,
    isWalkingState,
    completeVisualStateCommit
  };
}

module.exports = { createStateController };
