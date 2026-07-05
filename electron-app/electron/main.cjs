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
// 宠物主窗口生命周期与位置包装控制器，持有 petWindow 运行态
const { createPetWindowController } = require("./windows/pet-window-controller.cjs");
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
const { createDragController } = require("./behavior/drag-controller.cjs");
const { createStateController } = require("./behavior/state-controller.cjs");
const { createScreenMetricsController } = require("./platform/screen-metrics.cjs");
const { createAutoStartController } = require("./platform/auto-start.cjs");
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
// pet stats 纯规则与读写边界模块
const { createPetStatsStore } = require("./pet/pet-stats-store.cjs");
const petStatsRules = require("./pet/pet-stats-rules.cjs");
const { createPetStatsController } = require("./pet/pet-stats-controller.cjs");
const { createSurfaceScaleController } = require("./pet/surface-scale-controller.cjs");
const frameGeometry = require("./pet/frame-geometry.cjs");
const frameVisibleBounds = require("./pet/frame-visible-bounds.cjs");
const { createFrameBoundsController } = require("./pet/frame-bounds-controller.cjs");
const frameHitTest = require("./pet/frame-hit-test.cjs");
const petScaleRules = require("./pet/pet-scale-rules.cjs");
const surfaceFitRules = require("./pet/surface-fit-rules.cjs");
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
  WINDOW_SURFACE_STABILITY_TOLERANCE_PX,
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
  PET_CLICK_HOVER_SUPPRESS_MS,
  WINDOW_SURFACE_POLL_INTERVAL_MS,
  WINDOW_SURFACE_HEAVY_RECHECK_MS,
  WINDOW_SURFACE_CACHE_MS,
  WINDOW_SURFACE_ASYNC_REFRESH_MIN_MS,
  WINDOW_SURFACE_DRAG_REFRESH_MIN_MS,
  WINDOW_SURFACE_BACKGROUND_REFRESH_MS,
  WINDOW_DOCK_DRAG_RETRY_DELAY_MS,
  WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS,
  WINDOW_ROAM_POLL_INTERVAL_MS,
  WINDOW_ROAM_MAX_MISSING_TICKS,
  WINDOW_ROAM_START_ATTACH_DELAY_MS,
  WINDOW_ROAM_INVALID_FALLBACK_SUPPRESS_MS,
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
  RAGDOLL_YAWN_SLEEP_LOOP_MAX_MS,
  INTIMACY_DECAY_INTERVAL_MS,
  VISIBLE_ALPHA_THRESHOLD,
  PET_STAT_MAX,
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
const STATE_SPLITS = petActionIds.splits;
const STATE_SHAKE = petActionIds.shake;
const STATE_YAWN = petActionIds.yawn;
const STATE_SLEEP = petActionIds.sleep;
const STATE_HISS = petActionIds.hiss;

const HOVER_PANEL_HEIGHT = petRuntimeConfig.channelConfig.hoverPanelHeight;
const DEFAULT_PET_SCALE = petRuntimeConfig.defaultScale;
const DEFAULT_STATE = STATE_SQUAT;
const ONE_SHOT_STATES = new Set([STATE_WALK, STATE_FEED, STATE_BALL, STATE_SPIN, STATE_LICK, STATE_BELLY, STATE_STRETCH, STATE_SPLITS, STATE_SHAKE, STATE_HISS]);
const TABBY_IDLE_STATES = new Set([STATE_YAWN, STATE_SLEEP, STATE_HISS]);

// STATE_* 常量映射，传给 rules 模块做相等比较（rules 不依赖 petActionIds）
const petStatsStateConstants = {
  squat: STATE_SQUAT,
  feed: STATE_FEED,
  lie: STATE_LIE,
  lick: STATE_LICK,
  belly: STATE_BELLY,
  stretch: STATE_STRETCH,
  splits: STATE_SPLITS
};

const gotSingleInstanceLock = app.requestSingleInstanceLock();

// sharedGreetings 已从 pet/pet-states.cjs 导入

