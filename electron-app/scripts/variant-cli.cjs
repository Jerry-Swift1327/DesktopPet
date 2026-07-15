const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  PET_ACTION_ORDER,
  PET_SPECIES_IDS,
  PET_VARIANT_IDS,
  PET_VARIANT_METADATA_FILE,
  buildPetVariantProfiles,
  createPetVariantMetadataDraft,
  getActionPool,
  getPetVariantProfile,
  getSpeciesProfiles,
  getTierProfiles,
  getVariantManifestName,
  getWindowsBuildProfile,
  resolvePetVariantProfile,
  requirePetVariantId
} = require("../electron/pet-variants.cjs");

const appRoot = path.dirname(__dirname);
const projectRoot = path.dirname(appRoot);
const defaultAnimationsRoot = path.join(projectRoot, "assets", "animations");
const defaultGalleryRoot = path.join(appRoot, ".variant-gallery");
const actionPool = getActionPool();

function readArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }
    const withoutPrefix = arg.slice(2);
    if (withoutPrefix.includes("=")) {
      const [key, ...rest] = withoutPrefix.split("=");
      args[key] = rest.join("=");
      continue;
    }
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      args[withoutPrefix] = next;
      index += 1;
    } else {
      args[withoutPrefix] = true;
    }
  }
  return args;
}

function readMetadataFile(metadataFile = PET_VARIANT_METADATA_FILE) {
  return JSON.parse(fs.readFileSync(metadataFile, "utf8"));
}

