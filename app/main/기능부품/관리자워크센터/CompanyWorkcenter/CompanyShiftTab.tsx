'use client';

/**
 * 회사 관리 — 근무 형태 탭
 * JM: 단일 책임, 표 1개
 * JM6: table에 scope=col, role=table caption
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_SHIFTS } from './fallback-data';
import type { ShiftRow } from './types';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

async function loadShifts(): Promise<ShiftRow[]> {
  try {
    const { data, error } = await supabase
      .from('shift_patterns')
      .select('name,start_time,end_time,break_min,target,active')
      .limit(50);
    if (error || !Array.isArray(data) || data.length === 0) return FALLBACK_SHIFTS;
    return data.filter(isRecord).map((r): ShiftRow => {
      const name = typeof r.name === 'string' ? r.name : '-';
      const start = typeof r.start_time === 'string' ? r.start_time : '-';
      const end = typeof r.end_time === 'string' ? r.end_time : '-';
      const breakRaw = r.break_min;
      const breakMin =
        typeof breakRaw === 'number' ? (breakRaw > 0 ? `${breakRaw}분` : '없음') : '없음';
      const target = typeof r.target === 'string' ? r.target : '-';
      const active = r.active !== false;
      return { name, start, end, breakMin, target, active };
    });
  } catch {
    return FALLBACK_SHIFTS;
  }
}

export default function CompanyShiftTab() {
  const [rows, setRows] = useState<ShiftRow[]>(FALLBACK_SHIFTS);

  useEffect(() => {
    let alive = true;
    void loadShifts().then((d) => {
      if (alive) setRows(d);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Card
      title={`근무 형태 (${rows.length})`}
      action={<SmBtn primary ariaLabel="새 근무 형태 추가">+ 새 형태</SmBtn>}
    >
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-[12px] data-table">
          <caption className="sr-only">근무 형태 목록</caption>
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[10.5px] text-[var(--toss-gray-4)]">
              <th scope="col" className="px-2 py-2 font-semibold">형태명</th>
              <th scope="col" className="px-2 py-2 font-semibold">시작</th>
              <th scope="col" className="px-2 py-2 font-semibold">종료</th>
              <th scope="col" className="px-2 py-2 font-semibold">휴게</th>
              <th scope="col" className="px-2 py-2 font-semibold">적용 대상</th>
              <th scope="col" className="px-2 py-2 font-semibold">상태</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.name}
                className="border-b border-[var(--border)]/60 hover:bg-[var(--muted)]"
              >
                <td className="px-2 py-2 font-bold text-[var(--foreground)]">{r.name}</td>
                <td className="px-2 py-2 tabular-nums">{r.start}</td>
                <td className="px-2 py-2 tabular-nums">{r.end}</td>
                <td className="px-2 py-2 text-[var(--toss-gray-4)]">{r.breakMin}</td>
                <td className="px-2 py-2 text-[var(--toss-gray-4)]">{r.target}</td>
                <td className="px-2 py-2">
                  <Chip tone={r.active ? 'success' : 'muted'}>
                    {r.active ? '활성' : '비활성'}
                  </Chip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
