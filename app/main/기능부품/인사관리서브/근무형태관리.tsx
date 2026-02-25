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
};

export default function ShiftManagement({ selectedCo }: any) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [newShift, setNewShift] = useState({
    name: '',
    start_time: '09:00',
    end_time: '18:00',
    description: '',
    company_name: '박철홍정형외과',
    break_start_time: '',
    break_end_time: '',
    shift_type: '',
    weekly_work_days: 5,
    is_weekend_work: false,
    is_shift: false,
  });

  const fetchShifts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('work_shifts')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      let list = (data || []).map((s: any) => ({
        id: s.id,
        name: s.name,
        start_time: s.start_time?.slice(0, 5) || '09:00',
        end_time: s.end_time?.slice(0, 5) || '18:00',
        description: s.description,
        company_name: s.company_name,
        break_start_time: s.break_start_time?.slice(0, 5) || null,
        break_end_time: s.break_end_time?.slice(0, 5) || null,
        shift_type: s.shift_type || null,
        weekly_work_days: s.weekly_work_days ?? null,
        is_weekend_work: s.is_weekend_work ?? null,
        is_shift: s.is_shift ?? false,
      }));
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

  const handleSaveShift = async () => {
    if (!newShift.name) return alert('근무 형태 명칭을 입력하세요.');
    try {
      if (editingShiftId) {
        const { error } = await supabase
          .from('work_shifts')
          .update({
            name: newShift.name,
            start_time: newShift.start_time,
            end_time: newShift.end_time,
            description: newShift.description || null,
            company_name: newShift.company_name,
            break_start_time: newShift.break_start_time || null,
            break_end_time: newShift.break_end_time || null,
            shift_type: newShift.shift_type || null,
            weekly_work_days: newShift.weekly_work_days ?? null,
            is_weekend_work: newShift.is_weekend_work ?? null,
            is_shift: newShift.is_shift ?? false,
          })
          .eq('id', editingShiftId);
        if (error) throw error;
        alert('근무 형태가 수정되었습니다.');
      } else {
        const { error } = await supabase.from('work_shifts').insert([{
          name: newShift.name,
          start_time: newShift.start_time,
          end_time: newShift.end_time,
          description: newShift.description || null,
          company_name: newShift.company_name,
          break_start_time: newShift.break_start_time || null,
          break_end_time: newShift.break_end_time || null,
          shift_type: newShift.shift_type || null,
          weekly_work_days: newShift.weekly_work_days ?? null,
          is_weekend_work: newShift.is_weekend_work ?? null,
          is_shift: newShift.is_shift ?? false,
        }]);
        if (error) throw error;
        alert('근무 형태가 등록되었습니다.');
      }
      setShowAddModal(false);
      setEditingShiftId(null);
      setNewShift({
        name: '',
        start_time: '09:00',
        end_time: '18:00',
        description: '',
        company_name: '박철홍정형외과',
        break_start_time: '',
        break_end_time: '',
        shift_type: '',
        weekly_work_days: 5,
        is_weekend_work: false,
        is_shift: false,
      });
      fetchShifts();
    } catch (err) {
      alert('저장에 실패했습니다.');
    }
  };

  const handleDeleteShift = async (id: string) => {
    if (!confirm('이 근무 형태를 삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('work_shifts').update({ is_active: false }).eq('id', id);
      if (error) throw error;
      fetchShifts();
    } catch (err) {
      alert('삭제에 실패했습니다.');
    }
  };

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-500">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)] tracking-tighter italic">근무 형태 관리 <span className="text-sm text-[var(--toss-blue)]">[{selectedCo}]</span></h2>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold uppercase mt-1">3교대, 전담직 등 병원 특화 근무 스케줄 설정</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingShiftId(null);
            setNewShift({
              name: '',
              start_time: '09:00',
              end_time: '18:00',
              description: '',
              company_name: selectedCo && selectedCo !== '전체' ? selectedCo : '박철홍정형외과',
              break_start_time: '',
              break_end_time: '',
              shift_type: '',
              weekly_work_days: 5,
              is_weekend_work: false,
              is_shift: false,
            });
            setShowAddModal(true);
          }}
          className="px-6 py-3 btn-toss-primary text-xs"
        >
          신규 근무 형태 생성
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shifts.map((shift) => (
          <div key={shift.id} className="bg-[var(--toss-card)] border-2 border-[var(--toss-border)] p-6 hover:border-[var(--toss-blue)] transition-all group relative">
            <div className="flex justify-between items-start mb-4">
              <span className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--toss-blue)] text-[11px] font-semibold uppercase">{shift.company_name || '-'}</span>
              <div className="flex items-center gap-2 text-xs font-bold">
                <button
                  onClick={() => {
                    setEditingShiftId(shift.id);
                    setNewShift({
                      name: shift.name,
                      start_time: shift.start_time,
                      end_time: shift.end_time,
                      description: shift.description || '',
                      company_name: shift.company_name || selectedCo || '박철홍정형외과',
                      break_start_time: shift.break_start_time || '',
                      break_end_time: shift.break_end_time || '',
                      shift_type: shift.shift_type || '',
                      weekly_work_days: shift.weekly_work_days ?? 5,
                      is_weekend_work: !!shift.is_weekend_work,
                      is_shift: !!shift.is_shift,
                    });
                    setShowAddModal(true);
                  }}
                  className="px-2 py-1 rounded-full bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] hover:opacity-90"
                >
                  수정
                </button>
                <button onClick={() => handleDeleteShift(shift.id)} className="text-[var(--toss-gray-3)] hover:text-red-500 transition-colors">✕</button>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-1">{shift.name}</h3>
            <p className="text-xs text-[var(--toss-gray-3)] font-bold mb-4">{shift.description || '설명 없음'}</p>
            <div className="flex items-center gap-4 pt-4 border-t border-[var(--toss-border)]">
              <div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">출근</p>
                <p className="text-sm font-semibold text-[var(--foreground)]">{shift.start_time}</p>
              </div>
              <div className="text-[var(--toss-gray-3)]">→</div>
              <div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">퇴근</p>
                <p className="text-sm font-semibold text-[var(--foreground)]">{shift.end_time}</p>
              </div>
              {shift.break_start_time && shift.break_end_time && (
                <div className="ml-auto text-right">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">휴게/점심</p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {shift.break_start_time} ~ {shift.break_end_time}
                  </p>
                </div>
              )}
            </div>
            {(shift.shift_type || shift.weekly_work_days || shift.is_weekend_work || shift.is_shift) && (
              <div className="mt-2 text-[11px] font-bold text-white flex flex-wrap gap-2">
                {shift.is_shift && <span className="px-2 py-0.5 rounded-full bg-indigo-600 border border-indigo-700 shadow-sm">교대근무 전용</span>}
                {shift.shift_type && <span className="px-2 py-0.5 rounded-full bg-slate-700 border border-slate-800 shadow-sm">{shift.shift_type}</span>}
                {shift.weekly_work_days && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-700 border border-slate-800 shadow-sm">
                    주 {shift.weekly_work_days}일 근무
                  </span>
                )}
                {shift.is_weekend_work && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-700 border border-slate-800 shadow-sm">
                    주말 포함
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        {shifts.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-[var(--toss-border)]">
            <p className="text-[var(--toss-gray-3)] font-semibold italic">등록된 근무 형태가 없습니다.</p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-[var(--toss-card)] w-full max-w-md p-6 md:p-10 border-2 border-[var(--toss-border)] shadow-2xl space-y-6 radius-toss-xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="page-title border-b-2 border-[var(--toss-border)] pb-2">
              {editingShiftId ? '근무 형태 수정' : '근무 형태 생성'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="caption uppercase block mb-1">명칭 (예: 3교대-데이, 나이트전담)</label>
                <input type="text" value={newShift.name} onChange={e => setNewShift({ ...newShift, name: e.target.value })} className="w-full p-3 bg-[var(--input-bg)] border border-[var(--toss-border)] font-semibold text-xs outline-none focus:border-[var(--foreground)] radius-toss" placeholder="근무 형태 이름을 입력하세요" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="caption uppercase block mb-1">출근 시간</label>
                  <input type="time" value={newShift.start_time} onChange={e => setNewShift({ ...newShift, start_time: e.target.value })} className="w-full p-3 bg-[var(--input-bg)] border border-[var(--toss-border)] font-semibold text-xs radius-toss" />
                </div>
                <div>
                  <label className="caption uppercase block mb-1">퇴근 시간</label>
                  <input type="time" value={newShift.end_time} onChange={e => setNewShift({ ...newShift, end_time: e.target.value })} className="w-full p-3 bg-[var(--input-bg)] border border-[var(--toss-border)] font-semibold text-xs radius-toss" />
                </div>
              </div>
              <div>
                <label className="caption uppercase block mb-1">적용 사업체</label>
                <select
                  value={newShift.company_name}
                  onChange={e => setNewShift({ ...newShift, company_name: e.target.value })}
                  className="w-full p-3 bg-[var(--input-bg)] border border-[var(--toss-border)] font-semibold text-xs radius-toss"
                >
                  <option value="박철홍정형외과">박철홍정형외과</option>
                  <option value="수연의원">수연의원</option>
                  <option value="SY INC.">SY INC.</option>
                </select>
              </div>
              <div>
                <label className="caption uppercase block mb-1">설명</label>
                <textarea value={newShift.description} onChange={e => setNewShift({ ...newShift, description: e.target.value })} className="w-full p-3 bg-[var(--input-bg)] border border-[var(--toss-border)] font-semibold text-xs h-20 radius-toss" placeholder="근무 형태에 대한 설명을 입력하세요" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="caption uppercase block mb-1">휴게/점심 시작</label>
                  <input
                    type="time"
                    value={newShift.break_start_time}
                    onChange={e => setNewShift({ ...newShift, break_start_time: e.target.value })}
                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--toss-border)] font-semibold text-xs radius-toss"
                  />
                </div>
                <div>
                  <label className="caption uppercase block mb-1">휴게/점심 종료</label>
                  <input
                    type="time"
                    value={newShift.break_end_time}
                    onChange={e => setNewShift({ ...newShift, break_end_time: e.target.value })}
                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--toss-border)] font-semibold text-xs radius-toss"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="caption uppercase block mb-1">근무 패턴</label>
                  <select
                    value={newShift.shift_type}
                    onChange={e => setNewShift({ ...newShift, shift_type: e.target.value })}
                    className="w-full p-3 bg-[var(--input-bg)] border border-[var(--toss-border)] font-semibold text-xs radius-toss"
                  >
                    <option value="">선택</option>
                    <option value="상근">상근 (주간)</option>
                    <option value="2교대">2교대</option>
                    <option value="3교대">3교대</option>
                    <option value="1일근무1일휴무">1일 근무 · 1일 휴무</option>
                    <option value="야간전담">야간 전담</option>
                  </select>
                </div>
                <div>
                  <label className="caption uppercase block mb-1">주 근무일수 / 주말</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={7}
                      value={newShift.weekly_work_days}
                      onChange={e => setNewShift({ ...newShift, weekly_work_days: Number(e.target.value) || 0 })}
                      className="w-16 p-2 bg-[var(--input-bg)] border border-[var(--toss-border)] font-semibold text-xs text-center radius-toss"
                    />
                    <span className="text-[11px] font-bold text-[var(--toss-gray-4)]">일 / 주</span>
                    <label className="ml-2 text-[11px] font-bold text-[var(--toss-gray-4)] flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={newShift.is_weekend_work}
                        onChange={e => setNewShift({ ...newShift, is_weekend_work: e.target.checked })}
                      />
                      주말 포함
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newShift.is_shift || false}
                    onChange={e => setNewShift({ ...newShift, is_shift: e.target.checked })}
                    className="mt-0.5 w-4 h-4 text-indigo-600 bg-white border-indigo-300 rounded focus:ring-indigo-500"
                  />
                  <div>
                    <span className="text-xs font-bold text-indigo-900 dark:text-indigo-400 block mb-0.5">교대 근무 전용 스케줄 여부</span>
                    <span className="text-[10px] text-indigo-700 dark:text-indigo-500 font-medium">체크 시, 교대제 캘린더 화면에서 '교대근무자'를 대상으로만 이 근무 형태가 노출됩니다.</span>
                  </div>
                </label>
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <button type="button" onClick={() => { setShowAddModal(false); setEditingShiftId(null); }} className="flex-1 py-4 text-[11px] font-semibold btn-toss-secondary">취소</button>
              <button type="button" onClick={handleSaveShift} className="flex-[2] py-4 btn-toss-primary text-[11px]">
                {editingShiftId ? '수정 완료' : '생성 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
