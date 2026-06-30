const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createVariant,
  renameAssets,
  findSourceVideo
} = require("../scripts/variant-cli.cjs");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-variant-"));
}

test("variant CLI creates metadata with generated breed id fields", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  fs.mkdirSync(animationsRoot, { recursive: true });
  fs.writeFileSync(metadataFile, JSON.stringify({ schemaVersion: 1, variants: {} }, null, 2), "utf8");

  const draft = createVariant(
    { breed: "lihua", date: "2026-06-30", code: "k7x9" },
    { metadataFile, animationsRoot }
  );
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(draft.id, "lihua-k7x9");
  assert.equal(metadata.variants["lihua-k7x9"].breed, "lihua");
  assert.equal(metadata.variants["lihua-k7x9"].date, "2026-06-30");
  assert.throws(
    () => createVariant({ breed: "lihua", date: "2026-06-30", code: "k7x9" }, { metadataFile, animationsRoot }),
    /Variant already exists/
  );
});

test("variant CLI rejects unknown breeds and invalid dates", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  fs.writeFileSync(metadataFile, JSON.stringify({ schemaVersion: 1, variants: {} }, null, 2), "utf8");

  assert.throws(
    () => createVariant({ breed: "unknown", date: "2026-06-30" }, { metadataFile, animationsRoot: tempDir }),
    /Unknown breed/
  );
  assert.throws(
    () => createVariant({ breed: "lihua", date: "2026-02-30" }, { metadataFile, animationsRoot: tempDir }),
    /Invalid variant date/
  );
});

test("variant CLI copies and renames source videos into action directories", () => {
  const tempDir = createTempDir();
  const sourceDir = path.join(tempDir, "downloads");
  const animationsRoot = path.join(tempDir, "animations");
  fs.mkdirSync(sourceDir, { recursive: true });
  for (const action of ["squat", "walk", "feed", "ball"]) {
    fs.writeFileSync(path.join(sourceDir, `tabby_${action}.mp4`), action, "utf8");
  }

  renameAssets({ id: "dog", from: sourceDir }, { animationsRoot });

  for (const action of ["squat", "walk", "feed", "ball"]) {
    assert.equal(
      fs.readFileSync(path.join(animationsRoot, `dog_${action}`, `dog_${action}.mp4`), "utf8"),
      action
    );
  }
});

test("variant CLI refuses ambiguous source videos", () => {
  const tempDir = createTempDir();
  fs.writeFileSync(path.join(tempDir, "tabby_squat.mp4"), "a", "utf8");
  fs.writeFileSync(path.join(tempDir, "cat_squat.mp4"), "b", "utf8");

  assert.throws(() => findSourceVideo(tempDir, "squat"), /Multiple source videos/);
});
