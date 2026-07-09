const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const projectRoot = path.join(__dirname, "..", "..");
const animationsRoot = path.join(projectRoot, "assets", "animations");
const manifest = JSON.parse(fs.readFileSync(path.join(animationsRoot, "pet2611_actions_manifest.json"), "utf8"));

function readLoop(action) {
  return JSON.parse(fs.readFileSync(path.join(animationsRoot, action, "loop.json"), "utf8"));
}

function countFrames(action) {
  return fs.readdirSync(path.join(animationsRoot, action, "transparent_frames"))
    .filter((name) => /^frame_\d+\.png$/i.test(name))
    .length;
}

function detachedComponentsAboveSubject(action) {
  const framesDir = path.join(animationsRoot, action, "transparent_frames");
  const script = String.raw`
import json
import sys
from pathlib import Path
from PIL import Image

def components(frame_path, threshold=10):
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

detached = []
for frame_path in sorted(Path(sys.argv[1]).glob("frame_*.png")):
    frame_components = components(frame_path)
    if not frame_components:
        continue
    subject = frame_components[0]
    for component in frame_components[1:]:
        if component["bottom"] < subject["top"] - 2 and component["area"] <= 384:
            component["frame"] = frame_path.name
            detached.append(component)
print(json.dumps(detached))
`;
  const result = spawnSync("python", ["-c", script, framesDir], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("pet2611 includes yawn with a frozen final sleep frame", () => {
  assert.deepEqual(manifest.map((item) => item.action), [
    "pet2611_squat",
    "pet2611_walk",
    "pet2611_feed",
    "pet2611_ball",
    "pet2611_yawn"
  ]);

  const yawnLoop = readLoop("pet2611_yawn");
  const manifestYawn = manifest.find((item) => item.action === "pet2611_yawn");

  assert.equal(yawnLoop.frameCount, 167);
  assert.equal(countFrames("pet2611_yawn"), 167);
  assert.equal(yawnLoop.loopSelection, "full");
  assert.equal(yawnLoop.freezeLastFrame, true);
  assert.deepEqual(manifestYawn, yawnLoop);
});

test("pet2611 walk uses a deduplicated manual loop segment", () => {
  const walkLoop = readLoop("pet2611_walk");
  const manifestWalk = manifest.find((item) => item.action === "pet2611_walk");

  assert.equal(walkLoop.frameMs, 41);
  assert.equal(walkLoop.frameCount, 38);
  assert.equal(countFrames("pet2611_walk"), 38);
  assert.equal(walkLoop.loopStart, 0);
  assert.equal(walkLoop.loopEnd, 37);
  assert.equal(walkLoop.sourceLoopStart, 85);
  assert.equal(walkLoop.sourceLoopEnd, 136);
  assert.equal(walkLoop.loopSelection, "manual-deduplicated");
  assert.equal(walkLoop.sourceSampling, "explicit-adjacent-deduplicated");
  assert.equal(walkLoop.droppedDuplicateFrames, 14);
  assert.equal(walkLoop.dedupeThreshold, 0.0005);
  assert.equal(walkLoop.detachedArtifactMode, "processed-subject-components");
  assert.equal(walkLoop.detachedArtifactMaxArea, 384);
  assert.equal(walkLoop.detachedArtifacts.applied, true);
  assert.equal(walkLoop.detachedArtifacts.keptComponents, 0);
  assert.equal(walkLoop.detachedArtifacts.warningCount, 0);
  assert.equal(walkLoop.sourceFrames.length, 38);
  assert.deepEqual(walkLoop.sourceFrames.slice(0, 5), [85, 86, 88, 89, 90]);
  assert.deepEqual(walkLoop.sourceFrames.slice(-5), [131, 132, 133, 135, 136]);
  assert.equal(new Set(walkLoop.sourceFrames).size, walkLoop.sourceFrames.length);
  assert.deepEqual(detachedComponentsAboveSubject("pet2611_walk"), []);
  assert.deepEqual(manifestWalk, walkLoop);
});
