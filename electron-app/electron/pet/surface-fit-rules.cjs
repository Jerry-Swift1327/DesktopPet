// surface-fit-rules.cjs：surface-fit 纯规则模块，不依赖 electron/fs/path/窗口/IPC/screen/bubble。
// 不引用运行态变量（petScale/preferredPetScale/activeState/walkDirection 等）。
// 所有外部数据（groundY/spriteSize/visibleInsets/visibleRect/limits 等）通过参数注入。
// 仅 require ../shared/bounds.cjs 获取 clamp；不 require pet-scale-rules.cjs（两模块互相独立）。

const { clamp } = require("../shared/bounds.cjs");

// 由 surfaceGroundY 反推 visibleTop：visibleHeight = spriteSize - top - bottom
function getSurfaceVisibleTopFromGroundY(groundY, spriteSize, visibleInsetsTop, visibleInsetsBottom) {
  const visibleHeight = spriteSize - visibleInsetsTop - visibleInsetsBottom;
  return Math.round(groundY - visibleHeight);
}

// 由 visibleTop 反推 windowY：verticalInset = max(0, windowHeight - spriteSize)
function getGroundedWindowYFromSurface(visibleTop, windowHeight, spriteSize, visibleInsetsTop) {
  const verticalInset = Math.max(0, windowHeight - spriteSize);
  return Math.round(visibleTop - verticalInset - visibleInsetsTop);
}

// 将窗口坐标钳制到 surface 可见范围内；visibleRect 与 surfaceY 由调用方组装后注入
function clampWindowPositionToSurface(x, y, surfaceLeft, surfaceRight, visibleRect, surfaceY) {
  const minX = x + surfaceLeft - visibleRect.x;
  const maxX = x + surfaceRight - (visibleRect.x + visibleRect.width);
  return {
    x: clamp(Math.round(x), Math.round(minX), Math.round(maxX)),
    y: Math.round(surfaceY)
  };
}

// 在 [minScale, maxScale] 区间内自顶向下寻找首个能放入 surface 的候选 scale。
// computeFitForScale(scale) 由调用方提供，返回 { visibleWidth, visibleHeight }。
// clampPetScale 在此内联实现，不 require pet-scale-rules 避免循环依赖。
// 纯函数不修改任何外部变量。
function getScaleCandidateForSurface(
  surfaceLeft,
  surfaceRight,
  surfaceGroundY,
  workAreaY,
  visibleTopGap,
  requestedScale,
  minScale,
  maxScale,
  step,
  computeFitForScale
) {
  let candidate = Math.round(
    Math.min(Math.max(Number(requestedScale) || 1, minScale), maxScale) * 100
  ) / 100;
  while (candidate >= minScale) {
    const fit = computeFitForScale(candidate);
    const visibleWidth = fit.visibleWidth;
    const visibleHeight = fit.visibleHeight;
    const hasWidth = visibleWidth <= Math.max(1, surfaceRight - surfaceLeft);
    const hasHeight = surfaceGroundY - visibleHeight >= workAreaY + visibleTopGap;
    if (hasWidth && hasHeight) {
      return candidate;
    }
    candidate = Math.round((candidate - step) * 100) / 100;
  }
  return null;
}

// 由目标可见边沿反推窗口 x：edge="left" 对齐左沿，edge="right" 对齐右沿
function getWindowXForVisibleEdge(edge, value, visibleRect, probe) {
  const offset = visibleRect.x - probe.x;
  return edge === "right"
    ? Math.round(value - visibleRect.width - offset)
    : Math.round(value - offset);
}

// 由目标可见中心反推窗口 x
function getWindowXForVisibleCenter(centerX, visibleRect, probe) {
  const offset = visibleRect.x - probe.x;
  return Math.round(centerX - offset - visibleRect.width / 2);
}

// 由 sprite 左上角反推可见矩形
function getVisibleRectFromSpriteLeft(spriteLeft, spriteTop, spriteSize, insets) {
  return {
    x: Math.round(spriteLeft + insets.left),
    y: Math.round(spriteTop + insets.top),
    width: Math.max(1, spriteSize - insets.left - insets.right),
    height: Math.max(1, spriteSize - insets.top - insets.bottom)
  };
}

// 计算任务栏行走中心居中区间；左右朝向可见宽度不同时取较大者的一半作为半宽
function getTaskbarWalkCenterLimits(limits, spriteSize, leftInsets, rightInsets) {
  const leftVisibleWidth = Math.max(1, spriteSize - leftInsets.left - leftInsets.right);
  const rightVisibleWidth = Math.max(1, spriteSize - rightInsets.left - rightInsets.right);
  const halfWidth = Math.max(leftVisibleWidth, rightVisibleWidth) / 2;
  const left = Math.ceil(limits.left + halfWidth);
  const right = Math.floor(limits.right - halfWidth);
  if (left > right) {
    const center = Math.round((limits.left + limits.right) / 2);
    return { left: center, right: center };
  }
  return { left, right };
}

// 将窗口 x 钳制到行走可见区间内
function getSafeWindowXForDirection(x, limits, visibleRect) {
  let nextX = Math.round(x);
  if (visibleRect.x < limits.left) {
    nextX += limits.left - visibleRect.x;
  }
  if (visibleRect.x + visibleRect.width > limits.right) {
    nextX -= visibleRect.x + visibleRect.width - limits.right;
  }
  return Math.round(nextX);
}

// validateWindowSurfaceBounds：根据 workArea 与 bounds 计算窗口 surface 的可见左右沿与 groundY，无效返回 null（纯计算）。
function validateWindowSurfaceBounds(surface, workArea, displayId, visibleSideGap, visibleTopGap, windowDockGap, windowDockMinWidth) {
  if (!surface || surface.type !== "window") {
    return null;
  }
  const area = workArea;
  const bounds = surface.bounds || {};
  const left = Math.max(Math.round(bounds.left), area.x + visibleSideGap);
  const right = Math.min(Math.round(bounds.right), area.x + area.width - visibleSideGap);
  const groundY = Math.max(Math.round(bounds.top) - windowDockGap, area.y + visibleTopGap);
  if (right - left < windowDockMinWidth || groundY <= area.y + visibleTopGap) {
    return null;
  }
  return {
    ...surface,
    displayId,
    left,
    right,
    groundY,
    workArea: { x: area.x, y: area.y, width: area.width, height: area.height }
  };
}

// getSurfaceGroundYFromSurface：根据 darwinBottomDock 与可见区间判定 groundY（纯计算，surface 为 falsy 时保持原抛错语义）。
function getSurfaceGroundYFromSurface(surface, visibleLeft, visibleRight) {
  const dock = surface?.darwinBottomDock;
  if (dock && Number.isFinite(visibleLeft) && Number.isFinite(visibleRight)) {
    return visibleRight < dock.left || visibleLeft > dock.right
      ? dock.screenGroundY
      : surface.groundY;
  }
  return surface.groundY;
}

module.exports = {
  getSurfaceVisibleTopFromGroundY,
  getGroundedWindowYFromSurface,
  clampWindowPositionToSurface,
  getScaleCandidateForSurface,
  getWindowXForVisibleEdge,
  getWindowXForVisibleCenter,
  getVisibleRectFromSpriteLeft,
  getTaskbarWalkCenterLimits,
  getSafeWindowXForDirection,
  validateWindowSurfaceBounds,
  getSurfaceGroundYFromSurface
};
