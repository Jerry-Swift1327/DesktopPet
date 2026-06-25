const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { createFrameBoundsController } = require("../electron/pet/frame-bounds-controller.cjs");
// 直接 require 真实模块，使测试覆盖更接近生产行为
const frameGeometry = require("../electron/pet/frame-geometry.cjs");
const frameVisibleBounds = require("../electron/pet/frame-visible-bounds.cjs");

const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "frame-bounds-controller.cjs"), "utf8");
// 剥离注释后再做 forbidden token 检查，避免顶部文档性注释（含 "nativeImage" 等）误触断言
const sourceCode = controllerSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

// ---- mock 工厂 ----

// 合成 BGRA bitmap 辅助函数：alpha 在偏移 +3
function makeTransparentBitmap(width, height) {
  return Buffer.alloc(width * height * 4, 0);
}

function setAlpha(bitmap, width, x, y, alpha) {
  const offset = (y * width + x) * 4 + 3;
  bitmap[offset] = alpha;
}

// scenarios: { [filePath]: { width, height, bitmap } }
function createMockNativeImage(scenarios) {
  const calls = { createFromPath: 0 };
  return {
    calls,
    createFromPath: (filePath) => {
      calls.createFromPath += 1;
      const scenario = scenarios[filePath];
      if (!scenario) {
        return { getSize: () => ({ width: 0, height: 0 }), toBitmap: () => Buffer.alloc(0) };
      }
      return {
        getSize: () => ({ width: scenario.width, height: scenario.height }),
        toBitmap: () => scenario.bitmap
      };
    }
  };
}

// states: { [stateId]: { id, folder, moving, defaultFacing } }
function createMockGetState(states) {
  return (stateId) => states[stateId] || null;
}

// folders: { [folder]: [filePath1, filePath2, ...] }
function createMockListFramePaths(folders) {
  return (folder) => folders[folder] || [];
}

// 每个测试构造全新 controller，避免缓存键（state:xx / head:xx）跨用例污染
function makeController({ scenarios = {}, states = {}, folders = {}, spriteSize = 128 } = {}) {
  const nativeImage = createMockNativeImage(scenarios);
  const getState = createMockGetState(states);
  const listFramePaths = createMockListFramePaths(folders);
  const getPetSpriteSize = () => spriteSize;
  const controller = createFrameBoundsController({
    nativeImage,
    getState,
    listFramePaths,
    getPetSpriteSize,
    VISIBLE_ALPHA_THRESHOLD: 127,
    PET_MENU_HEAD_SCAN_RATIO: 0.5,
    frameGeometry,
    frameVisibleBounds
  });
  return { controller, nativeImage };
}

// ---- 结构断言 ----

