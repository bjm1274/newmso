// analyze 워크센터 — Supabase fetch 훅
//
// inventory + inventory_logs → ABC 분류 (사용량 × 단가)
// inventory_logs (최근 30일) → 수요 예측
// inventory → 위치별 실사 진행률(placeholder — 실사 세션 별도 테이블)

'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/db-client';
import type { AbcGrade, ForecastRow, InspectRow, Tone } from './stock-types';
import { asString, pickNumber, pickString, type Row } from './data-helpers';

const OUTBOUND_TYPES = new Set([
  '출고',
  '소모',
  '사용',
  '불출',
  '이관출고',
  '대여',
  '출고처리',
]);

function logItemKey(l: Row): string {
  return (
    pickString(l, ['item_id', 'inventory_id'], '') ||
    pickString(l, ['item_name', 'name'], '')
  );
}

function isOutboundLog(l: Row): boolean {
  const t = pickString(l, ['change_type', 'type'], '');
  if (OUTBOUND_TYPES.has(t)) return true;
  // 음수 수량이 있으면 출고로 간주
  const q = pickNumber(l, ['quantity', 'amount', 'qty'], 0);
  const prev = pickNumber(l, ['prev_quantity'], NaN);
  const next = pickNumber(l, ['next_quantity'], NaN);
  if (Number.isFinite(prev) && Number.isFinite(next) && next < prev) return true;
  return false;
}

/**
 * ABC: 최근 출고 금액(수량×단가) 누적 기여도.
 * 사용 로그가 없으면 재고 금액(수량×단가)으로 fallback.
 */
function classifyAbc(
  inventory: Row[],
  logs: Row[],
): { grades: AbcGrade[]; counts: { A: number; B: number; C: number } } {
  const usageMap = new Map<string, number>();
  for (const l of logs) {
    if (!isOutboundLog(l)) continue;
    const key = logItemKey(l);
    if (!key) continue;
    const amt = Math.abs(pickNumber(l, ['quantity', 'amount', 'qty'], 0));
    const price = pickNumber(l, ['unit_price'], 0) || 1;
    usageMap.set(key, (usageMap.get(key) ?? 0) + amt * price);
  }

  const nameById = new Map<string, string>();
  for (const i of inventory) {
    const id = pickString(i, ['id'], '');
    const name = pickString(i, ['name', 'item_name'], '');
    if (id && name) nameById.set(id, name);
  }

  const resolveName = (key: string) => nameById.get(key) || key;

  let items = inventory
    .map((i) => {
      const id = pickString(i, ['id'], '');
      const name = pickString(i, ['name', 'item_name'], '');
      const stock = pickNumber(i, ['quantity', 'stock'], 0);
      const unit = pickNumber(i, ['unit_price', 'price'], 0);
      const usage =
        (id ? usageMap.get(id) : 0) ||
        usageMap.get(name) ||
        0;
      // 사용 없으면 재고 금액으로 분류 가능하도록 약한 fallback
      const value = usage > 0 ? usage : stock * (unit || 1) * 0.01;
      return { name, value };
    })
    .filter((x) => x.name)
    .sort((a, b) => b.value - a.value);

  // usageMap 키만 있고 inventory에 없는 경우 보강
  if (items.every((x) => x.value === 0) && usageMap.size > 0) {
    items = Array.from(usageMap.entries())
      .map(([k, value]) => ({ name: resolveName(k), value }))
      .sort((a, b) => b.value - a.value);
  }

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
      desc: '출고금액 누적 70% · 발주 1순위 · 안전재고 우선',
      examples: A.slice(0, 3) },
    {
      grade: 'B',
      head: `${B.length} 종`,
      contributionPct: 20,
      desc: '출고금액 누적 20% · 정기 점검 · 일반 안전재고' },
    {
      grade: 'C',
      head: `${C.length} 종`,
      contributionPct: 10,
      desc: '출고금액 누적 10% · 최소 관리 · 통합 발주' },
  ];

  return { grades, counts: { A: A.length, B: B.length, C: C.length } };
}

/**
 * 수요 예측: 최근 30일 일평균 출고 × 30 = 월간 예측,
 * 재고 ÷ 일평균 = 예상 소진일.
 */
