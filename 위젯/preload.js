const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("widget", {
  saveIdleOpacity: (v) => ipcRenderer.send("idle-opacity", v),
  hide: () => ipcRenderer.send("hide"),
  open: (url) => ipcRenderer.send("open", url),
});
