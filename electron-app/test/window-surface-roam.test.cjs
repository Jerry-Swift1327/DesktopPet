const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "window-roam-controller.cjs"), "utf8");
const dockControllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "dock-controller.cjs"), "utf8");
const stateControllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "state-controller.cjs"), "utf8");
const { createStateController } = require("../electron/behavior/state-controller.cjs");
const { createWindowRoamController } = require("../electron/behavior/window-roam-controller.cjs");
const { createDockController } = require("../electron/behavior/dock-controller.cjs");

function createSurface(id, { left, top = 100, right, bottom = 500, groundY = 500 }) {
  return {
    type: "window",
    sourceWindowId: id,
    left,
    right,
    groundY,
    bounds: { left, top, right, bottom }
  };
}

function createRoamHarness({ candidates, petBounds = { x: 820, y: 710, width: 120, height: 90 }, walking = false }) {
  let currentSurface = { type: "taskbar", groundY: 900, left: 0, right: 1920 };
  let petWindowBounds = { ...petBounds };
  const calls = [];
  const context = {
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ ...petWindowBounds })
    }),
    getActiveState: () => "petSquat",
    getWalkDirection: () => 1,
    getDragState: () => false,
    getWindowDockInProgress: () => false,
    getWindowRoamEnabled: () => true,
    canToggleWindowRoam: () => true,
    refreshWindowSurfaceCandidatesAsync: (options) => calls.push({ type: "refresh", options }),
    parseWindowHwnd: (value) => String(value || "").toLowerCase(),
    getCachedWindowSurfaceCandidates: () => candidates,
    buildWindowSurfaceFromItem: (item) => ({ surface: item.surface }),
    getVisiblePetRectFromBounds: (bounds) => bounds,
    applySurfaceScale: () => true,
    setCurrentSurface: (surface) => {
      currentSurface = surface;
      calls.push({ type: "setSurface", id: surface.sourceWindowId || surface.type });
      return surface;
    },
    groundPetToSurface: () => calls.push({ type: "ground" }),
    getVisibleSpriteInsets: () => ({ left: 0, right: 0 }),
    getPetSpriteSize: () => 100,
    getPetWindowPositionForVisibleRect: (x, y) => ({ x, y }),
    getSurfaceVisibleTop: (surface) => surface.groundY - 100,
    clampPetWindowPositionToSurface: (x, y) => ({ x, y }),
    setPetWindowPosition: (x, y) => {
      petWindowBounds = { ...petWindowBounds, x, y };
      calls.push({ type: "setPosition", x, y });
    },
    syncWalkTrackX: (x) => calls.push({ type: "syncWalk", x }),
    isWalkingState: () => walking,
    refreshWalkLoopAfterSurfaceChange: () => calls.push({ type: "refreshWalk" }),
    safeSend: () => calls.push({ type: "safeSend" }),
    buildScaleSummary: () => ({}),
    getCurrentSurface: () => currentSurface,
    fallbackCurrentSurfaceToTaskbar: () => calls.push({ type: "fallback" }),
    getWindowRoamSurfaceById: (id) => candidates.find((item) => String(item.hwnd).toLowerCase() === id)?.surface || null,
    WINDOW_ROAM_MAX_MISSING_TICKS: 2,
    WINDOW_ROAM_POLL_INTERVAL_MS: 450,
    WINDOW_ROAM_START_ATTACH_DELAY_MS: 650
  };
  return {
    controller: createWindowRoamController(context),
    calls,
    getCurrentSurface: () => currentSurface,
    setCurrentSurface: (surface) => { currentSurface = surface; }
  };
}

