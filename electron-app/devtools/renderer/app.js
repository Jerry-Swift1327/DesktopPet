const api = window.variantDevtools;
const appNode = document.getElementById("app");
const sidebarNode = document.querySelector(".sidebar");

const newVariantStages = ["prepareStaging", "writeMetadata", "copyVideos", "processVideos", "runPreflight", "generateGallery", "complete"];
const maintenanceStages = ["replaceAction", "renameAssets", "writeMetadataEdit", "deleteVariantResources", "complete"];
const allStageNames = Array.from(new Set(newVariantStages.concat(maintenanceStages)));

const stageLabels = {
  prepareStaging: "准备暂存",
  writeMetadata: "写入元数据",
  copyVideos: "复制视频",
  processVideos: "处理视频",
  runPreflight: "运行预检",
  generateGallery: "生成图鉴",
  renameAssets: "导入资源",
  replaceAction: "替换动作",
  writeMetadataEdit: "写入维护元数据",
  deleteVariantResources: "删除测试资源",
  complete: "完成",
  task: "任务",
  window: "窗口"
};

const statusLabels = {
  pending: "待执行",
  running: "执行中",
  done: "完成",
  failed: "失败",
  skipped: "已跳过"
};

const streamLabels = {
  stdout: "输出",
  stderr: "错误",
  info: "信息",
  error: "错误"
};

const stageWeights = {
  prepareStaging: 6,
  writeMetadata: 10,
  copyVideos: 12,
  processVideos: 42,
  runPreflight: 14,
  generateGallery: 10,
  renameAssets: 72,
  replaceAction: 72,
  writeMetadataEdit: 84,
  deleteVariantResources: 90,
  complete: 100
};

const defaultActionButtons = ["squat", "walk", "feed", "ball"];
const defaultEnabledFeatures = ["autoStart", "windowDocking", "windowRoam"];

const featureLabels = {
  autoStart: "开机自启",
  windowDocking: "拖拽吸附窗口",
  windowRoam: "窗口漫游",
  customization: "自定义",
  switchPet: "切换宠物",
  eyeTracking: "视线追踪",
  idleYawn: "闲置打哈欠",
  sleepPoseSwitch: "睡姿切换",
  wakeHiss: "唤醒哈气",
  dockShake: "Dock 抖动"
};

const navItems = [
  { view: "newVariant", label: "新增宠物" },
  { view: "petCatalog", label: "宠物库" },
  { view: "maintainVariant", label: "维护宠物" },
  { view: "deleteVariant", label: "删除宠物" }
];

const validViews = new Set(navItems.map((item) => item.view));
const navHoverColors = ["#eef8ff", "#f0fdf4", "#fff7ed", "#f5f3ff", "#fef2f2", "#ecfeff"];

function localDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createDefaultForm() {
  return {
    scope: "custom",
    tier: "basic",
    species: "cat",
    platforms: ["win32"],
    date: localDateString(),
    sourceFolder: "",
    actionVideos: {},
    autoSelectLoop: false,
    loopModes: {},
    advanced: {
      actionButtons: defaultActionButtons.slice(),
      actionAssets: [],
      features: defaultEnabledFeatures.slice(),
      disableFeatures: []
    },
    force: false,
    skipProcessing: false,
    skipPreflight: false,
    skipGallery: false
  };
}

const state = {
  view: "newVariant",
  options: null,
  variants: [],
  variantsPending: false,
  form: createDefaultForm(),
  preview: null,
  previewPending: false,
  previewRequestId: 0,
  result: null,
  successModal: null,
  running: false,
  activeOperation: "newVariant",
  advancedOpen: false,
  actionPickerOpen: false,
  featurePickerOpen: false,
  logs: [],
  stages: {},
  catalog: {
    selectedId: "",
    filters: {
      species: "",
      tier: "",
      scope: "",
      date: ""
    },
    details: null,
    checkResult: null,
    checkPending: false,
    gallery: null,
    galleryPending: false
  },
  maintain: {
    selectedId: "",
    details: null,
    action: "",
    replacementVideo: "",
    loopMode: { mode: "auto", sourceStart: "", sourceEnd: "" },
    replacePreview: null,
    replacePending: false,
    renameSourceFolder: "",
    renameForce: false,
    renamePreview: null,
    renamePending: false,
    metadataFields: {
      species: "",
      tier: "",
      notes: "",
      notePreset: "",
      actionButtons: [],
      actionAssets: [],
      featuresEnable: [],
      featuresDisable: []
    },
    metadataPreview: null,
    metadataPending: false
  },
  deleteVariant: {
    selectedId: "",
    preview: null,
    pending: false,
    confirmText: ""
  }
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char]));
}

