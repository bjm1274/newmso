// io 워크센터 — Supabase fetch 훅
//
// inventory_logs (today) → 입출고 기록
// purchase_orders → 발주 목록 + 상태 집계
// suppliers + purchase_orders → 거래처 카드(발주·지급·미수금)

'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import { getKoreanTodayString } from '@/lib/seoul-time';
import type { PurchaseOrderRow, StockMoveRow, Tone, VendorCard } from './stock-types';
import { asString, pickNumber, pickString, toMonthString, toTimeString, type Row } from './data-helpers';

const MOVE_KIND_TONE: Record<StockMoveRow['kind'], Tone> = {
  입고: 'success',
  출고: 'accent',
  이관: 'warn',
  반품: 'danger' };

function normalizeMoveKind(v: unknown): StockMoveRow['kind'] {
  const s = asString(v);
  if (s.includes('입고') || s.includes('입')) return '입고';
  if (s.includes('이관')) return '이관';
  if (s.includes('반품')) return '반품';
  return '출고';
}

function mapMoveRow(r: Row): StockMoveRow {
  const kind = normalizeMoveKind(r['change_type'] ?? r['type']);
  return {
    time: toTimeString(r['created_at']),
    kind,
    item: pickString(r, ['item_name', 'name', 'product_name'], '(미상)'),
    qty: pickNumber(r, ['amount', 'qty', 'quantity']),
    unit: pickString(r, ['unit'], 'EA'),
    from: pickString(r, ['from_location', 'source', 'from_dept'], '-'),
    to: pickString(r, ['to_location', 'destination', 'to_dept', 'department'], '-'),
    who: pickString(r, ['actor_name', 'worker_name', 'user_name'], '-'),
    tone: MOVE_KIND_TONE[kind] };
}

const ORDER_STATUS_MAP: Record<string, { status: PurchaseOrderRow['status']; tone: Tone }> = {
  대기: { status: '발주 대기', tone: 'warn' },
  '발주 대기': { status: '발주 대기', tone: 'warn' },
  승인: { status: '확정', tone: 'success' },
  확정: { status: '확정', tone: 'success' },
  배송: { status: '배송 중', tone: 'accent' },
  '배송 중': { status: '배송 중', tone: 'accent' },
  완료: { status: '납품 완료', tone: 'success' },
  '납품 완료': { status: '납품 완료', tone: 'success' } };

function mapOrderRow(r: Row): PurchaseOrderRow {
  const rawStatus = asString(r['status'], '대기').trim();
  const mapped = ORDER_STATUS_MAP[rawStatus] ?? { status: '발주 대기' as const, tone: 'warn' as const };
  // purchase_orders.items 는 D1에서 JSON 문자열(text)로 저장될 수 있어 파싱 후 길이 계산.
  const rawItems = r['items'];
  let itemCount = pickNumber(r, ['item_count'], 0);
  if (Array.isArray(rawItems)) {
    itemCount = rawItems.length;
  } else if (typeof rawItems === 'string' && rawItems.trim()) {
    try {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed)) itemCount = parsed.length;
    } catch { /* item_count 폴백 유지 */ }
  }
  return {
    id: pickString(r, ['id', 'order_number'], '-'),
    vendor: pickString(r, ['supplier_name', 'vendor', 'supplier'], '-'),
    items: itemCount,
    amt: pickNumber(r, ['total_amount', 'amount']),
    status: mapped.status,
    tone: mapped.tone,
    placed: toMonthString(r['created_at']).slice(5).replace('-', '/'),
    // 정본 납기 컬럼은 expected_delivery_date (legacy delivery_date/due_date 폴백).
    due: toMonthString(r['expected_delivery_date'] ?? r['delivery_date'] ?? r['due_date']).slice(5).replace('-', '/') || '-' };
}