function writeMetadataFile(metadata, metadataFile = PET_VARIANT_METADATA_FILE) {
  fs.writeFileSync(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
}

function getMetadataVariants(metadata) {
  if (!metadata.variants || typeof metadata.variants !== "object") {
    metadata.variants = {};
  }
  return metadata.variants;
}

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function getVariantProfilesFromMetadata(metadata) {
  return buildPetVariantProfiles(metadata);
}

function getVariantProfileFromMetadata(input, metadata) {
  const id = String(input || "");
  const variants = getMetadataVariants(metadata);
  if (!Object.prototype.hasOwnProperty.call(variants, id)) {
    throw new Error(`Invalid pet variant: ${input}`);
  }
  const profiles = getVariantProfilesFromMetadata(metadata);
  return clonePlainObject(profiles[id]);
}

function compareVariantRows(left, right) {
  const leftDate = left.date || "";
  const rightDate = right.date || "";
  if (leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }
  return String(left.id || "").localeCompare(String(right.id || ""));
}

function resolveVariantInput(input) {
  return requirePetVariantId(input);
}

function parseListOption(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (Array.isArray(value)) {
    return value;
  }
  return String(value)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getVariantActionAssets(input) {
  const id = resolveVariantInput(input);
  const profile = getPetVariantProfile(id);
  return (profile.actionButtons || profile.actions || PET_ACTION_ORDER)
    .concat(profile.actionAssets || profile.extraAnimationAssets || [])
    .map((action) => `${profile.animationPrefix}_${actionPool[action].asset}`);
}

function getEnabledFeatureNames(features = {}) {
  return Object.entries(features)
    .filter(([, enabled]) => enabled === true)
    .map(([feature]) => feature);
}

function getProfileActionKeys(profile) {
  return uniqueList((profile.actionButtons || profile.actions || PET_ACTION_ORDER)
    .concat(profile.actionAssets || profile.extraAnimationAssets || []));
}

function getProfileAssetPrefix(profile) {
  return profile.assetPrefix || profile.animationPrefix || profile.id;
}

function getProfileActionFolderName(profile, action) {
  return `${getProfileAssetPrefix(profile)}_${actionPool[action].asset}`;
}

function buildVariantSummary(profile) {
  return {
    id: profile.id,
    notes: profile.notes,
    species: profile.species,
    tier: profile.tier,
    date: profile.date,
    scope: profile.scope,
    platforms: profile.platforms,
    version: profile.version,
    scale: profile.scale,
    actions: profile.actionButtons || profile.actions,
    actionAssets: profile.actionAssets || profile.extraAnimationAssets,
    features: profile.features,
    enabledFeatures: getEnabledFeatureNames(profile.features),
    assetPrefix: profile.assetPrefix || profile.animationPrefix,
    animationPrefix: profile.animationPrefix,
    manifest: `${profile.assetPrefix || profile.animationPrefix}_actions_manifest.json`,
    deliveryPathSegments: profile.deliveryPathSegments
  };
}

function getVariantSummary(input) {
  const id = resolveVariantInput(input);
  return buildVariantSummary(getPetVariantProfile(id));
}

function listVariantSummaries(options = {}) {
  const metadata = readMetadataFile(options.metadataFile || PET_VARIANT_METADATA_FILE);
  return Object.values(getVariantProfilesFromMetadata(metadata))
    .sort(compareVariantRows)
    .map(buildVariantSummary);
}

function getVariantDetails(input, options = {}) {
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const metadata = readMetadataFile(metadataFile);
  const profile = getVariantProfileFromMetadata(input, metadata);
  const animationFolders = (profile.actionButtons || profile.actions || [])
    .concat(profile.actionAssets || profile.extraAnimationAssets || [])
    .map((action) => path.join(animationsRoot, `${profile.assetPrefix}_${actionPool[action].asset}`));
  const manifest = path.join(animationsRoot, `${profile.assetPrefix}_actions_manifest.json`);
  const resourceActions = Object.entries(actionPool)
    .filter(([, config]) => config.asset)
    .map(([action, config]) => {
      const resourcePath = path.join(animationsRoot, `${profile.assetPrefix}_${config.asset}`);
      const metadataPath = path.join(resourcePath, "loop.json");
      let playback = {};
      try {
        playback = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : {};
      } catch {
        playback = {};
      }
      return {
        action,
        path: resourcePath,
        registered: getProfileActionKeys(profile).includes(action),
        hasProcessedFrames: fs.existsSync(path.join(resourcePath, "processed_frames")),
        hasCanonicalVideo: fs.existsSync(path.join(resourcePath, `${path.basename(resourcePath)}.mp4`)),
        freezeLastFrame: playback.freezeLastFrame === true,
        tailLoopStart: Number.isInteger(playback.tailLoopStart) ? playback.tailLoopStart : null,
        protectedPlayback: Boolean(playback.directionFrameCount || playback.sourceStartPolicy || Number.isInteger(playback.tailLoopStart))
      };
    })
    .filter((item) => fs.existsSync(item.path));
  return {
    ...buildVariantSummary(profile),
    profile,
    raw: clonePlainObject(getMetadataVariants(metadata)[profile.id]),
    resources: {
      animationFolders,
      manifest,
      resourceActions,
      existingPaths: animationFolders.concat(manifest).filter((item) => fs.existsSync(item))
    }
  };
}

function padRight(value, width) {
  const text = String(value ?? "");
  return text + " ".repeat(Math.max(0, width - text.length));
}

function formatTable(rows, columns) {
  const widths = columns.map((column) => Math.max(
    column.title.length,
    ...rows.map((row) => String(column.value(row) ?? "").length)
  ));
  const formatRow = (row) => columns
    .map((column, index) => padRight(column.value(row), widths[index]))
    .join("  ")
    .trimEnd();
  return [
    columns.map((column, index) => padRight(column.title, widths[index])).join("  ").trimEnd(),
    columns.map((_, index) => "-".repeat(widths[index])).join("  "),
    ...rows.map(formatRow)
  ].join("\n");
}

function formatList(rows) {
  return formatTable(rows, [
    { title: "id", value: (row) => row.id },
    { title: "notes", value: (row) => row.notes || "-" },
    { title: "species", value: (row) => row.species },
    { title: "tier", value: (row) => row.tier },
    { title: "date", value: (row) => row.date || "-" },
    { title: "scope", value: (row) => row.scope },
    { title: "platforms", value: (row) => row.platforms.join(",") },
    { title: "version", value: (row) => row.version }
  ]);
}

function listVariants() {
  const rows = PET_VARIANT_IDS.map(getVariantSummary);
  console.log(formatList(rows));
}

function showVariant(args) {
  const id = resolveVariantInput(args.id);
  console.log(JSON.stringify(getVariantSummary(id), null, 2));
}

function queryVariants(args) {
  const queryId = args.id ? resolveVariantInput(args.id) : null;
  const rows = PET_VARIANT_IDS
    .map(getVariantSummary)
    .filter((row) => !queryId || row.id === queryId)
    .filter((row) => !args.species || row.species === args.species)
    .filter((row) => !args.tier || row.tier === args.tier)
    .filter((row) => !args.date || row.date === args.date)
    .filter((row) => !args.scope || row.scope === args.scope);
  console.log(formatList(rows));
}

function getWindowsOutputForProfile(profile, channel) {
  if (!profile.platforms.includes("win32")) {
    return null;
  }
  return ["deliverables"].concat(profile.deliveryPathSegments || [profile.scope, profile.id], channel).join("/");
}

function pathExistsForProfile(profile, options = {}) {
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const manifest = getManifestPath(animationsRoot, getProfileAssetPrefix(profile));
  return getProfileActionKeys(profile)
    .map((action) => path.join(animationsRoot, getProfileActionFolderName(profile, action)))
    .filter((folder) => fs.existsSync(folder))
    .concat(fs.existsSync(manifest) ? [manifest] : []);
}

function buildCheckVariantResult(input, options = {}) {
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const metadata = readMetadataFile(metadataFile);
  const profile = getVariantProfileFromMetadata(typeof input === "object" ? input.id : input, metadata);
  const assetPrefix = getProfileAssetPrefix(profile);
  const existingPaths = pathExistsForProfile(profile, options);
  return {
    id: profile.id,
    notes: profile.notes,
    species: profile.species,
    tier: profile.tier,
    scope: profile.scope,
    platforms: profile.platforms,
    version: profile.version,
    assetPrefix,
    manifest: `${assetPrefix}_actions_manifest.json`,
    animationFolders: getProfileActionKeys(profile).map((action) => getProfileActionFolderName(profile, action)),
    existingPaths,
    releaseOutput: getWindowsOutputForProfile(profile, "release"),
    installerOutput: getWindowsOutputForProfile(profile, "installer")
  };
}

function checkVariant(args, options = {}) {
  const result = buildCheckVariantResult(args, options);
  console.log(JSON.stringify(result, null, 2));
}

function assertDraftDoesNotConflict(metadata, draft, options = {}) {
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const variants = getMetadataVariants(metadata);
  if (variants[draft.id]) {
    throw new Error(`Variant already exists: ${draft.id}`);
  }
  const actionKeys = uniqueList((draft.actions.buttons || []).concat(draft.actions.assets || []));
  for (const action of actionKeys) {
    const actionDir = path.join(animationsRoot, `${draft.assetPrefix}_${actionPool[action].asset}`);
    if (fs.existsSync(actionDir)) {
      throw new Error(`Action directory already exists: ${actionDir}`);
    }
  }
  const manifest = path.join(animationsRoot, `${draft.assetPrefix}_actions_manifest.json`);
  if (fs.existsSync(manifest)) {
    throw new Error(`Manifest already exists: ${manifest}`);
  }
}

function createActionOverrideFromArgs(args) {
  const buttons = parseListOption(args["action-buttons"]);
  const assets = parseListOption(args["action-assets"]);
  if (!buttons && !assets) {
    return null;
  }
  const tierProfile = getTierProfiles()[args.tier || "basic"];
  return {
    buttons: buttons || tierProfile.actionButtons,
    assets: assets || tierProfile.actionAssets
  };
}

function createFeatureOverrideFromArgs(args) {
  const enable = parseListOption(args.features);
  const disable = parseListOption(args["disable-features"]);
  if (!enable && !disable) {
    return null;
  }
  return {
    enable: enable || [],
    disable: disable || []
  };
}

function createVariant(args, options = {}) {
  const date = args.date;
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const metadata = readMetadataFile(metadataFile);
  const variants = getMetadataVariants(metadata);
  const platformList = parseListOption(args.platforms);

  const draft = createPetVariantMetadataDraft({
    species: args.species || "cat",
    date,
    id: args.id,
    metadata,
    scope: args.scope || "custom",
    tier: args.tier || "basic",
    version: args.version || null,
    scale: args.scale || 1.1,
    platform: args.platform || "win32",
    platforms: platformList,
    assetPrefix: args["asset-prefix"] || null,
    notes: args.notes || null,
    actions: createActionOverrideFromArgs(args),
    features: createFeatureOverrideFromArgs(args)
  });
  assertDraftDoesNotConflict(metadata, draft, options);

  variants[draft.id] = draft;
  writeMetadataFile(metadata, metadataFile);

  console.log(`Created pet variant: ${draft.id}`);
  console.log(`Next: npm.cmd run variant:bootstrap -- --id ${draft.id} --source <source-dir> --apply`);
  return draft;
}

function findSourceVideo(sourceDir, action) {
  const files = fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => new RegExp(`_${action}\\.mp4$`, "i").test(name) || new RegExp(`^${action}\\.mp4$`, "i").test(name))
    .sort();
  if (files.length === 0) {
    throw new Error(`Missing source video for action ${action} in ${sourceDir}`);
  }
  if (files.length > 1) {
    throw new Error(`Multiple source videos found for action ${action} in ${sourceDir}: ${files.join(", ")}`);
  }
  return path.join(sourceDir, files[0]);
}

function buildRenameAssetsPlan(args, options = {}) {
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const metadata = readMetadataFile(metadataFile);
  const profile = getVariantProfileFromMetadata(args.id, metadata);
  const sourceDir = path.resolve(args.from || args.source || "");
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  if (!args.from && !args.source) {
    throw new Error("Missing --from source directory.");
  }
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Source directory was not found: ${sourceDir}`);
  }

  const copied = [];
  for (const action of getProfileActionKeys(profile)) {
    const actionName = getProfileActionFolderName(profile, action);
    const actionDir = path.join(animationsRoot, actionName);
    const source = findSourceVideo(sourceDir, action);
    const target = path.join(actionDir, `${actionName}.mp4`);
    if (fs.existsSync(target) && !args.force) {
      throw new Error(`Target video already exists: ${target}. Pass --force to overwrite.`);
    }
    copied.push({ action, source, target });
  }
  return {
    id: profile.id,
    sourceDir,
    animationsRoot,
    copied,
    force: Boolean(args.force)
  };
}

function applyRenameAssetsPlan(plan) {
  for (const item of plan.copied || []) {
    if (fs.existsSync(item.target) && !plan.force) {
      throw new Error(`Target video already exists: ${item.target}. Pass --force to overwrite.`);
    }
    fs.mkdirSync(path.dirname(item.target), { recursive: true });
    fs.copyFileSync(item.source, item.target);
  }
  return { id: plan.id, copied: plan.copied || [] };
}

function renameAssets(args, options = {}) {
  const plan = buildRenameAssetsPlan(args, options);
  const result = applyRenameAssetsPlan(plan);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

function uniqueList(values) {
  return Array.from(new Set(values));
}

function resolveSourceActionName(fileName) {
  const baseName = path.basename(fileName, path.extname(fileName)).toLowerCase();
  const actions = Object.keys(actionPool).sort((left, right) => right.length - left.length);
  return actions.find((action) => baseName === action || baseName.endsWith(`_${action}`)) || null;
}

function assertSourceVideosAreRegistered(sourceDir) {
  const unknown = fs.readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.mp4$/i.test(entry.name))
    .map((entry) => ({ name: entry.name, action: resolveSourceActionName(entry.name) }))
    .filter((entry) => !entry.action)
    .map((entry) => entry.name);
  if (unknown.length > 0) {
    throw new Error(`Unknown source video action(s): ${unknown.join(", ")}. Register each action in ACTION_POOL before running bootstrap.`);
  }
}

function normalizeLoopMode(loopMode = null, options = {}) {
  if (loopMode && typeof loopMode === "object") {
    return {
      mode: loopMode.mode || "auto",
      sourceStart: loopMode.sourceStart,
      sourceEnd: loopMode.sourceEnd
    };
  }
  return { mode: options.useFullRange ? "full" : "auto" };
}

function appendActionProcessingArgs(processArgs, action, options = {}) {
  const preset = actionPool[action].processPreset;
  if (preset === "grounded" || preset === "nearSquat") {
    processArgs.push("--stable-ground");
  }
  if (preset === "nearSquat" && action !== "squat") {
    processArgs.push("--align-reference-center-x", "--align-reference-bottom");
  } else if (preset === "direction64") {
    processArgs.push("--direction-count", "64");
  }
  if (action === "ball") {
    processArgs.push("--preserve-bright-color-foreground");
  }
  if (options.freezeLastFrame === true) {
    processArgs.push("--freeze-last-frame");
  } else if (options.freezeLastFrame === false) {
    processArgs.push("--no-freeze-last-frame");
  }

  const loopMode = normalizeLoopMode(options.loopMode, options);
  if (preset !== "direction64") {
    if (loopMode.mode === "full") {
      processArgs.push("--use-full-range");
    } else if (loopMode.mode === "manual") {
      if (loopMode.sourceStart === undefined || loopMode.sourceEnd === undefined) {
        throw new Error(`Manual loop mode for action ${action} requires sourceStart and sourceEnd.`);
      }
      processArgs.push("--source-start", String(Number(loopMode.sourceStart)));
      processArgs.push("--source-end", String(Number(loopMode.sourceEnd)));
    }
  }
  return processArgs;
}

function getProcessArgs(assetPrefix, action, options = {}) {
  const processArgs = [
    "tools\\process_pet_actions.py",
    "process",
    "--variant",
    assetPrefix,
    "--actions",
    action,
    "--trim-ground-alpha",
    "128",
    "--trim-ground-alpha-auto"
  ];
  return appendActionProcessingArgs(processArgs, action, options);
}

function buildBootstrapPlan(args, options = {}) {
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const sourceDir = path.resolve(args.source || args.from || path.join(os.homedir(), "Downloads"));
  const metadata = readMetadataFile(metadataFile);
  const variants = getMetadataVariants(metadata);

  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Source directory was not found: ${sourceDir}`);
  }
  assertSourceVideosAreRegistered(sourceDir);

  const platformList = parseListOption(args.platforms);
  const draft = createPetVariantMetadataDraft({
    species: args.species || "cat",
    date: args.date,
    id: args.id,
    metadata,
    scope: args.scope || "custom",
    tier: args.tier || "basic",
    version: args.version || null,
    scale: args.scale || 1.1,
    platform: args.platform || "win32",
    platforms: platformList,
    assetPrefix: args["asset-prefix"] || null,
    notes: args.notes || null,
    actions: createActionOverrideFromArgs(args),
    features: createFeatureOverrideFromArgs(args)
  });
  assertDraftDoesNotConflict(metadata, draft, { animationsRoot });

  const actionKeys = uniqueList((draft.actions.buttons || []).concat(draft.actions.assets || []));
  const copied = actionKeys.map((action) => {
    const source = findSourceVideo(sourceDir, action);
    const actionName = `${draft.assetPrefix}_${actionPool[action].asset}`;
    return {
      action,
      source,
      target: path.join(animationsRoot, actionName, `${actionName}.mp4`)
    };
  });
  const loopModes = args.loopModes && typeof args.loopModes === "object" ? args.loopModes : {};
  const processCommands = actionKeys.map((action) => ({
    action,
    cwd: projectRoot,
    command: "python",
    args: getProcessArgs(draft.assetPrefix, action, {
      useFullRange: Boolean(args["use-full-range"]),
      loopMode: loopModes[action],
      freezeLastFrame: loopModes[action]?.freezeLastFrame ?? (action === "yawn" && draft.features.enable.includes("idleYawn"))
    })
  }));
  const preflightCommands = ["release", "installer"].map((channel) => ({
    channel,
    cwd: appRoot,
    command: "node",
    args: ["prepare-runtime-assets.cjs", `--pet-variant=${draft.id}`, `--pet-channel=${channel}`]
  }));
  const warnings = [];
  if (args.version) {
    warnings.push(`Version override supplied: ${args.version}`);
  }

  return {
    apply: Boolean(args.apply),
    sourceDir,
    metadataFile,
    animationsRoot,
    draft,
    copied,
    processCommands,
    preflightCommands,
    warnings,
    metadataAfterApply: {
      ...metadata,
      variants: {
        ...variants,
        [draft.id]: draft
      }
    }
  };
}

