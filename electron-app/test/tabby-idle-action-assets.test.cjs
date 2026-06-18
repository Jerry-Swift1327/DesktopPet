const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "assets", "animations", "tabby_actions_manifest.json"), "utf8"));

function listFrames(dir) {
  return fs.readdirSync(dir).filter((name) => /^frame_\d{3}\.png$/.test(name)).sort();
}

test("tabby hiss uses full processed frames as runtime frames", () => {
  const actionDir = path.join(projectRoot, "assets", "animations", "tabby_hiss");
  const loop = JSON.parse(fs.readFileSync(path.join(actionDir, "loop.json"), "utf8"));
  const transparentFrames = listFrames(path.join(actionDir, "transparent_frames"));
  const processedFrames = listFrames(path.join(actionDir, "processed_frames"));

  assert.equal(loop.loopSelection, "full");
  assert.equal(transparentFrames.length, 168);
  assert.equal(processedFrames.length, 168);
  assert.equal(transparentFrames.length, loop.frameCount);
  assert.equal(processedFrames.length, loop.sourceFrameCount);
  assert.deepEqual(manifest.find((item) => item.action === "tabby_hiss"), loop);
});

test("tabby yawn uses the transition frames before stable sleep", () => {
  const actionDir = path.join(projectRoot, "assets", "animations", "tabby_yawn");
  const loop = JSON.parse(fs.readFileSync(path.join(actionDir, "loop.json"), "utf8"));
  const transparentFrames = listFrames(path.join(actionDir, "transparent_frames"));

  assert.equal(loop.loopSelection, "manual");
  assert.equal(loop.sourceFrameCount, 335);
  assert.equal(loop.sourceLoopStart, 0);
  assert.equal(loop.sourceLoopEnd, 232);
  assert.equal(transparentFrames.length, 233);
  assert.equal(transparentFrames.length, loop.frameCount);
  assert.deepEqual(manifest.find((item) => item.action === "tabby_yawn"), loop);
});

test("tabby sleep loops the stable sleeping frames after yawn", () => {
  const actionDir = path.join(projectRoot, "assets", "animations", "tabby_sleep");
  const loop = JSON.parse(fs.readFileSync(path.join(actionDir, "loop.json"), "utf8"));
  const transparentFrames = listFrames(path.join(actionDir, "transparent_frames"));

  assert.equal(loop.loopSelection, "manual");
  assert.equal(loop.sourceFrameCount, 335);
  assert.equal(loop.sourceLoopStart, 233);
  assert.equal(loop.sourceLoopEnd, 334);
  assert.equal(transparentFrames.length, 102);
  assert.equal(transparentFrames.length, loop.frameCount);
  assert.deepEqual(manifest.find((item) => item.action === "tabby_sleep"), loop);
});
