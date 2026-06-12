const PET_VARIANT_CONFIG_FILE = "pet_variant.json";
const DEFAULT_PET_VARIANT = "dog";
const DEFAULT_PET_CHANNEL = "release";
const MAC_USER_DATA_PARENT = "Chongban 1.0";

const PET_ACTIONS = Object.freeze({
  squat: Object.freeze({ id: "petSquat", asset: "squat" }),
  walk: Object.freeze({ id: "petWalk", asset: "walk" }),
  feed: Object.freeze({ id: "petFeed", asset: "feed" }),
  ball: Object.freeze({ id: "petBall", asset: "ball" }),
  lie: Object.freeze({ id: "petLie", asset: "lie" }),
  lick: Object.freeze({ id: "petLick", asset: "lick" }),
  belly: Object.freeze({ id: "petBelly", asset: "belly" }),
  stretch: Object.freeze({ id: "petStretch", asset: "stretch" })
});

const PET_ACTION_ORDER = Object.freeze(["squat", "walk", "feed", "ball"]);
const TABBY_ACTION_ORDER = Object.freeze(["squat", "walk", "feed", "ball", "lie", "lick", "belly", "stretch"]);
const PET_VARIANT_ACTION_ORDERS = Object.freeze({
  tabby: TABBY_ACTION_ORDER
});
const PET_VARIANT_EXTRA_ANIMATION_ASSETS = Object.freeze({
  tabby: Object.freeze(["look"])
});

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
  tabby: Object.freeze({
    id: "tabby",
    animationPrefix: "tabby",
    defaultScale: 1.1,
    autoStartRegistryKey: "ChongbanDesktopPet-tabby",
    singleInstanceKey: "com.chongban.desktoppet.tabby",
    features: Object.freeze({
      autoStart: true,
      windowRoam: true,
      eyeTracking: true
    })
  }),
  brit: Object.freeze({
    id: "brit",
    animationPrefix: "brit",
    defaultScale: 1.1,
    autoStartRegistryKey: "ChongbanDesktopPet-brit",
    singleInstanceKey: "com.chongban.desktoppet.brit",
    features: Object.freeze({
      autoStart: true,
      windowRoam: true
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
  return Object.keys(PET_ACTIONS).reduce((result, key) => {
    result[key] = PET_ACTIONS[key].id;
    return result;
  }, {});
}

function getPetActionOrder(value) {
  const order = PET_VARIANT_ACTION_ORDERS[normalizePetVariant(value)] || PET_ACTION_ORDER;
  return order.map((key) => PET_ACTIONS[key].id);
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
  const actionOrder = getPetActionOrder(variant);

  return {
    variant,
    channel,
    animationPrefix: variantProfile.animationPrefix,
    defaultScale: variantProfile.defaultScale,
    autoStartRegistryKey: variantProfile.autoStartRegistryKey,
    singleInstanceKey: variantProfile.singleInstanceKey,
    features: variantProfile.features,
    actions: getPetActionIds(),
    actionOrder,
    channelConfig: {
      showDebugTimers: channelProfile.showDebugTimers,
      hoverPanelHeight: channelProfile.hoverPanelHeight + Math.max(0, Math.ceil(actionOrder.length / 4) - 1) * 45
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
    windowRoam: Boolean(variantProfile.features.windowRoam) && isWindows,
    eyeTracking: Boolean(variantProfile.features.eyeTracking)
  };
}

function getVariantAnimationFolders(value) {
  const profile = getPetVariantProfile(value);
  const variant = normalizePetVariant(value);
  const order = PET_VARIANT_ACTION_ORDERS[variant] || PET_ACTION_ORDER;
  const extras = PET_VARIANT_EXTRA_ANIMATION_ASSETS[variant] || [];
  return order
    .map((key) => PET_ACTIONS[key].asset)
    .concat(extras)
    .map((asset) => `${profile.animationPrefix}_${asset}`);
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
