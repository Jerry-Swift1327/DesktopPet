const PET_SPECIES_PROFILES = Object.freeze({
  cat: Object.freeze({ id: "cat", baseVariant: "pet2602" }),
  dog: Object.freeze({ id: "dog", baseVariant: "pet2601" })
});

const ACTION_POOL = Object.freeze({
  squat: Object.freeze({ id: "petSquat", asset: "squat", label: "蹲坐", kind: "button", processPreset: "grounded" }),
  walk: Object.freeze({ id: "petWalk", asset: "walk", label: "闲逛", kind: "button", processPreset: "grounded" }),
  feed: Object.freeze({ id: "petFeed", asset: "feed", label: "喂食", kind: "button", processPreset: "grounded", frameSequence: Object.freeze({ repeatRangeStart: 0, repeatRangeEnd: 999, repeatCount: 2 }) }),
  ball: Object.freeze({ id: "petBall", asset: "ball", label: "玩耍", kind: "button", processPreset: "grounded" }),
  lie: Object.freeze({ id: "petLie", asset: "lie", label: "趴下", kind: "button", processPreset: "nearSquat" }),
  spin: Object.freeze({ id: "petSpin", asset: "spin", label: "转圈", kind: "button", processPreset: "grounded" }),
  lick: Object.freeze({ id: "petLick", asset: "lick", label: "舔爪", kind: "button", processPreset: "nearSquat" }),
  belly: Object.freeze({ id: "petBelly", asset: "belly", label: "翻肚", kind: "button", processPreset: "grounded" }),
  stretch: Object.freeze({ id: "petStretch", asset: "stretch", label: "伸展", kind: "button", processPreset: "grounded" }),
  splits: Object.freeze({ id: "petSplits", asset: "splits", label: "劈叉", kind: "button", processPreset: "grounded" }),
  shake: Object.freeze({ id: "petShake", asset: "shake", label: "抖身", kind: "asset", processPreset: "nearSquat" }),
  yawn: Object.freeze({ id: "petYawn", asset: "yawn", label: "打哈欠", kind: "asset", processPreset: "nearSquat" }),
  sleep: Object.freeze({ id: "petSleep", asset: "sleep", label: "睡觉", kind: "asset", processPreset: "grounded" }),
  hiss: Object.freeze({ id: "petHiss", asset: "hiss", label: "哈气", kind: "asset", processPreset: "nearSquat" }),
  look: Object.freeze({ id: null, asset: "look", label: "视线追踪", kind: "asset", processPreset: "direction64" })
});

const FEATURE_POOL = Object.freeze({
  autoStart: Object.freeze({ id: "autoStart", tier: "basic", implemented: true, platforms: Object.freeze(["win32"]) }),
  windowDocking: Object.freeze({ id: "windowDocking", tier: "basic", implemented: true, platforms: Object.freeze(["win32"]) }),
  windowRoam: Object.freeze({ id: "windowRoam", tier: "basic", implemented: true, platforms: Object.freeze(["win32"]) }),
  customization: Object.freeze({ id: "customization", tier: "basic", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  switchPet: Object.freeze({ id: "switchPet", tier: "basic", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  eyeTracking: Object.freeze({ id: "eyeTracking", tier: "advanced", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  idleYawn: Object.freeze({ id: "idleYawn", tier: "advanced", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  sleepPoseSwitch: Object.freeze({ id: "sleepPoseSwitch", tier: "advanced", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  wakeHiss: Object.freeze({ id: "wakeHiss", tier: "advanced", implemented: true, platforms: Object.freeze(["win32", "darwin"]) }),
  dockShake: Object.freeze({ id: "dockShake", tier: "advanced", implemented: true, platforms: Object.freeze(["win32", "darwin"]) })
});

const TIER_PROFILES = Object.freeze({
  basic: Object.freeze({
    id: "basic",
    actionButtons: Object.freeze(["squat", "walk", "feed", "ball"]),
    actionAssets: Object.freeze([]),
    features: Object.freeze({
      enable: Object.freeze(["autoStart", "windowDocking", "windowRoam"]),
      disable: Object.freeze([])
    })
  }),
  advanced: Object.freeze({
    id: "advanced",
    actionButtons: Object.freeze(["squat", "walk", "feed", "ball", "lie", "lick", "belly", "stretch"]),
    actionAssets: Object.freeze(["yawn", "hiss"]),
    features: Object.freeze({
      enable: Object.freeze(["autoStart", "windowDocking", "windowRoam", "idleYawn", "wakeHiss"]),
      disable: Object.freeze([])
    })
  })
});

const NOTES_POOL = Object.freeze({
  internal: Object.freeze({
    basic: "内部使用-基础",
    advanced: "内部使用-高级"
  }),
  custom: Object.freeze({
    basic: "客户定制-基础",
    advanced: "客户定制-高级"
  }),
  test: Object.freeze({
    basic: "测试变体-基础",
    advanced: "测试变体-高级"
  })
});

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function getActionPool() {
  return clonePlainObject(ACTION_POOL);
}

function getFeaturePool() {
  return clonePlainObject(FEATURE_POOL);
}

function getTierProfiles() {
  return clonePlainObject(TIER_PROFILES);
}

function getSpeciesProfiles() {
  return clonePlainObject(PET_SPECIES_PROFILES);
}

function getNotesPool() {
  return clonePlainObject(NOTES_POOL);
}

module.exports = {
  ACTION_POOL,
  FEATURE_POOL,
  TIER_PROFILES,
  NOTES_POOL,
  PET_SPECIES_PROFILES,
  getActionPool,
  getFeaturePool,
  getTierProfiles,
  getSpeciesProfiles,
  getNotesPool
};
