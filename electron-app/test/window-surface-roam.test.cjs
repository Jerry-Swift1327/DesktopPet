const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "window-roam-controller.cjs"), "utf8");
const dockControllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "dock-controller.cjs"), "utf8");

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

  // controller: tickWindowRoam 拖拽回退抑制 + 优先目标选取 + 同窗附着
  assert.match(tickBody, /if \(Date\.now\(\) < windowRoamDragFallbackSuppressedUntil\) \{[\s\S]*return;[\s\S]*\}/);
  assert.match(tickBody, /const preferredSurface = windowRoamPreferredTargetId[\s\S]*\? getWindowRoamSurfaceById\(windowRoamPreferredTargetId\)[\s\S]*: null;/);
  assert.match(tickBody, /const surface = preferredSurface \|\| getTopWindowRoamSurface\(\);/);
  assert.match(tickBody, /if \(targetId === windowRoamLastTargetId && getCurrentSurface\(\)\.type === "window"\) \{[\s\S]*setCurrentSurface\(surface\);[\s\S]*groundPetToSurface\(activeState, walkDirection, getCurrentSurface\(\)\);/);

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
