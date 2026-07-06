const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const variantWorkflow = require("../devtools/services/variant-workflow.cjs");
const { createVariantWorkflow, scanSourceFolder } = variantWorkflow;

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-devtools-"));
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

test("devtools workflow exposes required service helpers", () => {
  assert.equal(typeof variantWorkflow.getCatalogOptions, "function");
  assert.equal(typeof variantWorkflow.getRequiredActions, "function");
  assert.equal(typeof variantWorkflow.normalizeFormState, "function");
  assert.equal(typeof variantWorkflow.scanSourceFolder, "function");
});

test("devtools workflow exposes catalog options for the new variant form", () => {
  const workflow = createVariantWorkflow();
  const options = workflow.getCatalogOptions();

  assert.equal(Boolean(options.species.cat), true);
  assert.equal(Boolean(options.species.dog), true);
  assert.deepEqual(options.tiers.basic.actionButtons, ["squat", "walk", "feed", "ball"]);
  assert.equal(Boolean(options.actions.squat), true);
  assert.equal(Boolean(options.features.autoStart), true);
  assert.equal(options.notes.custom.basic, "客户定制-基础");
});

test("devtools source scan matches action mp4 files and reports unknown videos", () => {
  const tempDir = createTempDir();
  writeSourceVideos(tempDir, ["squat", "walk", "feed", "ball"]);
  fs.writeFileSync(path.join(tempDir, "client_extra.mp4"), "extra", "utf8");

  const result = scanSourceFolder(tempDir, ["squat", "walk", "feed", "ball"]);

  assert.equal(path.basename(result.matches.squat), "squat.mp4");
  assert.equal(path.basename(result.matches.walk), "walk.mp4");
  assert.equal(result.warnings.some((warning) => warning.includes("client_extra.mp4")), true);
});

test("devtools preview stages manual videos and reuses bootstrap draft rules", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const stagingRoot = path.join(tempDir, "staging");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);

  const manualDir = path.join(tempDir, "manual");
  writeSourceVideos(manualDir, ["squat", "walk", "feed", "ball"]);

  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    stagingRoot,
    now: () => new Date("2026-07-06T00:00:00Z"),
    idFactory: () => "preview-a"
  });
  const preview = workflow.buildNewVariantPreview({
    scope: "custom",
    tier: "basic",
    species: "cat",
    platforms: ["win32"],
    date: "2026-07-06",
    actionVideos: {
      squat: path.join(manualDir, "squat.mp4"),
      walk: path.join(manualDir, "walk.mp4"),
      feed: path.join(manualDir, "feed.mp4"),
      ball: path.join(manualDir, "ball.mp4")
    }
  });
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(preview.previewId, "preview-a");
  assert.equal(preview.draft.id, "pet2601");
  assert.equal(preview.draft.notes, "客户定制-基础");
  assert.deepEqual(preview.draft.actions.buttons, ["squat", "walk", "feed", "ball"]);
  assert.deepEqual(metadata.variants, {});
  assert.equal(fs.readFileSync(path.join(stagingRoot, "preview-a", "source", "squat.mp4"), "utf8"), "squat");
  assert.equal(preview.copied.length, 4);
  assert.equal(preview.processCommands.length, 4);
});

test("devtools preview stages advanced action button additions", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const stagingRoot = path.join(tempDir, "staging");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);

  const manualDir = path.join(tempDir, "manual");
  writeSourceVideos(manualDir, ["squat", "walk", "feed", "ball", "lie"]);

  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    stagingRoot,
    idFactory: () => "preview-add-action"
  });
  const preview = workflow.buildNewVariantPreview({
    scope: "custom",
    tier: "basic",
    species: "cat",
    platforms: ["win32"],
    date: "2026-07-06",
    advanced: {
      actionButtons: ["squat", "walk", "feed", "ball", "lie"]
    },
    actionVideos: {
      squat: path.join(manualDir, "squat.mp4"),
      walk: path.join(manualDir, "walk.mp4"),
      feed: path.join(manualDir, "feed.mp4"),
      ball: path.join(manualDir, "ball.mp4"),
      lie: path.join(manualDir, "lie.mp4")
    }
  });

  assert.equal(fs.readFileSync(path.join(stagingRoot, "preview-add-action", "source", "lie.mp4"), "utf8"), "lie");
  assert.equal(preview.processCommands.some((command) => command.action === "lie"), true);
});

