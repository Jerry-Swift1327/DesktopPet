const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  createVariant,
  renameAssets,
  buildRenameAssetsPlan,
  applyRenameAssetsPlan,
  findSourceVideo,
  buildCheckVariantResult,
  buildBootstrapPlan,
  applyBootstrapPlan,
  applyBootstrapPlanAsync,
  buildReplaceActionPlan,
  buildMetadataEditPreview,
  applyMetadataEdit,
  buildDeleteVariantPreview,
  applyDeleteVariant,
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

test("variant CLI builds check results from metadata files", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);

  const result = buildCheckVariantResult("pettest01", { metadataFile, animationsRoot });

  assert.equal(result.id, "pettest01");
  assert.equal(result.scope, "test");
  assert.equal(result.manifest, "pettest01_actions_manifest.json");
  assert.equal(result.animationFolders.includes("pettest01_squat"), true);
  assert.equal(result.existingPaths.some((item) => item.endsWith("pettest01_actions_manifest.json")), true);
});

test("variant CLI can preview rename-assets before applying copied videos", () => {
  const tempDir = createTempDir();
  const sourceDir = path.join(tempDir, "downloads");
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  writeMaintenanceMetadata(metadataFile);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const plan = buildRenameAssetsPlan({ id: "pettest01", from: sourceDir }, { metadataFile, animationsRoot });

  assert.equal(plan.id, "pettest01");
  assert.equal(plan.copied.length, 4);
  assert.equal(fs.existsSync(plan.copied[0].target), false);

  const result = applyRenameAssetsPlan(plan);

  assert.equal(result.copied.length, 4);
  assert.equal(fs.readFileSync(path.join(animationsRoot, "pettest01_squat", "pettest01_squat.mp4"), "utf8"), "squat");
});

test("variant CLI rename-assets includes extra action assets", () => {
  const tempDir = createTempDir();
  const sourceDir = path.join(tempDir, "downloads");
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  writeMaintenanceMetadata(metadataFile);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball", "yawn"]);

  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
  metadata.variants.pettest01.actions.assets = ["yawn"];
  fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), "utf8");

  const plan = buildRenameAssetsPlan({ id: "pettest01", from: sourceDir }, { metadataFile, animationsRoot });

  assert.deepEqual(plan.copied.map((item) => item.action), ["squat", "walk", "feed", "ball", "yawn"]);
  assert.equal(path.basename(plan.copied.at(-1).target), "pettest01_yawn.mp4");

  const result = applyRenameAssetsPlan(plan);

  assert.equal(result.copied.length, 5);
  assert.equal(fs.readFileSync(path.join(animationsRoot, "pettest01_yawn", "pettest01_yawn.mp4"), "utf8"), "yawn");
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
  assert.equal(plan.processCommands[0].args.includes("--stable-ground"), true);
  assert.equal(plan.processCommands[0].args.includes("--use-full-range"), false);
  assert.deepEqual(metadata.variants, {});
});

test("bootstrap can use the full processed frame range for runtime frames", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const sourceDir = path.join(tempDir, "downloads");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const plan = buildBootstrapPlan(
    { species: "cat", scope: "custom", tier: "basic", date: "2026-06-30", source: sourceDir, "use-full-range": true },
    { metadataFile, animationsRoot }
  );

  assert.equal(plan.processCommands.length, 4);
  assert.equal(plan.processCommands.every((command) => command.args.includes("--use-full-range")), true);
});

test("bootstrap supports per-action loop mode arguments", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const sourceDir = path.join(tempDir, "downloads");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const plan = buildBootstrapPlan(
    {
      species: "cat",
      scope: "custom",
      tier: "basic",
      date: "2026-06-30",
      source: sourceDir,
      loopModes: {
        squat: { mode: "full" },
        walk: { mode: "manual", sourceStart: 12, sourceEnd: 34 },
        feed: { mode: "auto" }
      }
    },
    { metadataFile, animationsRoot }
  );

  const byAction = Object.fromEntries(plan.processCommands.map((command) => [command.action, command.args]));
  assert.equal(byAction.squat.includes("--use-full-range"), true);
  assert.equal(byAction.feed.includes("--use-full-range"), false);
  assert.deepEqual(byAction.walk.slice(byAction.walk.indexOf("--source-start"), byAction.walk.indexOf("--source-start") + 4), [
    "--source-start",
    "12",
    "--source-end",
    "34"
  ]);
  assert.equal(byAction.walk.includes("--use-full-range"), false);
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

test("bootstrap async apply emits stage status and command logs", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const sourceDir = path.join(tempDir, "downloads");
  const galleryRoot = path.join(tempDir, "gallery");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const plan = buildBootstrapPlan(
    { species: "cat", scope: "custom", tier: "basic", date: "2026-07-06", source: sourceDir },
    { metadataFile, animationsRoot }
  );
  const stages = [];
  const logs = [];

  const draft = await applyBootstrapPlanAsync(plan, {
    galleryRoot,
    skipPreflight: true,
    onStage: (event) => stages.push(event),
    onLog: (event) => logs.push(event),
    runCommand: async (command, args, options) => {
      logs.push({
        stage: "processVideos",
        stream: "stdout",
        message: `${command} ${args.join(" ")} @ ${options.cwd}`
      });
    }
  });

  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(draft.id, "pet2601");
  assert.equal(metadata.variants.pet2601.species, "cat");
  assert.equal(fs.existsSync(path.join(animationsRoot, "pet2601_squat", "pet2601_squat.mp4")), true);
  assert.equal(fs.existsSync(path.join(galleryRoot, "index.html")), true);
  assert.deepEqual(
    stages.filter((event) => event.status === "done").map((event) => event.stage),
    ["writeMetadata", "copyVideos", "processVideos", "generateGallery"]
  );
  assert.deepEqual(
    stages.filter((event) => event.status === "skipped").map((event) => event.stage),
    ["runPreflight"]
  );
  assert.equal(logs.some((event) => /process_pet_actions\.py/.test(event.message)), true);
});

