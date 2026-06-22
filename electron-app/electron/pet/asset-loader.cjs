// 宠物资源加载，含帧列表、元数据、图标路径

// 创建资源加载器，依赖通过参数注入以便解耦与测试
// app: Electron app 实例（用于 isPackaged）
// fs/path: 文件系统与路径模块
// __dirname: 调用方目录
// assetsRootCache: 资源根目录缓存初值（传 "" 与 main.cjs 默认一致）
// framePathsCache: 帧路径缓存 Map（按引用共享）
// APP_ICON_FILE: 应用图标文件名
// log: 日志函数
// petAnimationPrefix: 宠物动画前缀
// petRuntimeConfig: 宠物运行时配置
// canToggleEyeTracking: 是否支持眼球追踪
// EYE_TRACKING_FRAME_NAME_PATTERN: 眼球追踪帧名正则
// pathToFileURL: url 模块的 pathToFileURL
function createAssetLoader({
  app,
  fs,
  path,
  __dirname,
  assetsRootCache,
  framePathsCache,
  APP_ICON_FILE,
  log,
  petAnimationPrefix,
  petRuntimeConfig,
  canToggleEyeTracking,
  EYE_TRACKING_FRAME_NAME_PATTERN,
  pathToFileURL
}) {
  let eyeTrackingLookFrameCount = 0;

  function toFileUrl(filePath) {
    return pathToFileURL(filePath).toString();
  }

  function getAssetsRoot() {
    if (assetsRootCache) {
      return assetsRootCache;
    }
    if (app.isPackaged) {
      const candidates = [
        path.join(process.resourcesPath, "assets"),
        path.join(process.resourcesPath, "app", ".runtime-assets"),
        path.join(process.resourcesPath, "app.asar", ".runtime-assets")
      ];
      for (const candidate of candidates) {
        const probe = path.join(candidate, "animations", `${petAnimationPrefix}_squat`, "transparent_frames", "frame_000.png");
        if (fs.existsSync(probe)) {
          assetsRootCache = candidate;
          log(`assets root: ${assetsRootCache}`);
          return assetsRootCache;
        }
      }
      log(`missing packaged assets for ${petRuntimeConfig.variant}: ${candidates.join("; ")}`);
      assetsRootCache = candidates[0];
      return assetsRootCache;
    }
    assetsRootCache = path.resolve(__dirname, "..", "..", "assets");
    return assetsRootCache;
  }

  function listFrames(folder) {
    const fullFolder = path.join(getAssetsRoot(), folder);
    if (!fs.existsSync(fullFolder)) {
      return [];
    }
    return fs
      .readdirSync(fullFolder)
      .filter((name) => /^frame_\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((name) => toFileUrl(path.join(fullFolder, name)));
  }

  function listFramePaths(folder) {
    const fullFolder = path.join(getAssetsRoot(), folder);
    if (!fs.existsSync(fullFolder)) {
      return [];
    }
    if (framePathsCache.has(fullFolder)) {
      return framePathsCache.get(fullFolder);
    }
    const framePaths = fs
      .readdirSync(fullFolder)
      .filter((name) => /^frame_\d+\.png$/i.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((name) => path.join(fullFolder, name));
    framePathsCache.set(fullFolder, framePaths);
    return framePaths;
  }

  function listEyeTrackingFrames() {
    if (!canToggleEyeTracking()) {
      eyeTrackingLookFrameCount = 0;
      return {};
    }

    const folder = path.join(getAssetsRoot(), "animations", `${petAnimationPrefix}_look`, "transparent_frames");
    if (!fs.existsSync(folder)) {
      eyeTrackingLookFrameCount = 0;
      return {};
    }

    const frames = {};
    const directionFrames = fs
      .readdirSync(folder)
      .map((name) => name.match(EYE_TRACKING_FRAME_NAME_PATTERN))
      .filter(Boolean)
      .sort((a, b) => Number(a[1]) - Number(b[1]));
    for (const match of directionFrames) {
      const name = `frame_${String(Number(match[1])).padStart(3, "0")}`;
      frames[name] = toFileUrl(path.join(folder, `${name}.png`));
    }
    eyeTrackingLookFrameCount = directionFrames.length;
    return frames;
  }

  function listTabbySounds(pattern) {
    if (petRuntimeConfig.variant !== "tabby") {
      return [];
    }

    const folder = path.join(getAssetsRoot(), "sounds", "tabby");
    if (!fs.existsSync(folder)) {
      return [];
    }

    return fs
      .readdirSync(folder)
      .filter((name) => pattern.test(name))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }))
      .map((name) => toFileUrl(path.join(folder, name)));
  }

  function readMetadata(relativePath) {
    const fullPath = path.join(getAssetsRoot(), relativePath);
    if (!fs.existsSync(fullPath)) {
      return {};
    }

    try {
      return JSON.parse(fs.readFileSync(fullPath, "utf8"));
    } catch (error) {
      log(`failed to read metadata ${relativePath}: ${error.stack || error.message}`);
      return {};
    }
  }

  function getAppIconPath() {
    const candidates = [
      path.join(__dirname, "..", APP_ICON_FILE),
      path.join(__dirname, "..", "..", APP_ICON_FILE),
      path.join(process.resourcesPath || "", APP_ICON_FILE),
      path.join(__dirname, "..", "appIcon.ico"),
      path.join(__dirname, "..", "..", "appIcon.ico"),
      path.join(process.resourcesPath || "", "appIcon.ico")
    ];
    return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
  }

  function clampFrameIndex(index, maxFrame) {
    return Math.min(Math.max(0, index), maxFrame);
  }

  function sanitizeFrameSequence(sequence, maxFrame) {
    if (!sequence || typeof sequence !== "object") {
      return null;
    }

    if (Array.isArray(sequence)) {
      const timeline = sequence
        .map((segment) => {
          if (!segment || typeof segment !== "object") {
            return null;
          }
          const start = Number.isInteger(segment.start) ? segment.start : null;
          const end = Number.isInteger(segment.end) ? segment.end : null;
          const times = Number.isInteger(segment.times) ? segment.times : 1;
          if (start === null || end === null || times < 1) {
            return null;
          }
          return {
            start: clampFrameIndex(start, maxFrame),
            end: clampFrameIndex(end, maxFrame),
            times
          };
        })
        .filter(Boolean);

      return timeline.length > 0 ? timeline : null;
    }

    const repeatRangeStart = Number.isInteger(sequence.repeatRangeStart) ? sequence.repeatRangeStart : null;
    const repeatRangeEnd = Number.isInteger(sequence.repeatRangeEnd) ? sequence.repeatRangeEnd : null;
    const repeatCount = Number.isInteger(sequence.repeatCount) ? sequence.repeatCount : null;
    const sequenceRepeatCount = Number.isInteger(sequence.sequenceRepeatCount) ? Math.max(1, sequence.sequenceRepeatCount) : 1;
    if (repeatRangeStart === null || repeatRangeEnd === null || repeatCount === null || repeatCount <= 1) {
      return null;
    }

    const start = clampFrameIndex(repeatRangeStart, maxFrame);
    const end = Math.min(Math.max(start, repeatRangeEnd), maxFrame);
    return {
      repeatRangeStart: start,
      repeatRangeEnd: end,
      repeatCount,
      sequenceRepeatCount
    };
  }

  function getEyeTrackingLookFrameCount() {
    return eyeTrackingLookFrameCount;
  }

  return {
    getAssetsRoot,
    listFrames,
    listFramePaths,
    listEyeTrackingFrames,
    listTabbySounds,
    readMetadata,
    getAppIconPath,
    clampFrameIndex,
    sanitizeFrameSequence,
    getEyeTrackingLookFrameCount
  };
}

module.exports = { createAssetLoader };
