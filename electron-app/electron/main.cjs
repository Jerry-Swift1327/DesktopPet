const { app, BrowserWindow, ipcMain, nativeImage, screen } = require("electron");
const { execFile, execFileSync } = require("child_process");
const crypto = require("crypto");
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
  getPetVariantProfile,
  MAC_USER_DATA_PARENT
} = require("./pet-variants.cjs");
const {
  isLikelyDesktopOrSystemWindow
} = require("./window-surface-filter.cjs");
// 从 shared 模块导入几何工具函数（12 个）
const { clamp, expandRect, cloneRect, boundsAreEqual, isPointInsideRect, rectsOverlap, rectFitsInArea, getRectCenter, getRectCenterDistance, getRectClosestEdgeDistance, normalizeBounds, isValidRect } = require("./shared/bounds.cjs");
// 从 shared 模块导入安全通信工具
const { safeSend, broadcastToWindows } = require("./shared/messaging.cjs");
// 从 pet 模块导入宠物状态构建工具
const { sharedGreetings, buildPetStates } = require("./pet/pet-states.cjs");
// overlay 窗口公共创建 helper，供 createXxxWindow 共享 BrowserWindow 创建逻辑
const { createOverlayWindow } = require("./windows/overlay-window.cjs");
// 气泡窗口控制器，管理启动气泡的创建、显示、隐藏和定位
const { createBubbleController } = require("./windows/bubble-controller.cjs");
 // 自定义面板控制器，管理联系作者面板的创建、显示、隐藏和定位
const { createCustomizationController } = require("./windows/customization-controller.cjs");
// overlay 窗口定位几何，含菜单/悬停/气泡/自定义面板的位置计算
const { createOverlayGeometry } = require("./windows/overlay-geometry.cjs");
// 菜单窗口控制器，管理快捷菜单的创建、显示、隐藏、定位和计时器
const { createMenuController } = require("./windows/menu-controller.cjs");
// 悬停面板控制器，管理悬停面板的创建、显示、隐藏、定位、轮询和可见性更新
const { createHoverController } = require("./windows/hover-controller.cjs");
const { createEyeTrackingController } = require("./behavior/eye-tracking-controller.cjs");
const { createWindowRoamController } = require("./behavior/window-roam-controller.cjs");
const { createWalkController } = require("./behavior/walk-controller.cjs");
const { createDockController } = require("./behavior/dock-controller.cjs");
const { createScreenMetricsController } = require("./platform/screen-metrics.cjs");
const { createWindowSurfaceController } = require("./platform/window-surfaces.cjs");
const { registerIpcHandlers } = require("./ipc/register-ipc-handlers.cjs");
const { registerAppLifecycle } = require("./lifecycle/register-app-lifecycle.cjs");
const { createContactQrCodeResolver } = require("./ipc/contact-qrcode.cjs");

// 应用级常量集中管理
const appConstants = require("./core/app-constants.cjs");
const { createRuntimeConfig } = require("./core/runtime-config.cjs");
const { createPreferencesStore } = require("./core/preferences-store.cjs");
const { createLogger } = require("./core/logger.cjs");
const { createAssetLoader } = require("./pet/asset-loader.cjs");
const {
  APP_INTERNAL_NAME,
  APP_DISPLAY_NAME,
  APP_ICON_FILE,
  WINDOWS_STARTUP_RUN_KEY,
  PREFERENCES_FILE,
  PREFERENCES_VERSION,
  PREFERENCES_MAGIC,
  PREFERENCES_CIPHER,
  BASE_PET_WINDOW_WIDTH,
  BASE_PET_WINDOW_HEIGHT,
  BASE_PET_SPRITE_SIZE,
  PET_SCALE_MIN,
  PET_SCALE_MAX,
  PET_SCALE_STEP,
  ENABLE_WINDOW_DOCKING,
  WINDOW_DOCK_GAP,
  WINDOW_DOCK_MIN_WIDTH,
  WINDOW_SURFACE_SIDE_GAP,
  WINDOW_DOCK_STRICT_THRESHOLD,
  WINDOW_DOCK_FAST_RELEASE_THRESHOLD,
  WINDOW_DOCK_NORMAL_HIT_SAMPLES,
  WINDOW_DOCK_FAST_HIT_SAMPLES,
  WINDOW_DOCK_POINT_OFFSETS_Y,
  WINDOW_DOCK_FAST_POINT_OFFSETS_Y,
  WINDOW_DOCK_FAST_RELEASE_SPEED_PX_PER_SEC,
  WINDOW_DOCK_FAST_RELEASE_MAX_AGE_MS,
  WINDOW_DOCK_COARSE_CORRECTION_LIMIT,
  WINDOW_DOCK_FINE_CORRECTION_LIMIT,
  WINDOW_DOCK_DRAG_RELEASE_BUDGET_MS,
  WINDOW_DOCK_DEBUG,
  STARTUP_BUBBLE_DEFAULT_WIDTH,
  STARTUP_BUBBLE_MIN_WIDTH,
  STARTUP_BUBBLE_MAX_WIDTH,
  STARTUP_BUBBLE_HEIGHT,
  STARTUP_BUBBLE_GAP_OFFSET,
  STARTUP_BUBBLE_SCALE_GAP_FACTOR,
  STARTUP_BUBBLE_DURATION_MS,
  STARTUP_BUBBLE_HOVER_LOCK_MS,
  PET_MENU_WIDTH,
  PET_MENU_COLLAPSED_HEIGHT,
  PET_MENU_MIN_HEIGHT,
  PET_MENU_MAX_HEIGHT,
  PET_MENU_PADDING_Y,
  PET_MENU_ITEM_HEIGHT,
  PET_MENU_HIDE_DELAY_MS,
  HOVER_PANEL_WIDTH,
  CUSTOMIZATION_PANEL_WIDTH,
  CUSTOMIZATION_PANEL_HEIGHT,
  HOVER_HIDE_DELAY_MS,
  HOVER_INTENT_DELAY_MS,
  TASKBAR_WALK_HOVER_INTENT_DELAY_MS,
  HOVER_POLL_INTERVAL_MS,
  WINDOW_SURFACE_POLL_INTERVAL_MS,
  WINDOW_SURFACE_HEAVY_RECHECK_MS,
  WINDOW_SURFACE_CACHE_MS,
  WINDOW_SURFACE_ASYNC_REFRESH_MIN_MS,
  WINDOW_SURFACE_DRAG_REFRESH_MIN_MS,
  WINDOW_SURFACE_BACKGROUND_REFRESH_MS,
  WINDOW_SURFACE_FALLBACK_BLEND_MS,
  WINDOW_DOCK_DRAG_RETRY_DELAY_MS,
  WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS,
  WINDOW_ROAM_POLL_INTERVAL_MS,
  WINDOW_ROAM_MAX_MISSING_TICKS,
  WINDOW_ROAM_DRAG_FALLBACK_SUPPRESS_MS,
  EYE_TRACKING_POLL_INTERVAL_MS,
  EYE_TRACKING_FRAME_NAME_PATTERN,
  DARWIN_DISPLAY_METRICS_SETTLE_MS,
  OVERLAY_BASE_GAP,
  OVERLAY_GAP_MIN,
  OVERLAY_GAP_MAX,
  OVERLAY_VERTICAL_OFFSET,
  HOVER_PANEL_GAP_OFFSET,
  HOVER_PANEL_VERTICAL_OFFSET,
  HOVER_PANEL_SCALE_GAP_FACTOR,
  PET_MENU_GAP_OFFSET,
  PET_MENU_BASE_VERTICAL_LIFT,
  PET_MENU_VERTICAL_LIFT_MIN,
  PET_MENU_VERTICAL_LIFT_MAX,
  PET_MENU_VERTICAL_OFFSET,
  PET_MENU_SCALE_GAP_FACTOR,
  PET_MENU_SCALE_UP_VERTICAL_FACTOR,
  PET_MENU_SCALE_DOWN_VERTICAL_FACTOR,
  PET_MENU_HEAD_SCAN_RATIO,
  PET_MENU_HEAD_X_OFFSET,
  PET_MENU_HEAD_Y_OFFSET,
  OVERLAY_COLLISION_PADDING_BASE,
  OVERLAY_COLLISION_PADDING_MIN,
  OVERLAY_COLLISION_PADDING_MAX,
  HOVER_BODY_HIT_PADDING_BASE,
  HOVER_BODY_HIT_PADDING_MIN,
  HOVER_BODY_HIT_PADDING_MAX,
  HOVER_PANEL_AVOID_PADDING_MIN,
  HOVER_PANEL_AVOID_PADDING_SCALE,
  RANDOM_GREETING_MIN_MS,
  RANDOM_GREETING_MAX_MS,
  RANDOM_GREETING_RETRY_MS,
  IDLE_GREETING_DELAY_MS,
  TABBY_YAWN_IDLE_MS,
  TABBY_SLEEP_POSE_MS,
  INTIMACY_DECAY_INTERVAL_MS,
  FULLNESS_DECAY_INTERVAL_MS,
  HEALTH_DECAY_INTERVAL_MS,
  HEALTH_RECOVERY_INTERVAL_MS,
  STAT_NATURAL_DELTA,
  VISIBLE_ALPHA_THRESHOLD,
  PET_STAT_MIN,
  PET_STAT_MAX,
  PET_INTIMACY_DEFAULT,
  PET_FULLNESS_DEFAULT,
  PET_HEALTH_DEFAULT,
  VISIBLE_RIGHT_GAP,
  VISIBLE_SIDE_GAP,
  VISIBLE_TOP_GAP,
  VISIBLE_BOTTOM_GAP,
  WALK_EDGE_PADDING,
  WALK_STEP,
  WALK_EDGE_TOLERANCE,
  WALK_MIRROR_HYSTERESIS_PX,
  WALK_MIRROR_COOLDOWN_STEPS,
  WALK_SCALE_APPLY_THROTTLE_MS,
  WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR,
  WALK_LOOP_DURATION_MS,
  DARWIN_BOTTOM_DOCK_WIDTH_HEIGHT_FACTOR,
  TASKBAR_WALK_RUNWAY_PADDING_MIN,
  TASKBAR_WALK_RUNWAY_PADDING_MAX,
  TASKBAR_WALK_RUNWAY_PADDING_SCALE,
  TASKBAR_WALK_RUNWAY_RECENTER_RATIO,
  TASKBAR_WALK_RUNWAY_SCREEN_BUFFER_FACTOR,
  TASKBAR_HOME_HOVER_CENTER_INSET_MIN,
  WALK_DIAGNOSTICS_ENABLED,
  INTERACTION_INTIMACY_GAIN_MIN,
  INTERACTION_INTIMACY_GAIN_MAX,
  FEED_FULLNESS_GAIN_MIN,
  FEED_FULLNESS_GAIN_MAX,
  LIE_HEALTH_GAIN,
  LICK_HEALTH_GAIN,
  BELLY_FULLNESS_COST,
  STRETCH_HEALTH_GAIN,
  STRETCH_FULLNESS_COST,
  HEALTH_RECOVERY_THRESHOLD,
  HUNGER_WARNING_THRESHOLD,
  HUNGER_CRITICAL_THRESHOLD,
  EXHAUSTED_THRESHOLD,
  HEALTH_TIRED_THRESHOLD,
  HEALTH_RECOVERED_THRESHOLD,
  FULL_PROMPT_THRESHOLD,
  CLOSE_PROMPT_THRESHOLD,
  CLOSE_PROMPT_RESET_THRESHOLD,
  HUNGER_PROMPT_CLEAR_THRESHOLD,
  FULL_PROMPT_RESET_THRESHOLD,
  HEALTH_PROMPT_CLEAR_THRESHOLD,
  DAILY_DECAY_FULLNESS,
  DAILY_DECAY_HEALTH
} = appConstants;

