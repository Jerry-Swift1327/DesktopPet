const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const { createVariantWorkflow } = require("./services/variant-workflow.cjs");

const indexFile = path.join(__dirname, "index.html");
const indexUrl = pathToFileURL(indexFile).toString();
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
    throw new Error("Unauthorized devtools IPC sender.");
  }
}

function loadDevtoolsWindow() {
  if (fs.existsSync(indexFile)) {
    return mainWindow.loadFile(indexFile);
  }
  return mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Chongban Devtools</title></head>
<body><main style="font-family: sans-serif; padding: 24px;"><h1>Chongban Devtools</h1><p>Devtools UI files have not been generated yet.</p></main></body>
</html>`)}`);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "Chongban Devtools",
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
      message: "Variant generation is still running. Close this window after the task finishes."
    });
    dialog.showMessageBox(mainWindow, {
      type: "info",
      buttons: ["OK"],
      title: "Generation in progress",
      message: "Variant generation is still running.",
      detail: "Close the devtools window after the task finishes."
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
    title: "Choose source video folder"
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
    filters: [{ name: "MP4 video", extensions: ["mp4"] }],
    title: "Choose action video"
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

ipcMain.handle("devtools:buildNewVariantPreview", (event, formState) => {
  assertDevtoolsSender(event);
  return workflow.buildNewVariantPreview(formState || {});
});

ipcMain.handle("devtools:runNewVariant", async (event, previewId) => {
  assertDevtoolsSender(event);
  if (activeRun) {
    throw new Error("A variant generation task is already running.");
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

app.setName("Chongban Devtools");

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
