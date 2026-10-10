// 마이플래너 할 일 위젯 — 화면에 떠 있는 작은 메모지 (2026-10-08)
// 테두리 없음 · 항상 위 · 끌어서 아무 데나 · 크기 조절 · 투명도(마우스 올리면 선명) · 위치 기억
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, screen, nativeImage, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");

if (!app.requestSingleInstanceLock()) { app.quit(); return; }
app.disableHardwareAcceleration();   // 작은 메모지라 GPU 가 필요 없고, 투명도(레이어 창)+GPU 조합이 클릭 반응을 둔하게 만든다(10-09)
app.setAppUserModelId("chanjin.todo-widget");   // 작업 표시줄에 '할 일 위젯'으로 따로 뜨게

const STATE = path.join(app.getPath("userData"), "window.json");
let st = { width: 300, height: 440, opacity: 0.75, onTop: true };
try { Object.assign(st, JSON.parse(fs.readFileSync(STATE, "utf8"))); } catch {}
const save = () => { try { fs.writeFileSync(STATE, JSON.stringify(st)); } catch {} };

const ICON_ICO = path.join(__dirname, "icon.ico"), ICON_PNG = path.join(__dirname, "icon.png");   // 코랄 바탕 흰 체크 (2026-10-08)
let win, tray, quitting = false;
app.on("before-quit", () => { quitting = true; });
const alive = () => win && !win.isDestroyed();

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
    minWidth: 270, minHeight: 150,
    frame: false, resizable: true, skipTaskbar: false, show: false,
    icon: ICON_ICO,
    backgroundColor: "#FFFDF8",
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  win.setAlwaysOnTop(st.onTop, "floating");
  win.setIcon(nativeImage.createFromPath(ICON_ICO));
  try {
    win.setAppDetails({ appId: "chanjin.todo-widget", appIconPath: ICON_ICO, appIconIndex: 0,
      relaunchCommand: `"${process.execPath}" "${__dirname}"`, relaunchDisplayName: "할 일 위젯" });
  } catch {}   // 작업 표시줄이 Electron 기본 아이콘을 쓰지 않게
  win.setOpacity(st.opacity);
  win.loadFile("widget.html");
  win.once("ready-to-show", () => win.show());
  const remember = () => { Object.assign(st, win.getBounds()); save(); };
  win.setMovable(!st.locked); win.setResizable(!st.locked);
  // 창 닫기(작업 표시줄 우클릭·Alt+F4 등)는 창을 없애지 않고 트레이로 숨긴다 — 없애 버리면 아래 타이머·메뉴가
  // 죽은 창을 만져서 "Object has been destroyed" 오류가 난다(10-08). 완전히 끄려면 트레이 '종료'.
  win.on("close", (e) => { if (!quitting) { e.preventDefault(); win.hide(); } });
  win.on("moved", () => snap(remember));
  win.on("resized", remember);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });
}

// 끌어다 놓을 때 화면 가장자리 80px 안이면 가장자리(여백 12px)에 착 붙인다 — 두 변에 가까우면 모서리
const SNAP = 80, GAP = 12;
let animating = false;
function snap(done) {
  if (animating) return;
  const b = win.getBounds(), a = screen.getDisplayMatching(b).workArea;
  let x = b.x, y = b.y;
  if (Math.abs(b.x - a.x) < SNAP) x = a.x + GAP;
  else if (Math.abs(a.x + a.width - (b.x + b.width)) < SNAP) x = a.x + a.width - b.width - GAP;
  if (Math.abs(b.y - a.y) < SNAP) y = a.y + GAP;
  else if (Math.abs(a.y + a.height - (b.y + b.height)) < SNAP) y = a.y + a.height - b.height - GAP;
  if (x === b.x && y === b.y) return done();
  animating = true;
  let i = 0; const N = 6;
  const t = setInterval(() => {
    i++; const k = 1 - Math.pow(1 - i / N, 3);          // 끝에서 감속 → '딱' 걸리는 느낌
    win.setPosition(Math.round(b.x + (x - b.x) * k), Math.round(b.y + (y - b.y) * k));
    if (i >= N) { clearInterval(t); animating = false; done(); }
  }, 16);
}

function toggleShow() { if (!alive()) return; if (win.isVisible() && !win.isMinimized()) win.minimize(); else { win.restore(); win.show(); win.focus(); } }