app.setName(APP_INTERNAL_NAME);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("disable-features", "VizDisplayCompositor");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

// 日志函数为稳定引用，供各工厂闭包捕获；实现在 logDir 确定后由 createLogger 接入
let _logger = { log: () => {}, logWalkDiagnostic: () => {} };
const log = (message) => _logger.log(message);
const logWalkDiagnostic = (message) => _logger.logWalkDiagnostic(message);

// 运行时配置：变体配置读取、首选变体持久化、用户数据目录定位
const runtimeConfig = createRuntimeConfig({
  app,
  fs,
  path,
  petVariants: {
    PET_VARIANT_CONFIG_FILE,
    PREFERRED_VARIANT_FILE,
    DEFAULT_PET_VARIANT,
    DEFAULT_PET_CHANNEL,
    SWITCHABLE_VARIANTS,
    buildPetRuntimeConfig,
    getPetUserDataFolder,
    MAC_USER_DATA_PARENT
  },
  appConstants,
  log
});
const {
  petRuntimeConfig,
  basePetVariant,
  getUserDataRoot,
  readPreferredVariant,
  writePreferredVariant,
  readPetRuntimeConfig
} = runtimeConfig;
if (process.platform === "win32") {
  app.setAppUserModelId(petRuntimeConfig.singleInstanceKey);
}

const userDataRoot = getUserDataRoot();
const variantDataRoot = path.join(userDataRoot, "variants", petRuntimeConfig.variant);
fs.mkdirSync(userDataRoot, { recursive: true });
fs.mkdirSync(variantDataRoot, { recursive: true });
fs.mkdirSync(path.join(userDataRoot, "session"), { recursive: true });
app.setPath("userData", userDataRoot);
app.setPath("sessionData", path.join(userDataRoot, "session"));

// 偏好存储：autoStart/windowRoam/eyeTracking/scale 四组偏好的读写和迁移
const preferencesStore = createPreferencesStore({
  app,
  fs,
  crypto,
  path,
  constants: { PREFERENCES_FILE, PREFERENCES_VERSION, PREFERENCES_MAGIC, PREFERENCES_CIPHER, APP_INTERNAL_NAME },
  petRuntimeConfig,
  basePetVariant,
  variantDataRoot,
  userDataRoot,
  log
});

const petActionIds = getPetActionIds();
const petAnimationPrefix = petRuntimeConfig.animationPrefix;

// 资源加载：帧列表、元数据、图标路径、眼球追踪帧
const assetLoader = createAssetLoader({
  app,
  fs,
  path,
  __dirname,
  assetsRootCache: "",
  framePathsCache: new Map(),
  APP_ICON_FILE,
  log,
  petAnimationPrefix,
  petRuntimeConfig,
  canToggleEyeTracking: preferencesStore.canToggleEyeTracking,
  EYE_TRACKING_FRAME_NAME_PATTERN,
  pathToFileURL
});
const {
  getAssetsRoot,
  listFrames,
  listFramePaths,
  listEyeTrackingFrames,
  listTabbySounds,
  readMetadata,
  getAppIconPath,
  clampFrameIndex,
  sanitizeFrameSequence
} = assetLoader;
const STATE_SQUAT = petActionIds.squat;
const STATE_WALK = petActionIds.walk;
const STATE_FEED = petActionIds.feed;
const STATE_BALL = petActionIds.ball;
const STATE_LIE = petActionIds.lie;
const STATE_SPIN = petActionIds.spin;
const STATE_LICK = petActionIds.lick;
const STATE_BELLY = petActionIds.belly;
const STATE_STRETCH = petActionIds.stretch;
const STATE_SHAKE = petActionIds.shake;
const STATE_YAWN = petActionIds.yawn;
const STATE_SLEEP = petActionIds.sleep;
const STATE_HISS = petActionIds.hiss;

const HOVER_PANEL_HEIGHT = petRuntimeConfig.channelConfig.hoverPanelHeight;
const DEFAULT_PET_SCALE = petRuntimeConfig.defaultScale;
const DEFAULT_STATE = STATE_SQUAT;
const ONE_SHOT_STATES = new Set([STATE_WALK, STATE_FEED, STATE_BALL, STATE_SPIN, STATE_LICK, STATE_BELLY, STATE_STRETCH, STATE_SHAKE, STATE_HISS]);
const TABBY_IDLE_STATES = new Set([STATE_YAWN, STATE_SLEEP, STATE_HISS]);
const gotSingleInstanceLock = app.requestSingleInstanceLock();

// sharedGreetings 已从 pet/pet-states.cjs 导入

function getActionAssetFolder(action) {
  return `animations/${petAnimationPrefix}_${action}`;
}

function getActionFrameFolder(action) {
  return `${getActionAssetFolder(action)}/transparent_frames`;
}

function getActionMetadataPath(action) {
  return `${getActionAssetFolder(action)}/loop.json`;
}

// states 已通过 buildPetStates 从 pet/pet-states.cjs 构建
// 注意：assetsRoot 传 "animations"（相对路径），与原 getActionAssetFolder 返回的 "animations/${prefix}_${action}" 一致；
// listFrames/listFramePaths/readMetadata 均通过 path.join(getAssetsRoot(), folder) 拼接，期望 folder 为相对路径。
// 任务原指示使用 getAssetsRoot() 会导致生成绝对路径且缺少 "animations" 前缀，破坏路径拼接，故改用 "animations"。
const states = buildPetStates(petActionIds, "animations", petAnimationPrefix, sharedGreetings);

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
const interactionPauseReasons = new Set();
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
let dragState = null;
let lastDragSample = null;
let homeDisplayId = null;
let homeWorkArea = null;
let petStats = null;
let petScale = DEFAULT_PET_SCALE;
let preferredPetScale = DEFAULT_PET_SCALE;
let randomGreetingTimer = null;
let tabbyIdlePollTimer = null;
let tabbySleepPoseTimer = null;
let tabbySleepPoseSwitchAt = 0;
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
let lastWindowSurfaceHeavyCheckAt = 0;
let windowSurfaceMissingTicks = 0;
let walkPausedAt = 0;
let pendingActionStatsState = null;
let lastWalkScaleApplyAt = 0;
let lastWalkSurfaceSignature = "";
let windowDockInProgress = false;
let windowDockHoverSuppressedUntil = 0;
let autoStartRefreshInFlight = false;
const statsFile = path.join(variantDataRoot, "pet-stats.json");
const legacyStatsFile = petRuntimeConfig.variant === basePetVariant ? path.join(userDataRoot, "pet-stats.json") : "";
const logDir = path.join(userDataRoot, "logs");
const visibleBoundsCache = new Map();
const headBoundsCache = new Map();
const framePixelCache = new Map();

// 接入 core/logger.cjs：文件日志与行走诊断日志
_logger = createLogger(logDir, { walkDiagnosticsEnabled: WALK_DIAGNOSTICS_ENABLED });

