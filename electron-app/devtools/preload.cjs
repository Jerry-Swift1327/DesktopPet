const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("variantDevtools", {
  getCatalogOptions: () => ipcRenderer.invoke("devtools:getCatalogOptions"),
  chooseSourceFolder: () => ipcRenderer.invoke("devtools:chooseSourceFolder"),
  chooseActionVideo: (action) => ipcRenderer.invoke("devtools:chooseActionVideo", action),
  buildNewVariantPreview: (formState) => ipcRenderer.invoke("devtools:buildNewVariantPreview", formState),
  runNewVariant: (previewId) => ipcRenderer.invoke("devtools:runNewVariant", previewId),
  onTaskLog: (callback) => subscribe("devtools:taskLog", callback),
  onTaskStatus: (callback) => subscribe("devtools:taskStatus", callback)
});
