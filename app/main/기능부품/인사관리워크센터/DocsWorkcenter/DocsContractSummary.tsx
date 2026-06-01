'use client';

/**
 * DocsContractSummary — 계약 현황 탭 요약 카드 (reference §1398~1429)
 *
 * data-tbl 7열: 이름 / 고용 chip / 계약 종류 / 시작일 / 종료일 / 자동 연장 / 상태 chip
 * 최대 6행 (만료 임박 우선)
 *
 * 데이터: employment_contracts 테이블 (없으면 staff_members.employ_type 폴백)
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface ContractRow {
  id: string;
  name: string;
  employ: string;
  kind: string;
  start: string;
  end: string;
  auto: string;
  status: string;
  employTone: 'success' | 'accent' | 'warn' | 'muted';
  statusTone: 'success' | 'warn' | 'danger' | 'muted';
}

const TONE_CLS: Record<'success' | 'accent' | 'warn' | 'danger' | 'muted', string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  accent: 'bg-[var(--accent)]/15 text-[var(--accent)]',
  warn: 'bg-amber-500/15 text-amber-700',
  danger: 'bg-red-500/15 text-red-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
};

function formatDate(value: unknown): string {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function pickEmployTone(employ: string): ContractRow['employTone'] {
  if (employ.includes('정규')) return 'success';
  if (employ.includes('계약')) return 'accent';
  if (employ.includes('수습')) return 'warn';
  return 'muted';
}

function pickStatusTone(endDate: string | null, statusRaw: string): { status: string; tone: ContractRow['statusTone'] } {
  if (statusRaw === '종료' || statusRaw === '해지') return { status: statusRaw, tone: 'muted' };
  if (statusRaw === '서명대기') return { status: '서명대기', tone: 'warn' };
  const days = daysUntil(endDate);
  if (days === null) return { status: '유효', tone: 'success' };
  if (days < 0) return { status: '만료', tone: 'muted' };
  if (days <= 30) return { status: `만료 D-${days}`, tone: 'danger' };
  if (days <= 90) return { status: `만료 D-${days}`, tone: 'warn' };
  return { status: '유효', tone: 'success' };
}

export default function DocsContractSummary() {
  const [rows, setRows] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const { data, error } = await supabase
          .from('employment_contracts')
          .select(`
            id,
            status,
            contract_type,
            effective_date,
            probation_months,
            staff_id,
            staff_members (
              name,
              joined_at,
              join_date,
              permissions
            )
          `)
          .order('created_at', { ascending: false })
          .limit(40);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, any>> | null) ?? [];
        const items: ContractRow[] = list.map((r) => {
          const staff = r.staff_members;
          const name = staff?.name ?? '직원';

          // 고용 유형 파악
          let employ = '정규직';
          if (staff?.permissions) {
            const perms = staff.permissions;
            employ = perms.employment_type || perms.current_work_type || '정규직';
          }

          const startRaw = staff?.joined_at || staff?.join_date || r.effective_date || null;
          const endRaw = staff?.permissions?.contract_end_date || null;
          const autoRenew = staff?.permissions?.auto_renew || false;

          const statusRaw = String(r.status ?? '');
          const { status, tone: statusTone } = pickStatusTone(endRaw, statusRaw);
          return {
            id: String(r.id ?? ''),
            name,
            employ,
            kind: String(r.contract_type ?? '근로계약'),
            start: formatDate(startRaw),
            end: endRaw ? formatDate(endRaw) : '영구',
            auto: autoRenew ? '자동 연장' : '-',
            status,
            employTone: pickEmployTone(employ),
            statusTone,
          };
        });
        items.sort((a, b) => {
          const order = { danger: 0, warn: 1, success: 2, muted: 3 } as const;
          return order[a.statusTone] - order[b.statusTone];
        });
        setRows(items.slice(0, 6));
      } catch (error) {
        if (cancelled) return;
        console.error('[DocsContractSummary] fetch failed', error);
        setErrMsg('계약 데이터를 불러오지 못했습니다.');
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

  return (
    <section className="app-card flex flex-col p-3 md:p-4" aria-labelledby="docs-contract-summary-title">
      <header className="mb-2 flex items-center justify-between">
        <h3 id="docs-contract-summary-title" className="text-[13px] font-bold text-[var(--foreground)]">
          계약 현황 (만료 임박 우선)
        </h3>
      </header>
      {loading ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">불러오는 중…</div>
      ) : errMsg ? (
        <div role="alert" className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          {errMsg}
        </div>
      ) : !hasRows ? (
        <div className="py-6 text-center text-[12px] text-[var(--toss-gray-4)]">등록된 계약이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[11px] font-bold text-[var(--toss-gray-4)]">
                <th scope="col" className="py-1.5 pr-2">이름</th>
                <th scope="col" className="py-1.5 pr-2">고용</th>
                <th scope="col" className="py-1.5 pr-2">계약 종류</th>
                <th scope="col" className="py-1.5 pr-2 tnum">시작일</th>
                <th scope="col" className="py-1.5 pr-2 tnum">종료일</th>
                <th scope="col" className="py-1.5 pr-2">자동 연장</th>
                <th scope="col" className="py-1.5">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-[var(--border-subtle,var(--border))] last:border-b-0">
                  <td className="py-1.5 pr-2 font-bold text-[var(--foreground)]">{row.name}</td>
                  <td className="py-1.5 pr-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_CLS[row.employTone]}`}>{row.employ}</span>
                  </td>
                  <td className="py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.kind}</td>
                  <td className="tnum py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.start}</td>
                  <td className="tnum py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.end}</td>
                  <td className="py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.auto}</td>
                  <td className="py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_CLS[row.statusTone]}`}>{row.status}</span>
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