function createStateHarness({ initialState = "petShake", initialSurface = "window" } = {}) {
  let activeState = initialState;
  let selectedState = initialState;
  let walkDirection = 1;
  let currentSurface = initialSurface === "window"
    ? createSurface("window-a", { left: 300, right: 700, groundY: 520 })
    : { type: "taskbar", left: 0, right: 1200, groundY: 900, workArea: { x: 0, y: 0, width: 1200, height: 900 } };
  let bounds = { x: 420, y: 380, width: 120, height: 120 };
  const taskbarSurface = {
    type: "taskbar",
    left: 0,
    right: 1200,
    groundY: 900,
    workArea: { x: 0, y: 0, width: 1200, height: 900 }
  };
  const calls = [];
  const states = [
    { id: "petSquat", moving: false },
    { id: "petShake", moving: false },
    { id: "petWalk", moving: true }
  ];
  const controller = createStateController({
    sendPetState: () => calls.push({ type: "sendState" }),
    sendWalkDirection: () => calls.push({ type: "sendDirection" }),
    groundPetToSurface: () => calls.push({ type: "ground" }),
    applySurfaceScale: () => true,
    resetToTaskbarSurface: () => {
      currentSurface = taskbarSurface;
      return taskbarSurface;
    },
    setCurrentSurface: (surface) => {
      currentSurface = surface;
      return surface;
    },
    getCurrentSurface: () => currentSurface,
    getSurfaceDisplay: () => ({ id: 1 }),
    getSurfaceWorkArea: (surface) => surface.workArea,
    getTaskbarHomeVisibleRight: () => 860,
    getSurfaceVisibleTop: (surface) => surface.groundY - 90,
    getVisibleSpriteInsets: () => ({ left: 12, right: 30, top: 18, bottom: 12 }),
    getPetSpriteSize: () => 120,
    getPetWindowPositionForVisibleRect: (x, y) => ({ x: x - 12, y: y - 18 }),
    clampPetWindowPositionToSurface: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
    setPetWindowPosition: (x, y) => {
      bounds = { ...bounds, x: Math.round(x), y: Math.round(y) };
      calls.push({ type: "setPosition", x: Math.round(x), y: Math.round(y) });
    },
    syncWalkTrackX: (x) => calls.push({ type: "syncWalk", x }),
    markManualTaskbarHold: (surface) => calls.push({ type: "manualHold", surfaceType: surface?.type || null }),
    preserveBottomAnchorForState: () => {},
    resetWalkRuntime: () => calls.push({ type: "resetWalk" }),
    startWalkLoop: () => {},
    clearTabbySleepPoseTimer: () => calls.push({ type: "clearSleepTimer" }),
    scheduleTabbySleepPose: () => {},
    applyInterruptedWalkStats: () => {},
    applyActionStats: () => [],
    shouldDelayActionStats: () => false,
    clearPendingWalkBubbleMessage: () => {},
    showPendingWalkBubbleMessage: () => {},
    materializeTaskbarWalkRunwayForState: () => {},
    hideStartupBubble: () => {},
    hidePetMenu: () => {},
    hideHoverPanel: () => {},
    showStatMessages: () => {},
    recordUserOperation: () => calls.push({ type: "record" }),
    recordInteraction: () => {},
    getDefaultDirectionForState: () => -1,
    getTransitionBottomAnchor: () => null,
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
      getBounds: () => ({ ...bounds })
    }),
    DEFAULT_STATE: "petSquat",
    STATE_WALK: "petWalk",
    STATE_SLEEP: "petSleep",
    STATE_YAWN: "petYawn",
    STATE_HISS: "petHiss",
    TABBY_IDLE_STATES: new Set(),
    ONE_SHOT_STATES: new Set(["petShake"]),
    states
  });
  return {
    controller,
    calls,
    getActiveState: () => activeState,
    getSelectedState: () => selectedState,
    getCurrentSurface: () => currentSurface,
    getBounds: () => ({ ...bounds })
  };
}

test("source no longer contains smooth transfer or 2s manual cooldown hooks", () => {
  const combined = [mainSource, controllerSource, dockControllerSource, stateControllerSource].join("\n");
  assert.doesNotMatch(combined, /animatePetWindowTransition|surface-transition|getCurrentVisibleTransitionAnchor|preserveVisibleTransitionAnchor/);
  assert.doesNotMatch(combined, /WINDOW_ROAM_DRAG_FALLBACK_SUPPRESS_MS|WINDOW_ROAM_MANUAL_TASKBAR_SUPPRESS_MS/);
  assert.match(controllerSource, /let manualTaskbarHold = false;/);
  assert.match(controllerSource, /function markManualTaskbarHold\(surface\)/);
  assert.match(stateControllerSource, /notifyState: !wasDefaultState/);
});

