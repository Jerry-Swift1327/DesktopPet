const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_PET_VARIANT,
  DEFAULT_PET_CHANNEL,
  PET_BREED_IDS,
  PET_VARIANT_ALIASES,
  SWITCHABLE_VARIANTS,
  resolvePetVariantId,
  normalizePetVariant,
  normalizePetChannel,
  createPetVariantMetadataDraft,
  createVariantInstallerGuid,
  buildPetVariantNamespace,
  buildPetRuntimeConfig,
  resolvePetVariantProfile,
  getPetBreedProfiles,
  getPetVariantMetadata,
  getPetVariantProfile,
  getPetUserDataFolder,
  getPetPlatformFeatures,
  getVariantAnimationFolders,
  getVariantManifestName,
  getWindowsBuildProfile,
  isValidVariantDate,
  createNextPetVariantId
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
    spin: "petSpin",
    lick: "petLick",
    belly: "petBelly",
    stretch: "petStretch",
    shake: "petShake",
    yawn: "petYawn",
    sleep: "petSleep",
    hiss: "petHiss"
  });
  assert.deepEqual(config.actionOrder, ["petSquat", "petWalk", "petFeed", "petBall"]);
  assert.equal(config.channelConfig.showDebugTimers, true);
  assert.equal(config.channelConfig.showYawnTimer, false);
  assert.equal(config.channelConfig.hoverPanelHeight, 180);
});

