const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  clampStat,
  getLocalDateKey,
  daysBetween,
  createDefaultPetStats,
  normalizePetStats,
  applyDailyDecay,
  applyPromptStateRules,
  applyNaturalStatsTickRules,
  applyActionStatsRules,
  applyCompletedWalkStatsRules,
  recordInteractionRules
} = require("../electron/pet/pet-stats-rules.cjs");

// 结构断言：读取 rules 源码，确保纯规则边界不被回归
// 剥离注释后再做字符串检查，避免文档性注释（如首行"不依赖 .../Math.random/..."）误触断言
const rulesSource = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "pet-stats-rules.cjs"), "utf8");
const rulesSourceCode = rulesSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");
const {
  INTIMACY_DECAY_INTERVAL_MS,
  HEALTH_RECOVERY_INTERVAL_MS,
  PET_INTIMACY_DEFAULT,
  PET_FULLNESS_DEFAULT,
  PET_HEALTH_DEFAULT
} = require("../electron/core/app-constants.cjs");

// 辅助：构造一份完整的默认 stats，避免测试间状态污染
function makeBaseStats(overrides = {}) {
  return {
    firstRunDate: "2026-06-26",
    interactionDate: "2026-06-26",
    todayInteractions: 0,
    intimacy: PET_INTIMACY_DEFAULT,
    fullness: PET_FULLNESS_DEFAULT,
    health: PET_HEALTH_DEFAULT,
    hungerPromptLevel: 0,
    healthPromptLevel: 0,
    fullPrompted: false,
    closePrompted: false,
    lastInteractionAt: 1000,
    lastIntimacyDecayAt: 1000,
    lastFullnessDecayAt: 1000,
    lastHealthDecayAt: 1000,
    lastHealthRecoveryAt: 1000,
    lastStatsActiveAt: 1000,
    ...overrides
  };
}

// stateConstants：与 pet-stats-rules.cjs 注释一致，由调用方传入做相等比较
const STATE_CONSTANTS = {
  squat: "squat",
  feed: "feed",
  lie: "lie",
  lick: "lick",
  belly: "belly",
  stretch: "stretch"
};

// clampStat：将数值钳制到 [0, 100] 并做 Math.round
test("clampStat 将负数钳为下界 0", () => {
  assert.equal(clampStat(-5), 0);
});

test("clampStat 将超上限值钳为 100", () => {
  assert.equal(clampStat(150), 100);
});

test("clampStat 非数值输入返回 0", () => {
  assert.equal(clampStat("abc"), 0);
});

test("clampStat 保留区间内整数", () => {
  assert.equal(clampStat(50), 50);
});

test("clampStat 对小数做 Math.round", () => {
  assert.equal(clampStat(50.6), 51);
});

// getLocalDateKey：本地日期格式化为 YYYY-MM-DD（month 为 0-based）
test("getLocalDateKey 格式化日期为 YYYY-MM-DD", () => {
  assert.equal(getLocalDateKey(new Date(2026, 5, 26)), "2026-06-26");
});

test("getLocalDateKey 处理 1 月日期", () => {
  assert.equal(getLocalDateKey(new Date(2026, 0, 1)), "2026-01-01");
});

// daysBetween：Math.max(1, floor((end-start)/86400000) + 1)
test("daysBetween 跨一天返回 2", () => {
  assert.equal(daysBetween("2026-06-25", "2026-06-26"), 2);
});

test("daysBetween 同一天返回 1", () => {
  assert.equal(daysBetween("2026-06-26", "2026-06-26"), 1);
});

test("daysBetween 跨两天返回 3", () => {
  assert.equal(daysBetween("2026-06-24", "2026-06-26"), 3);
});

