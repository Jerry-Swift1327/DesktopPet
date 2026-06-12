const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const lookDir = path.join(projectRoot, "assets", "animations", "tabby_look");
const framesDir = path.join(lookDir, "transparent_frames");
const processedDir = path.join(lookDir, "processed_frames");

test("tabby eye tracking uses 64 sampled direction frames", () => {
  const frames = fs.readdirSync(framesDir)
    .filter((name) => /^frame_\d{3}\.png$/.test(name))
    .sort();

  assert.equal(frames.length, 64);
  assert.equal(frames[0], "frame_000.png");
  assert.equal(frames.at(-1), "frame_063.png");
  assert.equal(fs.existsSync(path.join(framesDir, "tabby_look_center.png")), false);
  assert.equal(fs.existsSync(path.join(lookDir, "tabby_look.mp4")), true);
});

test("tabby eye tracking metadata matches sampled frames", () => {
  const loop = JSON.parse(fs.readFileSync(path.join(lookDir, "loop.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "assets", "animations", "tabby_actions_manifest.json"), "utf8"));
  const entry = manifest.find((item) => item.action === "tabby_look");

  assert.equal(loop.frameCount, 64);
  assert.equal(loop.directionFrameCount, 64);
  assert.equal(loop.sourceSampling, "visual-motion-even");
  assert.equal(loop.sourceStartPolicy, "tail-matched-first-frame");
  assert.equal(loop.sourceFrames.length, 64);
  assert.equal(loop.sourceFrames[0], 167);
  assert.deepEqual(entry, loop);
});

test("tabby eye tracking keeps full processed frame cache", () => {
  const frames = fs.readdirSync(processedDir)
    .filter((name) => /^frame_\d{3}\.png$/.test(name))
    .sort();

  assert.equal(frames.length, 168);
  assert.equal(frames[0], "frame_000.png");
  assert.equal(frames.at(-1), "frame_167.png");
});
