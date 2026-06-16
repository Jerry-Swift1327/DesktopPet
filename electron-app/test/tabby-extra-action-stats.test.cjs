const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const rendererSource = fs.readFileSync(path.join(__dirname, "..", "static", "renderer.js"), "utf8");

test("tabby extra one-shot actions settle stats after playback", () => {
  const delayBody = mainSource.match(/function shouldDelayActionStats\(stateId\) \{\s*return ([^;]+);/s)?.[1] || "";

  assert.match(delayBody, /STATE_LIE/);
  assert.match(delayBody, /STATE_LICK/);
  assert.match(delayBody, /STATE_BELLY/);
  assert.match(delayBody, /STATE_STRETCH/);
});

test("tabby extra actions update hover panel stats", () => {
  assert.match(mainSource, /stateId === STATE_LIE[\s\S]*petStats\.health/);
  assert.match(mainSource, /stateId === STATE_LICK[\s\S]*petStats\.health/);
  assert.match(mainSource, /stateId === STATE_BELLY[\s\S]*petStats\.fullness/);
  assert.match(mainSource, /stateId === STATE_STRETCH[\s\S]*petStats\.health[\s\S]*petStats\.fullness/);
});

test("tabby idle actions run outside the idle greeting timer", () => {
  assert.match(mainSource, /tabbyIdlePollTimer = setInterval\(updateTabbyIdleActions, 1000\)/);
  assert.match(mainSource, /setState\(STATE_YAWN, false\)/);
  assert.match(mainSource, /setState\(STATE_SLEEP, false\)/);
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
  assert.doesNotMatch(rendererSource, /addEventListener\("dblclick"/);
});

test("sleeping tabby does not open the hover panel before hissing", () => {
  assert.match(mainSource, /petRuntimeConfig\.variant === "tabby" && activeState === STATE_SLEEP/);
  assert.match(mainSource, /hideHoverPanel\(\);\s*setState\(STATE_HISS, false\)/);
  assert.match(rendererSource, /activeState === config\.actionIds\?\.sleep/);
});
