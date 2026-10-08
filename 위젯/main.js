// 마이플래너 할 일 위젯 — 화면에 떠 있는 작은 메모지 (2026-10-08)
// 테두리 없음 · 항상 위 · 끌어서 아무 데나 · 크기 조절 · 투명도(마우스 올리면 선명) · 위치 기억
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, screen, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

if (!app.requestSingleInstanceLock()) { app.quit(); return; }

const STATE = path.join(app.getPath("userData"), "window.json");
let st = { width: 300, height: 440, opacity: 0.75, onTop: true };
try { Object.assign(st, JSON.parse(fs.readFileSync(STATE, "utf8"))); } catch {}
const save = () => { try { fs.writeFileSync(STATE, JSON.stringify(st)); } catch {} };

let win, tray;

function onSomeScreen(x, y) {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    x >= a.x - 40 && x < a.x + a.width - 60 && y >= a.y - 10 && y < a.y + a.height - 60);
}

function createWindow() {
  if (st.x === undefined || !onSomeScreen(st.x, st.y)) {   // 처음이거나 모니터가 바뀌었으면 오른쪽 위
    const a = screen.getPrimaryDisplay().workArea;
    st.x = a.x + a.width - st.width - 24;
    st.y = a.y + 24;
  }
  win = new BrowserWindow({
    x: st.x, y: st.y, width: st.width, height: st.height,
    minWidth: 220, minHeight: 150,
    frame: false, resizable: true, skipTaskbar: true, show: false,
    backgroundColor: "#FFFDF8",
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  win.setAlwaysOnTop(st.onTop, "floating");
  win.setOpacity(st.opacity);
  win.loadFile("widget.html");
  win.once("ready-to-show", () => win.show());
  const remember = () => { Object.assign(st, win.getBounds()); save(); };
  win.on("moved", remember);
  win.on("resized", remember);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

function toggleShow() { if (win.isVisible()) win.hide(); else { win.show(); win.focus(); } }

function autostartOn() { return app.getLoginItemSettings({ path: process.execPath, args: [__dirname] }).openAtLogin; }
function setAutostart(on) { app.setLoginItemSettings({ openAtLogin: on, path: process.execPath, args: [__dirname] }); }

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, "..", "icon.png")).resize({ width: 16, height: 16 }));
  tray.setToolTip("할 일 위젯");
  const menu = () => Menu.buildFromTemplate([
    { label: "보이기 / 숨기기", click: toggleShow },
    { label: "컴퓨터 켤 때 자동 실행", type: "checkbox", checked: autostartOn(),
      click: (i) => setAutostart(i.checked) },
    { label: "오른쪽 위로 되돌리기", click: () => {
      const a = screen.getPrimaryDisplay().workArea;
      win.setBounds({ x: a.x + a.width - 300 - 24, y: a.y + 24, width: 300, height: 440 }); win.show();
    } },
    { type: "separator" },
    { label: "종료", click: () => app.quit() },
  ]);
  tray.on("click", toggleShow);
  tray.on("right-click", () => tray.popUpContextMenu(menu()));
}

// 마우스가 위젯 위에 있거나 글을 쓰는 중이면 고른 흐리기와 최대 밝기의 중간까지만 밝힌다(최대는 눈이 부심, 10-08 찬진)
// (끌기 영역 위에선 마우스 이벤트가 안 와서 화면 쪽이 아니라 여기서 커서 위치로 판단한다)
let previewUntil = 0;   // 흐리기 막대를 움직이는 동안은 고른 값을 바로 보여 준다
setInterval(() => {
  if (!win || !win.isVisible() || Date.now() < previewUntil) return;
  const c = screen.getCursorScreenPoint(), b = win.getBounds();
  const over = c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height;
  const want = over || win.isFocused() ? (st.opacity + 1) / 2 : st.opacity;
  if (Math.abs(win.getOpacity() - want) > 0.01) win.setOpacity(want);
}, 120);
ipcMain.on("idle-opacity", (_e, v) => {
  st.opacity = v; win.setOpacity(v); previewUntil = Date.now() + 1200;
  clearTimeout(save.t); save.t = setTimeout(save, 400);
});
ipcMain.on("hide", () => win && win.hide());
ipcMain.handle("pin", (_e, on) => { if (on !== undefined) { st.onTop = on; win.setAlwaysOnTop(on, "floating"); save(); } return st.onTop; });
// ↗ = 설치된 마이플래너 앱(크롬 앱 '플래너')을 연다. 없으면 브라우저로
const PLANNER_LNK = path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Chrome 앱", "플래너.lnk");
ipcMain.on("open-planner", () => fs.existsSync(PLANNER_LNK) ? shell.openPath(PLANNER_LNK) : shell.openExternal("https://my-planner-fawn-nine.vercel.app/"));
ipcMain.on("open", (_e, url) => shell.openExternal(url));

app.on("second-instance", () => { if (win) { win.show(); win.focus(); } });
app.whenReady().then(() => {
  if (st.autostartSet === undefined) { setAutostart(true); st.autostartSet = true; save(); }  // 처음 한 번만 자동 실행 켬
  createWindow();
  buildTray();
});
app.on("window-all-closed", (e) => e.preventDefault());
