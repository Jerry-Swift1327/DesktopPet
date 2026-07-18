const test = require("node:test");
const assert = require("node:assert/strict");

const { createStateController } = require("../electron/behavior/state-controller.cjs");

function createHarness({ initialState = "petSquat", targetState = "petFeed" } = {}) {
  let activeState = initialState;
  let selectedState = initialState;
  let walkDirection = -1;
  const calls = [];
  let scheduledTimer = null;
  const anchor = { x: 320, y: 760 };
  const states = [
    { id: "petSquat", moving: false },
    { id: "petFeed", moving: false, oneShot: true },
    { id: "petWalk", moving: true },
    { id: "petTailWag", moving: false, playback: { mode: "timed", durationMinutes: 2, completeTo: "petSquat" } }
  ];
  const controller = createStateController({
    sendPetState: () => calls.push({ type: "sendState" }),
    sendWalkDirection: () => calls.push({ type: "sendDirection" }),
    groundPetToSurface: (state, direction) => calls.push({ type: "ground", state, direction }),
    applySurfaceScale: () => true,
    resetToTaskbarSurface: () => ({ type: "taskbar" }),
    setCurrentSurface: () => {},
    getCurrentSurface: () => ({ type: "taskbar" }),
    getSurfaceDisplay: () => ({ id: 1 }),
    getSurfaceWorkArea: () => ({ x: 0, y: 0, width: 1000, height: 760 }),
    getTaskbarHomeVisibleRight: () => 840,
    getSurfaceVisibleTop: () => 640,
    getVisibleSpriteInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
    getPetSpriteSize: () => 128,
    getPetWindowPositionForVisibleRect: (x, y) => ({ x, y }),
    clampPetWindowPositionToSurface: (x, y) => ({ x, y }),
    setPetWindowPosition: () => {},
    syncWalkTrackX: () => {},
    markManualTaskbarHold: () => {},
    preserveBottomAnchorForState: (nextAnchor, state, direction) => {
      calls.push({ type: "preserve", anchor: nextAnchor, state, direction });
      return true;
    },
    resetWalkRuntime: () => calls.push({ type: "resetWalk" }),
    startWalkLoop: () => calls.push({ type: "startWalk" }),
    clearTabbySleepPoseTimer: () => calls.push({ type: "clearSleepTimer" }),
    scheduleTabbySleepPose: () => {},
    applyInterruptedWalkStats: () => {},
    applyActionStats: () => [],
    shouldDelayActionStats: () => false,
    clearPendingWalkBubbleMessage: () => {},
    showPendingWalkBubbleMessage: () => {},
    materializeTaskbarWalkRunwayForState: () => {},
    hideStartupBubble: () => calls.push({ type: "hideBubble" }),
    hidePetMenu: () => calls.push({ type: "hideMenu" }),
    hideHoverPanel: () => calls.push({ type: "hideHover" }),
    showStatMessages: () => {},
    recordUserOperation: () => {},
    recordInteraction: () => {},
    getDefaultDirectionForState: () => 1,
    getTransitionBottomAnchor: () => anchor,
    getState: (state) => states.find((item) => item.id === state),
    clearDragState: () => {},
    setHomeDisplayId: () => {},
    setHomeWorkArea: () => {},
    log: () => {},
    getActiveState: () => activeState,
    setActiveState: (state) => { activeState = state; },
    getSelectedState: () => selectedState,
    setSelectedState: (state) => { selectedState = state; },
    getWalkDirection: () => walkDirection,
    setWalkDirectionValue: (direction) => { walkDirection = direction; },
    getTaskbarWalkRunway: () => null,
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ x: 100, y: 500, width: 180, height: 180 })
    }),
    DEFAULT_STATE: "petSquat",
    STATE_WALK: "petWalk",
    STATE_SLEEP: "petSleep",
    STATE_YAWN: "petYawn",
    STATE_HISS: "petHiss",
    TABBY_IDLE_STATES: new Set(),
    ONE_SHOT_STATES: new Set(["petFeed"]),
    states,
    setTimeoutFn: (callback, delay) => {
      scheduledTimer = { callback, delay };
      return scheduledTimer;
    },
    clearTimeoutFn: (timer) => {
      if (scheduledTimer === timer) scheduledTimer = null;
    }
  });

  return {
    controller,
    calls,
    get activeState() {
      return activeState;
    },
    get scheduledTimer() {
      return scheduledTimer;
    },
    targetState
  };
}

test("non-moving state changes keep the previous rendered frame grounded until the target frame is reported", () => {
  const harness = createHarness();

  harness.controller.setState(harness.targetState);

  assert.equal(harness.activeState, "petFeed");
  assert.deepEqual(
    harness.calls.filter((call) => call.type === "preserve"),
    [{ type: "preserve", anchor: { x: 320, y: 760 }, state: "petSquat", direction: -1 }]
  );
  assert.equal(harness.calls.some((call) => call.type === "ground"), false);
  assert.equal(harness.calls.at(-1).type, "sendState");

  assert.equal(harness.controller.completeVisualStateCommit("petSquat"), false);
  assert.equal(harness.controller.completeVisualStateCommit("petFeed"), true);
  assert.deepEqual(
    harness.calls.filter((call) => call.type === "ground"),
    [{ type: "ground", state: "petFeed", direction: -1 }]
  );
  assert.equal(harness.controller.completeVisualStateCommit("petFeed"), false);
});

test("timed playback returns to its configured completion state after the active duration", () => {
  const harness = createHarness({ targetState: "petTailWag" });

  harness.controller.setState("petTailWag");

  assert.equal(harness.activeState, "petTailWag");
  assert.equal(harness.scheduledTimer.delay, 2 * 60 * 1000);
  harness.scheduledTimer.callback();
  assert.equal(harness.activeState, "petSquat");
});

test("moving state changes delay walk alignment until the first moving frame is reported", () => {
  const harness = createHarness({ targetState: "petWalk" });

  harness.controller.setState("petWalk");

  assert.equal(harness.activeState, "petWalk");
  assert.equal(harness.calls.some((call) => call.type === "startWalk"), false);
  assert.equal(harness.calls.some((call) => call.type === "ground"), false);
  assert.deepEqual(
    harness.calls.filter((call) => call.type === "preserve"),
    [{ type: "preserve", anchor: { x: 320, y: 760 }, state: "petSquat", direction: -1 }]
  );

  assert.equal(harness.controller.completeVisualStateCommit("petWalk"), true);
  assert.deepEqual(
    harness.calls.filter((call) => call.type === "startWalk"),
    [{ type: "startWalk" }]
  );
});
