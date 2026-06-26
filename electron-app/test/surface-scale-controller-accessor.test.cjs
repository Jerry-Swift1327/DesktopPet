// surface-scale-controller-accessor.test.cjs：surface-scale-controller 控制器边界与 main.cjs 薄包装接线结构护栏
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const controllerSourceRaw = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "surface-scale-controller.cjs"), "utf8");
const mainSourceRaw = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
// 剥离注释后再做字符串检查，避免文档性注释误触断言
const controllerSource = controllerSourceRaw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");
const mainSource = mainSourceRaw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

// 从 function 声明起按花括号配对提取函数体（注释已剥离，仅处理字符串与括号/花括号配对）
// 起始定位匹配 "function name("（允许前导空白，以兼容控制器内部缩进声明），
// 参数列表的结束 ")" 由括号配对扫描确定，以支持默认参数中含嵌套括号的情形。
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

test("controller 不直接 require electron/fs/path", () => {
  assert.doesNotMatch(controllerSource, /require\("electron"\)/);
  assert.doesNotMatch(controllerSource, /require\("fs"\)/);
  assert.doesNotMatch(controllerSource, /require\("path"\)/);
});

test("controller 不出现 ipcMain/BrowserWindow/nativeImage/petWindow./safeSend(/broadcastToWindows(/showBubbleMessage(", () => {
  assert.doesNotMatch(controllerSource, /ipcMain/);
  assert.doesNotMatch(controllerSource, /BrowserWindow/);
  assert.doesNotMatch(controllerSource, /nativeImage/);
  assert.doesNotMatch(controllerSource, /petWindow\./);
  assert.doesNotMatch(controllerSource, /safeSend\(/);
  assert.doesNotMatch(controllerSource, /broadcastToWindows\(/);
  assert.doesNotMatch(controllerSource, /showBubbleMessage\(/);
});

test("controller 导出 createSurfaceScaleController", () => {
  assert.match(controllerSource, /module\.exports = \{ createSurfaceScaleController \}/);
});

test("controller 内部声明 petScale/preferredPetScale", () => {
  assert.match(controllerSource, /let petScale = DEFAULT_PET_SCALE/);
  assert.match(controllerSource, /let preferredPetScale = DEFAULT_PET_SCALE/);
});

test("controller 暴露 11 个方法", () => {
  const matches = [...controllerSource.matchAll(/return \{([\s\S]*?)\};/g)];
  const exportBlock = matches.length > 0 ? matches[matches.length - 1][1] : "";
  const expectedExports = [
    "applySurfaceScale",
    "setPetScale",
    "resetPetScale",
    "groundPetToSurface",
    "sendScaleState",
    "buildScaleSummary",
    "getScaleForSurface",
    "writePetScalePreference",
    "readPetScalePreference",
    "getPetScale",
    "getPreferredPetScale"
  ];
  for (const name of expectedExports) {
    assert.match(exportBlock, new RegExp(name), `导出应包含 ${name}`);
  }
});

test("main.cjs 构造 surfaceScaleController", () => {
  assert.match(mainSource, /const surfaceScaleController = createSurfaceScaleController\(/);
});

test("main.cjs 不再顶层声明 petScale/preferredPetScale", () => {
  assert.doesNotMatch(mainSource, /^\s*let petScale =/m);
  assert.doesNotMatch(mainSource, /^\s*let preferredPetScale =/m);
});

test("main.cjs 的 9 个薄包装委托 surfaceScaleController", () => {
  const wrappers = [
    "readPetScalePreference",
    "writePetScalePreference",
    "getScaleForSurface",
    "applySurfaceScale",
    "groundPetToSurface",
    "buildScaleSummary",
    "sendScaleState",
    "setPetScale",
    "resetPetScale"
  ];
  for (const name of wrappers) {
    const body = extractFunctionBody(mainSource, name);
    assert.ok(body.length > 0, `main.cjs 应能提取 ${name} 函数体`);
    assert.match(body, /surfaceScaleController\./, `main.cjs ${name} 应委托 surfaceScaleController`);
  }
});

test("main.cjs overlayGeometry/walkController/dockController context 的 getPetScale/getPreferredPetScale 改读 surfaceScaleController", () => {
  assert.match(mainSource, /getPetScale: \(\) => surfaceScaleController\.getPetScale\(\)/);
  assert.match(mainSource, /getPreferredPetScale: \(\) => surfaceScaleController\.getPreferredPetScale\(\)/);
});

test("main.cjs getPetSpriteSize/getPetWindowWidth/getPetWindowHeight 改读 surfaceScaleController.getPetScale()", () => {
  const fns = ["getPetSpriteSize", "getPetWindowWidth", "getPetWindowHeight"];
  for (const name of fns) {
    const body = extractFunctionBody(mainSource, name);
    assert.ok(body.length > 0, `main.cjs 应能提取 ${name} 函数体`);
    assert.match(body, /surfaceScaleController\.getPetScale\(\)/, `main.cjs ${name} 应读 surfaceScaleController.getPetScale()`);
  }
});

test("handleResetScale 仍以 function 声明在 main.cjs", () => {
  assert.match(mainSource, /^\s*function\s+handleResetScale\s*\(/m);
});

test("getScaleForSurface 临时改写语义保持", () => {
  const body = extractFunctionBody(controllerSource, "getScaleForSurface");
  assert.ok(body.length > 0, "控制器应能提取 getScaleForSurface 函数体");
  assert.match(body, /const currentScale = petScale/);
  assert.match(body, /petScale = currentScale/);
});
