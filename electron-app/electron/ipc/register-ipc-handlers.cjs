// IPC 注册模块：集中注册所有 ipcMain.handle / ipcMain.on，不包含业务逻辑。
// handler 函数由 main.cjs 通过 context.handlers 注入。
function registerIpcHandlers(context) {
  const { ipcMain, handlers } = context;

  // invoke handlers (8 个)
  ipcMain.handle("pet:get-config", handlers.getConfig);
  ipcMain.handle("pet:set-auto-start", handlers.setAutoStart);
  ipcMain.handle("pet:toggle-auto-start", handlers.toggleAutoStart);
  ipcMain.handle("pet:set-window-roam", handlers.setWindowRoam);
  ipcMain.handle("pet:set-eye-tracking", handlers.setEyeTracking);
  ipcMain.handle("pet:switch-variant", handlers.switchVariant);
  ipcMain.handle("pet:advance-walk-step", handlers.advanceWalkStep);
  ipcMain.handle("pet:get-contact-qrcode", handlers.getContactQrCode);

  // on handlers (27 个)
  ipcMain.on("pet:show-menu", handlers.showMenu);
  ipcMain.on("pet:resize-menu", handlers.resizeMenu);
  ipcMain.on("pet:menu-panel-enter", handlers.menuPanelEnter);
  ipcMain.on("pet:menu-panel-leave", handlers.menuPanelLeave);
  ipcMain.on("pet:resize-bubble", handlers.resizeBubble);
  ipcMain.on("pet:hover-enter", handlers.hoverEnter);
  ipcMain.on("pet:hover-leave", handlers.hoverLeave);
  ipcMain.on("pet:hover-panel-enter", handlers.hoverPanelEnter);
  ipcMain.on("pet:hover-panel-leave", handlers.hoverPanelLeave);
  ipcMain.on("pet:hover-action", handlers.hoverAction);
  ipcMain.on("pet:rendered-frame", handlers.renderedFrame);
  ipcMain.on("pet:renderer-diagnostic", handlers.rendererDiagnostic);
  ipcMain.on("pet:set-state", handlers.setState);
  ipcMain.on("pet:wake-sleeping-pet", handlers.wakeSleepingPet);
  ipcMain.on("pet:complete-one-shot", handlers.completeOneShot);
  ipcMain.on("pet:reset-position", handlers.resetPosition);
  ipcMain.on("pet:reset-scale", handlers.resetScale);
  ipcMain.on("pet:show", handlers.show);
  ipcMain.on("pet:hide", handlers.hide);
  ipcMain.on("pet:quit", handlers.quit);
  ipcMain.on("pet:hide-menu", handlers.hideMenu);
  ipcMain.on("pet:show-customization", handlers.showCustomization);
  ipcMain.on("pet:hide-customization", handlers.hideCustomization);
  ipcMain.on("pet:adjust-scale", handlers.adjustScale);
  ipcMain.on("pet:drag-start", handlers.dragStart);
  ipcMain.on("pet:drag-end", handlers.dragEnd);
  ipcMain.on("pet:runway-layout-ready", handlers.runwayLayoutReady);
}

module.exports = { registerIpcHandlers };
