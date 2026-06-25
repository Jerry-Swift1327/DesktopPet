const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "pet-stats-controller.cjs"), "utf8");

test("controller 不直接 require electron/fs/path", () => {
  assert.doesNotMatch(controllerSource, /require\("electron"/);
  assert.doesNotMatch(controllerSource, /require\("fs"/);
  assert.doesNotMatch(controllerSource, /require\("path"/);
});

test("controller 不直接访问窗口/IPC/bubble", () => {
  const forbidden = [
    "petWindow",
    "menuWindow",
    "hoverWindow",
    "safeSend",
    "broadcastToWindows",
    "showBubbleMessage"
  ];
  for (const pattern of forbidden) {
    assert.ok(!controllerSource.includes(pattern), `不应出现 ${pattern}`);
  }
});

test("controller 不直接使用 Math.random 或 new Date()", () => {
  assert.ok(!controllerSource.includes("Math.random"), "不应出现 Math.random");
  assert.ok(!controllerSource.includes("new Date()"), "不应出现 new Date()");
});

test("controller 导出 createPetStatsController", () => {
  assert.match(controllerSource, /module\.exports = \{\s*createPetStatsController\s*\}/);
});

test("controller 内部声明 6 个状态", () => {
  assert.match(controllerSource, /let petStats = null;/);
  assert.match(controllerSource, /let intimacyDecayTimer = null;/);
  assert.match(controllerSource, /let lastIntimacyDecayAt = context\.getNow\(\);/);
  assert.match(controllerSource, /let lastFullnessDecayAt = context\.getNow\(\);/);
  assert.match(controllerSource, /let lastHealthDecayAt = context\.getNow\(\);/);
  assert.match(controllerSource, /let lastHealthRecoveryAt = context\.getNow\(\);/);
});

test("controller 不声明无关状态副本（如 windowRoam*）", () => {
  assert.doesNotMatch(controllerSource, /let windowRoam\w+/);
  assert.doesNotMatch(controllerSource, /let walkLoop\w*/);
  assert.doesNotMatch(controllerSource, /let dragState/);
});

test("controller context 解构包含必要访问器与常量", () => {
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";

  const requiredAccessors = [
    "petStatsRules",
    "petStatsStore",
    "getNow",
    "randomStatDelta",
    "pickStatMessage",
    "onStatsChanged",
    "onStatMessages",
    "getWalkLoop",
    "getWalkPausedAt",
    "getLastUserOperationAt",
    "getLastTabbyUserOperationAt",
    "getTabbySleepPoseSwitchAt",
    "getWalkLoopRemainingMs",
    "getLocalDateKey",
    "daysBetween",
    "petStatsStateConstants"
  ];
  for (const accessor of requiredAccessors) {
    assert.match(contextBlock, new RegExp(accessor), `context 应包含 ${accessor}`);
  }

  const requiredConstants = [
    "INTIMACY_DECAY_INTERVAL_MS",
    "PET_STAT_MAX",
    "IDLE_GREETING_DELAY_MS",
    "TABBY_YAWN_IDLE_MS",
    "TABBY_SLEEP_POSE_MS",
    "WALK_LOOP_DURATION_MS",
    "INTERACTION_INTIMACY_GAIN_MIN",
    "INTERACTION_INTIMACY_GAIN_MAX"
  ];
  for (const constant of requiredConstants) {
    assert.match(contextBlock, new RegExp(constant), `context 应包含 ${constant}`);
  }
});

test("controller 导出 15 个函数", () => {
  // 控制器内多处 return {...}（如 buildTimerSummary），取最后一个 return {...}; 块作为导出对象
  const matches = [...controllerSource.matchAll(/return \{([\s\S]*?)\};/g)];
  const exportBlock = matches.length > 0 ? matches[matches.length - 1][1] : "";
  const expectedExports = [
    "normalizePetStats",
    "readPetStats",
    "writePetStats",
    "syncDailyStats",
    "buildTimerSummary",
    "buildStatsSummary",
    "resumeNaturalStatsTimers",
    "applyNaturalStatsTick",
    "startIntimacyDecayTimer",
    "stopIntimacyDecayTimer",
    "recordInteraction",
    "updateStatPromptState",
    "applyActionStats",
    "applyInterruptedWalkStats",
    "applyCompletedWalkStats"
  ];
  for (const fn of expectedExports) {
    assert.match(exportBlock, new RegExp(fn), `导出对象应包含 ${fn}`);
  }
});

// 第九轮 B5：controller 调用 rules/store 模块函数（不重写规则与文件读写），timer 所有权在控制器
test("controller 调用 rules 模块函数（不重写规则）", () => {
  assert.match(controllerSource, /petStatsRules\.normalizePetStats/, "应调用 petStatsRules.normalizePetStats");
  assert.match(controllerSource, /petStatsRules\.createDefaultPetStats/, "应调用 petStatsRules.createDefaultPetStats");
  assert.match(controllerSource, /petStatsRules\.applyDailyDecay/, "应调用 petStatsRules.applyDailyDecay");
  assert.match(controllerSource, /petStatsRules\.applyPromptStateRules/, "应调用 petStatsRules.applyPromptStateRules");
  assert.match(controllerSource, /petStatsRules\.applyNaturalStatsTickRules/, "应调用 petStatsRules.applyNaturalStatsTickRules");
  assert.match(controllerSource, /petStatsRules\.applyActionStatsRules/, "应调用 petStatsRules.applyActionStatsRules");
  assert.match(controllerSource, /petStatsRules\.applyCompletedWalkStatsRules/, "应调用 petStatsRules.applyCompletedWalkStatsRules");
  assert.match(controllerSource, /petStatsRules\.recordInteractionRules/, "应调用 petStatsRules.recordInteractionRules");
});

test("controller 调用 store 模块函数（不重写文件读写）", () => {
  assert.match(controllerSource, /petStatsStore\.readPetStatsFile/, "应调用 petStatsStore.readPetStatsFile");
  assert.match(controllerSource, /petStatsStore\.writePetStatsFile/, "应调用 petStatsStore.writePetStatsFile");
});

test("controller 拥有 intimacyDecayTimer（setInterval/clearInterval）", () => {
  assert.match(controllerSource, /setInterval\(/, "应使用 setInterval 创建 timer");
  assert.match(controllerSource, /clearInterval\(/, "应使用 clearInterval 清除 timer");
});

test("controller 不直接引用 STATE_* 常量（通过 petStatsStateConstants 注入）", () => {
  // STATE_SQUAT 等应通过 petStatsStateConstants.squat 访问，不直接 require petActionIds 或引用 STATE_*
  assert.doesNotMatch(controllerSource, /STATE_SQUAT|STATE_FEED|STATE_LIE|STATE_LICK|STATE_BELLY|STATE_STRETCH/);
  assert.match(controllerSource, /petStatsStateConstants\.squat/);
});