// states 已通过 buildPetStates 从 pet/pet-states.cjs 构建
// 注意：assetsRoot 传 "animations"（相对路径），与 pet-states.cjs 中 getActionAssetFolder 返回的 "animations/${prefix}_${action}" 一致；
// listFrames/listFramePaths/readMetadata 均通过 path.join(getAssetsRoot(), folder) 拼接，期望 folder 为相对路径。
// 任务原指示使用 getAssetsRoot() 会导致生成绝对路径且缺少 "animations" 前缀，破坏路径拼接，故改用 "animations"。
const states = buildPetStates(
  petActionIds,
  "animations",
  petAnimationPrefix,
  sharedGreetings,
  petRuntimeConfig.actionLabelOverrides
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
let homeDisplayId = null;
let homeWorkArea = null;
let randomGreetingTimer = null;
let tabbyIdlePollTimer = null;
let tabbySleepPoseTimer = null;
let tabbySleepPoseSwitchAt = 0;
let ragdollYawnSleepLoopTimer = null;
let appLifecycleShuttingDown = false;
let idleGreetingPool = [];
let lastUserOperationAt = Date.now();
let lastTabbyUserOperationAt = Date.now();
let currentSurface = null;
let windowSurfacePollTimer = null;
let lastWindowSurfaceHeavyCheckAt = 0;
let windowSurfaceMissingTicks = 0;
let walkPausedAt = 0;
let lastWalkScaleApplyAt = 0;
let lastWalkSurfaceSignature = "";
let windowDockInProgress = false;
let windowDockHoverSuppressedUntil = 0;
let petClickHoverSuppressedUntil = 0;
const statsFile = path.join(variantDataRoot, "pet-stats.json");
const legacyStatsFile = petRuntimeConfig.variant === basePetVariant ? path.join(userDataRoot, "pet-stats.json") : "";
const logDir = path.join(userDataRoot, "logs");

// 接入 core/logger.cjs：文件日志与行走诊断日志
_logger = createLogger(logDir, { walkDiagnosticsEnabled: WALK_DIAGNOSTICS_ENABLED });

// pet stats 读写边界 store，注入 fs/statsFile/legacyStatsFile/log
// log 在第 230 行定义为稳定引用（捕获 _logger），此处已可用
const petStatsStore = createPetStatsStore({
  fs,
  statsFile,
  legacyStatsFile,
  log: (message) => log(message)
});

// 接入 pet/pet-stats-controller.cjs：pet stats 状态所有权与副作用编排
// 采用薄包装接线：15 个 stats 函数保留原函数名，函数体委托给 petStatsController
// petStats/intimacyDecayTimer/last*DecayAt 所有权迁移到控制器，main.cjs 不再直接持有
// onStatsChanged/onStatMessages 由 main 持有 UI 副作用（sendStats/showStatMessages，函数声明提升可引用）
// pickStatMessage 封装 pickRandom(statMessages[key])，使 controller 不感知中文文案
const petStatsController = createPetStatsController({
  petStatsRules,
  petStatsStore,
  getNow: () => Date.now(),
  randomStatDelta,
  pickStatMessage: (key) => pickRandom(statMessages[key]),
  onStatsChanged: sendStats,
  onStatMessages: showStatMessages,
  // 可变状态访问器（实时读取 main.cjs 状态，避免快照）
  getWalkLoop: () => walkLoop,
  getWalkPausedAt: () => walkPausedAt,
  getLastUserOperationAt: () => lastUserOperationAt,
  getLastTabbyUserOperationAt: () => lastTabbyUserOperationAt,
  getTabbySleepPoseSwitchAt: () => tabbySleepPoseSwitchAt,
  // 依赖函数（main.cjs function 声明，hoisted 可用；walk-clock 已 require）
  getWalkLoopRemainingMs,
  getLocalDateKey,
  daysBetween,
  // 状态常量与配置常量
  petStatsStateConstants,
  INTIMACY_DECAY_INTERVAL_MS,
  PET_STAT_MAX,
  IDLE_GREETING_DELAY_MS,
  TABBY_YAWN_IDLE_MS,
  TABBY_SLEEP_POSE_MS,
  WALK_LOOP_DURATION_MS,
  INTERACTION_INTIMACY_GAIN_MIN,
  INTERACTION_INTIMACY_GAIN_MAX,
  actionStatEffects: petRuntimeConfig.actionStatEffects
});

// 接入 pet/frame-bounds-controller.cjs：帧缓存与读图控制器
// visibleBoundsCache/headBoundsCache/framePixelCache 所有权迁移到控制器
// main.cjs 保留同名薄包装委托，nativeImage 通过 context 注入
const frameBoundsController = createFrameBoundsController({
  nativeImage,
  getState,
  listFramePaths,
  getPetSpriteSize,
  VISIBLE_ALPHA_THRESHOLD,
  PET_MENU_HEAD_SCAN_RATIO,
  frameGeometry,
  frameVisibleBounds
});

// 接入 pet/surface-scale-controller.cjs：surface 缩放副作用编排控制器
// petScale/preferredPetScale 运行态所有权迁入控制器，main.cjs 保留同名薄包装委托
// currentSurface/taskbarWalkRunway/walkTrackX 仍由 main.cjs 持有，经 getter/setter 注入
// 依赖函数均为 main.cjs function 声明（hoisted 可用）；overlay 刷新回调经箭头函数延迟访问
const surfaceScaleController = createSurfaceScaleController({
  // 纯计算委托（function 声明，hoisted）
  clampPetScale,
  getPetWindowWidth,
  getPetWindowHeight,
  getPetSpriteSize,
  getSpriteLocalXForWindowWidth,
  // surface/落地回调
  getSurfaceWorkArea,
  getVisibleSpriteInsets,
  getGroundedWindowYForSurface,
  clampPetWindowPositionToSurface,
  getTaskbarWalkCenterLimits,
  ensureTaskbarWalkRunwayForCenter,
  isTaskbarWalkActive,
  clearPetWindowHitRegion,
  getWalkVisibleCenterFromWindowX,
  getTaskbarWalkRunwayWindowWidth,
  setPetWindowPosition,
  syncWalkTrackX,
  updatePetWindowMousePassthrough,
  scheduleWalkLoopTimeout,
  // surface 状态回调
  resetToTaskbarSurface,
  setCurrentSurface,
  getCurrentSurface,
  getVisiblePetRectFromBounds,
  getWindowXForVisibleCenter,
  setWalkWindowPosition,
  setTaskbarWalkWindowPositionForCenter,
  isWalkingState,
  // overlay 刷新回调（经箭头函数延迟访问各 overlay 控制器，控制器在后续创建）
  refreshMenuAnchorAfterScale: (...args) => refreshMenuAnchorAfterScale(...args),
  refreshHoverAnchorAfterScale: (...args) => refreshHoverAnchorAfterScale(...args),
  refreshCustomizationAnchorAfterScale: (...args) => refreshCustomizationAnchorAfterScale(...args),
  repositionStartupBubbleWindow: (...args) => repositionStartupBubbleWindow(...args),
  // 通知回调（封装 safeSend 的 "pet:scale-changed" 通知）
  sendScaleChanged: (summary) => safeSend(getPetWindow(), "pet:scale-changed", summary),
  // 偏好持久化
  preferencesStore,
  // 窗口与运行态访问器（实时读写 main.cjs 状态，避免快照）
  getPetWindow: () => petWindowController.getPetWindow(),
  getActiveState: () => activeState,
  getWalkDirection: () => walkDirection,
  getTaskbarWalkRunway: () => taskbarWalkRunway,
  setTaskbarWalkRunway: (v) => { taskbarWalkRunway = v; },
  getWalkTrackX: () => walkTrackX,
  setWalkTrackX: (v) => { walkTrackX = v; },
  // 日志
  log,
  // 常量
  DEFAULT_PET_SCALE,
  PET_SCALE_MIN,
  PET_SCALE_MAX,
  PET_SCALE_STEP,
  VISIBLE_TOP_GAP,
  WINDOW_DOCK_DEBUG,
  WINDOW_DOCK_COARSE_CORRECTION_LIMIT,
  WINDOW_DOCK_FINE_CORRECTION_LIMIT
});

// 接入 windows/overlay-geometry.cjs：overlay 窗口定位几何统一收口
// state accessor 间接层：menu 状态通过延迟访问器读 menuController（之后创建）
// hover 状态读 main.cjs 本地状态；customization 状态通过延迟访问器读 customizationController
const overlayGeometry = createOverlayGeometry({
  // 全局状态访问器
  getActiveState: () => activeState,
  getWalkDirection: () => walkDirection,
  getCurrentSurface,
  getPetWindow: () => petWindowController.getPetWindow(),
  getPetScale: () => surfaceScaleController.getPetScale(),
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
  getPetWindow: () => petWindowController.getPetWindow(),
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
  getPetWindow: () => petWindowController.getPetWindow(),
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
  getPetWindow: () => petWindowController.getPetWindow(),
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
  getPetWindow: () => petWindowController.getPetWindow(),
  getActiveState: () => activeState,
  getCurrentSurface,
  getDragState: () => dragController.getDragState(),
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
  getPetWindow: () => petWindowController.getPetWindow(),
  getDragState: () => dragController.getDragState(),
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
  getPetWindow: () => petWindowController.getPetWindow(),
  getDragState: () => dragController.getDragState(),
  getLastDragSample: () => dragController.getLastDragSample(),
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
  getPetWindow: () => petWindowController.getPetWindow(),
  getMenuWindow,
  getHoverWindow,
  getActiveState: () => activeState,
  getDragState: () => dragController.getDragState(),
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
  getPetWindow: () => petWindowController.getPetWindow(),
  getActiveState: () => activeState,
  getWalkDirection: () => walkDirection,
  getDragState: () => dragController.getDragState(),
  getWindowDockInProgress: () => windowDockInProgress,
  getWindowRoamEnabled: () => preferencesStore.getWindowRoamEnabled(),
  canToggleWindowRoam: () => preferencesStore.canToggleWindowRoam(),
  // 依赖函数
  refreshWindowSurfaceCandidatesAsync,
  parseWindowHwnd,
  getCachedWindowSurfaceCandidates,
  buildWindowSurfaceFromItem,
  getVisiblePetRectFromBounds,
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
  WINDOW_ROAM_POLL_INTERVAL_MS,
  WINDOW_ROAM_START_ATTACH_DELAY_MS
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
  clearWindowRoamSuppression,
  markWindowRoamAttached,
  markManualTaskbarHold,
  markWindowInvalidTaskbarSettleUntil
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
  setWalkWindowPosition,
  // 外部状态访问器（实时读取 main.cjs 状态，避免快照）
  getPetWindow: () => petWindowController.getPetWindow(),
  getActiveState: () => activeState,
  getPetScale: () => surfaceScaleController.getPetScale(),
  getPreferredPetScale: () => surfaceScaleController.getPreferredPetScale(),
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
  settlePetInPlaceAfterDrag,
  findCandidateByHwnd,
  buildWindowSurfaceFromItem,
  getVisiblePetRectFromBounds,
  resetToTaskbarSurface,
  getGroundedWindowYForSurface,
  getVisibleSpriteInsets,
  getPetSpriteSize,
  getPetWindowPositionForVisibleRect,
  getSurfaceVisibleTop,
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
  markManualTaskbarHold,
  markWindowInvalidTaskbarSettleUntil,
  markWindowRoamAttached,
  // retry 回调，委托给 main.cjs 薄包装后的 dockPetAfterDrag
  retryDockPetAfterDrag: (...args) => dockPetAfterDrag(...args),
  // 外部状态访问器（实时读取 main.cjs 状态，避免快照）
  getPetWindow: () => petWindowController.getPetWindow(),
  getActiveState: () => activeState,
  getWalkDirection: () => walkDirection,
  getDragState: () => dragController.getDragState(),
  getPetRuntimeConfig: () => petRuntimeConfig,
  getPetScale: () => surfaceScaleController.getPetScale(),
  getPreferredPetScale: () => surfaceScaleController.getPreferredPetScale(),
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
  WINDOW_SURFACE_HEAVY_RECHECK_MS,
  WINDOW_SURFACE_POLL_INTERVAL_MS,
  WINDOW_ROAM_INVALID_FALLBACK_SUPPRESS_MS
});

// 接入 behavior/drag-controller.cjs：拖拽运行态与拖拽开始、更新、结束流程
// 采用薄包装接线：6 个拖拽函数保留原函数名，函数体委托给 dragController
// 拖拽运行态（dragTimer/dragState/lastDragSample）所有权迁入控制器，main.cjs 通过 getter 访问
const dragController = createDragController({
  // 依赖函数（main.cjs function 声明，hoisted 可用）
  safeSend,
  removeInteractionPause,
  clampPetWindowPosition,
  setPetWindowPosition,
  syncWalkTrackX,
  getLastWindowSurfaceAsyncRefreshAt,
  refreshWindowSurfaceCandidatesAsync,
  getCursorScreenPoint: () => screen.getCursorScreenPoint(),
  isScreenPoint,
  isCustomizationVisible,
  materializeTaskbarWalkRunway,
  recordUserOperation,
  addInteractionPause,
  clearHoverIntent,
  hideStartupBubble,
  hidePetMenu,
  hideHoverPanel,
  hideCustomizationPanel,
  setIsPointerOverHoverPanel,
  log,
  logWalkDiagnostic,
  isInteractionPaused,
  getInteractionPauseSummary,
  // dock 回调，委托给 main.cjs 薄包装后的 dockPetAfterDrag（仍委托 dockController）
  dockPetAfterDrag: (...args) => dockPetAfterDrag(...args),
  // 外部状态访问器（实时读取 main.cjs 状态，避免快照）
  getPetWindow: () => petWindowController.getPetWindow(),
  getActiveState: () => activeState,
  getWalkDirection: () => walkDirection,
  getCurrentSurface,
  getTaskbarWalkRunway: () => taskbarWalkRunway,
  getWindowDockInProgress: () => windowDockInProgress,
  setWindowDockInProgress: (v) => { windowDockInProgress = v; },
  // 常量
  ENABLE_WINDOW_DOCKING,
  WINDOW_SURFACE_DRAG_REFRESH_MIN_MS
});

// 接入 behavior/state-controller.cjs：状态切换、one-shot 动作结算、起点复位与静默归位编排
// 采用薄包装接线：6 个状态机函数保留原函数名，函数体委托给 stateController
// pendingActionStatsState 所有权迁入控制器，main.cjs 不再直接持有
// activeState/selectedState/walkDirection 仍由 main.cjs 持有，经 getter/setter 注入
const stateController = createStateController({
  // 通知广播器（main.cjs function 声明，hoisted 可用）
  sendPetState,
  sendWalkDirection,
  // surface/scale/window 回调（不迁移，保留在 main.cjs）
  groundPetToSurface,
  applySurfaceScale,
  resetToTaskbarSurface,
  setCurrentSurface,
  getCurrentSurface,
  getSurfaceDisplay,
  getSurfaceWorkArea,
  getTaskbarHomeVisibleRight,
  getSurfaceVisibleTop,
  getVisibleSpriteInsets,
  getPetSpriteSize,
  getPetWindowPositionForVisibleRect,
  clampPetWindowPositionToSurface,
  setPetWindowPosition,
  syncWalkTrackX,
  markManualTaskbarHold,
  preserveBottomAnchorForState,
  // walk 回调
  resetWalkRuntime,
  startWalkLoop,
  clearTabbySleepPoseTimer,
  scheduleTabbySleepPose,
  applyInterruptedWalkStats,
  applyActionStats,
  shouldDelayActionStats,
  clearPendingWalkBubbleMessage,
  showPendingWalkBubbleMessage,
  materializeTaskbarWalkRunwayForState,
  // 菜单/hover/bubble 回调
  hideStartupBubble,
  hidePetMenu,
  hideHoverPanel,
  showStatMessages,
  // stats 回调
  recordUserOperation,
  recordInteraction,
  // 状态查询回调
  getDefaultDirectionForState,
  getTransitionBottomAnchor,
  getState,
  // 拖拽回调
  clearDragState,
  // home display setter（moveToStartPosition 写入 homeDisplayId/homeWorkArea）
  setHomeDisplayId: (id) => { homeDisplayId = id; },
  setHomeWorkArea: (area) => { homeWorkArea = area; },
  // 日志
  log,
  // 共享运行态 getter/setter（实时读写 main.cjs 状态，避免快照）
  getActiveState: () => activeState,
  setActiveState: (next) => { activeState = next; },
  getSelectedState: () => selectedState,
  setSelectedState: (next) => { selectedState = next; },
  getWalkDirection: () => walkDirection,
  setWalkDirectionValue: (next) => { walkDirection = next; },
  // 共享运行态访问器
  getTaskbarWalkRunway: () => taskbarWalkRunway,
  // 窗口访问器
  getPetWindow: () => petWindowController.getPetWindow(),
  // 常量
  DEFAULT_STATE,
  STATE_WALK,
  STATE_SLEEP,
  STATE_YAWN,
  STATE_HISS,
  TABBY_IDLE_STATES,
  ONE_SHOT_STATES,
  states
});

// 接入 windows/pet-window-controller.cjs：宠物主窗口生命周期与位置包装控制器
// 采用薄包装接线：6 个窗口函数保留原函数名，函数体委托给 petWindowController
// petWindow 运行态所有权迁入控制器，main.cjs 不再直接持有
const petWindowController = createPetWindowController({
  // Electron 与运行时
  BrowserWindow,
  createOverlayWindow,
  path,
  __dirname,
  getAppPageUrl,
  getAppIconPath,
  log,
  process,
  screen,
  // 依赖函数（main.cjs function 声明，hoisted 可用）
  getPetWindowWidth,
  getPetWindowHeight,
  getVisiblePetRectFromBounds,
  moveToStartPosition,
  sendPetState,
  showStartupBubble,
  repositionStartupBubbleWindow,
  recordUserOperation,
  clamp,
  // 常量
  VISIBLE_SIDE_GAP,
  VISIBLE_TOP_GAP,
  VISIBLE_BOTTOM_GAP
});

const autoStartController = createAutoStartController({
  app,
  process,
  execFile,
  execFileSync,
  petRuntimeConfig,
  WINDOWS_STARTUP_RUN_KEY,
  isAutoStartPreferenceLoaded: () => preferencesStore.isAutoStartPreferenceLoaded(),
  setAutoStartEnabled: (enabled) => preferencesStore.setAutoStartEnabled(enabled),
  writeAutoStartPreference: (enabled) => writeAutoStartPreference(enabled),
  sendMenuConfig
});

function getAutoStartCommand() {
  return autoStartController.getAutoStartCommand();
}

function readAutoStartEnabledSync() {
  return autoStartController.readAutoStartEnabledSync();
}

function readAutoStartEnabledAsync(callback) {
  return autoStartController.readAutoStartEnabledAsync(callback);
}

function readAutoStartPreference() {
  preferencesStore.readAutoStartPreference();
}

function writeAutoStartPreference(enabled) {
  preferencesStore.writeAutoStartPreference(enabled);
}

function refreshAutoStartCacheAsync() {
  return autoStartController.refreshAutoStartCacheAsync();
}

function syncAutoStartPreferenceFromRegistrySync() {
  return autoStartController.syncAutoStartPreferenceFromRegistrySync();
}

function setAutoStartEnabled(enabled) {
  return autoStartController.setAutoStartEnabled(enabled);
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
  return surfaceScaleController.readPetScalePreference();
}

function writePetScalePreference() {
  return surfaceScaleController.writePetScalePreference();
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
  return petStatsRules.getLocalDateKey(date);
}

function daysBetween(startDateKey, endDateKey) {
  return petStatsRules.daysBetween(startDateKey, endDateKey);
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
  return petStatsController.normalizePetStats(stats);
}

function resumeNaturalStatsTimers(now) {
  return petStatsController.resumeNaturalStatsTimers(now);
}

function readPetStats() {
  return petStatsController.readPetStats();
}

function getPetWindowWidth() {
  return petScaleRules.getPetWindowWidthFromScale(BASE_PET_WINDOW_WIDTH, surfaceScaleController.getPetScale());
}

function getPetWindowHeight() {
  return petScaleRules.getPetWindowHeightFromScale(BASE_PET_WINDOW_HEIGHT, surfaceScaleController.getPetScale());
}

function getPetSpriteSize() {
  return petScaleRules.getPetSpriteSizeFromScale(BASE_PET_SPRITE_SIZE, surfaceScaleController.getPetScale());
}

function getSpriteLocalXForWindowWidth(windowWidth = getPetWindowWidth()) {
  return petScaleRules.getSpriteLocalXForWindowWidthAndSpriteSize(windowWidth, getPetSpriteSize());
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
  return petScaleRules.clampPetScale(value, PET_SCALE_MIN, PET_SCALE_MAX);
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
  return surfaceFitRules.validateWindowSurfaceBounds(
    surface,
    display.workArea,
    display.id,
    VISIBLE_SIDE_GAP,
    VISIBLE_TOP_GAP,
    WINDOW_DOCK_GAP,
    WINDOW_DOCK_MIN_WIDTH
  );
}

function getCurrentSurface() {
  if (currentSurface?.type === "floating") {
    return currentSurface;
  }
  const validWindowSurface = validateWindowSurface(currentSurface);
  if (validWindowSurface) {
    currentSurface = validWindowSurface;
    return currentSurface;
  }
  currentSurface = getTaskbarSurfaceForBounds();
  return currentSurface;
}

function setCurrentSurface(surface) {
  if (surface?.type === "window") {
    const validatedSurface = validateWindowSurface(surface);
    currentSurface = validatedSurface
      ? surfaceFitRules.stabilizeWindowSurfaceGeometry(
        currentSurface,
        validatedSurface,
        WINDOW_SURFACE_STABILITY_TOLERANCE_PX
      )
      : getTaskbarSurfaceForBounds();
  } else {
    currentSurface = surface || getTaskbarSurfaceForBounds();
  }
  if (currentSurface.type !== "window") {
    windowSurfaceMissingTicks = 0;
  }
  const display = getSurfaceDisplay(currentSurface);
  homeDisplayId = display.id;
  homeWorkArea = display.workArea;
  return currentSurface;
}

function resetToTaskbarSurface(bounds = getPetWindowBoundsSafe()) {
  const surface = getTaskbarSurfaceForBounds(bounds);
  return setCurrentSurface(surface);
}

function createFloatingSurfaceForBounds(bounds, stateId = activeState, direction = walkDirection) {
  if (!bounds) {
    return null;
  }
  const baseSurface = getTaskbarSurfaceForBounds(bounds);
  const visibleRect = getVisiblePetRectFromBounds(bounds, stateId, direction);
  return {
    type: "floating",
    displayId: baseSurface.displayId,
    left: baseSurface.left,
    right: baseSurface.right,
    groundY: Math.round(visibleRect.y + visibleRect.height),
    workArea: baseSurface.workArea
  };
}

function getSurfaceWorkArea(surface = getCurrentSurface()) {
  if (surface?.workArea) {
    return surface.workArea;
  }
  return getSurfaceDisplay(surface).workArea;
}

function getSurfaceGroundY(surface = getCurrentSurface(), visibleLeft = null, visibleRight = null) {
  return surfaceFitRules.getSurfaceGroundYFromSurface(surface, visibleLeft, visibleRight);
}

function getSurfaceVisibleTop(surface = getCurrentSurface(), stateId = activeState, direction = walkDirection, visibleLeft = null, visibleRight = null) {
  const visibleInsets = getVisibleSpriteInsets(stateId, direction);
  const groundY = getSurfaceGroundY(surface, visibleLeft, visibleRight);
  return surfaceFitRules.getSurfaceVisibleTopFromGroundY(groundY, getPetSpriteSize(), visibleInsets.top, visibleInsets.bottom);
}

function getGroundedWindowYForSurface(surface = getCurrentSurface(), stateId = activeState, direction = walkDirection, visibleLeft = null, visibleRight = null) {
  const visibleInsets = getVisibleSpriteInsets(stateId, direction);
  const groundY = getSurfaceGroundY(surface, visibleLeft, visibleRight);
  const visibleTop = surfaceFitRules.getSurfaceVisibleTopFromGroundY(groundY, getPetSpriteSize(), visibleInsets.top, visibleInsets.bottom);
  return surfaceFitRules.getGroundedWindowYFromSurface(visibleTop, getPetWindowHeight(), getPetSpriteSize(), visibleInsets.top);
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
  const visibleInsets = getVisibleSpriteInsets(stateId, direction);
  const groundY = getSurfaceGroundY(surface, visibleRect.x, visibleRect.x + visibleRect.width);
  const visibleTop = surfaceFitRules.getSurfaceVisibleTopFromGroundY(groundY, getPetSpriteSize(), visibleInsets.top, visibleInsets.bottom);
  const surfaceY = surfaceFitRules.getGroundedWindowYFromSurface(visibleTop, windowHeight, getPetSpriteSize(), visibleInsets.top);
  return surfaceFitRules.clampWindowPositionToSurface(x, y, surface.left, surface.right, visibleRect, surfaceY);
}

function getVisibleBottomPoint(bounds = getPetWindowBoundsSafe(), stateId = activeState, direction = walkDirection) {
  if (!bounds) {
    return null;
  }
  const visibleRect = getVisiblePetRectFromBounds(bounds, stateId, direction);
  return frameGeometry.getBottomAnchorFromVisibleRect(visibleRect);
}

function getRenderedFrameBottomAnchor(bounds = getPetWindowBoundsSafe(), stateId = activeState, direction = walkDirection) {
  if (!bounds) {
    return null;
  }
  const visibleRect = getRenderedFrameVisibleRectFromBounds(bounds, stateId, direction)
    || getVisiblePetRectFromBounds(bounds, stateId, direction);
  return frameGeometry.getBottomAnchorFromVisibleRect(visibleRect);
}

function getTransitionBottomAnchor(stateId = activeState, direction = walkDirection) {
  const visibleRect = taskbarWalkRunway && isTaskbarWalkActive()
    ? getRenderedFrameVisibleRect()
    : null;
  if (visibleRect) {
    return frameGeometry.getBottomAnchorFromVisibleRect(visibleRect);
  }
  return getRenderedFrameBottomAnchor(getPetWindowBoundsSafe(), stateId, direction);
}

function preserveBottomAnchorForState(anchor, stateId = activeState, direction = walkDirection, surface = getCurrentSurface()) {
  if (!anchor || !getPetWindow() || getPetWindow().isDestroyed()) {
    return false;
  }
  const groundedY = getGroundedWindowYForSurface(surface, stateId, direction);
  const targetX = getFrameVisibleCenterWindowX(anchor.x, stateId, 0, direction);
  const next = clampPetWindowPositionToSurface(targetX, groundedY, surface, stateId, direction);
  setPetWindowPosition(next.x, next.y);
  syncWalkTrackX(next.x);
  return true;
}

function parseWindowSurfaceItems(rawOutput) {
  return windowSurfaceController.parseWindowSurfaceItems(rawOutput);
}

function parseWindowHwnd(value) {
  return windowSurfaceController.parseWindowHwnd(value);
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
  const dragSample = dragController.getDragState()?.lastSample || dragController.getLastDragSample();
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

function diagnoseDockTargetFromCache(bounds = getPetWindowBoundsSafe()) {
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

function getScaleForSurface(surface, requestedScale = surfaceScaleController.getPreferredPetScale(), stateId = activeState, direction = walkDirection) {
  return surfaceScaleController.getScaleForSurface(surface, requestedScale, stateId, direction);
}

function applySurfaceScale(surface, stateId = activeState, direction = walkDirection) {
  return surfaceScaleController.applySurfaceScale(surface, stateId, direction);
}

function groundPetToSurface(stateId = activeState, direction = walkDirection, surface = getCurrentSurface()) {
  return surfaceScaleController.groundPetToSurface(stateId, direction, surface);
}

function buildScaleSummary() {
  return surfaceScaleController.buildScaleSummary();
}

function sendScaleState() {
  return surfaceScaleController.sendScaleState();
}

function writePetStats() {
  return petStatsController.writePetStats();
}

function buildTimerSummary(now) {
  return petStatsController.buildTimerSummary(now);
}

function buildStatsSummary() {
  return petStatsController.buildStatsSummary();
}

function sendStats() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    return;
  }
  const stats = buildStatsSummary();
  broadcastToWindows([getPetWindow(), getMenuWindow(), getHoverWindow()], "pet:stats-changed", stats);
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

function stopTabbyIdlePolling() {
  if (tabbyIdlePollTimer) {
    clearInterval(tabbyIdlePollTimer);
    tabbyIdlePollTimer = null;
  }
}

function updateTabbyIdleActions() {
  if (!petRuntimeConfig.features.idleYawn || activeState !== DEFAULT_STATE || !canDrivePetStateFromTimer()) {
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

function clearRagdollYawnSleepLoopTimer() {
  if (ragdollYawnSleepLoopTimer) {
    clearTimeout(ragdollYawnSleepLoopTimer);
    ragdollYawnSleepLoopTimer = null;
  }
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
    if (!canDrivePetStateFromTimer()) {
      return;
    }
    setState(activeState === STATE_SLEEP ? STATE_YAWN : STATE_SLEEP, false);
  }, TABBY_SLEEP_POSE_MS);
}

function scheduleRagdollYawnSleepLoopTimeout(state) {
  if (petRuntimeConfig.variant !== "pet2609" || activeState !== state || state !== STATE_YAWN || ragdollYawnSleepLoopTimer) {
    return;
  }
  ragdollYawnSleepLoopTimer = setTimeout(() => {
    ragdollYawnSleepLoopTimer = null;
    if (petRuntimeConfig.variant === "pet2609" && activeState === STATE_YAWN && canDrivePetStateFromTimer()) {
      setState(STATE_WALK, false);
    }
  }, RAGDOLL_YAWN_SLEEP_LOOP_MAX_MS);
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
  return petStatsController.recordInteraction();
}

function updateStatPromptState(messages = []) {
  return petStatsController.updateStatPromptState(messages);
}

function applyNaturalStatsTick(now) {
  return petStatsController.applyNaturalStatsTick(now);
}

function startIntimacyDecayTimer() {
  return petStatsController.startIntimacyDecayTimer();
}

function stopIntimacyDecayTimer() {
  return petStatsController.stopIntimacyDecayTimer();
}

function applyActionStats(stateId) {
  return petStatsController.applyActionStats(stateId);
}

function shouldDelayActionStats(stateId) {
  return stateId === STATE_FEED || stateId === STATE_BALL || stateId === STATE_LICK || stateId === STATE_BELLY || stateId === STATE_STRETCH || stateId === STATE_SPLITS;
}

function showStatMessages(messages) {
  if (Array.isArray(messages) && messages.length > 0) {
    showBubbleMessage(messages[0], STARTUP_BUBBLE_DURATION_MS, { forceHideOverlays: true });
  }
}

function applyInterruptedWalkStats() {
  return petStatsController.applyInterruptedWalkStats();
}

function applyCompletedWalkStats() {
  return petStatsController.applyCompletedWalkStats();
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
    alwaysOnTop: getPetWindow()?.isAlwaysOnTop() ?? true,
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
  return frameBoundsController.getFrameVisibleBounds(filePath);
}

function getFramePixelData(filePath) {
  return frameBoundsController.getFramePixelData(filePath);
}

function getStateVisibleBounds(stateId = activeState) {
  return frameBoundsController.getStateVisibleBounds(stateId);
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
  const spriteRect = getSpriteRectFromBounds(windowBounds);
  return frameGeometry.getFrameVisibleRectFromBounds(frameBounds, spriteRect, state?.defaultFacing, direction);
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
  return frameGeometry.getFrameVisibleCenterWindowX(centerX, probe, visibleRect);
}

function syncDailyStats() {
  return petStatsController.syncDailyStats();
}

function getRenderedFrameVisibleRect() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
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
  return getFrameVisibleRectFromBounds(getPetWindow().getBounds(), stateId, frameIndex, direction);
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
  return frameBoundsController.getFrameHeadBounds(filePath);
}

function getStateHeadBounds(stateId = activeState) {
  return frameBoundsController.getStateHeadBounds(stateId);
}

function getVisibleSpriteInsets(stateId = activeState, direction = walkDirection) {
  const spriteSize = getPetSpriteSize();
  const bounds = getStateVisibleBounds(stateId);
  const state = getState(stateId);
  return frameGeometry.getVisibleSpriteInsetsFromBounds(bounds, spriteSize, direction, state?.defaultFacing);
}

function getAppPageUrl(hash) {
  return `${toFileUrl(path.join(__dirname, "..", "static", "index.html"))}#${hash}`;
}

// clamp 已从 shared/bounds.cjs 导入

function randomStatDelta(min, max) {
  const floor = Math.round(Number(min) || 0);
  const ceil = Math.round(Number(max) || 0);
  const low = Math.min(floor, ceil);
  const high = Math.max(floor, ceil);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function getPetSpriteRect() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    return null;
  }

  return getSpriteRectFromBounds(getPetWindow().getBounds());
}

