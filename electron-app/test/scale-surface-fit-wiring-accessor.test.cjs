// scale-surface-fit-wiring-accessor.test.cjs：main.cjs 缩放与 surface-fit 薄包装接线结构护栏。
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSourceRaw = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
// 剥离注释后再做字符串检查，避免文档性注释误触断言
const mainSource = mainSourceRaw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

// 从 function 声明起按花括号配对提取函数体（注释已剥离，仅处理字符串与括号/花括号配对）
// 起始定位只匹配 "function name("，参数列表的结束 ")" 由括号配对扫描确定，
// 以支持默认参数中含嵌套括号的情形（如 surface = getCurrentSurface()）。
function extractFunctionBody(source, funcName) {
  const startRe = new RegExp("^function\\s+" + funcName + "\\s*\\(", "m");
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

test("getPetWindowWidth 委托 petScaleRules", () => {
  const body = extractFunctionBody(mainSource, "getPetWindowWidth");
  assert.match(body, /petScaleRules\./);
});

test("getPetWindowHeight 委托 petScaleRules", () => {
  const body = extractFunctionBody(mainSource, "getPetWindowHeight");
  assert.match(body, /petScaleRules\./);
});

test("getPetSpriteSize 委托 petScaleRules", () => {
  const body = extractFunctionBody(mainSource, "getPetSpriteSize");
  assert.match(body, /petScaleRules\./);
});

test("clampPetScale 委托 petScaleRules", () => {
  const body = extractFunctionBody(mainSource, "clampPetScale");
  assert.match(body, /petScaleRules\./);
});

test("getSurfaceVisibleTop 委托 surfaceFitRules", () => {
  const body = extractFunctionBody(mainSource, "getSurfaceVisibleTop");
  assert.match(body, /surfaceFitRules\./);
});

test("getGroundedWindowYForSurface 委托 surfaceFitRules", () => {
  const body = extractFunctionBody(mainSource, "getGroundedWindowYForSurface");
  assert.match(body, /surfaceFitRules\./);
});

test("clampPetWindowPositionToSurface 委托 surfaceFitRules", () => {
  const body = extractFunctionBody(mainSource, "clampPetWindowPositionToSurface");
  assert.match(body, /surfaceFitRules\./);
});

test("getScaleForSurface 委托 surfaceFitRules", () => {
  const body = extractFunctionBody(mainSource, "getScaleForSurface");
  assert.match(body, /surfaceFitRules\./);
});

test("getSafeWindowXForDirection 委托 surfaceFitRules", () => {
  const body = extractFunctionBody(mainSource, "getSafeWindowXForDirection");
  assert.match(body, /surfaceFitRules\./);
});

test("applySurfaceScale 仍以 function 声明在 main.cjs", () => {
  assert.match(mainSource, new RegExp("^function\\s+applySurfaceScale\\s*\\(", "m"));
});

test("setPetScale 仍以 function 声明在 main.cjs", () => {
  assert.match(mainSource, new RegExp("^function\\s+setPetScale\\s*\\(", "m"));
});
  
test("buildScaleSummary 委托 petScaleRules.buildScaleSummaryFromState", () => {
  const body = extractFunctionBody(mainSource, "buildScaleSummary");
  assert.match(body, /petScaleRules\.buildScaleSummaryFromState/);
});

test("validateWindowSurface 委托 surfaceFitRules.validateWindowSurfaceBounds", () => {
  const body = extractFunctionBody(mainSource, "validateWindowSurface");
  assert.match(body, /surfaceFitRules\.validateWindowSurfaceBounds/);
});

test("getSurfaceGroundY 委托 surfaceFitRules.getSurfaceGroundYFromSurface", () => {
  const body = extractFunctionBody(mainSource, "getSurfaceGroundY");
  assert.match(body, /surfaceFitRules\.getSurfaceGroundYFromSurface/);
});

test("handleResetScale 仍以 function 声明在 main.cjs", () => {
  assert.match(mainSource, new RegExp("^function\\s+handleResetScale\\s*\\(", "m"));
});
