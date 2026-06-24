const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

const preloadSource = fs.readFileSync(path.join(ROOT, "electron", "preload.cjs"), "utf8");
const mainSource = fs.readFileSync(path.join(ROOT, "electron", "main.cjs"), "utf8");

const rendererSources = [
  fs.readFileSync(path.join(ROOT, "static", "renderer.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "static", "renderer", "pet-window.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "static", "renderer", "menu-window.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "static", "renderer", "hover-window.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "static", "renderer", "bubble-window.js"), "utf8"),
  fs.readFileSync(path.join(ROOT, "static", "renderer", "customization-window.js"), "utf8")
].join("\n");

const controllerSources = [
  fs.readFileSync(path.join(ROOT, "electron", "behavior", "eye-tracking-controller.cjs"), "utf8"),
  fs.readFileSync(path.join(ROOT, "electron", "behavior", "window-roam-controller.cjs"), "utf8"),
  fs.readFileSync(path.join(ROOT, "electron", "windows", "bubble-controller.cjs"), "utf8"),
  fs.readFileSync(path.join(ROOT, "electron", "windows", "hover-controller.cjs"), "utf8"),
  fs.readFileSync(path.join(ROOT, "electron", "windows", "menu-controller.cjs"), "utf8")
].join("\n");

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("preload invoke channel 在 main.cjs 中有对应 ipcMain.handle", () => {
  const invokeChannels = [...preloadSource.matchAll(/ipcRenderer\.invoke\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const expected = [
    "pet:get-config",
    "pet:set-auto-start",
    "pet:toggle-auto-start",
    "pet:set-window-roam",
    "pet:set-eye-tracking",
    "pet:switch-variant",
    "pet:advance-walk-step",
    "pet:get-contact-qrcode"
  ];
  assert.deepEqual([...new Set(invokeChannels)].sort(), [...expected].sort(),
    `preload invoke channel 提取应匹配 ${expected.length} 个`);

  for (const channel of expected) {
    const pattern = new RegExp(`ipcMain\\.handle\\(\\s*['"]${escapeRegex(channel)}['"]`);
    assert.match(mainSource, pattern, `main.cjs 应为 ${channel} 注册 ipcMain.handle`);
  }
});

test("preload send channel 在 main.cjs 中有对应 ipcMain.on", () => {
  const sendChannels = [...preloadSource.matchAll(/ipcRenderer\.send\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const expected = [
    "pet:show-menu", "pet:resize-menu", "pet:resize-bubble",
    "pet:menu-panel-enter", "pet:menu-panel-leave",
    "pet:hover-enter", "pet:hover-leave", "pet:hover-panel-enter", "pet:hover-panel-leave",
    "pet:hover-action", "pet:rendered-frame", "pet:set-state",
    "pet:wake-sleeping-pet", "pet:complete-one-shot", "pet:renderer-diagnostic",
    "pet:reset-position", "pet:reset-scale", "pet:hide-menu",
    "pet:show", "pet:hide", "pet:quit",
    "pet:show-customization", "pet:hide-customization",
    "pet:drag-start", "pet:drag-end", "pet:adjust-scale"
  ];
  assert.deepEqual([...new Set(sendChannels)].sort(), [...expected].sort(),
    `preload send channel 提取应匹配 ${expected.length} 个`);

  for (const channel of expected) {
    const pattern = new RegExp(`ipcMain\\.on\\(\\s*['"]${escapeRegex(channel)}['"]`);
    assert.match(mainSource, pattern, `main.cjs 应为 ${channel} 注册 ipcMain.on`);
  }
});

test("preload onXxx 监听方法返回 unsubscribe 函数", () => {
  const listeners = [
    { method: "onStateChanged", channel: "pet:state-changed" },
    { method: "onDirectionChanged", channel: "pet:direction-changed" },
    { method: "onDragStateChanged", channel: "pet:drag-state-changed" },
    { method: "onPauseStateChanged", channel: "pet:pause-state-changed" },
    { method: "onEyeTrackingLook", channel: "pet:eye-tracking-look" },
    { method: "onScaleChanged", channel: "pet:scale-changed" },
    { method: "onStatsChanged", channel: "pet:stats-changed" },
    { method: "onMenuData", channel: "pet:menu-data" },
    { method: "onHoverData", channel: "pet:hover-data" },
    { method: "onBubbleData", channel: "pet:bubble-data" }
  ];

  for (const { method, channel } of listeners) {
    const blockRegex = new RegExp(`${escapeRegex(method)}:\\s*\\([^)]*\\)\\s*=>\\s*\\{([\\s\\S]*?)\\}`);
    const block = preloadSource.match(blockRegex)?.[1] || "";
    assert.ok(block.length > 0, `preload.cjs 应包含 ${method} 监听方法定义`);

    const onPattern = new RegExp(`ipcRenderer\\.on\\(\\s*['"]${escapeRegex(channel)}['"]\\s*,\\s*listener\\s*\\)`);
    assert.match(block, onPattern, `${method} 应通过 ipcRenderer.on 监听 ${channel}`);

    const unsubPattern = new RegExp(`return\\s*\\(\\s*\\)\\s*=>\\s*ipcRenderer\\.removeListener\\(\\s*['"]${escapeRegex(channel)}['"]\\s*,\\s*listener\\s*\\)`);
    assert.match(block, unsubPattern, `${method} 应返回移除 ${channel} 的 unsubscribe 函数`);
  }
});

test("renderer 调用的 desktopPet.* 都存在于 preload.cjs", () => {
  const calls = [...rendererSources.matchAll(/window\.desktopPet\.(\w+)\s*\(/g)].map((m) => m[1]);
  const uniqueCalls = [...new Set(calls)];
  assert.ok(uniqueCalls.length > 0, "renderer 中应至少有一个 window.desktopPet.* 调用");

  for (const method of uniqueCalls) {
    const pattern = new RegExp(`\\b${escapeRegex(method)}\\s*:`);
    assert.match(preloadSource, pattern, `preload.cjs 应暴露 desktopPet.${method}`);
  }
});

test("高风险 channel 名称在 preload.cjs 和 main.cjs 中保持不变", () => {
  const highRiskChannels = [
    "pet:advance-walk-step",
    "pet:drag-start",
    "pet:drag-end",
    "pet:rendered-frame",
    "pet:set-state",
    "pet:complete-one-shot"
  ];

  for (const channel of highRiskChannels) {
    const pattern = new RegExp(escapeRegex(channel));
    assert.match(preloadSource, pattern, `preload.cjs 应包含高风险 channel ${channel}`);
    assert.match(mainSource, pattern, `main.cjs 应包含高风险 channel ${channel}`);
  }
});

test("main -> renderer 事件推送 channel 在 preload 中有监听", () => {
  const combined = mainSource + "\n" + controllerSources;
  const pushChannels = [...combined.matchAll(/(?:safeSend|broadcastToWindows)\s*\([\s\S]*?['"](pet:[^'"]+)['"]/g)].map((m) => m[1]);
  const uniquePushChannels = [...new Set(pushChannels)];

  const expected = [
    "pet:state-changed",
    "pet:direction-changed",
    "pet:drag-state-changed",
    "pet:pause-state-changed",
    "pet:eye-tracking-look",
    "pet:scale-changed",
    "pet:stats-changed",
    "pet:menu-data",
    "pet:hover-data",
    "pet:bubble-data"
  ];
  assert.deepEqual(uniquePushChannels.sort(), [...expected].sort(),
    `main->renderer 事件推送 channel 提取应匹配 ${expected.length} 个`);

  for (const channel of expected) {
    const pattern = new RegExp(`ipcRenderer\\.on\\(\\s*['"]${escapeRegex(channel)}['"]\\s*,\\s*listener\\s*\\)`);
    assert.match(preloadSource, pattern, `preload.cjs 应监听 main->renderer 推送 channel ${channel}`);
  }
});
