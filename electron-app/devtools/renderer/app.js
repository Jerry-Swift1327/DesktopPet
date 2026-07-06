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
    advanced: {},
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

function getTierProfile() {
  return state.options.tiers[state.form.tier] || { actionButtons: [], actionAssets: [], features: { enable: [] } };
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
  return name === "version" ? "from template" : "after preview";
}

function actionLabel(action) {
  const item = state.options.actions[action];
  return item ? `${action} / ${item.label || item.asset || "action"}` : action;
}

function requiredActions() {
  const tier = getTierProfile();
  const advancedButtons = parseList(state.form.advanced.actionButtons);
  const advancedAssets = parseList(state.form.advanced.actionAssets);
  const buttons = advancedButtons.length > 0 ? advancedButtons : tier.actionButtons || [];
  const assets = advancedAssets.length > 0 ? advancedAssets : tier.actionAssets || [];
  return Array.from(new Set(buttons.concat(assets)));
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

function renderDerivedSummary() {
  const tier = getTierProfile();
  const enable = (tier.features && tier.features.enable) || [];
  const disable = (tier.features && tier.features.disable) || [];

  return `<div class="summary-grid">
    <div><span>id</span><strong>${escapeHtml(getDerivedDraftValue("id"))}</strong></div>
    <div><span>notes</span><strong>${escapeHtml(getNotesValue() || "-")}</strong></div>
    <div><span>version</span><strong>${escapeHtml(getDerivedDraftValue("version"))}</strong></div>
    <div><span>scale</span><strong>${escapeHtml(getDerivedDraftValue("scale"))}</strong></div>
    <div><span>assetPrefix</span><strong>${escapeHtml(getDerivedDraftValue("assetPrefix"))}</strong></div>
    <div><span>actions</span><strong>${escapeHtml(requiredActions().join(", ") || "-")}</strong></div>
    <div><span>features on</span><strong>${escapeHtml(enable.join(", ") || "-")}</strong></div>
    <div><span>features off</span><strong>${escapeHtml(disable.join(", ") || "-")}</strong></div>
  </div>`;
}

function renderActionCards() {
  return requiredActions().map((action) => {
    const manualPath = selectedPath(action);
    const stagedPath = state.preview && state.preview.stagedVideos ? state.preview.stagedVideos[action] : "";
    const status = manualPath ? "manual" : (stagedPath ? "matched" : (state.form.sourceFolder ? "pending" : "missing"));
    const sourceKind = manualPath ? "manual selection" : (stagedPath ? "folder scan match" : (state.form.sourceFolder ? "folder scan pending" : "missing"));
    const statusLabel = manualPath ? "manually selected" : (stagedPath ? "matched" : (state.form.sourceFolder ? "pending" : "missing"));
    const sourceText = manualPath || stagedPath || (state.form.sourceFolder ? "Generate preview to scan folder" : "No video selected");
    return `<article class="action-card ${status}">
      <div class="action-copy">
        <h3>${escapeHtml(actionLabel(action))}</h3>
        <span class="badge">${escapeHtml(statusLabel)} / ${escapeHtml(sourceKind)}</span>
        <p>${escapeHtml(sourceText)}</p>
      </div>
      <button type="button" data-choose-action="${escapeHtml(action)}"${state.running || state.previewPending ? " disabled" : ""}>${manualPath ? "Replace" : "Choose"}</button>
    </article>`;
  }).join("");
}

function renderPreview() {
  if (!state.preview) {
    return `<section class="panel empty-preview">
      <div class="panel-header">
        <h2>Preview</h2>
        <span class="muted">${state.previewPending ? "Generating" : "Not generated"}</span>
      </div>
    </section>`;
  }

  return `<section class="panel">
    <div class="panel-header">
      <h2>Preview</h2>
      <button type="button" class="primary" data-run-preview="${escapeHtml(state.preview.previewId)}"${state.running || state.previewPending ? " disabled" : ""}>Start Generate</button>
    </div>
    <div class="summary-grid">
      <div><span>id</span><strong>${escapeHtml(state.preview.draft.id)}</strong></div>
      <div><span>species</span><strong>${escapeHtml(state.preview.draft.species)}</strong></div>
      <div><span>tier</span><strong>${escapeHtml(state.preview.draft.tier)}</strong></div>
      <div><span>version</span><strong>${escapeHtml(state.preview.draft.version)}</strong></div>
    </div>
    <div class="preview-grid">
      <section>
        <h3>Draft</h3>
        <pre>${renderJson(state.preview.draft)}</pre>
      </section>
      <section>
        <h3>Copy Targets</h3>
        <pre>${renderJson(state.preview.copied)}</pre>
      </section>
      <section>
        <h3>Process Commands</h3>
        <pre>${renderJson(state.preview.processCommands)}</pre>
      </section>
      <section>
        <h3>Preflight Commands</h3>
        <pre>${renderJson(state.preview.preflightCommands || [])}</pre>
      </section>
    </div>
    <h3>Warnings</h3>
    <pre>${renderJson(state.preview.warnings || [])}</pre>
  </section>`;
}

function renderExecution() {
  return `<section class="panel">
    <div class="panel-header">
      <h2>Execution</h2>
      ${state.result ? `<span class="success">Applied ${escapeHtml(state.result.id)}</span>` : `<span class="muted">${state.running ? "Running" : "Idle"}</span>`}
    </div>
    <div class="stage-list">
      ${stageNames.map((stage) => {
        const status = state.stages[stage] || "pending";
        return `<div class="stage ${escapeHtml(status)}"><span>${escapeHtml(stage)}</span><strong>${escapeHtml(status)}</strong></div>`;
      }).join("")}
    </div>
    <pre class="log">${state.logs.map(escapeHtml).join("\n")}</pre>
  </section>`;
}

function renderAdvancedControls() {
  const advanced = state.form.advanced;
  const disabled = state.running || state.previewPending ? " disabled" : "";
  return `<details class="advanced"${state.advancedOpen ? " open" : ""}>
    <summary>Advanced overrides</summary>
    <div class="form-grid">
      <label>id <input type="text" data-advanced="id" value="${escapeHtml(advanced.id || "")}"${disabled}></label>
      <label>assetPrefix <input type="text" data-advanced="assetPrefix" value="${escapeHtml(advanced.assetPrefix || "")}"${disabled}></label>
      <label>scale <input type="number" min="0.4" max="2" step="0.05" data-advanced="scale" value="${escapeHtml(advanced.scale || "")}"${disabled}></label>
      <label>version <input type="text" data-advanced="version" value="${escapeHtml(advanced.version || "")}"${disabled}></label>
      <label>action buttons <input type="text" data-advanced="actionButtons" value="${escapeHtml(advanced.actionButtons || "")}"${disabled}></label>
      <label>action assets <input type="text" data-advanced="actionAssets" value="${escapeHtml(advanced.actionAssets || "")}"${disabled}></label>
      <label>features on <input type="text" data-advanced="features" value="${escapeHtml(advanced.features || "")}"${disabled}></label>
      <label>features off <input type="text" data-advanced="disableFeatures" value="${escapeHtml(advanced.disableFeatures || "")}"${disabled}></label>
    </div>
    <div class="check-row">
      <label class="check"><input type="checkbox" data-run-option="force"${state.form.force ? " checked" : ""}${disabled}>force asset overwrite</label>
      <label class="check"><input type="checkbox" data-run-option="skipProcessing"${state.form.skipProcessing ? " checked" : ""}${disabled}>skip processing</label>
      <label class="check"><input type="checkbox" data-run-option="skipPreflight"${state.form.skipPreflight ? " checked" : ""}${disabled}>skip preflight</label>
      <label class="check"><input type="checkbox" data-run-option="skipGallery"${state.form.skipGallery ? " checked" : ""}${disabled}>skip gallery</label>
    </div>
  </details>`;
}

function renderMain() {
  const options = state.options;
  appNode.innerHTML = `<div class="wizard">
    <section class="panel">
      <div class="panel-header">
        <div>
          <h1>New Variant</h1>
          <p class="muted">Bootstrap-backed variant creation</p>
        </div>
        <button type="button" class="primary" data-build-preview${state.running || state.previewPending ? " disabled" : ""}>${state.previewPending ? "Generating" : "Generate Preview"}</button>
      </div>
      <div class="form-grid">
        <label>scope ${renderSelect("scope", Object.keys(options.notes))}</label>
        <label>tier ${renderSelect("tier", Object.keys(options.tiers))}</label>
        <label>species ${renderSelect("species", Object.keys(options.species))}</label>
        <label>date <input type="date" data-field="date" value="${escapeHtml(state.form.date)}"${state.running || state.previewPending ? " disabled" : ""}></label>
      </div>
      <div class="platforms">${renderPlatformToggles()}</div>
      ${renderDerivedSummary()}
      ${renderAdvancedControls()}
    </section>

    <section class="panel">
      <div class="panel-header">
        <h2>Source Videos</h2>
        <button type="button" data-choose-folder${state.running || state.previewPending ? " disabled" : ""}>Choose Folder</button>
      </div>
      <div class="source-path">${escapeHtml(state.form.sourceFolder || "No source folder selected")}</div>
      <div class="action-grid">${renderActionCards()}</div>
    </section>

    ${renderPreview()}
    ${renderExecution()}
  </div>`;
}

function render() {
  if (!api) {
    appNode.innerHTML = `<pre class="fatal">Devtools preload API is unavailable.</pre>`;
    return;
  }
  if (!state.options) {
    appNode.innerHTML = `<div class="loading">Loading</div>`;
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
  return `[${stage}:${stream}] ${String(event.message || "").trim()}`;
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

  if (field) {
    setField(field, event.target.value);
  } else if (advanced) {
    setAdvancedField(advanced, event.target.value);
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
  if (!window.confirm("Start generating this variant?")) {
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
      pushLog(`[${event.stage}:error] ${event.error}`);
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
