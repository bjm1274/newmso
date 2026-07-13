'use client';

import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { subscribeRealtime } from '@/lib/realtime-bus';
import type {
  StockStatusRow,
  PurchaseOrderRow,
  StockMoveRow,
  VendorCard,
  AssetRow,
  CatalogRow,
  CategoryCard,
  UdiRow,
  CloseHistoryRow,
  CloseStep,
  AbcGrade,
  ForecastRow,
  InspectRow,
  Tone } from './stock-types';
import {
  asString,
  pickNumber,
  pickString,
  toMonthString,
  toTimeString,
  type Row } from './data-helpers';

// ─────────────────────────────────────────────────
// Status 워크센터
// ─────────────────────────────────────────────────

function mapStatusRow(r: Row): StockStatusRow {
  const name = pickString(r, ['name', 'item_name'], '(미명칭)');
  const cat = pickString(r, ['category', 'category_name'], '미분류');
  const loc = pickString(r, ['location', 'department', 'company'], '미정');
  const stock = pickNumber(r, ['quantity', 'stock', 'current_quantity']);
  const min = pickNumber(r, ['min_quantity', 'min_stock', 'minimum_quantity']);
  const unit = pickString(r, ['unit'], 'EA');
  const expire = toMonthString(r['expiration_date'] ?? r['expiry_date']);

  let status: StockStatusRow['status'] = '정상';
  let tone: Tone = 'success';

  if (stock === 0) {
    status = '재고 0';
    tone = 'danger';
  } else if (min > 0 && stock < min) {
    status = '부족';
    tone = 'warn';
  }

  if (expire !== '-' && status === '정상') {
    const today = new Date();
    const exp = new Date(expire.length === 7 ? expire + '-01' : expire);
    const diff = (exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0 || diff <= 30) {
      status = '유효기간';
      tone = 'danger';
    } else if (diff <= 90) {
      status = '유효기간';
      tone = 'warn';
    }
  }

  return { name, cat, loc, stock, min, unit, expire, status, tone };
}

export type StatusWorkcenterData = {
  rows: StockStatusRow[];
  total: number;
  lowCount: number;
  zeroCount: number;
  expireCount: number;
  myCount: number;
  deptUsageTop5: Array<{ dept: string; value: number }>;
  loading: boolean;
  error: string | null;
};

const STATUS_EMPTY: StatusWorkcenterData = {
  rows: [],
  total: 0,
  lowCount: 0,
  zeroCount: 0,
  expireCount: 0,
  myCount: 0,
  deptUsageTop5: [],
  loading: true,
  error: null };

