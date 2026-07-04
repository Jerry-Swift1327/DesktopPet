// drag-behavior-guard.test.cjs：drag-controller 拖拽链路结构护栏（运行态迁入控制器/IPC/清理/开始/中/结束/dock 委托）
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

// 剥离注释后再做字符串检查，避免文档性注释误触断言
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

const mainSource = stripComments(
  fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8")
);
const ipcSource = stripComments(
  fs.readFileSync(path.join(__dirname, "..", "electron", "ipc", "register-ipc-handlers.cjs"), "utf8")
);
const dockSource = stripComments(
  fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "dock-controller.cjs"), "utf8")
);
const dragSource = stripComments(
  fs.readFileSync(path.join(__dirname, "..", "electron", "behavior", "drag-controller.cjs"), "utf8")
);

// 从 function 声明起按花括号配对提取函数体（注释已剥离，仅处理字符串与括号/花括号配对）
// 起始定位只匹配 "function name("，参数列表的结束 ")" 由括号配对扫描确定，
// 以支持默认参数中含嵌套括号的情形（如 surface = getCurrentSurface()）。
function extractFunctionBody(source, funcName) {
  const startRe = new RegExp("^\\s*function\\s+" + funcName + "\\s*\\(", "m");
  const startMatch = source.match(startRe);
  if (!startMatch) {
    return "";
  }
  // startMatch[0] 形如 "function name("，从 "(" 之后第一个字符开始扫描参数列表
  let i = startMatch.index + startMatch[0].length;
  // 1) 按括号深度找到参数列表结束的 ")"，跳过字符串引号与反斜杠转义
  let parenDepth = 1;
  while (i < source.length && parenDepth > 0) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          i += 2;
        } else {
          i++;
        }
      }
      i++;
      continue;
    }
    if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth--;
    i++;
  }
  // 此时 i 指向参数列表 ")" 之后的下一个字符；跳过空白，期望下一个非空白为 "{"
  while (i < source.length && /\s/.test(source[i])) {
    i++;
  }
  if (i >= source.length || source[i] !== "{") {
    return "";
  }
  // 2) 从 "{" 之后开始按花括号配对提取函数体（深度从 1 起）
  const bodyStart = i + 1;
  i = bodyStart;
  let depth = 1;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          i += 2;
        } else {
          i++;
        }
      }
      i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    i++;
  }
  return source.slice(bodyStart, i - 1);
}

// 1. 拖拽运行态迁入 drag-controller，main.cjs 不再直接声明
test("drag-controller 保留 dragTimer 运行态变量", () => {
  assert.match(dragSource, /let dragTimer = null\s*;/);
  assert.doesNotMatch(mainSource, /let dragTimer = null\s*;/);
});

test("drag-controller 保留 dragState 运行态变量", () => {
  assert.match(dragSource, /let dragState = null\s*;/);
  assert.doesNotMatch(mainSource, /let dragState = null\s*;/);
});

test("drag-controller 保留 lastDragSample 运行态变量", () => {
  assert.match(dragSource, /let lastDragSample = null\s*;/);
  assert.doesNotMatch(mainSource, /let lastDragSample = null\s*;/);
});

// 2. IPC 注册到 handlers
test("register-ipc-handlers 将 pet:drag-start 注册到 handlers.dragStart", () => {
  assert.match(ipcSource, /ipcMain\.on\("pet:drag-start",\s*handlers\.dragStart\);/);
});

test("register-ipc-handlers 将 pet:drag-end 注册到 handlers.dragEnd", () => {
  assert.match(ipcSource, /ipcMain\.on\("pet:drag-end",\s*handlers\.dragEnd\);/);
});

// 3. handlers 映射到拖拽函数
test("main.cjs handlers.dragStart 映射到 handleDragStart", () => {
  assert.match(mainSource, /dragStart:\s*handleDragStart\s*,/);
});

test("main.cjs handlers.dragEnd 映射到 handleDragEnd", () => {
  assert.match(mainSource, /dragEnd:\s*handleDragEnd\b/);
});

// 4. clearDragState 护栏
test("clearDragState 清空 dragState", () => {
  const body = extractFunctionBody(dragSource, "clearDragState");
  assert.ok(body, "clearDragState 函数体应能被提取");
  assert.match(body, /dragState\s*=\s*null/);
});

test("clearDragState 调用 clearInterval(dragTimer)", () => {
  const body = extractFunctionBody(dragSource, "clearDragState");
  assert.ok(body, "clearDragState 函数体应能被提取");
  assert.match(body, /clearInterval\(dragTimer\)/);
});