function runCommand(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: options.cwd,
    stdio: "inherit",
    shell: false
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function emitStage(options, event) {
  if (typeof options.onStage === "function") {
    try {
      options.onStage(event);
    } catch {
      // Observer callbacks are best-effort and must not change apply behavior.
    }
  }
}

function emitLog(options, event) {
  if (typeof options.onLog === "function") {
    try {
      options.onLog(event);
    } catch {
      // Observer callbacks are best-effort and must not change apply behavior.
    }
  }
}

function runCommandAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    child.stdout.on("data", (chunk) => {
      emitLog(options, {
        stage: options.stage || null,
        stream: "stdout",
        message: chunk.toString()
      });
    });

    child.stderr.on("data", (chunk) => {
      emitLog(options, {
        stage: options.stage || null,
        stream: "stderr",
        message: chunk.toString()
      });
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code}`));
    });
  });
}

function writeBootstrapMetadata(plan) {
  const metadata = readMetadataFile(plan.metadataFile);
  const variants = getMetadataVariants(metadata);
  if (variants[plan.draft.id]) {
    throw new Error(`Variant already exists: ${plan.draft.id}`);
  }
  variants[plan.draft.id] = plan.draft;
  writeMetadataFile(metadata, plan.metadataFile);
}

function copyBootstrapVideos(plan, options = {}) {
  for (const item of plan.copied) {
    if (fs.existsSync(item.target) && !options.force) {
      throw new Error(`Target video already exists: ${item.target}. Pass --force to overwrite.`);
    }
    fs.mkdirSync(path.dirname(item.target), { recursive: true });
    fs.copyFileSync(item.source, item.target);
  }
}

function runPlanCommandsSync(stage, commands, options = {}) {
  const runner = options.runCommand || runCommand;
  for (const item of commands) {
    runner(item.command, item.args, { cwd: item.cwd, stage, onLog: options.onLog });
  }
}

async function runPlanCommandsAsync(stage, commands, options = {}) {
  const runner = options.runCommand || runCommandAsync;
  for (const item of commands) {
    await runner(item.command, item.args, { cwd: item.cwd, stage, onLog: options.onLog });
  }
}

function generateBootstrapGallery(plan, options = {}) {
  generateVariantGallery({
    metadataFile: plan.metadataFile,
    animationsRoot: plan.animationsRoot,
    outputDir: options.galleryRoot || defaultGalleryRoot
  });
}

function getBootstrapApplyStages(plan, options = {}) {
  return [
    {
      stage: "writeMetadata",
      skip: false,
      runSync: () => writeBootstrapMetadata(plan),
      runAsync: async () => writeBootstrapMetadata(plan)
    },
    {
      stage: "copyVideos",
      skip: false,
      runSync: () => copyBootstrapVideos(plan, options),
      runAsync: async () => copyBootstrapVideos(plan, options)
    },
    {
      stage: "processVideos",
      skip: Boolean(options.skipProcessing),
      runSync: () => runPlanCommandsSync("processVideos", plan.processCommands, options),
      runAsync: async () => runPlanCommandsAsync("processVideos", plan.processCommands, options)
    },
    {
      stage: "runPreflight",
      skip: Boolean(options.skipPreflight),
      runSync: () => runPlanCommandsSync("runPreflight", plan.preflightCommands, options),
      runAsync: async () => runPlanCommandsAsync("runPreflight", plan.preflightCommands, options)
    },
    {
      stage: "generateGallery",
      skip: Boolean(options.skipGallery),
      runSync: () => generateBootstrapGallery(plan, options),
      runAsync: async () => generateBootstrapGallery(plan, options)
    }
  ];
}

function applyBootstrapPlan(plan, options = {}) {
  for (const item of getBootstrapApplyStages(plan, options)) {
    if (item.skip) {
      emitStage(options, { stage: item.stage, status: "skipped" });
      continue;
    }
    emitStage(options, { stage: item.stage, status: "running" });
    try {
      item.runSync();
      emitStage(options, { stage: item.stage, status: "done" });
    } catch (error) {
      emitStage(options, { stage: item.stage, status: "failed", error: error.message });
      throw error;
    }
  }

  return plan.draft;
}

async function applyBootstrapPlanAsync(plan, options = {}) {
  for (const item of getBootstrapApplyStages(plan, options)) {
    if (item.skip) {
      emitStage(options, { stage: item.stage, status: "skipped" });
      continue;
    }
    emitStage(options, { stage: item.stage, status: "running" });
    try {
      await item.runAsync();
      emitStage(options, { stage: item.stage, status: "done" });
    } catch (error) {
      emitStage(options, { stage: item.stage, status: "failed", error: error.message });
      throw error;
    }
  }

  return plan.draft;
}

function getActionResourcePath(animationsRoot, assetPrefix, action) {
  if (!Object.prototype.hasOwnProperty.call(actionPool, action)) {
    throw new Error(`Unknown pet action ${action}. Register it in ACTION_POOL first.`);
  }
  return path.join(animationsRoot, `${assetPrefix}_${actionPool[action].asset}`);
}

function getManifestPath(animationsRoot, assetPrefix) {
  return path.join(animationsRoot, `${assetPrefix}_actions_manifest.json`);
}

function getPatchFields(payload = {}) {
  return payload.fields || payload.patch || {};
}

function cloneMetadataWithPatch(metadata, id, fields) {
  const variants = getMetadataVariants(metadata);
  const current = variants[id];
  if (!current) {
    throw new Error(`Invalid pet variant: ${id}`);
  }
  const next = {
    ...clonePlainObject(current),
    id
  };
  for (const key of ["scope", "tier", "species", "date", "notes", "version", "scale", "platforms", "assetPrefix", "soundPrefix"]) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      next[key] = fields[key];
    }
  }
  if (Object.prototype.hasOwnProperty.call(fields, "actions")) {
    next.actions = {
      ...(next.actions || {}),
      ...clonePlainObject(fields.actions)
    };
  }
  if (Object.prototype.hasOwnProperty.call(fields, "features")) {
    next.features = {
      ...(next.features || {}),
      ...clonePlainObject(fields.features)
    };
  }
  return {
    ...clonePlainObject(metadata),
    variants: {
      ...clonePlainObject(variants),
      [id]: next
    }
  };
}

function addDiff(diff, field, before, after) {
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    diff.push({ field, before: before === undefined ? null : before, after: after === undefined ? null : after });
  }
}

function buildMetadataDiff(before, after, fields) {
  const diff = [];
  for (const key of Object.keys(fields)) {
    if (key === "actions") {
      addDiff(diff, "actions.buttons", before.actions?.buttons || [], after.actions?.buttons || []);
      addDiff(diff, "actions.assets", before.actions?.assets || [], after.actions?.assets || []);
    } else if (key === "features") {
      addDiff(diff, "features.enable", before.features?.enable || [], after.features?.enable || []);
      addDiff(diff, "features.disable", before.features?.disable || [], after.features?.disable || []);
    } else {
      addDiff(diff, key, before[key], after[key]);
    }
  }
  return diff;
}

function findMissingActionResources(profile, animationsRoot, plannedActions = []) {
  const planned = new Set(plannedActions);
  const actions = uniqueList((profile.actionButtons || profile.actions || []).concat(profile.actionAssets || profile.extraAnimationAssets || []));
  return actions
    .filter((action) => !planned.has(action))
    .map((action) => getActionResourcePath(animationsRoot, profile.assetPrefix || profile.animationPrefix || profile.id, action))
    .filter((resourcePath) => !fs.existsSync(resourcePath));
}

function buildDeleteActionPreview(payload = {}, options = {}) {
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const id = String(payload.id || "");
  const action = String(payload.action || "");
  const metadata = readMetadataFile(metadataFile);
  const variants = getMetadataVariants(metadata);
  if (!variants[id]) {
    throw new Error(`Invalid pet variant: ${id}`);
  }
  if (!Object.prototype.hasOwnProperty.call(actionPool, action) || !actionPool[action].asset) {
    throw new Error(`Unknown pet action ${action}.`);
  }

  const profile = getVariantProfileFromMetadata(id, metadata);
  const assetPrefix = getProfileAssetPrefix(profile);
  const sharedVariants = Object.values(getVariantProfilesFromMetadata(metadata))
    .filter((item) => item.id !== id
      && getProfileAssetPrefix(item) === assetPrefix
      && getProfileActionKeys(item).includes(action))
    .map((item) => item.id);
  const tierProfile = getTierProfiles()[profile.tier];
  const requiredActions = uniqueList((tierProfile.actionButtons || []).concat(tierProfile.actionAssets || []));
  const dependencies = [];
  if (action === "yawn" && profile.features?.idleYawn) {
    dependencies.push("idleYawn");
  }

  const actionName = `${assetPrefix}_${actionPool[action].asset}`;
  const actionPath = path.join(animationsRoot, actionName);
  const manifestPath = getManifestPath(animationsRoot, assetPrefix);
  const manifestExisted = fs.existsSync(manifestPath);
  const manifestBefore = manifestExisted
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : [];
  if (!Array.isArray(manifestBefore)) {
    throw new Error(`Action manifest must be an array: ${manifestPath}`);
  }
  const manifestAfter = manifestBefore.filter((entry) => entry?.action !== actionName);
  const rawBefore = clonePlainObject(variants[id]);
  const rawAfter = clonePlainObject(rawBefore);
  rawAfter.actions = rawAfter.actions || { buttons: [], assets: [] };
  rawAfter.actions.buttons = (rawAfter.actions.buttons || []).filter((item) => item !== action);
  rawAfter.actions.assets = (rawAfter.actions.assets || []).filter((item) => item !== action);
  for (const field of ["actionLabelOverrides", "actionStatEffects"]) {
    if (rawAfter[field] && Object.prototype.hasOwnProperty.call(rawAfter[field], action)) {
      delete rawAfter[field][action];
      if (Object.keys(rawAfter[field]).length === 0) {
        delete rawAfter[field];
      }
    }
  }
  const metadataAfterApply = clonePlainObject(metadata);
  metadataAfterApply.variants[id] = rawAfter;
  const registered = getProfileActionKeys(profile).includes(action);
  const hasDirectory = fs.existsSync(actionPath);
  const hasManifestEntry = manifestAfter.length !== manifestBefore.length;
  const blockers = [];
  if (requiredActions.includes(action)) blockers.push(`动作 ${action} 是 ${profile.tier} 套餐的必需动作`);
  if (dependencies.length > 0) blockers.push(`功能 ${dependencies.join(", ")} 仍依赖动作 ${action}`);
  if (sharedVariants.length > 0) blockers.push(`资源前缀 ${assetPrefix} 还被变体 ${sharedVariants.join(", ")} 共用`);
  if (!registered && !hasDirectory && !hasManifestEntry) blockers.push(`未找到动作 ${action} 的资源或元数据`);

  return {
    kind: "deleteAction",
    id,
    action,
    actionName,
    actionPath,
    manifestPath,
    metadataFile,
    animationsRoot,
    registered,
    orphaned: !registered && (hasDirectory || hasManifestEntry),
    hasDirectory,
    hasManifestEntry,
    sharedVariants,
    dependencies,
    canDelete: blockers.length === 0,
    reason: blockers.join("；") || null,
    paths: hasDirectory ? [actionPath] : [],
    metadataDiff: buildMetadataDiff(rawBefore, rawAfter, {
      actions: true,
      actionLabelOverrides: true,
      actionStatEffects: true
    }),
    manifestRemovedEntries: manifestBefore.length - manifestAfter.length,
    manifestExisted,
    manifestBefore,
    manifestAfter,
    metadataBefore: metadata,
    metadataAfterApply
  };
}

function applyDeleteAction(preview, options = {}) {
  if (!preview || preview.kind !== "deleteAction" || !preview.canDelete) {
    throw new Error(preview?.reason || "Cannot apply delete action preview.");
  }
  const metadataFile = options.metadataFile || preview.metadataFile || PET_VARIANT_METADATA_FILE;
  const animationsRoot = options.animationsRoot || preview.animationsRoot || defaultAnimationsRoot;
  if (!isInsideOrSame(animationsRoot, preview.actionPath) || !isInsideOrSame(animationsRoot, preview.manifestPath)) {
    throw new Error("Refusing to delete action resources outside the animations root.");
  }
  const quarantinePath = `${preview.actionPath}.delete-${process.pid}-${Date.now()}`;
  let moved = false;
  try {
    if (preview.hasDirectory && fs.existsSync(preview.actionPath)) {
      fs.renameSync(preview.actionPath, quarantinePath);
      moved = true;
    }
    if (preview.manifestExisted) {
      writeMetadataFile(preview.manifestAfter, preview.manifestPath);
    }
    writeMetadataFile(preview.metadataAfterApply, metadataFile);
    if (moved) fs.rmSync(quarantinePath, { recursive: true, force: true });
    return { id: preview.id, action: preview.action, deleted: true, paths: preview.paths };
  } catch (error) {
    if (preview.manifestExisted) {
      writeMetadataFile(preview.manifestBefore, preview.manifestPath);
    }
    writeMetadataFile(preview.metadataBefore, metadataFile);
    if (moved && fs.existsSync(quarantinePath) && !fs.existsSync(preview.actionPath)) {
      fs.renameSync(quarantinePath, preview.actionPath);
    }
    throw error;
  }
}

function findFeatureMissingActionResources(profile, animationsRoot, plannedActions = []) {
  const planned = new Set(plannedActions);
  const requiredActions = [];
  if (profile.features?.idleYawn && !(profile.actionAssets || profile.extraAnimationAssets || []).includes("yawn")) {
    requiredActions.push("yawn");
  }
  const assetPrefix = profile.assetPrefix || profile.animationPrefix || profile.id;
  const actionAssets = profile.actionAssets || profile.extraAnimationAssets || [];
  return uniqueList(requiredActions)
    .map((action) => ({
      feature: action === "yawn" ? "idleYawn" : "",
      action,
      resourcePath: getActionResourcePath(animationsRoot, assetPrefix, action),
      hasActionAsset: actionAssets.includes(action),
      hasResource: planned.has(action) || fs.existsSync(getActionResourcePath(animationsRoot, assetPrefix, action))
    }))
    .filter((item) => !item.hasActionAsset || !item.hasResource);
}

function buildMetadataEditPreview(payload = {}, options = {}) {
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const id = String(payload.id || "");
  const metadata = readMetadataFile(metadataFile);
  const variants = getMetadataVariants(metadata);
  if (!variants[id]) {
    throw new Error(`Invalid pet variant: ${payload.id}`);
  }
  const fields = getPatchFields(payload);
  const before = clonePlainObject(variants[id]);
  const metadataAfterApply = cloneMetadataWithPatch(metadata, id, fields);
  const after = clonePlainObject(metadataAfterApply.variants[id]);
  const diff = buildMetadataDiff(before, after, fields);
  const profile = resolvePetVariantProfile(after);
  const plannedActions = uniqueList(options.plannedActions || []);
  const missingResources = Object.prototype.hasOwnProperty.call(fields, "actions")
    ? findMissingActionResources(profile, animationsRoot, plannedActions)
    : [];
  const missingFeatureResources = Object.prototype.hasOwnProperty.call(fields, "features") || Object.prototype.hasOwnProperty.call(fields, "actions")
    ? findFeatureMissingActionResources(profile, animationsRoot, plannedActions)
    : [];
  const canApply = missingResources.length === 0 && missingFeatureResources.length === 0;
  const reason = missingResources.length > 0
    ? `Missing action resource(s): ${missingResources.join(", ")}`
    : missingFeatureResources.length > 0
      ? missingFeatureResources
        .map((item) => `变体 ${profile.id} 缺少 ${item.feature} 所需的 ${item.action} 动作。请先在“替换动作”或“批量导入目录”中导入 ${item.action}，再把它加入 actions.assets。`)
        .join(" ")
      : null;
  return {
    kind: "metadataEdit",
    id,
    metadataFile,
    animationsRoot,
    canApply,
    reason,
    diff,
    before,
    after,
    missingResources,
    missingFeatureResources,
    metadataAfterApply
  };
}

function applyMetadataEdit(preview, options = {}) {
  if (!preview || preview.kind !== "metadataEdit" || !preview.canApply) {
    throw new Error("Cannot apply metadata edit preview.");
  }
  const metadataFile = options.metadataFile || preview.metadataFile || PET_VARIANT_METADATA_FILE;
  writeMetadataFile(preview.metadataAfterApply, metadataFile);
  return { id: preview.id, applied: true };
}

function buildReplaceActionPlan(payload = {}, options = {}) {
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const metadata = readMetadataFile(metadataFile);
  const profile = getVariantProfileFromMetadata(payload.id, metadata);
  const action = String(payload.action || "");
  if (!Object.prototype.hasOwnProperty.call(actionPool, action)) {
    throw new Error(`Unknown pet action ${action}. Register it in ACTION_POOL first.`);
  }
  const existingPool = getActionFramePool({ id: profile.id, action }, { metadataFile, animationsRoot });
  if (existingPool.protected) {
    throw new Error(existingPool.protectedReason);
  }
  const video = path.resolve(String(payload.video || payload.source || ""));
  if (!video || !/\.mp4$/i.test(video) || !fs.existsSync(video) || !fs.statSync(video).isFile()) {
    throw new Error(`Replacement video must be an existing .mp4 file: ${video}`);
  }
  const actionName = `${profile.assetPrefix}_${actionPool[action].asset}`;
  const manifestName = `${profile.assetPrefix}_actions_manifest.json`;
  const args = [
    "tools\\process_pet_actions.py",
    "replace",
    "--action",
    actionName,
    "--video",
    video,
    "--manifest",
    manifestName,
    "--trim-ground-alpha",
    "128",
    "--trim-ground-alpha-auto"
  ];
  appendActionProcessingArgs(args, action, { loopMode: payload.loopMode, freezeLastFrame: payload.freezeLastFrame });
  return {
    kind: "replaceAction",
    id: profile.id,
    action,
    video,
    targetAction: path.join(animationsRoot, actionName),
    manifest: path.join(animationsRoot, manifestName),
    command: {
      action,
      cwd: projectRoot,
      command: "python",
      args
    }
  };
}

function buildAddActionPlan(payload = {}, options = {}) {
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const metadata = readMetadataFile(metadataFile);
  const profile = getVariantProfileFromMetadata(payload.id, metadata);
  const action = String(payload.action || "");
  if (!Object.prototype.hasOwnProperty.call(actionPool, action)) {
    throw new Error(`Unknown pet action ${action}. Register it in ACTION_POOL first.`);
  }
  const video = path.resolve(String(payload.video || payload.source || ""));
  if (!video || !/\.mp4$/i.test(video) || !fs.existsSync(video) || !fs.statSync(video).isFile()) {
    throw new Error(`New action video must be an existing .mp4 file: ${video}`);
  }
  const actionName = `${profile.assetPrefix}_${actionPool[action].asset}`;
  const args = getProcessArgs(profile.assetPrefix, action, { loopMode: payload.loopMode, freezeLastFrame: payload.freezeLastFrame });
  args.splice(6, 0, "--video", video);
  return {
    kind: "addAction",
    id: profile.id,
    action,
    video,
    targetAction: path.join(animationsRoot, actionName),
    manifest: path.join(animationsRoot, `${profile.assetPrefix}_actions_manifest.json`),
    command: {
      action,
      cwd: projectRoot,
      command: "python",
      args
    }
  };
}

function applyReplaceActionPlan(plan, options = {}) {
  const runner = options.runCommand || runCommand;
  runner(plan.command.command, plan.command.args, { cwd: plan.command.cwd, stage: "replaceAction", onLog: options.onLog });
  return { id: plan.id, action: plan.action, replaced: true };
}

async function applyReplaceActionPlanAsync(plan, options = {}) {
  const runner = options.runCommand || runCommandAsync;
  await runner(plan.command.command, plan.command.args, { cwd: plan.command.cwd, stage: "replaceAction", onLog: options.onLog });
  return { id: plan.id, action: plan.action, replaced: true };
}

async function applyAddActionPlanAsync(plan, options = {}) {
  const runner = options.runCommand || runCommandAsync;
  await runner(plan.command.command, plan.command.args, { cwd: plan.command.cwd, stage: "addAction", onLog: options.onLog });
  return { id: plan.id, action: plan.action, added: true };
}

function getActionFramePool(payload = {}, options = {}) {
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const metadata = readMetadataFile(metadataFile);
  const profile = getVariantProfileFromMetadata(payload.id, metadata);
  const action = String(payload.action || "");
  if (!Object.prototype.hasOwnProperty.call(actionPool, action)) {
    throw new Error(`Unknown pet action ${action}.`);
  }
  const actionName = getProfileActionFolderName(profile, action);
  const actionPath = path.join(animationsRoot, actionName);
  const processedPath = path.join(actionPath, "processed_frames");
  const runtimePath = path.join(actionPath, "transparent_frames");
  const metadataPath = path.join(actionPath, "loop.json");
  const canonicalVideo = path.join(actionPath, `${actionName}.mp4`);
  let playback = {};
  try {
    playback = fs.existsSync(metadataPath) ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : {};
  } catch {
    playback = {};
  }
  const protectedReason = Number.isInteger(playback.tailLoopStart)
    ? "该动作使用 tailLoopStart 专属尾段循环，只读保护已开启。"
    : playback.directionFrameCount || playback.sourceStartPolicy
      ? "该动作使用方向帧映射，只读保护已开启。"
      : null;
  const processedFrames = fs.existsSync(processedPath)
    ? fs.readdirSync(processedPath).filter((name) => /^frame_\d+\.png$/i.test(name)).sort()
    : [];
  const runtimeFrames = fs.existsSync(runtimePath)
    ? fs.readdirSync(runtimePath).filter((name) => /^frame_\d+\.png$/i.test(name)).sort()
    : [];
  let selectedSourceFrames = Array.isArray(playback.sourceFrames) ? playback.sourceFrames.filter(Number.isInteger) : [];
  if (selectedSourceFrames.length === 0 && Number.isInteger(playback.sourceLoopStart) && Number.isInteger(playback.sourceLoopEnd)) {
    for (let index = playback.sourceLoopStart; index <= playback.sourceLoopEnd; index += 1) selectedSourceFrames.push(index);
  }
  return {
    id: profile.id,
    action,
    actionName,
    actionPath,
    manifest: path.join(animationsRoot, `${getProfileAssetPrefix(profile)}_actions_manifest.json`),
    canonicalVideo,
    hasCanonicalVideo: fs.existsSync(canonicalVideo),
    hasProcessedFrames: processedFrames.length > 0,
    processedFrames: processedFrames.map((name) => ({ name, index: Number(name.match(/\d+/)[0]), path: path.join(processedPath, name) })),
    runtimeFrames: runtimeFrames.map((name) => ({ name, index: Number(name.match(/\d+/)[0]), path: path.join(runtimePath, name) })),
    selectedSourceFrames: uniqueList(selectedSourceFrames).sort((left, right) => left - right),
    freezeLastFrame: playback.freezeLastFrame === true,
    protected: Boolean(protectedReason),
    protectedReason,
    playback
  };
}

function buildGenerateFramePoolPlan(payload = {}, options = {}) {
  const pool = getActionFramePool(payload, options);
  if (pool.protected) {
    throw new Error(pool.protectedReason);
  }
  if (!pool.hasCanonicalVideo) {
    throw new Error(`Missing canonical action video: ${pool.canonicalVideo}`);
  }
  const args = ["tools\\process_pet_actions.py", "pool", "--action", pool.actionName, "--trim-ground-alpha", "128", "--trim-ground-alpha-auto"];
  appendActionProcessingArgs(args, pool.action, { loopMode: { mode: "auto" } });
  return { kind: "generateFramePool", id: pool.id, action: pool.action, command: { cwd: projectRoot, command: "python", args } };
}

function buildReselectRuntimeFramesPlan(payload = {}, options = {}) {
  const pool = getActionFramePool(payload, options);
  if (!pool.hasProcessedFrames) throw new Error(`Missing processed frame pool for ${pool.actionName}.`);
  if (pool.protected) throw new Error(pool.protectedReason);
  const sourceFrames = uniqueList((payload.sourceFrames || []).map(Number).filter(Number.isInteger)).sort((left, right) => left - right);
  if (sourceFrames.length === 0) throw new Error("At least one source frame is required.");
  const available = new Set(pool.processedFrames.map((frame) => frame.index));
  const invalid = sourceFrames.filter((index) => !available.has(index));
  if (invalid.length > 0) throw new Error(`Invalid source frame(s): ${invalid.join(", ")}`);
  const args = [
    "tools\\process_pet_actions.py", "reselect", "--action", pool.actionName,
    "--manifest", path.basename(pool.manifest), "--source-frames", sourceFrames.join(",")
  ];
  if (payload.freezeLastFrame === true) args.push("--freeze-last-frame");
  if (payload.freezeLastFrame === false) args.push("--no-freeze-last-frame");
  return {
    kind: "reselectRuntimeFrames", id: pool.id, action: pool.action, sourceFrames,
    freezeLastFrame: payload.freezeLastFrame,
    before: { frameCount: pool.runtimeFrames.length, sourceFrames: pool.selectedSourceFrames, freezeLastFrame: pool.freezeLastFrame },
    after: { frameCount: sourceFrames.length, sourceFrames, freezeLastFrame: payload.freezeLastFrame },
    command: { cwd: projectRoot, command: "python", args }
  };
}

async function applyMaintenanceCommandPlanAsync(plan, options = {}) {
  const runner = options.runCommand || runCommandAsync;
  await runner(plan.command.command, plan.command.args, { cwd: plan.command.cwd, stage: plan.kind, onLog: options.onLog });
  return { id: plan.id, action: plan.action, applied: true };
}

function getCurrentRuntimeVariant(runtimeAssetsRoot) {
  const configFile = path.join(runtimeAssetsRoot, "pet_variant.json");
  if (!fs.existsSync(configFile)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(configFile, "utf8")).variant || null;
  } catch {
    return null;
  }
}

function isInsideOrSame(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`);
}

