const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..", "..");
const animationsRoot = path.join(projectRoot, "assets", "animations");
const manifest = JSON.parse(fs.readFileSync(path.join(animationsRoot, "pet2611_actions_manifest.json"), "utf8"));

test("pet2611 keeps only base actions until yawn resources are generated", () => {
  assert.deepEqual(manifest.map((item) => item.action), [
    "pet2611_squat",
    "pet2611_walk",
    "pet2611_feed",
    "pet2611_ball"
  ]);
  assert.equal(fs.existsSync(path.join(animationsRoot, "pet2611_yawn")), false);
});