function getVisiblePetRect() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    return null;
  }

  return getVisiblePetRectFromBounds(getPetWindow().getBounds(), activeState, walkDirection);
}

function getCurrentPetVisualRect(stateId = activeState, direction = walkDirection) {
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    return null;
  }
  return taskbarWalkRunway && isTaskbarWalkActive()
    ? getTaskbarRunwayVisualRect(stateId, direction)
    : getVisiblePetRectFromBounds(getPetWindow().getBounds(), stateId, direction);
}

function getCurrentPetVisualCenterX(stateId = activeState, direction = walkDirection) {
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    return null;
  }
  const rect = getCurrentPetVisualRect(stateId, direction);
  return rect ? Math.round(rect.x + rect.width / 2) : null;
}

function getSpriteRectFromBounds(bounds) {
  return frameGeometry.getSpriteRectFromBounds(bounds, {
    spriteSize: getPetSpriteSize(),
    runwayInfo: taskbarWalkRunway,
    isTaskbarWalkActive: isTaskbarWalkActive(),
    getSpriteLocalXForWindowWidth
  });
}

function getVisiblePetRectFromBounds(bounds, stateId = activeState, direction = walkDirection) {
  const spriteRect = getSpriteRectFromBounds(bounds);
  const insets = getVisibleSpriteInsets(stateId, direction);
  return frameGeometry.getVisiblePetRectFromBounds(spriteRect, insets);
}

