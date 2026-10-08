const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("widget", {
  previewOpacity: (v) => ipcRenderer.send("idle-opacity", v),
  hide: () => ipcRenderer.send("hide"),
  pin: (on) => ipcRenderer.invoke("pin", on),
  openPlanner: () => ipcRenderer.send("open-planner"),
  open: (url) => ipcRenderer.send("open", url),
});
