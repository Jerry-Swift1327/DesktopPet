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

function writeMaintenanceMetadata(file) {
  writeMetadata(file, {
    pettest01: {
      id: "pettest01",
      date: "2026-07-06",
      scope: "test",
      tier: "basic",
      species: "cat",
      notes: "test draft",
      version: "1.0",
      assetPrefix: "pettest01",
      actions: { buttons: ["squat", "walk", "feed", "ball"], assets: [] },
      features: { enable: ["autoStart"], disable: [] }
    },
    pet2601: {
      id: "pet2601",
      date: "2026-05-08",
      scope: "internal",
      tier: "basic",
      species: "dog",
      notes: "internal",
      version: "1.1",
      assetPrefix: "dog",
      actions: { buttons: ["squat", "walk", "feed", "ball"], assets: [] },
      features: { enable: ["autoStart"], disable: [] }
    }
  });
}

function writeAnimationFolders(animationsRoot, assetPrefix, actions) {
  fs.mkdirSync(animationsRoot, { recursive: true });
  for (const action of actions) {
    fs.mkdirSync(path.join(animationsRoot, `${assetPrefix}_${action}`, "transparent_frames"), { recursive: true });
  }
  fs.writeFileSync(path.join(animationsRoot, `${assetPrefix}_actions_manifest.json`), "[]", "utf8");
}

test("devtools workflow exposes required service helpers", () => {
  assert.equal(typeof variantWorkflow.getCatalogOptions, "function");
  assert.equal(typeof variantWorkflow.getRequiredActions, "function");
  assert.equal(typeof variantWorkflow.normalizeFormState, "function");
  assert.equal(typeof variantWorkflow.scanSourceFolder, "function");
});

test("devtools workflow exposes maintenance helpers", () => {
  const workflow = createVariantWorkflow();

  assert.equal(typeof workflow.listVariants, "function");
  assert.equal(typeof workflow.getVariantDetails, "function");
  assert.equal(typeof workflow.checkVariant, "function");
  assert.equal(typeof workflow.generateGallery, "function");
  assert.equal(typeof workflow.getGalleryIndexPath, "function");
  assert.equal(typeof workflow.buildReplaceActionPreview, "function");
  assert.equal(typeof workflow.runReplaceAction, "function");
  assert.equal(typeof workflow.buildReplaceActionsPreview, "function");
  assert.equal(typeof workflow.runReplaceActions, "function");
  assert.equal(typeof workflow.buildRenameAssetsPreview, "function");
  assert.equal(typeof workflow.runRenameAssets, "function");
  assert.equal(typeof workflow.buildMetadataEditPreview, "function");
  assert.equal(typeof workflow.applyMetadataEdit, "function");
  assert.equal(typeof workflow.buildDeleteActionPreview, "function");
  assert.equal(typeof workflow.deleteAction, "function");
  assert.equal(typeof workflow.buildDeleteVariantPreview, "function");
  assert.equal(typeof workflow.deleteTestVariant, "function");
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
  assert.equal(preview.processCommands.every((command) => command.args.includes("--use-full-range")), true);
});

test("devtools preview can keep automatic runtime loop selection enabled", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const stagingRoot = path.join(tempDir, "staging");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);

  const sourceDir = path.join(tempDir, "source");
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    stagingRoot,
    idFactory: () => "preview-auto-loop"
  });
  const preview = workflow.buildNewVariantPreview({
    scope: "custom",
    tier: "basic",
    species: "cat",
    platforms: ["win32"],
    date: "2026-07-06",
    sourceFolder: sourceDir,
    autoSelectLoop: true
  });

  assert.equal(preview.processCommands.every((command) => !command.args.includes("--use-full-range")), true);
});

