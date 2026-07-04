const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const appConstantsSource = fs.readFileSync(path.join(__dirname, "..", "electron", "core", "app-constants.cjs"), "utf8");
const runtimeConfigSource = fs.readFileSync(path.join(__dirname, "..", "electron", "core", "runtime-config.cjs"), "utf8");
const assetLoaderSource = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "asset-loader.cjs"), "utf8");
// 动作属性规则已抽到 pet-stats-rules.cjs，结构断言需读取 rules 源码
const petStatsRulesSource = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "pet-stats-rules.cjs"), "utf8");
// buildTimerSummary 已迁入 pet-stats-controller.cjs，timer 公式断言需读取 controller 源码
const petStatsControllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "pet-stats-controller.cjs"), "utf8");
// 渲染层已拆分到 renderer/ 目录下多个模块，测试需读取所有模块内容
const rendererSource = ["shared", "pet-window", "menu-window", "hover-window", "bubble-window", "customization-window"]
  .map((name) => fs.readFileSync(path.join(__dirname, "..", "static", "renderer", `${name}.js`), "utf8"))
  .join("\n");

test("tabby extra actions settle stats at the right time", () => {
  const delayBody = mainSource.match(/function shouldDelayActionStats\(stateId\) \{\s*return ([^;]+);/s)?.[1] || "";

  assert.doesNotMatch(delayBody, /STATE_LIE/);
  assert.match(delayBody, /STATE_LICK/);
  assert.match(delayBody, /STATE_BELLY/);
  assert.match(delayBody, /STATE_STRETCH/);
  assert.match(delayBody, /STATE_SPLITS/);
});

test("tabby lie loops instead of completing as a one-shot action", () => {
  const oneShotStates = mainSource.match(/const ONE_SHOT_STATES = new Set\(\[([^\]]+)\]\);/)?.[1] || "";

  assert.doesNotMatch(oneShotStates, /STATE_LIE/);
  assert.match(rendererSource, /state\?\.id === actionIds\.lie && isActive/);
});

