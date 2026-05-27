'use client';

/**
 * WelfareCheckupSummary — 건강검진 탭 요약 카드 (reference §1200~1226)
 *
 * - 진행률 hr-check-bar 3-segment (완료/예약/미수검)
 * - hr-check-list 4행 (이름 + 기관 + 일자 + 상태 chip)
 *
 * 데이터: health_checkups 테이블 (당해 연도 필터)
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface CheckupRow {
  id: string;
  staffName: string;
  place: string;
  when: string;
  status: '완료' | '예약' | '미수검' | string;
  tone: 'success' | 'warn' | 'danger' | 'muted';
}

interface CheckupCounts {
  done: number;
  reserved: number;
  notDone: number;
}

const STATUS_TONE: Record<string, CheckupRow['tone']> = {
  완료: 'success',
  예약: 'warn',
  미수검: 'danger',
};

const TONE_CLS: Record<CheckupRow['tone'], string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  warn: 'bg-amber-500/15 text-amber-700',
  danger: 'bg-red-500/15 text-red-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
};

function formatDateCompact(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function WelfareCheckupSummary() {
  const [rows, setRows] = useState<CheckupRow[]>([]);
  const [counts, setCounts] = useState<CheckupCounts>({ done: 0, reserved: 0, notDone: 0 });
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const year = new Date().getFullYear();
        const yearStart = `${year}-01-01`;
        const yearEnd = `${year}-12-31`;
        const { data, error } = await supabase
          .from('health_checkups')
          .select('id, staff_name, place, scheduled_date, status')
          .gte('scheduled_date', yearStart)
          .lte('scheduled_date', yearEnd)
          .order('scheduled_date', { ascending: false })
          .limit(50);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];
        let done = 0;
        let reserved = 0;
        let notDone = 0;
        for (const r of list) {
          const s = String(r.status ?? '');
          if (s === '완료') done += 1;
          else if (s === '예약') reserved += 1;
          else notDone += 1;
        }
        setCounts({ done, reserved, notDone });
        const display: CheckupRow[] = list.slice(0, 4).map((r) => ({
          id: String(r.id ?? ''),
          staffName: String(r.staff_name ?? '직원'),
          place: String(r.place ?? '-'),
          when: formatDateCompact(r.scheduled_date),
          status: String(r.status ?? '미수검'),
          tone: STATUS_TONE[String(r.status ?? '')] ?? 'muted',
        }));
        setRows(display);
      } catch (error) {
        if (cancelled) return;
        console.error('[WelfareCheckupSummary] fetch failed', error);
        setErrMsg('건강검진 데이터를 불러오지 못했습니다.');
        setRows([]);
        setCounts({ done: 0, reserved: 0, notDone: 0 });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = counts.done + counts.reserved + counts.notDone;
  const segs = useMemo(() => {
    const denom = total === 0 ? 1 : total;
    return [
      { key: 'done', label: `수검 완료 ${counts.done}명`, pct: (counts.done / denom) * 100, cls: 'bg-emerald-500/85 text-white' },
      { key: 'wait', label: `예약 ${counts.reserved}`, pct: (counts.reserved / denom) * 100, cls: 'bg-amber-500/85 text-white' },
      { key: 'none', label: `미수검 ${counts.notDone}`, pct: (counts.notDone / denom) * 100, cls: 'bg-red-500/80 text-white' },
    ];
  }, [counts, total]);

  return (
    <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="welfare-checkup-summary-title">
      <header className="mb-2 flex items-center justify-between">
        <h3 id="welfare-checkup-summary-title" className="text-[13px] font-bold text-[var(--foreground)]">
          {new Date().getFullYear()}년 건강검진 현황
        </h3>
        {!loading && total > 0 && (
          <span className="text-[10px] font-medium text-[var(--toss-gray-4)]">
            총 {total}명
          </span>
        )}
      </header>

      {loading ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
      ) : errMsg ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {errMsg}
        </div>
      ) : total === 0 ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">올해 등록된 검진이 없습니다.</div>
      ) : (
        <>
          <div className="flex h-7 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]" role="img" aria-label={`완료 ${counts.done} 예약 ${counts.reserved} 미수검 ${counts.notDone}`}>
            {segs.map((s) => (
              s.pct > 0 ? (
                <span
                  key={s.key}
                  style={{ width: `${s.pct}%` }}
                  className={`flex items-center justify-center text-[10px] font-bold ${s.cls}`}
                >
                  {s.pct >= 12 ? s.label : ''}
                </span>
              ) : null
            ))}
          </div>

          {rows.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5">
                  <span className="text-[12px] font-bold text-[var(--foreground)]">{row.staffName}</span>
                  <span className="text-[11px] text-[var(--toss-gray-4)]">{row.place}</span>
                  <span className="tnum ml-auto text-[11px] font-semibold text-[var(--toss-gray-4)]">{row.when || '안내 재발송'}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_CLS[row.tone]}`}>{row.status}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
