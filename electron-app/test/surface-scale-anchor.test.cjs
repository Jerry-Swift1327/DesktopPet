const test = require("node:test");
const assert = require("node:assert/strict");

const { createSurfaceScaleController } = require("../electron/pet/surface-scale-controller.cjs");
const { createStateController } = require("../electron/behavior/state-controller.cjs");

function createScaleAnchorHarness() {
  let bounds = { x: 100, y: 240, width: 180, height: 180 };
  let currentSurface = {
    type: "taskbar",
    left: 0,
    right: 1000,
    groundY: 760,
    workArea: { x: 0, y: 0, width: 1000, height: 760 }
  };
  const calls = [];
  let controller = null;

  function scaleValue() {
    return controller.getPetScale();
  }

  function windowWidth() {
    return Math.round(180 * scaleValue());
  }

  function windowHeight() {
    return Math.round(180 * scaleValue());
  }

  function spriteSize() {
    return Math.round(128 * scaleValue());
  }

  function spriteOffsetX(width = windowWidth()) {
    return Math.max(0, Math.round((width - spriteSize()) / 2));
  }

  function visibleRectFromBounds(nextBounds) {
    const scale = scaleValue();
    const offsetX = spriteOffsetX(nextBounds.width) + Math.round(6 * scale);
    const visibleWidth = Math.round(54 * scale);
    const offsetY = Math.round(16 * scale);
    const visibleHeight = Math.round(92 * scale);
    return {
      x: Math.round(nextBounds.x + offsetX),
      y: Math.round(nextBounds.y + offsetY),
      width: Math.max(1, visibleWidth),
      height: Math.max(1, visibleHeight)
    };
  }

  function windowXForVisibleCenter(centerX) {
    const probe = { x: 0, y: 0, width: windowWidth(), height: windowHeight() };
    const visible = visibleRectFromBounds(probe);
    return Math.round(centerX - (visible.x - probe.x) - visible.width / 2);
  }

  controller = createSurfaceScaleController({
    clampPetScale: (value) => Math.round(Math.min(Math.max(Number(value) || 1, 0.75), 1.6) * 100) / 100,
    getPetWindowWidth: windowWidth,
    getPetWindowHeight: windowHeight,
    getPetSpriteSize: spriteSize,
    getSpriteLocalXForWindowWidth: spriteOffsetX,
    getSurfaceWorkArea: () => currentSurface.workArea,
    getVisibleSpriteInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
    getGroundedWindowYForSurface: () => 500,
    clampPetWindowPositionToSurface: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
    getTaskbarWalkCenterLimits: () => ({ left: 0, right: 1000 }),
    ensureTaskbarWalkRunwayForCenter: () => null,
    isTaskbarWalkActive: () => false,
    clearPetWindowHitRegion: () => {},
    getWalkVisibleCenterFromWindowX: (x) => x,
    getTaskbarWalkRunwayWindowWidth: () => 1000,
    setPetWindowPosition: (x, y) => {
      bounds = { ...bounds, x: Math.round(x), y: Math.round(y), width: windowWidth(), height: windowHeight() };
    },
    syncWalkTrackX: () => {},
    updatePetWindowMousePassthrough: () => {},
    scheduleWalkLoopTimeout: () => {},
    resetToTaskbarSurface: () => currentSurface,
    setCurrentSurface: (surface) => {
      currentSurface = surface;
      return currentSurface;
    },
    getCurrentSurface: () => currentSurface,
    getVisiblePetRectFromBounds: visibleRectFromBounds,
    getWindowXForVisibleCenter: windowXForVisibleCenter,
    setWalkWindowPosition: () => null,
    setTaskbarWalkWindowPositionForCenter: () => null,
    isWalkingState: () => false,
    refreshMenuAnchorAfterScale: () => {},
    refreshHoverAnchorAfterScale: () => {},
    refreshCustomizationAnchorAfterScale: () => {},
    repositionStartupBubbleWindow: () => {},
    sendScaleChanged: (summary) => calls.push({ type: "scale", summary }),
    preferencesStore: {
      readPetScalePreference: () => {},
      getPetScale: () => 1,
      getPreferredPetScale: () => 1,
      setPreferredPetScale: () => {},
      writePetScalePreference: () => {}
    },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ ...bounds }),
      setBounds: (nextBounds) => {
        bounds = { ...bounds, ...nextBounds };
      }
    }),
    getActiveState: () => "petSquat",
    getWalkDirection: () => -1,
    getTaskbarWalkRunway: () => null,
    setTaskbarWalkRunway: () => {},
    getWalkTrackX: () => null,
    setWalkTrackX: () => {},
    log: () => {},
    DEFAULT_PET_SCALE: 1,
    PET_SCALE_MIN: 0.75,
    PET_SCALE_MAX: 1.6,
    PET_SCALE_STEP: 0.08,
    VISIBLE_TOP_GAP: 0,
    WINDOW_DOCK_DEBUG: false,
    WINDOW_DOCK_COARSE_CORRECTION_LIMIT: 28,
    WINDOW_DOCK_FINE_CORRECTION_LIMIT: 2
  });

  return {
    controller,
    bounds: () => ({ ...bounds }),
    visibleCenterX: () => {
      const visible = visibleRectFromBounds(bounds);
      return Math.round(visible.x + visible.width / 2);
    }
  };
}

