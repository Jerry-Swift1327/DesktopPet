const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");
const controllerSource = fs.readFileSync(path.join(__dirname, "..", "electron", "pet", "surface-scale-controller.cjs"), "utf8");
const bubbleSource = fs.readFileSync(path.join(__dirname, "..", "electron", "windows", "bubble-controller.cjs"), "utf8");

// 从 function 声明起按花括号配对提取函数体（仅处理字符串与括号/花括号配对）
// 起始定位只匹配 "function name("，参数列表的结束 ")" 由括号配对扫描确定，
// 以支持默认参数中含嵌套括号的情形。
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

test("startup bubble freezes its anchor while visible", () => {
  assert.match(bubbleSource, /let startupBubbleAnchorRect = null;/);
  assert.match(bubbleSource, /function refreshStartupBubbleAnchor\(\) \{[\s\S]*startupBubbleAnchorRect = cloneRect\(getBubbleAnchorRect\(\)\);/);
  assert.match(bubbleSource, /function getStartupBubblePosition\(width = STARTUP_BUBBLE_DEFAULT_WIDTH, height = STARTUP_BUBBLE_HEIGHT, anchorRect = startupBubbleAnchorRect\)/);

  const resizeBody = bubbleSource.match(/function resizeStartupBubble\(width, height = STARTUP_BUBBLE_HEIGHT\) \{([\s\S]*?)function repositionStartupBubbleWindow/)?.[1] || "";
  const repositionBody = bubbleSource.match(/function repositionStartupBubbleWindow\(\{ refreshAnchor = false \} = \{\}\) \{([\s\S]*?)function showStartupBubble/)?.[1] || "";
  const moveBody = mainSource.match(/function setPetWindowPosition\(x, y\) \{([\s\S]*?)function clampPetWindowPosition/)?.[1] || "";
  const showBody = bubbleSource.match(/function showBubbleMessage\(message = null, durationMs = STARTUP_BUBBLE_DURATION_MS, options = \{\}\) \{([\s\S]*?)function hideStartupBubble/)?.[1] || "";
  const hideBody = bubbleSource.match(/function hideStartupBubble\(options = \{\}\) \{([\s\S]*?)function showPendingWalkBubbleMessage/)?.[1] || "";

  assert.doesNotMatch(resizeBody, /refreshStartupBubbleAnchor\(\)/);
  assert.match(repositionBody, /if \(refreshAnchor \|\| !startupBubbleAnchorRect\) \{[\s\S]*refreshStartupBubbleAnchor\(\);/);
  assert.match(moveBody, /repositionStartupBubbleWindow\(\);/);
  assert.doesNotMatch(moveBody, /refreshAnchor: true/);
  assert.match(showBody, /refreshStartupBubbleAnchor\(\);/);
  assert.match(hideBody, /startupBubbleAnchorRect = null;/);
});

test("explicit pet resize refreshes the frozen bubble anchor", () => {
  const scaleBody = extractFunctionBody(controllerSource, "setPetScale");

  assert.match(scaleBody, /repositionStartupBubbleWindow\(\{ refreshAnchor: true \}\);/);
});
