// preference-platform-wiring-accessor.test.cjs：偏好/平台/菜单接线结构护栏
// 锁定第十六轮复核结论：偏好读写状态归 preferencesStore、平台读写归 autoStartController、
// 偏好切换副作用编排保留 main.cjs、buildMenuFeatures 保留 main.cjs 作为纯 helper。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const autoStartSource = fs.readFileSync(path.join(__dirname, "..", "electron", "platform", "auto-start.cjs"), "utf8");
const preferencesStoreSource = fs.readFileSync(path.join(__dirname, "..", "electron", "core", "preferences-store.cjs"), "utf8");

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const mainStripped = stripComments(mainSource);
const autoStartStripped = stripComments(autoStartSource);
const preferencesStoreStripped = stripComments(preferencesStoreSource);

// 提取 function 起点到下一个 "function " 声明之间的源码块（含嵌套大括号），
// 用于断言带嵌套 if/try 的函数体内是否包含目标调用。
function extractFunctionBlock(source, funcName) {
  const startRe = new RegExp("function\\s+" + funcName + "\\s*\\(");
  const startMatch = source.match(startRe);
  if (!startMatch) return "";
  const startIdx = source.indexOf(startMatch[0]);
  const searchFrom = startIdx + startMatch[0].length;
  const nextIdx = source.indexOf("\nfunction ", searchFrom);
  const endIdx = nextIdx >= 0 ? nextIdx : source.length;
  return source.slice(startIdx, endIdx);
}

test("main.cjs 不重新声明偏好状态变量", () => {
  assert.doesNotMatch(mainStripped, /let\s+autoStartEnabledCache\b/, "不应重新声明 autoStartEnabledCache（属 preferencesStore）");
  assert.doesNotMatch(mainStripped, /let\s+windowRoamEnabledCache\b/, "不应重新声明 windowRoamEnabledCache（属 preferencesStore）");
  assert.doesNotMatch(mainStripped, /let\s+eyeTrackingEnabledCache\b/, "不应重新声明 eyeTrackingEnabledCache（属 preferencesStore）");
  assert.doesNotMatch(mainStripped, /let\s+autoStartPreferenceLoaded\b/, "不应重新声明 autoStartPreferenceLoaded（属 preferencesStore）");
});

test("main.cjs buildAutoStartSummary/buildWindowRoamSummary/buildEyeTrackingSummary 委托 preferencesStore", () => {
  assert.match(mainStripped, /preferencesStore\.buildAutoStartSummary/, "buildAutoStartSummary 应委托 preferencesStore");
  assert.match(mainStripped, /preferencesStore\.buildWindowRoamSummary/, "buildWindowRoamSummary 应委托 preferencesStore");
  assert.match(mainStripped, /preferencesStore\.buildEyeTrackingSummary/, "buildEyeTrackingSummary 应委托 preferencesStore");
});

test("main.cjs read/write preference 委托 preferencesStore", () => {
  assert.match(mainStripped, /preferencesStore\.readAutoStartPreference/, "readAutoStartPreference 应委托 preferencesStore");
  assert.match(mainStripped, /preferencesStore\.writeAutoStartPreference/, "writeAutoStartPreference 应委托 preferencesStore");
  assert.match(mainStripped, /preferencesStore\.readWindowRoamPreference/, "readWindowRoamPreference 应委托 preferencesStore");
  assert.match(mainStripped, /preferencesStore\.writeWindowRoamPreference/, "writeWindowRoamPreference 应委托 preferencesStore");
  assert.match(mainStripped, /preferencesStore\.readEyeTrackingPreference/, "readEyeTrackingPreference 应委托 preferencesStore");
  assert.match(mainStripped, /preferencesStore\.writeEyeTrackingPreference/, "writeEyeTrackingPreference 应委托 preferencesStore");
});

