const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("widget", {
  previewOpacity: (v) => ipcRenderer.send("idle-opacity", v),
  hide: () => ipcRenderer.send("hide"),
  typing: (v) => ipcRenderer.send("typing", v),
  press: () => ipcRenderer.send("press"),
  slide: (v) => ipcRenderer.send("slide", v),
  inbox: () => ipcRenderer.invoke("inbox"),
  credSave: (e, p) => ipcRenderer.invoke("cred-save", e, p),
  credLoad: () => ipcRenderer.invoke("cred-load"),
  credClear: () => ipcRenderer.invoke("cred-clear"),
  pin: (on) => ipcRenderer.invoke("pin", on),
  lock: (on) => ipcRenderer.invoke("lock", on),
  openPlanner: () => ipcRenderer.send("open-planner"),
  open: (url) => ipcRenderer.send("open", url),
});