test("setPetScale keeps the current visible pet center anchored while resizing", () => {
  const harness = createScaleAnchorHarness();
  const beforeCenter = harness.visibleCenterX();

  harness.controller.setPetScale(0.75);

  assert.equal(harness.visibleCenterX(), beforeCenter);
  assert.equal(harness.bounds().width, 135);
  assert.equal(harness.bounds().height, 135);
});

test("moveToStartPosition keeps the same visual home anchor across scales", () => {
  let scale = 1;
  let activeState = "petSquat";
  let selectedState = activeState;
  let walkDirection = 1;
  let bounds = { x: 230, y: 240, width: windowWidth(), height: windowHeight() };
  let currentSurface = {
    type: "taskbar",
    left: 0,
    right: 1000,
    groundY: 760,
    workArea: { x: 0, y: 0, width: 1000, height: 760 }
  };
  const homeVisibleRight = 840;
  const states = [{ id: "petSquat", moving: false }];

  function windowWidth() {
    return Math.round(180 * scale);
  }

  function windowHeight() {
    return Math.round(180 * scale);
  }

  function spriteSize() {
    return Math.round(128 * scale);
  }

  function visibleWidth() {
    return Math.round(54 * scale);
  }

  function visibleHeight() {
    return Math.round(92 * scale);
  }

  function offsetX() {
    return Math.max(0, Math.round((windowWidth() - spriteSize()) / 2)) + Math.round(6 * scale);
  }

  function offsetY() {
    return Math.round(16 * scale);
  }

  function visibleRect() {
    return {
      x: Math.round(bounds.x + offsetX()),
      y: Math.round(bounds.y + offsetY()),
      width: Math.max(1, visibleWidth()),
      height: Math.max(1, visibleHeight())
    };
  }

  function setScale(nextScale) {
    scale = nextScale;
    bounds = { ...bounds, width: windowWidth(), height: windowHeight() };
  }

  const controller = createStateController({
    sendPetState: () => {},
    sendWalkDirection: () => {},
    groundPetToSurface: () => {},
    applySurfaceScale: () => {
      bounds = { ...bounds, width: windowWidth(), height: windowHeight() };
      return true;
    },
    resetToTaskbarSurface: () => currentSurface,
    setCurrentSurface: (surface) => { currentSurface = surface; },
    getCurrentSurface: () => currentSurface,
    getSurfaceDisplay: () => ({ id: 1 }),
    getSurfaceWorkArea: (surface) => surface.workArea,
    getTaskbarHomeVisibleRight: () => homeVisibleRight,
    getSurfaceVisibleTop: (surface) => surface.groundY - visibleHeight(),
    getVisiblePetRectFromBounds: () => visibleRect(),
    getVisibleSpriteInsets: () => ({
      left: 0,
      right: Math.max(0, spriteSize() - visibleWidth())
    }),
    getPetSpriteSize: spriteSize,
    getPetWindowPositionForVisibleRect: (visibleLeft, visibleTop) => ({
      x: Math.round(visibleLeft - offsetX()),
      y: Math.round(visibleTop - offsetY())
    }),
    clampPetWindowPositionToSurface: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
    setPetWindowPosition: (x, y) => {
      bounds = { x: Math.round(x), y: Math.round(y), width: windowWidth(), height: windowHeight() };
    },
    syncWalkTrackX: () => {},
    markManualTaskbarHold: () => {},
    preserveBottomAnchorForState: () => {},
    resetWalkRuntime: () => {},
    startWalkLoop: () => {},
    clearTabbySleepPoseTimer: () => {},
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
    recordUserOperation: () => {},
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
    ONE_SHOT_STATES: new Set(),
    states
  });

  controller.moveToStartPosition({ shouldRecordOperation: false, forceTaskbar: true });
  const defaultAnchor = visibleRect();

  setScale(0.75);
  controller.moveToStartPosition({ shouldRecordOperation: false, forceTaskbar: true });
  const smallAnchor = visibleRect();

  setScale(1.6);
  controller.moveToStartPosition({ shouldRecordOperation: false, forceTaskbar: true });
  const largeAnchor = visibleRect();

  assert.equal(defaultAnchor.x + defaultAnchor.width, homeVisibleRight);
  assert.equal(defaultAnchor.y + defaultAnchor.height, currentSurface.groundY);
  assert.equal(smallAnchor.x + smallAnchor.width, defaultAnchor.x + defaultAnchor.width);
  assert.equal(smallAnchor.y + smallAnchor.height, defaultAnchor.y + defaultAnchor.height);
  assert.equal(largeAnchor.x + largeAnchor.width, defaultAnchor.x + defaultAnchor.width);
  assert.equal(largeAnchor.y + largeAnchor.height, defaultAnchor.y + defaultAnchor.height);
});

