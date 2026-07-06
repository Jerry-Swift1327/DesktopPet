const api = window.variantDevtools;

const stageNames = [
  "prepareStaging",
  "writeMetadata",
  "copyVideos",
  "processVideos",
  "runPreflight",
  "generateGallery",
  "complete"
];

const stageLabels = {
  prepareStaging: "准备暂存",
  writeMetadata: "写入元数据",
  copyVideos: "复制视频",
  processVideos: "处理视频",
  runPreflight: "运行预检",
  generateGallery: "生成图鉴",
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

const defaultActionButtons = ["squat", "walk", "feed", "ball"];
const defaultEnabledFeatures = ["autoStart", "windowRoam"];

const featureLabels = {
  autoStart: "开机自启",
  windowRoam: "窗口漫游",
  customization: "自定义",
  switchPet: "切换宠物",
  eyeTracking: "视线追踪",
  idleYawn: "闲置打哈欠",
  sleepPoseSwitch: "睡姿切换",
  wakeHiss: "唤醒哈气",
  dockShake: "Dock 抖动"
};

const state = {
  options: null,
  form: {
    scope: "custom",
    tier: "basic",
    species: "cat",
    platforms: ["win32"],
    date: new Date().toISOString().slice(0, 10),
    sourceFolder: "",
    actionVideos: {},
    autoSelectLoop: false,
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
  },
  preview: null,
  previewPending: false,
  previewRequestId: 0,
  result: null,
  running: false,
  advancedOpen: false,
  logs: [],
  stages: {}
};

const appNode = document.getElementById("app");

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

function renderJson(value) {
  return escapeHtml(JSON.stringify(value, null, 2));
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

function clearPreview() {
  state.preview = null;
  state.result = null;
}

function setField(name, value) {
  if (state.running || state.previewPending) {
    return;
  }
  state.form[name] = value;
  clearPreview();
  render();
}

function setAdvancedField(name, value) {
  if (state.running || state.previewPending) {
    return;
  }
  state.form.advanced[name] = value;
  clearPreview();
  render();
}

function setAdvancedList(name, values) {
  if (state.running || state.previewPending) {
    return;
  }
  state.form.advanced[name] = Array.from(new Set(values));
  clearPreview();
  render();
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
  if (state.running || state.previewPending) {
    return;
  }
  state.form[name] = value;
  clearPreview();
  render();
}

function setActionVideo(action, filePath) {
  if (state.running || state.previewPending) {
    return;
  }
  if (!filePath) {
    return;
  }
  state.form.actionVideos[action] = filePath;
  clearPreview();
  render();
}

function renderSelect(name, values) {
  const disabled = state.running || state.previewPending ? " disabled" : "";
  return `<select data-field="${escapeHtml(name)}"${disabled}>${values.map((value) => {
    const selected = state.form[name] === value ? " selected" : "";
    return `<option value="${escapeHtml(value)}"${selected}>${escapeHtml(value)}</option>`;
  }).join("")}</select>`;
}

function renderPlatformToggles() {
  return ["win32", "darwin"].map((platform) => {
    const checked = state.form.platforms.includes(platform) ? " checked" : "";
    const disabled = state.running || state.previewPending ? " disabled" : "";
    return `<label class="check"><input type="checkbox" data-platform="${platform}"${checked}${disabled}>${platform}</label>`;
  }).join("");
}

function renderActionOption(action, kind, checked, locked = false) {
  const disabled = state.running || state.previewPending || locked ? " disabled" : "";
  const checkedAttr = checked ? " checked" : "";
  const lockedText = locked ? `<span class="option-note">必选</span>` : "";
  return `<label class="option-check">
    <input type="checkbox" data-action-toggle="${escapeHtml(action)}" data-action-kind="${escapeHtml(kind)}"${checkedAttr}${disabled}>
    <span>${escapeHtml(actionLabel(action))}</span>
    ${lockedText}
  </label>`;
}

function renderFeatureOption(feature, name, checked) {
  const disabled = state.running || state.previewPending ? " disabled" : "";
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

  return `<div class="option-section">
    <h3>动作选择</h3>
    <p class="muted">基础动作固定包含；勾选额外动作后，下方才会出现对应源视频卡片。</p>
    <div class="option-group">
      <strong>基础按钮动作</strong>
      <div class="option-grid">${Array.from(baseButtons).map((action) => renderActionOption(action, "button", true, true)).join("")}</div>
    </div>
    <div class="option-group">
      <strong>额外按钮动作</strong>
      <div class="option-grid">${extraButtons.join("") || `<span class="muted">暂无可选动作</span>`}</div>
    </div>
    <div class="option-group">
      <strong>资源动作</strong>
      <div class="option-grid">${assetOptions.join("") || `<span class="muted">暂无可选资源动作</span>`}</div>
    </div>
  </div>`;
}

function renderFeaturePicker() {
  const enabled = new Set(selectedEnabledFeatures());
  const disabled = new Set(selectedDisabledFeatures());
  const features = Object.keys(state.options.features);
  return `<div class="option-section">
    <h3>功能选择</h3>
    <div class="option-group">
      <strong>启用功能</strong>
      <div class="option-grid">${features.map((feature) => renderFeatureOption(feature, "features", enabled.has(feature))).join("")}</div>
    </div>
    <div class="option-group">
      <strong>禁用功能</strong>
      <div class="option-grid">${features.map((feature) => renderFeatureOption(feature, "disableFeatures", disabled.has(feature))).join("")}</div>
    </div>
  </div>`;
}

function renderDerivedSummary() {
  const enable = selectedEnabledFeatures();
  const disable = selectedDisabledFeatures();

  return `<div class="summary-grid">
    <div><span>变体 ID id</span><strong>${escapeHtml(getDerivedDraftValue("id"))}</strong></div>
    <div><span>说明 notes</span><strong>${escapeHtml(getNotesValue() || "-")}</strong></div>
    <div><span>版本 version</span><strong>${escapeHtml(getDerivedDraftValue("version"))}</strong></div>
    <div><span>缩放 scale</span><strong>${escapeHtml(getDerivedDraftValue("scale"))}</strong></div>
    <div><span>资源前缀 assetPrefix</span><strong>${escapeHtml(getDerivedDraftValue("assetPrefix"))}</strong></div>
    <div><span>动作 actions</span><strong>${escapeHtml(requiredActions().join(", ") || "-")}</strong></div>
    <div><span>启用功能 features on</span><strong>${escapeHtml(enable.join(", ") || "-")}</strong></div>
    <div><span>禁用功能 features off</span><strong>${escapeHtml(disable.join(", ") || "-")}</strong></div>
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
        <h3>${escapeHtml(actionLabel(action))}</h3>
        <span class="badge">${escapeHtml(cardStatusLabel)} / ${escapeHtml(sourceKind)}</span>
        <p>${escapeHtml(sourceText)}</p>
      </div>
      <button type="button" data-choose-action="${escapeHtml(action)}"${state.running || state.previewPending ? " disabled" : ""}>${manualPath ? "替换视频" : "选择视频"}</button>
    </article>`;
  }).join("");
}

