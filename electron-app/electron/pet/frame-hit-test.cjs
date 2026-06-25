// frame-hit-test.cjs：透明像素命中检测纯规则，不依赖 electron/fs/path/nativeImage/缓存/窗口/screen/IPC/bubble。
// 接收 point/spriteRect/pixelData/defaultFacing/direction/hitPadding/alphaThreshold 参数，做纯计算。

const { expandRect, isPointInsideRect, clamp } = require("../shared/bounds.cjs");

function isPointInsideVisiblePixels(point, spriteRect, pixelData, defaultFacing, direction, hitPadding, alphaThreshold) {
  if (!point || !spriteRect || !pixelData || !pixelData.bitmap) {
    return false;
  }

  const expandedRect = expandRect(spriteRect, hitPadding);
  if (!isPointInsideRect(point, expandedRect)) {
    return false;
  }

  const shouldMirror = defaultFacing === "left" ? direction > 0 : direction < 0;
  const localX = (point.x - spriteRect.x) / spriteRect.width;
  const localY = (point.y - spriteRect.y) / spriteRect.height;
  const imageX = clamp(
    Math.round((shouldMirror ? 1 - localX : localX) * (pixelData.width - 1)),
    0,
    pixelData.width - 1
  );
  const imageY = clamp(
    Math.round(localY * (pixelData.height - 1)),
    0,
    pixelData.height - 1
  );
  const pixelRadius = Math.max(0, Math.ceil((hitPadding / Math.max(1, spriteRect.width)) * pixelData.width));

  for (let y = Math.max(0, imageY - pixelRadius); y <= Math.min(pixelData.height - 1, imageY + pixelRadius); y += 1) {
    for (let x = Math.max(0, imageX - pixelRadius); x <= Math.min(pixelData.width - 1, imageX + pixelRadius); x += 1) {
      const alpha = pixelData.bitmap[(y * pixelData.width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        return true;
      }
    }
  }

  return false;
}

module.exports = {
  isPointInsideVisiblePixels
};