test("main.cjs readPetScalePreference/writePetScalePreference 委托 surfaceScaleController", () => {
  assert.match(mainStripped, /surfaceScaleController\.readPetScalePreference/, "readPetScalePreference 应委托 surfaceScaleController");
  assert.match(mainStripped, /surfaceScaleController\.writePetScalePreference/, "writePetScalePreference 应委托 surfaceScaleController");
});

test("main.cjs 平台注册表读写函数委托 autoStartController", () => {
  const pairs = [
    { name: "getAutoStartCommand", delegate: "autoStartController.getAutoStartCommand" },
    { name: "readAutoStartEnabledSync", delegate: "autoStartController.readAutoStartEnabledSync" },
    { name: "readAutoStartEnabledAsync", delegate: "autoStartController.readAutoStartEnabledAsync" },
    { name: "setAutoStartEnabled", delegate: "autoStartController.setAutoStartEnabled" },
    { name: "refreshAutoStartCacheAsync", delegate: "autoStartController.refreshAutoStartCacheAsync" },
    { name: "syncAutoStartPreferenceFromRegistrySync", delegate: "autoStartController.syncAutoStartPreferenceFromRegistrySync" }
  ];
  for (const { name, delegate } of pairs) {
    const re = new RegExp("function\\s+" + name + "\\s*\\([^)]*\\)\\s*\\{[^}]*" + delegate.replace(/\./g, "\\.") + "[^}]*\\}");
    assert.match(mainStripped, re, `main.cjs ${name} 应委托 ${delegate}`);
  }
});

