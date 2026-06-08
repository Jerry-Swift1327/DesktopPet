const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getWalkLoopRemainingMs,
  pauseWalkLoopClockState,
  resumeWalkLoopClockState
} = require("../electron/walk-clock.cjs");

test("walk clock freezes remaining time while paused", () => {
  const walkLoop = { startedAt: 1000, endsAt: 301000 };
  const paused = pauseWalkLoopClockState(walkLoop, 61000, 0);

  assert.equal(paused.pausedAt, 61000);
  assert.equal(getWalkLoopRemainingMs(paused.walkLoop, 121000, paused.pausedAt), 240000);
});

test("walk clock extends the deadline by the paused duration", () => {
  const walkLoop = { startedAt: 1000, endsAt: 301000 };
  const paused = pauseWalkLoopClockState(walkLoop, 61000, 0);
  const resumed = resumeWalkLoopClockState(paused.walkLoop, 91000, paused.pausedAt);

  assert.equal(resumed.pausedAt, 0);
  assert.equal(resumed.walkLoop.endsAt, 331000);
  assert.equal(getWalkLoopRemainingMs(resumed.walkLoop, 91000, resumed.pausedAt), 240000);
});

test("nested pause requests do not reset pausedAt", () => {
  const walkLoop = { startedAt: 1000, endsAt: 301000 };
  const paused = pauseWalkLoopClockState(walkLoop, 61000, 0);
  const stillPaused = pauseWalkLoopClockState(paused.walkLoop, 71000, paused.pausedAt);

  assert.equal(stillPaused.pausedAt, 61000);
});