test("devtools preview forwards per-action loop mode parameters", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const stagingRoot = path.join(tempDir, "staging");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);

  const sourceDir = path.join(tempDir, "source");
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    stagingRoot,
    idFactory: () => "preview-loop-modes"
  });
  const preview = workflow.buildNewVariantPreview({
    scope: "custom",
    tier: "basic",
    species: "cat",
    platforms: ["win32"],
    date: "2026-07-06",
    sourceFolder: sourceDir,
    loopModes: {
      squat: { mode: "auto" },
      walk: { mode: "manual", sourceStart: 3, sourceEnd: 14 },
      feed: { mode: "full" }
    }
  });

  const byAction = Object.fromEntries(preview.processCommands.map((command) => [command.action, command.args]));
  assert.equal(byAction.squat.includes("--use-full-range"), false);
  assert.equal(byAction.feed.includes("--use-full-range"), true);
  assert.deepEqual(byAction.walk.slice(byAction.walk.indexOf("--source-start"), byAction.walk.indexOf("--source-start") + 4), [
    "--source-start",
    "3",
    "--source-end",
    "14"
  ]);
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

test("devtools preview supports selected advanced actions and feature overrides", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const stagingRoot = path.join(tempDir, "staging");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);

  const sourceDir = path.join(tempDir, "source");
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball", "spin", "splits", "yawn"]);

  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    stagingRoot,
    idFactory: () => "preview-advanced-selected"
  });
  const preview = workflow.buildNewVariantPreview({
    scope: "internal",
    tier: "advanced",
    species: "cat",
    platforms: ["win32"],
    date: "2026-07-06",
    sourceFolder: sourceDir,
    advanced: {
      actionButtons: ["squat", "walk", "feed", "ball", "spin", "splits"],
      actionAssets: ["yawn"],
      features: ["autoStart", "windowRoam"],
      disableFeatures: []
    }
  });

  assert.deepEqual(preview.draft.actions.buttons, ["squat", "walk", "feed", "ball", "spin", "splits"]);
  assert.deepEqual(preview.draft.actions.assets, ["yawn"]);
  assert.deepEqual(preview.draft.features.enable, ["autoStart", "windowRoam"]);
  assert.deepEqual(preview.draft.features.disable, []);
  assert.deepEqual(Object.keys(preview.stagedVideos), ["squat", "walk", "feed", "ball", "spin", "splits", "yawn"]);
  assert.equal(preview.processCommands.some((command) => command.action === "spin"), true);
  assert.equal(preview.processCommands.some((command) => command.action === "splits"), true);
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

test("devtools maintenance workflow lists variants and reads details from metadata", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);

  const workflow = createVariantWorkflow({ metadataFile, animationsRoot });
  const variants = workflow.listVariants();
  const details = workflow.getVariantDetails("pettest01");

  assert.equal(variants.some((variant) => variant.id === "pettest01" && variant.scope === "test"), true);
  assert.equal(details.id, "pettest01");
  assert.equal(details.profile.scope, "test");
  assert.equal(details.resources.manifest.endsWith("pettest01_actions_manifest.json"), true);
});

test("devtools catalog workflow checks variants and generates local gallery", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const galleryRoot = path.join(tempDir, "gallery");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);

  const workflow = createVariantWorkflow({ metadataFile, animationsRoot, galleryRoot });
  const check = workflow.checkVariant("pettest01");
  const gallery = workflow.generateGallery();

  assert.equal(check.id, "pettest01");
  assert.equal(check.manifest, "pettest01_actions_manifest.json");
  assert.equal(check.existingPaths.some((item) => item.endsWith("pettest01_actions_manifest.json")), true);
  assert.equal(gallery.output, path.join(galleryRoot, "index.html"));
  assert.equal(workflow.getGalleryIndexPath(), gallery.output);
  assert.equal(fs.existsSync(gallery.output), true);
});

test("devtools maintenance workflow previews and runs multiple action replacements", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const walkReplacement = path.join(tempDir, "walk-replacement.mp4");
  const feedReplacement = path.join(tempDir, "feed-replacement.mp4");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);
  fs.writeFileSync(walkReplacement, "walk", "utf8");
  fs.writeFileSync(feedReplacement, "feed", "utf8");

  const stages = [];
  const commands = [];
  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    idFactory: () => "replace-preview",
    runCommand: async (command, args) => {
      commands.push([command, args]);
    }
  });
  const preview = workflow.buildReplaceActionsPreview({
    id: "pettest01",
    actionVideos: { walk: walkReplacement, feed: feedReplacement },
    loopModes: { walk: { mode: "full" }, feed: { mode: "manual", sourceStart: 4, sourceEnd: 18 } }
  });
  const result = await workflow.runReplaceActions(preview.previewId, {
    onStage: (event) => stages.push(event)
  });

  assert.equal(preview.previewId, "replace-preview");
  assert.deepEqual(preview.actions, ["walk", "feed"]);
  assert.equal(preview.commands[0].args.includes("--use-full-range"), true);
  assert.equal(preview.commands[1].args.includes("--source-start"), true);
  assert.equal(result.replaced, 2);
  assert.deepEqual(stages.map((event) => `${event.stage}:${event.status}`), [
    "replaceAction:running",
    "replaceAction:done"
  ]);
  assert.equal(commands.length, 2);
  assert.equal(commands.every(([, args]) => args.includes("replace")), true);
});

