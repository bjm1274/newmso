'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// [채팅 실시간 알림] 웹·Android·iOS 공통
// - 인앱: 실시간 구독 + 배너(채팅알림배너) + 알림음 + 탭 제목 배지 → 권한 없어도 동작
// - 푸시: VAPID 설정 시 브라우저/홈화면 앱에서 백그라운드 푸시 (iOS 16.4+ Safari는 홈에 추가 후 지원)
// [핵심] 웹 푸시 알림 서비스 워커 등록 및 관리 + 푸시 구독 저장
export async function initNotificationService(staffId?: string) {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    console.log('이 브라우저는 푸시 알림을 지원하지 않습니다.');
    return;
  }

  try {
    // 1. Service Worker 등록
    const registration = await navigator.serviceWorker.register('/sw.js');
    console.log('✅ Service Worker 등록 완료:', registration);

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

// 짧은 알림음 (Web Audio API, 외부 파일 없이 Android/iOS 지원)
function playNotificationSound() {
  try {
    if (typeof window === 'undefined' || !window.AudioContext && !(window as any).webkitAudioContext) return;
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
export default function NotificationSystem({ user, onOpenChatRoom }: { user: any; onOpenChatRoom?: (roomId: string) => void }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // 1. 서비스 워커 초기화
    initNotificationService(user?.id);

    // 2. Supabase 실시간 구독 설정
    const setupRealtimeListeners = async () => {
      // A. 결재 승인 알림 (user가 결재자인 경우)
      const approvalsChannel = supabase
        .channel('approvals-realtime')
        // 1) 새 결재가 상신되어 내가 최초 결재자인 경우
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'approvals' },
          (payload: any) => {
            if (payload.new.approver_id === user.id && payload.new.status === '대기') {
              const notif = {
                id: payload.new.id,
                title: `📋 새 결재 요청: ${payload.new.title}`,
                body: `${payload.new.sender_name || '신청자'}님이 결재를 요청했습니다.`,
                type: 'approval',
                data: payload.new
              };
              handleNotification(notif);
            }
          }
        )
        // 2) 선행 결재자가 승인하여 "내 차례"로 넘어온 경우
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'approvals' },
          (payload: any) => {
            if (payload.new.approver_id === user.id && payload.new.status === '대기') {
              const notif = {
                id: payload.new.id,
                title: `📋 결재 차례 도착: ${payload.new.title}`,
                body: `${payload.new.sender_name || '신청자'} 문서의 결재 순서가 도착했습니다.`,
                type: 'approval',
                data: payload.new
              };
              handleNotification(notif);
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
              const notif = {
                id: payload.new.id,
                title: `⚠️ 재고 부족 경고`,
                body: `${payload.new.name}: 현재 ${payload.new.stock}개 (최소: ${payload.new.min_stock}개)`,
                type: 'inventory',
                data: payload.new
              };
              handleNotification(notif);
            }
          }
        )
        .subscribe();

      // C. 급여 정산 완료 알림
      const payrollChannel = supabase
        .channel('payroll-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'payroll' },
          (payload: any) => {
            if (payload.new.staff_id === user.id) {
              const notif = {
                id: payload.new.id,
                title: `💰 급여 정산 완료`,
                body: `${new Date().getFullYear()}년 ${new Date().getMonth() + 1}월 급여가 정산되었습니다.`,
                type: 'payroll',
                data: payload.new
              };
              handleNotification(notif);
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
            if (daysLeft <= 7 && daysLeft > 0 && payload.new.staff_id === user.id) {
              const notif = {
                id: payload.new.id,
                title: `📚 교육 이수 기한 임박`,
                body: `${payload.new.education_name}: ${daysLeft}일 남았습니다.`,
                type: 'education',
                data: payload.new
              };
              handleNotification(notif);
            }
          }
        )
        .subscribe();

      // E. 메신저 새 메시지 (내가 속한 방에서만 알림, 카카오워크 스타일)
      const messagesChannel = supabase
        .channel('messages-realtime-hub')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          async (payload: any) => {
            if (payload.new.sender_id === user.id) return;
            const roomId = payload.new.room_id;
            const { data: room } = await supabase.from('chat_rooms').select('members').eq('id', roomId).single();
            const members: string[] = Array.isArray(room?.members) ? room.members.map((id: any) => String(id)) : [];
            if (!members.includes(String(user.id))) return;

            const content: string = payload.new.content || '';
            let notifType = 'message';
            let title = '💬 새 메시지';
            if (user?.name && content.includes(`@${user.name}`)) {
              notifType = 'mention';
              title = `📣 @멘션 도착`;
            }
            const notif = {
              id: payload.new.id,
              title,
              body: (content || '📎 파일').slice(0, 50),
              type: notifType,
              data: payload.new
            };
            handleNotification(notif);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(approvalsChannel);
        supabase.removeChannel(inventoryChannel);
        supabase.removeChannel(payrollChannel);
        supabase.removeChannel(educationChannel);
        supabase.removeChannel(messagesChannel);
      };
    };

    setupRealtimeListeners();
  }, [user]);

  // 탭 제목에 읽지 않은 알림 개수 표시 (웹·모바일 공통)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const baseTitle = document.title.replace(/^\(\d+\)\s*/, '') || 'SY INC. ERP';
    document.title = unreadCount > 0 ? `(${unreadCount}) ${baseTitle}` : baseTitle;
  }, [unreadCount]);

  const handleNotification = (notif: any) => {
    // 1. 브라우저 푸시 알림 (권한 허용 시)
    sendNotification(notif.title, {
      body: notif.body,
      tag: notif.type,
      data: { ...(notif.data || {}), room_id: notif.data?.room_id },
    });

    // 2. 채팅/멘션 시 인앱 이벤트 발송 (웹·모바일 공통, 푸시 권한 없어도 토스트/배너 표시)
    if (notif.type === 'message' || notif.type === 'mention') {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp-chat-notification', {
          detail: { title: notif.title, body: notif.body, room_id: notif.data?.room_id },
        }));
      }
      // 탭이 백그라운드일 때 짧은 알림음 (Android/iOS 브라우저 호환)
      if (typeof document !== 'undefined' && document.hidden) {
        playNotificationSound();
      }
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

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {/* 읽지 않은 알림 배지 */}
      {unreadCount > 0 && (
        <div className="absolute -top-2 -right-2 bg-red-600 text-white px-2 py-1 rounded-full text-xs font-black">
          {unreadCount}
        </div>
      )}

      {/* 최근 알림 표시 */}
      {notifications.slice(0, 3).map((notif, idx) => (
        <div
          key={notif.id}
          role="button"
          tabIndex={0}
          className={`p-4 rounded-2xl shadow-2xl border-l-4 animate-in slide-in-from-right duration-300 cursor-pointer ${
            notif.type === 'approval' ? 'bg-blue-50 border-blue-600 dark:bg-blue-950/30 dark:border-blue-500' :
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
          }}
        >
          <h4 className="font-black text-sm mb-1">{notif.title}</h4>
          <p className="text-xs text-gray-600">{notif.body}</p>
          <p className="text-[10px] text-gray-400 mt-2">{new Date().toLocaleTimeString()}</p>
        </div>
      ))}
    </div>
  );
}