function getPetWindowPositionForVisibleRect(left, top, stateId = activeState, direction = walkDirection) {
  const windowWidth = getPetWindowWidth();
  const windowHeight = getPetWindowHeight();
  const spriteSize = getPetSpriteSize();
  const horizontalInset = getSpriteLocalXForWindowWidth(windowWidth);
  const visibleInsets = getVisibleSpriteInsets(stateId, direction);
  return frameGeometry.getWindowPositionForVisibleRect(left, top, windowWidth, windowHeight, spriteSize, horizontalInset, visibleInsets);
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
  const baseRect = frameGeometry.getFrameVisibleRectFromBounds(
    headBounds,
    spriteRect,
    state?.defaultFacing,
    frameSnapshot.direction
  );
  return {
    x: baseRect.x + PET_MENU_HEAD_X_OFFSET,
    y: baseRect.y + PET_MENU_HEAD_Y_OFFSET,
    width: baseRect.width,
    height: baseRect.height
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
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    return;
  }
  safeSend(getPetWindow(), "pet:pause-state-changed", isInteractionPaused());
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
  return petScaleRules.getScaledOverlayCollisionPaddingFromScale(surfaceScaleController.getPetScale(), OVERLAY_COLLISION_PADDING_BASE, OVERLAY_COLLISION_PADDING_MIN, OVERLAY_COLLISION_PADDING_MAX);
}

