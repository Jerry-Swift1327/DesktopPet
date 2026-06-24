const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const moduleSource = fs.readFileSync(
  path.join(__dirname, "..", "electron", "lifecycle", "register-app-lifecycle.cjs"),
  "utf8"
);

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("模块导出 registerAppLifecycle 函数", () => {
  assert.match(moduleSource, /function registerAppLifecycle\(context\)/, "应定义 registerAppLifecycle(context) 函数");
  assert.match(
    moduleSource,
    /module\.exports\s*=\s*\{\s*registerAppLifecycle\s*\}/,
    "应导出 registerAppLifecycle"
  );
});

test("模块包含单实例锁失败分支", () => {
  assert.match(moduleSource, /if\s*\(\s*!gotSingleInstanceLock\s*\)/, "应包含 !gotSingleInstanceLock 判断");
  const lockFailBlock = moduleSource.match(/if\s*\(\s*!gotSingleInstanceLock\s*\)\s*\{([\s\S]*?)\}/)?.[1] || "";
  assert.ok(lockFailBlock.length > 0, "应能提取单实例锁失败分支");
  assert.match(lockFailBlock, /app\.quit\(\)/, "锁失败分支内应调用 app.quit()");
  assert.match(lockFailBlock, /return/, "锁失败分支内应包含 return");
});

test("模块注册 second-instance 事件", () => {
  assert.match(
    moduleSource,
    /app\.on\(\s*['"]second-instance['"]\s*,\s*onSecondInstance\)/,
    "应注册 second-instance 事件并绑定 onSecondInstance"
  );
});

test("模块注册 whenReady 事件", () => {
  assert.match(moduleSource, /app\.whenReady\(\)\.then\(/, "应注册 app.whenReady().then()");
  const whenReadyBlock = moduleSource.match(/app\.whenReady\(\)\.then\(\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);/)?.[1] || "";
  assert.ok(whenReadyBlock.length > 0, "应能提取 whenReady 块内容");
  assert.match(whenReadyBlock, /onReady\(\)/, "whenReady 块内应调用 onReady()");
});

test("模块注册 before-quit 事件", () => {
  assert.match(
    moduleSource,
    /app\.on\(\s*['"]before-quit['"]\s*,\s*onBeforeQuit\)/,
    "应注册 before-quit 事件并绑定 onBeforeQuit"
  );
});

test("模块注册 window-all-closed 事件", () => {
  assert.match(
    moduleSource,
    /app\.on\(\s*['"]window-all-closed['"]\s*,\s*onWindowAllClosed\)/,
    "应注册 window-all-closed 事件并绑定 onWindowAllClosed"
  );
});

test("模块注册 activate 事件（在 whenReady 回调内）", () => {
  assert.match(
    moduleSource,
    /app\.on\(\s*['"]activate['"]\s*,\s*onActivate\)/,
    "应注册 activate 事件并绑定 onActivate"
  );
  const whenReadyBlock = moduleSource.match(/app\.whenReady\(\)\.then\(\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);/)?.[1] || "";
  assert.ok(whenReadyBlock.length > 0, "应能提取 whenReady 块内容");
  assert.match(whenReadyBlock, /app\.on\(\s*['"]activate['"]/, "activate 应在 whenReady 回调内注册");
});

test("模块注册 display-metrics-changed 事件（在 whenReady 回调内，darwin 条件下）", () => {
  assert.match(
    moduleSource,
    /screen\.on\(\s*['"]display-metrics-changed['"]\s*,\s*onDisplayMetricsChanged\)/,
    "应注册 display-metrics-changed 事件并绑定 onDisplayMetricsChanged"
  );
  assert.match(
    moduleSource,
    /process\.platform\s*===\s*['"]darwin['"]/,
    "应检查 process.platform === 'darwin'"
  );
  const whenReadyBlock = moduleSource.match(/app\.whenReady\(\)\.then\(\(\)\s*=>\s*\{([\s\S]*?)\}\s*\);/)?.[1] || "";
  assert.ok(whenReadyBlock.length > 0, "应能提取 whenReady 块内容");
  assert.match(
    whenReadyBlock,
    /screen\.on\(\s*['"]display-metrics-changed['"]/,
    "display-metrics-changed 应在 whenReady 回调内注册"
  );
  assert.match(
    whenReadyBlock,
    /process\.platform\s*===\s*['"]darwin['"]/,
    "darwin 条件应在 whenReady 回调内"
  );
});

test("模块从 context 解构 handlers", () => {
  const contextBlock = moduleSource.match(/const\s*\{[\s\S]*?\}\s*=\s*context\s*;/)?.[0] || "";
  assert.ok(contextBlock.length > 0, "应能提取 context 解构块");
  assert.match(contextBlock, /\bapp\b/, "context 解构应包含 app");
  assert.match(contextBlock, /\bscreen\b/, "context 解构应包含 screen");
  assert.match(contextBlock, /\bprocess\b/, "context 解构应包含 process");
  assert.match(contextBlock, /\bgotSingleInstanceLock\b/, "context 解构应包含 gotSingleInstanceLock");
  assert.match(contextBlock, /\bhandlers\b/, "context 解构应包含 handlers");

  const handlersBlock = moduleSource.match(/const\s*\{[\s\S]*?\}\s*=\s*handlers\s*;/)?.[0] || "";
  assert.ok(handlersBlock.length > 0, "应能提取 handlers 解构块");
  const expectedHandlers = [
    "onSecondInstance",
    "onReady",
    "onBeforeQuit",
    "onWindowAllClosed",
    "onActivate",
    "onDisplayMetricsChanged"
  ];
  for (const name of expectedHandlers) {
    const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`);
    assert.match(handlersBlock, pattern, `handlers 解构应包含 ${name}`);
  }
});

test("模块不包含业务逻辑函数", () => {
  const forbiddenFunctions = [
    "readPetStats",
    "createPetWindow",
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
    "clearMenuHideTimer",
    "ensurePetWindow",
    "scheduleDarwinDisplayMetricsSettle",
    "rememberHomeDisplay",
    "refreshAutoStartCacheAsync",
    "startHoverPolling",
    "startWindowSurfacePolling",
    "updateWindowRoamPolling",
    "updateEyeTrackingPolling",
    "scheduleIdleGreeting",
    "startTabbyIdlePolling",
    "readAutoStartPreference",
    "readWindowRoamPreference",
    "readEyeTrackingPreference",
    "readPetScalePreference"
  ];
  for (const fn of forbiddenFunctions) {
    const pattern = new RegExp(`\\b${escapeRegex(fn)}\\b`);
    assert.doesNotMatch(moduleSource, pattern, `模块不应包含业务函数 ${fn}`);
  }
});

test("模块不引用宠物业务状态", () => {
  const forbiddenStates = [
    "petStats",
    "petScale",
    "activeState",
    "preferredPetScale",
    "interactionPauseReasons",
    "walkDirection",
    "walkTrackX",
    "randomGreetingTimer",
    "displayMetricsSettleTimer",
    "dragTimer",
    "dragState"
  ];
  for (const name of forbiddenStates) {
    const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`);
    assert.doesNotMatch(moduleSource, pattern, `模块不应引用业务状态 ${name}`);
  }
});
