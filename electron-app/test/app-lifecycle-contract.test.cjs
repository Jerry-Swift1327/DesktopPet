const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("main.cjs 包含单实例锁", () => {
  assert.match(mainSource, /app\.requestSingleInstanceLock\(\)/, "应调用 app.requestSingleInstanceLock()");
  assert.match(
    mainSource,
    /if\s*\(\s*!gotSingleInstanceLock\s*\)\s*\{[\s\S]*?app\.quit\(\)/,
    "单实例锁失败时应调用 app.quit()"
  );
  assert.match(
    mainSource,
    /app\.on\(\s*['"]second-instance['"]\s*,\s*\(\s*\)\s*=>\s*\{[\s\S]*?ensurePetWindow\(\)/,
    "second-instance 事件 handler 内应调用 ensurePetWindow"
  );
});

test("main.cjs 包含 whenReady 启动序列", () => {
  assert.match(mainSource, /app\.whenReady\(\)\.then\(/, "应注册 app.whenReady().then()");

  const whenReadyBlock = mainSource.match(/app\.whenReady\(\)\.then\(\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);/)?.[1] || "";
  assert.ok(whenReadyBlock.length > 0, "应能提取 whenReady 块内容");

  const expectedCalls = [
    "readPetStats",
    "readAutoStartPreference",
    "readWindowRoamPreference",
    "readEyeTrackingPreference",
    "readPetScalePreference",
    "rememberHomeDisplay",
    "createPetWindow",
    "refreshAutoStartCacheAsync",
    "startHoverPolling",
    "startWindowSurfacePolling",
    "updateWindowRoamPolling",
    "updateEyeTrackingPolling",
    "startIntimacyDecayTimer",
    "scheduleIdleGreeting",
    "startTabbyIdlePolling"
  ];

  for (const fn of expectedCalls) {
    const pattern = new RegExp(`\\b${escapeRegex(fn)}\\(`);
    assert.match(whenReadyBlock, pattern, `whenReady 块内应调用 ${fn}`);
  }
});

test("main.cjs 包含 before-quit 退出清理", () => {
  assert.match(mainSource, /app\.on\(\s*['"]before-quit['"]/, "应注册 before-quit 事件");

  const beforeQuitBlock = mainSource.match(
    /app\.on\(\s*['"]before-quit['"][\s\S]*?(?=\napp\.on\(|\nfunction |\nconst )/
  )?.[0] || "";
  assert.ok(beforeQuitBlock.length > 0, "应能提取 before-quit 块内容");

  const expectedCalls = [
    "writePetStats",
    "stopHoverPolling",
    "stopWindowSurfacePolling",
    "stopWindowRoamPolling",
    "stopEyeTrackingPolling",
    "stopIntimacyDecayTimer",
    "clearHoverIntent",
    "clearDragState",
    "clearStartupBubbleTimer",
    "clearHoverHideTimer",
    "clearMenuHideTimer"
  ];

  for (const fn of expectedCalls) {
    const pattern = new RegExp(`\\b${escapeRegex(fn)}\\(`);
    assert.match(beforeQuitBlock, pattern, `before-quit 块内应调用 ${fn}`);
  }

  assert.match(
    beforeQuitBlock,
    /clearTimeout\(\s*randomGreetingTimer\s*\)/,
    "before-quit 块内应 clearTimeout(randomGreetingTimer)"
  );
  assert.match(
    beforeQuitBlock,
    /clearTimeout\(\s*displayMetricsSettleTimer\s*\)/,
    "before-quit 块内应 clearTimeout(displayMetricsSettleTimer)"
  );
});

test("main.cjs 包含 window-all-closed", () => {
  assert.match(mainSource, /app\.on\(\s*['"]window-all-closed['"]/, "应注册 window-all-closed 事件");

  const windowAllClosedBlock = mainSource.match(
    /app\.on\(\s*['"]window-all-closed['"]\s*,\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\);/
  )?.[1] || "";
  assert.ok(windowAllClosedBlock.length > 0, "应能提取 window-all-closed 块内容");

  assert.match(
    windowAllClosedBlock,
    /process\.platform\s*!==\s*['"]darwin['"]/,
    "应检查 process.platform !== 'darwin'"
  );
  assert.match(windowAllClosedBlock, /app\.quit\(\)/, "应调用 app.quit()");
});

test("main.cjs 包含 activate", () => {
  assert.match(mainSource, /app\.on\(\s*['"]activate['"]/, "应注册 activate 事件");

  // activate 注册可能在 whenReady 块内，直接从 mainSource 提取其 handler
  const activateBlock = mainSource.match(
    /app\.on\(\s*['"]activate['"]\s*,\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\}\s*\);/
  )?.[1] || "";
  assert.ok(activateBlock.length > 0, "应能提取 activate 块内容");

  assert.match(
    activateBlock,
    /BrowserWindow\.getAllWindows\(\)\.length\s*===\s*0/,
    "应检查 BrowserWindow.getAllWindows().length === 0"
  );
  assert.match(activateBlock, /createPetWindow\(\)/, "应调用 createPetWindow()");
});

test("main.cjs 包含 display-metrics-changed（macOS）", () => {
  assert.match(
    mainSource,
    /screen\.on\(\s*['"]display-metrics-changed['"]/,
    "应注册 display-metrics-changed 事件"
  );
  assert.match(
    mainSource,
    /metrics\.includes\(\s*['"]workArea['"]\s*\)/,
    "应检查 metrics.includes('workArea')"
  );
  assert.match(mainSource, /scheduleDarwinDisplayMetricsSettle\(\)/, "应调用 scheduleDarwinDisplayMetricsSettle()");
  assert.match(
    mainSource,
    /process\.platform\s*===\s*['"]darwin['"][\s\S]*?screen\.on\(\s*['"]display-metrics-changed['"]/,
    "display-metrics-changed 应注册在 process.platform === 'darwin' 条件块内"
  );
});

test("main.cjs 包含 switch-variant 重启逻辑", () => {
  const handleSwitchVariantBlock = mainSource.match(/function handleSwitchVariant[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(handleSwitchVariantBlock.length > 0, "应能提取 handleSwitchVariant 函数体");

  assert.match(handleSwitchVariantBlock, /app\.releaseSingleInstanceLock\(\)/, "应调用 app.releaseSingleInstanceLock()");
  assert.match(handleSwitchVariantBlock, /app\.relaunch\(\)/, "应调用 app.relaunch()");
  assert.match(handleSwitchVariantBlock, /app\.exit\(\)/, "应调用 app.exit()");
});

test("whenReady 启动序列顺序正确", () => {
  const whenReadyBlock = mainSource.match(/app\.whenReady\(\)\.then\(\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);/)?.[1] || "";
  assert.ok(whenReadyBlock.length > 0, "应能提取 whenReady 块内容");

  const idxReadPetScalePreference = whenReadyBlock.indexOf("readPetScalePreference");
  const idxCreatePetWindow = whenReadyBlock.indexOf("createPetWindow");
  const idxRememberHomeDisplay = whenReadyBlock.indexOf("rememberHomeDisplay");
  const idxStartHoverPolling = whenReadyBlock.indexOf("startHoverPolling");
  const idxStartWindowSurfacePolling = whenReadyBlock.indexOf("startWindowSurfacePolling");

  assert.ok(idxReadPetScalePreference >= 0 && idxCreatePetWindow >= 0, "readPetScalePreference 和 createPetWindow 应存在");
  assert.ok(idxReadPetScalePreference < idxCreatePetWindow, "readPetScalePreference 应在 createPetWindow 之前");

  assert.ok(idxRememberHomeDisplay >= 0, "rememberHomeDisplay 应存在");
  assert.ok(idxRememberHomeDisplay < idxCreatePetWindow, "rememberHomeDisplay 应在 createPetWindow 之前");

  assert.ok(idxStartHoverPolling >= 0, "startHoverPolling 应存在");
  assert.ok(idxCreatePetWindow < idxStartHoverPolling, "createPetWindow 应在 startHoverPolling 之前");

  assert.ok(idxStartWindowSurfacePolling >= 0, "startWindowSurfacePolling 应存在");
  assert.ok(idxCreatePetWindow < idxStartWindowSurfacePolling, "createPetWindow 应在 startWindowSurfacePolling 之前");
});

test("before-quit 退出清理顺序正确", () => {
  const beforeQuitBlock = mainSource.match(
    /app\.on\(\s*['"]before-quit['"][\s\S]*?(?=\napp\.on\(|\nfunction |\nconst )/
  )?.[0] || "";
  assert.ok(beforeQuitBlock.length > 0, "应能提取 before-quit 块内容");

  const idxWritePetStats = beforeQuitBlock.indexOf("writePetStats");
  const idxStopHoverPolling = beforeQuitBlock.indexOf("stopHoverPolling");
  const idxClearDragState = beforeQuitBlock.indexOf("clearDragState");

  assert.ok(idxWritePetStats >= 0 && idxStopHoverPolling >= 0, "writePetStats 和 stopHoverPolling 应存在");
  assert.ok(idxWritePetStats < idxStopHoverPolling, "writePetStats 应在 stopHoverPolling 之前");

  assert.ok(idxClearDragState >= 0, "clearDragState 应存在");
  assert.ok(idxStopHoverPolling < idxClearDragState, "stopHoverPolling 应在 clearDragState 之前");
});
