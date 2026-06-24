const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const screenMetricsSource = fs.readFileSync(path.join(__dirname, "..", "electron", "platform", "screen-metrics.cjs"), "utf8");

test("taskbar surface fallback avoids reading destroyed pet window bounds", () => {
  // main.cjs 薄包装：移除默认参数，destroyed window guard 委托给控制器
  const mainWrapper = /function getTaskbarSurfaceForBounds\(bounds\) \{\s*return screenMetricsController\.getTaskbarSurfaceForBounds\(bounds\);\s*\}/;
  assert.match(mainSource, mainWrapper, "main.cjs 应为薄包装，委托给 screenMetricsController");

  // 控制器内部保留 destroyed window guard：通过 getPetWindow() 访问器读取，避免快照
  const controllerGuard = /win && !win\.isDestroyed\(\) \? win\.getBounds\(\) : null/;
  assert.match(screenMetricsSource, controllerGuard, "控制器应保留 destroyed window guard");
});
