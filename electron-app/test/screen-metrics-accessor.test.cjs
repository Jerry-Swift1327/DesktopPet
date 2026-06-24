const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(
  path.join(__dirname, "..", "electron", "platform", "screen-metrics.cjs"),
  "utf8"
);
const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");

test("screen-metrics 不直接 require electron，screen 通过 context 注入", () => {
  assert.doesNotMatch(controllerSource, /require\(\s*["']electron["']\s*\)/, "不应直接 require electron");
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";
  assert.match(contextBlock, /\bscreen\b/, "context 解构应包含 screen");
});

test("screen-metrics 不按值捕获运行时可变状态", () => {
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";
  // 不应出现按值解构的三个可变状态（作为独立标识符）
  assert.doesNotMatch(contextBlock, /(^|\s|,)petWindow(\s|,|$)/m, "不应按值捕获 petWindow");
  assert.doesNotMatch(contextBlock, /(^|\s|,)dragState(\s|,|$)/m, "不应按值捕获 dragState");
  assert.doesNotMatch(contextBlock, /(^|\s|,)currentSurface(\s|,|$)/m, "不应按值捕获 currentSurface");
});

test("screen-metrics context 包含访问器注入", () => {
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";
  assert.match(contextBlock, /getPetWindow/, "context 应包含 getPetWindow 访问器");
  assert.match(contextBlock, /getDragState/, "context 应包含 getDragState 访问器");
  assert.match(contextBlock, /getCurrentSurfaceValue/, "context 应包含 getCurrentSurfaceValue 访问器");
});

test("screen-metrics 导出 clearDisplayMetricsSettleTimer", () => {
  assert.match(controllerSource, /function clearDisplayMetricsSettleTimer\(\)/, "应定义 clearDisplayMetricsSettleTimer 函数");
  // 提取最后一个 return { ... }; 块（控制器导出对象），避免匹配到函数内部的对象返回
  const lastReturnIdx = controllerSource.lastIndexOf("return {");
  const exportBlock = lastReturnIdx >= 0 ? controllerSource.slice(lastReturnIdx) : "";
  assert.ok(exportBlock.length > 0, "应能提取控制器导出 return 块");
  assert.match(exportBlock, /clearDisplayMetricsSettleTimer/, "应导出 clearDisplayMetricsSettleTimer");
});

test("getSurfaceDisplay 默认参数使用 getCurrentSurfaceValue() 而非 currentSurface 或 getCurrentSurface()", () => {
  // 应使用 getCurrentSurfaceValue() 作为默认参数
  assert.match(
    controllerSource,
    /function getSurfaceDisplay\(surface = getCurrentSurfaceValue\(\)\)/,
    "getSurfaceDisplay 默认参数应为 getCurrentSurfaceValue()"
  );
  // 不应使用 currentSurface 或 getCurrentSurface() 作为默认参数
  assert.doesNotMatch(
    controllerSource,
    /function getSurfaceDisplay\(surface = currentSurface\)/,
    "不应使用 currentSurface 作为默认参数"
  );
  assert.doesNotMatch(
    controllerSource,
    /function getSurfaceDisplay\(surface = getCurrentSurface\(\)\)/,
    "不应使用 getCurrentSurface() 作为默认参数（避免递归验证链）"
  );
});

test("scheduleDarwinDisplayMetricsSettle 使用 getDragState() 和 getPetWindow() 访问器", () => {
  const funcBlock = controllerSource.match(/function scheduleDarwinDisplayMetricsSettle\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(funcBlock.length > 0, "应能提取 scheduleDarwinDisplayMetricsSettle 函数体");
  assert.match(funcBlock, /getDragState\(\)/, "应使用 getDragState() 访问器");
  assert.match(funcBlock, /getPetWindow\(\)/, "应使用 getPetWindow() 访问器");
  // 不应直接引用裸变量 dragState 或 petWindow
  assert.doesNotMatch(funcBlock, /(^|\s|[^.])dragState(\s|\)|\|)/, "不应直接引用裸变量 dragState");
  assert.doesNotMatch(funcBlock, /(^|\s|[^.])petWindow(\s|\)|\|)/, "不应直接引用裸变量 petWindow");
});

test("getTaskbarSurfaceForBounds 通过 getPetWindow() 访问器读取，保留 destroyed window guard", () => {
  const funcBlock = controllerSource.match(/function getTaskbarSurfaceForBounds\(bounds\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(funcBlock.length > 0, "应能提取 getTaskbarSurfaceForBounds 函数体");
  assert.match(funcBlock, /getPetWindow\(\)/, "应使用 getPetWindow() 访问器");
  assert.match(funcBlock, /isDestroyed\(\)/, "应保留 destroyed window guard");
});

test("main.cjs 已引入并构造 createScreenMetricsController", () => {
  assert.match(mainSource, /createScreenMetricsController/);
  assert.match(mainSource, /require\(.*screen-metrics/);
  assert.match(mainSource, /const screenMetricsController = createScreenMetricsController\(/);
});

test("main.cjs 保留 8 个薄包装函数声明", () => {
  assert.match(mainSource, /function getTaskbarWalkRunwayPadding\(/);
  assert.match(mainSource, /function getTaskbarWalkRunwayScreenBuffer\(/);
  assert.match(mainSource, /function getTaskbarWalkRunwayWindowWidth\(/);
  assert.match(mainSource, /function getDarwinBottomDock\(/);
  assert.match(mainSource, /function getTaskbarSurface\(/);
  assert.match(mainSource, /function getTaskbarSurfaceForBounds\(/);
  assert.match(mainSource, /function getSurfaceDisplay\(/);
  assert.match(mainSource, /function scheduleDarwinDisplayMetricsSettle\(/);
});

test("main.cjs 薄包装函数体委托给 screenMetricsController", () => {
  assert.match(mainSource, /screenMetricsController\.getTaskbarWalkRunwayPadding\(/);
  assert.match(mainSource, /screenMetricsController\.getTaskbarWalkRunwayScreenBuffer\(/);
  assert.match(mainSource, /screenMetricsController\.getTaskbarWalkRunwayWindowWidth\(/);
  assert.match(mainSource, /screenMetricsController\.getDarwinBottomDock\(/);
  assert.match(mainSource, /screenMetricsController\.getTaskbarSurface\(/);
  assert.match(mainSource, /screenMetricsController\.getTaskbarSurfaceForBounds\(/);
  assert.match(mainSource, /screenMetricsController\.getSurfaceDisplay\(/);
  assert.match(mainSource, /screenMetricsController\.scheduleDarwinDisplayMetricsSettle\(/);
});

test("main.cjs 不再声明 let displayMetricsSettleTimer", () => {
  assert.doesNotMatch(mainSource, /let displayMetricsSettleTimer/, "不应再声明 let displayMetricsSettleTimer");
});

test("main.cjs 新增 clearDisplayMetricsSettleTimer 薄包装", () => {
  assert.match(mainSource, /function clearDisplayMetricsSettleTimer\(\)/, "应定义 clearDisplayMetricsSettleTimer 薄包装");
  assert.match(mainSource, /screenMetricsController\.clearDisplayMetricsSettleTimer\(/, "应委托给 screenMetricsController");
});

test("main.cjs runAppBeforeQuitCleanupSequence 调用 clearDisplayMetricsSettleTimer()", () => {
  const onBeforeQuitBlock = mainSource.match(/function runAppBeforeQuitCleanupSequence\(\)\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.ok(onBeforeQuitBlock.length > 0, "应能提取 runAppBeforeQuitCleanupSequence 函数体");
  assert.match(onBeforeQuitBlock, /clearDisplayMetricsSettleTimer\(\)/, "应调用 clearDisplayMetricsSettleTimer()");
  // 不应直接 clearTimeout(displayMetricsSettleTimer)
  assert.doesNotMatch(onBeforeQuitBlock, /clearTimeout\(\s*displayMetricsSettleTimer\s*\)/, "不应直接 clearTimeout(displayMetricsSettleTimer)");
});

test("main.cjs 仍保留 dock-controller 接线（不回归）", () => {
  assert.match(mainSource, /createDockController/);
  assert.match(mainSource, /dockController\./);
});

test("main.cjs 仍保留 walk-controller 接线（不回归）", () => {
  assert.match(mainSource, /createWalkController/);
  assert.match(mainSource, /walkController\./);
});

test("main.cjs 仍保留 window-roam-controller 接线（不回归）", () => {
  assert.match(mainSource, /createWindowRoamController/);
});
