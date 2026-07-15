const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const animationsRoot = path.join(__dirname, "..", "..", "assets", "animations");
const manifest = JSON.parse(fs.readFileSync(path.join(animationsRoot, "pet2613_actions_manifest.json"), "utf8"));

function readLoop(action) {
  return JSON.parse(fs.readFileSync(path.join(animationsRoot, action, "loop.json"), "utf8"));
}

function inspectBallFrames() {
  const framesDir = path.join(animationsRoot, "pet2613_ball", "transparent_frames");
  const script = String.raw`
import json
import sys
from pathlib import Path
from PIL import Image

samples = []
frame_paths = sorted(Path(sys.argv[1]).glob("frame_*.png"))
for frame_index in (0, 15, 55, len(frame_paths) - 2, len(frame_paths) - 1):
    image = Image.open(frame_paths[frame_index]).convert("RGBA")
    pixels = image.load()
    ball_green = 0
    head_green = 0
    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            is_green = alpha > 128 and green > red * 1.2 and green > blue * 1.2
            if is_green and 112 <= x <= 145 and 194 <= y <= 225:
                ball_green += 1
            if is_green and 65 <= x <= 190 and 20 <= y <= 115:
                head_green += 1
    samples.append({"frame": frame_index, "ballGreen": ball_green, "headGreen": head_green})

print(json.dumps({"frameCount": len(frame_paths), "samples": samples}))
`;
  const result = spawnSync("python", ["-c", script, framesDir], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("pet2613 idle yawn freezes its final frame independently of dog species", () => {
  const loop = readLoop("pet2613_yawn");
  const manifestYawn = manifest.find((item) => item.action === "pet2613_yawn");

  assert.equal(loop.freezeLastFrame, true);
  assert.equal(loop.tailLoopStart, undefined);
  assert.deepEqual(manifestYawn, loop);
});

test("pet2613 ball keeps colorful prop pixels in a sufficiently long loop", () => {
  const loop = readLoop("pet2613_ball");
  const manifestBall = manifest.find((item) => item.action === "pet2613_ball");
  const inspection = inspectBallFrames();

  assert.equal(loop.brightColorForegroundProtection, true);
  assert.equal(loop.loopSelection, "long");
  assert.ok(loop.frameCount >= 90);
  assert.equal(inspection.frameCount, loop.frameCount);
  assert.equal(inspection.samples.every((sample) => sample.ballGreen >= 60), true);
  assert.equal(inspection.samples.every((sample) => sample.headGreen === 0), true);
  assert.deepEqual(manifestBall, loop);
});
