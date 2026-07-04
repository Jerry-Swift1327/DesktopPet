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

  function toPowerShellStringLiteral(value) {
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  function buildReadAutoStartRegistryScript() {
    const registryPath = toPowerShellStringLiteral("HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run");
    const registryName = toPowerShellStringLiteral(petRuntimeConfig.autoStartRegistryKey);
    const expectedCommand = toPowerShellStringLiteral(getAutoStartCommand());
    return [
      `$registryPath = ${registryPath};`,
      `$registryName = ${registryName};`,
      `$expectedCommand = ${expectedCommand};`,
      "$item = Get-ItemProperty -Path $registryPath -Name $registryName -ErrorAction SilentlyContinue;",
      "$value = if ($null -eq $item) { $null } else { $item.PSObject.Properties[$registryName].Value };",
      "if ([string]$value -eq [string]$expectedCommand) { [Console]::Out.Write('1') } else { [Console]::Out.Write('0') }"
    ].join(" ");
  }

  function getReadAutoStartRegistryArgs() {
    return [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      buildReadAutoStartRegistryScript()
    ];
  }

  function isAutoStartSupported() {
    return process.platform === "win32" && app.isPackaged;
  }

  function readAutoStartRegistryStateSync() {
    if (!isAutoStartSupported() || !petRuntimeConfig.autoStartRegistryKey) {
      return { enabled: false, error: null, supported: false };
    }

    try {
      const output = execFileSync("powershell.exe", getReadAutoStartRegistryArgs(), {
        encoding: "utf8",
        windowsHide: true,
        timeout: 1000,
        maxBuffer: 64 * 1024
      });
      return { enabled: output.trim() === "1", error: null, supported: true };
    } catch (error) {
      return { enabled: false, error, supported: true };
    }
  }

  function readAutoStartEnabledSync() {
    return readAutoStartRegistryStateSync().enabled;
  }

  function readAutoStartEnabledAsync(callback) {
    if (!isAutoStartSupported() || !petRuntimeConfig.autoStartRegistryKey) {
      callback(false, null, { supported: false });
      return;
    }

    execFile("powershell.exe", getReadAutoStartRegistryArgs(), {
      encoding: "utf8",
      windowsHide: true,
      timeout: 1000,
      maxBuffer: 64 * 1024
    }, (error, stdout) => {
      if (error) {
        callback(false, error, { supported: true });
        return;
      }
      callback(String(stdout || "").trim() === "1", null, { supported: true });
    });
  }

  function refreshAutoStartCacheAsync() {
    if (autoStartRefreshInFlight) {
      return;
    }

    autoStartRefreshInFlight = true;
    readAutoStartEnabledAsync((enabled, error, details = {}) => {
      const shouldSyncPreference = !error && (details.supported || !isAutoStartPreferenceLoaded());
      if (shouldSyncPreference) {
        setAutoStartPreferenceEnabled(enabled);
        writeAutoStartPreference(enabled);
      }
      autoStartRefreshInFlight = false;
      sendMenuConfig();
    });
  }

  function syncAutoStartPreferenceFromRegistrySync() {
    const { enabled, error, supported } = readAutoStartRegistryStateSync();
    if (!supported || error) {
      return false;
    }

    setAutoStartPreferenceEnabled(enabled);
    writeAutoStartPreference(enabled);
    return true;
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
    syncAutoStartPreferenceFromRegistrySync,
    setAutoStartEnabled
  };
}

module.exports = { createAutoStartController };
