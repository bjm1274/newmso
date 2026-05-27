'use client';

/**
 * 회사 관리 — 휴가·공휴일 탭
 * 공휴일 표 + 휴가 기준(정책) 표 2단 레이아웃
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_HOLIDAYS, FALLBACK_LEAVE_RULES } from './fallback-data';
import type { HolidayItem, RuleRow } from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function loadHolidays(): Promise<HolidayItem[]> {
  try {
    const { data, error } = await supabase
      .from('company_holidays')
      .select('date,name,kind')
      .limit(100);
    if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_HOLIDAYS;
    return data.filter(isRecord).map((r): HolidayItem => {
      const kindRaw = typeof r.kind === 'string' ? r.kind : '법정';
      const kind: HolidayItem['kind'] =
        kindRaw === '기념일' || kindRaw === '회사' ? kindRaw : '법정';
      return {
        date: typeof r.date === 'string' ? r.date : '-',
        name: typeof r.name === 'string' ? r.name : '-',
        kind,
      };
    });
  } catch {
    return FALLBACK_HOLIDAYS;
  }
}

async function loadLeaveRules(): Promise<RuleRow[]> {
  try {
    const { data, error } = await supabase
      .from('leave_policies')
      .select('label,value')
      .limit(50);
    if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_LEAVE_RULES;
    return data.filter(isRecord).map((r): RuleRow => ({
      label: typeof r.label === 'string' ? r.label : '-',
      value: typeof r.value === 'string' ? r.value : '-',
    }));
  } catch {
    return FALLBACK_LEAVE_RULES;
  }
}

export default function CompanyLeaveTab() {
  const [holidays, setHolidays] = useState<HolidayItem[]>(FALLBACK_HOLIDAYS);
  const [rules, setRules] = useState<RuleRow[]>(FALLBACK_LEAVE_RULES);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadHolidays(), loadLeaveRules()]).then(([h, r]) => {
      if (!alive) return;
      setHolidays(h);
      setRules(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <Card
        title={`2026 공휴일 (${holidays.length})`}
        action={<SmBtn primary ariaLabel="공휴일 추가">+ 공휴일 추가</SmBtn>}
      >
        <div className="space-y-1">
          {holidays.map((h) => (
            <div
              key={`${h.date}-${h.name}`}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)]"
            >
              <span className="text-[12px]">
                <b className="tabular-nums" style={{ color: 'var(--danger, #DC2626)' }}>
                  {h.date}
                </b>
                <span className="mx-1.5 text-[var(--toss-gray-4)]">·</span>
                <span className="font-bold text-[var(--foreground)]">{h.name}</span>
              </span>
              <Chip tone={h.kind === '법정' ? 'danger' : h.kind === '회사' ? 'accent' : 'muted'}>
                {h.kind}
              </Chip>
            </div>
          ))}
        </div>
      </Card>

      <Card title="휴가 기준 (정책)">
        <div className="space-y-1">
          {rules.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between px-2.5 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)] text-[12px]"
            >
              <span className="text-[var(--toss-gray-4)]">{r.label}</span>
              <span className="font-bold text-[var(--foreground)] text-right">{r.value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
