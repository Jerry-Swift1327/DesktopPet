// 屏幕指标控制器，提供任务栏行走跑道尺寸、任务栏表面、显示器匹配等计算，
// 以及 macOS 显示器度量变化后的归位调度。
// 从 main.cjs 提取，依赖通过 createScreenMetricsController(context) 注入；
// 函数实现与 main.cjs 保持一致，screen 由 context 注入。

function createScreenMetricsController(context) {
  const {
    // Electron 与运行时
    screen,
    process,
    // 依赖函数
    clamp,
    getPetSpriteSize,
    getPetWindowWidth,
    getCurrentSurface,
    getSurfaceWorkArea,
    moveToStartPosition,
    // 可变状态访问器（实时读取，避免快照）
    getPetWindow,
    getDragState,
    getCurrentSurfaceValue,
    // 常量
    TASKBAR_WALK_RUNWAY_PADDING_SCALE,
    TASKBAR_WALK_RUNWAY_PADDING_MIN,
    TASKBAR_WALK_RUNWAY_PADDING_MAX,
    TASKBAR_WALK_RUNWAY_SCREEN_BUFFER_FACTOR,
    DARWIN_BOTTOM_DOCK_WIDTH_HEIGHT_FACTOR,
    VISIBLE_SIDE_GAP,
    VISIBLE_BOTTOM_GAP,
    DARWIN_DISPLAY_METRICS_SETTLE_MS
  } = context;

  // 模块内部状态（原 main.cjs 中的全局变量）
  let displayMetricsSettleTimer = null;

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

  function getTaskbarSurfaceForBounds(bounds) {
    if (bounds === undefined) {
      const win = getPetWindow();
      bounds = win && !win.isDestroyed() ? win.getBounds() : null;
    }
    const display = bounds ? screen.getDisplayMatching(bounds) : screen.getPrimaryDisplay();
    return getTaskbarSurface(display);
  }

  function getSurfaceDisplay(surface = getCurrentSurfaceValue()) {
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

  function scheduleDarwinDisplayMetricsSettle() {
    const win = getPetWindow();
    if (getDragState() || !win || win.isDestroyed()) {
      return;
    }
    clearTimeout(displayMetricsSettleTimer);
    displayMetricsSettleTimer = setTimeout(() => {
      displayMetricsSettleTimer = null;
      if (!getDragState() && win && !win.isDestroyed()) {
        moveToStartPosition(false);
      }
    }, DARWIN_DISPLAY_METRICS_SETTLE_MS);
  }

  function clearDisplayMetricsSettleTimer() {
    if (displayMetricsSettleTimer) {
      clearTimeout(displayMetricsSettleTimer);
      displayMetricsSettleTimer = null;
    }
  }

  return {
    getTaskbarWalkRunwayPadding,
    getTaskbarWalkRunwayScreenBuffer,
    getTaskbarWalkRunwayWindowWidth,
    getDarwinBottomDock,
    getTaskbarSurface,
    getTaskbarSurfaceForBounds,
    getSurfaceDisplay,
    scheduleDarwinDisplayMetricsSettle,
    clearDisplayMetricsSettleTimer
  };
}

module.exports = { createScreenMetricsController };
