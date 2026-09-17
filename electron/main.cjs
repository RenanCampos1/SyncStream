const { app, BrowserWindow, session, shell } = require("electron");
const path = require("path");

// Remote room audio must be able to start without a user gesture inside the
// room (the browser default would block autoplay).
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  const createWindow = () => {
    const win = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 940,
      minHeight: 600,
      backgroundColor: "#0b0e17",
      autoHideMenuBar: true,
      title: "LAButuca",
      icon: path.join(__dirname, "../build/icon.png"),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        // Keep WebRTC and animations running while the window is unfocused.
        backgroundThrottling: false,
      },
    });

    win.loadFile(path.join(__dirname, "../dist/index.html"));

    // Open external links in the system browser instead of inside the app.
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith("http")) void shell.openExternal(url);
      return { action: "deny" };
    });
  };

  // Mic/camera and screen-capture permissions for packaged builds, where the
  // default permission handler would deny getUserMedia / getDisplayMedia.
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      callback(permission === "media" || permission === "display-capture");
    },
  );

  app.whenReady().then(() => {
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
