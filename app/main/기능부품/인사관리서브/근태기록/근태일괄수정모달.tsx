'use client';

/**
 * 근태일괄수정모달.tsx
 *
 * 인사관리 > 근태기록 > 상태 일괄 수정 모달.
 * 직원을 먼저 다중 선택한 뒤 "일괄 수정" 버튼이 활성화되어 적용되는 흐름.
 *
 * 제약
 * - JM: 단일 책임(일괄수정 UI), ~400줄 이내
 * - JM2: 직원 목록 정렬·필터는 useMemo로 캐싱
 * - JM3: 적용 단계에서 try/catch로 직원별 실패 격리, 부분 성공 시 실패한 직원 안내
 * - JM4: any 금지, 외부 입력 타입은 명시
 * - JM6: 체크박스는 label과 연결, 키보드 접근 가능
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import SmartDatePicker from '../../공통/SmartDatePicker';
import {
  getAttendanceStatusMeta,
  isProblemAttendanceStatus,
  isWeekendDate,
  resolveAttendanceStatusWithLeave,
  resolveLeaveStatusForDate,
} from './근태유틸';

type StaffLite = {
  id: string;
  name: string;
  position: string;
  department: string;
  company: string;
};

export type BulkEditStaff = StaffLite;

type BulkRangeType = 'day' | 'week' | 'month' | 'custom';

type BulkStatus =
  | 'present'
  | 'absent'
  | 'half_leave'
  | 'annual_leave'
  | 'sick_leave'
  | 'holiday';

const RANGE_OPTIONS: Array<{ id: BulkRangeType; label: string }> = [
  { id: 'day', label: '하루 단위' },
  { id: 'week', label: '주 단위 (7일)' },
  { id: 'month', label: '월 단위' },
  { id: 'custom', label: '직접 선택' },
];

const STATUS_OPTIONS: Array<{ value: BulkStatus; label: string }> = [
  { value: 'present', label: '🟢 정상 출근' },
  { value: 'absent', label: '🔴 결근' },
  { value: 'half_leave', label: '🔵 반차' },
  { value: 'annual_leave', label: '🟣 연차' },
  { value: 'sick_leave', label: '🩺 병가' },
  { value: 'holiday', label: '⚪ 휴일' },
];

const STATUS_LABEL_MAP: Record<BulkStatus, string> = {
  present: '정상',
  absent: '결근',
  half_leave: '반차',
  annual_leave: '연차',
  sick_leave: '병가',
  holiday: '휴일',
};

type BulkEditAttendanceRow = {
  staff_id: string;
  work_date: string;
  status?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
};

type BulkEditLeaveRow = {
  staff_id: string;
  start_date: string;
  end_date: string;
  leave_type: string;
  status: string;
};

export type AttendanceBulkEditModalProps = {
  open: boolean;
  onClose: () => void;
  /** 선택 회사 등으로 1차 필터링된 직원 목록 */
  staffs: StaffLite[];
  /** 적용 직후 호출되는 갱신 콜백 (성공 또는 부분 성공 시) */
  onApplied?: () => void;
  /** 모달 오픈 시 미리 체크해 둘 직원 id (선택사항) */
  initialSelectedIds?: string[];
  /** 달력에서 선택한 날짜 — 모달 기준일 및 문제 직원 판별 기준일 */
  initialDate?: string;
  /** 기준월 근태 기록 — 기준일의 직원별 상태 판별용 */
  attendances?: BulkEditAttendanceRow[];
  /** 승인된 휴가 — 기준일의 연차/반차/병가 판별용 */
  approvedLeaves?: BulkEditLeaveRow[];
};

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function computeDateRange(rangeType: BulkRangeType, startDate: string, endDate: string): { start: string; end: string } {
  if (rangeType === 'week') {
    const d = new Date(startDate);
    d.setDate(d.getDate() + 6);
    return { start: startDate, end: toIsoDate(d) };
  }
  if (rangeType === 'month') {
    const [y, m] = startDate.split('-').map(Number);
    const monthLast = new Date(y, m, 0).getDate();
    return {
      start: `${y}-${String(m).padStart(2, '0')}-01`,
      end: `${y}-${String(m).padStart(2, '0')}-${String(monthLast).padStart(2, '0')}`,
    };
  }
  if (rangeType === 'custom') {
    return {
      start: startDate <= endDate ? startDate : endDate,
      end: startDate <= endDate ? endDate : startDate,
    };
  }
  return { start: startDate, end: startDate };
}

function enumerateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  const endD = new Date(end);
  while (cur <= endD) {
    dates.push(toIsoDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export default function AttendanceBulkEditModal({
  open,
  onClose,
  staffs,
  onApplied,
  initialSelectedIds,
  initialDate,
  attendances = [],
  approvedLeaves = [],
}: AttendanceBulkEditModalProps) {
  const [rangeType, setRangeType] = useState<BulkRangeType>('day');
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [startDate, setStartDate] = useState(initialDate || today);
  const [endDate, setEndDate] = useState(initialDate || today);
  const [status, setStatus] = useState<BulkStatus>('absent');
  const [saving, setSaving] = useState(false);
  const [keyword, setKeyword] = useState('');
  // 기본 ON: 정상 출퇴근이 아닌(결근·지각·조퇴·기록없음) 직원만 노출
  const [problemOnly, setProblemOnly] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelectedIds ?? []),
  );

  // 달력에서 다른 날짜를 고른 뒤 다시 열면 기준일을 그 날짜로 맞춘다.
  useEffect(() => {
    if (open && initialDate) {
      setStartDate(initialDate);
      setEndDate(initialDate);
    }
  }, [open, initialDate]);

  const nameCollator = useMemo(
    () => new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' }),
    [],
  );

  // 부서 → 직급 → 이름 순 정렬 (JM2: useMemo 캐싱)
  const sortedStaffs = useMemo(() => {
    const next = [...staffs];
    next.sort((a, b) => {
      let cmp = nameCollator.compare(a.department || '', b.department || '');
      if (cmp !== 0) return cmp;
      cmp = nameCollator.compare(a.position || '', b.position || '');
      if (cmp !== 0) return cmp;
      return nameCollator.compare(a.name || '', b.name || '');
    });
    return next;
  }, [staffs, nameCollator]);

  // 기준일(startDate)의 직원별 근태 상태 — 문제 직원 필터 및 배지 표시용
  const staffStatusForDate = useMemo(() => {
    const map = new Map<string, string>();
    const weekend = isWeekendDate(startDate);
    for (const s of staffs) {
      const att = attendances.find(
        (a) => a.staff_id === s.id && String(a.work_date).slice(0, 10) === startDate,
      );
      const leaveStatus = resolveLeaveStatusForDate(s.id, startDate, approvedLeaves);
      map.set(s.id, resolveAttendanceStatusWithLeave(att, leaveStatus, weekend));
    }
    return map;
  }, [staffs, attendances, approvedLeaves, startDate]);

  const visibleStaffs = useMemo(() => {
    let list = sortedStaffs;
    if (problemOnly) {
      list = list.filter((s) => isProblemAttendanceStatus(staffStatusForDate.get(s.id)));
    }
    const k = keyword.trim().toLowerCase();
    if (k) {
      list = list.filter(
        (s) =>
          (s.name || '').toLowerCase().includes(k) ||
          (s.department || '').toLowerCase().includes(k) ||
          (s.position || '').toLowerCase().includes(k) ||
          (s.company || '').toLowerCase().includes(k),
      );
    }
    return list;
  }, [sortedStaffs, keyword, problemOnly, staffStatusForDate]);

  const allVisibleChecked =
    visibleStaffs.length > 0 && visibleStaffs.every((s) => selectedIds.has(s.id));
  const someVisibleChecked =
    !allVisibleChecked && visibleStaffs.some((s) => selectedIds.has(s.id));

  const toggleOne = (id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (allVisibleChecked) {
        visibleStaffs.forEach((s) => next.delete(s.id));
      } else {
        visibleStaffs.forEach((s) => next.add(s.id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const selectedCount = selectedIds.size;
  const canApply = !saving && selectedCount > 0;

  const handleApply = async () => {
    if (selectedCount === 0) {
      toast('적용할 직원을 먼저 선택하세요.', 'warning');
      return;
    }
    if (status === 'present') {
      // present는 출퇴근 시간 포함, 진행 가능
    }
    // 지각/조퇴는 select 옵션에 없지만 만일을 대비
    const blocked: string[] = ['late', 'early_leave'];
    if (blocked.includes(status)) {
      toast('지각/조퇴는 실제 출퇴근 기록 또는 개별 정정으로만 처리해주세요.', 'warning');
      return;
    }

    const { start, end } = computeDateRange(rangeType, startDate, endDate);
    const dates = enumerateDates(start, end);
    if (dates.length === 0) {
      toast('적용할 날짜 범위가 없습니다.', 'warning');
      return;
    }

    const targetIds = Array.from(selectedIds);
    const isPresent = status === 'present';

    setSaving(true);
    let successCount = 0;
    const failedStaffIds: string[] = [];

    try {
      // 직원 단위로 트랜잭션을 묶어 실패 격리 (JM3)
      for (const staffId of targetIds) {
        const rows = dates.map((work_date) => ({
          staff_id: staffId,
          work_date,
          status,
          ...(isPresent
            ? {
                check_in_time: `${work_date}T09:00:00+09:00`,
                check_out_time: `${work_date}T18:00:00+09:00`,
              }
            : {}),
        }));
        try {
          for (const row of rows) {
            const { error } = await supabase
              .from('attendances')
              .upsert(row, { onConflict: 'staff_id,work_date' });
            if (error) throw error;
          }
          successCount += rows.length;
        } catch (innerErr) {
          console.error('[bulk-edit] staff failed', staffId, innerErr);
          failedStaffIds.push(staffId);
        }
      }

      const statusLabel = STATUS_LABEL_MAP[status];
      if (failedStaffIds.length === 0) {
        toast(
          `적용 완료: ${dates.length}일 × ${targetIds.length}명 = ${successCount}건을 "${statusLabel}"으로 수정했습니다.`,
          'success',
        );
        onApplied?.();
        onClose();
      } else if (successCount > 0) {
        const failedNames = failedStaffIds
          .map((id) => staffs.find((s) => s.id === id)?.name || id)
          .join(', ');
        toast(
          `부분 적용: ${successCount}건 성공, 실패 ${failedStaffIds.length}명 (${failedNames})`,
          'warning',
        );
        onApplied?.();
      } else {
        toast('일괄 수정에 모두 실패했습니다. 잠시 후 다시 시도해주세요.', 'error');
      }
    } catch (e) {
      console.error('[bulk-edit] unexpected', e);
      toast('일괄 수정 중 오류가 발생했습니다.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="출퇴근 상태 일괄 수정"
    >
      <div className="bg-[var(--card)] dark:bg-zinc-900 border border-[var(--border)] dark:border-zinc-800 rounded-2xl shadow-sm max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center px-5 py-4 border-b border-[var(--border-subtle)] dark:border-zinc-800">
          <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
            <span className="text-xl">⚡</span> 상태 일괄 수정
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] dark:hover:text-zinc-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 py-4 space-y-5 overflow-y-auto custom-scrollbar">
          {/* 1단계: 직원 선택 */}
          <section aria-labelledby="bulk-staff-heading" className="space-y-2">
            <div className="flex items-center justify-between">
              <p
                id="bulk-staff-heading"
                className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase flex items-center gap-1.5"
              >
                <span className="text-sm">👥</span> 적용 직원 선택
                <span className="ml-1 text-blue-600 dark:text-blue-400">
                  {selectedCount}명 선택됨
                </span>
              </p>
              {selectedCount > 0 && (
                <button
                  type="button"
                  onClick={clearSelection}
                  className="text-[10px] font-bold text-[var(--toss-gray-4)] hover:text-blue-600 dark:hover:text-blue-400"
                >
                  선택 초기화
                </button>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none rounded-xl border border-[var(--border)] dark:border-zinc-700 bg-[var(--tab-bg)]/40 dark:bg-zinc-800/20 px-3 py-2">
              <input
                type="checkbox"
                checked={problemOnly}
                onChange={(e) => setProblemOnly(e.target.checked)}
                className="w-4 h-4 accent-blue-600"
              />
              <span className="text-[11px] font-bold text-foreground">
                {startDate} 기준 · 정상 출퇴근이 아닌 직원만 보기
              </span>
            </label>

            <input
              type="search"
              placeholder="이름·부서·직급·회사로 검색"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              aria-label="직원 검색"
              className="w-full bg-[var(--tab-bg)] dark:bg-zinc-800/50 border border-[var(--border)] dark:border-zinc-700 rounded-xl px-4 py-2.5 text-sm font-medium text-foreground outline-none focus:ring-2 focus:ring-blue-500"
            />

            <div className="border border-[var(--border)] dark:border-zinc-800 rounded-xl bg-[var(--tab-bg)]/40 dark:bg-zinc-800/20 max-h-56 overflow-y-auto custom-scrollbar">
              <label className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border-subtle)] dark:border-zinc-800 sticky top-0 bg-[var(--tab-bg)] dark:bg-zinc-900/80 z-10 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleChecked;
                  }}
                  onChange={toggleAllVisible}
                  aria-label="현재 보이는 직원 전체 선택"
                  className="w-4 h-4 accent-blue-600"
                />
                <span className="text-[11px] font-bold text-foreground">
                  전체 선택 ({visibleStaffs.length}명)
                </span>
              </label>
              {visibleStaffs.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-[var(--toss-gray-4)]">
                  {problemOnly
                    ? `${startDate}에 정상 출퇴근이 아닌 직원이 없습니다.`
                    : '표시할 직원이 없습니다.'}
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border-subtle)] dark:divide-zinc-800">
                  {visibleStaffs.map((s) => {
                    const checked = selectedIds.has(s.id);
                    const inputId = `bulk-staff-${s.id}`;
                    const dayStatusMeta = getAttendanceStatusMeta(
                      staffStatusForDate.get(s.id) ?? '',
                    );
                    return (
                      <li key={s.id}>
                        <label
                          htmlFor={inputId}
                          className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--card)]/60 dark:hover:bg-zinc-800/40 transition-colors ${
                            checked ? 'bg-blue-500/5 dark:bg-blue-900/10' : ''
                          }`}
                        >
                          <input
                            id={inputId}
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleOne(s.id)}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-foreground">{s.name}</span>
                            <span className="text-[10px] font-medium text-[var(--toss-gray-4)]">
                              {s.department || '-'} · {s.position || '-'} · {s.company || '-'}
                            </span>
                          </div>
                          <span
                            className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${dayStatusMeta.bg} ${dayStatusMeta.color}`}
                          >
                            {dayStatusMeta.label}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>

          {/* 2단계: 적용 기간 */}
          <section className="space-y-2">
            <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase flex items-center gap-1.5">
              <span className="text-sm">🗓️</span> 적용 기간
            </p>
            <div className="grid grid-cols-2 gap-2">
              {RANGE_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setRangeType(o.id)}
                  aria-pressed={rangeType === o.id}
                  className={`px-3 py-2.5 rounded-xl text-xs font-bold transition-all border ${
                    rangeType === o.id
                      ? 'bg-blue-500/10 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-500/20 dark:border-blue-800 ring-1 ring-blue-500'
                      : 'bg-transparent text-[var(--toss-gray-4)] dark:text-[var(--toss-gray-3)] border-[var(--border)] dark:border-zinc-700 hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-1">
              <div className="flex-1">
                <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase mb-1.5 ml-1">
                  시작일
                </p>
                <SmartDatePicker
                  value={startDate}
                  onChange={(val: string) => {
                    setStartDate(val);
                    if (rangeType === 'week') {
                      const d = new Date(val);
                      d.setDate(d.getDate() + 6);
                      setEndDate(toIsoDate(d));
                    }
                  }}
                  className="w-full bg-[var(--tab-bg)] dark:bg-zinc-800/50 border border-[var(--border)] dark:border-zinc-700 px-4 py-3 rounded-xl text-sm font-bold text-foreground outline-none transition-shadow"
                />
              </div>
              {(rangeType === 'custom' || rangeType === 'week') && (
                <div className="flex-1">
                  <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase mb-1.5 ml-1">
                    종료일
                  </p>
                  <SmartDatePicker
                    value={endDate}
                    onChange={(val: string) => setEndDate(val)}
                    className="w-full bg-[var(--tab-bg)] dark:bg-zinc-800/50 border border-[var(--border)] dark:border-zinc-700 px-4 py-3 rounded-xl text-sm font-bold text-foreground outline-none transition-shadow"
                  />
                </div>
              )}
            </div>
          </section>

          {/* 3단계: 변경할 상태 */}
          <section className="space-y-2">
            <p className="text-[11px] font-bold text-[var(--toss-gray-4)] uppercase flex items-center gap-1.5">
              <span className="text-sm">📌</span> 변경할 상태
            </p>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as BulkStatus)}
              aria-label="변경할 근태 상태"
              className="w-full bg-[var(--tab-bg)] dark:bg-zinc-800/50 border border-[var(--border)] dark:border-zinc-700 rounded-xl px-4 py-3 text-sm font-bold text-foreground outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none cursor-pointer transition-shadow"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </section>
        </div>

        <div className="flex gap-3 justify-end px-5 py-4 border-t border-[var(--border-subtle)] dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-3 rounded-xl text-sm font-bold border border-[var(--border)] dark:border-zinc-700 text-[var(--toss-gray-4)] hover:bg-[var(--tab-bg)] dark:hover:bg-zinc-800 focus:outline-none transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            aria-disabled={!canApply}
            className="px-4 py-3 rounded-xl text-sm font-bold bg-blue-600 text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center min-w-[140px]"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                처리 중...
              </span>
            ) : selectedCount === 0 ? (
              '직원을 선택하세요'
            ) : (
              `일괄 수정 (${selectedCount}명)`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
