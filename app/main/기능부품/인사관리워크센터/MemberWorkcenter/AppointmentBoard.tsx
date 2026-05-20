'use client';

/**
 * MemberWorkcenter — 인사발령 탭 (새 디자인)
 *
 * - 새 디자인: 카드형 발령 리스트 (유형 chip + 본문 + 효력일)
 * - 데이터 소스: supabase `personnel_appointments` (회사 필터)
 * - 무거운 폼(발령 등록·관보 생성)은 기존 `인사발령관리.tsx`로 위임 (모달 진입점)
 *
 * JM3: fetch 에러는 inline 메시지로 표시 + 콘솔 로그 분리
 * JM4: AppointmentRecord 타입 명시
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import { appointmentTone, type AppointmentRecord } from './data';

const PersonnelAppointment = dynamic(() => import('../../인사관리서브/인사발령관리'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
    </div>
  ),
});

const TONE_BG: Record<string, string> = {
  success: 'bg-emerald-500/15 text-emerald-700',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
  warn: 'bg-amber-500/15 text-amber-700',
  muted: 'bg-[var(--muted)] text-[var(--toss-gray-4)]',
};

interface AppointmentBoardProps {
  staffs: StaffMember[];
  selectedCo?: string;
  user?: Record<string, unknown> | null;
}

export default function AppointmentBoard({ staffs, selectedCo, user }: AppointmentBoardProps) {
  const [records, setRecords] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchRecords = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setErrorMsg(null);
    try {
      let query = supabase
        .from('personnel_appointments')
        .select('id, staff_id, staff_name, company, order_type, effective_date, before_dept, after_dept, before_position, after_position, before_role, after_role, reason, status')
        .order('effective_date', { ascending: false });

      if (selectedCo && selectedCo !== '전체') {
        query = query.eq('company', selectedCo);
      }

      const { data, error } = await query;
      if (controller.signal.aborted) return;
      if (error) throw error;
      setRecords((data ?? []) as AppointmentRecord[]);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('[MemberWorkcenter] 인사발령 조회 실패', error);
      setErrorMsg('인사발령 이력을 불러오지 못했습니다.');
      setRecords([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [selectedCo]);

  useEffect(() => {
    void fetchRecords();
    return () => abortRef.current?.abort();
  }, [fetchRecords]);

  const visible = useMemo(() => records.slice(0, 20), [records]);

  if (showLegacy) {
    return (
      <section className="app-card flex min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 md:px-4 md:py-2.5">
          <h3 className="text-[13px] font-bold text-[var(--foreground)]">인사발령 관리 (상세)</h3>
          <button
            type="button"
            onClick={() => setShowLegacy(false)}
            className="rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-semibold text-[var(--accent)] hover:bg-[var(--muted)]"
          >
            ← 요약으로 돌아가기
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">
          <PersonnelAppointment staffs={staffs} selectedCo={selectedCo || '전체'} user={user as StaffMember | Record<string, unknown> | null | undefined} />
        </div>
      </section>
    );
  }

  return (
    <section className="app-card flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5 md:px-4 md:py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-bold text-[var(--foreground)]">최근 인사발령</h3>
          <span className="rounded-full bg-[var(--tab-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--toss-gray-4)]">
            {records.length}건
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowLegacy(true)}
          className="inline-flex items-center gap-1 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-1.5 text-[12px] font-bold text-white transition-colors hover:bg-[var(--accent-hover)]"
          aria-label="발령 등록 및 상세 관리 열기"
        >
          <span aria-hidden="true">＋</span>
          <span>새 발령 · 상세 관리</span>
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-3 py-3 md:px-4 md:py-3">
        {errorMsg && (
          <div role="alert" className="mb-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            {errorMsg}{' '}
            <button
              type="button"
              onClick={() => void fetchRecords()}
              className="ml-1 font-bold underline"
            >
              다시 시도
            </button>
          </div>
        )}

        {loading && records.length === 0 ? (
          <div className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
            발령 이력을 불러오는 중…
          </div>
        ) : visible.length === 0 ? (
          <div className="px-4 py-12 text-center text-[12px] text-[var(--toss-gray-4)]">
            표시할 인사발령 이력이 없습니다.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((record) => {
              const tone = appointmentTone(record.order_type);
              const fromDept = record.before_dept || record.before_position || record.before_role || '-';
              const toDept = record.after_dept || record.after_position || record.after_role || '-';
              return (
                <li
                  key={String(record.id ?? `${record.staff_id}-${record.effective_date}`)}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] px-3 py-2.5"
                >
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE_BG[tone]}`}>
                    {record.order_type}
                  </span>
                  <div className="min-w-0 flex-1 text-[12px]">
                    <span className="font-bold text-[var(--foreground)]">{record.staff_name}</span>
                    <span className="ml-1 text-[var(--toss-gray-4)]">·</span>
                    <span className="ml-1 text-[var(--toss-gray-4)]">{fromDept}</span>
                    <span className="mx-1 text-[var(--toss-gray-4)]">→</span>
                    <span className="font-bold text-[var(--foreground)]">{toDept}</span>
                  </div>
                  <span className="tnum shrink-0 text-[11px] font-semibold text-[var(--toss-gray-4)]">
                    {record.effective_date}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
