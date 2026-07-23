const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const animationsRoot = path.join(__dirname, "..", "..", "assets", "animations");
const manifest = JSON.parse(fs.readFileSync(path.join(animationsRoot, "pet2615_actions_manifest.json"), "utf8"));

function inspectDetachedRuntimeComponents() {
  const framesDir = path.join(animationsRoot, "pet2615_walk", "transparent_frames");
  const script = String.raw`
import json
import sys
from pathlib import Path
from PIL import Image

def components(frame_path):
    image = Image.open(frame_path).convert("RGBA")
    alpha = image.getchannel("A")
    width, height = image.size
    rows = alpha.load()
    visited = set()
    result = []
    for y in range(height):
        for x in range(width):
            if (x, y) in visited or rows[x, y] == 0:
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
                        if nx < 0 or ny < 0 or nx >= width or ny >= height or (nx, ny) in visited:
                            continue
                        if rows[nx, ny] > 0:
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

detached = []
frame_paths = sorted(Path(sys.argv[1]).glob("frame_*.png"))
for frame_path in frame_paths:
    frame_components = components(frame_path)
    if not frame_components:
        continue
    subject = frame_components[0]
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

print(json.dumps({"frameCount": len(frame_paths), "detached": detached}))
`;
  const result = spawnSync("python", ["-c", script, framesDir], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("pet2615 walk removes detached corner watermarks and keeps its runtime selection", () => {
  const loop = JSON.parse(fs.readFileSync(path.join(animationsRoot, "pet2615_walk", "loop.json"), "utf8"));
  const manifestWalk = manifest.find((item) => item.action === "pet2615_walk");
  const inspection = inspectDetachedRuntimeComponents();

  assert.equal(loop.sourceFrameCount, 168);
  assert.equal(loop.frameCount, 123);
  assert.deepEqual(loop.sourceFrames, Array.from({ length: 123 }, (_value, index) => index + 45));
  assert.equal(loop.detachedArtifacts.enabled, true);
  assert.equal(loop.detachedArtifacts.applied, true);
  assert.equal(loop.detachedArtifacts.keptComponents, 0);
  assert.equal(loop.detachedArtifacts.warningCount, 0);
  assert.equal(loop.detachedArtifactMaxArea, 192);
  assert.equal(loop.detachedArtifactMaxSpan, 32);
  assert.equal(loop.detachedArtifactMinGap, 2);
  assert.equal(inspection.frameCount, loop.frameCount);
  assert.deepEqual(inspection.detached, []);
  assert.deepEqual(manifestWalk, loop);
});
