const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("widget", {
  previewOpacity: (v) => ipcRenderer.send("idle-opacity", v),
  hide: () => ipcRenderer.send("hide"),
  typing: (v) => ipcRenderer.send("typing", v),
  pin: (on) => ipcRenderer.invoke("pin", on),
  openPlanner: () => ipcRenderer.send("open-planner"),
  open: (url) => ipcRenderer.send("open", url),
});
