'use client';

/**
 * 급여 이상치 탭
 *
 * JM:  단일 책임, 500줄 이내
 * JM2: 1회 fetch + 정적 fallback
 * JM3: try/catch 폴백
 * JM4: any 금지, 입력 가드
 */

import { useEffect, useState } from 'react';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_PAYROLL_OUTLIERS } from './fallback';
import type { PayrollOutlier } from './types';

interface ApiOutlierRow {
  id?: string;
  name?: string;
  changePct?: number;
  reason?: string;
}

function parseRow(r: ApiOutlierRow): PayrollOutlier | null {
  if (!r || typeof r !== 'object') return null;
  const name = typeof r.name === 'string' ? r.name : '';
  const reason = typeof r.reason === 'string' ? r.reason : '';
  const changePct = typeof r.changePct === 'number' ? r.changePct : Number.NaN;
  if (!name || Number.isNaN(changePct)) return null;
  return {
    id: typeof r.id === 'string' ? r.id : undefined,
    name,
    changePct,
    reason };
}

function pctTone(pct: number): 'danger' | 'warn' | 'accent' {
  if (pct < 0) return 'danger';
  if (Math.abs(pct) >= 30) return 'warn';
  return 'accent';
}

function formatPct(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

export default function AuditPayrollOutlierTab() {
  const [rows, setRows] = useState<PayrollOutlier[]>(FALLBACK_PAYROLL_OUTLIERS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/audit/payroll-outliers', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        const list = Array.isArray(json)
          ? json
          : (json as { rows?: unknown } | null)?.rows;
        if (!Array.isArray(list) || list.length === 0) throw new Error('empty');
        const parsed = list
          .map((r) => parseRow(r as ApiOutlierRow))
          .filter((r): r is PayrollOutlier => r !== null);
        if (parsed.length === 0) throw new Error('invalid');
        if (alive) setRows(parsed);
      } catch {
        // 폴백 유지
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card
      title={`급여 이상치 · 전월 대비 (${rows.length}건)`}
      action={
        <span className="text-[10.5px] text-[var(--toss-gray-4)]">
          {loaded ? '실시간' : '로딩…'}
        </span>
      }
    >
      <ul className="space-y-2" aria-label="급여 이상치 목록">
        {rows.map((r, i) => {
          const tone = pctTone(r.changePct);
          return (
            <li
              key={r.id ?? `${r.name}-${i}`}
              className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--muted)] border border-[var(--border)]"
            >
              <Chip tone={tone}>{formatPct(r.changePct)}</Chip>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <b className="text-[12px] text-[var(--foreground)]">{r.name}</b>
                  <span className="text-[10.5px] text-[var(--toss-gray-4)] truncate">
                    {r.reason}
                  </span>
                </div>
              </div>
              <SmBtn primary ariaLabel={`${r.name} 급여 이상치 확인`}>
                확인
              </SmBtn>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
