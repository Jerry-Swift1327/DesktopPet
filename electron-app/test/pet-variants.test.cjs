const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_PET_VARIANT,
  DEFAULT_PET_CHANNEL,
  normalizePetVariant,
  normalizePetChannel,
  buildPetRuntimeConfig,
  getPetVariantProfile,
  getPetUserDataFolder,
  getPetPlatformFeatures,
  getVariantAnimationFolders,
  getVariantManifestName,
  getWindowsBuildProfile
} = require("../electron/pet-variants.cjs");

test("pet runtime config defaults to dog release", () => {
  const config = buildPetRuntimeConfig();

  assert.equal(config.variant, DEFAULT_PET_VARIANT);
  assert.equal(config.channel, DEFAULT_PET_CHANNEL);
  assert.equal(config.animationPrefix, "dog");
  assert.equal(config.defaultScale, 1.1);
  assert.deepEqual(config.actions, {
    squat: "petSquat",
    walk: "petWalk",
    feed: "petFeed",
    ball: "petBall",
    lie: "petLie",
    lick: "petLick",
    belly: "petBelly",
    stretch: "petStretch"
  });
  assert.deepEqual(config.actionOrder, ["petSquat", "petWalk", "petFeed", "petBall"]);
  assert.equal(config.channelConfig.showDebugTimers, true);
  assert.equal(config.channelConfig.hoverPanelHeight, 180);
});

test("pet runtime config keeps internal features separate from shorthair", () => {
  const dogConfig = buildPetRuntimeConfig({ variant: "dog" });
  const catConfig = buildPetRuntimeConfig({ variant: "cat" });
  const shorthairConfig = buildPetRuntimeConfig({ variant: "shorthair" });
  const tabbyConfig = buildPetRuntimeConfig({ variant: "tabby" });
  const britConfig = buildPetRuntimeConfig({ variant: "brit" });
  const pomeranianConfig = buildPetRuntimeConfig({ variant: "pomeranian" });

  assert.equal(dogConfig.features.autoStart, true);
  assert.equal(dogConfig.features.windowRoam, true);
  assert.equal(dogConfig.defaultScale, 1.1);
  assert.equal(dogConfig.autoStartRegistryKey, "ChongbanDesktopPet-dog");
  assert.equal(catConfig.features.autoStart, true);
  assert.equal(catConfig.features.windowRoam, true);
  assert.equal(catConfig.defaultScale, 1);
  assert.equal(catConfig.autoStartRegistryKey, "ChongbanDesktopPet-cat");
  assert.equal(shorthairConfig.features.autoStart, false);
  assert.equal(shorthairConfig.features.windowRoam, false);
  assert.equal(shorthairConfig.defaultScale, 1.1);
  assert.equal(shorthairConfig.autoStartRegistryKey, "ChongbanDesktopPet-shorthair");
  assert.equal(tabbyConfig.features.autoStart, true);
  assert.equal(tabbyConfig.features.windowRoam, true);
  assert.equal(tabbyConfig.features.eyeTracking, true);
  assert.equal(tabbyConfig.defaultScale, 1.1);
  assert.equal(tabbyConfig.autoStartRegistryKey, "ChongbanDesktopPet-tabby");
  assert.deepEqual(tabbyConfig.actionOrder, [
    "petSquat",
    "petWalk",
    "petFeed",
    "petBall",
    "petLie",
    "petLick",
    "petBelly",
    "petStretch"
  ]);
  assert.equal(tabbyConfig.channelConfig.hoverPanelHeight, 225);
  assert.equal(britConfig.features.autoStart, true);
  assert.equal(britConfig.features.windowRoam, true);
  assert.equal(britConfig.defaultScale, 1.1);
  assert.equal(britConfig.autoStartRegistryKey, "ChongbanDesktopPet-brit");
  assert.equal(pomeranianConfig.features.autoStart, false);
  assert.equal(pomeranianConfig.features.windowRoam, false);
  assert.equal(pomeranianConfig.defaultScale, 1.1);
  assert.equal(pomeranianConfig.autoStartRegistryKey, "ChongbanDesktopPet-pomeranian");
});

test("installer channel hides debug timers and uses compact panel height", () => {
  const config = buildPetRuntimeConfig({ variant: "cat", channel: "installer" });

  assert.equal(config.variant, "cat");
  assert.equal(config.channel, "installer");
  assert.equal(config.animationPrefix, "cat");
  assert.equal(config.channelConfig.showDebugTimers, false);
  assert.equal(config.channelConfig.hoverPanelHeight, 150);
});

