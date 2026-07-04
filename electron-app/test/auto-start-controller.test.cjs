const test = require("node:test");
const assert = require("node:assert/strict");

const { createAutoStartController } = require("../electron/platform/auto-start.cjs");

function createMockController({
  preferenceLoaded = true,
  execError = null,
  stdout = "1",
  syncError = null,
  syncStdout = "1",
  isPackaged = true,
  platform = "win32",
  execPath = "C:\\Program Files\\Chongban\\Chongban.exe",
  registryKey = "ChongbanDesktopPet-test"
} = {}) {
  const preferenceWrites = [];
  const preferenceSets = [];
  const execFileCalls = [];
  const execFileSyncCalls = [];
  let menuConfigSends = 0;
  const controller = createAutoStartController({
    app: { isPackaged },
    process: { platform, execPath },
    execFile: (file, args, options, callback) => {
      execFileCalls.push({ file, args, options });
      callback(execError, stdout);
    },
    execFileSync: (file, args, options) => {
      execFileSyncCalls.push({ file, args, options });
      if (syncError) {
        throw syncError;
      }
      return syncStdout;
    },
    petRuntimeConfig: { autoStartRegistryKey: registryKey },
    WINDOWS_STARTUP_RUN_KEY: "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    isAutoStartPreferenceLoaded: () => preferenceLoaded,
    setAutoStartEnabled: (enabled) => {
      preferenceSets.push(enabled);
    },
    writeAutoStartPreference: (enabled) => {
      preferenceWrites.push(enabled);
    },
    sendMenuConfig: () => {
      menuConfigSends += 1;
    }
  });

  return {
    controller,
    preferenceWrites,
    preferenceSets,
    getExecFileCalls: () => execFileCalls,
    getExecFileSyncCalls: () => execFileSyncCalls,
    getMenuConfigSends: () => menuConfigSends
  };
}

function assertPowerShellRegistryReadCommand(call, {
  registryKey = "ChongbanDesktopPet-test",
  execPath = "C:\\Program Files\\Chongban\\Chongban.exe"
} = {}) {
  assert.equal(call.file, "powershell.exe");
  assert.deepEqual(call.args.slice(0, 4), ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command"]);
  assert.equal(call.args.length, 5, "registry read arguments must be embedded in the script, not appended after -Command");
  const script = call.args[4];
  assert.equal(script.includes("$args"), false, "PowerShell registry read must not depend on trailing $args");
  assert.ok(script.includes("$registryPath = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';"));
  assert.ok(script.includes(`$registryName = '${registryKey.replace(/'/g, "''")}';`));
  assert.ok(script.includes(`$expectedCommand = '"${execPath.replace(/'/g, "''")}"';`));
}

test("refreshAutoStartCacheAsync syncs registry state even when preference was already loaded", () => {
  const mock = createMockController({ preferenceLoaded: true, stdout: "1" });

  mock.controller.refreshAutoStartCacheAsync();

  assert.deepEqual(mock.preferenceSets, [true]);
  assert.deepEqual(mock.preferenceWrites, [true]);
  assert.equal(mock.getMenuConfigSends(), 1);
});

test("refreshAutoStartCacheAsync does not overwrite preferences when registry read fails", () => {
  const mock = createMockController({
    preferenceLoaded: false,
    execError: new Error("registry read failed"),
    stdout: ""
  });

  mock.controller.refreshAutoStartCacheAsync();

  assert.deepEqual(mock.preferenceSets, []);
  assert.deepEqual(mock.preferenceWrites, []);
  assert.equal(mock.getMenuConfigSends(), 1);
});

test("syncAutoStartPreferenceFromRegistrySync persists registry state before first menu config", () => {
  const mock = createMockController({ syncStdout: "1" });

  const didSync = mock.controller.syncAutoStartPreferenceFromRegistrySync();

  assert.equal(didSync, true);
  assert.deepEqual(mock.preferenceSets, [true]);
  assert.deepEqual(mock.preferenceWrites, [true]);
  assert.equal(mock.getMenuConfigSends(), 0);
});

test("sync registry read embeds PowerShell parameters instead of trailing args", () => {
  const mock = createMockController({ syncStdout: "1" });

  mock.controller.readAutoStartEnabledSync();

  assert.equal(mock.getExecFileSyncCalls().length, 1);
  assertPowerShellRegistryReadCommand(mock.getExecFileSyncCalls()[0]);
});

test("async registry read uses the same self-contained PowerShell command", () => {
  const mock = createMockController({ stdout: "1" });

  mock.controller.refreshAutoStartCacheAsync();

  assert.equal(mock.getExecFileCalls().length, 1);
  assertPowerShellRegistryReadCommand(mock.getExecFileCalls()[0]);
});

test("registry read escapes single quotes in PowerShell literals", () => {
  const execPath = "C:\\Users\\O'Brien\\Chongban.exe";
  const registryKey = "ChongbanDesktopPet-test'value";
  const mock = createMockController({ syncStdout: "1", execPath, registryKey });

  mock.controller.readAutoStartEnabledSync();

  assertPowerShellRegistryReadCommand(mock.getExecFileSyncCalls()[0], { execPath, registryKey });
});

test("syncAutoStartPreferenceFromRegistrySync does not overwrite preferences when registry read fails", () => {
  const mock = createMockController({
    syncError: new Error("registry read failed"),
    syncStdout: ""
  });

  const didSync = mock.controller.syncAutoStartPreferenceFromRegistrySync();

  assert.equal(didSync, false);
  assert.deepEqual(mock.preferenceSets, []);
  assert.deepEqual(mock.preferenceWrites, []);
  assert.equal(mock.getMenuConfigSends(), 0);
});