// createDefaultPetStats：返回所有默认字段
test("createDefaultPetStats 返回所有默认字段", () => {
  const stats = createDefaultPetStats(1000, "2026-06-26");
  assert.deepEqual(stats, {
    firstRunDate: "2026-06-26",
    interactionDate: "2026-06-26",
    todayInteractions: 0,
    intimacy: 50,
    fullness: 50,
    health: 100,
    hungerPromptLevel: 0,
    healthPromptLevel: 0,
    fullPrompted: false,
    closePrompted: false,
    lastInteractionAt: 1000,
    lastIntimacyDecayAt: 1000,
    lastFullnessDecayAt: 1000,
    lastHealthDecayAt: 1000,
    lastHealthRecoveryAt: 1000,
    lastStatsActiveAt: 1000
  });
});

// normalizePetStats：钳制越界字段并补全缺失字段
test("normalizePetStats 钳制越界字段并补全缺失字段", () => {
  const stats = normalizePetStats({ intimacy: 200, fullness: "x" }, 1000);
  assert.equal(stats.intimacy, 100);
  assert.equal(stats.fullness, 50);
  assert.equal(stats.health, 100);
  assert.equal(stats.lastInteractionAt, 1000);
  assert.equal(stats.lastIntimacyDecayAt, 1000);
  assert.equal(stats.lastFullnessDecayAt, 1000);
  assert.equal(stats.lastHealthDecayAt, 1000);
  assert.equal(stats.lastHealthRecoveryAt, 1000);
  assert.equal(stats.lastStatsActiveAt, 1000);
});

test("normalizePetStats 对空对象补全全部默认值", () => {
  const stats = normalizePetStats({}, 1000);
  assert.equal(stats.intimacy, 50);
  assert.equal(stats.fullness, 50);
  assert.equal(stats.health, 100);
  assert.equal(stats.hungerPromptLevel, 0);
  assert.equal(stats.healthPromptLevel, 0);
  assert.equal(stats.fullPrompted, false);
  assert.equal(stats.closePrompted, false);
  assert.equal(stats.lastInteractionAt, 1000);
  assert.equal(stats.lastIntimacyDecayAt, 1000);
  assert.equal(stats.lastFullnessDecayAt, 1000);
  assert.equal(stats.lastHealthDecayAt, 1000);
  assert.equal(stats.lastHealthRecoveryAt, 1000);
  assert.equal(stats.lastStatsActiveAt, 1000);
});

test("normalizePetStats 保留已存在的 last*At 字段", () => {
  const stats = normalizePetStats(
    { intimacy: 30, fullness: 40, health: 50, lastIntimacyDecayAt: 500 },
    1000
  );
  assert.equal(stats.intimacy, 30);
  assert.equal(stats.fullness, 40);
  assert.equal(stats.health, 50);
  assert.equal(stats.lastIntimacyDecayAt, 500);
  assert.equal(stats.lastFullnessDecayAt, 1000);
  assert.equal(stats.lastHealthDecayAt, 1000);
  assert.equal(stats.lastHealthRecoveryAt, 1000);
  assert.equal(stats.lastStatsActiveAt, 1000);
});

// applyDailyDecay：DAILY_DECAY_*=0 时主要属性不变，但仍执行提示标记重置
test("applyDailyDecay 在 DAILY_DECAY 为 0 时不改变主要属性并返回 false", () => {
  const stats = makeBaseStats({ intimacy: 50, fullness: 50, health: 50 });
  const changed = applyDailyDecay(stats, 2);
  assert.equal(changed, false);
  assert.equal(stats.intimacy, 50);
  assert.equal(stats.fullness, 50);
  assert.equal(stats.health, 50);
});

