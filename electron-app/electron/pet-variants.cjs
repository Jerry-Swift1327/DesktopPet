const crypto = require("crypto");
const path = require("path");

const PET_VARIANT_CONFIG_FILE = "pet_variant.json";
const PREFERRED_VARIANT_FILE = "preferred-variant.json";
const DEFAULT_PET_VARIANT = "pet2601";
const DEFAULT_PET_CHANNEL = "release";
const DEFAULT_PET_PLATFORM = "win32";
const DEFAULT_PET_SCOPE = "custom";
const MAC_USER_DATA_PARENT = "Chongban 1.0";
const SWITCHABLE_VARIANTS = Object.freeze(["pet2601", "pet2602"]);
const PET_VARIANT_METADATA_FILE = path.join(__dirname, "pet-variant-metadata.json");
const INSTALLER_GUID_NAMESPACE = "6d0c98fd-153d-40cf-9738-77c241c1e064";
const PET_VARIANT_NAMESPACE_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const PET_VARIANT_ID_PATTERN = /^pet\d{4}$/;

const PET_ACTIONS = Object.freeze({
  squat: Object.freeze({ id: "petSquat", asset: "squat" }),
  walk: Object.freeze({ id: "petWalk", asset: "walk" }),
  feed: Object.freeze({ id: "petFeed", asset: "feed" }),
  ball: Object.freeze({ id: "petBall", asset: "ball" }),
  lie: Object.freeze({ id: "petLie", asset: "lie" }),
  spin: Object.freeze({ id: "petSpin", asset: "spin" }),
  lick: Object.freeze({ id: "petLick", asset: "lick" }),
  belly: Object.freeze({ id: "petBelly", asset: "belly" }),
  stretch: Object.freeze({ id: "petStretch", asset: "stretch" }),
  splits: Object.freeze({ id: "petSplits", asset: "splits" }),
  shake: Object.freeze({ id: "petShake", asset: "shake" }),
  yawn: Object.freeze({ id: "petYawn", asset: "yawn" }),
  sleep: Object.freeze({ id: "petSleep", asset: "sleep" }),
  hiss: Object.freeze({ id: "petHiss", asset: "hiss" })
});

const PET_ACTION_ORDER = Object.freeze(["squat", "walk", "feed", "ball"]);

const PET_BREED_PROFILES = Object.freeze({
  ash: Object.freeze({ id: "ash", species: "cat", baseVariant: "pet2602" }),
  bsh: Object.freeze({ id: "bsh", species: "cat", baseVariant: "pet2602" }),
  gr: Object.freeze({ id: "gr", species: "dog", baseVariant: "pet2601" }),
  lihua: Object.freeze({ id: "lihua", species: "cat", baseVariant: "pet2602" }),
  ragdoll: Object.freeze({ id: "ragdoll", species: "cat", baseVariant: "pet2602" }),
  pom: Object.freeze({ id: "pom", species: "dog", baseVariant: "pet2601" }),
  sf: Object.freeze({ id: "sf", species: "cat", baseVariant: "pet2602" })
});

const DEFAULT_FEATURES = Object.freeze({
  autoStart: true,
  windowRoam: true
});

const RAW_PET_VARIANT_METADATA = require("./pet-variant-metadata.json");

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

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return value;
}

function normalizeVariantMetadata(metadata) {
  return {
    schemaVersion: metadata.schemaVersion || 1,
    variants: metadata.variants || metadata
  };
}

const PET_VARIANT_METADATA = deepFreeze(normalizeVariantMetadata(RAW_PET_VARIANT_METADATA));

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseUuid(uuid) {
  return Buffer.from(uuid.replace(/-/g, ""), "hex");
}

function formatUuid(bytes) {
  const hex = Buffer.from(bytes).toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32)
  ].join("-");
}