test("window roam attaches directly and keeps the locked target stable", () => {
  const fartherTopWindow = createSurface("a", { left: 80, right: 480 });
  const nearerWindow = createSurface("b", { left: 900, right: 1300 });
  const { controller, calls, getCurrentSurface } = createRoamHarness({
    candidates: [
      { hwnd: "a", surface: fartherTopWindow },
      { hwnd: "b", surface: nearerWindow }
    ]
  });

  controller.tickWindowRoam();

  assert.equal(getCurrentSurface().sourceWindowId, "b");
  assert.equal(calls.some((call) => call.type === "setPosition"), true);
  assert.equal(calls.some((call) => call.type === "transition" || call.type === "animate"), false);

  controller.tickWindowRoam();

  assert.equal(getCurrentSurface().sourceWindowId, "b");
  assert.equal(calls.filter((call) => call.type === "setSurface" && call.id === "b").length, 2);
  assert.equal(calls.some((call) => call.type === "setSurface" && call.id === "a"), false);
});

test("window roam keeps top candidate priority for overlapping windows", () => {
  const topWindow = createSurface("top", { left: 120, top: 100, right: 620, bottom: 520 });
  const closerOverlappedWindow = createSurface("closer", { left: 260, top: 120, right: 760, bottom: 560 });
  const { controller, getCurrentSurface } = createRoamHarness({
    petBounds: { x: 700, y: 710, width: 120, height: 90 },
    candidates: [
      { hwnd: "top", surface: topWindow },
      { hwnd: "closer", surface: closerOverlappedWindow }
    ]
  });

  controller.tickWindowRoam();

  assert.equal(getCurrentSurface().sourceWindowId, "top");
});

test("manual taskbar hold prevents automatic reattach until explicit reset", () => {
  const surfaceA = createSurface("a", { left: 80, right: 480 });
  const surfaceB = createSurface("b", { left: 900, right: 1300 });
  const { controller, calls, getCurrentSurface, setCurrentSurface } = createRoamHarness({
    candidates: [
      { hwnd: "a", surface: surfaceA },
      { hwnd: "b", surface: surfaceB }
    ]
  });

  controller.tickWindowRoam();
  assert.equal(getCurrentSurface().sourceWindowId, "b");

  controller.markManualTaskbarHold(surfaceB);
  setCurrentSurface({ type: "taskbar", groundY: 900, left: 0, right: 1920 });

  controller.tickWindowRoam();
  controller.tickWindowRoam();
  assert.equal(getCurrentSurface().type, "taskbar");

  controller.resetWindowRoamState();
  controller.tickWindowRoam();
  assert.equal(getCurrentSurface().sourceWindowId, "b");
  assert.ok(!calls.some((call) => call.type === "setSurface" && call.id === "a"));
});

test("manual taskbar hold clears after successful manual window attach", () => {
  const target = createSurface("b", { left: 900, right: 1300 });
  const { controller, getCurrentSurface, setCurrentSurface } = createRoamHarness({
    candidates: [{ hwnd: "b", surface: target }]
  });

  controller.markManualTaskbarHold(target);
  setCurrentSurface({ type: "taskbar", groundY: 900, left: 0, right: 1920 });
  controller.attachPetToWindowRoamSurface(target);
  assert.equal(getCurrentSurface().sourceWindowId, "b");

  setCurrentSurface({ type: "taskbar", groundY: 900, left: 0, right: 1920 });
  controller.tickWindowRoam();
  assert.equal(getCurrentSurface().sourceWindowId, "b");
});

test("start attach delay remains separate from removed manual cooldown", () => {
  const target = createSurface("b", { left: 900, right: 1300 });
  const { controller, calls, getCurrentSurface } = createRoamHarness({
    candidates: [{ hwnd: "b", surface: target }]
  });
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  try {
    controller.startWindowRoamPolling();
    assert.deepEqual(calls[0], { type: "refresh", options: { force: true } });
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().type, "taskbar");
    now = 1651;
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().sourceWindowId, "b");
  } finally {
    controller.stopWindowRoamPolling();
    Date.now = originalNow;
  }
});

