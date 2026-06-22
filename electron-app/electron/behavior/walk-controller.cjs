// 行走控制器，管理宠物行走循环的调度、表面变更刷新、循环完成处理，
// 以及任务栏与窗口表面的逐步推进逻辑（advanceTaskbarWalkStep / advanceWalkStep）。
// 从 main.cjs 提取，依赖通过 createWalkController(context) 注入；
// 函数实现与 main.cjs 保持一致，不修改控制流与逻辑。

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
    getWindowXForVisibleEdge,
    getSafeWindowXForDirection,
    setWalkWindowPositionDirect,
    setWalkWindowPosition,
    // 外部状态（只读）
    petWindow,
    activeState,
    petScale,
    preferredPetScale,
    interactionPauseReasons,
    walkTrackX,
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

  // 行走相关状态（原 main.cjs 中的全局变量，迁移函数内被重新赋值，故用 let 声明为模块内部状态）
  let walkLoop = null;
  let walkLoopTimer = null;
  let walkPausedAt = 0;
  let nextWalkStartDirection = null;
  let walkDirection = -1;
  let walkLeftEdgeStuckSteps = 0;
  let walkRightEdgeStuckSteps = 0;
  let walkMirrorCooldownSteps = 0;
  let stalledWalkSteps = 0;
  let lastWalkStepAt = 0;
  let lastWalkScaleApplyAt = 0;
  let lastWalkSurfaceSignature = "";

  function scheduleWalkLoopTimeout() {
    clearWalkLoopTimer();
    if (!walkLoop?.endsAt) {
      return;
    }
    if (isInteractionPaused() || walkPausedAt) {
      return;
    }
    const remainingMs = Math.max(0, walkLoop.endsAt - Date.now());
    walkLoopTimer = setTimeout(() => {
      walkLoopTimer = null;
      completeWalkLoop();
    }, remainingMs);
  }

  function startWalkLoop() {
    if (!petWindow || petWindow.isDestroyed()) {
      walkLoop = null;
      clearWalkLoopTimer();
      return;
    }

    resetWalkRuntime();
    const now = Date.now();
    walkLoop = {
      startedAt: now,
      endsAt: now + WALK_LOOP_DURATION_MS
    };
    walkPausedAt = 0;
    const fallbackDirection = Number.isFinite(nextWalkStartDirection)
      ? nextWalkStartDirection
      : walkDirection;
    alignWalkLoopToSurface(fallbackDirection);
    nextWalkStartDirection = null;
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
    if (!walkLoop) {
      startWalkLoop();
      return;
    }
    resetWalkRuntime({ keepLoop: true });
    alignWalkLoopToSurface(walkDirection);
    if (isInteractionPaused()) {
      pauseWalkLoopClock();
    } else {
      scheduleWalkLoopTimeout();
    }
    sendStats();
  }

  function completeWalkLoop() {
    if (activeState !== STATE_WALK) {
      resetWalkRuntime();
      return;
    }

    const surface = getCurrentSurface();
    const limits = getWalkVisibleLimits(surface);
    const bounds = petWindow?.getBounds();
    if (bounds) {
      const leftFacingRect = getVisiblePetRectFromBounds(bounds, STATE_WALK, -1);
      const rightFacingRect = getVisiblePetRectFromBounds(bounds, STATE_WALK, 1);
      const nearLeftEdge = Math.min(leftFacingRect.x, rightFacingRect.x) <= limits.left + WALK_EDGE_TOLERANCE;
      const nearRightEdge = Math.max(
        leftFacingRect.x + leftFacingRect.width,
        rightFacingRect.x + rightFacingRect.width
      ) >= limits.right - WALK_EDGE_TOLERANCE;
      if (nearLeftEdge && !nearRightEdge) {
        nextWalkStartDirection = 1;
  } else if (nearRightEdge && !nearLeftEdge) {
        nextWalkStartDirection = -1;
      }
    }

    const statMessagesToShow = applyCompletedWalkStats();
    walkDirection = getDefaultDirectionForState(DEFAULT_STATE);
    materializeTaskbarWalkRunwayForState(DEFAULT_STATE, walkDirection, { notifyScale: false });
    sendWalkDirection();
    setState(DEFAULT_STATE, false);
    groundPetToSurface(activeState, walkDirection, surface);
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
    if (walkTrackX === null) {
      syncWalkTrackX(bounds.x);
    }

    const previousCenterX = walkTrackX ?? getWalkVisibleCenterFromWindowX(bounds.x, groundedY, activeState, walkDirection);
    let nextDirection = walkDirection >= 0 ? 1 : -1;
    const visibleLimits = getWalkVisibleLimits(activeSurface);
    const centerLimits = getTaskbarWalkCenterLimits(activeSurface, activeState);
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
        walkLeftEdgeStuckSteps += 1;
        if (walkLeftEdgeStuckSteps >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
          nextCenterX = centerLimits.left;
          nextDirection = 1;
          mirroredThisStep = true;
          edgeFlipReason = "left-center-stuck";
          edgeAnchor = { edge: "left", value: visibleLimits.left };
        }
      } else {
        walkLeftEdgeStuckSteps = 0;
      }
      if (atRightEdge) {
        walkRightEdgeStuckSteps += 1;
        if (walkRightEdgeStuckSteps >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
          nextCenterX = centerLimits.right;
          nextDirection = -1;
          mirroredThisStep = true;
          edgeFlipReason = "right-center-stuck";
          edgeAnchor = { edge: "right", value: visibleLimits.right };
        }
      } else {
        walkRightEdgeStuckSteps = 0;
      }
    } else {
      walkLeftEdgeStuckSteps = 0;
      walkRightEdgeStuckSteps = 0;
    }

    if (mirroredThisStep) {
      walkMirrorCooldownSteps = 0;
    }

    nextCenterX = clamp(Math.round(nextCenterX), centerLimits.left, centerLimits.right);
    if (!mirroredThisStep && nextDirection < 0) {
      nextCenterX = Math.min(previousCenterX, nextCenterX);
    } else if (!mirroredThisStep && nextDirection > 0) {
      nextCenterX = Math.max(previousCenterX, nextCenterX);
    }
    setWalkDirection(nextDirection);
    const runway = edgeAnchor
      ? setTaskbarWalkRunwayForEdge(edgeAnchor.edge, edgeAnchor.value, groundedY, walkDirection, activeSurface)
      : ensureTaskbarWalkRunwayForCenter(nextCenterX, groundedY, walkDirection, activeSurface, {
        reason: "step"
      });
    const actualX = runway?.windowX ?? petWindow.getBounds().x;
    const actualCenterX = walkTrackX;
    stalledWalkSteps = mirroredThisStep || actualCenterX !== previousCenterX
      ? 0
      : stalledWalkSteps + 1;

    if (mirroredThisStep) {
      walkLeftEdgeStuckSteps = 0;
      walkRightEdgeStuckSteps = 0;
    }

    const result = {
      state: activeState,
      moving: true,
      direction: walkDirection,
      x: petWindow.getBounds().x,
      y: Math.round(groundedY),
      frameStep: Number.isFinite(frameStep) ? Math.round(frameStep) : 0,
      moved: actualCenterX !== previousCenterX,
      scale: buildScaleSummary()
    };
    updatePetWindowMousePassthrough();
    logWalkStepDiagnostic(stepStartedAt, result, edgeFlipReason ? `edgeFlip=${edgeFlipReason} previousCenterX=${previousCenterX} centerX=${walkTrackX} actualX=${actualX}` : `centerX=${walkTrackX}`);
    return result;
  }

  function advanceWalkStep(frameStep = 0, elapsedMs = 0) {
    const stepStartedAt = Date.now();
    if (!petWindow || petWindow.isDestroyed() || !isWalkingState()) {
      const result = buildWalkStepResult();
      logWalkStepDiagnostic(stepStartedAt, result, "reason=not-walking");
      return result;
    }

    if (!walkLoop) {
      startWalkLoop();
    }

    const now = stepStartedAt;
    if (walkLoop?.endsAt && now >= walkLoop.endsAt) {
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
      logWalkStepDiagnostic(stepStartedAt, result, `reason=paused pauseReasons=${Array.from(interactionPauseReasons).join(",")}`);
      return result;
    }

    if (lastWalkStepAt && now - lastWalkStepAt > 1200) {
      syncWalkTrackX();
      stalledWalkSteps = 0;
    }
    lastWalkStepAt = now;

    const bounds = petWindow.getBounds();
    const surface = getCurrentSurface();
    const nextSurfaceSignature = surface?.type === "window"
      ? `window:${surface.displayId}:${surface.left}:${surface.right}:${surface.groundY}`
      : `taskbar:${surface?.displayId}:${surface?.left}:${surface?.right}:${surface?.groundY}`;
    const nowForScale = Date.now();
    const scaleChanged = Math.abs(petScale - preferredPetScale) >= 0.001;
    const shouldForceSurfaceScale = lastWalkSurfaceSignature !== nextSurfaceSignature || scaleChanged;
    const shouldApplySurfaceScale = shouldForceSurfaceScale
      || !lastWalkScaleApplyAt
      || nowForScale - lastWalkScaleApplyAt >= WALK_SCALE_APPLY_THROTTLE_MS;
    let activeSurface = surface;
    if (shouldApplySurfaceScale && !applySurfaceScale(surface, activeState, walkDirection)) {
      activeSurface = resetToTaskbarSurface(bounds);
      applySurfaceScale(activeSurface, activeState, walkDirection);
    } else if (!shouldApplySurfaceScale) {
      activeSurface = getCurrentSurface();
    }
    if (shouldApplySurfaceScale) {
      lastWalkScaleApplyAt = nowForScale;
    }
    lastWalkSurfaceSignature = nextSurfaceSignature;
    const groundedY = getGroundedWindowYForSurface(activeSurface, activeState, walkDirection);
    if (activeSurface?.type !== "window") {
      return advanceTaskbarWalkStep({
        frameStep,
        stepStartedAt,
        activeSurface,
        groundedY,
        bounds
      });
    }
    if (walkTrackX === null) {
      syncWalkTrackX(bounds.x);
    }

    const previousX = walkTrackX ?? bounds.x;
    let nextDirection = walkDirection >= 0 ? 1 : -1;
    const stepDistance = WALK_STEP;
    let nextX = previousX + nextDirection * stepDistance;
    const limits = getWalkVisibleLimits(activeSurface);
    const nextVisibleRect = getWalkVisibleRectFromWindowX(nextX, groundedY, activeState, nextDirection);
    const leftMirrorThreshold = limits.left + WALK_MIRROR_HYSTERESIS_PX;
    const rightMirrorThreshold = limits.right - WALK_MIRROR_HYSTERESIS_PX;
    const cooldownActive = walkMirrorCooldownSteps > 0;
    let mirroredThisStep = false;
    const isTaskbarSurface = activeSurface?.type !== "window";
    let edgeFlipReason = "";
    let preserveRightEdgeX = false;

    if (!cooldownActive && nextDirection < 0 && nextVisibleRect.x <= leftMirrorThreshold) {
      nextDirection = 1;
      nextX = getWindowXForVisibleEdge("left", limits.left, activeState, nextDirection);
      mirroredThisStep = true;
      edgeFlipReason = "left-threshold";
    } else if (!cooldownActive && nextDirection > 0 && nextVisibleRect.x + nextVisibleRect.width >= rightMirrorThreshold) {
      nextDirection = -1;
      nextX = isTaskbarSurface
        ? getWindowXForVisibleEdge("right", limits.right, activeState, 1)
        : getWindowXForVisibleEdge("right", limits.right, activeState, nextDirection);
      preserveRightEdgeX = isTaskbarSurface;
      mirroredThisStep = true;
      edgeFlipReason = "right-threshold";
    }

    if (!mirroredThisStep && isTaskbarSurface) {
      const touchedLeftEdge = nextVisibleRect.x <= leftMirrorThreshold;
      const touchedRightEdge = nextVisibleRect.x + nextVisibleRect.width >= rightMirrorThreshold;
      if (nextDirection < 0 && touchedLeftEdge) {
        walkLeftEdgeStuckSteps += 1;
        if (walkLeftEdgeStuckSteps >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
          nextDirection = 1;
          nextX = getWindowXForVisibleEdge("left", limits.left, activeState, nextDirection);
          mirroredThisStep = true;
          edgeFlipReason = "left-stuck";
        }
      } else {
        walkLeftEdgeStuckSteps = 0;
      }
      if (nextDirection > 0 && touchedRightEdge) {
        walkRightEdgeStuckSteps += 1;
        if (walkRightEdgeStuckSteps >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
          nextDirection = -1;
          nextX = getWindowXForVisibleEdge("right", limits.right, activeState, 1);
          preserveRightEdgeX = true;
          mirroredThisStep = true;
          edgeFlipReason = "right-stuck";
        }
      } else {
        walkRightEdgeStuckSteps = 0;
      }
    } else {
      walkLeftEdgeStuckSteps = 0;
      walkRightEdgeStuckSteps = 0;
    }

    if (cooldownActive && !mirroredThisStep) {
      walkMirrorCooldownSteps -= 1;
    }

    nextX = preserveRightEdgeX
      ? Math.max(previousX, Math.round(nextX))
      : getSafeWindowXForDirection(nextX, activeSurface, activeState, nextDirection);
    setWalkDirection(nextDirection);
    const actualX = preserveRightEdgeX
      ? setWalkWindowPositionDirect(nextX, groundedY)
      : setWalkWindowPosition(nextX, groundedY, activeSurface, walkDirection);
    if (actualX === previousX) {
      stalledWalkSteps += 1;
    } else {
      stalledWalkSteps = 0;
    }

    if (stalledWalkSteps >= 8) {
      syncWalkTrackX(actualX);
      stalledWalkSteps = 0;
    }

    if (mirroredThisStep) {
      walkMirrorCooldownSteps = WALK_MIRROR_COOLDOWN_STEPS;
      walkLeftEdgeStuckSteps = 0;
      walkRightEdgeStuckSteps = 0;
    }

    const result = {
      state: activeState,
      moving: true,
      direction: walkDirection,
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
