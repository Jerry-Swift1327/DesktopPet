const test = require("node:test");
const assert = require("node:assert/strict");

const { createWalkController } = require("../electron/behavior/walk-controller.cjs");

function createWindowWalkHarness({
  initialCenterX = 180,
  initialDirection = 1,
  centerLimits = { left: 140, right: 220 },
  walkStep = 10
} = {}) {
  const bounds = { x: 60, y: 90, width: 360, height: 180 };
  let walkTrackX = initialCenterX;
  let walkDirection = initialDirection >= 0 ? 1 : -1;
  let lastWalkStepAt = 0;
  let lastWalkScaleApplyAt = 0;
  let lastWalkSurfaceSignature = "";
  let stalledWalkSteps = 0;
  let walkMirrorCooldownSteps = 0;
  let walkLeftEdgeStuckSteps = 0;
  let walkRightEdgeStuckSteps = 0;
  const runwayCalls = [];
  const surface = {
    type: "window",
    displayId: 1,
    left: 100,
    right: 260,
    groundY: 200
  };

  const controller = createWalkController({
    clearWalkLoopTimer: () => {},
    isInteractionPaused: () => false,
    resetWalkRuntime: () => {},
    alignWalkLoopToSurface: () => {},
    pauseWalkLoopClock: () => {},
    sendStats: () => {},
    isWalkingState: () => true,
    getCurrentSurface: () => surface,
    getWalkVisibleLimits: () => ({ left: surface.left, right: surface.right }),
    getVisiblePetRectFromBounds: () => ({ x: walkTrackX - 40, y: 100, width: 80, height: 100 }),
    applyCompletedWalkStats: () => [],
    getDefaultDirectionForState: () => -1,
    materializeTaskbarWalkRunwayForState: () => {},
    sendWalkDirection: () => {},
    setState: () => {},
    groundPetToSurface: () => {},
    sendPetState: () => {},
    showStatMessages: () => {},
    syncWalkTrackX: (windowX) => {
      walkTrackX = Math.round(windowX + 60);
    },
    getWalkVisibleCenterFromWindowX: (windowX) => Math.round(windowX + 60),
    getWalkRunwayCenterLimits: () => centerLimits,
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    setWalkDirection: (direction) => {
      walkDirection = direction >= 0 ? 1 : -1;
    },
    setTaskbarWalkRunwayForEdge: (edge, value, y, direction) => {
      walkTrackX = edge === "left" ? centerLimits.left : centerLimits.right;
      const call = { type: "runway-edge", edge, value, y, direction, centerX: walkTrackX };
      runwayCalls.push(call);
      return { windowX: bounds.x, centerX: walkTrackX };
    },
    ensureTaskbarWalkRunwayForCenter: (centerX, y, direction) => {
      walkTrackX = centerX;
      const call = { type: "runway-step", centerX, y, direction };
      runwayCalls.push(call);
      return { windowX: bounds.x, centerX };
    },
    buildScaleSummary: () => ({ value: 1, windowWidth: bounds.width, taskbarRunway: true }),
    updatePetWindowMousePassthrough: () => {},
    logWalkStepDiagnostic: () => {},
    buildWalkStepResult: () => ({ state: "petWalk", moving: true, direction: walkDirection }),
    applySurfaceScale: () => true,
    resetToTaskbarSurface: () => surface,
    getGroundedWindowYForSurface: () => bounds.y,
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ ...bounds })
    }),
    getActiveState: () => "petWalk",
    getPetScale: () => 1,
    getPreferredPetScale: () => 1,
    getInteractionPauseReasons: () => new Set(),
    getWalkTrackX: () => walkTrackX,
    getWalkDirection: () => walkDirection,
    getWalkLoop: () => ({ endsAt: Date.now() + 10000 }),
    setWalkLoop: () => {},
    getWalkLoopTimer: () => null,
    setWalkLoopTimer: () => {},
    getWalkPausedAt: () => 0,
    setWalkPausedAt: () => {},
    getNextWalkStartDirection: () => null,
    setNextWalkStartDirection: () => {},
    getWalkLeftEdgeStuckSteps: () => walkLeftEdgeStuckSteps,
    setWalkLeftEdgeStuckSteps: (value) => { walkLeftEdgeStuckSteps = value; },
    getWalkRightEdgeStuckSteps: () => walkRightEdgeStuckSteps,
    setWalkRightEdgeStuckSteps: (value) => { walkRightEdgeStuckSteps = value; },
    getWalkMirrorCooldownSteps: () => walkMirrorCooldownSteps,
    setWalkMirrorCooldownSteps: (value) => { walkMirrorCooldownSteps = value; },
    getStalledWalkSteps: () => stalledWalkSteps,
    setStalledWalkSteps: (value) => { stalledWalkSteps = value; },
    getLastWalkStepAt: () => lastWalkStepAt,
    setLastWalkStepAt: (value) => { lastWalkStepAt = value; },
    getLastWalkScaleApplyAt: () => lastWalkScaleApplyAt,
    setLastWalkScaleApplyAt: (value) => { lastWalkScaleApplyAt = value; },
    getLastWalkSurfaceSignature: () => lastWalkSurfaceSignature,
    setLastWalkSurfaceSignature: (value) => { lastWalkSurfaceSignature = value; },
    WALK_LOOP_DURATION_MS: 60000,
    STATE_WALK: "petWalk",
    WALK_EDGE_TOLERANCE: 4,
    DEFAULT_STATE: "petSquat",
    WALK_STEP: walkStep,
    WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR: 3,
    WALK_SCALE_APPLY_THROTTLE_MS: 250
  });

  return {
    controller,
    bounds,
    runwayCalls,
    getTrackX: () => walkTrackX
  };
}