test("devtools preview stages only effective advanced action buttons", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const stagingRoot = path.join(tempDir, "staging");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);

  const manualDir = path.join(tempDir, "manual");
  writeSourceVideos(manualDir, ["squat"]);

  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    stagingRoot,
    idFactory: () => "preview-only-squat"
  });
  const preview = workflow.buildNewVariantPreview({
    scope: "custom",
    tier: "basic",
    species: "cat",
    platforms: ["win32"],
    date: "2026-07-06",
    advanced: {
      actionButtons: ["squat"],
      actionAssets: []
    },
    actionVideos: {
      squat: path.join(manualDir, "squat.mp4")
    }
  });

  assert.deepEqual(Object.keys(preview.stagedVideos), ["squat"]);
  assert.equal(fs.readFileSync(path.join(stagingRoot, "preview-only-squat", "source", "squat.mp4"), "utf8"), "squat");
  assert.deepEqual(preview.processCommands.map((command) => command.action), ["squat"]);
});

test("devtools preview rejects missing required basic action videos", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);

  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    stagingRoot: path.join(tempDir, "staging"),
    idFactory: () => "preview-missing"
  });

  assert.throws(
    () => workflow.buildNewVariantPreview({
      scope: "custom",
      tier: "basic",
      species: "cat",
      platforms: ["win32"],
      date: "2026-07-06",
      actionVideos: {}
    }),
    /缺少动作 squat 的源视频/
  );
});

test("devtools runNewVariant emits failed stage and preserves written metadata on process failure", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const stagingRoot = path.join(tempDir, "staging");
  const galleryRoot = path.join(tempDir, "gallery");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);

  const sourceDir = path.join(tempDir, "source");
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const stages = [];
  const logs = [];
  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    stagingRoot,
    galleryRoot,
    idFactory: () => "preview-failure",
    runCommand: async (command, args, runOptions = {}) => {
      runOptions.onLog({
        stage: runOptions.stage,
        stream: "stdout",
        message: `${command} ${args.join(" ")}`
      });
      if (args.includes("walk")) {
        throw new Error("walk processing failed");
      }
    }
  });

  const preview = workflow.buildNewVariantPreview({
    scope: "custom",
    tier: "basic",
    species: "cat",
    platforms: ["win32"],
    date: "2026-07-06",
    sourceFolder: sourceDir
  });

  await assert.rejects(
    () => workflow.runNewVariant(preview.previewId, {
      onStage: (event) => stages.push(event),
      onLog: (event) => logs.push(event)
    }),
    /walk processing failed/
  );

  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(metadata.variants.pet2601.species, "cat");
  assert.equal(fs.existsSync(path.join(animationsRoot, "pet2601_squat", "pet2601_squat.mp4")), true);
  assert.equal(fs.existsSync(path.join(galleryRoot, "index.html")), false);
  assert.equal(stages.some((event) => event.stage === "prepareStaging" && event.status === "done"), true);
  assert.equal(stages.some((event) => event.stage === "processVideos" && event.status === "failed"), true);
  assert.equal(logs.some((event) => /tools\\process_pet_actions\.py/.test(event.message)), true);
});

test("devtools runNewVariant ignores observer failures while applying", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const stagingRoot = path.join(tempDir, "staging");
  const galleryRoot = path.join(tempDir, "gallery");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);

  const sourceDir = path.join(tempDir, "source");
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const processedActions = [];
  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    stagingRoot,
    galleryRoot,
    idFactory: () => "preview-observer-failure",
    runCommand: async (command, args, runOptions = {}) => {
      runOptions.onLog({
        stage: runOptions.stage,
        stream: "stdout",
        message: `${command} ${args.join(" ")}`
      });
      processedActions.push(["squat", "walk", "feed", "ball"].find((action) => args.includes(action)));
    }
  });

  const preview = workflow.buildNewVariantPreview({
    scope: "custom",
    tier: "basic",
    species: "cat",
    platforms: ["win32"],
    date: "2026-07-06",
    sourceFolder: sourceDir,
    skipPreflight: true,
    skipGallery: true
  });

  const draft = await workflow.runNewVariant(preview.previewId, {
    onStage: () => {
      throw new Error("stage observer failed");
    },
    onLog: () => {
      throw new Error("log observer failed");
    }
  });
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(draft.id, "pet2601");
  assert.equal(metadata.variants.pet2601.species, "cat");
  assert.deepEqual(processedActions, ["squat", "walk", "feed", "ball"]);
  assert.equal(fs.existsSync(path.join(galleryRoot, "index.html")), false);
});
