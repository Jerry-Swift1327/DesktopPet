const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "walk-controller.cjs"), "utf8");
const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const registerIpcSource = fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", "register-ipc-handlers.cjs"), "utf8");

test("walk-controller 不再按值解构运行时可变状态，全部改为访问器", () => {
  // 提取 context 解构块（从 "const {" 到 "} = context;"）
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";

  // 不应出现按值解构的 6 个可变状态（作为独立标识符，而非 getter 名称的一部分）
  // 检查 "petWindow" 不作为独立解构项出现（getPetWindow 是允许的）
  assert.doesNotMatch(contextBlock, /(^|\s|,)petWindow(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)activeState(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)petScale(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)preferredPetScale(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)interactionPauseReasons(\s|,|$)/m);
  assert.doesNotMatch(contextBlock, /(^|\s|,)walkTrackX(\s|,|$)/m);

  // 应出现对应的 getter 访问器
  assert.match(contextBlock, /getPetWindow/);
  assert.match(contextBlock, /getActiveState/);
  assert.match(contextBlock, /getPetScale/);
  assert.match(contextBlock, /getPreferredPetScale/);
  assert.match(contextBlock, /getInteractionPauseReasons/);
  assert.match(contextBlock, /getWalkTrackX/);
});

test("walk-controller 不再声明内部 let 重复状态", () => {
  const forbiddenLets = [
    "let walkLoop",
    "let walkLoopTimer",
    "let walkPausedAt",
    "let nextWalkStartDirection",
    "let walkDirection",
    "let walkLeftEdgeStuckSteps",
    "let walkRightEdgeStuckSteps",
    "let walkMirrorCooldownSteps",
    "let stalledWalkSteps",
    "let lastWalkStepAt",
    "let lastWalkScaleApplyAt",
    "let lastWalkSurfaceSignature"
  ];
  for (const pattern of forbiddenLets) {
    assert.doesNotMatch(controllerSource, new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `不应出现 ${pattern}`);
  }
});

test("walk-controller context 包含全部 getter/setter 访问器", () => {
  const contextBlock = controllerSource.match(/const \{([\s\S]*?)\} = context;/)?.[1] || "";

  // 行走运行时状态 getter/setter
  const requiredAccessors = [
    "getWalkDirection",
    "getWalkLoop",
    "setWalkLoop",
    "getWalkLoopTimer",
    "setWalkLoopTimer",
    "getWalkPausedAt",
    "setWalkPausedAt",
    "getNextWalkStartDirection",
    "setNextWalkStartDirection",
    "getWalkLeftEdgeStuckSteps",
    "setWalkLeftEdgeStuckSteps",
    "getWalkRightEdgeStuckSteps",
    "setWalkRightEdgeStuckSteps",
    "getWalkMirrorCooldownSteps",
    "setWalkMirrorCooldownSteps",
    "getStalledWalkSteps",
    "setStalledWalkSteps",
    "getLastWalkStepAt",
    "setLastWalkStepAt",
    "getLastWalkScaleApplyAt",
    "setLastWalkScaleApplyAt",
    "getLastWalkSurfaceSignature",
    "setLastWalkSurfaceSignature"
  ];
  for (const accessor of requiredAccessors) {
    assert.match(contextBlock, new RegExp(accessor), `context 应包含 ${accessor}`);
  }

  // setWalkDirection 和 syncWalkTrackX 应作为依赖函数存在（不在 getter/setter 区，但在 context 中）
  assert.match(contextBlock, /setWalkDirection/);
  assert.match(contextBlock, /syncWalkTrackX/);
  assert.match(contextBlock, /getWalkVisibleRectFromWindowX/);
  assert.match(contextBlock, /getWindowXForVisibleEdge/);
  assert.match(contextBlock, /getSafeWindowXForDirection/);
  assert.doesNotMatch(contextBlock, /getWindowXForWalkFrameVisibleCenter/);
});

test("walk-controller 内部使用 getter 调用而非裸变量读取", () => {
  // 检查关键 getter 调用存在
  assert.match(controllerSource, /getWalkDirection\(\)/);
  assert.match(controllerSource, /getWalkLoop\(\)/);
  assert.match(controllerSource, /getWalkTrackX\(\)/);
  assert.match(controllerSource, /getPetWindow\(\)/);
  assert.match(controllerSource, /getActiveState\(\)/);
  assert.match(controllerSource, /getPetScale\(\)/);
  assert.match(controllerSource, /getPreferredPetScale\(\)/);
  assert.match(controllerSource, /getInteractionPauseReasons\(\)/);
  assert.match(controllerSource, /getWalkPausedAt\(\)/);
  assert.match(controllerSource, /getNextWalkStartDirection\(\)/);
  assert.match(controllerSource, /getStalledWalkSteps\(\)/);
  assert.match(controllerSource, /getLastWalkStepAt\(\)/);
  assert.match(controllerSource, /getLastWalkScaleApplyAt\(\)/);
  assert.match(controllerSource, /getLastWalkSurfaceSignature\(\)/);
});

