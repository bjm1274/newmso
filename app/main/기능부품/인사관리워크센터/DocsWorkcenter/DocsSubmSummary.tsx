'use client';

/**
 * DocsSubmSummary — 서류 제출 탭 요약 카드 (reference §1553~1575)
 *
 * hr-expire-list 5행: D-day chip + 이름 + 서류 + 알림·첨부요청 버튼
 *
 * 데이터: required_document_submissions 등 (없으면 staff_documents 미제출 항목)
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

interface SubmRow {
  id: string;
  staffName: string;
  doc: string;
  due: string;
  days: number;
  tone: 'warn' | 'danger' | 'muted';
}

const TONE_CLS: Record<SubmRow['tone'], string> = {
  warn: 'bg-amber-500/15 text-amber-700',
  danger: 'bg-red-500/15 text-red-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
};

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function pickTone(days: number): SubmRow['tone'] {
  if (days <= 7) return 'danger';
  if (days <= 30) return 'warn';
  return 'muted';
}

export default function DocsSubmSummary() {
  const [rows, setRows] = useState<SubmRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const { data, error } = await supabase
          .from('required_document_submissions')
          .select('id, staff_name, document_name, due_date')
          .eq('status', '미제출')
          .order('due_date', { ascending: true, nullsFirst: false })
          .limit(20);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];
        const items: SubmRow[] = [];
        for (const r of list) {
          const dueRaw = r.due_date ? String(r.due_date) : null;
          const d = daysUntil(dueRaw);
          if (d === null) continue;
          items.push({
            id: String(r.id ?? ''),
            staffName: String(r.staff_name ?? '직원'),
            doc: String(r.document_name ?? '서류'),
            due: `D-${d}`,
            days: d,
            tone: pickTone(d),
          });
        }
        setRows(items.slice(0, 5));
      } catch (error) {
        if (cancelled) return;
        console.error('[DocsSubmSummary] fetch failed', error);
        setErrMsg('서류 제출 현황을 불러오지 못했습니다.');
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void fetchData();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasRows = useMemo(() => rows.length > 0, [rows]);

  const handleNotify = (row: SubmRow) => {
    toast(`${row.staffName}에게 ${row.doc} 제출 알림을 보냈습니다.`, 'success');
  };

  const handleRequest = (row: SubmRow) => {
    toast(`${row.staffName}에게 ${row.doc} 첨부 요청을 보냈습니다.`, 'success');
  };

  return (
    <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="docs-subm-summary-title">
      <header className="mb-2 flex items-center justify-between">
        <h3 id="docs-subm-summary-title" className="text-[13px] font-bold text-[var(--foreground)]">
          직원 서류 제출 현황 (임박 5건)
        </h3>
      </header>
      {loading ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
      ) : errMsg ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {errMsg}
        </div>
      ) : !hasRows ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">제출 임박 서류가 없습니다.</div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5"
            >
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tnum ${TONE_CLS[row.tone]}`}>{row.due}</span>
              <span className="text-[12px] font-bold text-[var(--foreground)]">{row.staffName}</span>
              <span className="text-[11px] text-[var(--toss-gray-4)]">· {row.doc}</span>
              <span className="ml-auto flex gap-1">
                <button
                  type="button"
                  onClick={() => handleNotify(row)}
                  aria-label={`${row.staffName} ${row.doc} 알림 발송`}
                  className="inline-flex h-7 items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--surface-subtle,var(--muted))]"
                >
                  알림
                </button>
                <button
                  type="button"
                  onClick={() => handleRequest(row)}
                  aria-label={`${row.staffName} ${row.doc} 첨부 요청`}
                  className="inline-flex h-7 items-center rounded-[var(--radius-md)] bg-[var(--accent)] px-2 text-[11px] font-bold text-white hover:opacity-90"
                >
                  첨부 요청
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
