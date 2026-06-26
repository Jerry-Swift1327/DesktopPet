const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const petScaleRules = require("../electron/pet/pet-scale-rules.cjs");

const source = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "pet-scale-rules.cjs"), "utf8");
// 剥离注释后再做字符串检查，避免顶部文档性注释（含 "screen" 等）误触断言
const sourceCode = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

// 结构断言
test("pet-scale-rules 不 require electron/fs/path（允许 require ../shared/bounds.cjs）", () => {
  assert.doesNotMatch(source, /require\("electron"/);
  assert.doesNotMatch(source, /require\("fs"/);
  assert.doesNotMatch(source, /require\("path"/);
});

test("pet-scale-rules 不引用 nativeImage/窗口/IPC/screen/safeSend/运行态变量", () => {
  const forbidden = ["nativeImage", "petWindow", "menuWindow", "hoverWindow", "screen", "safeSend", "broadcastToWindows", "petScale", "preferredPetScale", "activeState", "walkDirection"];
  for (const token of forbidden) {
    assert.ok(!sourceCode.includes(token), `不应出现 ${token}`);
  }
});

test("pet-scale-rules 导出 8 个函数", () => {
  const expected = ["clampPetScale", "getPetWindowWidthFromScale", "getPetWindowHeightFromScale", "getPetSpriteSizeFromScale", "getSpriteLocalXForWindowWidthAndSpriteSize", "getScaledOverlayCollisionPaddingFromScale", "getScaledHoverBodyHitPaddingFromScale", "getScaledHoverAvoidPaddingFromSpriteSize"];
  assert.equal(Object.keys(petScaleRules).length, 8);
  for (const fn of expected) {
    assert.equal(typeof petScaleRules[fn], "function", `应导出 ${fn}`);
  }
});

// clampPetScale
test("clampPetScale NaN 返回 1", () => {
  assert.equal(petScaleRules.clampPetScale(NaN, 0.5, 3), 1);
});
test("clampPetScale null 返回 1", () => {
  assert.equal(petScaleRules.clampPetScale(null, 0.5, 3), 1);
});
test("clampPetScale undefined 返回 1", () => {
  assert.equal(petScaleRules.clampPetScale(undefined, 0.5, 3), 1);
});
test("clampPetScale 低于 min 返回 min", () => {
  assert.equal(petScaleRules.clampPetScale(0.1, 0.5, 3), 0.5);
});
test("clampPetScale 高于 max 返回 max", () => {
  assert.equal(petScaleRules.clampPetScale(5, 0.5, 3), 3);
});
test("clampPetScale 正常值四舍五入到 2 位小数", () => {
  assert.equal(petScaleRules.clampPetScale(1.234, 0.5, 3), 1.23);
  assert.equal(petScaleRules.clampPetScale(1.235, 0.5, 3), 1.24);
});
test("clampPetScale 边界值", () => {
  assert.equal(petScaleRules.clampPetScale(0.5, 0.5, 3), 0.5);
  assert.equal(petScaleRules.clampPetScale(3, 0.5, 3), 3);
});

// getPetWindowWidthFromScale / getPetWindowHeightFromScale / getPetSpriteSizeFromScale
test("getPetWindowWidthFromScale scale=1 返回 base", () => {
  assert.equal(petScaleRules.getPetWindowWidthFromScale(200, 1), 200);
});
test("getPetWindowWidthFromScale scale=1.5 返回 Math.round(base*1.5)", () => {
  assert.equal(petScaleRules.getPetWindowWidthFromScale(200, 1.5), 300);
});
test("getPetWindowHeightFromScale scale=1.5 返回 Math.round(base*1.5)", () => {
  assert.equal(petScaleRules.getPetWindowHeightFromScale(200, 1.5), 300);
});
test("getPetSpriteSizeFromScale scale=0 返回 0", () => {
  assert.equal(petScaleRules.getPetSpriteSizeFromScale(128, 0), 0);
});
test("getPetSpriteSizeFromScale 浮点四舍五入", () => {
  // 注意：100*1.255 受浮点精度影响为 125.49999999999999，Math.round 得 125（不是 126）
  assert.equal(petScaleRules.getPetSpriteSizeFromScale(100, 1.255), 125);
});

// getSpriteLocalXForWindowWidthAndSpriteSize
test("getSpriteLocalXForWindowWidthAndSpriteSize windowWidth < spriteSize 返回 0", () => {
  assert.equal(petScaleRules.getSpriteLocalXForWindowWidthAndSpriteSize(100, 200), 0);
});
test("getSpriteLocalXForWindowWidthAndSpriteSize windowWidth = spriteSize 返回 0", () => {
  assert.equal(petScaleRules.getSpriteLocalXForWindowWidthAndSpriteSize(200, 200), 0);
});
test("getSpriteLocalXForWindowWidthAndSpriteSize windowWidth > spriteSize 返回居中偏移", () => {
  assert.equal(petScaleRules.getSpriteLocalXForWindowWidthAndSpriteSize(300, 200), 50);
});
test("getSpriteLocalXForWindowWidthAndSpriteSize 浮点 windowWidth 先 Math.round 再计算", () => {
  // 注意：Math.round(300.7)=301，(301-200)/2=50.5，Math.round(50.5)=51（不是 50）
  assert.equal(petScaleRules.getSpriteLocalXForWindowWidthAndSpriteSize(300.7, 200), 51);
});

// getScaledOverlayCollisionPaddingFromScale / getScaledHoverBodyHitPaddingFromScale
test("getScaledOverlayCollisionPaddingFromScale 常规值", () => {
  assert.equal(petScaleRules.getScaledOverlayCollisionPaddingFromScale(1, 20, 5, 60), 20);
});
test("getScaledOverlayCollisionPaddingFromScale scale 放大后 clamp 到 max", () => {
  assert.equal(petScaleRules.getScaledOverlayCollisionPaddingFromScale(3, 20, 5, 60), 60);
});
test("getScaledOverlayCollisionPaddingFromScale scale 缩小后 clamp 到 min", () => {
  assert.equal(petScaleRules.getScaledOverlayCollisionPaddingFromScale(0.1, 20, 5, 60), 5);
});
test("getScaledOverlayCollisionPaddingFromScale 浮点四舍五入", () => {
  // 7*1.5=10.5（精确），clamp(10.5,5,60)=10.5，Math.round(10.5)=11
  assert.equal(petScaleRules.getScaledOverlayCollisionPaddingFromScale(1.5, 7, 5, 60), 11);
});
test("getScaledHoverBodyHitPaddingFromScale 常规值", () => {
  assert.equal(petScaleRules.getScaledHoverBodyHitPaddingFromScale(1, 20, 5, 60), 20);
});
test("getScaledHoverBodyHitPaddingFromScale scale 放大后 clamp 到 max", () => {
  assert.equal(petScaleRules.getScaledHoverBodyHitPaddingFromScale(3, 20, 5, 60), 60);
});
test("getScaledHoverBodyHitPaddingFromScale scale 缩小后 clamp 到 min", () => {
  assert.equal(petScaleRules.getScaledHoverBodyHitPaddingFromScale(0.1, 20, 5, 60), 5);
});
test("getScaledHoverBodyHitPaddingFromScale 浮点四舍五入", () => {
  // 7*1.5=10.5（精确），Math.round(10.5)=11
  assert.equal(petScaleRules.getScaledHoverBodyHitPaddingFromScale(1.5, 7, 5, 60), 11);
});

// getScaledHoverAvoidPaddingFromSpriteSize
test("getScaledHoverAvoidPaddingFromSpriteSize 常规值", () => {
  assert.equal(petScaleRules.getScaledHoverAvoidPaddingFromSpriteSize(200, 10, 0.1), 20);
});
test("getScaledHoverAvoidPaddingFromSpriteSize min 兜底", () => {
  assert.equal(petScaleRules.getScaledHoverAvoidPaddingFromSpriteSize(50, 10, 0.1), 10);
});
test("getScaledHoverAvoidPaddingFromSpriteSize scale=1 返回 spriteSize", () => {
  assert.equal(petScaleRules.getScaledHoverAvoidPaddingFromSpriteSize(200, 10, 1), 200);
});
