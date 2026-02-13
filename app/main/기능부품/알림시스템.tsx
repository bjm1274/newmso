'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

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

    // 3. 푸시 구독 토큰 생성 및 Supabase에 저장
    if (registration.pushManager && Notification.permission === 'granted') {
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        // VAPID 공개키 (환경변수로 주입: NEXT_PUBLIC_VAPID_PUBLIC_KEY)
        const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        const options: PushSubscriptionOptionsInit = {
          userVisibleOnly: true,
          applicationServerKey: vapidPublicKey
            ? urlBase64ToUint8Array(vapidPublicKey)
            : undefined,
        };
        subscription = await registration.pushManager.subscribe(options);
      }

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
  } catch (error) {
    console.error('Service Worker 등록 실패:', error);
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
export default function NotificationSystem({ user }: any) {
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

      // E. 메신저 새 메시지 (방 멤버인 경우 - 본인 제외)
      const messagesChannel = supabase
        .channel('messages-realtime-hub')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload: any) => {
            if (payload.new.sender_id === user.id) return;
            const content: string = payload.new.content || '';

            // 기본값: 일반 새 메시지
            let notifType = 'message';
            let title = '💬 새 메시지';

            // @멘션: 본인 이름이 '@이름' 형태로 포함된 경우 별도 알림
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
          className={`p-4 rounded-2xl shadow-2xl border-l-4 animate-in slide-in-from-right duration-300 cursor-pointer ${
            notif.type === 'approval' ? 'bg-blue-50 border-blue-600 dark:bg-blue-950/30 dark:border-blue-500' :
            notif.type === 'inventory' ? 'bg-orange-50 border-orange-600 dark:bg-orange-950/30 dark:border-orange-500' :
            notif.type === 'payroll' ? 'bg-green-50 border-green-600 dark:bg-green-950/30 dark:border-green-500' :
            notif.type === 'message' ? 'bg-indigo-50 border-indigo-600 dark:bg-indigo-950/30 dark:border-indigo-500' :
            'bg-purple-50 border-purple-600 dark:bg-purple-950/30 dark:border-purple-500'
          }`}
          onClick={() => markAsRead(notif.id)}
        >
          <h4 className="font-black text-sm mb-1">{notif.title}</h4>
          <p className="text-xs text-gray-600">{notif.body}</p>
          <p className="text-[10px] text-gray-400 mt-2">{new Date().toLocaleTimeString()}</p>
        </div>
      ))}
    </div>
  );
}
