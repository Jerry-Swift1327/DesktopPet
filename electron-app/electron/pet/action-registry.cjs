const fs = require("fs");
const path = require("path");

const ACTION_REGISTRY_FILE = path.join(__dirname, "..", "pet-action-registry.json");
const ACTION_KEY_PATTERN = /^[a-z]+(?:[A-Z][a-z]+)*$/;
const PLAYBACK_MODES = new Set(["once", "timed", "continuous"]);
const PROCESSING_PRESETS = new Set(["grounded", "nearSquat", "direction64"]);
const MOTION_MODES = new Set(["stationary", "walk"]);

function clonePlainObject(value) {
  return JSON.parse(JSON.stringify(value));
}

function createStateId(actionKey) {
  if (!ACTION_KEY_PATTERN.test(actionKey)) {
    throw new Error(`动作标识 ${actionKey} 必须是纯英文字母的小驼峰格式，例如 run 或 tailWag。`);
  }
  return `pet${actionKey[0].toUpperCase()}${actionKey.slice(1)}`;
}

function normalizeActionDefinition(actionKey, rawDefinition = {}) {
  const stateId = rawDefinition.stateId === null ? null : String(rawDefinition.stateId || createStateId(actionKey));
  const label = String(rawDefinition.label || "").trim();
  const asset = String(rawDefinition.asset || actionKey);
  const hoverButton = Boolean(rawDefinition.presentation?.hoverButton);
  const playback = {
    mode: rawDefinition.playback?.mode || "once",
    completeTo: rawDefinition.playback?.completeTo || "squat",
    interruptible: rawDefinition.playback?.interruptible !== false
  };
  if (playback.mode === "timed") {
    const durationMinutes = Number(rawDefinition.playback?.durationMinutes);
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) {
      throw new Error(`动作 ${actionKey} 的持续分钟数必须大于 0 且不超过 1440。`);
    }
    playback.durationMinutes = durationMinutes;
  }
  const motion = { mode: rawDefinition.motion?.mode || "stationary" };
  const processing = { preset: rawDefinition.processing?.preset || "grounded" };

  if (!label) throw new Error(`动作 ${actionKey} 的 label 不能为空。`);
  if (!PLAYBACK_MODES.has(playback.mode)) throw new Error(`动作 ${actionKey} 的播放方式无效：${playback.mode}`);
  if (!MOTION_MODES.has(motion.mode)) throw new Error(`动作 ${actionKey} 的移动方式无效：${motion.mode}`);
  if (!PROCESSING_PRESETS.has(processing.preset)) throw new Error(`动作 ${actionKey} 的处理预设无效：${processing.preset}`);
  if (hoverButton && !stateId) throw new Error(`可点击动作 ${actionKey} 必须具有运行时 stateId。`);

  return {
    stateId,
    asset,
    label,
    presentation: { hoverButton },
    playback,
    motion,
    processing,
    ...(rawDefinition.frameSequence ? { frameSequence: clonePlainObject(rawDefinition.frameSequence) } : {}),
    requiredForVariant: Boolean(rawDefinition.requiredForVariant),
    system: Boolean(rawDefinition.system)
  };
}

function validateActionRegistry(rawRegistry) {
  if (!rawRegistry || typeof rawRegistry !== "object" || Array.isArray(rawRegistry)) {
    throw new Error("动作注册表必须是对象。");
  }
  if (rawRegistry.schemaVersion !== 1) {
    throw new Error(`不支持的动作注册表版本：${rawRegistry.schemaVersion}`);
  }
  if (!rawRegistry.actions || typeof rawRegistry.actions !== "object" || Array.isArray(rawRegistry.actions)) {
    throw new Error("动作注册表缺少 actions 对象。");
  }

  const actions = {};
  const stateIds = new Set();
  const assets = new Set();
  for (const [actionKey, rawDefinition] of Object.entries(rawRegistry.actions)) {
    if (!ACTION_KEY_PATTERN.test(actionKey)) {
      throw new Error(`动作标识 ${actionKey} 必须是纯英文字母的小驼峰格式。`);
    }
    const definition = normalizeActionDefinition(actionKey, rawDefinition);
    if (definition.stateId && stateIds.has(definition.stateId)) {
      throw new Error(`动作运行时 stateId 重复：${definition.stateId}`);
    }
    if (assets.has(definition.asset)) {
      throw new Error(`动作资源标识重复：${definition.asset}`);
    }
    if (definition.stateId) stateIds.add(definition.stateId);
    assets.add(definition.asset);
    actions[actionKey] = definition;
  }
  for (const action of Object.values(actions)) {
    if (!Object.prototype.hasOwnProperty.call(actions, action.playback.completeTo)) {
      throw new Error(`动作完成状态未注册：${action.playback.completeTo}`);
    }
  }
  return { schemaVersion: 1, actions };
}

function readActionRegistry(registryFile = ACTION_REGISTRY_FILE) {
  return validateActionRegistry(JSON.parse(fs.readFileSync(registryFile, "utf8")));
}

function writeJsonAtomically(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(tempPath, filePath);
  } finally {
    if (fs.existsSync(tempPath)) fs.rmSync(tempPath, { force: true });
  }
}

function buildActionRegistrationPreview(payload = {}, options = {}) {
  const registryFile = options.registryFile || ACTION_REGISTRY_FILE;
  const registry = readActionRegistry(registryFile);
  const actionKey = String(payload.actionKey || "").trim();
  if (!ACTION_KEY_PATTERN.test(actionKey)) {
    throw new Error("动作标识必须是纯英文字母的小驼峰格式，例如 run 或 tailWag。");
  }
  if (actionKey.startsWith("pet")) {
    throw new Error("动作标识不能使用 pet 前缀，该前缀由系统生成运行时 stateId。 ");
  }
  if (Object.prototype.hasOwnProperty.call(registry.actions, actionKey)) {
    throw new Error(`动作 ${actionKey} 已经注册。`);
  }
  const definition = normalizeActionDefinition(actionKey, {
    stateId: createStateId(actionKey),
    asset: actionKey,
    label: payload.label,
    presentation: { hoverButton: true },
    playback: {
      mode: payload.playbackMode || "once",
      durationMinutes: payload.durationMinutes,
      completeTo: "squat",
      interruptible: true
    },
    motion: { mode: "stationary" },
    processing: { preset: "grounded" },
    requiredForVariant: false,
    system: false
  });
  return {
    kind: "registerAction",
    registryFile,
    actionKey,
    definition,
    registryAfterApply: {
      schemaVersion: registry.schemaVersion,
      actions: { ...registry.actions, [actionKey]: definition }
    }
  };
}

function applyActionRegistration(preview) {
  if (!preview || preview.kind !== "registerAction") {
    throw new Error("无效的动作注册预览。");
  }
  const current = readActionRegistry(preview.registryFile);
  if (Object.prototype.hasOwnProperty.call(current.actions, preview.actionKey)) {
    throw new Error(`动作 ${preview.actionKey} 已经注册，预览已过期。`);
  }
  writeJsonAtomically(preview.registryFile, {
    schemaVersion: current.schemaVersion,
    actions: { ...current.actions, [preview.actionKey]: preview.definition }
  });
  return { actionKey: preview.actionKey, stateId: preview.definition.stateId, registered: true };
}

module.exports = {
  ACTION_REGISTRY_FILE,
  ACTION_KEY_PATTERN,
  PLAYBACK_MODES,
  createStateId,
  normalizeActionDefinition,
  validateActionRegistry,
  readActionRegistry,
  buildActionRegistrationPreview,
  applyActionRegistration
};
