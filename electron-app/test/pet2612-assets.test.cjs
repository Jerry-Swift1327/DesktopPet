const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const animationsRoot = path.join(__dirname, "..", "..", "assets", "animations");
const manifest = JSON.parse(fs.readFileSync(path.join(animationsRoot, "pet2612_actions_manifest.json"), "utf8"));

function inspectSpinFrames() {
  const framesDir = path.join(animationsRoot, "pet2612_spin", "transparent_frames");
  const script = String.raw`
import json
import sys
from pathlib import Path
from PIL import Image

def components(frame_path, threshold=12):
    image = Image.open(frame_path).convert("RGBA")
    alpha = image.getchannel("A")
    width, height = image.size
    visited = set()
    rows = alpha.load()
    result = []
    for y in range(height):
        for x in range(width):
            if (x, y) in visited or rows[x, y] <= threshold:
                continue
            stack = [(x, y)]
            visited.add((x, y))
            xs = []
            ys = []
            while stack:
                cx, cy = stack.pop()
                xs.append(cx)
                ys.append(cy)
                for ny in range(cy - 1, cy + 2):
                    for nx in range(cx - 1, cx + 2):
                        if (nx == cx and ny == cy) or nx < 0 or ny < 0 or nx >= width or ny >= height:
                            continue
                        if (nx, ny) not in visited and rows[nx, ny] > threshold:
                            visited.add((nx, ny))
                            stack.append((nx, ny))
            result.append({
                "area": len(xs),
                "left": min(xs),
                "top": min(ys),
                "right": max(xs),
                "bottom": max(ys),
            })
    return sorted(result, key=lambda item: item["area"], reverse=True)

bottoms = []
detached = []
frame_paths = sorted(Path(sys.argv[1]).glob("frame_*.png"))
for frame_path in frame_paths:
    frame_components = components(frame_path)
    if not frame_components:
        continue
    subject = frame_components[0]
    bottoms.append(subject["bottom"])
    for component in frame_components[1:]:
        separated = (
            component["bottom"] < subject["top"] - 2
            or component["top"] > subject["bottom"] + 2
            or component["right"] < subject["left"] - 2
            or component["left"] > subject["right"] + 2
        )
        if separated:
            component["frame"] = frame_path.name
            detached.append(component)

print(json.dumps({"frameCount": len(frame_paths), "bottoms": bottoms, "detached": detached}))
`;
  const result = spawnSync("python", ["-c", script, framesDir], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("pet2612 idle yawn freezes its final runtime frame", () => {
  const loop = JSON.parse(fs.readFileSync(path.join(animationsRoot, "pet2612_yawn", "loop.json"), "utf8"));
  const manifestYawn = manifest.find((item) => item.action === "pet2612_yawn");

  assert.equal(loop.freezeLastFrame, true);
  assert.equal(loop.tailLoopStart, undefined);
  assert.deepEqual(manifestYawn, loop);
});

test("pet2612 spin removes detached watermarks and keeps a stable ground line", () => {
  const loop = JSON.parse(fs.readFileSync(path.join(animationsRoot, "pet2612_spin", "loop.json"), "utf8"));
  const manifestSpin = manifest.find((item) => item.action === "pet2612_spin");
  const inspection = inspectSpinFrames();

  assert.equal(loop.frameCount, 168);
  assert.equal(loop.detachedArtifacts.enabled, true);
  assert.equal(loop.detachedArtifacts.applied, true);
  assert.equal(loop.detachedArtifacts.keptComponents, 0);
  assert.equal(loop.detachedArtifacts.warningCount, 0);
  assert.equal(loop.stableGround.warningCount, 0);
  assert.equal(loop.stableGround.clampedFrames, 0);
  assert.equal(inspection.frameCount, loop.frameCount);
  assert.deepEqual(inspection.detached, []);
  assert.equal(Math.min(...inspection.bottoms), loop.stableGround.targetBottom);
  assert.ok(Math.max(...inspection.bottoms) <= loop.stableGround.targetBottom + 1);
  assert.deepEqual(manifestSpin, loop);
});