test("devtools maintenance workflow previews and runs batch action video import", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const sourceDir = path.join(tempDir, "source");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const stages = [];
  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    idFactory: () => "rename-preview"
  });
  const preview = workflow.buildRenameAssetsPreview({
    id: "pettest01",
    from: sourceDir
  });
  const result = await workflow.runRenameAssets(preview.previewId, {
    onStage: (event) => stages.push(event)
  });

  assert.equal(preview.previewId, "rename-preview");
  assert.equal(preview.copied.length, 4);
  assert.equal(result.copied.length, 4);
  assert.equal(fs.readFileSync(path.join(animationsRoot, "pettest01_squat", "pettest01_squat.mp4"), "utf8"), "squat");
  assert.deepEqual(stages.map((event) => `${event.stage}:${event.status}`), [
    "renameAssets:running",
    "renameAssets:done"
  ]);
});

test("devtools maintenance workflow previews and applies metadata edits", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);

  const stages = [];
  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    idFactory: () => "metadata-preview"
  });
  const preview = workflow.buildMetadataEditPreview({
    id: "pettest01",
    fields: { notes: "edited in devtools", species: "dog" }
  });
  const result = await workflow.applyMetadataEdit(preview.previewId, {
    onStage: (event) => stages.push(event)
  });
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(preview.canApply, true);
  assert.equal(result.applied, true);
  assert.equal(metadata.variants.pettest01.notes, "edited in devtools");
  assert.deepEqual(stages.map((event) => `${event.stage}:${event.status}`), [
    "writeMetadataEdit:running",
    "writeMetadataEdit:done"
  ]);
});

test("devtools metadata maintenance processes newly enabled action videos before writing metadata", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const spinVideo = path.join(tempDir, "spin.mp4");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);
  fs.writeFileSync(spinVideo, "spin", "utf8");

  const stages = [];
  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    idFactory: () => "metadata-action-preview",
    runCommand: async () => {
      const metadataDuringProcessing = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
      assert.deepEqual(metadataDuringProcessing.variants.pettest01.actions.buttons, ["squat", "walk", "feed", "ball"]);
    }
  });
  const preview = workflow.buildMetadataEditPreview({
    id: "pettest01",
    actionVideos: { spin: spinVideo },
    loopModes: { spin: { mode: "auto" } },
    fields: {
      version: "1.1",
      actions: { buttons: ["squat", "walk", "feed", "ball", "spin"], assets: [] }
    }
  });

  assert.equal(preview.canApply, true, preview.reason);
  assert.deepEqual(preview.plannedActions, ["spin"]);
  assert.deepEqual(preview.actionCommands[0].args.slice(0, 8), [
    "tools\\process_pet_actions.py",
    "process",
    "--variant",
    "pettest01",
    "--actions",
    "spin",
    "--video",
    spinVideo
  ]);
  assert.equal(preview.actionCommands[0].args.includes("--use-full-range"), false);
  assert.equal(preview.actionCommands[0].args.includes("--source-start"), false);

  await workflow.applyMetadataEdit(preview.previewId, { onStage: (event) => stages.push(event) });
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(metadata.variants.pettest01.version, "1.1");
  assert.deepEqual(metadata.variants.pettest01.actions.buttons, ["squat", "walk", "feed", "ball", "spin"]);
  assert.deepEqual(stages.map((event) => `${event.stage}:${event.status}`), [
    "addAction:running",
    "addAction:done",
    "writeMetadataEdit:running",
    "writeMetadataEdit:done"
  ]);
});

