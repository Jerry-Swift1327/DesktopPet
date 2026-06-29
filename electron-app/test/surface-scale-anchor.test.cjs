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
    markManualTaskbarSettleUntil: () => {},
    completePendingManualTaskbarSettle: () => {},
    WINDOW_ROAM_MANUAL_TASKBAR_SUPPRESS_MS: 2000,
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
