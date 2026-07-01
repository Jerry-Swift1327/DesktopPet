const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const animationsRoot = path.join(projectRoot, "assets", "animations");
const manifest = JSON.parse(fs.readFileSync(path.join(animationsRoot, "pet2610_actions_manifest.json"), "utf8"));

function listFrames(dir) {
  return fs.readdirSync(dir).filter((name) => /^frame_\d{3}\.png$/.test(name)).sort();
}

function readLoop(action) {
  return JSON.parse(fs.readFileSync(path.join(animationsRoot, action, "loop.json"), "utf8"));
}

test("pet2610 assets cover configured actions without sleep or hiss", () => {
  const actions = [
    "pet2610_squat",
    "pet2610_walk",
    "pet2610_feed",
    "pet2610_ball",
    "pet2610_shake",
    "pet2610_yawn"
  ];

  assert.deepEqual(manifest.map((item) => item.action), actions);
  assert.equal(fs.existsSync(path.join(animationsRoot, "pet2610_sleep")), false);
  assert.equal(fs.existsSync(path.join(animationsRoot, "pet2610_hiss")), false);

  for (const action of actions) {
    const actionDir = path.join(animationsRoot, action);
    const loop = readLoop(action);
    const frames = listFrames(path.join(actionDir, "transparent_frames"));

    assert.equal(loop.action, action);
    assert.equal(loop.frameCount, frames.length);
    assert.deepEqual(manifest.find((item) => item.action === action), loop);
  }
});

test("pet2610 runtime frame ranges match selected action moments", () => {
  const expectedRanges = {
    pet2610_squat: {
      loopSelection: "full",
      frameCount: 167,
      sourceLoopStart: 0,
      sourceLoopEnd: 166,
      trimGroundAlpha: 220,
      trimGroundPadding: 0
    },
    pet2610_feed: {
      loopSelection: "manual",
      frameCount: 73,
      sourceLoopStart: 94,
      sourceLoopEnd: 166,
      trimGroundAlpha: 128,
      trimGroundPadding: 1
    },
    pet2610_ball: {
      loopSelection: "manual",
      frameCount: 108,
      sourceLoopStart: 44,
      sourceLoopEnd: 151,
      trimGroundAlpha: 220,
      trimGroundPadding: 0
    },
    pet2610_shake: {
      loopSelection: "manual",
      frameCount: 101,
      sourceLoopStart: 56,
      sourceLoopEnd: 156,
      trimGroundAlpha: 220,
      trimGroundPadding: 0,
      runtimeAlignReferenceAction: "pet2610_squat",
      runtimeAlignDx: -49,
      runtimeAlignDy: -17,
      runtimeAlignTargetBottom: 220,
      runtimeAlignTargetCenterX: 101.5
    }
  };

  for (const [action, expected] of Object.entries(expectedRanges)) {
    const loop = readLoop(action);
    assert.equal(loop.loopSelection, expected.loopSelection);
    assert.equal(loop.frameCount, expected.frameCount);
    assert.equal(loop.loopEnd, expected.frameCount - 1);
    assert.equal(loop.sourceLoopStart, expected.sourceLoopStart);
    assert.equal(loop.sourceLoopEnd, expected.sourceLoopEnd);
    assert.equal(loop.trimGroundAlpha, expected.trimGroundAlpha);
    assert.equal(loop.trimGroundPadding, expected.trimGroundPadding);
    if (expected.runtimeAlignReferenceAction) {
      assert.equal(loop.runtimeAlignReferenceAction, expected.runtimeAlignReferenceAction);
      assert.equal(loop.runtimeAlignDx, expected.runtimeAlignDx);
      assert.equal(loop.runtimeAlignDy, expected.runtimeAlignDy);
      assert.equal(loop.runtimeAlignTargetBottom, expected.runtimeAlignTargetBottom);
      assert.equal(loop.runtimeAlignTargetCenterX, expected.runtimeAlignTargetCenterX);
    }
  }
});

test("pet2610 yawn keeps the full transition and stable sleeping tail loop", () => {
  const loop = readLoop("pet2610_yawn");

  assert.equal(loop.sourceFrameCount, 334);
  assert.equal(loop.frameCount, 334);
  assert.equal(loop.loopSelection, "full");
  assert.equal(loop.loopStart, 0);
  assert.equal(loop.loopEnd, 333);
  assert.equal(loop.sourceLoopStart, 0);
  assert.equal(loop.sourceLoopEnd, 333);
  assert.equal(loop.tailLoopStart, 320);
  assert.equal(loop.trimGroundAlpha, 220);
  assert.equal(loop.trimGroundPadding, 0);
  assert.equal(loop.groundAlignBottom, 231);
  assert.equal(loop.groundAlignMaxShift, 16);
});
