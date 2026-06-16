const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "assets", "animations", "bshmitted_actions_manifest.json"), "utf8"));

test("bshmitted actions use long loop runtime frames", () => {
  for (const action of ["bshmitted_squat", "bshmitted_walk", "bshmitted_feed", "bshmitted_ball"]) {
    const actionDir = path.join(projectRoot, "assets", "animations", action);
    const loop = JSON.parse(fs.readFileSync(path.join(actionDir, "loop.json"), "utf8"));
    const frameCount = fs.readdirSync(path.join(actionDir, "transparent_frames")).filter((name) => /^frame_\d+\.png$/.test(name)).length;

    assert.equal(loop.action, action);
    assert.equal(loop.loopSelection, "long");
    assert.equal(loop.frameCount, frameCount);
    assert.ok(loop.frameCount >= 90);
    assert.deepEqual(manifest.find((item) => item.action === action), loop);
  }
});
