const { app, BrowserWindow, ipcMain, nativeImage, screen } = require("electron");
const { execFile, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const {
  getWalkLoopRemainingMs,
  pauseWalkLoopClockState,
  resumeWalkLoopClockState
} = require("./walk-clock.cjs");
const {
  PET_VARIANT_CONFIG_FILE,
  PREFERRED_VARIANT_FILE,
  DEFAULT_PET_VARIANT,
  DEFAULT_PET_CHANNEL,
  SWITCHABLE_VARIANTS,
  getPetActionIds,
  buildPetRuntimeConfig,
  getPetUserDataFolder,
  getPetPlatformFeatures,
  getPetVariantProfile
} = require("./pet-variants.cjs");
const {
  isLikelyDesktopOrSystemWindow
} = require("./window-surface-filter.cjs");

const APP_INTERNAL_NAME = "Chongban";
const APP_DISPLAY_NAME = "宠伴";
const APP_ICON_FILE = "app_icon.ico";
const WINDOWS_STARTUP_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

app.setName(APP_INTERNAL_NAME);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("disable-features", "VizDisplayCompositor");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const petRuntimeConfig = readPetRuntimeConfig();
if (process.platform === "win32") {
  app.setAppUserModelId(petRuntimeConfig.singleInstanceKey);
}

const userDataRoot = getUserDataRoot();
fs.mkdirSync(userDataRoot, { recursive: true });
fs.mkdirSync(path.join(userDataRoot, "session"), { recursive: true });
app.setPath("userData", userDataRoot);
app.setPath("sessionData", path.join(userDataRoot, "session"));

function getUserDataRoot() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", ".user-data", petRuntimeConfig.variant);
  }
  if (process.platform === "darwin") {
    return path.join(app.getPath("appData"), getPetUserDataFolder({ ...petRuntimeConfig, platform: process.platform }));
  }
  return path.join(process.env.LOCALAPPDATA || path.join(path.dirname(process.execPath), "user-data"), APP_INTERNAL_NAME, petRuntimeConfig.variant);
}

const petActionIds = getPetActionIds();
const petAnimationPrefix = petRuntimeConfig.animationPrefix;
const STATE_SQUAT = petActionIds.squat;
const STATE_WALK = petActionIds.walk;
const STATE_FEED = petActionIds.feed;
const STATE_BALL = petActionIds.ball;
const STATE_LIE = petActionIds.lie;
const STATE_LICK = petActionIds.lick;
const STATE_BELLY = petActionIds.belly;
const STATE_STRETCH = petActionIds.stretch;
const STATE_SHAKE = petActionIds.shake;
const STATE_YAWN = petActionIds.yawn;
const STATE_HISS = petActionIds.hiss;
const STATE_SLEEP = petActionIds.sleep;

const BASE_PET_WINDOW_WIDTH = 180;
const BASE_PET_WINDOW_HEIGHT = 180;
const BASE_PET_SPRITE_SIZE = 128;
const PET_SCALE_MIN = 0.75;
const PET_SCALE_MAX = 1.6;
const PET_SCALE_STEP = 0.08;
const ENABLE_WINDOW_DOCKING = true;
const WINDOW_DOCK_GAP = 0;
const WINDOW_DOCK_MIN_WIDTH = 180;
const WINDOW_SURFACE_SIDE_GAP = 0;
const WINDOW_DOCK_STRICT_THRESHOLD = 36;
const WINDOW_DOCK_FAST_RELEASE_THRESHOLD = 56;
const WINDOW_DOCK_NORMAL_HIT_SAMPLES = 3;
const WINDOW_DOCK_FAST_HIT_SAMPLES = 5;
const WINDOW_DOCK_POINT_OFFSETS_Y = [2, -4, 8];
const WINDOW_DOCK_FAST_POINT_OFFSETS_Y = [4, -6, 12];
const WINDOW_DOCK_FAST_RELEASE_SPEED_PX_PER_SEC = 1200;
const WINDOW_DOCK_FAST_RELEASE_MAX_AGE_MS = 180;
const WINDOW_DOCK_COARSE_CORRECTION_LIMIT = 28;
const WINDOW_DOCK_FINE_CORRECTION_LIMIT = 2;
const WINDOW_DOCK_DRAG_RELEASE_BUDGET_MS = 120;
const WINDOW_DOCK_DEBUG = true;
const STARTUP_BUBBLE_DEFAULT_WIDTH = 238;
const STARTUP_BUBBLE_MIN_WIDTH = 150;
const STARTUP_BUBBLE_MAX_WIDTH = 320;
const STARTUP_BUBBLE_HEIGHT = 54;
const STARTUP_BUBBLE_GAP_OFFSET = 0;
const STARTUP_BUBBLE_SCALE_GAP_FACTOR = 34;
const STARTUP_BUBBLE_DURATION_MS = 4000;
const STARTUP_BUBBLE_HOVER_LOCK_MS = 1800;
const PET_MENU_WIDTH = 196;
const PET_MENU_COLLAPSED_HEIGHT = 142;
const PET_MENU_MIN_HEIGHT = 128;
const PET_MENU_MAX_HEIGHT = 500;
const PET_MENU_PADDING_Y = 14;
const PET_MENU_ITEM_HEIGHT = 40;
const PET_MENU_HIDE_DELAY_MS = 700;
const HOVER_PANEL_WIDTH = 232;
const HOVER_PANEL_HEIGHT = petRuntimeConfig.channelConfig.hoverPanelHeight;
const HOVER_HIDE_DELAY_MS = 700;
const HOVER_INTENT_DELAY_MS = 70;
const TASKBAR_WALK_HOVER_INTENT_DELAY_MS = 240;
const HOVER_POLL_INTERVAL_MS = 32;
const WINDOW_SURFACE_POLL_INTERVAL_MS = 250;
const WINDOW_SURFACE_HEAVY_RECHECK_MS = 500;
const WINDOW_SURFACE_CACHE_MS = 320;
const WINDOW_SURFACE_ASYNC_REFRESH_MIN_MS = 600;
const WINDOW_SURFACE_DRAG_REFRESH_MIN_MS = 260;
const WINDOW_SURFACE_BACKGROUND_REFRESH_MS = 900;
const WINDOW_SURFACE_FALLBACK_BLEND_MS = 90;
const WINDOW_DOCK_DRAG_RETRY_DELAY_MS = 260;
const WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS = 2500;
const WINDOW_ROAM_POLL_INTERVAL_MS = 900;
const WINDOW_ROAM_MAX_MISSING_TICKS = 2;
const EYE_TRACKING_POLL_INTERVAL_MS = 50;
const EYE_TRACKING_FRAME_NAME_PATTERN = /^frame_(\d+)\.png$/i;
const DARWIN_DISPLAY_METRICS_SETTLE_MS = 300;
// Panel positioning knobs. Change these first when tuning visual spacing.
const OVERLAY_BASE_GAP = 25; 
const OVERLAY_GAP_MIN = 12; 
const OVERLAY_GAP_MAX = 60; 
const OVERLAY_VERTICAL_OFFSET = 0;

const HOVER_PANEL_GAP_OFFSET = 0; 
const HOVER_PANEL_VERTICAL_OFFSET = 0; 
const HOVER_PANEL_SCALE_GAP_FACTOR = 34; 

const PET_MENU_GAP_OFFSET = 0;
const PET_MENU_BASE_VERTICAL_LIFT = 70;
const PET_MENU_VERTICAL_LIFT_MIN = 10;
const PET_MENU_VERTICAL_LIFT_MAX = 56;
const PET_MENU_VERTICAL_OFFSET = 0;
const PET_MENU_SCALE_GAP_FACTOR = 34;
const PET_MENU_SCALE_UP_VERTICAL_FACTOR = 20;
const PET_MENU_SCALE_DOWN_VERTICAL_FACTOR = 100;
const PET_MENU_HEAD_SCAN_RATIO = 0.42;
const PET_MENU_HEAD_X_OFFSET = 0;
const PET_MENU_HEAD_Y_OFFSET = 0;

const OVERLAY_COLLISION_PADDING_BASE = 1;
const OVERLAY_COLLISION_PADDING_MIN = 0;
const OVERLAY_COLLISION_PADDING_MAX = 3;

const HOVER_BODY_HIT_PADDING_BASE = 2;
const HOVER_BODY_HIT_PADDING_MIN = 0;
const HOVER_BODY_HIT_PADDING_MAX = 6;
const HOVER_PANEL_AVOID_PADDING_MIN = 30;
const HOVER_PANEL_AVOID_PADDING_SCALE = 0.16;
const RANDOM_GREETING_MIN_MS = 1 * 60 * 1000;
const RANDOM_GREETING_MAX_MS = 1 * 60 * 1000;
const RANDOM_GREETING_RETRY_MS = 2 * 60 * 1000;
const IDLE_GREETING_DELAY_MS = RANDOM_GREETING_MIN_MS;
const TABBY_YAWN_IDLE_MS = 2 * 60 * 1000;
const INTIMACY_DECAY_INTERVAL_MS = 10 * 60 * 1000;
const FULLNESS_DECAY_INTERVAL_MS = 5 * 60 * 1000;
const HEALTH_DECAY_INTERVAL_MS = 10 * 60 * 1000;
const HEALTH_RECOVERY_INTERVAL_MS = 2 * 60 * 1000;
const STAT_NATURAL_DELTA = 1;
const VISIBLE_ALPHA_THRESHOLD = 12;
const PET_STAT_MIN = 0;
const PET_STAT_MAX = 100;
const PET_INTIMACY_DEFAULT = 50;
const PET_FULLNESS_DEFAULT = 50;
const PET_HEALTH_DEFAULT = 100;
const VISIBLE_RIGHT_GAP = 4;
const VISIBLE_SIDE_GAP = VISIBLE_RIGHT_GAP;
const VISIBLE_TOP_GAP = 0;
const VISIBLE_BOTTOM_GAP = 0;
const WALK_EDGE_PADDING = 0;
const WALK_STEP = 1;
const WALK_EDGE_TOLERANCE = 6;
const WALK_MIRROR_HYSTERESIS_PX = 1;
const WALK_MIRROR_COOLDOWN_STEPS = 1;
const WALK_SCALE_APPLY_THROTTLE_MS = 120;
const WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR = 2;
const WALK_LOOP_DURATION_MS = 5 * 60 * 1000;
const DARWIN_BOTTOM_DOCK_WIDTH_HEIGHT_FACTOR = 18;
const TASKBAR_WALK_RUNWAY_PADDING_MIN = 120;
const TASKBAR_WALK_RUNWAY_PADDING_MAX = 220;
const TASKBAR_WALK_RUNWAY_PADDING_SCALE = 1.15;
const TASKBAR_WALK_RUNWAY_RECENTER_RATIO = 0.35;
const TASKBAR_WALK_RUNWAY_SCREEN_BUFFER_FACTOR = 1;
const TASKBAR_HOME_HOVER_CENTER_INSET_MIN = 0;
const WALK_DIAGNOSTICS_ENABLED = process.env.PET_WALK_DIAGNOSTICS === "1";
const INTERACTION_INTIMACY_GAIN_MIN = 5;
const INTERACTION_INTIMACY_GAIN_MAX = 10;
const FEED_FULLNESS_GAIN_MIN = 10;
const FEED_FULLNESS_GAIN_MAX = 15;
const LIE_HEALTH_GAIN = 2;
const LICK_HEALTH_GAIN = 1;
const BELLY_FULLNESS_COST = 1;
const STRETCH_HEALTH_GAIN = 2;
const STRETCH_FULLNESS_COST = 1;
const HEALTH_RECOVERY_THRESHOLD = 80;
const HUNGER_WARNING_THRESHOLD = 44;
const HUNGER_CRITICAL_THRESHOLD = 24;
const EXHAUSTED_THRESHOLD = 0;
const HEALTH_TIRED_THRESHOLD = 34;
const HEALTH_RECOVERED_THRESHOLD = 82;
const FULL_PROMPT_THRESHOLD = 100;
const CLOSE_PROMPT_THRESHOLD = 98;
const CLOSE_PROMPT_RESET_THRESHOLD = 96;
const HUNGER_PROMPT_CLEAR_THRESHOLD = 70;
const FULL_PROMPT_RESET_THRESHOLD = 90;
const HEALTH_PROMPT_CLEAR_THRESHOLD = 65;
const DAILY_DECAY_FULLNESS = 0;
const DAILY_DECAY_HEALTH = 0;
const DEFAULT_PET_SCALE = petRuntimeConfig.defaultScale;
const DEFAULT_STATE = STATE_SQUAT;
const ONE_SHOT_STATES = new Set([STATE_WALK, STATE_FEED, STATE_BALL, STATE_LIE, STATE_LICK, STATE_BELLY, STATE_STRETCH, STATE_SHAKE, STATE_YAWN, STATE_HISS]);
const TABBY_IDLE_STATES = new Set([STATE_YAWN, STATE_SLEEP, STATE_HISS]);
const gotSingleInstanceLock = app.requestSingleInstanceLock();

const sharedGreetings = [
  "主人，你想我没？我很想你",
  "现在你在想谁呢？",
  "累坏我宝了，偷个懒歇会吧！",
  "我想你了，你想我了吗？",
  "世界万般好，不及你一半!",
  "目光所及，四下皆是你！",
  "万事不用愁，咱家为你加油！",
  "你不用多好，有你就是最好！",
  "主人啥时候带我吃香喝辣的？",
  "再忙也陪陪我嘛！",
  "肚子咕咕叫，快喂我好吃的嘛",
  "空空的肚子，急需美食投喂",
  "再不吃东西，我就要啃屏幕咯",
  "你好久都没理我了……",
  "孤零零的，有点难过呢",
  "哼，我才不要主动搭话",
  "我就在这儿，陪着你哦",
  "忙完啦？来聊两句吧",
  "最喜欢主人啦，贴贴～",
  "一刻都不想离开你身边",
  "抓到你啦，不许偷偷忽略我",
  "身体棒棒，陪你一整天",
  "状态在线，随时陪玩哦",
  "精力爆棚，想到处溜达！",
  "浑身充满力气，太开心啦",
  "摸鱼时间到，快乐加倍！",
  "键盘敲累啦，抬头看看我呗",
  "不管多忙，我一直陪着你",
  "累了就歇歇，我在身边哦",
  "平凡时光，有我就很美好",
  "偷偷溜一圈，吓唬一下主人",
  "猜猜我下一秒要去哪里？",
  "被你摸到啦，痒痒~",
  "嘿嘿，就喜欢和你玩耍",
  "一直陪着你，静静守着屏幕",
  "和主人贴贴最幸福"
];

function readPetRuntimeConfigFile(configPath) {
  try {
    const configText = fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(configText);
  } catch {
    return null;
  }
}

function getPackagedPetRuntimeConfigPaths() {
  return [
    path.join(process.resourcesPath, PET_VARIANT_CONFIG_FILE),
    path.join(process.resourcesPath, "app.asar", ".runtime-assets", PET_VARIANT_CONFIG_FILE),
    path.join(process.resourcesPath, "app", ".runtime-assets", PET_VARIANT_CONFIG_FILE)
  ];
}

function getPreferredVariantFilePath() {
  if (!app.isPackaged) {
    return path.join(__dirname, "..", ".user-data", PREFERRED_VARIANT_FILE);
  }
  if (process.platform === "darwin") {
    return path.join(app.getPath("appData"), MAC_USER_DATA_PARENT, PREFERRED_VARIANT_FILE);
  }
  return path.join(app.getPath("appData"), "Chongban", PREFERRED_VARIANT_FILE);
}

function readPreferredVariant() {
  try {
    const filePath = getPreferredVariantFilePath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const data = JSON.parse(content);
    if (data && data.variant && SWITCHABLE_VARIANTS.includes(data.variant)) {
      return data.variant;
    }
  } catch {
    // ignore
  }
  return null;
}

function writePreferredVariant(variant) {
  try {
    const filePath = getPreferredVariantFilePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify({ variant }, null, 2), "utf8");
  } catch (error) {
    log(`failed to write preferred variant: ${error.stack || error.message}`);
  }
}

function readPetRuntimeConfig() {
  const envVariant = process.env.PET_VARIANT || process.env.DESKTOP_PET_VARIANT;
  const envChannel = process.env.PET_CHANNEL || process.env.DESKTOP_PET_CHANNEL;
  const envConfig = {};
  if (envVariant) {
    envConfig.variant = envVariant;
  }
  if (envChannel) {
    envConfig.channel = envChannel;
  }

  if (!app.isPackaged) {
    const preferredVariant = !envVariant ? readPreferredVariant() : null;
    if (preferredVariant) {
      envConfig.variant = preferredVariant;
    }
    return buildPetRuntimeConfig(envConfig);
  }

  for (const configPath of getPackagedPetRuntimeConfigPaths()) {
    if (!fs.existsSync(configPath)) {
      continue;
    }
    const fileConfig = readPetRuntimeConfigFile(configPath);
    if (fileConfig) {
      const preferredVariant = !envVariant && SWITCHABLE_VARIANTS.includes(fileConfig.variant)
        ? readPreferredVariant()
        : null;
      return buildPetRuntimeConfig({
        ...fileConfig,
        ...envConfig,
        ...(preferredVariant ? { variant: preferredVariant } : {})
      });
    }
  }

  const preferredVariant = !envVariant ? readPreferredVariant() : null;
  return buildPetRuntimeConfig({
    variant: DEFAULT_PET_VARIANT,
    channel: DEFAULT_PET_CHANNEL,
    ...(preferredVariant ? { variant: preferredVariant } : {}),
    ...envConfig
  });
}

function getActionAssetFolder(action) {
  return `animations/${petAnimationPrefix}_${action}`;
}

function getActionFrameFolder(action) {
  return `${getActionAssetFolder(action)}/transparent_frames`;
}

function getActionMetadataPath(action) {
  return `${getActionAssetFolder(action)}/loop.json`;
}

const states = [
  { id: STATE_SQUAT, label: "蹲坐", folder: getActionFrameFolder("squat"), metadata: getActionMetadataPath("squat"), frameMs: 30, loopStart: 0, loopEnd: 0, defaultFacing: "left", moving: false, greetings: sharedGreetings },
  { id: STATE_WALK, label: "闲逛", folder: getActionFrameFolder("walk"), metadata: getActionMetadataPath("walk"), frameMs: 30, loopStart: 0, loopEnd: 0, defaultFacing: "left", moving: true, greetings: sharedGreetings },
  {
    id: STATE_FEED,
    label: "喂食",
    folder: getActionFrameFolder("feed"),
    metadata: getActionMetadataPath("feed"),
    frameMs: 30,
    loopStart: 0,
    loopEnd: 0,
    defaultFacing: "left",
    moving: false,
    frameSequence: {
      repeatRangeStart: 0,
      repeatRangeEnd: 999,
      repeatCount: 2
    },
    greetings: sharedGreetings
  },
  { id: STATE_BALL, label: "玩耍", folder: getActionFrameFolder("ball"), metadata: getActionMetadataPath("ball"), frameMs: 30, loopStart: 0, loopEnd: 0, defaultFacing: "left", moving: false, greetings: sharedGreetings }
];

states.push(
  { id: STATE_LIE, label: "趴下", folder: getActionFrameFolder("lie"), metadata: getActionMetadataPath("lie"), frameMs: 30, loopStart: 0, loopEnd: 0, defaultFacing: "left", moving: false, greetings: sharedGreetings },
  { id: STATE_LICK, label: "舔爪", folder: getActionFrameFolder("lick"), metadata: getActionMetadataPath("lick"), frameMs: 30, loopStart: 0, loopEnd: 0, defaultFacing: "left", moving: false, greetings: sharedGreetings },
  { id: STATE_BELLY, label: "翻肚", folder: getActionFrameFolder("belly"), metadata: getActionMetadataPath("belly"), frameMs: 30, loopStart: 0, loopEnd: 0, defaultFacing: "left", moving: false, greetings: sharedGreetings },
  { id: STATE_STRETCH, label: "伸展", folder: getActionFrameFolder("stretch"), metadata: getActionMetadataPath("stretch"), frameMs: 30, loopStart: 0, loopEnd: 0, defaultFacing: "left", moving: false, greetings: sharedGreetings },
  { id: STATE_SHAKE, label: "抖身", folder: getActionFrameFolder("shake"), metadata: getActionMetadataPath("shake"), frameMs: 30, loopStart: 0, loopEnd: 0, defaultFacing: "left", moving: false, greetings: sharedGreetings },
  { id: STATE_YAWN, label: "打哈欠", folder: getActionFrameFolder("yawn"), metadata: getActionMetadataPath("yawn"), frameMs: 30, loopStart: 0, loopEnd: 0, defaultFacing: "left", moving: false, greetings: sharedGreetings },
  { id: STATE_HISS, label: "哈气", folder: getActionFrameFolder("hiss"), metadata: getActionMetadataPath("hiss"), frameMs: 30, loopStart: 0, loopEnd: 0, defaultFacing: "left", moving: false, greetings: sharedGreetings },
  { id: STATE_SLEEP, label: "睡觉", folder: getActionFrameFolder("sleep"), metadata: getActionMetadataPath("sleep"), frameMs: 30, loopStart: 0, loopEnd: 0, defaultFacing: "left", moving: false, greetings: sharedGreetings }
);

const statMessages = {
  hungry: ["我饿了，碗碗发来提醒", "肚子在开会，主题是加餐"],
  needFood: ["要喂食了，快乐快没电了", "补给请求已发送"],
  exhausted: ["已饿晕，急需喂食续命！"],
  full: ["吃饱了，幸福值满格", "饱了饱了，尾巴都亮了"],
  tired: ["我得缓缓，运动量有点认真", "体力告急，申请蹲坐回血"],
  recovered: ["回血成功，我又精神了", "状态回来了，可以继续营业"],
  close: ["亲密度爆表，今天也最喜欢你", "你一出现，我就自动开心"]
};

let petWindow;
let startupBubbleWindow;
let startupBubbleWindowReady = false;
let startupBubbleTimer = null;
let startupBubbleHideAt = 0;
let pendingWalkBubbleMessage = null;
let menuWindow;
let menuWindowReady = false;
let menuHideTimer = null;
let isPointerOverMenuPanel = false;
let hoverWindow;
let hoverWindowReady = false;
let hoverHideTimer = null;
let hoverIntentTimer = null;
let hoverPollTimer = null;
let isPointerOverPet = false;
let isPointerOverHoverPanel = false;
const interactionPauseReasons = new Set();
let lastMenuBounds = null;
let lastHoverBounds = null;
let menuAnchorRect = null;
let menuFrozenPetRect = null;
let menuPlacementSnapshot = null;
let hoverAnchorRect = null;
let hoverFrozenPetRect = null;
let currentMenuHeight = PET_MENU_COLLAPSED_HEIGHT;
let activeState = DEFAULT_STATE;
let selectedState = DEFAULT_STATE;
let walkDirection = -1;
let renderedFrameState = DEFAULT_STATE;
let renderedFrameIndex = 0;
let renderedFrameDirection = -1;
let renderedFrameAt = 0;
let walkTrackX = null;
let taskbarWalkRunway = null;
let petWindowMousePassthrough = false;
let petWindowHitRegionKey = "";
let lastWalkStepAt = 0;
let stalledWalkSteps = 0;
let walkMirrorCooldownSteps = 0;
let walkRightEdgeStuckSteps = 0;
let walkLeftEdgeStuckSteps = 0;
let nextWalkStartDirection = null;
let walkLoop = null;
let walkLoopTimer = null;
let dragTimer = null;
let displayMetricsSettleTimer = null;
let dragState = null;
let lastDragSample = null;
let homeDisplayId = null;
let homeWorkArea = null;
let petStats = null;
let petScale = DEFAULT_PET_SCALE;
let preferredPetScale = DEFAULT_PET_SCALE;
let randomGreetingTimer = null;
let tabbyIdlePollTimer = null;
let idleGreetingPool = [];
let intimacyDecayTimer = null;
let lastUserOperationAt = Date.now();
let lastTabbyUserOperationAt = Date.now();
let lastIntimacyDecayAt = Date.now();
let lastFullnessDecayAt = Date.now();
let lastHealthDecayAt = Date.now();
let lastHealthRecoveryAt = Date.now();
let currentSurface = null;
let windowSurfacePollTimer = null;
let windowSurfaceCandidatesCache = [];
let windowSurfaceCandidatesCacheAt = 0;
let lastWindowSurfaceHeavyCheckAt = 0;
let windowSurfaceRefreshInFlight = false;
let windowSurfaceMissingTicks = 0;
let walkPausedAt = 0;
let pendingActionStatsState = null;
let lastWalkScaleApplyAt = 0;
let lastWalkSurfaceSignature = "";
let lastWindowSurfaceAsyncRefreshAt = 0;
let windowDockInProgress = false;
let lastWindowSurfaceBackgroundRefreshAt = 0;
let bubbleHoverSuppressedUntil = 0;
let windowDockHoverSuppressedUntil = 0;
let autoStartEnabledCache = false;
let autoStartRefreshInFlight = false;
let autoStartPreferenceLoaded = false;
let windowRoamEnabledCache = false;
let windowRoamPollTimer = null;
let windowRoamLastTargetId = "";
let windowRoamSuppressedWindowId = "";
let windowRoamMissingTicks = 0;
let eyeTrackingEnabledCache = false;
let eyeTrackingPollTimer = null;
let lastEyeTrackingLook = "off";
let eyeTrackingLookFrameCount = 0;
let assetsRootCache = "";
const statsFile = path.join(userDataRoot, "pet-stats.json");
const autoStartPreferenceFile = path.join(userDataRoot, `auto-start-${petRuntimeConfig.variant}.json`);
const windowRoamPreferenceFile = path.join(userDataRoot, `window-roam-${petRuntimeConfig.variant}.json`);
const eyeTrackingPreferenceFile = path.join(userDataRoot, `eye-tracking-${petRuntimeConfig.variant}.json`);
const scalePreferenceFile = path.join(userDataRoot, `scale-${petRuntimeConfig.variant}.json`);
const logDir = path.join(userDataRoot, "logs");
const logFile = path.join(logDir, "main.log");
const visibleBoundsCache = new Map();
const headBoundsCache = new Map();
const framePathsCache = new Map();
const framePixelCache = new Map();

function log(message) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Logging must never prevent the pet from starting in packaged installs.
  }
}

function logWalkDiagnostic(message) {
  if (WALK_DIAGNOSTICS_ENABLED) {
    log(`walk-diagnostic ${message}`);
  }
}

function getAutoStartCommand() {
  return `"${process.execPath}"`;
}

function isAutoStartSupported() {
  return process.platform === "win32" && app.isPackaged;
}

function canToggleAutoStart() {
  return Boolean(petRuntimeConfig.features?.autoStart) && isAutoStartSupported();
}

function readAutoStartEnabledSync() {
  if (!isAutoStartSupported() || !petRuntimeConfig.autoStartRegistryKey) {
    return false;
  }

  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$item = Get-ItemProperty -Path $args[0] -Name $args[1] -ErrorAction SilentlyContinue; $value = if ($null -eq $item) { $null } else { $item.PSObject.Properties[$args[1]].Value }; if ([string]$value -eq [string]$args[2]) { [Console]::Out.Write('1') } else { [Console]::Out.Write('0') }",
      "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      petRuntimeConfig.autoStartRegistryKey,
      getAutoStartCommand()
    ], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1000,
      maxBuffer: 64 * 1024
    });
    return output.trim() === "1";
  } catch {
    return false;
  }
}

function readAutoStartEnabledAsync(callback) {
  if (!isAutoStartSupported() || !petRuntimeConfig.autoStartRegistryKey) {
    callback(false);
    return;
  }

  execFile("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "$item = Get-ItemProperty -Path $args[0] -Name $args[1] -ErrorAction SilentlyContinue; $value = if ($null -eq $item) { $null } else { $item.PSObject.Properties[$args[1]].Value }; if ([string]$value -eq [string]$args[2]) { [Console]::Out.Write('1') } else { [Console]::Out.Write('0') }",
    "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    petRuntimeConfig.autoStartRegistryKey,
    getAutoStartCommand()
  ], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 1000,
    maxBuffer: 64 * 1024
  }, (error, stdout) => {
    callback(!error && String(stdout || "").trim() === "1");
  });
}

function readAutoStartPreference() {
  if (!fs.existsSync(autoStartPreferenceFile)) {
    return;
  }

  try {
    const preference = JSON.parse(fs.readFileSync(autoStartPreferenceFile, "utf8"));
    if (typeof preference.enabled === "boolean") {
      autoStartEnabledCache = preference.enabled;
      autoStartPreferenceLoaded = true;
    }
  } catch (error) {
    log(`failed to read auto start preference: ${error.stack || error.message}`);
  }
}

function writeAutoStartPreference(enabled) {
  try {
    fs.writeFileSync(autoStartPreferenceFile, JSON.stringify({ enabled: Boolean(enabled) }, null, 2), "utf8");
    autoStartPreferenceLoaded = true;
  } catch (error) {
    log(`failed to write auto start preference: ${error.stack || error.message}`);
  }
}

function refreshAutoStartCacheAsync() {
  if (autoStartRefreshInFlight) {
    return;
  }

  autoStartRefreshInFlight = true;
  readAutoStartEnabledAsync((enabled) => {
    if (!autoStartPreferenceLoaded) {
      autoStartEnabledCache = enabled;
    }
    autoStartRefreshInFlight = false;
    sendMenuConfig();
  });
}

function setAutoStartEnabled(enabled) {
  if (!canToggleAutoStart()) {
    throw new Error("Auto start is not available for this build.");
  }

  if (enabled) {
    execFileSync("reg.exe", [
      "add",
      WINDOWS_STARTUP_RUN_KEY,
      "/v",
      petRuntimeConfig.autoStartRegistryKey,
      "/t",
      "REG_SZ",
      "/d",
      getAutoStartCommand(),
      "/f"
    ], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1000,
      maxBuffer: 64 * 1024
    });
    return;
  }

  execFileSync("reg.exe", [
    "delete",
    WINDOWS_STARTUP_RUN_KEY,
    "/v",
    petRuntimeConfig.autoStartRegistryKey,
    "/f"
  ], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 1000,
    maxBuffer: 64 * 1024
  });
}

function buildAutoStartSummary(error = "") {
  return {
    supported: isAutoStartSupported(),
    enabled: autoStartEnabledCache,
    canToggle: canToggleAutoStart(),
    error
  };
}

function canToggleWindowRoam() {
  return Boolean(petRuntimeConfig.features?.windowRoam) && ENABLE_WINDOW_DOCKING && process.platform === "win32";
}

function readWindowRoamPreference() {
  if (!fs.existsSync(windowRoamPreferenceFile)) {
    return;
  }

  try {
    const preference = JSON.parse(fs.readFileSync(windowRoamPreferenceFile, "utf8"));
    if (typeof preference.enabled === "boolean") {
      windowRoamEnabledCache = preference.enabled;
    }
  } catch (error) {
    log(`failed to read window roam preference: ${error.stack || error.message}`);
  }
}

function writeWindowRoamPreference(enabled) {
  try {
    fs.writeFileSync(windowRoamPreferenceFile, JSON.stringify({ enabled: Boolean(enabled) }, null, 2), "utf8");
  } catch (error) {
    log(`failed to write window roam preference: ${error.stack || error.message}`);
  }
}

function buildWindowRoamSummary(error = "") {
  return {
    supported: ENABLE_WINDOW_DOCKING && process.platform === "win32",
    enabled: windowRoamEnabledCache,
    canToggle: canToggleWindowRoam(),
    error
  };
}

function canToggleEyeTracking() {
  return Boolean(petRuntimeConfig.features?.eyeTracking);
}

