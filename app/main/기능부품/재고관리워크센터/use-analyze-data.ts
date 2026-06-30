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
        const [invRes, logRes] = await Promise.all([
          db.from('inventory').select('*').limit(500),
          db
            .from('inventory_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1000),
        ]);

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
