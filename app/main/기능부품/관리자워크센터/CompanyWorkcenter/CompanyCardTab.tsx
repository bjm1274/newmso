'use client';

/**
 * 회사 관리 — 법인카드 탭
 * 4개 카드 KPI(사용자·이번달·한도·사용률) + 사용 내역 표
 * JM6: progressbar role + aria-valuenow
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, Chip, ProgressBar, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_CARDS } from './fallback-data';
import type { CorpCardRow } from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function loadCards(): Promise<CorpCardRow[]> {
  try {
    const { data, error } = await supabase
      .from('corp_cards')
      .select('card,user,used_m,limit_m,status')
      .limit(50);
    if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_CARDS;
    return data.filter(isRecord).map((r): CorpCardRow => {
      const card = typeof r.card === 'string' ? r.card : '-';
      const user = typeof r.user === 'string' ? r.user : '-';
      const usedM = typeof r.used_m === 'number' ? r.used_m : 0;
      const limitM = typeof r.limit_m === 'number' && r.limit_m > 0 ? r.limit_m : 1;
      const pct = Math.round((usedM / limitM) * 100);
      const rawStatus = typeof r.status === 'string' ? r.status : '정상';
      const status: CorpCardRow['status'] =
        rawStatus === '한도 임박' || rawStatus === '정지' ? rawStatus : '정상';
      return { card, user, usedM, limitM, pct, status };
    });
  } catch {
    return FALLBACK_CARDS;
  }
}

export default function CompanyCardTab() {
  const [rows, setRows] = useState<CorpCardRow[]>(FALLBACK_CARDS);

  useEffect(() => {
    let alive = true;
    void loadCards().then((d) => {
      if (alive) setRows(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  const stats = useMemo(() => {
    const totalUsed = rows.reduce((a, r) => a + r.usedM, 0);
    const totalLimit = rows.reduce((a, r) => a + r.limitM, 0);
    const avgPct = totalLimit > 0 ? Math.round((totalUsed / totalLimit) * 100) : 0;
    return {
      users: rows.length,
      used: totalUsed.toFixed(1),
      limit: totalLimit.toFixed(1),
      pct: avgPct,
    };
  }, [rows]);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard label="사용자 수" value={`${stats.users}`} unit="명" />
        <KpiCard label="이번달 사용액" value={stats.used} unit="M" />
        <KpiCard label="총 한도" value={stats.limit} unit="M" />
        <KpiCard label="평균 사용률" value={`${stats.pct}`} unit="%" />
      </div>

      <Card
        title="법인카드 사용 내역"
        action={<SmBtn primary ariaLabel="법인카드 등록">+ 카드 등록</SmBtn>}
      >
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-[12px]">
            <caption className="sr-only">법인카드 사용 내역</caption>
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[10.5px] text-[var(--toss-gray-4)]">
                <th scope="col" className="px-2 py-2 font-semibold">카드</th>
                <th scope="col" className="px-2 py-2 font-semibold">사용자</th>
                <th scope="col" className="px-2 py-2 font-semibold">이번달</th>
                <th scope="col" className="px-2 py-2 font-semibold">한도</th>
                <th scope="col" className="px-2 py-2 font-semibold">사용률</th>
                <th scope="col" className="px-2 py-2 font-semibold">상태</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const tone = r.status === '한도 임박' ? 'warn' : r.status === '정지' ? 'danger' : 'success';
                return (
                  <tr
                    key={r.card}
                    className="border-b border-[var(--border)]/60 hover:bg-[var(--muted)]"
                  >
                    <td className="px-2 py-2 font-bold tabular-nums">{r.card}</td>
                    <td className="px-2 py-2">{r.user}</td>
                    <td className="px-2 py-2 tabular-nums">{r.usedM}M</td>
                    <td className="px-2 py-2 tabular-nums text-[var(--toss-gray-4)]">{r.limitM}M</td>
                    <td className="px-2 py-2">
                      <div
                        className="flex items-center gap-1.5"
                        role="progressbar"
                        aria-valuenow={r.pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${r.card} 사용률 ${r.pct}%`}
                      >
                        <div className="w-20">
                          <ProgressBar value={r.pct} tone={r.pct > 90 ? 'danger' : r.pct > 70 ? 'warn' : 'accent'} />
                        </div>
                        <span className="text-[10.5px] tabular-nums text-[var(--toss-gray-4)]">{r.pct}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <Chip tone={tone}>{r.status}</Chip>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="app-card px-3 py-2.5">
      <div className="text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">{label}</div>
      <div className="text-lg font-bold text-[var(--foreground)] tabular-nums">
        {value}
        {unit && (
          <span className="text-[11px] font-semibold text-[var(--toss-gray-4)] ml-0.5">{unit}</span>
        )}
      </div>
    </div>
  );
}
