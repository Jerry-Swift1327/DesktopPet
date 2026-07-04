// 行走控制器，管理宠物行走循环的调度、表面变更刷新、循环完成处理，
// 以及任务栏与窗口表面的逐步推进逻辑（advanceTaskbarWalkStep / advanceWalkStep）。
// 从 main.cjs 提取，依赖通过 createWalkController(context) 注入；
// 函数实现与 main.cjs 保持一致，不修改控制流与逻辑。
//
// 本控制器为无状态函数束：所有运行时可变状态（petWindow、activeState、petScale、
// preferredPetScale、interactionPauseReasons、walkTrackX 以及 12 个行走运行时变量）
// 均不在 controller 内部持有副本，而是通过 context 注入的访问器（getter）读取
// main.cjs 的实时状态，通过 setter 回写 main.cjs 状态，避免快照固化与双状态源风险。

function createWalkController(context) {
  const {
    // 依赖函数
    clearWalkLoopTimer,
    isInteractionPaused,
    resetWalkRuntime,
    alignWalkLoopToSurface,
    pauseWalkLoopClock,
    sendStats,
    isWalkingState,
    getCurrentSurface,
    getWalkVisibleLimits,
    getVisiblePetRectFromBounds,
    applyCompletedWalkStats,
    getDefaultDirectionForState,
    materializeTaskbarWalkRunwayForState,
    sendWalkDirection,
    setState,
    groundPetToSurface,
    sendPetState,
    showStatMessages,
    syncWalkTrackX,
    getWalkVisibleCenterFromWindowX,
    getTaskbarWalkCenterLimits,
    clamp,
    setWalkDirection,
    setTaskbarWalkRunwayForEdge,
    ensureTaskbarWalkRunwayForCenter,
    buildScaleSummary,
    updatePetWindowMousePassthrough,
    logWalkStepDiagnostic,
    buildWalkStepResult,
    applySurfaceScale,
    resetToTaskbarSurface,
    getGroundedWindowYForSurface,
    getWalkVisibleRectFromWindowX,
    getRenderedGroundedWindowYForSurface,
    getRenderedWalkVisibleRectFromWindowX,
    getWindowXForVisibleEdge,
    getSafeWindowXForDirection,
    getRenderedSafeWindowXForDirection,
    setWalkWindowPositionDirect,
    setWalkWindowPosition,
    // 外部状态访问器（读取 main.cjs 实时状态）
    getPetWindow,
    getActiveState,
    getPetScale,
    getPreferredPetScale,
    getInteractionPauseReasons,
    getWalkTrackX,
    // 行走运行时状态访问器（读 getter / 写 setter，状态存储于 main.cjs）
    getWalkDirection,
    getWalkLoop,
    setWalkLoop,
    getWalkLoopTimer,
    setWalkLoopTimer,
    getWalkPausedAt,
    setWalkPausedAt,
    getNextWalkStartDirection,
    setNextWalkStartDirection,
    getWalkLeftEdgeStuckSteps,
    setWalkLeftEdgeStuckSteps,
    getWalkRightEdgeStuckSteps,
    setWalkRightEdgeStuckSteps,
    getWalkMirrorCooldownSteps,
    setWalkMirrorCooldownSteps,
    getStalledWalkSteps,
    setStalledWalkSteps,
    getLastWalkStepAt,
    setLastWalkStepAt,
    getLastWalkScaleApplyAt,
    setLastWalkScaleApplyAt,
    getLastWalkSurfaceSignature,
    setLastWalkSurfaceSignature,
    // 常量
    WALK_LOOP_DURATION_MS,
    STATE_WALK,
    WALK_EDGE_TOLERANCE,
    DEFAULT_STATE,
    WALK_STEP,
    WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR,
    WALK_SCALE_APPLY_THROTTLE_MS,
    WALK_MIRROR_HYSTERESIS_PX,
    WALK_MIRROR_COOLDOWN_STEPS
  } = context;

  function scheduleWalkLoopTimeout() {
    clearWalkLoopTimer();
    if (!getWalkLoop()?.endsAt) {
      return;
    }
    if (isInteractionPaused() || getWalkPausedAt()) {
      return;
    }
    const remainingMs = Math.max(0, getWalkLoop().endsAt - Date.now());
    setWalkLoopTimer(setTimeout(() => {
      setWalkLoopTimer(null);
      completeWalkLoop();
    }, remainingMs));
  }

  function startWalkLoop() {
    if (!getPetWindow() || getPetWindow().isDestroyed()) {
      setWalkLoop(null);
      clearWalkLoopTimer();
      return;
    }

    resetWalkRuntime();
    const now = Date.now();
    setWalkLoop({
      startedAt: now,
      endsAt: now + WALK_LOOP_DURATION_MS
    });
    setWalkPausedAt(0);
    const fallbackDirection = Number.isFinite(getNextWalkStartDirection())
      ? getNextWalkStartDirection()
      : getWalkDirection();
    alignWalkLoopToSurface(fallbackDirection);
    setNextWalkStartDirection(null);
    if (isInteractionPaused()) {
      pauseWalkLoopClock();
    } else {
      scheduleWalkLoopTimeout();
    }
    sendStats();
  }

  function refreshWalkLoopAfterSurfaceChange() {
    if (!isWalkingState()) {
      resetWalkRuntime();
      return;
    }
    if (!getWalkLoop()) {
      startWalkLoop();
      return;
    }
    resetWalkRuntime({ keepLoop: true });
    alignWalkLoopToSurface(getWalkDirection());
    if (isInteractionPaused()) {
      pauseWalkLoopClock();
    } else {
      scheduleWalkLoopTimeout();
    }
    sendStats();
  }

  function completeWalkLoop() {
    if (getActiveState() !== STATE_WALK) {
      resetWalkRuntime();
      return;
    }

    const surface = getCurrentSurface();
    const limits = getWalkVisibleLimits(surface);
    const bounds = getPetWindow()?.getBounds();
    if (bounds) {
      const leftFacingRect = getVisiblePetRectFromBounds(bounds, STATE_WALK, -1);
      const rightFacingRect = getVisiblePetRectFromBounds(bounds, STATE_WALK, 1);
      const nearLeftEdge = Math.min(leftFacingRect.x, rightFacingRect.x) <= limits.left + WALK_EDGE_TOLERANCE;
      const nearRightEdge = Math.max(
        leftFacingRect.x + leftFacingRect.width,
        rightFacingRect.x + rightFacingRect.width
      ) >= limits.right - WALK_EDGE_TOLERANCE;
      if (nearLeftEdge && !nearRightEdge) {
        setNextWalkStartDirection(1);
  } else if (nearRightEdge && !nearLeftEdge) {
        setNextWalkStartDirection(-1);
      }
    }

    const statMessagesToShow = applyCompletedWalkStats();
    setWalkDirection(getDefaultDirectionForState(DEFAULT_STATE));
    materializeTaskbarWalkRunwayForState(DEFAULT_STATE, getWalkDirection(), { notifyScale: false });
    sendWalkDirection();
    setState(DEFAULT_STATE, false);
    groundPetToSurface(getActiveState(), getWalkDirection(), surface);
    sendPetState();
    showStatMessages(statMessagesToShow);
  }

  function advanceTaskbarWalkStep({
    frameStep = 0,
    stepStartedAt,
    activeSurface,
    groundedY,
    bounds
  }) {
    if (getWalkTrackX() === null) {
      syncWalkTrackX(bounds.x);
    }

    const previousCenterX = getWalkTrackX() ?? getWalkVisibleCenterFromWindowX(bounds.x, groundedY, getActiveState(), getWalkDirection());
    let nextDirection = getWalkDirection() >= 0 ? 1 : -1;
    const visibleLimits = getWalkVisibleLimits(activeSurface);
    const centerLimits = getTaskbarWalkCenterLimits(activeSurface, getActiveState());
    let nextCenterX = previousCenterX + nextDirection * WALK_STEP;
    let mirroredThisStep = false;
    let edgeFlipReason = "";
    let edgeAnchor = null;

    if (nextDirection < 0 && nextCenterX <= centerLimits.left) {
      nextCenterX = centerLimits.left;
      nextDirection = 1;
      mirroredThisStep = true;
      edgeFlipReason = "left-center";
      edgeAnchor = { edge: "left", value: visibleLimits.left };
    } else if (nextDirection > 0 && nextCenterX >= centerLimits.right) {
      nextCenterX = centerLimits.right;
      nextDirection = -1;
      mirroredThisStep = true;
      edgeFlipReason = "right-center";
      edgeAnchor = { edge: "right", value: visibleLimits.right };
    }

    if (!mirroredThisStep) {
      const atLeftEdge = nextDirection < 0 && nextCenterX <= centerLimits.left;
      const atRightEdge = nextDirection > 0 && nextCenterX >= centerLimits.right;
      if (atLeftEdge) {
        setWalkLeftEdgeStuckSteps(getWalkLeftEdgeStuckSteps() + 1);
        if (getWalkLeftEdgeStuckSteps() >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
          nextCenterX = centerLimits.left;
          nextDirection = 1;
          mirroredThisStep = true;
          edgeFlipReason = "left-center-stuck";
          edgeAnchor = { edge: "left", value: visibleLimits.left };
        }
      } else {
        setWalkLeftEdgeStuckSteps(0);
      }
      if (atRightEdge) {
        setWalkRightEdgeStuckSteps(getWalkRightEdgeStuckSteps() + 1);
        if (getWalkRightEdgeStuckSteps() >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
          nextCenterX = centerLimits.right;
          nextDirection = -1;
          mirroredThisStep = true;
          edgeFlipReason = "right-center-stuck";
          edgeAnchor = { edge: "right", value: visibleLimits.right };
        }
      } else {
        setWalkRightEdgeStuckSteps(0);
      }
    } else {
      setWalkLeftEdgeStuckSteps(0);
      setWalkRightEdgeStuckSteps(0);
    }

    if (mirroredThisStep) {
      setWalkMirrorCooldownSteps(0);
    }

    nextCenterX = clamp(Math.round(nextCenterX), centerLimits.left, centerLimits.right);
    if (!mirroredThisStep && nextDirection < 0) {
      nextCenterX = Math.min(previousCenterX, nextCenterX);
    } else if (!mirroredThisStep && nextDirection > 0) {
      nextCenterX = Math.max(previousCenterX, nextCenterX);
    }
    setWalkDirection(nextDirection);
    const runway = edgeAnchor
      ? setTaskbarWalkRunwayForEdge(edgeAnchor.edge, edgeAnchor.value, groundedY, getWalkDirection(), activeSurface)
      : ensureTaskbarWalkRunwayForCenter(nextCenterX, groundedY, getWalkDirection(), activeSurface, {
        reason: "step"
      });
    const actualX = runway?.windowX ?? getPetWindow().getBounds().x;
    const actualCenterX = getWalkTrackX();
    setStalledWalkSteps(mirroredThisStep || actualCenterX !== previousCenterX
      ? 0
      : getStalledWalkSteps() + 1);

    if (mirroredThisStep) {
      setWalkLeftEdgeStuckSteps(0);
      setWalkRightEdgeStuckSteps(0);
    }

    const result = {
      state: getActiveState(),
      moving: true,
      direction: getWalkDirection(),
      x: getPetWindow().getBounds().x,
      y: Math.round(groundedY),
      frameStep: Number.isFinite(frameStep) ? Math.round(frameStep) : 0,
      moved: actualCenterX !== previousCenterX,
      scale: buildScaleSummary()
    };
    updatePetWindowMousePassthrough();
    logWalkStepDiagnostic(stepStartedAt, result, edgeFlipReason ? `edgeFlip=${edgeFlipReason} previousCenterX=${previousCenterX} centerX=${getWalkTrackX()} actualX=${actualX}` : `centerX=${getWalkTrackX()}`);
    return result;
  }

  function advanceWalkStep(frameStep = 0, elapsedMs = 0) {
    const stepStartedAt = Date.now();
    if (!getPetWindow() || getPetWindow().isDestroyed() || !isWalkingState()) {
      const result = buildWalkStepResult();
      logWalkStepDiagnostic(stepStartedAt, result, "reason=not-walking");
      return result;
    }

    if (!getWalkLoop()) {
      startWalkLoop();
    }

    const now = stepStartedAt;
    if (getWalkLoop()?.endsAt && now >= getWalkLoop().endsAt) {
      const result = {
        ...buildWalkStepResult(),
        frameStep: Number.isFinite(frameStep) ? Math.round(frameStep) : 0,
        completed: true
      };
      completeWalkLoop();
      logWalkStepDiagnostic(stepStartedAt, result, "reason=walk-loop-complete");
      return result;
    }

    if (isInteractionPaused()) {
      const result = {
        ...buildWalkStepResult(),
        paused: true
      };
      logWalkStepDiagnostic(stepStartedAt, result, `reason=paused pauseReasons=${Array.from(getInteractionPauseReasons()).join(",")}`);
      return result;
    }

    if (getLastWalkStepAt() && now - getLastWalkStepAt() > 1200) {
      syncWalkTrackX();
      setStalledWalkSteps(0);
    }
    setLastWalkStepAt(now);

    const bounds = getPetWindow().getBounds();
    const surface = getCurrentSurface();
    const nextSurfaceSignature = surface?.type === "window"
      ? `window:${surface.displayId}:${surface.left}:${surface.right}:${surface.groundY}`
      : `taskbar:${surface?.displayId}:${surface?.left}:${surface?.right}:${surface?.groundY}`;
    const nowForScale = Date.now();
    const scaleChanged = Math.abs(getPetScale() - getPreferredPetScale()) >= 0.001;
    const shouldForceSurfaceScale = getLastWalkSurfaceSignature() !== nextSurfaceSignature || scaleChanged;
    const shouldApplySurfaceScale = shouldForceSurfaceScale
      || !getLastWalkScaleApplyAt()
      || nowForScale - getLastWalkScaleApplyAt() >= WALK_SCALE_APPLY_THROTTLE_MS;
    let activeSurface = surface;
    if (shouldApplySurfaceScale && !applySurfaceScale(surface, getActiveState(), getWalkDirection())) {
      activeSurface = resetToTaskbarSurface(bounds);
      applySurfaceScale(activeSurface, getActiveState(), getWalkDirection());
    } else if (!shouldApplySurfaceScale) {
      activeSurface = getCurrentSurface();
    }
    if (shouldApplySurfaceScale) {
      setLastWalkScaleApplyAt(nowForScale);
    }
    setLastWalkSurfaceSignature(nextSurfaceSignature);
    const useRenderedFrameGeometry = activeSurface?.type === "window"
      && typeof getRenderedGroundedWindowYForSurface === "function"
      && typeof getRenderedWalkVisibleRectFromWindowX === "function"
      && typeof getRenderedSafeWindowXForDirection === "function";
    const groundedY = useRenderedFrameGeometry
      ? getRenderedGroundedWindowYForSurface(activeSurface, getActiveState(), getWalkDirection(), bounds.x)
      : getGroundedWindowYForSurface(activeSurface, getActiveState(), getWalkDirection());
    if (activeSurface?.type !== "window") {
      return advanceTaskbarWalkStep({
        frameStep,
        stepStartedAt,
        activeSurface,
        groundedY,
        bounds
      });
    }
    if (getWalkTrackX() === null) {
      syncWalkTrackX(bounds.x);
    }

    const previousX = getWalkTrackX() ?? bounds.x;
    let nextDirection = getWalkDirection() >= 0 ? 1 : -1;
    const stepDistance = WALK_STEP;
    let nextX = previousX + nextDirection * stepDistance;
    const limits = getWalkVisibleLimits(activeSurface);
    const nextVisibleRect = useRenderedFrameGeometry
      ? getRenderedWalkVisibleRectFromWindowX(nextX, groundedY, getActiveState(), nextDirection)
      : getWalkVisibleRectFromWindowX(nextX, groundedY, getActiveState(), nextDirection);
    const leftMirrorThreshold = limits.left + WALK_MIRROR_HYSTERESIS_PX;
    const rightMirrorThreshold = limits.right - WALK_MIRROR_HYSTERESIS_PX;
    const cooldownActive = getWalkMirrorCooldownSteps() > 0;
    let mirroredThisStep = false;
    const isTaskbarSurface = activeSurface?.type !== "window";
    let edgeFlipReason = "";
    let preserveRightEdgeX = false;

    if (!cooldownActive && nextDirection < 0 && nextVisibleRect.x <= leftMirrorThreshold) {
      nextDirection = 1;
      nextX = getWindowXForVisibleEdge("left", limits.left, getActiveState(), nextDirection);
      mirroredThisStep = true;
      edgeFlipReason = "left-threshold";
    } else if (!cooldownActive && nextDirection > 0 && nextVisibleRect.x + nextVisibleRect.width >= rightMirrorThreshold) {
      nextDirection = -1;
      nextX = isTaskbarSurface
        ? getWindowXForVisibleEdge("right", limits.right, getActiveState(), 1)
        : getWindowXForVisibleEdge("right", limits.right, getActiveState(), nextDirection);
      preserveRightEdgeX = isTaskbarSurface;
      mirroredThisStep = true;
      edgeFlipReason = "right-threshold";
    }

    if (!mirroredThisStep && isTaskbarSurface) {
      const touchedLeftEdge = nextVisibleRect.x <= leftMirrorThreshold;
      const touchedRightEdge = nextVisibleRect.x + nextVisibleRect.width >= rightMirrorThreshold;
      if (nextDirection < 0 && touchedLeftEdge) {
        setWalkLeftEdgeStuckSteps(getWalkLeftEdgeStuckSteps() + 1);
        if (getWalkLeftEdgeStuckSteps() >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
          nextDirection = 1;
          nextX = getWindowXForVisibleEdge("left", limits.left, getActiveState(), nextDirection);
          mirroredThisStep = true;
          edgeFlipReason = "left-stuck";
        }
      } else {
        setWalkLeftEdgeStuckSteps(0);
      }
      if (nextDirection > 0 && touchedRightEdge) {
        setWalkRightEdgeStuckSteps(getWalkRightEdgeStuckSteps() + 1);
        if (getWalkRightEdgeStuckSteps() >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
          nextDirection = -1;
          nextX = getWindowXForVisibleEdge("right", limits.right, getActiveState(), 1);
          preserveRightEdgeX = true;
          mirroredThisStep = true;
          edgeFlipReason = "right-stuck";
        }
      } else {
        setWalkRightEdgeStuckSteps(0);
      }
    } else {
      setWalkLeftEdgeStuckSteps(0);
      setWalkRightEdgeStuckSteps(0);
    }

    if (cooldownActive && !mirroredThisStep) {
      setWalkMirrorCooldownSteps(getWalkMirrorCooldownSteps() - 1);
    }

    nextX = preserveRightEdgeX
      ? Math.max(previousX, Math.round(nextX))
      : useRenderedFrameGeometry
        ? getRenderedSafeWindowXForDirection(nextX, activeSurface, getActiveState(), nextDirection, groundedY)
        : getSafeWindowXForDirection(nextX, activeSurface, getActiveState(), nextDirection);
    setWalkDirection(nextDirection);
    const actualX = preserveRightEdgeX || useRenderedFrameGeometry
      ? setWalkWindowPositionDirect(nextX, groundedY)
      : setWalkWindowPosition(nextX, groundedY, activeSurface, getWalkDirection());
    if (actualX === previousX) {
      setStalledWalkSteps(getStalledWalkSteps() + 1);
    } else {
      setStalledWalkSteps(0);
    }

    if (getStalledWalkSteps() >= 8) {
      syncWalkTrackX(actualX);
      setStalledWalkSteps(0);
    }

    if (mirroredThisStep) {
      setWalkMirrorCooldownSteps(WALK_MIRROR_COOLDOWN_STEPS);
      setWalkLeftEdgeStuckSteps(0);
      setWalkRightEdgeStuckSteps(0);
    }

    const result = {
      state: getActiveState(),
      moving: true,
      direction: getWalkDirection(),
      x: actualX,
      y: Math.round(groundedY),
      frameStep: Number.isFinite(frameStep) ? Math.round(frameStep) : 0,
      moved: actualX !== previousX
    };
    logWalkStepDiagnostic(stepStartedAt, result, edgeFlipReason ? `edgeFlip=${edgeFlipReason} previousX=${previousX} actualX=${actualX}` : "");
    return result;
  }

  return {
    scheduleWalkLoopTimeout,
    startWalkLoop,
    refreshWalkLoopAfterSurfaceChange,
    completeWalkLoop,
    advanceTaskbarWalkStep,
    advanceWalkStep
  };
}

module.exports = { createWalkController };
