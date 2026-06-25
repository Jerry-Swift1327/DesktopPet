// frame-bounds-controller.cjs：帧缓存与读图控制器，持有 visible/head/pixel 缓存与 nativeImage 读图边界。
// 通过 context 注入 nativeImage/getState/listFramePaths/getPetSpriteSize/常量/frameGeometry/frameVisibleBounds，
// 不直接接触窗口/IPC/bubble。main.cjs 保留同名薄包装委托。

function createFrameBoundsController(context) {
  const {
    nativeImage,
    getState,
    listFramePaths,
    getPetSpriteSize,
    VISIBLE_ALPHA_THRESHOLD,
    PET_MENU_HEAD_SCAN_RATIO,
    frameGeometry,
    frameVisibleBounds
  } = context;

  const visibleBoundsCache = new Map();
  const headBoundsCache = new Map();
  const framePixelCache = new Map();

  function getFrameVisibleBounds(filePath) {
    if (visibleBoundsCache.has(filePath)) {
      return visibleBoundsCache.get(filePath);
    }

    const image = nativeImage.createFromPath(filePath);
    const size = image.getSize();
    if (!size.width || !size.height) {
      const fallback = { left: 0, top: 0, right: 1, bottom: 1, width: 1, height: 1, imageWidth: 1, imageHeight: 1 };
      visibleBoundsCache.set(filePath, fallback);
      return fallback;
    }

    const bitmap = image.toBitmap();
    const bounds = frameVisibleBounds.scanVisibleBoundsFromBitmap(bitmap, size.width, size.height, VISIBLE_ALPHA_THRESHOLD);
    visibleBoundsCache.set(filePath, bounds);
    return bounds;
  }

  function getFramePixelData(filePath) {
    if (framePixelCache.has(filePath)) {
      return framePixelCache.get(filePath);
    }

    const image = nativeImage.createFromPath(filePath);
    const size = image.getSize();
    if (!size.width || !size.height) {
      return null;
    }

    const data = {
      bitmap: image.toBitmap(),
      width: size.width,
      height: size.height
    };
    framePixelCache.set(filePath, data);
    return data;
  }

  function getFrameHeadBounds(filePath) {
    if (headBoundsCache.has(filePath)) {
      return headBoundsCache.get(filePath);
    }

    const visibleBounds = getFrameVisibleBounds(filePath);
    const image = nativeImage.createFromPath(filePath);
    const size = image.getSize();
    if (!size.width || !size.height || !visibleBounds) {
      headBoundsCache.set(filePath, visibleBounds);
      return visibleBounds;
    }

    const bitmap = image.toBitmap();
    const headBounds = frameVisibleBounds.scanHeadBoundsFromBitmap(bitmap, size.width, size.height, visibleBounds, VISIBLE_ALPHA_THRESHOLD, PET_MENU_HEAD_SCAN_RATIO);
    headBoundsCache.set(filePath, headBounds);
    return headBounds;
  }

  function getStateVisibleBounds(stateId) {
    const state = getState(stateId);
    if (!state) {
      return null;
    }
    const cacheKey = `state:${state.id}`;
    if (visibleBoundsCache.has(cacheKey)) {
      return visibleBoundsCache.get(cacheKey);
    }

    const framePaths = listFramePaths(state.folder);
    const frameBounds = framePaths.map((filePath) => getFrameVisibleBounds(filePath));
    let combined = frameGeometry.combineFrameBoundsList(frameBounds);

    if (!combined) {
      const spriteSize = getPetSpriteSize();
      combined = { left: 0, top: 0, right: spriteSize - 1, bottom: spriteSize - 1, width: spriteSize, height: spriteSize, imageWidth: spriteSize, imageHeight: spriteSize };
    } else {
      frameGeometry.applyStableGroundBottomCorrection(combined, frameBounds, Boolean(state.moving) && frameBounds.length > 2);
    }
    visibleBoundsCache.set(cacheKey, combined);
    return combined;
  }

  function getStateHeadBounds(stateId) {
    const state = getState(stateId);
    if (!state) {
      return getStateVisibleBounds(stateId);
    }
    const cacheKey = `head:${state.id}`;
    if (headBoundsCache.has(cacheKey)) {
      return headBoundsCache.get(cacheKey);
    }

    const framePaths = listFramePaths(state.folder);
    const frameBounds = framePaths.map((filePath) => getFrameHeadBounds(filePath));
    let combined = frameGeometry.combineFrameBoundsList(frameBounds);

    if (!combined) {
      combined = getStateVisibleBounds(stateId);
    }
    headBoundsCache.set(cacheKey, combined);
    return combined;
  }

  return {
    getFrameVisibleBounds,
    getFramePixelData,
    getFrameHeadBounds,
    getStateVisibleBounds,
    getStateHeadBounds
  };
}

module.exports = { createFrameBoundsController };
