'use client';

/**
 * WelfareDeviceSummary — 의료기기 점검 탭 요약 카드 (reference §1254~1277)
 *
 * data-tbl 6열: 장비 / 설치 위치 / 마지막 점검 / 다음 점검 / 담당 / 상태 chip
 * 최대 6행 표시.
 *
 * 데이터: medical_devices 테이블
 */

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db-client';
import WelfareSummaryShell from './WelfareSummaryShell';
import {
  daysUntil,
  formatDateCompact,
  WELFARE_TONE_CLS,
  type WelfareTone,
} from './welfare-summary-utils';

interface DeviceRow {
  id: string;
  name: string;
  location: string;
  last: string;
  next: string;
  who: string;
  status: '예정' | '지연' | '수시' | string;
  tone: WelfareTone;
}

function formatDate(value: unknown): string {
  if (!value) return '-';
  const compact = formatDateCompact(value);
  return compact || '-';
}

function inferStatus(nextDate: string | null): { status: string; tone: WelfareTone } {
  const days = daysUntil(nextDate);
  if (days === null) return { status: '수시', tone: 'muted' };
  if (days < 0) return { status: '지연', tone: 'danger' };
  if (days <= 30) return { status: '예정', tone: 'warn' };
  return { status: '수시', tone: 'muted' };
}

export default function WelfareDeviceSummary() {
  const [rows, setRows] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      setErrMsg(null);
      try {
        const { data, error } = await db
          .from('medical_devices')
          .select('id, name, location, last_inspection_date, next_inspection_date, manager_name')
          .order('next_inspection_date', { ascending: true, nullsFirst: false })
          .limit(6);
        if (cancelled) return;
        if (error) throw error;
        const list = (data as Array<Record<string, unknown>> | null) ?? [];
        setRows(
          list.map((r) => {
            const nextRaw = r.next_inspection_date ? String(r.next_inspection_date) : null;
            const { status, tone } = inferStatus(nextRaw);
            return {
              id: String(r.id ?? ''),
              name: String(r.name ?? '장비'),
              location: String(r.location ?? '-'),
              last: formatDate(r.last_inspection_date),
              next: formatDate(r.next_inspection_date),
              who: String(r.manager_name ?? '내부 관리'),
              status,
              tone,
            };
          }),
        );
      } catch (error) {
        if (cancelled) return;
        console.error('[WelfareDeviceSummary] fetch failed', error);
        setErrMsg('의료기기 점검 일정을 불러오지 못했습니다.');
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
    <WelfareSummaryShell
      titleId="welfare-device-summary-title"
      title="의료기기 점검 일정 (다음 6건)"
      loading={loading}
      error={errMsg}
      empty={!hasRows}
      emptyText="등록된 장비가 없습니다."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[11px] font-bold text-[var(--toss-gray-4)]">
              <th scope="col" className="py-1.5 pr-2">
                장비
              </th>
              <th scope="col" className="py-1.5 pr-2">
                설치 위치
              </th>
              <th scope="col" className="py-1.5 pr-2 tnum">
                마지막 점검
              </th>
              <th scope="col" className="py-1.5 pr-2 tnum">
                다음 점검
              </th>
              <th scope="col" className="py-1.5 pr-2">
                담당
              </th>
              <th scope="col" className="py-1.5">
                상태
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--border-subtle,var(--border))] last:border-b-0"
              >
                <td className="py-1.5 pr-2 font-bold text-[var(--foreground)]">{row.name}</td>
                <td className="py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.location}</td>
                <td className="tnum py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.last}</td>
                <td className="tnum py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.next}</td>
                <td className="py-1.5 pr-2 text-[var(--toss-gray-4)]">{row.who}</td>
                <td className="py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${WELFARE_TONE_CLS[row.tone]}`}>
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WelfareSummaryShell>
  );
}