test("devtools maintenance deletes orphaned action resources and manifest metadata", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "dog", ["squat", "walk", "feed", "ball", "lick"]);
  const manifestFile = path.join(animationsRoot, "dog_actions_manifest.json");
  fs.writeFileSync(manifestFile, JSON.stringify([
    { action: "dog_squat", video: "dog_squat.mp4" },
    { action: "dog_lick", video: "dog_lick.mp4" }
  ]), "utf8");

  const stages = [];
  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    idFactory: () => "delete-action-preview"
  });
  const details = workflow.getVariantDetails("pet2601");
  const preview = workflow.buildDeleteActionPreview({ id: "pet2601", action: "lick" });
  const result = await workflow.deleteAction(preview.previewId, {
    onStage: (event) => stages.push(event)
  });
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

  assert.equal(details.resources.resourceActions.some((item) => item.action === "lick" && item.registered === false), true);
  assert.equal(preview.canDelete, true, preview.reason);
  assert.equal(preview.orphaned, true);
  assert.equal(preview.manifestRemovedEntries, 1);
  assert.equal(result.deleted, true);
  assert.equal(fs.existsSync(path.join(animationsRoot, "dog_lick")), false);
  assert.deepEqual(manifest.map((item) => item.action), ["dog_squat"]);
  assert.deepEqual(stages.map((event) => `${event.stage}:${event.status}`), [
    "deleteActionResources:running",
    "deleteActionResources:done"
  ]);
});

test("devtools maintenance deletes action metadata and blocks required actions", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  writeMaintenanceMetadata(metadataFile);
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
  metadata.variants.pet2601.actions.buttons.push("spin");
  metadata.variants.pet2601.actionLabelOverrides = { spin: "旋转" };
  metadata.variants.pet2601.actionStatEffects = { spin: { health: 1 } };
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), "utf8");
  writeAnimationFolders(animationsRoot, "dog", ["squat", "walk", "feed", "ball", "spin"]);

  const workflow = createVariantWorkflow({ metadataFile, animationsRoot, idFactory: () => "delete-spin" });
  const blocked = workflow.buildDeleteActionPreview({ id: "pet2601", action: "squat" });
  const preview = workflow.buildDeleteActionPreview({ id: "pet2601", action: "spin" });
  await workflow.deleteAction(preview.previewId);
  const after = JSON.parse(fs.readFileSync(metadataFile, "utf8")).variants.pet2601;

  assert.equal(blocked.canDelete, false);
  assert.match(blocked.reason, /必需动作/);
  assert.equal(preview.canDelete, true, preview.reason);
  assert.equal(after.actions.buttons.includes("spin"), false);
  assert.equal(after.actionLabelOverrides, undefined);
  assert.equal(after.actionStatEffects, undefined);
});

test("devtools maintenance workflow previews and deletes only test variants", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const userDataRoot = path.join(tempDir, ".user-data");
  const runtimeAssetsRoot = path.join(tempDir, ".runtime-assets");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);
  fs.mkdirSync(path.join(userDataRoot, "pettest01"), { recursive: true });
  fs.mkdirSync(runtimeAssetsRoot, { recursive: true });
  fs.writeFileSync(path.join(runtimeAssetsRoot, "pet_variant.json"), JSON.stringify({ variant: "pet2601" }), "utf8");

  const stages = [];
  const workflow = createVariantWorkflow({
    metadataFile,
    animationsRoot,
    userDataRoot,
    runtimeAssetsRoot,
    idFactory: () => "delete-preview"
  });
  const blocked = workflow.buildDeleteVariantPreview("pet2601");
  const preview = workflow.buildDeleteVariantPreview("pettest01");
  const result = await workflow.deleteTestVariant(preview.previewId, {
    onStage: (event) => stages.push(event)
  });

  assert.equal(blocked.canDelete, false);
  assert.equal(preview.canDelete, true);
  assert.equal(preview.runtimeAssets.clear, false);
  assert.equal(result.deleted, true);
  assert.equal(fs.existsSync(path.join(animationsRoot, "pettest01_squat")), false);
  assert.equal(fs.existsSync(runtimeAssetsRoot), true);
  assert.deepEqual(stages.map((event) => `${event.stage}:${event.status}`), [
    "deleteVariantResources:running",
    "deleteVariantResources:done"
  ]);
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
