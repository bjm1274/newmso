'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useAppData } from '@/app/main/contexts/AppDataContext';
import { db } from '@/lib/db-client';
import { INVENTORY_SELECT_COLUMNS } from '@/app/main/inventory-utils';
import {
  KpiRow,
  WorkcenterNotes,
  type KpiItem } from './stock-workcenter-common';

const LegacyUDIManagement = dynamic(
  () => import('../재고관리서브/UDI관리'),
  {
    loading: () => (
      <div className="flex min-h-[260px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
      </div>
    ),
    ssr: false },
);

export default function UdiWorkcenter() {
  const { user } = useAppData();
  const [inventoryList, setInventoryList] = useState<any[]>([]);

  const fetchInventory = useCallback(async () => {
    const { data } = await db.from('inventory').select(INVENTORY_SELECT_COLUMNS).order('item_name');
    if (data) setInventoryList(data);
  }, []);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  const udiItemsCount = useMemo(() => {
    return inventoryList.filter((item: any) => item.is_udi).length;
  }, [inventoryList]);

  const kicker = "§ UDI/규정";
  const title = "의료기기 추적 및 안전 보고";
  const points = [
    'UDI 추적: 의료기기법에 따른 고유 식별 코드 관리.',
    '공급내역 보고: 식약처 및 관련 전산망 보고 대상 UDI 내역을 CSV 보고서로 출력.',
    '규정 준수: 미보고 시 처분 불이익이 있으므로, 입고 및 사용 시 UDI 코드를 반드시 체크하세요.',
  ];

  const kpiItems = useMemo<KpiItem[]>(
    () => [
      {
        label: 'UDI 대상 의료기기',
        value: udiItemsCount.toLocaleString(),
        unit: '종',
        sub: '공급내역 보고 의무 대상' },
      {
        label: '총 보유 의료기기',
        value: inventoryList.filter((item: any) => item.category === '의료기기').length.toLocaleString(),
        unit: '개',
        sub: '의료기기 카테고리 품목 수',
        tone: 'success' }
    ],
    [udiItemsCount, inventoryList],
  );

  return (
    <div className="flex flex-col gap-4">
      <KpiRow items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <section className="app-card p-4 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)]">
          <LegacyUDIManagement
            user={user}
            inventory={inventoryList}
            fetchInventory={fetchInventory}
          />
        </section>

        <WorkcenterNotes
          kicker={kicker}
          title={title}
          points={points}
        />
      </div>
    </div>
  );
}