test("applyDailyDecay 在满状态时重置提示标记", () => {
  const stats = makeBaseStats({
    intimacy: 50,
    fullness: 80,
    health: 80,
    hungerPromptLevel: 2,
    healthPromptLevel: 1,
    fullPrompted: true,
    closePrompted: true
  });
  const changed = applyDailyDecay(stats, 1);
  // DAILY_DECAY_*=0，主要属性不变故 changed=false
  assert.equal(changed, false);
  assert.equal(stats.fullness, 80);
  assert.equal(stats.health, 80);
  // fullness=80 > HUNGER_PROMPT_CLEAR_THRESHOLD(70) → hungerPromptLevel 清零
  assert.equal(stats.hungerPromptLevel, 0);
  // health=80 > HEALTH_PROMPT_CLEAR_THRESHOLD(65) → healthPromptLevel 清零
  assert.equal(stats.healthPromptLevel, 0);
  // fullness=80 < FULL_PROMPT_RESET_THRESHOLD(90) → fullPrompted 重置为 false
  assert.equal(stats.fullPrompted, false);
  // intimacy=50 < CLOSE_PROMPT_RESET_THRESHOLD(96) → closePrompted 重置为 false
  assert.equal(stats.closePrompted, false);
});

// applyPromptStateRules：根据 stats 触发对应提示并更新标记
test("applyPromptStateRules fullness=0 触发 exhausted 并设 level=3", () => {
  const stats = makeBaseStats({ fullness: 0, hungerPromptLevel: 0, health: 100, intimacy: 50 });
  const prompts = applyPromptStateRules(stats);
  assert.deepEqual(prompts, ["exhausted"]);
  assert.equal(stats.hungerPromptLevel, 3);
});

test("applyPromptStateRules fullness<=24 触发 hungry 并设 level=2", () => {
  const stats = makeBaseStats({ fullness: 20, hungerPromptLevel: 0, health: 100, intimacy: 50 });
  const prompts = applyPromptStateRules(stats);
  assert.deepEqual(prompts, ["hungry"]);
  assert.equal(stats.hungerPromptLevel, 2);
});

test("applyPromptStateRules fullness<=44 触发 needFood 并设 level=1", () => {
  const stats = makeBaseStats({ fullness: 30, hungerPromptLevel: 0, health: 100, intimacy: 50 });
  const prompts = applyPromptStateRules(stats);
  assert.deepEqual(prompts, ["needFood"]);
  assert.equal(stats.hungerPromptLevel, 1);
});

test("applyPromptStateRules health<=34 触发 tired 并设 level=1", () => {
  const stats = makeBaseStats({ fullness: 100, health: 30, healthPromptLevel: 0, intimacy: 50 });
  const prompts = applyPromptStateRules(stats);
  assert.deepEqual(prompts, ["tired"]);
  assert.equal(stats.healthPromptLevel, 1);
});

test("applyPromptStateRules health>=82 时清除 tired 标记", () => {
  const stats = makeBaseStats({ fullness: 100, health: 85, healthPromptLevel: 1, intimacy: 50 });
  const prompts = applyPromptStateRules(stats);
  // health=85 > HEALTH_PROMPT_CLEAR_THRESHOLD(65)，先清除 healthPromptLevel=0
  // 随后 recovered 检查要求 healthPromptLevel > 0，已被清除故不触发 "recovered"
  assert.equal(stats.healthPromptLevel, 0);
  assert.ok(!prompts.includes("recovered"));
});

test("applyPromptStateRules intimacy>=98 触发 close 并置 closePrompted=true", () => {
  const stats = makeBaseStats({ fullness: 100, health: 100, intimacy: 99, closePrompted: false });
  const prompts = applyPromptStateRules(stats);
  assert.deepEqual(prompts, ["close"]);
  assert.equal(stats.closePrompted, true);
});

test("applyPromptStateRules fullness>70 时清除 hungerPromptLevel 且无提示", () => {
  const stats = makeBaseStats({ fullness: 75, hungerPromptLevel: 2, health: 100, intimacy: 50 });
  const prompts = applyPromptStateRules(stats);
  assert.deepEqual(prompts, []);
  assert.equal(stats.hungerPromptLevel, 0);
});

