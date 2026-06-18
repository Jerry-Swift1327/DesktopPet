const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const rendererSource = fs.readFileSync(path.join(__dirname, "..", "static", "renderer.js"), "utf8");

test("tabby extra actions settle stats at the right time", () => {
  const delayBody = mainSource.match(/function shouldDelayActionStats\(stateId\) \{\s*return ([^;]+);/s)?.[1] || "";

  assert.doesNotMatch(delayBody, /STATE_LIE/);
  assert.match(delayBody, /STATE_LICK/);
  assert.match(delayBody, /STATE_BELLY/);
  assert.match(delayBody, /STATE_STRETCH/);
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
  assert.match(rendererSource, /getStateFrameIndex\(state\) >= state\.tailLoopStart/);
});

test("tabby extra actions update hover panel stats", () => {
  assert.match(mainSource, /stateId === STATE_LIE[\s\S]*petStats\.health/);
  assert.match(mainSource, /stateId === STATE_LICK[\s\S]*petStats\.health/);
  assert.match(mainSource, /stateId === STATE_BELLY[\s\S]*petStats\.fullness/);
  assert.match(mainSource, /stateId === STATE_STRETCH[\s\S]*petStats\.health[\s\S]*petStats\.fullness/);
});

test("tabby idle actions run outside the idle greeting timer", () => {
  assert.match(mainSource, /tabbyIdlePollTimer = setInterval\(updateTabbyIdleActions, 1000\)/);
  assert.match(mainSource, /const TABBY_YAWN_IDLE_MS = 2 \* 60 \* 1000/);
  assert.match(mainSource, /nextTabbyYawnInMs: Math\.max\(0, TABBY_YAWN_IDLE_MS - \(now - lastTabbyUserOperationAt\)\)/);
  assert.match(mainSource, /setState\(STATE_YAWN, false\)/);
  assert.match(mainSource, /const TABBY_IDLE_STATES = new Set\(\[STATE_YAWN, STATE_SLEEP, STATE_HISS\]\)/);
  assert.match(rendererSource, /tailLoopStart \+ \(\(frameStep - tailLoopStart\) % Math\.max\(1, stepCount - tailLoopStart\)\)/);
  assert.match(mainSource, /const TABBY_SLEEP_POSE_MS = 2 \* 60 \* 1000/);
  assert.match(mainSource, /nextTabbySleepPoseInMs: Math\.max\(0, tabbySleepPoseSwitchAt - now\)/);
  assert.match(mainSource, /tabbySleepPoseSwitchAt = Date\.now\(\) \+ TABBY_SLEEP_POSE_MS/);
  assert.match(mainSource, /scheduleTabbySleepPose\(STATE_YAWN\)/);
  assert.match(mainSource, /setState\(activeState === STATE_SLEEP \? STATE_YAWN : STATE_SLEEP, false\)/);
  assert.match(rendererSource, /previousState === config\.actionIds\?\.sleep && state === config\.actionIds\?\.yawn/);
});

test("packaged runtime validates the external assets root first", () => {
  const getAssetsRootBody = mainSource.match(/function getAssetsRoot\(\) \{([\s\S]*?)function toFileUrl/)?.[1] || "";

  assert.match(getAssetsRootBody, /path\.join\(process\.resourcesPath, "assets"\)/);
  assert.match(getAssetsRootBody, /frame_000\.png/);
  assert.match(getAssetsRootBody, /assets root:/);
});

test("packaged custom variants are not overridden by dog or cat preference", () => {
  const runtimeConfigBody = mainSource.match(/function readPetRuntimeConfig\(\) \{([\s\S]*?)function getActionAssetFolder/)?.[1] || "";

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

  assert.match(mainSource, /petRuntimeConfig\.variant === "tabby" && activeState === STATE_HISS/);
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
