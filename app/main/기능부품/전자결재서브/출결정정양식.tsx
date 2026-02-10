'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AttendanceCorrectionForm({ user, staffs }: any) {
  const [corrections, setCorrections] = useState<any[]>([]);
  const [showNewCorrection, setShowNewCorrection] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');
  const [reason, setReason] = useState('');
  const [correctionType, setCorrectionType] = useState('정상반영');
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState('신청');

  const fetchCorrections = async () => {
    const { data } = await supabase
      .from('attendance_corrections')
      .select('*')
      .order('requested_at', { ascending: false });
    if (data) setCorrections(data as any);
  };

  useEffect(() => {
    fetchCorrections();
  }, []);

  const handleSubmitCorrection = async () => {
    if (!selectedDate || !reason) return alert('필수 항목을 입력해주세요.');

    setLoading(true);
    try {
      const { error } = await supabase.from('attendance_corrections').insert([{
        staff_id: user.id,
        attendance_date: selectedDate,
        reason: reason,
        correction_type: correctionType,
        requested_at: new Date().toISOString(),
        approval_status: '대기'
      }]);

      if (!error) {
        alert('출결 정정 신청이 완료되었습니다.');
        setSelectedDate('');
        setReason('');
        setCorrectionType('정상반영');
        setShowNewCorrection(false);
        fetchCorrections();
      }
    } catch (err) {
      console.error('신청 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (correctionId: string, newStatus: string) => {
    const { error } = await supabase
      .from('attendance_corrections')
      .update({
        approval_status: newStatus,
        approved_by: user.id,
        approved_at: new Date().toISOString()
      })
      .eq('id', correctionId);

    if (!error) {
      alert('처리되었습니다.');
      fetchCorrections();
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50/30 overflow-y-auto custom-scrollbar space-y-8 p-8">
      <header>
        <h2 className="text-2xl font-black text-gray-800 tracking-tighter italic">출결 정정 신청</h2>
        <p className="text-xs text-gray-400 font-bold uppercase mt-1">지각 또는 미기록 사유 제출 및 결재</p>
      </header>

      {/* 탭 */}
      <div className="flex gap-2 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
        <button
          onClick={() => setViewMode('신청')}
          className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${
            viewMode === '신청'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
          }`}
        >
          신청하기
        </button>
        <button
          onClick={() => setViewMode('현황')}
          className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${
            viewMode === '현황'
              ? 'bg-blue-600 text-white shadow-lg'
              : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
          }`}
        >
          신청 현황
        </button>
        {(user.department === '행정팀' || user.role === 'admin') && (
          <button
            onClick={() => setViewMode('결재')}
            className={`px-6 py-3 rounded-xl text-xs font-black transition-all ${
              viewMode === '결재'
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
            결재 대기
          </button>
        )}
      </div>

      {/* 신청하기 */}
      {viewMode === '신청' && (
        <div className="space-y-6">
          <button
            onClick={() => setShowNewCorrection(!showNewCorrection)}
            className="px-6 py-3 bg-black text-white rounded-xl text-xs font-black shadow-lg hover:scale-[0.98] transition-all"
          >
            {showNewCorrection ? '✕ 취소' : '+ 새 신청'}
          </button>

          {showNewCorrection && (
            <div className="bg-white p-8 border border-gray-100 shadow-sm rounded-2xl space-y-6 animate-in fade-in duration-300">
              <h3 className="text-lg font-black text-gray-800">출결 정정 신청</h3>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">
                    정정 날짜
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">
                    정정 유형
                  </label>
                  <select
                    value={correctionType}
                    onChange={e => setCorrectionType(e.target.value)}
                    className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="정상반영">정상 반영 (지각 아님)</option>
                    <option value="지각처리">지각 처리 (인정)</option>
                    <option value="결근처리">결근 처리 (인정)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">
                    사유
                  </label>
                  <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="지각 또는 미기록 사유를 상세히 입력해주세요."
                    className="w-full h-32 p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold leading-relaxed focus:ring-2 focus:ring-blue-100 resize-none"
                  />
                </div>
              </div>

              <button
                onClick={handleSubmitCorrection}
                disabled={loading}
                className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-sm shadow-lg hover:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? '신청 중...' : '결재 상신'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* 신청 현황 */}
      {viewMode === '현황' && (
        <div className="space-y-4">
          {corrections
            .filter(c => c.staff_id === user.id)
            .map((correction, idx) => (
              <div key={correction.id || idx} className="bg-white p-6 border border-gray-100 shadow-sm rounded-2xl">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm font-black text-gray-800">{correction.attendance_date}</p>
                    <p className="text-xs text-gray-400 font-bold mt-1">{correction.reason}</p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-lg text-[10px] font-black ${
                      correction.approval_status === '승인'
                        ? 'bg-green-100 text-green-600'
                        : correction.approval_status === '거절'
                        ? 'bg-red-100 text-red-600'
                        : 'bg-orange-100 text-orange-500'
                    }`}
                  >
                    {correction.approval_status}
                  </span>
                </div>
                <div className="pt-4 border-t border-gray-50">
                  <p className="text-[10px] font-bold text-gray-400">
                    정정 유형: {correction.correction_type}
                  </p>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* 결재 대기 (행정팀용) */}
      {viewMode === '결재' && (
        <div className="space-y-4">
          {corrections
            .filter(c => c.approval_status === '대기')
            .map((correction, idx) => (
              <div key={correction.id || idx} className="bg-white p-6 border border-gray-100 shadow-sm rounded-2xl">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm font-black text-gray-800">{correction.attendance_date}</p>
                    <p className="text-xs text-gray-400 font-bold mt-1">{correction.reason}</p>
                  </div>
                  <span className="px-3 py-1 rounded-lg text-[10px] font-black bg-orange-100 text-orange-500">
                    대기
                  </span>
                </div>

                <div className="pt-4 border-t border-gray-50 space-y-3">
                  <p className="text-[10px] font-bold text-gray-400">정정 유형: {correction.correction_type}</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(correction.id, '승인')}
                      className="flex-1 py-2 bg-green-600 text-white rounded-lg text-xs font-black shadow-lg hover:scale-[0.98] transition-all"
                    >
                      ✅ 승인
                    </button>
                    <button
                      onClick={() => handleApprove(correction.id, '거절')}
                      className="flex-1 py-2 bg-red-600 text-white rounded-lg text-xs font-black shadow-lg hover:scale-[0.98] transition-all"
                    >
                      ❌ 거절
                    </button>
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
