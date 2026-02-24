'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

type EduItem = { name: string; category: 'hospital' | 'company' | 'common' };

export default function EducationList({ selectedCo, staffs, notifications = [] }: any) {
  const filtered = selectedCo === '전체' ? staffs : staffs.filter((s: any) => s.company === selectedCo);

  const [completions, setCompletions] = useState<Record<string, { is_completed: boolean; certificate_url?: string }>>({});
  const [selectedAction, setSelectedAction] = useState<{ staffId: string; staffName: string; eduName: string; isCompleted: boolean; certificateUrl?: string } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // 법정 의무 교육 전체 목록 (병원 / 일반사업장 / 공통)
  const eduItems: EduItem[] = [
    // 공통 (일반 회사)
    { name: '성희롱예방', category: 'common' },
    { name: '개인정보보호', category: 'common' },
    { name: '직장 내 장애인 인식개선', category: 'company' },
    { name: '직장 내 괴롭힘 방지', category: 'company' },
    { name: '산업안전보건(일반)', category: 'company' },
    // 병원·의료기관 추가 의무
    { name: '감염관리 교육', category: 'hospital' },
    { name: '환자안전·의료사고 예방', category: 'hospital' },
    { name: '의료법·의료윤리 교육', category: 'hospital' },
    { name: '마약류 취급자 교육(해당자)', category: 'hospital' },
    // 신고 의무
    { name: '아동학대신고', category: 'hospital' },
    { name: '노인학대신고', category: 'hospital' },
  ];

  useEffect(() => {
    supabase.from('education_completions').select('*').then(({ data, error }) => {
      if (!error && data) {
        const map: Record<string, any> = {};
        data.forEach((r: any) => { map[`${r.staff_id}_${r.education_name}`] = { is_completed: true, certificate_url: r.certificate_url }; });
        setCompletions(map);
      }
    });
  }, []);

  const openActionModal = (s: any, eduName: string) => {
    const key = `${s.id}_${eduName}`;
    const comp = completions[key];
    setSelectedAction({
      staffId: s.id,
      staffName: s.name,
      eduName,
      isCompleted: !!comp,
      certificateUrl: comp?.certificate_url
    });
    setUploadFile(null);
  };

  const handleUpdateStatus = async () => {
    if (!selectedAction) return;
    setUploading(true);
    let url = selectedAction.certificateUrl;

    try {
      if (uploadFile) {
        const ext = uploadFile.name.split('.').pop() || 'png';
        const path = `certs/${selectedAction.staffId}_${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('board-attachments').upload(path, uploadFile, { upsert: true });
        if (upErr) {
          console.warn('Storage error, but continuing', upErr);
          alert('파일 업로드 중 권한 에러가 발생했을 수 있습니다 (board-attachments 버킷). url은 빈 칸으로 저장합니다.');
        } else {
          const { data: pubData } = supabase.storage.from('board-attachments').getPublicUrl(path);
          url = pubData.publicUrl;
        }
      }

      const key = `${selectedAction.staffId}_${selectedAction.eduName}`;
      if (!selectedAction.isCompleted) {
        // 미이수 -> 이수완료로 업데이트 (또는 취소)
        const { error: dbErr } = await supabase.from('education_completions').upsert([{
          staff_id: selectedAction.staffId,
          education_name: selectedAction.eduName,
          certificate_url: url || null
        }]);
        if (dbErr) {
          // 컬럼이 없을 경우를 대비하여 url 제외하고 재시도
          console.warn('certificate_url column might be missing', dbErr);
          await supabase.from('education_completions').upsert([{ staff_id: selectedAction.staffId, education_name: selectedAction.eduName }]);
        }
        setCompletions(prev => ({ ...prev, [key]: { is_completed: true, certificate_url: url } }));
      } else {
        // 이수 취소
        await supabase.from('education_completions').delete().eq('staff_id', selectedAction.staffId).eq('education_name', selectedAction.eduName);
        setCompletions(prev => { const n = { ...prev }; delete n[key]; return n; });
      }
      setSelectedAction(null);
    } catch (e) {
      console.error(e);
      alert('상태 업데이트 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-[var(--toss-border)] shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-50 bg-[var(--toss-gray-1)]/50 flex justify-between items-center">
        <h3 className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">직원별 교육 이수 내역 (2026년)</h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">이수완료</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">미이수</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">기한임박</span>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead className="bg-white text-[11px] font-semibold text-[var(--toss-gray-3)] border-b border-[var(--toss-border)] uppercase">
            <tr>
              <th className="p-4 sticky left-0 bg-white z-10 w-32 border-r border-gray-50">성명 / 소속</th>
              {eduItems.map(item => (
                <th key={item.name} className="p-4 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span>{item.name}</span>
                    <span className="text-[8px] font-bold text-[var(--toss-gray-3)]">
                      {item.category === 'hospital'
                        ? '병원'
                        : item.category === 'company'
                          ? '일반'
                          : '공통'}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((s: any) => {
              const staffNotis = notifications.filter((n: any) => n.id === s.id);
              return (
                <tr key={s.id} className="hover:bg-gray-25 transition-colors">
                  <td className="p-4 sticky left-0 bg-white z-10 border-r border-gray-50">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-[var(--foreground)]">{s.name}</span>
                      <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">{s.company}</span>
                    </div>
                  </td>
                  {eduItems.map((item, idx) => {
                    const isUrgent = staffNotis.some((n: any) => n.education === item.name);
                    const comp = completions[`${s.id}_${item.name}`];
                    const isCompleted = !!comp;

                    return (
                      <td key={idx} className="p-4 text-center">
                        {(!isCompleted && isUrgent) ? (
                          <div
                            className="flex flex-col items-center gap-1 cursor-pointer"
                            onClick={() => openActionModal(s, item.name)}
                          >
                            <span className="px-2 py-1 text-[11px] font-semibold border bg-orange-50 text-orange-600 border-orange-100 animate-pulse hover:opacity-80 transition-opacity whitespace-nowrap">
                              기한임박
                            </span>
                            <span className="text-[8px] font-bold text-orange-400">7일 남음</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openActionModal(s, item.name)}
                              className={`px-2 py-1 text-[11px] font-semibold border rounded-md transition-all hover:scale-105 active:scale-95 whitespace-nowrap flex items-center gap-1 ${isCompleted ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'}`}
                            >
                              {isCompleted ? '이수완료' : '미이수'}
                              {comp?.certificate_url && <span title="이수증 원본 존재">📎</span>}
                            </button>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 교육 이수 상태 변경 모달 */}
      {selectedAction && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-[var(--toss-card)] rounded-[16px] shadow-2xl overflow-hidden border border-[var(--toss-border)] animate-in fade-in slide-in-from-bottom-4">
            <div className="p-6 border-b border-[var(--toss-border)]">
              <h3 className="text-lg font-bold text-[var(--foreground)] tracking-tight">교육 이수 관리</h3>
              <p className="text-xs text-[var(--toss-gray-3)] font-semibold mt-1 uppercase tracking-widest">{selectedAction.staffName} · {selectedAction.eduName}</p>
            </div>
            <div className="p-6 space-y-5">
              {!selectedAction.isCompleted ? (
                <>
                  <div className="bg-[var(--toss-gray-1)] rounded-[12px] p-4 text-center">
                    <p className="text-sm font-bold text-[var(--foreground)]">현재 <span className="text-red-500">미이수</span> 상태입니다.</p>
                    <p className="text-xs text-[var(--toss-gray-4)] mt-1 font-medium">이수 완료로 변경하려면 원본 이수증(PDF/이미지)을 첨부하거나 하단의 버튼을 클릭하세요.</p>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest block mb-2">이수증 파일 (선택)</label>
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                      className="w-full text-sm font-bold text-[var(--toss-gray-4)] file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-[var(--toss-blue-light)] file:text-[var(--toss-blue)]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-[var(--toss-blue-light)]/50 border border-[var(--toss-blue)]/20 rounded-[12px] p-4 text-center">
                    <p className="text-sm font-bold text-[var(--toss-blue)]">현재 이수 완료 상태입니다.</p>
                  </div>
                  {selectedAction.certificateUrl && (
                    <div className="mt-4">
                      <a href={selectedAction.certificateUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3 bg-[var(--page-bg)] border border-[var(--toss-border)] rounded-[12px] text-sm font-bold text-[var(--foreground)] hover:bg-[var(--toss-gray-1)] transition-colors">
                        📎 등록된 이수증 보기
                      </a>
                    </div>
                  )}
                  <p className="text-xs text-red-500 font-bold text-center mt-4">하단의 버튼을 클릭하면 미이수 상태로 되돌아갑니다.</p>
                </>
              )}
            </div>
            <div className="p-4 bg-[var(--page-bg)] border-t border-[var(--toss-border)] flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setSelectedAction(null)}
                className="px-4 py-2 rounded-[8px] border border-[var(--toss-border)] text-xs font-bold text-[var(--toss-gray-4)] hover:bg-[var(--toss-gray-1)]"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={handleUpdateStatus}
                disabled={uploading}
                className={`px-4 py-2 rounded-[8px] text-xs font-bold text-white transition-opacity disabled:opacity-50 ${!selectedAction.isCompleted ? 'bg-[var(--toss-blue)]' : 'bg-red-600'}`}
              >
                {uploading ? '저장 중...' : (!selectedAction.isCompleted ? '이수 완료 처리' : '이수 취소')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
