const test = require("node:test");
const assert = require("node:assert/strict");

const { createWalkController } = require("../electron/behavior/walk-controller.cjs");

function createWindowWalkHarness({
  initialX = 90,
  initialDirection = 1,
  centerLimits = { left: 140, right: 220 }
} = {}) {
  let bounds = { x: initialX, y: 0, width: 180, height: 180 };
  let walkTrackX = null;
  let walkDirection = initialDirection >= 0 ? 1 : -1;
  let lastWalkStepAt = 0;
  let lastWalkScaleApplyAt = 0;
  let lastWalkSurfaceSignature = "";
  let stalledWalkSteps = 0;
  let walkMirrorCooldownSteps = 0;
  let walkLeftEdgeStuckSteps = 0;
  let walkRightEdgeStuckSteps = 0;
  const calls = [];
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
    getWalkVisibleLimits: () => ({ left: 100, right: 260 }),
    getVisiblePetRectFromBounds: (nextBounds) => ({
      x: nextBounds.x + 20,
      y: nextBounds.y + 40,
      width: 80,
      height: 90
    }),
    applyCompletedWalkStats: () => [],
    getDefaultDirectionForState: () => -1,
    materializeTaskbarWalkRunwayForState: () => {},
    sendWalkDirection: () => {},
    setState: () => {},
    groundPetToSurface: () => {},
    sendPetState: () => {},
    showStatMessages: () => {},
    syncWalkTrackX: (x) => {
      const sourceX = Number.isFinite(x) ? Math.round(x) : bounds.x;
      walkTrackX = Math.min(Math.max(sourceX + 60, centerLimits.left), centerLimits.right);
    },
    getWalkVisibleCenterFromWindowX: (x) => x + 60,
    getTaskbarWalkCenterLimits: () => ({ left: 100, right: 260 }),
    clamp: (value, min, max) => Math.min(Math.max(value, min), max),
    setWalkDirection: (direction) => {
      walkDirection = direction >= 0 ? 1 : -1;
    },
    setTaskbarWalkRunwayForEdge: () => null,
    ensureTaskbarWalkRunwayForCenter: () => null,
    buildScaleSummary: () => ({ value: 1 }),
    updatePetWindowMousePassthrough: () => {},
    logWalkStepDiagnostic: () => {},
    buildWalkStepResult: () => ({ state: "petWalk", moving: true, direction: walkDirection }),
    applySurfaceScale: () => true,
    resetToTaskbarSurface: () => surface,
    getGroundedWindowYForSurface: () => 90,
    getWindowXForVisibleCenter: (centerX) => Math.round(centerX - 60),
    getWindowWalkCenterLimits: () => centerLimits,
    getSafeWindowXForDirection: () => {
      calls.push({ type: "state-safe" });
      return 999;
    },
    setWalkWindowPosition: (x, y, _surface, _direction, options = {}) => {
      const rawX = Math.round(x);
      const requestedCenterX = Number.isFinite(options.trackCenterX)
        ? Math.round(options.trackCenterX)
        : rawX + 60;
      const safeCenterX = Math.min(Math.max(requestedCenterX, centerLimits.left), centerLimits.right);
      const nextX = Number.isFinite(options.trackCenterX)
        ? Math.round(rawX + safeCenterX - requestedCenterX)
        : safeCenterX === requestedCenterX
        ? rawX
        : Math.round(safeCenterX - 60);
      calls.push({ type: "state-position", x: nextX, y: Math.round(y), centerX: safeCenterX });
      walkTrackX = safeCenterX;
      bounds = { ...bounds, x: nextX, y: Math.round(y) };
      return bounds.x;
    },
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
    WALK_STEP: 10,
    WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR: 3,
    WALK_SCALE_APPLY_THROTTLE_MS: 250,
    WALK_MIRROR_HYSTERESIS_PX: 8,
    WALK_MIRROR_COOLDOWN_STEPS: 2
  });

  return { controller, calls };
}

