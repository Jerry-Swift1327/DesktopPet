const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const walkDir = path.join(projectRoot, "assets", "animations", "tabby_walk");

function listFrames(dir) {
  return fs.readdirSync(dir).filter((name) => /^frame_\d{3}\.png$/.test(name)).sort();
}

test("tabby walk keeps selected loop frames and processed cache in sync", () => {
  const loop = JSON.parse(fs.readFileSync(path.join(walkDir, "loop.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "assets", "animations", "tabby_actions_manifest.json"), "utf8"));
  const transparentFrames = listFrames(path.join(walkDir, "transparent_frames"));
  const processedFrames = listFrames(path.join(walkDir, "processed_frames"));

  assert.equal(transparentFrames.length, loop.frameCount);
  assert.equal(transparentFrames[0], "frame_000.png");
  assert.equal(transparentFrames.at(-1), `frame_${String(loop.loopEnd).padStart(3, "0")}.png`);
  assert.equal(processedFrames.length, loop.sourceFrameCount);
  assert.equal(fs.existsSync(path.join(walkDir, "tabby_walk.mp4")), true);
  assert.deepEqual(manifest.find((item) => item.action === "tabby_walk"), loop);
});
