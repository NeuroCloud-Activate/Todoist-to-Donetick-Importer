const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { createSettingsStore, mergeSettings } = require("./lib/settingsStore");
const { createSnapshotStore } = require("./lib/snapshotStore");
const { clearTodoistCache, previewImport, runImport, testConnections } = require("./lib/importService");

let settingsStore;
let snapshotStore;
const isSmokeTest = process.argv.includes("--smoke-test");
const appDisplayName = "Todoist Donetick Importer";

app.setName(appDisplayName);
const runtimeDataPath = getRuntimeDataPath();
app.setPath("userData", runtimeDataPath);

function getRuntimeDataPath() {
  const explicitArg = process.argv.find((arg) => arg.startsWith("--portable-data-dir="));
  if (explicitArg) {
    return path.resolve(explicitArg.slice("--portable-data-dir=".length));
  }

  if (process.env.TDI_PORTABLE_DATA_DIR) {
    return path.resolve(process.env.TDI_PORTABLE_DATA_DIR);
  }

  if (!process.defaultApp && process.platform === "darwin") {
    const bundlePath = findMacBundlePath(app.getPath("exe"));
    if (bundlePath) {
      return path.join(path.dirname(bundlePath), `${appDisplayName} Data`);
    }
  }

  return app.getPath("userData");
}

function findMacBundlePath(executablePath) {
  let current = path.resolve(executablePath);
  while (current !== path.dirname(current)) {
    if (current.endsWith(".app")) {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 960,
    minHeight: 680,
    title: "Todoist to Donetick Importer",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isSmokeTest) {
    runSmokeTest(window);
  }
  window.loadFile(path.join(__dirname, "index.html"));
}

app.whenReady().then(() => {
  const userDataPath = runtimeDataPath;
  settingsStore = createSettingsStore(userDataPath);
  snapshotStore = createSnapshotStore(userDataPath);
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

ipcMain.handle("settings:load", async () => settingsStore.load());

ipcMain.handle("settings:save", async (_event, settings) => settingsStore.save(settings));

ipcMain.handle("settings:clear", async () => settingsStore.clear());

ipcMain.handle("connections:test", async (_event, settings, options) => {
  return testConnections(mergeSettings(settings), options);
});

ipcMain.handle("import:preview", async (_event, settings, options) => {
  return previewImport(mergeSettings(settings), options, snapshotStore);
});

ipcMain.handle("import:run", async (_event, settings, options, selectedTaskIds, itemOverrides) => {
  return runImport(mergeSettings(settings), options, selectedTaskIds, snapshotStore, itemOverrides);
});

ipcMain.handle("todoist-cache:clear", async () => {
  return clearTodoistCache(snapshotStore);
});

ipcMain.handle("shell:openExternal", async (_event, url) => {
  if (typeof url === "string" && /^https?:\/\//i.test(url)) {
    await shell.openExternal(url);
  }
});

async function runSmokeTest(window) {
  try {
    await new Promise((resolve, reject) => {
      window.webContents.once("did-finish-load", resolve);
      window.webContents.once("did-fail-load", (_event, _code, description) => reject(new Error(description)));
    });

    const result = await window.webContents.executeJavaScript(`
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Preview smoke test timed out")), 5000);
        const timer = setInterval(() => {
          const noSidebar = !document.querySelector(".sidebar");
          const description = document.querySelector("#statusText").textContent;
          const summary = document.querySelector("#previewSummary").textContent;
          const headers = [...document.querySelectorAll("th")].map((node) => node.textContent.trim());
          if (noSidebar && description.includes("Enter connection details") && summary.includes("No Todoist data") && headers.includes("Donetick Description")) {
            clearInterval(timer);
            clearTimeout(timeout);
            resolve({ summary, headers });
          }
        }, 100);
      });
    `);

    console.log(`[smoke] ${result.summary}`);
    console.log(`[smoke] dataPath=${runtimeDataPath}`);
    app.exit(0);
  } catch (error) {
    console.error(`[smoke] ${error.message}`);
    app.exit(1);
  }
}
