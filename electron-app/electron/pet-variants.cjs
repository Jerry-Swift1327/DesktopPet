const PET_VARIANT_CONFIG_FILE = "pet_variant.json";
const DEFAULT_PET_VARIANT = "dog";
const DEFAULT_PET_CHANNEL = "release";
const MAC_USER_DATA_PARENT = "Chongban";

const PET_ACTIONS = Object.freeze({
  squat: Object.freeze({ id: "petSquat", asset: "squat" }),
  walk: Object.freeze({ id: "petWalk", asset: "walk" }),
  feed: Object.freeze({ id: "petFeed", asset: "feed" }),
  ball: Object.freeze({ id: "petBall", asset: "ball" })
});

const PET_ACTION_ORDER = Object.freeze(["squat", "walk", "feed", "ball"]);

const PET_VARIANT_PROFILES = Object.freeze({
  dog: Object.freeze({
    id: "dog",
    animationPrefix: "dog",
    defaultScale: 1.1,
    autoStartRegistryKey: "ChongbanDesktopPet-dog",
    singleInstanceKey: "com.chongban.desktoppet.dog",
    features: Object.freeze({
      autoStart: true,
      windowRoam: true
    })
  }),
  cat: Object.freeze({
    id: "cat",
    animationPrefix: "cat",
    defaultScale: 1,
    autoStartRegistryKey: "ChongbanDesktopPet-cat",
    singleInstanceKey: "com.chongban.desktoppet.cat",
    features: Object.freeze({
      autoStart: true,
      windowRoam: true
    })
  }),
  shorthair: Object.freeze({
    id: "shorthair",
    animationPrefix: "shorthair",
    defaultScale: 1.1,
    autoStartRegistryKey: "ChongbanDesktopPet-shorthair",
    singleInstanceKey: "com.chongban.desktoppet.shorthair",
    features: Object.freeze({
      autoStart: false,
      windowRoam: false
    })
  }),
  pomeranian: Object.freeze({
    id: "pomeranian",
    animationPrefix: "pomeranian",
    defaultScale: 1.1,
    autoStartRegistryKey: "ChongbanDesktopPet-pomeranian",
    singleInstanceKey: "com.chongban.desktoppet.pomeranian",
    features: Object.freeze({
      autoStart: false,
      windowRoam: false
    })
  })
});

const PET_CHANNEL_PROFILES = Object.freeze({
  release: Object.freeze({
    id: "release",
    showDebugTimers: true,
    hoverPanelHeight: 180
  }),
  installer: Object.freeze({
    id: "installer",
    showDebugTimers: false,
    hoverPanelHeight: 150
  })
});

function normalizePetVariant(value) {
  return Object.prototype.hasOwnProperty.call(PET_VARIANT_PROFILES, value)
    ? value
    : DEFAULT_PET_VARIANT;
}

function normalizePetChannel(value) {
  return Object.prototype.hasOwnProperty.call(PET_CHANNEL_PROFILES, value)
    ? value
    : DEFAULT_PET_CHANNEL;
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function getPetActions() {
  return clonePlainObject(PET_ACTIONS);
}

function getPetActionIds() {
  return PET_ACTION_ORDER.reduce((result, key) => {
    result[key] = PET_ACTIONS[key].id;
    return result;
  }, {});
}

function getPetActionOrder() {
  return PET_ACTION_ORDER.map((key) => PET_ACTIONS[key].id);
}

function getPetVariantProfile(value) {
  return clonePlainObject(PET_VARIANT_PROFILES[normalizePetVariant(value)]);
}

function getPetChannelProfile(value) {
  return clonePlainObject(PET_CHANNEL_PROFILES[normalizePetChannel(value)]);
}

function buildPetRuntimeConfig(config = {}) {
  const variant = normalizePetVariant(config.variant);
  const channel = normalizePetChannel(config.channel);
  const variantProfile = getPetVariantProfile(variant);
  const channelProfile = getPetChannelProfile(channel);

  return {
    variant,
    channel,
    animationPrefix: variantProfile.animationPrefix,
    defaultScale: variantProfile.defaultScale,
    autoStartRegistryKey: variantProfile.autoStartRegistryKey,
    singleInstanceKey: variantProfile.singleInstanceKey,
    features: variantProfile.features,
    actions: getPetActionIds(),
    actionOrder: getPetActionOrder(),
    channelConfig: {
      showDebugTimers: channelProfile.showDebugTimers,
      hoverPanelHeight: channelProfile.hoverPanelHeight
    }
  };
}

function getPetUserDataFolder(config = {}) {
  const variant = normalizePetVariant(config.variant);
  return config.platform === "darwin" ? `${MAC_USER_DATA_PARENT}/${variant}` : variant;
}

function getPetPlatformFeatures(config = {}) {
  const variantProfile = getPetVariantProfile(config.variant);
  const isWindows = config.platform === "win32";
  return {
    autoStart: Boolean(variantProfile.features.autoStart) && isWindows,
    windowRoam: Boolean(variantProfile.features.windowRoam) && isWindows
  };
}

function getVariantAnimationFolders(value) {
  const profile = getPetVariantProfile(value);
  return PET_ACTION_ORDER.map((key) => `${profile.animationPrefix}_${PET_ACTIONS[key].asset}`);
}

function getVariantManifestName(value) {
  const profile = getPetVariantProfile(value);
  return `${profile.animationPrefix}_actions_manifest.json`;
}

module.exports = {
  PET_VARIANT_CONFIG_FILE,
  DEFAULT_PET_VARIANT,
  DEFAULT_PET_CHANNEL,
  MAC_USER_DATA_PARENT,
  PET_VARIANT_IDS: Object.freeze(Object.keys(PET_VARIANT_PROFILES)),
  PET_CHANNEL_IDS: Object.freeze(Object.keys(PET_CHANNEL_PROFILES)),
  PET_ACTION_ORDER,
  normalizePetVariant,
  normalizePetChannel,
  getPetActions,
  getPetActionIds,
  getPetActionOrder,
  getPetVariantProfile,
  getPetChannelProfile,
  buildPetRuntimeConfig,
  getPetUserDataFolder,
  getPetPlatformFeatures,
  getVariantAnimationFolders,
  getVariantManifestName
};
