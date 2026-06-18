const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "assets", "animations", "tabby_actions_manifest.json"), "utf8"));

function listFrames(dir) {
  return fs.readdirSync(dir).filter((name) => /^frame_\d{3}\.png$/.test(name)).sort();
}

function measureFrameBounds(file) {
  const result = require("node:child_process").spawnSync("python", ["-c", `
from PIL import Image
import json, sys
alpha = Image.open(sys.argv[1]).convert("RGBA").getchannel("A").point(lambda value: 255 if value > 12 else 0)
box = alpha.getbbox()
print(json.dumps({"left": box[0], "top": box[1], "right": box[2] - 1, "bottom": box[3] - 1}))
`, file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
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

test("tabby yawn plays into the stable sleep tail loop", () => {
  const actionDir = path.join(projectRoot, "assets", "animations", "tabby_yawn");
  const loop = JSON.parse(fs.readFileSync(path.join(actionDir, "loop.json"), "utf8"));
  const transparentFrames = listFrames(path.join(actionDir, "transparent_frames"));

  assert.equal(loop.loopSelection, "manual");
  assert.equal(loop.sourceFrameCount, 335);
  assert.equal(loop.sourceLoopStart, 0);
  assert.equal(loop.sourceLoopEnd, 334);
  assert.equal(loop.tailLoopStart, 285);
  assert.equal(transparentFrames.length, 335);
  assert.equal(transparentFrames.length, loop.frameCount);
  const firstBounds = measureFrameBounds(path.join(actionDir, "transparent_frames", "frame_000.png"));
  assert.equal(firstBounds.bottom, 238);
  assert.ok(firstBounds.left >= 70 && firstBounds.right <= 220);
  for (const frameName of ["frame_004.png", "frame_005.png", "frame_006.png", "frame_007.png", "frame_008.png", "frame_009.png", "frame_010.png"]) {
    const entryBounds = measureFrameBounds(path.join(actionDir, "transparent_frames", frameName));
    assert.ok(entryBounds.right <= 204);
  }
  const tailBounds = measureFrameBounds(path.join(actionDir, "transparent_frames", "frame_285.png"));
  assert.deepEqual(tailBounds, { left: 65, top: 135, right: 200, bottom: 238 });
  assert.deepEqual(measureFrameBounds(path.join(actionDir, "transparent_frames", "frame_334.png")), tailBounds);
  assert.deepEqual(manifest.find((item) => item.action === "tabby_yawn"), loop);
});
