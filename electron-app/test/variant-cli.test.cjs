const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createVariant,
  renameAssets,
  findSourceVideo,
  formatList,
  getVariantSummary,
  resolveVariantInput
} = require("../scripts/variant-cli.cjs");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-variant-"));
}

test("variant CLI creates metadata with generated pet-year sequence id fields", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  fs.mkdirSync(animationsRoot, { recursive: true });
  fs.writeFileSync(metadataFile, JSON.stringify({ schemaVersion: 1, variants: {} }, null, 2), "utf8");

  const draft = createVariant(
    { breed: "lihua", date: "2026-06-30" },
    { metadataFile, animationsRoot }
  );
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(draft.id, "pet2601");
  assert.equal(draft.aliases, "");
  assert.equal(metadata.variants.pet2601.breed, "lihua");
  assert.equal(metadata.variants.pet2601.date, "2026-06-30");
  assert.throws(
    () => createVariant({ breed: "lihua", date: "2026-06-30", id: "pet2601" }, { metadataFile, animationsRoot }),
    /already exists/
  );
});

test("variant CLI sequence generation scans existing same-year dates", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  fs.mkdirSync(animationsRoot, { recursive: true });
  fs.writeFileSync(metadataFile, JSON.stringify({
    schemaVersion: 1,
    variants: {
      pet2601: { id: "pet2601", breed: "gr", date: "2026-05-08", aliases: "" },
      pet2602: { id: "pet2602", breed: "ash", date: "2026-05-27", aliases: "" },
      pet2603: { id: "pet2603", breed: "sf", date: "2026-05-28", aliases: "" },
      pet2604: { id: "pet2604", breed: "pom", date: "2026-06-06", aliases: "" }
    }
  }, null, 2), "utf8");

  const draft = createVariant(
    { breed: "bsh", date: "2026-06-30" },
    { metadataFile, animationsRoot }
  );

  assert.equal(draft.id, "pet2605");
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

test("variant CLI copies existing variant videos into preserved action directories", () => {
  const tempDir = createTempDir();
  const sourceDir = path.join(tempDir, "downloads");
  const animationsRoot = path.join(tempDir, "animations");
  fs.mkdirSync(sourceDir, { recursive: true });
  for (const action of ["squat", "walk", "feed", "ball"]) {
    fs.writeFileSync(path.join(sourceDir, `tabby_${action}.mp4`), action, "utf8");
  }

  renameAssets({ id: "pet2601", from: sourceDir }, { animationsRoot });

  for (const action of ["squat", "walk", "feed", "ball"]) {
    assert.equal(
      fs.readFileSync(path.join(animationsRoot, `dog_${action}`, `dog_${action}.mp4`), "utf8"),
      action
    );
  }
});

test("variant CLI list output is aligned without tabs", () => {
  const output = formatList([
    getVariantSummary("pet2601"),
    getVariantSummary("pet2604")
  ]);
  const lines = output.split(/\r?\n/);

  assert.equal(output.includes("\t"), false);
  assert.match(lines[0], /^id +aliases +breed +date +scope +platforms +version$/);
  assert.match(lines[1], /^-+ +-+ +-+ +-+ +-+ +-+ +-+$/);
  assert.match(output, /pet2601 +- +gr +2026-05-08 +internal +win32,darwin +1\.1/);
  assert.match(output, /pet2604 +- +pom +2026-06-06 +custom +darwin +1\.0/);
});

test("variant CLI resolves canonical pet ids only", () => {
  assert.equal(resolveVariantInput("pet2606"), "pet2606");
  assert.equal(resolveVariantInput("pet2604"), "pet2604");
  assert.throws(() => resolveVariantInput("bsh-2602"), /Invalid pet variant/);
});

test("variant CLI refuses ambiguous source videos", () => {
  const tempDir = createTempDir();
  fs.writeFileSync(path.join(tempDir, "tabby_squat.mp4"), "a", "utf8");
  fs.writeFileSync(path.join(tempDir, "cat_squat.mp4"), "b", "utf8");

  assert.throws(() => findSourceVideo(tempDir, "squat"), /Multiple source videos/);
});
