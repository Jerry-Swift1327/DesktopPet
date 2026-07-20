const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopPet", {
  getPetConfig: () => ipcRenderer.invoke("pet:get-config"),
  setAutoStart: (enabled) => ipcRenderer.invoke("pet:set-auto-start", enabled),
  toggleAutoStart: () => ipcRenderer.invoke("pet:toggle-auto-start"),
  setWindowRoam: (enabled) => ipcRenderer.invoke("pet:set-window-roam", enabled),
  setEyeTracking: (enabled) => ipcRenderer.invoke("pet:set-eye-tracking", enabled),
  switchVariant: (variant) => ipcRenderer.invoke("pet:switch-variant", variant),
  showPetMenu: () => ipcRenderer.send("pet:show-menu"),
  resizeMenu: (height) => ipcRenderer.send("pet:resize-menu", height),
  resizeBubble: (size) => ipcRenderer.send("pet:resize-bubble", size),
  menuPanelEnter: () => ipcRenderer.send("pet:menu-panel-enter"),
  menuPanelLeave: () => ipcRenderer.send("pet:menu-panel-leave"),
  hoverEnter: () => ipcRenderer.send("pet:hover-enter"),
  hoverLeave: () => ipcRenderer.send("pet:hover-leave"),
  hoverPanelEnter: () => ipcRenderer.send("pet:hover-panel-enter"),
  hoverPanelLeave: () => ipcRenderer.send("pet:hover-panel-leave"),
  triggerHoverAction: (state) => ipcRenderer.send("pet:hover-action", state),
  updateRenderedFrame: (info) => ipcRenderer.send("pet:rendered-frame", info),
  setState: (state, options) => ipcRenderer.send("pet:set-state", state, options),
  wakeSleepingPet: () => ipcRenderer.send("pet:wake-sleeping-pet"),
  completeOneShot: (state) => ipcRenderer.send("pet:complete-one-shot", state),
  advanceWalkStep: (frameStep, elapsedMs) => ipcRenderer.invoke("pet:advance-walk-step", frameStep, elapsedMs),
  confirmRunwayLayout: (token, phase) => ipcRenderer.send("pet:runway-layout-ready", token, phase),
  rendererDiagnostic: (message) => ipcRenderer.send("pet:renderer-diagnostic", message),
  resetPosition: () => ipcRenderer.send("pet:reset-position"),
  resetScale: () => ipcRenderer.send("pet:reset-scale"),
  hideMenu: () => ipcRenderer.send("pet:hide-menu"),
  showPet: () => ipcRenderer.send("pet:show"),
  hidePet: () => ipcRenderer.send("pet:hide"),
  quit: () => ipcRenderer.send("pet:quit"),
  showCustomization: () => ipcRenderer.send("pet:show-customization"),
  hideCustomization: () => ipcRenderer.send("pet:hide-customization"),
  getContactQrCode: () => ipcRenderer.invoke("pet:get-contact-qrcode"),
  dragStart: (point) => ipcRenderer.send("pet:drag-start", point),
  dragEnd: () => ipcRenderer.send("pet:drag-end"),
  adjustScale: (deltaY) => ipcRenderer.send("pet:adjust-scale", deltaY),
  onStateChanged: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("pet:state-changed", listener);
    return () => ipcRenderer.removeListener("pet:state-changed", listener);
  },
  onDirectionChanged: (callback) => {
    const listener = (_event, direction) => callback(direction);
    ipcRenderer.on("pet:direction-changed", listener);
    return () => ipcRenderer.removeListener("pet:direction-changed", listener);
  },
  onDragStateChanged: (callback) => {
    const listener = (_event, isDragging) => callback(isDragging);
    ipcRenderer.on("pet:drag-state-changed", listener);
    return () => ipcRenderer.removeListener("pet:drag-state-changed", listener);
  },
  onPauseStateChanged: (callback) => {
    const listener = (_event, isPaused) => callback(isPaused);
    ipcRenderer.on("pet:pause-state-changed", listener);
    return () => ipcRenderer.removeListener("pet:pause-state-changed", listener);
  },
  onEyeTrackingLook: (callback) => {
    const listener = (_event, look) => callback(look);
    ipcRenderer.on("pet:eye-tracking-look", listener);
    return () => ipcRenderer.removeListener("pet:eye-tracking-look", listener);
  },
  onScaleChanged: (callback) => {
    const listener = (_event, scale) => callback(scale);
    ipcRenderer.on("pet:scale-changed", listener);
    return () => ipcRenderer.removeListener("pet:scale-changed", listener);
  },
  onRunwayLayoutPrepare: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pet:runway-layout-prepare", listener);
    return () => ipcRenderer.removeListener("pet:runway-layout-prepare", listener);
  },
  onRunwayLayoutCommit: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pet:runway-layout-commit", listener);
    return () => ipcRenderer.removeListener("pet:runway-layout-commit", listener);
  },
  onRunwayLayoutCancel: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("pet:runway-layout-cancel", listener);
    return () => ipcRenderer.removeListener("pet:runway-layout-cancel", listener);
  },
  onStatsChanged: (callback) => {
    const listener = (_event, stats) => callback(stats);
    ipcRenderer.on("pet:stats-changed", listener);
    return () => ipcRenderer.removeListener("pet:stats-changed", listener);
  },
  onMenuData: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("pet:menu-data", listener);
    return () => ipcRenderer.removeListener("pet:menu-data", listener);
  },
  onHoverData: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("pet:hover-data", listener);
    return () => ipcRenderer.removeListener("pet:hover-data", listener);
  },
  onBubbleData: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("pet:bubble-data", listener);
    return () => ipcRenderer.removeListener("pet:bubble-data", listener);
  }
});
