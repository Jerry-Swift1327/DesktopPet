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

function createRoamHarness({ candidates, petBounds = { x: 820, y: 710, width: 120, height: 90 } }) {
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
      calls.push({ type: "setSurface", id: surface.sourceWindowId });
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
    animatePetWindowTo: (x, y, durationMs) => {
      petWindowBounds = { ...petWindowBounds, x, y };
      calls.push({ type: "animate", x, y, durationMs });
    },
    syncWalkTrackX: () => {},
    isWalkingState: () => false,
    refreshWalkLoopAfterSurfaceChange: () => {},
    safeSend: () => {},
    buildScaleSummary: () => ({}),
    getCurrentSurface: () => currentSurface,
    fallbackCurrentSurfaceToTaskbar: () => calls.push({ type: "fallback" }),
    getWindowRoamSurfaceById: (id) => candidates.find((item) => item.hwnd === id)?.surface || null,
    WINDOW_ROAM_MAX_MISSING_TICKS: 2,
    WINDOW_ROAM_POLL_INTERVAL_MS: 450,
    WINDOW_ROAM_START_ATTACH_DELAY_MS: 650,
    WINDOW_ROAM_ATTACH_BLEND_MS: 150
  };
  return {
    controller: createWindowRoamController(context),
    calls,
    getCurrentSurface: () => currentSurface,
    setCurrentSurface: (surface) => { currentSurface = surface; }
  };
}