test("clearDragState 清空 dragTimer", () => {
  const body = extractFunctionBody(dragSource, "clearDragState");
  assert.ok(body, "clearDragState 函数体应能被提取");
  assert.match(body, /dragTimer\s*=\s*null/);
});

test("clearDragState 依据 keepPause 决定是否解除暂停", () => {
  const body = extractFunctionBody(dragSource, "clearDragState");
  assert.ok(body, "clearDragState 函数体应能被提取");
  assert.match(body, /keepPause/);
});

test("clearDragState 调用 removeInteractionPause(\"drag\")", () => {
  const body = extractFunctionBody(dragSource, "clearDragState");
  assert.ok(body, "clearDragState 函数体应能被提取");
  assert.match(body, /removeInteractionPause\("drag"\)/);
});

test("clearDragState 调用 sendDragState(false)", () => {
  const body = extractFunctionBody(dragSource, "clearDragState");
  assert.ok(body, "clearDragState 函数体应能被提取");
  assert.match(body, /sendDragState\(false\)/);
});

// 5. handleDragStart 护栏
test("handleDragStart 校验 isScreenPoint(point)", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /isScreenPoint\(point\)/);
});

test("handleDragStart 校验 isCustomizationVisible()", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /isCustomizationVisible\(\)/);
});

test("handleDragStart 调用 materializeTaskbarWalkRunway", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /materializeTaskbarWalkRunway/);
});

test("handleDragStart 调用 recordUserOperation()", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /recordUserOperation\(\)/);
});

test("handleDragStart 调用 clearDragState({ notify: false })", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /clearDragState\(\{\s*notify:\s*false\s*\}\)/);
});

test("handleDragStart 调用 addInteractionPause(\"drag\")", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /addInteractionPause\("drag"\)/);
});

test("handleDragStart 调用 clearHoverIntent()", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /clearHoverIntent\(\)/);
});

test("handleDragStart 调用 hideStartupBubble({ force: true })", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /hideStartupBubble\(\{\s*force:\s*true\s*\}\)/);
});

test("handleDragStart 调用 hidePetMenu()", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /hidePetMenu\(\)/);
});

test("handleDragStart 调用 hideHoverPanel()", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /hideHoverPanel\(\)/);
});

test("handleDragStart 调用 hideCustomizationPanel()", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /hideCustomizationPanel\(\)/);
});

test("handleDragStart 初始化 dragState 对象", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /dragState\s*=\s*\{/);
});

test("handleDragStart 同步 lastDragSample = dragState.lastSample", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /lastDragSample\s*=\s*dragState\.lastSample/);
});

test("handleDragStart 调用 sendDragState(true)", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /sendDragState\(true\)/);
});

test("handleDragStart 调用 startDragTimer()", () => {
  const body = extractFunctionBody(dragSource, "handleDragStart");
  assert.ok(body, "handleDragStart 函数体应能被提取");
  assert.match(body, /startDragTimer\(\)/);
});

// 6. updateDragPosition 护栏
test("updateDragPosition 前置判断 !dragState", () => {
  const body = extractFunctionBody(dragSource, "updateDragPosition");
  assert.ok(body, "updateDragPosition 函数体应能被提取");
  assert.match(body, /!dragState/);
});

test("updateDragPosition 调用 getCursorScreenPoint()", () => {
  const body = extractFunctionBody(dragSource, "updateDragPosition");
  assert.ok(body, "updateDragPosition 函数体应能被提取");
  assert.match(body, /getCursorScreenPoint\(\)/);
});

test("updateDragPosition 读取 dragState.lastSample", () => {
  const body = extractFunctionBody(dragSource, "updateDragPosition");
  assert.ok(body, "updateDragPosition 函数体应能被提取");
  assert.match(body, /dragState\.lastSample/);
});

test("updateDragPosition 计算 speedPxPerSec", () => {
  const body = extractFunctionBody(dragSource, "updateDragPosition");
  assert.ok(body, "updateDragPosition 函数体应能被提取");
  assert.match(body, /speedPxPerSec/);
});

