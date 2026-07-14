const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const animationsRoot = path.join(__dirname, "..", "..", "assets", "animations");

test("pet2612 idle yawn freezes its final runtime frame", () => {
  const loop = JSON.parse(fs.readFileSync(path.join(animationsRoot, "pet2612_yawn", "loop.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(animationsRoot, "pet2612_actions_manifest.json"), "utf8"));
  const manifestYawn = manifest.find((item) => item.action === "pet2612_yawn");

  assert.equal(loop.freezeLastFrame, true);
  assert.equal(loop.tailLoopStart, undefined);
  assert.deepEqual(manifestYawn, loop);
});