export function useStatusData(
  userCompany?: string,
): StatusWorkcenterData & { refresh: () => void } {
  const [state, setState] = useState<StatusWorkcenterData>(STATUS_EMPTY);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const invQuery = db.from('inventory').select('*').limit(500);
        const [inv, logs] = await Promise.all([
          userCompany && userCompany !== '전체'
            ? invQuery.eq('company', userCompany)
            : invQuery,
          db
            .from('inventory_logs')
            .select('actor_name,department,quantity,change_type,created_at')
            .in('change_type', ['사용', '소모', '출고'])
            .order('created_at', { ascending: false })
            .limit(500),
        ]);

        if (cancelled) return;

        const invRows: Row[] = Array.isArray(inv.data) ? (inv.data as Row[]) : [];
        const mapped = invRows.map(mapStatusRow);

        const zeroCount = mapped.filter((r) => r.status === '재고 0').length;
        const lowCount = mapped.filter((r) => r.status === '부족').length;
        const expireCount = mapped.filter((r) => r.status === '유효기간').length;
        const myCount = userCompany ? mapped.filter((r) => r.loc === userCompany).length : 0;

        const logRows: Row[] = Array.isArray(logs.data) ? (logs.data as Row[]) : [];
        const deptMap = new Map<string, number>();
        for (const r of logRows) {
          const dept = pickString(r, ['department', 'actor_name'], '미정');
          const amt = pickNumber(r, ['amount', 'qty', 'quantity'], 1);
          deptMap.set(dept, (deptMap.get(dept) ?? 0) + amt);
        }
        const deptUsageTop5 = Array.from(deptMap.entries())
          .map(([dept, value]) => ({ dept, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5);

        setState({
          rows: mapped,
          total: mapped.length,
          lowCount,
          zeroCount,
          expireCount,
          myCount,
          deptUsageTop5,
          loading: false,
          error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '재고 데이터를 불러오지 못했습니다.';
        setState({ ...STATUS_EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userCompany, reloadKey]);

  useEffect(() => {
    const unsub = subscribeRealtime(
      'stock-status-realtime',
      [{ table: 'inventory' }, { table: 'inventory_logs' }],
      () => {
        refresh();
      }
    );
    return unsub;
  }, [refresh]);

  return { ...state, refresh };
}

// ─────────────────────────────────────────────────
// IO 워크센터
// ─────────────────────────────────────────────────

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
  const rawItems = r['items'];
  let itemCount = pickNumber(r, ['item_count'], 0);
  if (Array.isArray(rawItems)) {
    itemCount = rawItems.length;
  } else if (typeof rawItems === 'string' && rawItems.trim()) {
    try {
      const parsed = JSON.parse(rawItems);
      if (Array.isArray(parsed)) itemCount = parsed.length;
    } catch { /* fallback 유지 */ }
  }
  return {
    id: pickString(r, ['id', 'order_number'], '-'),
    vendor: pickString(r, ['supplier_name', 'vendor', 'supplier'], '-'),
    items: itemCount,
    amt: pickNumber(r, ['total_amount', 'amount']),
    status: mapped.status,
    tone: mapped.tone,
    placed: toMonthString(r['created_at']).slice(5).replace('-', '/'),
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

const IO_EMPTY: IOWorkcenterData = {
  moves: [],
  orders: [],
  vendors: [],
  todayInout: 0,
  pendingOrders: 0,
  shippingOrders: 0,
  monthAmount: 0,
  loading: true,
  error: null };

export function useIOData(userCompany?: string): IOWorkcenterData & { refresh: () => void } {
  const [state, setState] = useState<IOWorkcenterData>(IO_EMPTY);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const companyFilter = userCompany && userCompany !== '전체' ? userCompany : null;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const today = new Date();
        const todayKey = getKoreanTodayString();
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

        let logsQ = db
          .from('inventory_logs')
          .select('*')
          .gte('created_at', todayKey)
          .order('created_at', { ascending: false })
          .limit(50);
        let ordersQ = db
          .from('purchase_orders')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50);
        let suppliersQ = db.from('suppliers').select('*').order('name').limit(30);
        if (companyFilter) {
          logsQ = logsQ.eq('company', companyFilter);
          ordersQ = ordersQ.eq('company', companyFilter);
          suppliersQ = suppliersQ.eq('company', companyFilter);
        }

        const [logsRes, ordersRes, suppliersRes] = await Promise.all([logsQ, ordersQ, suppliersQ]);

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
        setState({ ...IO_EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, companyFilter]);

  useEffect(() => {
    const unsub = subscribeRealtime(
      'stock-io-realtime',
      [{ table: 'inventory_logs' }, { table: 'purchase_orders' }],
      () => {
        refresh();
      }
    );
    return unsub;
  }, [refresh]);

  return { ...state, refresh };
}

// ─────────────────────────────────────────────────
// Item 워크센터
// ─────────────────────────────────────────────────

function mapCatalogRow(r: Row): CatalogRow {
  return {
    sku: pickString(r, ['code', 'sku', 'item_code'], pickString(r, ['id'], '-').slice(0, 8)),
    name: pickString(r, ['name', 'item_name'], '(미명칭)'),
    cat: pickString(r, ['category', 'category_name'], '미분류'),
    unit: pickString(r, ['unit'], 'EA'),
    price: pickNumber(r, ['price', 'unit_price']),
    date: toMonthString(r['created_at']),
    who: pickString(r, ['created_by_name', 'created_by'], '-') };
}

function buildCategoryCards(categories: Row[], inventory: Row[]): CategoryCard[] {
  const parents = categories.filter((c) => !c['parent_id']);
  const itemCountByCat = new Map<string, number>();
  for (const item of inventory) {
    const cat = pickString(item, ['category'], '');
    if (!cat) continue;
    itemCountByCat.set(cat, (itemCountByCat.get(cat) ?? 0) + 1);
  }
  return parents.slice(0, 6).map((p) => {
    const pid = asString(p['id']);
    const pname = pickString(p, ['name'], '-');
    const kids = categories
      .filter((c) => asString(c['parent_id']) === pid)
      .map((c) => pickString(c, ['name'], '-'));
    const items = itemCountByCat.get(pname) ?? 0;
    return { parent: pname, items, kids };
  });
}

function mapAssetRow(r: Row): AssetRow {
  const hasQr = Boolean(r['qr_code'] ?? r['barcode']);
  const broken = Boolean(r['needs_repair']);
  const status: AssetRow['status'] = broken ? '수리 필요' : !hasQr ? 'QR 미부착' : '정상';
  const tone: Tone = broken ? 'danger' : !hasQr ? 'warn' : 'success';
  return {
    id: pickString(r, ['code', 'asset_id', 'id'], '-').slice(0, 16),
    name: pickString(r, ['name', 'item_name'], '(미명칭)'),
    loc: pickString(r, ['location', 'department'], '-'),
    date: toMonthString(r['purchase_date'] ?? r['created_at']),
    qr: hasQr,
    status,
    tone };
}

function mapUdiRow(r: Row): UdiRow {
  return {
    udi: pickString(r, ['udi', 'udi_code', 'barcode'], '-'),
    name: pickString(r, ['name', 'item_name'], '-'),
    mfr: pickString(r, ['manufacturer', 'maker'], '-'),
    model: pickString(r, ['model', 'model_name'], '-'),
    lot: pickString(r, ['lot_number', 'lot'], '-'),
    date: toMonthString(r['created_at']) };
}

export type ItemWorkcenterData = {
  catalog: CatalogRow[];
  categories: CategoryCard[];
  assets: AssetRow[];
  udis: UdiRow[];
  totalCount: number;
  assetCount: number;
  udiCount: number;
  categoryCount: number;
  loading: boolean;
  error: string | null;
};

const ITEM_EMPTY: ItemWorkcenterData = {
  catalog: [],
  categories: [],
  assets: [],
  udis: [],
  totalCount: 0,
  assetCount: 0,
  udiCount: 0,
  categoryCount: 0,
  loading: true,
  error: null };

export function useItemData(userCompany?: string): ItemWorkcenterData & { refresh: () => void } {
  const [state, setState] = useState<ItemWorkcenterData>(ITEM_EMPTY);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const companyFilter = userCompany && userCompany !== '전체' ? userCompany : null;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let invQ = db
          .from('inventory')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(200);
        if (companyFilter) invQ = invQ.eq('company', companyFilter);
        const [invRes, catRes] = await Promise.all([
          invQ,
          db.from('inventory_categories').select('*').order('name').limit(100),
        ]);

        if (cancelled) return;

        const invRows: Row[] = Array.isArray(invRes.data) ? (invRes.data as Row[]) : [];
        const catRows: Row[] = Array.isArray(catRes.data) ? (catRes.data as Row[]) : [];

        const catalog = invRows.slice(0, 20).map(mapCatalogRow);

        const assetRows = invRows.filter((r) => {
          const c = asString(r['category']).toLowerCase();
          return c.includes('자산') || c.includes('장비') || c.includes('asset');
        });
        const assets = assetRows.slice(0, 30).map(mapAssetRow);

        const udiRows = invRows.filter((r) => r['udi'] ?? r['udi_code'] ?? r['barcode']);
        const udis = udiRows.slice(0, 30).map(mapUdiRow);

        const categories = buildCategoryCards(catRows, invRows);

        setState({
          catalog,
          categories,
          assets,
          udis,
          totalCount: invRows.length,
          assetCount: assetRows.length,
          udiCount: udiRows.length,
          categoryCount: catRows.length,
          loading: false,
          error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '품목 데이터를 불러오지 못했습니다.';
        setState({ ...ITEM_EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, companyFilter]);

  useEffect(() => {
    const unsub = subscribeRealtime(
      'stock-item-realtime',
      [{ table: 'inventory' }, { table: 'inventory_categories' }],
      () => {
        refresh();
      }
    );
    return unsub;
  }, [refresh]);

  return { ...state, refresh };
}

// ─────────────────────────────────────────────────
// Analyze 워크센터
// ─────────────────────────────────────────────────

function classifyAbc(
  inventory: Row[],
  logs: Row[],
): { grades: AbcGrade[]; counts: { A: number; B: number; C: number } } {
  const usageMap = new Map<string, number>();
  for (const l of logs) {
    const name = pickString(l, ['item_name', 'name'], '');
    if (!name) continue;
    const amt = pickNumber(l, ['quantity', 'amount', 'qty'], 0);
    const price = pickNumber(l, ['unit_price'], 1);
    usageMap.set(name, (usageMap.get(name) ?? 0) + amt * price);
  }

  const items = inventory
    .map((i) => ({
      name: pickString(i, ['name', 'item_name'], ''),
      value: usageMap.get(pickString(i, ['name', 'item_name'], '')) ?? 0 }))
    .filter((x) => x.name)
    .sort((a, b) => b.value - a.value);

  const total = items.reduce((s, x) => s + x.value, 0) || 1;
  let cum = 0;
  const A: string[] = [];
  const B: string[] = [];
  const C: string[] = [];
  for (const it of items) {
    cum += it.value;
    const pct = (cum / total) * 100;
    if (pct <= 70) A.push(it.name);
    else if (pct <= 90) B.push(it.name);
    else C.push(it.name);
  }

  const grades: AbcGrade[] = [
    {
      grade: 'A',
      head: `상위 ${A.length} 종`,
      contributionPct: 70,
      desc: '매출 기여 70% · 발주 1순위 · 안전재고 충분히 확보',
      examples: A.slice(0, 3) },
    {
      grade: 'B',
      head: `${B.length} 종`,
      contributionPct: 20,
      desc: '매출 기여 20% · 정기 점검 · 일반 안전재고' },
    {
      grade: 'C',
      head: `${C.length} 종`,
      contributionPct: 10,
      desc: '매출 기여 10% · 최소 관리 · 통합 발주' },
  ];

  return { grades, counts: { A: A.length, B: B.length, C: C.length } };
}

function buildForecast(inventory: Row[], logs: Row[]): ForecastRow[] {
  const usage30 = new Map<string, number>();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  for (const l of logs) {
    const created = new Date(asString(l['created_at'])).getTime();
    if (!Number.isFinite(created) || now - created > thirtyDays) continue;
    const name = pickString(l, ['item_name', 'name'], '');
    if (!name) continue;
    usage30.set(name, (usage30.get(name) ?? 0) + pickNumber(l, ['quantity', 'amount', 'qty'], 0));
  }

  return inventory
    .map((i) => {
      const name = pickString(i, ['name', 'item_name'], '');
      const stock = pickNumber(i, ['quantity', 'stock']);
      const pred = usage30.get(name) ?? 0;
      const gap = stock - pred;
      const conf = pred > 20 ? '94%' : pred > 5 ? '78%' : '65%';
      const tone: Tone = pred > 20 ? 'success' : pred > 5 ? 'warn' : 'muted';
      const when =
        stock === 0
          ? '즉시'
          : gap < 0
            ? new Date(now + 5 * 24 * 60 * 60 * 1000).toLocaleDateString('ko-KR').slice(5, -1)
            : '-';
      return { name, stock, pred, gap, when, conf, tone };
    })
    .filter((r) => r.name && r.pred > 0)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 10);
}

function buildInspects(inventory: Row[]): InspectRow[] {
  const locMap = new Map<string, { total: number; done: number }>();
  for (const i of inventory) {
    const loc = pickString(i, ['location', 'department', 'company'], '미정');
    const cur = locMap.get(loc) ?? { total: 0, done: 0 };
    cur.total += 1;
    cur.done += 1;
    locMap.set(loc, cur);
  }

  return Array.from(locMap.entries())
    .map(([loc, v]) => ({
      loc,
      total: v.total,
      done: v.done,
      diff: 0,
      who: '-',
      tone: 'success' as Tone }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

export type AnalyzeWorkcenterData = {
  grades: AbcGrade[];
  forecast: ForecastRow[];
  inspects: InspectRow[];
  inspectProgressPct: number;
  abcA: number;
  abcB: number;
  abcC: number;
  forecastMissCount: number;
  loading: boolean;
  error: string | null;
};

const ANALYZE_EMPTY: AnalyzeWorkcenterData = {
  grades: [],
  forecast: [],
  inspects: [],
  inspectProgressPct: 0,
  abcA: 0,
  abcB: 0,
  abcC: 0,
  forecastMissCount: 0,
  loading: true,
  error: null };

export function useAnalyzeData(userCompany?: string): AnalyzeWorkcenterData & { refresh: () => void } {
  const [state, setState] = useState<AnalyzeWorkcenterData>(ANALYZE_EMPTY);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);
  const companyFilter = userCompany && userCompany !== '전체' ? userCompany : null;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let invQ = db.from('inventory').select('*').limit(500);
        let logQ = db
          .from('inventory_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1000);
        if (companyFilter) {
          invQ = invQ.eq('company', companyFilter);
          logQ = logQ.eq('company', companyFilter);
        }
        const [invRes, logRes] = await Promise.all([invQ, logQ]);

        if (cancelled) return;

        const invRows: Row[] = Array.isArray(invRes.data) ? (invRes.data as Row[]) : [];
        const logRows: Row[] = Array.isArray(logRes.data) ? (logRes.data as Row[]) : [];

        const { grades, counts } = classifyAbc(invRows, logRows);
        const forecast = buildForecast(invRows, logRows);
        const inspects = buildInspects(invRows);

        const inspectTotal = inspects.reduce((s, x) => s + x.total, 0);
        const inspectDone = inspects.reduce((s, x) => s + x.done, 0);
        const inspectProgressPct =
          inspectTotal > 0 ? Math.round((inspectDone / inspectTotal) * 100) : 0;
        const forecastMissCount = forecast.filter((r) => r.gap < 0).length;

        setState({
          grades,
          forecast,
          inspects,
          inspectProgressPct,
          abcA: counts.A,
          abcB: counts.B,
          abcC: counts.C,
          forecastMissCount,
          loading: false,
          error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '분석 데이터를 불러오지 못했습니다.';
        setState({ ...ANALYZE_EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, companyFilter]);

  useEffect(() => {
    const unsub = subscribeRealtime(
      'stock-analyze-realtime',
      [{ table: 'inventory' }, { table: 'inventory_logs' }],
      () => {
        refresh();
      }
    );
    return unsub;
  }, [refresh]);

  return { ...state, refresh };
}

// ─────────────────────────────────────────────────
// Closing 워크센터
// ─────────────────────────────────────────────────

const STEP_TITLES = ['재고 실사', '입출고 확정', '차이 조정', '재고 평가', '마감 보고서'];

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return '-';
  return '₩' + Math.round(v).toLocaleString('ko-KR');
}

function isLocked(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === 'locked' || s === 'closed' || s === '확정' || s === '마감';
}

function buildSteps(currentMonthClosed: boolean): CloseStep[] {
  return STEP_TITLES.map((title, i) => ({
    n: i + 1,
    title,
    desc: currentMonthClosed ? '완료' : i === 0 ? '진행 중' : '대기',
    state: currentMonthClosed ? 'done' : i === 0 ? 'on' : 'pending' }));
}

export type ClosingData = {
  history: CloseHistoryRow[];
  steps: CloseStep[];
  currentMonthClosed: boolean;
  loading: boolean;
  error: string | null;
};

const CLOSING_EMPTY: ClosingData = {
  history: [],
  steps: buildSteps(false),
  currentMonthClosed: false,
  loading: true,
  error: null };

export function useClosingData(): ClosingData & { refresh: () => void } {
  const [state, setState] = useState<ClosingData>(CLOSING_EMPTY);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data, error } = await db
          .from('inventory_closing_snapshots')
          .select('closing_month, status, item_count, total_value, created_by_name, closed_at')
          .order('closing_month', { ascending: false })
          .limit(6);

        if (cancelled) return;
        if (error) throw error;

        const rows: Row[] = Array.isArray(data) ? (data as Row[]) : [];

        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        const history: CloseHistoryRow[] = rows.map((r) => {
          const locked = isLocked(pickString(r, ['status'], 'locked'));
          return {
            month: pickString(r, ['closing_month'], '-'),
            amt: formatValue(pickNumber(r, ['total_value'], NaN)),
            diff: locked ? '확정' : '임시',
            tone: (locked ? 'success' : 'warn') as Tone,
            done: `${pickNumber(r, ['item_count'], 0).toLocaleString('ko-KR')}종` };
        });

        const currentMonthClosed = rows.some(
          (r) =>
            pickString(r, ['closing_month'], '') === currentMonth &&
            isLocked(pickString(r, ['status'], '')),
        );

        setState({
          history,
          steps: buildSteps(currentMonthClosed),
          currentMonthClosed,
          loading: false,
          error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '월마감 데이터를 불러오지 못했습니다.';
        setState({ ...CLOSING_EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    const unsub = subscribeRealtime(
      'stock-closing-realtime',
      [{ table: 'inventory_closing_snapshots' }],
      () => {
        refresh();
      }
    );
    return unsub;
  }, [refresh]);

  return { ...state, refresh };
}

// ─────────────────────────────────────────────────
// 추가 분석 및 통계 (소모품 통계 / AS·반품) - 모바일 & PC 공통
// ─────────────────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export type UsageDeptRow = {
  dept: string;
  amount: number;
  count: number;
  delta: number;
};

export type UsageStatsData = {
  rows: UsageDeptRow[];
  totalAmount: number;
  prevTotalAmount: number;
  logCount: number;
  loading: boolean;
  error: string | null;
};

const USAGE_EMPTY: UsageStatsData = {
  rows: [],
  totalAmount: 0,
  prevTotalAmount: 0,
  logCount: 0,
  loading: true,
  error: null };

function isConsumption(r: Row): boolean {
  const s = asString(r['change_type'] ?? r['type']);
  if (s.includes('반품')) return false;
  if (s.includes('입고')) return false;
  if (s.includes('이관')) return false;
  if (s.includes('출고') || s.includes('사용') || s.includes('소모') || s.toLowerCase().includes('consume')) {
    return true;
  }
  const prev = pickNumber(r, ['prev_quantity'], NaN);
  const next = pickNumber(r, ['next_quantity'], NaN);
  if (Number.isFinite(prev) && Number.isFinite(next)) return next < prev;
  return false;
}

function consumptionQty(r: Row): number {
  const q = pickNumber(r, ['quantity', 'amount', 'qty'], 0);
  if (q !== 0) return Math.abs(q);
  const prev = pickNumber(r, ['prev_quantity'], NaN);
  const next = pickNumber(r, ['next_quantity'], NaN);
  if (Number.isFinite(prev) && Number.isFinite(next)) return Math.max(0, prev - next);
  return 0;
}

export function useUsageStats(): UsageStatsData & { refresh: () => void } {
  const [state, setState] = useState<UsageStatsData>(USAGE_EMPTY);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const sinceIso = new Date(Date.now() - 2 * THIRTY_DAYS_MS).toISOString();
        const { data, error } = await db
          .from('inventory_logs')
          .select('change_type, type, quantity, unit_price, department, created_at, prev_quantity, next_quantity')
          .gte('created_at', sinceIso)
          .order('created_at', { ascending: false })
          .limit(1000);

        if (cancelled) return;
        if (error) throw error;

        const rows: Row[] = Array.isArray(data) ? (data as Row[]) : [];
        const now = Date.now();

        const cur = new Map<string, { amount: number; count: number }>();
        const prev = new Map<string, number>();
        let totalAmount = 0;
        let prevTotalAmount = 0;
        let logCount = 0;

        for (const r of rows) {
          if (!isConsumption(r)) continue;
          const created = new Date(asString(r['created_at'])).getTime();
          if (!Number.isFinite(created)) continue;
          const age = now - created;
          if (age < 0 || age > 2 * THIRTY_DAYS_MS) continue;

          const dept = pickString(r, ['department', 'to_dept', 'location'], '미지정');
          const qty = consumptionQty(r);
          const price = pickNumber(r, ['unit_price'], 0);
          const value = qty * price;

          if (age <= THIRTY_DAYS_MS) {
            const c = cur.get(dept) ?? { amount: 0, count: 0 };
            c.amount += value;
            c.count += 1;
            cur.set(dept, c);
            totalAmount += value;
            logCount += 1;
          } else {
            prev.set(dept, (prev.get(dept) ?? 0) + value);
            prevTotalAmount += value;
          }
        }

        const rowsOut: UsageDeptRow[] = Array.from(cur.entries())
          .map(([dept, v]) => ({
            dept,
            amount: v.amount,
            count: v.count,
            delta: v.amount - (prev.get(dept) ?? 0) }))
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 8);

        setState({
          rows: rowsOut,
          totalAmount,
          prevTotalAmount,
          logCount,
          loading: false,
          error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '사용 통계를 불러오지 못했습니다.';
        setState({ ...USAGE_EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    const unsub = subscribeRealtime(
      'stock-usage-realtime',
      [{ table: 'inventory_logs' }],
      () => {
        refresh();
      }
    );
    return unsub;
  }, [refresh]);

  return { ...state, refresh };
}

export type ReturnRow = {
  date: string;
  item: string;
  qty: number;
  dept: string;
  who: string;
  note: string;
};

export type ReturnsData = {
  rows: ReturnRow[];
  count30: number;
  qty30: number;
  loading: boolean;
  error: string | null;
};

const RETURNS_EMPTY: ReturnsData = {
  rows: [],
  count30: 0,
  qty30: 0,
  loading: true,
  error: null };

function isReturn(r: Row): boolean {
  return asString(r['change_type'] ?? r['type']).includes('반품');
}

export function useReturnsData(): ReturnsData & { refresh: () => void } {
  const [state, setState] = useState<ReturnsData>(RETURNS_EMPTY);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data, error } = await db
          .from('inventory_logs')
          .select('change_type, type, quantity, department, actor_name, notes, created_at')
          .order('created_at', { ascending: false })
          .limit(300);

        if (cancelled) return;
        if (error) throw error;

        const rows: Row[] = Array.isArray(data) ? (data as Row[]) : [];
        const now = Date.now();

        const returns = rows.filter(isReturn);

        const rowsOut: ReturnRow[] = returns.slice(0, 30).map((r) => ({
          date: asString(r['created_at']).slice(0, 10) || '-',
          item: pickString(r, ['notes', 'item_name', 'name'], '품목 미상'),
          qty: Math.abs(pickNumber(r, ['quantity', 'amount', 'qty'], 0)),
          dept: pickString(r, ['department', 'location'], '-'),
          who: pickString(r, ['actor_name'], '-'),
          note: pickString(r, ['notes'], '') }));

        let count30 = 0;
        let qty30 = 0;
        for (const r of returns) {
          const created = new Date(asString(r['created_at'])).getTime();
          if (Number.isFinite(created) && now - created <= THIRTY_DAYS_MS) {
            count30 += 1;
            qty30 += Math.abs(pickNumber(r, ['quantity', 'amount', 'qty'], 0));
          }
        }

        setState({ rows: rowsOut, count30, qty30, loading: false, error: null });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'AS·반품 데이터를 불러오지 못했습니다.';
        setState({ ...RETURNS_EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    const unsub = subscribeRealtime(
      'stock-returns-realtime',
      [{ table: 'inventory_logs' }],
      () => {
        refresh();
      }
    );
    return unsub;
  }, [refresh]);

  return { ...state, refresh };
}
