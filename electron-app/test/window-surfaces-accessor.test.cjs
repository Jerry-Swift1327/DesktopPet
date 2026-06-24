const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "..", "electron", "platform", "window-surfaces.cjs"),
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

test("return 导出列表包含 15 个核心函数", () => {
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
    "getLastWindowSurfaceAsyncRefreshAt"
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
