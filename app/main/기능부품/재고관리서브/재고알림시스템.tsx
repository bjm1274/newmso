'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * 재고 알림 시스템 (고도화 버전)
 * - 최소 재고 수준 이하로 떨어진 품목 감지
 * - 유효기간 임박 품목 감지 (30일 이내)
 * - 행정팀에 통합 알림 전송
 */

export function useInventoryAlertSystem(inventory: any[], user: any) {
  const [lowStockItems, setLowStockItems] = useState<any[]>([]);
  const [expiryImminentItems, setExpiryImminentItems] = useState<any[]>([]);
  const [alertsSent, setAlertsSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkInventoryAndAlert();
  }, [inventory]);

  const checkInventoryAndAlert = async () => {
    if (!inventory || inventory.length === 0) return;

    // 1. 최소 재고 미달 품목 찾기
    const lowStock = inventory.filter((item: any) => item.quantity <= item.min_quantity);
    setLowStockItems(lowStock);

    // 2. 유효기간 임박 품목 찾기 (30일 이내)
    const today = new Date();
    const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiryImminent = inventory.filter((item: any) => {
      if (!item.expiry_date) return false;
      const expiry = new Date(item.expiry_date);
      return expiry > today && expiry <= thirtyDaysLater;
    });
    setExpiryImminentItems(expiryImminent);

    // 3. 새로운 알림 대상 품목 필터링
    const combinedItems = [...lowStock, ...expiryImminent];
    const newAlertItems = combinedItems.filter((item: any) => !alertsSent.has(item.id + (item.expiry_date ? '_exp' : '_stock')));

    if (newAlertItems.length > 0) {
      await sendInventoryAlerts(lowStock, expiryImminent);
      
      // 알림 보낸 품목 기록
      const newAlertsSent = new Set(alertsSent);
      lowStock.forEach((item: any) => newAlertsSent.add(item.id + '_stock'));
      expiryImminent.forEach((item: any) => newAlertsSent.add(item.id + '_exp'));
      setAlertsSent(newAlertsSent);
    }
  };

  const sendInventoryAlerts = async (lowStock: any[], expiryImminent: any[]) => {
    try {
      // 행정팀 사용자 조회
      const { data: adminUsers } = await supabase
        .from('staffs')
        .select('id')
        .or('dept.eq.행정부,dept.eq.총무팀,dept.eq.원무팀');

      if (!adminUsers || adminUsers.length === 0) return;

      const notifications = [];

      // 재고 부족 알림 생성
      if (lowStock.length > 0) {
        adminUsers.forEach((adminUser: any) => {
          notifications.push({
            user_id: adminUser.id,
            type: 'inventory_alert',
            title: '⚠️ 안전재고 미달 알림',
            body: `${lowStock.length}개 품목의 재고가 부족합니다. 발주 검토가 필요합니다.`,
            metadata: { items: lowStock.map(i => i.item_name) },
            is_read: false,
            created_at: new Date().toISOString()
          });
        });
      }

      // 유효기간 임박 알림 생성
      if (expiryImminent.length > 0) {
        adminUsers.forEach((adminUser: any) => {
          notifications.push({
            user_id: adminUser.id,
            type: 'expiry_alert',
            title: '⏰ 유효기간 임박 알림',
            body: `${expiryImminent.length}개 품목의 유효기간이 30일 이내로 남았습니다.`,
            metadata: { items: expiryImminent.map(i => i.item_name) },
            is_read: false,
            created_at: new Date().toISOString()
          });
        });
      }

      if (notifications.length > 0) {
        await supabase.from('notifications').insert(notifications);
      }
    } catch (err) {
      console.error('재고 알림 전송 실패:', err);
    }
  };

  return { lowStockItems, expiryImminentItems, alertsSent };
}

export function InventoryAlertBadge({ lowCount, expiryCount }: { lowCount: number, expiryCount: number }) {
  if (lowCount === 0 && expiryCount === 0) return null;

  return (
    <div className="fixed top-20 right-8 z-50 space-y-2">
      {lowCount > 0 && (
        <div className="bg-red-600 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-pulse">
          <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
          <div>
            <p className="text-[10px] font-black">재고 부족</p>
            <p className="text-[9px] font-bold">{lowCount}건 발생</p>
          </div>
        </div>
      )}
      {expiryCount > 0 && (
        <div className="bg-orange-500 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-pulse">
          <div className="w-2 h-2 bg-white rounded-full animate-ping"></div>
          <div>
            <p className="text-[10px] font-black">유효기간 임박</p>
            <p className="text-[9px] font-bold">{expiryCount}건 발생</p>
          </div>
        </div>
      )}
    </div>
  );
}
