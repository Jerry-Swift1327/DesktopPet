const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  ACTION_REGISTRY_FILE,
  createStateId,
  validateActionRegistry,
  readActionRegistry,
  buildActionRegistrationPreview,
  applyActionRegistration
} = require("../electron/pet/action-registry.cjs");

function createRegistryCopy() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "desktop-pet-action-registry-"));
  const registryFile = path.join(root, "pet-action-registry.json");
  fs.copyFileSync(ACTION_REGISTRY_FILE, registryFile);
  return { root, registryFile };
}

test("action registry contains the four required actions in the single global pool", () => {
  const registry = readActionRegistry();
  const required = Object.entries(registry.actions)
    .filter(([, action]) => action.requiredForVariant)
    .map(([actionKey]) => actionKey);

  assert.deepEqual(required, ["squat", "walk", "feed", "ball"]);
  assert.equal(registry.actions.look.presentation.hoverButton, false);
});

test("action registry defines stable-ground and detached-artifact processing defaults", () => {
  const registry = readActionRegistry();
  const detachedEnabled = Object.entries(registry.actions)
    .filter(([, action]) => action.processing.detachedArtifacts.enabledByDefault)
    .map(([actionKey]) => actionKey);

  assert.deepEqual(detachedEnabled, ["squat", "walk", "lie", "spin", "lick", "belly", "stretch", "splits", "yawn", "sleep", "hiss", "look"]);
  assert.equal(registry.actions.look.processing.stableGround, false);
  assert.equal(registry.actions.pee.processing.stableGround, false);
  assert.equal(registry.actions.feed.processing.stableGround, true);
  assert.deepEqual(registry.actions.walk.processing.detachedArtifacts, {
    enabledByDefault: true,
    maxArea: 256,
    maxSpan: 32,
    minGap: 0
  });
});

test("runtime state ids are derived from lower camel case action keys", () => {
  assert.equal(createStateId("run"), "petRun");
  assert.equal(createStateId("tailWag"), "petTailWag");
  assert.throws(() => createStateId("tail_wag"), /小驼峰/);
});

test("action registration persists a timed reusable hover action", (t) => {
  const { root, registryFile } = createRegistryCopy();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const preview = buildActionRegistrationPreview({
    actionKey: "tailWag",
    label: "摇尾巴",
    playbackMode: "timed",
    durationMinutes: 5
  }, { registryFile });
  const result = applyActionRegistration(preview);
  const registry = readActionRegistry(registryFile);

  assert.deepEqual(result, { actionKey: "tailWag", stateId: "petTailWag", registered: true });
  assert.equal(registry.actions.tailWag.presentation.hoverButton, true);
  assert.equal(registry.actions.tailWag.playback.mode, "timed");
  assert.equal(registry.actions.tailWag.playback.durationMinutes, 5);
  assert.equal(registry.actions.tailWag.motion.mode, "stationary");
  assert.equal(registry.actions.tailWag.processing.stableGround, true);
  assert.equal(registry.actions.tailWag.processing.detachedArtifacts.enabledByDefault, false);
});

test("action registry rejects invalid detached-artifact thresholds", () => {
  const registry = readActionRegistry();
  registry.actions.walk.processing.detachedArtifacts.maxSpan = 0;

  assert.throws(() => validateActionRegistry(registry), /maxSpan/);
});

test("action registration rejects collisions, pet prefixes, and invalid timed durations", (t) => {
  const { root, registryFile } = createRegistryCopy();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  assert.throws(() => buildActionRegistrationPreview({ actionKey: "squat", label: "重复" }, { registryFile }), /已经注册/);
  assert.throws(() => buildActionRegistrationPreview({ actionKey: "petRun", label: "跑步" }, { registryFile }), /pet 前缀/);
  assert.throws(() => buildActionRegistrationPreview({
    actionKey: "tailWag", label: "摇尾巴", playbackMode: "timed", durationMinutes: 0
  }, { registryFile }), /持续分钟数/);
});