test("controller 不直接 require electron/fs/path", () => {
  assert.doesNotMatch(controllerSource, /require\("electron"/);
  assert.doesNotMatch(controllerSource, /require\("fs"/);
  assert.doesNotMatch(controllerSource, /require\("path"/);
});

test("controller 不直接访问窗口/IPC/bubble", () => {
  const forbidden = ["petWindow", "menuWindow", "hoverWindow", "safeSend", "broadcastToWindows", "showBubbleMessage"];
  for (const pattern of forbidden) {
    assert.ok(!sourceCode.includes(pattern), `不应出现 ${pattern}`);
  }
});

test("controller 声明三个缓存 Map", () => {
  assert.match(controllerSource, /const visibleBoundsCache = new Map\(\);/);
  assert.match(controllerSource, /const headBoundsCache = new Map\(\);/);
  assert.match(controllerSource, /const framePixelCache = new Map\(\);/);
});

test("controller 导出 createFrameBoundsController", () => {
  assert.match(controllerSource, /module\.exports = \{\s*createFrameBoundsController\s*\}/);
});

// ---- getFrameVisibleBounds ----

test("getFrameVisibleBounds 缓存命中：第二次不触发 nativeImage", () => {
  const filePath = "/img/frame-01.png";
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 3, 4, 255);
  const { controller, nativeImage } = makeController({
    scenarios: { [filePath]: { width: 10, height: 10, bitmap } }
  });

  const first = controller.getFrameVisibleBounds(filePath);
  const second = controller.getFrameVisibleBounds(filePath);
  assert.equal(nativeImage.calls.createFromPath, 1, "createFromPath 应只被调用一次");
  assert.equal(second, first, "缓存命中应返回同一引用");
});

test("getFrameVisibleBounds 无效图片返回 fallback", () => {
  const filePath = "/img/empty.png";
  const { controller } = makeController({
    scenarios: { [filePath]: { width: 0, height: 0, bitmap: Buffer.alloc(0) } }
  });
  assert.deepEqual(controller.getFrameVisibleBounds(filePath), {
    left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1, imageWidth: 1, imageHeight: 1
  });
});

test("getFrameVisibleBounds 正常图片委托 scanVisibleBoundsFromBitmap", () => {
  const filePath = "/img/frame-02.png";
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 3, 4, 255);
  const { controller } = makeController({
    scenarios: { [filePath]: { width: 10, height: 10, bitmap } }
  });
  assert.deepEqual(controller.getFrameVisibleBounds(filePath), {
    left: 3, top: 4, right: 3, bottom: 4, width: 1, height: 1, imageWidth: 10, imageHeight: 10
  });
});

// ---- getFramePixelData ----

test("getFramePixelData 缓存命中：第二次不触发 createFromPath", () => {
  const filePath = "/img/pixel-01.png";
  const bitmap = makeTransparentBitmap(8, 8);
  const { controller, nativeImage } = makeController({
    scenarios: { [filePath]: { width: 8, height: 8, bitmap } }
  });

  const first = controller.getFramePixelData(filePath);
  const second = controller.getFramePixelData(filePath);
  assert.equal(nativeImage.calls.createFromPath, 1, "createFromPath 应只被调用一次");
  assert.equal(second, first, "缓存命中应返回同一引用");
});

test("getFramePixelData 无效图片返回 null", () => {
  const filePath = "/img/pixel-empty.png";
  const { controller } = makeController({
    scenarios: { [filePath]: { width: 0, height: 0, bitmap: Buffer.alloc(0) } }
  });
  assert.equal(controller.getFramePixelData(filePath), null);
});

test("getFramePixelData 正常图片返回 {bitmap, width, height}", () => {
  const filePath = "/img/pixel-02.png";
  const bitmap = makeTransparentBitmap(12, 16);
  const { controller } = makeController({
    scenarios: { [filePath]: { width: 12, height: 16, bitmap } }
  });
  const data = controller.getFramePixelData(filePath);
  assert.equal(data.width, 12);
  assert.equal(data.height, 16);
  assert.equal(data.bitmap, bitmap, "bitmap 应为 toBitmap 返回的同一 buffer");
});

// ---- getFrameHeadBounds ----

test("getFrameHeadBounds 缓存命中", () => {
  const filePath = "/img/head-01.png";
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 4, 4, 255);
  const { controller, nativeImage } = makeController({
    scenarios: { [filePath]: { width: 10, height: 10, bitmap } }
  });

  const first = controller.getFrameHeadBounds(filePath);
  const second = controller.getFrameHeadBounds(filePath);
  // 首次：getFrameVisibleBounds 触发 1 次 + getFrameHeadBounds 自身触发 1 次 = 2 次
  assert.equal(nativeImage.calls.createFromPath, 2, "首次应触发 2 次 createFromPath");
  assert.equal(second, first, "缓存命中应返回同一引用");
  // 再次确认缓存命中后不再增长
  controller.getFrameHeadBounds(filePath);
  assert.equal(nativeImage.calls.createFromPath, 2, "缓存命中不应再触发 createFromPath");
});