function getScaledHoverBodyHitPadding() {
  return petScaleRules.getScaledHoverBodyHitPaddingFromScale(surfaceScaleController.getPetScale(), HOVER_BODY_HIT_PADDING_BASE, HOVER_BODY_HIT_PADDING_MIN, HOVER_BODY_HIT_PADDING_MAX);
}

function getScaledHoverAvoidPadding() {
  return petScaleRules.getScaledHoverAvoidPaddingFromSpriteSize(getPetSpriteSize(), HOVER_PANEL_AVOID_PADDING_MIN, HOVER_PANEL_AVOID_PADDING_SCALE);
}

function getCurrentPetHitRect() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
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
  if (!getPetWindow() || getPetWindow().isDestroyed() || !point) {
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
    : getSpriteRectFromBounds(getPetWindow().getBounds());
  const hitPadding = getHoverBodyHitPaddingForState(safeFrameInfo.stateId);
  if (!isPointInsideRect(point, expandRect(spriteRect, hitPadding))) {
    return false;
  }

  const state = getState(safeFrameInfo.stateId);
  return frameHitTest.isPointInsideVisiblePixels(point, spriteRect, pixelData, state?.defaultFacing, safeFrameInfo.direction, hitPadding, VISIBLE_ALPHA_THRESHOLD);
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

function getPetWindow() {
  return petWindowController.getPetWindow();
}

function getLivePetWindow() {
  const win = getPetWindow();
  return win && !win.isDestroyed() ? win : null;
}

function getPetWindowBoundsSafe() {
  const win = getLivePetWindow();
  return win ? win.getBounds() : null;
}

function canDrivePetStateFromTimer() {
  return !appLifecycleShuttingDown && Boolean(getLivePetWindow());
}

function setPetWindowPosition(x, y) {
  return petWindowController.setPetWindowPosition(x, y);
}

function clampPetWindowPosition(x, y) {
  return petWindowController.clampPetWindowPosition(x, y);
}

function createPetWindow() {
  return petWindowController.createPetWindow();
}

function restoreHoverAfterBubbleIfNeeded() {
  if (!getPetWindow() || getPetWindow().isDestroyed() || dragController.getDragState() || shouldSuppressHoverPanel()) {
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

function getPetClickHoverSuppressionMs() {
  return Math.max(0, petClickHoverSuppressedUntil - Date.now());
}

function suppressHoverAfterPetClick() {
  petClickHoverSuppressedUntil = Date.now() + PET_CLICK_HOVER_SUPPRESS_MS;
  setIsPointerOverPet(false);
  clearHoverIntent();
  hideHoverPanel();
}

function shouldSuppressHoverPanel() {
  return isStartupBubbleVisible()
    || windowDockInProgress
    || getBubbleHoverSuppressionMs() > 0
    || getWindowDockHoverSuppressionMs() > 0
    || getPetClickHoverSuppressionMs() > 0
    || (petRuntimeConfig.features.wakeHiss && activeState === STATE_HISS)
    || isCustomizationVisible()
    || activeState === STATE_SHAKE;
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
  if (!getPetWindow() || getPetWindow().isDestroyed() || !getPetWindow().isVisible()) {
    scheduleRandomGreeting(RANDOM_GREETING_RETRY_MS);
    return;
  }
  if (dragController.getDragState()) {
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
  return petWindowController.ensurePetWindow();
}

function sendPetState() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    return;
  }
  broadcastToWindows([getPetWindow(), getMenuWindow(), getHoverWindow()], "pet:state-changed", activeState);
  broadcastToWindows([getPetWindow(), getMenuWindow(), getHoverWindow()], "pet:direction-changed", walkDirection);
  safeSend(getPetWindow(), "pet:scale-changed", buildScaleSummary());
  safeSend(getPetWindow(), "pet:eye-tracking-look", getLastEyeTrackingLook());
  sendStats();
}

function sendWalkDirection() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    return;
  }
  broadcastToWindows([getPetWindow(), getMenuWindow(), getHoverWindow()], "pet:direction-changed", walkDirection);
}