test("setPetScale keeps the visible bottom on the surface through repeated scale changes", () => {
  let bounds = { x: 120, y: 0, width: 180, height: 180 };
  let currentSurface = {
    type: "taskbar",
    left: 0,
    right: 1200,
    groundY: 760,
    workArea: { x: 0, y: 0, width: 1200, height: 760 }
  };
  let controller = null;
  let setBoundsCalls = 0;
  let setPositionCalls = 0;

  function scaleValue() {
    return controller.getPetScale();
  }

  function windowWidth() {
    return Math.round(180 * scaleValue());
  }

  function windowHeight() {
    return Math.round(180 * scaleValue());
  }

  function spriteSize() {
    return Math.round(128 * scaleValue());
  }

  function spriteOffsetX(width = windowWidth()) {
    return Math.max(0, Math.round((width - spriteSize()) / 2));
  }

  function visibleRectFromBounds(nextBounds) {
    const scale = scaleValue();
    const offsetX = spriteOffsetX(nextBounds.width) + Math.round(8 * scale);
    const offsetY = Math.round(18 * scale);
    return {
      x: Math.round(nextBounds.x + offsetX),
      y: Math.round(nextBounds.y + offsetY),
      width: Math.max(1, Math.round(70 * scale)),
      height: Math.max(1, Math.round(94 * scale))
    };
  }

  function groundedWindowYForSurface(surface) {
    const probe = { x: bounds.x, y: 0, width: windowWidth(), height: windowHeight() };
    const visible = visibleRectFromBounds(probe);
    return Math.round(surface.groundY - (visible.y + visible.height - probe.y));
  }

  function windowXForVisibleCenter(centerX) {
    const probe = { x: 0, y: 0, width: windowWidth(), height: windowHeight() };
    const visible = visibleRectFromBounds(probe);
    return Math.round(centerX - (visible.x - probe.x) - visible.width / 2);
  }

  controller = createSurfaceScaleController({
    clampPetScale: (value) => Math.round(Math.min(Math.max(Number(value) || 1, 0.75), 1.6) * 100) / 100,
    getPetWindowWidth: windowWidth,
    getPetWindowHeight: windowHeight,
    getPetSpriteSize: spriteSize,
    getSpriteLocalXForWindowWidth: spriteOffsetX,
    getSurfaceWorkArea: () => currentSurface.workArea,
    getVisibleSpriteInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
    getGroundedWindowYForSurface: groundedWindowYForSurface,
    clampPetWindowPositionToSurface: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
    getTaskbarWalkCenterLimits: () => ({ left: 0, right: 1200 }),
    ensureTaskbarWalkRunwayForCenter: () => null,
    isTaskbarWalkActive: () => false,
    clearPetWindowHitRegion: () => {},
    getWalkVisibleCenterFromWindowX: (x) => x,
    getTaskbarWalkRunwayWindowWidth: () => 1200,
    setPetWindowPosition: (x, y) => {
      setPositionCalls += 1;
      bounds = { x: Math.round(x), y: Math.round(y), width: windowWidth(), height: windowHeight() };
    },
    syncWalkTrackX: () => {},
    updatePetWindowMousePassthrough: () => {},
    scheduleWalkLoopTimeout: () => {},
    resetToTaskbarSurface: () => currentSurface,
    setCurrentSurface: (surface) => {
      currentSurface = surface;
      return currentSurface;
    },
    getCurrentSurface: () => currentSurface,
    getVisiblePetRectFromBounds: visibleRectFromBounds,
    getWindowXForVisibleCenter: windowXForVisibleCenter,
    setWalkWindowPosition: () => null,
    setTaskbarWalkWindowPositionForCenter: () => null,
    isWalkingState: () => false,
    refreshMenuAnchorAfterScale: () => {},
    refreshHoverAnchorAfterScale: () => {},
    refreshCustomizationAnchorAfterScale: () => {},
    repositionStartupBubbleWindow: () => {},
    sendScaleChanged: () => {},
    preferencesStore: {
      readPetScalePreference: () => {},
      getPetScale: () => 1,
      getPreferredPetScale: () => 1,
      setPreferredPetScale: () => {},
      writePetScalePreference: () => {}
    },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ ...bounds }),
      setBounds: (nextBounds) => {
        setBoundsCalls += 1;
        bounds = { ...bounds, ...nextBounds };
      }
    }),
    getActiveState: () => "petSquat",
    getWalkDirection: () => -1,
    getTaskbarWalkRunway: () => null,
    setTaskbarWalkRunway: () => {},
    getWalkTrackX: () => null,
    setWalkTrackX: () => {},
    log: () => {},
    DEFAULT_PET_SCALE: 1,
    PET_SCALE_MIN: 0.75,
    PET_SCALE_MAX: 1.6,
    PET_SCALE_STEP: 0.08,
    VISIBLE_TOP_GAP: 0,
    WINDOW_DOCK_DEBUG: false,
    WINDOW_DOCK_COARSE_CORRECTION_LIMIT: 28,
    WINDOW_DOCK_FINE_CORRECTION_LIMIT: 2
  });

  controller.groundPetToSurface("petSquat", -1, currentSurface);
  assert.equal(visibleRectFromBounds(bounds).y + visibleRectFromBounds(bounds).height, currentSurface.groundY);

  for (const nextScale of [0.92, 1.08, 1.16, 0.84, 0.75, 1.24]) {
    setBoundsCalls = 0;
    setPositionCalls = 0;
    controller.setPetScale(nextScale);
    const visible = visibleRectFromBounds(bounds);
    assert.equal(visible.y + visible.height, currentSurface.groundY, `scale ${nextScale} should stay grounded`);
    assert.equal(setBoundsCalls, 1, `scale ${nextScale} should resize once`);
    assert.equal(setPositionCalls, 0, `scale ${nextScale} should not repeat an already-grounded position commit`);
  }
});

