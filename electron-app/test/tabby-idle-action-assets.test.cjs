const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "assets", "animations", "tabby_actions_manifest.json"), "utf8"));

function listFrames(dir) {
  return fs.readdirSync(dir).filter((name) => /^frame_\d{3}\.png$/.test(name)).sort();
}

test("tabby idle actions use full processed frames as runtime frames", () => {
  for (const action of ["tabby_hiss", "tabby_sleep"]) {
    const actionDir = path.join(projectRoot, "assets", "animations", action);
    const loop = JSON.parse(fs.readFileSync(path.join(actionDir, "loop.json"), "utf8"));
    const transparentFrames = listFrames(path.join(actionDir, "transparent_frames"));
    const processedFrames = listFrames(path.join(actionDir, "processed_frames"));

    assert.equal(loop.loopSelection, "full");
    assert.equal(transparentFrames.length, 168);
    assert.equal(processedFrames.length, 168);
    assert.equal(transparentFrames.length, loop.frameCount);
    assert.equal(processedFrames.length, loop.sourceFrameCount);
    assert.deepEqual(manifest.find((item) => item.action === action), loop);
  }
});

test("tabby yawn starts from the squat-friendly source frame", () => {
  const actionDir = path.join(projectRoot, "assets", "animations", "tabby_yawn");
  const loop = JSON.parse(fs.readFileSync(path.join(actionDir, "loop.json"), "utf8"));
  const transparentFrames = listFrames(path.join(actionDir, "transparent_frames"));
  const processedFrames = listFrames(path.join(actionDir, "processed_frames"));

  assert.equal(loop.loopSelection, "manual");
  assert.equal(loop.sourceLoopStart, 10);
  assert.equal(loop.sourceLoopEnd, 167);
  assert.equal(transparentFrames.length, 158);
  assert.equal(processedFrames.length, 168);
  assert.equal(transparentFrames.length, loop.frameCount);
  assert.equal(processedFrames.length, loop.sourceFrameCount);
  assert.deepEqual(manifest.find((item) => item.action === "tabby_yawn"), loop);
});