test("pet runtime config keeps internal features separate from shorthair", () => {
  const dogConfig = buildPetRuntimeConfig({ variant: "dog" });
  const catConfig = buildPetRuntimeConfig({ variant: "cat" });
  const shorthairConfig = buildPetRuntimeConfig({ variant: "shorthair" });
  const tabbyConfig = buildPetRuntimeConfig({ variant: "tabby" });
  const ragdollConfig = buildPetRuntimeConfig({ variant: "ragdoll" });
  const britConfig = buildPetRuntimeConfig({ variant: "brit" });
  const bshmittedConfig = buildPetRuntimeConfig({ variant: "bshmitted" });
  const vanConfig = buildPetRuntimeConfig({ variant: "van" });
  const pomeranianConfig = buildPetRuntimeConfig({ variant: "pomeranian" });

  assert.equal(dogConfig.features.autoStart, true);
  assert.equal(dogConfig.features.windowRoam, true);
  assert.equal(dogConfig.features.switchPet, false);
  assert.equal(dogConfig.defaultScale, 1.1);
  assert.equal(dogConfig.autoStartRegistryKey, "ChongbanDesktopPet-dog");
  assert.equal(catConfig.features.autoStart, true);
  assert.equal(catConfig.features.windowRoam, true);
  assert.equal(catConfig.features.switchPet, false);
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
  assert.equal(tabbyConfig.channelConfig.showYawnTimer, true);
  assert.equal(tabbyConfig.channelConfig.showSleepPoseTimer, true);
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
  assert.equal(ragdollConfig.features.autoStart, true);
  assert.equal(ragdollConfig.features.windowRoam, true);
  assert.equal(ragdollConfig.features.eyeTracking, undefined);
  assert.equal(ragdollConfig.channelConfig.showYawnTimer, true);
  assert.equal(ragdollConfig.channelConfig.showSleepPoseTimer, false);
  assert.deepEqual(ragdollConfig.actionOrder, [
    "petSquat",
    "petWalk",
    "petFeed",
    "petBall",
    "petSpin",
    "petLick",
    "petStretch",
    "petBelly"
  ]);
  assert.equal(ragdollConfig.autoStartRegistryKey, "ChongbanDesktopPet-ragdoll");
  assert.equal(britConfig.features.autoStart, true);
  assert.equal(britConfig.features.windowRoam, true);
  assert.equal(britConfig.defaultScale, 1.1);
  assert.equal(britConfig.autoStartRegistryKey, "ChongbanDesktopPet-brit");
  assert.equal(bshmittedConfig.features.autoStart, true);
  assert.equal(bshmittedConfig.features.windowRoam, true);
  assert.equal(bshmittedConfig.defaultScale, 1.1);
  assert.equal(bshmittedConfig.autoStartRegistryKey, "ChongbanDesktopPet-bshmitted");
  assert.equal(vanConfig.features.autoStart, true);
  assert.equal(vanConfig.features.windowRoam, true);
  assert.equal(vanConfig.defaultScale, 1.1);
  assert.equal(vanConfig.autoStartRegistryKey, "ChongbanDesktopPet-van");
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
  assert.equal(config.channelConfig.showYawnTimer, false);
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

test("variant metadata resolves simplified breed and delivery fields", () => {
  assert.ok(PET_BREED_IDS.includes("bsh"));
  assert.ok(PET_BREED_IDS.includes("lihua"));
  assert.ok(PET_BREED_IDS.includes("pom"));
  assert.equal(getPetBreedProfiles().lihua.species, "cat");
  assert.equal(getPetVariantMetadata("tabby").breed, "lihua");
  assert.equal(getPetVariantMetadata("pom-2601").breed, "pom");
  assert.deepEqual(getPetVariantProfile("cat").platforms, ["win32", "darwin"]);
  assert.deepEqual(getPetVariantProfile("shorthair").deliveryPathSegments, ["custom", "bsh", "shorthair"]);
  assert.deepEqual(getPetVariantProfile("brit").deliveryPathSegments, ["custom", "bsh", "brit"]);
  assert.deepEqual(getPetVariantProfile("bshmitted").deliveryPathSegments, ["custom", "bsh", "bshmitted"]);
  assert.deepEqual(getPetVariantProfile("van").deliveryPathSegments, ["custom", "bsh", "van"]);
  assert.deepEqual(getPetVariantProfile("tabby").deliveryPathSegments, ["custom", "lihua", "tabby"]);
  assert.deepEqual(getPetVariantProfile("tabby").actions, ["squat", "walk", "feed", "ball", "lie", "lick", "belly", "stretch"]);
  assert.deepEqual(getPetVariantProfile("ragdoll").deliveryPathSegments, ["internal", "ragdoll", "ragdoll"]);
  assert.deepEqual(getPetVariantProfile("ragdoll").actions, ["squat", "walk", "feed", "ball", "spin", "lick", "stretch", "belly"]);
  assert.deepEqual(getPetVariantProfile("pomeranian").platforms, ["darwin"]);
  assert.deepEqual(getPetVariantProfile("pom-2601").platforms, ["darwin"]);
  assert.deepEqual(getPetVariantProfile("pom-2601").aliases, ["pom-2601"]);
});

test("Windows build profile centralizes paths and package names", () => {
  assert.equal(getWindowsBuildProfile("dog", "release").output, "deliverables/internal/dog/dog/release");
  assert.equal(getWindowsBuildProfile("dog", "release").deliveryVersion, "1.1");
  assert.equal(getWindowsBuildProfile("cat", "installer").output, "deliverables/internal/cat/cat/installer");
  assert.equal(getWindowsBuildProfile("cat", "installer").deliveryVersion, "1.2");
  assert.equal(getWindowsBuildProfile("brit", "installer").output, "deliverables/custom/bsh/brit/installer");
  assert.equal(getWindowsBuildProfile("bshmitted", "release").output, "deliverables/custom/bsh/bshmitted/release");
  assert.equal(getWindowsBuildProfile("shorthair", "release").output, "deliverables/custom/bsh/shorthair/release");
  assert.equal(getWindowsBuildProfile("van", "release").output, "deliverables/custom/bsh/van/release");
  assert.equal(getWindowsBuildProfile("tabby", "release").output, "deliverables/custom/lihua/tabby/release");
  assert.equal(getWindowsBuildProfile("van", "release").deliveryVersion, "1.0");
  assert.equal(getWindowsBuildProfile("tabby", "release").deliveryVersion, "1.0");
  assert.equal(getWindowsBuildProfile("ragdoll", "installer").output, "deliverables/internal/ragdoll/ragdoll/installer");
  assert.equal(getWindowsBuildProfile("ragdoll", "installer").deliveryVersion, "1.3");
  assert.equal(getWindowsBuildProfile("bsh-2602", "installer").variant, "brit");
  assert.equal(getWindowsBuildProfile("bsh-2602", "installer").output, "deliverables/custom/bsh/brit/installer");
  assert.equal(getWindowsBuildProfile("lihua-2601", "release").variant, "tabby");
  assert.throws(() => getWindowsBuildProfile("unknown", "release"), /Invalid pet variant/);
  assert.throws(() => getWindowsBuildProfile("pom-2601", "installer"), /does not support Windows packaging/);
});

test("new custom variant drafts derive stable runtime and delivery defaults", () => {
  const draft = createPetVariantMetadataDraft({
    breed: "lihua",
    date: "2026-06-30"
  });
  const profile = resolvePetVariantProfile(draft);

  assert.equal(draft.id, "lihua-2602");
  assert.deepEqual(draft.aliases, []);
  assert.equal(profile.scope, "custom");
  assert.deepEqual(profile.platforms, ["win32"]);
  assert.deepEqual(profile.actions, ["squat", "walk", "feed", "ball"]);
  assert.deepEqual(profile.deliveryPathSegments, ["custom", "lihua", "lihua-2602"]);
  assert.equal(profile.animationPrefix, "lihua-2602");
  assert.equal(profile.autoStartRegistryKey, "ChongbanDesktopPet-lihua-2602");
  assert.equal(profile.singleInstanceKey, "com.chongban.desktoppet.lihua-2602");
  assert.equal(profile.features.autoStart, true);
  assert.equal(profile.features.windowRoam, true);
  assert.match(profile.installerGuid, /^[0-9a-f-]{36}$/);
  assert.equal(createVariantInstallerGuid("lihua-2602"), createVariantInstallerGuid("lihua-2602"));
});

test("variant aliases resolve to canonical ids and share one namespace", () => {
  assert.equal(resolvePetVariantId("dog-2601"), "dog");
  assert.equal(resolvePetVariantId("cat-2601"), "cat");
  assert.equal(resolvePetVariantId("bsh-2601"), "shorthair");
  assert.equal(resolvePetVariantId("lihua-2601"), "tabby");
  assert.equal(resolvePetVariantId("bsh-2602"), "brit");
  assert.equal(resolvePetVariantId("bsh-2603"), "van");
  assert.equal(resolvePetVariantId("bsh-2604"), "bshmitted");
  assert.equal(resolvePetVariantId("ragdoll-2601"), "ragdoll");
  assert.equal(resolvePetVariantId("pom-2601"), "pomeranian");
  assert.ok(PET_VARIANT_ALIASES.includes("pom-2601"));
  assert.equal(normalizePetVariant("bsh-2603"), "van");
  assert.equal(buildPetRuntimeConfig({ variant: "bsh-2603" }).variant, "van");
});

test("variant namespace rejects id and alias conflicts", () => {
  assert.throws(
    () => buildPetVariantNamespace({
      schemaVersion: 1,
      variants: {
        dog: { id: "dog", breed: "dog", aliases: ["cat"] },
        cat: { id: "cat", breed: "cat", aliases: [] }
      }
    }),
    /Duplicate pet variant namespace token: cat/
  );
  assert.throws(
    () => buildPetVariantNamespace({
      schemaVersion: 1,
      variants: {
        dog: { id: "dog", breed: "dog", aliases: ["pet_2601"] }
      }
    }),
    /Invalid pet variant alias/
  );
});

test("custom variant ids use breed-year sequence across ids and aliases", () => {
  assert.equal(createNextPetVariantId({ breed: "bsh", date: "2026-06-30" }), "bsh-2605");
  assert.equal(createNextPetVariantId({ breed: "pom", date: "2026-06-30" }), "pom-2602");
  assert.equal(createNextPetVariantId({ breed: "bsh", date: "2027-01-01" }), "bsh-2701");
});

test("historical variants include maintenance dates", () => {
  assert.equal(getPetVariantProfile("dog").date, "2026-05-08");
  assert.equal(getPetVariantProfile("cat").date, "2026-05-27");
  assert.equal(getPetVariantProfile("shorthair").date, "2026-05-28");
  assert.equal(getPetVariantProfile("tabby").date, "2026-06-09");
  assert.equal(getPetVariantProfile("brit").date, "2026-06-09");
  assert.equal(getPetVariantProfile("van").date, "2026-06-12");
  assert.equal(getPetVariantProfile("bshmitted").date, "2026-06-15");
  assert.equal(getPetVariantProfile("ragdoll").date, "2026-06-19");
  assert.equal(getPetVariantProfile("pomeranian").date, "2026-06-06");
  assert.equal(getPetVariantProfile("pomeranian").breed, "pom");
});

test("variant date validation accepts only concrete ISO dates", () => {
  assert.equal(isValidVariantDate("2026-06-30"), true);
  assert.equal(isValidVariantDate("2026-02-30"), false);
  assert.equal(isValidVariantDate("06/30/2026"), false);
});

test("invalid variant and channel fall back to defaults", () => {
  assert.equal(normalizePetVariant("unknown"), DEFAULT_PET_VARIANT);
  assert.equal(normalizePetVariant("pom-2601"), "pomeranian");
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
    eyeTracking: false,
    customization: true,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "cat", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false,
    customization: true,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "tabby", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: true,
    customization: false,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "ragdoll", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false,
    customization: false,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "brit", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false,
    customization: false,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "bshmitted", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false,
    customization: false,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "van", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false,
    customization: false,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "pomeranian", platform: "win32" }), {
    autoStart: false,
    windowRoam: false,
    eyeTracking: false,
    customization: false,
    switchPet: false
  });
});

