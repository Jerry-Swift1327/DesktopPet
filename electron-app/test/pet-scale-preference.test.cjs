const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");

test("pet scale preference is stored per variant", () => {
  assert.match(mainSource, /const scalePreferenceFile = path\.join\(userDataRoot, `scale-\$\{petRuntimeConfig\.variant\}\.json`\);/);
  assert.match(mainSource, /JSON\.stringify\(\{ scale: preferredPetScale \}/);
});

test("pet scale preference is loaded before the pet window is created", () => {
  const readyBlock = mainSource.match(/app\.whenReady\(\)\.then\(\(\) => \{([\s\S]*?)createPetWindow\(\);/)?.[1] || "";

  assert.match(readyBlock, /readPetScalePreference\(\);/);
});

test("pet scale changes persist the preferred scale", () => {
  const setScaleBody = mainSource.match(/function setPetScale\(nextScale\) \{([\s\S]*?)function groundPetToWorkArea/)?.[1] || "";

  assert.match(setScaleBody, /preferredPetScale = clampPetScale\(nextScale\);/);
  assert.match(setScaleBody, /writePetScalePreference\(\);/);
});
