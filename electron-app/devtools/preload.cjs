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
  listVariants: () => ipcRenderer.invoke("devtools:listVariants"),
  getVariantDetails: (id) => ipcRenderer.invoke("devtools:getVariantDetails", id),
  checkVariant: (id) => ipcRenderer.invoke("devtools:checkVariant", id),
  generateGallery: () => ipcRenderer.invoke("devtools:generateGallery"),
  openGallery: () => ipcRenderer.invoke("devtools:openGallery"),
  buildNewVariantPreview: (formState) => ipcRenderer.invoke("devtools:buildNewVariantPreview", formState),
  runNewVariant: (previewId) => ipcRenderer.invoke("devtools:runNewVariant", previewId),
  buildReplaceActionPreview: (payload) => ipcRenderer.invoke("devtools:buildReplaceActionPreview", payload),
  runReplaceAction: (previewId) => ipcRenderer.invoke("devtools:runReplaceAction", previewId),
  buildReplaceActionsPreview: (payload) => ipcRenderer.invoke("devtools:buildReplaceActionsPreview", payload),
  runReplaceActions: (previewId) => ipcRenderer.invoke("devtools:runReplaceActions", previewId),
  buildRenameAssetsPreview: (payload) => ipcRenderer.invoke("devtools:buildRenameAssetsPreview", payload),
  runRenameAssets: (previewId) => ipcRenderer.invoke("devtools:runRenameAssets", previewId),
  buildMetadataEditPreview: (payload) => ipcRenderer.invoke("devtools:buildMetadataEditPreview", payload),
  applyMetadataEdit: (previewId) => ipcRenderer.invoke("devtools:applyMetadataEdit", previewId),
  buildDeleteVariantPreview: (id) => ipcRenderer.invoke("devtools:buildDeleteVariantPreview", id),
  deleteTestVariant: (previewId) => ipcRenderer.invoke("devtools:deleteTestVariant", previewId),
  onTaskLog: (callback) => subscribe("devtools:taskLog", callback),
  onTaskStatus: (callback) => subscribe("devtools:taskStatus", callback)
});