function createUuidV5(name, namespace = INSTALLER_GUID_NAMESPACE) {
  const hash = crypto.createHash("sha1")
    .update(parseUuid(namespace))
    .update(String(name))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function createVariantInstallerGuid(id) {
  return createUuidV5(`installer:${id}`);
}

function normalizePlatforms(raw = {}) {
  if (Array.isArray(raw.platforms) && raw.platforms.length > 0) {
    return raw.platforms.slice();
  }
  if (raw.platform) {
    return [raw.platform];
  }
  return [DEFAULT_PET_PLATFORM];
}

function assertKnownAction(action, variantId) {
  if (!Object.prototype.hasOwnProperty.call(PET_ACTIONS, action)) {
    throw new Error(`Unknown pet action ${action} in variant ${variantId}.`);
  }
}

function normalizeActionLabelOverrides(rawProfile = {}, variantId = "") {
  const overrides = rawProfile.actionLabelOverrides || {};
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides)) {
    throw new Error(`Pet variant ${variantId} actionLabelOverrides must be an object.`);
  }
  const result = {};
  for (const [action, label] of Object.entries(overrides)) {
    assertKnownAction(action, variantId);
    if (typeof label !== "string" || !label.trim()) {
      throw new Error(`Pet variant ${variantId} action label override for ${action} must be a non-empty string.`);
    }
    result[action] = label;
  }
  return result;
}

function normalizeActionStatEffects(rawProfile = {}, variantId = "") {
  const effects = rawProfile.actionStatEffects || {};
  if (!effects || typeof effects !== "object" || Array.isArray(effects)) {
    throw new Error(`Pet variant ${variantId} actionStatEffects must be an object.`);
  }
  const result = {};
  for (const [action, effect] of Object.entries(effects)) {
    assertKnownAction(action, variantId);
    if (!effect || typeof effect !== "object" || Array.isArray(effect)) {
      throw new Error(`Pet variant ${variantId} action stat effect for ${action} must be an object.`);
    }
    const normalized = {};
    for (const key of ["intimacyDelta", "healthDelta", "fullnessDelta"]) {
      if (effect[key] !== undefined) {
        const value = Number(effect[key]);
        if (!Number.isFinite(value)) {
          throw new Error(`Pet variant ${variantId} action stat effect ${action}.${key} must be numeric.`);
        }
        normalized[key] = value;
      }
    }
    result[PET_ACTIONS[action].id] = normalized;
  }
  return result;
}

function getVariantAliases(rawProfile = {}) {
  if (rawProfile.aliases === undefined || rawProfile.aliases === null || rawProfile.aliases === "-") {
    return [];
  }
  if (typeof rawProfile.aliases !== "string") {
    throw new Error(`Pet variant ${rawProfile.id || "<unknown>"} aliases must be a string.`);
  }
  const aliases = rawProfile.aliases
    .split(",")
    .map((alias) => alias.trim())
    .filter(Boolean)
    .filter((alias) => alias !== "-");
  return aliases;
}

function assertVariantNamespaceToken(token, kind, variantId) {
  if (!PET_VARIANT_NAMESPACE_PATTERN.test(String(token || ""))) {
    throw new Error(`Invalid pet variant ${kind} ${token} in ${variantId}. Use lowercase letters, numbers and hyphens.`);
  }
}

function assertPetVariantId(value) {
  if (!PET_VARIANT_ID_PATTERN.test(String(value || ""))) {
    throw new Error(`Invalid pet variant id ${value}. Use pet<yy><seq>, such as pet2601.`);
  }
}

function getPetVariantIdYear(id) {
  assertPetVariantId(id);
  return String(id).slice(3, 5);
}

function getPetVariantIdSequence(id) {
  assertPetVariantId(id);
  return Number(String(id).slice(5, 7));
}

function assertPetVariantIdMatchesDate(id, date) {
  assertPetVariantId(id);
  if (!isValidVariantDate(date)) {
    throw new Error(`Pet variant ${id} date must be a valid YYYY-MM-DD date.`);
  }
  if (getPetVariantIdYear(id) !== getVariantIdYear(date)) {
    throw new Error(`Pet variant ${id} year does not match date ${date}.`);
  }
}