function readEyeTrackingPreference() {
  if (!fs.existsSync(eyeTrackingPreferenceFile)) {
    return;
  }

  try {
    const preference = JSON.parse(fs.readFileSync(eyeTrackingPreferenceFile, "utf8"));
    if (typeof preference.enabled === "boolean") {
      eyeTrackingEnabledCache = preference.enabled;
    }
  } catch (error) {
    log(`failed to read eye tracking preference: ${error.stack || error.message}`);
  }
}

function writeEyeTrackingPreference(enabled) {
  try {
    fs.writeFileSync(eyeTrackingPreferenceFile, JSON.stringify({ enabled: Boolean(enabled) }, null, 2), "utf8");
  } catch (error) {
    log(`failed to write eye tracking preference: ${error.stack || error.message}`);
  }
}

function buildEyeTrackingSummary(error = "") {
  return {
    supported: canToggleEyeTracking(),
    enabled: eyeTrackingEnabledCache,
    canToggle: canToggleEyeTracking(),
    error
  };
}

function readPetScalePreference() {
  if (!fs.existsSync(scalePreferenceFile)) {
    return;
  }

  try {
    const preference = JSON.parse(fs.readFileSync(scalePreferenceFile, "utf8"));
    if (Number.isFinite(preference.scale)) {
      preferredPetScale = clampPetScale(preference.scale);
      petScale = preferredPetScale;
    }
  } catch (error) {
    log(`failed to read scale preference: ${error.stack || error.message}`);
  }
}

function writePetScalePreference() {
  try {
    fs.writeFileSync(scalePreferenceFile, JSON.stringify({ scale: preferredPetScale }, null, 2), "utf8");
  } catch (error) {
    log(`failed to write scale preference: ${error.stack || error.message}`);
  }
}

function buildMenuFeatures() {
  const features = getPetPlatformFeatures({ variant: petRuntimeConfig.variant, platform: process.platform });
  return {
    autoStart: features.autoStart,
    windowRoam: features.windowRoam && ENABLE_WINDOW_DOCKING,
    eyeTracking: Boolean(features.eyeTracking),
    customization: Boolean(features.customization),
    switchPet: Boolean(features.switchPet)
  };
}

function sendMenuConfig() {
  if (menuWindow && !menuWindow.isDestroyed() && menuWindowReady && !menuWindow.webContents.isLoading()) {
    menuWindow.webContents.send("pet:menu-data", buildPetConfig());
  }
}

function getQuickMenuItemCount() {
  const features = buildMenuFeatures();
  let itemCount = 3;
  if (features.windowRoam) {
    itemCount += 1;
  }
  if (features.autoStart) {
    itemCount += 1;
  }
  if (features.eyeTracking) {
    itemCount += 1;
  }
  if (features.customization) {
    itemCount += 1;
  }
  if (features.switchPet) {
    itemCount += 1;
  }
  return itemCount;
}

function getQuickMenuHeight() {
  const menuChromeHeight = PET_MENU_COLLAPSED_HEIGHT - PET_MENU_PADDING_Y - 3 * PET_MENU_ITEM_HEIGHT;
  return clamp(
    PET_MENU_PADDING_Y + getQuickMenuItemCount() * PET_MENU_ITEM_HEIGHT + menuChromeHeight,
    PET_MENU_MIN_HEIGHT,
    PET_MENU_MAX_HEIGHT
  );
}

function setAutoStartPreference(enabled) {
  if (!canToggleAutoStart()) {
    return buildAutoStartSummary("Auto start is not available for this build.");
  }

  const nextEnabled = Boolean(enabled);
  try {
    setAutoStartEnabled(nextEnabled);
    autoStartEnabledCache = nextEnabled;
    writeAutoStartPreference(nextEnabled);
  } catch (error) {
    log(`failed to set auto start: ${error.stack || error.message}`);
    autoStartEnabledCache = readAutoStartEnabledSync();
    return buildAutoStartSummary(error.message || "Failed to update auto start.");
  }

  const summary = buildAutoStartSummary();
  sendMenuConfig();
  return summary;
}

function toggleAutoStart() {
  return setAutoStartPreference(!autoStartEnabledCache);
}

function setWindowRoamPreference(enabled) {
  if (!canToggleWindowRoam()) {
    return buildWindowRoamSummary("Window roam is not available for this build.");
  }

  windowRoamEnabledCache = Boolean(enabled);
  writeWindowRoamPreference(windowRoamEnabledCache);
  windowRoamSuppressedWindowId = "";
  windowRoamMissingTicks = 0;
  updateWindowRoamPolling();
  sendMenuConfig();
  return buildWindowRoamSummary();
}

function setEyeTrackingPreference(enabled) {
  if (!canToggleEyeTracking()) {
    return buildEyeTrackingSummary("Eye tracking is not available for this build.");
  }

  eyeTrackingEnabledCache = Boolean(enabled);
  writeEyeTrackingPreference(eyeTrackingEnabledCache);
  updateEyeTrackingPolling();
  sendMenuConfig();
  return buildEyeTrackingSummary();
}

function logInteractionPauseDiagnostic(action, reason) {
  if (!WALK_DIAGNOSTICS_ENABLED) {
    return;
  }
  logWalkDiagnostic(`${action} reason=${reason} surface=${getCurrentSurface()?.type || "unknown"} activeState=${activeState}`);
}

function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetween(startDateKey, endDateKey) {
  const [startYear, startMonth, startDay] = startDateKey.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDateKey.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function clampStat(value) {
  return Math.round(clamp(Number(value) || 0, PET_STAT_MIN, PET_STAT_MAX));
}

function pickRandom(items, fallback = "") {
  const candidates = Array.isArray(items) ? items.filter(Boolean) : [];
  if (candidates.length === 0) {
    return fallback;
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function getNextIdleGreeting() {
  if (idleGreetingPool.length === 0) {
    idleGreetingPool = sharedGreetings.slice(1).filter(Boolean).sort(() => Math.random() - 0.5);
  }
  return idleGreetingPool[idleGreetingPool.length - 1] || sharedGreetings[1] || "我在这里，随时待命。";
}

function markIdleGreetingShown() {
  if (idleGreetingPool.length > 0) {
    idleGreetingPool.pop();
  }
}

function normalizePetStats(stats) {
  const now = Date.now();
  return {
    ...stats,
    intimacy: clampStat(Number.isFinite(stats.intimacy) ? stats.intimacy : PET_INTIMACY_DEFAULT),
    fullness: clampStat(Number.isFinite(stats.fullness) ? stats.fullness : PET_FULLNESS_DEFAULT),
    health: clampStat(Number.isFinite(stats.health) ? stats.health : PET_HEALTH_DEFAULT),
    hungerPromptLevel: Number.isInteger(stats.hungerPromptLevel) ? stats.hungerPromptLevel : 0,
    healthPromptLevel: Number.isInteger(stats.healthPromptLevel) ? stats.healthPromptLevel : 0,
    fullPrompted: Boolean(stats.fullPrompted),
    closePrompted: Boolean(stats.closePrompted),
    lastInteractionAt: Number.isFinite(stats.lastInteractionAt) ? stats.lastInteractionAt : now,
    lastIntimacyDecayAt: Number.isFinite(stats.lastIntimacyDecayAt) ? stats.lastIntimacyDecayAt : now,
    lastFullnessDecayAt: Number.isFinite(stats.lastFullnessDecayAt) ? stats.lastFullnessDecayAt : now,
    lastHealthDecayAt: Number.isFinite(stats.lastHealthDecayAt) ? stats.lastHealthDecayAt : now,
    lastHealthRecoveryAt: Number.isFinite(stats.lastHealthRecoveryAt) ? stats.lastHealthRecoveryAt : now,
    lastStatsActiveAt: Number.isFinite(stats.lastStatsActiveAt) ? stats.lastStatsActiveAt : now
  };
}

function resumeNaturalStatsTimers(now = Date.now()) {
  if (!petStats) {
    return;
  }
  const offlineElapsedMs = Math.max(0, now - petStats.lastStatsActiveAt);
  if (offlineElapsedMs <= 0) {
    petStats.lastStatsActiveAt = now;
    return;
  }

  lastIntimacyDecayAt = Math.min(now, lastIntimacyDecayAt + offlineElapsedMs);
  lastFullnessDecayAt = Math.min(now, lastFullnessDecayAt + offlineElapsedMs);
  lastHealthDecayAt = Math.min(now, lastHealthDecayAt + offlineElapsedMs);
  lastHealthRecoveryAt = Math.min(now, lastHealthRecoveryAt + offlineElapsedMs);
  petStats.lastIntimacyDecayAt = lastIntimacyDecayAt;
  petStats.lastFullnessDecayAt = lastFullnessDecayAt;
  petStats.lastHealthDecayAt = lastHealthDecayAt;
  petStats.lastHealthRecoveryAt = lastHealthRecoveryAt;
  petStats.lastStatsActiveAt = now;
}

function readPetStats() {
  const today = getLocalDateKey();
  const now = Date.now();
  let hasStatsActiveAt = false;
  let stats = {
    firstRunDate: today,
    interactionDate: today,
    todayInteractions: 0,
    intimacy: PET_INTIMACY_DEFAULT,
    fullness: PET_FULLNESS_DEFAULT,
    health: PET_HEALTH_DEFAULT,
    hungerPromptLevel: 0,
    healthPromptLevel: 0,
    fullPrompted: false,
    closePrompted: false,
    lastInteractionAt: now,
    lastIntimacyDecayAt: now,
    lastFullnessDecayAt: now,
    lastHealthDecayAt: now,
    lastHealthRecoveryAt: now,
    lastStatsActiveAt: now
  };

  if (fs.existsSync(statsFile)) {
    try {
      const raw = fs.readFileSync(statsFile, "utf8").trim();
      const decoded = decodeStatsPayload(raw);
      const savedStats = decoded || JSON.parse(raw);
      hasStatsActiveAt = Number.isFinite(savedStats.lastStatsActiveAt);
      stats = { ...stats, ...savedStats };
    } catch (error) {
      log(`failed to read pet stats: ${error.stack || error.message}`);
    }
  }

  if (!stats.firstRunDate) {
    stats.firstRunDate = today;
  }
  if (!stats.interactionDate) {
    stats.interactionDate = today;
  }
  if (!hasStatsActiveAt) {
    stats.lastIntimacyDecayAt = now;
    stats.lastFullnessDecayAt = now;
    stats.lastHealthDecayAt = now;
    stats.lastHealthRecoveryAt = now;
  }

  petStats = normalizePetStats(stats);
  lastIntimacyDecayAt = petStats.lastIntimacyDecayAt;
  lastFullnessDecayAt = petStats.lastFullnessDecayAt;
  lastHealthDecayAt = petStats.lastHealthDecayAt;
  lastHealthRecoveryAt = petStats.lastHealthRecoveryAt;
  resumeNaturalStatsTimers(now);
  syncDailyStats();
  writePetStats();
}

function getPetWindowWidth() {
  return Math.round(BASE_PET_WINDOW_WIDTH * petScale);
}

function getPetWindowHeight() {
  return Math.round(BASE_PET_WINDOW_HEIGHT * petScale);
}

function getPetSpriteSize() {
  return Math.round(BASE_PET_SPRITE_SIZE * petScale);
}

function getSpriteLocalXForWindowWidth(windowWidth = getPetWindowWidth()) {
  return Math.max(0, Math.round((Math.round(windowWidth) - getPetSpriteSize()) / 2));
}

function getTaskbarWalkRunwayPadding() {
  return clamp(
    Math.round(getPetSpriteSize() * TASKBAR_WALK_RUNWAY_PADDING_SCALE),
    TASKBAR_WALK_RUNWAY_PADDING_MIN,
    TASKBAR_WALK_RUNWAY_PADDING_MAX
  );
}

function getTaskbarWalkRunwayScreenBuffer() {
  return Math.max(getPetWindowWidth(), getTaskbarWalkRunwayPadding()) * TASKBAR_WALK_RUNWAY_SCREEN_BUFFER_FACTOR;
}

function getTaskbarWalkRunwayWindowWidth(surface = getCurrentSurface()) {
  const area = getSurfaceWorkArea(surface);
  return Math.round(area.width + getTaskbarWalkRunwayScreenBuffer() * 2);
}

function getDefaultDirectionForState(stateId = activeState) {
  return getState(stateId)?.defaultFacing === "right" ? 1 : -1;
}

function getDarwinBottomDock(display) {
  if (process.platform !== "darwin") {
    return null;
  }
  const area = display.workArea;
  const bounds = display.bounds;
  const boundsBottom = Math.round(bounds.y + bounds.height);
  const areaBottom = Math.round(area.y + area.height);
  const dockHeight = boundsBottom - areaBottom;
  if (dockHeight <= 0 || Math.round(area.x) !== Math.round(bounds.x) || Math.round(area.width) !== Math.round(bounds.width)) {
    return null;
  }
  const dockWidth = Math.min(Math.round(bounds.width), Math.round(dockHeight * DARWIN_BOTTOM_DOCK_WIDTH_HEIGHT_FACTOR));
  const centerX = Math.round(bounds.x + bounds.width / 2);
  return {
    left: centerX - Math.round(dockWidth / 2),
    right: centerX + Math.round(dockWidth / 2),
    screenGroundY: boundsBottom - VISIBLE_BOTTOM_GAP
  };
}

function clampPetScale(value) {
  return Math.round(clamp(Number(value) || 1, PET_SCALE_MIN, PET_SCALE_MAX) * 100) / 100;
}

function getTaskbarSurface(display = screen.getPrimaryDisplay()) {
  const area = display.workArea;
  const darwinBottomDock = getDarwinBottomDock(display);
  return {
    type: "taskbar",
    displayId: display.id,
    left: area.x + VISIBLE_SIDE_GAP,
    right: area.x + area.width - VISIBLE_SIDE_GAP,
    groundY: area.y + area.height - VISIBLE_BOTTOM_GAP,
    darwinBottomDock,
    workArea: { x: area.x, y: area.y, width: area.width, height: area.height }
  };
}

function getTaskbarSurfaceForBounds(bounds = petWindow?.getBounds()) {
  const display = bounds ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay();
  return getTaskbarSurface(display);
}

function getHoverPanelSafeAreaInset() {
  const panelGap = getOverlayVisualGap(HOVER_PANEL_GAP_OFFSET, HOVER_PANEL_SCALE_GAP_FACTOR);
  return clamp(Math.round(Math.max(8, panelGap * 0.55)), 8, 18);
}

function getTaskbarHoverCenterInset(surface = getCurrentSurface(), stateId = activeState, direction = walkDirection) {
  if (surface?.type === "window") {
    return 0;
  }
  const visibleInsets = getVisibleSpriteInsets(stateId, direction);
  const visibleWidth = Math.max(1, getPetSpriteSize() - visibleInsets.left - visibleInsets.right);
  const targetInset = Math.round((HOVER_PANEL_WIDTH - visibleWidth) / 2 + getHoverPanelSafeAreaInset() - VISIBLE_SIDE_GAP);
  const maxInset = Math.max(0, Math.floor(Math.max(1, surface.right - surface.left) / 2) - 1);
  return clamp(Math.max(TASKBAR_HOME_HOVER_CENTER_INSET_MIN, targetInset), 0, maxInset);
}

function getTaskbarHomeVisibleRight(surface = getCurrentSurface(), stateId = activeState, direction = walkDirection) {
  return Math.round(surface.right - getTaskbarHoverCenterInset(surface, stateId, direction));
}

function isTaskbarWalkActive(surface = getCurrentSurface()) {
  return activeState === STATE_WALK && surface?.type !== "window";
}

function getSurfaceDisplay(surface = currentSurface) {
  if (surface?.displayId !== undefined && surface?.displayId !== null) {
    const display = screen.getAllDisplays().find((item) => item.id === surface.displayId);
    if (display) {
      return display;
    }
  }
  if (surface?.bounds) {
    return screen.getDisplayMatching({
      x: surface.bounds.left,
      y: surface.bounds.top,
      width: Math.max(1, surface.bounds.width || surface.bounds.right - surface.bounds.left),
      height: Math.max(1, surface.bounds.height || surface.bounds.bottom - surface.bounds.top)
    });
  }
  return screen.getPrimaryDisplay();
}

function validateWindowSurface(surface = currentSurface) {
  if (!surface || surface.type !== "window") {
    return null;
  }

  const display = getSurfaceDisplay(surface);
  const area = display.workArea;
  const bounds = surface.bounds || {};
  const left = Math.max(Math.round(bounds.left), area.x + VISIBLE_SIDE_GAP);
  const right = Math.min(Math.round(bounds.right), area.x + area.width - VISIBLE_SIDE_GAP);
  const groundY = Math.max(Math.round(bounds.top) - WINDOW_DOCK_GAP, area.y + VISIBLE_TOP_GAP);
  if (right - left < WINDOW_DOCK_MIN_WIDTH || groundY <= area.y + VISIBLE_TOP_GAP) {
    return null;
  }

  return {
    ...surface,
    displayId: display.id,
    left,
    right,
    groundY,
    workArea: { x: area.x, y: area.y, width: area.width, height: area.height }
  };
}

function getCurrentSurface() {
  const validWindowSurface = validateWindowSurface(currentSurface);
  if (validWindowSurface) {
    currentSurface = validWindowSurface;
    return currentSurface;
  }
  currentSurface = getTaskbarSurfaceForBounds();
  return currentSurface;
}

function setCurrentSurface(surface) {
  currentSurface = surface?.type === "window"
    ? validateWindowSurface(surface) || getTaskbarSurfaceForBounds()
    : surface || getTaskbarSurfaceForBounds();
  if (currentSurface.type !== "window") {
    windowSurfaceMissingTicks = 0;
  }
  const display = getSurfaceDisplay(currentSurface);
  homeDisplayId = display.id;
  homeWorkArea = display.workArea;
  return currentSurface;
}

function resetToTaskbarSurface(bounds = petWindow?.getBounds()) {
  const surface = getTaskbarSurfaceForBounds(bounds);
  return setCurrentSurface(surface);
}

function getSurfaceWorkArea(surface = getCurrentSurface()) {
  if (surface?.workArea) {
    return surface.workArea;
  }
  return getSurfaceDisplay(surface).workArea;
}

function getSurfaceGroundY(surface = getCurrentSurface(), visibleLeft = null, visibleRight = null) {
  const dock = surface?.darwinBottomDock;
  if (dock && Number.isFinite(visibleLeft) && Number.isFinite(visibleRight)) {
    return visibleRight < dock.left || visibleLeft > dock.right
      ? dock.screenGroundY
      : surface.groundY;
  }
  return surface.groundY;
}

function getSurfaceVisibleTop(surface = getCurrentSurface(), stateId = activeState, direction = walkDirection, visibleLeft = null, visibleRight = null) {
  const visibleInsets = getVisibleSpriteInsets(stateId, direction);
  const visibleHeight = getPetSpriteSize() - visibleInsets.top - visibleInsets.bottom;
  return Math.round(getSurfaceGroundY(surface, visibleLeft, visibleRight) - visibleHeight);
}

function getGroundedWindowYForSurface(surface = getCurrentSurface(), stateId = activeState, direction = walkDirection, visibleLeft = null, visibleRight = null) {
  const visibleTop = getSurfaceVisibleTop(surface, stateId, direction, visibleLeft, visibleRight);
  const windowHeight = getPetWindowHeight();
  const spriteSize = getPetSpriteSize();
  const verticalInset = Math.max(0, windowHeight - spriteSize);
  const visibleInsets = getVisibleSpriteInsets(stateId, direction);
  return Math.round(visibleTop - verticalInset - visibleInsets.top);
}

function clampPetWindowPositionToSurface(x, y, surface = getCurrentSurface(), stateId = activeState, direction = walkDirection) {
  const windowWidth = getPetWindowWidth();
  const windowHeight = getPetWindowHeight();
  const pointRect = {
    x: Math.round(x),
    y: Math.round(y),
    width: windowWidth,
    height: windowHeight
  };
  const visibleRect = getVisiblePetRectFromBounds(pointRect, stateId, direction);
  const surfaceY = getGroundedWindowYForSurface(surface, stateId, direction, visibleRect.x, visibleRect.x + visibleRect.width);
  const minX = x + surface.left - visibleRect.x;
  const maxX = x + surface.right - (visibleRect.x + visibleRect.width);
  return {
    x: clamp(Math.round(x), Math.round(minX), Math.round(maxX)),
    y: Math.round(surfaceY)
  };
}

function getVisibleBottomPoint(bounds = petWindow?.getBounds(), stateId = activeState, direction = walkDirection) {
  if (!bounds) {
    return null;
  }
  const visibleRect = getVisiblePetRectFromBounds(bounds, stateId, direction);
  return {
    x: visibleRect.x + Math.round(visibleRect.width / 2),
    y: visibleRect.y + visibleRect.height,
    visibleRect
  };
}

function getRenderedFrameBottomAnchor(bounds = petWindow?.getBounds(), stateId = activeState, direction = walkDirection) {
  if (!bounds) {
    return null;
  }
  const visibleRect = getRenderedFrameVisibleRectFromBounds(bounds, stateId, direction)
    || getVisiblePetRectFromBounds(bounds, stateId, direction);
  if (!visibleRect) {
    return null;
  }
  return {
    x: Math.round(visibleRect.x + visibleRect.width / 2),
    y: Math.round(visibleRect.y + visibleRect.height),
    visibleRect
  };
}

function getTransitionBottomAnchor(stateId = activeState, direction = walkDirection) {
  const visibleRect = taskbarWalkRunway && isTaskbarWalkActive()
    ? getRenderedFrameVisibleRect()
    : null;
  if (visibleRect) {
    return {
      x: Math.round(visibleRect.x + visibleRect.width / 2),
      y: Math.round(visibleRect.y + visibleRect.height),
      visibleRect
    };
  }
  return getRenderedFrameBottomAnchor(petWindow?.getBounds(), stateId, direction);
}

function preserveBottomAnchorForState(anchor, stateId = activeState, direction = walkDirection, surface = getCurrentSurface()) {
  if (!anchor || !petWindow || petWindow.isDestroyed()) {
    return false;
  }
  const groundedY = getGroundedWindowYForSurface(surface, stateId, direction);
  const targetX = getFrameVisibleCenterWindowX(anchor.x, stateId, 0, direction);
  const next = clampPetWindowPositionToSurface(targetX, groundedY, surface, stateId, direction);
  setPetWindowPosition(next.x, next.y);
  syncWalkTrackX(next.x);
  return true;
}

function getVisibleBottomYForSurface(surface, stateId = activeState, direction = walkDirection) {
  const visibleInsets = getVisibleSpriteInsets(stateId, direction);
  const visibleHeight = getPetSpriteSize() - visibleInsets.top - visibleInsets.bottom;
  return Math.round(surface.groundY);
}

function parseWindowSurfaceItems(rawOutput) {
  if (!rawOutput || !rawOutput.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawOutput);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    log(`failed to parse window surfaces: ${error.stack || error.message}`);
    return [];
  }
}

function parseWindowHwnd(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^0x/i.test(raw)) {
    return raw.slice(2).replace(/^0+/, "").toLowerCase() || "0";
  }
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && asNumber > 0) {
    return Math.trunc(asNumber).toString(16);
  }
  return raw.toLowerCase();
}

function toNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeRectShape(rect) {
  if (!rect) {
    return null;
  }
  const left = toNumberOrNull(rect.left);
  const top = toNumberOrNull(rect.top);
  const right = toNumberOrNull(rect.right);
  const bottom = toNumberOrNull(rect.bottom);
  if (left === null || top === null || right === null || bottom === null) {
    return null;
  }
  const width = Number.isFinite(Number(rect.width)) ? Number(rect.width) : (right - left);
  const height = Number.isFinite(Number(rect.height)) ? Number(rect.height) : (bottom - top);
  return { left, top, right, bottom, width, height };
}

function normalizeWindowRectToDip(rect) {
  const normalized = normalizeRectShape(rect);
  if (!normalized) {
    return null;
  }
  if (typeof screen.screenToDipRect !== "function") {
    return {
      left: Math.round(normalized.left),
      top: Math.round(normalized.top),
      right: Math.round(normalized.right),
      bottom: Math.round(normalized.bottom),
      width: Math.round(normalized.width),
      height: Math.round(normalized.height)
    };
  }
  const physicalRect = {
    x: Math.round(normalized.left),
    y: Math.round(normalized.top),
    width: Math.max(1, Math.round(normalized.width)),
    height: Math.max(1, Math.round(normalized.height))
  };
  let dipRect = null;
  try {
    const ownerWindow = petWindow && !petWindow.isDestroyed() ? petWindow : null;
    dipRect = screen.screenToDipRect(ownerWindow, physicalRect);
  } catch (error) {
    log(`screenToDipRect failed: ${error.stack || error.message}`);
    return {
      left: Math.round(normalized.left),
      top: Math.round(normalized.top),
      right: Math.round(normalized.right),
      bottom: Math.round(normalized.bottom),
      width: Math.round(normalized.width),
      height: Math.round(normalized.height)
    };
  }
  if (!dipRect || !Number.isFinite(dipRect.x) || !Number.isFinite(dipRect.y) || !Number.isFinite(dipRect.width) || !Number.isFinite(dipRect.height)) {
    return {
      left: Math.round(normalized.left),
      top: Math.round(normalized.top),
      right: Math.round(normalized.right),
      bottom: Math.round(normalized.bottom),
      width: Math.round(normalized.width),
      height: Math.round(normalized.height)
    };
  }
  return {
    left: Math.round(dipRect.x),
    top: Math.round(dipRect.y),
    right: Math.round(dipRect.x + dipRect.width),
    bottom: Math.round(dipRect.y + dipRect.height),
    width: Math.round(dipRect.width),
    height: Math.round(dipRect.height)
  };
}

function toPhysicalScreenPoint(point) {
  if (!point) {
    return null;
  }
  if (typeof screen.dipToScreenPoint !== "function") {
    return {
      x: Math.round(point.x),
      y: Math.round(point.y)
    };
  }
  const screenPoint = screen.dipToScreenPoint({
    x: Math.round(point.x),
    y: Math.round(point.y)
  });
  return {
    x: Math.round(screenPoint.x),
    y: Math.round(screenPoint.y)
  };
}

function prepareRuntimeScript(scriptName) {
  const sourcePath = path.join(__dirname, scriptName);
  if (!sourcePath.includes(".asar") && fs.existsSync(sourcePath)) {
    return sourcePath;
  }
  try {
    const content = fs.readFileSync(sourcePath, "utf8");
    const runtimeScriptPath = path.join(userDataRoot, scriptName);
    fs.writeFileSync(runtimeScriptPath, content, "utf8");
    return runtimeScriptPath;
  } catch (error) {
    log(`failed to prepare runtime script ${scriptName}: ${error.stack || error.message}`);
    return null;
  }
}

function listWindowSurfaceCandidates({ useCache = true } = {}) {
  if (!ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
    return [];
  }
  const now = Date.now();
  if (useCache && now - windowSurfaceCandidatesCacheAt <= WINDOW_SURFACE_CACHE_MS) {
    return windowSurfaceCandidatesCache;
  }

  const scriptPath = prepareRuntimeScript("window-surfaces.ps1");
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    return [];
  }

  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-PetPid",
      String(process.pid),
      "-PetInternalName",
      APP_INTERNAL_NAME
    ], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1800,
      maxBuffer: 1024 * 1024
    });
    const items = parseWindowSurfaceItems(output);
    windowSurfaceCandidatesCache = items;
    windowSurfaceCandidatesCacheAt = now;
    if (WINDOW_DOCK_DEBUG) {
      log(`window-dock enum items=${items.length}`);
    }
    return items;
  } catch (error) {
    log(`failed to list window surfaces: ${error.stack || error.message}`);
    return [];
  }
}

function refreshWindowSurfaceCandidatesAsync({ force = false } = {}) {
  if (!ENABLE_WINDOW_DOCKING || process.platform !== "win32" || windowSurfaceRefreshInFlight) {
    return;
  }
  const now = Date.now();
  if (!force && now - lastWindowSurfaceAsyncRefreshAt < WINDOW_SURFACE_ASYNC_REFRESH_MIN_MS) {
    return;
  }
  lastWindowSurfaceAsyncRefreshAt = now;

  const scriptPath = prepareRuntimeScript("window-surfaces.ps1");
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    return;
  }

  windowSurfaceRefreshInFlight = true;
  execFile("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-PetPid",
    String(process.pid),
    "-PetInternalName",
    APP_INTERNAL_NAME
  ], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 3000,
    maxBuffer: 1024 * 1024
  }, (error, stdout, stderr) => {
    windowSurfaceRefreshInFlight = false;
    if (error) {
      if (WINDOW_DOCK_DEBUG) {
        const detail = [
          `message=${error.message || ""}`,
          `code=${error.code || ""}`,
          `signal=${error.signal || ""}`,
          `killed=${error.killed ? "1" : "0"}`,
          `timedOut=${error.code === "ETIMEDOUT" ? "1" : "0"}`,
          `stdoutLen=${(stdout || "").length}`,
          `stderrLen=${(stderr || "").length}`,
          `stderr=${String(stderr || "").trim().slice(0, 300)}`
        ].join(" ");
        log(`window-dock async refresh failed: ${detail}`);
      }
      return;
    }
    const items = parseWindowSurfaceItems(stdout || "");
    windowSurfaceCandidatesCache = items;
    windowSurfaceCandidatesCacheAt = Date.now();
  });
}

function listSpecificWindowSurfaceCandidate(hwnd) {
  if (!ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
    return null;
  }
  const normalizedTarget = parseWindowHwnd(hwnd);
  if (!normalizedTarget) {
    return null;
  }

  const scriptPath = prepareRuntimeScript("window-surfaces.ps1");
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    return null;
  }

  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-PetPid",
      String(process.pid),
      "-PetInternalName",
      APP_INTERNAL_NAME,
      "-TargetHwnd",
      String(hwnd)
    ], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 700,
      maxBuffer: 256 * 1024
    });
    const candidates = parseWindowSurfaceItems(output);
    return candidates.find((item) => parseWindowHwnd(item.hwnd) === normalizedTarget) || null;
  } catch (error) {
    if (WINDOW_DOCK_DEBUG) {
      log(`failed to validate window surface hwnd=${hwnd}: ${error.stack || error.message}`);
    }
    return null;
  }
}

function findCandidateByHwnd(hwnd, { useCache = true, cacheOnly = false } = {}) {
  const normalizedTarget = parseWindowHwnd(hwnd);
  if (!normalizedTarget) {
    return null;
  }
  const candidates = cacheOnly
    ? getCachedWindowSurfaceCandidates()
    : listWindowSurfaceCandidates({ useCache });
  return candidates.find((item) => parseWindowHwnd(item.hwnd) === normalizedTarget) || null;
}

function refreshCurrentWindowSurfaceBoundsFromCache() {
  if (!currentSurface || currentSurface.type !== "window") {
    return true;
  }
  const sourceWindowId = currentSurface.sourceWindowId;
  if (!sourceWindowId) {
    return false;
  }
  const same = findCandidateByHwnd(sourceWindowId, { cacheOnly: true });
  if (!same) {
    refreshWindowSurfaceCandidatesAsync();
    return false;
  }
  const built = buildWindowSurfaceFromItem(same);
  if (!built.surface) {
    return false;
  }
  setCurrentSurface(built.surface);
  return true;
}

function maybeRefreshWindowSurfaceCandidatesBackground(now = Date.now()) {
  if (!ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
    return;
  }
  if (!currentSurface || currentSurface.type !== "window") {
    return;
  }
  if (windowSurfaceRefreshInFlight) {
    return;
  }
  if (now - lastWindowSurfaceBackgroundRefreshAt < WINDOW_SURFACE_BACKGROUND_REFRESH_MS) {
    return;
  }
  lastWindowSurfaceBackgroundRefreshAt = now;
  refreshWindowSurfaceCandidatesAsync();
}

