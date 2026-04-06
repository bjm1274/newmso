'use client';

import { useEffect, useState } from 'react';
import { sendAdminNotifications } from '@/lib/notification-utils';

type InventoryAlertItem = {
  id?: string | number | null;
  item_id?: string | number | null;
  item_name?: string | null;
  name?: string | null;
  barcode?: string | null;
  quantity?: number | null;
  stock?: number | null;
  min_quantity?: number | null;
  min_stock?: number | null;
  expiry_date?: string | null;
};

function buildInventoryAlertKey(prefix: string, items: InventoryAlertItem[]) {
  const dateKey = new Date().toISOString().split('T')[0];
  const itemKeys = items
    .map((item) =>
      String(
        item?.id ??
          item?.item_id ??
          item?.item_name ??
          item?.name ??
          item?.barcode ??
          '',
      ).trim(),
    )
    .filter(Boolean)
    .sort();

  return itemKeys.length > 0 ? `${prefix}:${dateKey}:${itemKeys.join('|')}` : '';
}

function buildLowStockAlertId(item: InventoryAlertItem) {
  return `${String(item?.id ?? item?.item_id ?? item?.item_name ?? item?.name ?? '')}_stock`;
}

function buildExpiryAlertId(item: InventoryAlertItem) {
  return `${String(item?.id ?? item?.item_id ?? item?.item_name ?? item?.name ?? '')}_exp`;
}

export function useInventoryAlertSystem(inventory: InventoryAlertItem[], user: unknown) {
  const [lowStockItems, setLowStockItems] = useState<InventoryAlertItem[]>([]);
  const [expiryImminentItems, setExpiryImminentItems] = useState<InventoryAlertItem[]>([]);
  const [alertsSent, setAlertsSent] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!Array.isArray(inventory) || inventory.length === 0 || !user) {
      setLowStockItems([]);
      setExpiryImminentItems([]);
      return;
    }

    const lowStock = inventory.filter((item) => {
      const quantity = Number(item?.quantity ?? item?.stock ?? 0);
      const minQuantity = Number(item?.min_quantity ?? item?.min_stock ?? 0);
      return quantity <= minQuantity;
    });
    setLowStockItems(lowStock);

    const today = new Date();
    const thirtyDaysLater = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiryImminent = inventory.filter((item) => {
      if (!item?.expiry_date) return false;
      const expiry = new Date(item.expiry_date);
      return !Number.isNaN(expiry.getTime()) && expiry > today && expiry <= thirtyDaysLater;
    });
    setExpiryImminentItems(expiryImminent);

    const lowStockNewItems = lowStock.filter((item) => !alertsSent.has(buildLowStockAlertId(item)));
    const expiryNewItems = expiryImminent.filter((item) => !alertsSent.has(buildExpiryAlertId(item)));

    if (lowStockNewItems.length === 0 && expiryNewItems.length === 0) {
      return;
    }

    const dispatchAlerts = async () => {
      const alerts = [];

      if (lowStockNewItems.length > 0) {
        alerts.push({
          type: 'inventory_alert',
          title: '재고 부족 알림',
          body: `${lowStockNewItems.length}개 항목의 재고가 안전수량 이하입니다.`,
          metadata: {
            items: lowStockNewItems.map((item) => item.item_name || item.name),
          },
          dedupeKey: buildInventoryAlertKey('inventory-low-stock', lowStockNewItems),
          dedupeWindowHours: 24,
        });
      }

      if (expiryNewItems.length > 0) {
        alerts.push({
          type: 'expiry_alert',
          title: '유효기간 임박 알림',
          body: `${expiryNewItems.length}개 항목의 유효기간이 30일 이내입니다.`,
          metadata: {
            items: expiryNewItems.map((item) => item.item_name || item.name),
          },
          dedupeKey: buildInventoryAlertKey('inventory-expiry', expiryNewItems),
          dedupeWindowHours: 24,
        });
      }

      try {
        await sendAdminNotifications(alerts);
      } catch (error) {
        console.error('inventory alert dispatch failed', error);
      }

      setAlertsSent((prev) => {
        const next = new Set(prev);
        lowStockNewItems.forEach((item) => next.add(buildLowStockAlertId(item)));
        expiryNewItems.forEach((item) => next.add(buildExpiryAlertId(item)));
        return next;
      });
    };

    void dispatchAlerts();
  }, [alertsSent, inventory, user]);

  return { lowStockItems, expiryImminentItems, alertsSent };
}

export function InventoryAlertBadge({
  lowCount,
  expiryCount,
}: {
  lowCount: number;
  expiryCount: number;
}) {
  if (lowCount === 0 && expiryCount === 0) return null;

  return (
    <div className="fixed right-8 top-20 z-50 space-y-2">
      {lowCount > 0 && (
        <div className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-red-600 px-4 py-3 text-white shadow-sm animate-pulse">
          <div className="h-2 w-2 rounded-full bg-[var(--card)] animate-ping" />
          <div>
            <p className="text-[11px] font-semibold">재고 부족</p>
            <p className="text-[11px] font-bold">{lowCount}건 발생</p>
          </div>
        </div>
      )}
      {expiryCount > 0 && (
        <div className="flex items-center gap-3 rounded-[var(--radius-lg)] bg-orange-500 px-4 py-3 text-white shadow-sm animate-pulse">
          <div className="h-2 w-2 rounded-full bg-[var(--card)] animate-ping" />
          <div>
            <p className="text-[11px] font-semibold">유효기간 임박</p>
            <p className="text-[11px] font-bold">{expiryCount}건 발생</p>
          </div>
        </div>
      )}
    </div>
  );
}