// applyNaturalStatsTickRules：基于 decayRefs 计算衰减与恢复，不修改 decayRefs 原对象
test("applyNaturalStatsTickRules 亲密度衰减一步", () => {
  const stats = makeBaseStats({
    intimacy: 50,
    fullness: 100,
    health: 100,
    hungerPromptLevel: 0,
    healthPromptLevel: 0,
    fullPrompted: false,
    closePrompted: false
  });
  const decayRefs = { lastIntimacyDecayAt: 0 };
  const result = applyNaturalStatsTickRules(stats, INTIMACY_DECAY_INTERVAL_MS, decayRefs);
  assert.equal(result.changed, true);
  assert.equal(stats.intimacy, 49);
  assert.equal(result.updates.lastIntimacyDecayAt, INTIMACY_DECAY_INTERVAL_MS);
  assert.equal(stats.lastIntimacyDecayAt, INTIMACY_DECAY_INTERVAL_MS);
});

test("applyNaturalStatsTickRules 不修改 decayRefs 原对象", () => {
  const stats = makeBaseStats({ intimacy: 50, fullness: 100, health: 100 });
  const decayRefs = { lastIntimacyDecayAt: 0 };
  applyNaturalStatsTickRules(stats, INTIMACY_DECAY_INTERVAL_MS, decayRefs);
  assert.equal(decayRefs.lastIntimacyDecayAt, 0);
});

test("applyNaturalStatsTickRules 无衰减时 changed=false 且 updates 为空", () => {
  const stats = makeBaseStats({ intimacy: 50, fullness: 100, health: 100 });
  const now = INTIMACY_DECAY_INTERVAL_MS;
  const decayRefs = {
    lastIntimacyDecayAt: now,
    lastFullnessDecayAt: now,
    lastHealthDecayAt: now,
    lastHealthRecoveryAt: now
  };
  const result = applyNaturalStatsTickRules(stats, now, decayRefs);
  assert.equal(result.changed, false);
  assert.deepEqual(result.updates, {});
});

test("applyNaturalStatsTickRules 满足恢复条件时恢复 health", () => {
  const stats = makeBaseStats({
    intimacy: 90,
    fullness: 90,
    health: 50,
    hungerPromptLevel: 0,
    healthPromptLevel: 0,
    fullPrompted: false,
    closePrompted: false
  });
  const now = HEALTH_RECOVERY_INTERVAL_MS;
  const decayRefs = {
    lastIntimacyDecayAt: now,
    lastFullnessDecayAt: now,
    lastHealthDecayAt: now,
    lastHealthRecoveryAt: 0
  };
  const result = applyNaturalStatsTickRules(stats, now, decayRefs);
  assert.equal(result.changed, true);
  assert.equal(stats.health, 52);
  assert.equal(result.updates.lastHealthRecoveryAt, HEALTH_RECOVERY_INTERVAL_MS);
  assert.equal(stats.lastHealthRecoveryAt, HEALTH_RECOVERY_INTERVAL_MS);
});

// applyActionStatsRules：根据 stateId 应用对应属性变化
test("applyActionStatsRules feed 设满 fullness 并增加 intimacy", () => {
  const stats = makeBaseStats({
    intimacy: 50,
    fullness: 50,
    health: 100,
    fullPrompted: true
  });
  applyActionStatsRules(stats, STATE_CONSTANTS.feed, {
    intimacyGainDelta: 5,
    stateConstants: STATE_CONSTANTS
  });
  assert.equal(stats.fullness, 100);
  assert.equal(stats.intimacy, 55);
});

test("applyActionStatsRules feed 满时返回 full 提示", () => {
  const stats = makeBaseStats({
    intimacy: 50,
    fullness: 50,
    health: 100,
    fullPrompted: false
  });
  const result = applyActionStatsRules(stats, STATE_CONSTANTS.feed, {
    intimacyGainDelta: 5,
    stateConstants: STATE_CONSTANTS
  });
  assert.ok(result.prompts.includes("full"));
  assert.equal(stats.fullPrompted, true);
  assert.equal(stats.fullness, 100);
});