test("window roam keeps the current window target when enabled from a window surface", () => {
  assert.match(mainSource, /const \{ createWindowRoamController \} = require\("\.\/behavior\/window-roam-controller\.cjs"\);/);

  // controller 核心逻辑（函数缩进 2 空格，闭合 2 空格 + }）
  const tickBody = controllerSource.match(/function tickWindowRoam\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  const prepareBody = controllerSource.match(/function prepareWindowRoamAfterPreferenceEnabled\(currentSurface\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  const resetBody = controllerSource.match(/function resetWindowRoamState\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  const rememberBody = controllerSource.match(/function rememberDockedWindowRoamTarget\(surface\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  const markManualBody = controllerSource.match(/function markManualTaskbarSettleUntil\(timestamp, surface, options = \{\}\) \{([\s\S]*?)\n  \}/)?.[1] || "";

  // main.cjs 触发链（顶层函数，闭合 } 在行首）
  const setRoamBody = mainSource.match(/function setWindowRoamPreference\(enabled\) \{([\s\S]*?)\n\}/)?.[1] || "";
  // dock-controller 核心逻辑（函数缩进 2 空格，闭合 2 空格 + }）
  const dockBody = dockControllerSource.match(/function dockPetAfterDrag\(\{ retry = false \} = \{\}\) \{([\s\S]*?)\n  function validateCurrentWindowSurface/)?.[1] || "";

  // controller: tickWindowRoam 拖拽回退抑制 + 新目标选择 + 同窗附着
  assert.match(tickBody, /if \(Date\.now\(\) < windowRoamDragFallbackSuppressedUntil\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(tickBody, /if \(pendingManualTaskbarSettle\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(tickBody, /const surface = selectWindowRoamSurface\(\);/);
  assert.match(tickBody, /if \(targetId === windowRoamLastTargetId && getCurrentSurface\(\)\.type === "window"\) \{[\s\S]*setCurrentSurface\(surface\);[\s\S]*groundPetToSurface\(activeState, walkDirection, getCurrentSurface\(\)\);/);
  assert.match(controllerSource, /let pendingManualTaskbarSettle = null;/);
  assert.match(controllerSource, /function completePendingManualTaskbarSettle\(state\) \{/);
  assert.match(controllerSource, /function selectWindowRoamSurface\(excludedWindowId = ""\) \{[\s\S]*const currentLockedId = getCurrentSurface\(\)\.type === "window" \? windowRoamLastTargetId : "";[\s\S]*return preferredSurface \|\| lockedSurface \|\| chooseNearestWindowRoamSurface\(entries\);[\s\S]*\}/);
  assert.match(controllerSource, /function chooseNearestWindowRoamSurface\(entries\) \{[\s\S]*getDistanceToWindowSurface\(entry\.surface, petCenter\)[\s\S]*if \(doWindowRectsOverlap\(best\.surface\.bounds, entry\.surface\.bounds\)\) \{[\s\S]*continue;[\s\S]*if \(score < best\.score\)/);
  assert.match(controllerSource, /function doWindowRectsOverlap\(a, b\) \{[\s\S]*Math\.min\(a\.right, b\.right\) > Math\.max\(a\.left, b\.left\)[\s\S]*Math\.min\(a\.bottom, b\.bottom\) > Math\.max\(a\.top, b\.top\)/);

  // controller: prepareWindowRoamAfterPreferenceEnabled 记录当前窗口为优先目标
  assert.match(prepareBody, /windowRoamPreferredTargetId = "";/);
  assert.match(prepareBody, /if \(currentSurface\?\.type === "window"\) \{[\s\S]*windowRoamPreferredTargetId = parseWindowHwnd\(currentSurface\.sourceWindowId\);[\s\S]*windowRoamLastTargetId = windowRoamPreferredTargetId;/);

  // controller: resetWindowRoamState 清空回退抑制
  assert.match(resetBody, /windowRoamDragFallbackSuppressedUntil = 0;/);

  // controller: rememberDockedWindowRoamTarget 贴靠成功后记录目标
  assert.match(rememberBody, /windowRoamLastTargetId = parseWindowHwnd\(surface\.sourceWindowId\);[\s\S]*windowRoamPreferredTargetId = windowRoamLastTargetId;[\s\S]*windowRoamDragFallbackSuppressedUntil = 0;/);

  // controller: markManualTaskbarSettleUntil 设冷却并保留 sticky target（不清空 lastTargetId、不抑制当前窗口）
  assert.match(markManualBody, /windowRoamDragFallbackSuppressedUntil = timestamp;/);
  assert.match(markManualBody, /if \(surface && surface\.type === "window"\) \{[\s\S]*windowRoamPreferredTargetId = parseWindowHwnd\(surface\.sourceWindowId\);/);
  assert.doesNotMatch(markManualBody, /windowRoamSuppressedWindowId/);
  assert.doesNotMatch(markManualBody, /windowRoamLastTargetId = "";/);

  // state-controller: settlePetQuietly 调用手动冷却方法（不抑制、不清空 sticky target）
  assert.match(stateControllerSource, /markManualTaskbarSettleUntil\(Date\.now\(\) \+ WINDOW_ROAM_MANUAL_TASKBAR_SUPPRESS_MS, surface\);/);
  assert.match(stateControllerSource, /completePendingManualTaskbarSettle\(previousState\);/);

  // main.cjs: setWindowRoamPreference 调用 controller 方法链
  assert.match(setRoamBody, /resetWindowRoamState\(\);/);
  assert.match(setRoamBody, /prepareWindowRoamAfterPreferenceEnabled\(currentSurface\);/);
  assert.match(setRoamBody, /updateWindowRoamPolling\(\);/);
  assert.match(mainSource, /completePendingManualTaskbarSettle/);

  // dock-controller: dockPetAfterDrag 成功/失败分支调用 controller 方法
  assert.match(dockBody, /rememberDockedWindowRoamTarget\(nextSurface\);[\s\S]*clearWindowRoamSuppression\(\);/);
  assert.match(dockBody, /deferUntilState:\s*STATE_SHAKE/);
  assert.match(dockBody, /markManualTaskbarSettleUntil\([\s\S]*Date\.now\(\) \+ WINDOW_ROAM_DRAG_FALLBACK_SUPPRESS_MS,[\s\S]*previousSurface,[\s\S]*manualTaskbarSettleOptions/);
  assert.doesNotMatch(dockBody, /suppressPreviousWindowAfterDockMiss/);
});

test("window roam chooses the nearest non-overlapping window and locks the attached target", () => {
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
  assert.deepEqual(
    calls.filter((call) => call.type === "animate").map((call) => call.durationMs),
    [150]
  );

  controller.tickWindowRoam();

  assert.equal(getCurrentSurface().sourceWindowId, "b");
  assert.equal(calls.filter((call) => call.type === "animate").length, 1);
  assert.ok(calls.some((call) => call.type === "setSurface" && call.id === "b"));
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

test("window roam non-walking attach animates directly without pre-grounding", () => {
  const targetWindow = createSurface("b", { left: 900, right: 1300 });
  const { controller, calls } = createRoamHarness({
    candidates: [{ hwnd: "b", surface: targetWindow }]
  });

  controller.attachPetToWindowRoamSurface(targetWindow);

  assert.equal(calls.some((call) => call.type === "animate"), true);
  assert.equal(calls.some((call) => call.type === "ground"), false);
});

test("window roam polling forces a candidate refresh and waits for the start attach delay", () => {
  const targetWindow = createSurface("b", { left: 900, right: 1300 });
  const { controller, calls, getCurrentSurface } = createRoamHarness({
    candidates: [{ hwnd: "b", surface: targetWindow }]
  });
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;

  try {
    controller.startWindowRoamPolling();

    assert.deepEqual(calls[0], { type: "refresh", options: { force: true } });
    assert.equal(getCurrentSurface().type, "taskbar");
    assert.equal(calls.filter((call) => call.type === "animate").length, 0);

    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().type, "taskbar");

    now = 1651;
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().sourceWindowId, "b");
    assert.ok(calls.some((call) => call.type === "animate"));
  } finally {
    controller.stopWindowRoamPolling();
    Date.now = originalNow;
  }
});

test("window surface polling falls back when a non-roaming pet is no longer docked", () => {
  // dock-controller 核心逻辑（函数缩进 2 空格，闭合 2 空格 + }）
  const dockedBody = dockControllerSource.match(/function isPetStillDockedOnWindowSurface\(surface = getCurrentSurface\(\)\) \{([\s\S]*?)\n  function fallbackCurrentSurfaceToTaskbar/)?.[1] || "";
  const pollingBody = dockControllerSource.match(/function startWindowSurfacePolling\(\) \{([\s\S]*?)\n  function stopWindowSurfacePolling/)?.[1] || "";
  const detachedBranch = pollingBody.match(/if \(!getWindowRoamEnabled\(\) && !isPetStillDockedOnWindowSurface\(getCurrentSurface\(\)\)\) \{([\s\S]*?)\n      \}/)?.[1] || "";

  assert.match(dockedBody, /centerX >= surface\.left/);
  assert.match(dockedBody, /centerX <= surface\.right/);
  assert.match(dockedBody, /Math\.abs\(bottomY - surface\.groundY\) <= WINDOW_DOCK_COARSE_CORRECTION_LIMIT/);
  assert.match(pollingBody, /!getWindowRoamEnabled\(\)/);
  assert.match(pollingBody, /!isPetStillDockedOnWindowSurface\(getCurrentSurface\(\)\)/);
  assert.match(pollingBody, /fallbackCurrentSurfaceToTaskbar\("window-surface-detached"\);[\s\S]*return;/);
  assert.doesNotMatch(detachedBranch, /validateCurrentWindowSurface/);
  assert.ok(
    pollingBody.indexOf('fallbackCurrentSurfaceToTaskbar("window-surface-detached")') < pollingBody.indexOf("const now = Date.now();"),
    "detached window fallback should run before the heavy-check throttle can return"
  );
});

test("window surface invalidation uses replacement transfer or unified fallback path", () => {
  const pollingBody = dockControllerSource.match(/function startWindowSurfacePolling\(\) \{([\s\S]*?)\n  function stopWindowSurfacePolling/)?.[1] || "";
  const invalidBranch = pollingBody.match(/if \(!validateCurrentWindowSurface\(\)\) \{([\s\S]*?)\n        setWindowSurfaceMissingTicks\(0\);/)?.[1] || "";

  assert.match(invalidBranch, /const roamSurface = getWindowRoamEnabled\(\) \? getTopWindowRoamSurface\(invalidWindowId\) : null;/);
  assert.match(invalidBranch, /fallbackCurrentSurfaceToTaskbar\("window-surface-invalidated"\);/);
  assert.match(invalidBranch, /markWindowInvalidTaskbarSettleUntil\(Date\.now\(\) \+ WINDOW_ROAM_INVALID_FALLBACK_SUPPRESS_MS\);/);
  assert.doesNotMatch(invalidBranch, /groundPetToSurface\(getActiveState\(\), getWalkDirection\(\), fallback\);/);
});

test("window fallback to taskbar aligns the walking pet visible bottom to taskbar ground", () => {
  let currentSurface = createSurface("window-a", { left: 300, right: 700, groundY: 520 });
  let petBounds = { x: 410, y: 380, width: 120, height: 120 };
  const taskbarSurface = { type: "taskbar", left: 0, right: 1200, groundY: 900 };
  const calls = [];
  const visibleWidth = 58;
  const visibleHeight = 82;
  const visibleOffsetX = 11;
  const visibleOffsetY = 24;

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
    getVisiblePetRectFromBounds: (bounds) => ({
      x: Math.round(bounds.x + visibleOffsetX),
      y: Math.round(bounds.y + visibleOffsetY),
      width: visibleWidth,
      height: visibleHeight
    }),
    resetToTaskbarSurface: () => {
      currentSurface = taskbarSurface;
      return taskbarSurface;
    },
    getGroundedWindowYForSurface: (surface) => surface.groundY - visibleOffsetY - visibleHeight,
    getVisibleSpriteInsets: () => ({
      left: visibleOffsetX,
      right: 120 - visibleOffsetX - visibleWidth
    }),
    getPetSpriteSize: () => 120,
    getPetWindowPositionForVisibleRect: (visibleLeft, visibleTop) => ({
      x: Math.round(visibleLeft - visibleOffsetX),
      y: Math.round(visibleTop - visibleOffsetY)
    }),
    getSurfaceVisibleTop: (surface) => surface.groundY - visibleHeight,
    animatePetWindowTo: () => calls.push({ type: "animate" }),
    maybeRefreshWindowSurfaceCandidatesBackground: () => {},
    refreshCurrentWindowSurfaceBoundsFromCache: () => true,
    getTopWindowRoamSurface: () => null,
    attachPetToWindowRoamSurface: () => false,
    logWalkDiagnostic: () => {},
    isInteractionPaused: () => false,
    getInteractionPauseSummary: () => "",
    rememberDockedWindowRoamTarget: () => {},
    clearWindowRoamSuppression: () => {},
    markManualTaskbarSettleUntil: () => {},
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
    WINDOW_SURFACE_FALLBACK_BLEND_MS: 90,
    WINDOW_SURFACE_HEAVY_RECHECK_MS: 500,
    WINDOW_SURFACE_POLL_INTERVAL_MS: 250,
    WINDOW_ROAM_DRAG_FALLBACK_SUPPRESS_MS: 2000,
    WINDOW_ROAM_INVALID_FALLBACK_SUPPRESS_MS: 700
  });

  controller.fallbackCurrentSurfaceToTaskbar("test-window-invalid");

  const visibleRect = {
    x: Math.round(petBounds.x + visibleOffsetX),
    y: Math.round(petBounds.y + visibleOffsetY),
    width: visibleWidth,
    height: visibleHeight
  };
  assert.equal(visibleRect.y + visibleRect.height, taskbarSurface.groundY);
  assert.equal(calls.some((call) => call.type === "animate"), false);
  assert.equal(calls.some((call) => call.type === "refreshWalk"), true);
});

test("manual taskbar settle cooldown preserves sticky target and skips reattach during cooldown", () => {
  const surfaceA = createSurface("a", { left: 80, right: 480 });
  const surfaceB = createSurface("b", { left: 900, right: 1300 });
  const { controller, calls, getCurrentSurface, setCurrentSurface } = createRoamHarness({
    candidates: [
      { hwnd: "a", surface: surfaceA },
      { hwnd: "b", surface: surfaceB }
    ]
  });
  const originalNow = Date.now;
  let now = 5000;
  Date.now = () => now;

  try {
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().sourceWindowId, "b");

    controller.markManualTaskbarSettleUntil(now + 2000, surfaceB);
    setCurrentSurface({ type: "taskbar", groundY: 900, left: 0, right: 1920 });

    now = 5100;
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().type, "taskbar");

    now = 5200;
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().type, "taskbar");

    now = 7001;
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().sourceWindowId, "b");
    assert.ok(!calls.some((call) => call.type === "setSurface" && call.id === "a"));
  } finally {
    Date.now = originalNow;
  }
});

test("window invalid fallback suppression is shorter than manual taskbar settle cooldown", () => {
  const surfaceA = createSurface("a", { left: 80, right: 480 });
  const { controller, getCurrentSurface, setCurrentSurface } = createRoamHarness({
    candidates: [{ hwnd: "a", surface: surfaceA }]
  });
  const originalNow = Date.now;
  let now = 5000;
  Date.now = () => now;

  try {
    assert.equal(typeof controller.markWindowInvalidTaskbarSettleUntil, "function");
    controller.markWindowInvalidTaskbarSettleUntil(now + 700);
    setCurrentSurface({ type: "taskbar", groundY: 900, left: 0, right: 1920 });

    now = 5600;
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().type, "taskbar");

    now = 5701;
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().sourceWindowId, "a");
  } finally {
    Date.now = originalNow;
  }
});

test("deferred manual taskbar settle starts cooldown only after shake completes", () => {
  const surfaceA = createSurface("a", { left: 80, right: 480 });
  const surfaceB = createSurface("b", { left: 900, right: 1300 });
  const { controller, calls, getCurrentSurface, setCurrentSurface } = createRoamHarness({
    candidates: [
      { hwnd: "a", surface: surfaceA },
      { hwnd: "b", surface: surfaceB }
    ]
  });
  const originalNow = Date.now;
  let now = 5000;
  Date.now = () => now;

  try {
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().sourceWindowId, "b");

    controller.markManualTaskbarSettleUntil(now + 2000, surfaceB, { deferUntilState: "petShake" });
    setCurrentSurface({ type: "taskbar", groundY: 900, left: 0, right: 1920 });

    now = 7001;
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().type, "taskbar");

    controller.completePendingManualTaskbarSettle("petShake");

    now = 7002;
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().type, "taskbar");

    now = 9002;
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().sourceWindowId, "b");
    assert.ok(!calls.some((call) => call.type === "setSurface" && call.id === "a"));
  } finally {
    Date.now = originalNow;
  }
});

test("state transition away from shake completes deferred manual taskbar settle", () => {
  let activeState = "petShake";
  let selectedState = activeState;
  let walkDirection = -1;
  const completed = [];
  const states = [
    { id: "petSquat", moving: false },
    { id: "petShake", moving: false }
  ];
  const controller = createStateController({
    sendPetState: () => {},
    sendWalkDirection: () => {},
    groundPetToSurface: () => {},
    applySurfaceScale: () => true,
    resetToTaskbarSurface: () => ({ type: "taskbar" }),
    setCurrentSurface: () => {},
    getCurrentSurface: () => ({ type: "taskbar" }),
    getSurfaceDisplay: () => ({ id: 1 }),
    getSurfaceWorkArea: () => ({ x: 0, y: 0, width: 1000, height: 900 }),
    getTaskbarHomeVisibleRight: () => 900,
    getSurfaceVisibleTop: () => 800,
    getVisibleSpriteInsets: () => ({ left: 0, right: 0 }),
    getPetSpriteSize: () => 100,
    getPetWindowPositionForVisibleRect: (x, y) => ({ x, y }),
    clampPetWindowPositionToSurface: (x, y) => ({ x, y }),
    setPetWindowPosition: () => {},
    syncWalkTrackX: () => {},
    markManualTaskbarSettleUntil: () => {},
    completePendingManualTaskbarSettle: (state) => completed.push(state),
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
    getPetWindow: () => ({ isDestroyed: () => false, getBounds: () => ({ x: 0, y: 0, width: 100, height: 100 }) }),
    DEFAULT_STATE: "petSquat",
    STATE_WALK: "petWalk",
    STATE_SLEEP: "petSleep",
    STATE_YAWN: "petYawn",
    STATE_HISS: "petHiss",
    TABBY_IDLE_STATES: new Set(),
    ONE_SHOT_STATES: new Set(["petShake"]),
    states
  });

  controller.setState("petSquat", false);

  assert.deepEqual(completed, ["petShake"]);
});

test("manual taskbar settle picks another window only when sticky target is unavailable", () => {
  const surfaceA = createSurface("a", { left: 80, right: 480 });
  const surfaceB = createSurface("b", { left: 900, right: 1300 });
  const { controller, getCurrentSurface, setCurrentSurface } = createRoamHarness({
    candidates: [{ hwnd: "a", surface: surfaceA }]
  });
  const originalNow = Date.now;
  let now = 5000;
  Date.now = () => now;

  try {
    controller.markManualTaskbarSettleUntil(now + 2000, surfaceB);
    setCurrentSurface({ type: "taskbar", groundY: 900, left: 0, right: 1920 });

    now = 7001;
    controller.tickWindowRoam();
    assert.equal(getCurrentSurface().sourceWindowId, "a");
  } finally {
    Date.now = originalNow;
  }
});