function mapVendorCard(r: Row, orderCount: number, paid: number, due: number): VendorCard {
  const tone: Tone = due === 0 ? 'success' : due > 5 ? 'danger' : 'warn';
  return {
    name: pickString(r, ['name'], '(거래처)'),
    cat: pickString(r, ['category'], '미분류'),
    orders: orderCount,
    paid,
    due,
    contact: `${pickString(r, ['contact_name'], '-')} ${pickString(r, ['phone'], '')}`.trim(),
    tone };
}

export type IOWorkcenterData = {
  moves: StockMoveRow[];
  orders: PurchaseOrderRow[];
  vendors: VendorCard[];
  todayInout: number;
  pendingOrders: number;
  shippingOrders: number;
  monthAmount: number;
  loading: boolean;
  error: string | null;
};

const EMPTY: IOWorkcenterData = {
  moves: [],
  orders: [],
  vendors: [],
  todayInout: 0,
  pendingOrders: 0,
  shippingOrders: 0,
  monthAmount: 0,
  loading: true,
  error: null };

export function useIOData(): IOWorkcenterData & { refresh: () => void } {
  const [state, setState] = useState<IOWorkcenterData>(EMPTY);
  const [refreshCount, setRefreshCount] = useState(0);

  const refresh = () => setRefreshCount((c) => c + 1);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const today = new Date();
        const todayKey = getKoreanTodayString();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

        const [logsRes, ordersRes, suppliersRes] = await Promise.all([
          db
            .from('inventory_logs')
            .select('*')
            .gte('created_at', todayKey)
            .order('created_at', { ascending: false })
            .limit(50),
          db
            .from('purchase_orders')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50),
          db.from('suppliers').select('*').order('name').limit(30),
        ]);

        if (cancelled) return;

        const logRows: Row[] = Array.isArray(logsRes.data) ? (logsRes.data as Row[]) : [];
        const moves = logRows.map(mapMoveRow);

        const orderRows: Row[] = Array.isArray(ordersRes.data) ? (ordersRes.data as Row[]) : [];
        const orders = orderRows.map(mapOrderRow);

        const supplierRows: Row[] = Array.isArray(suppliersRes.data)
          ? (suppliersRes.data as Row[])
          : [];

        const vendorAgg = new Map<string, { count: number; paid: number; due: number }>();
        for (const o of orderRows) {
          const vname = pickString(o, ['supplier_name', 'vendor'], '-');
          const amt = pickNumber(o, ['total_amount', 'amount']) / 1_000_000;
          const status = asString(o['status']);
          const agg = vendorAgg.get(vname) ?? { count: 0, paid: 0, due: 0 };
          agg.count += 1;
          if (status === '완료' || status === '납품 완료') agg.paid += amt;
          else agg.due += amt;
          vendorAgg.set(vname, agg);
        }

        const vendors: VendorCard[] = supplierRows.slice(0, 6).map((s) => {
          const name = pickString(s, ['name'], '-');
          const agg = vendorAgg.get(name) ?? { count: 0, paid: 0, due: 0 };
          return mapVendorCard(
            s,
            agg.count,
            Math.round(agg.paid * 10) / 10,
            Math.round(agg.due * 10) / 10,
          );
        });

        const pendingOrders = orderRows.filter((o) => {
          const s = asString(o['status']);
          return s === '대기' || s === '발주 대기';
        }).length;

        const shippingOrders = orderRows.filter((o) => {
          const s = asString(o['status']);
          return s === '배송' || s === '배송 중';
        }).length;

        const monthAmount = orderRows
          .filter((o) => asString(o['created_at']) >= monthStart)
          .reduce((sum, o) => sum + pickNumber(o, ['total_amount', 'amount']), 0);

        setState({
          moves,
          orders,
          vendors,
          todayInout: moves.length,
          pendingOrders,
          shippingOrders,
          monthAmount: Math.round((monthAmount / 1_000_000) * 10) / 10,
          loading: false,
          error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '입출고 데이터를 불러오지 못했습니다.';
        setState({ ...EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshCount]);

  return { ...state, refresh };
}
