const test = require("node:test");
const assert = require("node:assert/strict");
const packageJson = require("../package.json");

function normalizePattern(pattern) {
  return String(pattern).replace(/\\/g, "/").replace(/^\.\//, "");
}

function patternToRegExp(pattern) {
  const normalized = normalizePattern(pattern).replace(/^!/, "");
  if (normalized === "" || normalized === "." || normalized === "*") {
    return /^.*$/;
  }

  let source = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    const afterNext = normalized[index + 2];

    if (char === "*" && next === "*" && afterNext === "/") {
      source += "(?:[^/]+/)*";
      index += 2;
    } else if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else if ("\\^$+?.()|{}[]".includes(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  source += "$";
  return new RegExp(source);
}

function buildFilesInclude(relativePath) {
  const normalizedPath = normalizePattern(relativePath);
  let included = false;
  for (const rawPattern of packageJson.build.files) {
    const pattern = normalizePattern(rawPattern);
    if (!patternToRegExp(pattern).test(normalizedPath)) {
      continue;
    }
    included = !pattern.startsWith("!");
  }
  return included;
}

test("package exposes a dev-only devtools launch script", () => {
  assert.equal(packageJson.scripts.devtools, "electron devtools/main.cjs");
});

test("electron-builder package files do not explicitly include devtools sources", () => {
  const files = packageJson.build.files.map(normalizePattern);
  const positiveFiles = files.filter((pattern) => !pattern.startsWith("!"));
  const includedDevtools = positiveFiles.filter((pattern) => pattern.includes("devtools"));

  assert.deepEqual(includedDevtools, []);
});

test("electron-builder package files include runtime entries and exclude devtools paths", () => {
  assert.equal(buildFilesInclude("electron/main.cjs"), true);
  assert.equal(buildFilesInclude("static/index.html"), true);
  assert.equal(buildFilesInclude(".runtime-assets/contact_qr_code.jpg"), true);
  assert.equal(buildFilesInclude("package.json"), true);
  assert.equal(buildFilesInclude("devtools/main.cjs"), false);
  assert.equal(buildFilesInclude("devtools/preload.cjs"), false);
  assert.equal(buildFilesInclude("devtools/renderer/app.js"), false);
});
