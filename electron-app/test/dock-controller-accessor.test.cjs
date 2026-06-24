const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "dock-controller.cjs"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");

test("dock-controller 不再按值解构运行时可变状态，全部改为访问器", () => {
  // 提取 context 解构块（从 "const {" 到 "} = context;"）
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";

  // 不应出现按值解构的 9 个可变状态（作为独立标识符，而非 getter 名称的一部分）
  // 检查 "petWindow" 不作为独立解构项出现（getPetWindow 是允许的）
  assert.doesNotMatch(contextBlock, /(^|\s|,)petWindow(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)currentSurface(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)activeState(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)walkDirection(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)dragState(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)petRuntimeConfig(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)petScale(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)preferredPetScale(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)windowRoamEnabledCache(\s|,|$)/m);

  // 应出现对应的 getter 访问器（getCurrentSurface 已作为依赖函数存在，不需要单独断言）
  assert.match(contextBlock, /getPetWindow/);
  assert.match(contextBlock, /getActiveState/);
  assert.match(contextBlock, /getWalkDirection/);
  assert.match(contextBlock, /getDragState/);
  assert.match(contextBlock, /getPetRuntimeConfig/);
  assert.match(contextBlock, /getPetScale/);
  assert.match(contextBlock, /getPreferredPetScale/);
  assert.match(contextBlock, /getWindowRoamEnabled/);
});

test("dock-controller 不再声明内部 windowRoam* 状态副本", () => {
  const forbiddenLets = [
    "let windowRoamLastTargetId",
    "let windowRoamPreferredTargetId",
    "let windowRoamSuppressedWindowId",
    "let windowRoamDragFallbackSuppressedUntil",
    "let windowRoamMissingTicks"
  ];
  for (const pattern of forbiddenLets) {
    assert.doesNotMatch(controllerSource, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `不应出现 ${pattern}`);
  }
});

test("dock-controller 不再声明内部贴靠状态 let", () => {
  const forbiddenLets = [
    "let windowSurfacePollTimer",
    "let lastWindowSurfaceHeavyCheckAt",
    "let windowSurfaceMissingTicks",
    "let windowDockInProgress",
    "let windowDockHoverSuppressedUntil"
  ];
  for (const pattern of forbiddenLets) {
    assert.doesNotMatch(controllerSource, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `不应出现 ${pattern}`);
  }
});

test("dock-controller context 包含必要 getter/setter 访问器与协作方法", () => {
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";

  // 8 个 getter 访问器（读取 main.cjs 实时状态）
  const requiredGetters = [
    "getPetWindow",
    "getActiveState",
    "getWalkDirection",
    "getDragState",
    "getPetRuntimeConfig",
    "getPetScale",
    "getPreferredPetScale",
    "getWindowRoamEnabled"
  ];
  for (const accessor of requiredGetters) {
    assert.match(contextBlock, new RegExp(accessor), `context 应包含 ${accessor}`);
  }

  // 5 对 getter/setter 访问器（贴靠轮询状态，状态存储于 main.cjs）
  const requiredPairs = [
    "getWindowSurfacePollTimer",
    "setWindowSurfacePollTimer",
    "getLastWindowSurfaceHeavyCheckAt",
    "setLastWindowSurfaceHeavyCheckAt",
    "getWindowSurfaceMissingTicks",
    "setWindowSurfaceMissingTicks",
    "getWindowDockInProgress",
    "setWindowDockInProgress",
    "getWindowDockHoverSuppressedUntil",
    "setWindowDockHoverSuppressedUntil"
  ];
  for (const accessor of requiredPairs) {
    assert.match(contextBlock, new RegExp(accessor), `context 应包含 ${accessor}`);
  }

  // 5 个 window-roam-controller 协作方法（状态由 window-roam-controller 统一维护）
  const requiredCollaborators = [
    "rememberDockedWindowRoamTarget",
    "clearWindowRoamSuppression",
    "suppressPreviousWindowAfterDockMiss",
    "setDragFallbackSuppressionUntil",
    "markWindowRoamAttached"
  ];
  for (const method of requiredCollaborators) {
    assert.match(contextBlock, new RegExp(method), `context 应包含 ${method}`);
  }

  // 2 个已存在的协作方法
  assert.match(contextBlock, /getTopWindowRoamSurface/);
  assert.match(contextBlock, /attachPetToWindowRoamSurface/);
});

