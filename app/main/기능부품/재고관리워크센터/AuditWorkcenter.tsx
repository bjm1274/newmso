'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useAppData } from '@/app/main/contexts/AppDataContext';
import { db } from '@/lib/db-client';
import {
  KpiRow,
  WorkcenterNotes,
  type KpiItem } from './stock-workcenter-common';
import { useStatusData } from './stock-workcenter-data';

const LegacyInventoryCount = dynamic(
  () => import('../재고관리서브/재고실사'),
  {
    loading: () => (
      <div className="flex min-h-[260px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
      </div>
    ),
    ssr: false },
);

export default function AuditWorkcenter() {
  const { user } = useAppData();
  const statusData = useStatusData();
  const [inventoryList, setInventoryList] = useState<any[]>([]);

  const fetchInventory = useCallback(async () => {
    const { data } = await db.from('inventory').select('*').order('name');
    if (data) setInventoryList(data);
  }, []);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  const kicker = "§ 실사/이관";
  const title = "재고 실사 및 오차 교정";
  const points = [
    '재고실사: 장부 수량과 실물 수량 간의 일치 여부를 대조하고 실시간 일괄 보정 수행.',
    '차이 조정: 실물 수량이 다를 때 조정 로그가 기록되며 자동으로 안전재고 경고가 업데이트됩니다.',
    '재고 이관: 타 부서 또는 외부 시설로의 이동은 입출고 관리 탭에서 이관 모드를 통해 등록 가능합니다.',
  ];

  const kpiItems = useMemo<KpiItem[]>(
    () => [
      {
        label: '실사 대상 품목',
        value: inventoryList.length.toLocaleString(),
        unit: '종',
        sub: '전체 SKU 기준' },
      {
        label: '재고 부족 항목',
        value: statusData.lowCount.toLocaleString(),
        unit: '건',
        sub: '안전재고 미달 품목',
        tone: 'warn' },
      {
        label: '무재고 품목',
        value: statusData.zeroCount.toLocaleString(),
        unit: '건',
        sub: '재고가 0인 품목',
        tone: 'danger' }
    ],
    [inventoryList.length, statusData.lowCount, statusData.zeroCount],
  );

  return (
    <div className="flex flex-col gap-4">
      <KpiRow items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <section className="app-card p-4 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)]">
          <LegacyInventoryCount
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
