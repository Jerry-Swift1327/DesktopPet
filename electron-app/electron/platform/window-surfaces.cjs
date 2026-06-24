// 窗口表面控制器，负责枚举/校验可作为宠物停靠表面的窗口、坐标在物理像素与 DIP 之间的换算，
// 以及停靠查询点构造与表面评分。从 main.cjs 提取，所有运行时依赖（screen、execFile、fs、path 等）
// 和可变状态（petWindow、dragState、lastDragSample、userDataRoot）均通过 createWindowSurfaceController(context)
// 以访问器形式注入，避免快照固化与双状态源风险。

function createWindowSurfaceController(context) {
  const {
    // 运行时
    process,
    __dirname,
    // 运行时依赖
    screen,
    execFile,
    execFileSync,
    fs,
    path,
    // 依赖函数
    log,
    getPetSpriteSize,
    isValidRect,
    isLikelyDesktopOrSystemWindow,
    // 可变状态访问器
    getPetWindow,
    getDragState,
    getLastDragSample,
    getUserDataRoot,
    // 常量
    ENABLE_WINDOW_DOCKING,
    APP_INTERNAL_NAME,
    WINDOW_DOCK_DEBUG,
    WINDOW_SURFACE_CACHE_MS,
    WINDOW_SURFACE_ASYNC_REFRESH_MIN_MS,
    WINDOW_DOCK_MIN_WIDTH,
    WINDOW_SURFACE_SIDE_GAP,
    WINDOW_DOCK_GAP,
    WINDOW_DOCK_FAST_RELEASE_SPEED_PX_PER_SEC,
    WINDOW_DOCK_FAST_RELEASE_MAX_AGE_MS,
    WINDOW_DOCK_FAST_HIT_SAMPLES,
    WINDOW_DOCK_NORMAL_HIT_SAMPLES,
    WINDOW_DOCK_FAST_POINT_OFFSETS_Y,
    WINDOW_DOCK_POINT_OFFSETS_Y
  } = context;

  // 窗口表面候选缓存与异步刷新状态（原 main.cjs 中的全局变量）
  let windowSurfaceCandidatesCache = [];
  let windowSurfaceCandidatesCacheAt = 0;
  let windowSurfaceRefreshInFlight = false;
  let lastWindowSurfaceAsyncRefreshAt = 0;

  function parseWindowSurfaceItems(rawOutput) {
    if (!rawOutput || !rawOutput.trim()) {
      return [];
    }
    try {
      const parsed = JSON.parse(rawOutput);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      log(`failed to parse window surfaces: ${error.stack || error.message}`);
      return [];
    }
  }

  function parseWindowHwnd(value) {
    const raw = String(value || "").trim();
    if (!raw) {
      return "";
    }
    if (/^0x/i.test(raw)) {
      return raw.slice(2).replace(/^0+/, "").toLowerCase() || "0";
    }
    const asNumber = Number(raw);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return Math.trunc(asNumber).toString(16);
    }
    return raw.toLowerCase();
  }

  function toNumberOrNull(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function normalizeRectShape(rect) {
    if (!rect) {
      return null;
    }
    const left = toNumberOrNull(rect.left);
    const top = toNumberOrNull(rect.top);
    const right = toNumberOrNull(rect.right);
    const bottom = toNumberOrNull(rect.bottom);
    if (left === null || top === null || right === null || bottom === null) {
      return null;
    }
    const width = Number.isFinite(Number(rect.width)) ? Number(rect.width) : (right - left);
    const height = Number.isFinite(Number(rect.height)) ? Number(rect.height) : (bottom - top);
    return { left, top, right, bottom, width, height };
  }

  function normalizeWindowRectToDip(rect) {
    const normalized = normalizeRectShape(rect);
    if (!normalized) {
      return null;
    }
    if (typeof screen.screenToDipRect !== "function") {
      return {
        left: Math.round(normalized.left),
        top: Math.round(normalized.top),
        right: Math.round(normalized.right),
        bottom: Math.round(normalized.bottom),
        width: Math.round(normalized.width),
        height: Math.round(normalized.height)
      };
    }
    const physicalRect = {
      x: Math.round(normalized.left),
      y: Math.round(normalized.top),
      width: Math.max(1, Math.round(normalized.width)),
      height: Math.max(1, Math.round(normalized.height))
    };
    let dipRect = null;
    try {
      const ownerWindow = getPetWindow();
      const safeOwner = ownerWindow && !ownerWindow.isDestroyed() ? ownerWindow : null;
      dipRect = screen.screenToDipRect(safeOwner, physicalRect);
    } catch (error) {
      log(`screenToDipRect failed: ${error.stack || error.message}`);
      return {
        left: Math.round(normalized.left),
        top: Math.round(normalized.top),
        right: Math.round(normalized.right),
        bottom: Math.round(normalized.bottom),
        width: Math.round(normalized.width),
        height: Math.round(normalized.height)
      };
    }
    if (!dipRect || !Number.isFinite(dipRect.x) || !Number.isFinite(dipRect.y) || !Number.isFinite(dipRect.width) || !Number.isFinite(dipRect.height)) {
      return {
        left: Math.round(normalized.left),
        top: Math.round(normalized.top),
        right: Math.round(normalized.right),
        bottom: Math.round(normalized.bottom),
        width: Math.round(normalized.width),
        height: Math.round(normalized.height)
      };
    }
    return {
      left: Math.round(dipRect.x),
      top: Math.round(dipRect.y),
      right: Math.round(dipRect.x + dipRect.width),
      bottom: Math.round(dipRect.y + dipRect.height),
      width: Math.round(dipRect.width),
      height: Math.round(dipRect.height)
    };
  }

  function toPhysicalScreenPoint(point) {
    if (!point) {
      return null;
    }
    if (typeof screen.dipToScreenPoint !== "function") {
      return {
        x: Math.round(point.x),
        y: Math.round(point.y)
      };
    }
    const screenPoint = screen.dipToScreenPoint({
      x: Math.round(point.x),
      y: Math.round(point.y)
    });
    return {
      x: Math.round(screenPoint.x),
      y: Math.round(screenPoint.y)
    };
  }

  function prepareRuntimeScript(scriptName) {
    const sourcePath = path.join(__dirname, scriptName);
    if (!sourcePath.includes(".asar") && fs.existsSync(sourcePath)) {
      return sourcePath;
    }
    try {
      const content = fs.readFileSync(sourcePath, "utf8");
      const runtimeScriptPath = path.join(getUserDataRoot(), scriptName);
      fs.writeFileSync(runtimeScriptPath, content, "utf8");
      return runtimeScriptPath;
    } catch (error) {
      log(`failed to prepare runtime script ${scriptName}: ${error.stack || error.message}`);
      return null;
    }
  }

  function listWindowSurfaceCandidates({ useCache = true } = {}) {
    if (!ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
      return [];
    }
    const now = Date.now();
    if (useCache && now - windowSurfaceCandidatesCacheAt <= WINDOW_SURFACE_CACHE_MS) {
      return windowSurfaceCandidatesCache;
    }

    const scriptPath = prepareRuntimeScript("window-surfaces.ps1");
    if (!scriptPath || !fs.existsSync(scriptPath)) {
      return [];
    }

    try {
      const output = execFileSync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-PetPid",
        String(process.pid),
        "-PetInternalName",
        APP_INTERNAL_NAME
      ], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 1800,
        maxBuffer: 1024 * 1024
      });
      const items = parseWindowSurfaceItems(output);
      windowSurfaceCandidatesCache = items;
      windowSurfaceCandidatesCacheAt = now;
      if (WINDOW_DOCK_DEBUG) {
        log(`window-dock enum items=${items.length}`);
      }
      return items;
    } catch (error) {
      log(`failed to list window surfaces: ${error.stack || error.message}`);
      return [];
    }
  }

  function refreshWindowSurfaceCandidatesAsync({ force = false } = {}) {
    if (!ENABLE_WINDOW_DOCKING || process.platform !== "win32" || windowSurfaceRefreshInFlight) {
      return;
    }
    const now = Date.now();
    if (!force && now - lastWindowSurfaceAsyncRefreshAt < WINDOW_SURFACE_ASYNC_REFRESH_MIN_MS) {
      return;
    }
    lastWindowSurfaceAsyncRefreshAt = now;

    const scriptPath = prepareRuntimeScript("window-surfaces.ps1");
    if (!scriptPath || !fs.existsSync(scriptPath)) {
      return;
    }

    windowSurfaceRefreshInFlight = true;
    execFile("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-PetPid",
      String(process.pid),
      "-PetInternalName",
      APP_INTERNAL_NAME
    ], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 3000,
      maxBuffer: 1024 * 1024
    }, (error, stdout, stderr) => {
      windowSurfaceRefreshInFlight = false;
      if (error) {
        if (WINDOW_DOCK_DEBUG) {
          const detail = [
            `message=${error.message || ""}`,
            `code=${error.code || ""}`,
            `signal=${error.signal || ""}`,
            `killed=${error.killed ? "1" : "0"}`,
            `timedOut=${error.code === "ETIMEDOUT" ? "1" : "0"}`,
            `stdoutLen=${(stdout || "").length}`,
            `stderrLen=${(stderr || "").length}`,
            `stderr=${String(stderr || "").trim().slice(0, 300)}`
          ].join(" ");
          log(`window-dock async refresh failed: ${detail}`);
        }
        return;
      }
      const items = parseWindowSurfaceItems(stdout || "");
      windowSurfaceCandidatesCache = items;
      windowSurfaceCandidatesCacheAt = Date.now();
    });
  }

  function listSpecificWindowSurfaceCandidate(hwnd) {
    if (!ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
      return null;
    }
    const normalizedTarget = parseWindowHwnd(hwnd);
    if (!normalizedTarget) {
      return null;
    }

    const scriptPath = prepareRuntimeScript("window-surfaces.ps1");
    if (!scriptPath || !fs.existsSync(scriptPath)) {
      return null;
    }

    try {
      const output = execFileSync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-PetPid",
        String(process.pid),
        "-PetInternalName",
        APP_INTERNAL_NAME,
        "-TargetHwnd",
        String(hwnd)
      ], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 700,
        maxBuffer: 256 * 1024
      });
      const candidates = parseWindowSurfaceItems(output);
      return candidates.find((item) => parseWindowHwnd(item.hwnd) === normalizedTarget) || null;
    } catch (error) {
      if (WINDOW_DOCK_DEBUG) {
        log(`failed to validate window surface hwnd=${hwnd}: ${error.stack || error.message}`);
      }
      return null;
    }
  }

  function getCachedWindowSurfaceCandidates() {
    if (!ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
      return [];
    }
    refreshWindowSurfaceCandidatesAsync();
    return windowSurfaceCandidatesCache || [];
  }

  function getLastWindowSurfaceAsyncRefreshAt() {
    return lastWindowSurfaceAsyncRefreshAt;
  }

  function findCandidateByHwnd(hwnd, { useCache = true, cacheOnly = false } = {}) {
    const normalizedTarget = parseWindowHwnd(hwnd);
    if (!normalizedTarget) {
      return null;
    }
    const candidates = cacheOnly
      ? getCachedWindowSurfaceCandidates()
      : listWindowSurfaceCandidates({ useCache });
    return candidates.find((item) => parseWindowHwnd(item.hwnd) === normalizedTarget) || null;
  }

  function getWindowAtScreenPoint(x, y) {
    if (!ENABLE_WINDOW_DOCKING || process.platform !== "win32") {
      return null;
    }

    const scriptPath = prepareRuntimeScript("window-from-point.ps1");
    if (!scriptPath || !fs.existsSync(scriptPath)) {
      return null;
    }
    const physicalPoint = toPhysicalScreenPoint({ x, y });
    if (!physicalPoint) {
      return null;
    }

    try {
      const output = execFileSync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-X",
        String(physicalPoint.x),
        "-Y",
        String(physicalPoint.y),
        "-PetPid",
        String(process.pid),
        "-PetInternalName",
        APP_INTERNAL_NAME
      ], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 1200,
        maxBuffer: 512 * 1024
      });
      if (!output || !output.trim()) {
        return null;
      }
      const parsed = JSON.parse(output);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }
      const normalizedRect = normalizeWindowRectToDip({
        left: parsed.left,
        top: parsed.top,
        right: parsed.right,
        bottom: parsed.bottom,
        width: parsed.width,
        height: parsed.height
      });
      if (normalizedRect) {
        parsed.left = normalizedRect.left;
        parsed.top = normalizedRect.top;
        parsed.right = normalizedRect.right;
        parsed.bottom = normalizedRect.bottom;
        parsed.width = normalizedRect.width;
        parsed.height = normalizedRect.height;
      }
      return parsed;
    } catch (error) {
      log(`failed to hit-test window point: ${error.stack || error.message}`);
      return null;
    }
  }

  function rectFromWindowItem(item) {
    return normalizeWindowRectToDip({
      left: item.left,
      top: item.top,
      right: item.right,
      bottom: item.bottom,
      width: item.width,
      height: item.height
    }) || {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0
    };
  }

  // isValidRect 已从 shared/bounds.cjs 导入

  function isWindowTopDockable(rect, area) {
    const verticalSlack = 10;
    const horizontalOverlap = Math.min(rect.right, area.x + area.width) - Math.max(rect.left, area.x);
    return rect.top >= area.y - verticalSlack
      && rect.top <= area.y + area.height - 80
      && horizontalOverlap >= WINDOW_DOCK_MIN_WIDTH;
  }

  function buildWindowSurfaceFromItem(item) {
    const rect = rectFromWindowItem(item);
    if (!isValidRect(rect)) {
      return { surface: null, reason: "invalid-rect", rect };
    }
    const display = screen.getDisplayMatching({
      x: rect.left,
      y: rect.top,
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height)
    });
    const area = display.workArea;
    if (isLikelyDesktopOrSystemWindow(item, rect, area)) {
      return { surface: null, reason: "system-or-desktop-window", rect };
    }
    if (item.minimized || item.maximized) {
      return { surface: null, reason: item.minimized ? "minimized" : "maximized", rect };
    }
    if (!isWindowTopDockable(rect, area)) {
      return { surface: null, reason: "top-not-dockable", rect };
    }
    if (rect.width < WINDOW_DOCK_MIN_WIDTH) {
      return { surface: null, reason: `too-narrow:${rect.width}`, rect };
    }

    return {
      surface: {
        type: "window",
        displayId: display.id,
        sourceWindowId: item.hwnd,
        title: item.title || "",
        className: item.className || "",
        processName: item.processName || "",
        bounds: rect,
        left: Math.max(rect.left, area.x + WINDOW_SURFACE_SIDE_GAP),
        right: Math.min(rect.right, area.x + area.width - WINDOW_SURFACE_SIDE_GAP),
        groundY: rect.top - WINDOW_DOCK_GAP,
        workArea: { x: area.x, y: area.y, width: area.width, height: area.height }
      },
      reason: "accepted",
      rect
    };
  }

  function buildDockQueryPoints(bottomPoint, surfaceHint = null) {
    const points = [];
    if (!bottomPoint) {
      return points;
    }
    const spriteSize = getPetSpriteSize();
    const dragSample = getDragState()?.lastSample || getLastDragSample();
    const now = Date.now();
    const isFastRelease = Boolean(
      dragSample
      && Number.isFinite(dragSample.speedPxPerSec)
      && dragSample.speedPxPerSec >= WINDOW_DOCK_FAST_RELEASE_SPEED_PX_PER_SEC
      && now - dragSample.at <= WINDOW_DOCK_FAST_RELEASE_MAX_AGE_MS
    );
    const sampleCount = isFastRelease
      ? Math.max(3, WINDOW_DOCK_FAST_HIT_SAMPLES)
      : Math.max(3, WINDOW_DOCK_NORMAL_HIT_SAMPLES);
    const pointOffsetsY = isFastRelease ? WINDOW_DOCK_FAST_POINT_OFFSETS_Y : WINDOW_DOCK_POINT_OFFSETS_Y;
    const halfSamples = Math.floor(sampleCount / 2);
    const step = Math.max(8, Math.round(spriteSize / (sampleCount + 1)));
    const sideSlack = Math.max(24, Math.round(spriteSize * 0.35));
    const minX = surfaceHint?.left !== undefined ? Math.round(surfaceHint.left - sideSlack) : -Infinity;
    const maxX = surfaceHint?.right !== undefined ? Math.round(surfaceHint.right + sideSlack) : Infinity;

    for (let index = -halfSamples; index <= halfSamples; index += 1) {
      const x = Math.round(bottomPoint.x + index * step);
      if (x < minX || x > maxX) {
        continue;
      }
      for (const offsetY of pointOffsetsY) {
        points.push({ x, y: Math.round(bottomPoint.y + offsetY) });
      }
    }
    points.push({ x: Math.round(bottomPoint.x), y: Math.round(bottomPoint.y) });
    return points;
  }

  function scoreDockSurface(bottomPoint, rect) {
    const distance = Math.abs(bottomPoint.y - rect.top);
    const horizontalCenter = rect.left + Math.round(rect.width / 2);
    const horizontalDistance = Math.abs(bottomPoint.x - horizontalCenter);
    return distance * 4 + horizontalDistance;
  }

  return {
    parseWindowSurfaceItems,
    parseWindowHwnd,
    normalizeWindowRectToDip,
    toPhysicalScreenPoint,
    prepareRuntimeScript,
    listWindowSurfaceCandidates,
    refreshWindowSurfaceCandidatesAsync,
    listSpecificWindowSurfaceCandidate,
    findCandidateByHwnd,
    getWindowAtScreenPoint,
    buildWindowSurfaceFromItem,
    buildDockQueryPoints,
    scoreDockSurface,
    getCachedWindowSurfaceCandidates,
    getLastWindowSurfaceAsyncRefreshAt
  };
}

module.exports = { createWindowSurfaceController };
