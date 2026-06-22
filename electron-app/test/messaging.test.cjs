const test = require("node:test");
const assert = require("node:assert/strict");
const { safeSend, broadcastToWindows } = require("../electron/shared/messaging.cjs");

// 构造模拟 BrowserWindow：含 isDestroyed() 和 webContents.send()
// 通过 _calls 数组记录发送的 channel 和 data，便于断言
function createMockWindow({ destroyed = false } = {}) {
  const calls = [];
  return {
    isDestroyed: () => destroyed,
    webContents: {
      send: (channel, data) => {
        calls.push({ channel, data });
      }
    },
    _calls: calls
  };
}

// safeSend：安全地向单个窗口发送消息
test("safeSend 对 null 窗口不抛错且不发送", () => {
  assert.doesNotThrow(() => safeSend(null, "channel", { a: 1 }));
});

test("safeSend 对 undefined 窗口不抛错且不发送", () => {
  assert.doesNotThrow(() => safeSend(undefined, "channel", { a: 1 }));
});

test("safeSend 跳过 isDestroyed 返回 true 的窗口", () => {
  const destroyedWindow = createMockWindow({ destroyed: true });

  safeSend(destroyedWindow, "channel", { a: 1 });

  assert.equal(destroyedWindow._calls.length, 0);
});

test("safeSend 对正常窗口调用 webContents.send", () => {
  const window = createMockWindow({ destroyed: false });

  safeSend(window, "pet-event", { payload: "hello" });

  assert.equal(window._calls.length, 1);
  assert.deepEqual(window._calls[0], { channel: "pet-event", data: { payload: "hello" } });
});

// broadcastToWindows：向多个窗口广播同一条消息
test("broadcastToWindows 对空数组不抛错", () => {
  assert.doesNotThrow(() => broadcastToWindows([], "channel", { a: 1 }));
});

test("broadcastToWindows 只对有效窗口发送，跳过无效窗口", () => {
  const validA = createMockWindow({ destroyed: false });
  const validB = createMockWindow({ destroyed: false });
  const destroyedWindow = createMockWindow({ destroyed: true });

  broadcastToWindows([validA, null, destroyedWindow, undefined, validB], "broadcast", { x: 1 });

  assert.equal(validA._calls.length, 1);
  assert.deepEqual(validA._calls[0], { channel: "broadcast", data: { x: 1 } });
  assert.equal(validB._calls.length, 1);
  assert.deepEqual(validB._calls[0], { channel: "broadcast", data: { x: 1 } });
  assert.equal(destroyedWindow._calls.length, 0);
});

test("broadcastToWindows 全部无效窗口时不发送任何消息", () => {
  const destroyedWindow = createMockWindow({ destroyed: true });

  broadcastToWindows([null, undefined, destroyedWindow], "broadcast", { x: 1 });

  assert.equal(destroyedWindow._calls.length, 0);
});

test("broadcastToWindows 对非数组输入不抛错", () => {
  assert.doesNotThrow(() => broadcastToWindows(null, "channel", { a: 1 }));
  assert.doesNotThrow(() => broadcastToWindows(undefined, "channel", { a: 1 }));
});