test("invalid window replacement attaches directly to adjacent candidate", () => {
  const pollingBody = dockControllerSource.match(/function startWindowSurfacePolling\(\) \{([\s\S]*?)\n  function stopWindowSurfacePolling/)?.[1] || "";
  const invalidBranch = pollingBody.match(/if \(!validateCurrentWindowSurface\(\)\) \{([\s\S]*?)\n        setWindowSurfaceMissingTicks\(0\);/)?.[1] || "";

  assert.match(invalidBranch, /const roamSurface = getWindowRoamEnabled\(\) \? getTopWindowRoamSurface\(invalidWindowId\) : null;/);
  assert.match(invalidBranch, /if \(roamSurface && attachPetToWindowRoamSurface\(roamSurface\)\) \{[\s\S]*markWindowRoamAttached\(roamSurface\);[\s\S]*return;/);
  assert.match(invalidBranch, /fallbackCurrentSurfaceToTaskbar\("window-surface-invalidated"\);/);
  assert.match(invalidBranch, /markWindowInvalidTaskbarSettleUntil\(Date\.now\(\) \+ WINDOW_ROAM_INVALID_FALLBACK_SUPPRESS_MS\);/);
});

test("window fallback to taskbar sets the final position directly", () => {
  let currentSurface = createSurface("window-a", { left: 300, right: 700, groundY: 520 });
  let petBounds = { x: 410, y: 380, width: 120, height: 120 };
  const taskbarSurface = { type: "taskbar", left: 0, right: 1200, groundY: 900 };
  const calls = [];
  const controller = createDockController({
    process: { platform: "win32" },
    log: () => {},
    setCurrentSurface: (surface) => {
      currentSurface = surface;
      return surface;
    },
    getCurrentSurface: () => currentSurface,
    applySurfaceScale: () => true,
    groundPetToSurface: () => calls.push({ type: "ground" }),
    clampPetWindowPositionToSurface: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
    setPetWindowPosition: (x, y) => {
      petBounds = { ...petBounds, x: Math.round(x), y: Math.round(y) };
      calls.push({ type: "setPosition", x: Math.round(x), y: Math.round(y) });
    },
    syncWalkTrackX: (x) => calls.push({ type: "syncWalk", x }),
    isWalkingState: () => true,
    refreshWalkLoopAfterSurfaceChange: () => calls.push({ type: "refreshWalk" }),
    clearDragState: () => {},
    refreshWindowSurfaceCandidatesAsync: () => {},
    setState: () => {},
    parseWindowHwnd: (value) => String(value || ""),
    diagnoseDockTargetFromCache: () => ({ ok: false, reason: "none", elapsedMs: 0, surface: null }),
    fallbackToTaskbarAfterDrag: () => {},
    findCandidateByHwnd: () => null,
    buildWindowSurfaceFromItem: () => ({ surface: null }),
    getVisiblePetRectFromBounds: (bounds) => ({ x: bounds.x + 11, y: bounds.y + 24, width: 58, height: 82 }),
    resetToTaskbarSurface: () => {
      currentSurface = taskbarSurface;
      return taskbarSurface;
    },
    getGroundedWindowYForSurface: (surface) => surface.groundY - 24 - 82,
    getVisibleSpriteInsets: () => ({ left: 11, right: 51 }),
    getPetSpriteSize: () => 120,
    getPetWindowPositionForVisibleRect: (x, y) => ({ x: x - 11, y: y - 24 }),
    getSurfaceVisibleTop: (surface) => surface.groundY - 82,
    maybeRefreshWindowSurfaceCandidatesBackground: () => {},
    refreshCurrentWindowSurfaceBoundsFromCache: () => true,
    getTopWindowRoamSurface: () => null,
    attachPetToWindowRoamSurface: () => false,
    logWalkDiagnostic: () => {},
    isInteractionPaused: () => false,
    getInteractionPauseSummary: () => "",
    rememberDockedWindowRoamTarget: () => {},
    clearWindowRoamSuppression: () => {},
    markManualTaskbarHold: () => {},
    markWindowInvalidTaskbarSettleUntil: () => {},
    markWindowRoamAttached: () => {},
    retryDockPetAfterDrag: () => {},
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ ...petBounds })
    }),
    getActiveState: () => "petWalk",
    getWalkDirection: () => 1,
    getDragState: () => false,
    getPetRuntimeConfig: () => ({ features: { dockShake: false } }),
    getPetScale: () => 1,
    getPreferredPetScale: () => 1,
    getWindowRoamEnabled: () => false,
    getWindowSurfacePollTimer: () => null,
    setWindowSurfacePollTimer: () => {},
    getLastWindowSurfaceHeavyCheckAt: () => 0,
    setLastWindowSurfaceHeavyCheckAt: () => {},
    getWindowSurfaceMissingTicks: () => 0,
    setWindowSurfaceMissingTicks: () => {},
    getWindowDockInProgress: () => false,
    setWindowDockInProgress: () => {},
    getWindowDockHoverSuppressedUntil: () => 0,
    setWindowDockHoverSuppressedUntil: () => {},
    STATE_SHAKE: "petShake",
    ENABLE_WINDOW_DOCKING: true,
    WINDOW_DOCK_DEBUG: false,
    WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS: 1250,
    WINDOW_DOCK_DRAG_RETRY_DELAY_MS: 260,
    WINDOW_DOCK_COARSE_CORRECTION_LIMIT: 28,
    WINDOW_SURFACE_HEAVY_RECHECK_MS: 500,
    WINDOW_SURFACE_POLL_INTERVAL_MS: 250,
    WINDOW_ROAM_INVALID_FALLBACK_SUPPRESS_MS: 700
  });

  controller.fallbackCurrentSurfaceToTaskbar("test-window-invalid");

  assert.equal(calls.some((call) => call.type === "setPosition"), true);
  assert.equal(calls.some((call) => call.type === "transition" || call.type === "animate"), false);
  assert.equal(calls.some((call) => call.type === "refreshWalk"), true);
  assert.equal(petBounds.y + 24 + 82, taskbarSurface.groundY);
});

