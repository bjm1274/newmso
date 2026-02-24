'use client';
import { useEffect, useState } from 'react';
import { initNotificationService } from './알림시스템';

const STORAGE_KEY = 'erp_permission_prompt_shown';

export default function PermissionPromptModal() {
  const [open, setOpen] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [gpsing, setGpsing] = useState(false);
  const [actionDone, setActionDone] = useState(false);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const shown = localStorage.getItem(STORAGE_KEY);
      if (!shown) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const close = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch { }
    setOpen(false);
  };

  const requestNotification = async () => {
    if (!('Notification' in window)) {
      alert('이 브라우저는 알림을 지원하지 않습니다.');
      return;
    }
    setNotifying(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        try {
          const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('erp_user') : null;
          const u = raw ? JSON.parse(raw) : null;
          await initNotificationService(u?.id);
        } catch (_) { }
        alert('알림이 허용되었습니다. 채팅·결재 등 푸시 알림을 받을 수 있습니다.');
        setActionDone(true);
      } else if (permission === 'denied') {
        alert('알림이 거부되었습니다. 채팅 알림은 앱 내 배너로만 표시됩니다. 브라우저 설정에서 변경할 수 있습니다.');
        setActionDone(true);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setNotifying(false);
    }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      alert('이 기기는 위치(GPS) 기능을 지원하지 않습니다.');
      return;
    }
    setGpsing(true);
    navigator.geolocation.getCurrentPosition(
      () => {
        alert('위치 권한이 허용되었습니다. 출퇴근 시 GPS 인증을 사용할 수 있습니다.');
        setGpsing(false);
        setActionDone(true);
      },
      (err) => {
        if (err.code === 1) alert('위치 권한이 거부되었습니다. 출퇴근 시 브라우저에서 다시 허용할 수 있습니다.');
        else alert('위치를 가져오지 못했습니다: ' + (err.message || '알 수 없는 오류'));
        setGpsing(false);
        setActionDone(true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--toss-card)] rounded-[12px] shadow-xl max-w-sm w-full p-6 border border-[var(--toss-border)]">
        <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">권한 안내</h3>
        <p className="text-sm text-[var(--toss-gray-4)] mb-5">
          서비스 이용을 위해 아래 권한 허용을 권장합니다.
        </p>
        <ul className="text-xs text-[var(--toss-gray-4)] space-y-2 mb-6">
          <li>• <strong>알림</strong>: 푸시 알림, 결재·채팅 등 알림 수신</li>
          <li>• <strong>위치(GPS)</strong>: 출퇴근 시 근무지 인증에 사용</li>
        </ul>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={requestNotification}
            disabled={notifying}
            className="w-full py-3 px-4 rounded-[16px] bg-[var(--toss-blue)] text-white text-sm font-bold disabled:opacity-60"
          >
            {notifying ? '요청 중…' : '🔔 알림 허용'}
          </button>
          <button
            type="button"
            onClick={requestLocation}
            disabled={gpsing}
            className="w-full py-3 px-4 rounded-[16px] bg-[#00C48C] text-white text-sm font-bold disabled:opacity-60"
          >
            {gpsing ? '요청 중…' : '📍 위치(GPS) 허용'}
          </button>
          <button
            type="button"
            onClick={close}
            className="w-full py-2.5 px-4 rounded-[16px] border border-[var(--toss-border)] text-[var(--toss-gray-4)] text-sm font-bold mt-1"
          >
            {actionDone ? '닫기' : '나중에 하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
