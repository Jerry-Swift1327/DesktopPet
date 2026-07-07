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
  assert.match(renderNewVariantBody, /<div class="wizard-left">[\s\S]*class="button-row source-actions"[\s\S]*data-choose-folder[\s\S]*data-build-preview[\s\S]*<div class="wizard-right">/);
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
  assert.match(appSource, /view:\s*"petCatalog"/);
  assert.match(appSource, /view:\s*"maintainVariant"/);
  assert.match(appSource, /view:\s*"deleteVariant"/);
  assert.match(appSource, /data-nav-view=/);
  assert.match(appSource, /function renderPetCatalog/);
  assert.match(appSource, /function renderMaintainVariant/);
  assert.match(appSource, /function renderDeleteVariant/);
  assert.match(appSource, /宠物库/);
  assert.match(appSource, /维护宠物/);
  assert.match(appSource, /删除宠物/);
  assert.doesNotMatch(appSource, /维护变体|删除测试变体/);
  assert.match(appSource, /class="metadata-diff"/);
  assert.match(appSource, /data-apply-metadata-edit/);
  assert.match(appSource, /data-delete-confirm/);
  assert.match(appSource, /data-reset-new-variant/);
  assert.match(appSource, /class="success-modal"/);
});

test("devtools pet catalog exposes list filters, checks, and gallery controls", () => {
  const renderPetCatalogBody = appSource.match(/function renderPetCatalog\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(renderPetCatalogBody, /data-catalog-filter/);
  assert.match(renderPetCatalogBody, /data-catalog-id/);
  assert.match(renderPetCatalogBody, /data-catalog-check/);
  assert.match(renderPetCatalogBody, /data-generate-gallery/);
  assert.match(renderPetCatalogBody, /data-open-gallery/);
  assert.match(renderPetCatalogBody, /<h1>宠物库<\/h1>/);
  assert.match(renderPetCatalogBody, /<h2>宠物列表<\/h2>/);
  assert.match(renderPetCatalogBody, /<h2>详情 \/ 检查<\/h2>/);
  assert.doesNotMatch(renderPetCatalogBody, /<\/details>`;/);
});

test("devtools new pet form keeps action and feature choices collapsible outside advanced settings", () => {
  const renderNewVariantBody = appSource.match(/function renderNewVariant\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const renderActionPickerBody = appSource.match(/function renderActionPicker\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const renderFeaturePickerBody = appSource.match(/function renderFeaturePicker\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const advancedBody = appSource.match(/function renderAdvancedControls\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(renderNewVariantBody, /class="form-grid new-pet-basics"/);
  assert.match(renderNewVariantBody, /class="date-field"/);
  assert.match(renderNewVariantBody, /class="platforms inline-platforms"/);
  assert.match(renderNewVariantBody, /renderActionPicker\(\)[\s\S]*renderFeaturePicker\(\)[\s\S]*renderAdvancedControls\(\)/);
  assert.match(renderActionPickerBody, /<details class="option-section collapsible-section" data-picker="actions"\$\{state\.actionPickerOpen \? " open" : ""\}>/);
  assert.match(renderActionPickerBody, /<summary>动作选择<\/summary>/);
  assert.match(renderFeaturePickerBody, /<details class="option-section collapsible-section" data-picker="features"\$\{state\.featurePickerOpen \? " open" : ""\}>/);
  assert.match(renderFeaturePickerBody, /<summary>功能选择<\/summary>/);
  assert.doesNotMatch(renderNewVariantBody, /data-run-option="autoSelectLoop"/);
  assert.doesNotMatch(appSource, /默认自动选取最佳运行帧段/);
  assert.doesNotMatch(advancedBody, /renderActionPicker|renderFeaturePicker/);
});

test("devtools new pet preview controls preserve scroll and collapse noisy details", () => {
  const renderNewVariantBody = appSource.match(/function renderNewVariant\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const renderPreviewBody = appSource.match(/function renderPreview\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(renderNewVariantBody, /data-build-preview\$\{busy\(\) \|\| state\.preview \? " disabled" : ""\}/);
  assert.match(renderPreviewBody, /<details class="preview-detail" open>[\s\S]*<summary>元数据草稿<\/summary>/);
  assert.match(renderPreviewBody, /<details class="preview-detail" open>[\s\S]*<summary>复制目标<\/summary>/);
  assert.match(renderPreviewBody, /<details class="preview-detail" open>[\s\S]*<summary>处理命令<\/summary>/);
  assert.match(renderPreviewBody, /<details class="preview-detail" open>[\s\S]*<summary>预检命令<\/summary>/);
  assert.match(appSource, /function renderPreservingScroll\(\)/);
  assert.match(appSource, /function setField[\s\S]*renderPreservingScroll\(\)/);
  assert.match(appSource, /function setActionVideo[\s\S]*renderPreservingScroll\(\)/);
  assert.match(appSource, /async function buildPreview[\s\S]*renderPreservingScroll\(\)/);
});

test("devtools maintenance metadata uses selectable controls and reset action", () => {
  assert.match(appSource, /data-maintain-list=/);
  assert.match(appSource, /data-maintain-note-preset/);
  assert.match(appSource, /data-reset-maintain-edits/);
  assert.match(appSource, /data-build-rename-preview/);
  assert.match(appSource, /data-run-rename-assets/);
});

test("devtools delete confirmation input updates without rerendering the focused input", () => {
  const inputBody = appSource.match(/appNode\.addEventListener\("input", \(event\) => \{([\s\S]*?)\n\}\);/)?.[1] || "";
  const deleteBranch = inputBody.match(/if \(event\.target\.dataset\.deleteConfirmInput !== undefined\) \{([\s\S]*?)return;/)?.[1] || "";

  assert.match(deleteBranch, /updateDeleteConfirmButton\(\)/);
  assert.doesNotMatch(deleteBranch, /render\(/);
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
  assert.match(cssBlock(".nav-item"), /font-weight\s*:\s*700\s*;/);
  assert.match(cssBlock(".nav-item"), /font-size\s*:\s*16px\s*;/);
  assert.match(cssBlock(".nav-item"), /min-height\s*:\s*54px\s*;/);
  assert.match(cssBlock(".nav-item:hover:not(:disabled)"), /var\(--nav-hover-bg,\s*#f1f5f9\)/);
  assert.match(cssBlock(".nav-stack"), /gap\s*:\s*16px\s*;/);
  assert.match(appSource, /const navHoverColors = \[/);
  assert.match(appSource, /addEventListener\("pointerover"/);
  assert.match(appSource, /setProperty\("--nav-hover-bg", nextColor\)/);
  assert.match(cssBlock(".shell"), /overflow\s*:\s*hidden\s*;/);
  assert.match(cssBlock(".workspace"), /overflow-x\s*:\s*hidden\s*;/);
  assert.match(cssBlock(".workspace"), /overflow-y\s*:\s*auto\s*;/);
  assert.doesNotMatch(cssBlock(".wizard"), /max-width\s*:/);
  assert.match(cssBlock(".wizard"), /grid-template-columns\s*:\s*minmax\(0,\s*1\.1fr\)\s+minmax\(0,\s*0\.9fr\)\s*;/);
  assert.match(stylesSource, /\.wizard-left,\s*\n\.wizard-right\s*\{/);
  assert.match(stylesSource, /\.wizard-left,\s*\n\.wizard-right\s*\{[\s\S]*?height\s*:\s*calc\(100vh - 48px\)\s*;/);
  assert.match(cssBlock(".action-grid"), /grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/);
  assert.match(cssBlock(".new-pet-basics"), /grid-template-columns\s*:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)\s+max-content\s*;/);
  assert.match(cssBlock(".source-actions"), /gap\s*:\s*14px\s*;/);
  assert.match(stylesSource, /@media\s*\(max-width:\s*1180px\)/);
});
