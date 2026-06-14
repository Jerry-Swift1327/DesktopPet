const fs = require("fs");
const path = require("path");
const {
  PET_VARIANT_IDS,
  PET_CHANNEL_IDS,
  SWITCHABLE_VARIANTS,
  getVariantAnimationFolders,
  getVariantManifestName
} = require("./electron/pet-variants.cjs");

const appRoot = __dirname;
const projectRoot = path.dirname(appRoot);
const sourceRoot = path.join(projectRoot, "assets", "animations");
const runtimeRoot = path.join(appRoot, ".runtime-assets");
const runtimeAnimations = path.join(runtimeRoot, "animations");

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function requireAllowed(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

function removeInsideAppRoot(target) {
  const resolvedAppRoot = path.resolve(appRoot);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === resolvedAppRoot || !resolvedTarget.startsWith(`${resolvedAppRoot}${path.sep}`)) {
    throw new Error(`Refusing to remove directory outside app root: ${resolvedTarget}`);
  }
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

const variant = requireAllowed(readOption("pet-variant", "dog"), PET_VARIANT_IDS, "pet variant");
const channel = requireAllowed(readOption("pet-channel", "release"), PET_CHANNEL_IDS, "pet channel");

removeInsideAppRoot(runtimeRoot);
fs.mkdirSync(runtimeAnimations, { recursive: true });
fs.writeFileSync(path.join(runtimeRoot, "pet_variant.json"), JSON.stringify({ variant, channel }), "utf8");

for (const folder of getVariantAnimationFolders(variant)) {
  const sourceAction = path.join(sourceRoot, folder);
  const sourceFrames = path.join(sourceAction, "transparent_frames");
  const sourceLoop = path.join(sourceAction, "loop.json");
  const targetAction = path.join(runtimeAnimations, folder);

  if (!fs.existsSync(sourceFrames)) {
    throw new Error(`Missing runtime transparent frames: ${sourceFrames}`);
  }

  copyDirectory(sourceFrames, path.join(targetAction, "transparent_frames"));
  if (fs.existsSync(sourceLoop)) {
    fs.copyFileSync(sourceLoop, path.join(targetAction, "loop.json"));
  }
}

const manifestName = getVariantManifestName(variant);
const manifest = path.join(sourceRoot, manifestName);
if (fs.existsSync(manifest)) {
  fs.copyFileSync(manifest, path.join(runtimeAnimations, manifestName));
}

if (SWITCHABLE_VARIANTS.includes(variant)) {
  const otherVariants = SWITCHABLE_VARIANTS.filter((v) => v !== variant);
  for (const otherVariant of otherVariants) {
    for (const folder of getVariantAnimationFolders(otherVariant)) {
      const sourceAction = path.join(sourceRoot, folder);
      const sourceFrames = path.join(sourceAction, "transparent_frames");
      const sourceLoop = path.join(sourceAction, "loop.json");
      const targetAction = path.join(runtimeAnimations, folder);

      if (!fs.existsSync(sourceFrames)) {
        throw new Error(`Missing runtime transparent frames: ${sourceFrames}`);
      }

      copyDirectory(sourceFrames, path.join(targetAction, "transparent_frames"));
      if (fs.existsSync(sourceLoop)) {
        fs.copyFileSync(sourceLoop, path.join(targetAction, "loop.json"));
      }
    }

    const otherManifestName = getVariantManifestName(otherVariant);
    const otherManifest = path.join(sourceRoot, otherManifestName);
    if (fs.existsSync(otherManifest)) {
      fs.copyFileSync(otherManifest, path.join(runtimeAnimations, otherManifestName));
    }
  }
}

console.log("Prepared runtime assets:");
console.log(runtimeRoot);
