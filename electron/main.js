const { app, BrowserWindow } = require('electron');
const { startServer, PORT } = require('../server');

let backendServer;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 980,
    minHeight: 700,
    title: 'Raymond Overtime',
    backgroundColor: '#07111f',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`http://127.0.0.1:${PORT}/`);
};

app.whenReady().then(() => {
  backendServer = startServer(PORT, '127.0.0.1');
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (backendServer) {
    backendServer.close();
  }
});