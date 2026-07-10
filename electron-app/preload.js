/**
 * AllERP 설치형(Electron) 전용 preload.
 * - 렌더러는 웹푸시(Chrome 스타일) 대신 메인 프로세스 네이티브 알림을 사용한다.
 * - Windows 토스트 앱 이름은 AppUserModelId(com.pchos.allerp) + productName(AllERP) 기준으로 표시된다.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('allerpDesktop', {
  isElectron: true,
  showNotification: (payload) => ipcRenderer.invoke('allerp:show-notification', payload || {}),
  onNotificationClick: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, data) => {
      try {
        callback(data || {});
      } catch {
        // ignore listener errors
      }
    };
    ipcRenderer.on('allerp:notification-click', handler);
    return () => {
      try {
        ipcRenderer.removeListener('allerp:notification-click', handler);
      } catch {
        // ignore
      }
    };
  },
});
