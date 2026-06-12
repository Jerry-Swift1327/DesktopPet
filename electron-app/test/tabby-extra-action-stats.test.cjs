const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");

test("tabby extra one-shot actions settle stats after playback", () => {
  const delayBody = mainSource.match(/function shouldDelayActionStats\(stateId\) \{\s*return ([^;]+);/s)?.[1] || "";

  assert.match(delayBody, /STATE_LIE/);
  assert.match(delayBody, /STATE_LICK/);
  assert.match(delayBody, /STATE_BELLY/);
});

test("tabby extra actions update hover panel stats", () => {
  assert.match(mainSource, /stateId === STATE_LIE[\s\S]*petStats\.health/);
  assert.match(mainSource, /stateId === STATE_LICK[\s\S]*petStats\.health/);
  assert.match(mainSource, /stateId === STATE_BELLY[\s\S]*petStats\.fullness/);
});
