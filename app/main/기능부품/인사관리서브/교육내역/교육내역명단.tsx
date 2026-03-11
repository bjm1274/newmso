'use client';

import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  EDUCATION_ITEMS,
  getApplicableEducationItems,
  getEducationCompletionKey,
  getScopedActiveStaffs,
  getStaffDepartment,
  getStaffPosition,
} from './education-utils';

interface EducationListProps {
  selectedCo: string;
  staffs: any[];
  notifications?: any[];
  completions?: Record<string, { is_completed: boolean; certificate_url?: string | null }>;
  onStatusChanged?: () => Promise<void> | void;
}

export default function EducationList({
  selectedCo,
  staffs,
  notifications = [],
  completions = {},
  onStatusChanged,
}: EducationListProps) {
  const filtered = useMemo(() => getScopedActiveStaffs(staffs, selectedCo), [staffs, selectedCo]);
  const visibleEducationItems = useMemo(
    () => (selectedCo === '전체' ? EDUCATION_ITEMS : getApplicableEducationItems(selectedCo)),
    [selectedCo]
  );
  const notificationMap = useMemo(() => {
    const next = new Map<string, { daysLeft: number; type: string }>();
    notifications.forEach((item: any) => {
      next.set(getEducationCompletionKey(item.id, item.education), {
        daysLeft: item.daysLeft,
        type: item.type,
      });
    });
    return next;
  }, [notifications]);
  const currentYear = new Date().getFullYear();

  const [selectedAction, setSelectedAction] = useState<{
    staffId: string;
    staffName: string;
    eduName: string;
    isCompleted: boolean;
    certificateUrl?: string | null;
  } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const openActionModal = (staff: any, eduName: string) => {
    const key = getEducationCompletionKey(staff.id, eduName);
    const completion = completions[key];

    setSelectedAction({
      staffId: String(staff.id),
      staffName: staff.name,
      eduName,
      isCompleted: !!completion,
      certificateUrl: completion?.certificate_url ?? null,
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
        const { error: uploadError } = await supabase.storage.from('board-attachments').upload(path, uploadFile, { upsert: true });

        if (uploadError) {
          console.warn('Storage error, but continuing', uploadError);
          alert('파일 업로드 중 권한 에러가 발생했을 수 있습니다. 이수 상태는 저장하고 사본 URL은 비워 둡니다.');
        } else {
          const { data: publicData } = supabase.storage.from('board-attachments').getPublicUrl(path);
          url = publicData.publicUrl;
        }
      }

      if (!selectedAction.isCompleted) {
        const { error: dbError } = await supabase.from('education_completions').upsert([{
          staff_id: selectedAction.staffId,
          education_name: selectedAction.eduName,
          certificate_url: url || null,
        }]);

        if (dbError) {
          console.warn('certificate_url column might be missing', dbError);
          await supabase.from('education_completions').upsert([{
            staff_id: selectedAction.staffId,
            education_name: selectedAction.eduName,
          }]);
        }
      } else {
        await supabase
          .from('education_completions')
          .delete()
          .eq('staff_id', selectedAction.staffId)
          .eq('education_name', selectedAction.eduName);
      }

      await onStatusChanged?.();
      setSelectedAction(null);
    } catch (error) {
      console.error(error);
      alert('상태 업데이트 중 오류가 발생했습니다.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-[var(--toss-border)] shadow-sm overflow-hidden">
      <div className="p-6 border-b border-gray-50 bg-[var(--toss-gray-1)]/50 flex justify-between items-center">
        <h3 className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
          직원별 교육 이수 내역 ({currentYear}년)
        </h3>
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
              <th className="p-4 sticky left-0 bg-white z-10 w-40 border-r border-gray-50">성명 / 소속</th>
              {visibleEducationItems.map((item) => (
                <th key={item.name} className="p-4 text-center">
                  <div className="flex flex-col items-center gap-1">
                    <span>{item.name}</span>
                    <span className="text-[8px] font-bold text-[var(--toss-gray-3)]">
                      {item.category === 'hospital' ? '병원' : item.category === 'company' ? '일반' : '공통'}
                    </span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((staff: any) => {
              const applicableItems = new Set(getApplicableEducationItems(staff.company).map((item) => item.name));
              const position = getStaffPosition(staff);

              return (
                <tr key={staff.id} className="hover:bg-gray-25 transition-colors">
                  <td className="p-4 sticky left-0 bg-white z-10 border-r border-gray-50">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-[var(--foreground)]">{staff.name}</span>
                      <span className="text-[11px] text-[var(--toss-gray-3)] font-bold">
                        {staff.company} · {getStaffDepartment(staff)}
                        {position ? ` · ${position}` : ''}
                      </span>
                    </div>
                  </td>
                  {visibleEducationItems.map((item) => {
                    const isApplicable = applicableItems.has(item.name);
                    const alertInfo = notificationMap.get(getEducationCompletionKey(staff.id, item.name));
                    const completion = completions[getEducationCompletionKey(staff.id, item.name)];
                    const isCompleted = !!completion;
                    const daysLabel = alertInfo
                      ? alertInfo.daysLeft < 0
                        ? `${Math.abs(alertInfo.daysLeft)}일 경과`
                        : `${alertInfo.daysLeft}일 남음`
                      : null;

                    if (!isApplicable) {
                      return (
                        <td key={item.name} className="p-4 text-center">
                          <span className="px-2 py-1 text-[10px] font-semibold border rounded-md bg-slate-50 text-slate-300 border-slate-100 whitespace-nowrap">
                            해당 없음
                          </span>
                        </td>
                      );
                    }

                    if (!isCompleted && alertInfo) {
                      return (
                        <td key={item.name} className="p-4 text-center">
                          <button
                            type="button"
                            className="flex flex-col items-center gap-1 mx-auto"
                            onClick={() => openActionModal(staff, item.name)}
                          >
                            <span
                              className={`px-2 py-1 text-[11px] font-semibold border rounded-md transition-opacity whitespace-nowrap ${
                                alertInfo.type === 'URGENT'
                                  ? 'bg-orange-50 text-orange-600 border-orange-100 animate-pulse'
                                  : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
                              }`}
                            >
                              {alertInfo.type === 'URGENT' ? '기한임박' : '미이수'}
                            </span>
                            {daysLabel && (
                              <span className="text-[8px] font-bold text-orange-400">{daysLabel}</span>
                            )}
                          </button>
                        </td>
                      );
                    }

                    return (
                      <td key={item.name} className="p-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openActionModal(staff, item.name)}
                            className={`px-2 py-1 text-[11px] font-semibold border rounded-md transition-all hover:scale-105 active:scale-95 whitespace-nowrap flex items-center gap-1 ${
                              isCompleted
                                ? 'bg-green-50 text-green-600 border-green-100'
                                : 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100'
                            }`}
                          >
                            {isCompleted ? '이수완료' : '미이수'}
                            {completion?.certificate_url && <span title="이수증 원본 존재">첨부</span>}
                          </button>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={visibleEducationItems.length + 1} className="p-10 text-center text-xs font-bold text-slate-400">
                  확인할 직원 교육 데이터가 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedAction && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-[var(--toss-card)] rounded-[16px] shadow-2xl overflow-hidden border border-[var(--toss-border)] animate-in fade-in slide-in-from-bottom-4">
            <div className="p-6 border-b border-[var(--toss-border)]">
              <h3 className="text-lg font-bold text-[var(--foreground)] tracking-tight">교육 이수 관리</h3>
              <p className="text-xs text-[var(--toss-gray-3)] font-semibold mt-1 uppercase tracking-widest">
                {selectedAction.staffName} · {selectedAction.eduName}
              </p>
            </div>
            <div className="p-6 space-y-5">
              {!selectedAction.isCompleted ? (
                <>
                  <div className="bg-[var(--toss-gray-1)] rounded-[12px] p-4 text-center">
                    <p className="text-sm font-bold text-[var(--foreground)]">
                      현재 <span className="text-red-500">미이수</span> 상태입니다.
                    </p>
                    <p className="text-xs text-[var(--toss-gray-4)] mt-1 font-medium">
                      이수 완료로 변경하려면 원본 이수증(PDF/이미지)을 첨부하거나 하단의 버튼을 클릭하세요.
                    </p>
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
                      <a
                        href={selectedAction.certificateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-[var(--page-bg)] border border-[var(--toss-border)] rounded-[12px] text-sm font-bold text-[var(--foreground)] hover:bg-[var(--toss-gray-1)] transition-colors"
                      >
                        등록된 이수증 보기
                      </a>
                    </div>
                  )}
                  <p className="text-xs text-red-500 font-bold text-center mt-4">
                    하단의 버튼을 클릭하면 미이수 상태로 되돌아갑니다.
                  </p>
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
                className={`px-4 py-2 rounded-[8px] text-xs font-bold text-white transition-opacity disabled:opacity-50 ${
                  !selectedAction.isCompleted ? 'bg-[var(--toss-blue)]' : 'bg-red-600'
                }`}
              >
                {uploading ? '저장 중...' : !selectedAction.isCompleted ? '이수 완료 처리' : '이수 취소'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
