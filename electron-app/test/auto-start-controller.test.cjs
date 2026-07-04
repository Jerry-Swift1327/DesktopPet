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
  platform = "win32"
} = {}) {
  const preferenceWrites = [];
  const preferenceSets = [];
  let menuConfigSends = 0;
  const controller = createAutoStartController({
    app: { isPackaged },
    process: { platform, execPath: "C:\\Program Files\\Chongban\\Chongban.exe" },
    execFile: (_file, _args, _options, callback) => {
      callback(execError, stdout);
    },
    execFileSync: () => {
      if (syncError) {
        throw syncError;
      }
      return syncStdout;
    },
    petRuntimeConfig: { autoStartRegistryKey: "ChongbanDesktopPet-test" },
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
    getMenuConfigSends: () => menuConfigSends
  };
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