function sendDragState(isDragging) {
  return dragController.sendDragState(isDragging);
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
  stateController.completeVisualStateCommit(info.state);
  if (renderedFrameState === STATE_YAWN) {
    const tailLoopStart = readMetadata(getState(renderedFrameState).metadata).tailLoopStart;
    if (Number.isInteger(tailLoopStart) && renderedFrameIndex >= tailLoopStart) {
      scheduleTabbySleepPose(STATE_YAWN);
      scheduleRagdollYawnSleepLoopTimeout(STATE_YAWN);
    }
  } else {
    clearRagdollYawnSleepLoopTimer();
  }
}

function clearDragState({ notify = true, keepPause = false } = {}) {
  return dragController.clearDragState({ notify, keepPause });
}

function setPetScale(nextScale) {
  return surfaceScaleController.setPetScale(nextScale);
}

function adjustPetScale(deltaY) {
  const direction = deltaY < 0 ? 1 : -1;
  setPetScale(surfaceScaleController.getPetScale() + direction * PET_SCALE_STEP);
}

function resetPetScale() {
  return surfaceScaleController.resetPetScale();
}

function isScreenPoint(value) {
  return value && Number.isFinite(value.screenX) && Number.isFinite(value.screenY);
}

function getState(id) {
  return states.find((state) => state.id === id) || states.find((state) => state.id === DEFAULT_STATE);
}

