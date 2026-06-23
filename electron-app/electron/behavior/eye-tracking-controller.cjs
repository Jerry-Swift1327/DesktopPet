// 眼神追踪控制器，管理宠物视线跟随光标的轮询、方向计算与状态同步。
// 从 main.cjs 提取，运行时可变状态通过访问器注入，避免创建瞬间固化快照。

function createEyeTrackingController(context) {
  const {
    // Electron 与运行时
    screen,
    // 窗口与状态访问器（实时读取，避免快照）
    getPetWindow,
    getMenuWindow,
    getHoverWindow,
    getActiveState,
    getDragState,
    getEyeTrackingEnabled,
    getEyeTrackingLookFrameCount,
    canToggleEyeTracking,
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
  } = context;

  // 控制器私有状态：轮询定时器与上一次下发的视线方向
  let eyeTrackingPollTimer = null;
  let lastEyeTrackingLook = "off";

  // 发送视线方向到宠物窗口，仅在变化时下发
  function sendEyeTrackingLook(look) {
    const nextLook = look || "off";
    if (nextLook === lastEyeTrackingLook) {
      return;
    }
    lastEyeTrackingLook = nextLook;
    const petWindow = getPetWindow();
    safeSend(petWindow, "pet:eye-tracking-look", nextLook);
  }

  // 根据光标位置计算视线方向帧名
  function getEyeTrackingLookForCursor(point) {
    const petWindow = getPetWindow();
    const lookFrameCount = getEyeTrackingLookFrameCount();
    const rect = getRenderedFrameHeadRectFromBounds(petWindow.getBounds()) || getRenderedFrameVisibleRect() || getVisiblePetRect();
    if (!rect || lookFrameCount <= 0) {
      return "off";
    }

    const dx = point.x - (rect.x + rect.width / 2);
    const dy = point.y - (rect.y + rect.height / 2);
    const angle = (Math.atan2(dy, dx) + Math.PI * 2) % (Math.PI * 2);
    const index = Math.round(((angle - Math.PI + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * lookFrameCount) % lookFrameCount;
    return `frame_${String(index).padStart(3, "0")}`;
  }

  // 单次轮询：判断是否需要追踪并下发视线方向
  function tickEyeTracking() {
    const petWindow = getPetWindow();
    if (!getEyeTrackingEnabled() || getActiveState() !== STATE_SQUAT || getDragState() || !petWindow || petWindow.isDestroyed()) {
      sendEyeTrackingLook("off");
      return;
    }

    const menuWindow = getMenuWindow();
    const hoverWindow = getHoverWindow();
    const menuVisible = menuWindow && !menuWindow.isDestroyed() && menuWindow.isVisible();
    const hoverVisible = hoverWindow && !hoverWindow.isDestroyed() && hoverWindow.isVisible();
    const point = screen.getCursorScreenPoint();
    if (menuVisible || hoverVisible || isPointInsideRect(point, getWindowRect(petWindow)) || isPointInsideRenderedFrame(point)) {
      sendEyeTrackingLook("off");
      return;
    }

    sendEyeTrackingLook(getEyeTrackingLookForCursor(point));
  }

  // 启动轮询定时器
  function startEyeTrackingPolling() {
    if (eyeTrackingPollTimer || !canToggleEyeTracking()) {
      return;
    }
    tickEyeTracking();
    eyeTrackingPollTimer = setInterval(tickEyeTracking, EYE_TRACKING_POLL_INTERVAL_MS);
  }

  // 停止轮询定时器并复位视线
  function stopEyeTrackingPolling() {
    if (!eyeTrackingPollTimer) {
      return;
    }
    clearInterval(eyeTrackingPollTimer);
    eyeTrackingPollTimer = null;
    sendEyeTrackingLook("off");
  }

  // 根据启用状态切换轮询
  function updateEyeTrackingPolling() {
    if (getEyeTrackingEnabled()) {
      startEyeTrackingPolling();
    } else {
      stopEyeTrackingPolling();
    }
  }

  // 读取上一次下发的视线方向，供 sendPetState 等场景同步使用
  function getLastEyeTrackingLook() {
    return lastEyeTrackingLook;
  }

  return {
    sendEyeTrackingLook,
    getEyeTrackingLookForCursor,
    tickEyeTracking,
    startEyeTrackingPolling,
    stopEyeTrackingPolling,
    updateEyeTrackingPolling,
    getLastEyeTrackingLook
  };
}

module.exports = { createEyeTrackingController };
