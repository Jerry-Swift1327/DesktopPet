const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createPetWindowLayoutTransaction } = require("../electron/windows/pet-window-layout-transaction.cjs");

function createHarness() {
  const prepares = [];
  const nativeCommits = [];
  const rendererCommits = [];
  const cancels = [];
  const pendingChanges = [];
  const settled = [];
  const timers = new Map();
  let nextTimer = 0;
  const transaction = createPetWindowLayoutTransaction({
    sendPrepare: (payload) => prepares.push(payload),
    sendCommit: (payload) => rendererCommits.push(payload),
    sendCancel: (payload) => cancels.push(payload),
    applyBounds: (layout, detail) => {
      nativeCommits.push({ layout, detail });
      return true;
    },
    onPendingChange: (pending) => pendingChanges.push(pending),
    onSettled: (result) => settled.push(result),
    setTimeoutFn: (callback) => {
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearTimeoutFn: (id) => timers.delete(id)
  });
  return {
    transaction,
    prepares,
    nativeCommits,
    rendererCommits,
    cancels,
    pendingChanges,
    settled,
    timers
  };
}

test("layout remains pending until renderer confirms a painted target viewport", () => {
  const harness = createHarness();
  const layout = { bounds: { x: 10, y: 20, width: 900, height: 180 } };
  const scale = { windowWidth: 900, windowHeight: 180, spriteOffsetX: 240 };
  const token = harness.transaction.prepare({ layout, scale, reason: "drag-end" });

  assert.deepEqual(harness.prepares, [{ token, scale, reason: "drag-end" }]);
  assert.equal(harness.transaction.confirm(token, "prepared"), true);
  assert.equal(harness.transaction.getPending().phase, "committed");
  assert.deepEqual(harness.nativeCommits[0], {
    layout,
    detail: { token, reason: "drag-end", trigger: "renderer-prepared" }
  });
  assert.deepEqual(harness.rendererCommits, [{ token, scale, reason: "drag-end" }]);
  assert.deepEqual(harness.pendingChanges, [true]);

  assert.equal(harness.transaction.confirm(token, "painted"), true);
  assert.equal(harness.transaction.getPending(), null);
  assert.deepEqual(harness.pendingChanges, [true, false]);
  assert.equal(harness.settled[0].trigger, "renderer-painted");
});

test("stale acknowledgements cannot commit a superseded layout", () => {
  const harness = createHarness();
  const firstToken = harness.transaction.prepare({ layout: { bounds: { width: 1 } }, scale: { id: 1 } });
  const secondToken = harness.transaction.prepare({ layout: { bounds: { width: 2 } }, scale: { id: 2 } });

  assert.equal(harness.transaction.confirm(firstToken, "prepared"), false);
  assert.equal(harness.transaction.confirm(secondToken, "prepared"), true);
  assert.deepEqual(harness.nativeCommits.map((item) => item.layout.bounds.width), [2]);
  assert.deepEqual(harness.cancels, [{ token: firstToken, reason: "superseded" }]);
});

test("settlement waiters run only after the painted phase", () => {
  const harness = createHarness();
  const results = [];
  const token = harness.transaction.prepare({ layout: { bounds: { width: 3 } }, scale: { id: 3 } });
  harness.transaction.whenSettled((result) => results.push(result));

  harness.transaction.confirm(token, "prepared");
  assert.deepEqual(results, []);
  harness.transaction.confirm(token, "painted");
  assert.deepEqual(results, [{ completed: true, trigger: "renderer-painted", token }]);
});

test("paint timeout clears renderer pending state and releases the transaction", () => {
  const harness = createHarness();
  const token = harness.transaction.prepare({ layout: { bounds: { width: 4 } }, scale: { id: 4 } });
  harness.transaction.confirm(token, "prepared");

  [...harness.timers.values()][0]();

  assert.equal(harness.transaction.getPending(), null);
  assert.deepEqual(harness.cancels.at(-1), { token, scale: { id: 4 }, reason: "paint-timeout" });
  assert.equal(harness.settled.at(-1).trigger, "paint-timeout");
});

test("prepare timeout cancels without moving the native window", () => {
  const harness = createHarness();
  const token = harness.transaction.prepare({
    layout: { bounds: { x: 10, y: 20, width: 900, height: 180 } },
    scale: { id: 5 }
  });

  [...harness.timers.values()][0]();

  assert.deepEqual(harness.nativeCommits, []);
  assert.deepEqual(harness.rendererCommits, []);
  assert.deepEqual(harness.cancels.at(-1), { token, reason: "prepare-timeout" });
  assert.equal(harness.transaction.getPending(), null);
  assert.equal(harness.settled.at(-1).completed, false);
  assert.equal(harness.settled.at(-1).trigger, "prepare-timeout");
});

test("main routes both runway expansion and materialization through the layout transaction", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
  const applyStart = mainSource.indexOf("function applyTaskbarRunwayLayout(");
  const applyEnd = mainSource.indexOf("function getTaskbarRunwayVisualRect(", applyStart);
  const materializeStart = mainSource.indexOf("function materializeTaskbarWalkRunway(");
  const materializeEnd = mainSource.indexOf("function materializeTaskbarWalkRunwayForState(", materializeStart);
  const applyBody = mainSource.slice(applyStart, applyEnd);
  const materializeBody = mainSource.slice(materializeStart, materializeEnd);

  assert.doesNotThrow(() => new Function(mainSource));
  assert.match(applyBody, /preparePetWindowLayout\(/);
  assert.doesNotMatch(applyBody, /\.setBounds\(/);
  assert.match(materializeBody, /preparePetWindowLayout\(/);
  assert.doesNotMatch(materializeBody, /\.setBounds\(/);
  assert.match(mainSource, /sendScaleChanged:\s*sendPetScaleChanged/);
  assert.match(mainSource, /function sendPetScaleChanged\([^]*?petWindowLayoutTransaction\.getPending\(\)/);
  assert.match(mainSource, /rollbackState:\s*pendingRollbackState \|\| rollbackState \|\| capturePetWindowLayoutState\(\)/);
  assert.match(mainSource, /if \(!result\?\.completed\) \{\s*restorePetWindowLayoutState\(result\?\.layout\?\.rollbackState\)/);
});