// 接入 windows/overlay-geometry.cjs：overlay 窗口定位几何统一收口
// state accessor 间接层：menu 状态通过延迟访问器读 menuController（之后创建）
// hover 状态读 main.cjs 本地状态；customization 状态通过延迟访问器读 customizationController
const overlayGeometry = createOverlayGeometry({
  // 全局状态访问器
  getActiveState: () => activeState,
  getWalkDirection: () => walkDirection,
  getCurrentSurface,
  getPetWindow: () => petWindow,
  getPetScale: () => petScale,
  getMenuFrozenPetRect: () => menuController ? menuController.getMenuFrozenPetRect() : null,
  getHoverFrozenPetRect: () => hoverController ? hoverController.getHoverFrozenPetRect() : null,
  getCustomizationFrozenPetRect: () => customizationController ? customizationController.getCustomizationAnchorRect() : null,
  getTaskbarWalkRunway: () => taskbarWalkRunway,
  getCurrentMenuHeight: () => menuController ? menuController.getCurrentMenuHeight() : PET_MENU_COLLAPSED_HEIGHT,
  getMenuPlacementSnapshot: () => menuController ? menuController.getMenuPlacementSnapshot() : null,
  // 缓存锚点访问器（读状态变量）
  getMenuAnchorRect: () => menuController ? menuController.getMenuAnchorRectValue() : null,
  getHoverAnchorRect: () => hoverController ? hoverController.getHoverAnchorRectValue() : null,
  getCustomizationAnchorRect: () => customizationController ? customizationController.getCustomizationAnchorRect() : null,
  // 依赖函数（main.cjs 内部实现，函数声明提升）
  getPetSpriteRect,
  getScaledOverlayCollisionPadding,
  getScaledHoverBodyHitPadding,
  getScaledHoverAvoidPadding,
  getWindowRect,
  isResolvedOverlayPetRect,
  getVisiblePetRect,
  getRenderedFrameVisibleRect,
  getRenderedFrameVisibleRectFromBounds,
  getVisiblePetRectFromBounds,
  getRenderedFrameHeadRectFromBounds,
  getSpriteRectFromBounds,
  getStateVisibleBounds,
  getStateHeadBounds,
  getState,
  getTaskbarWalkOverlayPetRect,
  isTaskbarWalkActive,
  // 纯工具函数（来自 shared/bounds.cjs）
  expandRect,
  clamp,
  rectsOverlap,
  rectFitsInArea,
  getRectClosestEdgeDistance,
  getRectCenterDistance,
  cloneRect,
  // 常量
  OVERLAY_BASE_GAP,
  OVERLAY_GAP_MIN,
  OVERLAY_GAP_MAX,
  OVERLAY_VERTICAL_OFFSET,
  PET_MENU_HEAD_X_OFFSET,
  PET_MENU_HEAD_Y_OFFSET,
  PET_MENU_SCALE_UP_VERTICAL_FACTOR,
  PET_MENU_SCALE_DOWN_VERTICAL_FACTOR,
  PET_MENU_BASE_VERTICAL_LIFT,
  PET_MENU_VERTICAL_OFFSET,
  PET_MENU_VERTICAL_LIFT_MIN,
  PET_MENU_VERTICAL_LIFT_MAX,
  PET_MENU_GAP_OFFSET,
  PET_MENU_SCALE_GAP_FACTOR,
  PET_MENU_WIDTH,
  PET_MENU_COLLAPSED_HEIGHT,
  PET_MENU_MIN_HEIGHT,
  PET_MENU_MAX_HEIGHT,
  HOVER_PANEL_GAP_OFFSET,
  HOVER_PANEL_SCALE_GAP_FACTOR,
  HOVER_PANEL_WIDTH,
  HOVER_PANEL_HEIGHT,
  HOVER_PANEL_VERTICAL_OFFSET,
  CUSTOMIZATION_PANEL_WIDTH,
  CUSTOMIZATION_PANEL_HEIGHT
});
const {
  getOverlayWorkArea,
  getOverlayPlacementRect,
  getMenuHeadAnchorRect,
  getMenuAnchorRect,
  getHoverAnchorRect,
  getOverlayScaleDelta,
  getOverlayVisualGap,
  getHoverBodyHitPaddingForState,
  getOverlayVerticalOffset,
  getMenuVerticalLift,
  getHoverHitRect,
  getOverlayAvoidRect,
  getHoverAvoidRect,
  getMenuPlacementArea,
  getMenuCandidateGaps,
  getMenuPosition,
  getHoverPosition,
  getOverlaySafeArea,
  getCustomizationAnchorRect: getCustomizationAnchorRectGeometry,
  getCustomizationPosition: getCustomizationPositionGeometry,
  clampPanelRect,
  pickBestOverlayCandidate
} = overlayGeometry;

// 接入 windows/bubble-controller.cjs：气泡窗口创建、显示、隐藏、定位、计时器
// context 中的函数引用依赖函数声明提升（hoisting），在运行时调用时已全部可用
const bubbleController = createBubbleController({
  // Electron 与运行时
  BrowserWindow,
  path,
  __dirname,
  process,
  // 资源和页面
  getAppIconPath,
  getAppPageUrl,
  log,
  safeSend,
  buildPetConfig,
  // 共享几何（从 overlay-geometry 注入）
  getOverlayPlacementRect,
  expandRect,
  getOverlayWorkArea,
  getOverlaySafeArea,
  getOverlayVisualGap,
  getOverlayVerticalOffset,
  getScaledOverlayCollisionPadding,
  setFixedWindowBounds,
  clampPanelRect,
  pickBestOverlayCandidate,
  // 窗口访问器
  getPetWindow: () => petWindow,
  getMenuWindow: () => menuController ? menuController.getMenuWindow() : null,
  getHoverWindow: () => hoverController ? hoverController.getHoverWindow() : null,
  // 状态访问器
  getActiveState: () => activeState,
  getWalkDirection: () => walkDirection,
  getCurrentSurface,
  // 行走和任务栏
  isWalkingState,
  getTaskbarWalkRunway: () => taskbarWalkRunway,
  isTaskbarWalkActive,
  getTaskbarWalkOverlayPetRect,
  // 宠物可视区域
  getCurrentPetVisualRect,
  getRenderedFrameVisibleRect,
  getVisiblePetRect,
  getPetSpriteRect,
  // 交互暂停
  addInteractionPause,
  removeInteractionPause,
  // 跨控制器互斥
  hidePetMenu: () => menuController.hidePetMenu(),
  hideHoverPanel: () => hoverController.hideHoverPanel(),
  restoreHoverAfterBubbleIfNeeded,
  // 几何工具
  clamp,
  cloneRect,
  rectsOverlap,
  rectFitsInArea,
  // 问候语
  sharedGreetings,
  // 常量
  STARTUP_BUBBLE_DEFAULT_WIDTH,
  STARTUP_BUBBLE_MIN_WIDTH,
  STARTUP_BUBBLE_MAX_WIDTH,
  STARTUP_BUBBLE_HEIGHT,
  STARTUP_BUBBLE_GAP_OFFSET,
  STARTUP_BUBBLE_SCALE_GAP_FACTOR,
  STARTUP_BUBBLE_DURATION_MS,
  STARTUP_BUBBLE_HOVER_LOCK_MS,
  DEFAULT_STATE
});
const {
  createStartupBubbleWindow,
  getStartupBubblePosition,
  resizeStartupBubble,
  repositionStartupBubbleWindow,
  showStartupBubble,
  showBubbleMessage,
  hideStartupBubble,
  showPendingWalkBubbleMessage,
  isStartupBubbleVisible,
  getBubbleHoverSuppressionMs,
  getBubbleAnchorRect,
  clearPendingWalkBubbleMessage,
  clearStartupBubbleTimer
} = bubbleController;

// 接入 windows/customization-controller.cjs：自定义面板创建、显示、隐藏、定位
const customizationController = createCustomizationController({
  // Electron 与运行时
  BrowserWindow,
  path,
  __dirname,
  process,
  // 资源和页面
  getAppIconPath,
  getAppPageUrl,
  log,
  // 窗口和状态访问器
  getPetWindow: () => petWindow,
  // 跨控制器互斥
  hidePetMenu: () => menuController.hidePetMenu(),
  hideHoverPanel: () => hoverController.hideHoverPanel(),
  // 交互暂停
  addInteractionPause,
  removeInteractionPause,
  // 宠物可视区域
  getPetSpriteRect,
  getVisiblePetRect,
  getWindowRect,
  // 任务栏行走
  isTaskbarWalkActive,
  getTaskbarWalkOverlayPetRect,
  getTaskbarWalkRunway: () => taskbarWalkRunway,
  // 共享几何（从 overlay-geometry 注入）
  getOverlayPlacementRect,
  expandRect,
  getOverlayWorkArea,
  getOverlaySafeArea,
  getOverlayVisualGap,
  getOverlayVerticalOffset,
  getScaledOverlayCollisionPadding,
  setFixedWindowBounds,
  clamp,
  rectsOverlap,
  clampPanelRect,
  pickBestOverlayCandidate,
  // 常量
  CUSTOMIZATION_PANEL_WIDTH,
  CUSTOMIZATION_PANEL_HEIGHT,
  HOVER_PANEL_SCALE_GAP_FACTOR
});
const {
  createCustomizationWindow,
  showCustomizationPanel,
  hideCustomizationPanel,
  getCustomizationPosition,
  getCustomizationAnchorRect,
  freezeCustomizationPetRect,
  isCustomizationVisible,
  refreshCustomizationAnchorAfterScale
} = customizationController;

// 接入 windows/menu-controller.cjs：菜单窗口创建、显示、隐藏、定位、计时器
const menuController = createMenuController({
  // Electron 与运行时
  BrowserWindow,
  path,
  __dirname,
  process,
  screen,
  // 资源和页面
  getAppIconPath,
  getAppPageUrl,
  log,
  safeSend,
  buildPetConfig,
  // 菜单特性
  buildMenuFeatures,
  // 窗口和状态访问器
  getPetWindow: () => petWindow,
  getActiveState: () => activeState,
  getWalkDirection: () => walkDirection,
  isCustomizationVisible,
  // 几何方法（从 overlay-geometry 注入）
  getMenuPosition,
  getMenuPlacementArea,
  getMenuCandidateGaps,
  getMenuHeadAnchorRect,
  getMenuAnchorRect,
  // overlay 辅助函数
  getOverlayVisualGap,
  // 帧与可视区域辅助
  isResolvedOverlayPetRect,
  getFrameVisibleRectFromBounds,
  getVisiblePetRectFromBounds,
  getRenderedFrameInfo,
  // 光标辅助
  isCursorInsidePetVisibleRect,
  // 窗口 bounds 辅助
  setFixedWindowBounds,
  // 交互暂停
  addInteractionPause,
  removeInteractionPause,
  // 跨控制器动作
  refreshAutoStartCacheAsync,
  clearHoverIntent: () => hoverController.clearHoverIntent(),
  hideStartupBubble: (...args) => bubbleController.hideStartupBubble(...args),
  hideHoverPanel: () => hoverController.hideHoverPanel(),
  // bounds 工具
  clamp,
  cloneRect,
  expandRect,
  isPointInsideRect,
  // 常量
  PET_MENU_WIDTH,
  PET_MENU_COLLAPSED_HEIGHT,
  PET_MENU_MIN_HEIGHT,
  PET_MENU_MAX_HEIGHT,
  PET_MENU_PADDING_Y,
  PET_MENU_ITEM_HEIGHT,
  PET_MENU_HIDE_DELAY_MS,
  PET_MENU_GAP_OFFSET,
  PET_MENU_SCALE_GAP_FACTOR
});
const {
  createMenuWindow,
  resizePetMenu,
  showPetMenu,
  hidePetMenu,
  scheduleHidePetMenu,
  repositionMenuWindow,
  updateMenuVisibilityFromCursor,
  getQuickMenuHeight,
  freezeMenuPetRect,
  buildMenuPlacementSnapshot,
  refreshMenuAnchorAfterScale,
  clearMenuHideTimer,
  getMenuWindow,
  getMenuWindowReady,
  getMenuAnchorRectValue,
  setMenuAnchorRect,
  getMenuFrozenPetRect,
  getMenuPlacementSnapshot,
  getCurrentMenuHeight,
  getIsPointerOverMenuPanel,
  setIsPointerOverMenuPanel,
  getLastMenuBounds,
  setLastMenuBounds
} = menuController;