function renderPreview() {
  if (!state.preview) {
    return `<section class="panel empty-preview">
      <div class="panel-header">
        <h2>预览</h2>
        <span class="muted">${state.previewPending ? "生成中" : "尚未生成"}</span>
      </div>
    </section>`;
  }

  return `<section class="panel">
    <div class="panel-header">
      <h2>预览</h2>
      <button type="button" class="primary" data-run-preview="${escapeHtml(state.preview.previewId)}"${state.running || state.previewPending ? " disabled" : ""}>开始生成</button>
    </div>
    <div class="summary-grid">
      <div><span>变体 ID id</span><strong>${escapeHtml(state.preview.draft.id)}</strong></div>
      <div><span>物种 species</span><strong>${escapeHtml(state.preview.draft.species)}</strong></div>
      <div><span>套餐 tier</span><strong>${escapeHtml(state.preview.draft.tier)}</strong></div>
      <div><span>版本 version</span><strong>${escapeHtml(state.preview.draft.version)}</strong></div>
    </div>
    <div class="preview-grid">
      <section>
        <h3>元数据草稿</h3>
        <pre>${renderJson(state.preview.draft)}</pre>
      </section>
      <section>
        <h3>复制目标</h3>
        <pre>${renderJson(state.preview.copied)}</pre>
      </section>
      <section>
        <h3>处理命令</h3>
        <pre>${renderJson(state.preview.processCommands)}</pre>
      </section>
      <section>
        <h3>预检命令</h3>
        <pre>${renderJson(state.preview.preflightCommands || [])}</pre>
      </section>
    </div>
    <h3>警告</h3>
    <pre>${renderJson(state.preview.warnings || [])}</pre>
  </section>`;
}

