'use client';

/**
 * 근무유형 다중 선택 섹션
 * - 선택사업체 기반 work_shifts 필터링
 * - 체크박스 그룹 + 주근무유형 라디오 + priority 입력
 * - JM6: fieldset+legend, label 연결
 * - JM2: companyName 변경 시에만 재조회
 */

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { SelectedShiftAssignment } from './staff-registration-types';

type WorkShiftOption = {
  id: string;
  name: string;
  start_time: string | null;
  end_time: string | null;
  shift_type: string | null;
  company_name: string | null;
};

interface ShiftAssignmentSectionProps {
  companyName: string;
  selected: SelectedShiftAssignment[];
  onChange: (selected: SelectedShiftAssignment[]) => void;
  error?: string;
}

export default function ShiftAssignmentSection({
  companyName,
  selected,
  onChange,
  error,
}: ShiftAssignmentSectionProps) {
  const [shifts, setShifts] = useState<WorkShiftOption[]>([]);
  const [loading, setLoading] = useState(false);
  const prevCompanyRef = useRef<string>('');

  useEffect(() => {
    if (prevCompanyRef.current === companyName) return;
    prevCompanyRef.current = companyName;

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      let query = supabase
        .from('work_shifts')
        .select('id, name, start_time, end_time, shift_type, company_name')
        .eq('is_active', true)
        .order('name');
      if (companyName) {
        query = query.eq('company_name', companyName);
      }
      const { data } = await query;
      if (!cancelled) {
        setShifts((data as WorkShiftOption[]) ?? []);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [companyName]);

  const isChecked = (id: string) => selected.some((s) => s.shift_id === id);
  const isPrimary = (id: string) => selected.some((s) => s.shift_id === id && s.is_primary);
  const getPriority = (id: string) =>
    selected.find((s) => s.shift_id === id)?.priority ?? 0;

  const toggle = (id: string) => {
    if (isChecked(id)) {
      const next = selected.filter((s) => s.shift_id !== id);
      if (isPrimary(id) && next.length > 0) {
        next[0] = { ...next[0], is_primary: true };
      }
      onChange(next);
    } else {
      const hasPrimary = selected.some((s) => s.is_primary);
      onChange([
        ...selected,
        { shift_id: id, is_primary: !hasPrimary, priority: 0 },
      ]);
    }
  };

  const setPrimary = (id: string) => {
    onChange(selected.map((s) => ({ ...s, is_primary: s.shift_id === id })));
  };

  const setPriority = (id: string, value: number) => {
    onChange(
      selected.map((s) =>
        s.shift_id === id ? { ...s, priority: Math.max(0, Number.isFinite(value) ? value : 0) } : s,
      ),
    );
  };

  const formatTime = (t: string | null) =>
    t ? String(t).slice(0, 5) : '--:--';

  return (
    <fieldset className="p-4 bg-blue-50 rounded-[var(--radius-xl)] border border-blue-100 space-y-3">
      <legend className="text-[11px] font-extrabold text-blue-800 px-1 flex items-center gap-1.5">
        근무유형 배정
        <span className="text-[10px] font-medium text-blue-600">
          (사업체 선택 후 표시 · 주근무유형 1개 지정)
        </span>
      </legend>

      {!companyName && (
        <p className="text-[11px] text-blue-600 font-medium py-1">
          소속 사업체를 먼저 선택하면 해당 회사의 근무유형이 표시됩니다.
        </p>
      )}

      {companyName && loading && (
        <p className="text-[11px] text-blue-600 font-medium py-1">
          근무유형 목록 로딩 중...
        </p>
      )}

      {companyName && !loading && shifts.length === 0 && (
        <p className="text-[11px] text-blue-600 font-medium py-1">
          선택한 사업체에 등록된 근무유형이 없습니다.
        </p>
      )}

      {companyName && !loading && shifts.length > 0 && (
        <div className="space-y-2">
          {shifts.map((shift) => {
            const checked = isChecked(shift.id);
            const primary = isPrimary(shift.id);
            const priority = getPriority(shift.id);

            return (
              <div
                key={shift.id}
                className={`rounded-[var(--radius-md)] border p-2.5 transition-all ${
                  checked
                    ? 'border-blue-400 bg-blue-100/60'
                    : 'border-[var(--border)] bg-[var(--card)]'
                }`}
              >
                <div className="flex items-start gap-2">
                  {/* 체크박스 */}
                  <label
                    htmlFor={`shift-check-${shift.id}`}
                    className="flex items-center gap-2 flex-1 cursor-pointer min-w-0"
                  >
                    <input
                      id={`shift-check-${shift.id}`}
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(shift.id)}
                      className="w-3.5 h-3.5 accent-blue-600 shrink-0 mt-0.5"
                    />
                    <div className="min-w-0">
                      <span
                        className={`text-[11px] font-bold block truncate ${
                          checked ? 'text-blue-800' : 'text-[var(--foreground)]'
                        }`}
                      >
                        {shift.name}
                      </span>
                      <span className="text-[10px] font-medium text-[var(--toss-gray-3)]">
                        {formatTime(shift.start_time)}~{formatTime(shift.end_time)}
                        {shift.shift_type ? ` · ${shift.shift_type}` : ''}
                      </span>
                    </div>
                  </label>

                  {/* 주근무유형 + priority (체크된 항목만) */}
                  {checked && (
                    <div className="flex items-center gap-2 shrink-0">
                      <label
                        htmlFor={`shift-primary-${shift.id}`}
                        className="flex items-center gap-1 cursor-pointer"
                      >
                        <input
                          id={`shift-primary-${shift.id}`}
                          type="radio"
                          name="shift-primary"
                          checked={primary}
                          onChange={() => setPrimary(shift.id)}
                          className="w-3 h-3 accent-blue-600"
                        />
                        <span className="text-[10px] font-bold text-blue-700">주</span>
                      </label>

                      <div className="flex items-center gap-1">
                        <label
                          htmlFor={`shift-priority-${shift.id}`}
                          className="text-[9px] font-bold text-[var(--toss-gray-3)] sr-only"
                        >
                          우선순위
                        </label>
                        <input
                          id={`shift-priority-${shift.id}`}
                          type="number"
                          min={0}
                          step={1}
                          value={priority}
                          onChange={(e) =>
                            setPriority(shift.id, parseInt(e.target.value, 10) || 0)
                          }
                          title="우선순위 (낮을수록 먼저)"
                          className="w-12 p-1 text-[10px] font-bold bg-[var(--card)] border border-blue-200 rounded-[var(--radius-md)] outline-none text-center focus:ring-2 focus:ring-blue-300"
                        />
                        <span className="text-[9px] text-[var(--toss-gray-3)] font-medium">순위</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected.length > 0 && (
        <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
          선택:{' '}
          {selected
            .map((s) => {
              const sh = shifts.find((w) => w.id === s.shift_id);
              const name = sh ? sh.name : s.shift_id;
              return s.is_primary ? `${name}(주)` : name;
            })
            .join(', ')}
        </p>
      )}

      {error && (
        <p role="alert" className="text-[11px] font-bold text-red-500">
          {error}
        </p>
      )}
    </fieldset>
  );
}
