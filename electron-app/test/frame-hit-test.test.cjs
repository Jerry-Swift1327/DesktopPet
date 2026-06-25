const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const frameHitTest = require("../electron/pet/frame-hit-test.cjs");

const { isPointInsideVisiblePixels } = frameHitTest;

const source = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "frame-hit-test.cjs"), "utf8");
// 剥离注释后再做 forbidden token 检查
const sourceCode = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

// 合成 bitmap 构造工具：BGRA 4 字节排布，alpha 在偏移 +3，其余默认 0
function createPixelData(width, height, pixels) {
  const bitmap = Buffer.alloc(width * height * 4, 0);
  for (const { x, y, alpha } of pixels) {
    bitmap[(y * width + x) * 4 + 3] = alpha;
  }
  return { bitmap, width, height };
}

const SPRITE_RECT = { x: 0, y: 0, width: 100, height: 100 };

// 结构断言
test("hit-test 不直接 require electron/fs/path", () => {
  assert.doesNotMatch(source, /require\("electron"/);
  assert.doesNotMatch(source, /require\("fs"/);
  assert.doesNotMatch(source, /require\("path"/);
});

test("hit-test 不引用 nativeImage/窗口/screen/缓存", () => {
  const forbidden = ["nativeImage", "petWindow", "menuWindow", "hoverWindow", "screen", "visibleBoundsCache", "headBoundsCache", "framePixelCache", "safeSend", "broadcastToWindows"];
  for (const pattern of forbidden) {
    assert.ok(!sourceCode.includes(pattern), `不应出现 ${pattern}`);
  }
});

test("hit-test 导出 isPointInsideVisiblePixels", () => {
  assert.match(source, /module\.exports = \{\s*isPointInsideVisiblePixels\s*\}/);
  assert.equal(typeof isPointInsideVisiblePixels, "function");
});

// 1. 命中可见像素
test("命中可见像素返回 true", () => {
  const pixelData = createPixelData(10, 10, [{ x: 5, y: 5, alpha: 255 }]);
  const result = isPointInsideVisiblePixels(
    { x: 50, y: 50 },
    SPRITE_RECT,
    pixelData,
    "right",
    1,
    0,
    12
  );
  assert.equal(result, true);
});

// 2. 透明区域不命中
test("落在透明像素上返回 false", () => {
  const pixelData = createPixelData(10, 10, []);
  const result = isPointInsideVisiblePixels(
    { x: 50, y: 50 },
    SPRITE_RECT,
    pixelData,
    "right",
    1,
    0,
    12
  );
  assert.equal(result, false);
});

// 3. 超出扩展 spriteRect 返回 false
test("point 超出扩展 spriteRect 返回 false", () => {
  const pixelData = createPixelData(10, 10, [{ x: 5, y: 5, alpha: 255 }]);
  const result = isPointInsideVisiblePixels(
    { x: 200, y: 200 },
    SPRITE_RECT,
    pixelData,
    "right",
    1,
    0,
    12
  );
  assert.equal(result, false);
});

// 4. 左右镜像
test("defaultFacing=left direction=1 时镜像后命中左半像素", () => {
  const pixelData = createPixelData(10, 10, [{ x: 2, y: 5, alpha: 255 }]);
  // point 落在右半边（localX=0.75），镜像后 imageX=2 命中
  const result = isPointInsideVisiblePixels(
    { x: 75, y: 50 },
    SPRITE_RECT,
    pixelData,
    "left",
    1,
    0,
    12
  );
  assert.equal(result, true);

  // 对照：同一点在非镜像下不会命中（imageX=round(0.75*9)=7，(7,5) 透明）
  const nonMirrorResult = isPointInsideVisiblePixels(
    { x: 75, y: 50 },
    SPRITE_RECT,
    pixelData,
    "right",
    1,
    0,
    12
  );
  assert.equal(nonMirrorResult, false);
});

// 5. hitPadding 半径扫描
test("中心像素透明但半径范围内有可见像素时命中", () => {
  // 像素放在 (6,5)，point 中心映射到 (5,5) 透明，半径=1 扫到 (6,5)
  const pixelData = createPixelData(10, 10, [{ x: 6, y: 5, alpha: 255 }]);
  const resultWithPadding = isPointInsideVisiblePixels(
    { x: 50, y: 50 },
    SPRITE_RECT,
    pixelData,
    "right",
    1,
    5,
    12
  );
  assert.equal(resultWithPadding, true);

  // 对照：hitPadding=0 时只扫中心 (5,5) 透明，不命中
  const resultWithoutPadding = isPointInsideVisiblePixels(
    { x: 50, y: 50 },
    SPRITE_RECT,
    pixelData,
    "right",
    1,
    0,
    12
  );
  assert.equal(resultWithoutPadding, false);
});

// 6. 边界 clamp
test("point 超出 spriteRect 但在 expandRect 内时 imageX/imageY 被 clamp 不越界", () => {
  // 像素在 (9,9)，point={108,108} 映射 imageX=10 被 clamp 到 9 命中
  const pixelData = createPixelData(10, 10, [{ x: 9, y: 9, alpha: 255 }]);
  const result = isPointInsideVisiblePixels(
    { x: 108, y: 108 },
    SPRITE_RECT,
    pixelData,
    "right",
    1,
    10,
    12
  );
  assert.equal(result, true);
});

// 7. alphaThreshold 边界
test("alpha=threshold(12) 不命中，alpha=threshold+1(13) 命中", () => {
  const atThreshold = createPixelData(10, 10, [{ x: 5, y: 5, alpha: 12 }]);
  const resultEqual = isPointInsideVisiblePixels(
    { x: 50, y: 50 },
    SPRITE_RECT,
    atThreshold,
    "right",
    1,
    0,
    12
  );
  assert.equal(resultEqual, false);

  const aboveThreshold = createPixelData(10, 10, [{ x: 5, y: 5, alpha: 13 }]);
  const resultAbove = isPointInsideVisiblePixels(
    { x: 50, y: 50 },
    SPRITE_RECT,
    aboveThreshold,
    "right",
    1,
    0,
    12
  );
  assert.equal(resultAbove, true);
});

// 8. 空输入返回 false
test("空输入返回 false", () => {
  const pixelData = createPixelData(10, 10, [{ x: 5, y: 5, alpha: 255 }]);
  assert.equal(isPointInsideVisiblePixels(null, SPRITE_RECT, pixelData, "right", 1, 0, 12), false);
  assert.equal(isPointInsideVisiblePixels({ x: 50, y: 50 }, null, pixelData, "right", 1, 0, 12), false);
  assert.equal(isPointInsideVisiblePixels({ x: 50, y: 50 }, SPRITE_RECT, null, "right", 1, 0, 12), false);
  assert.equal(isPointInsideVisiblePixels({ x: 50, y: 50 }, SPRITE_RECT, { bitmap: null, width: 10, height: 10 }, "right", 1, 0, 12), false);
});

// 9. 非镜像
test("defaultFacing=right direction=1 时非镜像，imageX 使用 localX", () => {
  // 像素在 (8,5)（右半边），point={85,50} 映射 imageX=8 命中
  const pixelData = createPixelData(10, 10, [{ x: 8, y: 5, alpha: 255 }]);
  const result = isPointInsideVisiblePixels(
    { x: 85, y: 50 },
    SPRITE_RECT,
    pixelData,
    "right",
    1,
    0,
    12
  );
  assert.equal(result, true);

  // 对照：左半对称点 (15,50) 映射 imageX=1，(1,5) 透明不命中
  const symmetricResult = isPointInsideVisiblePixels(
    { x: 15, y: 50 },
    SPRITE_RECT,
    pixelData,
    "right",
    1,
    0,
    12
  );
  assert.equal(symmetricResult, false);
});