test("window-surface walk advances only the internal runway sprite", () => {
  const harness = createWindowWalkHarness();
  const beforeBounds = { ...harness.bounds };

  const results = [3, 12, 4, 27].map((frameStep) => harness.controller.advanceWalkStep(frameStep, 80));

  assert.deepEqual(results.map((result) => result.x), [60, 60, 60, 60]);
  assert.deepEqual(harness.runwayCalls.map((call) => call.centerX), [190, 200, 210, 220]);
  assert.deepEqual(harness.bounds, beforeBounds);
  assert.equal(results.every((result) => result.moved), true);
  assert.equal(results.every((result) => result.y === 90), true);
});

test("walk initializes a missing track from the visible center before its first step", () => {
  const harness = createWindowWalkHarness({
    initialCenterX: null,
    initialDirection: 1,
    centerLimits: { left: 0, right: 300 }
  });

  harness.controller.advanceWalkStep(0, 80);

  assert.equal(harness.runwayCalls[0].centerX, 130);
  assert.equal(harness.getTrackX(), 130);
});

test("window-surface walk mirrors inside the runway without moving the BrowserWindow", () => {
  const harness = createWindowWalkHarness({
    initialCenterX: 215,
    initialDirection: 1
  });
  const beforeBounds = { ...harness.bounds };

  const first = harness.controller.advanceWalkStep(3, 80);
  const second = harness.controller.advanceWalkStep(4, 80);

  assert.deepEqual([first.direction, second.direction], [-1, -1]);
  assert.deepEqual(harness.runwayCalls.map((call) => call.centerX), [220, 210]);
  assert.deepEqual(harness.runwayCalls.map((call) => call.type), ["runway-edge", "runway-step"]);
  assert.deepEqual(harness.bounds, beforeBounds);
});

test("window-surface left walk speed stays independent from sprite frame index", () => {
  const harness = createWindowWalkHarness({
    initialCenterX: 190,
    initialDirection: -1
  });

  const results = [7, 18, 2].map((frameStep) => harness.controller.advanceWalkStep(frameStep, 80));

  assert.deepEqual(results.map((result) => result.direction), [-1, -1, -1]);
  assert.deepEqual(harness.runwayCalls.map((call) => call.centerX), [180, 170, 160]);
  assert.equal(harness.getTrackX(), 160);
});
