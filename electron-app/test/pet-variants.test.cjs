const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DEFAULT_PET_VARIANT,
  DEFAULT_PET_CHANNEL,
  PET_SPECIES_IDS,
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
  getActionPool,
  getFeaturePool,
  getNotesPool,
  getSpeciesProfiles,
  getTierProfiles,
  getPetVariantMetadata,
  getPetVariantMetadataList,
  getPetVariantProfile,
  getPetUserDataFolder,
  getPetPlatformFeatures,
  getVariantAnimationFolders,
  getVariantManifestName,
  getWindowsBuildProfile,
  isValidVariantDate,
  createNextPetVariantId,
  getNextInternalVersion
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
    splits: "petSplits",
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

test("metadata v2 exposes species tier notes without legacy source fields", () => {
  const raw = getPetVariantMetadata("pet2605");
  const profile = getPetVariantProfile("pet2605");

  assert.equal(raw.species, "cat");
  assert.equal(raw.tier, "advanced");
  assert.equal(raw.notes, "客户定制-高级");
  assert.equal(raw.assetPrefix, "tabby");
  assert.deepEqual(raw.actions.buttons, ["squat", "walk", "feed", "ball", "lie", "lick", "belly", "stretch"]);
  assert.deepEqual(raw.actions.assets, ["look", "shake", "yawn", "sleep", "hiss"]);
  assert.equal(Object.hasOwn(raw, "breed"), false);
  assert.equal(Object.hasOwn(raw, "aliases"), false);
  assert.equal(Object.hasOwn(raw, "tags"), false);
  assert.equal(Object.hasOwn(profile, "breedGroup"), false);
  assert.equal(Object.hasOwn(profile, "audience"), false);
});

test("catalog pools define species tiers notes actions and features", () => {
  assert.deepEqual(PET_SPECIES_IDS, ["cat", "dog"]);
  assert.equal(getSpeciesProfiles().cat.baseVariant, "pet2602");
  assert.equal(getTierProfiles().basic.actionButtons.join(","), "squat,walk,feed,ball");
  assert.equal(getNotesPool().internal.advanced, "内部使用-高级");
  assert.equal(getActionPool().look.processPreset, "direction64");
  assert.equal(getFeaturePool().idleYawn.implemented, true);
});