function parseList(value) {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  return String(value)
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function listEqual(left, right) {
  const leftItems = parseList(left);
  const rightItems = parseList(right);
  return leftItems.length === rightItems.length && leftItems.every((item, index) => item === rightItems[index]);
}

function setListValue(list, value, checked) {
  const selected = new Set(parseList(list));
  if (checked) {
    selected.add(value);
  } else {
    selected.delete(value);
  }
  return Array.from(selected);
}

function notePresetOptions(scope, tier) {
  const result = [];
  const notes = state.options?.notes || {};
  for (const [scopeKey, tiers] of Object.entries(notes)) {
    for (const [tierKey, note] of Object.entries(tiers || {})) {
      result.push({
        value: note,
        label: `${scopeKey}/${tierKey} · ${note}`,
        recommended: scopeKey === scope && tierKey === tier
      });
    }
  }
  return result.sort((left, right) => {
    if (left.recommended !== right.recommended) {
      return left.recommended ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
}

function findNotePreset(value, scope, tier) {
  return notePresetOptions(scope, tier).find((item) => item.value === value)?.value || "custom";
}

function filterVariants(rows, filters) {
  return rows.filter((variant) => {
    if (filters.species && variant.species !== filters.species) {
      return false;
    }
    if (filters.tier && variant.tier !== filters.tier) {
      return false;
    }
    if (filters.scope && variant.scope !== filters.scope) {
      return false;
    }
    if (filters.date && variant.date !== filters.date) {
      return false;
    }
    return true;
  });
}

function catalogToneClass(id) {
  const toneCount = 8;
  let hash = 0;
  for (const char of String(id || "")) {
    hash = (hash * 31 + char.charCodeAt(0)) % toneCount;
  }
  return `catalog-tone-${hash}`;
}

function renderJson(value) {
  return escapeHtml(JSON.stringify(value, null, 2));
}

function busy() {
  return state.running
    || state.previewPending
    || state.catalog.checkPending
    || state.catalog.galleryPending
    || state.maintain.replacePending
    || state.maintain.renamePending
    || state.maintain.metadataPending
    || state.deleteVariant.pending;
}

function getNotesValue() {
  return (state.options.notes[state.form.scope] || {})[state.form.tier] || "";
}

function getDerivedDraftValue(name) {
  if (state.preview && state.preview.draft) {
    return state.preview.draft[name] || "";
  }
  const advancedValue = state.form.advanced[name];
  if (advancedValue) {
    return advancedValue;
  }
  return name === "version" ? "按模板生成" : "生成预览后显示";
}

function actionLabel(action) {
  const item = state.options.actions[action];
  return item ? `${action} / ${item.label || item.asset || "动作"}` : action;
}

function featureLabel(feature) {
  return `${feature} / ${featureLabels[feature] || "功能"}`;
}

function baseActionButtons() {
  const basic = state.options && state.options.tiers.basic;
  return basic && Array.isArray(basic.actionButtons) ? basic.actionButtons : defaultActionButtons;
}

function selectedActionButtons() {
  const selected = parseList(state.form.advanced.actionButtons);
  return selected.length > 0 ? selected : baseActionButtons();
}

function selectedActionAssets() {
  return parseList(state.form.advanced.actionAssets);
}

function selectedEnabledFeatures() {
  const value = state.form.advanced.features;
  if (value === undefined || value === null) {
    return defaultEnabledFeatures;
  }
  return parseList(value);
}

function selectedDisabledFeatures() {
  return parseList(state.form.advanced.disableFeatures);
}

function stageLabel(stage) {
  return stageLabels[stage] || stage;
}

function statusLabel(status) {
  return statusLabels[status] || status;
}

function streamLabel(stream) {
  return streamLabels[stream] || stream;
}

function requiredActions() {
  return Array.from(new Set(selectedActionButtons().concat(selectedActionAssets())));
}

function selectedPath(action) {
  const value = state.form.actionVideos[action];
  if (!value) {
    return "";
  }
  return typeof value === "string" ? value : value.path || "";
}

function defaultLoopMode() {
  return "full";
}

function loopModeFor(action) {
  const explicit = state.form.loopModes[action];
  return explicit || { mode: defaultLoopMode(), sourceStart: "", sourceEnd: "" };
}

function buildEffectiveLoopModes() {
  const result = {};
  for (const action of requiredActions()) {
    const mode = loopModeFor(action);
    result[action] = {
      mode: mode.mode || defaultLoopMode()
    };
    if (result[action].mode === "manual") {
      result[action].sourceStart = mode.sourceStart;
      result[action].sourceEnd = mode.sourceEnd;
    }
  }
  return result;
}

function clearNewPreview() {
  state.preview = null;
  state.result = null;
}

function clearMaintainPreviews() {
  state.maintain.replacePreview = null;
  state.maintain.metadataPreview = null;
}

function markMetadataPreviewDirty() {
  state.maintain.metadataPreview = null;
  const node = appNode.querySelector(".metadata-diff");
  if (node) {
    node.outerHTML = `<pre class="metadata-diff">尚未生成 diff 预览。</pre>`;
  }
}

function updateDeleteConfirmButton() {
  const button = appNode.querySelector("[data-delete-confirm]");
  if (!button) {
    return;
  }
  const selected = state.deleteVariant.selectedId;
  const preview = state.deleteVariant.preview;
  const confirmReady = selected && state.deleteVariant.confirmText === selected && preview && preview.canDelete;
  button.disabled = !confirmReady || busy();
}

function resetMaintainEdits() {
  if (state.maintain.details) {
    syncMaintainFields(state.maintain.details);
  }
  state.maintain.metadataPreview = null;
  state.logs = [];
  state.stages = {};
  renderPreservingScroll();
}

function setField(name, value) {
  if (busy()) {
    return;
  }
  state.form[name] = value;
  clearNewPreview();
  renderPreservingScroll();
}

function setAdvancedField(name, value) {
  if (busy()) {
    return;
  }
  state.form.advanced[name] = value;
  clearNewPreview();
  renderPreservingScroll();
}

function setAdvancedList(name, values) {
  if (busy()) {
    return;
  }
  state.form.advanced[name] = Array.from(new Set(values));
  clearNewPreview();
  renderPreservingScroll();
}

function toggleAction(action, kind, checked) {
  const name = kind === "asset" ? "actionAssets" : "actionButtons";
  const locked = kind === "button" ? new Set(baseActionButtons()) : new Set();
  const selected = new Set(parseList(state.form.advanced[name]));
  if (checked || locked.has(action)) {
    selected.add(action);
  } else {
    selected.delete(action);
  }
  for (const item of locked) {
    selected.add(item);
  }
  setAdvancedList(name, Array.from(selected));
}

function toggleFeature(name, feature, checked) {
  const selected = new Set(parseList(state.form.advanced[name]));
  const oppositeName = name === "features" ? "disableFeatures" : "features";
  const opposite = new Set(parseList(state.form.advanced[oppositeName]));
  if (checked) {
    selected.add(feature);
    opposite.delete(feature);
  } else {
    selected.delete(feature);
  }
  state.form.advanced[oppositeName] = Array.from(opposite);
  setAdvancedList(name, Array.from(selected));
}

function setRunOption(name, value) {
  if (busy()) {
    return;
  }
  state.form[name] = value;
  clearNewPreview();
  renderPreservingScroll();
}

function setLoopMode(action, patch) {
  if (busy()) {
    return;
  }
  state.form.loopModes[action] = {
    ...loopModeFor(action),
    ...patch
  };
  clearNewPreview();
  renderPreservingScroll();
}

function setActionVideo(action, filePath) {
  if (busy() || !filePath) {
    return;
  }
  state.form.actionVideos[action] = filePath;
  clearNewPreview();
  renderPreservingScroll();
}

function resetNewVariantForm() {
  state.form = createDefaultForm();
  state.preview = null;
  state.result = null;
  state.successModal = null;
  state.logs = [];
  state.stages = {};
  render();
}

function readScrollSnapshot() {
  return [document.querySelector(".workspace"), appNode.querySelector(".wizard-left"), appNode.querySelector(".wizard-right")]
    .filter(Boolean)
    .map((node) => ({
      node,
      className: node.className,
      scrollTop: node.scrollTop,
      scrollLeft: node.scrollLeft
    }));
}

function restoreScrollSnapshot(snapshot) {
  for (const item of snapshot || []) {
    const selector = item.className ? `.${String(item.className).split(/\s+/).filter(Boolean).join(".")}` : null;
    const node = item.node.isConnected ? item.node : (selector ? document.querySelector(selector) : null);
    if (node) {
      node.scrollTop = item.scrollTop;
      node.scrollLeft = item.scrollLeft;
    }
  }
}

function renderPreservingScroll() {
  render({ preserveScroll: true });
}

function renderSidebar() {
  if (!sidebarNode) {
    return;
  }
  sidebarNode.innerHTML = `<div class="brand">
    <strong>Chongban Devtools</strong>
    <span>内部维护工具</span>
  </div>
  <div class="nav-stack">
    ${navItems.map((item) => `<button class="nav-item ${state.view === item.view ? "active" : ""}" type="button" data-nav-view="${escapeHtml(item.view)}">${escapeHtml(item.label)}</button>`).join("")}
  </div>`;
}

function renderSelect(name, values) {
  const disabled = busy() ? " disabled" : "";
  return `<select data-field="${escapeHtml(name)}"${disabled}>${values.map((value) => {
    const selected = state.form[name] === value ? " selected" : "";
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`;
  }).join("")}</select>`;
}

function renderPlatformToggles() {
  return ["win32", "darwin"].map((platform) => {
    const checked = state.form.platforms.includes(platform) ? " checked" : "";
    const disabled = busy() ? " disabled" : "";
    return `<label class="check"><input type="checkbox" data-platform="${platform}"${checked}${disabled}>${platform}</label>`;
  }).join("");
}

function renderActionOption(action, kind, checked, locked = false) {
  const disabled = busy() || locked ? " disabled" : "";
  const checkedAttr = checked ? " checked" : "";
  const lockedText = locked ? `<span class="option-note">必选</span>` : "";
  return `<label class="option-check">
    <input type="checkbox" data-action-toggle="${escapeHtml(action)}" data-action-kind="${escapeHtml(kind)}"${checkedAttr}${disabled}>
    <span>${escapeHtml(actionLabel(action))}</span>
    ${lockedText}
  </label>`;
}

function renderFeatureOption(feature, name, checked) {
  const disabled = busy() ? " disabled" : "";
  const checkedAttr = checked ? " checked" : "";
  return `<label class="option-check">
    <input type="checkbox" data-feature-toggle="${escapeHtml(feature)}" data-feature-list="${escapeHtml(name)}"${checkedAttr}${disabled}>
    <span>${escapeHtml(featureLabel(feature))}</span>
  </label>`;
}

function renderActionPicker() {
  const baseButtons = new Set(baseActionButtons());
  const buttons = new Set(selectedActionButtons());
  const assets = new Set(selectedActionAssets());
  const entries = Object.entries(state.options.actions);
  const extraButtons = entries
    .filter(([action, item]) => item.kind === "button" && !baseButtons.has(action))
    .map(([action]) => renderActionOption(action, "button", buttons.has(action)));
  const assetOptions = entries
    .filter(([, item]) => item.kind === "asset")
    .map(([action]) => renderActionOption(action, "asset", assets.has(action)));

  return `<details class="option-section collapsible-section new-pet-picker" data-picker="actions"${state.actionPickerOpen ? " open" : ""}>
    <summary>动作选择</summary>
    <p class="muted">选择要出现在交互按钮和资源流程中的动作。</p>
    <div class="option-group">
      <strong>基础按钮动作</strong>
      <div class="option-grid new-pet-option-grid">${Array.from(baseButtons).map((action) => renderActionOption(action, "button", true, true)).join("")}</div>
    </div>
    <div class="option-group">
      <strong>扩展按钮动作</strong>
      <div class="option-grid new-pet-option-grid">${extraButtons.join("") || `<span class="muted">暂无扩展动作</span>`}</div>
    </div>
    <div class="option-group">
      <strong>资源动作</strong>
      <div class="option-grid new-pet-option-grid">${assetOptions.join("") || `<span class="muted">暂无资源动作</span>`}</div>
    </div>
  </details>`;
}

function renderFeaturePicker() {
  const enabled = new Set(selectedEnabledFeatures());
  const disabled = new Set(selectedDisabledFeatures());
  const features = Object.keys(state.options.features);
  return `<details class="option-section collapsible-section new-pet-picker" data-picker="features"${state.featurePickerOpen ? " open" : ""}>
    <summary>功能选择</summary>
    <div class="option-group">
      <strong>启用功能</strong>
      <div class="option-grid new-pet-option-grid">${features.map((feature) => renderFeatureOption(feature, "features", enabled.has(feature))).join("")}</div>
    </div>
    <div class="option-group">
      <strong>禁用功能</strong>
      <div class="option-grid new-pet-option-grid">${features.map((feature) => renderFeatureOption(feature, "disableFeatures", disabled.has(feature))).join("")}</div>
    </div>
  </details>`;
}

function renderDerivedSummary() {
  const enable = selectedEnabledFeatures();
  const disable = selectedDisabledFeatures();

  return `<div class="derived-summary">
    <div class="summary-grid summary-grid-compact">
      <div><span>宠物 ID id</span><strong>${escapeHtml(getDerivedDraftValue("id"))}</strong></div>
      <div><span>说明 notes</span><strong>${escapeHtml(getNotesValue() || "-")}</strong></div>
      <div><span>版本 version</span><strong>${escapeHtml(getDerivedDraftValue("version"))}</strong></div>
      <div><span>缩放 scale</span><strong>${escapeHtml(getDerivedDraftValue("scale"))}</strong></div>
      <div><span>资源前缀 assetPrefix</span><strong>${escapeHtml(getDerivedDraftValue("assetPrefix"))}</strong></div>
    </div>
    <div class="summary-grid summary-grid-wide">
      <div><span>动作 actions</span><strong>${escapeHtml(requiredActions().join(", ") || "-")}</strong></div>
      <div><span>启用功能 features on</span><strong>${escapeHtml(enable.join(", ") || "-")}</strong></div>
      <div><span>禁用功能 features off</span><strong>${escapeHtml(disable.join(", ") || "-")}</strong></div>
    </div>
  </div>`;
}

function renderLoopControls(action) {
  const value = loopModeFor(action);
  const disabled = busy() ? " disabled" : "";
  return `<div class="loop-controls">
    <label>运行帧
      <select data-loop-mode="${escapeHtml(action)}"${disabled}>
        <option value="full"${value.mode === "full" ? " selected" : ""}>完整帧</option>
        <option value="auto"${value.mode === "auto" ? " selected" : ""}>自动选取</option>
        <option value="manual"${value.mode === "manual" ? " selected" : ""}>手动范围</option>
      </select>
    </label>
    <div class="loop-range ${value.mode === "manual" ? "" : "is-hidden"}">
      <input type="number" min="0" step="1" placeholder="start" data-loop-start="${escapeHtml(action)}" value="${escapeHtml(value.sourceStart ?? "")}"${disabled}>
      <input type="number" min="0" step="1" placeholder="end" data-loop-end="${escapeHtml(action)}" value="${escapeHtml(value.sourceEnd ?? "")}"${disabled}>
    </div>
  </div>`;
}

function renderActionCards() {
  return requiredActions().map((action) => {
    const manualPath = selectedPath(action);
    const stagedPath = state.preview && state.preview.stagedVideos ? state.preview.stagedVideos[action] : "";
    const status = manualPath ? "manual" : (stagedPath ? "matched" : (state.form.sourceFolder ? "pending" : "missing"));
    const sourceKind = manualPath ? "手动选择" : (stagedPath ? "文件夹匹配" : (state.form.sourceFolder ? "等待预览扫描" : "缺少来源"));
    const cardStatusLabel = manualPath ? "已选择" : (stagedPath ? "已匹配" : (state.form.sourceFolder ? "待扫描" : "缺少视频"));
    const sourceText = manualPath || stagedPath || (state.form.sourceFolder ? "生成预览后扫描文件夹" : "未选择视频");
    return `<article class="action-card ${status}">
      <div class="action-copy">
        <div class="action-title-row">
          <h3>${escapeHtml(actionLabel(action))}</h3>
          <span class="action-status"><span class="status-dot"></span>${escapeHtml(cardStatusLabel)}</span>
        </div>
        <span class="badge">${escapeHtml(sourceKind)}</span>
        <p>${escapeHtml(sourceText)}</p>
        ${renderLoopControls(action)}
      </div>
      <button type="button" data-choose-action="${escapeHtml(action)}"${busy() ? " disabled" : ""}>${manualPath ? "替换视频" : "选择视频"}</button>
    </article>`;
  }).join("");
}

function renderPreview() {
  if (!state.preview) {
    return `<section class="panel empty-preview">
      <div class="panel-header">
        <h2>预览</h2>
        <span class="muted">${state.previewPending ? "生成中" : "等待生成"}</span>
      </div>
    </section>`;
  }

  return `<section class="panel">
    <div class="panel-header">
      <h2>预览</h2>
      <button type="button" class="primary" data-run-preview="${escapeHtml(state.preview.previewId)}"${busy() ? " disabled" : ""}>开始生成</button>
    </div>
    <div class="summary-grid">
      <div><span>宠物 ID id</span><strong>${escapeHtml(state.preview.draft.id)}</strong></div>
      <div><span>物种 species</span><strong>${escapeHtml(state.preview.draft.species)}</strong></div>
      <div><span>套餐 tier</span><strong>${escapeHtml(state.preview.draft.tier)}</strong></div>
      <div><span>版本 version</span><strong>${escapeHtml(state.preview.draft.version)}</strong></div>
    </div>
    <div class="preview-grid">
      <details class="preview-detail" open>
        <summary>元数据草稿</summary>
        <pre>${renderJson(state.preview.draft)}</pre>
      </details>
      <details class="preview-detail" open>
        <summary>复制目标</summary>
        <pre>${renderJson(state.preview.copied)}</pre>
      </details>
      <details class="preview-detail" open>
        <summary>处理命令</summary>
        <pre>${renderJson(state.preview.processCommands)}</pre>
      </details>
      <details class="preview-detail" open>
        <summary>预检命令</summary>
        <pre>${renderJson(state.preview.preflightCommands || [])}</pre>
      </details>
    </div>
    <details class="preview-detail warnings-detail" open>
      <summary>警告</summary>
      <pre>${renderJson(state.preview.warnings || [])}</pre>
    </details>
  </section>`;
}

function progressForStage(status, stage) {
  if (status === "done" || status === "skipped") {
    return 100;
  }
  if (status === "failed") {
    return 100;
  }
  if (status === "running") {
    return Math.max(18, Math.min(92, stageWeights[stage] || 50));
  }
  return 0;
}

function visibleStages() {
  if (state.activeOperation === "maintainVariant" || state.activeOperation === "deleteVariant") {
    return maintenanceStages;
  }
  return newVariantStages;
}

function renderExecution() {
  return `<section class="panel execution-panel">
    <div class="panel-header">
      <h2>执行进度</h2>
      ${state.result ? `<span class="success">已生成 ${escapeHtml(state.result.id)}</span>` : `<span class="muted">${state.running ? "执行中" : "空闲"}</span>`}
    </div>
    <div class="stage-list">
      ${visibleStages().map((stage, index) => {
        const status = state.stages[stage] || "pending";
        const percent = progressForStage(status, stage);
        return `<div class="stage ${escapeHtml(status)} stage-tone-${index % 5}">
          <div class="stage-row"><span>${escapeHtml(stageLabel(stage))}</span><strong>${percent}% · ${escapeHtml(statusLabel(status))}</strong></div>
          <div class="stage-progress"><span style="width: ${percent}%"></span></div>
        </div>`;
      }).join("")}
    </div>
    <pre class="log">${state.logs.map(escapeHtml).join("\n")}</pre>
  </section>`;
}

function renderAdvancedControls() {
  const advanced = state.form.advanced;
  const disabled = busy() ? " disabled" : "";
  return `<details class="advanced"${state.advancedOpen ? " open" : ""}>
    <summary>高级设置（谨慎使用）</summary>
    <div class="form-grid">
      <label>宠物 ID id <input type="text" data-advanced="id" value="${escapeHtml(advanced.id || "")}"${disabled}></label>
      <label>资源前缀 assetPrefix <input type="text" data-advanced="assetPrefix" value="${escapeHtml(advanced.assetPrefix || "")}"${disabled}></label>
      <label>缩放 scale <input type="number" min="0.4" max="2" step="0.05" data-advanced="scale" value="${escapeHtml(advanced.scale || "")}"${disabled}></label>
      <label>版本 version <input type="text" data-advanced="version" value="${escapeHtml(advanced.version || "")}"${disabled}></label>
    </div>
    <div class="check-row">
      <label class="check"><input type="checkbox" data-run-option="force"${state.form.force ? " checked" : ""}${disabled}>强制覆盖资源</label>
      <label class="check"><input type="checkbox" data-run-option="skipProcessing"${state.form.skipProcessing ? " checked" : ""}${disabled}>跳过视频处理</label>
      <label class="check"><input type="checkbox" data-run-option="skipPreflight"${state.form.skipPreflight ? " checked" : ""}${disabled}>跳过预检</label>
      <label class="check"><input type="checkbox" data-run-option="skipGallery"${state.form.skipGallery ? " checked" : ""}${disabled}>跳过图鉴生成</label>
    </div>
  </details>`;
}

function renderNewVariant() {
  const options = state.options;
  return `<div class="wizard">
    <div class="wizard-left">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h1>新增宠物</h1>
            <p class="muted">创建 metadata，并准备 bootstrap 处理流程。</p>
          </div>
        </div>
        <div class="form-grid new-pet-basics">
          <label>范围 scope ${renderSelect("scope", Object.keys(options.notes))}</label>
          <label>套餐 tier ${renderSelect("tier", Object.keys(options.tiers))}</label>
          <label>物种 species ${renderSelect("species", Object.keys(options.species))}</label>
          <label class="date-field">日期 date <input type="date" data-field="date" value="${escapeHtml(state.form.date)}"${busy() ? " disabled" : ""}></label>
          <div class="platforms inline-platforms">${renderPlatformToggles()}</div>
        </div>
        ${renderActionPicker()}
        ${renderFeaturePicker()}
        ${renderDerivedSummary()}
        ${renderAdvancedControls()}
      </section>

      <section class="panel">
        <div class="panel-header source-panel-header">
          <h2>源视频</h2>
          <div class="button-row source-actions">
            <button type="button" data-choose-folder${busy() ? " disabled" : ""}>选择文件夹</button>
            <button type="button" class="primary" data-build-preview${busy() || state.preview ? " disabled" : ""}>${state.previewPending ? "生成中" : "生成预览"}</button>
          </div>
        </div>
        <div class="source-path">${escapeHtml(state.form.sourceFolder || "未选择源视频文件夹")}</div>
        <div class="action-grid">${renderActionCards()}</div>
      </section>
    </div>

    <div class="wizard-right">
      ${renderPreview()}
      ${renderExecution()}
    </div>
  </div>
  ${renderSuccessModal()}`;
}

function renderCatalogFilter(name, values, label) {
  const selected = state.catalog.filters[name] || "";
  const disabled = busy() ? " disabled" : "";
  return `<label>${escapeHtml(label)}
    <select data-catalog-filter="${escapeHtml(name)}"${disabled}>
      <option value="">全部</option>
      ${values.map((value) => `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}
    </select>
  </label>`;
}

function renderPetCatalog() {
  const options = state.options;
  const rows = filterVariants(state.variants, state.catalog.filters);
  const selected = state.catalog.selectedId;
  const disabled = busy() ? " disabled" : "";
  const scopeValues = Array.from(new Set(state.variants.map((variant) => variant.scope))).sort();
  const dateValue = state.catalog.filters.date || "";
  return `<div class="wizard">
    <div class="wizard-left">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h1>宠物库</h1>
            <p class="muted">查看、筛选、检查宠物，并生成本地图鉴。</p>
          </div>
          <button type="button" data-refresh-variants${disabled}>刷新</button>
        </div>
        <div class="form-grid catalog-filters">
          ${renderCatalogFilter("scope", scopeValues, "范围 scope")}
          <label>日期 date
            <input type="date" data-catalog-filter="date" value="${escapeHtml(dateValue)}"${disabled}>
          </label>
          ${renderCatalogFilter("species", Object.keys(options.species), "物种 species")}
          ${renderCatalogFilter("tier", Object.keys(options.tiers), "套餐 tier")}
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>宠物列表</h2>
          <span class="muted">${rows.length} / ${state.variants.length}</span>
        </div>
        <div class="catalog-list">
          ${rows.map((variant) => `<button type="button" class="catalog-row ${catalogToneClass(variant.id)} ${selected === variant.id ? "active" : ""}" data-catalog-id="${escapeHtml(variant.id)}"${disabled}>
            <strong>${escapeHtml(variant.id)}</strong>
            <span>${escapeHtml([variant.scope, variant.species, variant.tier, variant.date].filter(Boolean).join(" · "))}</span>
          </button>`).join("") || `<p class="muted">没有匹配的宠物。</p>`}
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>图鉴</h2>
            <p class="muted">生成本地 <code>.variant-gallery/index.html</code>。</p>
          </div>
          <div class="button-row">
            <button type="button" data-generate-gallery${disabled}>${state.catalog.galleryPending ? "生成中" : "生成图鉴"}</button>
            <button type="button" data-open-gallery${disabled || !state.catalog.gallery ? " disabled" : ""}>打开图鉴</button>
          </div>
        </div>
        ${state.catalog.gallery ? `<pre>${renderJson(state.catalog.gallery)}</pre>` : `<p class="muted">生成后可从这里打开本地图鉴。</p>`}
      </section>
    </div>

    <div class="wizard-right">
      <section class="panel">
        <div class="panel-header">
          <h2>详情 / 检查</h2>
        </div>
        ${state.catalog.details ? `<div class="preview-grid">
          <section><h3>summary</h3><pre>${renderJson({
            id: state.catalog.details.id,
            notes: state.catalog.details.notes,
            species: state.catalog.details.species,
            tier: state.catalog.details.tier,
            scope: state.catalog.details.scope,
            platforms: state.catalog.details.platforms,
            version: state.catalog.details.version
          })}</pre></section>
          <section><h3>resources</h3><pre>${renderJson(state.catalog.details.resources)}</pre></section>
        </div>` : `<p class="muted">请选择一个宠物。</p>`}
      </section>
    </div>
  </div>`;
}

function renderVariantOptions(selectedId, onlyTest = false) {
  const rows = onlyTest ? state.variants.filter((variant) => variant.scope === "test") : state.variants;
  if (rows.length === 0) {
    return `<option value="">暂无宠物</option>`;
  }
  return rows.map((variant) => `<option value="${escapeHtml(variant.id)}"${selectedId === variant.id ? " selected" : ""}>${escapeHtml(variant.id)} · ${escapeHtml(variant.scope)} · ${escapeHtml(variant.species)}</option>`).join("");
}

function actionsFromDetails(details) {
  if (!details || !details.profile) {
    return [];
  }
  return Array.from(new Set((details.profile.actionButtons || details.profile.actions || []).concat(details.profile.actionAssets || details.profile.extraAnimationAssets || [])));
}

function syncMaintainFields(details) {
  if (!details || !details.profile) {
    return;
  }
  const profile = details.profile;
  const enabledFeatures = profile.enabledFeatures || Object.entries(profile.features || {}).filter(([, enabled]) => enabled).map(([name]) => name);
  const disabledFeatures = Object.entries(profile.features || {}).filter(([, enabled]) => enabled === false).map(([name]) => name);
  state.maintain.metadataFields = {
    species: profile.species || "",
    tier: profile.tier || "",
    notes: profile.notes || "",
    notePreset: findNotePreset(profile.notes || "", profile.scope, profile.tier),
    actionButtons: (profile.actionButtons || profile.actions || []).slice(),
    actionAssets: (profile.actionAssets || profile.extraAnimationAssets || []).slice(),
    featuresEnable: enabledFeatures.slice(),
    featuresDisable: disabledFeatures.slice()
  };
  const actions = actionsFromDetails(details);
  if (!state.maintain.action || !actions.includes(state.maintain.action)) {
    state.maintain.action = actions[0] || "";
  }
}

function renderMaintainSelectField(name, label, values, selected, disabled) {
  return `<label>${escapeHtml(label)}
    <select data-maintain-field="${escapeHtml(name)}"${disabled}>
      ${values.map((value) => `<option value="${escapeHtml(value)}"${selected === value ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}
    </select>
  </label>`;
}

function renderMaintainCheckboxList(name, label, values, selectedValues, disabled) {
  const selected = new Set(parseList(selectedValues));
  return `<div class="option-group maintain-choice-group">
    <strong>${escapeHtml(label)}</strong>
    <div class="option-grid">
      ${values.map((value) => `<label class="option-check">
        <input type="checkbox" data-maintain-list="${escapeHtml(name)}" data-maintain-list-value="${escapeHtml(value)}"${selected.has(value) ? " checked" : ""}${disabled}>
        <span>${name.startsWith("features") ? escapeHtml(featureLabel(value)) : escapeHtml(actionLabel(value))}</span>
      </label>`).join("")}
    </div>
  </div>`;
}

function renderMaintainNotesField(fields, disabled) {
  const presets = notePresetOptions(state.maintain.details?.profile?.scope, fields.tier);
  const presetValue = fields.notePreset || findNotePreset(fields.notes, state.maintain.details?.profile?.scope, fields.tier);
  return `<div class="notes-editor">
    <label>notes 标准项
      <select data-maintain-note-preset${disabled}>
        ${presets.map((item) => `<option value="${escapeHtml(item.value)}"${presetValue === item.value ? " selected" : ""}>${escapeHtml(item.label)}</option>`).join("")}
        <option value="custom"${presetValue === "custom" ? " selected" : ""}>自定义</option>
      </select>
    </label>
    <label>notes 自定义
      <input type="text" data-maintain-field="notes" value="${escapeHtml(fields.notes)}"${disabled}>
    </label>
  </div>`;
}

function renderMaintainMetadataControls(fields, disabled) {
  const actions = Object.keys(state.options.actions);
  const buttonActions = actions.filter((action) => state.options.actions[action].kind === "button");
  const assetActions = actions.filter((action) => state.options.actions[action].kind === "asset");
  const features = Object.keys(state.options.features);
  return `<div class="form-grid">
    ${renderMaintainSelectField("species", "species", Object.keys(state.options.species), fields.species, disabled)}
    ${renderMaintainSelectField("tier", "tier", Object.keys(state.options.tiers), fields.tier, disabled)}
  </div>
  ${renderMaintainNotesField(fields, disabled)}
  <div class="option-section">
    ${renderMaintainCheckboxList("actionButtons", "actions.buttons", buttonActions, fields.actionButtons, disabled)}
    ${renderMaintainCheckboxList("actionAssets", "actions.assets", assetActions, fields.actionAssets, disabled)}
    ${renderMaintainCheckboxList("featuresEnable", "features.enable", features, fields.featuresEnable, disabled)}
    ${renderMaintainCheckboxList("featuresDisable", "features.disable", features, fields.featuresDisable, disabled)}
  </div>`;
}

function renderMaintainVariant() {
  const details = state.maintain.details;
  const fields = state.maintain.metadataFields;
  const actions = actionsFromDetails(details);
  const disabled = busy() ? " disabled" : "";
  return `<div class="wizard">
    <div class="wizard-left">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h1>维护宠物</h1>
            <p class="muted">替换动作资源、批量导入动作源视频，或预览后写入结构化元数据</p>
          </div>
          <button type="button" data-refresh-variants${disabled}>刷新</button>
        </div>
        <div class="form-grid">
          <label>选择宠物
            <select data-maintain-select${disabled}>${renderVariantOptions(state.maintain.selectedId)}</select>
          </label>
          <label>替换动作
            <select data-maintain-action${disabled}>${actions.map((action) => `<option value="${escapeHtml(action)}"${state.maintain.action === action ? " selected" : ""}>${escapeHtml(actionLabel(action))}</option>`).join("")}</select>
          </label>
        </div>
        ${details ? `<div class="summary-grid">
          <div><span>scope</span><strong>${escapeHtml(details.profile.scope)}</strong></div>
          <div><span>assetPrefix</span><strong>${escapeHtml(details.profile.assetPrefix)}</strong></div>
          <div><span>version</span><strong>${escapeHtml(details.profile.version)}</strong></div>
          <div><span>manifest</span><strong>${escapeHtml(details.resources.manifest)}</strong></div>
        </div>` : `<p class="muted">请选择一个宠物。</p>`}
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>替换动作资源</h2>
          <button type="button" data-build-replace-preview${disabled}>生成替换预览</button>
        </div>
        <div class="source-path">${escapeHtml(state.maintain.replacementVideo || "未选择替换视频")}</div>
        <div class="replace-toolbar">
          <button type="button" data-choose-replacement${disabled}>选择 MP4</button>
          ${renderMaintainLoopControls()}
        </div>
        ${state.maintain.replacePreview ? `<div class="preview-grid">
          <section><h3>替换命令</h3><pre>${renderJson(state.maintain.replacePreview.command)}</pre></section>
          <section><h3>目标资源</h3><pre>${renderJson({ targetAction: state.maintain.replacePreview.targetAction, manifest: state.maintain.replacePreview.manifest })}</pre></section>
        </div>
        <button type="button" class="primary" data-run-replace-action="${escapeHtml(state.maintain.replacePreview.previewId)}"${disabled}>执行替换</button>` : ""}
      </section>

      <section class="panel">
        <div class="panel-header">
          <div>
            <h2>批量导入动作源视频</h2>
            <p class="muted">预览并执行 rename-assets，将源目录中的动作 MP4 复制到当前宠物资源目录。</p>
          </div>
          <button type="button" data-build-rename-preview${disabled || !state.maintain.renameSourceFolder ? " disabled" : ""}>生成导入预览</button>
        </div>
        <div class="source-path">${escapeHtml(state.maintain.renameSourceFolder || "未选择源视频文件夹")}</div>
        <div class="check-row">
          <button type="button" data-choose-rename-folder${disabled}>选择文件夹</button>
          <label class="check"><input type="checkbox" data-maintain-rename-force${state.maintain.renameForce ? " checked" : ""}${disabled}>强制覆盖目标视频</label>
        </div>
        ${state.maintain.renamePreview ? `<div class="preview-grid">
          <section><h3>复制计划</h3><pre>${renderJson(state.maintain.renamePreview.copied)}</pre></section>
          <section><h3>源目录</h3><pre>${renderJson({ sourceDir: state.maintain.renamePreview.sourceDir, animationsRoot: state.maintain.renamePreview.animationsRoot })}</pre></section>
        </div>
        <button type="button" class="primary" data-run-rename-assets="${escapeHtml(state.maintain.renamePreview.previewId)}"${disabled}>执行导入</button>` : ""}
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>修改信息 / 元数据</h2>
          <div class="button-row">
            <button type="button" data-reset-maintain-edits${disabled}>取消修改并清空记录</button>
            <button type="button" data-build-metadata-preview${disabled}>生成 diff 预览</button>
          </div>
        </div>
        ${renderMaintainMetadataControls(fields, disabled)}
        ${renderMetadataDiff()}
      </section>
    </div>
    <div class="wizard-right">
      ${renderVariantDetails(details)}
      ${renderExecution()}
    </div>
  </div>`;
}

function renderMaintainLoopControls() {
  const value = state.maintain.loopMode;
  const disabled = busy() ? " disabled" : "";
  return `<div class="loop-controls inline-loop">
    <label>运行帧
      <select data-maintain-loop-mode${disabled}>
        <option value="full"${value.mode === "full" ? " selected" : ""}>完整帧</option>
        <option value="auto"${value.mode === "auto" ? " selected" : ""}>自动选取</option>
        <option value="manual"${value.mode === "manual" ? " selected" : ""}>手动范围</option>
      </select>
    </label>
    <div class="loop-range ${value.mode === "manual" ? "" : "is-hidden"}">
      <input type="number" min="0" step="1" placeholder="start" data-maintain-loop-start value="${escapeHtml(value.sourceStart ?? "")}"${disabled}>
      <input type="number" min="0" step="1" placeholder="end" data-maintain-loop-end value="${escapeHtml(value.sourceEnd ?? "")}"${disabled}>
    </div>
  </div>`;
}

function renderMetadataDiff() {
  const preview = state.maintain.metadataPreview;
  if (!preview) {
    return `<pre class="metadata-diff">尚未生成 diff 预览。</pre>`;
  }
  return `<div class="metadata-diff">
    ${preview.reason ? `<p class="danger">${escapeHtml(preview.reason)}</p>` : ""}
    <pre>${renderJson(preview.diff || [])}</pre>
    <button type="button" class="primary" data-apply-metadata-edit="${escapeHtml(preview.previewId)}"${busy() || !preview.canApply ? " disabled" : ""}>确认写入元数据</button>
  </div>`;
}

function renderVariantDetails(details) {
  if (!details) {
    return `<section class="panel empty-preview">
      <div class="panel-header"><h2>宠物详情</h2><span class="muted">${state.variantsPending ? "加载中" : "未选择"}</span></div>
    </section>`;
  }
  return `<section class="panel">
    <div class="panel-header"><h2>宠物详情</h2><span class="muted">${escapeHtml(details.id)}</span></div>
    <div class="preview-grid">
      <section><h3>profile</h3><pre>${renderJson(details.profile)}</pre></section>
      <section><h3>resources</h3><pre>${renderJson(details.resources)}</pre></section>
    </div>
  </section>`;
}

function renderDeleteVariant() {
  const preview = state.deleteVariant.preview;
  const selected = state.deleteVariant.selectedId;
  const disabled = busy() ? " disabled" : "";
  const confirmReady = selected && state.deleteVariant.confirmText === selected && preview && preview.canDelete;
  return `<div class="wizard">
    <div class="wizard-left">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h1>删除宠物</h1>
            <p class="muted">仅允许删除 scope 为 test 的宠物及其开发态资源</p>
          </div>
          <button type="button" data-refresh-variants${disabled}>刷新</button>
        </div>
        <div class="form-grid">
          <label>测试宠物
            <select data-delete-select${disabled}>${renderVariantOptions(selected, true)}</select>
          </label>
          <label>二次确认
            <input type="text" data-delete-confirm-input value="${escapeHtml(state.deleteVariant.confirmText)}" placeholder="输入宠物 ID"${disabled}>
          </label>
        </div>
        <div class="check-row">
          <button type="button" data-build-delete-preview${disabled}>生成删除预览</button>
          <button type="button" class="danger-button" data-delete-confirm="${preview ? escapeHtml(preview.previewId) : ""}"${!confirmReady || busy() ? " disabled" : ""}>确认删除宠物</button>
        </div>
      </section>

      <section class="panel">
        <div class="panel-header">
          <h2>删除清单</h2>
          ${preview ? `<span class="${preview.canDelete ? "success" : "danger"}">${preview.canDelete ? "可删除" : "不可删除"}</span>` : `<span class="muted">尚未预览</span>`}
        </div>
        ${preview ? `<pre>${renderJson({ reason: preview.reason, runtimeAssets: preview.runtimeAssets, paths: preview.paths })}</pre>` : `<p class="muted">生成预览后会显示 metadata、资源目录、运行时资源和用户数据清单。</p>`}
      </section>
    </div>
    <div class="wizard-right">
      ${renderExecution()}
    </div>
  </div>`;
}

function renderSuccessModal() {
  if (!state.successModal) {
    return "";
  }
  return `<div class="success-modal" role="dialog" aria-modal="true">
    <div class="success-dialog">
      <div class="checkmark" aria-hidden="true"></div>
      <h2>生成完成</h2>
      <p class="muted">${escapeHtml(state.successModal.id)} 已生成。</p>
      <div class="check-row">
        <button type="button" class="primary" data-reset-new-variant>清空表单并恢复默认</button>
        <button type="button" data-close-success>保留当前记录</button>
      </div>
    </div>
  </div>`;
}

const viewRenderers = {
  newVariant: renderNewVariant,
  petCatalog: renderPetCatalog,
  maintainVariant: renderMaintainVariant,
  deleteVariant: renderDeleteVariant
};

function isKnownView(view) {
  return validViews.has(view) && typeof viewRenderers[view] === "function";
}

function normalizeView(view) {
  return isKnownView(view) ? view : "newVariant";
}

function renderViewShell(view, content) {
  return `<div class="view-root" data-current-view="${escapeHtml(view)}">${content}</div>`;
}

function render(options = {}) {
  const scrollSnapshot = options.preserveScroll ? readScrollSnapshot() : null;
  const currentView = normalizeView(state.view);
  if (state.view !== currentView) {
    state.view = currentView;
  }
  renderSidebar();
  if (!api) {
    appNode.innerHTML = `<pre class="fatal">Devtools 预加载 API 不可用。</pre>`;
    restoreScrollSnapshot(scrollSnapshot);
    return;
  }
  if (!state.options) {
    appNode.innerHTML = `<div class="loading">加载中</div>`;
    restoreScrollSnapshot(scrollSnapshot);
    return;
  }
  appNode.innerHTML = renderViewShell(currentView, viewRenderers[currentView]());
  restoreScrollSnapshot(scrollSnapshot);
}

function pushLog(message) {
  state.logs.push(message);
}

function formatLogEvent(event) {
  const stage = event.stage || "task";
  const stream = event.stream || "info";
  return `[${stageLabel(stage)}:${streamLabel(stream)}] ${String(event.message || "").trim()}`;
}

async function refreshVariants(options = {}) {
  if (!api.listVariants) {
    return;
  }
  state.variantsPending = true;
  if (options.preserveScroll) {
    renderPreservingScroll();
  } else {
    render();
  }
  try {
    state.variants = await api.listVariants();
    if (!state.catalog.selectedId && state.variants.length > 0) {
      state.catalog.selectedId = state.variants[0].id;
    }
    if (!state.maintain.selectedId && state.variants.length > 0) {
      state.maintain.selectedId = state.variants[0].id;
    }
    const testVariants = state.variants.filter((variant) => variant.scope === "test");
    if (!state.deleteVariant.selectedId && testVariants.length > 0) {
      state.deleteVariant.selectedId = testVariants[0].id;
    }
  } catch (error) {
    pushLog(error.message);
  } finally {
    state.variantsPending = false;
    if (options.preserveScroll) {
      renderPreservingScroll();
    } else {
      render();
    }
  }
}

async function loadMaintainDetails(id, options = {}) {
  const renderDetails = options.preserveScroll ? renderPreservingScroll : render;
  if (!id || !api.getVariantDetails) {
    state.maintain.details = null;
    renderDetails();
    return;
  }
  try {
    state.maintain.details = await api.getVariantDetails(id);
    syncMaintainFields(state.maintain.details);
  } catch (error) {
    state.maintain.details = null;
    pushLog(error.message);
  }
  renderDetails();
}

async function loadCatalogDetails(id) {
  if (!id || !api.getVariantDetails) {
    state.catalog.details = null;
    state.catalog.checkResult = null;
    render();
    return;
  }
  try {
    state.catalog.details = await api.getVariantDetails(id);
    state.catalog.checkResult = null;
  } catch (error) {
    state.catalog.details = null;
    pushLog(error.message);
  }
  render();
}

async function switchView(view) {
  if (!isKnownView(view) || busy() || state.view === view) {
    return;
  }
  state.view = view;
  state.activeOperation = view;
  state.logs = [];
  state.stages = {};
  render();
  if (view === "maintainVariant" || view === "deleteVariant" || view === "petCatalog") {
    await refreshVariants();
    if (view === "maintainVariant" && state.maintain.selectedId) {
      await loadMaintainDetails(state.maintain.selectedId);
    } else if (view === "petCatalog" && state.catalog.selectedId) {
      await loadCatalogDetails(state.catalog.selectedId);
    }
  }
}

async function buildPreview() {
  if (busy()) {
    return;
  }
  const requestId = state.previewRequestId + 1;
  state.previewRequestId = requestId;
  state.previewPending = true;
  state.activeOperation = "newVariant";
  clearNewPreview();
  renderPreservingScroll();

  try {
    const formSnapshot = JSON.parse(JSON.stringify(state.form));
    formSnapshot.loopModes = buildEffectiveLoopModes();
    const preview = await api.buildNewVariantPreview(formSnapshot);
    if (requestId !== state.previewRequestId) {
      return;
    }
    state.preview = preview;
    state.result = null;
    state.logs = [];
    state.stages = {};
  } catch (error) {
    if (requestId === state.previewRequestId) {
      pushLog(error.message);
    }
  } finally {
    if (requestId === state.previewRequestId) {
      state.previewPending = false;
      renderPreservingScroll();
    }
  }
}

async function runPreview(previewId) {
  if (!state.preview || busy()) {
    return;
  }
  if (!window.confirm("确认开始生成这个宠物吗？")) {
    return;
  }

  state.running = true;
  state.activeOperation = "newVariant";
  state.result = null;
  state.logs = [];
  state.stages = {};
  render();

  try {
    const result = await api.runNewVariant(previewId);
    state.result = result;
    state.successModal = { id: result.id };
    state.stages.complete = "done";
  } catch (error) {
    state.stages.complete = "failed";
    pushLog(error.message);
  } finally {
    state.running = false;
    render();
  }
}

function buildMetadataPayload() {
  const fields = state.maintain.metadataFields;
  return {
    id: state.maintain.selectedId,
    fields: {
      species: fields.species,
      tier: fields.tier,
      notes: fields.notes,
      actions: {
        buttons: parseList(fields.actionButtons),
        assets: parseList(fields.actionAssets)
      },
      features: {
        enable: parseList(fields.featuresEnable),
        disable: parseList(fields.featuresDisable)
      }
    }
  };
}

async function buildReplacePreview() {
  if (busy() || !state.maintain.selectedId || !state.maintain.action || !state.maintain.replacementVideo) {
    return;
  }
  state.maintain.replacePending = true;
  clearMaintainPreviews();
  render();
  try {
    state.maintain.replacePreview = await api.buildReplaceActionPreview({
      id: state.maintain.selectedId,
      action: state.maintain.action,
      video: state.maintain.replacementVideo,
      loopMode: state.maintain.loopMode
    });
  } catch (error) {
    pushLog(error.message);
  } finally {
    state.maintain.replacePending = false;
    render();
  }
}

async function runReplaceAction(previewId) {
  if (busy() || !previewId || !window.confirm("确认执行动作资源替换吗？")) {
    return;
  }
  state.running = true;
  state.activeOperation = "maintainVariant";
  state.logs = [];
  state.stages = {};
  render();
  try {
    await api.runReplaceAction(previewId);
    state.stages.complete = "done";
    await loadMaintainDetails(state.maintain.selectedId);
  } catch (error) {
    state.stages.complete = "failed";
    pushLog(error.message);
  } finally {
    state.running = false;
    render();
  }
}

async function buildRenamePreview() {
  if (busy() || !state.maintain.selectedId || !state.maintain.renameSourceFolder) {
    return;
  }
  state.maintain.renamePending = true;
  state.maintain.renamePreview = null;
  renderPreservingScroll();
  try {
    state.maintain.renamePreview = await api.buildRenameAssetsPreview({
      id: state.maintain.selectedId,
      from: state.maintain.renameSourceFolder,
      force: state.maintain.renameForce
    });
  } catch (error) {
    pushLog(error.message);
  } finally {
    state.maintain.renamePending = false;
    renderPreservingScroll();
  }
}

async function runRenameAssets(previewId) {
  if (busy() || !previewId || !window.confirm("确认导入这些动作源视频吗？")) {
    return;
  }
  state.running = true;
  state.activeOperation = "maintainVariant";
  state.logs = [];
  state.stages = {};
  renderPreservingScroll();
  try {
    await api.runRenameAssets(previewId);
    state.stages.complete = "done";
    state.maintain.renamePreview = null;
    await loadMaintainDetails(state.maintain.selectedId, { preserveScroll: true });
  } catch (error) {
    state.stages.complete = "failed";
    pushLog(error.message);
  } finally {
    state.running = false;
    renderPreservingScroll();
  }
}

async function checkCatalogVariant() {
  if (busy() || !state.catalog.selectedId) {
    return;
  }
  state.catalog.checkPending = true;
  state.catalog.checkResult = null;
  render();
  try {
    state.catalog.checkResult = await api.checkVariant(state.catalog.selectedId);
  } catch (error) {
    pushLog(error.message);
  } finally {
    state.catalog.checkPending = false;
    render();
  }
}

async function generateCatalogGallery() {
  if (busy()) {
    return;
  }
  state.catalog.galleryPending = true;
  state.activeOperation = "petCatalog";
  state.stages.generateGallery = "running";
  renderPreservingScroll();
  try {
    state.catalog.gallery = await api.generateGallery();
    state.stages.generateGallery = "done";
  } catch (error) {
    state.stages.generateGallery = "failed";
    pushLog(error.message);
  } finally {
    state.catalog.galleryPending = false;
    renderPreservingScroll();
  }
}

async function openCatalogGallery() {
  if (busy()) {
    return;
  }
  try {
    await api.openGallery();
  } catch (error) {
    pushLog(error.message);
    render();
  }
}

async function buildMetadataPreview() {
  if (busy() || !state.maintain.selectedId) {
    return;
  }
  state.maintain.metadataPending = true;
  state.maintain.metadataPreview = null;
  renderPreservingScroll();
  try {
    state.maintain.metadataPreview = await api.buildMetadataEditPreview(buildMetadataPayload());
  } catch (error) {
    pushLog(error.message);
  } finally {
    state.maintain.metadataPending = false;
    renderPreservingScroll();
  }
}

async function applyMetadataEdit(previewId) {
  if (busy() || !previewId || !window.confirm("确认写入这次元数据修改吗？")) {
    return;
  }
  state.running = true;
  state.activeOperation = "maintainVariant";
  state.logs = [];
  state.stages = {};
  renderPreservingScroll();
  try {
    await api.applyMetadataEdit(previewId);
    state.stages.complete = "done";
    await refreshVariants({ preserveScroll: true });
    await loadMaintainDetails(state.maintain.selectedId, { preserveScroll: true });
  } catch (error) {
    state.stages.complete = "failed";
    pushLog(error.message);
  } finally {
    state.running = false;
    renderPreservingScroll();
  }
}

async function buildDeletePreview() {
  if (busy() || !state.deleteVariant.selectedId) {
    return;
  }
  state.deleteVariant.pending = true;
  state.deleteVariant.preview = null;
  render();
  try {
    state.deleteVariant.preview = await api.buildDeleteVariantPreview(state.deleteVariant.selectedId);
  } catch (error) {
    pushLog(error.message);
  } finally {
    state.deleteVariant.pending = false;
    render();
  }
}

async function deleteTestVariant(previewId) {
  if (busy() || !previewId || !window.confirm("确认删除这个测试宠物及其开发态资源吗？")) {
    return;
  }
  state.running = true;
  state.activeOperation = "deleteVariant";
  state.logs = [];
  state.stages = {};
  render();
  try {
    await api.deleteTestVariant(previewId);
    state.stages.complete = "done";
    state.deleteVariant.preview = null;
    state.deleteVariant.confirmText = "";
    await refreshVariants();
  } catch (error) {
    state.stages.complete = "failed";
    pushLog(error.message);
  } finally {
    state.running = false;
    render();
  }
}

if (sidebarNode) {
  sidebarNode.addEventListener("click", (event) => {
    const navButton = event.target.closest("[data-nav-view]");
    const view = navButton ? navButton.dataset.navView : "";
    if (isKnownView(view)) {
      event.preventDefault();
      switchView(view);
    }
  });
  sidebarNode.addEventListener("pointerover", (event) => {
    const navButton = event.target.closest("[data-nav-view]");
    const related = event.relatedTarget;
    if (!navButton || (related && related.nodeType && navButton.contains(related))) {
      return;
    }
    const nextColor = navHoverColors[Math.floor(Math.random() * navHoverColors.length)];
    navButton.style.setProperty("--nav-hover-bg", nextColor);
  });
}

appNode.addEventListener("toggle", (event) => {
  if (event.target.classList.contains("advanced")) {
    state.advancedOpen = event.target.open;
  } else if (event.target.dataset.picker === "actions") {
    state.actionPickerOpen = event.target.open;
  } else if (event.target.dataset.picker === "features") {
    state.featurePickerOpen = event.target.open;
  }
}, true);

appNode.addEventListener("input", (event) => {
  const maintainField = event.target.dataset.maintainField;
  if (maintainField) {
    state.maintain.metadataFields[maintainField] = event.target.value;
    state.maintain.metadataFields.notePreset = findNotePreset(
      state.maintain.metadataFields.notes,
      state.maintain.details?.profile?.scope,
      state.maintain.metadataFields.tier
    );
    markMetadataPreviewDirty();
    return;
  }
  if (event.target.dataset.deleteConfirmInput !== undefined) {
    state.deleteVariant.confirmText = event.target.value;
    updateDeleteConfirmButton();
    return;
  }
  if (event.target.dataset.maintainLoopStart !== undefined) {
    state.maintain.loopMode.sourceStart = event.target.value;
    state.maintain.replacePreview = null;
  } else if (event.target.dataset.maintainLoopEnd !== undefined) {
    state.maintain.loopMode.sourceEnd = event.target.value;
    state.maintain.replacePreview = null;
  } else if (event.target.dataset.loopStart) {
    setLoopMode(event.target.dataset.loopStart, { sourceStart: event.target.value });
  } else if (event.target.dataset.loopEnd) {
    setLoopMode(event.target.dataset.loopEnd, { sourceEnd: event.target.value });
  }
});

appNode.addEventListener("change", async (event) => {
  if (busy()) {
    render();
    return;
  }
  const field = event.target.dataset.field;
  const advanced = event.target.dataset.advanced;
  const platform = event.target.dataset.platform;
  const runOption = event.target.dataset.runOption;
  const actionToggle = event.target.dataset.actionToggle;
  const actionKind = event.target.dataset.actionKind;
  const featureToggle = event.target.dataset.featureToggle;
  const featureList = event.target.dataset.featureList;
  const catalogFilter = event.target.dataset.catalogFilter;
  const maintainField = event.target.dataset.maintainField;
  const maintainList = event.target.dataset.maintainList;
  const maintainListValue = event.target.dataset.maintainListValue;

  if (field) {
    setField(field, event.target.value);
  } else if (advanced) {
    setAdvancedField(advanced, event.target.value);
  } else if (actionToggle) {
    toggleAction(actionToggle, actionKind, event.target.checked);
  } else if (featureToggle) {
    toggleFeature(featureList, featureToggle, event.target.checked);
  } else if (platform) {
    const next = new Set(state.form.platforms);
    if (event.target.checked) {
      next.add(platform);
    } else {
      next.delete(platform);
    }
    if (next.size === 0) {
      next.add("win32");
    }
    state.form.platforms = Array.from(next);
    clearNewPreview();
    renderPreservingScroll();
  } else if (runOption) {
    setRunOption(runOption, event.target.checked);
  } else if (event.target.dataset.loopMode) {
    setLoopMode(event.target.dataset.loopMode, { mode: event.target.value });
  } else if (catalogFilter) {
    state.catalog.filters[catalogFilter] = event.target.value;
    const rows = filterVariants(state.variants, state.catalog.filters);
    if (!rows.some((variant) => variant.id === state.catalog.selectedId)) {
      state.catalog.selectedId = rows[0]?.id || "";
    }
    state.catalog.details = null;
    state.catalog.checkResult = null;
    render();
    if (state.catalog.selectedId) {
      await loadCatalogDetails(state.catalog.selectedId);
    }
  } else if (event.target.dataset.maintainSelect !== undefined) {
    state.maintain.selectedId = event.target.value;
    state.maintain.replacePreview = null;
    state.maintain.renamePreview = null;
    state.maintain.metadataPreview = null;
    await loadMaintainDetails(event.target.value);
  } else if (event.target.dataset.maintainAction !== undefined) {
    state.maintain.action = event.target.value;
    state.maintain.replacePreview = null;
    render();
  } else if (event.target.dataset.maintainLoopMode !== undefined) {
    state.maintain.loopMode.mode = event.target.value;
    state.maintain.replacePreview = null;
    render();
  } else if (maintainField) {
    state.maintain.metadataFields[maintainField] = event.target.value;
    if (maintainField === "tier" && state.maintain.metadataFields.notePreset !== "custom") {
      const scope = state.maintain.details?.profile?.scope;
      const nextNote = scope ? state.options.notes[scope]?.[event.target.value] : null;
      if (nextNote) {
        state.maintain.metadataFields.notes = nextNote;
        state.maintain.metadataFields.notePreset = nextNote;
      }
    }
    state.maintain.metadataPreview = null;
    renderPreservingScroll();
  } else if (event.target.dataset.maintainNotePreset !== undefined) {
    state.maintain.metadataFields.notePreset = event.target.value;
    if (event.target.value !== "custom") {
      state.maintain.metadataFields.notes = event.target.value;
    }
    state.maintain.metadataPreview = null;
    renderPreservingScroll();
  } else if (maintainList) {
    state.maintain.metadataFields[maintainList] = setListValue(
      state.maintain.metadataFields[maintainList],
      maintainListValue,
      event.target.checked
    );
    if (maintainList === "featuresEnable" && event.target.checked) {
      state.maintain.metadataFields.featuresDisable = setListValue(state.maintain.metadataFields.featuresDisable, maintainListValue, false);
    } else if (maintainList === "featuresDisable" && event.target.checked) {
      state.maintain.metadataFields.featuresEnable = setListValue(state.maintain.metadataFields.featuresEnable, maintainListValue, false);
    }
    state.maintain.metadataPreview = null;
    renderPreservingScroll();
  } else if (event.target.dataset.maintainRenameForce !== undefined) {
    state.maintain.renameForce = event.target.checked;
    state.maintain.renamePreview = null;
    renderPreservingScroll();
  } else if (event.target.dataset.deleteSelect !== undefined) {
    state.deleteVariant.selectedId = event.target.value;
    state.deleteVariant.preview = null;
    state.deleteVariant.confirmText = "";
    render();
  }
});

appNode.addEventListener("click", async (event) => {
  if (busy() && event.target.dataset.closeSuccess === undefined) {
    return;
  }
  const catalogRow = event.target.closest("[data-catalog-id]");
  const action = event.target.dataset.chooseAction;
  const previewId = event.target.dataset.runPreview;

  if (catalogRow) {
    state.catalog.selectedId = catalogRow.dataset.catalogId;
    state.catalog.checkResult = null;
    await loadCatalogDetails(state.catalog.selectedId);
  } else if (event.target.dataset.chooseFolder !== undefined) {
    const folder = await api.chooseSourceFolder();
    if (folder) {
      setField("sourceFolder", folder);
    }
  } else if (action) {
    const filePath = await api.chooseActionVideo(action);
    setActionVideo(action, filePath);
  } else if (event.target.dataset.buildPreview !== undefined) {
    await buildPreview();
  } else if (previewId) {
    await runPreview(previewId);
  } else if (event.target.dataset.resetNewVariant !== undefined) {
    resetNewVariantForm();
  } else if (event.target.dataset.closeSuccess !== undefined) {
    state.successModal = null;
    render();
  } else if (event.target.dataset.refreshVariants !== undefined) {
    await refreshVariants();
    if (state.view === "petCatalog" && state.catalog.selectedId) {
      await loadCatalogDetails(state.catalog.selectedId);
    } else if (state.view === "maintainVariant" && state.maintain.selectedId) {
      await loadMaintainDetails(state.maintain.selectedId);
    }
  } else if (event.target.dataset.catalogCheck !== undefined) {
    await checkCatalogVariant();
  } else if (event.target.dataset.generateGallery !== undefined) {
    await generateCatalogGallery();
  } else if (event.target.dataset.openGallery !== undefined) {
    await openCatalogGallery();
  } else if (event.target.dataset.chooseReplacement !== undefined) {
    const filePath = await api.chooseActionVideo(state.maintain.action || "replace");
    if (filePath) {
      state.maintain.replacementVideo = filePath;
      state.maintain.replacePreview = null;
      render();
    }
  } else if (event.target.dataset.chooseRenameFolder !== undefined) {
    const folder = await api.chooseSourceFolder();
    if (folder) {
      state.maintain.renameSourceFolder = folder;
      state.maintain.renamePreview = null;
      renderPreservingScroll();
    }
  } else if (event.target.dataset.buildReplacePreview !== undefined) {
    await buildReplacePreview();
  } else if (event.target.dataset.runReplaceAction) {
    await runReplaceAction(event.target.dataset.runReplaceAction);
  } else if (event.target.dataset.buildRenamePreview !== undefined) {
    await buildRenamePreview();
  } else if (event.target.dataset.runRenameAssets) {
    await runRenameAssets(event.target.dataset.runRenameAssets);
  } else if (event.target.dataset.resetMaintainEdits !== undefined) {
    resetMaintainEdits();
  } else if (event.target.dataset.buildMetadataPreview !== undefined) {
    await buildMetadataPreview();
  } else if (event.target.dataset.applyMetadataEdit) {
    await applyMetadataEdit(event.target.dataset.applyMetadataEdit);
  } else if (event.target.dataset.buildDeletePreview !== undefined) {
    await buildDeletePreview();
  } else if (event.target.dataset.deleteConfirm) {
    await deleteTestVariant(event.target.dataset.deleteConfirm);
  }
});

if (api) {
  api.onTaskStatus((event) => {
    state.stages[event.stage] = event.status;
    if (event.error) {
      pushLog(`[${stageLabel(event.stage)}:错误] ${event.error}`);
    }
    render();
  });

  api.onTaskLog((event) => {
    pushLog(formatLogEvent(event));
    render();
  });

  api.getCatalogOptions().then(async (options) => {
    state.options = options;
    render();
    await refreshVariants();
  }).catch((error) => {
    appNode.innerHTML = `<pre class="fatal">${escapeHtml(error.message)}</pre>`;
  });
}

render();
