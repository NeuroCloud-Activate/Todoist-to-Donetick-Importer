const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("importer", {
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  clearSettings: () => ipcRenderer.invoke("settings:clear"),
  testConnections: (settings, options) => ipcRenderer.invoke("connections:test", settings, options),
  previewImport: (settings, options) => ipcRenderer.invoke("import:preview", settings, options),
  runImport: (settings, options, selectedTaskIds, itemOverrides) => ipcRenderer.invoke("import:run", settings, options, selectedTaskIds, itemOverrides),
  clearTodoistCache: () => ipcRenderer.invoke("todoist-cache:clear"),
  openExternal: (url) => ipcRenderer.invoke("shell:openExternal", url)
});