test("setPetScale preserves the window-surface walk visual center then syncs the real X track", () => {
  for (const direction of [-1, 1]) {
    let bounds = { x: 260, y: 0, width: 180, height: 180 };
    let currentSurface = {
      type: "window",
      left: 0,
      right: 1000,
      groundY: 700,
      workArea: { x: 0, y: 0, width: 1000, height: 900 }
    };
    let walkTrackX = 360;
    let taskbarRunway = null;
    let controller = null;
    const walkPositionCalls = [];
    const syncCalls = [];

    function scaleValue() {
      return controller.getPetScale();
    }

    function windowWidth() {
      return Math.round(180 * scaleValue());
    }

    function windowHeight() {
      return Math.round(180 * scaleValue());
    }

    function spriteSize() {
      return Math.round(128 * scaleValue());
    }

    function spriteOffsetX(width = windowWidth()) {
      return Math.max(0, Math.round((width - spriteSize()) / 2));
    }

    function visibleRectFromBounds(nextBounds, _stateId = "petWalk", nextDirection = direction) {
      const scale = scaleValue();
      const directionOffset = nextDirection < 0 ? 30 : 10;
      return {
        x: Math.round(nextBounds.x + spriteOffsetX(nextBounds.width) + directionOffset * scale),
        y: Math.round(nextBounds.y + 20 * scale),
        width: Math.max(1, Math.round(50 * scale)),
        height: Math.max(1, Math.round(90 * scale))
      };
    }

    function windowXForVisibleCenter(centerX, _stateId = "petWalk", nextDirection = direction) {
      const probe = { x: 0, y: 0, width: windowWidth(), height: windowHeight() };
      const visible = visibleRectFromBounds(probe, "petWalk", nextDirection);
      return Math.round(centerX - (visible.x - probe.x) - visible.width / 2);
    }

    function groundedWindowYForSurface(surface, stateId = "petWalk", nextDirection = direction) {
      const probe = { x: bounds.x, y: 0, width: windowWidth(), height: windowHeight() };
      const visible = visibleRectFromBounds(probe, stateId, nextDirection);
      return Math.round(surface.groundY - (visible.y + visible.height));
    }

    controller = createSurfaceScaleController({
      clampPetScale: (value) => Math.round(Math.min(Math.max(Number(value) || 1, 0.75), 1.6) * 100) / 100,
      getPetWindowWidth: windowWidth,
      getPetWindowHeight: windowHeight,
      getPetSpriteSize: spriteSize,
      getSpriteLocalXForWindowWidth: spriteOffsetX,
      getSurfaceWorkArea: () => currentSurface.workArea,
      getVisibleSpriteInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
      getGroundedWindowYForSurface: groundedWindowYForSurface,
      clampPetWindowPositionToSurface: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
      getTaskbarWalkCenterLimits: () => ({ left: 0, right: 1000 }),
      ensureTaskbarWalkRunwayForCenter: () => null,
      isTaskbarWalkActive: () => false,
      clearPetWindowHitRegion: () => {},
      getWalkVisibleCenterFromWindowX: (x) => x,
      getTaskbarWalkRunwayWindowWidth: () => 1000,
      setPetWindowPosition: (x, y) => {
        bounds = { x: Math.round(x), y: Math.round(y), width: windowWidth(), height: windowHeight() };
      },
      syncWalkTrackX: (x) => {
        const nextX = Number.isFinite(x) ? Math.round(x) : bounds.x;
        syncCalls.push(nextX);
        walkTrackX = nextX;
      },
      updatePetWindowMousePassthrough: () => {},
      scheduleWalkLoopTimeout: () => {},
      resetToTaskbarSurface: () => currentSurface,
      setCurrentSurface: (surface) => {
        currentSurface = surface;
        return currentSurface;
      },
      getCurrentSurface: () => currentSurface,
      getVisiblePetRectFromBounds: visibleRectFromBounds,
      getWindowXForVisibleCenter: windowXForVisibleCenter,
      setWalkWindowPosition: (x, y, _surface, nextDirection) => {
        walkPositionCalls.push({
          x: Math.round(x),
          y: Math.round(y),
          direction: nextDirection
        });
        walkTrackX = Math.round(x);
        bounds = { x: Math.round(x), y: Math.round(y), width: windowWidth(), height: windowHeight() };
        return bounds.x;
      },
      setTaskbarWalkWindowPositionForCenter: () => null,
      isWalkingState: () => true,
      refreshMenuAnchorAfterScale: () => {},
      refreshHoverAnchorAfterScale: () => {},
      refreshCustomizationAnchorAfterScale: () => {},
      repositionStartupBubbleWindow: () => {},
      sendScaleChanged: () => {},
      preferencesStore: {
        readPetScalePreference: () => {},
        getPetScale: () => 1,
        getPreferredPetScale: () => 1,
        setPreferredPetScale: () => {},
        writePetScalePreference: () => {}
      },
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ ...bounds }),
        setBounds: (nextBounds) => {
          bounds = { ...bounds, ...nextBounds };
        }
      }),
      getActiveState: () => "petWalk",
      getWalkDirection: () => direction,
      getTaskbarWalkRunway: () => taskbarRunway,
      setTaskbarWalkRunway: (value) => { taskbarRunway = value; },
      getWalkTrackX: () => walkTrackX,
      setWalkTrackX: (value) => { walkTrackX = value; },
      log: () => {},
      DEFAULT_PET_SCALE: 1,
      PET_SCALE_MIN: 0.75,
      PET_SCALE_MAX: 1.6,
      PET_SCALE_STEP: 0.08,
      VISIBLE_TOP_GAP: 0,
      WINDOW_DOCK_DEBUG: false,
      WINDOW_DOCK_COARSE_CORRECTION_LIMIT: 28,
      WINDOW_DOCK_FINE_CORRECTION_LIMIT: 2
    });

    const beforeScaleVisible = visibleRectFromBounds(bounds);
    const beforeScaleCenter = Math.round(beforeScaleVisible.x + beforeScaleVisible.width / 2);

    controller.setPetScale(1.24);

    const visible = visibleRectFromBounds(bounds);
    assert.equal(Math.round(visible.x + visible.width / 2), beforeScaleCenter);
    assert.equal(walkTrackX, bounds.x);
    assert.equal(walkPositionCalls.length, 0);
    assert.equal(syncCalls.length >= 1, true);
    assert.equal(syncCalls.at(-1), bounds.x);

    walkPositionCalls.length = 0;
    syncCalls.length = 0;
    walkTrackX = 420;
    taskbarRunway = { centerX: 999 };
    bounds = { x: -198, y: 500, width: 900, height: 260 };
    const beforeApplyVisible = visibleRectFromBounds(bounds);
    const beforeApplyCenter = Math.round(beforeApplyVisible.x + beforeApplyVisible.width / 2);

    controller.applySurfaceScale(currentSurface, "petWalk", direction);

    const resizedVisible = visibleRectFromBounds(bounds);
    assert.equal(Math.round(resizedVisible.x + resizedVisible.width / 2), beforeApplyCenter);
    assert.equal(walkTrackX, bounds.x);
    assert.equal(taskbarRunway, null);
    assert.equal(walkPositionCalls.length, 0);
    assert.equal(syncCalls.length, 1);
    assert.equal(syncCalls[0], bounds.x);
  }
});