function buildPetVariantNamespace(metadata = PET_VARIANT_METADATA) {
  const variants = normalizeVariantMetadata(metadata).variants;
  const namespace = {};

  function register(token, variantId, kind) {
    assertVariantNamespaceToken(token, kind, variantId);
    if (Object.prototype.hasOwnProperty.call(namespace, token)) {
      const existing = namespace[token];
      throw new Error(
        `Duplicate pet variant namespace token: ${token} (${existing.kind} of ${existing.variantId}, ${kind} of ${variantId}).`
      );
    }
    namespace[token] = Object.freeze({ variantId, kind });
  }

  for (const [metadataKey, rawProfile] of Object.entries(variants)) {
    const id = rawProfile.id || metadataKey;
    if (id !== metadataKey) {
      throw new Error(`Pet variant metadata key ${metadataKey} does not match id ${id}.`);
    }
    assertPetVariantId(id);
    register(id, id, "id");
    for (const alias of getVariantAliases({ ...rawProfile, id })) {
      register(alias, id, "alias");
    }
  }

  return deepFreeze(namespace);
}

function resolvePetVariantProfile(rawProfile) {
  const id = rawProfile.id;
  const breed = rawProfile.breed;
  const breedProfile = PET_BREED_PROFILES[breed];
  if (!id) {
    throw new Error("Pet variant metadata is missing id.");
  }
  assertPetVariantIdMatchesDate(id, rawProfile.date);
  if (!breedProfile) {
    throw new Error(`Pet variant ${id} uses unknown breed: ${breed}`);
  }

  const scope = rawProfile.scope || DEFAULT_PET_SCOPE;
  const extraActions = (rawProfile.extraActions || rawProfile.additionalActions || []).slice();
  for (const action of extraActions) {
    assertKnownAction(action, id);
  }
  const aliases = getVariantAliases(rawProfile);
  const actions = PET_ACTION_ORDER.concat(extraActions);
  const extraAssets = (rawProfile.extraAssets || rawProfile.extraAnimationAssets || []).slice();
  const features = Object.assign({}, DEFAULT_FEATURES, rawProfile.features || {});
  const actionLabelOverrides = normalizeActionLabelOverrides(rawProfile, id);
  const actionStatEffects = normalizeActionStatEffects(rawProfile, id);
  const version = rawProfile.version || rawProfile.deliveryVersion || "1.0";
  const scale = Number(rawProfile.scale ?? rawProfile.defaultScale ?? 1.1);
  const deliveryPathSegments = rawProfile.deliveryPathSegments || [scope, id];

  return deepFreeze({
    id,
    breed,
    date: rawProfile.date || null,
    aliases,
    scope,
    species: rawProfile.species || breedProfile.species,
    audience: scope,
    baseVariant: rawProfile.baseVariant || breedProfile.baseVariant,
    breedGroup: breed,
    tags: (rawProfile.tags || []).slice(),
    platforms: normalizePlatforms(rawProfile),
    deliveryPathSegments: deliveryPathSegments.slice(),
    version,
    deliveryVersion: version,
    animationPrefix: rawProfile.assetPrefix || rawProfile.animationPrefix || id,
    soundPrefix: rawProfile.soundPrefix || null,
    actions,
    extraActions,
    extraAnimationAssets: extraAssets,
    extraAssets,
    actionLabelOverrides,
    actionStatEffects,
    defaultScale: scale,
    scale,
    installerGuid: rawProfile.installerGuid || createVariantInstallerGuid(id),
    autoStartRegistryKey: rawProfile.autoStartRegistryKey || `ChongbanDesktopPet-${id}`,
    singleInstanceKey: rawProfile.singleInstanceKey || `com.chongban.desktoppet.${id}`,
    features
  });
}

function buildPetVariantProfiles(metadata = PET_VARIANT_METADATA) {
  buildPetVariantNamespace(metadata);
  const variants = normalizeVariantMetadata(metadata).variants;
  const profiles = {};
  for (const [id, rawProfile] of Object.entries(variants)) {
    profiles[id] = resolvePetVariantProfile(Object.assign({ id }, rawProfile));
  }
  return deepFreeze(profiles);
}