// 接入 windows/hover-controller.cjs：悬停面板创建、显示、隐藏、定位、轮询
const hoverController = createHoverController({
  // Electron 与运行时
  BrowserWindow,
  path,
  __dirname,
  process,
  screen,
  // 应用基础
  getAppIconPath,
  getAppPageUrl,
  log,
  safeSend,
  buildPetConfig,
  // 宠物窗口与状态访问器
  getPetWindow: () => petWindow,
  getActiveState: () => activeState,
  getCurrentSurface,
  getDragState: () => dragState,
  getMenuWindow,
  // 几何计算（从 overlay-geometry 注入）
  getHoverPosition,
  getHoverAnchorRect,
  getHoverHitRect,
  getHoverAvoidRect,
  getHoverBodyHitPaddingForState,
  // 共享几何辅助
  getOverlayPlacementRect,
  expandRect,
  getOverlayWorkArea,
  getOverlaySafeArea,
  getOverlayVisualGap,
  getOverlayVerticalOffset,
  getScaledHoverBodyHitPadding,
  getScaledHoverAvoidPadding,
  clamp,
  cloneRect,
  rectsOverlap,
  rectFitsInArea,
  clampPanelRect,
  pickBestOverlayCandidate,
  // bounds 工具
  isPointInsideRect,
  // 宠物精灵
  getPetSpriteRect,
  getVisiblePetRect,
  getWindowRect,
  getState,
  getRenderedFrameVisibleRect,
  // 任务栏行走
  isTaskbarWalkActive,
  getTaskbarWalkOverlayPetRect,
  getTaskbarWalkRunway: () => taskbarWalkRunway,
  // 光标检测
  isCursorInsidePetVisibleRect,
  isCursorInsideHoverIntentTarget,
  isCursorInsideSpriteRect,
  // 悬停面板辅助
  shouldSuppressHoverPanel,
  updatePetWindowMousePassthrough,
  updateMenuVisibilityFromCursor,
  // 交互暂停
  addInteractionPause,
  removeInteractionPause,
  // 窗口 bounds 辅助
  setFixedWindowBounds,
  // 其他窗口（跨控制器，使用 lazy wrapper 避免 TDZ）
  hideStartupBubble,
  hidePetMenu,
  repositionStartupBubbleWindow,
  repositionMenuWindow,
  // 诊断
  logWalkDiagnostic,
  // 常量
  HOVER_PANEL_WIDTH,
  HOVER_PANEL_HEIGHT,
  HOVER_PANEL_GAP_OFFSET,
  HOVER_PANEL_VERTICAL_OFFSET,
  HOVER_PANEL_SCALE_GAP_FACTOR,
  HOVER_POLL_INTERVAL_MS,
  HOVER_HIDE_DELAY_MS,
  HOVER_INTENT_DELAY_MS,
  TASKBAR_WALK_HOVER_INTENT_DELAY_MS,
  WALK_DIAGNOSTICS_ENABLED
});
const {
  createHoverWindow,
  showHoverPanel,
  hideHoverPanel,
  repositionHoverWindow,
  beginHoverFromPointer,
  scheduleHoverIntent,
  startHoverPolling,
  stopHoverPolling,
  updateHoverVisibilityFromCursor,
  freezeHoverPetRect,
  clearHoverIntent,
  scheduleHideHoverPanel,
  refreshHoverAnchorAfterScale,
  clearHoverHideTimer,
  getHoverWindow,
  getHoverWindowReady,
  getHoverAnchorRectValue,
  getHoverFrozenPetRect,
  getHoverHideTimer,
  getHoverIntentTimer,
  getHoverPollTimer,
  getIsPointerOverHoverPanel,
  getIsPointerOverPet,
  getLastHoverBounds,
  setHoverWindow,
  setHoverWindowReady,
  setHoverAnchorRect,
  setHoverFrozenPetRect,
  setHoverHideTimer,
  setHoverIntentTimer,
  setHoverPollTimer,
  setIsPointerOverHoverPanel,
  setIsPointerOverPet,
  setLastHoverBounds
} = hoverController;

// 接入 platform/screen-metrics.cjs：屏幕度量（任务栏表面、跑道、显示器、macOS 归位调度）
// 采用薄包装接线：8 个屏幕度量函数保留原函数名，函数体委托给 screenMetricsController
// displayMetricsSettleTimer 所有权迁移到控制器，main.cjs 不再直接持有
const screenMetricsController = createScreenMetricsController({
  // Electron 与运行时
  screen,
  process,
  // 依赖函数（main.cjs function 声明，hoisted 可用）
  clamp,
  getPetSpriteSize,
  getPetWindowWidth,
  getCurrentSurface,
  getSurfaceWorkArea,
  moveToStartPosition,
  // 可变状态访问器（实时读取 main.cjs 状态，避免快照）
  getPetWindow: () => petWindow,
  getDragState: () => dragState,
  getCurrentSurfaceValue: () => currentSurface,
  // 常量
  TASKBAR_WALK_RUNWAY_PADDING_SCALE,
  TASKBAR_WALK_RUNWAY_PADDING_MIN,
  TASKBAR_WALK_RUNWAY_PADDING_MAX,
  TASKBAR_WALK_RUNWAY_SCREEN_BUFFER_FACTOR,
  DARWIN_BOTTOM_DOCK_WIDTH_HEIGHT_FACTOR,
  VISIBLE_SIDE_GAP,
  VISIBLE_BOTTOM_GAP,
  DARWIN_DISPLAY_METRICS_SETTLE_MS
});

// 接入 platform/window-surfaces.cjs：窗口候选探测（PowerShell 调用、解析、评分、命中检测）
// 采用薄包装接线：16 个窗口表面函数保留原函数名，函数体委托给 windowSurfaceController
// 窗口候选缓存与异步刷新状态所有权迁移到控制器，main.cjs 不再直接持有
const windowSurfaceController = createWindowSurfaceController({
  // Electron 与运行时
  screen,
  execFile,
  execFileSync,
  fs,
  path,
  process,
  __dirname,
  // 依赖函数（main.cjs function 声明，hoisted 可用）
  log,
  getPetSpriteSize,
  isValidRect,
  isLikelyDesktopOrSystemWindow,
  // 可变状态访问器（实时读取 main.cjs 状态，避免快照）
  getPetWindow: () => petWindow,
  getDragState: () => dragState,
  getLastDragSample: () => lastDragSample,
  getUserDataRoot: () => userDataRoot,
  getCurrentSurfaceValue: () => currentSurface,
  // 常量
  ENABLE_WINDOW_DOCKING,
  APP_INTERNAL_NAME,
  WINDOW_DOCK_DEBUG,
  WINDOW_SURFACE_CACHE_MS,
  WINDOW_SURFACE_ASYNC_REFRESH_MIN_MS,
  WINDOW_SURFACE_BACKGROUND_REFRESH_MS,
  WINDOW_DOCK_MIN_WIDTH,
  WINDOW_SURFACE_SIDE_GAP,
  WINDOW_DOCK_GAP,
  WINDOW_DOCK_FAST_RELEASE_SPEED_PX_PER_SEC,
  WINDOW_DOCK_FAST_RELEASE_MAX_AGE_MS,
  WINDOW_DOCK_FAST_HIT_SAMPLES,
  WINDOW_DOCK_NORMAL_HIT_SAMPLES,
  WINDOW_DOCK_FAST_POINT_OFFSETS_Y,
  WINDOW_DOCK_POINT_OFFSETS_Y
});

// 接入 behavior/eye-tracking-controller.cjs：眼球追踪光标跟随、视线方向计算、pet:eye-tracking-look 发送
// 运行时可变状态通过访问器注入，避免创建瞬间固化快照
const eyeTrackingController = createEyeTrackingController({
  // Electron 与运行时
  screen,
  // 窗口与状态访问器（实时读取，避免快照）
  getPetWindow: () => petWindow,
  getMenuWindow,
  getHoverWindow,
  getActiveState: () => activeState,
  getDragState: () => dragState,
  getEyeTrackingEnabled: () => preferencesStore.getEyeTrackingEnabled(),
  getEyeTrackingLookFrameCount: () => assetLoader.getEyeTrackingLookFrameCount(),
  canToggleEyeTracking: () => preferencesStore.canToggleEyeTracking(),
  // 依赖函数
  safeSend,
  getRenderedFrameHeadRectFromBounds,
  getRenderedFrameVisibleRect,
  getVisiblePetRect,
  getWindowRect,
  isPointInsideRect,
  isPointInsideRenderedFrame,
  // 常量
  STATE_SQUAT,
  EYE_TRACKING_POLL_INTERVAL_MS
});
const {
  sendEyeTrackingLook,
  getEyeTrackingLookForCursor,
  tickEyeTracking,
  startEyeTrackingPolling,
  stopEyeTrackingPolling,
  updateEyeTrackingPolling,
  getLastEyeTrackingLook
} = eyeTrackingController;

