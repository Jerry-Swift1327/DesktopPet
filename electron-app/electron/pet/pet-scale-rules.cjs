// pet-scale-rules.cjs：pet scale 与 spriteSize 相关纯计算模块。
// 模块职责：将 main.cjs 中与缩放相关的纯计算抽离为独立、无副作用的函数集合。
// 不依赖 electron/fs/path/窗口/IPC/screen/bubble，所有依赖通过参数注入。
// 仅可 require ../shared/bounds.cjs 获取 clamp 函数（该文件不依赖 electron）。

const { clamp } = require("../shared/bounds.cjs");

// clampPetScale：缩放值规范化。NaN/null/undefined 视为 1，clamp 到 [min, max]，四舍五入到 2 位小数。
function clampPetScale(value, min, max) {
  return Math.round(clamp(Number(value) || 1, min, max) * 100) / 100;
}

// 缩放后的窗口/精灵尺寸：Math.round(base * scale)
function getPetWindowWidthFromScale(baseWindowWidth, scale) {
  return Math.round(baseWindowWidth * scale);
}
function getPetWindowHeightFromScale(baseWindowHeight, scale) {
  return Math.round(baseWindowHeight * scale);
}
function getPetSpriteSizeFromScale(baseSpriteSize, scale) {
  return Math.round(baseSpriteSize * scale);
}

// sprite 在窗口内的水平偏移：Math.max(0, Math.round((Math.round(windowWidth) - spriteSize) / 2))
function getSpriteLocalXForWindowWidthAndSpriteSize(windowWidth, spriteSize) {
  return Math.max(0, Math.round((Math.round(windowWidth) - spriteSize) / 2));
}

// overlay 碰撞 padding：Math.round(clamp(base * scale, min, max))
function getScaledOverlayCollisionPaddingFromScale(scale, base, min, max) {
  return Math.round(clamp(base * scale, min, max));
}

// hover body 命中 padding：Math.round(clamp(base * scale, min, max))
function getScaledHoverBodyHitPaddingFromScale(scale, base, min, max) {
  return Math.round(clamp(base * scale, min, max));
}

// hover avoid padding：Math.max(min, Math.round(spriteSize * scale))
function getScaledHoverAvoidPaddingFromSpriteSize(spriteSize, min, scale) {
  return Math.max(min, Math.round(spriteSize * scale));
}

// buildScaleSummaryFromState：组装缩放摘要返回对象（纯组装，不读运行态）。
function buildScaleSummaryFromState(value, min, max, step, windowWidth, windowHeight, spriteSize, spriteOffsetX, taskbarRunway) {
  return { value, min, max, step, windowWidth, windowHeight, spriteSize, spriteOffsetX, taskbarRunway };
}

module.exports = {
  clampPetScale,
  getPetWindowWidthFromScale,
  getPetWindowHeightFromScale,
  getPetSpriteSizeFromScale,
  getSpriteLocalXForWindowWidthAndSpriteSize,
  getScaledOverlayCollisionPaddingFromScale,
  getScaledHoverBodyHitPaddingFromScale,
  getScaledHoverAvoidPaddingFromSpriteSize,
  buildScaleSummaryFromState
};
