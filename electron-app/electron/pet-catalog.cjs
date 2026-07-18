const { readActionRegistry } = require("./pet/action-registry.cjs");

const PET_SPECIES_PROFILES = Object.freeze({
  cat: Object.freeze({ id: "cat", baseVariant: "pet2602" }),
  dog: Object.freeze({ id: "dog", baseVariant: "pet2601" })
});

const ACTION_POOL = {};

const FEATURE_POOL = Object.freeze({
  autoStart: Object.freeze({ id: "autoStart", implemented: true, platforms: Object.freeze(["win32"]) }),
  windowDocking: Object.freeze({ id: "windowDocking", implemented: true, platforms: Object.freeze(["win32"]) }),
  windowRoam: Object.freeze({ id: "windowRoam", implemented: true, platforms: Object.freeze(["win32"]) }),
  customization: Object.freeze({ id: "customization", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  switchPet: Object.freeze({ id: "switchPet", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  eyeTracking: Object.freeze({ id: "eyeTracking", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  idleYawn: Object.freeze({ id: "idleYawn", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  sleepPoseSwitch: Object.freeze({ id: "sleepPoseSwitch", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  wakeHiss: Object.freeze({ id: "wakeHiss", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  dockShake: Object.freeze({ id: "dockShake", implemented: true, platforms: Object.freeze(["win32", "darwin"]) })
});

const DEFAULT_FEATURES = Object.freeze(["autoStart"]);

const NOTES_POOL = Object.freeze({
  internal: "内部使用",
  custom: "客户定制",
  test: "测试变体"
});

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function toCatalogAction(definition) {
  return Object.freeze({
    id: definition.stateId,
    stateId: definition.stateId,
    asset: definition.asset,
    label: definition.label,
    kind: definition.presentation.hoverButton ? "button" : "asset",
    presentation: Object.freeze(clonePlainObject(definition.presentation)),
    playback: Object.freeze(clonePlainObject(definition.playback)),
    motion: Object.freeze(clonePlainObject(definition.motion)),
    processing: Object.freeze(clonePlainObject(definition.processing)),
    processPreset: definition.processing.preset,
    ...(definition.frameSequence ? { frameSequence: Object.freeze(clonePlainObject(definition.frameSequence)) } : {}),
    requiredForVariant: definition.requiredForVariant,
    system: definition.system
  });
}

function reloadActionPool() {
  const registry = readActionRegistry();
  for (const key of Object.keys(ACTION_POOL)) delete ACTION_POOL[key];
  for (const [actionKey, definition] of Object.entries(registry.actions)) {
    ACTION_POOL[actionKey] = toCatalogAction(definition);
  }
  return getActionPool();
}

function getActionPool() {
  return clonePlainObject(ACTION_POOL);
}

function getRequiredActionKeys() {
  return Object.entries(ACTION_POOL)
    .filter(([, action]) => action.requiredForVariant)
    .map(([actionKey]) => actionKey);
}

function getFeaturePool() {
  return clonePlainObject(FEATURE_POOL);
}

function getSpeciesProfiles() {
  return clonePlainObject(PET_SPECIES_PROFILES);
}

function getNotesPool() {
  return clonePlainObject(NOTES_POOL);
}

reloadActionPool();

module.exports = {
  ACTION_POOL,
  FEATURE_POOL,
  DEFAULT_FEATURES,
  NOTES_POOL,
  PET_SPECIES_PROFILES,
  reloadActionPool,
  getActionPool,
  getRequiredActionKeys,
  getFeaturePool,
  getSpeciesProfiles,
  getNotesPool
};
