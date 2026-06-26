// pet-window-controller-accessor.test.cjs：pet-window-controller 控制器边界与 main.cjs 薄包装接线护栏
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "windows", "pet-window-controller.cjs"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const ipcSource = fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", "register-ipc-handlers.cjs"), "utf8");

// 剥离注释
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const mainStripped = stripComments(mainSource);

test("controller 不直接 require electron/fs/path 且不注册 IPC", () => {
  assert.doesNotMatch(controllerSource, /require\("electron"/);
  assert.doesNotMatch(controllerSource, /require\("fs"/);
  assert.doesNotMatch(controllerSource, /require\("path"/);
  assert.ok(!controllerSource.includes("ipcMain"), "不应出现 ipcMain");
  assert.ok(!controllerSource.includes("safeSend("), "不应出现 safeSend(");
  assert.ok(!controllerSource.includes("broadcastToWindows("), "不应出现 broadcastToWindows(");
  assert.ok(!controllerSource.includes("showBubbleMessage("), "不应出现 showBubbleMessage(");
  assert.ok(!controllerSource.includes("ipcMain.handle"), "不应出现 ipcMain.handle");
  assert.ok(!controllerSource.includes("ipcMain.on"), "不应出现 ipcMain.on");
});

test("controller 不直接 new BrowserWindow", () => {
  assert.doesNotMatch(controllerSource, /new\s+BrowserWindow/);
});

test("controller 导出 createPetWindowController", () => {
  assert.match(controllerSource, /module\.exports = \{\s*createPetWindowController\s*\}/);
});

test("controller 内部声明 let petWindow = null", () => {
  assert.match(controllerSource, /let petWindow = null;/);
});

test("controller context 解构包含必要依赖", () => {
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";
  const requiredDeps = [
    "BrowserWindow",
    "createOverlayWindow",
    "path",
    "__dirname",
    "getAppPageUrl",
    "getAppIconPath",
    "log",
    "process",
    "screen",
    "getPetWindowWidth",
    "getPetWindowHeight",
    "getVisiblePetRectFromBounds",
    "moveToStartPosition",
    "sendPetState",
    "showStartupBubble",
    "repositionStartupBubbleWindow",
    "recordUserOperation",
    "clamp",
    "VISIBLE_SIDE_GAP",
    "VISIBLE_TOP_GAP",
    "VISIBLE_BOTTOM_GAP",
    "WINDOW_SURFACE_FALLBACK_BLEND_MS"
  ];
  for (const dep of requiredDeps) {
    assert.match(contextBlock, new RegExp(dep), `context 应包含 ${dep}`);
  }
});

test("controller 导出 7 个方法", () => {
  const matches = [...controllerSource.matchAll(/return \{([\s\S]*?)\};/g)];
  const exportBlock = matches.length > 0 ? matches[matches.length - 1][1] : "";
  const expectedExports = [
    "getPetWindow",
    "createPetWindow",
    "ensurePetWindow",
    "handleHidePet",
    "setPetWindowPosition",
    "clampPetWindowPosition",
    "animatePetWindowTo"
  ];
  for (const name of expectedExports) {
    assert.match(exportBlock, new RegExp(name), `导出应包含 ${name}`);
  }
});

test("main.cjs 引入并构造 petWindowController", () => {
  assert.match(mainStripped, /require\("\.\/windows\/pet-window-controller\.cjs"\)/);
  assert.match(mainStripped, /const petWindowController = createPetWindowController\(\{/);
});

test("main.cjs 不再声明顶层 let petWindow", () => {
  // 精确匹配 let petWindow; 或 let petWindow =，排除 petWindowMousePassthrough/petWindowHitRegionKey
  assert.doesNotMatch(mainStripped, /let petWindow\s*;/);
  assert.doesNotMatch(mainStripped, /let petWindow\s*=/);
});

test("main.cjs 6+1 个目标 function 为薄包装委托 petWindowController", () => {
  const pairs = [
    { name: "getPetWindow", delegate: "petWindowController.getPetWindow" },
    { name: "createPetWindow", delegate: "petWindowController.createPetWindow" },
    { name: "ensurePetWindow", delegate: "petWindowController.ensurePetWindow" },
    { name: "handleHidePet", delegate: "petWindowController.handleHidePet" },
    { name: "setPetWindowPosition", delegate: "petWindowController.setPetWindowPosition" },
    { name: "clampPetWindowPosition", delegate: "petWindowController.clampPetWindowPosition" },
    { name: "animatePetWindowTo", delegate: "petWindowController.animatePetWindowTo" }
  ];
  for (const { name, delegate } of pairs) {
    const re = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[^}]*" + delegate.replace(/\./g, "\\.") + "[^}]*\\}");
    assert.match(mainStripped, re, `main.cjs ${name} 应委托 ${delegate}`);
  }
});

test("main.cjs 不再出现 getPetWindow: () => petWindow 闭包快照", () => {
  assert.doesNotMatch(mainStripped, /getPetWindow:\s*\(\)\s*=>\s*petWindow\b/);
});

test("main.cjs 控制器 context 的 getPetWindow 改读 petWindowController", () => {
  assert.match(mainStripped, /getPetWindow:\s*\(\)\s*=>\s*petWindowController\.getPetWindow\(\)/);
});

test("main.cjs 不再出现裸 petWindow?. 引用", () => {
  // 匹配 petWindow?. 但排除 petWindowMousePassthrough/petWindowHitRegionKey/petWindowController
  // 用 [^a-zA-Z] 前置边界确保不误伤同前缀变量
  assert.doesNotMatch(mainStripped, /[^a-zA-Z]petWindow\?\./);
});

test("main.cjs 不再出现裸 petWindow. 方法调用", () => {
  // 检查 petWindow. 后接方法名（排除 petWindowMousePassthrough/petWindowHitRegionKey/petWindowController）
  assert.doesNotMatch(mainStripped, /[^a-zA-Z]petWindow\.(show|hide|setBounds|getBounds|isDestroyed|setPosition|setShape|setIgnoreMouseEvents|isVisible|isAlwaysOnTop)\b/);
});

test("main.cjs 不再出现裸 petWindow = 赋值", () => {
  assert.doesNotMatch(mainStripped, /[^a-zA-Z]petWindow\s*=/);
});

test("main.cjs 不再出现裸 petWindow 作为函数参数或数组元素", () => {
  // 检查 safeSend(petWindow, / broadcastToWindows([petWindow, 等裸引用
  assert.doesNotMatch(mainStripped, /safeSend\(\s*petWindow\b/);
  assert.doesNotMatch(mainStripped, /broadcastToWindows\(\s*\[\s*petWindow\b/);
});

test("register-ipc-handlers 的 show/hide 契约不变", () => {
  assert.match(ipcSource, /ipcMain\.on\("pet:show",\s*handlers\.show\);/);
  assert.match(ipcSource, /ipcMain\.on\("pet:hide",\s*handlers\.hide\);/);
});

test("main.cjs handlers 映射仍引用 ensurePetWindow/handleHidePet", () => {
  assert.match(mainStripped, /show:\s*ensurePetWindow\s*,/);
  assert.match(mainStripped, /hide:\s*handleHidePet\b/);
});

test("runAppReadyStartupSequence 仍调用 createPetWindow() 且顺序保持", () => {
  const onReadyBlock = mainStripped.match(/function runAppReadyStartupSequence\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(onReadyBlock.length > 0, "应能提取 runAppReadyStartupSequence 函数体");
  assert.match(onReadyBlock, /createPetWindow\(\)/);
  const idxReadPetScalePreference = onReadyBlock.indexOf("readPetScalePreference");
  const idxRememberHomeDisplay = onReadyBlock.indexOf("rememberHomeDisplay");
  const idxCreatePetWindow = onReadyBlock.indexOf("createPetWindow");
  const idxStartHoverPolling = onReadyBlock.indexOf("startHoverPolling");
  assert.ok(idxReadPetScalePreference >= 0 && idxReadPetScalePreference < idxCreatePetWindow, "readPetScalePreference 应在 createPetWindow 之前");
  assert.ok(idxRememberHomeDisplay >= 0 && idxRememberHomeDisplay < idxCreatePetWindow, "rememberHomeDisplay 应在 createPetWindow 之前");
  assert.ok(idxStartHoverPolling >= 0 && idxCreatePetWindow < idxStartHoverPolling, "createPetWindow 应在 startHoverPolling 之前");
});