function setWalkDirection(nextDirection) {
  return stateController.setWalkDirection(nextDirection);
}

function setState(state, shouldRecordInteraction = true) {
  const result = stateController.setState(state, shouldRecordInteraction);
  if (activeState !== STATE_YAWN) {
    clearRagdollYawnSleepLoopTimer();
  }
  return result;
}

function completeOneShotState(state) {
  return stateController.completeOneShotState(state);
}

function isWalkingState() {
  return stateController.isWalkingState();
}

function moveToStartPosition(options = true) {
  return stateController.moveToStartPosition(options);
}

function settlePetQuietly() {
  return stateController.settlePetQuietly();
}

function rememberHomeDisplay() {
  const display = screen.getPrimaryDisplay();
  homeDisplayId = display.id;
  homeWorkArea = display.workArea;
  currentSurface = getTaskbarSurface(display);
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
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    return fallbackDirection >= 0 ? 1 : -1;
  }

  const bounds = getPetWindow().getBounds();
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
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    return;
  }

  const surface = getCurrentSurface();
  const visualCenterX = getCurrentPetVisualCenterX(STATE_WALK, fallbackDirection);
  const nextDirection = getInitialWalkDirection(surface, fallbackDirection);
  setWalkDirection(nextDirection);
  groundPetToSurface(activeState, walkDirection, surface);
  const bounds = getPetWindow().getBounds();
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
  } else if (activeSurface?.type === "window") {
    const centerX = Number.isFinite(visualCenterX)
      ? visualCenterX
      : getWalkVisibleCenterFromWindowX(bounds.x, groundedY, activeState, walkDirection);
    const targetX = getWindowXForVisibleCenter(centerX, activeState, walkDirection);
    setWalkWindowPosition(targetX, groundedY, activeSurface, walkDirection);
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
  return surfaceFitRules.getWindowXForVisibleEdge(edge, value, visibleRect, probe);
}

function getVisibleRectFromSpriteLeft(spriteLeft, spriteTop, stateId = activeState, direction = walkDirection) {
  const insets = getVisibleSpriteInsets(stateId, direction);
  return surfaceFitRules.getVisibleRectFromSpriteLeft(spriteLeft, spriteTop, getPetSpriteSize(), insets);
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
  const rawX = surfaceFitRules.getWindowXForVisibleCenter(centerX, visibleRect, probe);
  const actualCenterX = getWalkVisibleCenterFromWindowX(rawX, 0, stateId, direction);
  return Math.round(rawX + (Math.round(centerX) - actualCenterX));
}

function getTaskbarWalkCenterLimits(surface = getCurrentSurface(), stateId = activeState) {
  const limits = getWalkVisibleLimits(surface);
  const spriteSize = getPetSpriteSize();
  const leftInsets = getVisibleSpriteInsets(stateId, -1);
  const rightInsets = getVisibleSpriteInsets(stateId, 1);
  return surfaceFitRules.getTaskbarWalkCenterLimits(limits, spriteSize, leftInsets, rightInsets);
}

