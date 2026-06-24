const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const screenMetricsSource = fs.readFileSync(path.join(__dirname, "..", "electron", "platform", "screen-metrics.cjs"), "utf8");

test("taskbar surface fallback avoids reading destroyed pet window bounds", () => {
  const destroyedWindowGuard = /function getTaskbarSurfaceForBounds\(bounds = petWindow && !petWindow\.isDestroyed\(\) \? petWindow\.getBounds\(\) : null\)/;

  assert.match(mainSource, destroyedWindowGuard);
  assert.match(screenMetricsSource, destroyedWindowGuard);
});
