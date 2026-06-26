const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSourceRaw = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
// 剥离注释后再做字符串检查，避免文档性注释（如 "visibleBoundsCache 所有权迁移" 等）误触断言
const mainSource = mainSourceRaw
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/[^\n]*/g, "");

// 从 function 声明起按花括号配对提取函数体（注释已剥离，仅处理字符串与花括号）
function extractFunctionBody(source, funcName) {
  const startRe = new RegExp(`^function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{`, "m");
  const startMatch = source.match(startRe);
  if (!startMatch) {
    return "";
  }
  const bodyStart = startMatch.index + startMatch[0].length;
  let depth = 1;
  let i = bodyStart;
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

test("main 不再声明独立 visibleBoundsCache/headBoundsCache/framePixelCache Map", () => {
  assert.doesNotMatch(mainSource, /const\s+visibleBoundsCache\s*=\s*new\s+Map\s*\(/);
  assert.doesNotMatch(mainSource, /const\s+headBoundsCache\s*=\s*new\s+Map\s*\(/);
  assert.doesNotMatch(mainSource, /const\s+framePixelCache\s*=\s*new\s+Map\s*\(/);
});

test("main 不直接调用 nativeImage.createFromPath 做帧读图", () => {
  // controller 初始化时注入 nativeImage（createFrameBoundsController({ nativeImage, ... })）是允许的；
  // 仅禁止直接 nativeImage.createFromPath(...) 调用
  assert.doesNotMatch(mainSource, /nativeImage\.createFromPath\s*\(/);
});

test("getFrameVisibleBounds 委托 frameBoundsController", () => {
  const body = extractFunctionBody(mainSource, "getFrameVisibleBounds");
  assert.match(body, /frameBoundsController\./);
});

test("getFramePixelData 委托 frameBoundsController", () => {
  const body = extractFunctionBody(mainSource, "getFramePixelData");
  assert.match(body, /frameBoundsController\./);
});

test("getFrameHeadBounds 委托 frameBoundsController", () => {
  const body = extractFunctionBody(mainSource, "getFrameHeadBounds");
  assert.match(body, /frameBoundsController\./);
});

test("getStateVisibleBounds 委托 frameBoundsController", () => {
  const body = extractFunctionBody(mainSource, "getStateVisibleBounds");
  assert.match(body, /frameBoundsController\./);
});

test("getStateHeadBounds 委托 frameBoundsController", () => {
  const body = extractFunctionBody(mainSource, "getStateHeadBounds");
  assert.match(body, /frameBoundsController\./);
});

test("isPointInsideRenderedFrame 委托 frameHitTest.isPointInsideVisiblePixels", () => {
  const body = extractFunctionBody(mainSource, "isPointInsideRenderedFrame");
  assert.match(body, /frameHitTest\.isPointInsideVisiblePixels/);
});

test("getPetWindowPositionForVisibleRect 委托 frameGeometry.getWindowPositionForVisibleRect", () => {
  const body = extractFunctionBody(mainSource, "getPetWindowPositionForVisibleRect");
  assert.match(body, /frameGeometry\.getWindowPositionForVisibleRect/);
});
