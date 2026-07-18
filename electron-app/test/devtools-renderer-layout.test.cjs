const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  getActionPool,
  getFeaturePool,
  getNotesPool,
  getSpeciesProfiles
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
  const listeners = new Map();
  return {
    className,
    html: "",
    isConnected: true,
    scrollTop: 0,
    scrollLeft: 0,
    addEventListener(type, listener, options) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ listener, capture: options === true || options?.capture === true });
    },
    async dispatchEvent(type, event) {
      const registered = (listeners.get(type) || []).slice().sort((left, right) => Number(right.capture) - Number(left.capture));
      for (const { listener } of registered) {
        await listener(event);
      }
    },
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
      for (const child of children.values()) {
        child.isConnected = false;
      }
      children.clear();
      this.html = String(value);
    },
    get innerHTML() {
      return this.html;
    }
  };
}

function createRendererHarness(options = {}) {
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
        enabledActions: variant.actions.concat(variant.actionAssets),
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
      actions: getActionPool(),
      requiredActions: ["squat", "walk", "feed", "ball"],
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
    buildReplaceActionsPreview: () => Promise.resolve({ previewId: "replace-preview", commands: [], targets: [] }),
    buildDeleteActionPreview: () => Promise.resolve({ previewId: "delete-action-preview", action: "spin", canDelete: true, paths: [] }),
    deleteAction: () => Promise.resolve({}),
    runReplaceActions: () => Promise.resolve({}),
    buildRenameAssetsPreview: () => Promise.resolve({}),
    runRenameAssets: () => Promise.resolve({}),
    buildMetadataEditPreview: () => Promise.resolve({}),
    applyMetadataEdit: () => Promise.resolve({}),
    buildActionRegistrationPreview: () => Promise.resolve({ previewId: "register-preview" }),
    applyActionRegistration: () => Promise.resolve({ actionKey: "tailWag", stateId: "petTailWag", registered: true }),
    getActionFramePool: ({ action }) => Promise.resolve(options.framePool || {
      action,
      hasProcessedFrames: false,
      hasCanonicalVideo: true,
      processedFrames: [],
      runtimeFrames: [],
      selectedSourceFrames: [],
      freezeLastFrame: false,
      protected: false
    }),
    buildGenerateFramePoolPreview: () => Promise.resolve({ previewId: "pool-preview", command: {} }),
    generateFramePool: () => Promise.resolve({}),
    buildReselectRuntimeFramesPreview: () => Promise.resolve({ previewId: "reselect-preview", before: {}, after: {} }),
    reselectRuntimeFrames: () => Promise.resolve({}),
    buildDeleteVariantPreview: () => Promise.resolve({ previewId: "delete-preview", canDelete: true, paths: [] }),
    deleteTestVariant: () => Promise.resolve({}),
    onTaskLog: () => {},
    onTaskStatus: () => {}
  };
  const documentListeners = new Map();
  const documentNode = {
    getElementById: (id) => (id === "app" ? appNode : null),
    querySelector: (selector) => {
      if (selector === ".sidebar") {
        return sidebarNode;
      }
      if (selector === ".workspace") {
        return workspaceNode;
      }
      if (selector === ".wizard-left" || selector === ".wizard-right") {
        return appNode.querySelector(selector);
      }
      return null;
    },
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
    },
    async dispatchEvent(type, event) {
      for (const listener of documentListeners.get(type) || []) {
        await listener(event);
      }
    }
  };
  const context = {
    window: { variantDevtools: api, confirm: () => true },
    document: documentNode,
    console,
    Promise
  };

  vm.runInNewContext(`${appSource}\nglobalThis.__rendererHarness = { state, switchView, loadCatalogDetails, loadMaintainDetails, generateCatalogGallery, buildReplacePreview, buildMetadataPreview, applyMetadataEdit, renderMaintainVariant, renderRuntimeFrameReselect, appNode, sidebarNode, workspaceNode: document.querySelector(".workspace"), documentNode: document };`, context, {
    filename: "devtools/renderer/app.js"
  });
  return context.__rendererHarness;
}