test("dock-controller 内部使用 getter 调用而非裸变量读取", () => {
  // 检查关键 getter 调用存在
  assert.match(controllerSource, /getPetWindow\(\)/);
  assert.match(controllerSource, /getCurrentSurface\(\)/);
  assert.match(controllerSource, /getActiveState\(\)/);
  assert.match(controllerSource, /getWalkDirection\(\)/);
  assert.match(controllerSource, /getDragState\(\)/);
  assert.match(controllerSource, /getPetRuntimeConfig\(\)/);
  assert.match(controllerSource, /getPetScale\(\)/);
  assert.match(controllerSource, /getPreferredPetScale\(\)/);
  assert.match(controllerSource, /getWindowRoamEnabled\(\)/);
});

test("dock-controller 内部使用 setter 调用而非裸变量赋值", () => {
  // 检查不再出现裸赋值模式（排除注释行）
  const codeLines = controllerSource.split("\n").filter((line) => !line.trim().startsWith("//"));
  const codeWithoutComments = codeLines.join("\n");

  // 不应出现这些裸赋值模式
  assert.doesNotMatch(codeWithoutComments, /windowSurfacePollTimer\s*=/);
  assert.doesNotMatch(codeWithoutComments, /lastWindowSurfaceHeavyCheckAt\s*=/);
  assert.doesNotMatch(codeWithoutComments, /windowSurfaceMissingTicks\s*=/);
  assert.doesNotMatch(codeWithoutComments, /windowDockInProgress\s*=/);
  assert.doesNotMatch(codeWithoutComments, /windowDockHoverSuppressedUntil\s*=/);

  // 应出现 setter 调用
  assert.match(codeWithoutComments, /setWindowSurfacePollTimer\(/);
  assert.match(codeWithoutComments, /setLastWindowSurfaceHeavyCheckAt\(/);
  assert.match(codeWithoutComments, /setWindowSurfaceMissingTicks\(/);
  assert.match(codeWithoutComments, /setWindowDockInProgress\(/);
  assert.match(codeWithoutComments, /setWindowDockHoverSuppressedUntil\(/);
});

test("dock-controller 内部使用协作方法调用而非 windowRoam* 赋值", () => {
  // 检查不再出现裸赋值模式（排除注释行）
  const codeLines = controllerSource.split("\n").filter((line) => !line.trim().startsWith("//"));
  const codeWithoutComments = codeLines.join("\n");

  // 不应出现这些裸赋值模式
  assert.doesNotMatch(codeWithoutComments, /windowRoamLastTargetId\s*=/);
  assert.doesNotMatch(codeWithoutComments, /windowRoamPreferredTargetId\s*=/);
  assert.doesNotMatch(codeWithoutComments, /windowRoamSuppressedWindowId\s*=/);
  assert.doesNotMatch(codeWithoutComments, /windowRoamDragFallbackSuppressedUntil\s*=/);
  assert.doesNotMatch(codeWithoutComments, /windowRoamMissingTicks\s*=/);

  // 应出现协作方法调用
  assert.match(codeWithoutComments, /rememberDockedWindowRoamTarget\(/);
  assert.match(codeWithoutComments, /clearWindowRoamSuppression\(/);
  assert.match(codeWithoutComments, /suppressPreviousWindowAfterDockMiss\(/);
  assert.match(codeWithoutComments, /setDragFallbackSuppressionUntil\(/);
  assert.match(codeWithoutComments, /markWindowRoamAttached\(/);
});

test("dock-controller 保留 8 个核心导出函数", () => {
  // 检查函数声明
  assert.match(controllerSource, /function applyDockSurfaceAfterDrag\(/);
  assert.match(controllerSource, /function finishWindowDockAfterDrag\(\)/);
  assert.match(controllerSource, /function dockPetAfterDrag\(/);
  assert.match(controllerSource, /function validateCurrentWindowSurface\(/);
  assert.match(controllerSource, /function isPetStillDockedOnWindowSurface\(/);
  assert.match(controllerSource, /function fallbackCurrentSurfaceToTaskbar\(/);
  assert.match(controllerSource, /function startWindowSurfacePolling\(\)/);
  assert.match(controllerSource, /function stopWindowSurfacePolling\(\)/);

  // 导出对象包含全部 8 个函数
  const exportBlock = controllerSource.match(/return \{([\s\S]*?)\};/)?.[1] || "";
  assert.match(exportBlock, /applyDockSurfaceAfterDrag/);
  assert.match(exportBlock, /finishWindowDockAfterDrag/);
  assert.match(exportBlock, /dockPetAfterDrag/);
  assert.match(exportBlock, /validateCurrentWindowSurface/);
  assert.match(exportBlock, /isPetStillDockedOnWindowSurface/);
  assert.match(exportBlock, /fallbackCurrentSurfaceToTaskbar/);
  assert.match(exportBlock, /startWindowSurfacePolling/);
  assert.match(exportBlock, /stopWindowSurfacePolling/);
});

test("main.cjs 已引入并构造 createDockController", () => {
  assert.match(mainSource, /createDockController/);
  assert.match(mainSource, /require\(.*dock-controller/);
  assert.match(mainSource, /const dockController = createDockController\(/);
});

test("main.cjs 保留 8 个薄包装函数声明", () => {
  assert.match(mainSource, /function applyDockSurfaceAfterDrag\(/);
  assert.match(mainSource, /function finishWindowDockAfterDrag\(/);
  assert.match(mainSource, /function dockPetAfterDrag\(/);
  assert.match(mainSource, /function validateCurrentWindowSurface\(/);
  assert.match(mainSource, /function isPetStillDockedOnWindowSurface\(/);
  assert.match(mainSource, /function fallbackCurrentSurfaceToTaskbar\(/);
  assert.match(mainSource, /function startWindowSurfacePolling\(/);
  assert.match(mainSource, /function stopWindowSurfacePolling\(/);
});

test("main.cjs 薄包装函数体委托给 dockController", () => {
  assert.match(mainSource, /dockController\.applyDockSurfaceAfterDrag\(/);
  assert.match(mainSource, /dockController\.finishWindowDockAfterDrag\(/);
  assert.match(mainSource, /dockController\.dockPetAfterDrag\(/);
  assert.match(mainSource, /dockController\.validateCurrentWindowSurface\(/);
  assert.match(mainSource, /dockController\.isPetStillDockedOnWindowSurface\(/);
  assert.match(mainSource, /dockController\.fallbackCurrentSurfaceToTaskbar\(/);
  assert.match(mainSource, /dockController\.startWindowSurfacePolling\(/);
  assert.match(mainSource, /dockController\.stopWindowSurfacePolling\(/);
});

test("dock-controller 使用 features.dockShake 而非硬编码 variant === tabby", () => {
  // 应使用 features.dockShake
  assert.match(controllerSource, /features\.dockShake/);
  // 不应使用 variant === "tabby"（在非注释行中）
  const codeLines = controllerSource.split("\n").filter((line) => !line.trim().startsWith("//"));
  const codeWithoutComments = codeLines.join("\n");
  assert.doesNotMatch(codeWithoutComments, /variant === "tabby"/);
});

test("dock-controller finishWindowDockAfterDrag 包含 dock-finish 诊断日志", () => {
  assert.match(controllerSource, /dock-finish/);
  assert.match(controllerSource, /logWalkDiagnostic\(/);
});

test("dock-controller retry 使用 retryDockPetAfterDrag 依赖", () => {
  assert.match(controllerSource, /retryDockPetAfterDrag/);
  // retry 分支应调用 retryDockPetAfterDrag 而非直接调用 dockPetAfterDrag
  assert.match(controllerSource, /retryDockPetAfterDrag\(\{ retry: true \}\)/);
});

test("main.cjs 注入 retryDockPetAfterDrag 委托给薄包装", () => {
  assert.match(mainSource, /retryDockPetAfterDrag/);
  assert.match(mainSource, /dockPetAfterDrag\(\.\.\.args\)/);
});

test("main.cjs 仍保留 walk-controller 接线（不回归）", () => {
  assert.match(mainSource, /createWalkController/);
  assert.match(mainSource, /walkController\./);
});

test("main.cjs 仍保留 window-roam-controller 接线（不回归）", () => {
  assert.match(mainSource, /createWindowRoamController/);
});

test("dock-controller 保留关键控制流标记确保逻辑未丢失", () => {
  assert.match(controllerSource, /dock-after-drag/);
  assert.match(controllerSource, /window-surface-detached/);
  assert.match(controllerSource, /window-surface invalidated/);
  assert.match(controllerSource, /snap-missed/);
  assert.match(controllerSource, /dock-exception/);
  assert.match(controllerSource, /empty-cache/);
  assert.match(controllerSource, /no-window-candidates/);
});