function getWindowAtScreenPoint(x, y) {
  if (!ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
    return null;
  }

  const scriptPath = prepareRuntimeScript("window-from-point.ps1");
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    return null;
  }
  const physicalPoint = toPhysicalScreenPoint({ x, y });
  if (!physicalPoint) {
    return null;
  }

  try {
    const output = execFileSync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-X",
      String(physicalPoint.x),
      "-Y",
      String(physicalPoint.y),
      "-PetPid",
      String(process.pid),
      "-PetInternalName",
      APP_INTERNAL_NAME
    ], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1200,
      maxBuffer: 512 * 1024
    });
    if (!output || !output.trim()) {
      return null;
    }
    const parsed = JSON.parse(output);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const normalizedRect = normalizeWindowRectToDip({
      left: parsed.left,
      top: parsed.top,
      right: parsed.right,
      bottom: parsed.bottom,
      width: parsed.width,
      height: parsed.height
    });
    if (normalizedRect) {
      parsed.left = normalizedRect.left;
      parsed.top = normalizedRect.top;
      parsed.right = normalizedRect.right;
      parsed.bottom = normalizedRect.bottom;
      parsed.width = normalizedRect.width;
      parsed.height = normalizedRect.height;
    }
    return parsed;
  } catch (error) {
    log(`failed to hit-test window point: ${error.stack || error.message}`);
    return null;
  }
}

function rectFromWindowItem(item) {
  return normalizeWindowRectToDip({
    left: item.left,
    top: item.top,
    right: item.right,
    bottom: item.bottom,
    width: item.width,
    height: item.height
  }) || {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0
  };
}

function isValidRect(rect) {
  return Number.isFinite(rect.left)
    && Number.isFinite(rect.top)
    && Number.isFinite(rect.right)
    && Number.isFinite(rect.bottom)
    && rect.right > rect.left
    && rect.bottom > rect.top;
}

function isWindowTopDockable(rect, area) {
  const verticalSlack = 10;
  const horizontalOverlap = Math.min(rect.right, area.x + area.width) - Math.max(rect.left, area.x);
  return rect.top >= area.y - verticalSlack
    && rect.top <= area.y + area.height - 80
    && horizontalOverlap >= WINDOW_DOCK_MIN_WIDTH;
}

function buildWindowSurfaceFromItem(item) {
  const rect = rectFromWindowItem(item);
  if (!isValidRect(rect)) {
    return { surface: null, reason: "invalid-rect", rect };
  }
  const display = screen.getDisplayMatching({
    x: rect.left,
    y: rect.top,
    width: Math.max(1, rect.width),
    height: Math.max(1, rect.height)
  });
  const area = display.workArea;
  if (isLikelyDesktopOrSystemWindow(item, rect, area)) {
    return { surface: null, reason: "system-or-desktop-window", rect };
  }
  if (item.minimized || item.maximized) {
    return { surface: null, reason: item.minimized ? "minimized" : "maximized", rect };
  }
  if (!isWindowTopDockable(rect, area)) {
    return { surface: null, reason: "top-not-dockable", rect };
  }
  if (rect.width < WINDOW_DOCK_MIN_WIDTH) {
    return { surface: null, reason: `too-narrow:${rect.width}`, rect };
  }

  return {
    surface: {
      type: "window",
      displayId: display.id,
      sourceWindowId: item.hwnd,
      title: item.title || "",
      className: item.className || "",
      processName: item.processName || "",
      bounds: rect,
      left: Math.max(rect.left, area.x + WINDOW_SURFACE_SIDE_GAP),
      right: Math.min(rect.right, area.x + area.width - WINDOW_SURFACE_SIDE_GAP),
      groundY: rect.top - WINDOW_DOCK_GAP,
      workArea: { x: area.x, y: area.y, width: area.width, height: area.height }
    },
    reason: "accepted",
    rect
  };
}

function buildDockQueryPoints(bottomPoint, surfaceHint = null) {
  const points = [];
  if (!bottomPoint) {
    return points;
  }
  const spriteSize = getPetSpriteSize();
  const dragSample = dragState?.lastSample || lastDragSample;
  const now = Date.now();
  const isFastRelease = Boolean(
    dragSample
    && Number.isFinite(dragSample.speedPxPerSec)
    && dragSample.speedPxPerSec >= WINDOW_DOCK_FAST_RELEASE_SPEED_PX_PER_SEC
    && now - dragSample.at <= WINDOW_DOCK_FAST_RELEASE_MAX_AGE_MS
  );
  const sampleCount = isFastRelease
    ? Math.max(3, WINDOW_DOCK_FAST_HIT_SAMPLES)
    : Math.max(3, WINDOW_DOCK_NORMAL_HIT_SAMPLES);
  const pointOffsetsY = isFastRelease ? WINDOW_DOCK_FAST_POINT_OFFSETS_Y : WINDOW_DOCK_POINT_OFFSETS_Y;
  const halfSamples = Math.floor(sampleCount / 2);
  const step = Math.max(8, Math.round(spriteSize / (sampleCount + 1)));
  const sideSlack = Math.max(24, Math.round(spriteSize * 0.35));
  const minX = surfaceHint?.left !== undefined ? Math.round(surfaceHint.left - sideSlack) : -Infinity;
  const maxX = surfaceHint?.right !== undefined ? Math.round(surfaceHint.right + sideSlack) : Infinity;

  for (let index = -halfSamples; index <= halfSamples; index += 1) {
    const x = Math.round(bottomPoint.x + index * step);
    if (x < minX || x > maxX) {
      continue;
    }
    for (const offsetY of pointOffsetsY) {
      points.push({ x, y: Math.round(bottomPoint.y + offsetY) });
    }
  }
  points.push({ x: Math.round(bottomPoint.x), y: Math.round(bottomPoint.y) });
  return points;
}

function scoreDockSurface(bottomPoint, rect) {
  const distance = Math.abs(bottomPoint.y - rect.top);
  const horizontalCenter = rect.left + Math.round(rect.width / 2);
  const horizontalDistance = Math.abs(bottomPoint.x - horizontalCenter);
  return distance * 4 + horizontalDistance;
}

function getAdaptiveDockThreshold() {
  const dragSample = dragState?.lastSample || lastDragSample;
  const now = Date.now();
  const isFastRelease = Boolean(
    dragSample
    && Number.isFinite(dragSample.speedPxPerSec)
    && dragSample.speedPxPerSec >= WINDOW_DOCK_FAST_RELEASE_SPEED_PX_PER_SEC
    && now - dragSample.at <= WINDOW_DOCK_FAST_RELEASE_MAX_AGE_MS
  );
  return isFastRelease ? WINDOW_DOCK_FAST_RELEASE_THRESHOLD : WINDOW_DOCK_STRICT_THRESHOLD;
}

function getCachedWindowSurfaceCandidates() {
  if (!ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
    return [];
  }
  refreshWindowSurfaceCandidatesAsync();
  return windowSurfaceCandidatesCache || [];
}

function diagnoseDockTargetFromCache(bounds = petWindow?.getBounds()) {
  const bottom = getVisibleBottomPoint(bounds);
  if (!bottom) {
    return { ok: false, reason: "missing-bottom-point", surface: null, elapsedMs: 0 };
  }
  const startedAt = Date.now();
  const dockThreshold = getAdaptiveDockThreshold();
  const horizontalSlack = Math.max(24, Math.round(getPetSpriteSize() * 0.35));
  const queryPoints = buildDockQueryPoints(bottom);
  const candidates = getCachedWindowSurfaceCandidates();
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return { ok: false, reason: "empty-cache", surface: null, elapsedMs: Date.now() - startedAt };
  }
  const byHwnd = new Map();
  for (const item of candidates) {
    byHwnd.set(parseWindowHwnd(item.hwnd), item);
  }

  let bestPointHit = null;

  for (const point of queryPoints) {
    if (Date.now() - startedAt >= WINDOW_DOCK_DRAG_RELEASE_BUDGET_MS) {
      return { ok: false, reason: "budget-exceeded", surface: null, elapsedMs: Date.now() - startedAt };
    }
    for (const item of candidates) {
      const built = buildWindowSurfaceFromItem(item);
      if (!built.surface) {
        continue;
      }
      const rect = built.rect;
      if (point.x < rect.left - horizontalSlack || point.x > rect.right + horizontalSlack) {
        continue;
      }
      const distance = Math.abs(point.y - rect.top);
      if (distance > dockThreshold) {
        continue;
      }
      const score = scoreDockSurface(bottom, rect) + distance;
      if (!bestPointHit || score < bestPointHit.score) {
        bestPointHit = { score, surface: built.surface };
      }
    }
  }

  if (bestPointHit?.surface) {
    return { ok: true, reason: "cache-point-hit", surface: bestPointHit.surface, elapsedMs: Date.now() - startedAt };
  }

  let best = null;
  for (const item of candidates) {
    if (Date.now() - startedAt >= WINDOW_DOCK_DRAG_RELEASE_BUDGET_MS) {
      return { ok: false, reason: "budget-exceeded", surface: null, elapsedMs: Date.now() - startedAt };
    }
    const built = buildWindowSurfaceFromItem(item);
    if (!built.surface) {
      continue;
    }
    const rect = built.rect;
    const distance = Math.abs(bottom.y - rect.top);
    const horizontalNear = bottom.x >= rect.left - horizontalSlack && bottom.x <= rect.right + horizontalSlack;
    if (!horizontalNear || distance > dockThreshold) {
      continue;
    }
    const score = scoreDockSurface(bottom, rect);
    if (!best || score < best.score) {
      best = { score, surface: built.surface };
    }
  }
  if (best?.surface) {
    const normalizedHwnd = parseWindowHwnd(best.surface.sourceWindowId);
    const fresh = byHwnd.get(normalizedHwnd);
    if (fresh) {
      const rebuilt = buildWindowSurfaceFromItem(fresh);
      if (rebuilt.surface) {
        return { ok: true, reason: "cache-enum-hit", surface: rebuilt.surface, elapsedMs: Date.now() - startedAt };
      }
    }
    return { ok: true, reason: "cache-enum-hit", surface: best.surface, elapsedMs: Date.now() - startedAt };
  }
  return { ok: false, reason: "no-window-candidates", surface: null, elapsedMs: Date.now() - startedAt };
}

function getTopWindowRoamSurface(excludedWindowId = "") {
  refreshWindowSurfaceCandidatesAsync();
  const excludedId = parseWindowHwnd(excludedWindowId);
  const candidates = getCachedWindowSurfaceCandidates();
  for (const item of candidates) {
    const itemWindowId = parseWindowHwnd(item.hwnd);
    if (itemWindowId === windowRoamSuppressedWindowId || (excludedId && itemWindowId === excludedId)) {
      continue;
    }
    const built = buildWindowSurfaceFromItem(item);
    if (built.surface) {
      return built.surface;
    }
  }
  return null;
}

function attachPetToWindowRoamSurface(surface) {
  if (!petWindow || petWindow.isDestroyed()) {
    return false;
  }
  if (!surface || !applySurfaceScale(surface, activeState, walkDirection)) {
    return false;
  }

  const nextSurface = setCurrentSurface(surface);
  groundPetToSurface(activeState, walkDirection, nextSurface);
  const visibleInsets = getVisibleSpriteInsets(activeState, walkDirection);
  const visibleWidth = getPetSpriteSize() - visibleInsets.left - visibleInsets.right;
  const visibleLeft = nextSurface.right - visibleWidth;
  const target = getPetWindowPositionForVisibleRect(
    visibleLeft,
    getSurfaceVisibleTop(nextSurface, activeState, walkDirection),
    activeState,
    walkDirection
  );
  const next = clampPetWindowPositionToSurface(target.x, target.y, nextSurface, activeState, walkDirection);
  setPetWindowPosition(next.x, next.y);
  syncWalkTrackX(next.x);
  lastWindowSurfaceHeavyCheckAt = Date.now();
  if (isWalkingState()) {
    refreshWalkLoopAfterSurfaceChange();
  } else {
    petWindow.webContents.send("pet:scale-changed", buildScaleSummary());
  }
  return true;
}

function fallbackWindowRoamToTaskbar(reason = "window-roam-no-target") {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  if (getCurrentSurface().type === "window") {
    fallbackCurrentSurfaceToTaskbar(reason);
  }
}

function tickWindowRoam() {
  if (!windowRoamEnabledCache || dragState || windowDockInProgress || !petWindow || petWindow.isDestroyed()) {
    return;
  }

  const surface = getTopWindowRoamSurface();
  if (!surface) {
    windowRoamMissingTicks += 1;
    if (windowRoamMissingTicks >= WINDOW_ROAM_MAX_MISSING_TICKS) {
      windowRoamLastTargetId = "";
      fallbackWindowRoamToTaskbar();
    }
    return;
  }

  windowRoamMissingTicks = 0;
  const targetId = parseWindowHwnd(surface.sourceWindowId);
  if (targetId === windowRoamLastTargetId && getCurrentSurface().type === "window") {
    refreshCurrentWindowSurfaceBoundsFromCache();
    groundPetToSurface(activeState, walkDirection, getCurrentSurface());
    return;
  }

  if (attachPetToWindowRoamSurface(surface)) {
    windowRoamLastTargetId = targetId;
    windowRoamSuppressedWindowId = "";
  }
}

function startWindowRoamPolling() {
  if (windowRoamPollTimer || !canToggleWindowRoam()) {
    return;
  }
  tickWindowRoam();
  windowRoamPollTimer = setInterval(tickWindowRoam, WINDOW_ROAM_POLL_INTERVAL_MS);
}

function stopWindowRoamPolling() {
  if (!windowRoamPollTimer) {
    return;
  }
  clearInterval(windowRoamPollTimer);
  windowRoamPollTimer = null;
  windowRoamLastTargetId = "";
}

function updateWindowRoamPolling() {
  if (windowRoamEnabledCache) {
    startWindowRoamPolling();
  } else {
    stopWindowRoamPolling();
  }
}

function sendEyeTrackingLook(look) {
  const nextLook = look || "off";
  if (nextLook === lastEyeTrackingLook) {
    return;
  }
  lastEyeTrackingLook = nextLook;
  petWindow?.webContents.send("pet:eye-tracking-look", nextLook);
}

