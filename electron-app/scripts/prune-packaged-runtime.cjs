const fs = require("fs");
const path = require("path");

const DEFAULT_KEEP_LOCALES = Object.freeze(["zh-CN.pak"]);

function readArgs(argv) {
  const result = { root: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      result.root = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--root=")) {
      result.root = arg.slice("--root=".length);
    }
  }
  return result;
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function pruneElectronLocales(root, options = {}) {
  const keepLocales = options.keepLocales || DEFAULT_KEEP_LOCALES;
  const requiredLocales = options.requiredLocales || keepLocales;
  const resolvedRoot = path.resolve(root);
  const localesDir = path.join(resolvedRoot, "locales");

  if (!fs.existsSync(localesDir)) {
    throw new Error(`Electron locales directory was not found: ${localesDir}`);
  }

  const keepSet = new Set(keepLocales);
  const entries = fs.readdirSync(localesDir, { withFileTypes: true });
  const availableLocales = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".pak"))
    .map((entry) => entry.name);
  for (const locale of requiredLocales) {
    if (!availableLocales.includes(locale)) {
      throw new Error(`Required Electron locale is missing: ${path.join(localesDir, locale)}`);
    }
  }

  const removed = [];
  const kept = [];
  let removedBytes = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".pak")) {
      continue;
    }

    const file = path.join(localesDir, entry.name);
    if (keepSet.has(entry.name)) {
      kept.push(entry.name);
      continue;
    }

    const size = fs.statSync(file).size;
    fs.rmSync(file, { force: true });
    removed.push(entry.name);
    removedBytes += size;
  }

  return {
    root: resolvedRoot,
    localesDir,
    kept: kept.sort(),
    removed: removed.sort(),
    removedBytes
  };
}

function prunePackagedRuntime(root, options = {}) {
  return {
    locales: pruneElectronLocales(root, options)
  };
}

if (require.main === module) {
  const { root } = readArgs(process.argv.slice(2));
  if (!root) {
    throw new Error("Usage: node scripts/prune-packaged-runtime.cjs --root <win-unpacked-or-portable-root>");
  }

  const result = prunePackagedRuntime(root);
  console.log(`Pruned Electron locales in ${result.locales.localesDir}`);
  console.log(`Kept: ${result.locales.kept.join(", ")}`);
  console.log(`Removed ${result.locales.removed.length} locale files (${formatBytes(result.locales.removedBytes)})`);
}

module.exports = {
  DEFAULT_KEEP_LOCALES,
  pruneElectronLocales,
  prunePackagedRuntime,
  readArgs
};
