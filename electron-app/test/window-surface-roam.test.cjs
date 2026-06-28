const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "window-roam-controller.cjs"), "utf8");
const dockControllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "dock-controller.cjs"), "utf8");
const { createWindowRoamController } = require("../electron/behavior/window-roam-controller.cjs");

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
    groundPetToSurface: () => {},
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
    WINDOW_ROAM_POLL_INTERVAL_MS: 250,
    WINDOW_ROAM_ATTACH_BLEND_MS: 150
  };
  return {
    controller: createWindowRoamController(context),
    calls,
    getCurrentSurface: () => currentSurface
  };
}

test("window roam keeps the current window target when enabled from a window surface", () => {
  assert.match(mainSource, /const \{ createWindowRoamController \} = require\("\.\/behavior\/window-roam-controller\.cjs"\);/);

  // controller 核心逻辑（函数缩进 2 空格，闭合 2 空格 + }）
  const tickBody = controllerSource.match(/function tickWindowRoam\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  const prepareBody = controllerSource.match(/function prepareWindowRoamAfterPreferenceEnabled\(currentSurface\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  const resetBody = controllerSource.match(/function resetWindowRoamState\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  const rememberBody = controllerSource.match(/function rememberDockedWindowRoamTarget\(surface\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  const suppressPrevBody = controllerSource.match(/function suppressPreviousWindowAfterDockMiss\(previousWindowId\) \{([\s\S]*?)\n  \}/)?.[1] || "";
  const setDragBody = controllerSource.match(/function setDragFallbackSuppressionUntil\(timestamp\) \{([\s\S]*?)\n  \}/)?.[1] || "";

  // main.cjs 触发链（顶层函数，闭合 } 在行首）
  const setRoamBody = mainSource.match(/function setWindowRoamPreference\(enabled\) \{([\s\S]*?)\n\}/)?.[1] || "";
  // dock-controller 核心逻辑（函数缩进 2 空格，闭合 2 空格 + }）
  const dockBody = dockControllerSource.match(/function dockPetAfterDrag\(\{ retry = false \} = \{\}\) \{([\s\S]*?)\n  function validateCurrentWindowSurface/)?.[1] || "";

  // controller: tickWindowRoam 拖拽回退抑制 + 新目标选择 + 同窗附着
  assert.match(tickBody, /if \(Date\.now\(\) < windowRoamDragFallbackSuppressedUntil\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(tickBody, /const surface = selectWindowRoamSurface\(\);/);
  assert.match(tickBody, /if \(targetId === windowRoamLastTargetId && getCurrentSurface\(\)\.type === "window"\) \{[\s\S]*setCurrentSurface\(surface\);[\s\S]*groundPetToSurface\(activeState, walkDirection, getCurrentSurface\(\)\);/);
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

  // controller: suppressPreviousWindowAfterDockMiss 贴靠失败后抑制旧窗口
  assert.match(suppressPrevBody, /windowRoamSuppressedWindowId = previousWindowId;/);

  // controller: setDragFallbackSuppressionUntil 设置回退抑制时间戳
  assert.match(setDragBody, /windowRoamDragFallbackSuppressedUntil = timestamp;/);

  // main.cjs: setWindowRoamPreference 调用 controller 方法链
  assert.match(setRoamBody, /resetWindowRoamState\(\);/);
  assert.match(setRoamBody, /prepareWindowRoamAfterPreferenceEnabled\(currentSurface\);/);
  assert.match(setRoamBody, /updateWindowRoamPolling\(\);/);

  // dock-controller: dockPetAfterDrag 成功/失败分支调用 controller 方法
  assert.match(dockBody, /rememberDockedWindowRoamTarget\(nextSurface\);[\s\S]*clearWindowRoamSuppression\(\);/);
  assert.match(dockBody, /suppressPreviousWindowAfterDockMiss\(previousWindowId\);[\s\S]*setDragFallbackSuppressionUntil\(Date\.now\(\) \+ WINDOW_ROAM_DRAG_FALLBACK_SUPPRESS_MS\);/);
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

test("window roam polling forces a candidate refresh and runs one immediate tick", () => {
  const targetWindow = createSurface("b", { left: 900, right: 1300 });
  const { controller, calls, getCurrentSurface } = createRoamHarness({
    candidates: [{ hwnd: "b", surface: targetWindow }]
  });

  controller.startWindowRoamPolling();
  controller.stopWindowRoamPolling();

  assert.deepEqual(calls[0], { type: "refresh", options: { force: true } });
  assert.equal(getCurrentSurface().sourceWindowId, "b");
  assert.ok(calls.some((call) => call.type === "animate"));
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