test("bootstrap async apply ignores observer callback failures", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const sourceDir = path.join(tempDir, "downloads");
  const galleryRoot = path.join(tempDir, "gallery");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const plan = buildBootstrapPlan(
    { species: "cat", scope: "custom", tier: "basic", date: "2026-07-06", source: sourceDir },
    { metadataFile, animationsRoot }
  );

  const draft = await applyBootstrapPlanAsync(plan, {
    galleryRoot,
    skipProcessing: true,
    skipPreflight: true,
    onStage: (event) => {
      if (event.stage === "writeMetadata" && event.status === "done") {
        throw new Error("observer failed");
      }
    }
  });

  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));

  assert.equal(draft.id, "pet2601");
  assert.equal(metadata.variants.pet2601.species, "cat");
  assert.equal(fs.existsSync(path.join(animationsRoot, "pet2601_squat", "pet2601_squat.mp4")), true);
  assert.equal(fs.existsSync(path.join(galleryRoot, "index.html")), true);
});

test("bootstrap async apply streams default command logs and stops after process failure", async () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const sourceDir = path.join(tempDir, "downloads");
  const galleryRoot = path.join(tempDir, "gallery");
  fs.mkdirSync(animationsRoot, { recursive: true });
  writeMetadata(metadataFile);
  writeSourceVideos(sourceDir, ["squat", "walk", "feed", "ball"]);

  const plan = buildBootstrapPlan(
    { species: "cat", scope: "custom", tier: "basic", date: "2026-07-06", source: sourceDir },
    { metadataFile, animationsRoot }
  );
  plan.processCommands = [
    {
      command: process.execPath,
      args: ["-e", "process.stdout.write('async-out'); process.stderr.write('async-err'); process.exit(7);"],
      cwd: tempDir
    }
  ];
  const stages = [];
  const logs = [];

  await assert.rejects(
    () => applyBootstrapPlanAsync(plan, {
      galleryRoot,
      onStage: (event) => stages.push(event),
      onLog: (event) => logs.push(event)
    }),
    /failed with exit code 7/
  );

  assert.equal(logs.some((event) => event.stage === "processVideos" && event.stream === "stdout" && event.message.includes("async-out")), true);
  assert.equal(logs.some((event) => event.stage === "processVideos" && event.stream === "stderr" && event.message.includes("async-err")), true);
  assert.deepEqual(
    stages.filter((event) => event.status === "failed").map((event) => event.stage),
    ["processVideos"]
  );
  assert.equal(stages.some((event) => event.stage === "runPreflight"), false);
  assert.equal(stages.some((event) => event.stage === "generateGallery"), false);
  assert.equal(fs.existsSync(path.join(galleryRoot, "index.html")), false);
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

function writeMaintenanceMetadata(metadataFile) {
  writeMetadata(metadataFile, {
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
    },
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

test("metadata edit preview diffs structured fields and apply writes the patch", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball", "lie", "yawn"]);

  const preview = buildMetadataEditPreview(
    {
      id: "pettest01",
      fields: {
        species: "dog",
        notes: "manual metadata edit",
        actions: { buttons: ["squat", "walk", "feed", "ball", "lie"], assets: ["yawn"] }
      }
    },
    { metadataFile, animationsRoot }
  );

  assert.equal(preview.id, "pettest01");
  assert.equal(preview.canApply, true);
  assert.deepEqual(preview.diff.map((entry) => entry.field), ["species", "notes", "actions.buttons", "actions.assets"]);

  applyMetadataEdit(preview, { metadataFile });
  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
  assert.equal(metadata.variants.pettest01.species, "dog");
  assert.deepEqual(metadata.variants.pettest01.actions.buttons, ["squat", "walk", "feed", "ball", "lie"]);
  assert.deepEqual(metadata.variants.pettest01.actions.assets, ["yawn"]);
});

test("metadata edit preview blocks action lists that reference missing resources", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);

  const preview = buildMetadataEditPreview(
    {
      id: "pettest01",
      fields: {
        actions: { buttons: ["squat", "walk", "feed", "ball", "lie"], assets: [] }
      }
    },
    { metadataFile, animationsRoot }
  );

  assert.equal(preview.canApply, false);
  assert.match(preview.reason, /pettest01_lie/);
  assert.throws(() => applyMetadataEdit(preview, { metadataFile }), /Cannot apply metadata edit/);
});

