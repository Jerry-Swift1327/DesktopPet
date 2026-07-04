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

function measureFrameGeometry(file) {
  const result = require("node:child_process").spawnSync("python", ["-c", `
from PIL import Image
import json, sys
image = Image.open(sys.argv[1]).convert("RGBA")
alpha = image.getchannel("A").point(lambda value: 255 if value > 12 else 0)
box = alpha.getbbox()
if box is None:
    raise SystemExit("frame has no visible alpha")
left, top, right, bottom = box[0], box[1], box[2] - 1, box[3] - 1
print(json.dumps({
    "size": [image.width, image.height],
    "left": left,
    "top": top,
    "right": right,
    "bottom": bottom,
    "centerX": (left + right + 1) / 2,
    "centerY": (top + bottom + 1) / 2
}))
`, file], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

function measureActionBottoms(action) {
  const framesDir = path.join(animationsRoot, action, "transparent_frames");
  const result = require("node:child_process").spawnSync("python", ["-c", `
from PIL import Image
import json, pathlib, re, sys
frames_dir = pathlib.Path(sys.argv[1])
bottoms = []
for frame in sorted(frames_dir.iterdir()):
    if not re.match(r"frame_\\d{3}\\.png$", frame.name):
        continue
    image = Image.open(frame).convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 255 if value > 12 else 0)
    box = alpha.getbbox()
    if box is None:
        raise SystemExit(f"{frame.name} has no visible alpha")
    bottoms.append(box[3] - 1)
print(json.dumps(bottoms))
`, framesDir], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
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
  assert.equal(loop.tailLoopStart, 294);
  assert.equal(loop.loopEnd, 334);
});

test("ragdoll runtime frames use optimized source ranges", () => {
  const expectedRanges = {
    ragdoll_walk: { frameCount: 125, sourceLoopStart: 2, sourceLoopEnd: 126, loopSelection: "long", targetLength: 126 },
    ragdoll_feed: { frameCount: 77, sourceLoopStart: 90, sourceLoopEnd: 166, loopSelection: "manual" }
  };

  for (const [action, expected] of Object.entries(expectedRanges)) {
    const loop = JSON.parse(fs.readFileSync(path.join(animationsRoot, action, "loop.json"), "utf8"));
    assert.equal(loop.loopSelection, expected.loopSelection);
    assert.equal(loop.frameCount, expected.frameCount);
    assert.equal(loop.loopEnd, expected.frameCount - 1);
    assert.equal(loop.sourceLoopStart, expected.sourceLoopStart);
    assert.equal(loop.sourceLoopEnd, expected.sourceLoopEnd);
    assert.equal(loop.trimGroundAlpha, 128);
    if (expected.targetLength !== undefined) {
      assert.equal(loop.targetLength, expected.targetLength);
    }
  }
});

test("ragdoll runtime frames trim ground alpha remnants", () => {
  for (const entry of manifest) {
    const expectedAlpha = entry.action === "ragdoll_belly" ? 200 : 128;
    assert.equal(entry.trimGroundAlpha, expectedAlpha);
    assert.equal(entry.trimGroundPadding, 1);
  }
});

test("ragdoll runtime frames preserve source-canvas layout at 256px", () => {
  const expectedSourceCanvasSizes = {
    ragdoll_squat: [960, 960],
    ragdoll_walk: [720, 720],
    ragdoll_feed: [960, 960],
    ragdoll_ball: [960, 960],
    ragdoll_spin: [720, 720],
    ragdoll_lick: [960, 960],
    ragdoll_stretch: [720, 720],
    ragdoll_belly: [960, 960],
    ragdoll_yawn: [720, 720],
    ragdoll_hiss: [720, 720]
  };

  for (const entry of manifest) {
    assert.equal(entry.frameSize, 256);
    assert.equal(entry.normalizationMode, "source-canvas");
    assert.deepEqual(entry.sourceCanvasSize, expectedSourceCanvasSizes[entry.action]);
  }

  const firstSquat = measureFrameGeometry(path.join(animationsRoot, "ragdoll_squat", "transparent_frames", "frame_000.png"));
  assert.deepEqual(firstSquat.size, [256, 256]);
  assert.ok(
    firstSquat.centerX >= 124 && firstSquat.centerX <= 142,
    `expected first squat frame to stay near the source canvas center, got ${firstSquat.centerX}`
  );
});

test("ragdoll listen frames keep their visible bottoms stable", () => {
  const loop = JSON.parse(fs.readFileSync(path.join(animationsRoot, "ragdoll_belly", "loop.json"), "utf8"));
  const bottoms = measureActionBottoms("ragdoll_belly");
  const bottomRange = Math.max(...bottoms) - Math.min(...bottoms);

  assert.equal(loop.alignReferenceAction, "ragdoll_squat");
  assert.equal(loop.alignReferenceBottom, true);
  assert.equal(loop.trimGroundAlpha, 200);
  assert.ok(
    bottomRange <= 2,
    `ragdoll_belly bottom range should stay within 2px, got ${bottomRange}`
  );
});
