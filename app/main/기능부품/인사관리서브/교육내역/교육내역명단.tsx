'use client';
import { toast } from '@/lib/toast';

import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MatrixTable, type MatrixColumn, type MatrixCellTone } from '@/app/components/MatrixTable';
import {
  EDUCATION_ITEMS,
  getApplicableEducationItems,
  getEducationCompletionKey,
  getScopedActiveStaffs,
  getStaffDepartment,
  getStaffPosition,
  removeEducationCompletionWithFallback,
  serializeEducationQueryError,
  upsertEducationCompletionWithFallback,
  type EducationItem,
} from './education-utils';

type StaffRow = Record<string, unknown> & {
  id: string | number;
  name: string;
  company?: string;
};

interface EducationListProps {
  selectedCo: string;
  staffs: Record<string, unknown>[];
  notifications?: Record<string, unknown>[];
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
  const filtered = useMemo(
    () => getScopedActiveStaffs(staffs, selectedCo) as unknown as StaffRow[],
    [staffs, selectedCo]
  );
  const visibleEducationItems = useMemo<EducationItem[]>(
    () => (selectedCo === '전체' ? EDUCATION_ITEMS : getApplicableEducationItems(selectedCo)),
    [selectedCo]
  );
  const notificationMap = useMemo(() => {
    const next = new Map<string, { daysLeft: number; type: string }>();
    notifications.forEach((rawItem) => {
      const item = rawItem as { id?: string | number; education?: string; daysLeft?: number; type?: string };
      if (item.id == null || !item.education) return;
      next.set(getEducationCompletionKey(item.id, item.education), {
        daysLeft: Number(item.daysLeft ?? 0),
        type: String(item.type ?? ''),
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

  const openActionModal = (staff: StaffRow, eduName: string) => {
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

  // 셀 상태 계산을 단일 함수로 통합 (renderCell/cellTone 양쪽에서 재사용)
  type CellState =
    | { kind: 'not-applicable' }
    | { kind: 'urgent'; daysLabel: string | null }
    | { kind: 'pending'; daysLabel: string | null }
    | { kind: 'completed'; hasCertificate: boolean };

  const getCellState = (staff: StaffRow, item: EducationItem): CellState => {
    const applicableItems = new Set(
      getApplicableEducationItems(staff.company).map((it) => it.name)
    );
    if (!applicableItems.has(item.name)) return { kind: 'not-applicable' };

    const key = getEducationCompletionKey(staff.id, item.name);
    const completion = completions[key];
    const alertInfo = notificationMap.get(key);
    const isCompleted = !!completion;

    if (isCompleted) {
      return { kind: 'completed', hasCertificate: !!completion?.certificate_url };
    }

    const daysLabel = alertInfo
      ? alertInfo.daysLeft < 0
        ? `${Math.abs(alertInfo.daysLeft)}일 경과`
        : `${alertInfo.daysLeft}일 남음`
      : null;

    if (alertInfo?.type === 'URGENT') return { kind: 'urgent', daysLabel };
    return { kind: 'pending', daysLabel };
  };

  const educationColumns: MatrixColumn<EducationItem>[] = visibleEducationItems.map((item) => ({
    id: item.code,
    label: item.name,
    shortLabel: item.name,
    data: item,
    subLabel:
      item.category === 'hospital' ? '병원' : item.category === 'company' ? '일반' : '공통',
  }));

  const computeRowSummary = (staff: StaffRow) => {
    const applicableItems = getApplicableEducationItems(staff.company);
    const total = applicableItems.length;
    const completedCount = applicableItems.filter(
      (it) => !!completions[getEducationCompletionKey(staff.id, it.name)]
    ).length;
    return { completedCount, total };
  };

  const handleUpdateStatus = async () => {
    if (!selectedAction) return;

    setUploading(true);
    let url = selectedAction.certificateUrl;

    try {
      if (uploadFile) {
        const ext = uploadFile.name.split('.').pop() || 'png';
        const path = `certs/${selectedAction.staffId}_${Date.now()}.${ext}`;
        const uploadForm = new FormData();
        uploadForm.append('file', uploadFile);

        try {
          const uploadRes = await fetch('/api/approvals/upload', {
            method: 'POST',
            body: uploadForm,
          });
          if (!uploadRes.ok) {
            const errJson = (await uploadRes.json().catch(() => ({}))) as { error?: string };
            console.warn('Storage error, but continuing', errJson.error);
            toast('파일 업로드 중 오류가 발생했습니다. 이수 상태는 저장하고 사본 URL은 비워 둡니다.', 'success');
          } else {
            const uploadData = (await uploadRes.json()) as { url: string };
            url = uploadData.url;
          }
        } catch (uploadErr) {
          console.warn('Storage error, but continuing', uploadErr);
          toast('파일 업로드 중 권한 에러가 발생했을 수 있습니다. 이수 상태는 저장하고 사본 URL은 비워 둡니다.', 'success');
        }
      }

      if (!selectedAction.isCompleted) {
        const { error: dbError } = await upsertEducationCompletionWithFallback(supabase, {
          staff_id: selectedAction.staffId,
          education_name: selectedAction.eduName,
          certificate_url: url || null,
        });

        if (dbError) {
          throw dbError;
        }
      } else {
        const { error: deleteError } = await removeEducationCompletionWithFallback(
          supabase,
          selectedAction.staffId,
          selectedAction.eduName,
        );

        if (deleteError) {
          throw deleteError;
        }
      }

      await onStatusChanged?.();
      setSelectedAction(null);
    } catch (error) {
      console.error('교육 이수 상태 업데이트 실패:', serializeEducationQueryError(error));
      toast('상태 업데이트 중 오류가 발생했습니다.', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm overflow-hidden">
      <div className="p-4 border-b border-[var(--border-subtle)] bg-[var(--muted)]/50 flex justify-between items-center">
        <h3 className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
          직원별 교육 이수 내역 ({currentYear}년)
        </h3>
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-green-500/100 rounded-full"></div>
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">이수완료</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-red-500/100 rounded-full"></div>
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">미이수</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 bg-orange-400 rounded-full animate-pulse"></div>
            <span className="text-[11px] font-bold text-[var(--toss-gray-3)]">기한임박</span>
          </div>
        </div>
      </div>

      <div className="p-3">
        <MatrixTable<StaffRow, EducationItem>
          rows={filtered}
          columns={educationColumns}
          rowKey={(staff) => String(staff.id)}
          rowHeaderLabel="성명 / 소속"
          rowHeader={(staff) => {
            const position = getStaffPosition(staff as Parameters<typeof getStaffPosition>[0]);
            const department = getStaffDepartment(staff as Parameters<typeof getStaffDepartment>[0]);
            return (
              <div className="flex flex-col text-left min-w-[140px]">
                <span className="text-xs font-semibold text-[var(--foreground)]">{staff.name}</span>
                <span className="text-[10px] text-[var(--toss-gray-3)] font-bold">
                  {staff.company ?? '-'} · {department}
                  {position ? ` · ${position}` : ''}
                </span>
              </div>
            );
          }}
          renderCell={(staff, col) => {
            const state = getCellState(staff, col.data);
            const eduName = col.data.name;

            if (state.kind === 'not-applicable') {
              return (
                <span
                  className="inline-block px-2 py-1 text-[10px] font-semibold border rounded-md bg-[var(--tab-bg)] text-[var(--toss-gray-3)] border-[var(--border-subtle)] whitespace-nowrap"
                  aria-label={`${staff.name} ${eduName} 해당 없음`}
                >
                  해당 없음
                </span>
              );
            }

            if (state.kind === 'urgent' || state.kind === 'pending') {
              const labelText = state.kind === 'urgent' ? '기한임박' : '미이수';
              return (
                <button
                  type="button"
                  onClick={() => openActionModal(staff, eduName)}
                  className="inline-flex flex-col items-center gap-0.5 focus:outline-none focus:ring-1 focus:ring-[var(--accent)] rounded-md"
                  aria-label={`${staff.name} ${eduName} ${labelText}${state.daysLabel ? ` (${state.daysLabel})` : ''}`}
                >
                  <span
                    className={`px-2 py-1 text-[11px] font-semibold border rounded-md whitespace-nowrap ${
                      state.kind === 'urgent'
                        ? 'bg-orange-500/10 text-orange-600 border-orange-100 animate-pulse'
                        : 'bg-red-500/10 text-red-600 border-red-100 hover:bg-red-500/20'
                    }`}
                  >
                    {labelText}
                  </span>
                  {state.daysLabel && (
                    <span className="text-[8px] font-bold text-orange-400">{state.daysLabel}</span>
                  )}
                </button>
              );
            }

            // completed
            return (
              <button
                type="button"
                onClick={() => openActionModal(staff, eduName)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold border rounded-md bg-green-500/10 text-green-600 border-green-100 hover:scale-105 active:scale-95 transition-all whitespace-nowrap focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                aria-label={`${staff.name} ${eduName} 이수완료${state.hasCertificate ? ' · 이수증 첨부됨' : ''}`}
              >
                이수완료
                {state.hasCertificate && <span title="이수증 원본 존재">첨부</span>}
              </button>
            );
          }}
          cellTone={(staff, col): MatrixCellTone => {
            const state = getCellState(staff, col.data);
            if (state.kind === 'completed') return 'ok';
            if (state.kind === 'urgent') return 'warn';
            if (state.kind === 'pending') return 'danger';
            return 'normal';
          }}
          rowSummary={(staff) => {
            const { completedCount, total } = computeRowSummary(staff);
            const allDone = total > 0 && completedCount === total;
            return (
              <span className={allDone ? 'text-emerald-600' : 'text-[var(--toss-gray-4)]'}>
                {completedCount}/{total}
              </span>
            );
          }}
          rowSummaryLabel="이수"
          minWidth={1000}
          ariaLabel="직원별 교육 이수 매트릭스"
          emptyMessage="확인할 직원 교육 데이터가 없습니다."
        />
      </div>

      {selectedAction && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md bg-[var(--card)] rounded-[var(--radius-lg)] shadow-sm overflow-hidden border border-[var(--border)] animate-in fade-in slide-in-from-bottom-4">
            <div className="p-4 border-b border-[var(--border)]">
              <h3 className="text-lg font-bold text-[var(--foreground)] tracking-tight">교육 이수 관리</h3>
              <p className="text-xs text-[var(--toss-gray-3)] font-semibold mt-1 uppercase tracking-widest">
                {selectedAction.staffName} · {selectedAction.eduName}
              </p>
            </div>
            <div className="p-4 space-y-5">
              {!selectedAction.isCompleted ? (
                <>
                  <div className="bg-[var(--muted)] rounded-[var(--radius-md)] p-4 text-center">
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
                      className="w-full text-sm font-bold text-[var(--toss-gray-4)] file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-[var(--toss-blue-light)] file:text-[var(--accent)]"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="bg-[var(--toss-blue-light)]/50 border border-[var(--accent)]/20 rounded-[var(--radius-md)] p-4 text-center">
                    <p className="text-sm font-bold text-[var(--accent)]">현재 이수 완료 상태입니다.</p>
                  </div>
                  {selectedAction.certificateUrl && (
                    <div className="mt-4">
                      <a
                        href={selectedAction.certificateUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 w-full py-3 bg-[var(--page-bg)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-bold text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
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
            <div className="p-4 bg-[var(--page-bg)] border-t border-[var(--border)] flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setSelectedAction(null)}
                className="px-4 py-2 rounded-[var(--radius-md)] border border-[var(--border)] text-xs font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)]"
              >
                닫기
              </button>
              <button
                type="button"
                onClick={handleUpdateStatus}
                disabled={uploading}
                className={`px-4 py-2 rounded-[var(--radius-md)] text-xs font-bold text-white transition-opacity disabled:opacity-50 ${
                  !selectedAction.isCompleted ? 'bg-[var(--accent)]' : 'bg-red-600'
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
