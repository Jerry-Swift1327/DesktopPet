const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const soundsDir = path.join(__dirname, "..", "..", "assets", "sounds", "tabby");

test("tabby squat sounds use the configured cat meow and purr assets", () => {
  const sounds = fs.readdirSync(soundsDir).filter((name) => /^cat_(?:meow|purr)_.*\.mp3$/.test(name)).sort();

  assert.deepEqual(sounds, [
    "cat_meow_01.mp3",
    "cat_meow_02.mp3",
    "cat_meow_03.mp3",
    "cat_purr_01.mp3",
    "cat_purr_02.mp3"
  ]);
});