function renderExecution() {
  return `<section class="panel">
    <div class="panel-header">
      <h2>执行进度</h2>
      ${state.result ? `<span class="success">已生成 ${escapeHtml(state.result.id)}</span>` : `<span class="muted">${state.running ? "执行中" : "空闲"}</span>`}
    </div>
    <div class="stage-list">
      ${stageNames.map((stage) => {
        const status = state.stages[stage] || "pending";
        return `<div class="stage ${escapeHtml(status)}"><span>${escapeHtml(stageLabel(stage))}</span><strong>${escapeHtml(statusLabel(status))}</strong></div>`;
      }).join("")}
    </div>
    <pre class="log">${state.logs.map(escapeHtml).join("\n")}</pre>
  </section>`;
}

function renderAdvancedControls() {
  const advanced = state.form.advanced;
  const disabled = state.running || state.previewPending ? " disabled" : "";
  return `<details class="advanced"${state.advancedOpen ? " open" : ""}>
    <summary>高级设置（谨慎使用）</summary>
    <div class="form-grid">
      <label>变体 ID id <input type="text" data-advanced="id" value="${escapeHtml(advanced.id || "")}"${disabled}></label>
      <label>资源前缀 assetPrefix <input type="text" data-advanced="assetPrefix" value="${escapeHtml(advanced.assetPrefix || "")}"${disabled}></label>
      <label>缩放 scale <input type="number" min="0.4" max="2" step="0.05" data-advanced="scale" value="${escapeHtml(advanced.scale || "")}"${disabled}></label>
      <label>版本 version <input type="text" data-advanced="version" value="${escapeHtml(advanced.version || "")}"${disabled}></label>
    </div>
    ${renderActionPicker()}
    ${renderFeaturePicker()}
    <div class="check-row">
      <label class="check"><input type="checkbox" data-run-option="force"${state.form.force ? " checked" : ""}${disabled}>强制覆盖资源</label>
      <label class="check"><input type="checkbox" data-run-option="skipProcessing"${state.form.skipProcessing ? " checked" : ""}${disabled}>跳过视频处理</label>
      <label class="check"><input type="checkbox" data-run-option="skipPreflight"${state.form.skipPreflight ? " checked" : ""}${disabled}>跳过预检</label>
      <label class="check"><input type="checkbox" data-run-option="skipGallery"${state.form.skipGallery ? " checked" : ""}${disabled}>跳过图鉴生成</label>
    </div>
  </details>`;
}

