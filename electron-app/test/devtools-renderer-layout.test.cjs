const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(ROOT, "devtools", "renderer", "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(ROOT, "devtools", "renderer", "styles.css"), "utf8");

function cssBlock(selector) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
  return stylesSource.match(pattern)?.[1] || "";
}

test("devtools renderNewVariant groups panels into left and right dashboard columns", () => {
  const renderNewVariantBody = appSource.match(/function renderNewVariant\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(renderNewVariantBody, /<div class="wizard-left">/);
  assert.match(renderNewVariantBody, /<div class="wizard-right">/);
  assert.match(renderNewVariantBody, /<div class="wizard-left">[\s\S]*data-build-preview[\s\S]*data-choose-folder[\s\S]*<div class="wizard-right">/);
  assert.match(renderNewVariantBody, /<div class="wizard-right">[\s\S]*\$\{renderPreview\(\)\}[\s\S]*\$\{renderExecution\(\)\}/);
});

test("devtools action cards render status indicators without left-border status styling", () => {
  const renderActionCardsBody = appSource.match(/function renderActionCards\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(renderActionCardsBody, /class="action-status"/);
  assert.match(renderActionCardsBody, /class="status-dot"/);
  assert.match(renderActionCardsBody, /action-card \$\{status\}/);
  const actionCardBlocks = [...stylesSource.matchAll(/\.action-card[^{]*\{([\s\S]*?)\n\}/g)]
    .map((match) => match[0])
    .join("\n");
  assert.doesNotMatch(actionCardBlocks, /border-left(?:-width|-color)?\s*:/);
});

test("devtools execution panel exposes a flexible terminal log area", () => {
  const renderExecutionBody = appSource.match(/function renderExecution\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const logBlock = cssBlock(".log");
  assert.match(renderExecutionBody, /class="panel execution-panel"/);
  assert.match(renderExecutionBody, /<pre class="log">/);
  assert.match(renderExecutionBody, /class="stage-progress"/);
  assert.match(logBlock, /flex\s*:\s*1\s*;/);
  assert.match(logBlock, /background\s*:\s*#090d16\s*;/);
  assert.match(logBlock, /line-height\s*:\s*1\.6\s*;/);
});

test("devtools renderer exposes maintenance navigation and confirmation surfaces", () => {
  assert.match(appSource, /view:\s*"newVariant"/);
  assert.match(appSource, /view:\s*"maintainVariant"/);
  assert.match(appSource, /view:\s*"deleteVariant"/);
  assert.match(appSource, /data-nav-view=/);
  assert.match(appSource, /function renderMaintainVariant/);
  assert.match(appSource, /function renderDeleteVariant/);
  assert.match(appSource, /class="metadata-diff"/);
  assert.match(appSource, /data-apply-metadata-edit/);
  assert.match(appSource, /data-delete-confirm/);
  assert.match(appSource, /data-reset-new-variant/);
  assert.match(appSource, /class="success-modal"/);
});

test("devtools action cards expose per-action frame mode controls", () => {
  const renderActionCardsBody = appSource.match(/function renderActionCards\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(renderActionCardsBody, /renderLoopControls\(action\)/);
  assert.match(appSource, /data-loop-mode/);
  assert.match(appSource, /data-loop-start/);
  assert.match(appSource, /data-loop-end/);
  assert.match(appSource, /loopModes/);
});

test("devtools CSS locks global horizontal overflow while enabling dashboard columns", () => {
  assert.match(cssBlock(".shell"), /height\s*:\s*100vh\s*;/);
  assert.match(cssBlock(".shell"), /overflow\s*:\s*hidden\s*;/);
  assert.match(cssBlock(".workspace"), /overflow-x\s*:\s*hidden\s*;/);
  assert.match(cssBlock(".workspace"), /overflow-y\s*:\s*auto\s*;/);
  assert.doesNotMatch(cssBlock(".wizard"), /max-width\s*:/);
  assert.match(cssBlock(".wizard"), /grid-template-columns\s*:\s*minmax\(0,\s*1\.1fr\)\s+minmax\(0,\s*0\.9fr\)\s*;/);
  assert.match(stylesSource, /\.wizard-left,\s*\n\.wizard-right\s*\{/);
  assert.match(cssBlock(".wizard-left,\n.wizard-right"), /height\s*:\s*calc\(100vh - 48px\)\s*;/);
  assert.match(cssBlock(".action-grid"), /grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/);
  assert.match(stylesSource, /@media\s*\(max-width:\s*1180px\)/);
});