test("window-surface walk uses state-stable geometry for Y grounding and X clamping", () => {
  const harness = createWindowWalkHarness();

  const result = harness.controller.advanceWalkStep(3, 80);

  assert.equal(result.y, 90);
  assert.equal(result.x, 100);
  assert.equal(result.moved, true);
  assert.equal(harness.calls[0].centerX, 160);
  assert.deepEqual(
    harness.calls.map((call) => call.type),
    ["state-position"]
  );
  assert.equal(harness.calls.some((call) => call.type === "rendered-ground"), false);
  assert.equal(harness.calls.some((call) => call.type === "rendered-rect"), false);
  assert.equal(harness.calls.some((call) => call.type === "rendered-safe"), false);
  assert.equal(harness.calls.some((call) => call.type === "direct-position"), false);
});

test("window-surface walk mirrors direction when reaching right edge threshold", () => {
  const harness = createWindowWalkHarness({ initialX: 150 });

  const result = harness.controller.advanceWalkStep(3, 80);

  assert.equal(result.direction, -1);
  assert.equal(result.y, 90);
  assert.equal(result.x, 160);
  assert.equal(harness.calls[0].centerX, 220);
  assert.deepEqual(
    harness.calls.map((call) => call.type),
    ["state-position"]
  );
});

test("window-surface walk advances from the previous visible-center track", () => {
  const harness = createWindowWalkHarness();

  const first = harness.controller.advanceWalkStep(3, 80);
  const second = harness.controller.advanceWalkStep(4, 80);

  assert.equal(first.x, 100);
  assert.equal(second.x, 110);
  assert.equal(second.direction, 1);
  assert.deepEqual(
    harness.calls.map((call) => call.centerX),
    [160, 170]
  );
});

test("window-surface walk keeps real window speed independent from frameStep", () => {
  const harness = createWindowWalkHarness();

  const results = [3, 12, 4, 27].map((frameStep) => harness.controller.advanceWalkStep(frameStep, 80));

  assert.deepEqual(
    results.map((result) => result.x),
    [100, 110, 120, 130]
  );
  assert.deepEqual(
    harness.calls.map((call) => call.centerX),
    [160, 170, 180, 190]
  );
  assert.equal(results.every((result) => result.moved), true);
});

test("window-surface walk keeps left-facing speed independent from frameStep", () => {
  const harness = createWindowWalkHarness({ initialX: 160, initialDirection: -1 });

  const results = [7, 18, 2].map((frameStep) => harness.controller.advanceWalkStep(frameStep, 80));

  assert.deepEqual(
    results.map((result) => result.direction),
    [-1, -1, -1]
  );
  assert.deepEqual(
    results.map((result) => result.x),
    [150, 140, 130]
  );
  assert.deepEqual(
    harness.calls.map((call) => call.centerX),
    [210, 200, 190]
  );
});

test("window-surface walk moves left from the right edge with the default left-facing direction", () => {
  const harness = createWindowWalkHarness({ initialX: 160, initialDirection: -1 });

  const result = harness.controller.advanceWalkStep(3, 80);

  assert.equal(result.direction, -1);
  assert.equal(result.x, 150);
  assert.equal(result.moved, true);
  assert.equal(harness.calls[0].centerX, 210);
});

test("window-surface walk keeps moving when the visible sprite is wider than the surface", () => {
  const harness = createWindowWalkHarness({
    initialX: 70,
    centerLimits: { left: 100, right: 160 }
  });

  const first = harness.controller.advanceWalkStep(3, 80);
  const second = harness.controller.advanceWalkStep(4, 80);

  assert.equal(first.x, 80);
  assert.equal(second.x, 90);
  assert.equal(first.moved, true);
  assert.equal(second.moved, true);
  assert.deepEqual(
    harness.calls.map((call) => call.centerX),
    [140, 150]
  );
});

test("window-surface walk mirrors at the left edge and continues moving right", () => {
  const harness = createWindowWalkHarness({ initialX: 80, initialDirection: -1 });

  const first = harness.controller.advanceWalkStep(3, 80);
  const second = harness.controller.advanceWalkStep(4, 80);

  assert.equal(first.direction, 1);
  assert.equal(first.x, 80);
  assert.equal(second.direction, 1);
  assert.equal(second.x, 90);
  assert.deepEqual(
    harness.calls.map((call) => call.centerX),
    [140, 150]
  );
});