test("groundPetToSurface does not schedule fine correction while window-surface walking", () => {
  let bounds = { x: 100, y: 200, width: 180, height: 180 };
  let currentSurface = {
    type: "window",
    left: 80,
    right: 420,
    groundY: 320,
    workArea: { x: 0, y: 0, width: 800, height: 600 }
  };
  let walkTrackX = null;
  let immediateCalls = 0;
  const syncCalls = [];
  const originalSetImmediate = global.setImmediate;

  function visibleRectFromBounds(nextBounds) {
    return {
      x: Math.round(nextBounds.x + 20),
      y: Math.round(nextBounds.y + 30),
      width: 80,
      height: 90
    };
  }

  global.setImmediate = (callback, ...args) => {
    immediateCalls += 1;
    return originalSetImmediate(callback, ...args);
  };

  try {
    const controller = createSurfaceScaleController({
      clampPetScale: (value) => Math.round(Math.min(Math.max(Number(value) || 1, 0.75), 1.6) * 100) / 100,
      getPetWindowWidth: () => 180,
      getPetWindowHeight: () => 180,
      getPetSpriteSize: () => 128,
      getSpriteLocalXForWindowWidth: () => 26,
      getSurfaceWorkArea: () => currentSurface.workArea,
      getVisibleSpriteInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
      getGroundedWindowYForSurface: () => 200,
      clampPetWindowPositionToSurface: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
      getTaskbarWalkCenterLimits: () => ({ left: 0, right: 800 }),
      ensureTaskbarWalkRunwayForCenter: () => null,
      isTaskbarWalkActive: () => false,
      clearPetWindowHitRegion: () => {},
      getWalkVisibleCenterFromWindowX: (x) => x,
      getTaskbarWalkRunwayWindowWidth: () => 800,
      setPetWindowPosition: (x, y) => {
        bounds = { ...bounds, x: Math.round(x), y: Math.round(y) };
      },
      syncWalkTrackX: (x) => {
        syncCalls.push(x);
        if (Number.isFinite(x)) {
          walkTrackX = Math.round(x);
        }
      },
      updatePetWindowMousePassthrough: () => {},
      scheduleWalkLoopTimeout: () => {},
      resetToTaskbarSurface: () => currentSurface,
      setCurrentSurface: (surface) => {
        currentSurface = surface;
        return currentSurface;
      },
      getCurrentSurface: () => currentSurface,
      getVisiblePetRectFromBounds: visibleRectFromBounds,
      getWindowXForVisibleCenter: (centerX) => Math.round(centerX - 60),
      setWalkWindowPosition: (x, y) => {
        bounds = { ...bounds, x: Math.round(x), y: Math.round(y) };
        walkTrackX = Math.round(x);
        return bounds.x;
      },
      setTaskbarWalkWindowPositionForCenter: () => null,
      isWalkingState: () => true,
      refreshMenuAnchorAfterScale: () => {},
      refreshHoverAnchorAfterScale: () => {},
      refreshCustomizationAnchorAfterScale: () => {},
      repositionStartupBubbleWindow: () => {},
      sendScaleChanged: () => {},
      preferencesStore: {
        readPetScalePreference: () => {},
        getPetScale: () => 1,
        getPreferredPetScale: () => 1,
        setPreferredPetScale: () => {},
        writePetScalePreference: () => {}
      },
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ ...bounds }),
        setBounds: (nextBounds) => {
          bounds = { ...bounds, ...nextBounds };
        }
      }),
      getActiveState: () => "petWalk",
      getWalkDirection: () => 1,
      getTaskbarWalkRunway: () => null,
      setTaskbarWalkRunway: () => {},
      getWalkTrackX: () => walkTrackX,
      setWalkTrackX: (value) => { walkTrackX = value; },
      log: () => {},
      DEFAULT_PET_SCALE: 1,
      PET_SCALE_MIN: 0.75,
      PET_SCALE_MAX: 1.6,
      PET_SCALE_STEP: 0.08,
      VISIBLE_TOP_GAP: 0,
      WINDOW_DOCK_DEBUG: false,
      WINDOW_DOCK_COARSE_CORRECTION_LIMIT: 28,
      WINDOW_DOCK_FINE_CORRECTION_LIMIT: 2
    });

    controller.groundPetToSurface("petWalk", 1, currentSurface);

    assert.equal(immediateCalls, 0);
    assert.deepEqual(syncCalls, [100]);
    assert.equal(walkTrackX, 100);
  } finally {
    global.setImmediate = originalSetImmediate;
  }
});