function collectDeletePaths(profile, options = {}) {
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const userDataRoot = options.userDataRoot || path.join(appRoot, ".user-data");
  const runtimeAssetsRoot = options.runtimeAssetsRoot || path.join(appRoot, ".runtime-assets");
  const paths = [];
  const prefix = `${profile.assetPrefix}_`;
  if (fs.existsSync(animationsRoot)) {
    for (const entry of fs.readdirSync(animationsRoot, { withFileTypes: true })) {
      if (entry.name.startsWith(prefix)) {
        paths.push(path.join(animationsRoot, entry.name));
      }
    }
  }
  const manifest = getManifestPath(animationsRoot, profile.assetPrefix);
  if (fs.existsSync(manifest)) {
    paths.push(manifest);
  }
  const userData = path.join(userDataRoot, profile.id);
  if (fs.existsSync(userData)) {
    paths.push(userData);
  }
  const currentVariant = getCurrentRuntimeVariant(runtimeAssetsRoot);
  const clearRuntime = currentVariant === profile.id && fs.existsSync(runtimeAssetsRoot);
  if (clearRuntime) {
    paths.push(runtimeAssetsRoot);
  }
  return {
    paths: uniqueList(paths),
    runtimeAssets: {
      path: runtimeAssetsRoot,
      currentVariant,
      clear: clearRuntime
    }
  };
}

