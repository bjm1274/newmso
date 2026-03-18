'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type Shift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  description?: string;
  company_name?: string;
  break_start_time?: string | null;
  break_end_time?: string | null;
  shift_type?: string | null;
  weekly_work_days?: number | null;
  is_weekend_work?: boolean | null;
  is_shift?: boolean | null;
  monthly_night_days?: number | null;
  additional_work_hours?: number | null;
  extra_contract_allowance?: number | null;
  work_day_mode?: WorkDayMode;
};

type WorkDayMode = 'weekdays' | 'all_days';
type ShiftFormState = {
  name: string;
  start_time: string;
  end_time: string;
  description: string;
  company_name: string;
  selectedCompanies: string[];
  break_start_time: string;
  break_end_time: string;
  shift_type: string;
  weekly_work_days: number;
  is_weekend_work: boolean;
  is_shift: boolean;
  monthly_night_days: number;
  additional_work_hours: number;
  extra_contract_allowance: number;
  work_day_mode: WorkDayMode;
};

const DEFAULT_COMPANY_OPTIONS = ['박철홍정형외과', '수연의원', 'SY INC.'];
const SHIFT_META_MARKER = '[SHIFT_META]';

type ShiftContractMeta = {
  monthly_night_days: number;
  additional_work_hours: number;
  extra_contract_allowance: number;
  work_day_mode: WorkDayMode;
};

type ShiftContractMetaInput = {
  monthly_night_days?: number | null;
  additional_work_hours?: number | null;
  extra_contract_allowance?: number | null;
  work_day_mode?: WorkDayMode | null;
};

function normalizeShiftContractMeta(meta?: ShiftContractMetaInput | null): ShiftContractMeta {
  return {
    monthly_night_days: Math.max(0, Math.floor(Number(meta?.monthly_night_days) || 0)),
    additional_work_hours: Math.max(0, Math.round((Number(meta?.additional_work_hours) || 0) * 10) / 10),
    extra_contract_allowance: Math.max(0, Math.floor(Number(meta?.extra_contract_allowance) || 0)),
    work_day_mode: meta?.work_day_mode === 'all_days' ? 'all_days' : 'weekdays',
  };
}

function hasShiftContractMeta(meta?: ShiftContractMetaInput | null) {
  const normalized = normalizeShiftContractMeta(meta);
  return (
    normalized.monthly_night_days > 0 ||
    normalized.additional_work_hours > 0 ||
    normalized.extra_contract_allowance > 0 ||
    normalized.work_day_mode === 'all_days'
  );
}

function parseShiftDescription(rawDescription?: string | null, fallbackWorkDayMode: WorkDayMode = 'weekdays') {
  const description = String(rawDescription || '');
  const markerIndex = description.lastIndexOf(SHIFT_META_MARKER);
  if (markerIndex === -1) {
    return {
      description: description.trim(),
      meta: normalizeShiftContractMeta({ work_day_mode: fallbackWorkDayMode }),
    };
  }

  const baseDescription = description.slice(0, markerIndex).trimEnd();
  const metaText = description.slice(markerIndex + SHIFT_META_MARKER.length).trim();

  try {
    const parsedMeta = JSON.parse(metaText);
    return {
      description: baseDescription,
      meta: normalizeShiftContractMeta({
        ...parsedMeta,
        work_day_mode: parsedMeta?.work_day_mode ?? fallbackWorkDayMode,
      }),
    };
  } catch {
    return {
      description: description.trim(),
      meta: normalizeShiftContractMeta({ work_day_mode: fallbackWorkDayMode }),
    };
  }
}

function buildShiftDescription(description: string, meta?: ShiftContractMetaInput | null) {
  const cleanDescription = description.trim();
  const normalized = normalizeShiftContractMeta(meta);

  if (!hasShiftContractMeta(normalized)) {
    return cleanDescription;
  }

  const serializedMeta = `${SHIFT_META_MARKER}${JSON.stringify(normalized)}`;
  return cleanDescription ? `${cleanDescription}\n${serializedMeta}` : serializedMeta;
}

