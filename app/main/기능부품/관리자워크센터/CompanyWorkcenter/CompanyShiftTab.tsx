'use client';

/**
 * 회사 관리 — 근무 형태 탭
 * D1 work_shifts 테이블 연동 및 요일별 세부 근무일/근무시간/휴게시간 설정 & 수정 기능 완벽 구현
 * 프리미엄 Toss 스타일 카드 그리드 및 모달 폼으로 구성
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_SHIFTS } from './fallback-data';

interface DailyScheduleItem {
  enabled: boolean;
  start_time: string;
  end_time: string;
  break_start_time: string;
  break_end_time: string;
}

type DailySchedulesMap = Record<string, DailyScheduleItem>;

interface ShiftCardItem {
  id: string;
  name: string;
  start: string;
  end: string;
  breakMin: string;
  target: string;
  active: boolean;
  companyName: string;
  rawDescription: string;
  dailySchedules?: DailySchedulesMap;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

const DAYS = [
  { key: 'mon', label: '월' },
  { key: 'tue', label: '화' },
  { key: 'wed', label: '수' },
  { key: 'thu', label: '목' },
  { key: 'fri', label: '금' },
  { key: 'sat', label: '토' },
  { key: 'sun', label: '일' },
] as const;

const createDefaultDailySchedules = (): DailySchedulesMap => ({
  mon: { enabled: true, start_time: '09:00', end_time: '18:00', break_start_time: '12:00', break_end_time: '13:00' },
  tue: { enabled: true, start_time: '09:00', end_time: '18:00', break_start_time: '12:00', break_end_time: '13:00' },
  wed: { enabled: true, start_time: '09:00', end_time: '18:00', break_start_time: '12:00', break_end_time: '13:00' },
  thu: { enabled: true, start_time: '09:00', end_time: '18:00', break_start_time: '12:00', break_end_time: '13:00' },
  fri: { enabled: true, start_time: '09:00', end_time: '18:00', break_start_time: '12:00', break_end_time: '13:00' },
  sat: { enabled: false, start_time: '09:00', end_time: '18:00', break_start_time: '12:00', break_end_time: '13:00' },
  sun: { enabled: false, start_time: '09:00', end_time: '18:00', break_start_time: '12:00', break_end_time: '13:00' },
});

export default function CompanyShiftTab() {
  const [rows, setRows] = useState<ShiftCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<string[]>(['전체', '박철홍정형외과', '수연의원', 'MSO 본사', '지점 A']);
  
  // Modal & Form State
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [company, setCompany] = useState('박철홍정형외과');
  const [dailySchedules, setDailySchedules] = useState<DailySchedulesMap>(createDefaultDailySchedules());
  
  const [submitting, setSubmitting] = useState(false);

  // 요일별 설정 요약 생성 헬퍼
  const getWeeklyScheduleSummary = (schedules?: DailySchedulesMap) => {
    if (!schedules) return null;
    const enabledDays = DAYS.filter(d => schedules[d.key]?.enabled);
    if (enabledDays.length === 0) return '근무일 없음';
    
    const labels = enabledDays.map(d => d.label).join('');
    const firstDay = schedules[enabledDays[0].key];
    
    // 모든 활성화 요일의 시간 조건이 동일한지 판단
    const allSame = enabledDays.every(d => {
      const curr = schedules[d.key];
      return curr.start_time === firstDay.start_time &&
             curr.end_time === firstDay.end_time &&
             curr.break_start_time === firstDay.break_start_time &&
             curr.break_end_time === firstDay.break_end_time;
    });
    
    if (allSame) {
      const breakLabel = (firstDay.break_start_time && firstDay.break_end_time) 
        ? `, 휴게 ${firstDay.break_start_time}~${firstDay.break_end_time}` 
        : '';
      return `${labels} ${firstDay.start_time}~${firstDay.end_time}${breakLabel}`;
    } else {
      return `${labels} 요일별 상이`;
    }
  };

  const loadShifts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('work_shifts')
        .select('id,name,start_time,end_time,break_start_time,break_end_time,description,company_name,is_active')
        .limit(150);
      
      if (error || !Array.isArray(data) || data.length === 0) {
        // Map fallback shifts to include virtual ids
        setRows(FALLBACK_SHIFTS.map((s, idx) => ({
          id: `fallback-${idx}`,
          name: s.name,
          start: s.start,
          end: s.end,
          breakMin: s.breakMin,
          target: s.target,
          active: s.active,
          companyName: '전체',
          rawDescription: s.target
        })));
      } else {
        const list = data.filter(isRecord).map((r): ShiftCardItem => {
          const id = typeof r.id === 'string' ? r.id : crypto.randomUUID();
          const name = typeof r.name === 'string' ? r.name : '-';
          const start = typeof r.start_time === 'string' ? r.start_time : '-';
          const end = typeof r.end_time === 'string' ? r.end_time : '-';
          
          let breakMin = '없음';
          if (r.break_start_time && r.break_end_time) {
            breakMin = `${String(r.break_start_time).slice(0,5)} ~ ${String(r.break_end_time).slice(0,5)}`;
          }
          
          // Pure target description without ugly JSON / SHIFT_META
          let rawDesc = typeof r.description === 'string' ? r.description : '';
          let dailySchedules: DailySchedulesMap | undefined = undefined;
          
          if (rawDesc.includes('[SHIFT_META]')) {
            const parts = rawDesc.split('[SHIFT_META]');
            rawDesc = parts[0].trim();
            try {
              const meta = JSON.parse(parts[1].trim());
              if (meta?.daily_schedules) {
                dailySchedules = meta.daily_schedules;
              }
            } catch (e) {
              console.error('Failed to parse metadata:', e);
            }
          }
          const target = rawDesc || '전체 공통';
          const companyName = typeof r.company_name === 'string' ? r.company_name : '전체';
          const active = r.is_active !== 0;
          return { 
            id, 
            name, 
            start, 
            end, 
            breakMin, 
            target, 
            active, 
            companyName, 
            rawDescription: typeof r.description === 'string' ? r.description : '',
            dailySchedules
          };
        });
        setRows(list);
      }
    } catch {
      setRows(FALLBACK_SHIFTS.map((s, idx) => ({
        id: `fallback-${idx}`,
        name: s.name,
        start: s.start,
        end: s.end,
        breakMin: s.breakMin,
        target: s.target,
        active: s.active,
        companyName: '전체',
        rawDescription: s.target
      })));
    } finally {
      setLoading(false);
    }
  };

  const loadCompanies = async () => {
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('name')
        .limit(50);
      if (!error && Array.isArray(data) && data.length > 0) {
        const names = Array.from(new Set(['전체', ...data.filter(isRecord).map(d => String(d.name))]));
        setCompanies(names);
        if (names.includes('박철홍정형외과')) {
          setCompany('박철홍정형외과');
        } else {
          setCompany(names[1] || names[0]);
        }
      }
    } catch (err) {
      console.warn('Failed to load companies:', err);
    }
  };

  useEffect(() => {
    void loadShifts();
    void loadCompanies();
  }, []);

  const openAddModal = () => {
    setEditingId(null);
    setName('');
    setTarget('');
    setCompany('박철홍정형외과');
    setDailySchedules(createDefaultDailySchedules());
    setShowModal(true);
  };

  const openEditModal = (item: ShiftCardItem) => {
    setEditingId(item.id);
    setName(item.name);
    
    // description 에서 [SHIFT_META] 를 뺀 순수 설명 로드
    let cleanTarget = item.target;
    if (cleanTarget === '전체 공통') cleanTarget = '';
    setTarget(cleanTarget);
    setCompany(item.companyName === '전체' ? '박철홍정형외과' : item.companyName);

    // 요일별 스케줄 로드 또는 폴백 빌드
    if (item.dailySchedules) {
      setDailySchedules(item.dailySchedules);
    } else {
      // daily_schedules 정보가 없는 legacy 데이터의 경우,
      // 기존 대표 근무시간과 휴게시간으로 활성 요일(월~금)을 매핑하여 기본값 채우기
      const baseSchedules = createDefaultDailySchedules();
      const start = item.start !== '-' ? item.start.slice(0, 5) : '09:00';
      const end = item.end !== '-' ? item.end.slice(0, 5) : '18:00';
      
      let breakStart = '12:00';
      let breakEnd = '13:00';
      if (item.breakMin && item.breakMin !== '없음') {
        const breakParts = item.breakMin.split('~');
        if (breakParts.length === 2) {
          breakStart = breakParts[0].trim();
          breakEnd = breakParts[1].trim();
        }
      }

      DAYS.forEach(d => {
        baseSchedules[d.key] = {
          enabled: d.key !== 'sat' && d.key !== 'sun',
          start_time: start,
          end_time: end,
          break_start_time: breakStart,
          break_end_time: breakEnd
        };
      });
      setDailySchedules(baseSchedules);
    }

    setShowModal(true);
  };

  const handleSaveShift = async () => {
    if (!name.trim()) return alert('근무 형태명을 입력해주세요.');
    
    const enabledDays = DAYS.filter(d => dailySchedules[d.key].enabled);
    if (enabledDays.length === 0) return alert('최소 하루 이상의 근무일을 선택하고 활성화해 주세요.');

    setSubmitting(true);
    try {
      // 1. 대표 스케줄 시간 정보 추출 (활성화된 첫 번째 요일 기준)
      const primaryDay = dailySchedules[enabledDays[0].key];
      const start_time = primaryDay.start_time;
      const end_time = primaryDay.end_time;
      const break_start_time = primaryDay.break_start_time || null;
      const break_end_time = primaryDay.break_end_time || null;

      // 2. description 메타데이터 직렬화
      const metaPayload = {
        work_day_mode: 'custom',
        daily_schedules: dailySchedules
      };
      const cleanTarget = target.trim() || '전체 공통';
      const description = `${cleanTarget}\n[SHIFT_META]${JSON.stringify(metaPayload)}`;

      const isWeekendWork = dailySchedules.sat.enabled || dailySchedules.sun.enabled ? 1 : 0;
      const weeklyWorkDays = enabledDays.length;

      const payload = {
        name,
        start_time,
        end_time,
        break_start_time,
        break_end_time,
        description,
        company_name: company,
        is_weekend_work: isWeekendWork,
        weekly_work_days: weeklyWorkDays,
        is_active: 1,
        is_shift: 1
      };

      if (editingId) {
        // 기존 행 수정
        const { error } = await supabase
          .from('work_shifts')
          .update(payload)
          .eq('id', editingId);

        if (error) throw error;
      } else {
        // 새 근무 형태 생성
        const newId = crypto.randomUUID();
        const { error } = await supabase
          .from('work_shifts')
          .insert({
            id: newId,
            ...payload
          });

        if (error) throw error;
      }

      await loadShifts();
      setShowModal(false);
      
      // Reset form
      setName('');
      setTarget('');
      setCompany('박철홍정형외과');
      setDailySchedules(createDefaultDailySchedules());
    } catch (e) {
      console.error('[CompanyShiftTab] Save shift failed:', e);
      alert('근무형태 저장에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteShift = async (id: string, name: string) => {
    if (id.startsWith('fallback-')) {
      setRows(prev => prev.filter(r => r.id !== id));
      return;
    }

    if (!confirm(`근무 형태 [${name}]를 정말 삭제하시겠습니까?`)) return;

    try {
      const { error } = await supabase
        .from('work_shifts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      console.error('[CompanyShiftTab] Delete failed:', e);
      alert('삭제 도중 오류가 발생했습니다.');
    }
  };

  const handleWeekdayQuickFill = () => {
    setDailySchedules(prev => {
      const next = { ...prev };
      DAYS.forEach(d => {
        if (d.key !== 'sat' && d.key !== 'sun') {
          next[d.key] = {
            enabled: true,
            start_time: '09:00',
            end_time: '18:00',
            break_start_time: '12:00',
            break_end_time: '13:00'
          };
        }
      });
      return next;
    });
  };

  const toggleDayEnabled = (dayKey: string) => {
    setDailySchedules(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        enabled: !prev[dayKey].enabled
      }
    }));
  };

  const updateDaySchedule = (dayKey: string, field: keyof DailyScheduleItem, value: any) => {
    setDailySchedules(prev => ({
      ...prev,
      [dayKey]: {
        ...prev[dayKey],
        [field]: value
      }
    }));
  };

  return (
    <div className="space-y-4">
      {/* ─── 상단 타이틀 및 새 형태 버튼 ─── */}
      <section className="flex items-center justify-between bg-[var(--card)] p-3.5 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm">
        <div>
          <h3 className="text-[14px] font-bold text-[var(--foreground)]">⏰ 근무 형태 관리 ({rows.length})</h3>
          <p className="text-[11px] text-[var(--toss-gray-4)] mt-0.5">각 지점별 다양한 근무 스케줄 패턴을 그리드 카드로 한눈에 모니터링하고 요일별 세부 스케줄을 설정·수정할 수 있습니다.</p>
        </div>
        <SmBtn primary onClick={openAddModal} ariaLabel="새 근무 형태 추가">+ 새 근무 형태</SmBtn>
      </section>

      {/* ─── 근무 형태 그리드 박스 레이아웃 ─── */}
      {loading ? (
        <div className="py-20 text-center text-[12px] text-[var(--toss-gray-4)] bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)]">불러오는 중…</div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center text-[12px] text-[var(--toss-gray-4)] bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)]">등록된 근무 형태가 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {rows.map((r) => {
            const isAllBranch = r.companyName === '전체';
            const weeklySummary = getWeeklyScheduleSummary(r.dailySchedules);
            
            return (
              <article
                key={r.id}
                className="app-card p-4 space-y-3.5 relative overflow-hidden transition-all hover:shadow-md hover:translate-y-[-2px] border border-[var(--border)] bg-[var(--card)] rounded-[var(--radius-lg)] flex flex-col justify-between"
              >
                {/* 상단 텍스트 및 배지 */}
                <div className="space-y-2">
                  <header className="flex items-start justify-between gap-2.5">
                    <h4 className="text-[13.5px] font-extrabold text-[var(--foreground)] tracking-tight line-clamp-1">
                      {r.name}
                    </h4>
                    <Chip tone={isAllBranch ? 'accent' : 'success'}>
                      {isAllBranch ? '공통' : r.companyName}
                    </Chip>
                  </header>

                  <p className="text-[11.5px] text-[var(--toss-gray-4)] leading-relaxed line-clamp-2 min-h-[34px] border-l-2 border-[var(--border)] pl-2">
                    {r.target}
                  </p>
                </div>

                {/* 핵심 상세 정보 */}
                <div className="space-y-1.5 pt-2 border-t border-[var(--border)]/60 text-[11px]">
                  {weeklySummary ? (
                    <div className="flex flex-col gap-1 text-[var(--toss-gray-4)] mb-2">
                      <span className="font-semibold text-[var(--foreground)] bg-[var(--page-bg)] p-1.5 rounded-md border border-[var(--border)]/40 text-[10.5px]">
                        📅 {weeklySummary}
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-[var(--toss-gray-4)]">
                        <span>🕒 대표 근무시간</span>
                        <span className="font-semibold text-[var(--foreground)] tabular-nums">{r.start} ~ {r.end}</span>
                      </div>
                      <div className="flex items-center justify-between text-[var(--toss-gray-4)]">
                        <span>☕ 대표 휴게시간</span>
                        <span className="font-medium text-[var(--foreground)] tabular-nums">{r.breakMin}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* 하단 액션 바 */}
                <footer className="flex items-center justify-between pt-3 mt-1 border-t border-[var(--border)]/40">
                  <Chip tone={r.active ? 'success' : 'muted'}>
                    {r.active ? '활성 형태' : '비활성'}
                  </Chip>
                  
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openEditModal(r)}
                      className="p-1 text-[11px] text-[var(--toss-gray-4)] hover:text-[var(--accent)] transition-colors flex items-center gap-1 font-bold"
                      title="근무 형태 수정"
                    >
                      ✏️ 수정
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteShift(r.id, r.name)}
                      className="p-1 text-[11px] text-[var(--toss-gray-4)] hover:text-[var(--danger)] transition-colors flex items-center gap-1 font-bold"
                      title="근무 형태 삭제"
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* ─── 근무 형태 등록/수정 모달 ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm overflow-y-auto">
          <div className="app-card w-full max-w-lg p-5 space-y-4 shadow-xl border border-[var(--border)] bg-[var(--card)] animate-in fade-in zoom-in-95 duration-150 rounded-[var(--radius-lg)] my-8">
            <header className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h3 className="text-[14px] font-extrabold text-[var(--foreground)]">
                ⏰ {editingId ? '근무 형태 수정' : '새 근무 형태 추가'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-[var(--toss-gray-4)] hover:text-[var(--foreground)] text-sm font-bold"
              >
                ✕
              </button>
            </header>

            <div className="space-y-4">
              {/* 기본 설정 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="shift-name" className="block text-[10.5px] font-bold text-[var(--toss-gray-4)] mb-1">
                    근무 형태명
                  </label>
                  <input
                    id="shift-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                    placeholder="예: 주간 일반 (D), 주말 야간"
                  />
                </div>
                <div>
                  <label htmlFor="shift-company" className="block text-[10.5px] font-bold text-[var(--toss-gray-4)] mb-1">
                    소속 지점
                  </label>
                  <select
                    id="shift-company"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  >
                    {companies.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="shift-target" className="block text-[10.5px] font-bold text-[var(--toss-gray-4)] mb-1">
                  적용 대상 설명
                </label>
                <input
                  id="shift-target"
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  placeholder="예: 외래팀, 교대 근무자 등 (비워두면 '전체 공통')"
                />
              </div>

              {/* 요일별 세부 스케줄링 설정 */}
              <div className="border-t border-[var(--border)]/80 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11.5px] font-extrabold text-[var(--foreground)]">📅 요일별 세부 스케줄 설정</span>
                  <button
                    type="button"
                    onClick={handleWeekdayQuickFill}
                    className="px-2 py-1 text-[9.5px] font-bold text-[var(--accent)] bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 rounded-md transition-colors"
                  >
                    평일(월~금) 일괄 입력
                  </button>
                </div>

                <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
                  {DAYS.map((day) => {
                    const sched = dailySchedules[day.key];
                    return (
                      <div
                        key={day.key}
                        className={`p-2.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition-colors ${
                          sched.enabled 
                            ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5' 
                            : 'border-[var(--border)] bg-[var(--muted)]/20'
                        }`}
                      >
                        {/* 요일명 및 근무 토글 */}
                        <div className="flex items-center gap-3 min-w-[70px]">
                          <button
                            type="button"
                            onClick={() => toggleDayEnabled(day.key)}
                            className={`w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-xs transition-colors ${
                              sched.enabled 
                                ? 'bg-[var(--accent)] text-white' 
                                : 'bg-[var(--toss-gray-2)] text-[var(--toss-gray-4)] hover:bg-[var(--toss-gray-3)]/30'
                            }`}
                          >
                            {day.label}
                          </button>
                          <span className={`text-[11px] font-bold ${sched.enabled ? 'text-[var(--foreground)]' : 'text-[var(--toss-gray-3)]'}`}>
                            {sched.enabled ? '근무일' : '휴무'}
                          </span>
                        </div>

                        {sched.enabled && (
                          <div className="flex flex-1 flex-wrap items-center gap-2 sm:justify-end text-[11px]">
                            {/* 근무 시간 */}
                            <div className="flex items-center gap-1">
                              <span className="text-[9.5px] font-semibold text-[var(--toss-gray-4)]">근무</span>
                              <input
                                type="time"
                                value={sched.start_time}
                                onChange={(e) => updateDaySchedule(day.key, 'start_time', e.target.value)}
                                className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none"
                              />
                              <span className="text-[9.5px] font-semibold text-[var(--toss-gray-4)]">~</span>
                              <input
                                type="time"
                                value={sched.end_time}
                                onChange={(e) => updateDaySchedule(day.key, 'end_time', e.target.value)}
                                className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none"
                              />
                            </div>

                            {/* 휴게 시간 */}
                            <div className="flex items-center gap-1">
                              <span className="text-[9.5px] font-semibold text-[var(--toss-gray-4)]">휴게</span>
                              <input
                                type="time"
                                value={sched.break_start_time}
                                onChange={(e) => updateDaySchedule(day.key, 'break_start_time', e.target.value)}
                                className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none"
                              />
                              <span className="text-[9.5px] font-semibold text-[var(--toss-gray-4)]">~</span>
                              <input
                                type="time"
                                value={sched.break_end_time}
                                onChange={(e) => updateDaySchedule(day.key, 'break_end_time', e.target.value)}
                                className="px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] focus:outline-none"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
              <SmBtn onClick={() => setShowModal(false)} ariaLabel="취소">취소</SmBtn>
              <SmBtn primary onClick={handleSaveShift} ariaLabel="근무형태 저장">
                {submitting ? '저장 중…' : '저장하기'}
              </SmBtn>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