function buildDeleteVariantPreview(input, options = {}) {
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const userDataRoot = options.userDataRoot || path.join(appRoot, ".user-data");
  const runtimeAssetsRoot = options.runtimeAssetsRoot || path.join(appRoot, ".runtime-assets");
  const metadata = readMetadataFile(metadataFile);
  let profile;
  try {
    profile = getVariantProfileFromMetadata(input, metadata);
  } catch (error) {
    return {
      kind: "deleteVariant",
      id: String(input || ""),
      canDelete: false,
      reason: error.message,
      paths: [],
      metadataFile,
      animationsRoot,
      userDataRoot,
      runtimeAssets: { path: runtimeAssetsRoot, currentVariant: null, clear: false }
    };
  }

  if (profile.scope !== "test") {
    return {
      kind: "deleteVariant",
      id: profile.id,
      scope: profile.scope,
      canDelete: false,
      reason: `Only test scope variants can be deleted. Current scope: ${profile.scope}`,
      paths: [],
      metadataFile,
      animationsRoot,
      userDataRoot,
      runtimeAssets: { path: runtimeAssetsRoot, currentVariant: null, clear: false }
    };
  }

  const deletion = collectDeletePaths(profile, { animationsRoot, userDataRoot, runtimeAssetsRoot });
  const metadataAfterApply = clonePlainObject(metadata);
  delete metadataAfterApply.variants[profile.id];
  return {
    kind: "deleteVariant",
    id: profile.id,
    scope: profile.scope,
    canDelete: true,
    reason: null,
    metadataFile,
    animationsRoot,
    userDataRoot,
    paths: deletion.paths,
    runtimeAssets: deletion.runtimeAssets,
    metadataAfterApply
  };
}

