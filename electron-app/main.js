const { app, BrowserWindow, Tray, Menu, shell } = require('electron');
const path = require('path');

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, 'icon-new.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false // 백그라운드에서도 PWA 타이머가 정상 작동하도록
    }
  });

  // 메뉴바 숨김 (필요 시 Alt 눌러서 표시 가능하게 설정, 혹은 완전히 null)
  mainWindow.setMenuBarVisibility(false);

  // AllERP 메인 접속
  mainWindow.loadURL('https://erp.pchos.kr');

  mainWindow.on('close', (event) => {
    // 앱이 완전히 종료되는 상태가 아니라면, 창만 숨김 (트레이로 이동)
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  // 새 창 열기 (외부 링크, 파일 다운로드 등)는 기본 브라우저 사용
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    // about:blank, blob:, data: 등은 Electron 내부에서 처리하도록 허용 (인쇄 및 다운로드 등 지원)
    return { action: 'allow' };
  });
}

// Single Instance Lock (중복 실행 방지)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // 사용자가 두 번째 인스턴스를 실행하려고 하면 
    // 기존 창을 포커스(숨겨져있다면 다시 표시)
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // 윈도우 알림 등록 (앱 ID 지정 - 알림 클릭 시 동작을 위해 필요)
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.pchos.allerp');
    }

    // 권한 요청 핸들러 설정 (마이크, 알림, 클립보드 등)
    const { session } = require('electron');
    const fs = require('fs');
    const logPath = 'd:\\newmso\\electron-app\\permission-log.txt';

    function writeLog(msg) {
      try {
        const timestamp = new Date().toISOString();
        fs.appendFileSync(logPath, `[${timestamp}] ${msg}\n`);
      } catch (err) {
        // ignore log write errors
      }
    }

    writeLog('Electron whenReady triggered');
    
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      try {
        const url = webContents.getURL();
        writeLog(`Requesting permission: "${permission}" for URL: "${url}"`);
        if (!url) {
          writeLog('Denied: empty URL');
          return callback(false);
        }
        const origin = new URL(url).origin;
        writeLog(`Origin: "${origin}"`);
        if (origin.includes('pchos.kr') || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          const matched = [
            'media',
            'audioCapture',
            'videoCapture',
            'microphone',
            'camera',
            'notifications',
            'clipboard-read',
            'clipboard-sanitized-write'
          ].includes(permission);
          
          if (matched) {
            writeLog(`Granted permission: "${permission}"`);
            return callback(true);
          } else {
            writeLog(`Skipped match for permission: "${permission}"`);
          }
        } else {
          writeLog(`Denied: Origin "${origin}" not allowed`);
        }
      } catch (err) {
        writeLog(`Permission request error: ${err.message}`);
        console.error('Permission request error:', err);
      }
      callback(false);
    });

    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
      try {
        writeLog(`Checking permission: "${permission}" for Origin: "${requestingOrigin}", details: ${JSON.stringify(details || {})}`);
        if (!requestingOrigin) {
          writeLog('Denied check: empty requestingOrigin');
          return false;
        }
        const origin = new URL(requestingOrigin).origin;
        if (origin.includes('pchos.kr') || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          const matched = [
            'media',
            'audioCapture',
            'videoCapture',
            'microphone',
            'camera',
            'notifications',
            'clipboard-read',
            'clipboard-sanitized-write'
          ].includes(permission);

          if (matched) {
            writeLog(`Granted check: "${permission}"`);
            return true;
          }
        }
      } catch (err) {
        writeLog(`Permission check error: ${err.message}`);
        console.error('Permission check error:', err);
      }
      return false;
    });

    createWindow();

    // 트레이 아이콘 설정
    tray = new Tray(path.join(__dirname, 'icon-new.png'));
    const contextMenu = Menu.buildFromTemplate([
      { label: 'AllERP 열기', click: () => { if (mainWindow) mainWindow.show(); } },
      { type: 'separator' },
      { label: '종료', click: () => { app.isQuitting = true; app.quit(); } }
    ]);
    
    tray.setToolTip('AllERP');
    tray.setContextMenu(contextMenu);
    
    // 트레이 아이콘 클릭 시 메인 창 표시
    tray.on('click', () => {
      if (mainWindow) {
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.focus();
      }
    });
    
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('before-quit', () => {
  app.isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
