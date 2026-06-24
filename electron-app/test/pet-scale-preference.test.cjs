const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const registerIpcSource = fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", "register-ipc-handlers.cjs"), "utf8");
const appConstantsSource = fs.readFileSync(path.join(__dirname, "..", "electron", "core", "app-constants.cjs"), "utf8");
const runtimeConfigSource = fs.readFileSync(path.join(__dirname, "..", "electron", "core", "runtime-config.cjs"), "utf8");
const preferencesStoreSource = fs.readFileSync(path.join(__dirname, "..", "electron", "core", "preferences-store.cjs"), "utf8");
const installerSource = fs.readFileSync(path.join(__dirname, "..", "build", "installer.nsh"), "utf8");

test("pet preferences are stored per variant in an encrypted file", () => {
  assert.match(mainSource, /const variantDataRoot = path\.join\(userDataRoot, "variants", petRuntimeConfig\.variant\);/);
  assert.match(appConstantsSource, /const PREFERENCES_FILE = "preferences\.dat";/);
  assert.match(preferencesStoreSource, /const preferencesFile = path\.join\(variantDataRoot, PREFERENCES_FILE\);/);
  assert.match(appConstantsSource, /const PREFERENCES_CIPHER = "aes-256-gcm";/);
  assert.match(preferencesStoreSource, /crypto\.createCipheriv\(PREFERENCES_CIPHER, getPreferencesKey\(\), iv\)/);
  assert.match(preferencesStoreSource, /writePreference\(\{ scale: preferredPetScale \}\);/);
  assert.doesNotMatch(mainSource, /fs\.writeFileSync\([^)]*`scale-\$\{petRuntimeConfig\.variant\}\.json`/);
});

test("pet stats are stored in the current variant data folder", () => {
  assert.match(mainSource, /const statsFile = path\.join\(variantDataRoot, "pet-stats\.json"\);/);
  assert.match(mainSource, /petRuntimeConfig\.variant === basePetVariant \? path\.join\(userDataRoot, "pet-stats\.json"\) : ""/);
});

test("packaged user data root follows the base variant", () => {
  const userDataRootBody = runtimeConfigSource.match(/function getUserDataRoot\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(userDataRootBody, /APP_INTERNAL_NAME, basePetVariant/);
  assert.doesNotMatch(userDataRootBody, /APP_INTERNAL_NAME, petRuntimeConfig\.variant/);
});

test("pet scale preference is loaded before the pet window is created", () => {
  const lifecycleBlock = mainSource.match(/registerAppLifecycle\(\s*\{([\s\S]*?)\n\}\);/)?.[1] || "";
  const onReadyBlock = lifecycleBlock.match(/onReady\s*:\s*\(\s*\)\s*=>\s*\{([\s\S]*?)createPetWindow\(\);/)?.[1] || "";

  assert.match(onReadyBlock, /readPetScalePreference\(\);/);
});

test("split legacy preference files can migrate into preferences", () => {
  const scalePreferenceBody = preferencesStoreSource.match(/function readPetScalePreference\(\) \{([\s\S]*?)function writePetScalePreference/)?.[1] || "";

  assert.match(scalePreferenceBody, /legacyVariantScalePreferenceFile/);
  assert.match(scalePreferenceBody, /legacyScalePreferenceFile/);
  assert.match(scalePreferenceBody, /readLegacyPreference\(/);
  assert.match(scalePreferenceBody, /writePreference\(\{ scale: preferredPetScale \}\);/);
});

test("legacy auto start json is migrated and cleaned up", () => {
  const autoStartPreferenceBody = preferencesStoreSource.match(/function readAutoStartPreference\(\) \{([\s\S]*?)function writeAutoStartPreference/)?.[1] || "";

  assert.match(autoStartPreferenceBody, /legacyVariantAutoStartPreferenceFile/);
  assert.match(autoStartPreferenceBody, /legacyAutoStartPreferenceFile/);
  assert.match(autoStartPreferenceBody, /writePreference\(\{ autoStartEnabled: enabled \}\);/);
  assert.match(autoStartPreferenceBody, /removeLegacyPreferenceFile\(legacyFilePath, "auto start preference"\);/);
});

test("installer no longer writes split auto start preference json", () => {
  assert.doesNotMatch(installerSource, /auto-start-\$\{PET_VARIANT\}\.json/);
  assert.doesNotMatch(installerSource, /Function WriteAutoStartPreference/);
});

test("auto start registry state is persisted into preferences", () => {
  const refreshBody = mainSource.match(/function refreshAutoStartCacheAsync\(\) \{([\s\S]*?)function setAutoStartEnabled/)?.[1] || "";

  assert.match(refreshBody, /if \(!preferencesStore\.isAutoStartPreferenceLoaded\(\)\) \{[\s\S]*writeAutoStartPreference\(enabled\);/);
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
  const preferredPathBody = runtimeConfigSource.match(/function getPreferredVariantFilePath\(baseVariant = DEFAULT_PET_VARIANT\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const runtimeConfigBody = runtimeConfigSource.match(/function readPetRuntimeConfig\(\) \{([\s\S]*?)function getBasePetVariant/)?.[1] || "";

  assert.match(preferredPathBody, /process\.env\.LOCALAPPDATA[\s\S]*APP_INTERNAL_NAME, baseVariant, PREFERRED_VARIANT_FILE/);
  assert.match(runtimeConfigBody, /readPreferredVariant\(fileConfig\.variant\)/);
  assert.match(registerIpcSource, /ipcMain\.handle\(\s*['"]pet:switch-variant['"]/, "register-ipc-handlers.cjs 应注册 pet:switch-variant");
  assert.match(mainSource, /writePreferredVariant\(variant, basePetVariant\)/, "main.cjs 应在 switch-variant handler 中调用 writePreferredVariant");
});

test("packaged preferred variant still reads the legacy roaming file", () => {
  const readPreferredBody = runtimeConfigSource.match(/function readPreferredVariant\(baseVariant = DEFAULT_PET_VARIANT\) \{([\s\S]*?)function writePreferredVariant/)?.[1] || "";

  assert.match(readPreferredBody, /if \(app\.isPackaged\) \{\s*filePaths\.push\(getLegacyPreferredVariantFilePath\(\)\);/);
});