function getEyeTrackingLookForCursor(point) {
  const rect = getRenderedFrameHeadRectFromBounds(petWindow.getBounds()) || getRenderedFrameVisibleRect() || getVisiblePetRect();
  if (!rect || eyeTrackingLookFrameCount <= 0) {
    return "off";
  }

  const dx = point.x - (rect.x + rect.width / 2);
  const dy = point.y - (rect.y + rect.height / 2);
  const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
  const index = Math.round(((angle - Math.PI + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * eyeTrackingLookFrameCount) % eyeTrackingLookFrameCount;
  return `frame_${String(index).padStart(3, "0")}`;
}

function tickEyeTracking() {
  if (!eyeTrackingEnabledCache || activeState !== STATE_SQUAT || dragState || !petWindow || petWindow.isDestroyed()) {
    sendEyeTrackingLook("off");
    return;
  }

  const menuVisible = menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible();
  const hoverVisible = hoverWindow && !hoverWindow.isDestroyed() && hoverWindow.isVisible();
  const point = screen.getCursorScreenPoint();
  if (menuVisible || hoverVisible || isPointInsideRect(point, getWindowRect(petWindow)) || isPointInsideRenderedFrame(point)) {
    sendEyeTrackingLook("off");
    return;
  }

  sendEyeTrackingLook(getEyeTrackingLookForCursor(point));
}

function startEyeTrackingPolling() {
  if (eyeTrackingPollTimer || !canToggleEyeTracking()) {
    return;
  }
  tickEyeTracking();
  eyeTrackingPollTimer = setInterval(tickEyeTracking, EYE_TRACKING_POLL_INTERVAL_MS);
}

function stopEyeTrackingPolling() {
  if (!eyeTrackingPollTimer) {
    return;
  }
  clearInterval(eyeTrackingPollTimer);
  eyeTrackingPollTimer = null;
  sendEyeTrackingLook("off");
}

function updateEyeTrackingPolling() {
  if (eyeTrackingEnabledCache) {
    startEyeTrackingPolling();
  } else {
    stopEyeTrackingPolling();
  }
}

function getScaleForSurface(surface, requestedScale = preferredPetScale, stateId = activeState, direction = walkDirection) {
  const currentScale = petScale;
  let candidate = clampPetScale(requestedScale);
  const area = getSurfaceWorkArea(surface);
  while (candidate >= PET_SCALE_MIN) {
    petScale = candidate;
    const visibleInsets = getVisibleSpriteInsets(stateId, direction);
    const visibleWidth = getPetSpriteSize() - visibleInsets.left - visibleInsets.right;
    const visibleHeight = getPetSpriteSize() - visibleInsets.top - visibleInsets.bottom;
    const hasWidth = visibleWidth <= Math.max(1, surface.right - surface.left);
    const hasHeight = surface.groundY - visibleHeight >= area.y + VISIBLE_TOP_GAP;
    petScale = currentScale;
    if (hasWidth && hasHeight) {
      return candidate;
    }
    candidate = Math.round((candidate - PET_SCALE_STEP) * 100) / 100;
  }
  petScale = currentScale;
  return null;
}

function applySurfaceScale(surface, stateId = activeState, direction = walkDirection) {
  const nextScale = surface?.type === "window"
    ? getScaleForSurface(surface, preferredPetScale, stateId, direction)
    : preferredPetScale;
  if (!Number.isFinite(nextScale)) {
    return false;
  }
  const changed = Math.abs(petScale - nextScale) >= 0.001;
  if (!petWindow || petWindow.isDestroyed()) {
    petScale = clampPetScale(nextScale);
    return true;
  }
  const bounds = petWindow.getBounds();
  const taskbarWalkActive = isTaskbarWalkActive(surface);
  if (!changed && !taskbarWalkActive) {
    const wasRunwayActive = Boolean(taskbarWalkRunway);
    const needsResize = bounds.width !== getPetWindowWidth() || bounds.height !== getPetWindowHeight();
    taskbarWalkRunway = null;
    if (wasRunwayActive) {
      clearPetWindowHitRegion();
    }
    if (needsResize) {
      const anchorX = bounds.x + Math.round(bounds.width / 2);
      const groundedY = getGroundedWindowYForSurface(surface, stateId, direction);
      const next = clampPetWindowPositionToSurface(
        anchorX - Math.round(getPetWindowWidth() / 2),
        groundedY,
        surface,
        stateId,
        direction
      );
      petWindow.setBounds({
        x: next.x,
        y: next.y,
        width: getPetWindowWidth(),
        height: getPetWindowHeight()
      }, false);
    }
    if (wasRunwayActive || needsResize) {
      petWindow.webContents.send("pet:scale-changed", buildScaleSummary());
      refreshMenuAnchorAfterScale();
      refreshHoverAnchorAfterScale();
      repositionStartupBubbleWindow();
    }
    return true;
  }
  const taskbarCenterAnchor = taskbarWalkActive
    ? (taskbarWalkRunway?.centerX
      ?? walkTrackX
      ?? getWalkVisibleCenterFromWindowX(
        bounds.x,
        getGroundedWindowYForSurface(surface, stateId, direction),
        stateId,
        direction
      ))
    : null;
  petScale = clampPetScale(nextScale);
  if (taskbarWalkActive) {
    const needsRunwayRefresh = !taskbarWalkRunway
      || taskbarWalkRunway.windowWidth !== getTaskbarWalkRunwayWindowWidth(surface)
      || taskbarWalkRunway.windowHeight !== getPetWindowHeight();
    if (!changed && !needsRunwayRefresh) {
      return true;
    }
    const groundedY = getGroundedWindowYForSurface(surface, stateId, direction);
    const centerLimits = getTaskbarWalkCenterLimits(surface, stateId);
    ensureTaskbarWalkRunwayForCenter(
      clamp(Math.round(taskbarCenterAnchor), centerLimits.left, centerLimits.right),
      groundedY,
      direction,
      surface,
      { force: true, reason: "scale" }
    );
    petWindow.webContents.send("pet:scale-changed", buildScaleSummary());
    refreshMenuAnchorAfterScale();
    refreshHoverAnchorAfterScale();
    repositionStartupBubbleWindow();
    return true;
  }
  taskbarWalkRunway = null;
  clearPetWindowHitRegion();
  const oldWidth = bounds.width;
  const anchorX = bounds.x + Math.round(oldWidth / 2);
  const newWidth = getPetWindowWidth();
  const newHeight = getPetWindowHeight();
  const groundedY = getGroundedWindowYForSurface(surface, stateId, direction);
  const next = clampPetWindowPositionToSurface(anchorX - Math.round(newWidth / 2), groundedY, surface, stateId, direction);
  petWindow.setBounds({
    x: next.x,
    y: next.y,
    width: newWidth,
    height: newHeight
  }, false);
  petWindow.webContents.send("pet:scale-changed", buildScaleSummary());
  refreshMenuAnchorAfterScale();
  refreshHoverAnchorAfterScale();
  repositionStartupBubbleWindow();
  return true;
}

function groundPetToSurface(stateId = activeState, direction = walkDirection, surface = getCurrentSurface()) {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const bounds = petWindow.getBounds();
  let activeSurface = surface;
  if (!applySurfaceScale(activeSurface, stateId, direction)) {
    activeSurface = resetToTaskbarSurface(bounds);
    applySurfaceScale(activeSurface, stateId, direction);
  }
  setCurrentSurface(activeSurface);
  const groundedY = getGroundedWindowYForSurface(activeSurface, stateId, direction);
  if (isTaskbarWalkActive(activeSurface)) {
    const centerLimits = getTaskbarWalkCenterLimits(activeSurface, stateId);
    const centerX = clamp(
      taskbarWalkRunway?.centerX
        ?? walkTrackX
        ?? getWalkVisibleCenterFromWindowX(bounds.x, groundedY, stateId, direction),
      centerLimits.left,
      centerLimits.right
    );
    ensureTaskbarWalkRunwayForCenter(centerX, groundedY, direction, activeSurface, {
      force: true,
      reason: "ground"
    });
    return;
  }
  taskbarWalkRunway = null;
  clearPetWindowHitRegion();
  const next = clampPetWindowPositionToSurface(bounds.x, groundedY, activeSurface, stateId, direction);
  setPetWindowPosition(next.x, next.y);
  if (activeSurface.type === "window") {
    const applyWindowDockCorrection = (limit, label = "coarse") => {
      const correctedBounds = petWindow.getBounds();
      const visible = getVisiblePetRectFromBounds(correctedBounds, stateId, direction);
      const deltaY = Math.round(activeSurface.groundY - (visible.y + visible.height));
      if (Math.abs(deltaY) > 0 && Math.abs(deltaY) <= limit) {
        setPetWindowPosition(correctedBounds.x, correctedBounds.y + deltaY);
        if (WINDOW_DOCK_DEBUG && Math.abs(deltaY) > WINDOW_DOCK_FINE_CORRECTION_LIMIT) {
          log(`window-dock ${label}-correct deltaY=${deltaY} surfaceTop=${activeSurface.groundY} visibleBottom=${visible.y + visible.height}`);
        }
        return true;
      }
      return false;
    };
    applyWindowDockCorrection(WINDOW_DOCK_COARSE_CORRECTION_LIMIT, "coarse");
    setImmediate(() => {
      if (!petWindow || petWindow.isDestroyed() || getCurrentSurface().type !== "window") {
        return;
      }
      applyWindowDockCorrection(WINDOW_DOCK_FINE_CORRECTION_LIMIT, "fine");
    });
  } else {
    const correctedBounds = petWindow.getBounds();
    const fallback = clampPetWindowPositionToSurface(correctedBounds.x, correctedBounds.y, activeSurface, stateId, direction);
    if (fallback.y !== correctedBounds.y || fallback.x !== correctedBounds.x) {
      setPetWindowPosition(fallback.x, fallback.y);
    }
  }
  syncWalkTrackX(next.x);
}

function buildScaleSummary() {
  const runwayActive = Boolean(taskbarWalkRunway && isTaskbarWalkActive());
  const windowWidth = runwayActive ? taskbarWalkRunway.windowWidth : getPetWindowWidth();
  const spriteOffsetX = runwayActive
    ? taskbarWalkRunway.spriteOffsetX
    : getSpriteLocalXForWindowWidth(windowWidth);
  return {
    value: petScale,
    min: PET_SCALE_MIN,
    max: PET_SCALE_MAX,
    step: PET_SCALE_STEP,
    windowWidth,
    windowHeight: getPetWindowHeight(),
    spriteSize: getPetSpriteSize(),
    spriteOffsetX,
    taskbarRunway: runwayActive
  };
}

function sendScaleState() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  petWindow.webContents.send("pet:scale-changed", buildScaleSummary());
}

function encodeStatsPayload(data) {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64");
}

function decodeStatsPayload(raw) {
  if (!raw || typeof raw !== "string") { return null; }
  try {
    const json = Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function writePetStats() {
  if (!petStats) {
    return;
  }
  petStats.lastStatsActiveAt = Date.now();
  fs.writeFileSync(statsFile, encodeStatsPayload(petStats), "utf8");
}

function buildTimerSummary(now = Date.now()) {
  const walkLoopRemainingMs = getWalkLoopRemainingMs(walkLoop, now, walkPausedAt);
  return {
    idleGreetingDelayMs: IDLE_GREETING_DELAY_MS,
    intimacyDecayDelayMs: INTIMACY_DECAY_INTERVAL_MS,
    walkLoopDurationMs: WALK_LOOP_DURATION_MS,
    lastOperationElapsedMs: Math.max(0, now - lastUserOperationAt),
    lastInteractionElapsedMs: Math.max(0, now - (petStats?.lastInteractionAt || now)),
    nextIdleGreetingInMs: Math.max(0, IDLE_GREETING_DELAY_MS - (now - lastUserOperationAt)),
    nextTabbyYawnInMs: Math.max(0, TABBY_YAWN_IDLE_MS - (now - lastTabbyUserOperationAt)),
    nextIntimacyDecayInMs: Math.max(0, INTIMACY_DECAY_INTERVAL_MS - (now - lastIntimacyDecayAt)),
    walkLoopRemainingMs,
    walkLoopPaused: Boolean(walkLoop?.endsAt && walkPausedAt)
  };
}

function buildStatsSummary() {
  if (!petStats) {
    readPetStats();
  }
  petStats = normalizePetStats(petStats);
  syncDailyStats();
  const today = getLocalDateKey();

  return {
    companionshipDays: daysBetween(petStats.firstRunDate, today),
    todayInteractions: petStats.todayInteractions,
    intimacy: petStats.intimacy,
    fullness: petStats.fullness,
    health: petStats.health,
    maxValue: PET_STAT_MAX,
    timers: buildTimerSummary()
  };
}

function sendStats() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const stats = buildStatsSummary();
  petWindow.webContents.send("pet:stats-changed", stats);
  menuWindow?.webContents.send("pet:stats-changed", stats);
  hoverWindow?.webContents.send("pet:stats-changed", stats);
}

function scheduleIdleGreeting(delayMs = IDLE_GREETING_DELAY_MS) {
  scheduleRandomGreeting(delayMs);
}

function startTabbyIdlePolling() {
  if (petRuntimeConfig.variant !== "tabby" || tabbyIdlePollTimer) {
    return;
  }
  tabbyIdlePollTimer = setInterval(updateTabbyIdleActions, 1000);
  updateTabbyIdleActions();
}

function updateTabbyIdleActions() {
  if (petRuntimeConfig.variant !== "tabby" || activeState !== DEFAULT_STATE) {
    return;
  }
  if (Date.now() - lastTabbyUserOperationAt >= TABBY_YAWN_IDLE_MS) {
    log("tabby idle -> yawn");
    setState(STATE_YAWN, false);
  }
}

function recordUserOperation({ scheduleGreeting = true } = {}) {
  lastUserOperationAt = Date.now();
  lastTabbyUserOperationAt = lastUserOperationAt;
  if (scheduleGreeting) {
    scheduleIdleGreeting();
  }
  sendStats();
}

function recordInteraction() {
  if (!petStats) {
    readPetStats();
  }
  petStats = normalizePetStats(petStats);
  syncDailyStats();
  petStats.lastInteractionAt = Date.now();
  petStats.todayInteractions += 1;
  writePetStats();
  sendStats();
}

function updateStatPromptState(messages = []) {
  if (petStats.fullness > HUNGER_PROMPT_CLEAR_THRESHOLD) {
    petStats.hungerPromptLevel = 0;
  } else if (petStats.fullness > EXHAUSTED_THRESHOLD && petStats.hungerPromptLevel >= 3) {
    petStats.hungerPromptLevel = petStats.fullness <= HUNGER_CRITICAL_THRESHOLD
      ? 2
      : petStats.fullness <= HUNGER_WARNING_THRESHOLD ? 1 : 0;
  }
  if (petStats.fullness < FULL_PROMPT_RESET_THRESHOLD) {
    petStats.fullPrompted = false;
  }
  if (petStats.health > HEALTH_PROMPT_CLEAR_THRESHOLD) {
    petStats.healthPromptLevel = 0;
  }
  if (petStats.intimacy < CLOSE_PROMPT_RESET_THRESHOLD) {
    petStats.closePrompted = false;
  }
  if (petStats.fullness <= EXHAUSTED_THRESHOLD && petStats.hungerPromptLevel < 3) {
    petStats.hungerPromptLevel = 3;
    messages.push(pickRandom(statMessages.exhausted));
  } else if (petStats.fullness <= HUNGER_CRITICAL_THRESHOLD && petStats.hungerPromptLevel < 2) {
    petStats.hungerPromptLevel = 2;
    messages.push(pickRandom(statMessages.hungry));
  } else if (petStats.fullness <= HUNGER_WARNING_THRESHOLD && petStats.hungerPromptLevel < 1) {
    petStats.hungerPromptLevel = 1;
    messages.push(pickRandom(statMessages.needFood));
  }
  if (petStats.health <= HEALTH_TIRED_THRESHOLD && petStats.healthPromptLevel < 1) {
    petStats.healthPromptLevel = 1;
    messages.push(pickRandom(statMessages.tired));
  }
  if (petStats.health >= HEALTH_RECOVERED_THRESHOLD && petStats.healthPromptLevel > 0) {
    petStats.healthPromptLevel = 0;
    messages.push(pickRandom(statMessages.recovered));
  }
  if (petStats.intimacy >= CLOSE_PROMPT_THRESHOLD && !petStats.closePrompted) {
    petStats.closePrompted = true;
    messages.push(pickRandom(statMessages.close));
  }
  return messages;
}

function applyNaturalStatsTick(now = Date.now()) {
  if (!petStats) {
    readPetStats();
  }
  petStats = normalizePetStats(petStats);
  syncDailyStats();
  let changed = false;
  const decayIntimacySteps = Math.floor((now - lastIntimacyDecayAt) / INTIMACY_DECAY_INTERVAL_MS);
  if (decayIntimacySteps > 0) {
    petStats.intimacy = clampStat(petStats.intimacy - decayIntimacySteps * STAT_NATURAL_DELTA);
    lastIntimacyDecayAt += decayIntimacySteps * INTIMACY_DECAY_INTERVAL_MS;
    changed = true;
  }
  const decayFullnessSteps = Math.floor((now - lastFullnessDecayAt) / FULLNESS_DECAY_INTERVAL_MS);
  if (decayFullnessSteps > 0) {
    petStats.fullness = clampStat(petStats.fullness - decayFullnessSteps * STAT_NATURAL_DELTA);
    lastFullnessDecayAt += decayFullnessSteps * FULLNESS_DECAY_INTERVAL_MS;
    changed = true;
  }
  const decayHealthSteps = Math.floor((now - lastHealthDecayAt) / HEALTH_DECAY_INTERVAL_MS);
  if (decayHealthSteps > 0) {
    petStats.health = clampStat(petStats.health - decayHealthSteps * STAT_NATURAL_DELTA);
    lastHealthDecayAt += decayHealthSteps * HEALTH_DECAY_INTERVAL_MS;
    changed = true;
  }
  const recoverySteps = Math.floor((now - lastHealthRecoveryAt) / HEALTH_RECOVERY_INTERVAL_MS);
  if (recoverySteps > 0) {
    const recovery = (petStats.intimacy >= HEALTH_RECOVERY_THRESHOLD ? recoverySteps : 0)
      + (petStats.fullness >= HEALTH_RECOVERY_THRESHOLD ? recoverySteps : 0);
    if (recovery > 0) {
      petStats.health = clampStat(petStats.health + recovery);
      changed = true;
    }
    lastHealthRecoveryAt += recoverySteps * HEALTH_RECOVERY_INTERVAL_MS;
    changed = true;
  }
  petStats.lastIntimacyDecayAt = lastIntimacyDecayAt;
  petStats.lastFullnessDecayAt = lastFullnessDecayAt;
  petStats.lastHealthDecayAt = lastHealthDecayAt;
  petStats.lastHealthRecoveryAt = lastHealthRecoveryAt;
  const messages = updateStatPromptState();
  if (changed || messages.length > 0) {
    writePetStats();
  }
  sendStats();
  showStatMessages(messages);
  return changed;
}

function startIntimacyDecayTimer() {
  if (intimacyDecayTimer) {
    return;
  }
  intimacyDecayTimer = setInterval(() => {
    applyNaturalStatsTick();
  }, 60 * 1000);
}

function stopIntimacyDecayTimer() {
  if (!intimacyDecayTimer) {
    return;
  }
  clearInterval(intimacyDecayTimer);
  intimacyDecayTimer = null;
}

function applyActionStats(stateId) {
  if (!petStats) {
    readPetStats();
  }
  petStats = normalizePetStats(petStats);
  syncDailyStats();
  if (stateId !== STATE_SQUAT) {
    petStats.intimacy = clampStat(petStats.intimacy + randomStatDelta(INTERACTION_INTIMACY_GAIN_MIN, INTERACTION_INTIMACY_GAIN_MAX));
  }
  if (stateId === STATE_FEED) {
    petStats.fullness = clampStat(petStats.fullness + randomStatDelta(FEED_FULLNESS_GAIN_MIN, FEED_FULLNESS_GAIN_MAX));
  }
  if (stateId === STATE_LIE) {
    petStats.health = clampStat(petStats.health + LIE_HEALTH_GAIN);
  }
  if (stateId === STATE_LICK) {
    petStats.health = clampStat(petStats.health + LICK_HEALTH_GAIN);
  }
  if (stateId === STATE_BELLY) {
    petStats.fullness = clampStat(petStats.fullness - BELLY_FULLNESS_COST);
  }
  if (stateId === STATE_STRETCH) {
    petStats.health = clampStat(petStats.health + STRETCH_HEALTH_GAIN);
    petStats.fullness = clampStat(petStats.fullness - STRETCH_FULLNESS_COST);
  }

  const messages = [];
  if (stateId === STATE_FEED && petStats.fullness >= FULL_PROMPT_THRESHOLD && !petStats.fullPrompted) {
    petStats.fullPrompted = true;
    messages.push(pickRandom(statMessages.full));
  }
  updateStatPromptState(messages);

  writePetStats();
  sendStats();
  return messages.filter(Boolean);
}

function shouldDelayActionStats(stateId) {
  return stateId === STATE_FEED || stateId === STATE_BALL || stateId === STATE_LIE || stateId === STATE_LICK || stateId === STATE_BELLY || stateId === STATE_STRETCH;
}

function showStatMessages(messages) {
  if (Array.isArray(messages) && messages.length > 0) {
    showBubbleMessage(messages[0], STARTUP_BUBBLE_DURATION_MS, { forceHideOverlays: true });
  }
}

function applyInterruptedWalkStats() {
  if (!petStats) {
    readPetStats();
  }
  petStats = normalizePetStats(petStats);
  syncDailyStats();
  updateStatPromptState();
  writePetStats();
  sendStats();
}

function applyCompletedWalkStats() {
  if (!petStats) {
    readPetStats();
  }
  petStats = normalizePetStats(petStats);
  syncDailyStats();
  petStats.intimacy = clampStat(petStats.intimacy + randomStatDelta(INTERACTION_INTIMACY_GAIN_MIN, INTERACTION_INTIMACY_GAIN_MAX));
  const messages = updateStatPromptState();

  writePetStats();
  sendStats();
  return messages.filter(Boolean);
}

function getAssetsRoot() {
  if (assetsRootCache) {
    return assetsRootCache;
  }
  if (app.isPackaged) {
    const candidates = [
      path.join(process.resourcesPath, "assets"),
      path.join(process.resourcesPath, "app", ".runtime-assets"),
      path.join(process.resourcesPath, "app.asar", ".runtime-assets")
    ];
    for (const candidate of candidates) {
      const probe = path.join(candidate, "animations", `${petAnimationPrefix}_squat`, "transparent_frames", "frame_000.png");
      if (fs.existsSync(probe)) {
        assetsRootCache = candidate;
        log(`assets root: ${assetsRootCache}`);
        return assetsRootCache;
      }
    }
    log(`missing packaged assets for ${petRuntimeConfig.variant}: ${candidates.join("; ")}`);
    assetsRootCache = candidates[0];
    return assetsRootCache;
  }
  assetsRootCache = path.resolve(__dirname, "..", "..", "assets");
  return assetsRootCache;
}

function toFileUrl(filePath) {
  return pathToFileURL(filePath).toString();
}

function listFrames(folder) {
  const fullFolder = path.join(getAssetsRoot(), folder);
  if (!fs.existsSync(fullFolder)) {
    return [];
  }
  return fs
    .readdirSync(fullFolder)
    .filter((name) => /^frame_\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((name) => toFileUrl(path.join(fullFolder, name)));
}

function listFramePaths(folder) {
  const fullFolder = path.join(getAssetsRoot(), folder);
  if (!fs.existsSync(fullFolder)) {
    return [];
  }
  if (framePathsCache.has(fullFolder)) {
    return framePathsCache.get(fullFolder);
  }
  const framePaths = fs
    .readdirSync(fullFolder)
    .filter((name) => /^frame_\d+\.png$/i.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((name) => path.join(fullFolder, name));
  framePathsCache.set(fullFolder, framePaths);
  return framePaths;
}

function listEyeTrackingFrames() {
  if (!canToggleEyeTracking()) {
    eyeTrackingLookFrameCount = 0;
    return {};
  }

  const folder = path.join(getAssetsRoot(), "animations", `${petAnimationPrefix}_look`, "transparent_frames");
  if (!fs.existsSync(folder)) {
    eyeTrackingLookFrameCount = 0;
    return {};
  }

  const frames = {};
  const directionFrames = fs
    .readdirSync(folder)
    .map((name) => name.match(EYE_TRACKING_FRAME_NAME_PATTERN))
    .filter(Boolean)
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  for (const match of directionFrames) {
    const name = `frame_${String(Number(match[1])).padStart(3, "0")}`;
    frames[name] = toFileUrl(path.join(folder, `${name}.png`));
  }
  eyeTrackingLookFrameCount = directionFrames.length;
  return frames;
}

function listTabbySounds(pattern) {
  if (petRuntimeConfig.variant !== "tabby") {
    return [];
  }

  const folder = path.join(getAssetsRoot(), "sounds", "tabby");
  if (!fs.existsSync(folder)) {
    return [];
  }

  return fs
    .readdirSync(folder)
    .filter((name) => pattern.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
    .map((name) => toFileUrl(path.join(folder, name)));
}

function readMetadata(relativePath) {
  const fullPath = path.join(getAssetsRoot(), relativePath);
  if (!fs.existsSync(fullPath)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    log(`failed to read metadata ${relativePath}: ${error.stack || error.message}`);
    return {};
  }
}

function getAppIconPath() {
  const candidates = [
    path.join(__dirname, "..", APP_ICON_FILE),
    path.join(__dirname, "..", "..", APP_ICON_FILE),
    path.join(process.resourcesPath || "", APP_ICON_FILE),
    path.join(__dirname, "..", "appIcon.ico"),
    path.join(__dirname, "..", "..", "appIcon.ico"),
    path.join(process.resourcesPath || "", "appIcon.ico")
  ];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function clampFrameIndex(index, maxFrame) {
  return Math.min(Math.max(0, index), maxFrame);
}

function sanitizeFrameSequence(sequence, maxFrame) {
  if (!sequence || typeof sequence !== "object") {
    return null;
  }

  if (Array.isArray(sequence)) {
    const timeline = sequence
      .map((segment) => {
        if (!segment || typeof segment !== "object") {
          return null;
        }
        const start = Number.isInteger(segment.start) ? segment.start : null;
        const end = Number.isInteger(segment.end) ? segment.end : null;
        const times = Number.isInteger(segment.times) ? segment.times : 1;
        if (start === null || end === null || times < 1) {
          return null;
        }
        return {
          start: clampFrameIndex(start, maxFrame),
          end: clampFrameIndex(end, maxFrame),
          times
        };
      })
      .filter(Boolean);

    return timeline.length > 0 ? timeline : null;
  }

  const repeatRangeStart = Number.isInteger(sequence.repeatRangeStart) ? sequence.repeatRangeStart : null;
  const repeatRangeEnd = Number.isInteger(sequence.repeatRangeEnd) ? sequence.repeatRangeEnd : null;
  const repeatCount = Number.isInteger(sequence.repeatCount) ? sequence.repeatCount : null;
  const sequenceRepeatCount = Number.isInteger(sequence.sequenceRepeatCount) ? Math.max(1, sequence.sequenceRepeatCount) : 1;
  if (repeatRangeStart === null || repeatRangeEnd === null || repeatCount === null || repeatCount <= 1) {
    return null;
  }

  const start = clampFrameIndex(repeatRangeStart, maxFrame);
  const end = Math.min(Math.max(start, repeatRangeEnd), maxFrame);
  return {
    repeatRangeStart: start,
    repeatRangeEnd: end,
    repeatCount,
    sequenceRepeatCount
  };
}

function buildPetConfig() {
  const actionOrder = petRuntimeConfig.actionOrder;
  const visibleActionIds = new Set(actionOrder);
  const variantProfile = getPetVariantProfile(petRuntimeConfig.variant);
  const extraAssets = variantProfile.extraAnimationAssets || [];
  for (const asset of extraAssets) {
    if (petActionIds[asset]) {
      visibleActionIds.add(petActionIds[asset]);
    }
  }
  return {
    variant: petRuntimeConfig.variant,
    channel: petRuntimeConfig.channel,
    switchableVariants: SWITCHABLE_VARIANTS,
    features: buildMenuFeatures(),
    autoStart: buildAutoStartSummary(),
    windowRoam: buildWindowRoamSummary(),
    eyeTracking: buildEyeTrackingSummary(),
    eyeTrackingFrames: listEyeTrackingFrames(),
    squatSounds: listTabbySounds(/^cat_meow_.*\.mp3$/i),
    sleepSounds: listTabbySounds(/^cat_purr_.*\.mp3$/i),
    actionIds: petRuntimeConfig.actions,
    actionOrder,
    channelConfig: petRuntimeConfig.channelConfig,
    defaultState: DEFAULT_STATE,
    activeState,
    stats: buildStatsSummary(),
    scale: buildScaleSummary(),
    alwaysOnTop: petWindow?.isAlwaysOnTop() ?? true,
    states: states.filter((state) => visibleActionIds.has(state.id)).map((state) => {
      const frames = listFrames(state.folder);
      const metadata = readMetadata(state.metadata);
      const maxFrame = Math.max(0, frames.length - 1);
      const loopStart = Number.isInteger(metadata.loopStart) ? metadata.loopStart : state.loopStart;
      const loopEnd = Number.isInteger(metadata.loopEnd) ? metadata.loopEnd : maxFrame;

      return {
        id: state.id,
        label: state.label,
        frames,
        frameMs: Number.isInteger(metadata.frameMs) ? metadata.frameMs : state.frameMs,
        loopStart: Math.min(Math.max(0, loopStart), maxFrame),
        loopEnd: Math.min(Math.max(0, loopEnd), maxFrame),
        defaultFacing: state.defaultFacing,
        moving: state.moving,
        oneShot: ONE_SHOT_STATES.has(state.id),
        returnState: ONE_SHOT_STATES.has(state.id) ? DEFAULT_STATE : state.id,
        greetings: state.greetings,
        frameSequence: sanitizeFrameSequence(state.frameSequence, maxFrame),
        sequenceRepeatCount: Number.isInteger(state.sequenceRepeatCount) ? Math.max(1, state.sequenceRepeatCount) : 1
      };
    })
  };
}

function getFrameVisibleBounds(filePath) {
  if (visibleBoundsCache.has(filePath)) {
    return visibleBoundsCache.get(filePath);
  }

  const image = nativeImage.createFromPath(filePath);
  const size = image.getSize();
  if (!size.width || !size.height) {
    const fallback = { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1, imageWidth: 1, imageHeight: 1 };
    visibleBoundsCache.set(filePath, fallback);
    return fallback;
  }

  const bitmap = image.toBitmap();
  let left = size.width;
  let top = size.height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < size.height; y += 1) {
    for (let x = 0; x < size.width; x += 1) {
      const alpha = bitmap[(y * size.width + x) * 4 + 3];
      if (alpha > VISIBLE_ALPHA_THRESHOLD) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  const bounds = right >= left && bottom >= top
    ? { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1, imageWidth: size.width, imageHeight: size.height }
    : { left: 0, top: 0, right: size.width - 1, bottom: size.height - 1, width: size.width, height: size.height, imageWidth: size.width, imageHeight: size.height };
  visibleBoundsCache.set(filePath, bounds);
  return bounds;
}

function getFramePixelData(filePath) {
  if (framePixelCache.has(filePath)) {
    return framePixelCache.get(filePath);
  }

  const image = nativeImage.createFromPath(filePath);
  const size = image.getSize();
  if (!size.width || !size.height) {
    return null;
  }

  const data = {
    bitmap: image.toBitmap(),
    width: size.width,
    height: size.height
  };
  framePixelCache.set(filePath, data);
  return data;
}

function getStateVisibleBounds(stateId = activeState) {
  const state = getState(stateId);
  if (!state) {
    return null;
  }
  const cacheKey = `state:${state.id}`;
  if (visibleBoundsCache.has(cacheKey)) {
    return visibleBoundsCache.get(cacheKey);
  }

  const framePaths = listFramePaths(state.folder);
  const frameBounds = framePaths.map((filePath) => getFrameVisibleBounds(filePath));
  let combined = null;
  for (const bounds of frameBounds) {
    if (!combined) {
      combined = { ...bounds };
      continue;
    }
    combined.left = Math.min(combined.left, bounds.left);
    combined.top = Math.min(combined.top, bounds.top);
    combined.right = Math.max(combined.right, bounds.right);
    combined.bottom = Math.max(combined.bottom, bounds.bottom);
    combined.imageWidth = Math.max(combined.imageWidth, bounds.imageWidth);
    combined.imageHeight = Math.max(combined.imageHeight, bounds.imageHeight);
  }

  if (!combined) {
    const spriteSize = getPetSpriteSize();
    combined = { left: 0, top: 0, right: spriteSize - 1, bottom: spriteSize - 1, width: spriteSize, height: spriteSize, imageWidth: spriteSize, imageHeight: spriteSize };
  } else {
    if (state.moving && frameBounds.length > 2) {
      const stableBottom = getStableGroundBottom(frameBounds);
      combined.bottom = Math.max(combined.top, Math.min(combined.bottom, stableBottom));
    }
    combined.width = combined.right - combined.left + 1;
    combined.height = combined.bottom - combined.top + 1;
  }
  visibleBoundsCache.set(cacheKey, combined);
  return combined;
}

function getStateFramePath(stateId = activeState, frameIndex = 0) {
  const state = getState(stateId);
  if (!state) {
    return null;
  }

  const framePaths = listFramePaths(state.folder);
  if (framePaths.length === 0) {
    return null;
  }

  const index = clamp(Math.round(Number(frameIndex) || 0), 0, framePaths.length - 1);
  return framePaths[index];
}

function getFrameVisibleRectFromBounds(windowBounds, stateId = activeState, frameIndex = 0, direction = walkDirection) {
  if (!windowBounds) {
    return null;
  }

  const framePath = getStateFramePath(stateId, frameIndex);
  if (!framePath) {
    return getVisiblePetRectFromBounds(windowBounds, stateId, direction);
  }

  const frameBounds = getFrameVisibleBounds(framePath);
  if (!frameBounds || !frameBounds.imageWidth || !frameBounds.imageHeight) {
    return getVisiblePetRectFromBounds(windowBounds, stateId, direction);
  }

  const state = getState(stateId);
  const shouldMirror = state?.defaultFacing === "left" ? direction > 0 : direction < 0;
  const rawLeft = shouldMirror
    ? frameBounds.imageWidth - 1 - frameBounds.right
    : frameBounds.left;
  const rawRight = shouldMirror
    ? frameBounds.imageWidth - 1 - frameBounds.left
    : frameBounds.right;
  const spriteRect = getSpriteRectFromBounds(windowBounds);
  const xScale = spriteRect.width / frameBounds.imageWidth;
  const yScale = spriteRect.height / frameBounds.imageHeight;
  return {
    x: Math.round(spriteRect.x + rawLeft * xScale),
    y: Math.round(spriteRect.y + frameBounds.top * yScale),
    width: Math.max(1, Math.round((rawRight - rawLeft + 1) * xScale)),
    height: Math.max(1, Math.round((frameBounds.bottom - frameBounds.top + 1) * yScale))
  };
}

function getFrameVisibleCenterWindowX(centerX, stateId = activeState, frameIndex = 0, direction = walkDirection) {
  const probe = {
    x: 0,
    y: 0,
    width: getPetWindowWidth(),
    height: getPetWindowHeight()
  };
  const visibleRect = getFrameVisibleRectFromBounds(probe, stateId, frameIndex, direction)
    || getVisiblePetRectFromBounds(probe, stateId, direction);
  return Math.round(centerX - (visibleRect.x - probe.x) - visibleRect.width / 2);
}

function applyDailyDecay(stats, days = 1) {
  const decayDays = Math.max(0, Math.floor(Number(days) || 0));
  if (!stats || decayDays <= 0) {
    return false;
  }

  let changed = false;
  const before = {
    intimacy: stats.intimacy,
    fullness: stats.fullness,
    health: stats.health
  };

  if (decayDays > 0) {
    stats.fullness = clampStat(stats.fullness - DAILY_DECAY_FULLNESS * decayDays);
    stats.health = clampStat(stats.health - DAILY_DECAY_HEALTH * decayDays);
  }

  if (stats.fullness > HUNGER_PROMPT_CLEAR_THRESHOLD) {
    stats.hungerPromptLevel = 0;
  }
  if (stats.fullness < FULL_PROMPT_RESET_THRESHOLD) {
    stats.fullPrompted = false;
  }
  if (stats.health > HEALTH_PROMPT_CLEAR_THRESHOLD) {
    stats.healthPromptLevel = 0;
  }
  if (stats.intimacy < CLOSE_PROMPT_RESET_THRESHOLD) {
    stats.closePrompted = false;
  }
  if (stats.fullness <= HUNGER_CRITICAL_THRESHOLD) {
    stats.hungerPromptLevel = Math.max(stats.hungerPromptLevel, 2);
  } else if (stats.fullness <= HUNGER_WARNING_THRESHOLD) {
    stats.hungerPromptLevel = Math.max(stats.hungerPromptLevel, 1);
  }
  if (stats.health <= HEALTH_TIRED_THRESHOLD) {
    stats.healthPromptLevel = Math.max(stats.healthPromptLevel, 1);
  }

  changed = before.intimacy !== stats.intimacy
    || before.fullness !== stats.fullness
    || before.health !== stats.health;
  return changed;
}

function syncDailyStats() {
  if (!petStats) {
    readPetStats();
  }
  petStats = normalizePetStats(petStats);
  const today = getLocalDateKey();
  const lastInteractionDate = typeof petStats.interactionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(petStats.interactionDate)
    ? petStats.interactionDate
    : today;
  if (lastInteractionDate === today) {
    petStats.interactionDate = today;
    return false;
  }

  const overdueDays = Math.max(1, daysBetween(lastInteractionDate, today));
  applyDailyDecay(petStats, overdueDays);
  petStats.interactionDate = today;
  petStats.todayInteractions = 0;
  writePetStats();
  return true;
}

function getRenderedFrameVisibleRect() {
  if (!petWindow || petWindow.isDestroyed()) {
    return null;
  }

  const stateId = renderedFrameState === activeState && states.some((state) => state.id === renderedFrameState)
    ? renderedFrameState
    : activeState;
  const direction = renderedFrameState === activeState && Number.isFinite(renderedFrameDirection)
    ? renderedFrameDirection
    : walkDirection;
  const frameIndex = renderedFrameState === activeState ? renderedFrameIndex : 0;
  if (taskbarWalkRunway && isTaskbarWalkActive()) {
    const spriteLeft = getTaskbarRunwaySpriteLeftForRect(stateId, direction);
    if (Number.isFinite(spriteLeft)) {
      return getFrameVisibleRectFromBounds({
        x: Math.round(spriteLeft - getSpriteLocalXForWindowWidth(getPetWindowWidth())),
        y: Math.round(taskbarWalkRunway.windowY),
        width: getPetWindowWidth(),
        height: getPetWindowHeight()
      }, stateId, frameIndex, direction);
    }
  }
  return getFrameVisibleRectFromBounds(petWindow.getBounds(), stateId, frameIndex, direction);
}

function getRenderedFrameInfo() {
  const stateId = renderedFrameState === activeState && states.some((state) => state.id === renderedFrameState)
    ? renderedFrameState
    : activeState;
  const direction = renderedFrameState === activeState && Number.isFinite(renderedFrameDirection)
    ? renderedFrameDirection
    : walkDirection;
  const frameIndex = renderedFrameState === activeState ? renderedFrameIndex : 0;
  const framePath = getStateFramePath(stateId, frameIndex);
  return { stateId, direction, frameIndex, framePath };
}

function getFrameHeadBounds(filePath) {
  if (headBoundsCache.has(filePath)) {
    return headBoundsCache.get(filePath);
  }

  const visibleBounds = getFrameVisibleBounds(filePath);
  const image = nativeImage.createFromPath(filePath);
  const size = image.getSize();
  if (!size.width || !size.height || !visibleBounds) {
    headBoundsCache.set(filePath, visibleBounds);
    return visibleBounds;
  }

  const bitmap = image.toBitmap();
  const visibleHeight = Math.max(1, visibleBounds.bottom - visibleBounds.top + 1);
  const scanBottom = Math.min(
    visibleBounds.bottom,
    visibleBounds.top + Math.round(visibleHeight * PET_MENU_HEAD_SCAN_RATIO)
  );
  let left = size.width;
  let top = size.height;
  let right = -1;
  let bottom = -1;

  for (let y = visibleBounds.top; y <= scanBottom; y += 1) {
    for (let x = visibleBounds.left; x <= visibleBounds.right; x += 1) {
      const alpha = bitmap[(y * size.width + x) * 4 + 3];
      if (alpha > VISIBLE_ALPHA_THRESHOLD) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  const headBounds = right >= left && bottom >= top
    ? { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1, imageWidth: size.width, imageHeight: size.height }
    : visibleBounds;
  headBoundsCache.set(filePath, headBounds);
  return headBounds;
}

function getStateHeadBounds(stateId = activeState) {
  const state = getState(stateId);
  if (!state) {
    return getStateVisibleBounds(stateId);
  }
  const cacheKey = `head:${state.id}`;
  if (headBoundsCache.has(cacheKey)) {
    return headBoundsCache.get(cacheKey);
  }

  const framePaths = listFramePaths(state.folder);
  const frameBounds = framePaths.map((filePath) => getFrameHeadBounds(filePath));
  let combined = null;
  for (const bounds of frameBounds) {
    if (!bounds) {
      continue;
    }
    if (!combined) {
      combined = { ...bounds };
      continue;
    }
    combined.left = Math.min(combined.left, bounds.left);
    combined.top = Math.min(combined.top, bounds.top);
    combined.right = Math.max(combined.right, bounds.right);
    combined.bottom = Math.max(combined.bottom, bounds.bottom);
    combined.imageWidth = Math.max(combined.imageWidth, bounds.imageWidth);
    combined.imageHeight = Math.max(combined.imageHeight, bounds.imageHeight);
  }

  if (!combined) {
    combined = getStateVisibleBounds(stateId);
  } else {
    combined.width = combined.right - combined.left + 1;
    combined.height = combined.bottom - combined.top + 1;
  }
  headBoundsCache.set(cacheKey, combined);
  return combined;
}

function getStableGroundBottom(frameBounds) {
  const bottoms = frameBounds
    .filter((bounds) => bounds && Number.isFinite(bounds.bottom))
    .map((bounds) => bounds.bottom)
    .sort((left, right) => left - right);
  if (bottoms.length === 0) {
    return 0;
  }
  const index = Math.min(bottoms.length - 1, Math.floor((bottoms.length - 1) * 0.9));
  return bottoms[index];
}

function getVisibleSpriteInsets(stateId = activeState, direction = walkDirection) {
  const spriteSize = getPetSpriteSize();
  const bounds = getStateVisibleBounds(stateId);
  if (!bounds || !bounds.imageWidth || !bounds.imageHeight) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }

  const insets = {
    left: Math.round((bounds.left / bounds.imageWidth) * spriteSize),
    top: Math.round((bounds.top / bounds.imageHeight) * spriteSize),
    right: Math.round(((bounds.imageWidth - 1 - bounds.right) / bounds.imageWidth) * spriteSize),
    bottom: Math.round(((bounds.imageHeight - 1 - bounds.bottom) / bounds.imageHeight) * spriteSize)
  };
  const state = getState(stateId);
  const shouldMirror = state?.defaultFacing === "left" ? direction > 0 : direction < 0;
  return shouldMirror
    ? { ...insets, left: insets.right, right: insets.left }
    : insets;
}

function getAppPageUrl(hash) {
  return `${toFileUrl(path.join(__dirname, "..", "static", "index.html"))}#${hash}`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function randomStatDelta(min = STAT_CHANGE_MIN, max = STAT_CHANGE_MAX) {
  const floor = Math.round(Number(min) || STAT_CHANGE_MIN);
  const ceil = Math.round(Number(max) || STAT_CHANGE_MAX);
  const low = Math.min(floor, ceil);
  const high = Math.max(floor, ceil);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function getPetSpriteRect() {
  if (!petWindow || petWindow.isDestroyed()) {
    return null;
  }

  return getSpriteRectFromBounds(petWindow.getBounds());
}

function getVisiblePetRect() {
  if (!petWindow || petWindow.isDestroyed()) {
    return null;
  }

  return getVisiblePetRectFromBounds(petWindow.getBounds(), activeState, walkDirection);
}

function getCurrentPetVisualRect(stateId = activeState, direction = walkDirection) {
  if (!petWindow || petWindow.isDestroyed()) {
    return null;
  }
  return taskbarWalkRunway && isTaskbarWalkActive()
    ? getTaskbarRunwayVisualRect(stateId, direction)
    : getVisiblePetRectFromBounds(petWindow.getBounds(), stateId, direction);
}

function getCurrentPetVisualCenterX(stateId = activeState, direction = walkDirection) {
  if (!petWindow || petWindow.isDestroyed()) {
    return null;
  }
  const rect = getCurrentPetVisualRect(stateId, direction);
  return rect ? Math.round(rect.x + rect.width / 2) : null;
}

function getSpriteRectFromBounds(bounds) {
  const spriteSize = getPetSpriteSize();
  const canUseRunwayOffset = taskbarWalkRunway
    && isTaskbarWalkActive()
    && Math.round(bounds.width) === taskbarWalkRunway.windowWidth
    && Math.round(bounds.height) === taskbarWalkRunway.windowHeight;
  const horizontalInset = canUseRunwayOffset
    ? Math.max(0, Math.round(taskbarWalkRunway.spriteOffsetX))
    : getSpriteLocalXForWindowWidth(bounds.width);
  const verticalInset = Math.max(0, bounds.height - spriteSize);
  return {
    x: bounds.x + horizontalInset,
    y: bounds.y + verticalInset,
    width: spriteSize,
    height: spriteSize
  };
}

function getVisiblePetRectFromBounds(bounds, stateId = activeState, direction = walkDirection) {
  const spriteRect = getSpriteRectFromBounds(bounds);
  const insets = getVisibleSpriteInsets(stateId, direction);
  return {
    x: spriteRect.x + insets.left,
    y: spriteRect.y + insets.top,
    width: Math.max(1, spriteRect.width - insets.left - insets.right),
    height: Math.max(1, spriteRect.height - insets.top - insets.bottom)
  };
}

function getPetWindowPositionForVisibleRect(left, top, stateId = activeState, direction = walkDirection) {
  const windowWidth = getPetWindowWidth();
  const windowHeight = getPetWindowHeight();
  const spriteSize = getPetSpriteSize();
  const horizontalInset = getSpriteLocalXForWindowWidth(windowWidth);
  const verticalInset = Math.max(0, windowHeight - spriteSize);
  const visibleInsets = getVisibleSpriteInsets(stateId, direction);
  return {
    x: Math.round(left - horizontalInset - visibleInsets.left),
    y: Math.round(top - verticalInset - visibleInsets.top)
  };
}

function getGroundedVisibleTop(area, stateId = activeState, direction = walkDirection) {
  const visibleInsets = getVisibleSpriteInsets(stateId, direction);
  const visibleHeight = getPetSpriteSize() - visibleInsets.top - visibleInsets.bottom;
  return area.y + area.height - VISIBLE_BOTTOM_GAP - visibleHeight;
}

function getGroundedWindowY(area, stateId = activeState, direction = walkDirection) {
  const visibleTop = getGroundedVisibleTop(area, stateId, direction);
  const windowHeight = getPetWindowHeight();
  const spriteSize = getPetSpriteSize();
  const verticalInset = Math.max(0, windowHeight - spriteSize);
  const visibleInsets = getVisibleSpriteInsets(stateId, direction);
  return Math.round(visibleTop - verticalInset - visibleInsets.top);
}

function getOverlayWorkArea(rect) {
  if (!rect) {
    return screen.getPrimaryDisplay().workArea;
  }
  return screen.getDisplayMatching(rect).workArea;
}

function getRenderedFrameSnapshot(stateId = activeState, direction = walkDirection) {
  const frameInfo = getRenderedFrameInfo();
  if (!frameInfo || frameInfo.stateId !== stateId || !Number.isFinite(frameInfo.frameIndex)) {
    return null;
  }
  return {
    framePath: frameInfo.framePath,
    frameIndex: Math.max(0, Math.round(frameInfo.frameIndex)),
    direction: Number.isFinite(frameInfo.direction) ? frameInfo.direction : direction
  };
}

function getRenderedFrameVisibleRectFromBounds(bounds, stateId = activeState, direction = walkDirection) {
  if (!bounds) {
    return null;
  }
  if (isResolvedOverlayPetRect(bounds)) {
    return cloneRect(bounds);
  }
  const frameSnapshot = getRenderedFrameSnapshot(stateId, direction);
  if (!frameSnapshot) {
    return null;
  }
  return getFrameVisibleRectFromBounds(bounds, stateId, frameSnapshot.frameIndex, frameSnapshot.direction);
}

function getRenderedFrameHeadRectFromBounds(bounds, stateId = activeState, direction = walkDirection) {
  if (!bounds) {
    return null;
  }
  const frameSnapshot = getRenderedFrameSnapshot(stateId, direction);
  if (!frameSnapshot?.framePath) {
    return null;
  }

  const headBounds = getFrameHeadBounds(frameSnapshot.framePath);
  if (!headBounds || !headBounds.imageWidth || !headBounds.imageHeight) {
    return null;
  }

  const spriteRect = getSpriteRectFromBounds(bounds);
  const state = getState(stateId);
  const shouldMirror = state?.defaultFacing === "left" ? frameSnapshot.direction > 0 : frameSnapshot.direction < 0;
  const rawLeft = shouldMirror
    ? headBounds.imageWidth - 1 - headBounds.right
    : headBounds.left;
  const rawRight = shouldMirror
    ? headBounds.imageWidth - 1 - headBounds.left
    : headBounds.right;
  const xScale = spriteRect.width / headBounds.imageWidth;
  const yScale = spriteRect.height / headBounds.imageHeight;
  return {
    x: Math.round(spriteRect.x + rawLeft * xScale + PET_MENU_HEAD_X_OFFSET),
    y: Math.round(spriteRect.y + headBounds.top * yScale + PET_MENU_HEAD_Y_OFFSET),
    width: Math.max(1, Math.round((rawRight - rawLeft + 1) * xScale)),
    height: Math.max(1, Math.round((headBounds.bottom - headBounds.top + 1) * yScale))
  };
}

function getOverlayPlacementRect(anchorRect = null, stateId = activeState, direction = walkDirection) {
  const fullRect = anchorRect || getWindowRect(petWindow);
  if (isResolvedOverlayPetRect(fullRect)) {
    return cloneRect(fullRect);
  }
  if (fullRect) {
    const frameRect = getRenderedFrameVisibleRectFromBounds(fullRect, stateId, direction);
    if (frameRect) {
      return frameRect;
    }
    return getVisiblePetRectFromBounds(fullRect, stateId, direction);
  }
  return getVisiblePetRect() || getPetSpriteRect();
}

function getMenuHeadAnchorRect(anchorRect = null, stateId = activeState, direction = walkDirection) {
  const fullRect = anchorRect || getWindowRect(petWindow);
  if (isResolvedOverlayPetRect(fullRect)) {
    return cloneRect(fullRect);
  }
  if (!fullRect) {
    return getOverlayPlacementRect(anchorRect, stateId, direction);
  }

  const frameHeadRect = getRenderedFrameHeadRectFromBounds(fullRect, stateId, direction);
  if (frameHeadRect) {
    return frameHeadRect;
  }

  const spriteRect = getSpriteRectFromBounds(fullRect);
  const visibleBounds = getStateVisibleBounds(stateId);
  const headBounds = getStateHeadBounds(stateId) || visibleBounds;
  if (!headBounds || !headBounds.imageWidth || !headBounds.imageHeight) {
    return getOverlayPlacementRect(fullRect, stateId, direction);
  }

  const state = getState(stateId);
  const shouldMirror = state?.defaultFacing === "left" ? direction > 0 : direction < 0;
  const rawLeft = shouldMirror
    ? headBounds.imageWidth - 1 - headBounds.right
    : headBounds.left;
  const rawRight = shouldMirror
    ? headBounds.imageWidth - 1 - headBounds.left
    : headBounds.right;
  const xScale = spriteRect.width / headBounds.imageWidth;
  const yScale = spriteRect.height / headBounds.imageHeight;
  return {
    x: Math.round(spriteRect.x + rawLeft * xScale + PET_MENU_HEAD_X_OFFSET),
    y: Math.round(spriteRect.y + headBounds.top * yScale + PET_MENU_HEAD_Y_OFFSET),
    width: Math.max(1, Math.round((rawRight - rawLeft + 1) * xScale)),
    height: Math.max(1, Math.round((headBounds.bottom - headBounds.top + 1) * yScale))
  };
}

function getWindowRect(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return null;
  }
  const bounds = targetWindow.getBounds();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  };
}

function isResolvedOverlayPetRect(rect) {
  return Boolean(rect?.resolvedOverlayPetRect);
}

function markResolvedOverlayPetRect(rect) {
  if (!rect) {
    return null;
  }
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    resolvedOverlayPetRect: true
  };
}

function getTaskbarWalkOverlayPetRect() {
  if (!taskbarWalkRunway || !isTaskbarWalkActive()) {
    return null;
  }
  return markResolvedOverlayPetRect(
    getRenderedFrameVisibleRect()
      || getTaskbarRunwayVisualRect(activeState, walkDirection)
      || getCurrentPetVisualRect(activeState, walkDirection)
  );
}

function getMenuAnchorRect(anchorRect = null) {
  if (anchorRect) {
    return anchorRect;
  }
  if (menuFrozenPetRect) {
    return menuFrozenPetRect;
  }
  if (taskbarWalkRunway && isTaskbarWalkActive()) {
    return getTaskbarWalkOverlayPetRect() || getPetSpriteRect() || getVisiblePetRect();
  }
  return getWindowRect(petWindow) || getPetSpriteRect() || getVisiblePetRect();
}

function getHoverAnchorRect(anchorRect = null) {
  if (anchorRect) {
    return anchorRect;
  }
  if (hoverFrozenPetRect) {
    return hoverFrozenPetRect;
  }
  if (taskbarWalkRunway && isTaskbarWalkActive()) {
    return getTaskbarWalkOverlayPetRect() || getPetSpriteRect() || getVisiblePetRect();
  }
  return getWindowRect(petWindow) || getPetSpriteRect() || getVisiblePetRect();
}

function isInteractionPaused() {
  return interactionPauseReasons.size > 0;
}

function sendInteractionPauseState() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  petWindow.webContents.send("pet:pause-state-changed", isInteractionPaused());
}

function pauseWalkLoopClock() {
  if (!walkLoop?.endsAt || walkPausedAt) {
    return;
  }
  ({ walkLoop, pausedAt: walkPausedAt } = pauseWalkLoopClockState(walkLoop, Date.now(), walkPausedAt));
  clearWalkLoopTimer();
  sendStats();
}

function resumeWalkLoopClock() {
  if (!walkPausedAt) {
    return;
  }
  const previousEndsAt = walkLoop?.endsAt || 0;
  ({ walkLoop, pausedAt: walkPausedAt } = resumeWalkLoopClockState(walkLoop, Date.now(), walkPausedAt));
  if (walkLoop?.endsAt && walkLoop.endsAt !== previousEndsAt) {
    scheduleWalkLoopTimeout();
  } else if (walkLoop?.endsAt) {
    scheduleWalkLoopTimeout();
  }
  sendStats();
}

function addInteractionPause(reason) {
  if (!reason || interactionPauseReasons.has(reason)) {
    return;
  }
  const wasPaused = isInteractionPaused();
  interactionPauseReasons.add(reason);
  logInteractionPauseDiagnostic("pause-add", reason);
  if (!wasPaused && isInteractionPaused()) {
    pauseWalkLoopClock();
  }
  sendInteractionPauseState();
}

function removeInteractionPause(reason) {
  if (!reason || !interactionPauseReasons.delete(reason)) {
    return;
  }
  logInteractionPauseDiagnostic("pause-remove", reason);
  if (!isInteractionPaused()) {
    resumeWalkLoopClock();
  }
  sendInteractionPauseState();
}

function clearHoverIntent({ keepFrozenRect = false } = {}) {
  if (hoverIntentTimer) {
    clearTimeout(hoverIntentTimer);
    hoverIntentTimer = null;
  }
  if (!keepFrozenRect && (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible())) {
    hoverFrozenPetRect = null;
  }
  removeInteractionPause("hover-intent");
}

function expandRect(rect, padding) {
  if (!rect) {
    return null;
  }

  const safePadding = Math.max(0, Math.round(padding));
  return {
    x: Math.round(rect.x - safePadding),
    y: Math.round(rect.y - safePadding),
    width: Math.round(rect.width + safePadding * 2),
    height: Math.round(rect.height + safePadding * 2)
  };
}

function getOverlayScaleDelta() {
  return petScale - 1;
}

function getOverlayVisualGap(offset = 0, scaleFactor = 0) {
  const scaledGap = OVERLAY_BASE_GAP + getOverlayScaleDelta() * scaleFactor;
  return Math.round(clamp(scaledGap + offset, OVERLAY_GAP_MIN, OVERLAY_GAP_MAX));
}

function getScaledOverlayCollisionPadding() {
  return Math.round(clamp(
    OVERLAY_COLLISION_PADDING_BASE * petScale,
    OVERLAY_COLLISION_PADDING_MIN,
    OVERLAY_COLLISION_PADDING_MAX
  ));
}

function getScaledHoverBodyHitPadding() {
  return Math.round(clamp(
    HOVER_BODY_HIT_PADDING_BASE * petScale,
    HOVER_BODY_HIT_PADDING_MIN,
    HOVER_BODY_HIT_PADDING_MAX
  ));
}

function getHoverBodyHitPaddingForState(stateId = activeState) {
  const basePadding = getScaledHoverBodyHitPadding();
  const state = getState(stateId);
  if (!state?.moving) {
    return basePadding;
  }
  if (isTaskbarWalkActive()) {
    return Math.max(0, basePadding - 1);
  }
  // Moving states are sampled while the sprite keeps shifting, so use a
  // slightly wider tolerance to avoid hover misses between poll ticks.
  return basePadding + 2;
}

function getScaledHoverAvoidPadding() {
  return Math.max(HOVER_PANEL_AVOID_PADDING_MIN, Math.round(getPetSpriteSize() * HOVER_PANEL_AVOID_PADDING_SCALE));
}

function getOverlayVerticalOffset(offset = 0, scaleFactor = 0) {
  return Math.round(OVERLAY_VERTICAL_OFFSET + offset - getOverlayScaleDelta() * scaleFactor);
}

function getMenuVerticalLift() {
  const scaleDelta = getOverlayScaleDelta();
  const scaleAdjustment = scaleDelta >= 0
    ? scaleDelta * PET_MENU_SCALE_UP_VERTICAL_FACTOR
    : scaleDelta * PET_MENU_SCALE_DOWN_VERTICAL_FACTOR;
  return Math.round(clamp(
    PET_MENU_BASE_VERTICAL_LIFT + scaleAdjustment + PET_MENU_VERTICAL_OFFSET,
    PET_MENU_VERTICAL_LIFT_MIN,
    PET_MENU_VERTICAL_LIFT_MAX
  ));
}

function getHoverHitRect() {
  const rect = hoverFrozenPetRect
    ? getOverlayPlacementRect(hoverFrozenPetRect)
    : getRenderedFrameVisibleRect() || getVisiblePetRect();
  return expandRect(rect, getHoverBodyHitPaddingForState());
}

function getCurrentPetHitRect() {
  if (!petWindow || petWindow.isDestroyed()) {
    return null;
  }
  return expandRect(getRenderedFrameVisibleRect() || getVisiblePetRect(), getHoverBodyHitPaddingForState());
}

function getOverlayAvoidRect(anchorRect = null) {
  const rect = getOverlayPlacementRect(anchorRect);
  return expandRect(rect, getScaledOverlayCollisionPadding());
}

function getHoverAvoidRect(anchorRect = null) {
  const rect = getOverlayPlacementRect(anchorRect);
  return expandRect(rect, getScaledHoverAvoidPadding());
}

function isCursorInsidePetVisibleRect() {
  const point = screen.getCursorScreenPoint();
  const frameInfo = getRenderedFrameInfo();
  const fallbackHit = isPointInsideRect(point, getHoverHitRect()) || isPointInsideRect(point, getCurrentPetHitRect());
  if (frameInfo.framePath && getFramePixelData(frameInfo.framePath)) {
    return isPointInsideRenderedFrame(point, frameInfo) || fallbackHit;
  }

  return fallbackHit;
}

function isPointInsideRenderedFrame(point, frameInfo = null) {
  if (!petWindow || petWindow.isDestroyed() || !point) {
    return false;
  }

  const safeFrameInfo = frameInfo || getRenderedFrameInfo();
  if (!safeFrameInfo.framePath) {
    return false;
  }

  const pixelData = getFramePixelData(safeFrameInfo.framePath);
  if (!pixelData) {
    return false;
  }

  const spriteLeft = taskbarWalkRunway && isTaskbarWalkActive()
    ? getTaskbarRunwaySpriteLeftForRect(safeFrameInfo.stateId, safeFrameInfo.direction)
    : null;
  const spriteRect = Number.isFinite(spriteLeft)
    ? {
      x: Math.round(spriteLeft),
      y: Math.round(taskbarWalkRunway.windowY + getPetWindowHeight() - getPetSpriteSize()),
      width: getPetSpriteSize(),
      height: getPetSpriteSize()
    }
    : getSpriteRectFromBounds(petWindow.getBounds());
  const hitPadding = getHoverBodyHitPaddingForState(safeFrameInfo.stateId);
  if (!isPointInsideRect(point, expandRect(spriteRect, hitPadding))) {
    return false;
  }

  const state = getState(safeFrameInfo.stateId);
  const shouldMirror = state?.defaultFacing === "left" ? safeFrameInfo.direction > 0 : safeFrameInfo.direction < 0;
  const localX = (point.x - spriteRect.x) / spriteRect.width;
  const localY = (point.y - spriteRect.y) / spriteRect.height;
  const imageX = clamp(
    Math.round((shouldMirror ? 1 - localX : localX) * (pixelData.width - 1)),
    0,
    pixelData.width - 1
  );
  const imageY = clamp(
    Math.round(localY * (pixelData.height - 1)),
    0,
    pixelData.height - 1
  );
  const radius = hitPadding;
  const pixelRadius = Math.max(0, Math.ceil((radius / Math.max(1, spriteRect.width)) * pixelData.width));

  for (let y = Math.max(0, imageY - pixelRadius); y <= Math.min(pixelData.height - 1, imageY + pixelRadius); y += 1) {
    for (let x = Math.max(0, imageX - pixelRadius); x <= Math.min(pixelData.width - 1, imageX + pixelRadius); x += 1) {
      const alpha = pixelData.bitmap[(y * pixelData.width + x) * 4 + 3];
      if (alpha > VISIBLE_ALPHA_THRESHOLD) {
        return true;
      }
    }
  }

  return false;
}

function freezeHoverPetRect() {
  hoverFrozenPetRect = getHoverAnchorRect(null);
  return hoverFrozenPetRect;
}

function freezeMenuPetRect() {
  menuFrozenPetRect = getMenuAnchorRect(null);
  return menuFrozenPetRect;
}

function normalizeBounds(bounds, width, height) {
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width,
    height
  };
}

function boundsAreEqual(left, right) {
  return Boolean(left && right)
    && left.x === right.x
    && left.y === right.y
    && left.width === right.width
    && left.height === right.height;
}

function setFixedWindowBounds(targetWindow, bounds, width, height, cacheKey) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  const nextBounds = normalizeBounds(bounds, width, height);
  const lastBounds = cacheKey === "menu" ? lastMenuBounds : lastHoverBounds;
  if (boundsAreEqual(lastBounds, nextBounds)) {
    return;
  }

  targetWindow.setBounds(nextBounds, false);
  if (cacheKey === "menu") {
    lastMenuBounds = nextBounds;
  } else {
    lastHoverBounds = nextBounds;
  }
}

function setPetWindowPosition(x, y) {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  petWindow.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: getPetWindowWidth(),
    height: getPetWindowHeight()
  }, false);
  repositionStartupBubbleWindow();
}

function clampPetWindowPosition(x, y) {
  const windowWidth = getPetWindowWidth();
  const windowHeight = getPetWindowHeight();
  const pointRect = {
    x: Math.round(x),
    y: Math.round(y),
    width: windowWidth,
    height: windowHeight
  };
  const area = screen.getDisplayMatching(pointRect).workArea;
  const visibleRect = getVisiblePetRectFromBounds(pointRect);
  const minX = x + area.x + VISIBLE_SIDE_GAP - visibleRect.x;
  const maxX = x + area.x + area.width - VISIBLE_SIDE_GAP - (visibleRect.x + visibleRect.width);
  const minY = y + area.y + VISIBLE_TOP_GAP - visibleRect.y;
  const maxY = y + area.y + area.height - VISIBLE_BOTTOM_GAP - (visibleRect.y + visibleRect.height);
  return {
    x: clamp(Math.round(x), Math.round(minX), Math.round(maxX)),
    y: clamp(Math.round(y), Math.round(minY), Math.round(maxY))
  };
}

function clampPetWindowPositionForState(x, y, stateId = activeState, direction = walkDirection) {
  const windowWidth = getPetWindowWidth();
  const windowHeight = getPetWindowHeight();
  const pointRect = {
    x: Math.round(x),
    y: Math.round(y),
    width: windowWidth,
    height: windowHeight
  };
  const area = screen.getDisplayMatching(pointRect).workArea;
  const visibleRect = getVisiblePetRectFromBounds(pointRect, stateId, direction);
  const minX = x + area.x + VISIBLE_SIDE_GAP - visibleRect.x;
  const maxX = x + area.x + area.width - VISIBLE_SIDE_GAP - (visibleRect.x + visibleRect.width);
  const minY = y + area.y + VISIBLE_TOP_GAP - visibleRect.y;
  const maxY = y + area.y + area.height - VISIBLE_BOTTOM_GAP - (visibleRect.y + visibleRect.height);
  return {
    x: clamp(Math.round(x), Math.round(minX), Math.round(maxX)),
    y: clamp(Math.round(y), Math.round(minY), Math.round(maxY))
  };
}

function createPetWindow() {
  log("creating pet window");
  const iconPath = getAppIconPath();
  petWindow = new BrowserWindow({
    title: APP_DISPLAY_NAME,
    width: getPetWindowWidth(),
    height: getPetWindowHeight(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    focusable: true,
    icon: iconPath || undefined,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  petWindow.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver");
  const petPageUrl = getAppPageUrl("pet");
  petWindow.loadURL(petPageUrl).catch((error) => {
    log(`pet window load failed: ${error.stack || error.message}`);
  });
  petWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    log(`pet did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
  });
  petWindow.once("ready-to-show", () => {
    log("pet window ready-to-show");
    moveToStartPosition(false);
    petWindow.show();
    if (process.platform === "darwin") {
      moveToStartPosition(false);
    }
    sendPetState();
    showStartupBubble();
  });
}

function createStartupBubbleWindow() {
  const iconPath = getAppIconPath();
  startupBubbleWindow = new BrowserWindow({
    title: APP_DISPLAY_NAME,
    width: STARTUP_BUBBLE_DEFAULT_WIDTH,
    height: STARTUP_BUBBLE_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    focusable: false,
    icon: iconPath || undefined,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  startupBubbleWindow.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver");
  startupBubbleWindow.once("ready-to-show", () => {
    startupBubbleWindowReady = true;
    if (startupBubbleWindow?.isVisible()) {
      startupBubbleWindow.webContents.send("pet:bubble-data", {
        ...buildPetConfig(),
        message: startupBubbleWindow.__pendingMessage || null
      });
    }
  });
  startupBubbleWindow.loadURL(getAppPageUrl("bubble")).catch((error) => {
    log(`startup bubble load failed: ${error.stack || error.message}`);
  });
  startupBubbleWindow.on("closed", () => {
    startupBubbleWindow = null;
    startupBubbleWindowReady = false;
  });
}

function getStartupBubblePosition(width = STARTUP_BUBBLE_DEFAULT_WIDTH, height = STARTUP_BUBBLE_HEIGHT) {
  const bubbleWidth = clamp(Math.ceil(Number(width) || STARTUP_BUBBLE_DEFAULT_WIDTH), STARTUP_BUBBLE_MIN_WIDTH, STARTUP_BUBBLE_MAX_WIDTH);
  const bubbleHeight = Math.ceil(Number(height) || STARTUP_BUBBLE_HEIGHT);
  const petRect = getBubbleAnchorRect();
  const rawArea = getOverlayWorkArea(petRect);
  const bubbleGap = getOverlayVisualGap(STARTUP_BUBBLE_GAP_OFFSET, STARTUP_BUBBLE_SCALE_GAP_FACTOR);
  const area = getOverlaySafeArea(rawArea, bubbleGap);
  const areaRight = area.x + area.width;
  if (!petRect) {
    return clampPanelRect({
      x: area.x + Math.round((area.width - bubbleWidth) / 2),
      y: area.y,
      width: bubbleWidth,
      height: bubbleHeight
    }, area, bubbleWidth, bubbleHeight);
  }

  const avoidRect = expandRect(petRect, getScaledOverlayCollisionPadding());
  const centeredX = petRect.x + Math.round((petRect.width - bubbleWidth) / 2);
  const sideY = Math.round(petRect.y);
  const candidates = [
    {
      kind: "top",
      rect: {
        x: clamp(centeredX, area.x, areaRight - bubbleWidth),
        y: Math.round(avoidRect.y - bubbleHeight - bubbleGap),
        width: bubbleWidth,
        height: bubbleHeight
      }
    },
    {
      kind: "right",
      rect: {
        x: Math.round(avoidRect.x + avoidRect.width + bubbleGap),
        y: sideY,
        width: bubbleWidth,
        height: bubbleHeight
      }
    },
    {
      kind: "left",
      rect: {
        x: Math.round(avoidRect.x - bubbleWidth - bubbleGap),
        y: sideY,
        width: bubbleWidth,
        height: bubbleHeight
      }
    }
  ];

  for (const candidate of candidates) {
    if (rectFitsInArea(candidate.rect, area) && !rectsOverlap(candidate.rect, avoidRect)) {
      return candidate.rect;
    }
  }

  const clampedCandidates = candidates.map((candidate) => {
    const clamped = clampPanelRect(candidate.rect, area, bubbleWidth, bubbleHeight);
    return {
      ...candidate,
      rect: clamped,
      shift: Math.abs(clamped.x - candidate.rect.x) + Math.abs(clamped.y - candidate.rect.y)
    };
  });
  const nonOverlappingCandidates = clampedCandidates.filter((candidate) => !rectsOverlap(candidate.rect, avoidRect));
  if (nonOverlappingCandidates.length > 0) {
    return pickBestOverlayCandidate(nonOverlappingCandidates, candidates[0].rect, area, rawArea, Math.max(8, Math.round(bubbleGap * 0.45)));
  }

  return clampPanelRect(candidates[0].rect, area, bubbleWidth, bubbleHeight);
}

function getBubbleAnchorRect() {
  if (taskbarWalkRunway && isTaskbarWalkActive()) {
    return getTaskbarWalkOverlayPetRect() || getCurrentPetVisualRect() || getVisiblePetRect() || getPetSpriteRect();
  }
  return getRenderedFrameVisibleRect() || getVisiblePetRect() || getPetSpriteRect();
}

function resizeStartupBubble(width, height = STARTUP_BUBBLE_HEIGHT) {
  if (!startupBubbleWindow || startupBubbleWindow.isDestroyed() || !startupBubbleWindow.isVisible()) {
    return;
  }

  startupBubbleWindow.__lastWidth = width;
  startupBubbleWindow.__lastHeight = height;
  const bubbleBounds = getStartupBubblePosition(width, height);
  startupBubbleWindow.setBounds(bubbleBounds, false);
  log(`startup-bubble resize target=${bubbleBounds.x},${bubbleBounds.y},${bubbleBounds.width},${bubbleBounds.height}`);
}

function repositionStartupBubbleWindow() {
  if (!startupBubbleWindow || startupBubbleWindow.isDestroyed() || !startupBubbleWindow.isVisible()) {
    return;
  }
  const width = startupBubbleWindow.__lastWidth || startupBubbleWindow.getBounds().width;
  const height = startupBubbleWindow.__lastHeight || startupBubbleWindow.getBounds().height;
  const bubbleBounds = getStartupBubblePosition(width, height);
  startupBubbleWindow.setBounds(bubbleBounds, false);
}

function showStartupBubble() {
  showBubbleMessage(sharedGreetings[0]);
}

function showBubbleMessage(message = null, durationMs = STARTUP_BUBBLE_DURATION_MS, options = {}) {
  if (!petWindow || petWindow.isDestroyed()) {
    return false;
  }
  if (isWalkingState()) {
    pendingWalkBubbleMessage = { message, durationMs, options };
    return true;
  }
  const isMenuVisible = menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible();
  const isHoverVisible = hoverWindow && !hoverWindow.isDestroyed() && hoverWindow.isVisible();
  if (isMenuVisible || isHoverVisible) {
    if (!options.forceHideOverlays) {
      return false;
    }
    hidePetMenu();
    hideHoverPanel();
  }

  if (!startupBubbleWindow || startupBubbleWindow.isDestroyed()) {
    createStartupBubbleWindow();
  }

  startupBubbleWindow.__pendingMessage = message;
  if (Number.isFinite(options.suppressHoverMs) && options.suppressHoverMs > 0) {
    bubbleHoverSuppressedUntil = Date.now() + Math.round(options.suppressHoverMs);
  }
  const bubbleBounds = getStartupBubblePosition();
  startupBubbleWindow.setBounds(bubbleBounds, false);
  log(`startup-bubble target=${bubbleBounds.x},${bubbleBounds.y},${bubbleBounds.width},${bubbleBounds.height}`);
  startupBubbleWindow.showInactive();
  if (startupBubbleWindowReady && !startupBubbleWindow.webContents.isLoading()) {
    startupBubbleWindow.webContents.send("pet:bubble-data", {
      ...buildPetConfig(),
      message
    });
  }

  if (startupBubbleTimer) {
    clearTimeout(startupBubbleTimer);
  }
  startupBubbleHideAt = Date.now() + durationMs;
  startupBubbleTimer = setTimeout(() => {
    startupBubbleTimer = null;
    hideStartupBubble({ force: true });
    restoreHoverAfterBubbleIfNeeded();
  }, durationMs);
  return true;
}

function hideStartupBubble(options = {}) {
  if (options.force) {
    pendingWalkBubbleMessage = null;
  }
  if (!options.force && startupBubbleTimer && Date.now() < startupBubbleHideAt) {
    return;
  }
  if (startupBubbleTimer) {
    clearTimeout(startupBubbleTimer);
    startupBubbleTimer = null;
  }
  startupBubbleHideAt = 0;
  if (!startupBubbleWindow || startupBubbleWindow.isDestroyed()) {
    return;
  }
  startupBubbleWindow.hide();
}

function showPendingWalkBubbleMessage() {
  if (!pendingWalkBubbleMessage || activeState !== DEFAULT_STATE) {
    return;
  }
  const next = pendingWalkBubbleMessage;
  pendingWalkBubbleMessage = null;
  showBubbleMessage(next.message, next.durationMs, next.options);
}

function isStartupBubbleVisible() {
  return Boolean(startupBubbleWindow && !startupBubbleWindow.isDestroyed() && startupBubbleWindow.isVisible());
}

function restoreHoverAfterBubbleIfNeeded() {
  if (!petWindow || petWindow.isDestroyed() || dragState || shouldSuppressHoverPanel()) {
    return;
  }
  const isMenuVisible = menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible();
  if (isMenuVisible || !isCursorInsideHoverIntentTarget()) {
    return;
  }
  beginHoverFromPointer();
}

function getBubbleHoverSuppressionMs() {
  return Math.max(0, bubbleHoverSuppressedUntil - Date.now());
}

function getWindowDockHoverSuppressionMs() {
  return Math.max(0, windowDockHoverSuppressedUntil - Date.now());
}

function shouldSuppressHoverPanel() {
  return isStartupBubbleVisible()
    || windowDockInProgress
    || getBubbleHoverSuppressionMs() > 0
    || getWindowDockHoverSuppressionMs() > 0
    || (petRuntimeConfig.variant === "tabby" && activeState === STATE_HISS);
}

function scheduleRandomGreeting(delayMs = null) {
  if (randomGreetingTimer) {
    clearTimeout(randomGreetingTimer);
    randomGreetingTimer = null;
  }

  const delay = Number.isFinite(delayMs)
    ? delayMs
    : IDLE_GREETING_DELAY_MS;

  randomGreetingTimer = setTimeout(() => {
    randomGreetingTimer = null;
    showRandomActionGreeting();
  }, delay);
}

function showRandomActionGreeting() {
  if (!petWindow || petWindow.isDestroyed() || !petWindow.isVisible()) {
    scheduleRandomGreeting(RANDOM_GREETING_RETRY_MS);
    return;
  }
  if (dragState) {
    scheduleRandomGreeting(RANDOM_GREETING_RETRY_MS);
    return;
  }

  const now = Date.now();
  const idleElapsedMs = now - lastUserOperationAt;
  if (idleElapsedMs < IDLE_GREETING_DELAY_MS) {
    scheduleRandomGreeting(IDLE_GREETING_DELAY_MS - idleElapsedMs);
    return;
  }

  const idleGreeting = getNextIdleGreeting();
  if (showBubbleMessage(idleGreeting, STARTUP_BUBBLE_DURATION_MS, {
    forceHideOverlays: true,
    suppressHoverMs: STARTUP_BUBBLE_HOVER_LOCK_MS
  })) {
    markIdleGreetingShown();
    lastUserOperationAt = now;
    scheduleIdleGreeting();
  } else {
    scheduleRandomGreeting(RANDOM_GREETING_RETRY_MS);
  }
}

function cloneRect(rect) {
  if (!rect) {
    return null;
  }
  const cloned = {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height)
  };
  if (isResolvedOverlayPetRect(rect)) {
    cloned.resolvedOverlayPetRect = true;
  }
  return cloned;
}

function buildMenuPlacementSnapshot(anchorRect = menuAnchorRect) {
  const baseAnchorRect = cloneRect(anchorRect || getMenuAnchorRect(null));
  if (!baseAnchorRect) {
    return null;
  }

  const frameInfo = getRenderedFrameInfo();
  const snapshotState = frameInfo?.stateId || activeState;
  const snapshotDirection = Number.isFinite(frameInfo?.direction) ? frameInfo.direction : walkDirection;
  const snapshotFrameIndex = Number.isFinite(frameInfo?.frameIndex) ? Math.max(0, Math.round(frameInfo.frameIndex)) : 0;
  const frameRect = isResolvedOverlayPetRect(baseAnchorRect)
    ? baseAnchorRect
    : getFrameVisibleRectFromBounds(
      baseAnchorRect,
      snapshotState,
      snapshotFrameIndex,
      snapshotDirection
    );
  const petRect = cloneRect(frameRect || getVisiblePetRectFromBounds(baseAnchorRect, snapshotState, snapshotDirection));
  if (!petRect) {
    return null;
  }

  return {
    anchorRect: baseAnchorRect,
    petRect,
    stateId: snapshotState,
    direction: snapshotDirection,
    frameIndex: snapshotFrameIndex
  };
}

function getMenuPlacementArea(area, surface, edgeGap) {
  const safeGap = Math.max(0, Math.round(edgeGap));
  const isWindowSurface = surface?.type === "window";
  const inset = {
    left: safeGap,
    right: safeGap,
    top: safeGap,
    bottom: isWindowSurface ? safeGap : Math.max(safeGap, safeGap + 4)
  };
  const width = Math.max(1, area.width - inset.left - inset.right);
  const height = Math.max(1, area.height - inset.top - inset.bottom);
  if (width <= 36 || height <= 36) {
    return area;
  }
  return {
    x: area.x + inset.left,
    y: area.y + inset.top,
    width,
    height
  };
}

function getMenuCandidateGaps(rect, kind, petRect) {
  const horizontalGap = kind.startsWith("right")
    ? rect.x - (petRect.x + petRect.width)
    : petRect.x - (rect.x + rect.width);
  const verticalGap = kind.endsWith("up")
    ? petRect.y - (rect.y + rect.height)
    : rect.y - (petRect.y + petRect.height);
  return {
    horizontal: Math.round(horizontalGap),
    vertical: Math.round(verticalGap)
  };
}

function isMenuCandidateSpacingValid(rect, kind, petRect, minHorizontalGap, minVerticalGap) {
  const gaps = getMenuCandidateGaps(rect, kind, petRect);
  return gaps.horizontal >= minHorizontalGap && gaps.vertical >= minVerticalGap;
}

function scoreMenuCandidate(entry, petRect, minHorizontalGap, minVerticalGap, area) {
  const gaps = getMenuCandidateGaps(entry.rect, entry.kind, petRect);
  const horizontalShortfall = Math.max(0, minHorizontalGap - gaps.horizontal);
  const verticalShortfall = Math.max(0, minVerticalGap - gaps.vertical);
  const edgeDistance = getRectClosestEdgeDistance(entry.rect, area);
  const edgePenalty = edgeDistance < 8 ? (8 - edgeDistance) * 36 : 0;
  return entry.priority * 1200
    + horizontalShortfall * 120
    + verticalShortfall * 120
    + Math.max(0, entry.shift || 0) * 12
    + edgePenalty;
}

function getMenuPosition(anchorRect = menuAnchorRect, height = currentMenuHeight) {
  const snapshot = menuPlacementSnapshot
    && menuPlacementSnapshot.anchorRect
    && anchorRect
    && menuPlacementSnapshot.anchorRect.x === Math.round(anchorRect.x)
    && menuPlacementSnapshot.anchorRect.y === Math.round(anchorRect.y)
    && menuPlacementSnapshot.anchorRect.width === Math.round(anchorRect.width)
    && menuPlacementSnapshot.anchorRect.height === Math.round(anchorRect.height)
      ? menuPlacementSnapshot
      : null;
  const fullPetRect = snapshot?.anchorRect || getMenuAnchorRect(anchorRect);
  const petRect = snapshot?.petRect || getOverlayPlacementRect(fullPetRect);
  const baseGap = getOverlayVisualGap(PET_MENU_GAP_OFFSET, PET_MENU_SCALE_GAP_FACTOR);
  const horizontalGap = clamp(Math.round(baseGap * 0.95), 14, 36);
  const verticalGap = clamp(Math.round(baseGap * 0.7), 10, 28);
  const minHorizontalGap = Math.max(10, Math.round(horizontalGap * 0.78));
  const minVerticalGap = Math.max(8, Math.round(verticalGap * 0.78));
  const edgeGap = clamp(Math.round(verticalGap * 0.7), 8, 16);
  const avoidRect = expandRect(petRect, getScaledOverlayCollisionPadding());
  const surface = getCurrentSurface();
  const rawArea = getOverlayWorkArea(petRect);
  const area = getMenuPlacementArea(rawArea, surface, edgeGap);
  const menuHeight = clamp(Math.ceil(Number(height) || PET_MENU_COLLAPSED_HEIGHT), PET_MENU_MIN_HEIGHT, PET_MENU_MAX_HEIGHT);
  const candidates = [
    {
      kind: "right-up",
      x: petRect.x + petRect.width + horizontalGap,
      y: petRect.y - menuHeight - verticalGap,
      width: PET_MENU_WIDTH,
      height: menuHeight,
      priority: 0
    },
    {
      kind: "left-up",
      x: petRect.x - PET_MENU_WIDTH - horizontalGap,
      y: petRect.y - menuHeight - verticalGap,
      width: PET_MENU_WIDTH,
      height: menuHeight,
      priority: 1
    },
    {
      kind: "right-down",
      x: petRect.x + petRect.width + horizontalGap,
      y: petRect.y + petRect.height + verticalGap,
      width: PET_MENU_WIDTH,
      height: menuHeight,
      priority: 2
    },
    {
      kind: "left-down",
      x: petRect.x - PET_MENU_WIDTH - horizontalGap,
      y: petRect.y + petRect.height + verticalGap,
      width: PET_MENU_WIDTH,
      height: menuHeight,
      priority: 3
    }
  ];

  const normalizedCandidates = candidates.map((candidate) => ({
    ...candidate,
    rect: {
      x: Math.round(candidate.x),
      y: Math.round(candidate.y),
      width: PET_MENU_WIDTH,
      height: menuHeight
    }
  }));

  for (const candidate of normalizedCandidates) {
    if (!rectFitsInArea(candidate.rect, area)) {
      continue;
    }
    if (rectsOverlap(candidate.rect, avoidRect)) {
      continue;
    }
    if (!isMenuCandidateSpacingValid(candidate.rect, candidate.kind, petRect, minHorizontalGap, minVerticalGap)) {
      continue;
    }
    return candidate.rect;
  }

  const clampedCandidates = normalizedCandidates.map((candidate) => {
    const clamped = clampPanelRect(candidate.rect, area, PET_MENU_WIDTH, menuHeight);
    const shift = Math.abs(clamped.x - candidate.rect.x) + Math.abs(clamped.y - candidate.rect.y);
    return {
      ...candidate,
      rect: clamped,
      shift
    };
  });

  for (const candidate of clampedCandidates) {
    if (rectsOverlap(candidate.rect, avoidRect)) {
      continue;
    }
    if (!isMenuCandidateSpacingValid(candidate.rect, candidate.kind, petRect, minHorizontalGap, minVerticalGap)) {
      continue;
    }
    return candidate.rect;
  }

  const nonOverlappingCandidates = clampedCandidates.filter((candidate) => !rectsOverlap(candidate.rect, avoidRect));
  if (nonOverlappingCandidates.length > 0) {
    return nonOverlappingCandidates
      .map((candidate) => ({
        rect: candidate.rect,
        score: scoreMenuCandidate(candidate, petRect, minHorizontalGap, minVerticalGap, area)
      }))
      .sort((left, right) => left.score - right.score)[0].rect;
  }

  for (const candidate of candidates) {
    const forced = clampPanelRect(candidate, area, PET_MENU_WIDTH, menuHeight);
    if (!rectsOverlap(forced, avoidRect)) {
      return forced;
    }
  }

  return clampPanelRect(candidates[0], area, PET_MENU_WIDTH, menuHeight);
}

function getHoverPosition(anchorRect = hoverAnchorRect) {
  const fullPetRect = getHoverAnchorRect(anchorRect);
  const petRect = getOverlayPlacementRect(fullPetRect);
  const avoidRect = getHoverAvoidRect(fullPetRect);
  const panelGap = getOverlayVisualGap(HOVER_PANEL_GAP_OFFSET, HOVER_PANEL_SCALE_GAP_FACTOR);
  const rawArea = getOverlayWorkArea(avoidRect);
  const area = getOverlaySafeArea(rawArea, panelGap);
  const areaRight = area.x + area.width;
  const areaBottom = area.y + area.height;
  const verticalOffset = getOverlayVerticalOffset(HOVER_PANEL_VERTICAL_OFFSET);
  const centeredX = petRect.x + Math.round((petRect.width - HOVER_PANEL_WIDTH) / 2);
  const sideY = petRect.y + Math.round((petRect.height - HOVER_PANEL_HEIGHT) / 2) + verticalOffset;

  const above = {
    x: clamp(centeredX, area.x, areaRight - HOVER_PANEL_WIDTH),
    y: Math.round(avoidRect.y - HOVER_PANEL_HEIGHT - panelGap + verticalOffset),
    width: HOVER_PANEL_WIDTH,
    height: HOVER_PANEL_HEIGHT
  };
  if (above.y >= area.y && !rectsOverlap(above, avoidRect)) {
    return above;
  }

  const right = {
    x: Math.round(avoidRect.x + avoidRect.width + panelGap),
    y: clamp(sideY, area.y, areaBottom - HOVER_PANEL_HEIGHT),
    width: HOVER_PANEL_WIDTH,
    height: HOVER_PANEL_HEIGHT
  };
  if (right.x + HOVER_PANEL_WIDTH <= areaRight && !rectsOverlap(right, avoidRect)) {
    return right;
  }

  const left = {
    x: Math.round(avoidRect.x - HOVER_PANEL_WIDTH - panelGap),
    y: clamp(sideY, area.y, areaBottom - HOVER_PANEL_HEIGHT),
    width: HOVER_PANEL_WIDTH,
    height: HOVER_PANEL_HEIGHT
  };
  if (left.x >= area.x && !rectsOverlap(left, avoidRect)) {
    return left;
  }

  const below = {
    x: clamp(centeredX, area.x, areaRight - HOVER_PANEL_WIDTH),
    y: Math.round(avoidRect.y + avoidRect.height + panelGap + verticalOffset),
    width: HOVER_PANEL_WIDTH,
    height: HOVER_PANEL_HEIGHT
  };
  if (below.y + HOVER_PANEL_HEIGHT <= areaBottom && !rectsOverlap(below, avoidRect)) {
    return below;
  }

  const preferred = {
    x: Math.round(above.x),
    y: Math.round(above.y),
    width: HOVER_PANEL_WIDTH,
    height: HOVER_PANEL_HEIGHT
  };
  const fallbackCandidates = [above, right, left, below]
    .map((candidate) => {
      const rounded = {
        x: Math.round(candidate.x),
        y: Math.round(candidate.y),
        width: HOVER_PANEL_WIDTH,
        height: HOVER_PANEL_HEIGHT
      };
      const clamped = clampPanelRect(rounded, area, HOVER_PANEL_WIDTH, HOVER_PANEL_HEIGHT);
      const shift = Math.abs(clamped.x - rounded.x) + Math.abs(clamped.y - rounded.y);
      return { rect: clamped, shift };
    })
    .filter((entry) => !rectsOverlap(entry.rect, avoidRect));
  if (fallbackCandidates.length > 0) {
    return pickBestOverlayCandidate(
      fallbackCandidates,
      preferred,
      area,
      rawArea,
      Math.max(8, Math.round(panelGap * 0.45))
    );
  }

  const forcedRightX = Math.min(Math.max(avoidRect.x + avoidRect.width + panelGap, area.x), areaRight - HOVER_PANEL_WIDTH);
  const forcedLeftX = Math.max(Math.min(avoidRect.x - HOVER_PANEL_WIDTH - panelGap, areaRight - HOVER_PANEL_WIDTH), area.x);
  const forcedSide = avoidRect.x - area.x > areaRight - (avoidRect.x + avoidRect.width)
    ? { ...left, x: forcedLeftX }
    : { ...right, x: forcedRightX };
  const forcedY = avoidRect.y >= area.y + Math.round(area.height / 2)
    ? Math.max(area.y, avoidRect.y - HOVER_PANEL_HEIGHT - panelGap + verticalOffset)
    : Math.min(areaBottom - HOVER_PANEL_HEIGHT, avoidRect.y + avoidRect.height + panelGap + verticalOffset);
  return {
    x: Math.round(forcedSide.x),
    y: Math.round(forcedY),
    width: HOVER_PANEL_WIDTH,
    height: HOVER_PANEL_HEIGHT
  };
}

function repositionMenuWindow() {
  if (!menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) {
    return;
  }
  setFixedWindowBounds(menuWindow, getMenuPosition(), PET_MENU_WIDTH, currentMenuHeight, "menu");
}

function repositionHoverWindow() {
  if (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible()) {
    return;
  }
  setFixedWindowBounds(hoverWindow, getHoverPosition(), HOVER_PANEL_WIDTH, HOVER_PANEL_HEIGHT, "hover");
}

function repositionOverlays() {
  repositionMenuWindow();
  repositionHoverWindow();
  repositionStartupBubbleWindow();
}

function refreshHoverAnchorAfterScale() {
  if (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible()) {
    return;
  }

  hoverFrozenPetRect = null;
  hoverAnchorRect = freezeHoverPetRect();
  repositionHoverWindow();
}

function refreshMenuAnchorAfterScale() {
  if (!menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) {
    return;
  }

  menuFrozenPetRect = null;
  menuAnchorRect = freezeMenuPetRect();
  menuPlacementSnapshot = buildMenuPlacementSnapshot(menuAnchorRect);
  repositionMenuWindow();
}

function isPointInsideRect(point, rect) {
  if (!rect) {
    return false;
  }
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function rectsOverlap(left, right) {
  if (!left || !right) {
    return false;
  }

  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

function rectFitsInArea(rect, area) {
  return rect.x >= area.x
    && rect.y >= area.y
    && rect.x + rect.width <= area.x + area.width
    && rect.y + rect.height <= area.y + area.height;
}

function getOverlaySafeArea(area, referenceGap = OVERLAY_BASE_GAP) {
  const inset = clamp(Math.round(Math.max(8, referenceGap * 0.55)), 8, 18);
  if (area.width <= inset * 2 + 40 || area.height <= inset * 2 + 40) {
    return area;
  }
  return {
    x: area.x + inset,
    y: area.y + inset,
    width: Math.max(1, area.width - inset * 2),
    height: Math.max(1, area.height - inset * 2)
  };
}

function getRectCenter(rect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2
  };
}

function getRectCenterDistance(left, right) {
  const leftCenter = getRectCenter(left);
  const rightCenter = getRectCenter(right);
  return Math.round(Math.abs(leftCenter.x - rightCenter.x) + Math.abs(leftCenter.y - rightCenter.y));
}

function getRectClosestEdgeDistance(rect, area) {
  const leftGap = rect.x - area.x;
  const rightGap = area.x + area.width - (rect.x + rect.width);
  const topGap = rect.y - area.y;
  const bottomGap = area.y + area.height - (rect.y + rect.height);
  return Math.min(leftGap, rightGap, topGap, bottomGap);
}

function pickBestOverlayCandidate(entries, preferredRect, safeArea, rawArea, minEdgeGap = 8) {
  if (!entries || entries.length === 0) {
    return null;
  }
  return entries
    .map((entry) => {
      const centerDistance = getRectCenterDistance(entry.rect, preferredRect);
      const edgeDistance = getRectClosestEdgeDistance(entry.rect, rawArea);
      const edgePenalty = edgeDistance < minEdgeGap ? (minEdgeGap - edgeDistance) * 16 : 0;
      const clampPenalty = Math.max(0, entry.shift || 0) * 10;
      const safeAreaPenalty = rectFitsInArea(entry.rect, safeArea) ? 0 : 1200;
      return {
        rect: entry.rect,
        score: clampPenalty + centerDistance + edgePenalty + safeAreaPenalty
      };
    })
    .sort((a, b) => a.score - b.score)[0].rect;
}

function clampPanelRect(rect, area, width = rect.width, height = rect.height) {
  const maxX = area.x + Math.max(0, area.width - width);
  const maxY = area.y + Math.max(0, area.height - height);
  return {
    x: clamp(Math.round(rect.x), area.x, maxX),
    y: clamp(Math.round(rect.y), area.y, maxY),
    width,
    height
  };
}

function isCursorInsideSpriteRect() {
  const rect = getPetSpriteRect();
  if (!rect) {
    return false;
  }
  return isPointInsideRect(screen.getCursorScreenPoint(), rect);
}

function isCursorInsideCurrentPetHitRect() {
  return isPointInsideRect(screen.getCursorScreenPoint(), expandRect(getVisiblePetRect(), getHoverBodyHitPaddingForState()));
}

function isCursorInsideHoverIntentTarget() {
  if (isTaskbarWalkActive()) {
    return isPointInsideRect(screen.getCursorScreenPoint(), getCurrentPetVisualRect());
  }
  return isCursorInsideSpriteRect();
}

function isCursorInsideHoverPanel() {
  if (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible()) {
    return false;
  }
  return isPointInsideRect(screen.getCursorScreenPoint(), hoverWindow.getBounds());
}

function isCursorInsidePetForMenu() {
  const point = screen.getCursorScreenPoint();
  const padding = getOverlayVisualGap(PET_MENU_GAP_OFFSET, PET_MENU_SCALE_GAP_FACTOR);
  return isPointInsideRect(point, expandRect(getMenuAnchorRect(), padding))
    || isPointInsideRect(point, expandRect(getWindowRect(petWindow), padding));
}

function isCursorInsideMenuPanel() {
  if (!menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) {
    return false;
  }
  return isPointInsideRect(screen.getCursorScreenPoint(), menuWindow.getBounds());
}

function scheduleHidePetMenu() {
  if (menuHideTimer) {
    clearTimeout(menuHideTimer);
  }
  menuHideTimer = setTimeout(() => {
    menuHideTimer = null;
    if (isCursorInsidePetForMenu() || isPointerOverMenuPanel || isCursorInsideMenuPanel()) {
      return;
    }
    hidePetMenu();
  }, PET_MENU_HIDE_DELAY_MS);
}

function updateMenuVisibilityFromCursor() {
  if (!menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) {
    return;
  }
  if (isCursorInsidePetForMenu() || isPointerOverMenuPanel || isCursorInsideMenuPanel()) {
    if (menuHideTimer) {
      clearTimeout(menuHideTimer);
      menuHideTimer = null;
    }
    return;
  }
  if (!menuHideTimer) {
    scheduleHidePetMenu();
  }
}

function updateHoverVisibilityFromCursor() {
  updatePetWindowMousePassthrough();
  const cursorInsideSprite = isCursorInsideHoverIntentTarget();
  const menuVisible = menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible();
  if (shouldSuppressHoverPanel()) {
    return;
  }
  if (!hoverWindow || hoverWindow.isDestroyed() || !hoverWindow.isVisible()) {
    if (!dragState && !menuVisible && cursorInsideSprite && !hoverIntentTimer) {
      beginHoverFromPointer();
    } else if (!cursorInsideSprite) {
      isPointerOverPet = false;
      if (hoverIntentTimer) {
        clearHoverIntent();
      }
    }
    return;
  }
  const cursorInsideHover = isCursorInsideHoverPanel();
  if (cursorInsideSprite || isPointerOverHoverPanel || cursorInsideHover) {
    if (cursorInsideSprite) {
      isPointerOverPet = true;
    }
    if (hoverHideTimer) {
      clearTimeout(hoverHideTimer);
      hoverHideTimer = null;
    }
    return;
  }

  isPointerOverPet = false;
  if (!hoverHideTimer) {
    scheduleHideHoverPanel();
  }
}

function startHoverPolling() {
  if (hoverPollTimer) {
    return;
  }
  hoverPollTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }
    updateMenuVisibilityFromCursor();
    updateHoverVisibilityFromCursor();
  }, HOVER_POLL_INTERVAL_MS);
}

function stopHoverPolling() {
  if (!hoverPollTimer) {
    return;
  }
  clearInterval(hoverPollTimer);
  hoverPollTimer = null;
}

function createMenuWindow() {
  const iconPath = getAppIconPath();
  menuWindowReady = false;
  menuWindow = new BrowserWindow({
    title: APP_DISPLAY_NAME,
    width: PET_MENU_WIDTH,
    height: getQuickMenuHeight(),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    focusable: true,
    icon: iconPath || undefined,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  menuWindow.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver");
  menuWindow.once("ready-to-show", () => {
    menuWindowReady = true;
    if (menuWindow?.isVisible()) {
      menuWindow.webContents.send("pet:menu-data", buildPetConfig());
    }
  });
  menuWindow.loadURL(getAppPageUrl("menu")).catch((error) => {
    log(`menu window load failed: ${error.stack || error.message}`);
  });
  menuWindow.on("blur", () => {
    scheduleHidePetMenu();
  });
  menuWindow.on("closed", () => {
    removeInteractionPause("menu");
    menuWindow = null;
    menuWindowReady = false;
    lastMenuBounds = null;
    menuAnchorRect = null;
    menuFrozenPetRect = null;
    menuPlacementSnapshot = null;
    isPointerOverMenuPanel = false;
  });
}

function resizePetMenu(height) {
  if (!menuWindow || menuWindow.isDestroyed() || !menuWindow.isVisible()) {
    return;
  }
  const nextHeight = clamp(Math.ceil(Number(height) || getQuickMenuHeight()), PET_MENU_MIN_HEIGHT, PET_MENU_MAX_HEIGHT);
  currentMenuHeight = nextHeight;
  setFixedWindowBounds(menuWindow, getMenuPosition(menuAnchorRect, currentMenuHeight), PET_MENU_WIDTH, currentMenuHeight, "menu");
}

function createHoverWindow() {
  const iconPath = getAppIconPath();
  hoverWindow = new BrowserWindow({
    title: APP_DISPLAY_NAME,
    width: HOVER_PANEL_WIDTH,
    height: HOVER_PANEL_HEIGHT,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    focusable: false,
    icon: iconPath || undefined,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  });

  hoverWindow.setAlwaysOnTop(true, process.platform === "darwin" ? "floating" : "screen-saver");
  hoverWindow.once("ready-to-show", () => {
    hoverWindowReady = true;
    if (hoverWindow?.isVisible()) {
      hoverWindow.webContents.send("pet:hover-data", buildPetConfig());
    }
  });
  hoverWindow.loadURL(getAppPageUrl("hover")).catch((error) => {
    log(`hover window load failed: ${error.stack || error.message}`);
  });
  hoverWindow.on("blur", () => {
    if (!isCursorInsideHoverPanel() && !isCursorInsideSpriteRect()) {
      scheduleHideHoverPanel();
    }
  });
  hoverWindow.on("closed", () => {
    removeInteractionPause("hover");
    removeInteractionPause("hover-intent");
    hoverWindow = null;
    hoverWindowReady = false;
    lastHoverBounds = null;
    isPointerOverHoverPanel = false;
  });
}

function showPetMenu() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  refreshAutoStartCacheAsync();
  if (menuHideTimer) {
    clearTimeout(menuHideTimer);
    menuHideTimer = null;
  }
  clearHoverIntent();
  addInteractionPause("menu");
  hideStartupBubble({ force: true });
  hideHoverPanel();
  menuFrozenPetRect = freezeMenuPetRect();
  menuAnchorRect = menuFrozenPetRect;
  menuPlacementSnapshot = buildMenuPlacementSnapshot(menuAnchorRect);
  currentMenuHeight = getQuickMenuHeight();
  if (!menuWindow || menuWindow.isDestroyed()) {
    createMenuWindow();
  }

  setFixedWindowBounds(menuWindow, getMenuPosition(menuAnchorRect, currentMenuHeight), PET_MENU_WIDTH, currentMenuHeight, "menu");
  menuWindow.show();
  menuWindow.focus();
  if (menuWindowReady && !menuWindow.webContents.isLoading()) {
    menuWindow.webContents.send("pet:menu-data", buildPetConfig());
  }
}

function showHoverPanel() {
  if (!petWindow || petWindow.isDestroyed() || dragState) {
    return;
  }
  if (shouldSuppressHoverPanel()) {
    return;
  }

  clearHoverIntent({ keepFrozenRect: true });
  addInteractionPause("hover");
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = null;
  }
  hideStartupBubble();
  hidePetMenu();
  hoverAnchorRect = hoverFrozenPetRect || freezeHoverPetRect();

  if (!hoverWindow || hoverWindow.isDestroyed()) {
    createHoverWindow();
  }

  setFixedWindowBounds(hoverWindow, getHoverPosition(hoverAnchorRect), HOVER_PANEL_WIDTH, HOVER_PANEL_HEIGHT, "hover");
  hoverWindow.showInactive();
  if (hoverWindowReady && !hoverWindow.webContents.isLoading()) {
    hoverWindow.webContents.send("pet:hover-data", buildPetConfig());
  }
}

function hidePetMenu() {
  if (!menuWindow || menuWindow.isDestroyed()) {
    removeInteractionPause("menu");
    menuFrozenPetRect = null;
    return;
  }
  if (menuHideTimer) {
    clearTimeout(menuHideTimer);
    menuHideTimer = null;
  }
  menuWindow.hide();
  menuAnchorRect = null;
  menuFrozenPetRect = null;
  menuPlacementSnapshot = null;
  isPointerOverMenuPanel = false;
  currentMenuHeight = getQuickMenuHeight();
  removeInteractionPause("menu");
}

function hideHoverPanel() {
  if (!hoverWindow || hoverWindow.isDestroyed()) {
    removeInteractionPause("hover");
    removeInteractionPause("hover-intent");
    hoverFrozenPetRect = null;
    return;
  }
  hoverWindow.hide();
  hoverAnchorRect = null;
  hoverFrozenPetRect = null;
  isPointerOverHoverPanel = false;
  removeInteractionPause("hover");
  removeInteractionPause("hover-intent");
}

function scheduleHideHoverPanel() {
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer);
  }
  hoverHideTimer = setTimeout(() => {
    hoverHideTimer = null;
    if (dragState) {
      hideHoverPanel();
      return;
    }
    if (isPointerOverPet || isPointerOverHoverPanel || isCursorInsideSpriteRect() || isCursorInsideHoverPanel()) {
      return;
    }
    hideHoverPanel();
  }, HOVER_HIDE_DELAY_MS);
}

function beginHoverFromPointer() {
  if (!isCursorInsideHoverIntentTarget()) {
    isPointerOverPet = false;
    clearHoverIntent();
    return;
  }
  isPointerOverPet = true;
  if (dragState) {
    hideHoverPanel();
    return;
  }
  if (hoverWindow && !hoverWindow.isDestroyed() && hoverWindow.isVisible()) {
    if (hoverHideTimer) {
      clearTimeout(hoverHideTimer);
      hoverHideTimer = null;
    }
    return;
  }
  if (!hoverIntentTimer) {
    scheduleHoverIntent();
  }
}

function scheduleHoverIntent() {
  clearHoverIntent();
  if (dragState || shouldSuppressHoverPanel() || !isCursorInsideHoverIntentTarget()) {
    return;
  }
  const taskbarWalkIntent = isTaskbarWalkActive();
  if (!taskbarWalkIntent) {
    addInteractionPause("hover-intent");
    freezeHoverPetRect();
  }
  const menuVisible = menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible();
  if (menuVisible) {
    hoverFrozenPetRect = null;
    if (!taskbarWalkIntent) {
      removeInteractionPause("hover-intent");
    }
    return;
  }
  if (WALK_DIAGNOSTICS_ENABLED) {
    logWalkDiagnostic(`hover-intent schedule surface=${getCurrentSurface()?.type || "unknown"} activeState=${activeState} taskbarWalk=${taskbarWalkIntent}`);
  }
  const intentDelayMs = taskbarWalkIntent ? TASKBAR_WALK_HOVER_INTENT_DELAY_MS : HOVER_INTENT_DELAY_MS;
  hoverIntentTimer = setTimeout(() => {
    hoverIntentTimer = null;
    if (dragState || shouldSuppressHoverPanel() || !isCursorInsideHoverIntentTarget()) {
      hoverFrozenPetRect = null;
      if (!taskbarWalkIntent) {
        removeInteractionPause("hover-intent");
      }
      return;
    }
    const nextMenuVisible = menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible();
    if (nextMenuVisible) {
      hoverFrozenPetRect = null;
      if (!taskbarWalkIntent) {
        removeInteractionPause("hover-intent");
      }
      return;
    }
    hideStartupBubble();
    showHoverPanel();
  }, intentDelayMs);
}

function togglePetMenu() {
  if (menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible()) {
    hidePetMenu();
  } else {
    showPetMenu();
  }
}

function ensurePetWindow() {
  if (!petWindow || petWindow.isDestroyed()) {
    createPetWindow();
    return;
  }
  petWindow.show();
  sendPetState();
}

function sendPetState() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  petWindow.webContents.send("pet:state-changed", activeState);
  menuWindow?.webContents.send("pet:state-changed", activeState);
  hoverWindow?.webContents.send("pet:state-changed", activeState);
  petWindow.webContents.send("pet:direction-changed", walkDirection);
  menuWindow?.webContents.send("pet:direction-changed", walkDirection);
  hoverWindow?.webContents.send("pet:direction-changed", walkDirection);
  petWindow.webContents.send("pet:scale-changed", buildScaleSummary());
  petWindow.webContents.send("pet:eye-tracking-look", lastEyeTrackingLook);
  sendStats();
}

function sendWalkDirection() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  petWindow.webContents.send("pet:direction-changed", walkDirection);
  menuWindow?.webContents.send("pet:direction-changed", walkDirection);
  hoverWindow?.webContents.send("pet:direction-changed", walkDirection);
}

function sendDragState(isDragging) {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  petWindow.webContents.send("pet:drag-state-changed", isDragging);
}

function updateRenderedFrame(info) {
  if (!info || typeof info.state !== "string") {
    return;
  }

  if (states.some((state) => state.id === info.state)) {
    renderedFrameState = info.state;
  }
  if (Number.isFinite(info.frameIndex)) {
    renderedFrameIndex = Math.max(0, Math.round(info.frameIndex));
  }
  if (Number.isFinite(info.direction)) {
    renderedFrameDirection = info.direction >= 0 ? 1 : -1;
  }
  renderedFrameAt = Date.now();
}

function clearDragState({ notify = true, keepPause = false } = {}) {
  dragState = null;
  if (dragTimer) {
    clearInterval(dragTimer);
    dragTimer = null;
  }
  if (!keepPause) {
    removeInteractionPause("drag");
  }
  if (notify) {
    sendDragState(false);
  }
}

function setPetScale(nextScale) {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  preferredPetScale = clampPetScale(nextScale);
  writePetScalePreference();
  const previousScale = petScale;
  const clampedScale = clampPetScale(nextScale);
  if (Math.abs(previousScale - clampedScale) < 0.001) {
    petWindow.webContents.send("pet:scale-changed", buildScaleSummary());
    return;
  }

  const bounds = petWindow.getBounds();
  const surface = getCurrentSurface();
  const walkScaleAnchor = getWalkTrackAnchorForScale(bounds, surface);
  if (isWalkingState() && isTaskbarWalkActive(surface)) {
    petScale = clampedScale;
    const surfaceAfterScale = getCurrentSurface();
    if (!restoreWalkTrackAnchorAfterScale(walkScaleAnchor, surfaceAfterScale)) {
      groundPetToSurface(activeState, walkDirection, surfaceAfterScale);
    }
    petWindow.webContents.send("pet:scale-changed", buildScaleSummary());
    refreshMenuAnchorAfterScale();
    refreshHoverAnchorAfterScale();
    repositionStartupBubbleWindow();
    syncWalkTrackX();
    updatePetWindowMousePassthrough();
    scheduleWalkLoopTimeout();
    return;
  }
  const oldWidth = getPetWindowWidth();
  const anchorX = bounds.x + Math.round(oldWidth / 2);
  petScale = clampedScale;
  const newWidth = getPetWindowWidth();
  const newHeight = getPetWindowHeight();
  const groundedY = getGroundedWindowYForSurface(surface, activeState, walkDirection);
  const next = clampPetWindowPositionToSurface(anchorX - Math.round(newWidth / 2), groundedY, surface, activeState, walkDirection);
  petWindow.setBounds({
    x: next.x,
    y: next.y,
    width: newWidth,
    height: newHeight
  }, false);
  const surfaceAfterResize = getCurrentSurface();
  if (isWalkingState() && surfaceAfterResize?.type !== "window") {
    if (!restoreWalkTrackAnchorAfterScale(walkScaleAnchor, surfaceAfterResize)) {
      groundPetToSurface(activeState, walkDirection, surfaceAfterResize);
    }
  } else {
    groundPetToSurface(activeState, walkDirection, surfaceAfterResize);
  }
  petWindow.webContents.send("pet:scale-changed", buildScaleSummary());
  refreshMenuAnchorAfterScale();
  refreshHoverAnchorAfterScale();
  repositionStartupBubbleWindow();
  if (isWalkingState()) {
    syncWalkTrackX();
    scheduleWalkLoopTimeout();
  }
}

function groundPetToWorkArea(stateId = activeState, direction = walkDirection) {
  groundPetToSurface(stateId, direction, getCurrentSurface());
}

function adjustPetScale(deltaY) {
  const direction = deltaY < 0 ? 1 : -1;
  setPetScale(petScale + direction * PET_SCALE_STEP);
}

function resetPetScale() {
  setPetScale(DEFAULT_PET_SCALE);
  groundPetToSurface(activeState, walkDirection, getCurrentSurface());
}

function isScreenPoint(value) {
  return value && Number.isFinite(value.screenX) && Number.isFinite(value.screenY);
}

function isClientPoint(value) {
  return value && Number.isFinite(value.clientX) && Number.isFinite(value.clientY);
}

function getState(id) {
  return states.find((state) => state.id === id) || states.find((state) => state.id === DEFAULT_STATE);
}

function setWalkDirection(nextDirection) {
  const normalizedDirection = nextDirection >= 0 ? 1 : -1;
  if (walkDirection === normalizedDirection) {
    return;
  }
  walkDirection = normalizedDirection;
  sendWalkDirection();
}

function setState(state, shouldRecordInteraction = true) {
  if (!states.some((item) => item.id === state)) {
    return;
  }

  if (shouldRecordInteraction && TABBY_IDLE_STATES.has(state)) {
    return;
  }
  const previousState = activeState;
  const nextState = getState(state);
  const transitionAnchor = previousState !== state && !nextState?.moving
    ? getTransitionBottomAnchor(previousState, walkDirection)
    : null;
  const leavingMovingState = Boolean(getState(previousState)?.moving && !nextState?.moving);
  const leavingTaskbarWalkRunway = Boolean(taskbarWalkRunway && previousState === STATE_WALK && !nextState?.moving);
  if (leavingMovingState) {
    walkDirection = getDefaultDirectionForState(state);
  }
  if (leavingTaskbarWalkRunway) {
    materializeTaskbarWalkRunwayForState(state, walkDirection, { notifyScale: false });
    sendWalkDirection();
  }

  let statMessagesToShow = [];
  if (shouldRecordInteraction) {
    recordUserOperation();
    recordInteraction();
    if (previousState === STATE_WALK && state !== STATE_WALK) {
      applyInterruptedWalkStats();
    }
    if (shouldDelayActionStats(state)) {
      pendingActionStatsState = state;
    } else if (state === STATE_WALK) {
      pendingActionStatsState = null;
    } else {
      pendingActionStatsState = null;
      if (!(previousState === STATE_WALK && state === DEFAULT_STATE)) {
        statMessagesToShow = applyActionStats(state);
      }
    }
  }
  selectedState = state;
  activeState = state;
  if (previousState === STATE_WALK && activeState !== DEFAULT_STATE) {
    pendingWalkBubbleMessage = null;
  }
  if (petRuntimeConfig.variant === "tabby" && activeState === STATE_SLEEP) {
    hideHoverPanel();
  }
  if (getState(activeState)?.moving) {
    hideStartupBubble({ force: true });
    hidePetMenu();
    hideHoverPanel();
    resetWalkRuntime();
    startWalkLoop();
  } else {
    resetWalkRuntime();
    groundPetToSurface(activeState, walkDirection, getCurrentSurface());
    preserveBottomAnchorForState(transitionAnchor, activeState, walkDirection, getCurrentSurface());
  }
  sendPetState();
  showStatMessages(statMessagesToShow);
  showPendingWalkBubbleMessage();
}

function completeOneShotState(state) {
  if (!ONE_SHOT_STATES.has(state) || activeState !== state) {
    return;
  }
  const shouldApplyPendingStats = pendingActionStatsState === state;
  setState(petRuntimeConfig.variant === "tabby" && state === STATE_YAWN ? STATE_SLEEP : DEFAULT_STATE, false);
  if (shouldApplyPendingStats) {
    pendingActionStatsState = null;
    showStatMessages(applyActionStats(state));
  }
}

function isWalkingState() {
  return Boolean(getState(activeState)?.moving);
}

function moveToStartPosition(shouldRecordOperation = true) {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  clearDragState({ notify: true });
  hideStartupBubble({ force: true });
  hidePetMenu();
  hideHoverPanel();

  let surface = getCurrentSurface();
  if (surface.type !== "window") {
    surface = resetToTaskbarSurface();
  }
  if (!applySurfaceScale(surface, activeState, walkDirection)) {
    surface = resetToTaskbarSurface();
    applySurfaceScale(surface, activeState, walkDirection);
  }
  setCurrentSurface(surface);
  const display = getSurfaceDisplay(surface);
  const area = getSurfaceWorkArea(surface);
  homeDisplayId = display.id;
  homeWorkArea = area;
  walkDirection = -1;
  const visibleInsets = getVisibleSpriteInsets(activeState, walkDirection);
  const visibleWidth = getPetSpriteSize() - visibleInsets.left - visibleInsets.right;
  const visibleLeft = getTaskbarHomeVisibleRight(surface, activeState, walkDirection) - visibleWidth;
  const { x, y } = getPetWindowPositionForVisibleRect(visibleLeft, getSurfaceVisibleTop(surface, activeState, walkDirection), activeState, walkDirection);
  const next = clampPetWindowPositionToSurface(x, y, surface, activeState, walkDirection);
  setPetWindowPosition(next.x, next.y);
  syncWalkTrackX(next.x);
  const bounds = petWindow.getBounds();
  log(`reset-position target=${next.x},${next.y} actual=${bounds.x},${bounds.y},${bounds.width},${bounds.height} surface=${surface.type} state=${activeState}`);
  if (shouldRecordOperation) {
    recordUserOperation();
  }
  sendPetState();
}

function settlePetQuietly() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  pendingActionStatsState = null;
  clearDragState({ notify: true });
  hideStartupBubble({ force: true });
  hidePetMenu();
  hideHoverPanel();
  const surface = getCurrentSurface();
  if (surface.type === "window") {
    windowRoamSuppressedWindowId = parseWindowHwnd(surface.sourceWindowId);
    windowRoamLastTargetId = "";
    resetToTaskbarSurface(petWindow.getBounds());
  }
  resetWalkRuntime();
  selectedState = DEFAULT_STATE;
  activeState = DEFAULT_STATE;
  walkDirection = -1;
  moveToStartPosition(true);
}

function rememberHomeDisplay() {
  const display = screen.getPrimaryDisplay();
  homeDisplayId = display.id;
  homeWorkArea = display.workArea;
  currentSurface = getTaskbarSurface(display);
}

function getWalkArea() {
  if (homeDisplayId !== null) {
    const display = screen.getAllDisplays().find((item) => item.id === homeDisplayId);
    if (display) {
      homeWorkArea = display.workArea;
      return homeWorkArea;
    }
  }

  if (homeWorkArea) {
    return homeWorkArea;
  }

  homeWorkArea = screen.getPrimaryDisplay().workArea;
  return homeWorkArea;
}

function clearWalkLoopTimer() {
  if (!walkLoopTimer) {
    return;
  }
  clearTimeout(walkLoopTimer);
  walkLoopTimer = null;
}

function resetWalkRuntime({ keepLoop = false } = {}) {
  walkTrackX = null;
  taskbarWalkRunway = null;
  setPetWindowMousePassthrough(false);
  clearPetWindowHitRegion();
  lastWalkStepAt = 0;
  stalledWalkSteps = 0;
  walkMirrorCooldownSteps = 0;
  walkRightEdgeStuckSteps = 0;
  walkLeftEdgeStuckSteps = 0;
  lastWalkScaleApplyAt = 0;
  lastWalkSurfaceSignature = "";
  if (!keepLoop) {
    clearWalkLoopTimer();
    walkLoop = null;
    walkPausedAt = 0;
  }
}

function getInitialWalkDirection(surface = getCurrentSurface(), fallbackDirection = -1) {
  if (!petWindow || petWindow.isDestroyed()) {
    return fallbackDirection >= 0 ? 1 : -1;
  }

  const bounds = petWindow.getBounds();
  const limits = getWalkVisibleLimits(surface);
  const leftFacingRect = getVisiblePetRectFromBounds(bounds, STATE_WALK, -1);
  const rightFacingRect = getVisiblePetRectFromBounds(bounds, STATE_WALK, 1);
  const touchesLeft = Math.min(leftFacingRect.x, rightFacingRect.x) <= limits.left + WALK_EDGE_TOLERANCE;
  const touchesRight = Math.max(
    leftFacingRect.x + leftFacingRect.width,
    rightFacingRect.x + rightFacingRect.width
  ) >= limits.right - WALK_EDGE_TOLERANCE;
  if (touchesLeft && !touchesRight) {
    return 1;
  }
  if (touchesRight && !touchesLeft) {
    return -1;
  }
  return fallbackDirection >= 0 ? 1 : -1;
}

function alignWalkLoopToSurface(fallbackDirection = -1) {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  const surface = getCurrentSurface();
  const visualCenterX = getCurrentPetVisualCenterX(STATE_WALK, fallbackDirection);
  const nextDirection = getInitialWalkDirection(surface, fallbackDirection);
  setWalkDirection(nextDirection);
  groundPetToSurface(activeState, walkDirection, surface);
  const bounds = petWindow.getBounds();
  const groundedY = getGroundedWindowYForSurface(getCurrentSurface(), activeState, walkDirection);
  const activeSurface = getCurrentSurface();
  if (isTaskbarWalkActive(activeSurface)) {
    const centerX = Number.isFinite(visualCenterX)
      ? visualCenterX
      : (taskbarWalkRunway?.centerX
        ?? walkTrackX
        ?? getWalkVisibleCenterFromWindowX(bounds.x, groundedY, activeState, walkDirection));
    const centerLimits = getTaskbarWalkCenterLimits(activeSurface, activeState);
    const safeCenterX = clamp(centerX, centerLimits.left, centerLimits.right);
    setTaskbarWalkWindowPositionForCenter(safeCenterX, groundedY, walkDirection);
  } else {
    const safeX = getSafeWindowXForDirection(bounds.x, activeSurface, activeState, walkDirection);
    setWalkWindowPosition(safeX, groundedY, activeSurface, walkDirection);
  }
  stalledWalkSteps = 0;
}

function scheduleWalkLoopTimeout() {
  clearWalkLoopTimer();
  if (!walkLoop?.endsAt) {
    return;
  }
  if (isInteractionPaused() || walkPausedAt) {
    return;
  }
  const remainingMs = Math.max(0, walkLoop.endsAt - Date.now());
  walkLoopTimer = setTimeout(() => {
    walkLoopTimer = null;
    completeWalkLoop();
  }, remainingMs);
}

function startWalkLoop() {
  if (!petWindow || petWindow.isDestroyed()) {
    walkLoop = null;
    clearWalkLoopTimer();
    return;
  }

  resetWalkRuntime();
  const now = Date.now();
  walkLoop = {
    startedAt: now,
    endsAt: now + WALK_LOOP_DURATION_MS
  };
  walkPausedAt = 0;
  const fallbackDirection = Number.isFinite(nextWalkStartDirection)
    ? nextWalkStartDirection
    : walkDirection;
  alignWalkLoopToSurface(fallbackDirection);
  nextWalkStartDirection = null;
  if (isInteractionPaused()) {
    pauseWalkLoopClock();
  } else {
    scheduleWalkLoopTimeout();
  }
  sendStats();
}

function refreshWalkLoopAfterSurfaceChange() {
  if (!isWalkingState()) {
    resetWalkRuntime();
    return;
  }
  if (!walkLoop) {
    startWalkLoop();
    return;
  }
  resetWalkRuntime({ keepLoop: true });
  alignWalkLoopToSurface(walkDirection);
  if (isInteractionPaused()) {
    pauseWalkLoopClock();
  } else {
    scheduleWalkLoopTimeout();
  }
  sendStats();
}

function completeWalkLoop() {
  if (activeState !== STATE_WALK) {
    resetWalkRuntime();
    return;
  }

  const surface = getCurrentSurface();
  const limits = getWalkVisibleLimits(surface);
  const bounds = petWindow?.getBounds();
  if (bounds) {
    const leftFacingRect = getVisiblePetRectFromBounds(bounds, STATE_WALK, -1);
    const rightFacingRect = getVisiblePetRectFromBounds(bounds, STATE_WALK, 1);
    const nearLeftEdge = Math.min(leftFacingRect.x, rightFacingRect.x) <= limits.left + WALK_EDGE_TOLERANCE;
    const nearRightEdge = Math.max(
      leftFacingRect.x + leftFacingRect.width,
      rightFacingRect.x + rightFacingRect.width
    ) >= limits.right - WALK_EDGE_TOLERANCE;
    if (nearLeftEdge && !nearRightEdge) {
      nextWalkStartDirection = 1;
  } else if (nearRightEdge && !nearLeftEdge) {
      nextWalkStartDirection = -1;
    }
  }

  const statMessagesToShow = applyCompletedWalkStats();
  walkDirection = getDefaultDirectionForState(DEFAULT_STATE);
  materializeTaskbarWalkRunwayForState(DEFAULT_STATE, walkDirection, { notifyScale: false });
  sendWalkDirection();
  setState(DEFAULT_STATE, false);
  groundPetToSurface(activeState, walkDirection, surface);
  sendPetState();
  showStatMessages(statMessagesToShow);
}

function getWalkVisibleLimits(surface = getCurrentSurface()) {
  return {
    left: surface.left + WALK_EDGE_PADDING,
    right: surface.right - WALK_EDGE_PADDING
  };
}

function getWindowXForVisibleEdge(edge, value, stateId = activeState, direction = walkDirection) {
  const windowWidth = getPetWindowWidth();
  const windowHeight = getPetWindowHeight();
  const probe = { x: 0, y: 0, width: windowWidth, height: windowHeight };
  const visibleRect = getVisiblePetRectFromBounds(probe, stateId, direction);
  return edge === "right"
    ? Math.round(value - visibleRect.width - (visibleRect.x - probe.x))
    : Math.round(value - (visibleRect.x - probe.x));
}

function getVisibleRectFromSpriteLeft(spriteLeft, spriteTop, stateId = activeState, direction = walkDirection) {
  const insets = getVisibleSpriteInsets(stateId, direction);
  return {
    x: Math.round(spriteLeft + insets.left),
    y: Math.round(spriteTop + insets.top),
    width: Math.max(1, getPetSpriteSize() - insets.left - insets.right),
    height: Math.max(1, getPetSpriteSize() - insets.top - insets.bottom)
  };
}

function getVisibleCenterFromSpriteLeft(spriteLeft, spriteTop, stateId = activeState, direction = walkDirection) {
  const visibleRect = getVisibleRectFromSpriteLeft(spriteLeft, spriteTop, stateId, direction);
  return Math.round(visibleRect.x + visibleRect.width / 2);
}

function getSpriteLeftForVisibleCenter(centerX, stateId = activeState, direction = walkDirection) {
  const insets = getVisibleSpriteInsets(stateId, direction);
  const visibleWidth = Math.max(1, getPetSpriteSize() - insets.left - insets.right);
  return Math.round(centerX - insets.left - visibleWidth / 2);
}

function getSpriteLeftForVisibleEdge(edge, value, stateId = activeState, direction = walkDirection) {
  const insets = getVisibleSpriteInsets(stateId, direction);
  const visibleWidth = Math.max(1, getPetSpriteSize() - insets.left - insets.right);
  return edge === "right"
    ? Math.round(value - insets.left - visibleWidth)
    : Math.round(value - insets.left);
}

function getWalkVisibleRectFromWindowX(x, y, stateId = activeState, direction = walkDirection) {
  return getVisiblePetRectFromBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: getPetWindowWidth(),
    height: getPetWindowHeight()
  }, stateId, direction);
}

function getWalkVisibleCenterFromWindowX(x, y, stateId = activeState, direction = walkDirection) {
  const visibleRect = getWalkVisibleRectFromWindowX(x, y, stateId, direction);
  return Math.round(visibleRect.x + visibleRect.width / 2);
}

function getWindowXForVisibleCenter(centerX, stateId = activeState, direction = walkDirection) {
  const windowWidth = getPetWindowWidth();
  const windowHeight = getPetWindowHeight();
  const probe = { x: 0, y: 0, width: windowWidth, height: windowHeight };
  const visibleRect = getVisiblePetRectFromBounds(probe, stateId, direction);
  return Math.round(centerX - (visibleRect.x - probe.x) - visibleRect.width / 2);
}

function getTaskbarWalkCenterLimits(surface = getCurrentSurface(), stateId = activeState) {
  const limits = getWalkVisibleLimits(surface);
  const leftInsets = getVisibleSpriteInsets(stateId, -1);
  const rightInsets = getVisibleSpriteInsets(stateId, 1);
  const leftVisibleWidth = Math.max(1, getPetSpriteSize() - leftInsets.left - leftInsets.right);
  const rightVisibleWidth = Math.max(1, getPetSpriteSize() - rightInsets.left - rightInsets.right);
  const halfWidth = Math.max(leftVisibleWidth, rightVisibleWidth) / 2;
  const left = Math.ceil(limits.left + halfWidth);
  const right = Math.floor(limits.right - halfWidth);
  if (left > right) {
    const center = Math.round((limits.left + limits.right) / 2);
    return { left: center, right: center };
  }
  return { left, right };
}

function buildTaskbarRunwayLayout(centerX, y, direction = walkDirection, surface = getCurrentSurface()) {
  const windowWidth = getTaskbarWalkRunwayWindowWidth(surface);
  const windowHeight = getPetWindowHeight();
  const padding = getTaskbarWalkRunwayPadding();
  const recenterPadding = Math.max(1, Math.round(padding * TASKBAR_WALK_RUNWAY_RECENTER_RATIO));
  const centerLimits = getTaskbarWalkCenterLimits(surface, activeState);
  const safeCenterX = clamp(Math.round(centerX), centerLimits.left, centerLimits.right);
  const spriteLeft = getSpriteLeftForVisibleCenter(safeCenterX, activeState, direction);
  const area = getSurfaceWorkArea(surface);
  const windowX = Math.round(area.x - getTaskbarWalkRunwayScreenBuffer());
  const spriteOffsetX = Math.round(spriteLeft - windowX);
  return {
    windowX,
    windowY: Math.round(y),
    windowWidth,
    windowHeight,
    spriteOffsetX,
    spriteLeft,
    centerX: safeCenterX,
    padding,
    recenterPadding
  };
}

function applyTaskbarRunwayLayout(layout, { force = false, reason = "" } = {}) {
  if (!layout || !petWindow || petWindow.isDestroyed()) {
    return null;
  }
  const bounds = petWindow.getBounds();
  const nextRunway = {
    windowX: Math.round(layout.windowX),
    windowY: Math.round(layout.windowY),
    windowWidth: Math.round(layout.windowWidth),
    windowHeight: Math.round(layout.windowHeight),
    spriteOffsetX: clamp(
      Math.round(layout.spriteOffsetX),
      0,
      Math.max(0, Math.round(layout.windowWidth) - getPetSpriteSize())
    ),
    spriteLeft: Math.round(layout.spriteLeft),
    centerX: Math.round(layout.centerX),
    padding: Math.round(layout.padding),
    recenterPadding: Math.round(layout.recenterPadding)
  };
  taskbarWalkRunway = nextRunway;
  walkTrackX = nextRunway.centerX;
  const boundsChanged = force
    || bounds.x !== nextRunway.windowX
    || bounds.y !== nextRunway.windowY
    || bounds.width !== nextRunway.windowWidth
    || bounds.height !== nextRunway.windowHeight;
  if (boundsChanged) {
    petWindow.setBounds({
      x: nextRunway.windowX,
      y: nextRunway.windowY,
      width: nextRunway.windowWidth,
      height: nextRunway.windowHeight
    }, false);
    if (reason) {
      logWalkDiagnostic(`runway-recenter reason=${reason} windowX=${nextRunway.windowX} spriteOffsetX=${nextRunway.spriteOffsetX}`);
    }
  }
  if (boundsChanged) {
    sendScaleState();
  }
  updatePetWindowMousePassthrough();
  return nextRunway;
}

function getTaskbarRunwayVisualRect(stateId = activeState, direction = walkDirection) {
  if (!taskbarWalkRunway) {
    return null;
  }
  return getVisibleRectFromSpriteLeft(
    taskbarWalkRunway.spriteLeft,
    taskbarWalkRunway.windowY + getPetWindowHeight() - getPetSpriteSize(),
    stateId,
    direction
  );
}

function getTaskbarRunwaySpriteLeftForRect(stateId = activeState, direction = walkDirection) {
  if (!taskbarWalkRunway) {
    return null;
  }
  const visualRect = getTaskbarRunwayVisualRect(stateId, direction);
  if (!visualRect) {
    return null;
  }
  const insets = getVisibleSpriteInsets(stateId, direction);
  return Math.round(visualRect.x - insets.left);
}

function setPetWindowMousePassthrough(shouldIgnore) {
  if (!petWindow || petWindow.isDestroyed()) {
    petWindowMousePassthrough = false;
    return;
  }
  const nextValue = Boolean(shouldIgnore);
  if (petWindowMousePassthrough === nextValue) {
    return;
  }
  petWindowMousePassthrough = nextValue;
  petWindow.setIgnoreMouseEvents(nextValue, { forward: true });
}

function clearPetWindowHitRegion() {
  if (!petWindow || petWindow.isDestroyed()) {
    petWindowHitRegionKey = "";
    return;
  }
  if (typeof petWindow.setShape === "function") {
    const bounds = petWindow.getBounds();
    applyPetWindowHitRegion({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height
    });
  } else {
    petWindowHitRegionKey = "";
  }
}

function getTaskbarWalkHitRect() {
  if (!taskbarWalkRunway || !isTaskbarWalkActive() || !petWindow || petWindow.isDestroyed()) {
    return null;
  }
  const visualRect = getTaskbarRunwayVisualRect(activeState, walkDirection);
  if (!visualRect) {
    return null;
  }
  const bounds = petWindow.getBounds();
  const localX = clamp(
    Math.floor(visualRect.x - bounds.x),
    0,
    Math.max(0, bounds.width - 1)
  );
  const localY = clamp(
    Math.floor(visualRect.y - bounds.y),
    0,
    Math.max(0, bounds.height - 1)
  );
  const right = clamp(
    Math.ceil(visualRect.x + visualRect.width - bounds.x),
    localX + 1,
    bounds.width
  );
  const bottom = clamp(
    Math.ceil(visualRect.y + visualRect.height - bounds.y),
    localY + 1,
    bounds.height
  );
  return {
    x: localX,
    y: localY,
    width: Math.max(1, right - localX),
    height: Math.max(1, bottom - localY)
  };
}

function applyPetWindowHitRegion(rect) {
  if (!petWindow || petWindow.isDestroyed() || typeof petWindow.setShape !== "function") {
    return;
  }
  const shapeRect = rect
    ? {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height))
    }
    : null;
  const nextKey = shapeRect
    ? `${shapeRect.x},${shapeRect.y},${shapeRect.width},${shapeRect.height}`
    : "";
  if (petWindowHitRegionKey === nextKey) {
    return;
  }
  petWindowHitRegionKey = nextKey;
  petWindow.setShape(shapeRect ? [shapeRect] : []);
}

function updatePetWindowMousePassthrough() {
  setPetWindowMousePassthrough(false);
  if (!taskbarWalkRunway || !isTaskbarWalkActive() || dragState) {
    clearPetWindowHitRegion();
    return;
  }
  applyPetWindowHitRegion(getTaskbarWalkHitRect());
}

function materializeTaskbarWalkRunway({ stateId = activeState, direction = walkDirection, notifyScale = true } = {}) {
  if (!taskbarWalkRunway || !petWindow || petWindow.isDestroyed()) {
    return false;
  }
  const spriteLeft = getTaskbarRunwaySpriteLeftForRect(stateId, direction);
  if (!Number.isFinite(spriteLeft)) {
    taskbarWalkRunway = null;
    setPetWindowMousePassthrough(false);
    clearPetWindowHitRegion();
    return false;
  }
  const nextBounds = {
    x: Math.round(spriteLeft - getSpriteLocalXForWindowWidth(getPetWindowWidth())),
    y: Math.round(taskbarWalkRunway.windowY),
    width: getPetWindowWidth(),
    height: getPetWindowHeight()
  };
  taskbarWalkRunway = null;
  walkTrackX = null;
  setPetWindowMousePassthrough(false);
  petWindow.setBounds(nextBounds, false);
  clearPetWindowHitRegion();
  if (notifyScale) {
    sendScaleState();
  }
  return true;
}

function materializeTaskbarWalkRunwayForState(stateId, direction = getDefaultDirectionForState(stateId), { notifyScale = true } = {}) {
  if (!taskbarWalkRunway || !petWindow || petWindow.isDestroyed()) {
    return false;
  }
  const currentVisualRect = getTaskbarRunwayVisualRect(activeState, walkDirection);
  if (!currentVisualRect) {
    return materializeTaskbarWalkRunway({ stateId: activeState, direction: walkDirection, notifyScale });
  }
  const surface = getCurrentSurface();
  const centerX = currentVisualRect.x + Math.round(currentVisualRect.width / 2);
  const groundedY = getGroundedWindowYForSurface(surface, stateId, direction);
  const targetX = getWindowXForVisibleCenter(centerX, stateId, direction);
  const next = clampPetWindowPositionToSurface(targetX, groundedY, surface, stateId, direction);
  taskbarWalkRunway = null;
  walkTrackX = null;
  setPetWindowMousePassthrough(false);
  petWindow.setBounds({
    x: next.x,
    y: next.y,
    width: getPetWindowWidth(),
    height: getPetWindowHeight()
  }, false);
  clearPetWindowHitRegion();
  if (notifyScale) {
    sendScaleState();
  }
  return true;
}

function restoreTaskbarRunwayFromPoint(point, direction = walkDirection, surface = getCurrentSurface()) {
  if (!point || !isTaskbarWalkActive(surface) || !petWindow || petWindow.isDestroyed()) {
    return false;
  }
  const groundedY = getGroundedWindowYForSurface(surface, activeState, direction);
  const centerLimits = getTaskbarWalkCenterLimits(surface, activeState);
  const centerX = clamp(Math.round(point.x), centerLimits.left, centerLimits.right);
  ensureTaskbarWalkRunwayForCenter(centerX, groundedY, direction, surface, {
    force: true,
    reason: "drag-end"
  });
  sendScaleState();
  return true;
}

function ensureTaskbarWalkRunwayForCenter(centerX, y, direction = walkDirection, surface = getCurrentSurface(), { force = false, reason = "ensure" } = {}) {
  const nextDirection = direction >= 0 ? 1 : -1;
  const centerLimits = getTaskbarWalkCenterLimits(surface, activeState);
  const nextCenterX = clamp(Math.round(centerX), centerLimits.left, centerLimits.right);
  const visibleInsets = getVisibleSpriteInsets(activeState, nextDirection);
  const visibleWidth = Math.max(1, getPetSpriteSize() - visibleInsets.left - visibleInsets.right);
  const nextY = getGroundedWindowYForSurface(surface, activeState, nextDirection, nextCenterX - visibleWidth / 2, nextCenterX + visibleWidth / 2);
  const current = taskbarWalkRunway;
  const needsRecenter = force
    || !current
    || current.windowWidth !== getTaskbarWalkRunwayWindowWidth(surface)
    || current.windowHeight !== getPetWindowHeight()
    || Math.round(nextY) !== current.windowY;
  if (needsRecenter) {
    return applyTaskbarRunwayLayout(
      buildTaskbarRunwayLayout(nextCenterX, nextY, nextDirection, surface),
      { force: true, reason }
    );
  }

  const spriteLeft = getSpriteLeftForVisibleCenter(nextCenterX, activeState, nextDirection);
  taskbarWalkRunway = {
    ...current,
    spriteLeft,
    spriteOffsetX: clamp(
      Math.round(spriteLeft - current.windowX),
      0,
      Math.max(0, current.windowWidth - getPetSpriteSize())
    ),
    centerX: nextCenterX
  };
  walkTrackX = nextCenterX;
  updatePetWindowMousePassthrough();
  return taskbarWalkRunway;
}

function setTaskbarWalkRunwayForEdge(edge, value, y, direction = walkDirection, surface = getCurrentSurface()) {
  const spriteLeft = getSpriteLeftForVisibleEdge(edge, value, activeState, direction);
  const centerX = getVisibleCenterFromSpriteLeft(spriteLeft, Math.round(y), activeState, direction);
  return ensureTaskbarWalkRunwayForCenter(centerX, y, direction, surface, {
    force: true,
    reason: `${edge}-edge`
  });
}

function getSafeWindowXForDirection(x, surface = getCurrentSurface(), stateId = activeState, direction = walkDirection) {
  const limits = getWalkVisibleLimits(surface);
  const visibleRect = getWalkVisibleRectFromWindowX(x, 0, stateId, direction);
  let nextX = Math.round(x);
  if (visibleRect.x < limits.left) {
    nextX += limits.left - visibleRect.x;
  }
  if (visibleRect.x + visibleRect.width > limits.right) {
    nextX -= visibleRect.x + visibleRect.width - limits.right;
  }
  return Math.round(nextX);
}

function syncWalkTrackX(x = null) {
  if (!petWindow || petWindow.isDestroyed()) {
    walkTrackX = null;
    taskbarWalkRunway = null;
    clearPetWindowHitRegion();
    return;
  }

  const bounds = petWindow.getBounds();
  const surface = getCurrentSurface();
  const sourceX = Number.isFinite(x) ? x : bounds.x;
  if (isTaskbarWalkActive(surface)) {
    const groundedY = getGroundedWindowYForSurface(surface, activeState, walkDirection);
    const centerLimits = getTaskbarWalkCenterLimits(surface, activeState);
    const centerX = Number.isFinite(x)
      ? getWalkVisibleCenterFromWindowX(sourceX, groundedY, activeState, walkDirection)
      : taskbarWalkRunway
      ? taskbarWalkRunway.centerX
      : getWalkVisibleCenterFromWindowX(sourceX, groundedY, activeState, walkDirection);
    walkTrackX = clamp(centerX, centerLimits.left, centerLimits.right);
    return;
  }
  taskbarWalkRunway = null;
  clearPetWindowHitRegion();
  walkTrackX = getSafeWindowXForDirection(sourceX, surface, activeState, walkDirection);
}

function setWalkWindowPosition(x, y, surface = getCurrentSurface(), direction = walkDirection) {
  const nextX = getSafeWindowXForDirection(x, surface, activeState, direction);
  walkTrackX = nextX;
  petWindow.setPosition(nextX, Math.round(y), false);
  return nextX;
}

function setWalkWindowPositionDirect(x, y) {
  const nextX = Math.round(x);
  walkTrackX = nextX;
  petWindow.setPosition(nextX, Math.round(y), false);
  return nextX;
}

function setTaskbarWalkWindowPositionForCenter(centerX, y, direction = walkDirection) {
  const runway = ensureTaskbarWalkRunwayForCenter(centerX, y, direction, getCurrentSurface(), {
    force: true,
    reason: "center"
  });
  return runway?.windowX ?? petWindow.getBounds().x;
}

function setTaskbarWalkWindowPositionForEdge(edge, value, y, direction = walkDirection) {
  const runway = setTaskbarWalkRunwayForEdge(edge, value, y, direction, getCurrentSurface());
  return runway?.windowX ?? petWindow.getBounds().x;
}

function getWalkTrackAnchorForScale(bounds = petWindow?.getBounds(), surface = getCurrentSurface()) {
  if (!bounds || !isWalkingState()) {
    return null;
  }
  if (isTaskbarWalkActive(surface)) {
    const groundedY = getGroundedWindowYForSurface(surface, activeState, walkDirection);
    return {
      type: "taskbar-center",
      value: taskbarWalkRunway?.centerX
        ?? walkTrackX
        ?? getWalkVisibleCenterFromWindowX(bounds.x, groundedY, activeState, walkDirection)
    };
  }
  return {
    type: "window-center",
    value: bounds.x + Math.round(bounds.width / 2)
  };
}

function restoreWalkTrackAnchorAfterScale(anchor, surface = getCurrentSurface()) {
  if (!anchor || !petWindow || petWindow.isDestroyed() || !isWalkingState()) {
    return false;
  }
  const groundedY = getGroundedWindowYForSurface(surface, activeState, walkDirection);
  if (anchor.type === "taskbar-center" && isTaskbarWalkActive(surface)) {
    const centerLimits = getTaskbarWalkCenterLimits(surface, activeState);
    const centerX = clamp(Math.round(anchor.value), centerLimits.left, centerLimits.right);
    setTaskbarWalkWindowPositionForCenter(centerX, groundedY, walkDirection);
    return true;
  }
  const targetX = Math.round(anchor.value - getPetWindowWidth() / 2);
  setWalkWindowPosition(targetX, groundedY, surface, walkDirection);
  return true;
}

function animatePetWindowTo(targetX, targetY, durationMs = WINDOW_SURFACE_FALLBACK_BLEND_MS) {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const start = petWindow.getBounds();
  const fromX = start.x;
  const fromY = start.y;
  const toX = Math.round(targetX);
  const toY = Math.round(targetY);
  const duration = Math.max(0, Math.round(Number(durationMs) || 0));
  if (duration <= 0 || (fromX === toX && fromY === toY)) {
    setPetWindowPosition(toX, toY);
    return;
  }

  const startedAt = Date.now();
  const step = () => {
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }
    const progress = Math.min(1, (Date.now() - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const nextX = Math.round(fromX + (toX - fromX) * eased);
    const nextY = Math.round(fromY + (toY - fromY) * eased);
    setPetWindowPosition(nextX, nextY);
    if (progress < 1) {
      setTimeout(step, 16);
    }
  };
  step();
}

function buildWalkStepResult({ moved = false } = {}) {
  return {
    state: activeState,
    moving: isWalkingState(),
    direction: walkDirection,
    moved
  };
}

function logWalkStepDiagnostic(startedAt, result, detail = "") {
  if (!WALK_DIAGNOSTICS_ENABLED) {
    return;
  }
  const elapsedMs = Math.max(0, Date.now() - startedAt);
  const surface = getCurrentSurface();
  logWalkDiagnostic(`step surface=${surface?.type || "unknown"} state=${result?.state || activeState} direction=${result?.direction ?? walkDirection} paused=${Boolean(result?.paused)} completed=${Boolean(result?.completed)} moved=${Boolean(result?.moved)} elapsedMs=${elapsedMs}${detail ? ` ${detail}` : ""}`);
}

function advanceTaskbarWalkStep({
  frameStep = 0,
  stepStartedAt,
  activeSurface,
  groundedY,
  bounds
}) {
  if (walkTrackX === null) {
    syncWalkTrackX(bounds.x);
  }

  const previousCenterX = walkTrackX ?? getWalkVisibleCenterFromWindowX(bounds.x, groundedY, activeState, walkDirection);
  let nextDirection = walkDirection >= 0 ? 1 : -1;
  const visibleLimits = getWalkVisibleLimits(activeSurface);
  const centerLimits = getTaskbarWalkCenterLimits(activeSurface, activeState);
  let nextCenterX = previousCenterX + nextDirection * WALK_STEP;
  let mirroredThisStep = false;
  let edgeFlipReason = "";
  let edgeAnchor = null;

  if (nextDirection < 0 && nextCenterX <= centerLimits.left) {
    nextCenterX = centerLimits.left;
    nextDirection = 1;
    mirroredThisStep = true;
    edgeFlipReason = "left-center";
    edgeAnchor = { edge: "left", value: visibleLimits.left };
  } else if (nextDirection > 0 && nextCenterX >= centerLimits.right) {
    nextCenterX = centerLimits.right;
    nextDirection = -1;
    mirroredThisStep = true;
    edgeFlipReason = "right-center";
    edgeAnchor = { edge: "right", value: visibleLimits.right };
  }

  if (!mirroredThisStep) {
    const atLeftEdge = nextDirection < 0 && nextCenterX <= centerLimits.left;
    const atRightEdge = nextDirection > 0 && nextCenterX >= centerLimits.right;
    if (atLeftEdge) {
      walkLeftEdgeStuckSteps += 1;
      if (walkLeftEdgeStuckSteps >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
        nextCenterX = centerLimits.left;
        nextDirection = 1;
        mirroredThisStep = true;
        edgeFlipReason = "left-center-stuck";
        edgeAnchor = { edge: "left", value: visibleLimits.left };
      }
    } else {
      walkLeftEdgeStuckSteps = 0;
    }
    if (atRightEdge) {
      walkRightEdgeStuckSteps += 1;
      if (walkRightEdgeStuckSteps >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
        nextCenterX = centerLimits.right;
        nextDirection = -1;
        mirroredThisStep = true;
        edgeFlipReason = "right-center-stuck";
        edgeAnchor = { edge: "right", value: visibleLimits.right };
      }
    } else {
      walkRightEdgeStuckSteps = 0;
    }
  } else {
    walkLeftEdgeStuckSteps = 0;
    walkRightEdgeStuckSteps = 0;
  }

  if (mirroredThisStep) {
    walkMirrorCooldownSteps = 0;
  }

  nextCenterX = clamp(Math.round(nextCenterX), centerLimits.left, centerLimits.right);
  if (!mirroredThisStep && nextDirection < 0) {
    nextCenterX = Math.min(previousCenterX, nextCenterX);
  } else if (!mirroredThisStep && nextDirection > 0) {
    nextCenterX = Math.max(previousCenterX, nextCenterX);
  }
  setWalkDirection(nextDirection);
  const runway = edgeAnchor
    ? setTaskbarWalkRunwayForEdge(edgeAnchor.edge, edgeAnchor.value, groundedY, walkDirection, activeSurface)
    : ensureTaskbarWalkRunwayForCenter(nextCenterX, groundedY, walkDirection, activeSurface, {
      reason: "step"
    });
  const actualX = runway?.windowX ?? petWindow.getBounds().x;
  const actualCenterX = walkTrackX;
  stalledWalkSteps = mirroredThisStep || actualCenterX !== previousCenterX
    ? 0
    : stalledWalkSteps + 1;

  if (mirroredThisStep) {
    walkLeftEdgeStuckSteps = 0;
    walkRightEdgeStuckSteps = 0;
  }

  const result = {
    state: activeState,
    moving: true,
    direction: walkDirection,
    x: petWindow.getBounds().x,
    y: Math.round(groundedY),
    frameStep: Number.isFinite(frameStep) ? Math.round(frameStep) : 0,
    moved: actualCenterX !== previousCenterX,
    scale: buildScaleSummary()
  };
  updatePetWindowMousePassthrough();
  logWalkStepDiagnostic(stepStartedAt, result, edgeFlipReason ? `edgeFlip=${edgeFlipReason} previousCenterX=${previousCenterX} centerX=${walkTrackX} actualX=${actualX}` : `centerX=${walkTrackX}`);
  return result;
}

function advanceWalkStep(frameStep = 0, elapsedMs = 0) {
  const stepStartedAt = Date.now();
  if (!petWindow || petWindow.isDestroyed() || !isWalkingState()) {
    const result = buildWalkStepResult();
    logWalkStepDiagnostic(stepStartedAt, result, "reason=not-walking");
    return result;
  }

  if (!walkLoop) {
    startWalkLoop();
  }

  const now = stepStartedAt;
  if (walkLoop?.endsAt && now >= walkLoop.endsAt) {
    const result = {
      ...buildWalkStepResult(),
      frameStep: Number.isFinite(frameStep) ? Math.round(frameStep) : 0,
      completed: true
    };
    completeWalkLoop();
    logWalkStepDiagnostic(stepStartedAt, result, "reason=walk-loop-complete");
    return result;
  }

  if (isInteractionPaused()) {
    const result = {
      ...buildWalkStepResult(),
      paused: true
    };
    logWalkStepDiagnostic(stepStartedAt, result, `reason=paused pauseReasons=${Array.from(interactionPauseReasons).join(",")}`);
    return result;
  }

  if (lastWalkStepAt && now - lastWalkStepAt > 1200) {
    syncWalkTrackX();
    stalledWalkSteps = 0;
  }
  lastWalkStepAt = now;

  const bounds = petWindow.getBounds();
  const surface = getCurrentSurface();
  const nextSurfaceSignature = surface?.type === "window"
    ? `window:${surface.displayId}:${surface.left}:${surface.right}:${surface.groundY}`
    : `taskbar:${surface?.displayId}:${surface?.left}:${surface?.right}:${surface?.groundY}`;
  const nowForScale = Date.now();
  const scaleChanged = Math.abs(petScale - preferredPetScale) >= 0.001;
  const shouldForceSurfaceScale = lastWalkSurfaceSignature !== nextSurfaceSignature || scaleChanged;
  const shouldApplySurfaceScale = shouldForceSurfaceScale
    || !lastWalkScaleApplyAt
    || nowForScale - lastWalkScaleApplyAt >= WALK_SCALE_APPLY_THROTTLE_MS;
  let activeSurface = surface;
  if (shouldApplySurfaceScale && !applySurfaceScale(surface, activeState, walkDirection)) {
    activeSurface = resetToTaskbarSurface(bounds);
    applySurfaceScale(activeSurface, activeState, walkDirection);
  } else if (!shouldApplySurfaceScale) {
    activeSurface = getCurrentSurface();
  }
  if (shouldApplySurfaceScale) {
    lastWalkScaleApplyAt = nowForScale;
  }
  lastWalkSurfaceSignature = nextSurfaceSignature;
  const groundedY = getGroundedWindowYForSurface(activeSurface, activeState, walkDirection);
  if (activeSurface?.type !== "window") {
    return advanceTaskbarWalkStep({
      frameStep,
      stepStartedAt,
      activeSurface,
      groundedY,
      bounds
    });
  }
  if (walkTrackX === null) {
    syncWalkTrackX(bounds.x);
  }

  const previousX = walkTrackX ?? bounds.x;
  let nextDirection = walkDirection >= 0 ? 1 : -1;
  const stepDistance = WALK_STEP;
  let nextX = previousX + nextDirection * stepDistance;
  const limits = getWalkVisibleLimits(activeSurface);
  const nextVisibleRect = getWalkVisibleRectFromWindowX(nextX, groundedY, activeState, nextDirection);
  const leftMirrorThreshold = limits.left + WALK_MIRROR_HYSTERESIS_PX;
  const rightMirrorThreshold = limits.right - WALK_MIRROR_HYSTERESIS_PX;
  const cooldownActive = walkMirrorCooldownSteps > 0;
  let mirroredThisStep = false;
  const isTaskbarSurface = activeSurface?.type !== "window";
  let edgeFlipReason = "";
  let preserveRightEdgeX = false;

  if (!cooldownActive && nextDirection < 0 && nextVisibleRect.x <= leftMirrorThreshold) {
    nextDirection = 1;
    nextX = getWindowXForVisibleEdge("left", limits.left, activeState, nextDirection);
    mirroredThisStep = true;
    edgeFlipReason = "left-threshold";
  } else if (!cooldownActive && nextDirection > 0 && nextVisibleRect.x + nextVisibleRect.width >= rightMirrorThreshold) {
    nextDirection = -1;
    nextX = isTaskbarSurface
      ? getWindowXForVisibleEdge("right", limits.right, activeState, 1)
      : getWindowXForVisibleEdge("right", limits.right, activeState, nextDirection);
    preserveRightEdgeX = isTaskbarSurface;
    mirroredThisStep = true;
    edgeFlipReason = "right-threshold";
  }

  if (!mirroredThisStep && isTaskbarSurface) {
    const touchedLeftEdge = nextVisibleRect.x <= leftMirrorThreshold;
    const touchedRightEdge = nextVisibleRect.x + nextVisibleRect.width >= rightMirrorThreshold;
    if (nextDirection < 0 && touchedLeftEdge) {
      walkLeftEdgeStuckSteps += 1;
      if (walkLeftEdgeStuckSteps >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
        nextDirection = 1;
        nextX = getWindowXForVisibleEdge("left", limits.left, activeState, nextDirection);
        mirroredThisStep = true;
        edgeFlipReason = "left-stuck";
      }
    } else {
      walkLeftEdgeStuckSteps = 0;
    }
    if (nextDirection > 0 && touchedRightEdge) {
      walkRightEdgeStuckSteps += 1;
      if (walkRightEdgeStuckSteps >= WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR) {
        nextDirection = -1;
        nextX = getWindowXForVisibleEdge("right", limits.right, activeState, 1);
        preserveRightEdgeX = true;
        mirroredThisStep = true;
        edgeFlipReason = "right-stuck";
      }
    } else {
      walkRightEdgeStuckSteps = 0;
    }
  } else {
    walkLeftEdgeStuckSteps = 0;
    walkRightEdgeStuckSteps = 0;
  }

  if (cooldownActive && !mirroredThisStep) {
    walkMirrorCooldownSteps -= 1;
  }

  nextX = preserveRightEdgeX
    ? Math.max(previousX, Math.round(nextX))
    : getSafeWindowXForDirection(nextX, activeSurface, activeState, nextDirection);
  setWalkDirection(nextDirection);
  const actualX = preserveRightEdgeX
    ? setWalkWindowPositionDirect(nextX, groundedY)
    : setWalkWindowPosition(nextX, groundedY, activeSurface, walkDirection);
  if (actualX === previousX) {
    stalledWalkSteps += 1;
  } else {
    stalledWalkSteps = 0;
  }

  if (stalledWalkSteps >= 8) {
    syncWalkTrackX(actualX);
    stalledWalkSteps = 0;
  }

  if (mirroredThisStep) {
    walkMirrorCooldownSteps = WALK_MIRROR_COOLDOWN_STEPS;
    walkLeftEdgeStuckSteps = 0;
    walkRightEdgeStuckSteps = 0;
  }

  const result = {
    state: activeState,
    moving: true,
    direction: walkDirection,
    x: actualX,
    y: Math.round(groundedY),
    frameStep: Number.isFinite(frameStep) ? Math.round(frameStep) : 0,
    moved: actualX !== previousX
  };
  logWalkStepDiagnostic(stepStartedAt, result, edgeFlipReason ? `edgeFlip=${edgeFlipReason} previousX=${previousX} actualX=${actualX}` : "");
  return result;
}

function updateDragPosition() {
  if (!petWindow || petWindow.isDestroyed() || !dragState) {
    return;
  }
  if (dragState.lastPoint) {
    const now = Date.now();
    const dx = dragState.lastPoint.x - dragState.originPoint.x;
    const dy = dragState.lastPoint.y - dragState.originPoint.y;
    const dt = Math.max(1, now - dragState.lastPoint.at);
    const distance = Math.hypot(dx, dy);
    const speedPxPerSec = Math.round((distance * 1000) / dt);
    dragState.lastSample = {
      at: now,
      speedPxPerSec
    };
  }
  const point = screen.getCursorScreenPoint();
  const now = Date.now();
  if (dragState.lastPoint) {
    dragState.originPoint = dragState.lastPoint;
  }
  dragState.lastPoint = {
    x: point.x,
    y: point.y,
    at: now
  };
  const next = clampPetWindowPosition(point.x - dragState.offsetX, point.y - dragState.offsetY);
  setPetWindowPosition(next.x, next.y);
  syncWalkTrackX(next.x);
  if (ENABLE_WINDOW_DOCKING) {
    const sinceLastRefresh = now - lastWindowSurfaceAsyncRefreshAt;
    if (sinceLastRefresh >= WINDOW_SURFACE_DRAG_REFRESH_MIN_MS) {
      refreshWindowSurfaceCandidatesAsync();
    }
  }
}

function fallbackToTaskbarAfterDrag(bounds, reason = "fallback") {
  windowDockHoverSuppressedUntil = Date.now() + WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS;
  const visibleRect = getVisiblePetRectFromBounds(bounds, activeState, walkDirection);
  const surface = resetToTaskbarSurface(bounds);
  if (isWalkingState()) {
    taskbarWalkRunway = null;
    walkTrackX = null;
    applySurfaceScale(surface, activeState, walkDirection);
    const restoredRunway = restoreTaskbarRunwayFromPoint({
      x: visibleRect.x + Math.round(visibleRect.width / 2),
      y: visibleRect.y + visibleRect.height
    }, walkDirection, surface);
    if (!restoredRunway) {
      groundPetToSurface(activeState, walkDirection, surface);
    }
    scheduleWalkLoopTimeout();
  } else {
    applySurfaceScale(surface, activeState, walkDirection);
    groundPetToSurface(activeState, walkDirection, surface);
  }
  if (WINDOW_DOCK_DEBUG) {
    log(`dock-after-drag fallback reason=${reason} surface=${surface.type}`);
  }
}

function applyDockSurfaceAfterDrag(surface, draggedX) {
  const nextSurface = setCurrentSurface(surface);
  applySurfaceScale(nextSurface, activeState, walkDirection);
  groundPetToSurface(activeState, walkDirection, nextSurface);
  if (nextSurface.type === "window") {
    windowDockHoverSuppressedUntil = Date.now() + WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS;
    const snappedBounds = petWindow.getBounds();
    const target = clampPetWindowPositionToSurface(draggedX, snappedBounds.y, nextSurface, activeState, walkDirection);
    setPetWindowPosition(target.x, target.y);
    syncWalkTrackX(target.x);
    lastWindowSurfaceHeavyCheckAt = Date.now();
  }
  if (isWalkingState()) {
    refreshWalkLoopAfterSurfaceChange();
  }
  return nextSurface;
}

function shouldRetryDockAfterDrag(reason) {
  return reason === "empty-cache" || reason === "no-window-candidates";
}

function finishWindowDockAfterDrag() {
  clearDragState({ notify: true });
  windowDockInProgress = false;
  refreshWindowSurfaceCandidatesAsync();
  if (petRuntimeConfig.variant === "tabby" && activeState !== STATE_SHAKE) {
    setState(STATE_SHAKE, false);
  }
}

function dockPetAfterDrag({ retry = false } = {}) {
  if (!petWindow || petWindow.isDestroyed()) {
    finishWindowDockAfterDrag();
    return;
  }
  const bounds = petWindow.getBounds();
  const draggedX = bounds.x;
  const previousWindowId = currentSurface?.type === "window"
    ? parseWindowHwnd(currentSurface.sourceWindowId)
    : "";
  let surface = null;
  let diagnostic = { ok: false, reason: "disabled", elapsedMs: 0, surface: null };
  let retryScheduled = false;

  try {
    diagnostic = ENABLE_WINDOW_DOCKING
      ? diagnoseDockTargetFromCache(bounds)
      : { ok: false, reason: "disabled", elapsedMs: 0, surface: null };
    surface = diagnostic.surface;

    if (!surface && !retry && ENABLE_WINDOW_DOCKING && shouldRetryDockAfterDrag(diagnostic.reason)) {
      refreshWindowSurfaceCandidatesAsync({ force: true });
      retryScheduled = true;
      setTimeout(() => dockPetAfterDrag({ retry: true }), WINDOW_DOCK_DRAG_RETRY_DELAY_MS);
      return;
    }

    if (surface && applySurfaceScale(surface, activeState, walkDirection)) {
      applyDockSurfaceAfterDrag(surface, draggedX);
      windowRoamSuppressedWindowId = "";
    } else {
      if (windowRoamEnabledCache && previousWindowId) {
        windowRoamSuppressedWindowId = previousWindowId;
      }
      fallbackToTaskbarAfterDrag(bounds, diagnostic.reason || "snap-missed");
    }
  } catch (error) {
    fallbackToTaskbarAfterDrag(bounds, `dock-exception:${error.message}`);
    log(`dock-after-drag exception: ${error.stack || error.message}`);
  } finally {
    if (!retryScheduled) {
      finishWindowDockAfterDrag();
    }
  }

  if (WINDOW_DOCK_DEBUG) {
    const resolvedSurface = getCurrentSurface();
    log(`dock-after-drag reason=${diagnostic.reason} elapsedMs=${diagnostic.elapsedMs || 0} surface=${resolvedSurface.type} title=${resolvedSurface.title || ""} scale=${petScale} preferred=${preferredPetScale}`);
  }
}

function validateCurrentWindowSurface() {
  if (!currentSurface || currentSurface.type !== "window") {
    return true;
  }
  const sourceWindowId = currentSurface.sourceWindowId;
  if (!sourceWindowId) {
    return false;
  }
  const same = findCandidateByHwnd(sourceWindowId, { cacheOnly: true });
  const candidate = same || findCandidateByHwnd(sourceWindowId, { useCache: false });
  if (!candidate) {
    return false;
  }
  const built = buildWindowSurfaceFromItem(candidate);
  if (!built.surface) {
    return false;
  }
  setCurrentSurface(built.surface);
  return true;
}

function fallbackCurrentSurfaceToTaskbar(reason = "window-surface-invalidated") {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const previousBounds = petWindow.getBounds();
  const previousVisibleRect = getVisiblePetRectFromBounds(previousBounds, activeState, walkDirection);
  const previousCenterX = previousVisibleRect.x + Math.round(previousVisibleRect.width / 2);
  const fallback = resetToTaskbarSurface(previousBounds);
  applySurfaceScale(fallback, activeState, walkDirection);
  const groundedY = getGroundedWindowYForSurface(fallback, activeState, walkDirection);
  const nextBounds = petWindow.getBounds();
  const nextVisibleInsets = getVisibleSpriteInsets(activeState, walkDirection);
  const nextVisibleWidth = getPetSpriteSize() - nextVisibleInsets.left - nextVisibleInsets.right;
  const nextVisibleLeft = previousCenterX - Math.round(nextVisibleWidth / 2);
  const target = getPetWindowPositionForVisibleRect(nextVisibleLeft, getSurfaceVisibleTop(fallback, activeState, walkDirection), activeState, walkDirection);
  const next = clampPetWindowPositionToSurface(target.x, groundedY, fallback, activeState, walkDirection);
  if (isWalkingState() || (Math.abs(next.x - nextBounds.x) <= 2 && Math.abs(next.y - nextBounds.y) <= 2)) {
    setPetWindowPosition(next.x, next.y);
  } else {
    animatePetWindowTo(next.x, next.y, WINDOW_SURFACE_FALLBACK_BLEND_MS);
  }
  syncWalkTrackX(next.x);
  if (isWalkingState()) {
    refreshWalkLoopAfterSurfaceChange();
  }
  if (WINDOW_DOCK_DEBUG) {
    log(`${reason} -> fallback taskbar target=${next.x},${next.y} state=${activeState}`);
  }
  windowSurfaceMissingTicks = 0;
}

function startWindowSurfacePolling() {
  if (windowSurfacePollTimer || !ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
    return;
  }
  windowSurfacePollTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) {
      return;
    }
    if (dragState) {
      return;
    }
    if (!currentSurface || currentSurface.type !== "window") {
      return;
    }
    maybeRefreshWindowSurfaceCandidatesBackground();
    const quickValid = refreshCurrentWindowSurfaceBoundsFromCache();
    if (quickValid) {
      windowSurfaceMissingTicks = 0;
    } else {
      windowSurfaceMissingTicks += 1;
      if (windowSurfaceMissingTicks < 1) {
        return;
      }
    }
    const now = Date.now();
    if (now - lastWindowSurfaceHeavyCheckAt < WINDOW_SURFACE_HEAVY_RECHECK_MS) {
      if (quickValid) {
        return;
      }
    }
    lastWindowSurfaceHeavyCheckAt = now;
    if (!validateCurrentWindowSurface()) {
      const invalidWindowId = parseWindowHwnd(currentSurface?.sourceWindowId);
      const roamSurface = windowRoamEnabledCache ? getTopWindowRoamSurface(invalidWindowId) : null;
      if (roamSurface && attachPetToWindowRoamSurface(roamSurface)) {
        windowRoamLastTargetId = parseWindowHwnd(roamSurface.sourceWindowId);
        windowRoamSuppressedWindowId = "";
        windowRoamMissingTicks = 0;
        return;
      }
      const fallback = resetToTaskbarSurface(petWindow.getBounds());
      applySurfaceScale(fallback, activeState, walkDirection);
      groundPetToSurface(activeState, walkDirection, fallback);
      if (isWalkingState()) {
        refreshWalkLoopAfterSurfaceChange();
      }
      if (WINDOW_DOCK_DEBUG) {
        log("window-surface invalidated -> fallback taskbar");
      }
      windowSurfaceMissingTicks = 0;
    }
  }, WINDOW_SURFACE_POLL_INTERVAL_MS);
}

function stopWindowSurfacePolling() {
  if (!windowSurfacePollTimer) {
    return;
  }
  clearInterval(windowSurfacePollTimer);
  windowSurfacePollTimer = null;
}

function scheduleDarwinDisplayMetricsSettle() {
  if (dragState || !petWindow || petWindow.isDestroyed()) {
    return;
  }
  clearTimeout(displayMetricsSettleTimer);
  displayMetricsSettleTimer = setTimeout(() => {
    displayMetricsSettleTimer = null;
    if (!dragState && petWindow && !petWindow.isDestroyed()) {
      moveToStartPosition(false);
    }
  }, DARWIN_DISPLAY_METRICS_SETTLE_MS);
}

function startDragTimer() {
  if (dragTimer) {
    clearInterval(dragTimer);
  }
  updateDragPosition();
  dragTimer = setInterval(updateDragPosition, 16);
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    ensurePetWindow();
  });

  app.whenReady().then(() => {
    log("app ready");
    readPetStats();
    readAutoStartPreference();
    readWindowRoamPreference();
    readEyeTrackingPreference();
    readPetScalePreference();
    rememberHomeDisplay();
    createPetWindow();
    refreshAutoStartCacheAsync();
    startHoverPolling();
    startWindowSurfacePolling();
    updateWindowRoamPolling();
    updateEyeTrackingPolling();
    startIntimacyDecayTimer();
    scheduleIdleGreeting();
    startTabbyIdlePolling();
    if (process.platform === "darwin") {
      screen.on("display-metrics-changed", (_event, _display, metrics) => {
        if (metrics.includes("workArea")) {
          scheduleDarwinDisplayMetricsSettle();
        }
      });
    }

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createPetWindow();
      }
    });
  });
}

app.on("before-quit", () => {
  writePetStats();
  stopHoverPolling();
  stopWindowSurfacePolling();
  stopWindowRoamPolling();
  stopEyeTrackingPolling();
  stopIntimacyDecayTimer();
  clearHoverIntent();
  clearDragState({ notify: false });
  if (startupBubbleTimer) {
    clearTimeout(startupBubbleTimer);
    startupBubbleTimer = null;
  }
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = null;
  }
  if (menuHideTimer) {
    clearTimeout(menuHideTimer);
    menuHideTimer = null;
  }
  if (randomGreetingTimer) {
    clearTimeout(randomGreetingTimer);
    randomGreetingTimer = null;
  }
  if (displayMetricsSettleTimer) {
    clearTimeout(displayMetricsSettleTimer);
    displayMetricsSettleTimer = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("pet:get-config", () => buildPetConfig());
ipcMain.handle("pet:set-auto-start", (_event, enabled) => setAutoStartPreference(enabled));
ipcMain.handle("pet:toggle-auto-start", () => toggleAutoStart());
ipcMain.handle("pet:set-window-roam", (_event, enabled) => setWindowRoamPreference(enabled));
ipcMain.handle("pet:set-eye-tracking", (_event, enabled) => setEyeTrackingPreference(enabled));
ipcMain.handle("pet:switch-variant", (_event, variant) => {
  if (!SWITCHABLE_VARIANTS.includes(variant)) {
    return { success: false, error: `Cannot switch to variant: ${variant}` };
  }
  writePreferredVariant(variant);
  log(`switching variant to ${variant}, restarting app`);
  app.releaseSingleInstanceLock();
  app.relaunch();
  app.exit();
  return { success: true };
});
ipcMain.handle("pet:advance-walk-step", (_event, frameStep, elapsedMs) => advanceWalkStep(frameStep, elapsedMs));
ipcMain.on("pet:show-menu", () => {
  recordUserOperation();
  togglePetMenu();
});
ipcMain.on("pet:resize-menu", (_event, height) => {
  resizePetMenu(height);
});
ipcMain.on("pet:menu-panel-enter", () => {
  isPointerOverMenuPanel = true;
  if (menuHideTimer) {
    clearTimeout(menuHideTimer);
    menuHideTimer = null;
  }
});
ipcMain.on("pet:menu-panel-leave", () => {
  isPointerOverMenuPanel = false;
  scheduleHidePetMenu();
});
ipcMain.on("pet:resize-bubble", (_event, size) => {
  if (!size || !Number.isFinite(size.width)) {
    return;
  }
  resizeStartupBubble(size.width, size.height);
});
ipcMain.on("pet:hover-enter", () => {
  beginHoverFromPointer();
});
ipcMain.on("pet:hover-leave", () => {
  if (isCursorInsideSpriteRect()) {
    beginHoverFromPointer();
    return;
  }

  isPointerOverPet = false;
  clearHoverIntent();
  scheduleHideHoverPanel();
});
ipcMain.on("pet:hover-panel-enter", () => {
  isPointerOverHoverPanel = true;
  if (hoverHideTimer) {
    clearTimeout(hoverHideTimer);
    hoverHideTimer = null;
  }
});
ipcMain.on("pet:hover-panel-leave", () => {
  isPointerOverHoverPanel = false;
  scheduleHideHoverPanel();
});
ipcMain.on("pet:hover-action", (_event, state) => {
  if (typeof state !== "string") {
    return;
  }
  if (!states.some((item) => item.id === state)) {
    return;
  }
  setState(state);
  hideHoverPanel();
});
ipcMain.on("pet:rendered-frame", (_event, info) => {
  updateRenderedFrame(info);
});
ipcMain.on("pet:set-state", (_event, state) => {
  if (typeof state === "string") {
    setState(state);
  }
});
ipcMain.on("pet:wake-sleeping-pet", () => {
  if (petRuntimeConfig.variant !== "tabby" || activeState !== STATE_SLEEP) {
    return;
  }
  recordUserOperation();
  clearHoverIntent();
  hideHoverPanel();
  setState(STATE_HISS, false);
});
ipcMain.on("pet:complete-one-shot", (_event, state) => {
  if (typeof state === "string") {
    completeOneShotState(state);
  }
});
ipcMain.on("pet:reset-position", () => {
  recordUserOperation();
  settlePetQuietly();
});
ipcMain.on("pet:reset-scale", () => {
  recordUserOperation();
  resetPetScale();
});
ipcMain.on("pet:show", ensurePetWindow);
ipcMain.on("pet:hide", () => {
  recordUserOperation();
  petWindow?.hide();
});
ipcMain.on("pet:quit", () => app.quit());
ipcMain.on("pet:hide-menu", hidePetMenu);
ipcMain.on("pet:adjust-scale", (_event, deltaY) => {
  if (Number.isFinite(deltaY)) {
    recordUserOperation();
    adjustPetScale(deltaY);
  }
});
ipcMain.on("pet:drag-start", (_event, point) => {
  if (!petWindow || petWindow.isDestroyed() || !isScreenPoint(point)) {
    return;
  }

  if (taskbarWalkRunway) {
    materializeTaskbarWalkRunway({ stateId: activeState, direction: walkDirection });
  }
  const bounds = petWindow.getBounds();
  recordUserOperation();
  clearDragState({ notify: false });
  addInteractionPause("drag");
  clearHoverIntent();
  hideStartupBubble({ force: true });
  hidePetMenu();
  hideHoverPanel();
  isPointerOverHoverPanel = false;
  const now = Date.now();

  dragState = {
    offsetX: point.screenX - bounds.x,
    offsetY: point.screenY - bounds.y,
    originPoint: { x: point.screenX, y: point.screenY, at: now },
    lastPoint: { x: point.screenX, y: point.screenY, at: now },
    lastSample: { at: now, speedPxPerSec: 0 }
  };
  lastDragSample = dragState.lastSample;
  log(`drag-start cursor=${point.screenX},${point.screenY} bounds=${bounds.x},${bounds.y},${bounds.width},${bounds.height}`);
  sendDragState(true);
  startDragTimer();
});
ipcMain.on("pet:drag-end", () => {
  if (dragState && petWindow && !petWindow.isDestroyed()) {
    if (windowDockInProgress) {
      clearDragState({ notify: true });
      return;
    }
    windowDockInProgress = true;
    const bounds = petWindow.getBounds();
    if (dragState?.lastSample) {
      lastDragSample = dragState.lastSample;
    }
    log(`drag-end bounds=${bounds.x},${bounds.y},${bounds.width},${bounds.height}`);
    setImmediate(() => {
      dockPetAfterDrag();
    });
    clearDragState({ notify: true, keepPause: true });
    return;
  }
  clearDragState({ notify: true });
});



