const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { listVariantSummaries } = require("../../scripts/variant-cli.cjs");

const CHANNELS = Object.freeze(["release", "installer"]);
const BUILD_SCRIPTS = Object.freeze({
  release: "build-electron-win.ps1",
  installer: "build-installer-win.ps1"
});

function emit(hooks, name, payload) {
  if (typeof hooks?.[name] !== "function") return;
  try {
    hooks[name](payload);
  } catch {
    // Observers must not change process behavior.
  }
}

function createRuntimeBuildWorkflow(options = {}) {
  const appRoot = options.appRoot || path.resolve(__dirname, "..", "..");
  const platform = options.platform || process.platform;
  const spawn = options.spawn || childProcess.spawn;
  const execFile = options.execFile || childProcess.execFile;
  const environment = options.environment || process.env;
  const readVariants = options.listVariants || (() => listVariantSummaries());
  const fileSystem = options.fs || fs;
  let runtimeChild = null;
  let buildChild = null;
  let runtimeState = { status: "idle", pid: null, variant: null, channel: null, exitCode: null };
  let buildState = { status: "idle", pid: null, variant: null, channel: null, exitCode: null };
  let lastSuccessfulBuild = null;

  function resolveTarget(payload = {}, { windowsRequired = false } = {}) {
    const variant = String(payload.variant || "");
    const channel = String(payload.channel || "");
    const summary = readVariants().find((item) => item.id === variant);
    if (!summary) throw new Error(`未知宠物变体：${variant || "未选择"}`);
    if (!CHANNELS.includes(channel)) throw new Error(`未知宠物渠道：${channel || "未选择"}`);
    if (windowsRequired && platform !== "win32") throw new Error("Windows 打包只能在 Windows 上执行。");
    if (windowsRequired && !summary.platforms.includes("win32")) {
      throw new Error(`宠物变体 ${variant} 不支持 Windows 打包。`);
    }
    return { variant, channel, summary };
  }

  function getCapabilities() {
    return {
      platform,
      channels: CHANNELS.slice(),
      runtime: { canStop: true },
      build: { canCancel: false, available: platform === "win32" }
    };
  }

  function getStatus() {
    return {
      runtime: { ...runtimeState },
      build: { ...buildState },
      canOpenBuildOutput: Boolean(lastSuccessfulBuild)
    };
  }

  function buildRuntimePlan(payload) {
    const target = resolveTarget(payload);
    if (platform === "win32") {
      return {
        ...target,
        command: environment.ComSpec || environment.COMSPEC || "cmd.exe",
        args: ["/d", "/s", "/c", "npm.cmd start"],
        displayCommand: "npm.cmd start"
      };
    }
    return { ...target, command: "npm", args: ["start"], displayCommand: "npm start" };
  }

  function buildWindowsPlan(payload) {
    const target = resolveTarget(payload, { windowsRequired: true });
    const outputSegments = target.summary.deliveryPathSegments || [target.summary.scope, target.variant];
    const outputDir = path.join(appRoot, "deliverables", ...outputSegments, target.channel);
    const script = path.join(appRoot, BUILD_SCRIPTS[target.channel]);
    return {
      ...target,
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-PetVariant", target.variant],
      displayCommand: `powershell -ExecutionPolicy Bypass -File ${BUILD_SCRIPTS[target.channel]} -PetVariant ${target.variant}`,
      outputDir
    };
  }

  function connectLogs(child, kind, hooks) {
    for (const stream of ["stdout", "stderr"]) {
      child[stream]?.on("data", (chunk) => emit(hooks, "onLog", {
        kind,
        stream,
        message: chunk.toString()
      }));
    }
  }

  function startRuntime(payload, hooks = {}) {
    if (runtimeChild) throw new Error("已有本地宠物正在运行。");
    const plan = buildRuntimePlan(payload);
    runtimeState = { status: "starting", pid: null, variant: plan.variant, channel: plan.channel, exitCode: null };
    emit(hooks, "onStatus", { kind: "runtime", ...runtimeState });
    emit(hooks, "onLog", { kind: "runtime", stream: "info", message: `$ ${plan.displayCommand}` });

    let child;
    try {
      child = spawn(plan.command, plan.args, {
        cwd: appRoot,
        env: { ...environment, PET_VARIANT: plan.variant, PET_CHANNEL: plan.channel },
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch (error) {
      runtimeState = { ...runtimeState, status: "failed" };
      emit(hooks, "onStatus", { kind: "runtime", ...runtimeState, error: error.message });
      throw error;
    }

    runtimeChild = child;
    connectLogs(child, "runtime", hooks);
    return new Promise((resolve, reject) => {
      let startupSettled = false;
      child.once("spawn", () => {
        startupSettled = true;
        runtimeState = { ...runtimeState, status: "running", pid: child.pid || null };
        emit(hooks, "onStatus", { kind: "runtime", ...runtimeState });
        resolve({ ...runtimeState });
      });
      child.once("error", (error) => {
        runtimeChild = null;
        runtimeState = { ...runtimeState, status: "failed", pid: null };
        emit(hooks, "onStatus", { kind: "runtime", ...runtimeState, error: error.message });
        if (!startupSettled) reject(error);
      });
      child.once("exit", (code) => {
        runtimeChild = null;
        runtimeState = { ...runtimeState, status: "exited", pid: null, exitCode: code };
        emit(hooks, "onStatus", { kind: "runtime", ...runtimeState });
      });
    });
  }

  function terminateRuntimeChild(child) {
    if (typeof options.terminateProcessTree === "function") {
      return Promise.resolve(options.terminateProcessTree(child));
    }
    if (platform !== "win32") {
      child.kill("SIGTERM");
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      execFile("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true }, (error) => {
        if (error && runtimeChild === child) reject(error);
        else resolve();
      });
    });
  }

  async function stopRuntime(hooks = {}) {
    const child = runtimeChild;
    if (!child) return { ...runtimeState };
    runtimeState = { ...runtimeState, status: "stopping" };
    emit(hooks, "onStatus", { kind: "runtime", ...runtimeState });
    emit(hooks, "onLog", { kind: "runtime", stream: "info", message: "正在停止本地宠物进程..." });
    await terminateRuntimeChild(child);
    return { ...runtimeState };
  }

  function runWindowsBuild(payload, hooks = {}) {
    if (buildChild) throw new Error("已有 Windows 打包任务正在执行。");
    const plan = buildWindowsPlan(payload);
    lastSuccessfulBuild = null;
    buildState = { status: "running", pid: null, variant: plan.variant, channel: plan.channel, exitCode: null };
    emit(hooks, "onStatus", { kind: "build", ...buildState });
    emit(hooks, "onLog", { kind: "build", stream: "info", message: `$ ${plan.displayCommand}` });

    return new Promise((resolve, reject) => {
      let settled = false;
      let child;
      try {
        child = spawn(plan.command, plan.args, {
          cwd: appRoot,
          env: { ...environment },
          shell: false,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"]
        });
      } catch (error) {
        buildState = { ...buildState, status: "failed" };
        emit(hooks, "onStatus", { kind: "build", ...buildState, error: error.message });
        reject(error);
        return;
      }
      buildChild = child;
      buildState = { ...buildState, pid: child.pid || null };
      connectLogs(child, "build", hooks);
      child.once("error", (error) => {
        if (settled) return;
        settled = true;
        buildChild = null;
        buildState = { ...buildState, status: "failed", pid: null };
        emit(hooks, "onStatus", { kind: "build", ...buildState, error: error.message });
        reject(error);
      });
      child.once("exit", (code) => {
        if (settled) return;
        settled = true;
        buildChild = null;
        if (code === 0) {
          lastSuccessfulBuild = { variant: plan.variant, channel: plan.channel, outputDir: plan.outputDir };
          buildState = { ...buildState, status: "succeeded", pid: null, exitCode: code };
          emit(hooks, "onStatus", { kind: "build", ...buildState, canOpenBuildOutput: true });
          resolve({ ...lastSuccessfulBuild, status: "succeeded" });
          return;
        }
        const error = new Error(`Windows 打包失败，退出码：${code}`);
        buildState = { ...buildState, status: "failed", pid: null, exitCode: code };
        emit(hooks, "onStatus", { kind: "build", ...buildState, error: error.message });
        reject(error);
      });
    });
  }

  function getLastSuccessfulBuildOutput() {
    if (!lastSuccessfulBuild) throw new Error("当前没有可打开的打包产物目录。");
    const resolvedDeliverables = path.resolve(appRoot, "deliverables");
    const resolvedOutput = path.resolve(lastSuccessfulBuild.outputDir);
    if (!resolvedOutput.startsWith(`${resolvedDeliverables}${path.sep}`)) {
      throw new Error("打包产物目录不在允许范围内。");
    }
    if (!fileSystem.existsSync(resolvedOutput) || !fileSystem.statSync(resolvedOutput).isDirectory()) {
      throw new Error("打包产物目录不存在。");
    }
    return resolvedOutput;
  }

  return {
    getCapabilities,
    getStatus,
    buildRuntimePlan,
    buildWindowsPlan,
    startRuntime,
    stopRuntime,
    runWindowsBuild,
    getLastSuccessfulBuildOutput
  };
}

module.exports = { CHANNELS, BUILD_SCRIPTS, createRuntimeBuildWorkflow };
