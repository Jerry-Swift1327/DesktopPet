const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createVariant,
  renameAssets,
  findSourceVideo,
  buildBootstrapPlan,
  applyBootstrapPlan,
  generateVariantGallery,
  formatList,
  getVariantSummary,
  resolveSourceActionName,
  resolveVariantInput
} = require("../scripts/variant-cli.cjs");

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-variant-"));
}

function writeMetadata(file, variants = {}) {
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 2, variants }, null, 2), "utf8");
}

function writeSourceVideos(sourceDir, actions) {
  fs.mkdirSync(sourceDir, { recursive: true });
  for (const action of actions) {
    fs.writeFileSync(path.join(sourceDir, `${action}.mp4`), action, "utf8");
  }
}

test("variant CLI creates V2 metadata with generated pet-year sequence id fields", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);

  const draft = createVariant(
    { species: "cat", tier: "advanced", date: "2026-06-30" },
    { metadataFile, animationsRoot }
  );
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(draft.id, "pet2601");
  assert.equal(draft.species, "cat");
  assert.equal(draft.tier, "advanced");
  assert.equal(draft.notes, "客户定制-高级");
  assert.equal(metadata.variants.pet2601.species, "cat");
  assert.equal(Object.hasOwn(metadata.variants.pet2601, "breed"), false);
  assert.throws(
    () => createVariant({ species: "cat", date: "2026-06-30", id: "pet2601" }, { metadataFile, animationsRoot }),
    /already exists/
  );
});

test("variant CLI internal drafts increment version while custom drafts stay at 1.0", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile, {
    pet2601: { id: "pet2601", species: "dog", scope: "internal", tier: "basic", date: "2026-05-08", version: "1.1" },
    pet2602: { id: "pet2602", species: "cat", scope: "internal", tier: "basic", date: "2026-05-27", version: "1.2" },
    pet2603: { id: "pet2603", species: "cat", scope: "custom", tier: "basic", date: "2026-05-28", version: "1.0" },
    pet2604: { id: "pet2604", species: "dog", scope: "internal", tier: "advanced", date: "2026-06-06", version: "1.3" }
  });

  const internal = createVariant(
    { species: "cat", scope: "internal", tier: "basic", date: "2026-06-30" },
    { metadataFile, animationsRoot }
  );
  const custom = createVariant(
    { species: "dog", scope: "custom", tier: "basic", date: "2026-07-01" },
    { metadataFile, animationsRoot }
  );

  assert.equal(internal.version, "1.4");
  assert.equal(custom.version, "1.0");
});

test("variant CLI rejects unknown species and invalid dates", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  writeMetadata(metadataFile);

  assert.throws(
    () => createVariant({ species: "fox", date: "2026-06-30" }, { metadataFile, animationsRoot: tempDir }),
    /Unknown species/
  );
  assert.throws(
    () => createVariant({ species: "cat", date: "2026-02-30" }, { metadataFile, animationsRoot: tempDir }),
    /Invalid variant date/
  );
});

test("variant CLI copies existing variant videos into preserved action directories", () => {
  const tempDir = createTempDir();
  const sourceDir = path.join(tempDir, "downloads");
  const animationsRoot = path.join(tempDir, "animations");
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  renameAssets({ id: "pet2601", from: sourceDir }, { animationsRoot });

  for (const action of ["squat", "walk", "feed", "ball"]) {
    assert.equal(
      fs.readFileSync(path.join(animationsRoot, `dog_${action}`, `dog_${action}.mp4`), "utf8"),
      action
    );
  }
});

test("variant CLI list output uses V2 columns", () => {
  const output = formatList([
    getVariantSummary("pet2601"),
    getVariantSummary("pet2604")
  ]);
  const lines = output.split(/\r?\n/);

  assert.equal(output.includes("\t"), false);
  assert.match(lines[0], /^id +notes +species +tier +date +scope +platforms +version$/);
  assert.match(lines[1], /^-+ +-+ +-+ +-+ +-+ +-+ +-+ +-+$/);
  assert.match(output, /pet2601 +内部使用-基础 +dog +basic +2026-05-08 +internal +win32,darwin +1\.1/);
  assert.match(output, /pet2604 +客户定制-基础 +dog +basic +2026-06-06 +custom +darwin +1\.0/);
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

test("bootstrap dry-run builds a plan without writing metadata", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const sourceDir = path.join(tempDir, "downloads");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const plan = buildBootstrapPlan(
    { species: "cat", scope: "custom", tier: "basic", date: "2026-06-30", source: sourceDir },
    { metadataFile, animationsRoot }
  );
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(plan.apply, false);
  assert.equal(plan.draft.id, "pet2601");
  assert.equal(plan.copied.length, 4);
  assert.equal(plan.processCommands[0].args.includes("--trim-ground-alpha-auto"), true);
  assert.deepEqual(metadata.variants, {});
});

test("bootstrap apply writes V2 metadata and copies videos when processing is skipped", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const sourceDir = path.join(tempDir, "downloads");
  const galleryRoot = path.join(tempDir, "gallery");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const plan = buildBootstrapPlan(
    { species: "dog", scope: "internal", tier: "basic", date: "2026-06-30", source: sourceDir },
    { metadataFile, animationsRoot }
  );
  applyBootstrapPlan(plan, {
    skipProcessing: true,
    skipPreflight: true,
    galleryRoot
  });
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(metadata.variants.pet2601.species, "dog");
  assert.equal(metadata.variants.pet2601.version, "1.1");
  assert.equal(fs.existsSync(path.join(animationsRoot, "pet2601_squat", "pet2601_squat.mp4")), true);
  assert.equal(fs.existsSync(path.join(galleryRoot, "index.html")), true);
});

test("bootstrap rejects unregistered source video actions before writing metadata", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const sourceDir = path.join(tempDir, "downloads");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball", "frolic"]);

  assert.throws(
    () => buildBootstrapPlan(
      { species: "cat", scope: "custom", tier: "basic", date: "2026-06-30", source: sourceDir },
      { metadataFile, animationsRoot }
    ),
    /Unknown source video action/
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(metadataFile, "utf8")).variants, {});
});

test("bootstrap rejects missing required source videos", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const sourceDir = path.join(tempDir, "downloads");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed"]);

  assert.throws(
    () => buildBootstrapPlan(
      { species: "cat", scope: "custom", tier: "basic", date: "2026-06-30", source: sourceDir },
      { metadataFile, animationsRoot }
    ),
    /Missing source video for action ball/
  );
});

test("source action names resolve from exact or prefixed mp4 names", () => {
  assert.equal(resolveSourceActionName("squat.mp4"), "squat");
  assert.equal(resolveSourceActionName("pet2611_squat.mp4"), "squat");
  assert.equal(resolveSourceActionName("client_frolic.mp4"), null);
});

test("gallery generation reads V2 profile data and writes local index", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const outputDir = path.join(tempDir, "gallery");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile, {
    pet2601: {
      id: "pet2601",
      date: "2026-06-30",
      scope: "custom",
      tier: "basic",
      species: "cat",
      notes: "客户定制-基础",
      version: "1.0",
      assetPrefix: "pet2601",
      actions: { buttons: ["squat", "walk", "feed", "ball"], assets: [] },
      features: { enable: ["autoStart"], disable: [] }
    }
  });

  const output = generateVariantGallery({ metadataFile, animationsRoot, outputDir });
  const html = fs.readFileSync(output, "utf8");

  assert.match(html, /pet2601/);
  assert.match(html, /客户定制-基础/);
  assert.match(html, /missing squat frame/);
});
