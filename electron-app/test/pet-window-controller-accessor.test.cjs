const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "windows", "pet-window-controller.cjs"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const ipcSource = fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", "register-ipc-handlers.cjs"), "utf8");

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const mainStripped = stripComments(mainSource);

test("pet-window-controller keeps the window boundary narrow", () => {
  assert.doesNotMatch(controllerSource, /require\("electron"/);
  assert.doesNotMatch(controllerSource, /require\("fs"/);
  assert.doesNotMatch(controllerSource, /require\("path"/);
  assert.doesNotMatch(controllerSource, /new\s+BrowserWindow/);
  assert.doesNotMatch(controllerSource, /ipcMain|safeSend\(|broadcastToWindows\(|showBubbleMessage\(/);
  assert.match(controllerSource, /module\.exports = \{\s*createPetWindowController\s*\}/);
  assert.match(controllerSource, /let petWindow = null;/);
});

test("pet-window-controller context contains only required window dependencies", () => {
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
    "VISIBLE_BOTTOM_GAP"
  ];
  for (const dep of requiredDeps) {
    assert.match(contextBlock, new RegExp(dep), `context should include ${dep}`);
  }
  assert.doesNotMatch(contextBlock, /WINDOW_SURFACE_FALLBACK_BLEND_MS/);
});

test("pet-window-controller exports six synchronous window methods", () => {
  const matches = [...controllerSource.matchAll(/return \{([\s\S]*?)\};/g)];
  const exportBlock = matches.at(-1)?.[1] || "";
  const expectedExports = [
    "getPetWindow",
    "createPetWindow",
    "ensurePetWindow",
    "handleHidePet",
    "setPetWindowPosition",
    "clampPetWindowPosition"
  ];
  for (const name of expectedExports) {
    assert.match(exportBlock, new RegExp(name), `exports should include ${name}`);
  }
  assert.doesNotMatch(exportBlock, /animatePetWindowTo/);
});

test("main.cjs delegates pet window wrappers to petWindowController", () => {
  const pairs = [
    { name: "getPetWindow", delegate: "petWindowController.getPetWindow" },
    { name: "createPetWindow", delegate: "petWindowController.createPetWindow" },
    { name: "ensurePetWindow", delegate: "petWindowController.ensurePetWindow" },
    { name: "handleHidePet", delegate: "petWindowController.handleHidePet" },
    { name: "setPetWindowPosition", delegate: "petWindowController.setPetWindowPosition" },
    { name: "clampPetWindowPosition", delegate: "petWindowController.clampPetWindowPosition" }
  ];
  for (const { name, delegate } of pairs) {
    const re = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[^}]*" + delegate.replace(/\./g, "\\.") + "[^}]*\\}");
    assert.match(mainStripped, re, `main.cjs ${name} should delegate to ${delegate}`);
  }
  assert.doesNotMatch(mainStripped, /function\s+animatePetWindowTo\s*\(/);
  assert.doesNotMatch(mainStripped, /function\s+animatePetWindowTransition\s*\(/);
  assert.doesNotMatch(mainStripped, /surface-transition/);
});

test("main.cjs no longer directly owns or mutates the petWindow variable", () => {
  assert.doesNotMatch(mainStripped, /let petWindow\s*[=;]/);
  assert.match(mainStripped, /getPetWindow:\s*\(\)\s*=>\s*petWindowController\.getPetWindow\(\)/);
  assert.doesNotMatch(mainStripped, /[^a-zA-Z]petWindow\?\./);
  assert.doesNotMatch(mainStripped, /[^a-zA-Z]petWindow\.(show|hide|setBounds|getBounds|isDestroyed|setPosition|setShape|setIgnoreMouseEvents|isVisible|isAlwaysOnTop)\b/);
  assert.doesNotMatch(mainStripped, /[^a-zA-Z]petWindow\s*=/);
  assert.doesNotMatch(mainStripped, /safeSend\(\s*petWindow\b/);
  assert.doesNotMatch(mainStripped, /broadcastToWindows\(\s*\[\s*petWindow\b/);
});

test("show/hide IPC and startup sequence still point at pet window wrappers", () => {
  assert.match(ipcSource, /ipcMain\.on\("pet:show",\s*handlers\.show\);/);
  assert.match(ipcSource, /ipcMain\.on\("pet:hide",\s*handlers\.hide\);/);
  assert.match(mainStripped, /show:\s*ensurePetWindow\s*,/);
  assert.match(mainStripped, /hide:\s*handleHidePet\b/);

  const startupBody = mainStripped.match(/function runAppReadyStartupSequence\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(startupBody, /createPetWindow\(\)/);
  assert.ok(startupBody.indexOf("readPetScalePreference") < startupBody.indexOf("createPetWindow"));
  assert.ok(startupBody.indexOf("rememberHomeDisplay") < startupBody.indexOf("createPetWindow"));
  assert.ok(startupBody.indexOf("createPetWindow") < startupBody.indexOf("startHoverPolling"));
});
