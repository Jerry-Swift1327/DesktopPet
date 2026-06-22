// 封装 Electron webContents.send 的安全发送和多窗口广播

// 安全地向单个窗口发送消息：跳过不存在或已销毁的窗口
function safeSend(targetWindow, channel, data) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return;
  }
  targetWindow.webContents.send(channel, data);
}

// 向多个窗口广播同一条消息
function broadcastToWindows(windows, channel, data) {
  if (!Array.isArray(windows)) {
    return;
  }
  for (const targetWindow of windows) {
    safeSend(targetWindow, channel, data);
  }
}

module.exports = {
  safeSend,
  broadcastToWindows
};
