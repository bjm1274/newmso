'use client';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { sound } from '@/lib/sounds';

/**
 * [실시간 알림 엔진]
 * - 역할: 데이터베이스 리얼타임 감지, 알림 생성 및 저장, 사운드 발송, 브라우저 배지 관리
 */

export async function initNotificationService(staffId?: string) {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return;
  if (!window.isSecureContext) return;

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }

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
          console.warn('푸시 구독 실패:', e);
        }
      }
      if (subscription) {
        const json: any = subscription.toJSON();
        await supabase.from('push_subscriptions').upsert({
          staff_id: staffId || null,
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh || '',
          auth: json.keys?.auth || '',
        }, { onConflict: 'staff_id,endpoint' });
      }
    }
  } catch (error) {
    console.error('SW 등록 실패:', error);
  }
}

function setAppBadge(count: number) {
  try {
    if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
      (navigator as any).setAppBadge(count).catch(() => { });
    }
  } catch { /* ignore */ }
}

function vibrateIfSupported() {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate([100, 30, 100]);
    }
  } catch { /* ignore */ }
}

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

export function sendNotification(title: string, options?: NotificationOptions) {
  if (typeof window !== 'undefined' && Notification.permission === 'granted') {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(reg => {
        reg.showNotification(title, {
          icon: '/sy-logo.png',
          badge: '/badge-72x72.png',
          tag: 'erp-noti',
          requireInteraction: true,
          ...options
        });
      });
    } else {
      new Notification(title, options);
    }
  }
}

export default function NotificationSystem({
  user,
  onOpenChatRoom,
  onOpenMessage,
  onOpenApproval,
  onOpenBoard,
  onOpenPost,
}: {
  user: any;
  onOpenChatRoom?: (roomId: string) => void;
  onOpenMessage?: (roomId: string, messageId: string) => void;
  onOpenApproval?: () => void;
  onOpenBoard?: (boardId?: string) => void;
  onOpenPost?: (boardId: string, postId: string) => void;
}) {
  const shownNotifIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.id) return;

    const uid = String(user.id);
    initNotificationService(uid);

    const syncBadge = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid)
        .is('read_at', null);
      if (count !== null) setAppBadge(count);
    };
    syncBadge();

    const nTableChannel = supabase
      .channel(`noti-db-${uid}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, (payload) => {
        const row = payload.new;
        if (shownNotifIdsRef.current.has(row.id)) return;
        shownNotifIdsRef.current.add(row.id);

        window.dispatchEvent(new CustomEvent('erp-new-notification', { detail: row }));

        if (row.type === 'message' || row.type === 'mention') {
          sound.playTalk();
          window.dispatchEvent(new CustomEvent('erp-chat-notification', {
            detail: { title: row.title, body: row.body, room_id: row.metadata?.room_id }
          }));
        } else {
          sound.playSystem();
          window.dispatchEvent(new CustomEvent('erp-alert', {
            detail: { title: row.title, body: row.body, type: row.type, data: row.metadata }
          }));
        }
        vibrateIfSupported();
        syncBadge();

        sendNotification(row.title, { body: row.body, data: row.metadata, tag: row.type });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` }, () => {
        syncBadge();
      })
      .subscribe();

    const insertNoti = async (n: { type: string; title: string; body: string; data?: any }) => {
      await supabase.from('notifications').insert([{
        user_id: uid,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.data,
        read_at: null
      }]);
    };

    const approvalsCh = supabase
      .channel('approvals-trigger')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'approvals' }, (p: any) => {
        if (String(p.new.current_approver_id) === uid && p.new.status === '대기') {
          insertNoti({
            type: 'approval',
            title: `📋 새 결재 요청: ${p.new.title}`,
            body: `${p.new.sender_name || '신청자'}님이 결재를 요청했습니다.`,
            data: { id: p.new.id, type: 'approval' }
          });
        }
      })
      .subscribe();

    const inventoryCh = supabase
      .channel('inventory-trigger')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inventory' }, (p: any) => {
        if (p.new.stock <= p.new.min_stock && (user.permissions?.inventory || user.department === '행정팀')) {
          insertNoti({
            type: 'inventory',
            title: `⚠️ 재고 부족 경고`,
            body: `${p.new.item_name || p.new.name}: 현재 ${p.new.stock}개 (최소: ${p.new.min_stock}개)`,
            data: { id: p.new.id, type: 'inventory' }
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(nTableChannel);
      supabase.removeChannel(approvalsCh);
      supabase.removeChannel(inventoryCh);
    };
  }, [user?.id]);

  return null;
}