// 컴퓨터를 켤 때 자동 실행 = 작업 스케줄러 '할 일 위젯 시작'(위젯 폴더의 widget_start.ps1). 시작 프로그램 항목(Run)으로 켜면
// 윈도우 '스마트 앱 컨트롤'이 서명 없는 electron.exe 를 막아서 이쪽으로 바꿨다(10-10).
const TASK = "할 일 위젯 시작";
const { execFileSync } = require("child_process");
function autostartOn() {
  try { return !/Disabled|사용 안 함/i.test(execFileSync("schtasks", ["/Query", "/TN", TASK, "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true })); } catch { return false; }
}
function setAutostart(on) { try { execFileSync("schtasks", ["/Change", "/TN", TASK, on ? "/ENABLE" : "/DISABLE"], { windowsHide: true }); } catch {} }

function buildTray() {
  tray = new Tray(nativeImage.createFromPath(ICON_PNG).resize({ width: 16, height: 16 }));
  tray.setToolTip("할 일 위젯");
  const menu = () => Menu.buildFromTemplate([
    { label: "보이기 / 숨기기", click: toggleShow },
    { label: "컴퓨터 켤 때 자동 실행", type: "checkbox", checked: autostartOn(),
      click: (i) => setAutostart(i.checked) },
    { label: "오른쪽 위로 되돌리기", click: () => {
      const a = screen.getPrimaryDisplay().workArea;
      if (!alive()) return;
      win.setBounds({ x: a.x + a.width - 300 - 24, y: a.y + 24, width: 300, height: 440 }); win.show();
    } },
    { type: "separator" },
    { label: "종료", click: () => app.quit() },
  ]);
  tray.on("click", toggleShow);
  tray.on("right-click", () => tray.popUpContextMenu(menu()));
}

// 흐리기: 평소(마우스를 올려도)엔 고른 값 그대로, **클릭을 시작하면 최대 밝기**, 손을 떼고 1.5초 뒤 다시 흐려진다 (10-09 찬진).
// 글을 쓰는 동안(입력칸 포커스)도 밝게. 흐리기 막대를 움직이는 동안은 고른 값을 그대로 보여 준다(막대와 화면이 일치).
// 밝아질 땐 클릭 즉시(타이머를 기다리지 않음), 흐려질 땐 0.1씩 부드럽게. 현재 값을 직접 기억해 매번 창에 묻지 않는다.
let pressedUntil = 0, typing = false, sliding = false, curOp = st.opacity;
function setOp(v) { if (!alive() || Math.abs(curOp - v) < 0.005) return; curOp = v; win.setOpacity(v); }
ipcMain.on("typing", (_e, v) => { typing = v; if (v) setOp(1); });
ipcMain.on("press", () => { pressedUntil = Date.now() + 1500; setOp(1); });
ipcMain.on("slide", (_e, v) => { sliding = v; if (!v) pressedUntil = 0; });
setInterval(() => {
  if (!alive() || !win.isVisible() || sliding) return;
  // 마우스가 위젯 위에 있는 동안은 계속 최대 밝기(10-09 찬진: "만지고 있을 땐 밝아야 보기 편해"). 벗어나면 1.5초 뒤 고른 흐리기로 부드럽게 돌아간다.
  const c = screen.getCursorScreenPoint(), b = win.getBounds();
  if (c.x >= b.x && c.x < b.x + b.width && c.y >= b.y && c.y < b.y + b.height) pressedUntil = Math.max(pressedUntil, Date.now() + 1500);
  const want = (Date.now() < pressedUntil || typing) ? 1 : st.opacity;
  if (curOp > want + 0.005) setOp(Math.max(want, curOp - 0.1)); else if (curOp < want - 0.005) setOp(want);
}, 50);
ipcMain.on("idle-opacity", (_e, v) => {
  st.opacity = v; curOp = v; if (alive()) win.setOpacity(v);
  clearTimeout(save.t); save.t = setTimeout(save, 400);
});
// Claude 가 할 일을 넣어 두는 우편함: %APPDATA%\todo-widget\inbox.json = [{"title":"…","due":"YYYY-MM-DD"}] (읽으면 지운다)
ipcMain.handle("inbox", () => {
  const f = path.join(app.getPath("userData"), "inbox.json");
  try { const t = JSON.parse(fs.readFileSync(f, "utf8")); fs.unlinkSync(f); return Array.isArray(t) ? t : []; } catch { return []; }
});
// 로그인 정보를 이 컴퓨터에서만 풀 수 있게 암호화(Windows 계정 DPAPI)해 두고, 로그인이 풀리면 위젯이 알아서 다시 로그인한다 (10-09 찬진: "매번 로그인 안 해도 되게")
const CRED = path.join(app.getPath("userData"), "cred.bin");
ipcMain.handle("cred-save", (_e, email, password) => {
  try { if (!safeStorage.isEncryptionAvailable()) return false; fs.writeFileSync(CRED, safeStorage.encryptString(JSON.stringify({ email, password }))); return true; } catch { return false; }
});
ipcMain.handle("cred-load", () => {
  try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(CRED))); } catch { return null; }
});
ipcMain.handle("cred-clear", () => { try { fs.unlinkSync(CRED); } catch {} return true; });
ipcMain.on("hide", () => alive() && win.minimize());   // 작업 표시줄로 내리기
ipcMain.handle("lock", (_e, on) => {
  if (on !== undefined) { st.locked = on; if (alive()) { win.setMovable(!on); win.setResizable(!on); } save(); }
  return !!st.locked;
});
ipcMain.handle("pin", (_e, on) => { if (on !== undefined) { st.onTop = on; if (alive()) win.setAlwaysOnTop(on, "floating"); save(); } return st.onTop; });
// ↗ = 설치된 마이플래너 앱(크롬 앱 '플래너')을 연다. 없으면 브라우저로
const PLANNER_LNK = path.join(app.getPath("appData"), "Microsoft", "Windows", "Start Menu", "Programs", "Chrome 앱", "플래너.lnk");
ipcMain.on("open-planner", () => fs.existsSync(PLANNER_LNK) ? shell.openPath(PLANNER_LNK) : shell.openExternal("https://my-planner-fawn-nine.vercel.app/"));
ipcMain.on("open", (_e, url) => shell.openExternal(url));

app.on("second-instance", () => { if (alive()) { win.show(); win.focus(); } });
app.whenReady().then(() => {
  createWindow();
  buildTray();
});
app.on("window-all-closed", (e) => e.preventDefault());
