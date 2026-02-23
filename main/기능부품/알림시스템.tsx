'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// base64 VAPID 키를 ArrayBuffer로 변환
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// [핵심] 웹 푸시 알림 서비스 워커 등록 및 관리
export async function initNotificationService(staffId?: string) {
  if (typeof window === 'undefined') return;
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

    // 3. 푸시 구독 (VAPID 사용)
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (registration.pushManager && Notification.permission === 'granted' && vapidPublicKey) {
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as any,
        });
      }

      if (subscription) {
        const json = subscription.toJSON();
        const { endpoint, keys } = json;
        if (endpoint && keys?.p256dh && keys?.auth) {
          await supabase.from('push_subscriptions').upsert({
            staff_id: staffId || null,
            endpoint,
            p256dh: keys.p256dh,
            auth: keys.auth,
            created_at: new Date().toISOString()
          }, { onConflict: 'staff_id,endpoint' });
          console.log('✅ 푸시 구독 정보 DB 저장 완료');
        }
      }
    }
  } catch (error) {
    console.error('Service Worker 등록/구독 실패:', error);
  }
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
export default function NotificationSystem({ user }: any) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // 1. 서비스 워커 초기화
    initNotificationService();

    // 2. Supabase 실시간 구독 설정
    const setupRealtimeListeners = async () => {
      // A. 결재 승인 알림 (user가 결재자인 경우)
      const approvalsChannel = supabase
        .channel('approvals-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'approvals' },
          (payload: any) => {
            if (payload.new.approver_id === user.id && payload.new.status === '대기') {
              const notif = {
                id: payload.new.id,
                title: `📋 새 결재 요청: ${payload.new.title}`,
                body: `${payload.new.sender_id}님이 결재를 요청했습니다.`,
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

      // E. 실시간 메시지 알림 (카카오톡 스타일)
      const messagesChannel = supabase
        .channel('messages-realtime')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload: any) => {
            if (payload.new.sender_id !== user.id) {
              const notif = {
                id: payload.new.id,
                title: `💬 새 메시지`,
                body: payload.new.content || '사진을 보냈습니다.',
                type: 'chat',
                data: payload.new
              };
              handleNotification(notif);
            }
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

  const handleNotification = (notif: any) => {
    // 1. 시스템 푸시 알림 발송
    sendNotification(notif.title, {
      body: notif.body,
      tag: notif.type,
      data: notif.data
    });

    // 2. 시스템 내 알림 리스트에 추가
    setNotifications(prev => [notif, ...prev].slice(0, 50));
    setUnreadCount(prev => prev + 1);

    // 3. Supabase에 알림 기록 저장 (선택사항)
    (async () => {
      try {
        const { error } = await supabase.from('notifications').insert([{
          user_id: user.id,
          title: notif.title,
          body: notif.body,
          type: notif.type,
          is_read: false,
          created_at: new Date().toISOString()
        }]);
        if (error) console.error('알림 저장 실패:', error);
      } catch (err) {
        console.error('알림 저장 실패:', err);
      }
    })();
  };

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  return (
    <>
      <div className="fixed top-6 right-6 z-[9999] space-y-3 w-80 pointer-events-none">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className="pointer-events-auto glass card-premium p-4 flex items-center gap-4 animate-premium-fade cursor-pointer relative overflow-hidden group shadow-premium"
            onClick={() => markAsRead(notif.id)}
          >
            {/* 장식 바 (미니멀) */}
            <div className={`absolute left-0 top-0 bottom-0 w-1 ${notif.type === 'chat' || notif.type === 'message' ? 'bg-yellow-400' :
              notif.type === 'approval' ? 'bg-blue-600' :
                notif.type === 'inventory' ? 'bg-orange-500' : 'bg-primary'
              }`}></div>

            <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-lg shrink-0 overflow-hidden shadow-inner border border-zinc-200/50">
              {notif.data?.sender_id ? (
                <div className="w-full h-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-500">
                  {notif.data?.sender_name?.[0] || '💬'}
                </div>
              ) : (
                <span>{notif.type === 'chat' || notif.type === 'message' ? '💬' : '🔔'}</span>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-0.5">
                <h4 className="font-bold text-[12px] text-foreground tracking-tight truncate">
                  {notif.type === 'chat' || notif.type === 'message' ? (notif.data?.sender_name || '새 메시지') : notif.title}
                </h4>
                <span className="text-[9px] font-medium text-zinc-400">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="text-[11px] font-normal text-zinc-600 dark:text-zinc-400 truncate leading-tight">
                {notif.body}
              </p>
            </div>

            <button className="text-zinc-300 hover:text-zinc-900 dark:hover:text-white p-1 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
          </div>
        ))}
      </div>

      {/* 푸시 구독 관리 & 테스트 UI (플로팅 버튼 스타일) */}
      <div className="fixed bottom-24 right-6 z-[9998] flex flex-col gap-2 items-end">
        {Notification.permission !== 'granted' && (
          <button
            onClick={() => initNotificationService(user?.id)}
            className="btn-premium-primary shadow-premium py-2 px-4 text-xs animate-bounce"
          >
            🔔 알림 구독하고 실시간 푸시 받기
          </button>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => {
              sendNotification("테스트 알림", {
                body: "백그라운드 푸시가 정상 작동합니다.",
                icon: "/sy-logo.png"
              });
              alert("테스트 알림을 보냈습니다. 브라우저 알림 권한을 확인해 주세요.");
            }}
            className="btn-premium-secondary shadow-sm py-2 px-3 text-[10px] glass"
          >
            🧪 알림 테스트
          </button>

          <button
            onClick={() => {
              const info = "아이폰(iOS) 유저는 '공유 > 홈 화면에 추가'를 통해 앱을 설치해야 백그라운드 알림을 받을 수 있습니다.\n\n안드로이드 유저는 지금 바로 실시간 알림을 받을 수 있습니다.";
              alert(info);
            }}
            className="btn-premium-secondary shadow-sm py-2 px-3 text-[10px] glass"
          >
            📱 모바일 가이드
          </button>
        </div>
      </div>
    </>
  );
}
