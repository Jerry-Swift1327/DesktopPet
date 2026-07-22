const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const helperPath = path.join(__dirname, "..", "static", "renderer", "pet-frame-cache.js");
const petWindowPath = path.join(__dirname, "..", "static", "renderer", "pet-window.js");
const indexPath = path.join(__dirname, "..", "static", "index.html");

class FakeImage {
  static loads = new Map();
  static created = [];

  constructor() {
    this.decodeCalls = 0;
    this.onload = null;
    this.onerror = null;
    this._src = "";
    FakeImage.created.push(this);
  }

  set src(value) {
    this._src = value;
    const behavior = FakeImage.loads.get(value) || "load";
    queueMicrotask(() => {
      if (behavior === "error") {
        this.onerror?.(new Error("failed"));
      } else {
        this.onload?.();
      }
    });
  }

  get src() {
    return this._src;
  }

  decode() {
    this.decodeCalls += 1;
    return Promise.resolve();
  }
}

function resetFakeImage() {
  FakeImage.loads = new Map();
  FakeImage.created = [];
}

test("frame cache keeps one Image per frame and reuses the decode promise", async () => {
  resetFakeImage();
  const { createPetFrameCache } = require(helperPath);
  const cache = createPetFrameCache({ ImageCtor: FakeImage });

  const first = cache.ensureFrameReady("file:///pet/frame_000.png");
  const second = cache.ensureFrameReady("file:///pet/frame_000.png");
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(FakeImage.created.length, 1);
  assert.equal(FakeImage.created[0].decodeCalls, 1);
  assert.equal(firstResult.ready, true);
  assert.equal(secondResult.ready, true);
  assert.equal(cache.isFrameReady("file:///pet/frame_000.png"), true);
});

test("frame cache resolves failed frames without throwing and keeps the failure cached", async () => {
  resetFakeImage();
  FakeImage.loads.set("file:///pet/missing.png", "error");
  const { createPetFrameCache } = require(helperPath);
  const cache = createPetFrameCache({ ImageCtor: FakeImage });

  const result = await cache.ensureFrameReady("file:///pet/missing.png");
  const second = await cache.ensureFrameReady("file:///pet/missing.png");

  assert.equal(result.ready, false);
  assert.equal(result.failed, true);
  assert.equal(second.failed, true);
  assert.equal(FakeImage.created.length, 1);
  assert.equal(cache.getFrameStatus("file:///pet/missing.png"), "failed");
});

test("buildResponsiveScaleLayout expresses pet geometry as viewport-synchronized percentages", () => {
  const { buildResponsiveScaleLayout } = require(helperPath);

  const current = {
    value: 1,
    min: 0.75,
    max: 1.16,
    step: 0.08,
    windowWidth: 180,
    windowHeight: 180,
    spriteSize: 128,
    spriteOffsetX: 26,
    taskbarRunway: false
  };

  assert.deepEqual(buildResponsiveScaleLayout(current), {
    appWidth: "100%",
    appHeight: "100%",
    hostLeft: "14.444444%",
    hostWidth: "71.111111%",
    hostHeight: "71.111111%",
    imageWidth: "100%",
    imageHeight: "100%"
  });
});

test("renderer wires the frame cache before pet-window, gates state changes, and does not predict wheel scale locally", () => {
  const indexSource = fs.readFileSync(indexPath, "utf8");
  const petWindowSource = fs.readFileSync(petWindowPath, "utf8");

  assert.ok(indexSource.indexOf("./renderer/pet-frame-cache.js") > -1);
  assert.ok(indexSource.indexOf("./renderer/pet-frame-cache.js") < indexSource.indexOf("./renderer/pet-window.js"));
  assert.match(petWindowSource, /createPetFrameCache/);
  assert.match(petWindowSource, /ensureFrameReady/);
  assert.match(petWindowSource, /commitStateChange/);
  assert.match(petWindowSource, /renderFrame\(\{ waitForPaint: true \}\)/);
  assert.match(petWindowSource, /statePaintReady = false/);
  assert.match(petWindowSource, /!isDragging && !isInteractionPaused && statePaintReady/);
  assert.match(petWindowSource, /window\.addEventListener\("resize", applyPendingRunwayLayout\)/);
  assert.match(petWindowSource, /confirmRunwayLayout\(token, "prepared"\)/);
  assert.match(petWindowSource, /confirmRunwayLayout\(token, "painted"\)/);
  assert.match(petWindowSource, /window\.requestAnimationFrame\(\(\) => \{\s*window\.requestAnimationFrame/);

  const prepareStart = petWindowSource.indexOf("function prepareRunwayLayoutPaint()");
  const prepareEnd = petWindowSource.indexOf("function applyPendingRunwayLayout()", prepareStart);
  const prepareBody = petWindowSource.slice(prepareStart, prepareEnd);
  assert.ok(prepareStart >= 0);
  assert.match(prepareBody, /window\.requestAnimationFrame\(\(\) => \{\s*window\.requestAnimationFrame/);
  assert.ok(prepareBody.indexOf("window.requestAnimationFrame") < prepareBody.indexOf('confirmRunwayLayout(token, "prepared")'));

  const prepareListenerStart = petWindowSource.indexOf("window.desktopPet.onRunwayLayoutPrepare");
  const commitListenerStart = petWindowSource.indexOf("window.desktopPet.onRunwayLayoutCommit", prepareListenerStart);
  const prepareListenerBody = petWindowSource.slice(prepareListenerStart, commitListenerStart);
  assert.ok(prepareListenerBody.indexOf("setRunwayLayoutSpriteHidden(true)") < prepareListenerBody.indexOf("prepareRunwayLayoutPaint()"));

  const applyStart = petWindowSource.indexOf("function applyPendingRunwayLayout()");
  const applyEnd = petWindowSource.indexOf('window.addEventListener("resize"', applyStart);
  const applyBody = petWindowSource.slice(applyStart, applyEnd);
  assert.ok(applyBody.indexOf("applyScale(pending.scale)") < applyBody.indexOf("setRunwayLayoutSpriteHidden(false)"));
  assert.ok(applyBody.indexOf("setRunwayLayoutSpriteHidden(false)") < applyBody.indexOf('confirmRunwayLayout(token, "painted")'));
  assert.doesNotMatch(petWindowSource, /predictScaleSummary/);
  assert.doesNotMatch(petWindowSource, /applyScale\(predictedScale\)/);
});

test("renderer commits moving walk frames only after advanceWalkStep resolves", () => {
  const petWindowSource = fs.readFileSync(petWindowPath, "utf8");
  const nextFrameStepIndex = petWindowSource.indexOf("const nextFrameStep = frameStep + 1;");
  const requestIndex = petWindowSource.indexOf("requestWalkStep(nextFrameStep, elapsedMs)");
  const commitIndex = petWindowSource.indexOf("frameStep = nextFrameStep;");

  assert.ok(nextFrameStepIndex >= 0);
  assert.ok(requestIndex > nextFrameStepIndex);
  assert.ok(commitIndex > requestIndex);
  assert.match(
    petWindowSource,
    /if \(!walkStepInFlight\) \{\s*walkStepInFlight = true;\s*const nextFrameStep = frameStep \+ 1;/
  );
  assert.doesNotMatch(
    petWindowSource,
    /frameStep \+= 1;\s*renderFrame\(\);\s*\}\s*if \(!walkStepInFlight\)/
  );
});