test("getFrameHeadBounds 无效图片 fallback 返回 visibleBounds", () => {
  const filePath = "/img/head-empty.png";
  const { controller } = makeController({
    scenarios: { [filePath]: { width: 0, height: 0, bitmap: Buffer.alloc(0) } }
  });
  const result = controller.getFrameHeadBounds(filePath);
  // visibleBounds fallback 为 {0,0,1,1,...}，head 也缓存为同一对象
  assert.deepEqual(result, {
    left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1, imageWidth: 1, imageHeight: 1
  });
});

test("getFrameHeadBounds 正常图片委托 scanHeadBoundsFromBitmap", () => {
  const filePath = "/img/head-02.png";
  // visibleBounds = {left:3,top:3,right:8,bottom:8}；visibleHeight=6，scanBottom=min(8,3+round(3))=6
  // 扫描 y=3..6，仅 (3,3) 在范围内，(8,8) 的 y=8>6 不被扫描
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 3, 3, 255);
  setAlpha(bitmap, 10, 8, 8, 255);
  const { controller } = makeController({
    scenarios: { [filePath]: { width: 10, height: 10, bitmap } }
  });
  assert.deepEqual(controller.getFrameHeadBounds(filePath), {
    left: 3, top: 3, right: 3, bottom: 3, width: 1, height: 1, imageWidth: 10, imageHeight: 10
  });
});

// ---- getStateVisibleBounds ----

test("getStateVisibleBounds 多帧合并 left/top/right/bottom 正确", () => {
  const frame1 = "/img/state2-1.png";
  const frame2 = "/img/state2-2.png";
  const b1 = makeTransparentBitmap(10, 10);
  setAlpha(b1, 10, 1, 2, 255);
  const b2 = makeTransparentBitmap(10, 10);
  setAlpha(b2, 10, 6, 7, 255);
  const { controller } = makeController({
    scenarios: {
      [frame1]: { width: 10, height: 10, bitmap: b1 },
      [frame2]: { width: 10, height: 10, bitmap: b2 }
    },
    states: { walk: { id: "walk", folder: "walk-frames", moving: false, defaultFacing: "right" } },
    folders: { "walk-frames": [frame1, frame2] }
  });
  assert.deepEqual(controller.getStateVisibleBounds("walk"), {
    left: 1, top: 2, right: 6, bottom: 7, width: 6, height: 6, imageWidth: 10, imageHeight: 10
  });
});

test("getStateVisibleBounds moving=true 且帧数>2 修正 bottom", () => {
  // 三帧 bottom 分别为 0/1/9；sorted=[0,1,9]，index=min(2,floor(2*0.9))=1，stableBottom=1
  // combined.bottom=max(0,min(9,1))=1，height=1-0+1=2
  const fA = "/img/mv-A.png";
  const fB = "/img/mv-B.png";
  const fC = "/img/mv-C.png";
  const bA = makeTransparentBitmap(10, 10);
  setAlpha(bA, 10, 5, 0, 255);
  const bB = makeTransparentBitmap(10, 10);
  setAlpha(bB, 10, 5, 1, 255);
  const bC = makeTransparentBitmap(10, 10);
  setAlpha(bC, 10, 5, 9, 255);
  const { controller } = makeController({
    scenarios: {
      [fA]: { width: 10, height: 10, bitmap: bA },
      [fB]: { width: 10, height: 10, bitmap: bB },
      [fC]: { width: 10, height: 10, bitmap: bC }
    },
    states: { run: { id: "run", folder: "run-frames", moving: true, defaultFacing: "right" } },
    folders: { "run-frames": [fA, fB, fC] }
  });
  const combined = controller.getStateVisibleBounds("run");
  assert.equal(combined.bottom, 1, "bottom 应被 stableGroundBottom 修正为 1");
  assert.equal(combined.height, 2);
});

