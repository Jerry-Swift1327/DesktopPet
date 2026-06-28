const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const animationsRoot = path.join(projectRoot, "assets", "animations");
const manifest = JSON.parse(fs.readFileSync(path.join(animationsRoot, "ragdoll_actions_manifest.json"), "utf8"));

function listFrames(dir) {
  return fs.readdirSync(dir).filter((name) => /^frame_\d{3}\.png$/.test(name)).sort();
}

test("ragdoll assets cover the configured actions", () => {
  const actions = [
    "ragdoll_squat",
    "ragdoll_walk",
    "ragdoll_feed",
    "ragdoll_ball",
    "ragdoll_spin",
    "ragdoll_lick",
    "ragdoll_stretch",
    "ragdoll_belly",
    "ragdoll_shake",
    "ragdoll_yawn",
    "ragdoll_hiss"
  ];

  assert.deepEqual(manifest.map((item) => item.action), actions);
  for (const action of actions) {
    const actionDir = path.join(animationsRoot, action);
    const loop = JSON.parse(fs.readFileSync(path.join(actionDir, "loop.json"), "utf8"));
    const frames = listFrames(path.join(actionDir, "transparent_frames"));

    assert.equal(loop.action, action);
    assert.equal(loop.frameCount, frames.length);
    assert.deepEqual(manifest.find((item) => item.action === action), loop);
  }
});

test("ragdoll yawn keeps a stable sleeping tail loop", () => {
  const loop = JSON.parse(fs.readFileSync(path.join(animationsRoot, "ragdoll_yawn", "loop.json"), "utf8"));

  assert.equal(loop.sourceFrameCount, 335);
  assert.equal(loop.frameCount, 335);
  assert.equal(loop.loopSelection, "full");
  assert.equal(loop.tailLoopStart, 294);
  assert.equal(loop.loopEnd, 334);
});

test("ragdoll runtime frames use optimized source ranges", () => {
  const expectedRanges = {
    ragdoll_walk: { frameCount: 103, sourceLoopStart: 27, sourceLoopEnd: 129 },
    ragdoll_feed: { frameCount: 77, sourceLoopStart: 90, sourceLoopEnd: 166 },
    ragdoll_shake: { frameCount: 90, sourceLoopStart: 56, sourceLoopEnd: 145 }
  };

  for (const [action, expected] of Object.entries(expectedRanges)) {
    const loop = JSON.parse(fs.readFileSync(path.join(animationsRoot, action, "loop.json"), "utf8"));
    assert.equal(loop.loopSelection, "manual");
    assert.equal(loop.frameCount, expected.frameCount);
    assert.equal(loop.loopEnd, expected.frameCount - 1);
    assert.equal(loop.sourceLoopStart, expected.sourceLoopStart);
    assert.equal(loop.sourceLoopEnd, expected.sourceLoopEnd);
    assert.equal(loop.trimGroundAlpha, 128);
  }
});

test("ragdoll runtime frames trim ground alpha remnants", () => {
  for (const entry of manifest) {
    assert.equal(entry.trimGroundAlpha, 128);
    assert.equal(entry.trimGroundPadding, 1);
  }
});