function removeWhitelistedPath(target, roots) {
  const resolvedTarget = path.resolve(target);
  if (!roots.some((root) => isInsideOrSame(root, resolvedTarget))) {
    throw new Error(`Refusing to remove path outside allowed roots: ${resolvedTarget}`);
  }
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

function applyDeleteVariant(preview, options = {}) {
  if (!preview || preview.kind !== "deleteVariant" || !preview.canDelete) {
    throw new Error("Only test scope variants can be deleted.");
  }
  const metadataFile = options.metadataFile || preview.metadataFile || PET_VARIANT_METADATA_FILE;
  const animationsRoot = options.animationsRoot || preview.animationsRoot || defaultAnimationsRoot;
  const userDataRoot = options.userDataRoot || preview.userDataRoot || path.join(appRoot, ".user-data");
  const runtimeAssetsRoot = options.runtimeAssetsRoot || preview.runtimeAssets?.path || path.join(appRoot, ".runtime-assets");
  const allowedRoots = [animationsRoot, userDataRoot, runtimeAssetsRoot];
  for (const item of preview.paths || []) {
    removeWhitelistedPath(item, allowedRoots);
  }
  writeMetadataFile(preview.metadataAfterApply, metadataFile);
  return { id: preview.id, deleted: true, paths: preview.paths || [] };
}

function bootstrapVariant(args, options = {}) {
  const plan = buildBootstrapPlan(args, options);
  if (!args.apply) {
    console.log(JSON.stringify(plan, null, 2));
    return plan;
  }
  const draft = applyBootstrapPlan(plan, {
    force: Boolean(args.force),
    skipProcessing: Boolean(args["skip-processing"]) || Boolean(options.skipProcessing),
    skipPreflight: Boolean(args["skip-preflight"]) || Boolean(options.skipPreflight),
    skipGallery: Boolean(args["skip-gallery"]) || Boolean(options.skipGallery),
    galleryRoot: options.galleryRoot,
    runCommand: options.runCommand
  });
  console.log(JSON.stringify({ id: draft.id, applied: true }, null, 2));
  return draft;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toRelativeWebPath(fromDir, target) {
  return path.relative(fromDir, target).replace(/\\/g, "/");
}

function generateVariantGallery({ metadataFile = PET_VARIANT_METADATA_FILE, animationsRoot = defaultAnimationsRoot, outputDir = defaultGalleryRoot } = {}) {
  const metadata = readMetadataFile(metadataFile);
  const profiles = Object.values(buildPetVariantProfiles(metadata))
    .sort((left, right) => {
      if (left.date !== right.date) {
        return String(left.date || "").localeCompare(String(right.date || ""));
      }
      return String(left.id).localeCompare(String(right.id));
    });
  fs.mkdirSync(outputDir, { recursive: true });

  const cards = profiles.map((profile) => {
    const frame = path.join(animationsRoot, `${profile.assetPrefix}_squat`, "transparent_frames", "frame_000.png");
    const thumb = fs.existsSync(frame)
      ? `<img src="${escapeHtml(toRelativeWebPath(outputDir, frame))}" alt="${escapeHtml(profile.id)} squat" loading="lazy">`
      : `<span class="img-placeholder">missing squat frame</span>`;
    const features = getEnabledFeatureNames(profile.features).join(", ") || "-";
    const assets = (profile.actionAssets || []).join(", ") || "-";
    return `  <article class="card tier-${escapeHtml(profile.tier)}">
    <div class="thumb">${thumb}</div>
    <h2>${escapeHtml(profile.id)} <span class="notes">${escapeHtml(profile.notes || "-")}</span></h2>
    <table>
      <tr><th>id</th><td>${escapeHtml(profile.id)}</td></tr>
      <tr><th>notes</th><td>${escapeHtml(profile.notes || "-")}</td></tr>
      <tr><th>species</th><td>${escapeHtml(profile.species)}</td></tr>
      <tr><th>tier</th><td>${escapeHtml(profile.tier)}</td></tr>
      <tr><th>scope</th><td>${escapeHtml(profile.scope)}</td></tr>
      <tr><th>date</th><td>${escapeHtml(profile.date)}</td></tr>
      <tr><th>platforms</th><td>${escapeHtml(profile.platforms.join(", "))}</td></tr>
      <tr><th>version</th><td>${escapeHtml(profile.version)}</td></tr>
      <tr><th>scale</th><td>${escapeHtml(profile.scale)}</td></tr>
      <tr><th>assetPrefix</th><td>${escapeHtml(profile.assetPrefix)}</td></tr>
      <tr><th>soundPrefix</th><td>${escapeHtml(profile.soundPrefix || "-")}</td></tr>
      <tr><th>actions</th><td>${escapeHtml(profile.actionButtons.join(", "))}</td></tr>
      <tr><th>assets</th><td>${escapeHtml(assets)}</td></tr>
      <tr><th>features</th><td>${escapeHtml(features)}</td></tr>
    </table>
  </article>`;
  }).join("\n");

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>宠物变体图鉴</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 24px; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f5f5f7; color: #1d1d1f; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  .meta { color: #6e6e73; font-size: 13px; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px; }
  .card { background: #fff; border-radius: 8px; padding: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); border-top: 4px solid #d2d2d7; }
  .card.tier-basic { border-top-color: #6e6e73; }
  .card.tier-advanced { border-top-color: #0071e3; }
  .thumb { display: flex; justify-content: center; align-items: center; height: 180px; margin-bottom: 12px; background: #fafafa; border-radius: 8px; }
  .thumb img { max-height: 160px; max-width: 100%; object-fit: contain; image-rendering: pixelated; }
  .img-placeholder { color: #aeaeb2; font-size: 13px; }
  .card h2 { margin: 0 0 12px; font-size: 16px; display: flex; align-items: baseline; gap: 8px; }
  .notes { font-size: 13px; color: #6e6e73; font-weight: normal; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; padding: 4px 8px 4px 0; color: #6e6e73; font-weight: 500; white-space: nowrap; vertical-align: top; width: 40%; }
  td { padding: 4px 0; word-break: break-all; }
</style>
</head>
<body>
<h1>宠物变体图鉴</h1>
<div class="meta">仅本地开发使用，不提交不打包。</div>
<div class="grid">
${cards}
</div>
</body>
</html>
`;
  const output = path.join(outputDir, "index.html");
  fs.writeFileSync(output, html, "utf8");
  return output;
}

function printSpecies() {
  console.log(JSON.stringify(getSpeciesProfiles(), null, 2));
}

function printTiers() {
  console.log(JSON.stringify(getTierProfiles(), null, 2));
}

function printHelp() {
  console.log(`Usage:
  node scripts/variant-cli.cjs list
  node scripts/variant-cli.cjs show --id <variant>
  node scripts/variant-cli.cjs query [--id <variant>] [--species cat] [--tier basic] [--date YYYY-MM-DD] [--scope custom]
  node scripts/variant-cli.cjs new --species cat --scope custom --tier basic --date YYYY-MM-DD
   node scripts/variant-cli.cjs bootstrap --scope custom --species cat --tier advanced --date YYYY-MM-DD [--source <source-dir>] [--use-full-range] [--apply]
  node scripts/variant-cli.cjs check --id <variant>
  node scripts/variant-cli.cjs rename-assets --id <variant> --from <source-dir>
  node scripts/variant-cli.cjs gallery
  node scripts/variant-cli.cjs species
  node scripts/variant-cli.cjs tiers`);
}

function run(argv = process.argv.slice(2), options = {}) {
  const args = readArgs(argv);
  const command = args._[0];
  switch (command) {
    case "list":
      return listVariants(args);
    case "show":
      return showVariant(args);
    case "query":
      return queryVariants(args);
    case "new":
      return createVariant(args, options);
    case "bootstrap":
      return bootstrapVariant(args, options);
    case "check":
      return checkVariant(args, options);
    case "rename-assets":
      return renameAssets(args, options);
    case "gallery":
      return generateVariantGallery(options);
    case "species":
      return printSpecies();
    case "tiers":
      return printTiers();
    case "help":
    case undefined:
      return printHelp();
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  readArgs,
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
  applyReplaceActionPlan,
  applyReplaceActionPlanAsync,
  buildAddActionPlan,
  applyAddActionPlanAsync,
  getActionFramePool,
  buildGenerateFramePoolPlan,
  buildReselectRuntimeFramesPlan,
  applyMaintenanceCommandPlanAsync,
  buildMetadataEditPreview,
  applyMetadataEdit,
  buildDeleteActionPreview,
  applyDeleteAction,
  buildDeleteVariantPreview,
  applyDeleteVariant,
  bootstrapVariant,
  generateVariantGallery,
  listVariantSummaries,
  getVariantDetails,
  getVariantSummary,
  formatList,
  formatTable,
  resolveVariantInput,
  resolveSourceActionName,
  run
};
