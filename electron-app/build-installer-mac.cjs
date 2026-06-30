const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PET_VARIANT_IDS, getPetVariantProfile } = require("./electron/pet-variants.cjs");

const appRoot = __dirname;
const packageJsonPath = path.join(appRoot, "package.json");
const macIconPath = path.join(appRoot, "build", "app_icon.icns");
const macBuilderCache = path.join(appRoot, ".mac-builder-cache");
const displayName = `${String.fromCharCode(0x5ba0, 0x4f34)} 1.0`;

function readOption(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32"
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function removeInsideAppRoot(target) {
  const resolvedAppRoot = path.resolve(appRoot);
  const resolvedTarget = path.resolve(target);
  if (resolvedTarget === resolvedAppRoot || !resolvedTarget.startsWith(`${resolvedAppRoot}${path.sep}`)) {
    throw new Error(`Refusing to remove directory outside app root: ${resolvedTarget}`);
  }
  fs.rmSync(resolvedTarget, { recursive: true, force: true });
}

const variant = readOption("pet-variant", "pomeranian");
const archOption = readOption("arch", "all");
const archs = archOption === "all" ? ["arm64", "x64"] : [archOption];
if (process.platform !== "darwin") {
  throw new Error("Mac installer must be built on macOS.");
}
if (!PET_VARIANT_IDS.includes(variant)) {
  throw new Error(`Invalid pet variant: ${variant}`);
}
const variantProfile = getPetVariantProfile(variant);
if (!variantProfile.platforms.includes("darwin")) {
  throw new Error(`Pet variant ${variant} does not support macOS packaging.`);
}
if (archs.some((arch) => !["x64", "arm64"].includes(arch))) {
  throw new Error(`Invalid mac arch: ${archOption}`);
}
if (!fs.existsSync(macIconPath)) {
  throw new Error(`Mac icon was not found: ${macIconPath}`);
}

const originalPackageJson = fs.readFileSync(packageJsonPath, "utf8");

try {
  for (const arch of archs) {
    removeInsideAppRoot(path.join(appRoot, "mac_installer", variant, arch));
  }
  fs.mkdirSync(macBuilderCache, { recursive: true });
  run("node", ["prepare-runtime-assets.cjs", `--pet-variant=${variant}`, "--pet-channel=installer"]);

  for (const arch of archs) {
    const packageJson = JSON.parse(originalPackageJson);
    packageJson.build.appId = variantProfile.singleInstanceKey;
    packageJson.build.productName = displayName;
    packageJson.build.executableName = displayName;
    packageJson.build.directories.output = path.posix.join("mac_installer", variant, arch);
    packageJson.build.mac = {
      category: "public.app-category.utilities",
      hardenedRuntime: false,
      gatekeeperAssess: false,
      icon: "build/app_icon.icns",
      identity: null,
      target: ["dmg", "dir"]
    };
    packageJson.build.dmg = {
      title: displayName,
      artifactName: `${displayName}.\${ext}`
    };
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

    run("npx", ["electron-builder", "--mac", "dmg", "dir", `--${arch}`], {
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE || macBuilderCache
    });
  }
} finally {
  fs.writeFileSync(packageJsonPath, originalPackageJson, "utf8");
}
