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
  stretch: Object.freeze({ id: "petStretch", asset: "stretch" }),
  shake: Object.freeze({ id: "petShake", asset: "shake" })
});

const PET_ACTION_ORDER = Object.freeze(["squat", "walk", "feed", "ball"]);
const TABBY_ACTION_ORDER = Object.freeze(["squat", "walk", "feed", "ball", "lie", "lick", "belly", "stretch"]);

const PET_VARIANT_PROFILES = Object.freeze({
  dog: Object.freeze({
    id: "dog",
    species: "dog",
    audience: "internal",
    platforms: Object.freeze(["win32", "darwin"]),
    deliveryPathSegments: Object.freeze(["internal", "dog"]),
    deliveryVersion: "1.1",
    animationPrefix: "dog",
    actions: PET_ACTION_ORDER,
    defaultScale: 1.1,
    installerGuid: "9f5b91c8-e03a-58e9-a3bd-5ca74a95e2f1",
    autoStartRegistryKey: "ChongbanDesktopPet-dog",
    singleInstanceKey: "com.chongban.desktoppet.dog",
    features: Object.freeze({
      autoStart: true,
      windowRoam: true,
      customization: true
    })
  }),
  cat: Object.freeze({
    id: "cat",
    species: "cat",
    audience: "internal",
    platforms: Object.freeze(["win32", "darwin"]),
    deliveryPathSegments: Object.freeze(["internal", "cat"]),
    deliveryVersion: "1.2",
    animationPrefix: "cat",
    actions: PET_ACTION_ORDER,
    defaultScale: 1,
    installerGuid: "0793c0d4-f31d-5e02-b7d8-23331f7f85b0",
    autoStartRegistryKey: "ChongbanDesktopPet-cat",
    singleInstanceKey: "com.chongban.desktoppet.cat",
    features: Object.freeze({
      autoStart: true,
      windowRoam: true,
      customization: true
    })
  }),
  shorthair: Object.freeze({
    id: "shorthair",
    species: "cat",
    audience: "custom",
    baseVariant: "cat",
    breedGroup: "bsh",
    coatPattern: "blue-fold",
    platforms: Object.freeze(["win32"]),
    deliveryPathSegments: Object.freeze(["custom", "cat", "bsh", "blue-fold"]),
    deliveryVersion: "1.0",
    animationPrefix: "shorthair",
    actions: PET_ACTION_ORDER,
    defaultScale: 1.1,
    installerGuid: "497f37d9-3152-5d4e-a62f-b41d7f247b1e",
    autoStartRegistryKey: "ChongbanDesktopPet-shorthair",
    singleInstanceKey: "com.chongban.desktoppet.shorthair",
    features: Object.freeze({
      autoStart: false,
      windowRoam: false
    })
  }),
  tabby: Object.freeze({
    id: "tabby",
    species: "cat",
    audience: "custom",
    baseVariant: "cat",
    breedGroup: "tabby",
    platforms: Object.freeze(["win32"]),
    deliveryPathSegments: Object.freeze(["custom", "cat", "tabby"]),
    deliveryVersion: "1.0",
    animationPrefix: "tabby",
    actions: TABBY_ACTION_ORDER,
    extraAnimationAssets: Object.freeze(["look", "shake"]),
    defaultScale: 1.1,
    installerGuid: "521bbcee-864b-4f43-8854-25d0948a2b2c",
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
    species: "cat",
    audience: "custom",
    baseVariant: "cat",
    breedGroup: "bsh",
    coatPattern: "blue-bicolor",
    platforms: Object.freeze(["win32"]),
    deliveryPathSegments: Object.freeze(["custom", "cat", "bsh", "blue-bicolor"]),
    deliveryVersion: "1.0",
    animationPrefix: "brit",
    actions: PET_ACTION_ORDER,
    defaultScale: 1.1,
    installerGuid: "c5230690-90c2-463f-992a-58f5f3cef2df",
    autoStartRegistryKey: "ChongbanDesktopPet-brit",
    singleInstanceKey: "com.chongban.desktoppet.brit",
    features: Object.freeze({
      autoStart: true,
      windowRoam: true
    })
  }),
  van: Object.freeze({
    id: "van",
    species: "cat",
    audience: "custom",
    baseVariant: "cat",
    breedGroup: "bsh",
    coatPattern: "red-van",
    platforms: Object.freeze(["win32"]),
    deliveryPathSegments: Object.freeze(["custom", "cat", "bsh", "red-van"]),
    deliveryVersion: "1.0",
    animationPrefix: "van",
    actions: PET_ACTION_ORDER,
    defaultScale: 1.1,
    installerGuid: "a3d7e2f8-4b91-5c6a-9e0d-1f2a3b4c5d6e",
    autoStartRegistryKey: "ChongbanDesktopPet-van",
    singleInstanceKey: "com.chongban.desktoppet.van",
    features: Object.freeze({
      autoStart: true,
      windowRoam: true
    })
  }),
  pomeranian: Object.freeze({
    id: "pomeranian",
    species: "dog",
    audience: "custom",
    baseVariant: "dog",
    breedGroup: "pomeranian",
    platforms: Object.freeze(["darwin"]),
    deliveryPathSegments: Object.freeze(["custom", "dog", "pomeranian"]),
    deliveryVersion: "1.0",
    animationPrefix: "pomeranian",
    actions: PET_ACTION_ORDER,
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
  const order = getPetVariantProfile(value).actions || PET_ACTION_ORDER;
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
    eyeTracking: Boolean(variantProfile.features.eyeTracking),
    customization: Boolean(variantProfile.features.customization)
  };
}

function getVariantAnimationFolders(value) {
  const profile = getPetVariantProfile(value);
  const extras = profile.extraAnimationAssets || [];
  return (profile.actions || PET_ACTION_ORDER)
    .map((key) => PET_ACTIONS[key].asset)
    .concat(extras)
    .map((asset) => `${profile.animationPrefix}_${asset}`);
}

function getVariantManifestName(value) {
  const profile = getPetVariantProfile(value);
  return `${profile.animationPrefix}_actions_manifest.json`;
}

function getWindowsBuildProfile(value, channel) {
  const variant = normalizePetVariant(value);
  const channelId = normalizePetChannel(channel);
  const profile = getPetVariantProfile(variant);
  if (!profile.platforms.includes("win32")) {
    throw new Error(`Pet variant ${variant} does not support Windows packaging.`);
  }
  return {
    variant,
    channel: channelId,
    output: ["deliverables"].concat(profile.deliveryPathSegments, channelId).join("/"),
    deliveryVersion: profile.deliveryVersion,
    appId: profile.singleInstanceKey,
    installerGuid: profile.installerGuid,
    autoStartRegistryKey: profile.autoStartRegistryKey,
    autoStartAvailable: Boolean(profile.features.autoStart),
    animationFolders: getVariantAnimationFolders(variant),
    manifestName: getVariantManifestName(variant)
  };
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
  getVariantManifestName,
  getWindowsBuildProfile
};
