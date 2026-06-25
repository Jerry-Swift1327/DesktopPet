const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const frameVisibleBounds = require("../electron/pet/frame-visible-bounds.cjs");

const source = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "frame-visible-bounds.cjs"), "utf8");
// 剥离注释后再做字符串检查，避免首行文档性注释误触断言
const sourceCode = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

// 结构断言
test("frame-visible-bounds 不 require electron/fs/path", () => {
  assert.doesNotMatch(source, /require\("electron"/);
  assert.doesNotMatch(source, /require\("fs"/);
  assert.doesNotMatch(source, /require\("path"/);
});

test("frame-visible-bounds 不引用 nativeImage/窗口/缓存/IPC/bubble", () => {
  const forbidden = ["nativeImage", "petWindow", "menuWindow", "hoverWindow", "safeSend", "broadcastToWindows", "visibleBoundsCache", "headBoundsCache", "framePixelCache"];
  for (const token of forbidden) {
    assert.ok(!sourceCode.includes(token), `不应出现 ${token}`);
  }
});

test("frame-visible-bounds 导出 2 个函数", () => {
  assert.equal(typeof frameVisibleBounds.scanVisibleBoundsFromBitmap, "function");
  assert.equal(typeof frameVisibleBounds.scanHeadBoundsFromBitmap, "function");
});

// 合成 bitmap 辅助函数：BGRA 4 字节排布，alpha 在偏移 +3
function makeTransparentBitmap(width, height) {
  return Buffer.alloc(width * height * 4, 0);
}

function setAlpha(bitmap, width, x, y, alpha) {
  const offset = (y * width + x) * 4 + 3;
  bitmap[offset] = alpha;
}

// scanVisibleBoundsFromBitmap
test("scanVisibleBoundsFromBitmap 全透明 bitmap 返回整图 rect", () => {
  const bitmap = makeTransparentBitmap(4, 4);
  const result = frameVisibleBounds.scanVisibleBoundsFromBitmap(bitmap, 4, 4, 127);
  assert.deepEqual(result, {
    left: 0, top: 0, right: 3, bottom: 3, width: 4, height: 4, imageWidth: 4, imageHeight: 4
  });
});

test("scanVisibleBoundsFromBitmap 单区域不透明返回最小包围盒", () => {
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 2, 3, 255);
  setAlpha(bitmap, 10, 5, 6, 255);
  const result = frameVisibleBounds.scanVisibleBoundsFromBitmap(bitmap, 10, 10, 127);
  assert.deepEqual(result, {
    left: 2, top: 3, right: 5, bottom: 6, width: 4, height: 4, imageWidth: 10, imageHeight: 10
  });
});

test("scanVisibleBoundsFromBitmap 多区域不透明返回合并包围盒", () => {
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 1, 1, 255);
  setAlpha(bitmap, 10, 8, 8, 255);
  const result = frameVisibleBounds.scanVisibleBoundsFromBitmap(bitmap, 10, 10, 127);
  assert.deepEqual(result, {
    left: 1, top: 1, right: 8, bottom: 8, width: 8, height: 8, imageWidth: 10, imageHeight: 10
  });
});

test("scanVisibleBoundsFromBitmap alpha 阈值边界（>才计入，=不计入）", () => {
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 0, 0, 127);
  setAlpha(bitmap, 10, 1, 1, 128);
  const result = frameVisibleBounds.scanVisibleBoundsFromBitmap(bitmap, 10, 10, 127);
  assert.deepEqual(result, {
    left: 1, top: 1, right: 1, bottom: 1, width: 1, height: 1, imageWidth: 10, imageHeight: 10
  });
});

test("scanVisibleBoundsFromBitmap 单像素不透明", () => {
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 3, 4, 255);
  const result = frameVisibleBounds.scanVisibleBoundsFromBitmap(bitmap, 10, 10, 127);
  assert.deepEqual(result, {
    left: 3, top: 4, right: 3, bottom: 4, width: 1, height: 1, imageWidth: 10, imageHeight: 10
  });
});

