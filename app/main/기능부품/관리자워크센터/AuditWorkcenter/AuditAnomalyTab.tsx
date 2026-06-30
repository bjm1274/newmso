'use client';

/**
 * 이상 감지 탭 — 카드 리스트
 *
 * JM:  단일 책임, 500줄 이내
 * JM2: useEffect 1회 fetch, 정적 fallback
 * JM3: try/catch 폴백
 * JM4: any 금지
 * JM6: button 태그, aria-label
 */

import { useEffect, useState } from 'react';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_ANOMALIES } from './fallback';
import type { AnomalyCard } from './types';

interface ApiAnomalyRow {
  id?: string;
  kind?: string;
  who?: string;
  count?: number;
  when?: string;
  tone?: string;
  reason?: string;
  recommend?: string;
}

function parseRow(r: ApiAnomalyRow): AnomalyCard | null {
  if (!r || typeof r !== 'object') return null;
  const kind = typeof r.kind === 'string' ? r.kind : '';
  const who = typeof r.who === 'string' ? r.who : '';
  const reason = typeof r.reason === 'string' ? r.reason : '';
  const recommend = typeof r.recommend === 'string' ? r.recommend : '';
  if (!kind || !who) return null;
  const toneStr = r.tone === 'danger' || r.tone === 'accent' ? r.tone : 'warn';
  return {
    id: typeof r.id === 'string' ? r.id : undefined,
    kind,
    who,
    count: typeof r.count === 'number' ? r.count : 0,
    when: typeof r.when === 'string' ? r.when : '',
    tone: toneStr,
    reason,
    recommend };
}

export default function AuditAnomalyTab() {
  const [rows, setRows] = useState<AnomalyCard[]>(FALLBACK_ANOMALIES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/audit/anomalies', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        const list = Array.isArray(json)
          ? json
          : (json as { rows?: unknown } | null)?.rows;
        if (!Array.isArray(list) || list.length === 0) throw new Error('empty');
        const parsed = list
          .map((r) => parseRow(r as ApiAnomalyRow))
          .filter((r): r is AnomalyCard => r !== null);
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
      title={`이상 감지 · 최근 7일 (${rows.length}건)`}
      action={
        <span className="text-[10.5px] text-[var(--toss-gray-4)]">
          {loaded ? '실시간' : '로딩…'}
        </span>
      }
    >
      <ul className="space-y-2" aria-label="이상 감지 목록">
        {rows.map((c, i) => (
          <li
            key={c.id ?? `${c.kind}-${c.who}-${i}`}
            className="px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--muted)] border border-[var(--border)] space-y-1.5"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Chip tone={c.tone}>{c.kind}</Chip>
              <b className="text-[12px] text-[var(--foreground)]">{c.who}</b>
              {c.count > 0 && (
                <span className="text-[10.5px] tabular-nums text-[var(--toss-gray-4)]">
                  · {c.count}건
                </span>
              )}
              {c.when && (
                <span className="text-[10.5px] tabular-nums text-[var(--toss-gray-4)]">
                  · {c.when}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[var(--toss-gray-4)]">{c.reason}</div>
            <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
              <span className="text-[10.5px] text-[var(--toss-gray-4)]">
                권장: <b className="text-[var(--foreground)]">{c.recommend}</b>
              </span>
              <SmBtn primary ariaLabel={`${c.who} 이상 감지 검토`}>
                검토
              </SmBtn>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