function getWindowWalkCenterLimits(surface = getCurrentSurface(), stateId = activeState) {
  const limits = getWalkVisibleLimits(surface);
  const spriteSize = getPetSpriteSize();
  const leftInsets = getVisibleSpriteInsets(stateId, -1);
  const rightInsets = getVisibleSpriteInsets(stateId, 1);
  return surfaceFitRules.getWindowSurfaceWalkCenterLimits(limits, spriteSize, leftInsets, rightInsets);
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
  if (!layout || !getPetWindow() || getPetWindow().isDestroyed()) {
    return null;
  }
  const bounds = getPetWindow().getBounds();
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
    getPetWindow().setBounds({
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
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    petWindowMousePassthrough = false;
    return;
  }
  const nextValue = Boolean(shouldIgnore);
  if (petWindowMousePassthrough === nextValue) {
    return;
  }
  petWindowMousePassthrough = nextValue;
  getPetWindow().setIgnoreMouseEvents(nextValue, { forward: true });
}

function clearPetWindowHitRegion() {
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    petWindowHitRegionKey = "";
    return;
  }
  if (typeof getPetWindow().setShape === "function") {
    const bounds = getPetWindow().getBounds();
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
  if (!taskbarWalkRunway || !isTaskbarWalkActive() || !getPetWindow() || getPetWindow().isDestroyed()) {
    return null;
  }
  const visualRect = getTaskbarRunwayVisualRect(activeState, walkDirection);
  if (!visualRect) {
    return null;
  }
  const bounds = getPetWindow().getBounds();
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
  if (!getPetWindow() || getPetWindow().isDestroyed() || typeof getPetWindow().setShape !== "function") {
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
  getPetWindow().setShape(shapeRect ? [shapeRect] : []);
}

function updatePetWindowMousePassthrough() {
  setPetWindowMousePassthrough(false);
  if (!taskbarWalkRunway || !isTaskbarWalkActive() || dragController.getDragState()) {
    clearPetWindowHitRegion();
    return;
  }
  applyPetWindowHitRegion(getTaskbarWalkHitRect());
}

function materializeTaskbarWalkRunway({ stateId = activeState, direction = walkDirection, notifyScale = true } = {}) {
  if (!taskbarWalkRunway || !getPetWindow() || getPetWindow().isDestroyed()) {
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
  getPetWindow().setBounds(nextBounds, false);
  clearPetWindowHitRegion();
  if (notifyScale) {
    sendScaleState();
  }
  return true;
}

function materializeTaskbarWalkRunwayForState(stateId, direction = getDefaultDirectionForState(stateId), { notifyScale = true } = {}) {
  if (!taskbarWalkRunway || !getPetWindow() || getPetWindow().isDestroyed()) {
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
  getPetWindow().setBounds({
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
  if (!point || !isTaskbarWalkActive(surface) || !getPetWindow() || getPetWindow().isDestroyed()) {
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
  return surfaceFitRules.getSafeWindowXForDirection(x, limits, visibleRect);
}

function syncWalkTrackX(x = null) {
  if (!getPetWindow() || getPetWindow().isDestroyed()) {
    walkTrackX = null;
    taskbarWalkRunway = null;
    clearPetWindowHitRegion();
    return;
  }

  const bounds = getPetWindow().getBounds();
  const surface = getCurrentSurface();
  const sourceX = Number.isFinite(x)
    ? x
    : surface?.type === "window" && isWalkingState() && Number.isFinite(walkTrackX)
      ? walkTrackX
      : bounds.x;
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
  if (surface?.type === "window") {
    walkTrackX = getSafeWindowXForDirection(sourceX, surface, activeState, walkDirection);
    taskbarWalkRunway = null;
    clearPetWindowHitRegion();
    return;
  }
  taskbarWalkRunway = null;
  clearPetWindowHitRegion();
  walkTrackX = getSafeWindowXForDirection(sourceX, surface, activeState, walkDirection);
}

function setWalkWindowPosition(x, y, surface = getCurrentSurface(), direction = walkDirection) {
  if (surface?.type === "window") {
    const nextX = getSafeWindowXForDirection(x, surface, activeState, direction);
    const nextY = Math.round(y);
    walkTrackX = nextX;
    const bounds = getPetWindow().getBounds();
    if (bounds.x !== nextX || bounds.y !== nextY) {
      getPetWindow().setPosition(nextX, nextY, false);
    }
    return nextX;
  }

  const nextX = getSafeWindowXForDirection(x, surface, activeState, direction);
  walkTrackX = nextX;
  getPetWindow().setPosition(nextX, Math.round(y), false);
  return nextX;
}

function setTaskbarWalkWindowPositionForCenter(centerX, y, direction = walkDirection) {
  const runway = ensureTaskbarWalkRunwayForCenter(centerX, y, direction, getCurrentSurface(), {
    force: true,
    reason: "center"
  });
  return runway?.windowX ?? getPetWindow().getBounds().x;
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
  return dragController.updateDragPosition();
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

function settlePetInPlaceAfterDrag(bounds, reason = "fallback") {
  windowDockHoverSuppressedUntil = Date.now() + WINDOW_DOCK_DRAG_HOVER_SUPPRESS_MS;
  taskbarWalkRunway = null;
  walkTrackX = null;
  const next = clampPetWindowPosition(bounds.x, bounds.y);
  const nextBounds = {
    x: next.x,
    y: next.y,
    width: getPetWindowWidth(),
    height: getPetWindowHeight()
  };
  const surface = setCurrentSurface(createFloatingSurfaceForBounds(nextBounds));
  setPetWindowPosition(next.x, next.y);
  syncWalkTrackX(next.x);
  if (WINDOW_DOCK_DEBUG) {
    log(`dock-after-drag settle-in-place reason=${reason} surface=${surface.type}`);
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
  return dragController.startDragTimer();
}

function runAppReadyStartupSequence() {
  appLifecycleShuttingDown = false;
  log("app ready");
  readPetStats();
  readAutoStartPreference();
  syncAutoStartPreferenceFromRegistrySync();
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
  appLifecycleShuttingDown = true;
  writePetStats();
  stopHoverPolling();
  stopWindowSurfacePolling();
  stopWindowRoamPolling();
  stopEyeTrackingPolling();
  stopTabbyIdlePolling();
  stopIntimacyDecayTimer();
  clearHoverIntent();
  clearDragState({ notify: false });
  clearStartupBubbleTimer();
  clearHoverHideTimer();
  clearMenuHideTimer();
  clearTabbySleepPoseTimer();
  clearRagdollYawnSleepLoopTimer();
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

function handleSetState(_event, state, options = {}) {
  if (typeof state === "string") {
    if (options && typeof options === "object" && options.suppressHover) {
      suppressHoverAfterPetClick();
    }
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
  return petWindowController.handleHidePet();
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
  return dragController.handleDragStart(_event, point);
}

function handleDragEnd() {
  return dragController.handleDragEnd();
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