test("switchable variants keep dog and cat logic available while menu entry is hidden", () => {
  assert.deepEqual(SWITCHABLE_VARIANTS, ["dog", "cat"]);
  assert.equal(buildPetRuntimeConfig({ variant: "dog" }).features.switchPet, false);
  assert.equal(buildPetRuntimeConfig({ variant: "cat" }).features.switchPet, false);
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
    "tabby_look",
    "tabby_shake",
    "tabby_yawn",
    "tabby_sleep",
    "tabby_hiss"
  ]);
  assert.deepEqual(getVariantAnimationFolders("ragdoll"), [
    "ragdoll_squat",
    "ragdoll_walk",
    "ragdoll_feed",
    "ragdoll_ball",
    "ragdoll_spin",
    "ragdoll_lick",
    "ragdoll_stretch",
    "ragdoll_belly",
    "ragdoll_shake",
    "ragdoll_yawn",
    "ragdoll_hiss"
  ]);
  assert.deepEqual(getVariantAnimationFolders("brit"), [
    "brit_squat",
    "brit_walk",
    "brit_feed",
    "brit_ball"
  ]);
  assert.deepEqual(getVariantAnimationFolders("bshmitted"), [
    "bshmitted_squat",
    "bshmitted_walk",
    "bshmitted_feed",
    "bshmitted_ball"
  ]);
  assert.deepEqual(getVariantAnimationFolders("van"), [
    "van_squat",
    "van_walk",
    "van_feed",
    "van_ball"
  ]);
  assert.equal(getVariantManifestName("cat"), "cat_actions_manifest.json");
  assert.equal(getVariantManifestName("tabby"), "tabby_actions_manifest.json");
  assert.equal(getVariantManifestName("ragdoll"), "ragdoll_actions_manifest.json");
  assert.equal(getVariantManifestName("brit"), "brit_actions_manifest.json");
  assert.equal(getVariantManifestName("bshmitted"), "bshmitted_actions_manifest.json");
  assert.equal(getVariantManifestName("van"), "van_actions_manifest.json");
  assert.equal(getVariantManifestName("pomeranian"), "pomeranian_actions_manifest.json");
});
