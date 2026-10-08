const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("widget", {
  previewOpacity: (v) => ipcRenderer.send("idle-opacity", v),
  hide: () => ipcRenderer.send("hide"),
  typing: (v) => ipcRenderer.send("typing", v),
  press: () => ipcRenderer.send("press"),
  slide: (v) => ipcRenderer.send("slide", v),
  inbox: () => ipcRenderer.invoke("inbox"),
  pin: (on) => ipcRenderer.invoke("pin", on),
  lock: (on) => ipcRenderer.invoke("lock", on),
  openPlanner: () => ipcRenderer.send("open-planner"),
  open: (url) => ipcRenderer.send("open", url),
});
