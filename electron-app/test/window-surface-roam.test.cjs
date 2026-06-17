const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");

test("window roam keeps the current window target when enabled from a window surface", () => {
  const setRoamBody = mainSource.match(/function setWindowRoamPreference\(enabled\) \{([\s\S]*?)function setEyeTrackingPreference/)?.[1] || "";
  const tickBody = mainSource.match(/function tickWindowRoam\(\) \{([\s\S]*?)function startWindowRoamPolling/)?.[1] || "";

  assert.match(setRoamBody, /if \(windowRoamEnabledCache && currentSurface\?\.type === "window"\) \{[\s\S]*windowRoamPreferredTargetId = parseWindowHwnd\(currentSurface\.sourceWindowId\);[\s\S]*windowRoamLastTargetId = windowRoamPreferredTargetId;/);
  assert.match(tickBody, /const preferredSurface = windowRoamPreferredTargetId[\s\S]*\? getWindowRoamSurfaceById\(windowRoamPreferredTargetId\)[\s\S]*: null;/);
  assert.match(tickBody, /const surface = preferredSurface \|\| getTopWindowRoamSurface\(\);/);
  assert.match(tickBody, /if \(targetId === windowRoamLastTargetId && getCurrentSurface\(\)\.type === "window"\) \{[\s\S]*setCurrentSurface\(surface\);[\s\S]*groundPetToSurface\(activeState, walkDirection, getCurrentSurface\(\)\);/);
});

test("window surface polling falls back when a non-roaming pet is no longer docked", () => {
  const dockedBody = mainSource.match(/function isPetStillDockedOnWindowSurface\(surface = currentSurface\) \{([\s\S]*?)function fallbackCurrentSurfaceToTaskbar/)?.[1] || "";
  const pollingBody = mainSource.match(/function startWindowSurfacePolling\(\) \{([\s\S]*?)function stopWindowSurfacePolling/)?.[1] || "";

  assert.match(dockedBody, /centerX >= surface\.left/);
  assert.match(dockedBody, /centerX <= surface\.right/);
  assert.match(dockedBody, /Math\.abs\(bottomY - surface\.groundY\) <= WINDOW_DOCK_COARSE_CORRECTION_LIMIT/);
  assert.match(pollingBody, /!windowRoamEnabledCache/);
  assert.match(pollingBody, /!validateCurrentWindowSurface\(\{ useCache: false \}\)/);
  assert.match(pollingBody, /!isPetStillDockedOnWindowSurface\(currentSurface\)/);
  assert.match(pollingBody, /fallbackCurrentSurfaceToTaskbar\("window-surface-detached"\);[\s\S]*return;/);
  assert.ok(
    pollingBody.indexOf('fallbackCurrentSurfaceToTaskbar("window-surface-detached")') < pollingBody.indexOf("const now = Date.now();"),
    "detached window fallback should run before the heavy-check throttle can return"
  );
});
