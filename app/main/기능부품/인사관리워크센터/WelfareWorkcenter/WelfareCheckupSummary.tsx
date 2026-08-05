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
import { db } from '@/lib/db-client';
import WelfareSummaryShell from './WelfareSummaryShell';
import { formatDateCompact, WELFARE_TONE_CLS, type WelfareTone } from './welfare-summary-utils';

interface CheckupRow {
  id: string;
  staffName: string;
  place: string;
  when: string;
  status: '완료' | '예약' | '미수검' | string;
  tone: WelfareTone;
}

interface CheckupCounts {
  done: number;
  reserved: number;
  notDone: number;
}

const STATUS_TONE: Record<string, WelfareTone> = {
  완료: 'success',
  예약: 'warn',
  미수검: 'danger',
};

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
        // 검진기관 컬럼은 `hospital` 이다. 예전에는 `place` 를 셀렉트했는데 D1 에 없는
        // 컬럼이라, SQLite 의 큰따옴표-문자열 관용 동작 때문에 에러 없이 값만 사라졌고
        // 화면에는 언제나 '-' 가 찍혔다(에러가 아니라 조용한 공백이라 아무도 신고하지 않았다).
        const { data, error } = await db
          .from('health_checkups')
          .select('id, staff_name, hospital, scheduled_date, status')
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
          place: String(r.hospital ?? '-'),
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
    <WelfareSummaryShell
      titleId="welfare-checkup-summary-title"
      title={`${new Date().getFullYear()}년 건강검진 현황`}
      meta={
        total > 0 ? (
          <span className="text-[10px] font-medium text-[var(--toss-gray-4)]">총 {total}명</span>
        ) : null
      }
      loading={loading}
      error={errMsg}
      empty={total === 0}
      emptyText="올해 등록된 검진이 없습니다."
    >
      <>
        <div
          className="flex h-7 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]"
          role="img"
          aria-label={`완료 ${counts.done} 예약 ${counts.reserved} 미수검 ${counts.notDone}`}
        >
          {segs.map((s) =>
            s.pct > 0 ? (
              <span
                key={s.key}
                style={{ width: `${s.pct}%` }}
                className={`flex items-center justify-center text-[10px] font-bold ${s.cls}`}
              >
                {s.pct >= 12 ? s.label : ''}
              </span>
            ) : null,
          )}
        </div>

        {rows.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1.5">
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5 py-1.5"
              >
                <span className="text-[12px] font-bold text-[var(--foreground)]">{row.staffName}</span>
                <span className="text-[11px] text-[var(--toss-gray-4)]">{row.place}</span>
                <span className="tnum ml-auto text-[11px] font-semibold text-[var(--toss-gray-4)]">
                  {row.when || '안내 재발송'}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${WELFARE_TONE_CLS[row.tone]}`}>
                  {row.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </>
    </WelfareSummaryShell>
  );
}