test("drag release onto a window surface sets position directly", () => {
  let currentSurface = { type: "taskbar", left: 0, right: 1200, groundY: 900 };
  let petBounds = { x: 460, y: 420, width: 120, height: 120 };
  const windowSurface = createSurface("window-a", { left: 300, right: 700, groundY: 520 });
  const calls = [];
  const controller = createDockController({
    process: { platform: "win32" },
    log: () => {},
    setCurrentSurface: (surface) => {
      currentSurface = surface;
      return surface;
    },
    getCurrentSurface: () => currentSurface,
    applySurfaceScale: () => true,
    groundPetToSurface: () => calls.push({ type: "ground" }),
    clampPetWindowPositionToSurface: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
    setPetWindowPosition: (x, y) => {
      petBounds = { ...petBounds, x: Math.round(x), y: Math.round(y) };
      calls.push({ type: "setPosition", x: Math.round(x), y: Math.round(y) });
    },
    syncWalkTrackX: (x) => calls.push({ type: "syncWalk", x }),
    isWalkingState: () => false,
    refreshWalkLoopAfterSurfaceChange: () => calls.push({ type: "refreshWalk" }),
    clearDragState: () => {},
    refreshWindowSurfaceCandidatesAsync: () => {},
    setState: () => {},
    parseWindowHwnd: (value) => String(value || ""),
    diagnoseDockTargetFromCache: () => ({ ok: false, reason: "none", elapsedMs: 0, surface: null }),
    fallbackToTaskbarAfterDrag: () => {},
    findCandidateByHwnd: () => null,
    buildWindowSurfaceFromItem: () => ({ surface: null }),
    getVisiblePetRectFromBounds: (bounds) => bounds,
    resetToTaskbarSurface: () => currentSurface,
    getGroundedWindowYForSurface: () => 400,
    getVisibleSpriteInsets: () => ({ left: 0, right: 0 }),
    getPetSpriteSize: () => 120,
    getPetWindowPositionForVisibleRect: (x, y) => ({ x, y }),
    getSurfaceVisibleTop: (surface) => surface.groundY - 120,
    maybeRefreshWindowSurfaceCandidatesBackground: () => {},
    refreshCurrentWindowSurfaceBoundsFromCache: () => true,
    getTopWindowRoamSurface: () => null,
    attachPetToWindowRoamSurface: () => false,
    logWalkDiagnostic: () => {},
    isInteractionPaused: () => false,
    getInteractionPauseSummary: () => "",
    rememberDockedWindowRoamTarget: () => {},
    clearWindowRoamSuppression: () => {},
    markManualTaskbarHold: () => {},
    markWindowInvalidTaskbarSettleUntil: () => {},
    markWindowRoamAttached: () => {},
    retryDockPetAfterDrag: () => {},
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ ...petBounds })
    }),
    getActiveState: () => "petSquat",
    getWalkDirection: () => 1,
    getDragState: () => false,
    getPetRuntimeConfig: () => ({ features: { dockShake: false } }),
    getPetScale: () => 1,
    getPreferredPetScale: () => 1,
    getWindowRoamEnabled: () => false,
    getWindowSurfacePollTimer: () => null,
    setWindowSurfacePollTimer: () => {},
    getLastWindowSurfaceHeavyCheckAt: () => 0,
    setLastWindowSurfaceHeavyCheckAt: () => {},
    getWindowSurfaceMissingTicks: () => 0,
    setWindowSurfaceMissingTicks: () => {},
    getWindowDockInProgress: () => false,
    setWindowDockInProgress: () => {},
    getWindowDockHoverSuppressedUntil: () => 0,
    setWindowDockHoverSuppressedUntil: () => {},
    STATE_SHAKE: "petShake",
    ENABLE_WINDOW_DOCKING: true,
    WINDOW_DOCK_DEBUG: false,
    WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS: 1250,
    WINDOW_DOCK_DRAG_RETRY_DELAY_MS: 260,
    WINDOW_DOCK_COARSE_CORRECTION_LIMIT: 28,
    WINDOW_SURFACE_HEAVY_RECHECK_MS: 500,
    WINDOW_SURFACE_POLL_INTERVAL_MS: 250,
    WINDOW_ROAM_INVALID_FALLBACK_SUPPRESS_MS: 700
  });

  controller.applyDockSurfaceAfterDrag(windowSurface, petBounds.x);

  assert.equal(calls.some((call) => call.type === "setPosition"), true);
  assert.equal(calls.some((call) => call.type === "transition" || call.type === "animate"), false);
  assert.equal(calls.some((call) => call.type === "ground"), true);
});

