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
    company_name: '박철홍정형외과'
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
        }]);
        if (error) throw error;
        alert('근무 형태가 등록되었습니다.');
      }
      setShowAddModal(false);
      setEditingShiftId(null);
      setNewShift({ name: '', start_time: '09:00', end_time: '18:00', description: '', company_name: '박철홍정형외과' });
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
          <h2 className="text-xl font-black text-gray-800 tracking-tighter italic">근무 형태 관리 <span className="text-sm text-blue-600">[{selectedCo}]</span></h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">3교대, 전담직 등 병원 특화 근무 스케줄 설정</p>
        </div>
        <button
          onClick={() => {
            setEditingShiftId(null);
            setNewShift({
              name: '',
              start_time: '09:00',
              end_time: '18:00',
              description: '',
              company_name: selectedCo && selectedCo !== '전체' ? selectedCo : '박철홍정형외과',
            });
            setShowAddModal(true);
          }}
          className="px-6 py-3 bg-gray-900 text-white text-xs font-black shadow-xl hover:bg-black transition-all"
        >
          신규 근무 형태 생성
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {shifts.map((shift) => (
          <div key={shift.id} className="bg-white border-2 border-gray-100 p-6 hover:border-blue-600 transition-all group relative">
            <div className="flex justify-between items-start mb-4">
              <span className="px-2 py-1 bg-blue-50 text-blue-600 text-[9px] font-black uppercase">{shift.company_name || '-'}</span>
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
                    });
                    setShowAddModal(true);
                  }}
                  className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200"
                >
                  수정
                </button>
                <button onClick={() => handleDeleteShift(shift.id)} className="text-gray-300 hover:text-red-500 transition-colors">✕</button>
              </div>
            </div>
            <h3 className="text-lg font-black text-gray-800 mb-1">{shift.name}</h3>
            <p className="text-xs text-gray-400 font-bold mb-4">{shift.description || '설명 없음'}</p>
            <div className="flex items-center gap-4 pt-4 border-t border-gray-50">
              <div>
                <p className="text-[9px] font-black text-gray-300 uppercase">출근</p>
                <p className="text-sm font-black text-gray-700">{shift.start_time}</p>
              </div>
              <div className="text-gray-200">→</div>
              <div>
                <p className="text-[9px] font-black text-gray-300 uppercase">퇴근</p>
                <p className="text-sm font-black text-gray-700">{shift.end_time}</p>
              </div>
            </div>
          </div>
        ))}
        {shifts.length === 0 && (
          <div className="col-span-full py-20 text-center border-2 border-dashed border-gray-100">
            <p className="text-gray-300 font-black italic">등록된 근무 형태가 없습니다.</p>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md p-10 border-2 border-gray-900 shadow-2xl space-y-6">
            <h3 className="text-2xl font-black text-gray-800 italic tracking-tighter border-b-4 border-gray-900 pb-2">
              {editingShiftId ? '근무 형태 수정' : '근무 형태 생성'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase">명칭 (예: 3교대-데이, 나이트전담)</label>
                <input type="text" value={newShift.name} onChange={e => setNewShift({...newShift, name: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 font-black text-xs outline-none focus:border-gray-900" placeholder="근무 형태 이름을 입력하세요" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">출근 시간</label>
                  <input type="time" value={newShift.start_time} onChange={e => setNewShift({...newShift, start_time: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 font-black text-xs" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-400 uppercase">퇴근 시간</label>
                  <input type="time" value={newShift.end_time} onChange={e => setNewShift({...newShift, end_time: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 font-black text-xs" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase">적용 사업체</label>
                <select
                  value={newShift.company_name}
                  onChange={e => setNewShift({ ...newShift, company_name: e.target.value })}
                  className="w-full p-3 bg-gray-50 border border-gray-200 font-black text-xs"
                >
                  <option value="박철홍정형외과">박철홍정형외과</option>
                  <option value="수연의원">수연의원</option>
                  <option value="SY INC.">SY INC.</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase">설명</label>
                <textarea value={newShift.description} onChange={e => setNewShift({...newShift, description: e.target.value})} className="w-full p-3 bg-gray-50 border border-gray-200 font-black text-xs h-20" placeholder="근무 형태에 대한 설명을 입력하세요" />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <button onClick={() => { setShowAddModal(false); setEditingShiftId(null); }} className="flex-1 py-4 text-[10px] font-black text-gray-400 hover:bg-gray-50 transition-all">취소</button>
              <button onClick={handleSaveShift} className="flex-[2] py-4 bg-gray-900 text-white text-[10px] font-black hover:bg-black transition-all shadow-xl">
                {editingShiftId ? '수정 완료' : '생성 완료'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