test("groundPetToSurface preserves the current window walk X track when bounds lag behind", () => {
  let bounds = { x: 216, y: 200, width: 180, height: 180 };
  let currentSurface = {
    type: "window",
    left: 80,
    right: 520,
    groundY: 320,
    workArea: { x: 0, y: 0, width: 800, height: 600 }
  };
  let walkTrackX = 220;
  const positionCalls = [];
  const syncCalls = [];

  function visibleRectFromBounds(nextBounds) {
    return {
      x: Math.round(nextBounds.x + 20),
      y: Math.round(nextBounds.y + 30),
      width: 80,
      height: 90
    };
  }

  const controller = createSurfaceScaleController({
    clampPetScale: (value) => Math.round(Math.min(Math.max(Number(value) || 1, 0.75), 1.6) * 100) / 100,
    getPetWindowWidth: () => 180,
    getPetWindowHeight: () => 180,
    getPetSpriteSize: () => 128,
    getSpriteLocalXForWindowWidth: () => 26,
    getSurfaceWorkArea: () => currentSurface.workArea,
    getVisibleSpriteInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
    getGroundedWindowYForSurface: () => 200,
    clampPetWindowPositionToSurface: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
    getTaskbarWalkCenterLimits: () => ({ left: 0, right: 800 }),
    ensureTaskbarWalkRunwayForCenter: () => null,
    isTaskbarWalkActive: () => false,
    clearPetWindowHitRegion: () => {},
    getWalkVisibleCenterFromWindowX: (x) => x,
    getTaskbarWalkRunwayWindowWidth: () => 800,
    setPetWindowPosition: (x, y) => {
      positionCalls.push({ x: Math.round(x), y: Math.round(y) });
      bounds = { ...bounds, x: Math.round(x), y: Math.round(y) };
    },
    syncWalkTrackX: (x) => {
      syncCalls.push(Math.round(x));
      walkTrackX = Math.round(x);
    },
    updatePetWindowMousePassthrough: () => {},
    scheduleWalkLoopTimeout: () => {},
    resetToTaskbarSurface: () => currentSurface,
    setCurrentSurface: (surface) => {
      currentSurface = surface;
      return currentSurface;
    },
    getCurrentSurface: () => currentSurface,
    getVisiblePetRectFromBounds: visibleRectFromBounds,
    getWindowXForVisibleCenter: (centerX) => Math.round(centerX - 60),
    setWalkWindowPosition: (x, y) => {
      bounds = { ...bounds, x: Math.round(x), y: Math.round(y) };
      walkTrackX = Math.round(x);
      return bounds.x;
    },
    setTaskbarWalkWindowPositionForCenter: () => null,
    isWalkingState: () => true,
    refreshMenuAnchorAfterScale: () => {},
    refreshHoverAnchorAfterScale: () => {},
    refreshCustomizationAnchorAfterScale: () => {},
    repositionStartupBubbleWindow: () => {},
    sendScaleChanged: () => {},
    preferencesStore: {
      readPetScalePreference: () => {},
      getPetScale: () => 1,
      getPreferredPetScale: () => 1,
      setPreferredPetScale: () => {},
      writePetScalePreference: () => {}
    },
    getPetWindow: () => ({
      isDestroyed: () => false,
      getBounds: () => ({ ...bounds }),
      setBounds: (nextBounds) => {
        bounds = { ...bounds, ...nextBounds };
      }
    }),
    getActiveState: () => "petWalk",
    getWalkDirection: () => -1,
    getTaskbarWalkRunway: () => null,
    setTaskbarWalkRunway: () => {},
    getWalkTrackX: () => walkTrackX,
    setWalkTrackX: (value) => { walkTrackX = value; },
    log: () => {},
    DEFAULT_PET_SCALE: 1,
    PET_SCALE_MIN: 0.75,
    PET_SCALE_MAX: 1.6,
    PET_SCALE_STEP: 0.08,
    VISIBLE_TOP_GAP: 0,
    WINDOW_DOCK_DEBUG: false,
    WINDOW_DOCK_COARSE_CORRECTION_LIMIT: 28,
    WINDOW_DOCK_FINE_CORRECTION_LIMIT: 2
  });

  controller.groundPetToSurface("petWalk", -1, currentSurface);

  assert.deepEqual(positionCalls, [{ x: 220, y: 200 }]);
  assert.deepEqual(syncCalls, [220]);
  assert.equal(bounds.x, 220);
  assert.equal(walkTrackX, 220);
});

