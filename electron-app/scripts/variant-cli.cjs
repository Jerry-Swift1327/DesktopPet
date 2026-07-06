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

function getVariantSummary(input) {
  const id = resolveVariantInput(input);
  const profile = getPetVariantProfile(id);
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
    manifest: getVariantManifestName(id),
    deliveryPathSegments: profile.deliveryPathSegments
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

function pathExistsForVariant(input, options = {}) {
  const id = resolveVariantInput(input);
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  return getVariantActionAssets(id)
    .map((folder) => path.join(animationsRoot, folder))
    .filter((folder) => fs.existsSync(folder))
    .concat(fs.existsSync(path.join(animationsRoot, getVariantManifestName(id))) ? [path.join(animationsRoot, getVariantManifestName(id))] : []);
}

function checkVariant(args, options = {}) {
  const id = resolveVariantInput(args.id);
  const profile = getPetVariantProfile(id);
  const existingPaths = pathExistsForVariant(id, options);
  const result = {
    id,
    notes: profile.notes,
    species: profile.species,
    tier: profile.tier,
    manifest: getVariantManifestName(id),
    animationFolders: getVariantActionAssets(id),
    existingPaths,
    releaseOutput: profile.platforms.includes("win32") ? getWindowsBuildProfile(id, "release").output : null,
    installerOutput: profile.platforms.includes("win32") ? getWindowsBuildProfile(id, "installer").output : null
  };
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

function renameAssets(args, options = {}) {
  const id = resolveVariantInput(args.id);
  const sourceDir = path.resolve(args.from || "");
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  if (!args.from) {
    throw new Error("Missing --from source directory.");
  }
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Source directory was not found: ${sourceDir}`);
  }

  const profile = getPetVariantProfile(id);
  const copied = [];
  for (const action of profile.actionButtons || profile.actions || PET_ACTION_ORDER) {
    const actionName = `${profile.animationPrefix}_${actionPool[action].asset}`;
    const actionDir = path.join(animationsRoot, actionName);
    const source = findSourceVideo(sourceDir, action);
    const target = path.join(actionDir, `${actionName}.mp4`);
    if (fs.existsSync(target) && !args.force) {
      throw new Error(`Target video already exists: ${target}. Pass --force to overwrite.`);
    }
    fs.mkdirSync(actionDir, { recursive: true });
    fs.copyFileSync(source, target);
    copied.push({ action, source, target });
  }
  console.log(JSON.stringify({ id, copied }, null, 2));
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

function getProcessArgs(assetPrefix, action) {
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
  const preset = actionPool[action].processPreset;
  if (preset === "nearSquat" && action !== "squat") {
    processArgs.push("--align-reference-center-x", "--align-reference-bottom");
  } else if (preset === "direction64") {
    processArgs.push("--direction-count", "64");
  }
  return processArgs;
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
  const processCommands = actionKeys.map((action) => ({
    action,
    cwd: projectRoot,
    command: "python",
    args: getProcessArgs(draft.assetPrefix, action)
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

function applyBootstrapPlan(plan, options = {}) {
  const metadata = readMetadataFile(plan.metadataFile);
  const variants = getMetadataVariants(metadata);
  if (variants[plan.draft.id]) {
    throw new Error(`Variant already exists: ${plan.draft.id}`);
  }
  variants[plan.draft.id] = plan.draft;
  writeMetadataFile(metadata, plan.metadataFile);

  for (const item of plan.copied) {
    if (fs.existsSync(item.target) && !options.force) {
      throw new Error(`Target video already exists: ${item.target}. Pass --force to overwrite.`);
    }
    fs.mkdirSync(path.dirname(item.target), { recursive: true });
    fs.copyFileSync(item.source, item.target);
  }

  if (!options.skipProcessing) {
    for (const processCommand of plan.processCommands) {
      (options.runCommand || runCommand)(processCommand.command, processCommand.args, { cwd: processCommand.cwd });
    }
  }

  if (!options.skipPreflight) {
    for (const preflightCommand of plan.preflightCommands) {
      (options.runCommand || runCommand)(preflightCommand.command, preflightCommand.args, { cwd: preflightCommand.cwd });
    }
  }

  if (!options.skipGallery) {
    generateVariantGallery({
      metadataFile: plan.metadataFile,
      animationsRoot: plan.animationsRoot,
      outputDir: options.galleryRoot || defaultGalleryRoot
    });
  }

  return plan.draft;
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
  node scripts/variant-cli.cjs bootstrap --scope custom --species cat --tier advanced --date YYYY-MM-DD [--source <source-dir>] [--apply]
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
  findSourceVideo,
  buildBootstrapPlan,
  applyBootstrapPlan,
  bootstrapVariant,
  generateVariantGallery,
  getVariantSummary,
  formatList,
  formatTable,
  resolveVariantInput,
  resolveSourceActionName,
  run
};
