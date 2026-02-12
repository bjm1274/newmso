'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type ProblemDateItem = { date: string; reason: '미체크' | '지각' | '결근' | '미출근'; label: string };

export default function AttendanceCorrectionForm({ user, staffs }: any) {
  const [corrections, setCorrections] = useState<any[]>([]);
  const [problemDates, setProblemDates] = useState<ProblemDateItem[]>([]);
  const [problemDatesLoading, setProblemDatesLoading] = useState(false);
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

  const fetchProblemDates = useCallback(async () => {
    if (!user?.id) return;
    setProblemDatesLoading(true);
    try {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 60);
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);

      const { data: attList } = await supabase
        .from('attendance')
        .select('date, check_in, check_out, status')
        .eq('staff_id', user.id)
        .gte('date', startStr)
        .lte('date', endStr);

      const { data: attsList } = await supabase
        .from('attendances')
        .select('work_date, status')
        .eq('staff_id', user.id)
        .gte('work_date', startStr)
        .lte('work_date', endStr);

      const { data: myCorrections } = await supabase
        .from('attendance_corrections')
        .select('attendance_date, original_date')
        .eq('staff_id', user.id);
      const alreadyRequested = new Set(
        (myCorrections || []).map((c: any) => (c.attendance_date || c.original_date)?.toString().slice(0, 10))
      );

      const map = new Map<string, ProblemDateItem>();
      const attByDate = new Map((attList || []).map((a: any) => [a.date, a]));
      const attsByDate = new Map((attsList || []).map((a: any) => [a.work_date, a]));

      for (let i = 0; i <= 60; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        if (d > end) break;
        const dateStr = d.toISOString().slice(0, 10);
        if (alreadyRequested.has(dateStr)) continue;
        const att = attByDate.get(dateStr);
        const atts = attsByDate.get(dateStr);
        const statusAt = atts?.status;

        if (statusAt === 'absent') {
          map.set(dateStr, { date: dateStr, reason: '결근', label: '결근' });
          continue;
        }
        if (statusAt === 'late' || att?.status === '지각') {
          map.set(dateStr, { date: dateStr, reason: '지각', label: '지각' });
          continue;
        }
        if (!att) {
          map.set(dateStr, { date: dateStr, reason: '미체크', label: '출퇴근 미체크' });
          continue;
        }
        if (!att.check_in) {
          map.set(dateStr, { date: dateStr, reason: '미출근', label: '출근 미기록' });
        }
      }

      setProblemDates(Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date)));
    } finally {
      setProblemDatesLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchCorrections();
  }, []);

  useEffect(() => {
    fetchProblemDates();
  }, [fetchProblemDates]);

  const handleSubmitCorrection = async () => {
    if (!selectedDate || !reason) return alert('정정할 날짜를 선택하고 사유를 입력해주세요.');

    setLoading(true);
    try {
      const { error } = await supabase.from('attendance_corrections').insert([{
        staff_id: user.id,
        attendance_date: selectedDate,
        original_date: selectedDate,
        reason: reason,
        correction_type: correctionType,
        requested_at: new Date().toISOString(),
        approval_status: '대기',
        status: '대기'
      }]);

      if (!error) {
        alert('출결 정정 신청이 완료되었습니다.');
        setSelectedDate('');
        setReason('');
        setCorrectionType('정상반영');
        setShowNewCorrection(false);
        fetchCorrections();
        fetchProblemDates();
      }
    } catch (err) {
      console.error('신청 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const applyCorrectionToAttendance = async (staffId: string, dateStr: string, correctionTypeVal: string) => {
    const statusMap: Record<string, { att: string; atts: string }> = {
      '정상반영': { att: '정상', atts: 'present' },
      '지각처리': { att: '지각', atts: 'late' },
      '결근처리': { att: '결근', atts: 'absent' }
    };
    const { att, atts } = statusMap[correctionTypeVal] || statusMap['정상반영'];
    await supabase.from('attendance').upsert({
      staff_id: staffId,
      date: dateStr,
      status: att
    }, { onConflict: 'staff_id,date' });
    await supabase.from('attendances').upsert({
      staff_id: staffId,
      work_date: dateStr,
      status: atts
    }, { onConflict: 'staff_id,work_date' });
  };

  const handleApprove = async (correction: any, newStatus: string) => {
    const dateStr = (correction.attendance_date || correction.original_date)?.toString().slice(0, 10);
    const { error } = await supabase
      .from('attendance_corrections')
      .update({
        approval_status: newStatus,
        status: newStatus,
        approved_by: user.id,
        approved_at: new Date().toISOString()
      })
      .eq('id', correction.id);

    if (!error) {
      if (newStatus === '승인' && dateStr && correction.staff_id) {
        await applyCorrectionToAttendance(correction.staff_id, dateStr, correction.correction_type || '정상반영');
      }
      alert(newStatus === '승인' ? '승인되었으며 근태에 반영되었습니다.' : '처리되었습니다.');
      fetchCorrections();
      fetchProblemDates();
    } else {
      alert('처리 중 오류가 발생했습니다.');
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
              <p className="text-xs text-gray-500 font-bold">출퇴근 미체크·지각·결근이 있는 날짜를 선택한 뒤 정정 유형과 사유를 입력하세요.</p>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">
                    정정할 날짜 선택 (근태 자동 연동)
                  </label>
                  {problemDatesLoading ? (
                    <p className="text-sm text-gray-400 font-bold py-4">조회 중...</p>
                  ) : problemDates.length === 0 ? (
                    <p className="text-sm text-gray-500 font-bold py-4 bg-gray-50 rounded-xl px-4">최근 60일 이내 미체크·지각·결근 대상 일자가 없습니다.</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                      {problemDates.map((item) => (
                        <button
                          key={item.date}
                          type="button"
                          onClick={() => setSelectedDate(item.date)}
                          className={`text-left p-3 rounded-xl border-2 transition-all text-xs font-bold ${
                            selectedDate === item.date
                              ? 'border-blue-600 bg-blue-50 text-blue-800'
                              : 'border-gray-100 bg-gray-50 text-gray-700 hover:border-gray-200'
                          }`}
                        >
                          <span className="block text-[10px] text-gray-500">{item.date}</span>
                          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-black ${
                            item.reason === '결근' ? 'bg-red-100 text-red-600' :
                            item.reason === '지각' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'
                          }`}>
                            {item.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
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
                      (correction.approval_status || correction.status) === '승인'
                        ? 'bg-green-100 text-green-600'
                        : (correction.approval_status || correction.status) === '거절'
                        ? 'bg-red-100 text-red-600'
                        : 'bg-orange-100 text-orange-500'
                    }`}
                  >
                    {correction.approval_status ?? correction.status}
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
            .filter(c => (c.approval_status || c.status) === '대기')
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
                      onClick={() => handleApprove(correction, '승인')}
                      className="flex-1 py-2 bg-green-600 text-white rounded-lg text-xs font-black shadow-lg hover:scale-[0.98] transition-all"
                    >
                      ✅ 승인 (근태 반영)
                    </button>
                    <button
                      onClick={() => handleApprove(correction, '거절')}
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
