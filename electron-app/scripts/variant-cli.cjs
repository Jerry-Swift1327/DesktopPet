const fs = require("fs");
const path = require("path");
const {
  PET_ACTION_ORDER,
  PET_BREED_IDS,
  PET_VARIANT_IDS,
  PET_VARIANT_METADATA_FILE,
  createPetVariantMetadataDraft,
  getPetBreedProfiles,
  getPetVariantProfile,
  getVariantManifestName,
  getWindowsBuildProfile,
  requirePetVariantId
} = require("../electron/pet-variants.cjs");

const appRoot = path.dirname(__dirname);
const projectRoot = path.dirname(appRoot);
const defaultAnimationsRoot = path.join(projectRoot, "assets", "animations");

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

function assertKnownBreed(breed) {
  if (!PET_BREED_IDS.includes(breed)) {
    throw new Error(`Unknown breed: ${breed}. Available breeds: ${PET_BREED_IDS.join(", ")}`);
  }
}

function getVariantActionAssets(input) {
  const id = resolveVariantInput(input);
  const profile = getPetVariantProfile(id);
  return (profile.actions || PET_ACTION_ORDER)
    .concat(profile.extraAnimationAssets || [])
    .map((action) => `${profile.animationPrefix}_${action}`);
}

function getVariantSummary(input) {
  const id = resolveVariantInput(input);
  const profile = getPetVariantProfile(id);
  return {
    id: profile.id,
    aliases: profile.aliases,
    breed: profile.breed,
    date: profile.date,
    scope: profile.scope,
    platforms: profile.platforms,
    version: profile.version,
    scale: profile.scale,
    actions: profile.actions,
    extraAssets: profile.extraAnimationAssets,
    features: profile.features,
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
    { title: "aliases", value: (row) => row.aliases.length > 0 ? row.aliases.join(",") : "-" },
    { title: "breed", value: (row) => row.breed },
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
    .filter((row) => !args.breed || row.breed === args.breed)
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
  for (const action of PET_ACTION_ORDER) {
    const actionDir = path.join(animationsRoot, `${draft.id}_${action}`);
    if (fs.existsSync(actionDir)) {
      throw new Error(`Action directory already exists: ${actionDir}`);
    }
  }
  const manifest = path.join(animationsRoot, `${draft.id}_actions_manifest.json`);
  if (fs.existsSync(manifest)) {
    throw new Error(`Manifest already exists: ${manifest}`);
  }
}

function createVariant(args, options = {}) {
  const breed = args.breed;
  const date = args.date;
  assertKnownBreed(breed);
  const metadataFile = options.metadataFile || PET_VARIANT_METADATA_FILE;
  const metadata = readMetadataFile(metadataFile);
  const variants = getMetadataVariants(metadata);

  const draft = createPetVariantMetadataDraft({
    breed,
    date,
    id: args.id,
    metadata,
    scope: args.scope || "custom",
    version: args.version || "1.0",
    scale: args.scale || 1.1,
    platform: args.platform || "win32"
  });
  assertDraftDoesNotConflict(metadata, draft, options);

  variants[draft.id] = draft;
  writeMetadataFile(metadata, metadataFile);

  console.log(`Created pet variant: ${draft.id}`);
  console.log(`Next: npm.cmd run variant:rename-assets -- --id ${draft.id} --from <source-dir>`);
  console.log(`Next: python tools\\process_pet_actions.py process --variant ${draft.id} --actions squat walk feed ball`);
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
  for (const action of PET_ACTION_ORDER) {
    const actionName = `${profile.animationPrefix}_${action}`;
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

function printBreeds() {
  console.log(JSON.stringify(getPetBreedProfiles(), null, 2));
}

function printHelp() {
  console.log(`Usage:
  node scripts/variant-cli.cjs list
  node scripts/variant-cli.cjs show --id <variant>
  node scripts/variant-cli.cjs query [--id <variant>] [--breed <breed>] [--date YYYY-MM-DD] [--scope custom]
  node scripts/variant-cli.cjs new --breed <breed> --date YYYY-MM-DD
  node scripts/variant-cli.cjs check --id <variant>
  node scripts/variant-cli.cjs rename-assets --id <variant> --from <source-dir>
  node scripts/variant-cli.cjs breeds`);
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
    case "check":
      return checkVariant(args, options);
    case "rename-assets":
      return renameAssets(args, options);
    case "breeds":
      return printBreeds();
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
  getVariantSummary,
  formatList,
  formatTable,
  resolveVariantInput,
  run
};
