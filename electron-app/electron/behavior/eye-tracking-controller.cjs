// 眼神追踪控制器，管理宠物视线跟随光标的轮询、方向计算与状态同步。
// 从 main.cjs 提取，依赖通过 createEyeTrackingController(context) 注入；
// 函数实现与 main.cjs 保持一致，仅迁移眼神追踪相关逻辑。

function createEyeTrackingController(context) {
  const {
    // Electron 与运行时
    screen,
    // 窗口引用
    petWindow,
    menuWindow,
    hoverWindow,
    // 依赖函数
    safeSend,
    getRenderedFrameHeadRectFromBounds,
    getRenderedFrameVisibleRect,
    getVisiblePetRect,
    getWindowRect,
    isPointInsideRect,
    isPointInsideRenderedFrame,
    canToggleEyeTracking,
    // 外部状态
    eyeTrackingLookFrameCount,
    eyeTrackingEnabledCache,
    activeState,
    dragState,
    // 常量
    STATE_SQUAT,
    EYE_TRACKING_POLL_INTERVAL_MS
  } = context;

  // 眼神追踪相关状态（原 main.cjs 中的全局变量）
  let eyeTrackingPollTimer = null;
  let lastEyeTrackingLook = "off";

  function sendEyeTrackingLook(look) {
    const nextLook = look || "off";
    if (nextLook === lastEyeTrackingLook) {
      return;
    }
    lastEyeTrackingLook = nextLook;
    safeSend(petWindow, "pet:eye-tracking-look", nextLook);
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

  return {
    sendEyeTrackingLook,
    getEyeTrackingLookForCursor,
    tickEyeTracking,
    startEyeTrackingPolling,
    stopEyeTrackingPolling,
    updateEyeTrackingPolling
  };
}

module.exports = { createEyeTrackingController };
