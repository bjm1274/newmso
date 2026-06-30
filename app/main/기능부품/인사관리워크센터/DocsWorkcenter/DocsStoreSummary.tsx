'use client';

/**
 * DocsStoreSummary — 문서보관함 탭 요약 카드 (reference §1469~1506)
 *
 * chip 필터 5종 (전체/계약서/증빙/설명서/기타) + 표 7열
 * 컬럼: 문서명 / 관련 직원 / 분류 / 보관 시작 / 보관 기간 / 보안 chip / (액션)
 * 최대 5행
 *
 * 데이터: staff_documents 테이블
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';

type CategoryKey = 'all' | 'contract' | 'evidence' | 'manual' | 'other';

interface DocRow {
  id: string;
  name: string;
  who: string;
  category: string;
  categoryKey: Exclude<CategoryKey, 'all'>;
  from: string;
  period: string;
  security: '일반' | '대외비' | string;
  securityTone: 'success' | 'warn';
}

function pickCategoryKey(category: string): Exclude<CategoryKey, 'all'> {
  if (!category) return 'other';
  if (category.includes('계약')) return 'contract';
  if (category.includes('증빙') || category.includes('증명')) return 'evidence';
  if (category.includes('설명') || category.includes('매뉴얼')) return 'manual';
  return 'other';
}

function formatDate(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

export default function DocsStoreSummary() {
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<CategoryKey>('all');

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const [repoRes, staffRes] = await Promise.all([
          db
            .from('document_repository')
            .select('id, title, category, created_at, created_by')
            .order('created_at', { ascending: false })
            .limit(50),
          db
            .from('staff_members')
            .select('id, name'),
        ]);

        if (cancelled) return;
        if (repoRes.error) throw repoRes.error;
        if (staffRes.error) throw staffRes.error;

        const repoList = repoRes.data ?? [];
        const staffList = staffRes.data ?? [];

        const staffMap: Record<string, string> = {};
        for (const s of staffList) {
          staffMap[String(s.id)] = String(s.name ?? '');
        }

        setRows(
          repoList.map((r: any) => {
            const cat = String(r.category ?? '기타');
            const sec = cat === '근로계약서' ? '대외비' : '일반';
            return {
              id: String(r.id ?? ''),
              name: String(r.title ?? '문서'),
              who: String(r.created_by ? (staffMap[String(r.created_by)] ?? '-') : '-'),
              category: cat,
              categoryKey: pickCategoryKey(cat),
              from: formatDate(r.created_at),
              period: '영구',
              security: sec,
              securityTone: sec === '대외비' ? 'warn' : 'success' };
          }),
        );
      } catch (error) {
        if (cancelled) return;
        console.error('[DocsStoreSummary] fetch failed', error);
        setErrMsg('문서보관함 데이터를 불러오지 못했습니다.');
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

  const counts = useMemo(() => {
    const acc = { all: rows.length, contract: 0, evidence: 0, manual: 0, other: 0 };
    for (const r of rows) acc[r.categoryKey] += 1;
    return acc;
  }, [rows]);

  const visible = useMemo(() => {
    const list = filter === 'all' ? rows : rows.filter((r) => r.categoryKey === filter);
    return list.slice(0, 5);
  }, [rows, filter]);

  const filterDefs: Array<{ key: CategoryKey; label: string; count: number }> = [
    { key: 'all', label: '전체', count: counts.all },
    { key: 'contract', label: '계약서', count: counts.contract },
    { key: 'evidence', label: '증빙', count: counts.evidence },
    { key: 'manual', label: '설명서', count: counts.manual },
    { key: 'other', label: '기타', count: counts.other },
  ];

  return (
    <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="docs-store-summary-title">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 id="docs-store-summary-title" className="text-[13px] font-bold text-[var(--foreground)]">
          문서보관함
        </h3>
        <div role="group" aria-label="문서 분류 필터" className="flex flex-wrap gap-1">
          {filterDefs.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={`inline-flex h-6 items-center gap-1 rounded-full border px-2 text-[10.5px] font-bold transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                }`}
              >
                {f.label}
                <span className="tnum opacity-80">{f.count}</span>
              </button>
            );
          })}
        </div>
      </header>
      {loading ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
      ) : errMsg ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {errMsg}
        </div>
      ) : visible.length === 0 ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">표시할 문서가 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] font-bold text-[var(--toss-gray-4)]">
                <th scope="col" className="py-1.5 pr-2">문서명</th>
                <th scope="col" className="py-1.5 pr-2">관련 직원</th>
                <th scope="col" className="py-1.5 pr-2">분류</th>
                <th scope="col" className="py-1.5 pr-2 tnum">보관 시작</th>
                <th scope="col" className="py-1.5 pr-2">보관 기간</th>
                <th scope="col" className="py-1.5">보안</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border-subtle,var(--border))] last:border-b-0">
                  <td className="py-1.5 pr-2 font-bold text-[var(--foreground)]">{row.name}</td>
                  <td className="py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.who}</td>
                  <td className="py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.category}</td>
                  <td className="tnum py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.from}</td>
                  <td className="py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.period}</td>
                  <td className="py-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        row.securityTone === 'warn'
                          ? 'bg-amber-500/15 text-amber-700'
                          : 'bg-emerald-500/15 text-emerald-700'
                      }`}
                    >
                      {row.security}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
