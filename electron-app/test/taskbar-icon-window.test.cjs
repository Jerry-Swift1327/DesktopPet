const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const overlaySource = fs.readFileSync(path.join(__dirname, "..", "electron", "windows", "overlay-window.cjs"), "utf8");
const petWindowSource = fs.readFileSync(path.join(__dirname, "..", "electron", "windows", "pet-window-controller.cjs"), "utf8");
const bubbleSource = fs.readFileSync(path.join(__dirname, "..", "electron", "windows", "bubble-controller.cjs"), "utf8");
const hoverSource = fs.readFileSync(path.join(__dirname, "..", "electron", "windows", "hover-controller.cjs"), "utf8");
const menuSource = fs.readFileSync(path.join(__dirname, "..", "electron", "windows", "menu-controller.cjs"), "utf8");
const customizationSource = fs.readFileSync(path.join(__dirname, "..", "electron", "windows", "customization-controller.cjs"), "utf8");

test("overlay windows stay hidden from the taskbar by default", () => {
  assert.match(overlaySource, /skipTaskbar = true/);
  assert.match(overlaySource, /skipTaskbar:\s*skipTaskbar/);
});

test("only the pet main window opts into the runtime taskbar icon", () => {
  assert.match(petWindowSource, /createOverlayWindow\(\{[\s\S]*hash: "pet"[\s\S]*skipTaskbar: false[\s\S]*movable: true/);
  for (const source of [bubbleSource, hoverSource, menuSource, customizationSource]) {
    assert.doesNotMatch(source, /skipTaskbar:\s*false/);
  }
});
