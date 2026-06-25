// frame-visible-bounds.cjs：帧可见区域 bitmap 扫描纯规则模块，不依赖 electron/fs/path/nativeImage/缓存/窗口/IPC/bubble。
// 只接受 bitmap（Buffer/Uint8Array，BGRA 4 字节排布）+ width/height + 阈值参数，做纯扫描计算。

function scanVisibleBoundsFromBitmap(bitmap, width, height, alphaThreshold) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = bitmap[(y * width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  return right >= left && bottom >= top
    ? { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1, imageWidth: width, imageHeight: height }
    : { left: 0, top: 0, right: width - 1, bottom: height - 1, width: width, height: height, imageWidth: width, imageHeight: height };
}

function scanHeadBoundsFromBitmap(bitmap, width, height, visibleBounds, alphaThreshold, headScanRatio) {
  const visibleHeight = Math.max(1, visibleBounds.bottom - visibleBounds.top + 1);
  const scanBottom = Math.min(
    visibleBounds.bottom,
    visibleBounds.top + Math.round(visibleHeight * headScanRatio)
  );
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = visibleBounds.top; y <= scanBottom; y += 1) {
    for (let x = visibleBounds.left; x <= visibleBounds.right; x += 1) {
      const alpha = bitmap[(y * width + x) * 4 + 3];
      if (alpha > alphaThreshold) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  return right >= left && bottom >= top
    ? { left, top, right, bottom, width: right - left + 1, height: bottom - top + 1, imageWidth: width, imageHeight: height }
    : visibleBounds;
}

module.exports = {
  scanVisibleBoundsFromBitmap,
  scanHeadBoundsFromBitmap
};