function buildForecast(inventory: Row[], logs: Row[]): ForecastRow[] {
  const usage30 = new Map<string, number>();
  const now = Date.now();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;
  for (const l of logs) {
    if (!isOutboundLog(l)) continue;
    const created = new Date(asString(l['created_at'])).getTime();
    if (!Number.isFinite(created) || now - created > thirtyDays) continue;
    const key = logItemKey(l);
    if (!key) continue;
    usage30.set(key, (usage30.get(key) ?? 0) + Math.abs(pickNumber(l, ['quantity', 'amount', 'qty'], 0)));
  }

  return inventory
    .map((i) => {
      const id = pickString(i, ['id'], '');
      const name = pickString(i, ['name', 'item_name'], '');
      const stock = pickNumber(i, ['quantity', 'stock']);
      const used30 = (id && usage30.get(id)) || usage30.get(name) || 0;
      const daily = used30 / 30;
      const pred = Math.round(daily * 30); // 향후 30일 예상 소모
      const gap = stock - pred;
      const daysLeft = daily > 0 ? stock / daily : Infinity;
      const conf =
        used30 >= 30 ? '90%' : used30 >= 10 ? '78%' : used30 > 0 ? '62%' : '—';
      let tone: Tone = 'muted';
      if (stock === 0 || daysLeft < 7) tone = 'danger';
      else if (daysLeft < 14 || gap < 0) tone = 'warn';
      else if (pred > 0) tone = 'success';

      let when = '-';
      if (stock === 0 && pred > 0) when = '즉시';
      else if (Number.isFinite(daysLeft) && daysLeft < 60) {
        const d = new Date(now + daysLeft * 24 * 60 * 60 * 1000);
        when = d.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
      }

      return { name, stock, pred, gap, when, conf, tone };
    })
    .filter((r) => r.name && r.pred > 0)
    .sort((a, b) => a.gap - b.gap)
    .slice(0, 15);
}

/** 실사 세션 기반 진행률 (없으면 위치별 placeholder 대신 0%) */
function buildInspects(
  inventory: Row[],
  sessions: Row[],
): InspectRow[] {
  if (sessions.length > 0) {
    // 최근 세션의 위치/담당 요약
    return sessions.slice(0, 8).map((s) => {
      const loc = pickString(s, ['location', 'department', 'company', 'scope'], '전체');
      const total = pickNumber(s, ['item_count', 'total_items', 'expected_count'], 0);
      const done = pickNumber(s, ['counted_count', 'done_count', 'actual_count'], total);
      const diff = pickNumber(s, ['diff_count', 'variance'], Math.max(0, total - done));
      const who = pickString(s, ['conducted_by_name', 'created_by_name', 'conducted_by'], '-');
      const tone: Tone = diff > 0 ? 'warn' : 'success';
      return { loc, total: total || done, done, diff, who, tone };
    });
  }

  // fallback: 부서/위치 그룹 (진행 0 — 실사 세션 필요 안내)
  const locMap = new Map<string, number>();
  for (const i of inventory) {
    const loc = pickString(i, ['location', 'department', 'company'], '미정');
    locMap.set(loc, (locMap.get(loc) ?? 0) + 1);
  }

  return Array.from(locMap.entries())
    .map(([loc, total]) => ({
      loc,
      total,
      done: 0,
      diff: 0,
      who: '실사 미실시',
      tone: 'muted' as Tone }))
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

const EMPTY: AnalyzeWorkcenterData = {
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

export function useAnalyzeData(): AnalyzeWorkcenterData {
  const [state, setState] = useState<AnalyzeWorkcenterData>(EMPTY);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [invRes, logRes, sessionRes] = await Promise.all([
          db.from('inventory').select('*').limit(800),
          db
            .from('inventory_logs')
            .select(
              'item_id,inventory_id,quantity,unit_price,change_type,type,prev_quantity,next_quantity,created_at,notes',
            )
            .order('created_at', { ascending: false })
            .limit(2000),
          db
            .from('inventory_count_sessions')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20),
        ]);

        if (cancelled) return;

        const invRows: Row[] = Array.isArray(invRes.data) ? (invRes.data as Row[]) : [];
        const logRows: Row[] = Array.isArray(logRes.data) ? (logRes.data as Row[]) : [];
        const sessionRows: Row[] = Array.isArray(sessionRes.data)
          ? (sessionRes.data as Row[])
          : [];

        const { grades, counts } = classifyAbc(invRows, logRows);
        const forecast = buildForecast(invRows, logRows);
        const inspects = buildInspects(invRows, sessionRows);

        const inspectTotal = inspects.reduce((s, x) => s + x.total, 0);
        const inspectDone = inspects.reduce((s, x) => s + x.done, 0);
        const inspectProgressPct =
          inspectTotal > 0 ? Math.round((inspectDone / Math.max(inspectTotal, 1)) * 100) : 0;
        const forecastMissCount = forecast.filter((r) => r.gap < 0 || r.tone === 'danger').length;

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
        setState({ ...EMPTY, loading: false, error: message });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