test("main.cjs buildMenuFeatures 调用 getPetPlatformFeatures 与 ENABLE_WINDOW_DOCKING", () => {
  assert.match(mainStripped, /function\s+buildMenuFeatures\s*\(/, "应存在 buildMenuFeatures 函数");
  assert.match(mainStripped, /getPetPlatformFeatures/, "buildMenuFeatures 应调用 getPetPlatformFeatures");
  assert.match(mainStripped, /ENABLE_WINDOW_DOCKING/, "buildMenuFeatures 应引用 ENABLE_WINDOW_DOCKING");
});

test("main.cjs setAutoStartPreference/setWindowRoamPreference/setEyeTrackingPreference 仍为 main.cjs 函数", () => {
  // 确认三个偏好切换函数未迁出为 controller，仍为 main.cjs 顶层函数
  assert.match(mainStripped, /function\s+setAutoStartPreference\s*\(/, "setAutoStartPreference 应保留为 main.cjs 函数");
  assert.match(mainStripped, /function\s+setWindowRoamPreference\s*\(/, "setWindowRoamPreference 应保留为 main.cjs 函数");
  assert.match(mainStripped, /function\s+setEyeTrackingPreference\s*\(/, "setEyeTrackingPreference 应保留为 main.cjs 函数");

  // 确认函数体内组合了 preferencesStore 守卫与 sendMenuConfig 副作用
  const autoStartBlock = extractFunctionBlock(mainStripped, "setAutoStartPreference");
  assert.ok(autoStartBlock.length > 0, "应能提取 setAutoStartPreference 函数体");
  assert.match(autoStartBlock, /preferencesStore\.canToggleAutoStart/, "setAutoStartPreference 应调用 preferencesStore.canToggleAutoStart");
  assert.match(autoStartBlock, /sendMenuConfig/, "setAutoStartPreference 应调用 sendMenuConfig");

  const windowRoamBlock = extractFunctionBlock(mainStripped, "setWindowRoamPreference");
  assert.ok(windowRoamBlock.length > 0, "应能提取 setWindowRoamPreference 函数体");
  assert.match(windowRoamBlock, /preferencesStore\.canToggleWindowRoam/, "setWindowRoamPreference 应调用 preferencesStore.canToggleWindowRoam");
  assert.match(windowRoamBlock, /sendMenuConfig/, "setWindowRoamPreference 应调用 sendMenuConfig");

  const eyeTrackingBlock = extractFunctionBlock(mainStripped, "setEyeTrackingPreference");
  assert.ok(eyeTrackingBlock.length > 0, "应能提取 setEyeTrackingPreference 函数体");
  assert.match(eyeTrackingBlock, /preferencesStore\.canToggleEyeTracking/, "setEyeTrackingPreference 应调用 preferencesStore.canToggleEyeTracking");
  assert.match(eyeTrackingBlock, /sendMenuConfig/, "setEyeTrackingPreference 应调用 sendMenuConfig");
});

test("platform/auto-start.cjs 不声明 autoStartEnabledCache/autoStartPreferenceLoaded 业务状态", () => {
  assert.doesNotMatch(autoStartSource, /let\s+autoStartEnabledCache\b/, "auto-start.cjs 不应声明 autoStartEnabledCache（属 preferencesStore）");
  assert.doesNotMatch(autoStartSource, /let\s+autoStartPreferenceLoaded\b/, "auto-start.cjs 不应声明 autoStartPreferenceLoaded（属 preferencesStore）");
});

test("platform/auto-start.cjs 声明 autoStartRefreshInFlight 运行态", () => {
  assert.match(autoStartSource, /let\s+autoStartRefreshInFlight\b/, "auto-start.cjs 应声明 autoStartRefreshInFlight 运行态");
});

test("platform/auto-start.cjs 不直接接触窗口/IPC/bubble", () => {
  assert.ok(!autoStartStripped.includes("ipcMain"), "auto-start.cjs 不应出现 ipcMain");
  assert.ok(!autoStartStripped.includes("petWindow"), "auto-start.cjs 不应出现 petWindow");
  assert.ok(!autoStartStripped.includes("safeSend"), "auto-start.cjs 不应出现 safeSend");
  assert.ok(!autoStartStripped.includes("broadcastToWindows"), "auto-start.cjs 不应出现 broadcastToWindows");
  assert.ok(!autoStartStripped.includes("showBubbleMessage"), "auto-start.cjs 不应出现 showBubbleMessage");
  assert.ok(!autoStartStripped.includes("new BrowserWindow"), "auto-start.cjs 不应出现 new BrowserWindow");
});

test("core/preferences-store.cjs 不直接接触窗口/IPC/bubble 且导出摘要/守卫方法", () => {
  // 不直接接触窗口/IPC/bubble
  assert.ok(!preferencesStoreStripped.includes("ipcMain"), "preferences-store.cjs 不应出现 ipcMain");
  assert.ok(!preferencesStoreStripped.includes("petWindow"), "preferences-store.cjs 不应出现 petWindow");
  assert.ok(!preferencesStoreStripped.includes("safeSend"), "preferences-store.cjs 不应出现 safeSend");
  assert.ok(!preferencesStoreStripped.includes("broadcastToWindows"), "preferences-store.cjs 不应出现 broadcastToWindows");
  assert.ok(!preferencesStoreStripped.includes("showBubbleMessage"), "preferences-store.cjs 不应出现 showBubbleMessage");
  assert.ok(!preferencesStoreStripped.includes("new BrowserWindow"), "preferences-store.cjs 不应出现 new BrowserWindow");

  // 导出块应包含摘要/守卫方法
  const lastReturnIdx = preferencesStoreSource.lastIndexOf("return {");
  const exportBlock = lastReturnIdx >= 0 ? preferencesStoreSource.slice(lastReturnIdx) : "";
  assert.ok(exportBlock.length > 0, "应能提取 preferences-store.cjs 导出 return 块");
  const expectedExports = [
    "buildAutoStartSummary",
    "buildWindowRoamSummary",
    "buildEyeTrackingSummary",
    "canToggleAutoStart",
    "canToggleWindowRoam",
    "canToggleEyeTracking"
  ];
  for (const name of expectedExports) {
    assert.match(exportBlock, new RegExp(name), `导出应包含 ${name}`);
  }
});
