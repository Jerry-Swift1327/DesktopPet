const test = require("node:test");
const assert = require("node:assert/strict");

const { createWalkController } = require("../electron/behavior/walk-controller.cjs");

function createWindowWalkHarness({ initialX = 90 } = {}) {
  let bounds = { x: initialX, y: 0, width: 180, height: 180 };
  let walkTrackX = null;
  let walkDirection = 1;
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
      walkTrackX = Number.isFinite(x) ? Math.round(x) : bounds.x;
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
    getWalkVisibleRectFromWindowX: (x, y) => ({
      x: Math.round(x + 20),
      y: Math.round(y + 40),
      width: 80,
      height: 90
    }),
    getWindowXForVisibleEdge: () => 0,
    getSafeWindowXForDirection: () => {
      calls.push({ type: "state-safe" });
      return 999;
    },
    setWalkWindowPosition: (x, y) => {
      calls.push({ type: "state-position", x: Math.round(x), y: Math.round(y) });
      walkTrackX = Math.round(x);
      bounds = { ...bounds, x: Math.round(x), y: Math.round(y) };
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
  assert.equal(result.x, 0);
  assert.deepEqual(
    harness.calls.map((call) => call.type),
    ["state-position"]
  );
});
