const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { createVariantWorkflow } = require("./services/variant-workflow.cjs");

const indexFile = path.join(__dirname, "index.html");
const indexUrl = pathToFileURL(indexFile).toString();
const appIconPath = path.resolve(__dirname, "..", "..", "app_icon.ico");
const workflow = createVariantWorkflow();
let mainWindow = null;
let activeRun = null;

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function assertDevtoolsSender(event) {
  if (!event.senderFrame || event.senderFrame.url !== indexUrl) {
    throw new Error("未授权的 devtools IPC 来源。");
  }
}

function loadDevtoolsWindow() {
  if (fs.existsSync(indexFile)) {
    return mainWindow.loadFile(indexFile);
  }
  return mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Chongban Devtools</title></head>
<body><main style="font-family: sans-serif; padding: 24px;"><h1>Chongban Devtools</h1><p>Devtools UI 文件尚未生成。</p></main></body>
</html>`)}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "Chongban Devtools",
    icon: fs.existsSync(appIconPath) ? appIconPath : undefined,
    backgroundColor: "#f6f7f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.on("close", (event) => {
    if (!activeRun) {
      return;
    }
    event.preventDefault();
    sendToRenderer("devtools:taskLog", {
      stage: "window",
      stream: "info",
      message: "宠物变体生成仍在执行，任务结束后再关闭窗口。"
    });
    dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["确定"],
      title: "生成进行中",
      message: "宠物变体生成仍在执行。",
      detail: "请等任务结束后再关闭 devtools 窗口。"
    }).catch(() => {});
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  loadDevtoolsWindow();

  if (process.env.CHONGBAN_DEVTOOLS_OPEN_DEVTOOLS === "1") {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

ipcMain.handle("devtools:getCatalogOptions", (event) => {
  assertDevtoolsSender(event);
  return workflow.getCatalogOptions();
});

ipcMain.handle("devtools:chooseSourceFolder", async (event) => {
  assertDevtoolsSender(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "选择源视频文件夹"
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("devtools:chooseActionVideo", async (event) => {
  assertDevtoolsSender(event);
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "MP4 视频", extensions: ["mp4"] }],
    title: "选择动作视频"
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("devtools:listVariants", (event) => {
  assertDevtoolsSender(event);
  return workflow.listVariants();
});

ipcMain.handle("devtools:getVariantDetails", (event, id) => {
  assertDevtoolsSender(event);
  return workflow.getVariantDetails(id);
});

ipcMain.handle("devtools:buildNewVariantPreview", (event, formState) => {
  assertDevtoolsSender(event);
  return workflow.buildNewVariantPreview(formState || {});
});

ipcMain.handle("devtools:runNewVariant", async (event, previewId) => {
  assertDevtoolsSender(event);
  if (activeRun) {
    throw new Error("已有宠物变体生成任务正在执行。");
  }

  activeRun = workflow.runNewVariant(previewId, {
    onStage: (payload) => sendToRenderer("devtools:taskStatus", payload),
    onLog: (payload) => sendToRenderer("devtools:taskLog", payload)
  });

  try {
    const draft = await activeRun;
    sendToRenderer("devtools:taskStatus", {
      stage: "complete",
      status: "done",
      id: draft.id
    });
    return { id: draft.id, applied: true };
  } finally {
    activeRun = null;
  }
});

ipcMain.handle("devtools:buildReplaceActionPreview", (event, payload) => {
  assertDevtoolsSender(event);
  return workflow.buildReplaceActionPreview(payload || {});
});

ipcMain.handle("devtools:runReplaceAction", async (event, previewId) => {
  assertDevtoolsSender(event);
  if (activeRun) {
    throw new Error("已有 devtools 任务正在执行。");
  }

  activeRun = workflow.runReplaceAction(previewId, {
    onStage: (payload) => sendToRenderer("devtools:taskStatus", payload),
    onLog: (payload) => sendToRenderer("devtools:taskLog", payload)
  });

  try {
    return await activeRun;
  } finally {
    activeRun = null;
  }
});

ipcMain.handle("devtools:buildMetadataEditPreview", (event, payload) => {
  assertDevtoolsSender(event);
  return workflow.buildMetadataEditPreview(payload || {});
});

ipcMain.handle("devtools:applyMetadataEdit", async (event, previewId) => {
  assertDevtoolsSender(event);
  if (activeRun) {
    throw new Error("已有 devtools 任务正在执行。");
  }

  activeRun = workflow.applyMetadataEdit(previewId, {
    onStage: (payload) => sendToRenderer("devtools:taskStatus", payload),
    onLog: (payload) => sendToRenderer("devtools:taskLog", payload)
  });

  try {
    return await activeRun;
  } finally {
    activeRun = null;
  }
});

ipcMain.handle("devtools:buildDeleteVariantPreview", (event, id) => {
  assertDevtoolsSender(event);
  return workflow.buildDeleteVariantPreview(id);
});

ipcMain.handle("devtools:deleteTestVariant", async (event, previewId) => {
  assertDevtoolsSender(event);
  if (activeRun) {
    throw new Error("已有 devtools 任务正在执行。");
  }

  activeRun = workflow.deleteTestVariant(previewId, {
    onStage: (payload) => sendToRenderer("devtools:taskStatus", payload),
    onLog: (payload) => sendToRenderer("devtools:taskLog", payload)
  });

  try {
    return await activeRun;
  } finally {
    activeRun = null;
  }
});

app.setName("Chongban Devtools");
if (process.platform === "win32") {
  app.setAppUserModelId("com.chongban.devtools");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
