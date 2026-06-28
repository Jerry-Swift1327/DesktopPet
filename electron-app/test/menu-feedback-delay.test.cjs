const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const menuSource = fs.readFileSync(path.join(__dirname, "..", "static", "renderer", "menu-window.js"), "utf8");

function extractCommandBlock(command) {
  const marker = `if (target.dataset.command === "${command}") {`;
  const start = menuSource.indexOf(marker);
  assert.ok(start >= 0, `应存在 ${command} 点击分支`);
  const nextBranch = menuSource.indexOf("\n    if (target.dataset.command", start + marker.length);
  return menuSource.slice(start, nextBranch > start ? nextBranch : undefined);
}

test("quick menu toggle feedback closes after the shared 200ms delay", () => {
  assert.match(menuSource, /const MENU_FEEDBACK_HIDE_DELAY_MS = 200;/);
  assert.match(menuSource, /function hideMenuAfterFeedback\(\) \{[\s\S]*window\.desktopPet\.hideMenu\(\), MENU_FEEDBACK_HIDE_DELAY_MS\);[\s\S]*\}/);
  assert.doesNotMatch(menuSource, /setTimeout\([\s\S]*,\s*1000\)/);
  assert.doesNotMatch(menuSource, /},\s*1000\)/);
});

test("window roam and eye tracking call IPC immediately before menu hide delay completes", () => {
  for (const [command, ipcCall] of [
    ["window-roam", "setWindowRoam"],
    ["eye-tracking", "setEyeTracking"],
    ["auto-start", "setAutoStart"]
  ]) {
    const block = extractCommandBlock(command);
    assert.match(block, /update[A-Za-z]+State\(\);/);
    assert.match(block, /hideMenuAfterFeedback\(\);/);
    assert.match(block, new RegExp(`window\\.desktopPet\\.${ipcCall}\\(nextEnabled\\)`));
    assert.ok(
      block.indexOf("hideMenuAfterFeedback();") < block.indexOf(`window.desktopPet.${ipcCall}(nextEnabled)`),
      `${command} 应先显示本地反馈并安排隐藏，再立即发起 IPC`
    );
  }
});

test("switch pet variant feedback uses the same short delay", () => {
  const block = menuSource.match(/if \(target\.dataset\.variant\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  assert.match(block, /MENU_FEEDBACK_HIDE_DELAY_MS/);
  assert.doesNotMatch(block, /1000/);
});
