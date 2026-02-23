'use client';
import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

// [실시간 알림] PC 웹·모바일 웹 공통 (카카오톡처럼 즉시 반응)
// - 인앱: Supabase Realtime 구독 + 상단 배너(채팅알림배너) + 알림음 + 진동(모바일) + 탭 제목 배지 → 권한 없어도 동작
// - 푸시: VAPID 설정 시 브라우저/홈화면에서 백그라운드 푸시 (iOS 16.4+ Safari는 홈에 추가 후 지원)
export async function initNotificationService(staffId?: string) {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    return; // 인앱 실시간은 Supabase 채널로 동작, 푸시만 미지원
  }
  // 보안 컨텍스트(HTTPS 또는 localhost)에서만 SW 등록
  if (!window.isSecureContext) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');

    // 2. 사용자 알림 권한 요청
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      console.log('알림 권한:', permission);
    }

    // 3. 푸시 구독: VAPID가 있을 때만 구독 (없으면 스킵해 등록 실패 방지, Android/iOS 호환)
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (registration.pushManager && Notification.permission === 'granted' && vapidPublicKey) {
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        try {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          });
        } catch (e) {
          console.warn('푸시 구독 실패(권한/환경 확인):', e);
        }
      }

      if (subscription) {
        try {
          const json: any = subscription.toJSON();
          const endpoint: string = json.endpoint;
          const p256dh: string = json.keys?.p256dh || '';
          const auth: string = json.keys?.auth || '';

          if (endpoint && p256dh && auth) {
            await supabase
              .from('push_subscriptions')
              .upsert(
                {
                  staff_id: staffId || null,
                  endpoint,
                  p256dh,
                  auth,
                },
                { onConflict: 'staff_id,endpoint' }
              );
            console.log('✅ 푸시 구독 정보 저장 완료');
          }
        } catch (e) {
          console.error('푸시 구독 정보 저장 실패:', e);
        }
      }
    } else if (!vapidPublicKey) {
      console.log('ℹ️ VAPID 키 미설정 — 인앱·실시간 알림만 사용 (푸시는 환경변수 설정 시 활성화)');
    }
  } catch (error) {
    console.error('Service Worker 등록 실패:', error);
  }
}

// 짧은 알림음 (Web Audio API, PC·모바일 웹 공통, 카카오톡처럼 실시간 반응)
function playNotificationSound() {
  try {
    if (typeof window === 'undefined' || (!window.AudioContext && !(window as any).webkitAudioContext)) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // ignore
  }
}

// 모바일 웹: 짧은 진동 (지원 시에만, PC는 no-op)
function vibrateIfSupported() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(200);
    }
  } catch {
    // ignore
  }
}

// base64 VAPID 키를 ArrayBuffer로 변환 (Push API에서 요구하는 형식)
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

// [핵심] 실시간 알림 발송 함수
export function sendNotification(title: string, options?: NotificationOptions) {
  if (Notification.permission === 'granted') {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification(title, {
          icon: '/sy-logo.png',
          badge: '/badge-72x72.png',
          tag: 'notification',
          requireInteraction: true, // 사용자가 닫을 때까지 유지
          ...options
        });
      });
    } else {
      new Notification(title, options);
    }
  }
}

