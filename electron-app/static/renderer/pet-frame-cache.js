(function initPetFrameCache(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.createPetFrameCache = api.createPetFrameCache;
    root.predictScaleSummary = api.predictScaleSummary;
  }
})(typeof window !== "undefined" ? window : globalThis, function createApi() {
  function roundScale(value) {
    return Math.round(value * 100) / 100;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function predictScaleSummary(currentScale, deltaY) {
    if (!currentScale || currentScale.taskbarRunway) {
      return null;
    }

    const currentValue = Number(currentScale.value);
    if (!Number.isFinite(currentValue) || currentValue <= 0) {
      return null;
    }

    const step = Number.isFinite(currentScale.step) ? currentScale.step : 0.08;
    const min = Number.isFinite(currentScale.min) ? currentScale.min : currentValue;
    const max = Number.isFinite(currentScale.max) ? currentScale.max : currentValue;
    const direction = deltaY < 0 ? 1 : -1;
    const nextValue = roundScale(clamp(currentValue + direction * step, min, max));

    const baseWindowWidth = (Number(currentScale.windowWidth) || 180) / currentValue;
    const baseWindowHeight = (Number(currentScale.windowHeight) || 180) / currentValue;
    const baseSpriteSize = (Number(currentScale.spriteSize) || 128) / currentValue;
    const windowWidth = Math.round(baseWindowWidth * nextValue);
    const windowHeight = Math.round(baseWindowHeight * nextValue);
    const spriteSize = Math.round(baseSpriteSize * nextValue);

    return {
      ...currentScale,
      value: nextValue,
      windowWidth,
      windowHeight,
      spriteSize,
      spriteOffsetX: Math.max(0, Math.round((windowWidth - spriteSize) / 2)),
      taskbarRunway: false
    };
  }

  function createPetFrameCache(options = {}) {
    const ImageCtor = options.ImageCtor || (typeof Image !== "undefined" ? Image : null);
    const decodeFrame = typeof options.decodeFrame === "function"
      ? options.decodeFrame
      : (image) => {
        if (image && typeof image.decode === "function") {
          return image.decode();
        }
        return Promise.resolve();
      };
    const frames = new Map();

    function makeResult(record, ready, failed) {
      return {
        src: record.src,
        image: record.image,
        ready,
        failed
      };
    }

    function preloadFrame(src) {
      if (!src || !ImageCtor) {
        return null;
      }
      if (frames.has(src)) {
        return frames.get(src);
      }

      const image = new ImageCtor();
      const record = {
        src,
        image,
        status: "loading",
        promise: null
      };

      record.promise = new Promise((resolve) => {
        image.onload = () => {
          Promise.resolve(decodeFrame(image))
            .catch(() => {})
            .then(() => {
              record.status = "ready";
              resolve(makeResult(record, true, false));
            });
        };
        image.onerror = () => {
          record.status = "failed";
          resolve(makeResult(record, false, true));
        };
      });

      frames.set(src, record);
      image.src = src;
      return record;
    }

    function ensureFrameReady(src) {
      const record = preloadFrame(src);
      if (!record) {
        return Promise.resolve({ src, image: null, ready: false, failed: true });
      }
      return record.promise;
    }

    function preloadFrames(frameList) {
      if (!Array.isArray(frameList)) {
        return [];
      }
      return frameList.map((src) => preloadFrame(src)).filter(Boolean);
    }

    function ensureFramesReady(frameList) {
      return Promise.all(preloadFrames(frameList).map((record) => record.promise));
    }

    function isFrameReady(src) {
      return frames.get(src)?.status === "ready";
    }

    function getFrameStatus(src) {
      return frames.get(src)?.status || "missing";
    }

    return {
      preloadFrame,
      preloadFrames,
      ensureFrameReady,
      ensureFramesReady,
      isFrameReady,
      getFrameStatus,
      predictScaleSummary: (currentScale, deltaY) => predictScaleSummary(currentScale, deltaY)
    };
  }

  return {
    createPetFrameCache,
    predictScaleSummary
  };
});
