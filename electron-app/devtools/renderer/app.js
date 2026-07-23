const api = window.variantDevtools;
const appNode = document.getElementById("app");
const sidebarNode = document.querySelector(".sidebar");

const newVariantStages = ["prepareStaging", "writeMetadata", "copyVideos", "processVideos", "runPreflight", "generateGallery", "complete"];
const maintenanceStages = ["replaceAction", "addAction", "renameAssets", "generateFramePool", "reselectRuntimeFrames", "writeMetadataEdit", "deleteActionResources", "deleteVariantResources", "complete"];
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
  addAction: "新增动作",
  writeMetadataEdit: "写入维护元数据",
  deleteActionResources: "删除动作资源",
  deleteVariantResources: "删除测试资源",
  generateFramePool: "生成素材池",
  reselectRuntimeFrames: "重选运行帧",
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
  addAction: 72,
  generateFramePool: 72,
  reselectRuntimeFrames: 84,
  writeMetadataEdit: 84,
  deleteActionResources: 90,
  deleteVariantResources: 90,
  complete: 100
};

const defaultActionButtons = ["squat", "walk", "feed", "ball"];
const defaultEnabledFeatures = ["autoStart"];

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
  { view: "operations", label: "运行与打包" },
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
    species: "cat",
    platforms: ["win32"],
    date: localDateString(),
    sourceFolder: "",
    actionVideos: {},
    detachedArtifactOverrides: {},
    autoSelectLoop: false,
    loopModes: {
      yawn: { mode: "full", sourceStart: "", sourceEnd: "", freezeLastFrame: true }
    },
    advanced: {
      enabledActions: defaultActionButtons.slice(),
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
    replacementVideos: {},
    replacementLoopModes: {},
    replacementDetachedArtifactOverrides: {},
    replacePreview: null,
    replacePending: false,
    newActionVideos: {},
    newActionLoopModes: {},
    newActionDetachedArtifactOverrides: {},
    metadataFields: {
      species: "",
      version: "",
      notes: "",
      notePreset: "",
      enabledActions: [],
      featuresEnable: [],
      featuresDisable: []
    },
    metadataPreview: null,
    metadataPending: false,
    deleteActionPreview: null,
    deleteActionPending: false,
    frameAction: "",
    framePool: null,
    framePoolPending: false,
    framePoolPreview: null,
    framePoolBuildPending: false,
    reselectSelection: [],
    reselectPreview: null,
    reselectPending: false,
    reselectFreezeLastFrame: false,
    frameLightboxIndex: null,
    lastFrameSelectionIndex: null,
    pendingFrameSelectionShift: false,
    frameRangeStart: "",
    frameRangeEnd: "",
    frameRangeError: ""
  },
  actionRegistration: {
    newVariant: createActionRegistrationState(),
    maintainVariant: createActionRegistrationState()
  },
  deleteVariant: {
    selectedId: "",
    preview: null,
    pending: false,
    confirmText: ""
  },
  operations: {
    capabilities: null,
    selectedId: "",
    channel: "release",
    runtime: { status: "idle", pid: null, variant: null, channel: null, exitCode: null },
    build: { status: "idle", pid: null, variant: null, channel: null, exitCode: null },
    runtimeLogs: [],
    buildLogs: [],
    canOpenBuildOutput: false,
    error: ""
  }
};

const viewScrollSnapshots = new Map();

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

function notePresetOptions(scope) {
  const notes = state.options?.notes || {};
  const result = Object.entries(notes).map(([scopeKey, note]) => ({
    value: note,
    label: `${scopeKey} · ${note}`,
    recommended: scopeKey === scope
  }));
  return result.sort((left, right) => {
    if (left.recommended !== right.recommended) {
      return left.recommended ? -1 : 1;
    }
    return left.label.localeCompare(right.label);
  });
}

function findNotePreset(value, scope) {
  return notePresetOptions(scope).find((item) => item.value === value)?.value || "custom";
}

