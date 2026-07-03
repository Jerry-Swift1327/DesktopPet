(function initPetFrameCache(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.createPetFrameCache = api.createPetFrameCache;
    root.buildResponsiveScaleLayout = api.buildResponsiveScaleLayout;
  }
})(typeof window !== "undefined" ? window : globalThis, function createApi() {
  function formatPercent(part, whole) {
    const total = Number(whole);
    if (!Number.isFinite(total) || total <= 0) {
      return "0%";
    }
    const value = Math.max(0, Number(part) || 0) / total * 100;
    return `${Math.round(value * 1000000) / 1000000}%`;
  }

  function buildResponsiveScaleLayout(currentScale = {}) {
    const windowWidth = Number(currentScale.windowWidth) || 180;
    const windowHeight = Number(currentScale.windowHeight) || 180;
    const spriteSize = Number(currentScale.spriteSize) || 128;
    const spriteOffsetX = Number.isFinite(currentScale.spriteOffsetX)
      ? Math.round(currentScale.spriteOffsetX)
      : Math.max(0, Math.round((windowWidth - spriteSize) / 2));

    return {
      appWidth: "100%",
      appHeight: "100%",
      hostLeft: formatPercent(spriteOffsetX, windowWidth),
      hostWidth: formatPercent(spriteSize, windowWidth),
      hostHeight: formatPercent(spriteSize, windowHeight),
      imageWidth: "100%",
      imageHeight: "100%"
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
      buildResponsiveScaleLayout
    };
  }

  return {
    createPetFrameCache,
    buildResponsiveScaleLayout
  };
});
