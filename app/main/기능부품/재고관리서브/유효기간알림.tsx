'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { sendAdminNotifications } from '@/lib/notification-utils';

type InventoryExpiryItem = Record<string, any>;

function getItemName(item: InventoryExpiryItem) {
  return String(item?.item_name || item?.name || '미등록 품목');
}

function getItemQuantity(item: InventoryExpiryItem) {
  const raw = item?.stock ?? item?.quantity ?? 0;
  return Number.isFinite(Number(raw)) ? Number(raw) : 0;
}

function getItemSupplier(item: InventoryExpiryItem) {
  return String(item?.supplier || item?.supplier_name || '-');
}

function getItemExpiryDate(item: InventoryExpiryItem) {
  return String(item?.expiration_date || item?.expiry_date || '').trim();
}

function buildExpirationSummaryAlertKey(
  expiring: InventoryExpiryItem[],
  expired: InventoryExpiryItem[],
) {
  const dateKey = new Date().toISOString().split('T')[0];
  const itemKeys = [...expiring, ...expired]
    .map((item) =>
      String(
        item?.id ||
          item?.item_id ||
          item?.barcode ||
          getItemName(item),
      ).trim(),
    )
    .filter(Boolean)
    .sort();

  return itemKeys.length > 0
    ? `inventory-expiration-summary:${dateKey}:${itemKeys.join('|')}`
    : '';
}