test("pomeranian variant uses release and installer channels", () => {
  const releaseConfig = buildPetRuntimeConfig({ variant: "pomeranian", channel: "release" });
  const installerConfig = buildPetRuntimeConfig({ variant: "pomeranian", channel: "installer" });

  assert.equal(releaseConfig.variant, "pomeranian");
  assert.equal(releaseConfig.channel, "release");
  assert.equal(releaseConfig.animationPrefix, "pomeranian");
  assert.equal(releaseConfig.channelConfig.showDebugTimers, true);
  assert.equal(releaseConfig.channelConfig.hoverPanelHeight, 180);
  assert.equal(installerConfig.variant, "pomeranian");
  assert.equal(installerConfig.channel, "installer");
  assert.equal(installerConfig.animationPrefix, "pomeranian");
  assert.equal(installerConfig.channelConfig.showDebugTimers, false);
  assert.equal(installerConfig.channelConfig.hoverPanelHeight, 150);
});

test("variant metadata describes delivery and supported platforms", () => {
  assert.deepEqual(getPetVariantProfile("cat").platforms, ["win32", "darwin"]);
  assert.deepEqual(getPetVariantProfile("shorthair").deliveryPathSegments, ["custom", "cat", "bsh", "blue-fold"]);
  assert.deepEqual(getPetVariantProfile("brit").deliveryPathSegments, ["custom", "cat", "bsh", "blue-bicolor"]);
  assert.deepEqual(getPetVariantProfile("tabby").actions, ["squat", "walk", "feed", "ball", "lie", "lick", "belly", "stretch"]);
  assert.deepEqual(getPetVariantProfile("pomeranian").platforms, ["darwin"]);
});

test("Windows build profile centralizes paths and package names", () => {
  assert.equal(getWindowsBuildProfile("dog", "release").output, "deliverables/internal/dog/release");
  assert.equal(getWindowsBuildProfile("dog", "release").deliveryVersion, "1.1");
  assert.equal(getWindowsBuildProfile("cat", "installer").output, "deliverables/internal/cat/installer");
  assert.equal(getWindowsBuildProfile("cat", "installer").deliveryVersion, "1.2");
  assert.equal(getWindowsBuildProfile("brit", "installer").output, "deliverables/custom/cat/bsh/blue-bicolor/installer");
  assert.equal(getWindowsBuildProfile("shorthair", "release").output, "deliverables/custom/cat/bsh/blue-fold/release");
  assert.equal(getWindowsBuildProfile("tabby", "release").deliveryVersion, "1.0");
  assert.throws(() => getWindowsBuildProfile("pomeranian", "installer"), /does not support Windows packaging/);
});

test("invalid variant and channel fall back to defaults", () => {
  assert.equal(normalizePetVariant("unknown"), DEFAULT_PET_VARIANT);
  assert.equal(normalizePetChannel("unknown"), DEFAULT_PET_CHANNEL);
});

test("mac packaged user data folder uses versioned Chongban parent and variant folder", () => {
  assert.equal(
    getPetUserDataFolder({ variant: "pomeranian", channel: "installer", platform: "darwin" }),
    "Chongban 1.0/pomeranian"
  );
  assert.equal(
    getPetUserDataFolder({ variant: "pomeranian", channel: "release", platform: "darwin" }),
    "Chongban 1.0/pomeranian"
  );
  assert.equal(getPetUserDataFolder({ variant: "pomeranian", channel: "installer", platform: "win32" }), "pomeranian");
});

test("platform features hide Windows-only menu items on macOS", () => {
  assert.deepEqual(getPetPlatformFeatures({ variant: "dog", platform: "darwin" }), {
    autoStart: false,
    windowRoam: false,
    eyeTracking: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "cat", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "tabby", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: true
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "brit", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "pomeranian", platform: "win32" }), {
    autoStart: false,
    windowRoam: false,
    eyeTracking: false
  });
});

test("variant assets follow the existing animation folder convention", () => {
  assert.deepEqual(getVariantAnimationFolders("shorthair"), [
    "shorthair_squat",
    "shorthair_walk",
    "shorthair_feed",
    "shorthair_ball"
  ]);
  assert.deepEqual(getVariantAnimationFolders("pomeranian"), [
    "pomeranian_squat",
    "pomeranian_walk",
    "pomeranian_feed",
    "pomeranian_ball"
  ]);
  assert.deepEqual(getVariantAnimationFolders("tabby"), [
    "tabby_squat",
    "tabby_walk",
    "tabby_feed",
    "tabby_ball",
    "tabby_lie",
    "tabby_lick",
    "tabby_belly",
    "tabby_stretch",
    "tabby_look"
  ]);
  assert.deepEqual(getVariantAnimationFolders("brit"), [
    "brit_squat",
    "brit_walk",
    "brit_feed",
    "brit_ball"
  ]);
  assert.equal(getVariantManifestName("cat"), "cat_actions_manifest.json");
  assert.equal(getVariantManifestName("tabby"), "tabby_actions_manifest.json");
  assert.equal(getVariantManifestName("brit"), "brit_actions_manifest.json");
  assert.equal(getVariantManifestName("pomeranian"), "pomeranian_actions_manifest.json");
});
