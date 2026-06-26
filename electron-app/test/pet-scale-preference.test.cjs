const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const registerIpcSource = fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", "register-ipc-handlers.cjs"), "utf8");
const appConstantsSource = fs.readFileSync(path.join(__dirname, "..", "electron", "core", "app-constants.cjs"), "utf8");
const runtimeConfigSource = fs.readFileSync(path.join(__dirname, "..", "electron", "core", "runtime-config.cjs"), "utf8");
const preferencesStoreSource = fs.readFileSync(path.join(__dirname, "..", "electron", "core", "preferences-store.cjs"), "utf8");
const autoStartControllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "platform", "auto-start.cjs"), "utf8");
const installerSource = fs.readFileSync(path.join(__dirname, "..", "build", "installer.nsh"), "utf8");

// 从 function 声明起按花括号配对提取函数体（仅处理字符串与括号/花括号配对）
// 起始定位只匹配 "function name("，参数列表的结束 ")" 由括号配对扫描确定，
// 以支持默认参数中含嵌套括号的情形。
function extractFunctionBody(source, funcName) {
  const startRe = new RegExp("^\\s*function\\s+" + funcName + "\\s*\\(", "m");
  const startMatch = source.match(startRe);
  if (!startMatch) {
    return "";
  }
  // startMatch[0] 形如 "function name("，从 "(" 之后第一个字符开始扫描参数列表
  let i = startMatch.index + startMatch[0].length;
  // 1) 按括号深度找到参数列表结束的 ")"，跳过字符串引号与反斜杠转义
  let parenDepth = 1;
  while (i < source.length && parenDepth > 0) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          i += 2;
        } else {
          i++;
        }
      }
      i++;
      continue;
    }
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    i++;
  }
  // 此时 i 指向参数列表 ")" 之后的下一个字符；跳过空白，期望下一个非空白为 "{"
  while (i < source.length && /\s/.test(source[i])) {
    i++;
  }
  if (i >= source.length || source[i] !== "{") {
    return "";
  }
  // 2) 从 "{" 之后开始按花括号配对提取函数体（深度从 1 起）
  const bodyStart = i + 1;
  i = bodyStart;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          i += 2;
        } else {
          i++;
        }
      }
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return source.slice(bodyStart, i - 1);
}

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
  const startupFnBody = mainSource.match(/function runAppReadyStartupSequence\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(startupFnBody.length > 0, "应能提取 runAppReadyStartupSequence 函数体");

  const idxReadPetScalePreference = startupFnBody.indexOf("readPetScalePreference");
  const idxCreatePetWindow = startupFnBody.indexOf("createPetWindow");
  assert.ok(idxReadPetScalePreference >= 0 && idxCreatePetWindow >= 0, "readPetScalePreference 和 createPetWindow 应存在于启动序列");
  assert.ok(idxReadPetScalePreference < idxCreatePetWindow, "readPetScalePreference 应在 createPetWindow 之前");
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
  const refreshBody = autoStartControllerSource.match(/function refreshAutoStartCacheAsync\(\) \{([\s\S]*?)\n  \}/)?.[1] || "";

  assert.match(refreshBody, /if \(!isAutoStartPreferenceLoaded\(\)\) \{[\s\S]*writeAutoStartPreference\(enabled\);/);
});

test("pet scale changes persist the preferred scale", () => {
  const setScaleBody = extractFunctionBody(mainSource, "setPetScale");

  assert.match(setScaleBody, /preferredPetScale = clampPetScale\(nextScale\);/);
  assert.match(setScaleBody, /writePetScalePreference\(\);/);
});

test("window dock scale uses the surface-fitted scale", () => {
  const setScaleBody = extractFunctionBody(mainSource, "setPetScale");

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