test("applySurfaceScale preserves the current window walk X track while correcting stale bounds size", () => {
  for (const direction of [-1, 1]) {
    let bounds = { x: 216, y: 200, width: 181, height: 179 };
    let currentSurface = {
      type: "window",
      left: 80,
      right: 520,
      groundY: 320,
      workArea: { x: 0, y: 0, width: 800, height: 600 }
    };
    let walkTrackX = 220;
    let taskbarRunway = null;
    const setBoundsCalls = [];
    const syncCalls = [];

    function visibleRectFromBounds(nextBounds) {
      return {
        x: Math.round(nextBounds.x + (direction < 0 ? 20 : 36)),
        y: Math.round(nextBounds.y + 30),
        width: 80,
        height: 90
      };
    }

    const controller = createSurfaceScaleController({
      clampPetScale: (value) => Math.round(Math.min(Math.max(Number(value) || 1, 0.75), 1.6) * 100) / 100,
      getPetWindowWidth: () => 180,
      getPetWindowHeight: () => 180,
      getPetSpriteSize: () => 128,
      getSpriteLocalXForWindowWidth: () => 26,
      getSurfaceWorkArea: () => currentSurface.workArea,
      getVisibleSpriteInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }),
      getGroundedWindowYForSurface: () => 200,
      clampPetWindowPositionToSurface: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
      getTaskbarWalkCenterLimits: () => ({ left: 0, right: 800 }),
      ensureTaskbarWalkRunwayForCenter: () => null,
      isTaskbarWalkActive: () => false,
      clearPetWindowHitRegion: () => {},
      getWalkVisibleCenterFromWindowX: (x) => x,
      getTaskbarWalkRunwayWindowWidth: () => 800,
      setPetWindowPosition: (x, y) => {
        bounds = { ...bounds, x: Math.round(x), y: Math.round(y) };
      },
      syncWalkTrackX: (x) => {
        syncCalls.push(Math.round(x));
        walkTrackX = Math.round(x);
      },
      updatePetWindowMousePassthrough: () => {},
      scheduleWalkLoopTimeout: () => {},
      resetToTaskbarSurface: () => currentSurface,
      setCurrentSurface: (surface) => {
        currentSurface = surface;
        return currentSurface;
      },
      getCurrentSurface: () => currentSurface,
      getVisiblePetRectFromBounds: visibleRectFromBounds,
      getWindowXForVisibleCenter: (centerX) => Math.round(centerX - (direction < 0 ? 60 : 76)),
      setWalkWindowPosition: (x, y) => {
        bounds = { ...bounds, x: Math.round(x), y: Math.round(y) };
        walkTrackX = Math.round(x);
        return bounds.x;
      },
      setTaskbarWalkWindowPositionForCenter: () => null,
      isWalkingState: () => true,
      refreshMenuAnchorAfterScale: () => {},
      refreshHoverAnchorAfterScale: () => {},
      refreshCustomizationAnchorAfterScale: () => {},
      repositionStartupBubbleWindow: () => {},
      sendScaleChanged: () => {},
      preferencesStore: {
        readPetScalePreference: () => {},
        getPetScale: () => 1,
        getPreferredPetScale: () => 1,
        setPreferredPetScale: () => {},
        writePetScalePreference: () => {}
      },
      getPetWindow: () => ({
        isDestroyed: () => false,
        getBounds: () => ({ ...bounds }),
        setBounds: (nextBounds) => {
          setBoundsCalls.push({ ...nextBounds });
          bounds = { ...bounds, ...nextBounds };
        }
      }),
      getActiveState: () => "petWalk",
      getWalkDirection: () => direction,
      getTaskbarWalkRunway: () => taskbarRunway,
      setTaskbarWalkRunway: (value) => { taskbarRunway = value; },
      getWalkTrackX: () => walkTrackX,
      setWalkTrackX: (value) => { walkTrackX = value; },
      log: () => {},
      DEFAULT_PET_SCALE: 1,
      PET_SCALE_MIN: 0.75,
      PET_SCALE_MAX: 1.6,
      PET_SCALE_STEP: 0.08,
      VISIBLE_TOP_GAP: 0,
      WINDOW_DOCK_DEBUG: false,
      WINDOW_DOCK_COARSE_CORRECTION_LIMIT: 28,
      WINDOW_DOCK_FINE_CORRECTION_LIMIT: 2
    });

    controller.applySurfaceScale(currentSurface, "petWalk", direction);

    assert.deepEqual(setBoundsCalls, [{ x: 220, y: 200, width: 180, height: 180 }]);
    assert.deepEqual(syncCalls, [220]);
    assert.equal(bounds.x, 220);
    assert.equal(bounds.width, 180);
    assert.equal(bounds.height, 180);
    assert.equal(walkTrackX, 220);
  }
});
