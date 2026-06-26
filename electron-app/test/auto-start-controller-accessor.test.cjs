// auto-start-controller-accessor.test.cjs：auto-start 控制器边界与 main.cjs 薄包装接线护栏
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "..", "electron", "platform", "auto-start.cjs"),
  "utf8"
);
const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");

// 剥离注释
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const mainStripped = stripComments(mainSource);

test("controller 不直接 require electron/fs/path", () => {
  assert.doesNotMatch(controllerSource, /require\(\s*["']electron["']\s*\)/, "不应直接 require electron");
  assert.doesNotMatch(controllerSource, /require\(\s*["']fs["']\s*\)/, "不应直接 require fs");
  assert.doesNotMatch(controllerSource, /require\(\s*["']path["']\s*\)/, "不应直接 require path");
});

test("controller 不匹配 ipcMain/petWindow/safeSend/broadcastToWindows/showBubbleMessage", () => {
  assert.ok(!controllerSource.includes("ipcMain"), "不应出现 ipcMain");
  assert.ok(!controllerSource.includes("petWindow"), "不应出现 petWindow");
  assert.ok(!controllerSource.includes("safeSend"), "不应出现 safeSend");
  assert.ok(!controllerSource.includes("broadcastToWindows"), "不应出现 broadcastToWindows");
  assert.ok(!controllerSource.includes("showBubbleMessage"), "不应出现 showBubbleMessage");
});

test("controller 导出 createAutoStartController", () => {
  assert.match(controllerSource, /module\.exports = \{\s*createAutoStartController\s*\}/);
});

test("controller 内部不声明 autoStartEnabledCache/autoStartPreferenceLoaded", () => {
  assert.doesNotMatch(controllerSource, /let\s+autoStartEnabledCache\b/, "不应声明 autoStartEnabledCache");
  assert.doesNotMatch(controllerSource, /let\s+autoStartPreferenceLoaded\b/, "不应声明 autoStartPreferenceLoaded");
});

test("controller 内部声明 autoStartRefreshInFlight", () => {
  assert.match(controllerSource, /let\s+autoStartRefreshInFlight\b/, "应声明 autoStartRefreshInFlight 运行态");
});

test("controller context 解构包含必要依赖", () => {
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";
  const requiredDeps = [
    "app",
    "process",
    "execFile",
    "execFileSync",
    "petRuntimeConfig",
    "WINDOWS_STARTUP_RUN_KEY",
    "isAutoStartPreferenceLoaded",
    "setAutoStartEnabled",
    "writeAutoStartPreference",
    "sendMenuConfig"
  ];
  for (const dep of requiredDeps) {
    assert.match(contextBlock, new RegExp(dep), `context 应包含 ${dep}`);
  }
});

test("controller 不导出 buildAutoStartSummary/canToggleAutoStart", () => {
  // 提取最后一个 return { ... }; 块（控制器导出对象）
  const lastReturnIdx = controllerSource.lastIndexOf("return {");
  const exportBlock = lastReturnIdx >= 0 ? controllerSource.slice(lastReturnIdx) : "";
  assert.ok(exportBlock.length > 0, "应能提取控制器导出 return 块");
  assert.doesNotMatch(exportBlock, /buildAutoStartSummary/, "不应导出 buildAutoStartSummary");
  assert.doesNotMatch(exportBlock, /canToggleAutoStart/, "不应导出 canToggleAutoStart");
});

test("controller 导出 6 个函数", () => {
  const lastReturnIdx = controllerSource.lastIndexOf("return {");
  const exportBlock = lastReturnIdx >= 0 ? controllerSource.slice(lastReturnIdx) : "";
  const expectedExports = [
    "getAutoStartCommand",
    "isAutoStartSupported",
    "readAutoStartEnabledSync",
    "readAutoStartEnabledAsync",
    "refreshAutoStartCacheAsync",
    "setAutoStartEnabled"
  ];
  for (const name of expectedExports) {
    assert.match(exportBlock, new RegExp(name), `导出应包含 ${name}`);
  }
});

test("main.cjs 已引入并构造 autoStartController", () => {
  assert.match(mainSource, /require\(.*platform\/auto-start\.cjs.*\)/, "应引入 auto-start.cjs");
  assert.match(mainStripped, /const autoStartController = createAutoStartController\(\{/);
});

test("main.cjs 不再直接声明 autoStartEnabledCache/autoStartRefreshInFlight/autoStartPreferenceLoaded", () => {
  assert.doesNotMatch(mainStripped, /let\s+autoStartEnabledCache\b/, "不应声明 autoStartEnabledCache");
  assert.doesNotMatch(mainStripped, /let\s+autoStartRefreshInFlight\b/, "不应声明 autoStartRefreshInFlight");
  assert.doesNotMatch(mainStripped, /let\s+autoStartPreferenceLoaded\b/, "不应声明 autoStartPreferenceLoaded");
});

test("main.cjs 5 个 function 为薄包装委托 autoStartController", () => {
  const pairs = [
    { name: "getAutoStartCommand", delegate: "autoStartController.getAutoStartCommand" },
    { name: "readAutoStartEnabledSync", delegate: "autoStartController.readAutoStartEnabledSync" },
    { name: "readAutoStartEnabledAsync", delegate: "autoStartController.readAutoStartEnabledAsync" },
    { name: "setAutoStartEnabled", delegate: "autoStartController.setAutoStartEnabled" },
    { name: "refreshAutoStartCacheAsync", delegate: "autoStartController.refreshAutoStartCacheAsync" }
  ];
  for (const { name, delegate } of pairs) {
    const re = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[^}]*" + delegate.replace(/\./g, "\\.") + "[^}]*\\}");
    assert.match(mainStripped, re, `main.cjs ${name} 应委托 ${delegate}`);
  }
});

test("main.cjs buildAutoStartSummary 仍委托 preferencesStore.buildAutoStartSummary", () => {
  assert.match(mainStripped, /preferencesStore\.buildAutoStartSummary/);
});

test("main.cjs 保留 readAutoStartPreference/writeAutoStartPreference 委托 preferencesStore", () => {
  assert.match(mainStripped, /preferencesStore\.readAutoStartPreference/);
  assert.match(mainStripped, /preferencesStore\.writeAutoStartPreference/);
});
