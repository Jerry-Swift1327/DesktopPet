const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isLikelyDesktopOrSystemWindow
} = require("../electron/window-surface-filter.cjs");

const workArea = { x: 0, y: 0, width: 1920, height: 1040 };
const normalRect = { left: 200, top: 160, right: 1000, bottom: 800 };

test("filters explorer tray overflow windows", () => {
  assert.equal(isLikelyDesktopOrSystemWindow({
    processName: "explorer",
    className: "NotifyIconOverflowWindow",
    title: "Notification Overflow"
  }, normalRect, workArea), true);

  assert.equal(isLikelyDesktopOrSystemWindow({
    processName: "explorer.exe",
    className: "TopLevelWindowForOverflowXamlIsland",
    title: ""
  }, normalRect, workArea), true);
});

test("keeps normal explorer windows dockable", () => {
  assert.equal(isLikelyDesktopOrSystemWindow({
    processName: "explorer",
    className: "CabinetWClass",
    title: "Downloads"
  }, normalRect, workArea), false);
});
