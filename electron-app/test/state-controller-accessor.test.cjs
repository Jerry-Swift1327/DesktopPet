// state-controller-accessor.test.cjs：state-controller 控制器边界与 main.cjs 薄包装接线护栏
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "state-controller.cjs"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const ipcSource = fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", "register-ipc-handlers.cjs"), "utf8");

// 剥离注释
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const mainStripped = stripComments(mainSource);

test("controller 不直接 require electron 且不注册 IPC", () => {
  assert.doesNotMatch(controllerSource, /require\("electron"/);
  assert.doesNotMatch(controllerSource, /require\("fs"/);
  assert.doesNotMatch(controllerSource, /require\("path"/);
  assert.ok(!controllerSource.includes("ipcMain"), "不应出现 ipcMain");
  assert.ok(!controllerSource.includes("broadcastToWindows"), "不应出现 broadcastToWindows");
  assert.ok(!controllerSource.includes("showBubbleMessage"), "不应出现 showBubbleMessage");
  assert.ok(!controllerSource.includes("petWindow"), "不应出现 petWindow 直接引用");
});

test("controller 导出 createStateController", () => {
  assert.match(controllerSource, /module\.exports = \{\s*createStateController\s*\}/);
});

test("controller 内部声明 pendingActionStatsState", () => {
  assert.match(controllerSource, /let pendingActionStatsState = null;/);
});

test("controller context 解构包含共享运行态访问器", () => {
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";
  const requiredAccessors = [
    "getActiveState",
    "setActiveState",
    "getSelectedState",
    "setSelectedState",
    "getWalkDirection",
    "setWalkDirectionValue"
  ];
  for (const dep of requiredAccessors) {
    assert.match(contextBlock, new RegExp(dep), `context 应包含 ${dep}`);
  }
});

test("controller 导出 7 个方法", () => {
  const matches = [...controllerSource.matchAll(/return \{([\s\S]*?)\};/g)];
  const exportBlock = matches.length > 0 ? matches[matches.length - 1][1] : "";
  const expectedExports = [
    "setState",
    "completeOneShotState",
    "moveToStartPosition",
    "settlePetQuietly",
    "setWalkDirection",
    "isWalkingState",
    "completeVisualStateCommit"
  ];
  for (const name of expectedExports) {
    assert.match(exportBlock, new RegExp(name), `导出应包含 ${name}`);
  }
});

test("controller 不含 dockController/walkController/dragController 直接引用", () => {
  assert.doesNotMatch(controllerSource, /dockController\./);
  assert.doesNotMatch(controllerSource, /walkController\./);
  assert.doesNotMatch(controllerSource, /dragController\./);
});

test("main.cjs 构造 stateController", () => {
  assert.match(mainStripped, /const stateController = createStateController\(\{/);
});

test("main.cjs createStateController context 注入手动任务栏保持而非窗口动画", () => {
  const contextBlock = mainStripped.match(/const stateController = createStateController\(\{([\s\S]*?)\}\);/)?.[1] || "";
  assert.match(contextBlock, /markManualTaskbarHold,/);
  assert.doesNotMatch(contextBlock, /animatePetWindowTransition,/);
});

test("main.cjs 不再声明 pendingActionStatsState", () => {
  assert.doesNotMatch(mainStripped, /let pendingActionStatsState/);
});

test("main.cjs 6 个目标 function 为薄包装委托 stateController", () => {
  const pairs = [
    { name: "setWalkDirection", delegate: "stateController.setWalkDirection" },
    { name: "setState", delegate: "stateController.setState" },
    { name: "completeOneShotState", delegate: "stateController.completeOneShotState" },
    { name: "isWalkingState", delegate: "stateController.isWalkingState" },
    { name: "moveToStartPosition", delegate: "stateController.moveToStartPosition" },
    { name: "settlePetQuietly", delegate: "stateController.settlePetQuietly" }
  ];
  for (const { name, delegate } of pairs) {
    const re = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[^}]*" + delegate.replace(/\./g, "\\.") + "[^}]*\\}");
    assert.match(mainStripped, re, `main.cjs ${name} 应委托 ${delegate}`);
  }
});

test("register-ipc-handlers 的 pet:set-state/pet:complete-one-shot/pet:reset-position/pet:wake-sleeping-pet 契约不变", () => {
  assert.match(ipcSource, /ipcMain\.on\("pet:set-state",\s*handlers\.setState\);/);
  assert.match(ipcSource, /ipcMain\.on\("pet:wake-sleeping-pet",\s*handlers\.wakeSleepingPet\);/);
  assert.match(ipcSource, /ipcMain\.on\("pet:complete-one-shot",\s*handlers\.completeOneShot\);/);
  assert.match(ipcSource, /ipcMain\.on\("pet:reset-position",\s*handlers\.resetPosition\);/);
});

test("main.cjs handlers 映射仍引用 handleSetState/handleCompleteOneShot/handleResetPosition/handleWakeSleepingPet", () => {
  assert.match(mainStripped, /setState:\s*handleSetState\s*,/);
  assert.match(mainStripped, /wakeSleepingPet:\s*handleWakeSleepingPet\s*,/);
  assert.match(mainStripped, /completeOneShot:\s*handleCompleteOneShot\s*,/);
  assert.match(mainStripped, /resetPosition:\s*handleResetPosition\s*,/);
});

test("main.cjs 在 renderer 上报目标帧后完成视觉状态提交", () => {
  const body = mainStripped.match(/function updateRenderedFrame\(info\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(body, /stateController\.completeVisualStateCommit\(info\.state\)/);
});
