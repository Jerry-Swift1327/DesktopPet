const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  buildBootstrapPlan,
  applyBootstrapPlanAsync,
  buildReplaceActionPlan,
  applyReplaceActionPlanAsync,
  buildMetadataEditPreview: buildCliMetadataEditPreview,
  applyMetadataEdit: applyCliMetadataEdit,
  buildDeleteVariantPreview: buildCliDeleteVariantPreview,
  applyDeleteVariant: applyCliDeleteVariant,
  listVariantSummaries,
  getVariantDetails: getCliVariantDetails,
  resolveSourceActionName
} = require("../../scripts/variant-cli.cjs");
const {
  getActionPool,
  getFeaturePool,
  getNotesPool,
  getSpeciesProfiles,
  getTierProfiles
} = require("../../electron/pet-catalog.cjs");

const appRoot = path.resolve(__dirname, "..", "..");
const projectRoot = path.dirname(appRoot);
const defaultAnimationsRoot = path.join(projectRoot, "assets", "animations");
const defaultMetadataFile = path.join(appRoot, "electron", "pet-variant-metadata.json");
const defaultStagingRoot = path.join(appRoot, ".devtools-staging");
const defaultGalleryRoot = path.join(appRoot, ".variant-gallery");
const defaultUserDataRoot = path.join(appRoot, ".user-data");
const defaultRuntimeAssetsRoot = path.join(appRoot, ".runtime-assets");