function timeToMinutes(value?: string | null) {
  if (!value) return 0;
  const [hours, minutes] = value.split(':').map(Number);
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function calculateWorkMinutes({
  start_time,
  end_time,
  break_start_time,
  break_end_time,
}: {
  start_time?: string | null;
  end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
}) {
  const start = timeToMinutes(start_time);
  let end = timeToMinutes(end_time);
  if (end <= start) end += 24 * 60;

  let workMinutes = Math.max(0, end - start);

  if (break_start_time && break_end_time) {
    let breakStart = timeToMinutes(break_start_time);
    let breakEnd = timeToMinutes(break_end_time);
    if (breakStart < start) breakStart += 24 * 60;
    if (breakEnd <= breakStart) breakEnd += 24 * 60;
    workMinutes = Math.max(0, workMinutes - Math.max(0, breakEnd - breakStart));
  }

  return workMinutes;
}

function calculateWeeklyWorkHours(shift: {
  start_time?: string | null;
  end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  weekly_work_days?: number | null;
}) {
  const weeklyDays = Math.max(0, Number(shift.weekly_work_days) || 0);
  const workMinutes = calculateWorkMinutes(shift);
  return Math.round(((workMinutes * weeklyDays) / 60) * 10) / 10;
}

function needsExtendedContractSettings(shift: {
  shift_type?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
  weekly_work_days?: number | null;
  monthly_night_days?: number | null;
  additional_work_hours?: number | null;
  extra_contract_allowance?: number | null;
}) {
  const pattern = String(shift.shift_type || '');
  return (
    pattern.includes('3교대') ||
    calculateWeeklyWorkHours(shift) > 40 ||
    hasShiftContractMeta(shift)
  );
}

function isThreeShiftPattern(shiftType?: string | null) {
  return String(shiftType || '').includes('3교대');
}

function resolveWorkDayMode(shift: {
  shift_type?: string | null;
  weekly_work_days?: number | null;
  is_weekend_work?: boolean | null;
}): WorkDayMode {
  if (isThreeShiftPattern(shift.shift_type)) {
    return 'all_days';
  }

  return shift.is_weekend_work || Number(shift.weekly_work_days) >= 7 ? 'all_days' : 'weekdays';
}

function getStoredWorkDayMode(shift: {
  shift_type?: string | null;
  weekly_work_days?: number | null;
  is_weekend_work?: boolean | null;
  description?: string | null;
}) {
  const columnMode = resolveWorkDayMode(shift);
  const parsedDescription = parseShiftDescription(shift.description, columnMode);
  const workDayMode = parsedDescription.meta.work_day_mode || columnMode;

  return {
    parsedDescription,
    workDayMode,
    weeklyWorkDays: shift.weekly_work_days ?? (workDayMode === 'all_days' ? 7 : 5),
    isWeekendWork: shift.is_weekend_work ?? (workDayMode === 'all_days'),
  };
}

function applyWorkDayMode<T extends {
  shift_type?: string | null;
  weekly_work_days?: number | null;
  is_weekend_work?: boolean | null;
  work_day_mode?: WorkDayMode;
}>(
  shift: T,
  requestedMode: WorkDayMode
): Omit<T, 'work_day_mode' | 'weekly_work_days' | 'is_weekend_work'> & {
  work_day_mode: WorkDayMode;
  weekly_work_days: number;
  is_weekend_work: boolean;
} {
  const nextMode = isThreeShiftPattern(shift.shift_type) ? 'all_days' : requestedMode;

  return {
    ...shift,
    work_day_mode: nextMode,
    weekly_work_days: nextMode === 'all_days' ? 7 : 5,
    is_weekend_work: nextMode === 'all_days',
  };
}

function formatWorkDayMode(mode: WorkDayMode) {
  return mode === 'all_days' ? '월~일' : '월~금';
}

function createEmptyShiftState(selectedCo?: string): ShiftFormState {
  const fixedCompany = selectedCo && selectedCo !== '전체' ? selectedCo : '';

  return applyWorkDayMode({
    name: '',
    start_time: '09:00',
    end_time: '18:00',
    description: '',
    company_name: fixedCompany,
    selectedCompanies: fixedCompany ? [fixedCompany] : ([] as string[]),
    break_start_time: '',
    break_end_time: '',
    shift_type: '',
    weekly_work_days: 5,
    is_weekend_work: false,
    is_shift: false,
    monthly_night_days: 0,
    additional_work_hours: 0,
    extra_contract_allowance: 0,
    work_day_mode: 'weekdays' as WorkDayMode,
  }, 'weekdays');
}

export default function ShiftManagement({ selectedCo }: any) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [companyOptions, setCompanyOptions] = useState<string[]>(DEFAULT_COMPANY_OPTIONS);
  const [newShift, setNewShift] = useState<ShiftFormState>(() => createEmptyShiftState(selectedCo));

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('work_shifts')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      let list = (data || []).map((s: any) => {
        const storedWorkDayMode = getStoredWorkDayMode({
          shift_type: s.shift_type,
          weekly_work_days: s.weekly_work_days,
          is_weekend_work: s.is_weekend_work,
          description: s.description,
        });
        return {
          id: s.id,
          name: s.name,
          start_time: s.start_time?.slice(0, 5) || '09:00',
          end_time: s.end_time?.slice(0, 5) || '18:00',
          description: storedWorkDayMode.parsedDescription.description,
          company_name: s.company_name,
          break_start_time: s.break_start_time?.slice(0, 5) || null,
          break_end_time: s.break_end_time?.slice(0, 5) || null,
          shift_type: s.shift_type || null,
          weekly_work_days: storedWorkDayMode.weeklyWorkDays,
          is_weekend_work: storedWorkDayMode.isWeekendWork,
          is_shift: s.is_shift ?? false,
          monthly_night_days: storedWorkDayMode.parsedDescription.meta.monthly_night_days,
          additional_work_hours: storedWorkDayMode.parsedDescription.meta.additional_work_hours,
          extra_contract_allowance: storedWorkDayMode.parsedDescription.meta.extra_contract_allowance,
          work_day_mode: storedWorkDayMode.workDayMode,
        };
      });
      if (selectedCo && selectedCo !== '전체') {
        list = list.filter((s: any) => s.company_name === selectedCo);
      }
      setShifts(list);
    } catch (err) {
      console.error('근무형태 조회 실패:', err);
      setShifts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, [selectedCo]);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('name')
          .eq('is_active', true)
          .order('name');

        if (error) throw error;
        const names = (data || [])
          .map((company: any) => company.name)
          .filter((name: string | undefined): name is string => Boolean(name));

        if (names.length > 0) {
          setCompanyOptions(names);
        }
      } catch (err) {
        console.error('회사 목록 조회 실패:', err);
      }
    };

    fetchCompanies();
  }, []);

  // 커스텀 근무 패턴 목록
  const [customPatterns, setCustomPatterns] = useState<string[]>([]);
  const [showPatternInput, setShowPatternInput] = useState(false);
  const [newPatternName, setNewPatternName] = useState('');
  const DEFAULT_PATTERNS = ['상근', '2교대', '3교대', '1일근무1일휴무', '야간전담'];
  const allPatterns = [...DEFAULT_PATTERNS, ...customPatterns].sort((a, b) => a.localeCompare(b, 'ko'));

  const addCustomPattern = () => {
    const name = newPatternName.trim();
    if (!name) return;
    if (allPatterns.includes(name)) return alert('이미 존재하는 패턴입니다.');
    setCustomPatterns([...customPatterns, name]);
    setNewShift((prev) => applyWorkDayMode({ ...prev, shift_type: name }, prev.work_day_mode || 'weekdays'));
    setNewPatternName('');
    setShowPatternInput(false);
  };

  const handleSaveShift = async () => {
    if (!newShift.name) return alert('근무 형태 명칭을 입력하세요.');

    const selectedCompanies = Array.from(
      new Set(newShift.selectedCompanies.map((company) => company.trim()).filter(Boolean))
    );
    const selectedCompanyName = newShift.company_name?.trim() || selectedCompanies[0] || '';

    if (editingShiftId && !selectedCompanyName) {
      return alert('적용 사업체를 선택하세요.');
    }

    if (!editingShiftId && selectedCompanies.length === 0) {
      return alert('적용 사업체를 하나 이상 선택하세요.');
    }

    const fullPayload: any = {
      name: newShift.name,
      start_time: newShift.start_time,
      end_time: newShift.end_time,
      description: buildShiftDescription(newShift.description || '', {
        monthly_night_days: newShift.monthly_night_days,
        additional_work_hours: newShift.additional_work_hours,
        extra_contract_allowance: newShift.extra_contract_allowance,
        work_day_mode: newShift.work_day_mode,
      }) || null,
      company_name: selectedCompanyName,
      break_start_time: newShift.break_start_time || null,
      break_end_time: newShift.break_end_time || null,
      shift_type: newShift.shift_type || null,
      weekly_work_days: newShift.weekly_work_days ?? null,
      is_weekend_work: newShift.is_weekend_work ?? null,
      is_shift: newShift.is_shift ?? false,
    };

    // 최소 필드 (DB에 확실히 존재하는 컬럼만)
    const minPayload: any = {
      name: newShift.name,
      start_time: newShift.start_time,
      end_time: newShift.end_time,
      description: buildShiftDescription(newShift.description || '', {
        monthly_night_days: newShift.monthly_night_days,
        additional_work_hours: newShift.additional_work_hours,
        extra_contract_allowance: newShift.extra_contract_allowance,
        work_day_mode: newShift.work_day_mode,
      }) || null,
      company_name: selectedCompanyName,
    };

    const tryUpsert = async (payload: any, label: string) => {
      if (editingShiftId) {
        const { error } = await supabase.from('work_shifts').update(payload).eq('id', editingShiftId);
        return { error, label };
      } else {
        const { error } = await supabase.from('work_shifts').insert([payload]);
        return { error, label };
      }
    };

    try {
      if (editingShiftId) {
        // 1차: 전체 필드
        let result = await tryUpsert(fullPayload, '전체');
        if (result.error) {
          console.warn(`[${result.label}] 실패:`, result.error.message, '→ 최소 필드로 재시도');
          // 2차: 최소 필드만
          result = await tryUpsert(minPayload, '최소');
          if (result.error) throw result.error;
        }
      } else {
        // 복수 사업장 등록
        const companiesToInsert = selectedCompanies;

        for (const co of companiesToInsert) {
          const currentFullPayload = { ...fullPayload, company_name: co };
          const currentMinPayload = { ...minPayload, company_name: co };

          let result = await tryUpsert(currentFullPayload, '전체');
          if (result.error) {
            result = await tryUpsert(currentMinPayload, '최소');
            if (result.error) throw result.error;
          }
        }
      }

      alert(editingShiftId ? '근무 형태가 수정되었습니다.' : '근무 형태가 등록되었습니다.');
      setShowAddModal(false);
      setEditingShiftId(null);
      setNewShift(createEmptyShiftState(selectedCo));
      fetchShifts();
    } catch (err: any) {
      console.error('근무형태 저장 최종 실패:', err);
      alert('저장에 실패했습니다.\n원인: ' + (err?.message || '알 수 없는 오류'));
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!confirm('이 근무 형태를 삭제하시겠습니까?')) return;
    try {
      // is_active 컬럼이 없을 수도 있으므로 fallback
      const { error } = await supabase.from('work_shifts').update({ is_active: false }).eq('id', id);
      if (error) {
        // is_active 컬럼 없으면 실제 삭제
        const retry = await supabase.from('work_shifts').delete().eq('id', id);
        if (retry.error) throw retry.error;
      }
      fetchShifts();
    } catch (err: any) {
      alert('삭제에 실패했습니다.\n원인: ' + (err?.message || ''));
    }
  };

  const estimatedWeeklyHours = calculateWeeklyWorkHours(newShift);
  const showContractSettings = needsExtendedContractSettings(newShift);

  return (
    <div className="p-5 space-y-5 animate-in fade-in duration-500" data-testid="shift-management">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)] tracking-tight">근무 형태 관리 <span className="text-sm text-[var(--accent)]">[{selectedCo}]</span></h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingShiftId(null);
            setNewShift(createEmptyShiftState(selectedCo));
            setShowAddModal(true);
          }}
          className="px-5 py-4 bg-[var(--accent)] text-white text-sm font-bold rounded-[var(--radius-lg)] shadow-sm hover:shadow-sm transform hover:scale-[1.02] transition-all flex items-center gap-2"
          data-testid="shift-create-button"
        >
          <span className="text-lg">＋</span> 신규 근무 형태 생성
        </button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3">
        {shifts.map((shift) => (
          <div key={shift.id} className="bg-[var(--card)] border-2 border-[var(--border)] p-3 hover:border-[var(--accent)] transition-all group relative rounded-2xl">
            <div className="flex justify-between items-start mb-2">
              <span className="px-1.5 py-0.5 bg-[var(--toss-blue-light)] text-[var(--accent)] text-[9px] font-semibold uppercase rounded-md">{shift.company_name || '-'}</span>
              <div className="flex items-center gap-2 text-xs font-bold">
                <button
                  onClick={() => {
                    setEditingShiftId(shift.id);
                    setNewShift(applyWorkDayMode({
                      name: shift.name,
                      start_time: shift.start_time,
                      end_time: shift.end_time,
                      description: shift.description || '',
                      company_name: shift.company_name || selectedCo || '박철홍정형외과',
                      selectedCompanies: [shift.company_name || selectedCo || '박철홍정형외과'],
                      break_start_time: shift.break_start_time || '',
                      break_end_time: shift.break_end_time || '',
                      shift_type: shift.shift_type || '',
                      weekly_work_days: shift.weekly_work_days ?? 5,
                      is_weekend_work: !!shift.is_weekend_work,
                      is_shift: !!shift.is_shift,
                      monthly_night_days: shift.monthly_night_days ?? 0,
                      additional_work_hours: shift.additional_work_hours ?? 0,
                      extra_contract_allowance: shift.extra_contract_allowance ?? 0,
                      work_day_mode: shift.work_day_mode || resolveWorkDayMode(shift),
                    }, shift.work_day_mode || resolveWorkDayMode(shift)));
                    setShowAddModal(true);
                  }}
                  className="px-2 py-1 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] hover:opacity-90"
                >
                  수정
                </button>
                <button onClick={() => handleDeleteShift(shift.id)} className="text-[var(--toss-gray-3)] hover:text-red-500 transition-colors">✕</button>
              </div>
            </div>
            <h3 className="text-sm font-bold text-[var(--foreground)] mb-0.5 truncate" title={shift.name}>{shift.name}</h3>
            <p className="text-[10px] text-[var(--toss-gray-3)] font-bold mb-3 truncate" title={shift.description || '설명 없음'}>{shift.description || '설명 없음'}</p>
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
              <div>
                <p className="text-[9px] font-semibold text-[var(--toss-gray-3)] uppercase">출근</p>
                <p className="text-xs font-bold text-[var(--foreground)]">{shift.start_time}</p>
              </div>
              <div className="text-[var(--toss-gray-3)] text-[10px]">→</div>
              <div>
                <p className="text-[9px] font-semibold text-[var(--toss-gray-3)] uppercase">퇴근</p>
                <p className="text-xs font-bold text-[var(--foreground)]">{shift.end_time}</p>
              </div>
              {shift.break_start_time && shift.break_end_time && (
                <div className="ml-auto text-right">
                  <p className="text-[9px] font-semibold text-[var(--toss-gray-3)] uppercase">휴게</p>
                  <p className="text-xs font-bold text-[var(--foreground)]">
                    {shift.break_start_time}
                  </p>
                </div>
              )}
            </div>
            {(shift.shift_type || shift.weekly_work_days || shift.is_weekend_work || shift.is_shift || hasShiftContractMeta(shift)) && (
              <div className="mt-2 text-[9px] font-bold text-white flex flex-wrap gap-1">
                {shift.is_shift && <span className="px-1.5 py-0.5 rounded-[var(--radius-md)] bg-indigo-600 border border-indigo-700 shadow-sm">교대</span>}
                {shift.shift_type && <span className="px-1.5 py-0.5 rounded-[var(--radius-md)] bg-slate-700 border border-slate-800 shadow-sm">{shift.shift_type}</span>}
                {shift.weekly_work_days && (
                  <span className="px-1.5 py-0.5 rounded-[var(--radius-md)] bg-slate-700 border border-slate-800 shadow-sm">
                    {formatWorkDayMode(shift.work_day_mode || resolveWorkDayMode(shift))}
                  </span>
                )}
                <span className="px-1.5 py-0.5 rounded-[var(--radius-md)] bg-slate-700 border border-slate-800 shadow-sm">
                  주 {calculateWeeklyWorkHours(shift)}시간
                </span>
                {shift.is_weekend_work && (
                  <span className="px-1.5 py-0.5 rounded-[var(--radius-md)] bg-slate-700 border border-slate-800 shadow-sm">
                    주말
                  </span>
                )}
                {shift.monthly_night_days ? (
                  <span className="px-1.5 py-0.5 rounded-[var(--radius-md)] bg-purple-700 border border-purple-800 shadow-sm">
                    나이트 {shift.monthly_night_days}일
                  </span>
                ) : null}
                {shift.additional_work_hours ? (
                  <span className="px-1.5 py-0.5 rounded-[var(--radius-md)] bg-orange-600 border border-orange-700 shadow-sm">
                    추가근무 {shift.additional_work_hours}시간
                  </span>
                ) : null}
                {shift.extra_contract_allowance ? (
                  <span className="px-1.5 py-0.5 rounded-[var(--radius-md)] bg-emerald-700 border border-emerald-800 shadow-sm">
                    약정 {shift.extra_contract_allowance.toLocaleString()}원
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ))}
        {shifts.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-[var(--border)]">
            <p className="text-[var(--toss-gray-3)] font-semibold italic">등록된 근무 형태가 없습니다.</p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-[var(--card)] w-full max-w-md p-4 md:p-5 border-2 border-[var(--border)] shadow-sm space-y-4 radius-toss-xl max-h-[90vh] overflow-y-auto custom-scrollbar" data-testid="shift-modal">
            <h3 className="page-title border-b-2 border-[var(--border)] pb-2">
              {editingShiftId ? '근무 형태 수정' : '근무 형태 생성'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="caption uppercase block mb-1">명칭 (예: 3교대-데이, 나이트전담)</label>
                <input type="text" value={newShift.name} onChange={e => setNewShift({ ...newShift, name: e.target.value })} className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border)] font-semibold text-xs outline-none focus:border-[var(--foreground)] radius-toss" placeholder="근무 형태 이름을 입력하세요" data-testid="shift-name-input" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="caption uppercase block mb-1">출근 시간</label>
                  <input type="time" value={newShift.start_time} onChange={e => setNewShift({ ...newShift, start_time: e.target.value })} className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border)] font-semibold text-xs radius-toss" />
                </div>
                <div>
                  <label className="caption uppercase block mb-1">퇴근 시간</label>
                  <input type="time" value={newShift.end_time} onChange={e => setNewShift({ ...newShift, end_time: e.target.value })} className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border)] font-semibold text-xs radius-toss" />
                </div>
              </div>
              <div>
                <label className="caption uppercase block mb-1">적용 사업체 {editingShiftId ? '' : '(복수 선택 가능)'}</label>
                {editingShiftId ? (
                  <select
                    value={newShift.company_name}
                    onChange={e => setNewShift({ ...newShift, company_name: e.target.value })}
                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border)] font-semibold text-xs radius-toss"
                    data-testid="shift-company-select"
                  >
                    <option value="">사업체 선택</option>
                    {companyOptions.map((companyName) => (
                      <option key={companyName} value={companyName}>{companyName}</option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 bg-[var(--muted)] rounded-xl border border-[var(--border)] space-y-2">
                    <label className="flex items-center gap-2 pb-2 border-b border-[var(--border)] mb-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={companyOptions.length > 0 && newShift.selectedCompanies.length === companyOptions.length}
                        onChange={e => {
                          if (e.target.checked) {
                            setNewShift({ ...newShift, company_name: companyOptions[0] || '', selectedCompanies: companyOptions });
                          } else {
                            setNewShift({ ...newShift, company_name: '', selectedCompanies: [] });
                          }
                        }}
                        className="w-4 h-4 text-[var(--accent)]"
                        data-testid="shift-company-all"
                      />
                      <span className="text-[11px] font-bold text-[var(--accent)]">전체 선택</span>
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {companyOptions.map(co => (
                        <label key={co} className="flex items-center gap-2 cursor-pointer hover:bg-[var(--card)] p-1 rounded-md transition-colors">
                          <input
                            type="checkbox"
                            checked={newShift.selectedCompanies.includes(co)}
                            onChange={e => {
                              const next = e.target.checked
                                ? [...newShift.selectedCompanies, co]
                                : newShift.selectedCompanies.filter(c => c !== co);
                              setNewShift({ ...newShift, company_name: next[0] || '', selectedCompanies: next });
                            }}
                            className="w-4 h-4 text-[var(--accent)]"
                            data-testid={`shift-company-${co}`}
                          />
                          <span className="text-xs font-semibold text-[var(--foreground)]">{co}</span>
                        </label>
                      ))}
                    </div>
                    {newShift.selectedCompanies.length === 0 && (
                      <p className="text-[10px] font-semibold text-red-500">
                        전체 화면에서는 저장 전에 적용 사업체를 하나 이상 선택해야 합니다.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <label className="caption uppercase block mb-1">설명</label>
                <textarea value={newShift.description} onChange={e => setNewShift({ ...newShift, description: e.target.value })} className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border)] font-semibold text-xs h-20 radius-toss" placeholder="근무 형태에 대한 설명을 입력하세요" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="caption uppercase block mb-1">휴게시간 시작</label>
                  <input
                    type="time"
                    value={newShift.break_start_time}
                    onChange={e => setNewShift({ ...newShift, break_start_time: e.target.value })}
                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border)] font-semibold text-xs radius-toss"
                  />
                </div>
                <div>
                  <label className="caption uppercase block mb-1">휴게시간 종료</label>
                  <input
                    type="time"
                    value={newShift.break_end_time}
                    onChange={e => setNewShift({ ...newShift, break_end_time: e.target.value })}
                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border)] font-semibold text-xs radius-toss"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="caption uppercase block mb-1">근무 패턴</label>
                  <select
                    value={newShift.shift_type}
                    onChange={e =>
                      setNewShift((prev) =>
                        applyWorkDayMode({ ...prev, shift_type: e.target.value }, prev.work_day_mode || 'weekdays')
                      )
                    }
                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--border)] font-semibold text-xs radius-toss"
                  >
                    <option value="">선택</option>
                    {allPatterns.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                  {!showPatternInput ? (
                    <button type="button" onClick={() => setShowPatternInput(true)} className="mt-1.5 text-[10px] font-bold text-[var(--accent)] hover:underline">+ 패턴 직접 추가</button>
                  ) : (
                    <div className="flex items-center gap-1 mt-1.5">
                      <input type="text" value={newPatternName} onChange={e => setNewPatternName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCustomPattern()} placeholder="새 패턴명" className="flex-1 px-2 py-1.5 text-[10px] font-bold border border-[var(--border)] rounded-lg bg-[var(--input-bg)] text-[var(--foreground)] outline-none" autoFocus />
                      <button type="button" onClick={addCustomPattern} className="px-2 py-1.5 bg-[var(--accent)] text-white text-[10px] font-bold rounded-lg">추가</button>
                      <button type="button" onClick={() => { setShowPatternInput(false); setNewPatternName(''); }} className="px-2 py-1.5 text-[10px] font-bold text-[var(--toss-gray-3)]">취소</button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="caption uppercase block mb-1">근무 요일 기준</label>
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'weekdays' as WorkDayMode, label: '주말 제외', desc: '월~금 근무 / 토·일 OFF' },
                        { value: 'all_days' as WorkDayMode, label: '월~일 전체', desc: '토·일 포함 근무' },
                      ].map((option) => {
                        const selected = (newShift.work_day_mode || 'weekdays') === option.value;
                        const locked = isThreeShiftPattern(newShift.shift_type) && option.value !== 'all_days';
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setNewShift((prev) => applyWorkDayMode(prev, option.value))}
                            disabled={locked}
                            className={`rounded-xl border px-3 py-3 text-left transition-all ${selected ? 'border-[var(--accent)] bg-[var(--toss-blue-light)]/70 ring-1 ring-[var(--accent)]/20' : 'border-[var(--border)] bg-[var(--card)]'} ${locked ? 'cursor-not-allowed opacity-40' : 'hover:border-[var(--accent)]/50'}`}
                            data-testid={`shift-workday-mode-${option.value}`}
                          >
                            <p className="text-[11px] font-bold text-[var(--foreground)]">{option.label}</p>
                            <p className="mt-1 text-[10px] text-[var(--toss-gray-3)]">{option.desc}</p>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                      현재 설정: {formatWorkDayMode(newShift.work_day_mode || 'weekdays')} · 주 {newShift.weekly_work_days}일
                    </p>
                    {isThreeShiftPattern(newShift.shift_type) && (
                      <p className="text-[10px] font-semibold text-[var(--accent)]">
                        3교대 유형은 자동으로 월~일 전체 근무 기준으로 고정됩니다.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[var(--toss-gray-3)]">근무 조건 분석</p>
                    <p className="mt-1 text-[12px] font-semibold text-[var(--foreground)]">예상 주간 근로시간 {estimatedWeeklyHours}시간</p>
                  </div>
                  <span className={`rounded-[var(--radius-md)] px-3 py-1 text-[10px] font-bold ${showContractSettings ? 'bg-orange-100 text-orange-700' : 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]'}`}>
                    {showContractSettings ? '추가 약정 대상' : '일반 근무'}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[var(--toss-gray-3)]">
                  3교대 근무이거나 주 40시간을 초과하는 근무형태는 월간 나이트 일수, 추가근무 시간, 추가 약정수당을 함께 관리할 수 있습니다.
                </p>
              </div>

              {showContractSettings && (
                <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-700">추가 약정 설정</p>
                    <p className="mt-1 text-[11px] font-semibold text-orange-600">
                      3교대 근무자 또는 주 40시간 초과 근무자 기준입니다.
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-orange-700">월간 나이트 일수</span>
                      <input
                        type="number"
                        min={0}
                        value={newShift.monthly_night_days}
                        onChange={e => setNewShift({ ...newShift, monthly_night_days: Number(e.target.value) || 0 })}
                        className="w-full p-3 bg-[var(--card)] border border-orange-200 font-semibold text-xs radius-toss"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-orange-700">월 추가근무 시간</span>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        value={newShift.additional_work_hours}
                        onChange={e => setNewShift({ ...newShift, additional_work_hours: Number(e.target.value) || 0 })}
                        className="w-full p-3 bg-[var(--card)] border border-orange-200 font-semibold text-xs radius-toss"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-bold text-orange-700">추가 약정수당</span>
                      <input
                        type="number"
                        min={0}
                        step={10000}
                        value={newShift.extra_contract_allowance}
                        onChange={e => setNewShift({ ...newShift, extra_contract_allowance: Number(e.target.value) || 0 })}
                        className="w-full p-3 bg-[var(--card)] border border-orange-200 font-semibold text-xs radius-toss"
                      />
                    </label>
                  </div>
                </div>
              )}

              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newShift.is_shift || false}
                    onChange={e => setNewShift({ ...newShift, is_shift: e.target.checked })}
                    className="mt-0.5 w-4 h-4 text-indigo-600 bg-[var(--card)] border-indigo-300 rounded focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-indigo-900 dark:text-indigo-400 block mb-0.5">교대 근무 전용 스케줄 여부</span>
                    <span className="text-[10px] text-indigo-700 dark:text-indigo-500 font-medium">체크 시, 교대제 캘린더 화면에서 &apos;교대근무자&apos;를 대상으로만 이 근무 형태가 노출됩니다.</span>
                  </div>
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <button type="button" onClick={() => { setShowAddModal(false); setEditingShiftId(null); }} className="flex-1 py-4 text-[11px] font-semibold btn-toss-secondary">취소</button>
              <button type="button" onClick={handleSaveShift} className="flex-[2] py-4 btn-toss-primary text-[11px]" data-testid="shift-save-button">
                {editingShiftId ? '수정 완료' : '생성 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