// scanHeadBoundsFromBitmap
test("scanHeadBoundsFromBitmap 在 visibleBounds 范围内找到 head 像素", () => {
  // visibleHeight=max(1,7-2+1)=6, headScanRatio=0.5, scanBottom=min(7,2+round(6*0.5))=min(7,5)=5
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 3, 3, 255); // 在扫描范围内
  setAlpha(bitmap, 10, 6, 6, 255); // y=6 > scanBottom=5，不应被扫描
  const visibleBounds = { left: 2, top: 2, right: 7, bottom: 7 };
  const result = frameVisibleBounds.scanHeadBoundsFromBitmap(bitmap, 10, 10, visibleBounds, 127, 0.5);
  assert.deepEqual(result, {
    left: 3, top: 3, right: 3, bottom: 3, width: 1, height: 1, imageWidth: 10, imageHeight: 10
  });
});

test("scanHeadBoundsFromBitmap 范围内无像素返回传入的 visibleBounds（同一引用）", () => {
  const bitmap = makeTransparentBitmap(10, 10);
  const visibleBounds = { left: 2, top: 2, right: 7, bottom: 7 };
  const result = frameVisibleBounds.scanHeadBoundsFromBitmap(bitmap, 10, 10, visibleBounds, 127, 0.5);
  assert.equal(result, visibleBounds);
});

test("scanHeadBoundsFromBitmap headScanRatio 截断上界", () => {
  // visibleHeight=10, headScanRatio=0.3, scanBottom=min(9,0+round(10*0.3))=min(9,3)=3
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 5, 5, 255); // y=5 > 3，不应被扫描
  setAlpha(bitmap, 10, 2, 2, 255); // 在扫描范围内
  const visibleBounds = { left: 0, top: 0, right: 9, bottom: 9 };
  const result = frameVisibleBounds.scanHeadBoundsFromBitmap(bitmap, 10, 10, visibleBounds, 127, 0.3);
  assert.deepEqual(result, {
    left: 2, top: 2, right: 2, bottom: 2, width: 1, height: 1, imageWidth: 10, imageHeight: 10
  });
});

test("scanHeadBoundsFromBitmap headScanRatio 极小值（接近 0）", () => {
  // visibleHeight=10, headScanRatio=0.01, scanBottom=min(9,0+round(0.1))=min(9,0)=0
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 5, 0, 255); // 仅扫描第 0 行
  const visibleBounds = { left: 0, top: 0, right: 9, bottom: 9 };
  const result = frameVisibleBounds.scanHeadBoundsFromBitmap(bitmap, 10, 10, visibleBounds, 127, 0.01);
  assert.deepEqual(result, {
    left: 5, top: 0, right: 5, bottom: 0, width: 1, height: 1, imageWidth: 10, imageHeight: 10
  });
});

test("scanHeadBoundsFromBitmap headScanRatio >= 1 时扫描整个 visibleBounds 行范围", () => {
  // visibleHeight=10, headScanRatio=1.5, scanBottom=min(9,0+round(15))=min(9,15)=9
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 5, 9, 255); // 最底行
  const visibleBounds = { left: 0, top: 0, right: 9, bottom: 9 };
  const result = frameVisibleBounds.scanHeadBoundsFromBitmap(bitmap, 10, 10, visibleBounds, 127, 1.5);
  assert.deepEqual(result, {
    left: 5, top: 9, right: 5, bottom: 9, width: 1, height: 1, imageWidth: 10, imageHeight: 10
  });
});

test("scanHeadBoundsFromBitmap visibleHeight 退化为 1（top == bottom）", () => {
  // visibleHeight=max(1,5-5+1)=1, headScanRatio=0.5, scanBottom=min(5,5+round(0.5))=min(5,6)=5
  const bitmap = makeTransparentBitmap(10, 10);
  setAlpha(bitmap, 10, 3, 5, 255);
  const visibleBounds = { left: 0, top: 5, right: 9, bottom: 5 };
  const result = frameVisibleBounds.scanHeadBoundsFromBitmap(bitmap, 10, 10, visibleBounds, 127, 0.5);
  assert.deepEqual(result, {
    left: 3, top: 5, right: 3, bottom: 5, width: 1, height: 1, imageWidth: 10, imageHeight: 10
  });
});