test("pet runtime config keeps variant features separate under pet ids", () => {
  const dogConfig = buildPetRuntimeConfig({ variant: "pet2601" });
  const catConfig = buildPetRuntimeConfig({ variant: "pet2602" });
  const shorthairConfig = buildPetRuntimeConfig({ variant: "pet2603" });
  const pomeranianConfig = buildPetRuntimeConfig({ variant: "pet2604" });
  const tabbyConfig = buildPetRuntimeConfig({ variant: "pet2605" });
  const ragdollConfig = buildPetRuntimeConfig({ variant: "pet2609" });
  const pet2610Config = buildPetRuntimeConfig({ variant: "pet2610" });

  assert.equal(dogConfig.features.autoStart, true);
  assert.equal(dogConfig.features.windowRoam, true);
  assert.equal(dogConfig.features.customization, true);
  assert.equal(dogConfig.features.switchPet, false);
  assert.equal(catConfig.defaultScale, 1);
  assert.equal(shorthairConfig.features.autoStart, false);
  assert.equal(shorthairConfig.features.windowRoam, false);
  assert.equal(pomeranianConfig.features.autoStart, false);
  assert.equal(pomeranianConfig.features.windowRoam, false);
  assert.equal(tabbyConfig.features.eyeTracking, true);
  assert.equal(tabbyConfig.features.sleepPoseSwitch, true);
  assert.equal(tabbyConfig.soundPrefix, "tabby");
  assert.equal(tabbyConfig.channelConfig.hoverPanelHeight, 225);
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
  assert.deepEqual(ragdollConfig.actionStatEffects, {
    petSplits: {
      healthDelta: 2,
      fullnessDelta: -1
    }
  });
  assert.deepEqual(ragdollConfig.actionOrder, [
    "petSquat",
    "petWalk",
    "petFeed",
    "petBall",
    "petSpin",
    "petLick",
    "petStretch",
    "petSplits"
  ]);
  assert.equal(pet2610Config.features.idleYawn, true);
  assert.equal(pet2610Config.features.dockShake, true);
  assert.deepEqual(pet2610Config.actionOrder, [
    "petSquat",
    "petWalk",
    "petFeed",
    "petBall"
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

test("variant metadata resolves pet ids species tiers and delivery fields", () => {
  assert.equal(getPetVariantMetadata("pet2605").species, "cat");
  assert.equal(getPetVariantMetadata("pet2610").species, "cat");
  assert.equal(getPetVariantMetadata("pet2604").species, "dog");
  assert.equal(getPetVariantProfile("pet2609").notes, "内部使用-高级");
  assert.deepEqual(getPetVariantProfile("pet2602").platforms, ["win32", "darwin"]);
  assert.deepEqual(getPetVariantProfile("pet2603").deliveryPathSegments, ["custom", "pet2603"]);
  assert.deepEqual(getPetVariantProfile("pet2605").actions, ["squat", "walk", "feed", "ball", "lie", "lick", "belly", "stretch"]);
  assert.deepEqual(getPetVariantProfile("pet2609").deliveryPathSegments, ["internal", "pet2609"]);
  assert.deepEqual(getPetVariantProfile("pet2609").actions, ["squat", "walk", "feed", "ball", "spin", "lick", "stretch", "splits"]);
  assert.deepEqual(getPetVariantProfile("pet2609").extraAnimationAssets, ["yawn", "hiss"]);
  assert.deepEqual(getPetVariantProfile("pet2610").extraAnimationAssets, ["shake", "yawn"]);
  assert.deepEqual(getPetVariantProfile("pet2604").platforms, ["darwin"]);
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
    "pet2609",
    "pet2610"
  ]);
  assert.deepEqual(getPetVariantMetadataList().map((profile) => profile.id), PET_VARIANT_IDS);
});

test("Windows build profile centralizes paths and package names", () => {
  assert.equal(getWindowsBuildProfile("pet2601", "release").output, "deliverables/internal/pet2601/release");
  assert.equal(getWindowsBuildProfile("pet2601", "release").deliveryVersion, "1.1");
  assert.equal(getWindowsBuildProfile("pet2602", "installer").output, "deliverables/internal/pet2602/installer");
  assert.equal(getWindowsBuildProfile("pet2602", "installer").deliveryVersion, "1.2");
  assert.equal(getWindowsBuildProfile("pet2609", "installer").output, "deliverables/internal/pet2609/installer");
  assert.equal(getWindowsBuildProfile("pet2609", "installer").deliveryVersion, "1.3");
  assert.equal(getWindowsBuildProfile("pet2610", "release").output, "deliverables/custom/pet2610/release");
  assert.equal(getWindowsBuildProfile("pet2610", "installer").soundPrefix, null);
  assert.equal(getWindowsBuildProfile("pet2605", "installer").soundPrefix, "tabby");
  assert.deepEqual(getWindowsBuildProfile("pet2601", "release").switchableVariants, ["pet2601", "pet2602"]);
  assert.throws(() => getWindowsBuildProfile("unknown", "release"), /Invalid pet variant/);
  assert.throws(() => getWindowsBuildProfile("pet2604", "installer"), /does not support Windows packaging/);
});

test("new variant drafts derive V2 fields version notes and delivery defaults", () => {
  const customDraft = createPetVariantMetadataDraft({
    species: "cat",
    tier: "advanced",
    date: "2026-06-30"
  });
  const internalDraft = createPetVariantMetadataDraft({
    species: "dog",
    scope: "internal",
    tier: "basic",
    date: "2026-07-01"
  });
  const profile = resolvePetVariantProfile(customDraft);

  assert.equal(customDraft.id, "pet2611");
  assert.equal(customDraft.notes, "客户定制-高级");
  assert.equal(customDraft.version, "1.0");
  assert.equal(internalDraft.version, "1.4");
  assert.equal(getNextInternalVersion(), "1.4");
  assert.equal(profile.scope, "custom");
  assert.equal(profile.species, "cat");
  assert.equal(profile.tier, "advanced");
  assert.deepEqual(profile.platforms, ["win32"]);
  assert.deepEqual(profile.deliveryPathSegments, ["custom", "pet2611"]);
  assert.equal(profile.animationPrefix, "pet2611");
  assert.match(profile.installerGuid, /^[0-9a-f-]{36}$/);
  assert.equal(createVariantInstallerGuid("pet2611"), createVariantInstallerGuid("pet2611"));
});

test("explicit feature draft overrides do not inherit tier feature defaults", () => {
  const draft = createPetVariantMetadataDraft({
    species: "cat",
    tier: "advanced",
    date: "2026-07-06",
    features: {
      enable: ["autoStart", "windowRoam"],
      disable: []
    }
  });
  const profile = resolvePetVariantProfile(draft);

  assert.equal(profile.features.autoStart, true);
  assert.equal(profile.features.windowRoam, true);
  assert.equal(Boolean(profile.features.idleYawn), false);
  assert.equal(Boolean(profile.features.wakeHiss), false);
});

test("variant ids resolve to canonical ids only", () => {
  assert.equal(resolvePetVariantId("pet2601"), "pet2601");
  assert.equal(resolvePetVariantId("pet2605"), "pet2605");
  assert.equal(resolvePetVariantId("dog-2601"), null);
  assert.deepEqual(PET_VARIANT_ALIASES, []);
  assert.equal(normalizePetVariant("bsh-2603"), DEFAULT_PET_VARIANT);
  assert.equal(buildPetRuntimeConfig({ variant: "bsh-2603" }).variant, DEFAULT_PET_VARIANT);
});

test("variant namespace rejects duplicate ids and V2 validation rejects unknown actions/features", () => {
  assert.throws(
    () => buildPetVariantNamespace({
      schemaVersion: 2,
      variants: {
        pet2601: { id: "pet2601", species: "dog", date: "2026-05-08" },
        pet2602: { id: "pet2601", species: "cat", date: "2026-05-27" }
      }
    }),
    /does not match/
  );
  assert.throws(
    () => resolvePetVariantProfile({
      id: "pet2611",
      date: "2026-07-06",
      species: "cat",
      actions: { buttons: ["squat", "frolic"], assets: [] }
    }),
    /Unknown pet action frolic/
  );
  assert.throws(
    () => resolvePetVariantProfile({
      id: "pet2611",
      date: "2026-07-06",
      species: "cat",
      features: { enable: ["doubleClickAction"], disable: [] }
    }),
    /Unknown pet feature doubleClickAction/
  );
});

test("custom variant ids use pet-year sequence across dated variants", () => {
  assert.equal(createNextPetVariantId({ date: "2026-06-30" }), "pet2611");
  assert.equal(createNextPetVariantId({ date: "2026-07-01" }), "pet2611");
  assert.equal(createNextPetVariantId({ date: "2027-01-01" }), "pet2701");
  assert.throws(() => createNextPetVariantId({ date: "2026-06-01" }), /would require resequencing/);
});

test("variant date validation accepts only concrete ISO dates", () => {
  assert.equal(isValidVariantDate("2026-06-30"), true);
  assert.equal(isValidVariantDate("2026-02-30"), false);
  assert.equal(isValidVariantDate("06/30/2026"), false);
});

test("invalid variant and channel fall back to defaults", () => {
  assert.equal(normalizePetVariant("unknown"), DEFAULT_PET_VARIANT);
  assert.equal(normalizePetChannel("unknown"), DEFAULT_PET_CHANNEL);
});

test("mac packaged user data folder uses versioned Chongban parent and variant folder", () => {
  assert.equal(
    getPetUserDataFolder({ variant: "pet2604", channel: "installer", platform: "darwin" }),
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
  assert.deepEqual(getPetPlatformFeatures({ variant: "pet2605", platform: "win32" }), {
    autoStart: true,
    windowRoam: true,
    eyeTracking: true,
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
    "ragdoll_splits",
    "ragdoll_yawn",
    "ragdoll_hiss"
  ]);
  assert.deepEqual(getVariantAnimationFolders("pet2610"), [
    "pet2610_squat",
    "pet2610_walk",
    "pet2610_feed",
    "pet2610_ball",
    "pet2610_shake",
    "pet2610_yawn"
  ]);
  assert.equal(getVariantManifestName("pet2602"), "cat_actions_manifest.json");
  assert.equal(getVariantManifestName("pet2605"), "tabby_actions_manifest.json");
  assert.equal(getVariantManifestName("pet2609"), "ragdoll_actions_manifest.json");
  assert.equal(getVariantManifestName("pet2610"), "pet2610_actions_manifest.json");
});
