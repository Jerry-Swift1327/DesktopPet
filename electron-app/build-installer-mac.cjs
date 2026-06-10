const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { PET_VARIANT_IDS } = require("./electron/pet-variants.cjs");

const appRoot = __dirname;
const packageJsonPath = path.join(appRoot, "package.json");
const displayName = `${String.fromCharCode(0x5ba0, 0x4f34)} Pomeranian`;

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
const arch = readOption("arch", process.arch === "arm64" ? "arm64" : "x64");
if (process.platform !== "darwin") {
  throw new Error("Mac installer must be built on macOS.");
}
if (!PET_VARIANT_IDS.includes(variant)) {
  throw new Error(`Invalid pet variant: ${variant}`);
}
if (!["x64", "arm64"].includes(arch)) {
  throw new Error(`Invalid mac arch: ${arch}`);
}

const output = path.posix.join("mac_installer", variant);
const outputRoot = path.join(appRoot, "mac_installer", variant);
const originalPackageJson = fs.readFileSync(packageJsonPath, "utf8");

try {
  removeInsideAppRoot(outputRoot);
  run("node", ["prepare-runtime-assets.cjs", `--pet-variant=${variant}`, "--pet-channel=installer"]);

  const packageJson = JSON.parse(originalPackageJson);
  packageJson.build.appId = `com.chongban.desktoppet.${variant}`;
  packageJson.build.productName = displayName;
  packageJson.build.executableName = displayName;
  packageJson.build.directories.output = output;
  packageJson.build.mac = {
    category: "public.app-category.utilities",
    hardenedRuntime: false,
    gatekeeperAssess: false,
    identity: null,
    target: ["dmg", "dir"]
  };
  packageJson.build.dmg = {
    artifactName: `${displayName}-${variant}-installer-\${arch}.\${ext}`
  };
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  run("npx", ["electron-builder", "--mac", "dmg", "dir", `--${arch}`], {
    CSC_IDENTITY_AUTO_DISCOVERY: "false"
  });
} finally {
  fs.writeFileSync(packageJsonPath, originalPackageJson, "utf8");
}