export default function ExpirationAlert() {
  const [expiringItems, setExpiringItems] = useState<InventoryExpiryItem[]>([]);
  const [expiredItems, setExpiredItems] = useState<InventoryExpiryItem[]>([]);
  const [alertsSent, setAlertsSent] = useState(0);
  const [lastCheckTime, setLastCheckTime] = useState<string | null>(null);

  useEffect(() => {
    void checkExpirationStatus();
    const interval = setInterval(() => {
      void checkExpirationStatus();
    }, 24 * 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const checkExpirationStatus = async () => {
    const today = new Date();
    const todayKey = today.toISOString().split('T')[0];
    const sixMonthsLater = new Date(
      today.getTime() + 6 * 30 * 24 * 60 * 60 * 1000,
    );
    const sixMonthsLaterKey = sixMonthsLater.toISOString().split('T')[0];

    const { data: expiring } = await supabase
      .from('inventory')
      .select('*')
      .lte('expiration_date', sixMonthsLaterKey)
      .gte('expiration_date', todayKey);

    const { data: expired } = await supabase
      .from('inventory')
      .select('*')
      .lt('expiration_date', todayKey);

    const nextExpiring = Array.isArray(expiring) ? expiring : [];
    const nextExpired = Array.isArray(expired) ? expired : [];

    setExpiringItems(nextExpiring);
    setExpiredItems(nextExpired);
    setLastCheckTime(new Date().toLocaleString('ko-KR'));

    if (nextExpiring.length > 0 || nextExpired.length > 0) {
      const count = await sendAdminNotifications([
        {
          type: 'expiration_alert',
          title: `⚠️ 유효기간 임박 ${nextExpiring.length}건 · 만료 ${nextExpired.length}건`,
          body: `유효기간 6개월 이내 ${nextExpiring.length}건, 만료 ${nextExpired.length}건입니다.`,
          metadata: {
            expiring_count: nextExpiring.length,
            expired_count: nextExpired.length,
            expiring_items: nextExpiring.map(getItemName),
            expired_items: nextExpired.map(getItemName),
          },
          dedupeKey: buildExpirationSummaryAlertKey(nextExpiring, nextExpired),
          dedupeWindowHours: 24,
        },
      ]);
      setAlertsSent(count);
    } else {
      setAlertsSent(0);
    }
  };

  const calculateDaysUntilExpiration = (expirationDate: string) => {
    const today = new Date();
    const expDate = new Date(expirationDate);
    const diffTime = expDate.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getAlertColor = (daysLeft: number) => {
    if (daysLeft < 0) return 'bg-red-500/10 border-red-500/20';
    if (daysLeft < 30) return 'bg-red-500/10 border-red-500/20';
    if (daysLeft < 90) return 'bg-orange-500/10 border-orange-500/20';
    return 'bg-yellow-500/10 border-yellow-500/20';
  };

  const getAlertBadge = (daysLeft: number) => {
    if (daysLeft < 0) return { text: '만료', color: 'bg-red-500/20 text-red-600' };
    if (daysLeft < 30) return { text: '긴급', color: 'bg-red-500/20 text-red-600' };
    if (daysLeft < 90) return { text: '주의', color: 'bg-orange-500/20 text-orange-600' };
    return { text: '경고', color: 'bg-yellow-500/20 text-yellow-600' };
  };

  const downloadExpirationReport = () => {
    const allItems = [...expiringItems, ...expiredItems];
    const csv = [
      ['품목명', '수량', '유효기간', '남은일수', '상태', '공급처'].join(','),
      ...allItems.map((item) => {
        const expiryDate = getItemExpiryDate(item);
        const daysLeft = calculateDaysUntilExpiration(expiryDate);
        return [
          getItemName(item),
          getItemQuantity(item),
          expiryDate,
          daysLeft,
          daysLeft < 0 ? '만료' : '임박',
          getItemSupplier(item),
        ].join(',');
      }),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `유효기간알림_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-yellow-500/10 p-3 rounded-[var(--radius-md)] border border-yellow-500/20">
          <p className="text-xs font-bold text-yellow-600 mb-1">임박 품목</p>
          <p className="text-lg font-bold text-yellow-800">{expiringItems.length}건</p>
          <p className="text-xs text-yellow-600 mt-0.5">6개월 이내 만료</p>
        </div>
        <div className="bg-red-500/10 p-3 rounded-[var(--radius-md)] border border-red-500/20">
          <p className="text-xs font-bold text-red-600 mb-1">만료 품목</p>
          <p className="text-lg font-bold text-red-800">{expiredItems.length}건</p>
          <p className="text-xs text-red-600 mt-0.5">즉시 폐기 필요</p>
        </div>
        <div className="bg-blue-500/10 p-3 rounded-[var(--radius-md)] border border-blue-500/20">
          <p className="text-xs font-bold text-[var(--accent)] mb-1">알림 발송</p>
          <p className="text-lg font-bold text-blue-800">{alertsSent}건</p>
          <p className="text-xs text-[var(--accent)] mt-0.5">오늘 중복 발송 제외</p>
        </div>
        <div className="bg-green-500/10 p-3 rounded-[var(--radius-md)] border border-green-500/20">
          <p className="text-xs font-bold text-green-600 mb-1">마지막 확인</p>
          <p className="text-sm font-semibold text-green-800">
            {lastCheckTime || '확인 대기중'}
          </p>
          <p className="text-xs text-green-600 mt-0.5">24시간마다 자동 점검</p>
        </div>
      </div>

      <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)] flex justify-between items-center">
          <h3 className="text-sm font-bold text-[var(--foreground)]">
            유효기간 6개월 이내 품목
          </h3>
          <button
            onClick={downloadExpirationReport}
            className="px-3 py-1.5 bg-gray-600 text-white rounded-[var(--radius-md)] text-xs font-semibold hover:bg-gray-700 transition-all"
          >
            보고서 다운로드
          </button>
        </div>

        {expiringItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] border-b border-[var(--border)]">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-[var(--toss-gray-3)] text-[10px] uppercase">품목명</th>
                  <th className="px-4 py-2 text-center font-semibold text-[var(--toss-gray-3)] text-[10px] uppercase">현재고</th>
                  <th className="px-4 py-2 text-center font-semibold text-[var(--toss-gray-3)] text-[10px] uppercase">유효기간</th>
                  <th className="px-4 py-2 text-center font-semibold text-[var(--toss-gray-3)] text-[10px] uppercase">남은 일수</th>
                  <th className="px-4 py-2 text-center font-semibold text-[var(--toss-gray-3)] text-[10px] uppercase">상태</th>
                  <th className="px-4 py-2 text-left font-semibold text-[var(--toss-gray-3)] text-[10px] uppercase">공급처</th>
                </tr>
              </thead>
              <tbody>
                {expiringItems.map((item) => {
                  const expiryDate = getItemExpiryDate(item);
                  const daysLeft = calculateDaysUntilExpiration(expiryDate);
                  const badge = getAlertBadge(daysLeft);
                  return (
                    <tr key={String(item.id || `${getItemName(item)}-${expiryDate}`)} className={`border-b border-[var(--border)] ${getAlertColor(daysLeft)}`}>
                      <td className="px-4 py-2 font-bold text-[var(--foreground)]">{getItemName(item)}</td>
                      <td className="px-4 py-2 text-center font-bold text-[var(--foreground)]">{getItemQuantity(item)}개</td>
                      <td className="px-4 py-2 text-center font-bold text-[var(--foreground)]">
                        {expiryDate ? new Date(expiryDate).toLocaleDateString('ko-KR') : '-'}
                      </td>
                      <td className="px-4 py-2 text-center font-semibold text-red-600">
                        {daysLeft < 0 ? '만료' : `${daysLeft}일`}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded-[var(--radius-md)] text-xs font-semibold ${badge.color}`}>
                          {badge.text}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-left text-[var(--toss-gray-4)]">{getItemSupplier(item)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 text-center">
            <p className="text-[var(--toss-gray-3)] font-bold">
              유효기간 6개월 이내 품목이 없습니다.
            </p>
          </div>
        )}
      </div>

      {expiredItems.length > 0 && (
        <div className="bg-[var(--card)] border border-red-500/20 shadow-sm rounded-[var(--radius-lg)] overflow-hidden">
          <div className="px-4 py-3 border-b border-red-500/20 bg-red-500/10">
            <h3 className="text-sm font-bold text-red-800">유효기간 만료 품목</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-red-500/10 border-b border-red-500/20">
                <tr>
                  <th className="px-4 py-2 text-left text-[10px] font-semibold text-red-700 uppercase">품목명</th>
                  <th className="px-4 py-2 text-center text-[10px] font-semibold text-red-700 uppercase">현재고</th>
                  <th className="px-4 py-2 text-center text-[10px] font-semibold text-red-700 uppercase">만료일</th>
                  <th className="px-4 py-2 text-center text-[10px] font-semibold text-red-700 uppercase">경과일</th>
                  <th className="px-4 py-2 text-left text-[10px] font-semibold text-red-700 uppercase">공급처</th>
                </tr>
              </thead>
              <tbody>
                {expiredItems.map((item) => {
                  const expiryDate = getItemExpiryDate(item);
                  const daysExpired = Math.abs(calculateDaysUntilExpiration(expiryDate));
                  return (
                    <tr key={String(item.id || `${getItemName(item)}-${expiryDate}`)} className="border-b border-red-100 hover:bg-red-500/10">
                      <td className="px-4 py-2 font-bold text-red-800">{getItemName(item)}</td>
                      <td className="px-4 py-2 text-center font-bold text-red-800">{getItemQuantity(item)}개</td>
                      <td className="px-4 py-2 text-center font-bold text-red-800">
                        {expiryDate ? new Date(expiryDate).toLocaleDateString('ko-KR') : '-'}
                      </td>
                      <td className="px-4 py-2 text-center font-semibold text-red-600">{daysExpired}일 경과</td>
                      <td className="px-4 py-2 text-left text-red-600">{getItemSupplier(item)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
