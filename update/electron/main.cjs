const path = require("node:path");
const { app, BrowserWindow, session, shell } = require("electron");

const isDev = !app.isPackaged;

function resolveRendererPath() {
	return path.join(__dirname, "..", "index.html");
}

function createMainWindow() {
	const win = new BrowserWindow({
		width: 1440,
		height: 920,
		minWidth: 1024,
		minHeight: 720,
		autoHideMenuBar: true,
		backgroundColor: "#05070d",
		webPreferences: {
			preload: path.join(__dirname, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
			webSecurity: true,
		},
	});

	win.loadFile(resolveRendererPath());

	win.webContents.setWindowOpenHandler(({ url }) => {
		void shell.openExternal(url);
		return { action: "deny" };
	});

	if (isDev) {
		win.webContents.openDevTools({ mode: "detach" });
	}
}

function configurePermissions() {
	session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
		if (permission === "media" || permission === "microphone") {
			callback(true);
			return;
		}
		callback(false);
	});
}

app.whenReady().then(() => {
	configurePermissions();
	createMainWindow();

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createMainWindow();
		}
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