test("getStateVisibleBounds moving=false 不修正", () => {
  const fA = "/img/nm-A.png";
  const fB = "/img/nm-B.png";
  const fC = "/img/nm-C.png";
  const bA = makeTransparentBitmap(10, 10);
  setAlpha(bA, 10, 5, 0, 255);
  const bB = makeTransparentBitmap(10, 10);
  setAlpha(bB, 10, 5, 1, 255);
  const bC = makeTransparentBitmap(10, 10);
  setAlpha(bC, 10, 5, 9, 255);
  const { controller } = makeController({
    scenarios: {
      [fA]: { width: 10, height: 10, bitmap: bA },
      [fB]: { width: 10, height: 10, bitmap: bB },
      [fC]: { width: 10, height: 10, bitmap: bC }
    },
    states: { idle: { id: "idle", folder: "idle-frames", moving: false, defaultFacing: "right" } },
    folders: { "idle-frames": [fA, fB, fC] }
  });
  const combined = controller.getStateVisibleBounds("idle");
  assert.equal(combined.bottom, 9, "moving=false 不应修正 bottom");
  assert.equal(combined.height, 10);
});

test("getStateVisibleBounds 无帧 fallback spriteSize 兜底", () => {
  const { controller } = makeController({
    states: { empty: { id: "empty", folder: "empty-frames", moving: false, defaultFacing: "right" } },
    folders: { "empty-frames": [] },
    spriteSize: 128
  });
  assert.deepEqual(controller.getStateVisibleBounds("empty"), {
    left: 0, top: 0, right: 127, bottom: 127, width: 128, height: 128, imageWidth: 128, imageHeight: 128
  });
});

test("getStateVisibleBounds state 不存在返回 null", () => {
  const { controller } = makeController({});
  assert.equal(controller.getStateVisibleBounds("missing"), null);
});

// ---- getStateHeadBounds ----

test("getStateHeadBounds 多帧合并", () => {
  const frame1 = "/img/head-state-1.png";
  const frame2 = "/img/head-state-2.png";
  // frame1: visible={3,3,8,8}, head scan 仅 (3,3) -> {3,3,3,3}
  const b1 = makeTransparentBitmap(10, 10);
  setAlpha(b1, 10, 3, 3, 255);
  setAlpha(b1, 10, 8, 8, 255);
  // frame2: visible={4,4,9,9}, head scan 仅 (4,4) -> {4,4,4,4}
  const b2 = makeTransparentBitmap(10, 10);
  setAlpha(b2, 10, 4, 4, 255);
  setAlpha(b2, 10, 9, 9, 255);
  const { controller } = makeController({
    scenarios: {
      [frame1]: { width: 10, height: 10, bitmap: b1 },
      [frame2]: { width: 10, height: 10, bitmap: b2 }
    },
    states: { eat: { id: "eat", folder: "eat-frames", moving: false, defaultFacing: "right" } },
    folders: { "eat-frames": [frame1, frame2] }
  });
  assert.deepEqual(controller.getStateHeadBounds("eat"), {
    left: 3, top: 3, right: 4, bottom: 4, width: 2, height: 2, imageWidth: 10, imageHeight: 10
  });
});

test("getStateHeadBounds 无帧 fallback getStateVisibleBounds", () => {
  const { controller } = makeController({
    states: { empty: { id: "empty", folder: "empty-frames", moving: false, defaultFacing: "right" } },
    folders: { "empty-frames": [] },
    spriteSize: 64
  });
  // frameBounds 为空 -> combine 返回 null -> 回退 getStateVisibleBounds -> spriteSize 兜底
  assert.deepEqual(controller.getStateHeadBounds("empty"), {
    left: 0, top: 0, right: 63, bottom: 63, width: 64, height: 64, imageWidth: 64, imageHeight: 64
  });
});

test("getStateHeadBounds state 不存在 fallback getStateVisibleBounds", () => {
  const { controller } = makeController({});
  // state 不存在 -> getStateHeadBounds 回退 getStateVisibleBounds，后者同样返回 null
  assert.equal(controller.getStateHeadBounds("missing"), null);
});