function createPreviewId() {
  return `preview-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function asArray(value) {
  if (value === undefined || value === null || value === "") {
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

function getCatalogOptions() {
  return {
    species: getSpeciesProfiles(),
    tiers: getTierProfiles(),
    actions: getActionPool(),
    features: getFeaturePool(),
    notes: getNotesPool()
  };
}

function getRequiredActions(tier) {
  const tiers = getTierProfiles();
  const profile = tiers[tier];
  if (!profile) {
    throw new Error(`未知套餐 tier：${tier}`);
  }
  return Array.from(new Set((profile.actionButtons || []).concat(profile.actionAssets || [])));
}

function getEffectiveRequiredActions(formState) {
  const tiers = getTierProfiles();
  const profile = tiers[formState.tier];
  if (!profile) {
    throw new Error(`未知套餐 tier：${formState.tier}`);
  }

  const buttons = formState.advanced.actionButtons.length > 0
    ? formState.advanced.actionButtons
    : profile.actionButtons || [];
  const assets = formState.advanced.actionAssets.length > 0
    ? formState.advanced.actionAssets
    : profile.actionAssets || [];
  return Array.from(new Set(buttons.concat(assets)));
}

function assertKnownFormValues(formState) {
  const options = getCatalogOptions();
  if (!options.species[formState.species]) {
    throw new Error(`未知物种 species：${formState.species}`);
  }
  if (!options.tiers[formState.tier]) {
    throw new Error(`未知套餐 tier：${formState.tier}`);
  }
  if (!options.notes[formState.scope]) {
    throw new Error(`未知范围 scope：${formState.scope}`);
  }
}

function scanSourceFolder(sourceDir, requiredActions) {
  const resolvedSourceDir = path.resolve(sourceDir || "");
  if (!sourceDir || !fs.existsSync(resolvedSourceDir) || !fs.statSync(resolvedSourceDir).isDirectory()) {
    throw new Error(`未找到源视频文件夹：${resolvedSourceDir}`);
  }

  const requiredSet = new Set(requiredActions);
  const matches = {};
  const duplicateActions = new Set();
  const warnings = [];

  const entries = fs
    .readdirSync(resolvedSourceDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (!entry.isFile() || !/\.mp4$/i.test(entry.name)) {
      continue;
    }
    const action = resolveSourceActionName(entry.name);
    if (!action) {
      warnings.push(`无法识别的源视频：${entry.name}`);
      continue;
    }
    if (!requiredSet.has(action)) {
      warnings.push(`当前套餐不需要这个源视频：${entry.name}`);
      continue;
    }
    if (matches[action]) {
      duplicateActions.add(action);
      warnings.push(`动作 ${action} 匹配到多个源视频，请手动选择一个。`);
      delete matches[action];
      continue;
    }
    if (!duplicateActions.has(action)) {
      matches[action] = path.join(resolvedSourceDir, entry.name);
    }
  }

  return { matches, warnings };
}

function readActionVideoPath(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  return value.path || null;
}

function resolveActionVideos(formState, requiredActions) {
  const selections = {};
  const warnings = [];

  if (formState.sourceFolder) {
    const scanned = scanSourceFolder(formState.sourceFolder, requiredActions);
    Object.assign(selections, scanned.matches);
    warnings.push(...scanned.warnings);
  }

  const manualVideos = formState.actionVideos || {};
  for (const action of requiredActions) {
    const manualPath = readActionVideoPath(manualVideos[action]);
    if (manualPath) {
      selections[action] = manualPath;
    }
  }

  for (const action of requiredActions) {
    const selectedPath = selections[action];
    if (!selectedPath) {
      throw new Error(`缺少动作 ${action} 的源视频`);
    }
    if (!/\.mp4$/i.test(selectedPath)) {
      throw new Error(`动作 ${action} 的源视频必须是 .mp4 文件：${selectedPath}`);
    }
    if (!fs.existsSync(selectedPath) || !fs.statSync(selectedPath).isFile()) {
      throw new Error(`未找到动作 ${action} 的源视频：${selectedPath}`);
    }
  }

  return { selections, warnings };
}

function normalizeFormState(formState = {}) {
  const advanced = formState.advanced || {};
  const hasFeatureOverride = Object.prototype.hasOwnProperty.call(advanced, "features")
    || Object.prototype.hasOwnProperty.call(formState, "features")
    || Object.prototype.hasOwnProperty.call(advanced, "disableFeatures")
    || Object.prototype.hasOwnProperty.call(formState, "disableFeatures");
  const tier = formState.tier || "basic";
  const scope = formState.scope || "custom";
  const species = formState.species || "cat";
  const date = formState.date || new Date().toISOString().slice(0, 10);
  const platforms = asArray(formState.platforms && formState.platforms.length ? formState.platforms : ["win32"]);

  return {
    scope,
    tier,
    species,
    date,
    platforms,
    sourceFolder: formState.sourceFolder || null,
    actionVideos: formState.actionVideos || {},
    autoSelectLoop: Boolean(formState.autoSelectLoop),
    loopModes: formState.loopModes && typeof formState.loopModes === "object" ? formState.loopModes : {},
    force: Boolean(formState.force || advanced.force),
    skipProcessing: Boolean(formState.skipProcessing),
    skipPreflight: Boolean(formState.skipPreflight),
    skipGallery: Boolean(formState.skipGallery),
    advanced: {
      id: advanced.id || formState.id || null,
      assetPrefix: advanced.assetPrefix || formState.assetPrefix || null,
      scale: advanced.scale || formState.scale || null,
      version: advanced.version || formState.version || null,
      actionButtons: asArray(advanced.actionButtons || formState.actionButtons),
      actionAssets: asArray(advanced.actionAssets || formState.actionAssets),
      features: asArray(advanced.features || formState.features),
      disableFeatures: asArray(advanced.disableFeatures || formState.disableFeatures),
      hasFeatureOverride
    }
  };
}

function buildBootstrapArgs(formState, stagingSource) {
  const args = {
    scope: formState.scope,
    tier: formState.tier,
    species: formState.species,
    date: formState.date,
    platforms: formState.platforms,
    source: stagingSource
  };

  if (formState.advanced.id) {
    args.id = formState.advanced.id;
  }
  if (formState.advanced.assetPrefix) {
    args["asset-prefix"] = formState.advanced.assetPrefix;
  }
  if (formState.advanced.scale) {
    args.scale = formState.advanced.scale;
  }
  if (formState.advanced.version) {
    args.version = formState.advanced.version;
  }
  const hasActionOverride = formState.advanced.actionButtons.length > 0 || formState.advanced.actionAssets.length > 0;
  if (hasActionOverride) {
    args["action-buttons"] = formState.advanced.actionButtons;
    args["action-assets"] = formState.advanced.actionAssets;
  }
  const hasFeatureOverride = formState.advanced.hasFeatureOverride
    || formState.advanced.features.length > 0
    || formState.advanced.disableFeatures.length > 0;
  if (hasFeatureOverride) {
    args.features = formState.advanced.features;
    args["disable-features"] = formState.advanced.disableFeatures;
  }
  if (!formState.autoSelectLoop) {
    args["use-full-range"] = true;
  }
  if (formState.loopModes && Object.keys(formState.loopModes).length > 0) {
    args.loopModes = formState.loopModes;
  }

  return args;
}

function stageActionVideos(stagingSource, selections, requiredActions) {
  fs.mkdirSync(stagingSource, { recursive: true });
  const staged = {};
  for (const action of requiredActions) {
    const target = path.join(stagingSource, `${action}.mp4`);
    fs.copyFileSync(selections[action], target);
    staged[action] = target;
  }
  return staged;
}

function serializePreview(previewId, plan, stagedVideos, warnings, stagingSource) {
  return {
    previewId,
    sourceDir: plan.sourceDir,
    stagingSource,
    draft: plan.draft,
    copied: plan.copied,
    processCommands: plan.processCommands,
    preflightCommands: plan.preflightCommands,
    warnings: (plan.warnings || []).concat(warnings || []),
    metadataAfterApply: plan.metadataAfterApply,
    stagedVideos
  };
}

function emitHook(hooks, name, event) {
  const callback = hooks[name];
  if (typeof callback !== "function") {
    return;
  }
  try {
    callback(event);
  } catch {
    // Devtools observers are best-effort and must not change apply behavior.
  }
}

function createVariantWorkflow(options = {}) {
  const metadataFile = options.metadataFile || defaultMetadataFile;
  const animationsRoot = options.animationsRoot || defaultAnimationsRoot;
  const stagingRoot = options.stagingRoot || defaultStagingRoot;
  const galleryRoot = options.galleryRoot || defaultGalleryRoot;
  const userDataRoot = options.userDataRoot || defaultUserDataRoot;
  const runtimeAssetsRoot = options.runtimeAssetsRoot || defaultRuntimeAssetsRoot;
  const idFactory = options.idFactory || createPreviewId;
  const plans = new Map();

  function listVariants() {
    return listVariantSummaries({ metadataFile });
  }

  function getVariantDetails(id) {
    return getCliVariantDetails(id, { metadataFile, animationsRoot });
  }

  function storePreview(kind, value) {
    const previewId = idFactory();
    const preview = { ...value, previewId };
    plans.set(previewId, { kind, preview, plan: value });
    return preview;
  }

  function buildNewVariantPreview(rawFormState = {}) {
    const formState = normalizeFormState(rawFormState);
    assertKnownFormValues(formState);
    const requiredActions = getEffectiveRequiredActions(formState);
    const { selections, warnings } = resolveActionVideos(formState, requiredActions);
    const previewId = idFactory();
    const stagingSource = path.join(stagingRoot, previewId, "source");
    const stagedVideos = stageActionVideos(stagingSource, selections, requiredActions);
    const plan = buildBootstrapPlan(
      buildBootstrapArgs(formState, stagingSource),
      { metadataFile, animationsRoot }
    );

    plans.set(previewId, {
      previewId,
      formState,
      plan,
      stagedVideos,
      stagingSource,
      galleryRoot
    });

    return serializePreview(previewId, plan, stagedVideos, warnings, stagingSource);
  }

  async function runNewVariant(previewId, hooks = {}) {
    const entry = plans.get(previewId);
    if (!entry) {
      throw new Error(`未找到预览方案：${previewId}`);
    }
    emitHook(hooks, "onStage", { stage: "prepareStaging", status: "running" });
    try {
      for (const [action, stagedPath] of Object.entries(entry.stagedVideos)) {
        if (!fs.existsSync(stagedPath)) {
          throw new Error(`未找到动作 ${action} 的暂存源视频：${stagedPath}`);
        }
      }
      emitHook(hooks, "onStage", { stage: "prepareStaging", status: "done" });
    } catch (error) {
      emitHook(hooks, "onStage", { stage: "prepareStaging", status: "failed", error: error.message });
      throw error;
    }
    return applyBootstrapPlanAsync(entry.plan, {
      force: entry.formState.force,
      skipProcessing: entry.formState.skipProcessing,
      skipPreflight: entry.formState.skipPreflight,
      skipGallery: entry.formState.skipGallery,
      galleryRoot,
      runCommand: options.runCommand,
      onStage: (event) => {
        emitHook(hooks, "onStage", event);
      },
      onLog: (event) => {
        emitHook(hooks, "onLog", event);
      }
    });
  }

  function buildReplaceActionPreview(payload = {}) {
    return storePreview("replaceAction", buildReplaceActionPlan(payload, { metadataFile, animationsRoot }));
  }

  async function runReplaceAction(previewId, hooks = {}) {
    const entry = plans.get(previewId);
    if (!entry || entry.kind !== "replaceAction") {
      throw new Error(`未找到替换动作预览方案：${previewId}`);
    }
    emitHook(hooks, "onStage", { stage: "replaceAction", status: "running" });
    try {
      const result = await applyReplaceActionPlanAsync(entry.plan, {
        runCommand: options.runCommand,
        onLog: (event) => emitHook(hooks, "onLog", event)
      });
      emitHook(hooks, "onStage", { stage: "replaceAction", status: "done" });
      return result;
    } catch (error) {
      emitHook(hooks, "onStage", { stage: "replaceAction", status: "failed", error: error.message });
      throw error;
    }
  }

  function buildMetadataEditPreview(payload = {}) {
    return storePreview("metadataEdit", buildCliMetadataEditPreview(payload, { metadataFile, animationsRoot }));
  }

  async function applyMetadataEdit(previewId, hooks = {}) {
    const entry = plans.get(previewId);
    if (!entry || entry.kind !== "metadataEdit") {
      throw new Error(`未找到元数据编辑预览方案：${previewId}`);
    }
    emitHook(hooks, "onStage", { stage: "writeMetadataEdit", status: "running" });
    try {
      const result = applyCliMetadataEdit(entry.preview, { metadataFile });
      emitHook(hooks, "onStage", { stage: "writeMetadataEdit", status: "done" });
      return result;
    } catch (error) {
      emitHook(hooks, "onStage", { stage: "writeMetadataEdit", status: "failed", error: error.message });
      throw error;
    }
  }

  function buildDeleteVariantPreview(id) {
    return storePreview("deleteVariant", buildCliDeleteVariantPreview(id, {
      metadataFile,
      animationsRoot,
      userDataRoot,
      runtimeAssetsRoot
    }));
  }

  async function deleteTestVariant(previewId, hooks = {}) {
    const entry = plans.get(previewId);
    if (!entry || entry.kind !== "deleteVariant") {
      throw new Error(`未找到删除变体预览方案：${previewId}`);
    }
    emitHook(hooks, "onStage", { stage: "deleteVariantResources", status: "running" });
    try {
      const result = applyCliDeleteVariant(entry.preview, {
        metadataFile,
        animationsRoot,
        userDataRoot,
        runtimeAssetsRoot
      });
      emitHook(hooks, "onStage", { stage: "deleteVariantResources", status: "done" });
      return result;
    } catch (error) {
      emitHook(hooks, "onStage", { stage: "deleteVariantResources", status: "failed", error: error.message });
      throw error;
    }
  }

  return {
    getCatalogOptions,
    listVariants,
    getVariantDetails,
    buildNewVariantPreview,
    runNewVariant,
    buildReplaceActionPreview,
    runReplaceAction,
    buildMetadataEditPreview,
    applyMetadataEdit,
    buildDeleteVariantPreview,
    deleteTestVariant
  };
}

module.exports = {
  createVariantWorkflow,
  getCatalogOptions,
  getRequiredActions,
  normalizeFormState,
  scanSourceFolder
};
