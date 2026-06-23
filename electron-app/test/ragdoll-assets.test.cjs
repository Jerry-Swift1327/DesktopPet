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
  assert.equal(loop.tailLoopStart, 240);
  assert.equal(loop.loopEnd, 334);
});
