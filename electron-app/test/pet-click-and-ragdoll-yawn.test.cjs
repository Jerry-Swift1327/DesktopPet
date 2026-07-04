const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const constantsSource = fs.readFileSync(path.join(__dirname, "..", "electron", "core", "app-constants.cjs"), "utf8");
const preloadSource = fs.readFileSync(path.join(__dirname, "..", "electron", "preload.cjs"), "utf8");
const petWindowSource = fs.readFileSync(path.join(__dirname, "..", "static", "renderer", "pet-window.js"), "utf8");

test("ragdoll yawn sleep tail switches to walk after five minutes", () => {
  assert.match(constantsSource, /const RAGDOLL_YAWN_SLEEP_LOOP_MAX_MS = 5 \* 60 \* 1000/);
  assert.match(mainSource, /RAGDOLL_YAWN_SLEEP_LOOP_MAX_MS/);
  assert.match(mainSource, /function scheduleRagdollYawnSleepLoopTimeout\(state\)/);
  assert.match(mainSource, /petRuntimeConfig\.variant !== "pet2609"/);
  assert.match(mainSource, /state !== STATE_YAWN/);
  assert.match(mainSource, /setState\(STATE_WALK, false\)/);
  assert.match(mainSource, /scheduleRagdollYawnSleepLoopTimeout\(STATE_YAWN\)/);
  assert.match(mainSource, /function clearRagdollYawnSleepLoopTimer\(\)/);
  assert.match(mainSource, /if \(activeState !== STATE_YAWN\) \{\s*clearRagdollYawnSleepLoopTimer\(\);/);
});

test("short left click picks another visible hover-panel action", () => {
  assert.match(petWindowSource, /function pickRandomClickAction\(\)/);
  assert.match(petWindowSource, /config\.actionOrder/);
  assert.match(petWindowSource, /stateId !== activeState/);
  assert.match(petWindowSource, /availableStates\.has\(stateId\)/);
  assert.match(petWindowSource, /window\.desktopPet\.setState\(nextState, \{ suppressHover: true \}\)/);
  assert.match(petWindowSource, /down\?\.sleep[\s\S]*window\.desktopPet\.wakeSleepingPet\(\)/);
});

test("pet click suppresses hover without adding a new IPC channel", () => {
  assert.match(constantsSource, /const PET_CLICK_HOVER_SUPPRESS_MS = HOVER_HIDE_DELAY_MS/);
  assert.match(preloadSource, /setState: \(state, options\) => ipcRenderer\.send\("pet:set-state", state, options\)/);
  assert.match(mainSource, /function suppressHoverAfterPetClick\(\)/);
  assert.match(mainSource, /petClickHoverSuppressedUntil = Date\.now\(\) \+ PET_CLICK_HOVER_SUPPRESS_MS/);
  assert.match(mainSource, /getPetClickHoverSuppressionMs\(\) > 0/);
  assert.match(mainSource, /options\.suppressHover/);
  assert.doesNotMatch(mainSource, /pet:random-click-action/);
  assert.doesNotMatch(preloadSource, /randomClickAction/);
});
