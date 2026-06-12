const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const stretchDir = path.join(projectRoot, "assets", "animations", "tabby_stretch");

function listFrames(dir) {
  return fs.readdirSync(dir).filter((name) => /^frame_\d{3}\.png$/.test(name)).sort();
}

test("tabby stretch keeps full processed frames as the runtime action", () => {
  const loop = JSON.parse(fs.readFileSync(path.join(stretchDir, "loop.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "assets", "animations", "tabby_actions_manifest.json"), "utf8"));
  const transparentFrames = listFrames(path.join(stretchDir, "transparent_frames"));
  const processedFrames = listFrames(path.join(stretchDir, "processed_frames"));

  assert.equal(loop.loopSelection, "full");
  assert.equal(transparentFrames.length, 167);
  assert.equal(processedFrames.length, 167);
  assert.equal(transparentFrames.length, loop.frameCount);
  assert.equal(processedFrames.length, loop.sourceFrameCount);
  assert.equal(fs.existsSync(path.join(stretchDir, "tabby_stretch.mp4")), true);
  assert.deepEqual(manifest.find((item) => item.action === "tabby_stretch"), loop);
});