// [핵심] 실시간 데이터 변경 감지 및 알림 발송
export default function NotificationSystem({
  user,
  onOpenChatRoom,
  onOpenApproval,
}: { user: any; onOpenChatRoom?: (roomId: string) => void; onOpenApproval?: () => void }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const shownNotifIdsRef = useRef<Set<string>>(new Set());
  const lastHiddenAtRef = useRef<number>(0);
  const handleNotificationRef = useRef<(notif: any) => void>(() => {});
  const handleNotificationFromServerRef = useRef<(notif: any) => void>(() => {});

  useEffect(() => {
    if (!user?.id) return;
    initNotificationService(user.id);

    const uid = String(user.id);
    const fireNotif = (notif: any) => handleNotificationRef.current(notif);
    const fireNotifFromServer = (notif: any) => handleNotificationFromServerRef.current(notif);

    // A. 결재 승인 알림 (user가 결재자인 경우)
    const approvalsChannel = supabase
      .channel('approvals-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'approvals' },
        (payload: any) => {
          if (String(payload.new.approver_id) === uid && payload.new.status === '대기') {
            fireNotif({
              id: payload.new.id,
              title: `📋 새 결재 요청: ${payload.new.title}`,
              body: `${payload.new.sender_name || '신청자'}님이 결재를 요청했습니다.`,
              type: 'approval',
              data: payload.new
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'approvals' },
        (payload: any) => {
          if (String(payload.new.approver_id) === uid && payload.new.status === '대기') {
            fireNotif({
              id: payload.new.id,
              title: `📋 결재 차례 도착: ${payload.new.title}`,
              body: `${payload.new.sender_name || '신청자'} 문서의 결재 순서가 도착했습니다.`,
              type: 'approval',
              data: payload.new
            });
          }
        }
      )
      .subscribe();

    // B. 재고 부족 알림 (담당자용)
    const inventoryChannel = supabase
      .channel('inventory-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'inventory' },
        (payload: any) => {
          if (payload.new.stock <= payload.new.min_stock && user.department === '행정팀') {
            fireNotif({
              id: payload.new.id,
              title: `⚠️ 재고 부족 경고`,
              body: `${payload.new.name}: 현재 ${payload.new.stock}개 (최소: ${payload.new.min_stock}개)`,
              type: 'inventory',
              data: payload.new
            });
          }
        }
      )
      .subscribe();

    // C. 급여 정산 완료 알림 (payroll_records 테이블 기준)
    const payrollChannel = supabase
      .channel('payroll-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'payroll_records' },
        (payload: any) => {
          if (String(payload.new.staff_id) === uid) {
            fireNotif({
              id: payload.new.id,
              title: `💰 급여 정산 완료`,
              body: `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 급여가 정산되었습니다.`,
              type: 'payroll',
              data: payload.new
            });
          }
        }
      )
      .subscribe();

    // D. 교육 이수 기한 임박 알림
    const educationChannel = supabase
      .channel('education-realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'education_records' },
        (payload: any) => {
          const daysLeft = Math.ceil((new Date(payload.new.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 7 && daysLeft > 0 && String(payload.new.staff_id) === uid) {
            fireNotif({
              id: payload.new.id,
              title: `📚 교육 이수 기한 임박`,
              body: `${payload.new.education_name}: ${daysLeft}일 남았습니다.`,
              type: 'education',
              data: payload.new
            });
          }
        }
      )
      .subscribe();

    // E. 메신저 새 메시지 — 실시간, 발신자 이름 바로 표시 (PC·모바일 웹 공통)
    const messagesChannel = supabase
      .channel('messages-realtime-hub')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: any) => {
          const msg = payload.new;
          if (String(msg.sender_id) === uid) return;
          const roomId = msg.room_id;
          const [roomRes, senderRes] = await Promise.all([
            supabase.from('chat_rooms').select('members').eq('id', roomId).single(),
            msg.sender_id ? supabase.from('staff_members').select('name').eq('id', msg.sender_id).maybeSingle() : Promise.resolve({ data: null }),
          ]);
          const members: string[] = Array.isArray(roomRes.data?.members) ? roomRes.data.members.map((id: any) => String(id)) : [];
          if (!members.includes(uid)) return;

          const senderName = (senderRes.data as any)?.name || '알 수 없음';
          const content: string = msg.content || '';
          let notifType = 'message';
          let title = `💬 ${senderName}`;
          if (user?.name && content.includes(`@${user.name}`)) {
            notifType = 'mention';
            title = `📣 ${senderName}님이 멘션`;
          }
          const bodyText = (content || '📎 파일').trim().slice(0, 50);
          fireNotif({ id: msg.id, title, body: bodyText, type: notifType, data: msg });
        }
      )
      .subscribe();

    // F. 서버 발송 알림 실시간 수신 (연차촉진 등) — filter 문자열 통일
    const notificationsTableChannel = supabase
      .channel(`notifications-realtime-${uid}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
        (payload: any) => {
          const row = payload.new;
          fireNotifFromServer({
            id: row.id,
            title: row.title || '알림',
            body: row.body || '',
            type: row.type || 'notification',
            data: row.metadata || {},
          });
        }
      )
      .subscribe();

    // G. 출퇴근 실시간 알림 (내 기록 INSERT/UPDATE 시 즉시)
    const attendanceChannel = supabase
      .channel('attendance-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        (payload: any) => {
          if (String(payload.new?.staff_id) !== uid) return;
          const s = payload.new.status;
          const isCheckOut = payload.new.check_out != null;
          let title = '⏰ 출퇴근';
          let body = '기록이 반영되었습니다.';
          if (s === '지각') {
            title = '⏰ 지각 등록';
            body = '오늘 출근이 지각으로 기록되었습니다.';
          } else if (isCheckOut) {
            title = '⏰ 퇴근 처리됨';
            body = '퇴근이 기록되었습니다.';
          } else {
            title = '⏰ 출근 처리됨';
            body = s === '정상' ? '정상 출근이 기록되었습니다.' : '출근이 기록되었습니다.';
          }
          fireNotif({ id: payload.new.id || payload.new.date, title, body, type: 'attendance', data: payload.new });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(approvalsChannel);
      supabase.removeChannel(inventoryChannel);
      supabase.removeChannel(payrollChannel);
      supabase.removeChannel(educationChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(notificationsTableChannel);
      supabase.removeChannel(attendanceChannel);
    };
  }, [user]);

  // 모바일: 앱이 백그라운드였다가 다시 보이면 놓친 알림 보충 (Realtime 연결 끊김 대비)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lastHiddenAtRef.current = Date.now();
        return;
      }
      if (document.visibilityState !== 'visible' || !user?.id) return;
      const hiddenDuration = Date.now() - lastHiddenAtRef.current;
      if (hiddenDuration < 2000) return; // 2초 미만이면 스킵

      const since = new Date(Date.now() - 60 * 1000).toISOString(); // 최근 1분
      supabase
        .from('notifications')
        .select('id, title, body, type, metadata, created_at')
        .eq('user_id', user.id)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data: rows }) => {
          if (!rows?.length) return;
          rows.forEach((row: any) => {
            if (shownNotifIdsRef.current.has(row.id)) return;
            shownNotifIdsRef.current.add(row.id);
            handleNotificationFromServer({
              id: row.id,
              title: row.title || '알림',
              body: row.body || '',
              type: row.type || 'notification',
              data: row.metadata || {},
            });
          });
        });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [user?.id]);

  // 탭 제목에 읽지 않은 알림 개수 표시 (웹·모바일 공통)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, '') || 'SY INC. ERP';
    document.title = unreadCount > 0 ? `(${unreadCount}) ${baseTitle}` : baseTitle;
  }, [unreadCount]);

  // 서버에서 notifications 테이블에 insert된 알림(연차촉진 등) 수신 시 — DB 저장 없이 즉시 표시
  const handleNotificationFromServer = (notif: any) => {
    if (notif.id) shownNotifIdsRef.current.add(String(notif.id));
    sendNotification(notif.title, { body: notif.body, tag: notif.type, data: notif.data });
    setNotifications(prev => [notif, ...prev].slice(0, 50));
    setUnreadCount(prev => prev + 1);
    // 카카오톡처럼 포그라운드에서도 알림음·진동 (PC 웹: 소리만, 모바일 웹: 소리+진동)
    playNotificationSound();
    vibrateIfSupported();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('erp-alert', {
        detail: { title: notif.title, body: notif.body, type: notif.type, data: notif.data },
      }));
    }
  };
  handleNotificationFromServerRef.current = handleNotificationFromServer;

  const handleNotification = (notif: any) => {
    // 1. 브라우저 푸시 알림 (권한 허용 시)
    sendNotification(notif.title, {
      body: notif.body,
      tag: notif.type,
      data: { ...(notif.data || {}), room_id: notif.data?.room_id },
    });

    // 2. 채팅/멘션 시 인앱 이벤트 발송 (PC·모바일 웹 공통)
    if (notif.type === 'message' || notif.type === 'mention') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp-chat-notification', {
          detail: { title: notif.title, body: notif.body, room_id: notif.data?.room_id },
        }));
      }
      playNotificationSound();
      vibrateIfSupported();
    } else if (notif.type === 'approval' || notif.type === 'attendance') {
      // 전자결재·출퇴근도 인앱 배너로 즉시 표시
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp-alert', {
          detail: { title: notif.title, body: notif.body, type: notif.type, data: notif.data },
        }));
      }
      playNotificationSound();
      vibrateIfSupported();
    } else {
      // 재고·급여·교육 등
      playNotificationSound();
      vibrateIfSupported();
    }

    // 3. 시스템 내 알림 리스트에 추가
    setNotifications(prev => [notif, ...prev].slice(0, 50));
    setUnreadCount(prev => prev + 1);

    // 4. Supabase에 알림 기록 저장 (채팅 알림은 metadata.room_id로 클릭 시 해당 채팅방 이동)
    (async () => {
      try {
        const row: Record<string, unknown> = {
          user_id: user.id,
          title: notif.title,
          body: notif.body,
          type: notif.type,
          is_read: false,
          created_at: new Date().toISOString(),
        };
        if ((notif.type === 'message' || notif.type === 'mention') && notif.data?.room_id) {
          row.metadata = { room_id: notif.data.room_id };
        }
        const { error } = await supabase.from('notifications').insert([row]);
        if (error) console.error('알림 저장 실패:', error);
      } catch (err) {
        console.error('알림 저장 실패:', err);
      }
    })();
  };
  handleNotificationRef.current = handleNotification;

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  return (
    <div className="fixed bottom-20 right-4 md:bottom-4 z-50 space-y-2 max-w-sm">
      {/* 읽지 않은 알림 배지 */}
      {unreadCount > 0 && (
        <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-1 rounded-full text-xs font-semibold">
          {unreadCount}
        </div>
      )}

      {/* 최근 알림 표시 */}
      {notifications.slice(0, 3).map((notif, idx) => (
        <div
          key={notif.id}
          role="button"
          tabIndex={0}
          className={`p-4 rounded-lg shadow-2xl border-l-4 animate-in slide-in-from-right duration-300 cursor-pointer ${
            notif.type === 'approval' ? 'bg-[var(--toss-blue-light)] border-[var(--toss-blue)]' :
            notif.type === 'inventory' ? 'bg-orange-50 border-orange-600 dark:bg-orange-950/30 dark:border-orange-500' :
            notif.type === 'payroll' ? 'bg-green-50 border-green-600 dark:bg-green-950/30 dark:border-green-500' :
            notif.type === 'message' ? 'bg-indigo-50 border-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-500' :
            'bg-purple-50 border-purple-600 dark:bg-purple-950/30 dark:border-purple-500'
          }`}
          onClick={() => {
            markAsRead(notif.id);
            if ((notif.type === 'message' || notif.type === 'mention') && notif.data?.room_id && onOpenChatRoom) {
              onOpenChatRoom(notif.data.room_id);
            }
            if (notif.type === 'approval' && onOpenApproval) onOpenApproval();
          }}
        >
          <h4 className="font-semibold text-sm mb-1">{notif.title}</h4>
          <p className="text-xs text-[var(--toss-gray-4)]">{notif.body}</p>
          <p className="text-[10px] text-[var(--toss-gray-3)] mt-2">{new Date().toLocaleTimeString()}</p>
        </div>
      ))}
    </div>
  );
}
