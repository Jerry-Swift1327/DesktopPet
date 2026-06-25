// frame-geometry.cjs：宠物帧纯几何计算模块，不依赖 electron/fs/path/nativeImage/缓存/窗口/IPC/bubble。
// 所有外部数据通过参数注入：spriteSize、bounds、frameBounds、defaultFacing、direction、
// runwayInfo、spriteRect、insets、visibleRect、probe。

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

function combineFrameBoundsList(frameBoundsList) {
  let combined = null;
  for (const bounds of frameBoundsList) {
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
  if (combined) {
    combined.width = combined.right - combined.left + 1;
    combined.height = combined.bottom - combined.top + 1;
  }
  return combined;
}

function applyStableGroundBottomCorrection(combined, frameBoundsList, moving) {
  if (!combined) {
    return combined;
  }
  if (moving && frameBoundsList && frameBoundsList.length > 2) {
    const stableBottom = getStableGroundBottom(frameBoundsList);
    combined.bottom = Math.max(combined.top, Math.min(combined.bottom, stableBottom));
  }
  combined.width = combined.right - combined.left + 1;
  combined.height = combined.bottom - combined.top + 1;
  return combined;
}

function getSpriteRectFromBounds(bounds, ctx) {
  const { spriteSize, runwayInfo, isTaskbarWalkActive, getSpriteLocalXForWindowWidth } = ctx;
  const canUseRunwayOffset = runwayInfo
    && isTaskbarWalkActive
    && Math.round(bounds.width) === runwayInfo.windowWidth
    && Math.round(bounds.height) === runwayInfo.windowHeight;
  const horizontalInset = canUseRunwayOffset
    ? Math.max(0, Math.round(runwayInfo.spriteOffsetX))
    : getSpriteLocalXForWindowWidth(bounds.width);
  const verticalInset = Math.max(0, bounds.height - spriteSize);
  return {
    x: bounds.x + horizontalInset,
    y: bounds.y + verticalInset,
    width: spriteSize,
    height: spriteSize
  };
}

function getVisibleSpriteInsetsFromBounds(bounds, spriteSize, direction, defaultFacing) {
  if (!bounds || !bounds.imageWidth || !bounds.imageHeight) {
    return { left: 0, top: 0, right: 0, bottom: 0 };
  }
  const insets = {
    left: Math.round((bounds.left / bounds.imageWidth) * spriteSize),
    top: Math.round((bounds.top / bounds.imageHeight) * spriteSize),
    right: Math.round(((bounds.imageWidth - 1 - bounds.right) / bounds.imageWidth) * spriteSize),
    bottom: Math.round(((bounds.imageHeight - 1 - bounds.bottom) / bounds.imageHeight) * spriteSize)
  };
  const shouldMirror = defaultFacing === "left" ? direction > 0 : direction < 0;
  return shouldMirror
    ? { ...insets, left: insets.right, right: insets.left }
    : insets;
}

function getVisiblePetRectFromBounds(spriteRect, insets) {
  return {
    x: spriteRect.x + insets.left,
    y: spriteRect.y + insets.top,
    width: Math.max(1, spriteRect.width - insets.left - insets.right),
    height: Math.max(1, spriteRect.height - insets.top - insets.bottom)
  };
}

function getFrameVisibleRectFromBounds(frameBounds, spriteRect, defaultFacing, direction) {
  const shouldMirror = defaultFacing === "left" ? direction > 0 : direction < 0;
  const rawLeft = shouldMirror
    ? frameBounds.imageWidth - 1 - frameBounds.right
    : frameBounds.left;
  const rawRight = shouldMirror
    ? frameBounds.imageWidth - 1 - frameBounds.left
    : frameBounds.right;
  const xScale = spriteRect.width / frameBounds.imageWidth;
  const yScale = spriteRect.height / frameBounds.imageHeight;
  return {
    x: Math.round(spriteRect.x + rawLeft * xScale),
    y: Math.round(spriteRect.y + frameBounds.top * yScale),
    width: Math.max(1, Math.round((rawRight - rawLeft + 1) * xScale)),
    height: Math.max(1, Math.round((frameBounds.bottom - frameBounds.top + 1) * yScale))
  };
}

function getBottomAnchorFromVisibleRect(visibleRect) {
  if (!visibleRect) {
    return null;
  }
  return {
    x: Math.round(visibleRect.x + visibleRect.width / 2),
    y: Math.round(visibleRect.y + visibleRect.height),
    visibleRect
  };
}

function getFrameVisibleCenterWindowX(centerX, probe, visibleRect) {
  return Math.round(centerX - (visibleRect.x - probe.x) - visibleRect.width / 2);
}

module.exports = {
  getStableGroundBottom,
  combineFrameBoundsList,
  applyStableGroundBottomCorrection,
  getSpriteRectFromBounds,
  getVisibleSpriteInsetsFromBounds,
  getVisiblePetRectFromBounds,
  getFrameVisibleRectFromBounds,
  getBottomAnchorFromVisibleRect,
  getFrameVisibleCenterWindowX
};
