'use client';

/**
 * 회사 관리 — 근무 형태 탭
 * D1 work_shifts 테이블 연동 및 새 형태 등록 모달 완벽 연동
 * 테이블 구조에서 프리미엄 Toss 스타일 카드 그리드로 개편
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import { FALLBACK_SHIFTS } from './fallback-data';

interface ShiftCardItem {
  id: string;
  name: string;
  start: string;
  end: string;
  breakMin: string;
  target: string;
  active: boolean;
  companyName: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export default function CompanyShiftTab() {
  const [rows, setRows] = useState<ShiftCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<string[]>(['전체', '박철홍정형외과', '수연의원', 'MSO 본사', '지점 A']);
  
  // New Shift Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('09:00');
  const [newEnd, setNewEnd] = useState('18:00');
  const [newBreakStart, setNewBreakStart] = useState('12:00');
  const [newBreakEnd, setNewBreakEnd] = useState('13:00');
  const [newTarget, setNewTarget] = useState('');
  const [newCompany, setNewCompany] = useState('박철홍정형외과');
  const [submitting, setSubmitting] = useState(false);

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
          companyName: '전체'
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
          if (rawDesc.includes('[SHIFT_META]')) {
            rawDesc = rawDesc.split('[SHIFT_META]')[0].trim();
          }
          const target = rawDesc || '전체 공통';
          
          const companyName = typeof r.company_name === 'string' ? r.company_name : '전체';
          const active = r.is_active !== 0;
          return { id, name, start, end, breakMin, target, active, companyName };
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
        companyName: '전체'
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
          setNewCompany('박철홍정형외과');
        } else {
          setNewCompany(names[1] || names[0]);
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

  const handleAddShift = async () => {
    if (!newName.trim()) return alert('근무 형태명을 입력해주세요.');
    setSubmitting(true);
    try {
      const newId = crypto.randomUUID();
      const newRow: ShiftCardItem = {
        id: newId,
        name: newName,
        start: newStart,
        end: newEnd,
        breakMin: `${newBreakStart} ~ ${newBreakEnd}`,
        target: newTarget || '전체 공통',
        active: true,
        companyName: newCompany,
      };

      const { error } = await supabase
        .from('work_shifts')
        .insert({
          id: newId,
          name: newName,
          start_time: newStart,
          end_time: newEnd,
          break_start_time: newBreakStart,
          break_end_time: newBreakEnd,
          description: newTarget || '전체 공통',
          company_name: newCompany,
          is_active: 1,
          is_shift: 1,
        });

      if (error) throw error;
      
      setRows(prev => [...prev, newRow]);
      setShowAddModal(false);
      
      // Reset form
      setNewName('');
      setNewStart('09:00');
      setNewEnd('18:00');
      setNewBreakStart('12:00');
      setNewBreakEnd('13:00');
      setNewTarget('');
    } catch (e) {
      console.error('[CompanyShiftTab] Add shift failed:', e);
      alert('근무형태 등록에 실패했습니다.');
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

  return (
    <div className="space-y-4">
      {/* ─── 상단 타이틀 및 새 형태 버튼 ─── */}
      <section className="flex items-center justify-between bg-[var(--card)] p-3.5 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm">
        <div>
          <h3 className="text-[14px] font-bold text-[var(--foreground)]">⏰ 근무 형태 관리 ({rows.length})</h3>
          <p className="text-[11px] text-[var(--toss-gray-4)] mt-0.5">각 지점별 다양한 근무 스케줄 패턴을 그리드 카드로 한눈에 모니터링하고 추가할 수 있습니다.</p>
        </div>
        <SmBtn primary onClick={() => setShowAddModal(true)} ariaLabel="새 근무 형태 추가">+ 새 근무 형태</SmBtn>
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
                  <div className="flex items-center justify-between text-[var(--toss-gray-4)]">
                    <span>🕒 근무 시간</span>
                    <span className="font-semibold text-[var(--foreground)] tabular-nums">{r.start} ~ {r.end}</span>
                  </div>
                  <div className="flex items-center justify-between text-[var(--toss-gray-4)]">
                    <span>☕ 휴게 시간</span>
                    <span className="font-medium text-[var(--foreground)] tabular-nums">{r.breakMin}</span>
                  </div>
                </div>

                {/* 하단 액션 바 */}
                <footer className="flex items-center justify-between pt-3 mt-1 border-t border-[var(--border)]/40">
                  <Chip tone={r.active ? 'success' : 'muted'}>
                    {r.active ? '활성 형태' : '비활성'}
                  </Chip>
                  
                  <button
                    type="button"
                    onClick={() => handleDeleteShift(r.id, r.name)}
                    className="p-1 text-[11px] text-[var(--toss-gray-4)] hover:text-[var(--danger)] transition-colors flex items-center gap-1 font-bold"
                    title="근무 형태 삭제"
                  >
                    🗑️ 삭제
                  </button>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {/* ─── 근무 형태 등록 모달 ─── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="app-card w-full max-w-sm p-4 space-y-4 shadow-xl border border-[var(--border)] bg-[var(--card)] animate-in fade-in zoom-in-95 duration-150 rounded-[var(--radius-lg)]">
            <header className="flex items-center justify-between border-b border-[var(--border)] pb-2">
              <h3 className="text-[13px] font-bold text-[var(--foreground)]">⏰ 새 근무 형태 추가</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-[var(--toss-gray-4)] hover:text-[var(--foreground)] text-sm font-bold"
              >
                ✕
              </button>
            </header>

            <div className="space-y-3">
              <div>
                <label htmlFor="new-shift-name" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                  근무 형태명
                </label>
                <input
                  id="new-shift-name"
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  placeholder="예: 주간 일반 (D), 주말 야간"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-shift-start" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    시작 시각
                  </label>
                  <input
                    id="new-shift-start"
                    type="time"
                    value={newStart}
                    onChange={(e) => setNewStart(e.target.value)}
                    className="w-full px-2.5 py-1 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="new-shift-end" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    종료 시각
                  </label>
                  <input
                    id="new-shift-end"
                    type="time"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                    className="w-full px-2.5 py-1 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-shift-break-start" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    휴게 시작
                  </label>
                  <input
                    id="new-shift-break-start"
                    type="time"
                    value={newBreakStart}
                    onChange={(e) => setNewBreakStart(e.target.value)}
                    className="w-full px-2.5 py-1 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="new-shift-break-end" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    휴게 종료
                  </label>
                  <input
                    id="new-shift-break-end"
                    type="time"
                    value={newBreakEnd}
                    onChange={(e) => setNewBreakEnd(e.target.value)}
                    className="w-full px-2.5 py-1 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="new-shift-target" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    적용 대상 설명
                  </label>
                  <input
                    id="new-shift-target"
                    type="text"
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                    placeholder="예: 외래팀, 시급직"
                  />
                </div>
                <div>
                  <label htmlFor="new-shift-company" className="block text-[10.5px] font-semibold text-[var(--toss-gray-4)] mb-1">
                    소속 지점
                  </label>
                  <select
                    id="new-shift-company"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    className="w-full px-2.5 py-1.5 text-[12px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] focus:outline-none"
                  >
                    {companies.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-[var(--border)] pt-3">
              <SmBtn onClick={() => setShowAddModal(false)} ariaLabel="취소">취소</SmBtn>
              <SmBtn primary onClick={handleAddShift} ariaLabel="형태 등록">
                {submitting ? '등록 중…' : '등록하기'}
              </SmBtn>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
