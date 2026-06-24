// 应用生命周期注册模块：集中注册 Electron 生命周期事件，不包含业务逻辑。
// handler 函数由 main.cjs 通过 context.handlers 注入。
function registerAppLifecycle(context) {
  const { app, screen, process, gotSingleInstanceLock, handlers } = context;
  const {
    onSecondInstance,
    onReady,
    onBeforeQuit,
    onWindowAllClosed,
    onActivate,
    onDisplayMetricsChanged
  } = handlers;

  if (!gotSingleInstanceLock) {
    app.quit();
    return;
  }

  app.on("second-instance", onSecondInstance);

  app.whenReady().then(() => {
    onReady();
    if (process.platform === "darwin") {
      screen.on("display-metrics-changed", onDisplayMetricsChanged);
    }
    app.on("activate", onActivate);
  });

  app.on("before-quit", onBeforeQuit);
  app.on("window-all-closed", onWindowAllClosed);
}

module.exports = { registerAppLifecycle };
