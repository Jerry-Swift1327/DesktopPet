const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");

test("pet preferences are stored per variant in an encrypted file", () => {
  assert.match(mainSource, /const variantDataRoot = path\.join\(userDataRoot, "variants", petRuntimeConfig\.variant\);/);
  assert.match(mainSource, /const PREFERENCES_FILE = "preferences\.dat";/);
  assert.match(mainSource, /const preferencesFile = path\.join\(variantDataRoot, PREFERENCES_FILE\);/);
  assert.match(mainSource, /const PREFERENCES_CIPHER = "aes-256-gcm";/);
  assert.match(mainSource, /crypto\.createCipheriv\(PREFERENCES_CIPHER, getPreferencesKey\(\), iv\)/);
  assert.match(mainSource, /writePreference\(\{ scale: preferredPetScale \}\);/);
  assert.doesNotMatch(mainSource, /fs\.writeFileSync\([^)]*`scale-\$\{petRuntimeConfig\.variant\}\.json`/);
});

test("pet stats are stored in the current variant data folder", () => {
  assert.match(mainSource, /const statsFile = path\.join\(variantDataRoot, "pet-stats\.json"\);/);
  assert.match(mainSource, /petRuntimeConfig\.variant === basePetVariant \? path\.join\(userDataRoot, "pet-stats\.json"\) : ""/);
});

test("packaged user data root follows the base variant", () => {
  const userDataRootBody = mainSource.match(/function getUserDataRoot\(\) \{([\s\S]*?)const petActionIds/)?.[1] || "";

  assert.match(userDataRootBody, /APP_INTERNAL_NAME, basePetVariant/);
  assert.doesNotMatch(userDataRootBody, /APP_INTERNAL_NAME, petRuntimeConfig\.variant/);
});

test("pet scale preference is loaded before the pet window is created", () => {
  const readyBlock = mainSource.match(/app\.whenReady\(\)\.then\(\(\) => \{([\s\S]*?)createPetWindow\(\);/)?.[1] || "";

  assert.match(readyBlock, /readPetScalePreference\(\);/);
});

test("split legacy preference files can migrate into preferences", () => {
  const scalePreferenceBody = mainSource.match(/function readPetScalePreference\(\) \{([\s\S]*?)function writePetScalePreference/)?.[1] || "";

  assert.match(scalePreferenceBody, /legacyVariantScalePreferenceFile/);
  assert.match(scalePreferenceBody, /legacyScalePreferenceFile/);
  assert.match(scalePreferenceBody, /readLegacyPreference\(/);
  assert.match(scalePreferenceBody, /writePreference\(\{ scale: preferredPetScale \}\);/);
});

test("pet scale changes persist the preferred scale", () => {
  const setScaleBody = mainSource.match(/function setPetScale\(nextScale\) \{([\s\S]*?)function groundPetToWorkArea/)?.[1] || "";

  assert.match(setScaleBody, /preferredPetScale = clampPetScale\(nextScale\);/);
  assert.match(setScaleBody, /writePetScalePreference\(\);/);
});

test("window dock scale uses the surface-fitted scale", () => {
  const setScaleBody = mainSource.match(/function setPetScale\(nextScale\) \{([\s\S]*?)function groundPetToWorkArea/)?.[1] || "";

  assert.match(setScaleBody, /surface\?\.type === "window"[\s\S]*getScaleForSurface\(surface, preferredPetScale, activeState, walkDirection\)/);
});

test("preferred variant is stored under the base variant local data folder", () => {
  const preferredPathBody = mainSource.match(/function getPreferredVariantFilePath\(baseVariant = DEFAULT_PET_VARIANT\) \{([\s\S]*?)function getLegacyPreferredVariantFilePath/)?.[1] || "";
  const runtimeConfigBody = mainSource.match(/function readPetRuntimeConfig\(\) \{([\s\S]*?)function getBasePetVariant/)?.[1] || "";
  const switchVariantBody = mainSource.match(/ipcMain\.handle\("pet:switch-variant"[\s\S]*?\n\}\);/)?.[0] || "";

  assert.match(preferredPathBody, /process\.env\.LOCALAPPDATA[\s\S]*APP_INTERNAL_NAME, baseVariant, PREFERRED_VARIANT_FILE/);
  assert.match(runtimeConfigBody, /readPreferredVariant\(fileConfig\.variant\)/);
  assert.match(switchVariantBody, /writePreferredVariant\(variant, basePetVariant\)/);
});

test("packaged preferred variant still reads the legacy roaming file", () => {
  const readPreferredBody = mainSource.match(/function readPreferredVariant\(baseVariant = DEFAULT_PET_VARIANT\) \{([\s\S]*?)function writePreferredVariant/)?.[1] || "";

  assert.match(readPreferredBody, /if \(app\.isPackaged\) \{\s*filePaths\.push\(getLegacyPreferredVariantFilePath\(\)\);/);
});
