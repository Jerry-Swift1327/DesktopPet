const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "..", "electron", "platform", "window-surfaces.cjs"),
  "utf8"
);
const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const dragControllerSource = fs.readFileSync(
  path.join(__dirname, "..", "electron", "behavior", "drag-controller.cjs"),
  "utf8"
);

// 提取 context 解构块
const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";

// 提取最后一个 return { ... }; 块（控制器导出对象）
const lastReturnIdx = controllerSource.lastIndexOf("return {");
const exportBlock = lastReturnIdx >= 0 ? controllerSource.slice(lastReturnIdx) : "";

test("window-surfaces 不直接 require electron", () => {
  assert.doesNotMatch(controllerSource, /require\(\s*["']electron["']\s*\)/, "不应直接 require electron");
});

test("window-surfaces 不直接 require child_process、fs、path", () => {
  assert.doesNotMatch(controllerSource, /require\(\s*["']child_process["']\s*\)/, "不应直接 require child_process");
  assert.doesNotMatch(controllerSource, /require\(\s*["']fs["']\s*\)/, "不应直接 require fs");
  assert.doesNotMatch(controllerSource, /require\(\s*["']path["']\s*\)/, "不应直接 require path");
});

test("context 解构包含 screen、execFile、execFileSync、fs、path、process、__dirname", () => {
  assert.match(contextBlock, /\bscreen\b/, "context 应包含 screen");
  assert.match(contextBlock, /\bexecFile\b/, "context 应包含 execFile");
  assert.match(contextBlock, /\bexecFileSync\b/, "context 应包含 execFileSync");
  assert.match(contextBlock, /\bfs\b/, "context 应包含 fs");
  assert.match(contextBlock, /\bpath\b/, "context 应包含 path");
  assert.match(contextBlock, /\bprocess\b/, "context 应包含 process");
  assert.match(contextBlock, /__dirname/, "context 应包含 __dirname");
});

test("context 不按值解构 petWindow、dragState、lastDragSample、userDataRoot", () => {
  // 不应出现按值解构的四个可变状态（作为独立标识符）
  assert.doesNotMatch(contextBlock, /(^|\s|,)petWindow(\s|,|$)/m, "不应按值捕获 petWindow");
  assert.doesNotMatch(contextBlock, /(^|\s|,)dragState(\s|,|$)/m, "不应按值捕获 dragState");
  assert.doesNotMatch(contextBlock, /(^|\s|,)lastDragSample(\s|,|$)/m, "不应按值捕获 lastDragSample");
  assert.doesNotMatch(contextBlock, /(^|\s|,)userDataRoot(\s|,|$)/m, "不应按值捕获 userDataRoot");
});

test("context 包含 getPetWindow、getDragState、getLastDragSample、getUserDataRoot 访问器", () => {
  assert.match(contextBlock, /getPetWindow/, "context 应包含 getPetWindow 访问器");
  assert.match(contextBlock, /getDragState/, "context 应包含 getDragState 访问器");
  assert.match(contextBlock, /getLastDragSample/, "context 应包含 getLastDragSample 访问器");
  assert.match(contextBlock, /getUserDataRoot/, "context 应包含 getUserDataRoot 访问器");
});

test("normalizeWindowRectToDip 使用 getPetWindow()，保留 isDestroyed() guard", () => {
  const funcBlock = controllerSource.match(/function normalizeWindowRectToDip\(rect\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(funcBlock.length > 0, "应能提取 normalizeWindowRectToDip 函数体");
  assert.match(funcBlock, /getPetWindow\(\)/, "应使用 getPetWindow() 访问器");
  assert.match(funcBlock, /isDestroyed\(\)/, "应保留 isDestroyed() guard");
  // 不应直接引用裸变量 petWindow
  assert.doesNotMatch(funcBlock, /(^|\s|[^.])petWindow(\s|\?|\.)/, "不应直接引用裸变量 petWindow");
});

test("buildDockQueryPoints 使用 getDragState() 和 getLastDragSample()", () => {
  const funcBlock = controllerSource.match(/function buildDockQueryPoints\(bottomPoint, surfaceHint = null\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(funcBlock.length > 0, "应能提取 buildDockQueryPoints 函数体");
  assert.match(funcBlock, /getDragState\(\)/, "应使用 getDragState() 访问器");
  assert.match(funcBlock, /getLastDragSample\(\)/, "应使用 getLastDragSample() 访问器");
  // 不应直接引用裸变量 dragState 或 lastDragSample
  assert.doesNotMatch(funcBlock, /(^|\s|[^.])dragState(\s|\.|\?)/, "不应直接引用裸变量 dragState");
  assert.doesNotMatch(funcBlock, /(^|\s|[^.])lastDragSample(\s|;|\|\|)/, "不应直接引用裸变量 lastDragSample");
});

test("prepareRuntimeScript 使用 getUserDataRoot()", () => {
  const funcBlock = controllerSource.match(/function prepareRuntimeScript\(scriptName\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(funcBlock.length > 0, "应能提取 prepareRuntimeScript 函数体");
  assert.match(funcBlock, /getUserDataRoot\(\)/, "应使用 getUserDataRoot() 访问器");
  // 不应直接引用裸变量 userDataRoot
  assert.doesNotMatch(funcBlock, /(^|\s|[^.])userDataRoot(\s|,|\))/, "不应直接引用裸变量 userDataRoot");
});

test("return 导出列表包含 16 个核心函数", () => {
  const expectedExports = [
    "parseWindowSurfaceItems",
    "parseWindowHwnd",
    "normalizeWindowRectToDip",
    "toPhysicalScreenPoint",
    "prepareRuntimeScript",
    "listWindowSurfaceCandidates",
    "refreshWindowSurfaceCandidatesAsync",
    "listSpecificWindowSurfaceCandidate",
    "findCandidateByHwnd",
    "getWindowAtScreenPoint",
    "buildWindowSurfaceFromItem",
    "buildDockQueryPoints",
    "scoreDockSurface",
    "getCachedWindowSurfaceCandidates",
    "getLastWindowSurfaceAsyncRefreshAt",
    "maybeRefreshWindowSurfaceCandidatesBackground"
  ];
  for (const name of expectedExports) {
    assert.match(exportBlock, new RegExp(`\\b${name}\\b`), `导出对象应包含 ${name}`);
  }
});

test("context 不注入 getCachedWindowSurfaceCandidates（已内部化）", () => {
  assert.doesNotMatch(contextBlock, /getCachedWindowSurfaceCandidates/, "context 不应注入 getCachedWindowSurfaceCandidates");
  // 控制器内部应定义该函数
  assert.match(controllerSource, /function getCachedWindowSurfaceCandidates\(\)/, "控制器内部应定义 getCachedWindowSurfaceCandidates");
});

test("控制器内部定义 getLastWindowSurfaceAsyncRefreshAt", () => {
  assert.match(controllerSource, /function getLastWindowSurfaceAsyncRefreshAt\(\)/, "控制器内部应定义 getLastWindowSurfaceAsyncRefreshAt");
});

// ============================================================================
// B2：main.cjs 接线相关结构断言（window-surfaces 真实接线）
// ============================================================================

test("main.cjs 已引入并构造 createWindowSurfaceController", () => {
  assert.match(mainSource, /createWindowSurfaceController/);
  assert.match(mainSource, /require\(.*window-surfaces/);
  assert.match(mainSource, /const windowSurfaceController = createWindowSurfaceController\(/);
});

test("main.cjs 保留 16 个窗口表面薄包装函数声明", () => {
  const expectedDeclarations = [
    "parseWindowSurfaceItems",
    "parseWindowHwnd",
    "normalizeWindowRectToDip",
    "toPhysicalScreenPoint",
    "prepareRuntimeScript",
    "listWindowSurfaceCandidates",
    "refreshWindowSurfaceCandidatesAsync",
    "listSpecificWindowSurfaceCandidate",
    "findCandidateByHwnd",
    "maybeRefreshWindowSurfaceCandidatesBackground",
    "getWindowAtScreenPoint",
    "buildWindowSurfaceFromItem",
    "buildDockQueryPoints",
    "scoreDockSurface",
    "getCachedWindowSurfaceCandidates",
    "getLastWindowSurfaceAsyncRefreshAt"
  ];
  for (const name of expectedDeclarations) {
    assert.match(mainSource, new RegExp(`function ${name}\\(`), `main.cjs 应保留 ${name} 函数声明`);
  }
});

test("main.cjs 薄包装函数体委托给 windowSurfaceController", () => {
  assert.match(mainSource, /windowSurfaceController\.parseWindowSurfaceItems\(rawOutput\)/);
  assert.match(mainSource, /windowSurfaceController\.parseWindowHwnd\(value\)/);
  assert.match(mainSource, /windowSurfaceController\.normalizeWindowRectToDip\(rect\)/);
  assert.match(mainSource, /windowSurfaceController\.toPhysicalScreenPoint\(point\)/);
  assert.match(mainSource, /windowSurfaceController\.prepareRuntimeScript\(scriptName\)/);
  assert.match(mainSource, /windowSurfaceController\.listWindowSurfaceCandidates\(\{ useCache \}\)/);
  assert.match(mainSource, /windowSurfaceController\.refreshWindowSurfaceCandidatesAsync\(\{ force \}\)/);
  assert.match(mainSource, /windowSurfaceController\.listSpecificWindowSurfaceCandidate\(hwnd\)/);
  assert.match(mainSource, /windowSurfaceController\.findCandidateByHwnd\(hwnd, \{ useCache, cacheOnly \}\)/);
  assert.match(mainSource, /windowSurfaceController\.maybeRefreshWindowSurfaceCandidatesBackground\(now\)/);
  assert.match(mainSource, /windowSurfaceController\.getWindowAtScreenPoint\(x, y\)/);
  assert.match(mainSource, /windowSurfaceController\.buildWindowSurfaceFromItem\(item\)/);
  assert.match(mainSource, /windowSurfaceController\.buildDockQueryPoints\(bottomPoint, surfaceHint\)/);
  assert.match(mainSource, /windowSurfaceController\.scoreDockSurface\(bottomPoint, rect\)/);
  assert.match(mainSource, /windowSurfaceController\.getCachedWindowSurfaceCandidates\(\)/);
  assert.match(mainSource, /windowSurfaceController\.getLastWindowSurfaceAsyncRefreshAt\(\)/);
});

test("main.cjs 不再声明 5 个旧窗口候选缓存状态变量", () => {
  assert.doesNotMatch(mainSource, /let windowSurfaceCandidatesCache\b/, "不应再声明 let windowSurfaceCandidatesCache");
  assert.doesNotMatch(mainSource, /let windowSurfaceCandidatesCacheAt\b/, "不应再声明 let windowSurfaceCandidatesCacheAt");
  assert.doesNotMatch(mainSource, /let windowSurfaceRefreshInFlight\b/, "不应再声明 let windowSurfaceRefreshInFlight");
  assert.doesNotMatch(mainSource, /let lastWindowSurfaceAsyncRefreshAt\b/, "不应再声明 let lastWindowSurfaceAsyncRefreshAt");
  assert.doesNotMatch(mainSource, /let lastWindowSurfaceBackgroundRefreshAt\b/, "不应再声明 let lastWindowSurfaceBackgroundRefreshAt");
});

test("drag-controller updateDragPosition 使用 getLastWindowSurfaceAsyncRefreshAt() 而非裸变量", () => {
  const funcBlock = dragControllerSource.match(/function updateDragPosition\([\s\S]*?\n\}/)?.[0] || "";
  assert.ok(funcBlock.length > 0, "应能从 drag-controller.cjs 提取 updateDragPosition 函数");
  assert.match(funcBlock, /getLastWindowSurfaceAsyncRefreshAt\(\)/, "应使用 getLastWindowSurfaceAsyncRefreshAt()");
  assert.doesNotMatch(funcBlock, /now\s*-\s*lastWindowSurfaceAsyncRefreshAt\b/, "不应直接引用裸变量 lastWindowSurfaceAsyncRefreshAt");
});

test("window-surfaces.cjs 内部定义并导出 maybeRefreshWindowSurfaceCandidatesBackground", () => {
  assert.match(controllerSource, /function maybeRefreshWindowSurfaceCandidatesBackground\(now = Date\.now\(\)\)/, "应定义函数");
  const lastReturnIdx = controllerSource.lastIndexOf("return {");
  const exportBlock = lastReturnIdx >= 0 ? controllerSource.slice(lastReturnIdx) : "";
  assert.match(exportBlock, /maybeRefreshWindowSurfaceCandidatesBackground/, "应导出该函数");
});

test("window-surfaces.cjs context 包含 getCurrentSurfaceValue 和 WINDOW_SURFACE_BACKGROUND_REFRESH_MS", () => {
  assert.match(contextBlock, /getCurrentSurfaceValue/, "context 应包含 getCurrentSurfaceValue");
  assert.match(contextBlock, /WINDOW_SURFACE_BACKGROUND_REFRESH_MS/, "context 应包含 WINDOW_SURFACE_BACKGROUND_REFRESH_MS");
});

test("window-surfaces.cjs maybeRefreshWindowSurfaceCandidatesBackground 使用 getCurrentSurfaceValue() 访问器", () => {
  const funcBlock = controllerSource.match(/function maybeRefreshWindowSurfaceCandidatesBackground\(now = Date\.now\(\)\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(funcBlock.length > 0, "应能提取函数体");
  assert.match(funcBlock, /getCurrentSurfaceValue\(\)/, "应使用 getCurrentSurfaceValue() 访问器");
});

test("main.cjs 仍保留 dock-controller 接线（不回归）", () => {
  assert.match(mainSource, /createDockController/);
  assert.match(mainSource, /dockController\./);
});

test("main.cjs 仍保留 window-roam-controller 接线（不回归）", () => {
  assert.match(mainSource, /createWindowRoamController/);
});

test("main.cjs 不再声明 4 个窗口表面死代码 helper", () => {
  assert.doesNotMatch(mainSource, /function toNumberOrNull\(/, "不应再声明 toNumberOrNull");
  assert.doesNotMatch(mainSource, /function normalizeRectShape\(/, "不应再声明 normalizeRectShape");
  assert.doesNotMatch(mainSource, /function rectFromWindowItem\(/, "不应再声明 rectFromWindowItem");
  assert.doesNotMatch(mainSource, /function isWindowTopDockable\(/, "不应再声明 isWindowTopDockable");
});
