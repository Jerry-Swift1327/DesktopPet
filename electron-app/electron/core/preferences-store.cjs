// 偏好存储，统一管理 autoStart/windowRoam/eyeTracking/scale 四组偏好的读写和迁移。

// 创建偏好存储实例。
// 依赖通过参数注入：
//   app             Electron app 实例
//   fs              fs 模块
//   crypto          crypto 模块
//   path            path 模块
//   constants       包含 PREFERENCES_FILE/PREFERENCES_VERSION/PREFERENCES_MAGIC/PREFERENCES_CIPHER/APP_INTERNAL_NAME
//   petRuntimeConfig 宠物运行时配置（variant/features/autoStartRegistryKey/defaultScale 等）
//   basePetVariant  基础变体名
//   variantDataRoot 当前变体数据目录
//   userDataRoot    用户数据根目录
//   log             日志函数
function createPreferencesStore({
  app,
  fs,
  crypto,
  path,
  constants,
  petRuntimeConfig,
  basePetVariant,
  variantDataRoot,
  userDataRoot,
  log
}) {
  const {
    PREFERENCES_FILE,
    PREFERENCES_VERSION,
    PREFERENCES_MAGIC,
    PREFERENCES_CIPHER,
    APP_INTERNAL_NAME
  } = constants;

  // 内部常量（与 main.cjs / app-constants.cjs 保持一致）
  const ENABLE_WINDOW_DOCKING = true;
  const PET_SCALE_MIN = 0.75;
  const PET_SCALE_MAX = 1.6;
  const DEFAULT_PET_SCALE = petRuntimeConfig.defaultScale;

  // 偏好文件路径
  const preferencesFile = path.join(variantDataRoot, PREFERENCES_FILE);
  const legacyVariantAutoStartPreferenceFile = path.join(variantDataRoot, `auto-start-${petRuntimeConfig.variant}.json`);
  const legacyVariantWindowRoamPreferenceFile = path.join(variantDataRoot, `window-roam-${petRuntimeConfig.variant}.json`);
  const legacyVariantEyeTrackingPreferenceFile = path.join(variantDataRoot, `eye-tracking-${petRuntimeConfig.variant}.json`);
  const legacyVariantScalePreferenceFile = path.join(variantDataRoot, `scale-${petRuntimeConfig.variant}.json`);
  const legacyAutoStartPreferenceFile = path.join(userDataRoot, `auto-start-${petRuntimeConfig.variant}.json`);
  const legacyWindowRoamPreferenceFile = path.join(userDataRoot, `window-roam-${petRuntimeConfig.variant}.json`);
  const legacyEyeTrackingPreferenceFile = path.join(userDataRoot, `eye-tracking-${petRuntimeConfig.variant}.json`);
  const legacyScalePreferenceFile = path.join(userDataRoot, `scale-${petRuntimeConfig.variant}.json`);

  // 缓存状态
  let preferencesCache = null;
  let autoStartEnabledCache = false;
  let autoStartPreferenceLoaded = false;
  let windowRoamEnabledCache = false;
  let eyeTrackingEnabledCache = false;
  let petScale = DEFAULT_PET_SCALE;
  let preferredPetScale = DEFAULT_PET_SCALE;

  function isAutoStartSupported() {
    return process.platform === "win32" && app.isPackaged;
  }

  function canToggleAutoStart() {
    return Boolean(petRuntimeConfig.features?.autoStart) && isAutoStartSupported();
  }

  function getPreferencesKey() {
    return crypto.createHash("sha256")
      .update([APP_INTERNAL_NAME, basePetVariant, petRuntimeConfig.variant, app.getPath("home")].join("|"))
      .digest();
  }

  function readPreferences() {
    if (preferencesCache) {
      return preferencesCache;
    }
    preferencesCache = {};
    if (!fs.existsSync(preferencesFile)) {
      return preferencesCache;
    }

    try {
      const [magic, ivText, tagText, encryptedText] = fs.readFileSync(preferencesFile, "utf8").trim().split(".");
      if (magic !== PREFERENCES_MAGIC || !ivText || !tagText || !encryptedText) {
        return preferencesCache;
      }
      const decipher = crypto.createDecipheriv(PREFERENCES_CIPHER, getPreferencesKey(), Buffer.from(ivText, "base64"));
      decipher.setAuthTag(Buffer.from(tagText, "base64"));
      const raw = Buffer.concat([
        decipher.update(Buffer.from(encryptedText, "base64")),
        decipher.final()
      ]).toString("utf8");
      const data = JSON.parse(raw);
      if (data && typeof data === "object") {
        preferencesCache = data;
      }
    } catch (error) {
      log(`failed to read preferences: ${error.stack || error.message}`);
    }
    return preferencesCache;
  }

  function writePreference(values) {
    try {
      preferencesCache = { ...readPreferences(), ...values, version: PREFERENCES_VERSION };
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(PREFERENCES_CIPHER, getPreferencesKey(), iv);
      const encrypted = Buffer.concat([
        cipher.update(JSON.stringify(preferencesCache), "utf8"),
        cipher.final()
      ]);
      fs.writeFileSync(preferencesFile, [
        PREFERENCES_MAGIC,
        iv.toString("base64"),
        cipher.getAuthTag().toString("base64"),
        encrypted.toString("base64")
      ].join("."), "utf8");
    } catch (error) {
      log(`failed to write preferences: ${error.stack || error.message}`);
    }
  }

  function readLegacyPreference(filePaths, key, label) {
    const filePath = filePaths.find((candidate) => fs.existsSync(candidate));
    if (!filePath) {
      return { value: undefined, filePath: "" };
    }
    try {
      return { value: JSON.parse(fs.readFileSync(filePath, "utf8"))?.[key], filePath };
    } catch (error) {
      log(`failed to read ${label}: ${error.stack || error.message}`);
      return { value: undefined, filePath };
    }
  }

  function removeLegacyPreferenceFile(filePath, label) {
    if (!filePath) {
      return;
    }
    try {
      fs.rmSync(filePath, { force: true });
    } catch (error) {
      log(`failed to remove ${label}: ${error.stack || error.message}`);
    }
  }

  function readAutoStartPreference() {
    const preferences = readPreferences();
    let enabled = preferences.autoStartEnabled;
    let shouldMigrate = false;
    let legacyFilePath = "";
    if (typeof enabled !== "boolean") {
      const legacy = readLegacyPreference([
        legacyVariantAutoStartPreferenceFile,
        legacyAutoStartPreferenceFile
      ], "enabled", "auto start preference");
      enabled = legacy.value;
      legacyFilePath = legacy.filePath;
      shouldMigrate = typeof enabled === "boolean";
    }
    if (typeof enabled === "boolean") {
      autoStartEnabledCache = enabled;
      autoStartPreferenceLoaded = true;
      if (shouldMigrate) {
        writePreference({ autoStartEnabled: enabled });
        removeLegacyPreferenceFile(legacyFilePath, "auto start preference");
      }
    }
  }

  function writeAutoStartPreference(enabled) {
    writePreference({ autoStartEnabled: Boolean(enabled) });
    autoStartPreferenceLoaded = true;
  }

  function buildAutoStartSummary(error = "") {
    return {
      supported: isAutoStartSupported(),
      enabled: autoStartEnabledCache,
      canToggle: canToggleAutoStart(),
      error
    };
  }

  function canToggleWindowRoam() {
    return Boolean(petRuntimeConfig.features?.windowRoam) && ENABLE_WINDOW_DOCKING && process.platform === "win32";
  }

  function readWindowRoamPreference() {
    const preferences = readPreferences();
    let enabled = preferences.windowRoamEnabled;
    let shouldMigrate = false;
    if (typeof enabled !== "boolean") {
      enabled = readLegacyPreference([
        legacyVariantWindowRoamPreferenceFile,
        legacyWindowRoamPreferenceFile
      ], "enabled", "window roam preference").value;
      shouldMigrate = typeof enabled === "boolean";
    }
    if (typeof enabled === "boolean") {
      windowRoamEnabledCache = enabled;
      if (shouldMigrate) {
        writePreference({ windowRoamEnabled: enabled });
      }
    }
  }

  function writeWindowRoamPreference(enabled) {
    writePreference({ windowRoamEnabled: Boolean(enabled) });
  }

  function buildWindowRoamSummary(error = "") {
    return {
      supported: ENABLE_WINDOW_DOCKING && process.platform === "win32",
      enabled: windowRoamEnabledCache,
      canToggle: canToggleWindowRoam(),
      error
    };
  }

  function canToggleEyeTracking() {
    return Boolean(petRuntimeConfig.features?.eyeTracking);
  }

  function readEyeTrackingPreference() {
    const preferences = readPreferences();
    let enabled = preferences.eyeTrackingEnabled;
    let shouldMigrate = false;
    if (typeof enabled !== "boolean") {
      enabled = readLegacyPreference([
        legacyVariantEyeTrackingPreferenceFile,
        legacyEyeTrackingPreferenceFile
      ], "enabled", "eye tracking preference").value;
      shouldMigrate = typeof enabled === "boolean";
    }
    if (typeof enabled === "boolean") {
      eyeTrackingEnabledCache = enabled;
      if (shouldMigrate) {
        writePreference({ eyeTrackingEnabled: enabled });
      }
    }
  }

  function writeEyeTrackingPreference(enabled) {
    writePreference({ eyeTrackingEnabled: Boolean(enabled) });
  }

  function buildEyeTrackingSummary(error = "") {
    return {
      supported: canToggleEyeTracking(),
      enabled: eyeTrackingEnabledCache,
      canToggle: canToggleEyeTracking(),
      error
    };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function clampPetScale(value) {
    return Math.round(clamp(Number(value) || 1, PET_SCALE_MIN, PET_SCALE_MAX) * 100) / 100;
  }

  function readPetScalePreference() {
    const preferences = readPreferences();
    let scale = preferences.scale;
    let shouldMigrate = false;
    if (!Number.isFinite(scale)) {
      scale = readLegacyPreference([
        legacyVariantScalePreferenceFile,
        legacyScalePreferenceFile
      ], "scale", "scale preference").value;
      shouldMigrate = Number.isFinite(scale);
    }
    if (Number.isFinite(scale)) {
      preferredPetScale = clampPetScale(scale);
      petScale = preferredPetScale;
      if (shouldMigrate) {
        writePreference({ scale: preferredPetScale });
      }
    }
  }

  function writePetScalePreference() {
    writePreference({ scale: preferredPetScale });
  }

  function getAutoStartEnabled() {
    return autoStartEnabledCache;
  }

  function setAutoStartEnabled(value) {
    autoStartEnabledCache = Boolean(value);
  }

  function isAutoStartPreferenceLoaded() {
    return autoStartPreferenceLoaded;
  }

  function getWindowRoamEnabled() {
    return windowRoamEnabledCache;
  }

  function setWindowRoamEnabled(value) {
    windowRoamEnabledCache = Boolean(value);
  }

  function getEyeTrackingEnabled() {
    return eyeTrackingEnabledCache;
  }

  function setEyeTrackingEnabled(value) {
    eyeTrackingEnabledCache = Boolean(value);
  }

  function getPetScale() {
    return petScale;
  }

  function setPetScale(value) {
    petScale = value;
  }

  function getPreferredPetScale() {
    return preferredPetScale;
  }

  function setPreferredPetScale(value) {
    preferredPetScale = value;
  }

  return {
    getPreferencesKey,
    readPreferences,
    writePreference,
    readLegacyPreference,
    removeLegacyPreferenceFile,
    isAutoStartSupported,
    canToggleAutoStart,
    readAutoStartPreference,
    writeAutoStartPreference,
    buildAutoStartSummary,
    canToggleWindowRoam,
    readWindowRoamPreference,
    writeWindowRoamPreference,
    buildWindowRoamSummary,
    canToggleEyeTracking,
    readEyeTrackingPreference,
    writeEyeTrackingPreference,
    buildEyeTrackingSummary,
    readPetScalePreference,
    writePetScalePreference,
    getAutoStartEnabled,
    setAutoStartEnabled,
    isAutoStartPreferenceLoaded,
    getWindowRoamEnabled,
    setWindowRoamEnabled,
    getEyeTrackingEnabled,
    setEyeTrackingEnabled,
    getPetScale,
    setPetScale,
    getPreferredPetScale,
    setPreferredPetScale
  };
}

module.exports = { createPreferencesStore };