test("applyActionStatsRules lie 增加 health", () => {
  const stats = makeBaseStats({ intimacy: 50, fullness: 100, health: 50, fullPrompted: true });
  applyActionStatsRules(stats, STATE_CONSTANTS.lie, {
    intimacyGainDelta: 5,
    stateConstants: STATE_CONSTANTS
  });
  assert.equal(stats.health, 52);
  assert.equal(stats.intimacy, 55);
});

test("applyActionStatsRules lick 增加 health", () => {
  const stats = makeBaseStats({ intimacy: 50, fullness: 100, health: 50, fullPrompted: true });
  applyActionStatsRules(stats, STATE_CONSTANTS.lick, {
    intimacyGainDelta: 5,
    stateConstants: STATE_CONSTANTS
  });
  assert.equal(stats.health, 51);
});

test("applyActionStatsRules belly 消耗 fullness", () => {
  const stats = makeBaseStats({ intimacy: 50, fullness: 50, health: 100, fullPrompted: true });
  applyActionStatsRules(stats, STATE_CONSTANTS.belly, {
    intimacyGainDelta: 5,
    stateConstants: STATE_CONSTANTS
  });
  assert.equal(stats.fullness, 49);
});

test("applyActionStatsRules stretch 增加 health 并消耗 fullness", () => {
  const stats = makeBaseStats({ intimacy: 50, fullness: 50, health: 50, fullPrompted: true });
  applyActionStatsRules(stats, STATE_CONSTANTS.stretch, {
    intimacyGainDelta: 5,
    stateConstants: STATE_CONSTANTS
  });
  assert.equal(stats.health, 52);
  assert.equal(stats.fullness, 49);
});

test("applyActionStatsRules squat 不增加 intimacy", () => {
  const stats = makeBaseStats({ intimacy: 50, fullness: 100, health: 100, fullPrompted: true });
  applyActionStatsRules(stats, STATE_CONSTANTS.squat, {
    intimacyGainDelta: 5,
    stateConstants: STATE_CONSTANTS
  });
  assert.equal(stats.intimacy, 50);
});

// applyCompletedWalkStatsRules：散步完成后增加 intimacy
test("applyCompletedWalkStatsRules 增加 intimacy 并返回 prompts", () => {
  const stats = makeBaseStats({ intimacy: 50, fullness: 100, health: 100, fullPrompted: true });
  const result = applyCompletedWalkStatsRules(stats, { intimacyGainDelta: 7 });
  assert.equal(stats.intimacy, 57);
  assert.ok(Array.isArray(result.prompts));
});

// recordInteractionRules：记录互动时间并累加当日互动次数
test("recordInteractionRules 更新 lastInteractionAt 并累加 todayInteractions", () => {
  const stats = makeBaseStats({ lastInteractionAt: 0, todayInteractions: 0 });
  recordInteractionRules(stats, 1000);
  assert.equal(stats.lastInteractionAt, 1000);
  assert.equal(stats.todayInteractions, 1);
});

// 结构断言：rules 模块纯规则边界
test("rules 不 require electron/fs/path", () => {
  assert.ok(!rulesSourceCode.includes("require(\"electron\""), "rules 不应 require electron");
  assert.ok(!rulesSourceCode.includes("require('electron'"), "rules 不应 require electron");
  assert.ok(!rulesSourceCode.includes("require(\"fs\""), "rules 不应 require fs");
  assert.ok(!rulesSourceCode.includes("require('fs'"), "rules 不应 require fs");
  assert.ok(!rulesSourceCode.includes("require(\"path\""), "rules 不应 require path");
  assert.ok(!rulesSourceCode.includes("require('path'"), "rules 不应 require path");
});

test("rules 不使用 Math.random", () => {
  assert.ok(!rulesSourceCode.includes("Math.random"), "rules 不应使用 Math.random");
});

test("rules 不出现 new Date()", () => {
  assert.ok(!rulesSourceCode.includes("new Date()"), "rules 不应出现 new Date()");
});
