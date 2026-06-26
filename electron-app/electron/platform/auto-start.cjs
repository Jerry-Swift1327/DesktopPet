// 开机自启平台适配器，管理自启命令生成、支持性判断、注册表读写与运行态。
// 业务偏好状态（autoStartEnabledCache/autoStartPreferenceLoaded）由 preferencesStore 统一管理；
// 运行态 autoStartRefreshInFlight 保留在控制器内。
// 依赖通过 createAutoStartController(context) 注入。

function createAutoStartController(context) {
  const {
    // Electron 与运行时
    app,
    process,
    // 子进程
    execFile,
    execFileSync,
    // 运行时配置
    petRuntimeConfig,
    // 常量
    WINDOWS_STARTUP_RUN_KEY,
    // 委托 preferencesStore 的回调
    isAutoStartPreferenceLoaded,
    setAutoStartEnabled: setAutoStartPreferenceEnabled,
    writeAutoStartPreference,
    sendMenuConfig
  } = context;

  // 运行态：防止 refresh 并发重入
  let autoStartRefreshInFlight = false;

  function getAutoStartCommand() {
    return `"${process.execPath}"`;
  }

  function isAutoStartSupported() {
    return process.platform === "win32" && app.isPackaged;
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
      if (!isAutoStartPreferenceLoaded()) {
        setAutoStartPreferenceEnabled(enabled);
        writeAutoStartPreference(enabled);
      }
      autoStartRefreshInFlight = false;
      sendMenuConfig();
    });
  }

  function setAutoStartEnabled(enabled) {
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

  return {
    getAutoStartCommand,
    isAutoStartSupported,
    readAutoStartEnabledSync,
    readAutoStartEnabledAsync,
    refreshAutoStartCacheAsync,
    setAutoStartEnabled
  };
}

module.exports = { createAutoStartController };
