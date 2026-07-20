'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState, useMemo } from 'react';
import { useAppData } from '@/app/main/contexts/AppDataContext';
import { db } from '@/lib/db-client';
import { INVENTORY_SELECT_COLUMNS } from '@/app/main/inventory-utils';
import {
  KpiRow,
  StockTabs,
  WorkcenterNotes,
  type KpiItem,
  type TabItem } from './stock-workcenter-common';

const LegacyProductRegistration = dynamic(
  () => import('../재고관리서브/물품등록'),
  {
    loading: () => (
      <div className="flex min-h-[260px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
      </div>
    ),
    ssr: false },
);

const LegacyQRAssetManager = dynamic(
  () => import('../재고관리서브/자산QR관리'),
  {
    loading: () => (
      <div className="flex min-h-[260px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--toss-blue-light)] border-t-[var(--accent)]" />
      </div>
    ),
    ssr: false },
);

type MasterTab = 'product' | 'asset' | 'supplier';

const TABS: TabItem<MasterTab>[] = [
  { id: 'product', label: '물품 등록' },
  { id: 'asset', label: '자산 QR 관리' },
  { id: 'supplier', label: '거래처 정보' }
];

export default function MasterWorkcenter() {
  const { user } = useAppData();
  const userCompany = typeof user?.company === 'string' ? user.company : undefined;
  const [tab, setTab] = useState<MasterTab>('product');
  const [inventoryList, setInventoryList] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const fetchInventory = useCallback(async () => {
    let q = db.from('inventory').select(INVENTORY_SELECT_COLUMNS).order('item_name');
    if (userCompany && userCompany !== '전체') q = q.eq('company', userCompany);
    const { data } = await q;
    if (data) setInventoryList(data);
  }, [userCompany]);

  const fetchSuppliers = useCallback(async () => {
    // suppliers 스키마에 company 컬럼 없음 — 전역 거래처 목록
    const { data } = await db
      .from('suppliers')
      .select('id, name, contact, contact_name, phone, email, category, address, business_number')
      .order('name');
    if (data) setSuppliers(data);
  }, []);

  useEffect(() => {
    void fetchInventory();
    void fetchSuppliers();
  }, [fetchInventory, fetchSuppliers]);

  const kicker = "§ 기준 정보";
  const title = "재고 관리 기준정보 수립";
  const points = [
    '품목 카탈로그: 신규로 입고되는 품목이나 자산은 등록 단계에서 올바른 카테고리와 단가, 안전재고량을 할당해야 자동발주가 지원됩니다.',
    '자산 QR: 의료 장비나 공용 자산에 바코드/QR을 맵핑하여 카메라 스캐너로 빠른 대출/반납을 진행할 수 있습니다.',
    '거래처 관리: 파트너사 계약 및 단가 변동 시 기준정보에 연동하십시오.',
  ];

  const kpiItems = useMemo<KpiItem[]>(
    () => [
      {
        label: '총 등록 품목',
        value: inventoryList.length.toLocaleString(),
        unit: '종',
        sub: '카탈로그 등록 수' },
      {
        label: '고정자산 장비',
        value: inventoryList.filter(item => item.category === '의료기기' || item.category === '자산').length.toLocaleString(),
        unit: '대',
        sub: '주요 의료기기/장비',
        tone: 'accent' },
      {
        label: '공급 파트너',
        value: suppliers.length.toLocaleString(),
        unit: '곳',
        sub: '등록 거래처 수',
        tone: 'success' }
    ],
    [inventoryList, suppliers],
  );

  return (
    <div className="flex flex-col gap-4">
      <StockTabs tabs={TABS} active={tab} onChange={setTab} ariaLabel="기준정보 탭" />
      <KpiRow items={kpiItems} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <section className="app-card p-4 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)]" role="tabpanel">
          {tab === 'product' && (
            <LegacyProductRegistration
              user={user}
              inventory={inventoryList}
              suppliers={suppliers}
              fetchInventory={fetchInventory}
              fetchSuppliers={fetchSuppliers}
            />
          )}
          {tab === 'asset' && (
            <LegacyQRAssetManager
              user={user}
              inventory={inventoryList}
              fetchInventory={fetchInventory}
            />
          )}
          {tab === 'supplier' && (
            <div className="space-y-4">
              <h3 className="text-[13.5px] font-bold text-[var(--foreground)] mb-2">등록 파트너사 목록</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {suppliers.map(s => (
                  <div key={s.id} className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:shadow-sm">
                    <p className="text-sm font-bold text-[var(--foreground)]">{s.name}</p>
                    <p className="text-xs text-[var(--toss-gray-3)] mt-1">{s.contact_name || '담당자 미지정'} | {s.phone || '연락처 미등록'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
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