test("tabby sleep purr plays once when sleep starts", () => {
  assert.match(rendererSource, /sleepSound\.addEventListener\("ended"/);
  assert.doesNotMatch(rendererSource, /sleepSound\.loop = true/);
  assert.match(rendererSource, /sleepStageSoundPlayed/);
  assert.match(rendererSource, /sleepStageFrameReported/);
  assert.match(rendererSource, /getStateFrameIndex\(state\) >= state\.tailLoopStart/);
  assert.doesNotMatch(rendererSource.match(/window\.desktopPet\.onStateChanged\(\(state\) => \{[\s\S]*?\n  \}\);/)?.[0] || "", /sleepStageSoundPlayed = false/);
});

test("tabby extra actions update hover panel stats", () => {
  // 第九轮 A：动作属性规则迁至 pet-stats-rules.cjs；第九轮 B4 起 main.cjs 经 petStatsController.applyActionStats 委托，applyActionStatsRules 调用迁入控制器
  assert.match(petStatsControllerSource, /applyActionStatsRules\(petStats, stateId,/);
  assert.match(petStatsRulesSource, /stateId === stateConstants\.lie[\s\S]*stats\.health/);
  assert.match(petStatsRulesSource, /stateId === stateConstants\.lick[\s\S]*stats\.health/);
  assert.match(petStatsRulesSource, /stateId === stateConstants\.belly[\s\S]*stats\.fullness/);
  assert.match(petStatsRulesSource, /stateId === stateConstants\.stretch[\s\S]*stats\.health[\s\S]*stats\.fullness/);
});

test("tabby idle actions run outside the idle greeting timer", () => {
  assert.match(mainSource, /tabbyIdlePollTimer = setInterval\(updateTabbyIdleActions, 1000\)/);
  assert.match(appConstantsSource, /const TABBY_YAWN_IDLE_MS = 2 \* 60 \* 1000/);
  // buildTimerSummary 已迁入 controller，公式经 getLastTabbyUserOperationAt() 读取
  assert.match(petStatsControllerSource, /nextTabbyYawnInMs: Math\.max\(0, TABBY_YAWN_IDLE_MS - \(now - getLastTabbyUserOperationAt\(\)\)\)/);
  assert.match(mainSource, /setState\(STATE_YAWN, false\)/);
  assert.match(mainSource, /const TABBY_IDLE_STATES = new Set\(\[STATE_YAWN, STATE_SLEEP, STATE_HISS\]\)/);
  assert.match(rendererSource, /tailLoopStart \+ \(\(frameStep - tailLoopStart\) % Math\.max\(1, stepCount - tailLoopStart\)\)/);
  assert.match(appConstantsSource, /const TABBY_SLEEP_POSE_MS = 2 \* 60 \* 1000/);
  // buildTimerSummary 已迁入 controller，公式经 getTabbySleepPoseSwitchAt() 读取
  assert.match(petStatsControllerSource, /nextTabbySleepPoseInMs: Math\.max\(0, getTabbySleepPoseSwitchAt\(\) - now\)/);
  assert.match(mainSource, /tabbySleepPoseSwitchAt = Date\.now\(\) \+ TABBY_SLEEP_POSE_MS/);
  assert.match(mainSource, /readMetadata\(getState\(renderedFrameState\)\.metadata\)\.tailLoopStart/);
  assert.match(mainSource, /scheduleTabbySleepPose\(STATE_YAWN\)/);
  assert.match(mainSource, /setState\(activeState === STATE_SLEEP \? STATE_YAWN : STATE_SLEEP, false\)/);
  assert.match(rendererSource, /renderedKey !== lastRenderedFrameKey \|\| shouldReportSleepStage/);
  assert.match(rendererSource, /previousState === config\.actionIds\?\.sleep && state === config\.actionIds\?\.yawn/);
});

test("packaged runtime validates the external assets root first", () => {
  const getAssetsRootBody = assetLoaderSource.match(/function getAssetsRoot\(\) \{([\s\S]*?)function listFrames/)?.[1] || "";

  assert.match(getAssetsRootBody, /path\.join\(process\.resourcesPath, "assets"\)/);
  assert.match(getAssetsRootBody, /frame_000\.png/);
  assert.match(getAssetsRootBody, /assets root:/);
});

test("packaged custom variants are not overridden by dog or cat preference", () => {
  const runtimeConfigBody = runtimeConfigSource.match(/function readPetRuntimeConfig\(\) \{([\s\S]*?)function getBasePetVariant/)?.[1] || "";

  assert.match(runtimeConfigBody, /SWITCHABLE_VARIANTS\.includes\(fileConfig\.variant\)/);
  assert.match(runtimeConfigBody, /\.\.\.\(preferredVariant \? \{ variant: preferredVariant \} : \{\}\)/);
});

test("sleeping tabby wakes from a short left click instead of double click", () => {
  assert.match(rendererSource, /SLEEP_WAKE_CLICK_MAX_MS/);
  assert.match(rendererSource, /window\.desktopPet\.wakeSleepingPet\(\)/);
  assert.match(mainSource, /activeState !== STATE_YAWN && activeState !== STATE_SLEEP/);
  assert.doesNotMatch(rendererSource, /addEventListener\("dblclick"/);
});

test("sleeping tabby hover pauses sleep instead of hissing", () => {
  const mouseEnterBody = rendererSource.match(/img\.addEventListener\("mouseenter", \(\) => \{([\s\S]*?)\n  \}\);/)?.[1] || "";

  assert.match(mainSource, /petRuntimeConfig\.features\.wakeHiss && activeState === STATE_HISS/);
  assert.match(mainSource, /clearHoverIntent\(\);\s*hideHoverPanel\(\);\s*setState\(STATE_HISS, false\)/);
  assert.match(rendererSource, /isSleepStage\(\) && sleepSound/);
});

test("tabby release hover panel shows the yawn timer", () => {
  assert.match(rendererSource, /data-timer="yawn"/);
  assert.match(rendererSource, /Yawn\\n\$\{formatTimer\(\(timers\.nextTabbyYawnInMs \|\| 0\) - elapsedSinceSnapshot\)\}/);
});

test("tabby release hover panel shows the sleep pose timer", () => {
  assert.match(rendererSource, /data-timer="sleep-pose"/);
  assert.match(rendererSource, /Pose\\n\$\{formatTimer\(\(timers\.nextTabbySleepPoseInMs \|\| 0\) - elapsedSinceSnapshot\)\}/);
});

//  收尾结构断言：main.cjs 不再解构已迁入 rules 的 stats 规则常量
test("main.cjs 不解构已迁入 rules 的 stats 规则常量", () => {
  assert.ok(!mainSource.includes("STAT_NATURAL_DELTA"), "main.cjs 不应再解构 STAT_NATURAL_DELTA");
  assert.ok(!mainSource.includes("FEED_FULLNESS_GAIN_MIN"), "main.cjs 不应再解构 FEED_FULLNESS_GAIN_MIN");
  assert.ok(!mainSource.includes("FEED_FULLNESS_GAIN_MAX"), "main.cjs 不应再解构 FEED_FULLNESS_GAIN_MAX");
  assert.ok(!mainSource.includes("LIE_HEALTH_GAIN"), "main.cjs 不应再解构 LIE_HEALTH_GAIN");
  assert.ok(!mainSource.includes("DAILY_DECAY_FULLNESS"), "main.cjs 不应再解构 DAILY_DECAY_FULLNESS");
  assert.ok(!mainSource.includes("PET_INTIMACY_DEFAULT"), "main.cjs 不应再解构 PET_INTIMACY_DEFAULT");
  assert.ok(!mainSource.includes("HEALTH_RECOVERY_THRESHOLD"), "main.cjs 不应再解构 HEALTH_RECOVERY_THRESHOLD");
});

test("randomStatDelta 不引用 STAT_CHANGE_MIN/STAT_CHANGE_MAX", () => {
  assert.ok(!mainSource.includes("STAT_CHANGE_MIN"), "randomStatDelta 不应引用 STAT_CHANGE_MIN");
  assert.ok(!mainSource.includes("STAT_CHANGE_MAX"), "randomStatDelta 不应引用 STAT_CHANGE_MAX");
});

// 第九轮 B：main.cjs 不再持有 stats 运行态（petStats/intimacyDecayTimer/last*DecayAt 已迁入 pet-stats-controller）
test("main.cjs 不再声明 stats 运行态 let", () => {
  assert.ok(!mainSource.includes("let petStats ="), "main.cjs 不应再声明 let petStats");
  assert.ok(!mainSource.includes("let intimacyDecayTimer ="), "main.cjs 不应再声明 let intimacyDecayTimer");
  assert.ok(!mainSource.includes("let lastIntimacyDecayAt ="), "main.cjs 不应再声明 let lastIntimacyDecayAt");
  assert.ok(!mainSource.includes("let lastFullnessDecayAt ="), "main.cjs 不应再声明 let lastFullnessDecayAt");
  assert.ok(!mainSource.includes("let lastHealthDecayAt ="), "main.cjs 不应再声明 let lastHealthDecayAt");
  assert.ok(!mainSource.includes("let lastHealthRecoveryAt ="), "main.cjs 不应再声明 let lastHealthRecoveryAt");
});

test("main.cjs 不再直接写 stats 字段", () => {
  assert.ok(!mainSource.includes("petStats.intimacy ="), "main.cjs 不应再直接写 petStats.intimacy");
  assert.ok(!mainSource.includes("petStats.fullness ="), "main.cjs 不应再直接写 petStats.fullness");
  assert.ok(!mainSource.includes("petStats.health ="), "main.cjs 不应再直接写 petStats.health");
  assert.ok(!mainSource.includes("lastIntimacyDecayAt ="), "main.cjs 不应再直接写 lastIntimacyDecayAt");
  assert.ok(!mainSource.includes("lastFullnessDecayAt ="), "main.cjs 不应再直接写 lastFullnessDecayAt");
  assert.ok(!mainSource.includes("lastHealthDecayAt ="), "main.cjs 不应再直接写 lastHealthDecayAt");
  assert.ok(!mainSource.includes("lastHealthRecoveryAt ="), "main.cjs 不应再直接写 lastHealthRecoveryAt");
});

test("main.cjs 构造 petStatsController 并经薄包装委托", () => {
  assert.match(mainSource, /petStatsController = createPetStatsController\(/, "main.cjs 应构造 petStatsController");
  // 15 个薄包装委托代表项
  assert.match(mainSource, /petStatsController\.readPetStats\(\)/, "main.cjs readPetStats 应委托 controller");
  assert.match(mainSource, /petStatsController\.writePetStats\(\)/, "main.cjs writePetStats 应委托 controller");
  assert.match(mainSource, /petStatsController\.buildStatsSummary\(\)/, "main.cjs buildStatsSummary 应委托 controller");
  assert.match(mainSource, /petStatsController\.buildTimerSummary\(/, "main.cjs buildTimerSummary 应委托 controller");
  assert.match(mainSource, /petStatsController\.syncDailyStats\(\)/, "main.cjs syncDailyStats 应委托 controller");
  assert.match(mainSource, /petStatsController\.normalizePetStats\(/, "main.cjs normalizePetStats 应委托 controller");
  assert.match(mainSource, /petStatsController\.resumeNaturalStatsTimers\(/, "main.cjs resumeNaturalStatsTimers 应委托 controller");
  assert.match(mainSource, /petStatsController\.applyNaturalStatsTick\(/, "main.cjs applyNaturalStatsTick 应委托 controller");
  assert.match(mainSource, /petStatsController\.startIntimacyDecayTimer\(\)/, "main.cjs startIntimacyDecayTimer 应委托 controller");
  assert.match(mainSource, /petStatsController\.stopIntimacyDecayTimer\(\)/, "main.cjs stopIntimacyDecayTimer 应委托 controller");
  assert.match(mainSource, /petStatsController\.recordInteraction\(\)/, "main.cjs recordInteraction 应委托 controller");
  assert.match(mainSource, /petStatsController\.updateStatPromptState\(/, "main.cjs updateStatPromptState 应委托 controller");
  assert.match(mainSource, /petStatsController\.applyActionStats\(/, "main.cjs applyActionStats 应委托 controller");
  assert.match(mainSource, /petStatsController\.applyInterruptedWalkStats\(\)/, "main.cjs applyInterruptedWalkStats 应委托 controller");
  assert.match(mainSource, /petStatsController\.applyCompletedWalkStats\(\)/, "main.cjs applyCompletedWalkStats 应委托 controller");
});