function comparePetVariantProfiles(left, right) {
  const leftDate = left.date || "";
  const rightDate = right.date || "";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function assertPetVariantMetadataChronology(metadata = PET_VARIANT_METADATA) {
  const variants = Object.values(normalizeVariantMetadata(metadata).variants);
  const byYear = new Map();
  for (const profile of variants) {
    assertPetVariantIdMatchesDate(profile.id, profile.date);
    const year = String(profile.date).slice(0, 4);
    if (!byYear.has(year)) {
      byYear.set(year, []);
    }
    byYear.get(year).push(profile);
  }

  for (const [year, profiles] of byYear.entries()) {
    const sorted = profiles.slice().sort(comparePetVariantProfiles);
    sorted.forEach((profile, index) => {
      const expected = index + 1;
      const actual = getPetVariantIdSequence(profile.id);
      if (actual !== expected) {
        throw new Error(
          `Pet variant ${profile.id} sequence does not match ${year} date order. Expected ${String(expected).padStart(2, "0")}.`
        );
      }
    });
  }
}

assertPetVariantMetadataChronology(PET_VARIANT_METADATA);
const PET_VARIANT_NAMESPACE = buildPetVariantNamespace(PET_VARIANT_METADATA);
const PET_VARIANT_PROFILES = buildPetVariantProfiles(PET_VARIANT_METADATA);

function resolvePetVariantId(value) {
  const token = String(value || "");
  return PET_VARIANT_NAMESPACE[token]?.variantId || null;
}

function requirePetVariantId(value) {
  const variant = resolvePetVariantId(value);
  if (!variant) {
    throw new Error(`Invalid pet variant: ${value}`);
  }
  return variant;
}

function normalizePetVariant(value) {
  return resolvePetVariantId(value) || DEFAULT_PET_VARIANT;
}

function normalizePetChannel(value) {
  return Object.prototype.hasOwnProperty.call(PET_CHANNEL_PROFILES, value)
    ? value
    : DEFAULT_PET_CHANNEL;
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

function getPetBreedProfiles() {
  return clonePlainObject(PET_BREED_PROFILES);
}

function getPetVariantMetadata(value) {
  const variant = normalizePetVariant(value);
  return clonePlainObject(PET_VARIANT_METADATA.variants[variant]);
}

function getPetVariantMetadataList() {
  return Object.keys(PET_VARIANT_METADATA.variants)
    .map((id) => clonePlainObject(PET_VARIANT_METADATA.variants[id]))
    .sort(comparePetVariantProfiles);
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
    soundPrefix: variantProfile.soundPrefix,
    defaultScale: variantProfile.defaultScale,
    autoStartRegistryKey: variantProfile.autoStartRegistryKey,
    singleInstanceKey: variantProfile.singleInstanceKey,
    features: variantProfile.features,
    actions: getPetActionIds(),
    actionOrder,
    actionLabelOverrides: variantProfile.actionLabelOverrides,
    actionStatEffects: variantProfile.actionStatEffects,
    channelConfig: {
      showDebugTimers: channelProfile.showDebugTimers,
      showYawnTimer: channelProfile.showDebugTimers && Boolean(variantProfile.features.idleYawn),
      showSleepPoseTimer: channelProfile.showDebugTimers && Boolean(variantProfile.features.sleepPoseSwitch),
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
    customization: Boolean(variantProfile.features.customization),
    switchPet: Boolean(variantProfile.features.switchPet)
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
  const variant = requirePetVariantId(value);
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
    manifestName: getVariantManifestName(variant),
    soundPrefix: profile.soundPrefix,
    switchableVariants: SWITCHABLE_VARIANTS.slice()
  };
}

function isValidVariantDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function getVariantIdYear(date) {
  return String(date).slice(2, 4);
}

function getVariantIdSequencePattern(date) {
  return new RegExp(`^pet${getVariantIdYear(date)}(\\d{2})$`);
}

function createPetVariantId(date, sequence) {
  const seq = Number(sequence);
  if (!Number.isInteger(seq) || seq < 1 || seq > 99) {
    throw new Error(`Invalid variant sequence: ${sequence}. Use 1-99.`);
  }
  return `pet${getVariantIdYear(date)}${String(seq).padStart(2, "0")}`;
}

function getNextPetVariantSequence({ date, metadata = PET_VARIANT_METADATA }) {
  if (!isValidVariantDate(date)) {
    throw new Error(`Invalid variant date: ${date}. Use YYYY-MM-DD.`);
  }
  const year = String(date).slice(0, 4);
  const variants = Object.values(normalizeVariantMetadata(metadata).variants)
    .filter((profile) => String(profile.date || "").slice(0, 4) === year)
    .slice();
  const latestDate = variants
    .map((profile) => String(profile.date || ""))
    .sort()
    .at(-1);
  if (latestDate && String(date) < latestDate) {
    throw new Error(`Variant date ${date} would require resequencing existing ${year} pet ids. Use a date on or after ${latestDate}.`);
  }
  const pattern = getVariantIdSequencePattern(date);
  let maxSequence = 0;
  for (const profile of variants) {
    const profileId = String(profile.id || "");
    const match = profileId.match(pattern);
    if (match) {
      maxSequence = Math.max(maxSequence, Number(match[1]));
    }
  }
  const sequence = maxSequence + 1;
  if (sequence > 99) {
    throw new Error(`No available variant sequence for pet${getVariantIdYear(date)}.`);
  }
  return sequence;
}

function createNextPetVariantId({ breed, date, metadata = PET_VARIANT_METADATA }) {
  return createPetVariantId(date, getNextPetVariantSequence({ breed, date, metadata }));
}

function createPetVariantMetadataDraft({
  breed,
  date,
  id,
  metadata = PET_VARIANT_METADATA,
  scope = DEFAULT_PET_SCOPE,
  version = "1.0",
  scale = 1.1,
  platform = DEFAULT_PET_PLATFORM
}) {
  if (!Object.prototype.hasOwnProperty.call(PET_BREED_PROFILES, breed)) {
    throw new Error(`Unknown breed: ${breed}`);
  }
  if (!isValidVariantDate(date)) {
    throw new Error(`Invalid variant date: ${date}. Use YYYY-MM-DD.`);
  }
  const variantId = id || createNextPetVariantId({ breed, date, metadata });
  assertVariantNamespaceToken(variantId, "id", variantId);
  assertPetVariantId(variantId);
  const namespace = buildPetVariantNamespace(metadata);
  if (Object.prototype.hasOwnProperty.call(namespace, variantId)) {
    throw new Error(`Variant namespace token already exists: ${variantId}`);
  }
  return {
    id: variantId,
    breed,
    date,
    aliases: "",
    scope,
    version,
    scale: Number(scale),
    platform,
    extraActions: [],
    extraAssets: [],
    features: {}
  };
}

module.exports = {
  PET_VARIANT_CONFIG_FILE,
  PREFERRED_VARIANT_FILE,
  DEFAULT_PET_VARIANT,
  DEFAULT_PET_CHANNEL,
  DEFAULT_PET_PLATFORM,
  DEFAULT_PET_SCOPE,
  MAC_USER_DATA_PARENT,
  SWITCHABLE_VARIANTS,
  PET_VARIANT_METADATA_FILE,
  PET_VARIANT_NAMESPACE_PATTERN,
  PET_VARIANT_IDS: Object.freeze(Object.values(PET_VARIANT_PROFILES).sort(comparePetVariantProfiles).map((profile) => profile.id)),
  PET_VARIANT_ALIASES: Object.freeze(Object.keys(PET_VARIANT_NAMESPACE).filter((token) => PET_VARIANT_NAMESPACE[token].kind === "alias")),
  PET_BREED_IDS: Object.freeze(Object.keys(PET_BREED_PROFILES)),
  PET_CHANNEL_IDS: Object.freeze(Object.keys(PET_CHANNEL_PROFILES)),
  PET_ACTION_ORDER,
  resolvePetVariantId,
  requirePetVariantId,
  normalizePetVariant,
  normalizePetChannel,
  getPetActions,
  getPetActionIds,
  getPetActionOrder,
  getPetBreedProfiles,
  getPetVariantMetadata,
  getPetVariantMetadataList,
  getPetVariantProfile,
  getPetChannelProfile,
  buildPetVariantNamespace,
  buildPetVariantProfiles,
  resolvePetVariantProfile,
  buildPetRuntimeConfig,
  getPetUserDataFolder,
  getPetPlatformFeatures,
  getVariantAnimationFolders,
  getVariantManifestName,
  getWindowsBuildProfile,
  isValidVariantDate,
  getNextPetVariantSequence,
  createNextPetVariantId,
  createPetVariantId,
  createPetVariantMetadataDraft,
  createVariantInstallerGuid
};