test("updateDragPosition 调用 clampPetWindowPosition(", () => {
  const body = extractFunctionBody(dragSource, "updateDragPosition");
  assert.ok(body, "updateDragPosition 函数体应能被提取");
  assert.match(body, /clampPetWindowPosition\(/);
});

test("updateDragPosition 调用 setPetWindowPosition(", () => {
  const body = extractFunctionBody(dragSource, "updateDragPosition");
  assert.ok(body, "updateDragPosition 函数体应能被提取");
  assert.match(body, /setPetWindowPosition\(/);
});

test("updateDragPosition 调用 getLastWindowSurfaceAsyncRefreshAt()", () => {
  const body = extractFunctionBody(dragSource, "updateDragPosition");
  assert.ok(body, "updateDragPosition 函数体应能被提取");
  assert.match(body, /getLastWindowSurfaceAsyncRefreshAt\(\)/);
});

test("updateDragPosition 调用 refreshWindowSurfaceCandidatesAsync()", () => {
  const body = extractFunctionBody(dragSource, "updateDragPosition");
  assert.ok(body, "updateDragPosition 函数体应能被提取");
  assert.match(body, /refreshWindowSurfaceCandidatesAsync\(\)/);
});

// 7. handleDragEnd 护栏
test("handleDragEnd 调用 petWindow.getBounds()", () => {
  const body = extractFunctionBody(dragSource, "handleDragEnd");
  assert.ok(body, "handleDragEnd 函数体应能被提取");
  assert.match(body, /petWindow\.getBounds\(\)/);
});

test("handleDragEnd 同步 lastDragSample = dragState.lastSample", () => {
  const body = extractFunctionBody(dragSource, "handleDragEnd");
  assert.ok(body, "handleDragEnd 函数体应能被提取");
  assert.match(body, /lastDragSample\s*=\s*dragState\.lastSample/);
});

test("handleDragEnd 调用 clearDragState({ notify: true, keepPause: true })", () => {
  const body = extractFunctionBody(dragSource, "handleDragEnd");
  assert.ok(body, "handleDragEnd 函数体应能被提取");
  assert.match(body, /clearDragState\(\{\s*notify:\s*true,\s*keepPause:\s*true\s*\}\)/);
});

test("handleDragEnd 调用 dockPetAfterDrag()", () => {
  const body = extractFunctionBody(dragSource, "handleDragEnd");
  assert.ok(body, "handleDragEnd 函数体应能被提取");
  assert.match(body, /dockPetAfterDrag\(\)/);
});

test("handleDragEnd 调用 clearDragState({ notify: true })", () => {
  const body = extractFunctionBody(dragSource, "handleDragEnd");
  assert.ok(body, "handleDragEnd 函数体应能被提取");
  assert.match(body, /clearDragState\(\{\s*notify:\s*true\s*\}\)/);
});

// 8. dock 接线不被内联
test("main.cjs dockPetAfterDrag 委托 dockController.dockPetAfterDrag", () => {
  const body = extractFunctionBody(mainSource, "dockPetAfterDrag");
  assert.ok(body, "dockPetAfterDrag 函数体应能被提取");
  assert.match(body, /dockController\.dockPetAfterDrag/);
});

test("main.cjs applyDockSurfaceAfterDrag 委托 dockController.applyDockSurfaceAfterDrag", () => {
  const body = extractFunctionBody(mainSource, "applyDockSurfaceAfterDrag");
  assert.ok(body, "applyDockSurfaceAfterDrag 函数体应能被提取");
  assert.match(body, /dockController\.applyDockSurfaceAfterDrag/);
});

test("main.cjs fallbackToTaskbarAfterDrag 直接回任务栏并恢复行走跑道", () => {
  const body = extractFunctionBody(mainSource, "fallbackToTaskbarAfterDrag");
  assert.ok(body, "fallbackToTaskbarAfterDrag 函数体应能被提取");
  assert.match(body, /restoreTaskbarRunwayFromPoint\(/);
  assert.match(body, /groundPetToSurface\(/);
  assert.doesNotMatch(body, /animatePetWindowTransition\(/);
});

test("dock-controller 导出 dockPetAfterDrag", () => {
  assert.match(dockSource, /dockPetAfterDrag/);
});

test("dock-controller 导出 applyDockSurfaceAfterDrag", () => {
  assert.match(dockSource, /applyDockSurfaceAfterDrag/);
});

test("main.cjs settlePetInPlaceAfterDrag keeps the drag release position", () => {
  const body = extractFunctionBody(mainSource, "settlePetInPlaceAfterDrag");
  assert.ok(body, "settlePetInPlaceAfterDrag function body should be extractable");
  assert.match(body, /resetToTaskbarSurface\(/);
  assert.match(body, /setPetWindowPosition\(next\.x,\s*next\.y\)/);
  assert.match(body, /syncWalkTrackX\(next\.x\)/);
  assert.doesNotMatch(body, /groundPetToSurface\(/);
  assert.doesNotMatch(body, /restoreTaskbarRunwayFromPoint\(/);
});

test("dock-controller settles in place when drag release misses window surfaces", () => {
  assert.match(dockSource, /settlePetInPlaceAfterDrag\(bounds,\s*diagnostic\.reason \|\| "snap-missed"\)/);
});
