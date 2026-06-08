const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_PET_VARIANT,
  DEFAULT_PET_CHANNEL,
  normalizePetVariant,
  normalizePetChannel,
  buildPetRuntimeConfig,
  getVariantAnimationFolders,
  getVariantManifestName
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
    ball: "petBall"
  });
  assert.deepEqual(config.actionOrder, ["petSquat", "petWalk", "petFeed", "petBall"]);
  assert.equal(config.channelConfig.showDebugTimers, true);
  assert.equal(config.channelConfig.hoverPanelHeight, 180);
});

test("pet runtime config keeps internal features separate from shorthair", () => {
  const dogConfig = buildPetRuntimeConfig({ variant: "dog" });
  const catConfig = buildPetRuntimeConfig({ variant: "cat" });
  const shorthairConfig = buildPetRuntimeConfig({ variant: "shorthair" });

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
});

test("installer channel hides debug timers and uses compact panel height", () => {
  const config = buildPetRuntimeConfig({ variant: "cat", channel: "installer" });

  assert.equal(config.variant, "cat");
  assert.equal(config.channel, "installer");
  assert.equal(config.animationPrefix, "cat");
  assert.equal(config.channelConfig.showDebugTimers, false);
  assert.equal(config.channelConfig.hoverPanelHeight, 150);
});

test("invalid variant and channel fall back to defaults", () => {
  assert.equal(normalizePetVariant("unknown"), DEFAULT_PET_VARIANT);
  assert.equal(normalizePetChannel("unknown"), DEFAULT_PET_CHANNEL);
});

test("variant assets follow the existing animation folder convention", () => {
  assert.deepEqual(getVariantAnimationFolders("shorthair"), [
    "shorthair_squat",
    "shorthair_walk",
    "shorthair_feed",
    "shorthair_ball"
  ]);
  assert.equal(getVariantManifestName("cat"), "cat_actions_manifest.json");
});