function filterVariants(rows, filters) {
  return rows.filter((variant) => {
    if (filters.species && variant.species !== filters.species) {
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
    || state.maintain.metadataPending
    || state.maintain.deleteActionPending
    || state.maintain.framePoolPending
    || state.maintain.framePoolBuildPending
    || state.maintain.reselectPending
    || state.operations.build.status === "running"
    || Object.values(state.actionRegistration).some((item) => item.pending)
    || state.deleteVariant.pending;
}

function getNotesValue() {
  return state.options.notes[state.form.scope] || "";
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
  return Array.isArray(state.options?.requiredActions) ? state.options.requiredActions : defaultActionButtons;
}

function selectedActionButtons() {
  const selected = parseList(state.form.advanced.enabledActions);
  return selected.length > 0 ? selected : baseActionButtons();
}

function selectedActionAssets() {
  return [];
}

function selectedEnabledFeatures() {
  const value = state.form.advanced.features;
  if (value === undefined || value === null) {
    return defaultEnabledFeatures;
  }
  return parseList(value);
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
  return explicit || { mode: defaultLoopMode(), sourceStart: "", sourceEnd: "", freezeLastFrame: action === "yawn" };
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
    if (action === "yawn") {
      result[action].freezeLastFrame = mode.freezeLastFrame !== false;
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
  state.maintain.deleteActionPreview = null;
  state.maintain.framePoolPreview = null;
  state.maintain.reselectPreview = null;
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
  state.maintain.newActionVideos = {};
  state.maintain.newActionLoopModes = {};
  state.maintain.newActionDetachedArtifactOverrides = {};
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
  const name = "enabledActions";
  const locked = new Set(baseActionButtons());
  const selected = new Set(parseList(state.form.advanced.enabledActions));
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
  if (name !== "features") {
    return;
  }
  const selected = new Set(parseList(state.form.advanced[name]));
  if (checked) {
    selected.add(feature);
  } else {
    selected.delete(feature);
  }
  state.form.advanced.disableFeatures = [];
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

function getRenderedView() {
  const root = appNode.querySelector("[data-current-view]");
  if (root?.dataset?.currentView) {
    return root.dataset.currentView;
  }
  return appNode.innerHTML.match(/data-current-view="([^"]+)"/)?.[1] || "";
}

function scrollContainerKey(node) {
  if (node === document.querySelector(".workspace")) {
    return "workspace";
  }
  if (String(node.className || "").split(/\s+/).includes("wizard-left")) {
    return "wizard-left";
  }
  if (String(node.className || "").split(/\s+/).includes("wizard-right")) {
    return "wizard-right";
  }
  return node.dataset?.scrollKey || "";
}

function getScrollContainers() {
  const nodes = [document.querySelector(".workspace"), appNode.querySelector(".wizard-left"), appNode.querySelector(".wizard-right")];
  if (typeof appNode.querySelectorAll === "function") {
    nodes.push(...appNode.querySelectorAll("[data-scroll-key]"));
  }
  return Array.from(new Set(nodes.filter(Boolean)));
}

function readVisibleAnchor(node) {
  if (typeof node.querySelectorAll !== "function" || typeof node.getBoundingClientRect !== "function") {
    return null;
  }
  const containerRect = node.getBoundingClientRect();
  const anchors = Array.from(node.querySelectorAll("[data-scroll-anchor], .panel"));
  let best = null;
  anchors.forEach((anchor, index) => {
    if (typeof anchor.getBoundingClientRect !== "function") {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) {
      return;
    }
    const offset = rect.top - containerRect.top;
    if (!best || Math.abs(offset) < Math.abs(best.offset)) {
      best = {
        key: anchor.dataset?.scrollAnchor || `panel-${index}`,
        index,
        offset
      };
    }
  });
  return best;
}

function isScrollNearBottom(node, threshold = 24) {
  const distanceFromBottom = Number(node.scrollHeight) - Number(node.clientHeight) - Number(node.scrollTop);
  return Number.isFinite(distanceFromBottom) && distanceFromBottom <= threshold;
}

function readScrollSnapshot() {
  return getScrollContainers().map((node) => {
    const key = scrollContainerKey(node);
    const isOperationLog = key.startsWith("operation-log-");
    return {
      key,
      scrollTop: node.scrollTop,
      scrollLeft: node.scrollLeft,
      stickToBottom: isOperationLog && isScrollNearBottom(node),
      anchor: readVisibleAnchor(node)
    };
  }).filter((item) => item.key);
}

function restoreScrollSnapshot(snapshot) {
  for (const item of snapshot || []) {
    const node = item.key === "workspace"
      ? document.querySelector(".workspace")
      : appNode.querySelector(`.${item.key}`) || appNode.querySelector(`[data-scroll-key="${item.key}"]`);
    if (node) {
      node.scrollTop = item.stickToBottom ? node.scrollHeight : item.scrollTop;
      node.scrollLeft = item.scrollLeft;
      if (item.anchor && typeof node.querySelectorAll === "function" && typeof node.getBoundingClientRect === "function") {
        const anchors = Array.from(node.querySelectorAll("[data-scroll-anchor], .panel"));
        const anchor = anchors.find((candidate) => candidate.dataset?.scrollAnchor === item.anchor.key)
          || anchors[item.anchor.index];
        if (anchor && typeof anchor.getBoundingClientRect === "function") {
          const currentOffset = anchor.getBoundingClientRect().top - node.getBoundingClientRect().top;
          node.scrollTop += currentOffset - item.anchor.offset;
        }
      }
    }
  }
}

function renderPreservingScroll() {
  render({ preserveScroll: true });
}

function readFocusSnapshot() {
  const active = document.activeElement;
  if (!active || typeof appNode.contains !== "function" || !appNode.contains(active)) return null;
  const focusKey = active.dataset?.focusKey;
  if (focusKey) {
    return {
      selector: `[data-focus-key="${String(focusKey).replace(/"/g, "\\\"")}"]`,
      selectionStart: active.selectionStart,
      selectionEnd: active.selectionEnd
    };
  }
  const datasetEntry = Object.entries(active.dataset || {})[0];
  if (!datasetEntry) return null;
  const attribute = datasetEntry[0].replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
  return {
    selector: `[data-${attribute}="${String(datasetEntry[1]).replace(/"/g, "\\\"")}"]`,
    selectionStart: active.selectionStart,
    selectionEnd: active.selectionEnd
  };
}

function createActionRegistrationState() {
  return {
    actionKey: "",
    label: "",
    playbackMode: "once",
    durationMinutes: "5",
    preview: null,
    pending: false,
    error: ""
  };
}

function restoreFocusSnapshot(snapshot) {
  if (!snapshot) return;
  const node = appNode.querySelector(snapshot.selector);
  if (!node || typeof node.focus !== "function") return;
  node.focus({ preventScroll: true });
  if (typeof node.setSelectionRange === "function" && Number.isInteger(snapshot.selectionStart) && Number.isInteger(snapshot.selectionEnd)) {
    node.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
  }
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
  const entries = Object.entries(state.options.actions);
  const optionalActions = entries
    .filter(([action]) => !baseButtons.has(action))
    .map(([action]) => renderActionOption(action, "action", buttons.has(action)));

  return `<details class="option-section collapsible-section new-pet-picker" data-picker="actions"${state.actionPickerOpen ? " open" : ""}>
    <summary>动作选择</summary>
    <p class="muted">所有已注册动作都可复用；系统必需动作不可取消。</p>
    <div class="option-group">
      <strong>系统必需动作</strong>
      <div class="option-grid new-pet-option-grid">${Array.from(baseButtons).map((action) => renderActionOption(action, "button", true, true)).join("")}</div>
    </div>
    <div class="option-group">
      <strong>可选动作</strong>
      <div class="option-grid new-pet-option-grid">${optionalActions.join("") || `<span class="muted">暂无可选动作</span>`}</div>
    </div>
  </details>`;
}

function renderFeaturePicker() {
  const enabled = new Set(selectedEnabledFeatures());
  const features = Object.keys(state.options.features);
  return `<details class="option-section collapsible-section new-pet-picker" data-picker="features"${state.featurePickerOpen ? " open" : ""}>
    <summary>功能选择</summary>
    <div class="option-group">
      <strong>启用功能</strong>
      <div class="option-grid new-pet-option-grid">${features.map((feature) => renderFeatureOption(feature, "features", enabled.has(feature))).join("")}</div>
    </div>
  </details>`;
}

function renderDerivedSummary() {
  const enable = selectedEnabledFeatures();

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
      <div><span>启用功能 features</span><strong>${escapeHtml(enable.join(", ") || "-")}</strong></div>
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
    ${action === "yawn" ? `<label class="option-check freeze-option">
      <input type="checkbox" data-freeze-last-frame="${escapeHtml(action)}"${value.freezeLastFrame !== false ? " checked" : ""}${disabled}>
      <span>末帧休眠（5 分钟）</span>
    </label>` : ""}
    <label class="option-check">
      <input type="checkbox" data-clean-detached-artifacts="${escapeHtml(action)}"${cleanDetachedArtifactsForNewVariant(action) ? " checked" : ""}${disabled}>
      <span>允许清理离散组件</span>
    </label>
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
          <label>物种 species ${renderSelect("species", Object.keys(options.species))}</label>
          <label class="date-field">日期 date <input type="date" data-field="date" value="${escapeHtml(state.form.date)}"${busy() ? " disabled" : ""}></label>
          <div class="platforms inline-platforms">${renderPlatformToggles()}</div>
        </div>
        ${renderActionPicker()}
        ${renderFeaturePicker()}
        ${renderDerivedSummary()}
        ${renderAdvancedControls()}
      </section>

      ${renderActionRegistrationPanel("newVariant")}

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
            <span>${escapeHtml([variant.scope, variant.species, variant.date].filter(Boolean).join(" · "))}</span>
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
  return Array.from(new Set(details.profile.enabledActions
    || (details.profile.actionButtons || details.profile.actions || []).concat(details.profile.actionAssets || details.profile.extraAnimationAssets || [])));
}

function syncMaintainFields(details) {
  if (!details || !details.profile) {
    return;
  }
  const profile = details.profile;
  const enabledFeatures = profile.enabledFeatures || Object.entries(profile.features || {}).filter(([, enabled]) => enabled).map(([name]) => name);
  state.maintain.metadataFields = {
    species: profile.species || "",
    version: profile.version || "1.0",
    notes: profile.notes || "",
    notePreset: findNotePreset(profile.notes || "", profile.scope),
    enabledActions: (profile.enabledActions
      || (profile.actionButtons || profile.actions || []).concat(profile.actionAssets || profile.extraAnimationAssets || [])).slice(),
    featuresEnable: enabledFeatures.slice(),
    featuresDisable: []
  };
}

function derivedRegistrationStateId(actionKey) {
  return /^[a-z]+(?:[A-Z][a-z]+)*$/.test(actionKey || "")
    ? `pet${actionKey[0].toUpperCase()}${actionKey.slice(1)}`
    : "等待有效 actionKey";
}

function syncActionRegistrationDraftUi(input, registration, field) {
  const panel = input.closest?.(".action-registration-panel");
  if (!panel) return;
  if (field === "actionKey") {
    const stateIdNode = panel.querySelector("[data-action-registration-state-id]");
    if (stateIdNode) {
      stateIdNode.textContent = derivedRegistrationStateId(registration.actionKey);
    }
  }
  panel.querySelector("[data-action-registration-feedback]")?.replaceChildren();
}

function renderActionRegistrationPanel(context) {
  const registration = state.actionRegistration[context];
  const disabled = busy() ? " disabled" : "";
  const timed = registration.playbackMode === "timed";
  const contextLabel = context === "newVariant" ? "新增宠物" : "维护宠物";
  return `<section class="panel action-registration-panel" data-scroll-anchor="${escapeHtml(context)}-action-registration">
    <div class="panel-header">
      <div>
        <h2>注册新动作</h2>
        <p class="muted">注册到全局动作池，并加入当前${contextLabel}。</p>
      </div>
      <button type="button" data-build-action-registration="${escapeHtml(context)}"${disabled}>${registration.pending ? "处理中" : "生成注册预览"}</button>
    </div>
    <div class="form-grid action-registration-fields">
      <label>动作标识 actionKey
        <input type="text" data-focus-key="${escapeHtml(context)}:actionKey" data-action-registration-context="${escapeHtml(context)}" data-action-registration-field="actionKey" value="${escapeHtml(registration.actionKey)}" placeholder="例如 tailWag"${disabled}>
      </label>
      <label>显示名称 label
        <input type="text" data-focus-key="${escapeHtml(context)}:label" data-action-registration-context="${escapeHtml(context)}" data-action-registration-field="label" value="${escapeHtml(registration.label)}" placeholder="例如 摇尾巴"${disabled}>
      </label>
    </div>
    <div class="playback-mode-group">
      <strong>播放方式</strong>
      <div class="segmented-control" role="radiogroup" aria-label="播放方式">
        ${[
          ["once", "播放一次"],
          ["timed", "指定分钟"],
          ["continuous", "持续循环"]
        ].map(([mode, label]) => `<label><input type="radio" name="${escapeHtml(context)}-playback-mode" data-action-registration-mode="${escapeHtml(mode)}" data-action-registration-context="${escapeHtml(context)}"${registration.playbackMode === mode ? " checked" : ""}${disabled}><span>${label}</span></label>`).join("")}
      </div>
      ${timed ? `<label class="duration-field">持续分钟
        <input type="number" min="0.1" max="1440" step="0.1" data-focus-key="${escapeHtml(context)}:durationMinutes" data-action-registration-context="${escapeHtml(context)}" data-action-registration-field="durationMinutes" value="${escapeHtml(registration.durationMinutes)}"${disabled}>
      </label>` : ""}
    </div>
    <div class="summary-grid summary-grid-compact action-registration-summary">
      <div><span>运行时 stateId</span><strong data-action-registration-state-id>${escapeHtml(derivedRegistrationStateId(registration.actionKey))}</strong></div>
      <div><span>显示位置</span><strong>悬浮面板</strong></div>
      <div><span>结束状态</span><strong>squat</strong></div>
      <div><span>运动方式</span><strong>原地</strong></div>
    </div>
    <div data-action-registration-feedback>
      ${registration.error ? `<p class="danger">${escapeHtml(registration.error)}</p>` : ""}
      ${registration.preview ? `<div class="metadata-diff action-registration-preview">
      <h3>全局注册预览</h3>
      <pre>${renderJson({ actionKey: registration.preview.actionKey, definition: registration.preview.definition })}</pre>
      <button type="button" class="primary" data-apply-action-registration="${escapeHtml(context)}" data-action-registration-preview-id="${escapeHtml(registration.preview.previewId)}"${disabled}>确认注册并加入当前宠物</button>
      </div>` : ""}
    </div>
  </section>`;
}

function maintainResourceActions(details) {
  const registered = actionsFromDetails(details);
  const resources = (details?.resources?.resourceActions || []).map((item) => item.action);
  return Array.from(new Set(registered.concat(resources)));
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
  const required = name === "enabledActions" ? new Set(baseActionButtons()) : new Set();
  return `<div class="option-group maintain-choice-group">
    <strong>${escapeHtml(label)}</strong>
    <div class="option-grid">
      ${values.map((value) => `<label class="option-check">
        <input type="checkbox" data-maintain-list="${escapeHtml(name)}" data-maintain-list-value="${escapeHtml(value)}"${selected.has(value) ? " checked" : ""}${disabled || required.has(value) ? " disabled" : ""}>
        <span>${name.startsWith("features") ? escapeHtml(featureLabel(value)) : escapeHtml(actionLabel(value))}</span>
        ${required.has(value) ? `<span class="option-note">必选</span>` : ""}
      </label>`).join("")}
    </div>
  </div>`;
}

function renderMaintainNotesField(fields, disabled) {
  const presets = notePresetOptions(state.maintain.details?.profile?.scope);
  const presetValue = fields.notePreset || findNotePreset(fields.notes, state.maintain.details?.profile?.scope);
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
  const features = Object.keys(state.options.features);
  return `<div class="form-grid maintain-metadata-basics">
    ${renderMaintainSelectField("species", "species", Object.keys(state.options.species), fields.species, disabled)}
    <label>version
      <input type="text" data-maintain-field="version" value="${escapeHtml(fields.version || "1.0")}"${disabled}>
    </label>
  </div>
  ${renderMaintainNotesField(fields, disabled)}
  <div class="option-section">
    ${renderMaintainCheckboxList("enabledActions", "actions.enabled", actions, fields.enabledActions, disabled)}
    ${renderMaintainCheckboxList("featuresEnable", "启用功能 features", features, fields.featuresEnable, disabled)}
  </div>`;
}

function maintainLoopModeFor(collectionName, action) {
  const collection = state.maintain[collectionName];
  if (!collection[action]) {
    const resource = state.maintain.details?.resources?.resourceActions?.find((item) => item.action === action);
    collection[action] = {
      mode: "full",
      sourceStart: "",
      sourceEnd: "",
      freezeLastFrame: action === "yawn"
        ? (collectionName === "replacementLoopModes" ? resource?.freezeLastFrame === true : true)
        : undefined
    };
  }
  return collection[action];
}

function actionDetachedArtifactDefault(action) {
  return state.options?.actions?.[action]?.processing?.detachedArtifacts?.enabledByDefault === true;
}

function cleanDetachedArtifactsForNewVariant(action) {
  if (Object.prototype.hasOwnProperty.call(state.form.detachedArtifactOverrides, action)) {
    return state.form.detachedArtifactOverrides[action];
  }
  return actionDetachedArtifactDefault(action);
}

function maintainCleanDetachedArtifacts(collectionName, action) {
  const collection = state.maintain[collectionName];
  if (Object.prototype.hasOwnProperty.call(collection, action)) return collection[action];
  if (collectionName === "replacementDetachedArtifactOverrides") {
    const resource = state.maintain.details?.resources?.resourceActions?.find((item) => item.action === action);
    if (typeof resource?.detachedArtifacts?.enabled === "boolean") return resource.detachedArtifacts.enabled;
  }
  return actionDetachedArtifactDefault(action);
}

function renderMaintainCardLoopControls(action, collectionName, dataPrefix) {
  const value = maintainLoopModeFor(collectionName, action);
  const resource = state.maintain.details?.resources?.resourceActions?.find((item) => item.action === action);
  const controlsDisabled = busy() || (collectionName === "replacementLoopModes" && resource?.protectedPlayback);
  const disabled = controlsDisabled ? " disabled" : "";
  const freezeDisabled = busy() || resource?.protectedPlayback;
  const detachedCollection = collectionName === "replacementLoopModes"
    ? "replacementDetachedArtifactOverrides"
    : "newActionDetachedArtifactOverrides";
  return `<div class="loop-controls">
    <label>运行帧
      <select data-${dataPrefix}-loop-mode="${escapeHtml(action)}"${disabled}>
        <option value="full"${value.mode === "full" ? " selected" : ""}>完整帧</option>
        <option value="auto"${value.mode === "auto" ? " selected" : ""}>自动选取</option>
        <option value="manual"${value.mode === "manual" ? " selected" : ""}>手动范围</option>
      </select>
    </label>
    <div class="loop-range ${value.mode === "manual" ? "" : "is-hidden"}">
      <input type="number" min="0" step="1" placeholder="start" data-${dataPrefix}-loop-start="${escapeHtml(action)}" value="${escapeHtml(value.sourceStart ?? "")}"${disabled}>
      <input type="number" min="0" step="1" placeholder="end" data-${dataPrefix}-loop-end="${escapeHtml(action)}" value="${escapeHtml(value.sourceEnd ?? "")}"${disabled}>
    </div>
    ${action === "yawn" ? `<label class="option-check freeze-option${resource?.protectedPlayback ? " is-readonly" : ""}">
      <input type="checkbox" data-${dataPrefix}-freeze-last-frame="${escapeHtml(action)}"${value.freezeLastFrame === true ? " checked" : ""}${freezeDisabled ? " disabled" : ""}>
      <span>末帧休眠（5 分钟）</span>
    </label>` : ""}
    <label class="option-check${resource?.protectedPlayback ? " is-readonly" : ""}">
      <input type="checkbox" data-${dataPrefix}-clean-detached-artifacts="${escapeHtml(action)}"${maintainCleanDetachedArtifacts(detachedCollection, action) ? " checked" : ""}${freezeDisabled ? " disabled" : ""}>
      <span>允许清理离散组件</span>
    </label>
  </div>`;
}

function renderMaintainActionCard(action, { kind, video, loopModes, dataPrefix }) {
  const selected = Boolean(video);
  const registered = actionsFromDetails(state.maintain.details).includes(action);
  const orphaned = kind === "replace" && !registered;
  const status = orphaned ? "pending" : (selected ? "manual" : (kind === "replace" ? "existing" : "missing"));
  const statusLabel = orphaned ? "孤立资源" : (selected ? "已选择" : (kind === "replace" ? "当前资源" : "缺少视频"));
  const sourceLabel = orphaned ? "元数据未登记" : (selected ? "待处理视频" : (kind === "replace" ? "已有动作资源" : "新增动作"));
  const sourceText = video || (kind === "replace"
    ? `${state.maintain.details.profile.assetPrefix}_${state.options.actions[action].asset}`
    : "未选择视频");
  const resource = state.maintain.details?.resources?.resourceActions?.find((item) => item.action === action);
  const protectedPlayback = kind === "replace" && resource?.protectedPlayback;
  return `<article class="action-card ${status}">
    <div class="action-copy">
      <div class="action-title-row">
        <h3>${escapeHtml(actionLabel(action))}</h3>
        <span class="action-status"><span class="status-dot"></span>${escapeHtml(statusLabel)}</span>
      </div>
      <span class="badge">${escapeHtml(sourceLabel)}</span>
      <p>${escapeHtml(sourceText)}</p>
      ${protectedPlayback ? `<p class="warning">专属播放动作，只读保护已开启。</p>` : ""}
      ${renderMaintainCardLoopControls(action, loopModes, dataPrefix)}
    </div>
    <div class="action-controls">
      <button type="button" data-${dataPrefix}-video="${escapeHtml(action)}"${busy() || protectedPlayback ? " disabled" : ""}>${selected ? "更换视频" : (kind === "replace" ? "替换视频" : "选择视频")}</button>
      ${kind === "replace" ? `<button type="button" class="danger-button" data-build-delete-action="${escapeHtml(action)}"${busy() || protectedPlayback ? " disabled" : ""}>删除资源</button>` : ""}
    </div>
  </article>`;
}

function newlyEnabledActions() {
  const current = new Set(actionsFromDetails(state.maintain.details));
  return Array.from(new Set(parseList(state.maintain.metadataFields.enabledActions)))
    .filter((action) => !current.has(action));
}

function renderReplacementCards() {
  return maintainResourceActions(state.maintain.details).map((action) => renderMaintainActionCard(action, {
    kind: "replace",
    video: state.maintain.replacementVideos[action] || "",
    loopModes: "replacementLoopModes",
    dataPrefix: "replace"
  })).join("");
}

function renderNewActionCards() {
  const actions = newlyEnabledActions();
  if (actions.length === 0) {
    return "";
  }
  return `<div class="new-action-source">
    <div class="section-heading">
      <h3>新增动作源视频</h3>
      <span class="muted">${actions.length} 个待新增动作</span>
    </div>
    <div class="action-grid">${actions.map((action) => renderMaintainActionCard(action, {
      kind: "new",
      video: state.maintain.newActionVideos[action] || "",
      loopModes: "newActionLoopModes",
      dataPrefix: "new-action"
    })).join("")}</div>
  </div>`;
}

function selectedFrameResource() {
  return state.maintain.details?.resources?.resourceActions?.find((item) => item.action === state.maintain.frameAction) || null;
}

function renderFrameActionOptions() {
  const actions = maintainResourceActions(state.maintain.details);
  return actions.map((action) => `<option value="${escapeHtml(action)}"${state.maintain.frameAction === action ? " selected" : ""}>${escapeHtml(actionLabel(action))}</option>`).join("");
}

function renderFramePoolManagement() {
  const resource = selectedFrameResource();
  const pool = state.maintain.framePool;
  const disabled = busy() ? " disabled" : "";
  const canGenerate = Boolean(resource?.hasCanonicalVideo && !resource?.protectedPlayback);
  return `<section class="panel" data-scroll-anchor="frame-pool-management">
    <div class="panel-header">
      <div>
        <h2>素材池管理</h2>
        <p class="muted">从动作目录的标准 MP4 仅生成 processed_frames，不改运行帧和动作元数据。</p>
      </div>
      <div class="button-row">
        <button type="button" data-build-frame-pool${disabled || !canGenerate ? " disabled" : ""}>生成预览</button>
        <button type="button" class="primary" data-run-frame-pool="${escapeHtml(state.maintain.framePoolPreview?.previewId || "")}"${disabled || !state.maintain.framePoolPreview ? " disabled" : ""}>确认生成</button>
      </div>
    </div>
    <label>选择动作
      <select data-frame-action${disabled}>${renderFrameActionOptions()}</select>
    </label>
    <div class="summary-grid summary-grid-compact frame-pool-summary">
      <div><span>标准源视频</span><strong>${resource?.hasCanonicalVideo ? "存在" : "缺失"}</strong></div>
      <div><span>素材池</span><strong>${pool?.hasProcessedFrames ? `${pool.processedFrames.length} 帧` : "尚未生成"}</strong></div>
      <div><span>运行帧</span><strong>${pool ? `${pool.runtimeFrames.length} 帧（保持不变）` : "-"}</strong></div>
    </div>
    ${resource?.protectedPlayback ? `<p class="warning">该动作使用专属播放元数据，素材池与运行帧维护均为只读。</p>` : ""}
    ${state.maintain.framePoolPreview ? `<pre>${renderJson(state.maintain.framePoolPreview.command)}</pre>` : ""}
  </section>`;
}

function renderFrameLightbox() {
  const index = state.maintain.frameLightboxIndex;
  const frames = frameLightboxFrames();
  if (!Number.isInteger(index) || !frames[index]) return "";
  const frame = frames[index];
  return `<div class="frame-lightbox" role="dialog" aria-modal="true" aria-label="素材帧放大浏览">
    <button type="button" class="frame-lightbox-close" data-close-frame-lightbox aria-label="关闭">×</button>
    <button type="button" class="frame-lightbox-arrow previous" data-frame-lightbox-step="-1"${index === 0 ? " disabled" : ""} aria-label="上一张">‹</button>
    <figure>
      <img src="${escapeHtml(frame.url)}" alt="${escapeHtml(frame.name)}">
      <figcaption>${escapeHtml(frame.name)}</figcaption>
    </figure>
    <button type="button" class="frame-lightbox-arrow next" data-frame-lightbox-step="1"${index === frames.length - 1 ? " disabled" : ""} aria-label="下一张">›</button>
  </div>`;
}

function frameSelectionSummary(selection) {
  const indexes = Array.from(new Set(selection)).sort((left, right) => left - right);
  let gapCount = 0;
  for (let index = 1; index < indexes.length; index += 1) {
    if (indexes[index] - indexes[index - 1] > 1) gapCount += 1;
  }
  return {
    count: indexes.length,
    first: indexes[0] ?? null,
    last: indexes[indexes.length - 1] ?? null,
    gapCount
  };
}

function syncFrameRangeFromSelection(selection = state.maintain.reselectSelection) {
  const summary = frameSelectionSummary(selection);
  state.maintain.frameRangeStart = summary.first === null ? "" : String(summary.first);
  state.maintain.frameRangeEnd = summary.last === null ? "" : String(summary.last);
  state.maintain.frameRangeError = "";
}

function applyFrameRangeSelection() {
  const startText = String(state.maintain.frameRangeStart).trim();
  const endText = String(state.maintain.frameRangeEnd).trim();
  const start = Number(startText);
  const end = Number(endText);
  if (!/^\d+$/.test(startText) || !/^\d+$/.test(endText) || !Number.isInteger(start) || !Number.isInteger(end)) {
    state.maintain.frameRangeError = "Start 和 End 必须是非负整数。";
    renderPreservingScroll();
    return;
  }
  if (start > end) {
    state.maintain.frameRangeError = "Start 不能大于 End。";
    renderPreservingScroll();
    return;
  }
  const available = (state.maintain.framePool?.processedFrames || []).map((frame) => frame.index);
  const minimum = available[0];
  const maximum = available[available.length - 1];
  if (minimum === undefined || start < minimum || end > maximum) {
    state.maintain.frameRangeError = `范围必须位于 ${minimum ?? "-"} 到 ${maximum ?? "-"} 之间。`;
    renderPreservingScroll();
    return;
  }
  state.maintain.reselectSelection = available.filter((index) => index >= start && index <= end);
  state.maintain.frameRangeError = "";
  state.maintain.reselectPreview = null;
  renderPreservingScroll();
}

function frameLightboxFrames() {
  const pool = state.maintain.framePool;
  return pool?.hasProcessedFrames ? pool.processedFrames : pool?.runtimeFrames || [];
}

function renderRuntimeFrameReselect() {
  const pool = state.maintain.framePool;
  const selected = new Set(state.maintain.reselectSelection);
  const current = new Set(pool?.selectedSourceFrames || []);
  const selectionSummary = frameSelectionSummary(selected);
  const disabled = busy() || !pool?.hasProcessedFrames || pool?.protected;
  const availableIndexes = pool?.processedFrames?.map((frame) => frame.index) || [];
  const minimumIndex = availableIndexes[0];
  const maximumIndex = availableIndexes[availableIndexes.length - 1];
  return `<section class="panel" data-scroll-anchor="runtime-frame-reselect">
    <div class="panel-header">
      <div>
        <h2>重新选择运行帧</h2>
        <p class="muted">任意多选，写入时自动去重并按素材索引升序播放。</p>
      </div>
      <div class="button-row">
        <button type="button" data-select-all-frames${disabled ? " disabled" : ""}>全选</button>
        <button type="button" data-clear-frame-selection${disabled ? " disabled" : ""}>清空</button>
        <button type="button" data-build-reselect-preview${disabled || selected.size === 0 ? " disabled" : ""}>生成预览</button>
        <button type="button" class="primary" data-run-reselect="${escapeHtml(state.maintain.reselectPreview?.previewId || "")}"${disabled || !state.maintain.reselectPreview ? " disabled" : ""}>确认写入</button>
      </div>
    </div>
    ${pool?.protected ? `<p class="warning">${escapeHtml(pool.protectedReason)}</p>` : ""}
    ${!pool?.hasProcessedFrames ? `<p class="muted">完整素材池不可用。请先在“素材池管理”中生成 processed_frames；当前运行帧仅供只读确认。</p>` : ""}
    ${pool ? `<div class="summary-grid frame-selection-summary">
      <div><span>当前运行帧</span><strong>${pool.runtimeFrames.length}</strong></div>
      <div><span>已选素材帧</span><strong>${selectionSummary.count}</strong></div>
      <div><span>首帧索引</span><strong>${selectionSummary.first ?? "-"}</strong></div>
      <div><span>尾帧索引</span><strong>${selectionSummary.last ?? "-"}</strong></div>
      <div><span>索引断点</span><strong>${selectionSummary.gapCount}</strong></div>
      <div><span>末帧休眠</span><strong>${pool.freezeLastFrame ? "开启" : "关闭"}</strong></div>
    </div>` : ""}
    ${pool?.hasProcessedFrames ? `<div class="frame-range-controls">
      <label>Start
        <input type="number" min="${minimumIndex}" max="${maximumIndex}" step="1" inputmode="numeric" data-frame-range="start" data-focus-key="frame-range-start" value="${escapeHtml(state.maintain.frameRangeStart)}"${disabled ? " disabled" : ""}>
      </label>
      <label>End
        <input type="number" min="${minimumIndex}" max="${maximumIndex}" step="1" inputmode="numeric" data-frame-range="end" data-focus-key="frame-range-end" value="${escapeHtml(state.maintain.frameRangeEnd)}"${disabled ? " disabled" : ""}>
      </label>
      <button type="button" data-apply-frame-range${disabled ? " disabled" : ""}>应用范围</button>
      <button type="button" data-restore-runtime-frames${disabled ? " disabled" : ""}>恢复当前运行帧</button>
      <div class="frame-range-meta">
        <span class="frame-range-bounds">可用索引 ${minimumIndex}–${maximumIndex}</span>
        <div class="frame-selection-legend"><span class="current-marker">当前运行帧</span><span class="selected-marker">本次选择</span></div>
      </div>
    </div>${state.maintain.frameRangeError ? `<p class="danger frame-range-error">${escapeHtml(state.maintain.frameRangeError)}</p>` : ""}` : ""}
    ${pool?.hasProcessedFrames ? `<div class="frame-pool-grid" data-scroll-key="frame-pool-grid">${pool.processedFrames.map((frame, index) => `<article class="frame-pool-card${current.has(frame.index) ? " is-current" : ""}${selected.has(frame.index) ? " is-selected" : ""}">
      <button type="button" class="frame-preview-button" data-open-frame-lightbox="${index}" aria-label="放大 ${escapeHtml(frame.name)}"><img src="${escapeHtml(frame.url)}" alt="${escapeHtml(frame.name)}" loading="lazy"></button>
      <label><input type="checkbox" data-source-frame="${frame.index}"${selected.has(frame.index) ? " checked" : ""}${disabled ? " disabled" : ""}><span>${escapeHtml(frame.name)}</span></label>
    </article>`).join("")}</div>` : `<div class="frame-pool-grid runtime-readonly-grid" data-scroll-key="frame-pool-grid">${(pool?.runtimeFrames || []).map((frame, index) => `<article class="frame-pool-card is-current"><button type="button" class="frame-preview-button" data-open-frame-lightbox="${index}" aria-label="放大 ${escapeHtml(frame.name)}"><img src="${escapeHtml(frame.url)}" alt="${escapeHtml(frame.name)}" loading="lazy"></button><span>${escapeHtml(frame.name)}</span></article>`).join("")}</div>`}
    ${state.maintain.frameAction === "yawn" && !pool?.protected ? `<label class="option-check freeze-option reselect-freeze">
      <input type="checkbox" data-reselect-freeze-last-frame${state.maintain.reselectFreezeLastFrame ? " checked" : ""}${disabled ? " disabled" : ""}>
      <span>末帧休眠（5 分钟）</span>
    </label>` : ""}
    ${state.maintain.reselectPreview ? `<div class="preview-grid"><section><h3>写入前</h3><pre>${renderJson(state.maintain.reselectPreview.before)}</pre></section><section><h3>写入后</h3><pre>${renderJson(state.maintain.reselectPreview.after)}</pre></section></div>` : ""}
    ${renderFrameLightbox()}
  </section>`;
}

function renderMaintainVariant() {
  const details = state.maintain.details;
  const fields = state.maintain.metadataFields;
  const disabled = busy() ? " disabled" : "";
  return `<div class="wizard">
    <div class="wizard-left">
      <section class="panel">
        <div class="panel-header">
          <div>
            <h1>维护宠物</h1>
            <p class="muted">替换现有动作资源，或新增动作资源后写入结构化元数据</p>
          </div>
          <button type="button" data-refresh-variants${disabled}>刷新</button>
        </div>
        <div class="form-grid maintain-pet-select">
          <label>选择宠物
            <select data-maintain-select${disabled}>${renderVariantOptions(state.maintain.selectedId)}</select>
          </label>
        </div>
        ${details ? `<div class="summary-grid maintain-summary">
          <div><span>scope</span><strong>${escapeHtml(details.profile.scope)}</strong></div>
          <div><span>assetPrefix</span><strong>${escapeHtml(details.profile.assetPrefix)}</strong></div>
          <div><span>manifest</span><strong>${escapeHtml(details.resources.manifest)}</strong></div>
        </div>` : `<p class="muted">请选择一个宠物。</p>`}
      </section>

      ${renderActionRegistrationPanel("maintainVariant")}

      <section class="panel">
        <div class="panel-header">
          <h2>替换动作资源</h2>
          <div class="button-row source-actions maintenance-actions">
            <button type="button" data-build-replace-preview${disabled}>生成替换预览</button>
            <button type="button" class="primary" data-run-replace-actions="${escapeHtml(state.maintain.replacePreview?.previewId || "")}"${disabled || !state.maintain.replacePreview ? " disabled" : ""}>确认执行</button>
          </div>
        </div>
        <div class="action-grid">${details ? renderReplacementCards() : ""}</div>
        ${state.maintain.replacePreview ? `<div class="preview-grid">
          <section><h3>替换命令</h3><pre>${renderJson(state.maintain.replacePreview.commands)}</pre></section>
          <section><h3>目标资源</h3><pre>${renderJson(state.maintain.replacePreview.targets)}</pre></section>
        </div>` : ""}
        ${renderDeleteActionPreview()}
      </section>

      ${details ? renderFramePoolManagement() : ""}
      ${details ? renderRuntimeFrameReselect() : ""}

      <section class="panel">
        <div class="panel-header">
          <h2>修改信息 / 元数据</h2>
          <div class="button-row">
            <button type="button" data-reset-maintain-edits${disabled}>取消修改并清空记录</button>
            <button type="button" data-build-metadata-preview${disabled}>生成 diff 预览</button>
          </div>
        </div>
        ${renderMaintainMetadataControls(fields, disabled)}
        ${renderNewActionCards()}
        ${renderMetadataDiff()}
      </section>
    </div>
    <div class="wizard-right">
      ${renderVariantDetails(details)}
      ${renderExecution()}
    </div>
  </div>`;
}

function renderDeleteActionPreview() {
  const preview = state.maintain.deleteActionPreview;
  if (!preview) return "";
  return `<div class="metadata-diff delete-action-preview">
    <h3>删除动作资源预览：${escapeHtml(preview.action)}</h3>
    ${preview.orphaned ? `<p class="muted">这是磁盘或 manifest 中存在、但元数据未登记的孤立动作资源。</p>` : ""}
    ${preview.reason ? `<p class="danger">${escapeHtml(preview.reason)}</p>` : ""}
    <div class="preview-grid">
      <section><h3>删除路径</h3><pre>${renderJson(preview.paths || [])}</pre></section>
      <section><h3>同步清理</h3><pre>${renderJson({ manifestEntries: preview.manifestRemovedEntries, metadataDiff: preview.metadataDiff || [] })}</pre></section>
    </div>
    <button type="button" class="danger-button" data-confirm-delete-action="${escapeHtml(preview.previewId)}"${busy() || !preview.canDelete ? " disabled" : ""}>确认删除动作资源</button>
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
    ${preview.actionCommands?.length ? `<h3>新增动作处理命令</h3><pre>${renderJson(preview.actionCommands)}</pre>` : ""}
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

function operationStatusLabel(status) {
  return ({
    idle: "空闲",
    starting: "启动中",
    running: "运行中",
    stopping: "停止中",
    exited: "已退出",
    succeeded: "已完成",
    failed: "失败"
  })[status] || status || "未知";
}

function selectedOperationVariant() {
  return state.variants.find((variant) => variant.id === state.operations.selectedId) || null;
}

function operationChannelLabel(channel) {
  return channel === "installer" ? "installer（安装渠道）" : "release（便携渠道）";
}

function renderOperationLog(kind, logs) {
  return `<pre class="log operation-log" data-scroll-key="operation-log-${escapeHtml(kind)}">${logs.length ? logs.map(escapeHtml).join("\n") : "尚无日志"}</pre>`;
}

function renderOperations() {
  const operation = state.operations;
  const variant = selectedOperationVariant();
  const runtimeActive = ["starting", "running", "stopping"].includes(operation.runtime.status);
  const buildRunning = operation.build.status === "running";
  const targetDisabled = runtimeActive || buildRunning || state.variantsPending;
  const windowsSupported = Boolean(variant?.platforms?.includes("win32"));
  const buildAvailable = operation.capabilities?.build?.available !== false;
  const channelOptions = (operation.capabilities?.channels || ["release", "installer"])
    .map((channel) => `<option value="${escapeHtml(channel)}"${operation.channel === channel ? " selected" : ""}>${escapeHtml(operationChannelLabel(channel))}</option>`)
    .join("");
  const buildScript = operation.channel === "installer" ? "build-installer-win.ps1" : "build-electron-win.ps1";
  return `<div class="operations-page">
    <section class="panel operation-target-panel">
      <div class="panel-header">
        <div>
          <h1>运行与打包</h1>
          <p class="muted">选择同一组宠物变体和渠道，用于本地运行或生成 Windows 产物。</p>
        </div>
        <button type="button" data-refresh-operation-variants${targetDisabled ? " disabled" : ""}>刷新宠物列表</button>
      </div>
      <div class="form-grid operation-target-grid">
        <label>宠物变体
          <select data-operation-variant${targetDisabled ? " disabled" : ""}>${renderVariantOptions(operation.selectedId)}</select>
        </label>
        <label>渠道
          <select data-operation-channel${targetDisabled ? " disabled" : ""}>${channelOptions}</select>
        </label>
      </div>
      <div class="summary-grid operation-summary">
        <div><span>宠物 ID</span><strong>${escapeHtml(variant?.id || "-")}</strong></div>
        <div><span>范围</span><strong>${escapeHtml(variant?.scope || "-")}</strong></div>
        <div><span>Windows 打包</span><strong>${windowsSupported ? "支持" : "不支持"}</strong></div>
        <div><span>当前渠道</span><strong>${escapeHtml(operation.channel)}</strong></div>
      </div>
      ${operation.error ? `<p class="danger operation-error">${escapeHtml(operation.error)}</p>` : ""}
    </section>

    <div class="operations-grid">
      <section class="panel operation-panel">
        <div class="panel-header">
          <div><h2>本地启动</h2><p class="muted">使用当前目标启动开发态桌面宠物。</p></div>
          <span class="operation-status ${escapeHtml(operation.runtime.status)}">${escapeHtml(operationStatusLabel(operation.runtime.status))}</span>
        </div>
        <div class="operation-command"><code>npm.cmd start</code></div>
        <div class="button-row operation-actions">
          <button type="button" class="primary" data-start-local-pet${runtimeActive || !variant ? " disabled" : ""}>启动宠物</button>
          <button type="button" data-stop-local-pet${runtimeActive ? "" : " disabled"}>停止运行</button>
        </div>
        ${renderOperationLog("runtime", operation.runtimeLogs)}
      </section>

      <section class="panel operation-panel">
        <div class="panel-header">
          <div><h2>Windows 打包</h2><p class="muted">打包期间不可取消，完成前请保持 DevTools 打开。</p></div>
          <span class="operation-status ${escapeHtml(operation.build.status)}">${escapeHtml(operationStatusLabel(operation.build.status))}</span>
        </div>
        <div class="operation-command"><code>${escapeHtml(buildScript)} -PetVariant ${escapeHtml(variant?.id || "-")}</code></div>
        ${!buildAvailable ? `<p class="warning">当前平台不支持 Windows 打包。</p>` : ""}
        ${variant && !windowsSupported ? `<p class="warning">当前宠物变体未声明 win32 平台支持。</p>` : ""}
        <div class="button-row operation-actions">
          <button type="button" class="primary" data-run-windows-build${buildRunning || !buildAvailable || !windowsSupported ? " disabled" : ""}>开始打包</button>
          ${operation.canOpenBuildOutput ? `<button type="button" class="output-link" data-open-build-output>打开产物目录</button>` : ""}
        </div>
        ${renderOperationLog("build", operation.buildLogs)}
      </section>
    </div>
  </div>`;
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
  operations: renderOperations,
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
  const renderedView = getRenderedView();
  const focusSnapshot = renderedView === state.view ? readFocusSnapshot() : null;
  if (options.preserveScroll !== false && isKnownView(renderedView)) {
    viewScrollSnapshots.set(renderedView, readScrollSnapshot());
  }
  const currentView = normalizeView(state.view);
  const scrollSnapshot = options.resetScroll ? null : viewScrollSnapshots.get(currentView);
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
  restoreFocusSnapshot(focusSnapshot);
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
    if (!state.operations.selectedId && state.variants.length > 0) {
      state.operations.selectedId = state.variants[0].id;
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
    const actions = maintainResourceActions(state.maintain.details);
    if (!actions.includes(state.maintain.frameAction)) {
      state.maintain.frameAction = actions[0] || "";
    }
    if (state.maintain.frameAction && api.getActionFramePool) {
      await loadActionFramePool(state.maintain.frameAction, { renderAfter: false });
    }
  } catch (error) {
    state.maintain.details = null;
    pushLog(error.message);
  }
  renderDetails();
}

async function loadActionFramePool(action, options = {}) {
  if (!action || !api.getActionFramePool) return;
  state.maintain.framePoolPending = true;
  state.maintain.frameAction = action;
  if (options.renderAfter !== false) renderPreservingScroll();
  try {
    state.maintain.framePool = await api.getActionFramePool({ id: state.maintain.selectedId, action });
    state.maintain.reselectSelection = state.maintain.framePool.selectedSourceFrames.slice();
    syncFrameRangeFromSelection();
    state.maintain.reselectFreezeLastFrame = state.maintain.framePool.freezeLastFrame;
    state.maintain.framePoolPreview = null;
    state.maintain.reselectPreview = null;
    state.maintain.frameLightboxIndex = null;
    state.maintain.lastFrameSelectionIndex = null;
    state.maintain.pendingFrameSelectionShift = false;
  } catch (error) {
    state.maintain.framePool = null;
    pushLog(error.message);
  } finally {
    state.maintain.framePoolPending = false;
    if (options.renderAfter !== false) renderPreservingScroll();
  }
}

async function buildFramePoolPreview() {
  state.maintain.framePoolBuildPending = true;
  state.maintain.framePoolPreview = null;
  renderPreservingScroll();
  try {
    state.maintain.framePoolPreview = await api.buildGenerateFramePoolPreview({ id: state.maintain.selectedId, action: state.maintain.frameAction });
  } catch (error) {
    pushLog(error.message);
  } finally {
    state.maintain.framePoolBuildPending = false;
    renderPreservingScroll();
  }
}

async function runFramePool(previewId) {
  if (!previewId || !window.confirm("确认仅生成这个动作的 processed_frames 素材池吗？")) return;
  state.running = true;
  state.activeOperation = "maintainVariant";
  state.logs = [];
  state.stages = {};
  renderPreservingScroll();
  try {
    await api.generateFramePool(previewId);
    state.stages.complete = "done";
    await loadMaintainDetails(state.maintain.selectedId, { preserveScroll: true });
  } catch (error) {
    state.stages.complete = "failed";
    pushLog(error.message);
  } finally {
    state.running = false;
    renderPreservingScroll();
  }
}

async function buildReselectPreview() {
  state.maintain.reselectPending = true;
  state.maintain.reselectPreview = null;
  renderPreservingScroll();
  try {
    state.maintain.reselectPreview = await api.buildReselectRuntimeFramesPreview({
      id: state.maintain.selectedId,
      action: state.maintain.frameAction,
      sourceFrames: state.maintain.reselectSelection,
      freezeLastFrame: state.maintain.frameAction === "yawn" ? state.maintain.reselectFreezeLastFrame : undefined
    });
  } catch (error) {
    pushLog(error.message);
  } finally {
    state.maintain.reselectPending = false;
    renderPreservingScroll();
  }
}

async function runReselect(previewId) {
  if (!previewId || !window.confirm("确认用选中的素材帧重建运行帧并写入动作元数据吗？")) return;
  state.running = true;
  state.activeOperation = "maintainVariant";
  state.logs = [];
  state.stages = {};
  renderPreservingScroll();
  try {
    await api.reselectRuntimeFrames(previewId);
    state.stages.complete = "done";
    await loadMaintainDetails(state.maintain.selectedId, { preserveScroll: true });
  } catch (error) {
    state.stages.complete = "failed";
    pushLog(error.message);
  } finally {
    state.running = false;
    renderPreservingScroll();
  }
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
  if (view === "maintainVariant" || view === "deleteVariant" || view === "petCatalog" || view === "operations") {
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

async function buildActionRegistrationPreview(context) {
  const registration = state.actionRegistration[context];
  if (!registration || busy()) return;
  registration.pending = true;
  registration.preview = null;
  registration.error = "";
  renderPreservingScroll();
  try {
    registration.preview = await api.buildActionRegistrationPreview({
      actionKey: registration.actionKey,
      label: registration.label,
      playbackMode: registration.playbackMode,
      durationMinutes: registration.playbackMode === "timed" ? Number(registration.durationMinutes) : undefined
    });
  } catch (error) {
    registration.error = error.message;
  } finally {
    registration.pending = false;
    renderPreservingScroll();
  }
}

function operationPayload() {
  return { variant: state.operations.selectedId, channel: state.operations.channel };
}

async function startLocalPet() {
  state.operations.error = "";
  state.operations.runtimeLogs = [];
  state.operations.runtime = { ...state.operations.runtime, status: "starting", variant: state.operations.selectedId, channel: state.operations.channel };
  renderPreservingScroll();
  try {
    state.operations.runtime = { ...state.operations.runtime, ...await api.startLocalPet(operationPayload()) };
  } catch (error) {
    state.operations.error = error.message;
    state.operations.runtime = { ...state.operations.runtime, status: "failed" };
  }
  renderPreservingScroll();
}

async function stopLocalPet() {
  state.operations.error = "";
  try {
    await api.stopLocalPet();
  } catch (error) {
    state.operations.error = error.message;
  }
  renderPreservingScroll();
}

async function runWindowsBuild() {
  const variant = state.operations.selectedId;
  const channel = state.operations.channel;
  if (!window.confirm(`确认开始打包 ${variant} 的 ${channel} 渠道吗？旧产物可能被替换。`)) return;
  state.operations.error = "";
  state.operations.buildLogs = [];
  state.operations.canOpenBuildOutput = false;
  state.operations.build = { ...state.operations.build, status: "running", variant, channel, exitCode: null };
  renderPreservingScroll();
  try {
    await api.runWindowsBuild({ variant, channel });
  } catch (error) {
    state.operations.error = error.message;
    state.operations.build = { ...state.operations.build, status: "failed" };
  }
  renderPreservingScroll();
}

async function openBuildOutput() {
  state.operations.error = "";
  try {
    await api.openBuildOutput();
  } catch (error) {
    state.operations.error = error.message;
    renderPreservingScroll();
  }
}

async function applyActionRegistration(context, previewId) {
  const registration = state.actionRegistration[context];
  if (!registration || busy() || !previewId) return;
  registration.pending = true;
  registration.error = "";
  renderPreservingScroll();
  try {
    const result = await api.applyActionRegistration(previewId);
    state.options = await api.getCatalogOptions();
    if (context === "newVariant") {
      state.form.advanced.enabledActions = setListValue(state.form.advanced.enabledActions, result.actionKey, true);
      clearNewPreview();
    } else if (state.maintain.details) {
      state.maintain.metadataFields.enabledActions = setListValue(state.maintain.metadataFields.enabledActions, result.actionKey, true);
      state.maintain.metadataPreview = null;
    }
    state.actionRegistration[context] = createActionRegistrationState();
    pushLog(`已注册全局动作 ${result.actionKey}（${result.stateId}）`);
  } catch (error) {
    registration.error = error.message;
    registration.pending = false;
  }
  renderPreservingScroll();
}

function buildMetadataPayload() {
  const fields = state.maintain.metadataFields;
  const newActions = newlyEnabledActions();
  return {
    id: state.maintain.selectedId,
    actionVideos: Object.fromEntries(newActions
      .filter((action) => state.maintain.newActionVideos[action])
      .map((action) => [action, state.maintain.newActionVideos[action]])),
    loopModes: Object.fromEntries(newActions
      .map((action) => [action, maintainLoopModeFor("newActionLoopModes", action)])),
    detachedArtifactOverrides: Object.fromEntries(newActions
      .map((action) => [action, maintainCleanDetachedArtifacts("newActionDetachedArtifactOverrides", action)])),
    fields: {
      species: fields.species,
      version: fields.version,
      notes: fields.notes,
      actions: {
        enabled: parseList(fields.enabledActions)
      },
      features: {
        enable: parseList(fields.featuresEnable),
        disable: []
      }
    }
  };
}

async function buildReplacePreview() {
  if (busy() || !state.maintain.selectedId) {
    return;
  }
  state.maintain.replacePending = true;
  clearMaintainPreviews();
  renderPreservingScroll();
  try {
    state.maintain.replacePreview = await api.buildReplaceActionsPreview({
      id: state.maintain.selectedId,
      actionVideos: state.maintain.replacementVideos,
      loopModes: state.maintain.replacementLoopModes,
      detachedArtifactOverrides: Object.fromEntries(Object.keys(state.maintain.replacementVideos)
        .map((action) => [action, maintainCleanDetachedArtifacts("replacementDetachedArtifactOverrides", action)]))
    });
  } catch (error) {
    pushLog(error.message);
  } finally {
    state.maintain.replacePending = false;
    renderPreservingScroll();
  }
}

async function runReplaceAction(previewId) {
  if (busy() || !previewId || !window.confirm("确认执行这些动作资源替换吗？")) {
    return;
  }
  state.running = true;
  state.activeOperation = "maintainVariant";
  state.logs = [];
  state.stages = {};
  render();
  try {
    await api.runReplaceActions(previewId);
    state.stages.complete = "done";
    state.maintain.replacementVideos = {};
    state.maintain.replacementLoopModes = {};
    state.maintain.replacementDetachedArtifactOverrides = {};
    await loadMaintainDetails(state.maintain.selectedId);
  } catch (error) {
    state.stages.complete = "failed";
    pushLog(error.message);
  } finally {
    state.running = false;
    render();
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
    state.maintain.newActionVideos = {};
    state.maintain.newActionLoopModes = {};
    state.maintain.newActionDetachedArtifactOverrides = {};
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

async function buildDeleteActionPreview(action) {
  if (busy() || !state.maintain.selectedId || !action) {
    return;
  }
  state.maintain.deleteActionPending = true;
  state.maintain.deleteActionPreview = null;
  renderPreservingScroll();
  try {
    state.maintain.deleteActionPreview = await api.buildDeleteActionPreview({
      id: state.maintain.selectedId,
      action
    });
  } catch (error) {
    pushLog(error.message);
  } finally {
    state.maintain.deleteActionPending = false;
    renderPreservingScroll();
  }
}

async function deleteAction(previewId) {
  if (busy() || !previewId || !window.confirm("确认删除这个动作的资源、manifest 条目和对应元数据吗？")) {
    return;
  }
  state.running = true;
  state.activeOperation = "maintainVariant";
  state.logs = [];
  state.stages = {};
  renderPreservingScroll();
  try {
    await api.deleteAction(previewId);
    state.stages.complete = "done";
    state.maintain.deleteActionPreview = null;
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
  if (event.target.dataset.frameRange === "start" || event.target.dataset.frameRange === "end") {
    const field = event.target.dataset.frameRange === "start" ? "frameRangeStart" : "frameRangeEnd";
    state.maintain[field] = event.target.value;
    state.maintain.frameRangeError = "";
    return;
  }
  const registrationContext = event.target.dataset.actionRegistrationContext;
  const registrationField = event.target.dataset.actionRegistrationField;
  if (registrationContext && registrationField && state.actionRegistration[registrationContext]) {
    const registration = state.actionRegistration[registrationContext];
    registration[registrationField] = event.target.value;
    registration.preview = null;
    registration.error = "";
    syncActionRegistrationDraftUi(event.target, registration, registrationField);
    return;
  }
  const maintainField = event.target.dataset.maintainField;
  if (maintainField) {
    state.maintain.metadataFields[maintainField] = event.target.value;
    state.maintain.metadataFields.notePreset = findNotePreset(
      state.maintain.metadataFields.notes,
      state.maintain.details?.profile?.scope
    );
    markMetadataPreviewDirty();
    return;
  }
  if (event.target.dataset.deleteConfirmInput !== undefined) {
    state.deleteVariant.confirmText = event.target.value;
    updateDeleteConfirmButton();
    return;
  }
  if (event.target.dataset.replaceLoopStart !== undefined) {
    maintainLoopModeFor("replacementLoopModes", event.target.dataset.replaceLoopStart).sourceStart = event.target.value;
    state.maintain.replacePreview = null;
  } else if (event.target.dataset.replaceLoopEnd !== undefined) {
    maintainLoopModeFor("replacementLoopModes", event.target.dataset.replaceLoopEnd).sourceEnd = event.target.value;
    state.maintain.replacePreview = null;
  } else if (event.target.dataset.newActionLoopStart !== undefined) {
    maintainLoopModeFor("newActionLoopModes", event.target.dataset.newActionLoopStart).sourceStart = event.target.value;
    state.maintain.metadataPreview = null;
  } else if (event.target.dataset.newActionLoopEnd !== undefined) {
    maintainLoopModeFor("newActionLoopModes", event.target.dataset.newActionLoopEnd).sourceEnd = event.target.value;
    state.maintain.metadataPreview = null;
  } else if (event.target.dataset.loopStart) {
    setLoopMode(event.target.dataset.loopStart, { sourceStart: event.target.value });
  } else if (event.target.dataset.loopEnd) {
    setLoopMode(event.target.dataset.loopEnd, { sourceEnd: event.target.value });
  }
});

appNode.addEventListener("click", (event) => {
  const sourceFrame = event.target.closest?.("[data-source-frame]");
  if (sourceFrame) {
    state.maintain.pendingFrameSelectionShift = Boolean(event.shiftKey);
  }
}, true);

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
  const registrationContext = event.target.dataset.actionRegistrationContext;
  const registrationMode = event.target.dataset.actionRegistrationMode;

  if (event.target.dataset.operationVariant !== undefined) {
    state.operations.selectedId = event.target.value;
    state.operations.canOpenBuildOutput = false;
    state.operations.error = "";
    renderPreservingScroll();
  } else if (event.target.dataset.operationChannel !== undefined) {
    state.operations.channel = event.target.value;
    state.operations.canOpenBuildOutput = false;
    state.operations.error = "";
    renderPreservingScroll();
  } else if (registrationContext && registrationMode && state.actionRegistration[registrationContext]) {
    state.actionRegistration[registrationContext].playbackMode = registrationMode;
    state.actionRegistration[registrationContext].preview = null;
    state.actionRegistration[registrationContext].error = "";
    renderPreservingScroll();
  } else if (field) {
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
  } else if (event.target.dataset.freezeLastFrame !== undefined) {
    setLoopMode(event.target.dataset.freezeLastFrame, { freezeLastFrame: event.target.checked });
  } else if (event.target.dataset.cleanDetachedArtifacts !== undefined) {
    state.form.detachedArtifactOverrides[event.target.dataset.cleanDetachedArtifacts] = event.target.checked;
    clearNewPreview();
    renderPreservingScroll();
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
    state.maintain.metadataPreview = null;
    state.maintain.replacementVideos = {};
    state.maintain.replacementLoopModes = {};
    state.maintain.replacementDetachedArtifactOverrides = {};
    state.maintain.newActionVideos = {};
    state.maintain.newActionLoopModes = {};
    state.maintain.newActionDetachedArtifactOverrides = {};
    state.maintain.deleteActionPreview = null;
    state.maintain.frameAction = "";
    state.maintain.framePool = null;
    state.maintain.framePoolPreview = null;
    state.maintain.reselectPreview = null;
    await loadMaintainDetails(event.target.value);
  } else if (event.target.dataset.frameAction !== undefined) {
    await loadActionFramePool(event.target.value);
  } else if (event.target.dataset.replaceLoopMode !== undefined) {
    maintainLoopModeFor("replacementLoopModes", event.target.dataset.replaceLoopMode).mode = event.target.value;
    state.maintain.replacePreview = null;
    render();
  } else if (event.target.dataset.newActionLoopMode !== undefined) {
    maintainLoopModeFor("newActionLoopModes", event.target.dataset.newActionLoopMode).mode = event.target.value;
    state.maintain.metadataPreview = null;
    render();
  } else if (event.target.dataset.replaceFreezeLastFrame !== undefined) {
    maintainLoopModeFor("replacementLoopModes", event.target.dataset.replaceFreezeLastFrame).freezeLastFrame = event.target.checked;
    state.maintain.replacePreview = null;
    renderPreservingScroll();
  } else if (event.target.dataset.newActionFreezeLastFrame !== undefined) {
    maintainLoopModeFor("newActionLoopModes", event.target.dataset.newActionFreezeLastFrame).freezeLastFrame = event.target.checked;
    state.maintain.metadataPreview = null;
    renderPreservingScroll();
  } else if (event.target.dataset.replaceCleanDetachedArtifacts !== undefined) {
    state.maintain.replacementDetachedArtifactOverrides[event.target.dataset.replaceCleanDetachedArtifacts] = event.target.checked;
    state.maintain.replacePreview = null;
    renderPreservingScroll();
  } else if (event.target.dataset.newActionCleanDetachedArtifacts !== undefined) {
    state.maintain.newActionDetachedArtifactOverrides[event.target.dataset.newActionCleanDetachedArtifacts] = event.target.checked;
    state.maintain.metadataPreview = null;
    renderPreservingScroll();
  } else if (event.target.dataset.sourceFrame !== undefined) {
    const index = Number(event.target.dataset.sourceFrame);
    const selection = new Set(state.maintain.reselectSelection);
    const frameIndexes = (state.maintain.framePool?.processedFrames || []).map((frame) => frame.index);
    const currentPosition = frameIndexes.indexOf(index);
    const previousPosition = frameIndexes.indexOf(state.maintain.lastFrameSelectionIndex);
    if (state.maintain.pendingFrameSelectionShift && currentPosition >= 0 && previousPosition >= 0) {
      const start = Math.min(currentPosition, previousPosition);
      const end = Math.max(currentPosition, previousPosition);
      for (const frameIndex of frameIndexes.slice(start, end + 1)) {
        if (event.target.checked) selection.add(frameIndex);
        else selection.delete(frameIndex);
      }
    } else if (event.target.checked) {
      selection.add(index);
    } else {
      selection.delete(index);
    }
    state.maintain.pendingFrameSelectionShift = false;
    state.maintain.lastFrameSelectionIndex = index;
    state.maintain.reselectSelection = Array.from(selection).sort((left, right) => left - right);
    syncFrameRangeFromSelection();
    state.maintain.reselectPreview = null;
    renderPreservingScroll();
  } else if (event.target.dataset.reselectFreezeLastFrame !== undefined) {
    state.maintain.reselectFreezeLastFrame = event.target.checked;
    state.maintain.reselectPreview = null;
    renderPreservingScroll();
  } else if (maintainField) {
    state.maintain.metadataFields[maintainField] = event.target.value;
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
    if (maintainList === "featuresEnable") {
      state.maintain.metadataFields.featuresDisable = [];
    }
    state.maintain.metadataPreview = null;
    const enabled = new Set(newlyEnabledActions());
    state.maintain.newActionVideos = Object.fromEntries(Object.entries(state.maintain.newActionVideos).filter(([action]) => enabled.has(action)));
    state.maintain.newActionLoopModes = Object.fromEntries(Object.entries(state.maintain.newActionLoopModes).filter(([action]) => enabled.has(action)));
    state.maintain.newActionDetachedArtifactOverrides = Object.fromEntries(Object.entries(state.maintain.newActionDetachedArtifactOverrides).filter(([action]) => enabled.has(action)));
    renderPreservingScroll();
  } else if (event.target.dataset.deleteSelect !== undefined) {
    state.deleteVariant.selectedId = event.target.value;
    state.deleteVariant.preview = null;
    state.deleteVariant.confirmText = "";
    render();
  }
});

appNode.addEventListener("click", async (event) => {
  const openFrameControl = event.target.closest?.("[data-open-frame-lightbox]");
  const frameStepControl = event.target.closest?.("[data-frame-lightbox-step]");
  const closeFrameControl = event.target.closest?.("[data-close-frame-lightbox]");
  if (busy() && event.target.dataset.closeSuccess === undefined) {
    return;
  }
  const catalogRow = event.target.closest("[data-catalog-id]");
  const action = event.target.dataset.chooseAction;
  const previewId = event.target.dataset.runPreview;
  const registrationBuildContext = event.target.dataset.buildActionRegistration;
  const registrationApplyContext = event.target.dataset.applyActionRegistration;

  if (registrationBuildContext) {
    await buildActionRegistrationPreview(registrationBuildContext);
  } else if (registrationApplyContext) {
    await applyActionRegistration(registrationApplyContext, event.target.dataset.actionRegistrationPreviewId);
  } else if (catalogRow) {
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
  } else if (event.target.dataset.replaceVideo !== undefined) {
    const selectedAction = event.target.dataset.replaceVideo;
    const filePath = await api.chooseActionVideo(selectedAction);
    if (filePath) {
      state.maintain.replacementVideos[selectedAction] = filePath;
      state.maintain.replacePreview = null;
      renderPreservingScroll();
    }
  } else if (event.target.dataset.newActionVideo !== undefined) {
    const selectedAction = event.target.dataset.newActionVideo;
    const filePath = await api.chooseActionVideo(selectedAction);
    if (filePath) {
      state.maintain.newActionVideos[selectedAction] = filePath;
      state.maintain.metadataPreview = null;
      renderPreservingScroll();
    }
  } else if (event.target.dataset.buildReplacePreview !== undefined) {
    await buildReplacePreview();
  } else if (event.target.dataset.runReplaceActions) {
    await runReplaceAction(event.target.dataset.runReplaceActions);
  } else if (event.target.dataset.buildFramePool !== undefined) {
    await buildFramePoolPreview();
  } else if (event.target.dataset.runFramePool) {
    await runFramePool(event.target.dataset.runFramePool);
  } else if (event.target.dataset.selectAllFrames !== undefined) {
    state.maintain.reselectSelection = (state.maintain.framePool?.processedFrames || []).map((frame) => frame.index);
    syncFrameRangeFromSelection();
    state.maintain.reselectPreview = null;
    renderPreservingScroll();
  } else if (event.target.dataset.clearFrameSelection !== undefined) {
    state.maintain.reselectSelection = [];
    syncFrameRangeFromSelection();
    state.maintain.reselectPreview = null;
    renderPreservingScroll();
  } else if (event.target.dataset.applyFrameRange !== undefined) {
    applyFrameRangeSelection();
  } else if (event.target.dataset.restoreRuntimeFrames !== undefined) {
    state.maintain.reselectSelection = state.maintain.framePool?.selectedSourceFrames?.slice() || [];
    syncFrameRangeFromSelection();
    state.maintain.reselectPreview = null;
    renderPreservingScroll();
  } else if (event.target.dataset.buildReselectPreview !== undefined) {
    await buildReselectPreview();
  } else if (event.target.dataset.runReselect) {
    await runReselect(event.target.dataset.runReselect);
  } else if (event.target.dataset.refreshOperationVariants !== undefined) {
    await refreshVariants({ preserveScroll: true });
  } else if (event.target.dataset.startLocalPet !== undefined) {
    await startLocalPet();
  } else if (event.target.dataset.stopLocalPet !== undefined) {
    await stopLocalPet();
  } else if (event.target.dataset.runWindowsBuild !== undefined) {
    await runWindowsBuild();
  } else if (event.target.dataset.openBuildOutput !== undefined) {
    await openBuildOutput();
  } else if (openFrameControl) {
    state.maintain.frameLightboxIndex = Number(openFrameControl.dataset.openFrameLightbox);
    renderPreservingScroll();
  } else if (frameStepControl) {
    const next = state.maintain.frameLightboxIndex + Number(frameStepControl.dataset.frameLightboxStep);
    state.maintain.frameLightboxIndex = Math.min(Math.max(0, next), Math.max(0, frameLightboxFrames().length - 1));
    renderPreservingScroll();
  } else if (closeFrameControl) {
    state.maintain.frameLightboxIndex = null;
    renderPreservingScroll();
  } else if (event.target.dataset.resetMaintainEdits !== undefined) {
    resetMaintainEdits();
  } else if (event.target.dataset.buildMetadataPreview !== undefined) {
    await buildMetadataPreview();
  } else if (event.target.dataset.applyMetadataEdit) {
    await applyMetadataEdit(event.target.dataset.applyMetadataEdit);
  } else if (event.target.dataset.buildDeleteAction) {
    await buildDeleteActionPreview(event.target.dataset.buildDeleteAction);
  } else if (event.target.dataset.confirmDeleteAction) {
    await deleteAction(event.target.dataset.confirmDeleteAction);
  } else if (event.target.dataset.buildDeletePreview !== undefined) {
    await buildDeletePreview();
  } else if (event.target.dataset.deleteConfirm) {
    await deleteTestVariant(event.target.dataset.deleteConfirm);
  }
});

if (typeof document.addEventListener === "function") {
  document.addEventListener("keydown", (event) => {
    if (!Number.isInteger(state.maintain.frameLightboxIndex)) return;
    if (event.key === "Escape") {
      state.maintain.frameLightboxIndex = null;
    } else if (event.key === "ArrowLeft") {
      state.maintain.frameLightboxIndex = Math.max(0, state.maintain.frameLightboxIndex - 1);
    } else if (event.key === "ArrowRight") {
      state.maintain.frameLightboxIndex = Math.min(Math.max(0, frameLightboxFrames().length - 1), state.maintain.frameLightboxIndex + 1);
    } else {
      return;
    }
    event.preventDefault();
    renderPreservingScroll();
  });
}

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

  api.onOperationStatus?.((event) => {
    if (event.kind === "runtime" || event.kind === "build") {
      state.operations[event.kind] = { ...state.operations[event.kind], ...event };
    }
    if (event.kind === "build" && event.canOpenBuildOutput) {
      state.operations.canOpenBuildOutput = true;
    }
    if (event.error) state.operations.error = event.error;
    renderPreservingScroll();
  });

  api.onOperationLog?.((event) => {
    const target = event.kind === "build" ? state.operations.buildLogs : state.operations.runtimeLogs;
    target.push(`[${streamLabel(event.stream || "info")}] ${String(event.message || "").trim()}`);
    renderPreservingScroll();
  });

  api.getCatalogOptions().then(async (options) => {
    state.options = options;
    if (api.getOperationCapabilities) {
      state.operations.capabilities = await api.getOperationCapabilities();
    }
    if (api.getOperationStatus) {
      const operationStatus = await api.getOperationStatus();
      state.operations.runtime = { ...state.operations.runtime, ...operationStatus.runtime };
      state.operations.build = { ...state.operations.build, ...operationStatus.build };
      state.operations.canOpenBuildOutput = Boolean(operationStatus.canOpenBuildOutput);
    }
    render();
    await refreshVariants();
  }).catch((error) => {
    appNode.innerHTML = `<pre class="fatal">${escapeHtml(error.message)}</pre>`;
  });
}

render();
