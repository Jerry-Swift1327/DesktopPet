const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const framesDir = path.join(__dirname, "..", "..", "assets", "animations", "tabby_lie", "transparent_frames");
const sleepFramesDir = path.join(__dirname, "..", "..", "assets", "animations", "tabby_sleep", "transparent_frames");

test("tabby lie frames do not keep alpha remnants below the body", () => {
  const script = `
from pathlib import Path
from PIL import Image
import sys

bad = []
for frame in sorted(Path(sys.argv[1]).glob("frame_*.png")):
    alpha = Image.open(frame).convert("RGBA").getchannel("A").point(lambda value: 255 if value > 12 else 0)
    box = alpha.getbbox()
    if box and box[3] - 1 > 200:
        bad.append(f"{frame.name}:{box[3] - 1}")
if bad:
    print("\\n".join(bad))
    sys.exit(1)
print("ok")
`;
  const result = spawnSync("python", ["-c", script, framesDir], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "ok");
});

test("tabby sleep frames trim ground alpha remnants", () => {
  const script = `
from pathlib import Path
from PIL import Image
import sys

bad = []
for frame in sorted(Path(sys.argv[1]).glob("frame_*.png")):
    alpha = Image.open(frame).convert("RGBA").getchannel("A").point(lambda value: 255 if value > 12 else 0)
    box = alpha.getbbox()
    if box and box[3] - 1 > 240:
        bad.append(f"{frame.name}:{box[3] - 1}")
if bad:
    print("\\n".join(bad))
    sys.exit(1)
print("ok")
`;
  const result = spawnSync("python", ["-c", script, sleepFramesDir], { encoding: "utf8" });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "ok");
});
