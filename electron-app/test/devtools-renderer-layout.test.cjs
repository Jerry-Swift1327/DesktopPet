const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  getActionPool,
  getFeaturePool,
  getNotesPool,
  getSpeciesProfiles,
  getTierProfiles
} = require("../electron/pet-catalog.cjs");

const ROOT = path.join(__dirname, "..");
const appSource = fs.readFileSync(path.join(ROOT, "devtools", "renderer", "app.js"), "utf8");
const stylesSource = fs.readFileSync(path.join(ROOT, "devtools", "renderer", "styles.css"), "utf8");

function cssBlock(selector) {
  const pattern = new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
  return stylesSource.match(pattern)?.[1] || "";
}

function createFakeNode(className = "") {
  const children = new Map();
  return {
    className,
    html: "",
    isConnected: true,
    scrollTop: 0,
    scrollLeft: 0,
    addEventListener() {},
    querySelector(selector) {
      if (selector === ".wizard-left" && this.html.includes("wizard-left")) {
        if (!children.has(selector)) {
          children.set(selector, createFakeNode("wizard-left"));
        }
        return children.get(selector);
      }
      if (selector === ".wizard-right" && this.html.includes("wizard-right")) {
        if (!children.has(selector)) {
          children.set(selector, createFakeNode("wizard-right"));
        }
        return children.get(selector);
      }
      return null;
    },
    set innerHTML(value) {
      this.html = String(value);
    },
    get innerHTML() {
      return this.html;
    }
  };
}

function createRendererHarness() {
  const appNode = createFakeNode("");
  const sidebarNode = createFakeNode("sidebar");
  const workspaceNode = createFakeNode("workspace");
  const variants = [
    {
      id: "pet2601",
      notes: "内部使用-基础",
      species: "dog",
      tier: "basic",
      date: "2026-05-08",
      scope: "internal",
      platforms: ["win32"],
      version: "1.1",
      actions: ["squat", "walk", "feed", "ball"],
      actionAssets: [],
      features: { autoStart: true, windowRoam: true },
      enabledFeatures: ["autoStart", "windowRoam"],
      assetPrefix: "dog"
    },
    {
      id: "pettest001",
      notes: "测试变体-基础",
      species: "cat",
      tier: "basic",
      date: "2026-07-07",
      scope: "test",
      platforms: ["win32"],
      version: "0.1",
      actions: ["squat", "walk", "feed", "ball"],
      actionAssets: [],
      features: { autoStart: true },
      enabledFeatures: ["autoStart"],
      assetPrefix: "testcat"
    }
  ];
  const detailsFor = (id) => {
    const variant = variants.find((item) => item.id === id) || variants[0];
    return {
      ...variant,
      profile: {
        ...variant,
        actionButtons: variant.actions,
        actionAssets: variant.actionAssets
      },
      resources: {
        animationFolders: [],
        manifest: `${variant.assetPrefix}_actions_manifest.json`,
        existingPaths: []
      }
    };
  };
  const api = {
    getCatalogOptions: () => Promise.resolve({
      species: getSpeciesProfiles(),
      tiers: getTierProfiles(),
      actions: getActionPool(),
      features: getFeaturePool(),
      notes: getNotesPool()
    }),
    listVariants: () => Promise.resolve(variants),
    getVariantDetails: (id) => Promise.resolve(detailsFor(id)),
    checkVariant: (id) => Promise.resolve({ id, ok: true }),
    generateGallery: () => Promise.resolve({ index: ".variant-gallery/index.html" }),
    openGallery: () => Promise.resolve(null),
    chooseSourceFolder: () => Promise.resolve(null),
    chooseActionVideo: () => Promise.resolve(null),
    buildNewVariantPreview: () => Promise.resolve({}),
    runNewVariant: () => Promise.resolve({}),
    buildReplaceActionPreview: () => Promise.resolve({}),
    runReplaceAction: () => Promise.resolve({}),
    buildRenameAssetsPreview: () => Promise.resolve({}),
    runRenameAssets: () => Promise.resolve({}),
    buildMetadataEditPreview: () => Promise.resolve({}),
    applyMetadataEdit: () => Promise.resolve({}),
    buildDeleteVariantPreview: () => Promise.resolve({ previewId: "delete-preview", canDelete: true, paths: [] }),
    deleteTestVariant: () => Promise.resolve({}),
    onTaskLog: () => {},
    onTaskStatus: () => {}
  };
  const context = {
    window: { variantDevtools: api, confirm: () => true },
    document: {
      getElementById: (id) => (id === "app" ? appNode : null),
      querySelector: (selector) => {
        if (selector === ".sidebar") {
          return sidebarNode;
        }
        if (selector === ".workspace") {
          return workspaceNode;
        }
        return null;
      }
    },
    console,
    Promise
  };

  vm.runInNewContext(`${appSource}\nglobalThis.__rendererHarness = { state, switchView, loadCatalogDetails, generateCatalogGallery, appNode, sidebarNode };`, context, {
    filename: "devtools/renderer/app.js"
  });
  return context.__rendererHarness;
}

