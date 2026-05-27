'use client';

/**
 * 회사 관리 — 급여 기준 탭
 * 기준 표 1개
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_PAY_RULES } from './fallback-data';
import type { RuleRow } from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function loadPayRules(): Promise<RuleRow[]> {
  try {
    const { data, error } = await supabase
      .from('payroll_policies')
      .select('label,value')
      .limit(50);
    if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_PAY_RULES;
    return data.filter(isRecord).map((r): RuleRow => ({
      label: typeof r.label === 'string' ? r.label : '-',
      value: typeof r.value === 'string' ? r.value : '-',
    }));
  } catch {
    return FALLBACK_PAY_RULES;
  }
}

export default function CompanyPayrollTab() {
  const [rules, setRules] = useState<RuleRow[]>(FALLBACK_PAY_RULES);

  useEffect(() => {
    let alive = true;
    void loadPayRules().then((d) => {
      if (alive) setRules(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card
      title="급여 기준 정책"
      action={<SmBtn ariaLabel="급여 기준 편집">편집</SmBtn>}
    >
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[12px]">
          <caption className="sr-only">급여 기준 정책 목록</caption>
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[10.5px] text-[var(--toss-gray-4)]">
              <th scope="col" className="px-2 py-2 font-semibold w-1/3">항목</th>
              <th scope="col" className="px-2 py-2 font-semibold">기준</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr
                key={r.label}
                className="border-b border-[var(--border)]/60 hover:bg-[var(--muted)]"
              >
                <td className="px-2 py-2 text-[var(--toss-gray-4)]">{r.label}</td>
                <td className="px-2 py-2 font-bold text-[var(--foreground)]">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