// 接入 behavior/window-roam-controller.cjs：窗口漫游目标选取、附着、回退与轮询
// 运行时可变状态通过访问器注入，避免创建瞬间固化快照；漫游私有状态由 controller 管理
const windowRoamController = createWindowRoamController({
  // 窗口与状态访问器（实时读取，避免快照）
  getPetWindow: () => petWindow,
  getActiveState: () => activeState,
  getWalkDirection: () => walkDirection,
  getDragState: () => dragState,
  getWindowDockInProgress: () => windowDockInProgress,
  getWindowRoamEnabled: () => preferencesStore.getWindowRoamEnabled(),
  canToggleWindowRoam: () => preferencesStore.canToggleWindowRoam(),
  // 依赖函数
  refreshWindowSurfaceCandidatesAsync,
  parseWindowHwnd,
  getCachedWindowSurfaceCandidates,
  buildWindowSurfaceFromItem,
  applySurfaceScale,
  setCurrentSurface,
  groundPetToSurface,
  getVisibleSpriteInsets,
  getPetSpriteSize,
  getPetWindowPositionForVisibleRect,
  getSurfaceVisibleTop,
  clampPetWindowPositionToSurface,
  setPetWindowPosition,
  syncWalkTrackX,
  isWalkingState,
  refreshWalkLoopAfterSurfaceChange,
  safeSend,
  buildScaleSummary,
  getCurrentSurface,
  fallbackCurrentSurfaceToTaskbar,
  getWindowRoamSurfaceById,
  // 常量
  WINDOW_ROAM_MAX_MISSING_TICKS,
  WINDOW_ROAM_POLL_INTERVAL_MS
});
const {
  getTopWindowRoamSurface,
  attachPetToWindowRoamSurface,
  fallbackWindowRoamToTaskbar,
  tickWindowRoam,
  startWindowRoamPolling,
  stopWindowRoamPolling,
  updateWindowRoamPolling,
  prepareWindowRoamAfterPreferenceEnabled,
  resetWindowRoamState,
  rememberDockedWindowRoamTarget,
  suppressPreviousWindowAfterDockMiss,
  clearWindowRoamSuppression,
  markWindowRoamAttached,
  suppressCurrentWindowForSettle,
  setDragFallbackSuppressionUntil
} = windowRoamController;

// 接入 behavior/walk-controller.cjs：行走循环调度、表面刷新、循环完成、逐步推进
// 采用薄包装接线：6 个行走函数保留原函数名，函数体委托给 walkController
// 所有行走状态仍以 main.cjs 为唯一存储源，controller 通过 getter/setter 读写
const walkController = createWalkController({
  // 依赖函数（main.cjs function 声明，hoisted 可用）
  clearWalkLoopTimer,
  isInteractionPaused,
  resetWalkRuntime,
  alignWalkLoopToSurface,
  pauseWalkLoopClock,
  sendStats,
  isWalkingState,
  getCurrentSurface,
  getWalkVisibleLimits,
  getVisiblePetRectFromBounds,
  applyCompletedWalkStats,
  getDefaultDirectionForState,
  materializeTaskbarWalkRunwayForState,
  sendWalkDirection,
  setState,
  groundPetToSurface,
  sendPetState,
  showStatMessages,
  syncWalkTrackX,
  getWalkVisibleCenterFromWindowX,
  getTaskbarWalkCenterLimits,
  clamp,
  setWalkDirection,
  setTaskbarWalkRunwayForEdge,
  ensureTaskbarWalkRunwayForCenter,
  buildScaleSummary,
  updatePetWindowMousePassthrough,
  logWalkStepDiagnostic,
  buildWalkStepResult,
  applySurfaceScale,
  resetToTaskbarSurface,
  getGroundedWindowYForSurface,
  getWalkVisibleRectFromWindowX,
  getWindowXForVisibleEdge,
  getSafeWindowXForDirection,
  setWalkWindowPositionDirect,
  setWalkWindowPosition,
  // 外部状态访问器（实时读取 main.cjs 状态，避免快照）
  getPetWindow: () => petWindow,
  getActiveState: () => activeState,
  getPetScale: () => petScale,
  getPreferredPetScale: () => preferredPetScale,
  getInteractionPauseReasons: () => interactionPauseReasons,
  getWalkTrackX: () => walkTrackX,
  // 行走运行时状态访问器（读 getter / 写 setter，状态存储于 main.cjs）
  getWalkDirection: () => walkDirection,
  getWalkLoop: () => walkLoop,
  setWalkLoop: (v) => { walkLoop = v; },
  getWalkLoopTimer: () => walkLoopTimer,
  setWalkLoopTimer: (v) => { walkLoopTimer = v; },
  getWalkPausedAt: () => walkPausedAt,
  setWalkPausedAt: (v) => { walkPausedAt = v; },
  getNextWalkStartDirection: () => nextWalkStartDirection,
  setNextWalkStartDirection: (v) => { nextWalkStartDirection = v; },
  getWalkLeftEdgeStuckSteps: () => walkLeftEdgeStuckSteps,
  setWalkLeftEdgeStuckSteps: (v) => { walkLeftEdgeStuckSteps = v; },
  getWalkRightEdgeStuckSteps: () => walkRightEdgeStuckSteps,
  setWalkRightEdgeStuckSteps: (v) => { walkRightEdgeStuckSteps = v; },
  getWalkMirrorCooldownSteps: () => walkMirrorCooldownSteps,
  setWalkMirrorCooldownSteps: (v) => { walkMirrorCooldownSteps = v; },
  getStalledWalkSteps: () => stalledWalkSteps,
  setStalledWalkSteps: (v) => { stalledWalkSteps = v; },
  getLastWalkStepAt: () => lastWalkStepAt,
  setLastWalkStepAt: (v) => { lastWalkStepAt = v; },
  getLastWalkScaleApplyAt: () => lastWalkScaleApplyAt,
  setLastWalkScaleApplyAt: (v) => { lastWalkScaleApplyAt = v; },
  getLastWalkSurfaceSignature: () => lastWalkSurfaceSignature,
  setLastWalkSurfaceSignature: (v) => { lastWalkSurfaceSignature = v; },
  // 常量
  WALK_LOOP_DURATION_MS,
  STATE_WALK,
  WALK_EDGE_TOLERANCE,
  DEFAULT_STATE,
  WALK_STEP,
  WALK_EDGE_STUCK_STEPS_TO_FORCE_MIRROR,
  WALK_SCALE_APPLY_THROTTLE_MS,
  WALK_MIRROR_HYSTERESIS_PX,
  WALK_MIRROR_COOLDOWN_STEPS
});

// 接入 behavior/dock-controller.cjs：贴靠、表面校验、轮询与回退
// 采用薄包装接线：8 个贴靠函数保留原函数名，函数体委托给 dockController
// 所有贴靠状态仍以 main.cjs 为唯一存储源，controller 通过 getter/setter 读写
const dockController = createDockController({
  // Electron 与运行时
  process,
  // 依赖函数（main.cjs function 声明，hoisted 可用）
  log,
  setCurrentSurface,
  getCurrentSurface,
  applySurfaceScale,
  groundPetToSurface,
  clampPetWindowPositionToSurface,
  setPetWindowPosition,
  syncWalkTrackX,
  isWalkingState,
  refreshWalkLoopAfterSurfaceChange,
  clearDragState,
  refreshWindowSurfaceCandidatesAsync,
  setState,
  parseWindowHwnd,
  diagnoseDockTargetFromCache,
  fallbackToTaskbarAfterDrag,
  findCandidateByHwnd,
  buildWindowSurfaceFromItem,
  getVisiblePetRectFromBounds,
  resetToTaskbarSurface,
  getGroundedWindowYForSurface,
  getVisibleSpriteInsets,
  getPetSpriteSize,
  getPetWindowPositionForVisibleRect,
  getSurfaceVisibleTop,
  animatePetWindowTo,
  maybeRefreshWindowSurfaceCandidatesBackground,
  refreshCurrentWindowSurfaceBoundsFromCache,
  logWalkDiagnostic,
  isInteractionPaused,
  getInteractionPauseSummary,
  // window-roam-controller 协作方法（状态由 window-roam-controller 统一维护）
  getTopWindowRoamSurface,
  attachPetToWindowRoamSurface,
  rememberDockedWindowRoamTarget,
  clearWindowRoamSuppression,
  suppressPreviousWindowAfterDockMiss,
  setDragFallbackSuppressionUntil,
  markWindowRoamAttached,
  // retry 回调，委托给 main.cjs 薄包装后的 dockPetAfterDrag
  retryDockPetAfterDrag: (...args) => dockPetAfterDrag(...args),
  // 外部状态访问器（实时读取 main.cjs 状态，避免快照）
  getPetWindow: () => petWindow,
  getActiveState: () => activeState,
  getWalkDirection: () => walkDirection,
  getDragState: () => dragState,
  getPetRuntimeConfig: () => petRuntimeConfig,
  getPetScale: () => petScale,
  getPreferredPetScale: () => preferredPetScale,
  getWindowRoamEnabled: () => preferencesStore.getWindowRoamEnabled(),
  // 贴靠轮询状态访问器（读 getter / 写 setter，状态存储于 main.cjs）
  getWindowSurfacePollTimer: () => windowSurfacePollTimer,
  setWindowSurfacePollTimer: (v) => { windowSurfacePollTimer = v; },
  getLastWindowSurfaceHeavyCheckAt: () => lastWindowSurfaceHeavyCheckAt,
  setLastWindowSurfaceHeavyCheckAt: (v) => { lastWindowSurfaceHeavyCheckAt = v; },
  getWindowSurfaceMissingTicks: () => windowSurfaceMissingTicks,
  setWindowSurfaceMissingTicks: (v) => { windowSurfaceMissingTicks = v; },
  getWindowDockInProgress: () => windowDockInProgress,
  setWindowDockInProgress: (v) => { windowDockInProgress = v; },
  getWindowDockHoverSuppressedUntil: () => windowDockHoverSuppressedUntil,
  setWindowDockHoverSuppressedUntil: (v) => { windowDockHoverSuppressedUntil = v; },
  // 常量
  STATE_SHAKE,
  ENABLE_WINDOW_DOCKING,
  WINDOW_DOCK_DEBUG,
  WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS,
  WINDOW_DOCK_DRAG_RETRY_DELAY_MS,
  WINDOW_DOCK_COARSE_CORRECTION_LIMIT,
  WINDOW_SURFACE_FALLBACK_BLEND_MS,
  WINDOW_SURFACE_HEAVY_RECHECK_MS,
  WINDOW_SURFACE_POLL_INTERVAL_MS,
  WINDOW_ROAM_DRAG_FALLBACK_SUPPRESS_MS
});

