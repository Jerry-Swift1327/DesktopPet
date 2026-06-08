function getWalkLoopRemainingMs(walkLoop, now = Date.now(), pausedAt = 0) {
  if (!walkLoop?.endsAt) {
    return 0;
  }
  const referenceNow = pausedAt || now;
  return Math.max(0, walkLoop.endsAt - referenceNow);
}

function pauseWalkLoopClockState(walkLoop, now = Date.now(), pausedAt = 0) {
  if (!walkLoop?.endsAt || pausedAt) {
    return { walkLoop, pausedAt };
  }
  return { walkLoop, pausedAt: now };
}

function resumeWalkLoopClockState(walkLoop, now = Date.now(), pausedAt = 0) {
  if (!pausedAt) {
    return { walkLoop, pausedAt };
  }
  const pausedMs = Math.max(0, now - pausedAt);
  return {
    walkLoop: walkLoop?.endsAt && pausedMs > 0
      ? { ...walkLoop, endsAt: walkLoop.endsAt + pausedMs }
      : walkLoop,
    pausedAt: 0
  };
}

module.exports = {
  getWalkLoopRemainingMs,
  pauseWalkLoopClockState,
  resumeWalkLoopClockState
};