test("walk-controller 内部使用 setter 调用而非裸变量赋值", () => {
  // 检查不再出现裸赋值模式（排除注释行）
  const codeLines = controllerSource.split("\n").filter((line) => !line.trim().startsWith("//"));
  const codeWithoutComments = codeLines.join("\n");

  // 不应出现这些赋值模式
  assert.doesNotMatch(codeWithoutComments, /walkDirection\s*=/);
  assert.doesNotMatch(codeWithoutComments, /walkLoop\s*=/);
  assert.doesNotMatch(codeWithoutComments, /walkLoopTimer\s*=/);
  assert.doesNotMatch(codeWithoutComments, /walkPausedAt\s*=/);
  assert.doesNotMatch(codeWithoutComments, /nextWalkStartDirection\s*=/);
  assert.doesNotMatch(codeWithoutComments, /walkLeftEdgeStuckSteps\s*=/);
  assert.doesNotMatch(codeWithoutComments, /walkRightEdgeStuckSteps\s*=/);
  assert.doesNotMatch(codeWithoutComments, /walkMirrorCooldownSteps\s*=/);
  assert.doesNotMatch(codeWithoutComments, /stalledWalkSteps\s*=/);
  assert.doesNotMatch(codeWithoutComments, /lastWalkStepAt\s*=/);
  assert.doesNotMatch(codeWithoutComments, /lastWalkScaleApplyAt\s*=/);
  assert.doesNotMatch(codeWithoutComments, /lastWalkSurfaceSignature\s*=/);

  // 应出现 setter 调用
  assert.match(codeWithoutComments, /setWalkDirection\(/);
  assert.match(codeWithoutComments, /setWalkLoop\(/);
  assert.match(codeWithoutComments, /setWalkLoopTimer\(/);
  assert.match(codeWithoutComments, /setWalkPausedAt\(/);
  assert.match(codeWithoutComments, /setNextWalkStartDirection\(/);
  assert.match(codeWithoutComments, /setStalledWalkSteps\(/);
  assert.match(codeWithoutComments, /setLastWalkStepAt\(/);
  assert.match(codeWithoutComments, /setLastWalkScaleApplyAt\(/);
  assert.match(codeWithoutComments, /setLastWalkSurfaceSignature\(/);
  assert.match(codeWithoutComments, /syncWalkTrackX\(/);
});

test("walk-controller 不引用 dock-controller", () => {
  assert.doesNotMatch(controllerSource, /dock-controller/);
  assert.doesNotMatch(controllerSource, /dockPetAfterDrag/);
  assert.doesNotMatch(controllerSource, /windowSurfacePoll/);
});

test("walk-controller 保留关键分支标记确保逻辑未丢失", () => {
  assert.match(controllerSource, /reason=walk-loop-complete/);
  assert.match(controllerSource, /reason=paused/);
  assert.match(controllerSource, /reason=not-walking/);
  assert.match(controllerSource, /edgeFlip=/);
  assert.match(controllerSource, /left-center/);
  assert.match(controllerSource, /right-center/);
  assert.match(controllerSource, /left-threshold/);
  assert.match(controllerSource, /right-threshold/);
  // left-stuck / right-stuck 原位于窗口分支 isTaskbarSurface 死分支内（该标志在窗口路径恒为
  // false，非 window 表面已提前走 advanceTaskbarWalkStep），Phase 2 重构移除该死分支；
  // 此处保留 left-center-stuck / right-center-stuck（taskbar 路径，可达）。
  assert.match(controllerSource, /left-center-stuck/);
  assert.match(controllerSource, /right-center-stuck/);
  // 守护：窗口分支不得再引入 isTaskbarSurface / preserveRightEdgeX 死代码
  assert.doesNotMatch(controllerSource, /isTaskbarSurface/);
  assert.doesNotMatch(controllerSource, /preserveRightEdgeX/);
});

test("window surface walk 使用 state 级可见中心而非逐帧 X 补偿", () => {
  assert.match(
    controllerSource,
    /const previousX = getWalkTrackX\(\) \?\? bounds\.x;/
  );
  assert.match(
    controllerSource,
    /const actualX = setWalkWindowPosition\(nextX, groundedY, activeSurface, getWalkDirection\(\)\);/
  );
  assert.doesNotMatch(controllerSource, /trackCenterX/);
  assert.doesNotMatch(controllerSource, /getWindowXForWalkFrameVisibleCenter/);
  assert.doesNotMatch(mainSource, /getWindowXForWalkFrameVisibleCenter/);
  assert.doesNotMatch(mainSource, /getWalkFrameIndexForStep/);
});

test("main.cjs window surface walk alignment writes a plain window X target", () => {
  assert.match(
    mainSource,
    /setWalkWindowPosition\(targetX,\s*groundedY,\s*activeSurface,\s*walkDirection\);/
  );
  assert.doesNotMatch(mainSource, /trackCenterX/);
});

test("main.cjs window walk sync keeps an existing real X track instead of reading stale bounds", () => {
  assert.match(
    mainSource,
    /surface\?\.type === "window" && isWalkingState\(\) && Number\.isFinite\(walkTrackX\)/
  );
  assert.match(
    mainSource,
    /\? walkTrackX\s*:\s*bounds\.x;/
  );
});

test("walk-controller 保留 6 个导出函数", () => {
  assert.match(controllerSource, /function scheduleWalkLoopTimeout\(\)/);
  assert.match(controllerSource, /function startWalkLoop\(\)/);
  assert.match(controllerSource, /function refreshWalkLoopAfterSurfaceChange\(\)/);
  assert.match(controllerSource, /function completeWalkLoop\(\)/);
  assert.match(controllerSource, /function advanceTaskbarWalkStep\(/);
  assert.match(controllerSource, /function advanceWalkStep\(/);

  // 导出对象包含全部 6 个函数
  const exportBlock = controllerSource.match(/return \{([\s\S]*?)\};/)?.[1] || "";
  assert.match(exportBlock, /scheduleWalkLoopTimeout/);
  assert.match(exportBlock, /startWalkLoop/);
  assert.match(exportBlock, /refreshWalkLoopAfterSurfaceChange/);
  assert.match(exportBlock, /completeWalkLoop/);
  assert.match(exportBlock, /advanceTaskbarWalkStep/);
  assert.match(exportBlock, /advanceWalkStep/);
});

test("register-ipc-handlers.cjs 仍保留 advance-walk-step IPC 入口名称不变", () => {
  assert.match(registerIpcSource, /ipcMain\.handle\(\s*['"]pet:advance-walk-step['"]/);
});

test("main.cjs 仍保留 pauseWalkLoopClock/resumeWalkLoopClock/resetWalkRuntime 函数声明", () => {
  assert.match(mainSource, /function pauseWalkLoopClock\(\)/);
  assert.match(mainSource, /function resumeWalkLoopClock\(\)/);
  assert.match(mainSource, /function resetWalkRuntime\(/);
});

test("main.cjs 已引入并构造 createWalkController", () => {
  assert.match(mainSource, /createWalkController/);
  assert.match(mainSource, /require\(.*walk-controller/);
  assert.match(mainSource, /const walkController = createWalkController\(/);
});

test("main.cjs 保留 6 个薄包装函数声明", () => {
  assert.match(mainSource, /function scheduleWalkLoopTimeout\(\)/);
  assert.match(mainSource, /function startWalkLoop\(\)/);
  assert.match(mainSource, /function refreshWalkLoopAfterSurfaceChange\(\)/);
  assert.match(mainSource, /function completeWalkLoop\(\)/);
  assert.match(mainSource, /function advanceTaskbarWalkStep\(/);
  assert.match(mainSource, /function advanceWalkStep\(/);
});

test("main.cjs 薄包装函数体委托给 walkController", () => {
  assert.match(mainSource, /walkController\.scheduleWalkLoopTimeout\(\)/);
  assert.match(mainSource, /walkController\.startWalkLoop\(\)/);
  assert.match(mainSource, /walkController\.refreshWalkLoopAfterSurfaceChange\(\)/);
  assert.match(mainSource, /walkController\.completeWalkLoop\(\)/);
  assert.match(mainSource, /walkController\.advanceTaskbarWalkStep\(/);
  assert.match(mainSource, /walkController\.advanceWalkStep\(/);
});
