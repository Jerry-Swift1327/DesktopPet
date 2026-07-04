const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");

const lifecycleModuleSource = fs.readFileSync(
  path.join(__dirname, "..", "electron", "lifecycle", "register-app-lifecycle.cjs"),
  "utf8"
);

// 先提取 registerAppLifecycle({...}) 整块，避免匹配到 main.cjs 中其他 onReady 回调（如 createPetWindow 窗口选项）
const lifecycleCallBlock = mainSource.match(/registerAppLifecycle\(\s*\{([\s\S]*?)\n\}\);/)?.[1] || "";

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("main.cjs 调用 registerAppLifecycle 并注入单实例锁", () => {
  // 保留：requestSingleInstanceLock 仍在 main.cjs
  assert.match(mainSource, /app\.requestSingleInstanceLock\(\)/, "应调用 app.requestSingleInstanceLock()");

  // 新增：main.cjs 引入并调用 registerAppLifecycle
  assert.match(
    mainSource,
    /require\(.*lifecycle\/register-app-lifecycle\.cjs.*\)/,
    "应引入 registerAppLifecycle"
  );
  assert.match(mainSource, /registerAppLifecycle\(\s*\{/, "应调用 registerAppLifecycle({...})");

  // 新增：注入 gotSingleInstanceLock
  assert.match(mainSource, /gotSingleInstanceLock\s*[:,]/, "应注入 gotSingleInstanceLock");
});

test("main.cjs onReady handler 包含启动序列", () => {
  // 提取 runAppReadyStartupSequence 函数体（onReady 注入的函数引用）
  const onReadyBlock = mainSource.match(/function runAppReadyStartupSequence\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(onReadyBlock.length > 0, "应能提取 runAppReadyStartupSequence 函数体");

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
    assert.match(onReadyBlock, pattern, `onReady handler 内应调用 ${fn}`);
  }
});

test("main.cjs onReady 注入 runAppReadyStartupSequence 函数引用", () => {
  assert.match(
    lifecycleCallBlock,
    /onReady\s*:\s*runAppReadyStartupSequence\b/,
    "onReady 应注入 runAppReadyStartupSequence 函数引用"
  );
});

test("main.cjs onBeforeQuit handler 包含退出清理", () => {
  const onBeforeQuitBlock = mainSource.match(/function runAppBeforeQuitCleanupSequence\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(onBeforeQuitBlock.length > 0, "应能提取 runAppBeforeQuitCleanupSequence 函数体");

  const expectedCalls = [
    "writePetStats",
    "stopHoverPolling",
    "stopWindowSurfacePolling",
    "stopWindowRoamPolling",
    "stopEyeTrackingPolling",
    "stopTabbyIdlePolling",
    "stopIntimacyDecayTimer",
    "clearHoverIntent",
    "clearDragState",
    "clearStartupBubbleTimer",
    "clearHoverHideTimer",
    "clearMenuHideTimer",
    "clearTabbySleepPoseTimer"
  ];

  for (const fn of expectedCalls) {
    const pattern = new RegExp(`\\b${escapeRegex(fn)}\\(`);
    assert.match(onBeforeQuitBlock, pattern, `onBeforeQuit handler 内应调用 ${fn}`);
  }

  assert.match(
    onBeforeQuitBlock,
    /clearTimeout\(\s*randomGreetingTimer\s*\)/,
    "onBeforeQuit handler 内应 clearTimeout(randomGreetingTimer)"
  );
  assert.match(
    onBeforeQuitBlock,
    /if\s*\(\s*randomGreetingTimer\s*\)\s*\{[\s\S]*?clearTimeout\(\s*randomGreetingTimer\s*\)[\s\S]*?randomGreetingTimer\s*=\s*null/,
    "应包含 randomGreetingTimer 条件清理（if + clearTimeout + 置空）"
  );
  assert.match(
    onBeforeQuitBlock,
    /clearDisplayMetricsSettleTimer\(\)/,
    "onBeforeQuit handler 内应调用 clearDisplayMetricsSettleTimer()（displayMetricsSettleTimer 所有权已迁移到 screenMetricsController）"
  );
});

test("main.cjs onBeforeQuit 注入 runAppBeforeQuitCleanupSequence 函数引用", () => {
  assert.match(
    lifecycleCallBlock,
    /onBeforeQuit\s*:\s*runAppBeforeQuitCleanupSequence\b/,
    "onBeforeQuit 应注入 runAppBeforeQuitCleanupSequence 函数引用"
  );
});

test("main.cjs onActivate handler 包含窗口恢复逻辑", () => {
  // 在 lifecycleCallBlock 内提取 onActivate handler 块（到下一个 handler "onDisplayMetricsChanged" 前）
  const onActivateBlock = lifecycleCallBlock.match(
    /onActivate\s*:\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s{4}\},\s*\n\s{4}onDisplayMetricsChanged/
  )?.[1] || "";
  assert.ok(onActivateBlock.length > 0, "应能提取 onActivate handler 内容");

  assert.match(
    onActivateBlock,
    /BrowserWindow\.getAllWindows\(\)\.length\s*===\s*0/,
    "应检查窗口数量"
  );
  assert.match(onActivateBlock, /createPetWindow\(\)/, "应调用 createPetWindow()");
});

test("main.cjs onDisplayMetricsChanged handler 包含显示器变化逻辑", () => {
  // 在 lifecycleCallBlock 内提取 onDisplayMetricsChanged handler 块（最后一个 handler，闭合为 4 空格 + }）
  const onDisplayMetricsChangedBlock = lifecycleCallBlock.match(
    /onDisplayMetricsChanged\s*:\s*\(\s*_event\s*,\s*_display\s*,\s*metrics\s*\)\s*=>\s*\{([\s\S]*?)\n\s{4}\}/
  )?.[1] || "";
  assert.ok(onDisplayMetricsChangedBlock.length > 0, "应能提取 onDisplayMetricsChanged handler 内容");

  assert.match(
    onDisplayMetricsChangedBlock,
    /metrics\.includes\(\s*['"]workArea['"]\s*\)/,
    "应检查 metrics.includes('workArea')"
  );
  assert.match(
    onDisplayMetricsChangedBlock,
    /scheduleDarwinDisplayMetricsSettle\(\)/,
    "应调用 scheduleDarwinDisplayMetricsSettle()"
  );
});

test("main.cjs 包含 switch-variant 重启逻辑", () => {
  const handleSwitchVariantBlock = mainSource.match(/function handleSwitchVariant[\s\S]*?\n\}/)?.[0] || "";
  assert.ok(handleSwitchVariantBlock.length > 0, "应能提取 handleSwitchVariant 函数体");

  assert.match(handleSwitchVariantBlock, /app\.releaseSingleInstanceLock\(\)/, "应调用 app.releaseSingleInstanceLock()");
  assert.match(handleSwitchVariantBlock, /app\.relaunch\(\)/, "应调用 app.relaunch()");
  assert.match(handleSwitchVariantBlock, /app\.exit\(\)/, "应调用 app.exit()");
});

test("onReady handler 启动序列顺序正确", () => {
  const onReadyBlock = mainSource.match(/function runAppReadyStartupSequence\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(onReadyBlock.length > 0, "应能提取 runAppReadyStartupSequence 函数体");

  const idxReadPetScalePreference = onReadyBlock.indexOf("readPetScalePreference");
  const idxCreatePetWindow = onReadyBlock.indexOf("createPetWindow");
  const idxRememberHomeDisplay = onReadyBlock.indexOf("rememberHomeDisplay");
  const idxStartHoverPolling = onReadyBlock.indexOf("startHoverPolling");
  const idxStartWindowSurfacePolling = onReadyBlock.indexOf("startWindowSurfacePolling");

  assert.ok(idxReadPetScalePreference >= 0 && idxCreatePetWindow >= 0, "readPetScalePreference 和 createPetWindow 应存在");
  assert.ok(idxReadPetScalePreference < idxCreatePetWindow, "readPetScalePreference 应在 createPetWindow 之前");

  assert.ok(idxRememberHomeDisplay >= 0, "rememberHomeDisplay 应存在");
  assert.ok(idxRememberHomeDisplay < idxCreatePetWindow, "rememberHomeDisplay 应在 createPetWindow 之前");

  assert.ok(idxStartHoverPolling >= 0, "startHoverPolling 应存在");
  assert.ok(idxCreatePetWindow < idxStartHoverPolling, "createPetWindow 应在 startHoverPolling 之前");

  assert.ok(idxStartWindowSurfacePolling >= 0, "startWindowSurfacePolling 应存在");
  assert.ok(idxCreatePetWindow < idxStartWindowSurfacePolling, "createPetWindow 应在 startWindowSurfacePolling 之前");

  const idxUpdateWindowRoamPolling = onReadyBlock.indexOf("updateWindowRoamPolling");
  const idxUpdateEyeTrackingPolling = onReadyBlock.indexOf("updateEyeTrackingPolling");
  const idxStartIntimacyDecayTimer = onReadyBlock.indexOf("startIntimacyDecayTimer");
  const idxScheduleIdleGreeting = onReadyBlock.indexOf("scheduleIdleGreeting");
  const idxStartTabbyIdlePolling = onReadyBlock.indexOf("startTabbyIdlePolling");
  const idxRefreshAutoStartCacheAsync = onReadyBlock.indexOf("refreshAutoStartCacheAsync");

  assert.ok(idxUpdateWindowRoamPolling >= 0, "updateWindowRoamPolling 应存在");
  assert.ok(idxCreatePetWindow < idxUpdateWindowRoamPolling, "createPetWindow 应在 updateWindowRoamPolling 之前");

  assert.ok(idxUpdateEyeTrackingPolling >= 0, "updateEyeTrackingPolling 应存在");
  assert.ok(idxCreatePetWindow < idxUpdateEyeTrackingPolling, "createPetWindow 应在 updateEyeTrackingPolling 之前");

  assert.ok(idxStartIntimacyDecayTimer >= 0, "startIntimacyDecayTimer 应存在");
  assert.ok(idxCreatePetWindow < idxStartIntimacyDecayTimer, "createPetWindow 应在 startIntimacyDecayTimer 之前");

  assert.ok(idxScheduleIdleGreeting >= 0, "scheduleIdleGreeting 应存在");
  assert.ok(idxCreatePetWindow < idxScheduleIdleGreeting, "createPetWindow 应在 scheduleIdleGreeting 之前");

  assert.ok(idxStartTabbyIdlePolling >= 0, "startTabbyIdlePolling 应存在");
  assert.ok(idxCreatePetWindow < idxStartTabbyIdlePolling, "createPetWindow 应在 startTabbyIdlePolling 之前");

  assert.ok(idxRefreshAutoStartCacheAsync >= 0, "refreshAutoStartCacheAsync 应存在");
  assert.ok(idxCreatePetWindow < idxRefreshAutoStartCacheAsync, "createPetWindow 应在 refreshAutoStartCacheAsync 之前");
});

test("onBeforeQuit handler 退出清理顺序正确", () => {
  const onBeforeQuitBlock = mainSource.match(/function runAppBeforeQuitCleanupSequence\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(onBeforeQuitBlock.length > 0, "应能提取 runAppBeforeQuitCleanupSequence 函数体");

  const idxWritePetStats = onBeforeQuitBlock.indexOf("writePetStats");
  const idxStopHoverPolling = onBeforeQuitBlock.indexOf("stopHoverPolling");
  const idxClearDragState = onBeforeQuitBlock.indexOf("clearDragState");

  assert.ok(idxWritePetStats >= 0 && idxStopHoverPolling >= 0, "writePetStats 和 stopHoverPolling 应存在");
  assert.ok(idxWritePetStats < idxStopHoverPolling, "writePetStats 应在 stopHoverPolling 之前");

  assert.ok(idxClearDragState >= 0, "clearDragState 应存在");
  assert.ok(idxStopHoverPolling < idxClearDragState, "stopHoverPolling 应在 clearDragState 之前");
});

test("main.cjs 注入 onSecondInstance handler 调用 ensurePetWindow", () => {
  // 在 lifecycleCallBlock 内提取 onSecondInstance handler 块（到下一个 handler "onReady" 前）
  const onSecondInstanceBlock = lifecycleCallBlock.match(
    /onSecondInstance\s*:\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s{4}\},\s*\n\s{4}onReady/
  )?.[1] || "";
  assert.ok(onSecondInstanceBlock.length > 0, "应能提取 onSecondInstance handler 内容");

  assert.match(onSecondInstanceBlock, /ensurePetWindow\(\)/, "onSecondInstance handler 应调用 ensurePetWindow()");
});

test("main.cjs 注入 onWindowAllClosed handler 包含平台判断", () => {
  // 在 lifecycleCallBlock 内提取 onWindowAllClosed handler 块（到下一个 handler "onActivate" 前）
  const onWindowAllClosedBlock = lifecycleCallBlock.match(
    /onWindowAllClosed\s*:\s*\(\s*\)\s*=>\s*\{([\s\S]*?)\n\s{4}\},\s*\n\s{4}onActivate/
  )?.[1] || "";
  assert.ok(onWindowAllClosedBlock.length > 0, "应能提取 onWindowAllClosed handler 内容");

  assert.match(
    onWindowAllClosedBlock,
    /process\.platform\s*!==\s*['"]darwin['"]/,
    "应检查 process.platform !== 'darwin'"
  );
  assert.match(onWindowAllClosedBlock, /app\.quit\(\)/, "应调用 app.quit()");
});