function getAutoStartCommand() {
  return `"${process.execPath}"`;
}

function readAutoStartEnabledSync() {
  if (!preferencesStore.isAutoStartSupported() || !petRuntimeConfig.autoStartRegistryKey) {
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
  if (!preferencesStore.isAutoStartSupported() || !petRuntimeConfig.autoStartRegistryKey) {
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
  preferencesStore.readAutoStartPreference();
}

function writeAutoStartPreference(enabled) {
  preferencesStore.writeAutoStartPreference(enabled);
}

function refreshAutoStartCacheAsync() {
  if (autoStartRefreshInFlight) {
    return;
  }

  autoStartRefreshInFlight = true;
  readAutoStartEnabledAsync((enabled) => {
    if (!preferencesStore.isAutoStartPreferenceLoaded()) {
      preferencesStore.setAutoStartEnabled(enabled);
      writeAutoStartPreference(enabled);
    }
    autoStartRefreshInFlight = false;
    sendMenuConfig();
  });
}

function setAutoStartEnabled(enabled) {
  if (!preferencesStore.canToggleAutoStart()) {
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
  return preferencesStore.buildAutoStartSummary(error);
}

function readWindowRoamPreference() {
  preferencesStore.readWindowRoamPreference();
}

function writeWindowRoamPreference(enabled) {
  preferencesStore.writeWindowRoamPreference(enabled);
}

function buildWindowRoamSummary(error = "") {
  return preferencesStore.buildWindowRoamSummary(error);
}

function readEyeTrackingPreference() {
  preferencesStore.readEyeTrackingPreference();
}

function writeEyeTrackingPreference(enabled) {
  preferencesStore.writeEyeTrackingPreference(enabled);
}

function buildEyeTrackingSummary(error = "") {
  return preferencesStore.buildEyeTrackingSummary(error);
}

function readPetScalePreference() {
  preferencesStore.readPetScalePreference();
  // 同步运行时变量
  petScale = preferencesStore.getPetScale();
  preferredPetScale = preferencesStore.getPreferredPetScale();
}

function writePetScalePreference() {
  // 同步到模块后写入
  preferencesStore.setPreferredPetScale(preferredPetScale);
  preferencesStore.writePetScalePreference();
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
  const menuWin = getMenuWindow();
  if (menuWin && !menuWin.isDestroyed() && getMenuWindowReady() && !menuWin.webContents.isLoading()) {
    safeSend(menuWin, "pet:menu-data", buildPetConfig());
  }
}

function setAutoStartPreference(enabled) {
  if (!preferencesStore.canToggleAutoStart()) {
    return buildAutoStartSummary("Auto start is not available for this build.");
  }

  const nextEnabled = Boolean(enabled);
  try {
    setAutoStartEnabled(nextEnabled);
    preferencesStore.setAutoStartEnabled(nextEnabled);
    writeAutoStartPreference(nextEnabled);
  } catch (error) {
    log(`failed to set auto start: ${error.stack || error.message}`);
    preferencesStore.setAutoStartEnabled(readAutoStartEnabledSync());
    return buildAutoStartSummary(error.message || "Failed to update auto start.");
  }

  const summary = buildAutoStartSummary();
  sendMenuConfig();
  return summary;
}

function toggleAutoStart() {
  return setAutoStartPreference(!preferencesStore.getAutoStartEnabled());
}

function setWindowRoamPreference(enabled) {
  if (!preferencesStore.canToggleWindowRoam()) {
    return buildWindowRoamSummary("Window roam is not available for this build.");
  }

  const roamEnabled = Boolean(enabled);
  preferencesStore.setWindowRoamEnabled(roamEnabled);
  writeWindowRoamPreference(roamEnabled);
  resetWindowRoamState();
  if (roamEnabled) {
    prepareWindowRoamAfterPreferenceEnabled(currentSurface);
  }
  updateWindowRoamPolling();
  sendMenuConfig();
  return buildWindowRoamSummary();
}

function setEyeTrackingPreference(enabled) {
  if (!preferencesStore.canToggleEyeTracking()) {
    return buildEyeTrackingSummary("Eye tracking is not available for this build.");
  }

  const trackingEnabled = Boolean(enabled);
  preferencesStore.setEyeTrackingEnabled(trackingEnabled);
  writeEyeTrackingPreference(trackingEnabled);
  updateEyeTrackingPolling();
  sendMenuConfig();
  return buildEyeTrackingSummary();
}

function getInteractionPauseSummary() {
  return Array.from(interactionPauseReasons).join(",") || "-";
}

function logInteractionPauseDiagnostic(action, reason) {
  if (!WALK_DIAGNOSTICS_ENABLED) {
    return;
  }
  logWalkDiagnostic(`${action} reason=${reason} reasons=${getInteractionPauseSummary()} surface=${getCurrentSurface()?.type || "unknown"} activeState=${activeState}`);
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

  const savedStatsFile = fs.existsSync(statsFile) ? statsFile : legacyStatsFile;
  if (savedStatsFile && fs.existsSync(savedStatsFile)) {
    try {
      const raw = fs.readFileSync(savedStatsFile, "utf8").trim();
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
  return screenMetricsController.getTaskbarWalkRunwayPadding();
}

function getTaskbarWalkRunwayScreenBuffer() {
  return screenMetricsController.getTaskbarWalkRunwayScreenBuffer();
}

function getTaskbarWalkRunwayWindowWidth(surface = getCurrentSurface()) {
  return screenMetricsController.getTaskbarWalkRunwayWindowWidth(surface);
}

function getDefaultDirectionForState(stateId = activeState) {
  return getState(stateId)?.defaultFacing === "right" ? 1 : -1;
}

function getDarwinBottomDock(display) {
  return screenMetricsController.getDarwinBottomDock(display);
}

function clampPetScale(value) {
  return Math.round(clamp(Number(value) || 1, PET_SCALE_MIN, PET_SCALE_MAX) * 100) / 100;
}

function getTaskbarSurface(display = screen.getPrimaryDisplay()) {
  return screenMetricsController.getTaskbarSurface(display);
}

function getTaskbarSurfaceForBounds(bounds) {
  return screenMetricsController.getTaskbarSurfaceForBounds(bounds);
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
  return screenMetricsController.getSurfaceDisplay(surface);
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
  return windowSurfaceController.parseWindowSurfaceItems(rawOutput);
}

function parseWindowHwnd(value) {
  return windowSurfaceController.parseWindowHwnd(value);
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
  return windowSurfaceController.normalizeWindowRectToDip(rect);
}

function toPhysicalScreenPoint(point) {
  return windowSurfaceController.toPhysicalScreenPoint(point);
}

function prepareRuntimeScript(scriptName) {
  return windowSurfaceController.prepareRuntimeScript(scriptName);
}

function listWindowSurfaceCandidates({ useCache = true } = {}) {
  return windowSurfaceController.listWindowSurfaceCandidates({ useCache });
}

function refreshWindowSurfaceCandidatesAsync({ force = false } = {}) {
  return windowSurfaceController.refreshWindowSurfaceCandidatesAsync({ force });
}

function listSpecificWindowSurfaceCandidate(hwnd) {
  return windowSurfaceController.listSpecificWindowSurfaceCandidate(hwnd);
}

function findCandidateByHwnd(hwnd, { useCache = true, cacheOnly = false } = {}) {
  return windowSurfaceController.findCandidateByHwnd(hwnd, { useCache, cacheOnly });
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
  return windowSurfaceController.maybeRefreshWindowSurfaceCandidatesBackground(now);
}

function getWindowAtScreenPoint(x, y) {
  return windowSurfaceController.getWindowAtScreenPoint(x, y);
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

// isValidRect 已从 shared/bounds.cjs 导入

function isWindowTopDockable(rect, area) {
  const verticalSlack = 10;
  const horizontalOverlap = Math.min(rect.right, area.x + area.width) - Math.max(rect.left, area.x);
  return rect.top >= area.y - verticalSlack
    && rect.top <= area.y + area.height - 80
    && horizontalOverlap >= WINDOW_DOCK_MIN_WIDTH;
}

function buildWindowSurfaceFromItem(item) {
  return windowSurfaceController.buildWindowSurfaceFromItem(item);
}

function buildDockQueryPoints(bottomPoint, surfaceHint = null) {
  return windowSurfaceController.buildDockQueryPoints(bottomPoint, surfaceHint);
}

function scoreDockSurface(bottomPoint, rect) {
  return windowSurfaceController.scoreDockSurface(bottomPoint, rect);
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
  return windowSurfaceController.getCachedWindowSurfaceCandidates();
}

function getLastWindowSurfaceAsyncRefreshAt() {
  return windowSurfaceController.getLastWindowSurfaceAsyncRefreshAt();
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

function getWindowRoamSurfaceById(windowId) {
  const candidate = findCandidateByHwnd(windowId, { cacheOnly: true })
    || findCandidateByHwnd(windowId, { useCache: false });
  return candidate ? buildWindowSurfaceFromItem(candidate).surface : null;
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
      safeSend(petWindow, "pet:scale-changed", buildScaleSummary());
      refreshMenuAnchorAfterScale();
      refreshHoverAnchorAfterScale();
      refreshCustomizationAnchorAfterScale();
      repositionStartupBubbleWindow({ refreshAnchor: true });
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
    safeSend(petWindow, "pet:scale-changed", buildScaleSummary());
    refreshMenuAnchorAfterScale();
    refreshHoverAnchorAfterScale();
    refreshCustomizationAnchorAfterScale();
    repositionStartupBubbleWindow({ refreshAnchor: true });
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
  safeSend(petWindow, "pet:scale-changed", buildScaleSummary());
  refreshMenuAnchorAfterScale();
  refreshHoverAnchorAfterScale();
  refreshCustomizationAnchorAfterScale();
  repositionStartupBubbleWindow({ refreshAnchor: true });
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
  safeSend(petWindow, "pet:scale-changed", buildScaleSummary());
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
    nextTabbySleepPoseInMs: Math.max(0, tabbySleepPoseSwitchAt - now),
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
  broadcastToWindows([petWindow, getMenuWindow(), getHoverWindow()], "pet:stats-changed", stats);
}

function scheduleIdleGreeting(delayMs = IDLE_GREETING_DELAY_MS) {
  scheduleRandomGreeting(delayMs);
}

function startTabbyIdlePolling() {
  if (!petRuntimeConfig.features.idleYawn || tabbyIdlePollTimer) {
    return;
  }
  tabbyIdlePollTimer = setInterval(updateTabbyIdleActions, 1000);
  updateTabbyIdleActions();
}

function updateTabbyIdleActions() {
  if (!petRuntimeConfig.features.idleYawn || activeState !== DEFAULT_STATE) {
    return;
  }
  if (Date.now() - lastTabbyUserOperationAt >= TABBY_YAWN_IDLE_MS) {
    log("tabby idle -> yawn");
    setState(STATE_YAWN, false);
  }
}

function clearTabbySleepPoseTimer() {
  if (tabbySleepPoseTimer) {
    clearTimeout(tabbySleepPoseTimer);
    tabbySleepPoseTimer = null;
  }
  tabbySleepPoseSwitchAt = 0;
}

function scheduleTabbySleepPose(state) {
  if (!petRuntimeConfig.features.sleepPoseSwitch || activeState !== state || (state !== STATE_YAWN && state !== STATE_SLEEP) || tabbySleepPoseTimer) {
    return;
  }
  tabbySleepPoseSwitchAt = Date.now() + TABBY_SLEEP_POSE_MS;
  sendStats();
  tabbySleepPoseTimer = setTimeout(() => {
    tabbySleepPoseTimer = null;
    tabbySleepPoseSwitchAt = 0;
    setState(activeState === STATE_SLEEP ? STATE_YAWN : STATE_SLEEP, false);
  }, TABBY_SLEEP_POSE_MS);
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
    petStats.fullness = PET_STAT_MAX;
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
  return stateId === STATE_FEED || stateId === STATE_BALL || stateId === STATE_LICK || stateId === STATE_BELLY || stateId === STATE_STRETCH;
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

function toFileUrl(filePath) {
  return pathToFileURL(filePath).toString();
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
    walkDiagnosticsEnabled: WALK_DIAGNOSTICS_ENABLED,
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
      const tailLoopStart = Number.isInteger(metadata.tailLoopStart)
        ? Math.min(Math.max(0, metadata.tailLoopStart), maxFrame)
        : null;

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
        tailLoopStart,
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

// clamp 已从 shared/bounds.cjs 导入

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

function isInteractionPaused() {
  return interactionPauseReasons.size > 0;
}

function sendInteractionPauseState() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  safeSend(petWindow, "pet:pause-state-changed", isInteractionPaused());
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

// expandRect 已从 shared/bounds.cjs 导入

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

function getScaledHoverAvoidPadding() {
  return Math.max(HOVER_PANEL_AVOID_PADDING_MIN, Math.round(getPetSpriteSize() * HOVER_PANEL_AVOID_PADDING_SCALE));
}

function getCurrentPetHitRect() {
  if (!petWindow || petWindow.isDestroyed()) {
    return null;
  }
  return expandRect(getRenderedFrameVisibleRect() || getVisiblePetRect(), getHoverBodyHitPaddingForState());
}

function isCursorInsidePetVisibleRect() {
  const point = screen.getCursorScreenPoint();
  const frameInfo = getRenderedFrameInfo();
  const fallbackHit = isPointInsideRect(point, getHoverHitRect()) || isPointInsideRect(point, getCurrentPetHitRect());
  if (frameInfo.framePath && getFramePixelData(frameInfo.framePath)) {
    return isPointInsideRenderedFrame(point, frameInfo);
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

// normalizeBounds 已从 shared/bounds.cjs 导入

// boundsAreEqual 已从 shared/bounds.cjs 导入

function setFixedWindowBounds(targetWindow, bounds, width, height, cacheKey) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }

  const nextBounds = normalizeBounds(bounds, width, height);
  const lastBounds = cacheKey === "menu" ? getLastMenuBounds() : getLastHoverBounds();
  if (boundsAreEqual(lastBounds, nextBounds)) {
    return;
  }

  targetWindow.setBounds(nextBounds, false);
  if (cacheKey === "menu") {
    setLastMenuBounds(nextBounds);
  } else {
    setLastHoverBounds(nextBounds);
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
  // 通过 createOverlayWindow 统一创建 BrowserWindow，内部处理 setAlwaysOnTop 与 loadURL
  petWindow = createOverlayWindow({
    BrowserWindow, path, __dirname, getAppPageUrl, getAppIconPath, log, process,
    hash: "pet",
    width: getPetWindowWidth(),
    height: getPetWindowHeight(),
    movable: true,
    focusable: true,
    onDidFailLoad: (_event, errorCode, errorDescription, validatedURL) => {
      log(`pet did-fail-load ${errorCode} ${errorDescription} ${validatedURL}`);
    },
    onReady: () => {
      log("pet window ready-to-show");
      moveToStartPosition(false);
      petWindow.show();
      if (process.platform === "darwin") {
        moveToStartPosition(false);
      }
      sendPetState();
      showStartupBubble();
    }
  });
}

function restoreHoverAfterBubbleIfNeeded() {
  if (!petWindow || petWindow.isDestroyed() || dragState || shouldSuppressHoverPanel()) {
    return;
  }
  const menuWin = getMenuWindow();
  const isMenuVisible = menuWin && !menuWin.isDestroyed() && menuWin.isVisible();
  if (isMenuVisible || !isCursorInsideHoverIntentTarget()) {
    return;
  }
  beginHoverFromPointer();
}

function getWindowDockHoverSuppressionMs() {
  return Math.max(0, windowDockHoverSuppressedUntil - Date.now());
}

function shouldSuppressHoverPanel() {
  return isStartupBubbleVisible()
    || windowDockInProgress
    || getBubbleHoverSuppressionMs() > 0
    || getWindowDockHoverSuppressionMs() > 0
    || (petRuntimeConfig.features.wakeHiss && activeState === STATE_HISS)
    || isCustomizationVisible();
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

// cloneRect 已从 shared/bounds.cjs 导入（原本地版本调用 isResolvedOverlayPetRect，导入版本已内联等价检查）

function repositionOverlays() {
  repositionMenuWindow();
  repositionHoverWindow();
  repositionStartupBubbleWindow();
}

// isPointInsideRect 已从 shared/bounds.cjs 导入

// rectsOverlap 已从 shared/bounds.cjs 导入

// rectFitsInArea 已从 shared/bounds.cjs 导入

// getRectCenter 已从 shared/bounds.cjs 导入

// getRectCenterDistance 已从 shared/bounds.cjs 导入

// getRectClosestEdgeDistance 已从 shared/bounds.cjs 导入

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
  return isCursorInsidePetVisibleRect();
}

function togglePetMenu() {
  const menuWin = getMenuWindow();
  if (menuWin && !menuWin.isDestroyed() && menuWin.isVisible()) {
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
  broadcastToWindows([petWindow, getMenuWindow(), getHoverWindow()], "pet:state-changed", activeState);
  broadcastToWindows([petWindow, getMenuWindow(), getHoverWindow()], "pet:direction-changed", walkDirection);
  safeSend(petWindow, "pet:scale-changed", buildScaleSummary());
  safeSend(petWindow, "pet:eye-tracking-look", getLastEyeTrackingLook());
  sendStats();
}

function sendWalkDirection() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  broadcastToWindows([petWindow, getMenuWindow(), getHoverWindow()], "pet:direction-changed", walkDirection);
}

function sendDragState(isDragging) {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  safeSend(petWindow, "pet:drag-state-changed", isDragging);
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
  if (renderedFrameState === STATE_YAWN) {
    const tailLoopStart = readMetadata(getState(renderedFrameState).metadata).tailLoopStart;
    if (Number.isInteger(tailLoopStart) && renderedFrameIndex >= tailLoopStart) {
      scheduleTabbySleepPose(STATE_YAWN);
    }
  }
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
  const surface = getCurrentSurface();
  const clampedScale = surface?.type === "window"
    ? getScaleForSurface(surface, preferredPetScale, activeState, walkDirection)
    : clampPetScale(nextScale);
  if (!Number.isFinite(clampedScale)) {
    safeSend(petWindow, "pet:scale-changed", buildScaleSummary());
    return;
  }
  if (Math.abs(previousScale - clampedScale) < 0.001) {
    safeSend(petWindow, "pet:scale-changed", buildScaleSummary());
    return;
  }

  const bounds = petWindow.getBounds();
  const walkScaleAnchor = getWalkTrackAnchorForScale(bounds, surface);
  if (isWalkingState() && isTaskbarWalkActive(surface)) {
    petScale = clampedScale;
    const surfaceAfterScale = getCurrentSurface();
    if (!restoreWalkTrackAnchorAfterScale(walkScaleAnchor, surfaceAfterScale)) {
      groundPetToSurface(activeState, walkDirection, surfaceAfterScale);
    }
    safeSend(petWindow, "pet:scale-changed", buildScaleSummary());
    refreshMenuAnchorAfterScale();
    refreshHoverAnchorAfterScale();
    refreshCustomizationAnchorAfterScale();
    repositionStartupBubbleWindow({ refreshAnchor: true });
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
  safeSend(petWindow, "pet:scale-changed", buildScaleSummary());
  refreshMenuAnchorAfterScale();
  refreshHoverAnchorAfterScale();
  refreshCustomizationAnchorAfterScale();
  repositionStartupBubbleWindow({ refreshAnchor: true });
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
  if (previousState !== state) {
    clearTabbySleepPoseTimer();
  }
  if (previousState === STATE_WALK && activeState !== DEFAULT_STATE) {
    clearPendingWalkBubbleMessage();
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
  if (activeState === STATE_SLEEP) {
    scheduleTabbySleepPose(activeState);
  }
  showStatMessages(statMessagesToShow);
  showPendingWalkBubbleMessage();
}

function completeOneShotState(state) {
  if (!ONE_SHOT_STATES.has(state) || activeState !== state) {
    return;
  }
  const shouldApplyPendingStats = pendingActionStatsState === state;
  setState(DEFAULT_STATE, false);
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
    suppressCurrentWindowForSettle(surface);
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
  return walkController.scheduleWalkLoopTimeout();
}

function startWalkLoop() {
  return walkController.startWalkLoop();
}

function refreshWalkLoopAfterSurfaceChange() {
  return walkController.refreshWalkLoopAfterSurfaceChange();
}

function completeWalkLoop() {
  return walkController.completeWalkLoop();
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

function advanceTaskbarWalkStep(opts) {
  return walkController.advanceTaskbarWalkStep(opts);
}

function advanceWalkStep(frameStep = 0, elapsedMs = 0) {
  return walkController.advanceWalkStep(frameStep, elapsedMs);
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
    const sinceLastRefresh = now - getLastWindowSurfaceAsyncRefreshAt();
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
  return dockController.applyDockSurfaceAfterDrag(surface, draggedX);
}

function finishWindowDockAfterDrag() {
  return dockController.finishWindowDockAfterDrag();
}

function dockPetAfterDrag({ retry = false } = {}) {
  return dockController.dockPetAfterDrag({ retry });
}

function validateCurrentWindowSurface({ useCache = true } = {}) {
  return dockController.validateCurrentWindowSurface({ useCache });
}

function isPetStillDockedOnWindowSurface(surface) {
  return dockController.isPetStillDockedOnWindowSurface(surface);
}

function fallbackCurrentSurfaceToTaskbar(reason) {
  return dockController.fallbackCurrentSurfaceToTaskbar(reason);
}

function startWindowSurfacePolling() {
  return dockController.startWindowSurfacePolling();
}

function stopWindowSurfacePolling() {
  return dockController.stopWindowSurfacePolling();
}

function scheduleDarwinDisplayMetricsSettle() {
  return screenMetricsController.scheduleDarwinDisplayMetricsSettle();
}

function clearDisplayMetricsSettleTimer() {
  return screenMetricsController.clearDisplayMetricsSettleTimer();
}

function startDragTimer() {
  if (dragTimer) {
    clearInterval(dragTimer);
  }
  updateDragPosition();
  dragTimer = setInterval(updateDragPosition, 16);
}

function runAppReadyStartupSequence() {
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
}

function runAppBeforeQuitCleanupSequence() {
  writePetStats();
  stopHoverPolling();
  stopWindowSurfacePolling();
  stopWindowRoamPolling();
  stopEyeTrackingPolling();
  stopIntimacyDecayTimer();
  clearHoverIntent();
  clearDragState({ notify: false });
  clearStartupBubbleTimer();
  clearHoverHideTimer();
  clearMenuHideTimer();
  if (randomGreetingTimer) {
    clearTimeout(randomGreetingTimer);
    randomGreetingTimer = null;
  }
  clearDisplayMetricsSettleTimer();
}

registerAppLifecycle({
  app,
  screen,
  process,
  gotSingleInstanceLock,
  handlers: {
    onSecondInstance: () => {
      ensurePetWindow();
    },
    onReady: runAppReadyStartupSequence,
    onBeforeQuit: runAppBeforeQuitCleanupSequence,
    onWindowAllClosed: () => {
      if (process.platform !== "darwin") {
        app.quit();
      }
    },
    onActivate: () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createPetWindow();
      }
    },
    onDisplayMetricsChanged: (_event, _display, metrics) => {
      if (metrics.includes("workArea")) {
        scheduleDarwinDisplayMetricsSettle();
      }
    }
  }
});

function handleSwitchVariant(_event, variant) {
  if (!SWITCHABLE_VARIANTS.includes(variant)) {
    return { success: false, error: `Cannot switch to variant: ${variant}` };
  }
  writePreferredVariant(variant, basePetVariant);
  log(`switching variant to ${variant}, restarting app`);
  app.releaseSingleInstanceLock();
  app.relaunch();
  app.exit();
  return { success: true };
}

const contactQrCodeResolver = createContactQrCodeResolver({
  fs: require("fs"),
  path,
  os: require("os"),
  app,
  process,
  __dirname
});

function handleGetContactQrCode() {
  return contactQrCodeResolver.resolveContactQrCode();
}

function handleShowMenu() {
  recordUserOperation();
  togglePetMenu();
}

function handleMenuPanelEnter() {
  setIsPointerOverMenuPanel(true);
  clearMenuHideTimer();
}

function handleMenuPanelLeave() {
  setIsPointerOverMenuPanel(false);
  scheduleHidePetMenu();
}

function handleResizeBubble(_event, size) {
  if (!size || !Number.isFinite(size.width)) {
    return;
  }
  resizeStartupBubble(size.width, size.height);
}

function handleHoverLeave() {
  if (isCursorInsideSpriteRect()) {
    beginHoverFromPointer();
    return;
  }

  setIsPointerOverPet(false);
  clearHoverIntent();
  scheduleHideHoverPanel();
}

function handleHoverPanelEnter() {
  setIsPointerOverHoverPanel(true);
  clearHoverHideTimer();
}

function handleHoverPanelLeave() {
  setIsPointerOverHoverPanel(false);
  scheduleHideHoverPanel();
}

function handleHoverAction(_event, state) {
  if (typeof state !== "string") {
    return;
  }
  if (!states.some((item) => item.id === state)) {
    return;
  }
  setState(state);
  hideHoverPanel();
}

function handleRenderedFrame(_event, info) {
  updateRenderedFrame(info);
}

function handleRendererDiagnostic(_event, message) {
  if (WALK_DIAGNOSTICS_ENABLED && typeof message === "string") {
    logWalkDiagnostic(`renderer ${message}`);
  }
}

function handleSetState(_event, state) {
  if (typeof state === "string") {
    setState(state);
  }
}

function handleWakeSleepingPet() {
  if (!petRuntimeConfig.features.wakeHiss || (activeState !== STATE_YAWN && activeState !== STATE_SLEEP)) {
    return;
  }
  recordUserOperation();
  clearHoverIntent();
  hideHoverPanel();
  setState(STATE_HISS, false);
}

function handleCompleteOneShot(_event, state) {
  if (typeof state === "string") {
    completeOneShotState(state);
  }
}

function handleResetPosition() {
  recordUserOperation();
  settlePetQuietly();
}

function handleResetScale() {
  recordUserOperation();
  resetPetScale();
}

function handleHidePet() {
  recordUserOperation();
  petWindow?.hide();
}

function handleQuit() {
  app.quit();
}

function handleAdjustScale(_event, deltaY) {
  if (Number.isFinite(deltaY)) {
    recordUserOperation();
    adjustPetScale(deltaY);
  }
}

function handleDragStart(_event, point) {
  if (!petWindow || petWindow.isDestroyed() || !isScreenPoint(point)) {
    return;
  }
  if (isCustomizationVisible()) {
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
  hideCustomizationPanel();
  setIsPointerOverHoverPanel(false);
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
}

function handleDragEnd() {
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
    logWalkDiagnostic(`drag-end dock-start state=${activeState} surface=${getCurrentSurface()?.type || "unknown"} paused=${isInteractionPaused()} reasons=${getInteractionPauseSummary()}`);
    setImmediate(() => {
      dockPetAfterDrag();
    });
    clearDragState({ notify: true, keepPause: true });
    return;
  }
  clearDragState({ notify: true });
}

registerIpcHandlers({
  ipcMain,
  handlers: {
    // invoke handlers (8 个)
    getConfig: buildPetConfig,
    setAutoStart: (_event, enabled) => setAutoStartPreference(enabled),
    toggleAutoStart,
    setWindowRoam: (_event, enabled) => setWindowRoamPreference(enabled),
    setEyeTracking: (_event, enabled) => setEyeTrackingPreference(enabled),
    switchVariant: handleSwitchVariant,
    advanceWalkStep: (_event, frameStep, elapsedMs) => advanceWalkStep(frameStep, elapsedMs),
    getContactQrCode: handleGetContactQrCode,
    // on handlers (26 个)
    showMenu: handleShowMenu,
    resizeMenu: (_event, height) => resizePetMenu(height),
    menuPanelEnter: handleMenuPanelEnter,
    menuPanelLeave: handleMenuPanelLeave,
    resizeBubble: handleResizeBubble,
    hoverEnter: beginHoverFromPointer,
    hoverLeave: handleHoverLeave,
    hoverPanelEnter: handleHoverPanelEnter,
    hoverPanelLeave: handleHoverPanelLeave,
    hoverAction: handleHoverAction,
    renderedFrame: handleRenderedFrame,
    rendererDiagnostic: handleRendererDiagnostic,
    setState: handleSetState,
    wakeSleepingPet: handleWakeSleepingPet,
    completeOneShot: handleCompleteOneShot,
    resetPosition: handleResetPosition,
    resetScale: handleResetScale,
    show: ensurePetWindow,
    hide: handleHidePet,
    quit: handleQuit,
    hideMenu: hidePetMenu,
    showCustomization: showCustomizationPanel,
    hideCustomization: hideCustomizationPanel,
    adjustScale: handleAdjustScale,
    dragStart: handleDragStart,
    dragEnd: handleDragEnd
  }
});