test("reset to start switches non-squat state to squat once", () => {
  const harness = createStateHarness({ initialState: "petShake", initialSurface: "window" });

  harness.controller.settlePetQuietly();

  assert.equal(harness.getActiveState(), "petSquat");
  assert.equal(harness.getSelectedState(), "petSquat");
  assert.equal(harness.getCurrentSurface().type, "taskbar");
  assert.equal(harness.calls.filter((call) => call.type === "sendState").length, 1);
  assert.deepEqual(harness.calls.find((call) => call.type === "manualHold"), { type: "manualHold", surfaceType: "window" });
  assert.equal(harness.calls.some((call) => call.type === "setPosition"), true);
});

test("reset to start does not replay squat when already squatting", () => {
  const harness = createStateHarness({ initialState: "petSquat", initialSurface: "taskbar" });

  harness.controller.settlePetQuietly();

  assert.equal(harness.getActiveState(), "petSquat");
  assert.equal(harness.getSelectedState(), "petSquat");
  assert.equal(harness.calls.filter((call) => call.type === "sendState").length, 0);
  assert.equal(harness.calls.filter((call) => call.type === "sendDirection").length, 1);
  assert.deepEqual(harness.calls.find((call) => call.type === "manualHold"), { type: "manualHold", surfaceType: null });
  assert.equal(harness.calls.some((call) => call.type === "setPosition"), true);
});
