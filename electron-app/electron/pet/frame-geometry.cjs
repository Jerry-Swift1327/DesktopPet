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

function getStateFrameCount(state) {
  if (!state) {
    return 0;
  }
  if (Array.isArray(state.frames)) {
    return state.frames.length;
  }
  return Number.isInteger(state.frameCount) ? Math.max(0, state.frameCount) : 0;
}

function buildFrameSequence(state) {
  if (!state) {
    return [];
  }

  const frameCount = getStateFrameCount(state);
  if (frameCount <= 0) {
    return [];
  }

  const maxFrame = Math.max(0, frameCount - 1);
  const rawLoopStart = Number.isInteger(state.loopStart) ? state.loopStart : 0;
  const rawLoopEnd = Number.isInteger(state.loopEnd) ? state.loopEnd : maxFrame;
  const loopStart = Math.min(Math.max(0, rawLoopStart), maxFrame);
  const loopEnd = Math.min(Math.max(loopStart, rawLoopEnd), maxFrame);
  const sequence = [];

  function appendRange(start, end, times = 1) {
    const repeatTimes = Math.max(1, Number.isInteger(times) ? times : 1);
    const from = Math.min(Math.max(0, start), maxFrame);
    const to = Math.min(Math.max(0, end), maxFrame);
    const direction = to >= from ? 1 : -1;
    for (let pass = 0; pass < repeatTimes; pass += 1) {
      for (let frameIndex = from; ; frameIndex += direction) {
        sequence.push(frameIndex);
        if (frameIndex === to) {
          break;
        }
      }
    }
  }

  if (Array.isArray(state.frameSequence)) {
    for (const segment of state.frameSequence) {
      if (!segment || !Number.isInteger(segment.start) || !Number.isInteger(segment.end)) {
        continue;
      }
      appendRange(segment.start, segment.end, segment.times);
    }
    const repeatCount = Number.isInteger(state.sequenceRepeatCount) ? Math.max(1, state.sequenceRepeatCount) : 1;
    if (repeatCount > 1 && sequence.length > 0) {
      const baseSequence = sequence.slice();
      sequence.push(...baseSequence);
    }
    return sequence.length > 0 ? sequence : [0];
  }

  for (let index = loopStart; index <= loopEnd; index += 1) {
    sequence.push(index);
  }

  const repeat = state.frameSequence || {};
  const repeatCount = Number.isInteger(repeat.repeatCount) ? repeat.repeatCount : 1;
  const repeatStart = Number.isInteger(repeat.repeatRangeStart) ? repeat.repeatRangeStart : null;
  const repeatEnd = Number.isInteger(repeat.repeatRangeEnd) ? repeat.repeatRangeEnd : null;
  if (repeatCount > 1 && repeatStart !== null && repeatEnd !== null) {
    const start = Math.min(Math.max(loopStart, repeatStart), loopEnd);
    const end = Math.min(Math.max(start, repeatEnd), loopEnd);
    const tailIndex = sequence.findLastIndex((frameIndex) => frameIndex === end);
    const extra = [];
    for (let pass = 1; pass < repeatCount; pass += 1) {
      for (let frameIndex = start; frameIndex <= end; frameIndex += 1) {
        extra.push(frameIndex);
      }
    }
    if (tailIndex >= 0 && extra.length > 0) {
      sequence.splice(tailIndex + 1, 0, ...extra);
    }
  }

  return sequence.length > 0 ? sequence : [0];
}

function getFrameIndexForStep(state, frameStep = 0) {
  if (!state || getStateFrameCount(state) === 0) {
    return 0;
  }

  const frameSequence = buildFrameSequence(state);
  const stepCount = Math.max(1, frameSequence.length);
  const tailLoopStart = Number.isInteger(state.tailLoopStart) ? state.tailLoopStart : null;
  const shouldLoopFrames = !state.oneShot || state.moving;
  const safeFrameStep = Number.isFinite(frameStep) ? Math.round(frameStep) : 0;
  const step = tailLoopStart !== null && safeFrameStep >= stepCount
    ? tailLoopStart + ((safeFrameStep - tailLoopStart) % Math.max(1, stepCount - tailLoopStart))
    : shouldLoopFrames
      ? safeFrameStep % stepCount
      : Math.min(safeFrameStep, stepCount - 1);
  return frameSequence[step] ?? 0;
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

function getWindowPositionForVisibleRect(left, top, windowWidth, windowHeight, spriteSize, horizontalInset, visibleInsets) {
  const verticalInset = Math.max(0, windowHeight - spriteSize);
  return {
    x: Math.round(left - horizontalInset - visibleInsets.left),
    y: Math.round(top - verticalInset - visibleInsets.top)
  };
}

module.exports = {
  getStableGroundBottom,
  combineFrameBoundsList,
  applyStableGroundBottomCorrection,
  buildFrameSequence,
  getFrameIndexForStep,
  getSpriteRectFromBounds,
  getVisibleSpriteInsetsFromBounds,
  getVisiblePetRectFromBounds,
  getFrameVisibleRectFromBounds,
  getBottomAnchorFromVisibleRect,
  getFrameVisibleCenterWindowX,
  getWindowPositionForVisibleRect
};