async function flushRendererPromises() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function createEventTarget(dataset = {}, closestTargets = {}) {
  return {
    dataset,
    closest: (selector) => closestTargets[selector] || null
  };
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
  assert.match(renderPetCatalogBody, /renderCatalogFilter\("scope",[\s\S]*data-catalog-filter="date"[\s\S]*renderCatalogFilter\("species"/);
  assert.doesNotMatch(renderPetCatalogBody, /renderCatalogFilter\("tier"/);
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

test("devtools maintenance previews keep scroll for replacement and metadata panels", async () => {
  const harness = createRendererHarness();
  await flushRendererPromises();
  await harness.switchView("maintainVariant");
  await harness.loadMaintainDetails("pet2601");

  harness.state.maintain.replacementVideos.walk = "C:\\pet-source-videos\\walk.mp4";

  let leftColumn = harness.appNode.querySelector(".wizard-left");
  let rightColumn = harness.appNode.querySelector(".wizard-right");
  harness.workspaceNode.scrollTop = 90;
  leftColumn.scrollTop = 320;
  rightColumn.scrollTop = 180;

  await harness.buildReplacePreview();

  leftColumn = harness.appNode.querySelector(".wizard-left");
  rightColumn = harness.appNode.querySelector(".wizard-right");
  assert.equal(harness.workspaceNode.scrollTop, 90);
  assert.equal(leftColumn.scrollTop, 320);
  assert.equal(rightColumn.scrollTop, 180);

  harness.workspaceNode.scrollTop = 120;
  leftColumn.scrollTop = 440;
  rightColumn.scrollTop = 260;

  await harness.buildMetadataPreview();

  leftColumn = harness.appNode.querySelector(".wizard-left");
  rightColumn = harness.appNode.querySelector(".wizard-right");
  assert.equal(harness.workspaceNode.scrollTop, 120);
  assert.equal(leftColumn.scrollTop, 440);
  assert.equal(rightColumn.scrollTop, 260);

  harness.workspaceNode.scrollTop = 180;
  leftColumn.scrollTop = 610;
  rightColumn.scrollTop = 340;

  await harness.applyMetadataEdit("metadata-preview");

  leftColumn = harness.appNode.querySelector(".wizard-left");
  rightColumn = harness.appNode.querySelector(".wizard-right");
  assert.equal(harness.workspaceNode.scrollTop, 180);
  assert.equal(leftColumn.scrollTop, 610);
  assert.equal(rightColumn.scrollTop, 340);
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
  assert.match(renderFeaturePickerBody, /<strong>启用功能<\/strong>/);
  assert.match(renderFeaturePickerBody, /class="option-grid new-pet-option-grid"/);
  assert.doesNotMatch(renderFeaturePickerBody, /禁用功能|disableFeatures/);
  assert.doesNotMatch(renderNewVariantBody, /data-run-option="autoSelectLoop"/);
  assert.doesNotMatch(appSource, /默认自动选取最佳运行帧段/);
  assert.doesNotMatch(advancedBody, /renderActionPicker|renderFeaturePicker/);
});

test("devtools new pet derived summary uses compact and wide rows", () => {
  const renderDerivedSummaryBody = appSource.match(/function renderDerivedSummary\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(renderDerivedSummaryBody, /class="derived-summary"/);
  assert.match(renderDerivedSummaryBody, /class="summary-grid summary-grid-compact"[\s\S]*宠物 ID id[\s\S]*说明 notes[\s\S]*版本 version[\s\S]*缩放 scale[\s\S]*资源前缀 assetPrefix/);
  assert.match(renderDerivedSummaryBody, /class="summary-grid summary-grid-wide"[\s\S]*动作 actions[\s\S]*启用功能 features/);
  assert.doesNotMatch(renderDerivedSummaryBody, /禁用功能 features off/);
});

test("devtools feature metadata editing uses a single enabled feature list", () => {
  const renderMaintainBody = appSource.match(/function renderMaintainMetadataControls\(fields, disabled\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const payloadBody = appSource.match(/function buildMetadataPayload\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(renderMaintainBody, /renderMaintainCheckboxList\("featuresEnable", "启用功能 features", features, fields\.featuresEnable, disabled\)/);
  assert.doesNotMatch(renderMaintainBody, /featuresDisable|features\.disable/);
  assert.match(payloadBody, /features:\s*\{[\s\S]*enable:\s*parseList\(fields\.featuresEnable\),[\s\S]*disable:\s*\[\]/);
  assert.doesNotMatch(payloadBody, /parseList\(fields\.featuresDisable\)/);
});

test("devtools checkbox controls keep a fixed visual size", () => {
  const checkboxBlock = cssBlock('input[type="checkbox"]');

  assert.match(checkboxBlock, /width\s*:\s*16px\s*;/);
  assert.match(checkboxBlock, /height\s*:\s*16px\s*;/);
  assert.match(checkboxBlock, /min-width\s*:\s*16px\s*;/);
  assert.match(checkboxBlock, /padding\s*:\s*0\s*;/);
  assert.match(checkboxBlock, /accent-color\s*:/);
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
  assert.match(appSource, /class="form-grid maintain-metadata-basics"/);
  assert.match(appSource, /data-maintain-field="version"/);
  assert.doesNotMatch(appSource, /data-build-rename-preview|data-run-rename-assets|批量导入动作源视频/);
});

test("devtools renders independent action registration panels on new and maintenance pages", () => {
  const renderNewVariantBody = appSource.match(/function renderNewVariant\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const renderMaintainVariantBody = appSource.match(/function renderMaintainVariant\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  const registrationBody = appSource.match(/function renderActionRegistrationPanel\(context\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(renderNewVariantBody, /renderActionRegistrationPanel\("newVariant"\)/);
  assert.match(renderMaintainVariantBody, /renderActionRegistrationPanel\("maintainVariant"\)/);
  assert.match(registrationBody, /播放一次[\s\S]*指定分钟[\s\S]*持续循环/);
  assert.match(registrationBody, /data-action-registration-field="actionKey"[\s\S]*data-action-registration-field="label"/);
});

test("devtools maintenance renders newly enabled actions as source video cards", async () => {
  const harness = createRendererHarness();
  await flushRendererPromises();
  await harness.switchView("maintainVariant");
  await harness.loadMaintainDetails("pet2601");

  assert.deepEqual(harness.state.maintain.details.profile.actionAssets, []);
  harness.state.maintain.metadataFields.enabledActions.push("spin");
  const html = harness.renderMaintainVariant();

  assert.match(html, /新增动作源视频/);
  assert.match(html, /spin \/ 转圈/);
  assert.match(html, /data-new-action-video="spin"/);
});

test("devtools maintenance replaces the action dropdown with existing action cards and paired commands", () => {
  const renderMaintainBody = appSource.match(/function renderMaintainVariant\(\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.match(renderMaintainBody, /renderReplacementCards\(\)/);
  assert.match(renderMaintainBody, /data-build-replace-preview/);
  assert.match(renderMaintainBody, /data-run-replace-actions/);
  assert.match(renderMaintainBody, /class="button-row source-actions maintenance-actions"[\s\S]*data-build-replace-preview[\s\S]*data-run-replace-actions/);
  assert.doesNotMatch(renderMaintainBody, /data-maintain-action|替换动作<\/label>/);
  assert.match(cssBlock(".maintain-metadata-basics"), /repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(cssBlock(".maintenance-actions"), /flex-wrap\s*:\s*nowrap\s*;/);
});

test("devtools maintenance action cards expose resource deletion previews", () => {
  assert.match(appSource, /data-build-delete-action/);
  assert.match(appSource, /data-confirm-delete-action/);
  assert.match(appSource, /function renderDeleteActionPreview/);
  assert.match(appSource, /resources\?\.resourceActions/);
  assert.match(appSource, /孤立资源/);
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
  assert.match(appSource, /const defaultEnabledFeatures = \["autoStart"\]/);
  assert.match(appSource, /windowDocking: "拖拽吸附窗口"/);
});

test("devtools frame maintenance exposes pool, selection, lightbox, and yawn freeze controls", () => {
  assert.match(appSource, /<h2>素材池管理<\/h2>/);
  assert.match(appSource, /<h2>重新选择运行帧<\/h2>/);
  assert.match(appSource, /data-source-frame=/);
  assert.match(appSource, /data-open-frame-lightbox=/);
  assert.match(appSource, /data-frame-lightbox-step=/);
  assert.match(appSource, /data-close-frame-lightbox/);
  assert.match(appSource, /末帧休眠（5 分钟）/);
  assert.match(stylesSource, /\.frame-lightbox\s*\{/);
  assert.match(stylesSource, /\.frame-pool-grid\s*\{/);
  assert.match(cssBlock(".summary-grid.frame-pool-summary"), /repeat\(auto-fit, minmax\(120px, 1fr\)\)/);
});

test("devtools frame lightbox opens from a nested thumbnail and disables endpoint arrows", async () => {
  const frames = [
    { index: 10, name: "frame010.png", url: "frame010.png" },
    { index: 20, name: "frame020.png", url: "frame020.png" }
  ];
  const harness = createRendererHarness();
  await flushRendererPromises();
  harness.state.maintain.framePool = {
    hasProcessedFrames: true,
    processedFrames: frames,
    runtimeFrames: frames,
    selectedSourceFrames: [10],
    freezeLastFrame: false,
    protected: false
  };

  const firstButton = createEventTarget({ openFrameLightbox: "0" });
  const nestedImage = createEventTarget({}, { "[data-open-frame-lightbox]": firstButton });
  await harness.appNode.dispatchEvent("click", { target: nestedImage, shiftKey: false });

  assert.equal(harness.state.maintain.frameLightboxIndex, 0);
  let framePanel = harness.renderRuntimeFrameReselect();
  assert.match(framePanel, /class="frame-lightbox"/);
  assert.match(framePanel, /data-frame-lightbox-step="-1" disabled/);
  assert.doesNotMatch(framePanel, /data-frame-lightbox-step="1" disabled/);

  const nextButton = createEventTarget({ frameLightboxStep: "1" });
  nextButton.closest = (selector) => selector === "[data-frame-lightbox-step]" ? nextButton : null;
  await harness.appNode.dispatchEvent("click", { target: nextButton, shiftKey: false });

  assert.equal(harness.state.maintain.frameLightboxIndex, 1);
  framePanel = harness.renderRuntimeFrameReselect();
  assert.match(framePanel, /data-frame-lightbox-step="1" disabled/);
});

test("devtools read-only runtime frames support lightbox browsing and Escape closing", async () => {
  const harness = createRendererHarness();
  await flushRendererPromises();
  harness.state.maintain.framePool = {
    hasProcessedFrames: false,
    processedFrames: [],
    runtimeFrames: [{ index: 0, name: "runtime000.png", url: "runtime000.png" }],
    selectedSourceFrames: [],
    freezeLastFrame: false,
    protected: false
  };
  harness.appNode.innerHTML = harness.renderRuntimeFrameReselect();
  assert.match(harness.appNode.innerHTML, /runtime-readonly-grid[\s\S]*data-open-frame-lightbox="0"/);

  const runtimeButton = createEventTarget({ openFrameLightbox: "0" });
  const nestedImage = createEventTarget({}, { "[data-open-frame-lightbox]": runtimeButton });
  await harness.appNode.dispatchEvent("click", { target: nestedImage, shiftKey: false });
  assert.match(harness.renderRuntimeFrameReselect(), /runtime000\.png[\s\S]*class="frame-lightbox"/);

  let prevented = false;
  await harness.documentNode.dispatchEvent("keydown", {
    key: "Escape",
    preventDefault: () => { prevented = true; }
  });
  assert.equal(harness.state.maintain.frameLightboxIndex, null);
  assert.equal(prevented, true);
  assert.doesNotMatch(harness.renderRuntimeFrameReselect(), /class="frame-lightbox"/);
});

test("devtools Shift selection follows pool positions and renders selection statistics", async () => {
  const frames = [10, 20, 30].map((index) => ({ index, name: `frame${index}.png`, url: `frame${index}.png` }));
  const harness = createRendererHarness();
  await flushRendererPromises();
  harness.state.maintain.framePool = {
    hasProcessedFrames: true,
    processedFrames: frames,
    runtimeFrames: [frames[0]],
    selectedSourceFrames: [10],
    freezeLastFrame: false,
    protected: false
  };
  harness.state.maintain.reselectSelection = [10];
  harness.state.maintain.lastFrameSelectionIndex = 10;

  const checkbox = createEventTarget({ sourceFrame: "30" });
  checkbox.checked = true;
  checkbox.closest = (selector) => selector === "[data-source-frame]" ? checkbox : null;
  await harness.appNode.dispatchEvent("click", { target: checkbox, shiftKey: true });
  await harness.appNode.dispatchEvent("change", { target: checkbox });

  assert.deepEqual(Array.from(harness.state.maintain.reselectSelection), [10, 20, 30]);
  const framePanel = harness.renderRuntimeFrameReselect();
  assert.match(framePanel, /<span>已选素材帧<\/span><strong>3<\/strong>/);
  assert.match(framePanel, /<span>首帧索引<\/span><strong>10<\/strong>/);
  assert.match(framePanel, /<span>尾帧索引<\/span><strong>30<\/strong>/);
  assert.match(framePanel, /<span>索引断点<\/span><strong>2<\/strong>/);
  assert.match(framePanel, /frame-pool-card is-current is-selected/);
});

test("devtools frame selection supports full select and clear", async () => {
  const frames = [0, 1, 2].map((index) => ({ index, name: `frame${index}.png`, url: `frame${index}.png` }));
  const harness = createRendererHarness();
  await flushRendererPromises();
  harness.state.maintain.framePool = {
    hasProcessedFrames: true,
    processedFrames: frames,
    runtimeFrames: [frames[0]],
    selectedSourceFrames: [0],
    freezeLastFrame: false,
    protected: false
  };

  await harness.appNode.dispatchEvent("click", {
    target: createEventTarget({ selectAllFrames: "" }),
    shiftKey: false
  });
  assert.deepEqual(Array.from(harness.state.maintain.reselectSelection), [0, 1, 2]);

  await harness.appNode.dispatchEvent("click", {
    target: createEventTarget({ clearFrameSelection: "" }),
    shiftKey: false
  });
  assert.deepEqual(Array.from(harness.state.maintain.reselectSelection), []);
});