function renderMain() {
  const options = state.options;
  appNode.innerHTML = `<div class="wizard">
    <section class="panel">
      <div class="panel-header">
        <div>
          <h1>新增宠物</h1>
          <p class="muted">基于 bootstrap 流程创建宠物变体</p>
        </div>
        <button type="button" class="primary" data-build-preview${state.running || state.previewPending ? " disabled" : ""}>${state.previewPending ? "生成中" : "生成预览"}</button>
      </div>
      <div class="form-grid">
        <label>范围 scope ${renderSelect("scope", Object.keys(options.notes))}</label>
        <label>套餐 tier ${renderSelect("tier", Object.keys(options.tiers))}</label>
        <label>物种 species ${renderSelect("species", Object.keys(options.species))}</label>
        <label>日期 date <input type="date" data-field="date" value="${escapeHtml(state.form.date)}"${state.running || state.previewPending ? " disabled" : ""}></label>
      </div>
      <div class="platforms">${renderPlatformToggles()}</div>
      <div class="check-row processing-options">
        <label class="check"><input type="checkbox" data-run-option="autoSelectLoop"${state.form.autoSelectLoop ? " checked" : ""}${state.running || state.previewPending ? " disabled" : ""}>自动选取最佳运行帧段</label>
        <span class="muted">未勾选时，运行帧使用素材池完整帧范围。</span>
      </div>
      ${renderDerivedSummary()}
      ${renderAdvancedControls()}
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>源视频</h2>
        <button type="button" data-choose-folder${state.running || state.previewPending ? " disabled" : ""}>选择文件夹</button>
      </div>
      <div class="source-path">${escapeHtml(state.form.sourceFolder || "未选择源视频文件夹")}</div>
      <div class="action-grid">${renderActionCards()}</div>
    </section>

    ${renderPreview()}
    ${renderExecution()}
  </div>`;
}

function render() {
  if (!api) {
    appNode.innerHTML = `<pre class="fatal">Devtools 预加载 API 不可用。</pre>`;
    return;
  }
  if (!state.options) {
    appNode.innerHTML = `<div class="loading">加载中</div>`;
    return;
  }
  renderMain();
}

function pushLog(message) {
  state.logs.push(message);
}

function formatLogEvent(event) {
  const stage = event.stage || "task";
  const stream = event.stream || "info";
  return `[${stageLabel(stage)}:${streamLabel(stream)}] ${String(event.message || "").trim()}`;
}

async function buildPreview() {
  if (state.running || state.previewPending) {
    return;
  }
  const requestId = state.previewRequestId + 1;
  state.previewRequestId = requestId;
  state.previewPending = true;
  clearPreview();
  render();

  try {
    const formSnapshot = JSON.parse(JSON.stringify(state.form));
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
      render();
    }
  }
}

appNode.addEventListener("toggle", (event) => {
  if (event.target.classList.contains("advanced")) {
    state.advancedOpen = event.target.open;
  }
}, true);

appNode.addEventListener("change", (event) => {
  if (state.running || state.previewPending) {
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
    clearPreview();
    render();
  } else if (runOption) {
    setRunOption(runOption, event.target.checked);
  }
});

appNode.addEventListener("click", async (event) => {
  if (state.running || state.previewPending) {
    return;
  }
  const action = event.target.dataset.chooseAction;
  const previewId = event.target.dataset.runPreview;

  if (event.target.dataset.chooseFolder !== undefined) {
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
  }
});

async function runPreview(previewId) {
  if (!state.preview || state.running || state.previewPending) {
    return;
  }
  if (!window.confirm("确认开始生成这个宠物变体吗？")) {
    return;
  }

  state.running = true;
  state.result = null;
  state.logs = [];
  state.stages = {};
  render();

  try {
    const result = await api.runNewVariant(previewId);
    state.result = result;
    state.stages.complete = "done";
  } catch (error) {
    state.stages.complete = "failed";
    pushLog(error.message);
  } finally {
    state.running = false;
    render();
  }
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

  api.getCatalogOptions().then((options) => {
    state.options = options;
    render();
  }).catch((error) => {
    appNode.innerHTML = `<pre class="fatal">${escapeHtml(error.message)}</pre>`;
  });
}

render();
