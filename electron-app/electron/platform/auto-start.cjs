// 开机自启控制器，管理自启命令生成、支持性判断、注册表读写与状态缓存。
// 从 main.cjs 提取，依赖通过 createAutoStartController(context) 注入；
// 函数实现与 main.cjs 保持一致，不修改控制流与逻辑。

function createAutoStartController(context) {
  const {
    // Electron 与运行时
    app,
    process,
    // 子进程
    execFile,
    execFileSync,
    // 依赖函数
    sendMenuConfig,
    writeAutoStartPreference,
    // 运行时配置
    petRuntimeConfig,
    // 常量
    WINDOWS_STARTUP_RUN_KEY
  } = context;

  // 开机自启相关状态（原 main.cjs 中的全局变量）
  let autoStartEnabledCache = false;
  let autoStartRefreshInFlight = false;
  let autoStartPreferenceLoaded = false;

  function getAutoStartCommand() {
    return `"${process.execPath}"`;
  }

  function isAutoStartSupported() {
    return process.platform === "win32" && app.isPackaged;
  }

  function canToggleAutoStart() {
    return Boolean(petRuntimeConfig.features?.autoStart) && isAutoStartSupported();
  }

  function readAutoStartEnabledSync() {
    if (!isAutoStartSupported() || !petRuntimeConfig.autoStartRegistryKey) {
      return false;
    }

    try {
      const output = execFileSync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "$item = Get-ItemProperty -Path $args[0] -Name $args[1] -ErrorAction SilentlyContinue; $value = if ($null -eq $item) { $null } else { $item.PSObject.Properties[$args[1]].Value }; if ([string]$value -eq [string]$args[2]) { [Console]::Out.Write('1') } else { [Console]::Out.Write('0') }",
        "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        petRuntimeConfig.autoStartRegistryKey,
        getAutoStartCommand()
      ], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 1000,
        maxBuffer: 64 * 1024
      });
      return output.trim() === "1";
    } catch {
      return false;
    }
  }

  function readAutoStartEnabledAsync(callback) {
    if (!isAutoStartSupported() || !petRuntimeConfig.autoStartRegistryKey) {
      callback(false);
      return;
    }

    execFile("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      "$item = Get-ItemProperty -Path $args[0] -Name $args[1] -ErrorAction SilentlyContinue; $value = if ($null -eq $item) { $null } else { $item.PSObject.Properties[$args[1]].Value }; if ([string]$value -eq [string]$args[2]) { [Console]::Out.Write('1') } else { [Console]::Out.Write('0') }",
      "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
      petRuntimeConfig.autoStartRegistryKey,
      getAutoStartCommand()
    ], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1000,
      maxBuffer: 64 * 1024
    }, (error, stdout) => {
      callback(!error && String(stdout || "").trim() === "1");
    });
  }

  function refreshAutoStartCacheAsync() {
    if (autoStartRefreshInFlight) {
      return;
    }

    autoStartRefreshInFlight = true;
    readAutoStartEnabledAsync((enabled) => {
      if (!autoStartPreferenceLoaded) {
        autoStartEnabledCache = enabled;
        writeAutoStartPreference(enabled);
      }
      autoStartRefreshInFlight = false;
      sendMenuConfig();
    });
  }

  function setAutoStartEnabled(enabled) {
    if (!canToggleAutoStart()) {
      throw new Error("Auto start is not available for this build.");
    }

    if (enabled) {
      execFileSync("reg.exe", [
        "add",
        WINDOWS_STARTUP_RUN_KEY,
        "/v",
        petRuntimeConfig.autoStartRegistryKey,
        "/t",
        "REG_SZ",
        "/d",
        getAutoStartCommand(),
        "/f"
      ], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 1000,
        maxBuffer: 64 * 1024
      });
      return;
    }

    execFileSync("reg.exe", [
      "delete",
      WINDOWS_STARTUP_RUN_KEY,
      "/v",
      petRuntimeConfig.autoStartRegistryKey,
      "/f"
    ], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1000,
      maxBuffer: 64 * 1024
    });
  }

  function buildAutoStartSummary(error = "") {
    return {
      supported: isAutoStartSupported(),
      enabled: autoStartEnabledCache,
      canToggle: canToggleAutoStart(),
      error
    };
  }

  return {
    getAutoStartCommand,
    isAutoStartSupported,
    canToggleAutoStart,
    readAutoStartEnabledSync,
    readAutoStartEnabledAsync,
    refreshAutoStartCacheAsync,
    setAutoStartEnabled,
    buildAutoStartSummary
  };
}

module.exports = { createAutoStartController };
