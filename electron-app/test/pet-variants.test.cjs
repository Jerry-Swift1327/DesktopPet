const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_PET_VARIANT,
  DEFAULT_PET_CHANNEL,
  PET_BREED_IDS,
  PET_VARIANT_ALIASES,
  PET_VARIANT_IDS,
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
  getPetVariantMetadataList,
  getPetVariantProfile,
  getPetUserDataFolder,
  getPetPlatformFeatures,
  getVariantAnimationFolders,
  getVariantManifestName,
  getWindowsBuildProfile,
  isValidVariantDate,
  createNextPetVariantId
} = require("../electron/pet-variants.cjs");

test("pet runtime config defaults to pet2601 release while keeping dog assets", () => {
  const config = buildPetRuntimeConfig();

  assert.equal(DEFAULT_PET_VARIANT, "pet2601");
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

test("pet runtime config keeps variant features separate under pet ids", () => {
  const dogConfig = buildPetRuntimeConfig({ variant: "pet2601" });
  const catConfig = buildPetRuntimeConfig({ variant: "pet2602" });
  const shorthairConfig = buildPetRuntimeConfig({ variant: "pet2603" });
  const pomeranianConfig = buildPetRuntimeConfig({ variant: "pet2604" });
  const tabbyConfig = buildPetRuntimeConfig({ variant: "pet2605" });
  const britConfig = buildPetRuntimeConfig({ variant: "pet2606" });
  const vanConfig = buildPetRuntimeConfig({ variant: "pet2607" });
  const bshmittedConfig = buildPetRuntimeConfig({ variant: "pet2608" });
  const ragdollConfig = buildPetRuntimeConfig({ variant: "pet2609" });

  assert.equal(dogConfig.features.autoStart, true);
  assert.equal(dogConfig.features.windowRoam, true);
  assert.equal(dogConfig.features.switchPet, false);
  assert.equal(dogConfig.defaultScale, 1.1);
  assert.equal(dogConfig.autoStartRegistryKey, "ChongbanDesktopPet-pet2601");
  assert.equal(catConfig.features.autoStart, true);
  assert.equal(catConfig.features.windowRoam, true);
  assert.equal(catConfig.features.switchPet, false);
  assert.equal(catConfig.defaultScale, 1);
  assert.equal(catConfig.autoStartRegistryKey, "ChongbanDesktopPet-pet2602");
  assert.equal(shorthairConfig.features.autoStart, false);
  assert.equal(shorthairConfig.features.windowRoam, false);
  assert.equal(shorthairConfig.defaultScale, 1.1);
  assert.equal(shorthairConfig.autoStartRegistryKey, "ChongbanDesktopPet-pet2603");
  assert.equal(pomeranianConfig.features.autoStart, false);
  assert.equal(pomeranianConfig.features.windowRoam, false);
  assert.equal(pomeranianConfig.defaultScale, 1.1);
  assert.equal(pomeranianConfig.autoStartRegistryKey, "ChongbanDesktopPet-pet2604");
  assert.equal(tabbyConfig.features.autoStart, true);
  assert.equal(tabbyConfig.features.windowRoam, true);
  assert.equal(tabbyConfig.features.eyeTracking, true);
  assert.equal(tabbyConfig.defaultScale, 1.1);
  assert.equal(tabbyConfig.autoStartRegistryKey, "ChongbanDesktopPet-pet2605");
  assert.equal(tabbyConfig.soundPrefix, "tabby");
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
  assert.equal(britConfig.features.autoStart, true);
  assert.equal(vanConfig.features.autoStart, true);
  assert.equal(bshmittedConfig.features.autoStart, true);
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
});

test("installer channel hides debug timers and uses compact panel height", () => {
  const config = buildPetRuntimeConfig({ variant: "pet2602", channel: "installer" });

  assert.equal(config.variant, "pet2602");
  assert.equal(config.channel, "installer");
  assert.equal(config.animationPrefix, "cat");
  assert.equal(config.channelConfig.showDebugTimers, false);
  assert.equal(config.channelConfig.showYawnTimer, false);
  assert.equal(config.channelConfig.hoverPanelHeight, 150);
});

test("pomeranian variant uses release and installer channels", () => {
  const releaseConfig = buildPetRuntimeConfig({ variant: "pet2604", channel: "release" });
  const installerConfig = buildPetRuntimeConfig({ variant: "pet2604", channel: "installer" });

  assert.equal(releaseConfig.variant, "pet2604");
  assert.equal(releaseConfig.channel, "release");
  assert.equal(releaseConfig.animationPrefix, "pomeranian");
  assert.equal(releaseConfig.channelConfig.showDebugTimers, true);
  assert.equal(releaseConfig.channelConfig.hoverPanelHeight, 180);
  assert.equal(installerConfig.variant, "pet2604");
  assert.equal(installerConfig.channel, "installer");
  assert.equal(installerConfig.animationPrefix, "pomeranian");
  assert.equal(installerConfig.channelConfig.showDebugTimers, false);
  assert.equal(installerConfig.channelConfig.hoverPanelHeight, 150);
});

test("variant metadata resolves pet ids, breeds and delivery fields", () => {
  assert.ok(PET_BREED_IDS.includes("gr"));
  assert.ok(PET_BREED_IDS.includes("ash"));
  assert.ok(PET_BREED_IDS.includes("sf"));
  assert.ok(PET_BREED_IDS.includes("lihua"));
  assert.equal(getPetBreedProfiles().gr.species, "dog");
  assert.equal(getPetBreedProfiles().ash.species, "cat");
  assert.equal(getPetVariantMetadata("pet2605").breed, "lihua");
  assert.equal(getPetVariantMetadata("pet2604").breed, "pom");
  assert.deepEqual(getPetVariantProfile("pet2602").platforms, ["win32", "darwin"]);
  assert.deepEqual(getPetVariantProfile("pet2603").deliveryPathSegments, ["custom", "pet2603"]);
  assert.deepEqual(getPetVariantProfile("pet2606").deliveryPathSegments, ["custom", "pet2606"]);
  assert.deepEqual(getPetVariantProfile("pet2608").deliveryPathSegments, ["custom", "pet2608"]);
  assert.deepEqual(getPetVariantProfile("pet2607").deliveryPathSegments, ["custom", "pet2607"]);
  assert.deepEqual(getPetVariantProfile("pet2605").deliveryPathSegments, ["custom", "pet2605"]);
  assert.deepEqual(getPetVariantProfile("pet2605").actions, ["squat", "walk", "feed", "ball", "lie", "lick", "belly", "stretch"]);
  assert.deepEqual(getPetVariantProfile("pet2609").deliveryPathSegments, ["internal", "pet2609"]);
  assert.deepEqual(getPetVariantProfile("pet2609").actions, ["squat", "walk", "feed", "ball", "spin", "lick", "stretch", "belly"]);
  assert.deepEqual(getPetVariantProfile("pet2604").platforms, ["darwin"]);
  assert.deepEqual(getPetVariantProfile("pet2604").aliases, []);
});

test("variant lists are sorted by date ascending", () => {
  assert.deepEqual(PET_VARIANT_IDS, [
    "pet2601",
    "pet2602",
    "pet2603",
    "pet2604",
    "pet2605",
    "pet2606",
    "pet2607",
    "pet2608",
    "pet2609"
  ]);
  assert.deepEqual(getPetVariantMetadataList().map((profile) => profile.id), PET_VARIANT_IDS);
});

test("Windows build profile centralizes paths and package names", () => {
  assert.equal(getWindowsBuildProfile("pet2601", "release").output, "deliverables/internal/pet2601/release");
  assert.equal(getWindowsBuildProfile("pet2601", "release").deliveryVersion, "1.1");
  assert.equal(getWindowsBuildProfile("pet2602", "installer").output, "deliverables/internal/pet2602/installer");
  assert.equal(getWindowsBuildProfile("pet2602", "installer").deliveryVersion, "1.2");
  assert.equal(getWindowsBuildProfile("pet2606", "installer").output, "deliverables/custom/pet2606/installer");
  assert.equal(getWindowsBuildProfile("pet2608", "release").output, "deliverables/custom/pet2608/release");
  assert.equal(getWindowsBuildProfile("pet2603", "release").output, "deliverables/custom/pet2603/release");
  assert.equal(getWindowsBuildProfile("pet2607", "release").output, "deliverables/custom/pet2607/release");
  assert.equal(getWindowsBuildProfile("pet2605", "release").output, "deliverables/custom/pet2605/release");
  assert.equal(getWindowsBuildProfile("pet2607", "release").deliveryVersion, "1.0");
  assert.equal(getWindowsBuildProfile("pet2605", "release").deliveryVersion, "1.0");
  assert.equal(getWindowsBuildProfile("pet2609", "installer").output, "deliverables/internal/pet2609/installer");
  assert.equal(getWindowsBuildProfile("pet2609", "installer").deliveryVersion, "1.3");
  assert.equal(getWindowsBuildProfile("pet2605", "installer").soundPrefix, "tabby");
  assert.deepEqual(getWindowsBuildProfile("pet2601", "release").switchableVariants, ["pet2601", "pet2602"]);
  assert.throws(() => getWindowsBuildProfile("unknown", "release"), /Invalid pet variant/);
  assert.throws(() => getWindowsBuildProfile("pet2604", "installer"), /does not support Windows packaging/);
});

test("new custom variant drafts derive pet id runtime and delivery defaults", () => {
  const draft = createPetVariantMetadataDraft({
    breed: "lihua",
    date: "2026-06-30"
  });
  const profile = resolvePetVariantProfile(draft);

  assert.equal(draft.id, "pet2610");
  assert.equal(draft.aliases, "");
  assert.equal(profile.scope, "custom");
  assert.deepEqual(profile.platforms, ["win32"]);
  assert.deepEqual(profile.actions, ["squat", "walk", "feed", "ball"]);
  assert.deepEqual(profile.deliveryPathSegments, ["custom", "pet2610"]);
  assert.equal(profile.animationPrefix, "pet2610");
  assert.equal(profile.autoStartRegistryKey, "ChongbanDesktopPet-pet2610");
  assert.equal(profile.singleInstanceKey, "com.chongban.desktoppet.pet2610");
  assert.equal(profile.features.autoStart, true);
  assert.equal(profile.features.windowRoam, true);
  assert.match(profile.installerGuid, /^[0-9a-f-]{36}$/);
  assert.equal(createVariantInstallerGuid("pet2610"), createVariantInstallerGuid("pet2610"));
});

test("variant ids resolve to canonical ids without historical aliases", () => {
  assert.equal(resolvePetVariantId("pet2601"), "pet2601");
  assert.equal(resolvePetVariantId("pet2605"), "pet2605");
  assert.equal(resolvePetVariantId("dog-2601"), null);
  assert.equal(resolvePetVariantId("bsh-2602"), null);
  assert.equal(resolvePetVariantId("pom-2601"), null);
  assert.deepEqual(PET_VARIANT_ALIASES, []);
  assert.equal(normalizePetVariant("bsh-2603"), DEFAULT_PET_VARIANT);
  assert.equal(buildPetRuntimeConfig({ variant: "bsh-2603" }).variant, DEFAULT_PET_VARIANT);
});

test("variant namespace rejects id and alias conflicts", () => {
  assert.throws(
    () => buildPetVariantNamespace({
      schemaVersion: 1,
      variants: {
        pet2601: { id: "pet2601", breed: "gr", aliases: "pet2602" },
        pet2602: { id: "pet2602", breed: "ash", aliases: "" }
      }
    }),
    /Duplicate pet variant namespace token: pet2602/
  );
  assert.throws(
    () => buildPetVariantNamespace({
      schemaVersion: 1,
      variants: {
        pet2601: { id: "pet2601", breed: "gr", aliases: ["pet2602"] }
      }
    }),
    /aliases must be a string/
  );
  assert.throws(
    () => buildPetVariantNamespace({
      schemaVersion: 1,
      variants: {
        pet2601: { id: "pet2601", breed: "gr", aliases: "pet_2601" }
      }
    }),
    /Invalid pet variant alias/
  );
});

test("custom variant ids use pet-year sequence across dated variants", () => {
  assert.equal(createNextPetVariantId({ breed: "bsh", date: "2026-06-30" }), "pet2610");
  assert.equal(createNextPetVariantId({ breed: "pom", date: "2026-07-01" }), "pet2610");
  assert.equal(createNextPetVariantId({ breed: "bsh", date: "2027-01-01" }), "pet2701");
  assert.throws(() => createNextPetVariantId({ breed: "bsh", date: "2026-06-01" }), /would require resequencing/);
});

test("historical variants include maintenance dates", () => {
  assert.equal(getPetVariantProfile("pet2601").date, "2026-05-08");
  assert.equal(getPetVariantProfile("pet2602").date, "2026-05-27");
  assert.equal(getPetVariantProfile("pet2603").date, "2026-05-28");
  assert.equal(getPetVariantProfile("pet2604").date, "2026-06-06");
  assert.equal(getPetVariantProfile("pet2605").date, "2026-06-09");
  assert.equal(getPetVariantProfile("pet2606").date, "2026-06-09");
  assert.equal(getPetVariantProfile("pet2607").date, "2026-06-12");
  assert.equal(getPetVariantProfile("pet2608").date, "2026-06-15");
  assert.equal(getPetVariantProfile("pet2609").date, "2026-06-19");
  assert.equal(getPetVariantProfile("pet2601").breed, "gr");
  assert.equal(getPetVariantProfile("pet2602").breed, "ash");
  assert.equal(getPetVariantProfile("pet2603").breed, "sf");
});

test("variant date validation accepts only concrete ISO dates", () => {
  assert.equal(isValidVariantDate("2026-06-30"), true);
  assert.equal(isValidVariantDate("2026-02-30"), false);
  assert.equal(isValidVariantDate("06/30/2026"), false);
});

test("invalid variant and channel fall back to defaults", () => {
  assert.equal(normalizePetVariant("unknown"), DEFAULT_PET_VARIANT);
  assert.equal(normalizePetVariant("pom-2601"), DEFAULT_PET_VARIANT);
  assert.equal(normalizePetChannel("unknown"), DEFAULT_PET_CHANNEL);
});

test("mac packaged user data folder uses versioned Chongban parent and variant folder", () => {
  assert.equal(
    getPetUserDataFolder({ variant: "pet2604", channel: "installer", platform: "darwin" }),
    "Chongban 1.0/pet2604"
  );
  assert.equal(
    getPetUserDataFolder({ variant: "pet2604", channel: "release", platform: "darwin" }),
    "Chongban 1.0/pet2604"
  );
  assert.equal(getPetUserDataFolder({ variant: "pet2604", channel: "installer", platform: "win32" }), "pet2604");
});

test("platform features hide Windows-only menu items on macOS", () => {
  assert.deepEqual(getPetPlatformFeatures({ variant: "pet2601", platform: "darwin" }), {
    autoStart: false,
    windowRoam: false,
    eyeTracking: false,
    customization: true,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "pet2602", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false,
    customization: true,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "pet2605", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: true,
    customization: false,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "pet2609", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false,
    customization: false,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "pet2606", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false,
    customization: false,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "pet2608", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false,
    customization: false,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "pet2607", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: false,
    customization: false,
    switchPet: false
  });
  assert.deepEqual(getPetPlatformFeatures({ variant: "pet2604", platform: "win32" }), {
    autoStart: false,
    windowRoam: false,
    eyeTracking: false,
    customization: false,
    switchPet: false
  });
});

test("switchable variants keep dog and cat logic available while menu entry is hidden", () => {
  assert.deepEqual(SWITCHABLE_VARIANTS, ["pet2601", "pet2602"]);
  assert.equal(buildPetRuntimeConfig({ variant: "pet2601" }).features.switchPet, false);
  assert.equal(buildPetRuntimeConfig({ variant: "pet2602" }).features.switchPet, false);
});

test("existing variants keep the current animation folder convention", () => {
  assert.deepEqual(getVariantAnimationFolders("pet2603"), [
    "shorthair_squat",
    "shorthair_walk",
    "shorthair_feed",
    "shorthair_ball"
  ]);
  assert.deepEqual(getVariantAnimationFolders("pet2604"), [
    "pomeranian_squat",
    "pomeranian_walk",
    "pomeranian_feed",
    "pomeranian_ball"
  ]);
  assert.deepEqual(getVariantAnimationFolders("pet2605"), [
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
  assert.deepEqual(getVariantAnimationFolders("pet2609"), [
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
  assert.deepEqual(getVariantAnimationFolders("pet2606"), [
    "brit_squat",
    "brit_walk",
    "brit_feed",
    "brit_ball"
  ]);
  assert.deepEqual(getVariantAnimationFolders("pet2608"), [
    "bshmitted_squat",
    "bshmitted_walk",
    "bshmitted_feed",
    "bshmitted_ball"
  ]);
  assert.deepEqual(getVariantAnimationFolders("pet2607"), [
    "van_squat",
    "van_walk",
    "van_feed",
    "van_ball"
  ]);
  assert.equal(getVariantManifestName("pet2602"), "cat_actions_manifest.json");
  assert.equal(getVariantManifestName("pet2605"), "tabby_actions_manifest.json");
  assert.equal(getVariantManifestName("pet2609"), "ragdoll_actions_manifest.json");
  assert.equal(getVariantManifestName("pet2606"), "brit_actions_manifest.json");
  assert.equal(getVariantManifestName("pet2608"), "bshmitted_actions_manifest.json");
  assert.equal(getVariantManifestName("pet2607"), "van_actions_manifest.json");
  assert.equal(getVariantManifestName("pet2604"), "pomeranian_actions_manifest.json");
});
