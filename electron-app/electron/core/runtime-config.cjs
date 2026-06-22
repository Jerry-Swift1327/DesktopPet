// 运行时配置，负责变体配置读取、首选变体持久化和用户数据目录定位

function createRuntimeConfig({ app, fs, path, petVariants, appConstants, log }) {
  const {
    PET_VARIANT_CONFIG_FILE,
    PREFERRED_VARIANT_FILE,
    DEFAULT_PET_VARIANT,
    DEFAULT_PET_CHANNEL,
    SWITCHABLE_VARIANTS,
    buildPetRuntimeConfig,
    getPetUserDataFolder,
    MAC_USER_DATA_PARENT
  } = petVariants;
  const { APP_INTERNAL_NAME } = appConstants;

  function readPetRuntimeConfigFile(configPath) {
    try {
      const configText = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
      return JSON.parse(configText);
    } catch {
      return null;
    }
  }

  function getPackagedPetRuntimeConfigPaths() {
    return [
      path.join(process.resourcesPath, PET_VARIANT_CONFIG_FILE),
      path.join(process.resourcesPath, "app.asar", ".runtime-assets", PET_VARIANT_CONFIG_FILE),
      path.join(process.resourcesPath, "app", ".runtime-assets", PET_VARIANT_CONFIG_FILE)
    ];
  }

  // 本模块位于 electron/core/ 子目录，向上两级回到 electron/ 目录，与 main.cjs 中 __dirname 的解析结果保持一致
  function getPreferredVariantFilePath(baseVariant = DEFAULT_PET_VARIANT) {
    if (!app.isPackaged) {
      return path.join(__dirname, "..", "..", ".user-data", PREFERRED_VARIANT_FILE);
    }
    if (process.platform === "darwin") {
      return path.join(app.getPath("appData"), MAC_USER_DATA_PARENT, PREFERRED_VARIANT_FILE);
    }
    return path.join(process.env.LOCALAPPDATA || path.join(path.dirname(process.execPath), "user-data"), APP_INTERNAL_NAME, baseVariant, PREFERRED_VARIANT_FILE);
  }

  function getLegacyPreferredVariantFilePath() {
    return path.join(app.getPath("appData"), APP_INTERNAL_NAME, PREFERRED_VARIANT_FILE);
  }

  function readPreferredVariant(baseVariant = DEFAULT_PET_VARIANT) {
    try {
      const filePaths = [getPreferredVariantFilePath(baseVariant)];
      if (app.isPackaged) {
        filePaths.push(getLegacyPreferredVariantFilePath());
      }
      const filePath = filePaths.find((candidate) => fs.existsSync(candidate));
      if (!filePath) {
        return null;
      }
      const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
      const data = JSON.parse(content);
      if (data && data.variant && SWITCHABLE_VARIANTS.includes(data.variant)) {
        return data.variant;
      }
    } catch {
      // ignore
    }
    return null;
  }

  function writePreferredVariant(variant, baseVariant = DEFAULT_PET_VARIANT) {
    try {
      const filePath = getPreferredVariantFilePath(baseVariant);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify({ variant }, null, 2), "utf8");
    } catch (error) {
      log(`failed to write preferred variant: ${error.stack || error.message}`);
    }
  }

  function readPetRuntimeConfig() {
    const envVariant = process.env.PET_VARIANT || process.env.DESKTOP_PET_VARIANT;
    const envChannel = process.env.PET_CHANNEL || process.env.DESKTOP_PET_CHANNEL;
    const envConfig = {};
    if (envVariant) {
      envConfig.variant = envVariant;
    }
    if (envChannel) {
      envConfig.channel = envChannel;
    }

    if (!app.isPackaged) {
      const preferredVariant = !envVariant ? readPreferredVariant() : null;
      if (preferredVariant) {
        envConfig.variant = preferredVariant;
      }
      return buildPetRuntimeConfig(envConfig);
    }

    for (const configPath of getPackagedPetRuntimeConfigPaths()) {
      if (!fs.existsSync(configPath)) {
        continue;
      }
      const fileConfig = readPetRuntimeConfigFile(configPath);
      if (fileConfig) {
        const preferredVariant = !envVariant && SWITCHABLE_VARIANTS.includes(fileConfig.variant)
          ? readPreferredVariant(fileConfig.variant)
          : null;
        return buildPetRuntimeConfig({
          ...fileConfig,
          ...envConfig,
          ...(preferredVariant ? { variant: preferredVariant } : {})
        });
      }
    }

    const preferredVariant = !envVariant ? readPreferredVariant() : null;
    return buildPetRuntimeConfig({
      variant: DEFAULT_PET_VARIANT,
      channel: DEFAULT_PET_CHANNEL,
      ...(preferredVariant ? { variant: preferredVariant } : {}),
      ...envConfig
    });
  }

  function getBasePetVariant() {
    if (!app.isPackaged) {
      return petRuntimeConfig.variant;
    }
    for (const configPath of getPackagedPetRuntimeConfigPaths()) {
      if (!fs.existsSync(configPath)) {
        continue;
      }
      const fileConfig = readPetRuntimeConfigFile(configPath);
      if (fileConfig?.variant) {
        return fileConfig.variant;
      }
    }
    return petRuntimeConfig.variant;
  }

  function getUserDataRoot() {
    if (!app.isPackaged) {
      return path.join(__dirname, "..", "..", ".user-data", petRuntimeConfig.variant);
    }
    if (process.platform === "darwin") {
      return path.join(app.getPath("appData"), getPetUserDataFolder({ ...petRuntimeConfig, platform: process.platform }));
    }
    return path.join(process.env.LOCALAPPDATA || path.join(path.dirname(process.execPath), "user-data"), APP_INTERNAL_NAME, basePetVariant);
  }

  // 与 main.cjs 启动期一致：先读取运行时配置，再推导基础变体，供 getUserDataRoot / getBasePetVariant 闭包引用
  const petRuntimeConfig = readPetRuntimeConfig();
  const basePetVariant = getBasePetVariant();

  return {
    petRuntimeConfig,
    basePetVariant,
    readPetRuntimeConfigFile,
    getPackagedPetRuntimeConfigPaths,
    getPreferredVariantFilePath,
    getLegacyPreferredVariantFilePath,
    readPreferredVariant,
    writePreferredVariant,
    readPetRuntimeConfig,
    getBasePetVariant,
    getUserDataRoot
  };
}

module.exports = { createRuntimeConfig };
