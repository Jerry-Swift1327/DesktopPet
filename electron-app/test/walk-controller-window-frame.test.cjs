const test = require("node:test");
const assert = require("node:assert/strict");

const { createWalkController } = require("../electron/behavior/walk-controller.cjs");

function createWindowWalkHarness({
  initialX = 90,
  initialDirection = 1,
  visibleLimits = { left: 100, right: 260 },
  visibleOffsetForDirection = () => 20,
  visibleWidthForDirection = () => 80
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
    left: visibleLimits.left,
    right: visibleLimits.right,
    groundY: 200
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function visibleRectForX(x, y, direction = walkDirection) {
    const offset = visibleOffsetForDirection(direction);
    const width = visibleWidthForDirection(direction);
    return {
      x: Math.round(x + offset),
      y: Math.round(y + 40),
      width,
      height: 90
    };
  }

  function windowXForVisibleEdge(edge, value, direction = walkDirection) {
    const offset = visibleOffsetForDirection(direction);
    const width = visibleWidthForDirection(direction);
    return edge === "right"
      ? Math.round(value - width - offset)
      : Math.round(value - offset);
  }

  function safeWindowX(x, direction = walkDirection) {
    const rawX = Math.round(x);
    const visible = visibleRectForX(rawX, 0, direction);
    let nextX = rawX;
    if (visible.x < visibleLimits.left) {
      nextX += visibleLimits.left - visible.x;
    }
    if (visible.x + visible.width > visibleLimits.right) {
      nextX -= visible.x + visible.width - visibleLimits.right;
    }
    return Math.round(nextX);
  }

  const controller = createWalkController({
    clearWalkLoopTimer: () => {},
    isInteractionPaused: () => false,
    resetWalkRuntime: () => {},
    alignWalkLoopToSurface: () => {},
    pauseWalkLoopClock: () => {},
    sendStats: () => {},
    isWalkingState: () => true,
    getCurrentSurface: () => surface,
    getWalkVisibleLimits: () => visibleLimits,
    getVisiblePetRectFromBounds: (nextBounds) => visibleRectForX(nextBounds.x, nextBounds.y, walkDirection),
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
      walkTrackX = safeWindowX(sourceX, walkDirection);
    },
    getWalkVisibleCenterFromWindowX: (x, y, _state, direction = walkDirection) => {
      const visible = visibleRectForX(x, y, direction);
      return Math.round(visible.x + visible.width / 2);
    },
    getTaskbarWalkCenterLimits: () => visibleLimits,
    clamp,
    setWalkDirection: (direction) => {
      walkDirection = direction >= 0 ? 1 : -1;
    },
    setTaskbarWalkRunwayForEdge: () => {
      calls.push({ type: "taskbar-edge" });
      return null;
    },
    ensureTaskbarWalkRunwayForCenter: () => {
      calls.push({ type: "taskbar-runway" });
      return null;
    },
    buildScaleSummary: () => ({ value: 1 }),
    updatePetWindowMousePassthrough: () => {},
    logWalkStepDiagnostic: () => {},
    buildWalkStepResult: () => ({ state: "petWalk", moving: true, direction: walkDirection }),
    applySurfaceScale: () => true,
    resetToTaskbarSurface: () => surface,
    getGroundedWindowYForSurface: () => 90,
    getWalkVisibleRectFromWindowX: (x, y, _state, direction = walkDirection) => visibleRectForX(x, y, direction),
    getWindowXForVisibleEdge: (edge, value, _state, direction = walkDirection) => windowXForVisibleEdge(edge, value, direction),
    getSafeWindowXForDirection: (x, _surface, _state, direction = walkDirection) => safeWindowX(x, direction),
    setWalkWindowPosition: (x, y, _surface, direction = walkDirection, options = {}) => {
      const nextX = options.clampToSurface === false
        ? Math.round(x)
        : safeWindowX(x, direction);
      const nextY = Math.round(y);
      calls.push({
        type: "state-position",
        requestedX: Math.round(x),
        x: nextX,
        y: nextY,
        direction,
        visible: visibleRectForX(nextX, nextY, direction)
      });
      walkTrackX = nextX;
      bounds = { ...bounds, x: nextX, y: nextY };
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

  return { controller, calls, getTrackX: () => walkTrackX };
}

test("window-surface walk uses state-stable Y and stores real window X as the track", () => {
  const harness = createWindowWalkHarness();

  const result = harness.controller.advanceWalkStep(3, 80);

  assert.equal(result.y, 90);
  assert.equal(result.x, 100);
  assert.equal(result.moved, true);
  assert.deepEqual(result.scale, { value: 1 });
  assert.equal(harness.getTrackX(), 100);
  assert.deepEqual(
    harness.calls.map((call) => call.type),
    ["state-position"]
  );
  assert.equal(harness.calls[0].visible.x, 120);
});

test("window-surface walk keeps real window speed stable when visible insets differ by direction", () => {
  const visibleOffsetForDirection = (direction) => direction < 0 ? 72 : 48;
  const leftHarness = createWindowWalkHarness({
    initialX: 150,
    initialDirection: -1,
    visibleOffsetForDirection
  });
  const rightHarness = createWindowWalkHarness({
    initialX: 100,
    initialDirection: 1,
    visibleOffsetForDirection
  });

  const leftResults = [
    leftHarness.controller.advanceWalkStep(3, 80),
    leftHarness.controller.advanceWalkStep(19, 80)
  ];
  const rightResults = [
    rightHarness.controller.advanceWalkStep(7, 80),
    rightHarness.controller.advanceWalkStep(22, 80)
  ];

  assert.deepEqual(leftResults.map((result) => result.x), [98, 88]);
  assert.deepEqual(rightResults.map((result) => result.x), [110, 120]);
  assert.deepEqual(leftHarness.calls.map((call) => call.x), [98, 88]);
  assert.deepEqual(rightHarness.calls.map((call) => call.x), [110, 120]);
});

test("window-surface walk mirrors at the left edge and continues with a stable X track", () => {
  const harness = createWindowWalkHarness({
    initialX: 70,
    initialDirection: -1
  });

  const first = harness.controller.advanceWalkStep(3, 80);
  const second = harness.controller.advanceWalkStep(4, 80);

  assert.equal(first.direction, 1);
  assert.equal(second.direction, 1);
  assert.equal(first.x, 80);
  assert.equal(second.x, 90);
  assert.deepEqual(harness.calls.map((call) => call.x), [80, 90]);
});

test("window-surface walk caps mirrored edge correction to one real X step", () => {
  const harness = createWindowWalkHarness({
    initialX: 30,
    initialDirection: -1,
    visibleOffsetForDirection: (direction) => direction < 0 ? 72 : 48
  });

  const before = harness.controller.advanceWalkStep(3, 80);
  const after = harness.controller.advanceWalkStep(4, 80);

  assert.equal(before.direction, 1);
  assert.equal(after.direction, 1);
  assert.equal(before.x, 40);
  assert.equal(after.x, 50);
  assert.deepEqual(
    harness.calls.map((call) => call.x),
    [40, 50]
  );
});

test("window-surface walk mirrors at the right edge without visible-center back solving", () => {
  const harness = createWindowWalkHarness({
    initialX: 150,
    initialDirection: 1
  });

  const first = harness.controller.advanceWalkStep(3, 80);
  const second = harness.controller.advanceWalkStep(4, 80);

  assert.equal(first.direction, -1);
  assert.equal(second.direction, -1);
  assert.equal(first.x, 160);
  assert.equal(second.x, 150);
  assert.deepEqual(harness.calls.map((call) => call.x), [160, 150]);
});

test("window-surface walk advances from the previous real window X track", () => {
  const harness = createWindowWalkHarness();

  const first = harness.controller.advanceWalkStep(3, 80);
  const second = harness.controller.advanceWalkStep(4, 80);

  assert.equal(first.x, 100);
  assert.equal(second.x, 110);
  assert.equal(harness.getTrackX(), 110);
});

test("window-surface walk keeps real window speed independent from frameStep", () => {
  const harness = createWindowWalkHarness();

  const results = [3, 12, 4, 27].map((frameStep) => harness.controller.advanceWalkStep(frameStep, 80));

  assert.deepEqual(
    results.map((result) => result.x),
    [100, 110, 120, 130]
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
});

test("window-surface walk syncs an out-of-bounds start to a safe real window X", () => {
  const harness = createWindowWalkHarness({
    initialX: 0,
    initialDirection: 1
  });

  const first = harness.controller.advanceWalkStep(3, 80);
  const second = harness.controller.advanceWalkStep(4, 80);

  assert.equal(first.moved, true);
  assert.equal(second.moved, true);
  assert.deepEqual(harness.calls.map((call) => call.x), [90, 100]);
});
