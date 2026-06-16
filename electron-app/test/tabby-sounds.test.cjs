const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const soundsDir = path.join(__dirname, "..", "..", "assets", "sounds", "tabby");

test("tabby sounds keep squat meows separate from sleep purrs", () => {
  const sounds = fs.readdirSync(soundsDir);
  const squatSounds = sounds.filter((name) => /^cat_meow_.*\.mp3$/.test(name)).sort();
  const sleepSounds = sounds.filter((name) => /^cat_purr_.*\.mp3$/.test(name)).sort();

  assert.deepEqual(squatSounds, [
    "cat_meow_01.mp3",
    "cat_meow_02.mp3",
    "cat_meow_03.mp3"
  ]);
  assert.deepEqual(sleepSounds, [
    "cat_purr_01.mp3",
    "cat_purr_02.mp3"
  ]);
});