async function flushRendererPromises() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
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
  assert.match(appSource, /const validViews = new Set\(navItems\.map\(\(item\) => item\.view\)\)/);
  assert.match(appSource, /const viewRenderers = \{[\s\S]*newVariant: renderNewVariant,[\s\S]*petCatalog: renderPetCatalog,[\s\S]*maintainVariant: renderMaintainVariant,[\s\S]*deleteVariant: renderDeleteVariant[\s\S]*\};/);
  assert.match(appSource, /data-current-view="\$\{escapeHtml\(view\)\}"/);
  assert.match(appSource, /appNode\.innerHTML = renderViewShell\(currentView, viewRenderers\[currentView\]\(\)\);/);
  assert.match(appSource, /if \(!isKnownView\(view\) \|\| busy\(\) \|\| state\.view === view\)/);
  assert.match(appSource, /if \(isKnownView\(view\)\) \{[\s\S]*event\.preventDefault\(\);[\s\S]*switchView\(view\);/);
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

test("devtools pet catalog exposes compact filters, colored list, details, and gallery controls", () => {
  const renderPetCatalogBody = appSource.match(/function renderPetCatalog\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(renderPetCatalogBody, /class="form-grid catalog-filters"/);
  assert.match(renderPetCatalogBody, /renderCatalogFilter\("scope",[\s\S]*data-catalog-filter="date"[\s\S]*renderCatalogFilter\("species",[\s\S]*renderCatalogFilter\("tier"/);
  assert.match(renderPetCatalogBody, /data-catalog-filter/);
  assert.match(renderPetCatalogBody, /data-catalog-id/);
  assert.match(renderPetCatalogBody, /class="catalog-row \$\{catalogToneClass\(variant\.id\)\}/);
  assert.match(renderPetCatalogBody, /summary/);
  assert.match(renderPetCatalogBody, /resources/);
  assert.match(renderPetCatalogBody, /data-generate-gallery/);
  assert.match(renderPetCatalogBody, /data-open-gallery/);
  assert.match(renderPetCatalogBody, /<h1>宠物库<\/h1>/);
  assert.match(renderPetCatalogBody, /<h2>宠物列表<\/h2>/);
  assert.match(renderPetCatalogBody, /<h2>详情 \/ 检查<\/h2>/);
  assert.doesNotMatch(renderPetCatalogBody, /<h1>新增宠物<\/h1>/);
  assert.doesNotMatch(renderPetCatalogBody, /data-catalog-check/);
  assert.doesNotMatch(renderPetCatalogBody, /renderExecution\(\)/);
  assert.doesNotMatch(renderPetCatalogBody, /checkResult/);
  assert.doesNotMatch(renderPetCatalogBody, /<\/details>`;/);
});

test("devtools navigation replaces delete page with rendered pet catalog", async () => {
  const harness = createRendererHarness();
  await flushRendererPromises();

  await harness.switchView("deleteVariant");
  assert.equal(harness.state.view, "deleteVariant");
  assert.match(harness.appNode.innerHTML, /data-current-view="deleteVariant"/);
  assert.match(harness.appNode.innerHTML, /<h1>删除宠物<\/h1>/);

  await harness.switchView("petCatalog");
  assert.equal(harness.state.view, "petCatalog");
  assert.match(harness.sidebarNode.innerHTML, /data-nav-view="petCatalog">宠物库<\/button>/);
  assert.match(harness.appNode.innerHTML, /data-current-view="petCatalog"/);
  assert.match(harness.appNode.innerHTML, /<h1>宠物库<\/h1>/);
  assert.doesNotMatch(harness.appNode.innerHTML, /<h1>删除宠物<\/h1>/);
});

test("devtools pet catalog keeps scroll when generating gallery", async () => {
  const harness = createRendererHarness();
  await flushRendererPromises();
  await harness.switchView("petCatalog");

  const leftColumn = harness.appNode.querySelector(".wizard-left");
  const rightColumn = harness.appNode.querySelector(".wizard-right");
  leftColumn.scrollTop = 240;
  rightColumn.scrollTop = 120;

  await harness.generateCatalogGallery();

  assert.equal(leftColumn.scrollTop, 240);
  assert.equal(rightColumn.scrollTop, 120);
  assert.match(harness.appNode.innerHTML, /\.variant-gallery\/index\.html/);
});

test("devtools pet catalog reloads summary and resources for another selected pet", async () => {
  const harness = createRendererHarness();
  await flushRendererPromises();
  await harness.switchView("petCatalog");

  harness.state.catalog.selectedId = "pettest001";
  await harness.loadCatalogDetails("pettest001");

  assert.match(harness.appNode.innerHTML, /pettest001/);
  assert.match(harness.appNode.innerHTML, /testcat_actions_manifest\.json/);
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
  assert.match(renderActionPickerBody, /<details class="option-section collapsible-section new-pet-picker" data-picker="actions"\$\{state\.actionPickerOpen \? " open" : ""\}>/);
  assert.match(renderActionPickerBody, /<summary>动作选择<\/summary>/);
  assert.match(renderActionPickerBody, /class="option-grid new-pet-option-grid"/);
  assert.match(renderFeaturePickerBody, /<details class="option-section collapsible-section new-pet-picker" data-picker="features"\$\{state\.featurePickerOpen \? " open" : ""\}>/);
  assert.match(renderFeaturePickerBody, /<summary>功能选择<\/summary>/);
  assert.match(renderFeaturePickerBody, /class="option-grid new-pet-option-grid"/);
  assert.doesNotMatch(renderNewVariantBody, /data-run-option="autoSelectLoop"/);
  assert.doesNotMatch(appSource, /默认自动选取最佳运行帧段/);
  assert.doesNotMatch(advancedBody, /renderActionPicker|renderFeaturePicker/);
});

test("devtools new pet derived summary uses compact and wide rows", () => {
  const renderDerivedSummaryBody = appSource.match(/function renderDerivedSummary\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(renderDerivedSummaryBody, /class="derived-summary"/);
  assert.match(renderDerivedSummaryBody, /class="summary-grid summary-grid-compact"[\s\S]*宠物 ID id[\s\S]*说明 notes[\s\S]*版本 version[\s\S]*缩放 scale[\s\S]*资源前缀 assetPrefix/);
  assert.match(renderDerivedSummaryBody, /class="summary-grid summary-grid-wide"[\s\S]*动作 actions[\s\S]*启用功能 features on[\s\S]*禁用功能 features off/);
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
  assert.match(cssBlock(".nav-item.active"), /border-color\s*:\s*#0284c7\s*;/);
  assert.match(cssBlock(".nav-item.active"), /background\s*:\s*#e0f2fe\s*;/);
  assert.match(cssBlock(".nav-item.active:hover:not(:disabled)"), /background\s*:\s*#e0f2fe\s*;/);
  assert.match(cssBlock(".nav-stack"), /gap\s*:\s*16px\s*;/);
  assert.match(appSource, /const navHoverColors = \[/);
  assert.match(appSource, /addEventListener\("pointerover"/);
  assert.match(appSource, /setProperty\("--nav-hover-bg", nextColor\)/);
  assert.match(cssBlock(".shell"), /overflow\s*:\s*hidden\s*;/);
  assert.match(cssBlock(".workspace"), /overflow-x\s*:\s*hidden\s*;/);
  assert.match(cssBlock(".workspace"), /overflow-y\s*:\s*auto\s*;/);
  assert.match(cssBlock(".view-root"), /height\s*:\s*100%\s*;/);
  assert.doesNotMatch(cssBlock(".wizard"), /max-width\s*:/);
  assert.match(cssBlock(".wizard"), /grid-template-columns\s*:\s*minmax\(0,\s*1\.1fr\)\s+minmax\(0,\s*0\.9fr\)\s*;/);
  assert.match(stylesSource, /\.wizard-left,\s*\n\.wizard-right\s*\{/);
  assert.match(stylesSource, /\.wizard-left,\s*\n\.wizard-right\s*\{[\s\S]*?height\s*:\s*calc\(100vh - 48px\)\s*;/);
  assert.match(cssBlock(".action-grid"), /grid-template-columns\s*:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)\s*;/);
  assert.match(cssBlock(".new-pet-basics"), /grid-template-columns\s*:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)\s+max-content\s*;/);
  assert.match(cssBlock(".catalog-filters"), /grid-template-columns\s*:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)\s*;/);
  assert.match(cssBlock(".catalog-list"), /grid-template-columns\s*:\s*repeat\(auto-fit,\s*minmax\(min\(310px,\s*100%\),\s*1fr\)\)\s*;/);
  assert.match(cssBlock(".catalog-row"), /background\s*:\s*var\(--catalog-row-bg,\s*#ffffff\)\s*;/);
  assert.match(cssBlock(".catalog-row.active"), /border-color\s*:\s*#0284c7\s*;/);
  assert.match(stylesSource, /\.catalog-tone-0[\s\S]*--catalog-row-bg:\s*#f0f9ff/);
  assert.match(stylesSource, /\.catalog-tone-7[\s\S]*--catalog-row-bg:\s*#f8fafc/);
  assert.match(cssBlock(".source-actions"), /gap\s*:\s*14px\s*;/);
  assert.match(cssBlock(".new-pet-picker .new-pet-option-grid"), /grid-template-columns\s*:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)\s*;/);
  assert.match(cssBlock(".new-pet-picker .option-group + .option-group"), /margin-top\s*:\s*10px\s*;/);
  assert.match(cssBlock(".summary-grid-compact"), /grid-template-columns\s*:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)\s*;/);
  assert.match(cssBlock(".summary-grid-wide"), /grid-template-columns\s*:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)\s*;/);
  assert.match(stylesSource, /@media\s*\(max-width:\s*1500px\)[\s\S]*\.new-pet-picker \.new-pet-option-grid\s*\{[\s\S]*repeat\(3,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(stylesSource, /@media\s*\(max-width:\s*1180px\)[\s\S]*\.catalog-filters\s*\{[\s\S]*repeat\(auto-fit,\s*minmax\(min\(190px,\s*100%\),\s*1fr\)\)/);
  assert.match(stylesSource, /@media\s*\(max-width:\s*780px\)[\s\S]*\.new-pet-picker \.new-pet-option-grid,[\s\S]*\.summary-grid-compact,[\s\S]*\.summary-grid-wide\s*\{[\s\S]*grid-template-columns\s*:\s*1fr\s*;/);
});
test("devtools exposes drag window docking as an independent feature choice", () => {
  assert.match(appSource, /const defaultEnabledFeatures = \["autoStart", "windowDocking", "windowRoam"\]/);
  assert.match(appSource, /windowDocking: "拖拽吸附窗口"/);
});
