const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  DEFAULT_KEEP_LOCALES,
  pruneElectronLocales,
  readArgs
} = require("../scripts/prune-packaged-runtime.cjs");

function createTempRuntime() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-runtime-"));
  fs.mkdirSync(path.join(root, "locales"), { recursive: true });
  return root;
}

function writeLocale(root, name, content) {
  fs.writeFileSync(path.join(root, "locales", name), content);
}

test("runtime pruning keeps only zh-CN Electron locale", () => {
  const root = createTempRuntime();
  writeLocale(root, "zh-CN.pak", "zh");
  writeLocale(root, "en-US.pak", "english");
  writeLocale(root, "fr.pak", "french");
  fs.writeFileSync(path.join(root, "locales", "README.txt"), "not a locale");

  const result = pruneElectronLocales(root);

  assert.deepEqual(DEFAULT_KEEP_LOCALES, ["zh-CN.pak"]);
  assert.deepEqual(result.kept, ["zh-CN.pak"]);
  assert.deepEqual(result.removed, ["en-US.pak", "fr.pak"]);
  assert.equal(result.removedBytes, Buffer.byteLength("english") + Buffer.byteLength("french"));
  assert.deepEqual(
    fs.readdirSync(path.join(root, "locales")).sort(),
    ["README.txt", "zh-CN.pak"]
  );
});

test("runtime pruning fails when zh-CN locale is missing", () => {
  const root = createTempRuntime();
  writeLocale(root, "en-US.pak", "english");

  assert.throws(
    () => pruneElectronLocales(root),
    /Required Electron locale is missing/
  );
});

test("runtime pruning CLI args support --root forms", () => {
  assert.deepEqual(readArgs(["--root", "C:/app"]), { root: "C:/app" });
  assert.deepEqual(readArgs(["--root=C:/app"]), { root: "C:/app" });
});
