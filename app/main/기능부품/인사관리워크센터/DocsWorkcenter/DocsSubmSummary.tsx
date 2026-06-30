'use client';

/**
 * DocsSubmSummary — 서류 제출 탭 요약 카드 (reference §1553~1575)
 *
 * hr-expire-list 5행: D-day chip + 이름 + 서류 + 알림·첨부요청 버튼
 *
 * 데이터: required_document_submissions 등 (없으면 staff_documents 미제출 항목)
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { formatKoreanDateKey } from '@/lib/seoul-time';

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
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]' };

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

const REQUIRED_DOCS = [
  { id: '가족관계', label: '가족관계증명서' },
  { id: '개인정보보호', label: '개인정보 보호교육' },
  { id: '면허자격', label: '면허(자격)증 사본' },
  { id: '보건증', label: '보건선결과(보건증)' },
  { id: '안전보건', label: '산업안전 보건교육' },
  { id: '성희롱예방', label: '성희롱 예방교육' },
  { id: '신분증', label: '신분증 사본' },
  { id: '일반검진', label: '일반 건강검진' },
  { id: '잠복결핵', label: '잠복결핵 검진결과' },
  { id: '장애인인식', label: '장애인 인식개선교육' },
  { id: '등본', label: '주민등록등본' },
  { id: '초본', label: '주민등록초본' },
  { id: '괴롭힘예방', label: '직장내 괴롭힘 예방교육' },
  { id: '통장', label: '통장사본' },
  { id: '퇴직연금', label: '퇴직연금교육' },
  { id: '특수검진', label: '특수 건강검진' },
];

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
        const [staffRes, repoRes] = await Promise.all([
          db
            .from('staff_members')
            .select('id, name, status, join_date, joined_at')
            .eq('status', '재직'),
          db
            .from('document_repository')
            .select('created_by, category'),
        ]);

        if (cancelled) return;
        if (staffRes.error) throw staffRes.error;
        if (repoRes.error) throw repoRes.error;

        const staffList = staffRes.data ?? [];
        const repoDocs = repoRes.data ?? [];

        const items: SubmRow[] = [];
        for (const s of staffList) {
          const staffDocs = repoDocs.filter((d: any) => String(d.created_by) === String(s.id));
          const hireDate = s.join_date || s.joined_at;

          // Calculate due date (join_date + 7 days)
          let dueDate: Date;
          if (hireDate) {
            dueDate = new Date(hireDate);
            dueDate.setDate(dueDate.getDate() + 7);
          } else {
            dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);
          }

          const formattedDueStr = formatKoreanDateKey(dueDate);
          const d = daysUntil(formattedDueStr);
          if (d === null) continue;

          for (const doc of REQUIRED_DOCS) {
            const isSubmitted = staffDocs.some(
              (d: any) => d.category === doc.id || d.category === doc.label
            );

            if (!isSubmitted) {
              items.push({
                id: `${s.id}-${doc.id}`,
                staffName: String(s.name ?? '직원'),
                doc: doc.label,
                due: d < 0 ? `D+${Math.abs(d)}` : d === 0 ? 'D-Day' : `D-${d}`,
                days: d,
                tone: pickTone(d) });
            }
          }
        }

        // Sort: overdue first (lowest days first)
        items.sort((a, b) => a.days - b.days);

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