test("metadata edit preview blocks idleYawn without a yawn action asset", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);

  const preview = buildMetadataEditPreview(
    {
      id: "pettest01",
      fields: {
        features: { enable: ["autoStart", "idleYawn"], disable: [] }
      }
    },
    { metadataFile, animationsRoot }
  );

  assert.equal(preview.canApply, false);
  assert.equal(preview.missingFeatureResources[0].action, "yawn");
  assert.match(preview.reason, /缺少 idleYawn 所需的 yawn 动作/);
  assert.throws(() => applyMetadataEdit(preview, { metadataFile }), /Cannot apply metadata edit/);
});

test("metadata edit preview requires idleYawn yawn resources to be listed as action assets", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball", "yawn"]);

  const preview = buildMetadataEditPreview(
    {
      id: "pettest01",
      fields: {
        features: { enable: ["autoStart", "idleYawn"], disable: [] }
      }
    },
    { metadataFile, animationsRoot }
  );

  assert.equal(preview.canApply, false);
  assert.equal(preview.missingFeatureResources[0].action, "yawn");
  assert.equal(preview.missingFeatureResources[0].hasResource, true);
  assert.equal(preview.missingFeatureResources[0].hasActionAsset, false);
});

test("replace action plan builds process_pet_actions replace command with frame mode args", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const video = path.join(tempDir, "replacement.mp4");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);
  fs.writeFileSync(video, "video", "utf8");

  const plan = buildReplaceActionPlan(
    {
      id: "pettest01",
      action: "walk",
      video,
      loopMode: { mode: "manual", sourceStart: 8, sourceEnd: 21 }
    },
    { metadataFile, animationsRoot }
  );

  assert.equal(plan.id, "pettest01");
  assert.equal(plan.action, "walk");
  assert.equal(plan.command.command, "python");
  assert.deepEqual(plan.command.args.slice(0, 8), [
    "tools\\process_pet_actions.py",
    "replace",
    "--action",
    "pettest01_walk",
    "--video",
    video,
    "--manifest",
    "pettest01_actions_manifest.json"
  ]);
  assert.deepEqual(plan.command.args.slice(plan.command.args.indexOf("--source-start"), plan.command.args.indexOf("--source-start") + 4), [
    "--source-start",
    "8",
    "--source-end",
    "21"
  ]);
  assert.equal(plan.command.args.includes("--use-full-range"), false);
});

test("delete variant preview and apply only remove test-scope variant resources", () => {
  const tempDir = createTempDir();
  const metadataFile = path.join(tempDir, "pet-variant-metadata.json");
  const animationsRoot = path.join(tempDir, "animations");
  const userDataRoot = path.join(tempDir, ".user-data");
  const runtimeAssetsRoot = path.join(tempDir, ".runtime-assets");
  writeMaintenanceMetadata(metadataFile);
  writeAnimationFolders(animationsRoot, "pettest01", ["squat", "walk", "feed", "ball"]);
  fs.mkdirSync(path.join(userDataRoot, "pettest01"), { recursive: true });
  fs.mkdirSync(runtimeAssetsRoot, { recursive: true });
  fs.writeFileSync(path.join(runtimeAssetsRoot, "pet_variant.json"), JSON.stringify({ variant: "pettest01", channel: "release" }), "utf8");

  const blocked = buildDeleteVariantPreview("pet2601", { metadataFile, animationsRoot, userDataRoot, runtimeAssetsRoot });
  assert.equal(blocked.canDelete, false);
  assert.match(blocked.reason, /scope/);

  const preview = buildDeleteVariantPreview("pettest01", { metadataFile, animationsRoot, userDataRoot, runtimeAssetsRoot });
  assert.equal(preview.canDelete, true);
  assert.equal(preview.runtimeAssets.currentVariant, "pettest01");
  assert.equal(preview.runtimeAssets.clear, true);
  assert.equal(preview.paths.some((item) => item.endsWith(`${path.sep}pettest01_squat`)), true);

  assert.throws(() => applyDeleteVariant(blocked, { metadataFile }), /Only test scope variants can be deleted/);
  applyDeleteVariant(preview, { metadataFile });

  const metadata = JSON.parse(fs.readFileSync(metadataFile, "utf8"));
  assert.equal(Object.hasOwn(metadata.variants, "pettest01"), false);
  assert.equal(fs.existsSync(path.join(animationsRoot, "pettest01_squat")), false);
  assert.equal(fs.existsSync(path.join(userDataRoot, "pettest01")), false);
  assert.equal(fs.existsSync(runtimeAssetsRoot), false);
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
