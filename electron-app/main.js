const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  shell,
  powerSaveBlocker,
  ipcMain,
  Notification,
} = require('electron');
const path = require('path');
const fs = require('fs');

// Windows 토스트: AppUserModelId 는 ready 이전에 설정해야 Action Center 에 앱 이름으로 표시되고
// 클릭·포커스가 올바르게 연결된다. (ready 이후 설정 시 팝업이 안 뜨거나 익명 앱으로 뜨는 경우 있음)
if (process.platform === 'win32') {
  try {
    app.setAppUserModelId('com.pchos.allerp');
  } catch {
    // ignore
  }
}

let mainWindow;
let tray;
let powerSaveBlockerId = null;

/** @type {Map<string, import('electron').Notification>} */
const activeNotificationsByTag = new Map();

function showMainWindow() {
  if (!mainWindow) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function getAppIconPath() {
  return path.join(__dirname, 'icon-new.png');
}

function logNotification(msg) {
  try {
    const logPath = path.join(__dirname, 'permission-log.txt');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [notif] ${msg}\n`);
  } catch {
    // ignore
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      // 트레이 숨김 상태에서도 채팅 폴링·WebSocket·알림 타이머가 멈추지 않도록
      backgroundThrottling: false,
    },
  });

  // 메뉴바 숨김 (필요 시 Alt 눌러서 표시 가능하게 설정, 혹은 완전히 null)
  mainWindow.setMenuBarVisibility(false);

  // 렌더러 레벨 background throttling 도 명시적으로 끔
  try {
    mainWindow.webContents.setBackgroundThrottling(false);
  } catch {
    // older electron
  }

  // AllERP 메인 접속
  mainWindow.loadURL('https://erp.pchos.kr');

  mainWindow.on('close', (event) => {
    // 앱이 완전히 종료되는 상태가 아니라면, 창만 숨김 (트레이로 이동)
    // → 종료가 아니라 백그라운드 유지. 알림·실시간 연결이 계속 동작한다.
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray && !tray.isDestroyed()) {
        tray.displayBalloon?.({
          title: 'AllERP',
          content: '백그라운드에서 실행 중입니다. 새 메시지 알림을 받습니다.',
        });
      }
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

function registerDesktopNotificationIpc() {
  ipcMain.handle('allerp:show-notification', (_event, payload = {}) => {
    try {
      if (!Notification.isSupported()) {
        logNotification('Notification.isSupported() === false — tray balloon fallback');
        // OS 토스트 미지원 시 트레이 풍선이라도 표시
        const title = String(payload.title || 'AllERP').trim() || 'AllERP';
        const body = String(payload.body || '').trim();
        if (tray && !tray.isDestroyed() && typeof tray.displayBalloon === 'function') {
          tray.displayBalloon({ title, content: body || '새 알림이 있습니다.', icon: getAppIconPath() });
          return { ok: true, reason: 'balloon-fallback' };
        }
        return { ok: false, reason: 'unsupported' };
      }

      const title = String(payload.title || 'AllERP').trim() || 'AllERP';
      const body = String(payload.body || '').trim();
      const tag = String(payload.tag || '').trim();
      const data =
        payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
          ? payload.data
          : {};

      // 같은 tag 알림은 교체 (카카오톡/웹 푸시 tag 동작과 유사)
      if (tag && activeNotificationsByTag.has(tag)) {
        try {
          activeNotificationsByTag.get(tag)?.close();
        } catch {
          // ignore
        }
        activeNotificationsByTag.delete(tag);
      }

      const iconPath = getAppIconPath();
      const hasIcon = fs.existsSync(iconPath);
      const notification = new Notification({
        title,
        body,
        // Windows: 아이콘 경로 오류 시 토스트 자체가 안 뜨는 경우가 있어 존재할 때만 지정
        ...(hasIcon ? { icon: iconPath } : {}),
        silent: false,
        // Windows 10/11 에서 포커스 중에도 표시되도록 urgency 를 높임 (지원 시)
        urgency: 'normal',
        timeoutType: 'default',
      });

      notification.on('click', () => {
        showMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('allerp:notification-click', {
            title,
            body,
            tag,
            data,
          });
        }
      });

      notification.on('show', () => {
        logNotification(`shown: ${title} | tag=${tag || '-'}`);
      });

      notification.on('failed', (_e, error) => {
        logNotification(`failed: ${title} | ${String(error || '')}`);
        // 네이티브 토스트 실패 시 트레이 풍선 폴백
        if (tray && !tray.isDestroyed() && typeof tray.displayBalloon === 'function') {
          try {
            tray.displayBalloon({
              title,
              content: body || '새 알림이 있습니다.',
              ...(hasIcon ? { icon: iconPath } : {}),
            });
          } catch {
            // ignore
          }
        }
      });

      notification.on('close', () => {
        if (tag && activeNotificationsByTag.get(tag) === notification) {
          activeNotificationsByTag.delete(tag);
        }
      });

      if (tag) {
        activeNotificationsByTag.set(tag, notification);
      }

      notification.show();

      // 창이 트레이에 숨겨진 상태면 토스트 + 트레이 풍선 병행 (가시성 확보)
      const windowHidden =
        !mainWindow ||
        mainWindow.isDestroyed() ||
        !mainWindow.isVisible() ||
        mainWindow.isMinimized();
      if (windowHidden && tray && !tray.isDestroyed() && typeof tray.displayBalloon === 'function') {
        try {
          tray.displayBalloon({
            title,
            content: body || '새 알림이 있습니다.',
            ...(hasIcon ? { icon: iconPath } : {}),
          });
        } catch {
          // ignore balloon errors
        }
      }

      return { ok: true };
    } catch (err) {
      const message = String(err && err.message ? err.message : err || '');
      logNotification(`error: ${message}`);
      return {
        ok: false,
        reason: 'error',
        error: message,
      };
    }
  });
}

// Single Instance Lock (중복 실행 방지)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // 사용자가 두 번째 인스턴스를 실행하려고 하면
    // 기존 창을 포커스(숨겨져있다면 다시 표시)
    if (mainWindow) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // AppUserModelId 는 파일 상단(ready 이전)에서 이미 설정. 이중 호출은 무해.
    if (process.platform === 'win32') {
      try {
        app.setAppUserModelId('com.pchos.allerp');
      } catch {
        // ignore
      }
    }

    // OS가 Electron 프로세스를 절전/일시정지하지 않도록 (트레이 알림 유지)
    try {
      if (powerSaveBlockerId === null) {
        powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
      }
    } catch {
      // ignore
    }

    registerDesktopNotificationIpc();

    // 권한 요청 핸들러 설정 (마이크, 알림, 클립보드 등)
    const { session } = require('electron');
    const fs = require('fs');
    const logPath = path.join(__dirname, 'permission-log.txt');

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
        if (
          origin.includes('pchos.kr') ||
          origin.startsWith('http://localhost:') ||
          origin.startsWith('http://127.0.0.1:')
        ) {
          const matched = [
            'media',
            'audioCapture',
            'videoCapture',
            'microphone',
            'camera',
            'notifications',
            'clipboard-read',
            'clipboard-sanitized-write',
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

    session.defaultSession.setPermissionCheckHandler(
      (webContents, permission, requestingOrigin, details) => {
        try {
          writeLog(
            `Checking permission: "${permission}" for Origin: "${requestingOrigin}", details: ${JSON.stringify(details || {})}`
          );
          if (!requestingOrigin) {
            writeLog('Denied check: empty requestingOrigin');
            return false;
          }
          const origin = new URL(requestingOrigin).origin;
          if (
            origin.includes('pchos.kr') ||
            origin.startsWith('http://localhost:') ||
            origin.startsWith('http://127.0.0.1:')
          ) {
            const matched = [
              'media',
              'audioCapture',
              'videoCapture',
              'microphone',
              'camera',
              'notifications',
              'clipboard-read',
              'clipboard-sanitized-write',
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
      }
    );

    createWindow();

    // 트레이 아이콘 설정
    tray = new Tray(getAppIconPath());
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'AllERP 열기',
        click: () => {
          showMainWindow();
        },
      },
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          app.isQuitting = true;
          if (powerSaveBlockerId !== null) {
            try {
              powerSaveBlocker.stop(powerSaveBlockerId);
            } catch {
              // ignore
            }
            powerSaveBlockerId = null;
          }
          app.quit();
        },
      },
    ]);

    tray.setToolTip('AllERP (백그라운드 알림 수신 중)');
    tray.setContextMenu(contextMenu);

    // 트레이 아이콘 클릭 시 메인 창 표시
    tray.on('click', () => {
      showMainWindow();
    });
    tray.on('double-click', () => {
      showMainWindow();
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showMainWindow();
    });
  });
}

app.on('before-quit', () => {
  app.isQuitting = true;
  if (powerSaveBlockerId !== null) {
    try {
      powerSaveBlocker.stop(powerSaveBlockerId);
    } catch {
      // ignore
    }
    powerSaveBlockerId = null;
  }
});

// 트레이 숨김 모드에서는 window-all-closed 가 와도 종료하지 않음
// (close 핸들러가 hide 만 하므로 정상적으로는 여기 안 옴. 안전장치)
app.on('window-all-closed', () => {
  if (app.isQuitting) {
    if (process.platform !== 'darwin') {
      app.quit();
    }
    return;
  }
  // 트레이 유지 — quit 하지 않음
});
