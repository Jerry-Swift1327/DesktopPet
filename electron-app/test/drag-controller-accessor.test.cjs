// drag-controller-accessor.test.cjs：drag-controller 控制器边界与 main.cjs 薄包装接线护栏
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "drag-controller.cjs"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const ipcSource = fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", "register-ipc-handlers.cjs"), "utf8");
const dockSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "dock-controller.cjs"), "utf8");

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
});

test("controller 导出 createDragController", () => {
  assert.match(controllerSource, /module\.exports = \{\s*createDragController\s*\}/);
});

test("controller 内部声明 3 个拖拽运行态", () => {
  assert.match(controllerSource, /let dragTimer = null;/);
  assert.match(controllerSource, /let dragState = null;/);
  assert.match(controllerSource, /let lastDragSample = null;/);
});

test("controller 导出 9 个函数", () => {
  const matches = [...controllerSource.matchAll(/return \{([\s\S]*?)\};/g)];
  const exportBlock = matches.length > 0 ? matches[matches.length - 1][1] : "";
  const expectedExports = [
    "clearDragState",
    "startDragTimer",
    "updateDragPosition",
    "handleDragStart",
    "handleDragEnd",
    "getDragState",
    "getLastDragSample",
    "getDragTimer",
    "sendDragState"
  ];
  for (const name of expectedExports) {
    assert.match(exportBlock, new RegExp(name), `导出应包含 ${name}`);
  }
});

test("controller context 解构包含必要依赖", () => {
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";
  const requiredDeps = [
    "safeSend",
    "removeInteractionPause",
    "clampPetWindowPosition",
    "setPetWindowPosition",
    "syncWalkTrackX",
    "getLastWindowSurfaceAsyncRefreshAt",
    "refreshWindowSurfaceCandidatesAsync",
    "getCursorScreenPoint",
    "isScreenPoint",
    "isCustomizationVisible",
    "materializeTaskbarWalkRunway",
    "recordUserOperation",
    "addInteractionPause",
    "clearHoverIntent",
    "hideStartupBubble",
    "hidePetMenu",
    "hideHoverPanel",
    "hideCustomizationPanel",
    "setIsPointerOverHoverPanel",
    "log",
    "logWalkDiagnostic",
    "isInteractionPaused",
    "getInteractionPauseSummary",
    "dockPetAfterDrag",
    "getPetWindow",
    "getActiveState",
    "getWalkDirection",
    "getCurrentSurface",
    "getTaskbarWalkRunway",
    "getWindowDockInProgress",
    "setWindowDockInProgress",
    "ENABLE_WINDOW_DOCKING",
    "WINDOW_SURFACE_DRAG_REFRESH_MIN_MS"
  ];
  for (const dep of requiredDeps) {
    assert.match(contextBlock, new RegExp(dep), `context 应包含 ${dep}`);
  }
});

test("controller 不含 dockController 直接引用", () => {
  assert.doesNotMatch(controllerSource, /dockController\./);
});

test("main.cjs 构造 dragController", () => {
  assert.match(mainStripped, /const dragController = createDragController\(\{/);
});

test("main.cjs 不再直接声明拖拽运行态", () => {
  assert.doesNotMatch(mainStripped, /let dragTimer = null\s*;/);
  assert.doesNotMatch(mainStripped, /let dragState = null\s*;/);
  assert.doesNotMatch(mainStripped, /let lastDragSample = null\s*;/);
});

test("main.cjs 6 个拖拽函数为薄包装委托 dragController", () => {
  const pairs = [
    { name: "sendDragState", delegate: "dragController.sendDragState" },
    { name: "clearDragState", delegate: "dragController.clearDragState" },
    { name: "startDragTimer", delegate: "dragController.startDragTimer" },
    { name: "updateDragPosition", delegate: "dragController.updateDragPosition" },
    { name: "handleDragStart", delegate: "dragController.handleDragStart" },
    { name: "handleDragEnd", delegate: "dragController.handleDragEnd" }
  ];
  for (const { name, delegate } of pairs) {
    const re = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[^}]*" + delegate.replace(/\./g, "\\.") + "[^}]*\\}");
    assert.match(mainStripped, re, `main.cjs ${name} 应委托 ${delegate}`);
  }
});

test("main.cjs 不再出现 getDragState: () => dragState 直接访问器", () => {
  assert.doesNotMatch(mainStripped, /getDragState:\s*\(\)\s*=>\s*dragState\b/);
});

test("main.cjs 不再出现 getLastDragSample: () => lastDragSample 直接访问器", () => {
  assert.doesNotMatch(mainStripped, /getLastDragSample:\s*\(\)\s*=>\s*lastDragSample\b/);
});

test("main.cjs 控制器 context 的 getDragState 改走 dragController", () => {
  assert.match(mainStripped, /getDragState:\s*\(\)\s*=>\s*dragController\.getDragState\(\)/);
});

test("main.cjs 控制器 context 的 getLastDragSample 改走 dragController", () => {
  assert.match(mainStripped, /getLastDragSample:\s*\(\)\s*=>\s*dragController\.getLastDragSample\(\)/);
});

test("main.cjs dockPetAfterDrag 仍委托 dockController", () => {
  assert.match(mainStripped, /dockController\.dockPetAfterDrag/);
});

test("main.cjs applyDockSurfaceAfterDrag 仍委托 dockController", () => {
  assert.match(mainStripped, /dockController\.applyDockSurfaceAfterDrag/);
});

test("dock-controller 仍导出 dockPetAfterDrag 和 applyDockSurfaceAfterDrag", () => {
  assert.match(dockSource, /dockPetAfterDrag/);
  assert.match(dockSource, /applyDockSurfaceAfterDrag/);
});

test("register-ipc-handlers 的 pet:drag-start/pet:drag-end 契约不变", () => {
  assert.match(ipcSource, /ipcMain\.on\("pet:drag-start",\s*handlers\.dragStart\);/);
  assert.match(ipcSource, /ipcMain\.on\("pet:drag-end",\s*handlers\.dragEnd\);/);
});

test("main.cjs handlers 映射不变", () => {
  assert.match(mainStripped, /dragStart:\s*handleDragStart\s*,/);
  assert.match(mainStripped, /dragEnd:\s*handleDragEnd\b/);
});
