const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "electron", "main.cjs"), "utf8");

test("startup bubble freezes its anchor while visible", () => {
  assert.match(mainSource, /let startupBubbleAnchorRect = null;/);
  assert.match(mainSource, /function refreshStartupBubbleAnchor\(\) \{[\s\S]*startupBubbleAnchorRect = cloneRect\(getBubbleAnchorRect\(\)\);/);
  assert.match(mainSource, /function getStartupBubblePosition\(width = STARTUP_BUBBLE_DEFAULT_WIDTH, height = STARTUP_BUBBLE_HEIGHT, anchorRect = startupBubbleAnchorRect\)/);

  const resizeBody = mainSource.match(/function resizeStartupBubble\(width, height = STARTUP_BUBBLE_HEIGHT\) \{([\s\S]*?)function repositionStartupBubbleWindow/)?.[1] || "";
  const repositionBody = mainSource.match(/function repositionStartupBubbleWindow\(\{ refreshAnchor = false \} = \{\}\) \{([\s\S]*?)function showStartupBubble/)?.[1] || "";
  const moveBody = mainSource.match(/function setPetWindowPosition\(x, y\) \{([\s\S]*?)function clampPetWindowPosition/)?.[1] || "";
  const showBody = mainSource.match(/function showBubbleMessage\(message = null, durationMs = STARTUP_BUBBLE_DURATION_MS, options = \{\}\) \{([\s\S]*?)function hideStartupBubble/)?.[1] || "";
  const hideBody = mainSource.match(/function hideStartupBubble\(options = \{\}\) \{([\s\S]*?)function showPendingWalkBubbleMessage/)?.[1] || "";

  assert.doesNotMatch(resizeBody, /refreshStartupBubbleAnchor\(\)/);
  assert.match(repositionBody, /if \(refreshAnchor \|\| !startupBubbleAnchorRect\) \{[\s\S]*refreshStartupBubbleAnchor\(\);/);
  assert.match(moveBody, /repositionStartupBubbleWindow\(\);/);
  assert.doesNotMatch(moveBody, /refreshAnchor: true/);
  assert.match(showBody, /refreshStartupBubbleAnchor\(\);/);
  assert.match(hideBody, /startupBubbleAnchorRect = null;/);
});

test("explicit pet resize refreshes the frozen bubble anchor", () => {
  const scaleBody = mainSource.match(/function setPetScale\(nextScale\) \{([\s\S]*?)function groundPetToWorkArea/)?.[1] || "";

  assert.match(scaleBody, /repositionStartupBubbleWindow\(\{ refreshAnchor: true \}\);/);
});
