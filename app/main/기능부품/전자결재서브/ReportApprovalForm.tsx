'use client';

import type { ChangeEvent, Dispatch, SetStateAction } from 'react';
import { useMemo, useRef, useState } from 'react';
import SmartDatePicker from '../공통/SmartDatePicker';
import SmartMonthPicker from '../공통/SmartMonthPicker';
import { toast } from '@/lib/toast';
import {
  buildReportApprovalTitle,
  formatApprovalAttachmentSize,
  getReportTypeLabel,
  normalizeApprovalAttachments,
  REPORT_TYPE_OPTIONS,
} from '@/lib/approval-report-utils';

type ReportApprovalFormProps = {
  extraData: Record<string, unknown>;
  setExtraData: Dispatch<SetStateAction<Record<string, unknown>>>;
  formTitle: string;
  setFormTitle: (value: string) => void;
};

type UploadResponse = {
  error?: string;
  provider?: string;
  bucket?: string;
  path?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  url?: string;
};

export default function ReportApprovalForm({
  extraData,
  setExtraData,
  formTitle,
  setFormTitle,
}: ReportApprovalFormProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);

  const reportType = String(extraData.report_type || '').trim();
  const attachments = useMemo(
    () => normalizeApprovalAttachments(extraData.attachments),
    [extraData.attachments],
  );

  const patchExtraData = (patch: Record<string, unknown>) => {
    const nextData = { ...extraData, ...patch };
    setExtraData((prev) => ({ ...prev, ...patch }));
    if (!String(formTitle || '').trim()) {
      setFormTitle(buildReportApprovalTitle(nextData));
    }
  };

  const handleReportTypeChange = (value: string) => {
    patchExtraData({
      report_type: value,
      report_type_label: getReportTypeLabel(value),
    });
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    setUploading(true);
    setUploadingNames(files.map((file) => file.name));

    const uploadedAttachments: Array<{
      name: string;
      url: string;
      mimeType: string;
      size: number;
      provider: string | null;
      bucket: string | null;
      path: string | null;
      uploadedAt: string;
    }> = [];
    const failedFiles: string[] = [];

    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/approvals/upload', {
          method: 'POST',
          body: formData,
        });

        const payload = (await response.json().catch(() => ({}))) as UploadResponse;
        if (!response.ok || !payload.url || !payload.fileName) {
          throw new Error(payload.error || '파일 업로드에 실패했습니다.');
        }

        uploadedAttachments.push({
          name: payload.fileName,
          url: payload.url,
          mimeType: payload.mimeType || file.type || 'application/octet-stream',
          size: file.size,
          provider: payload.provider || null,
          bucket: payload.bucket || null,
          path: payload.path || null,
          uploadedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.error('[Approval Report] Attachment upload failed:', error);
        failedFiles.push(file.name);
      }
    }

    setUploading(false);
    setUploadingNames([]);

    if (uploadedAttachments.length > 0) {
      setExtraData((prev) => ({
        ...prev,
        attachments: [
          ...normalizeApprovalAttachments(prev.attachments),
          ...uploadedAttachments,
        ],
      }));
      toast(`${uploadedAttachments.length}개 파일을 첨부했습니다.`, 'success');
    }

    if (failedFiles.length > 0) {
      toast(`업로드 실패: ${failedFiles.join(', ')}`, 'warning');
    }
  };

  const removeAttachment = (targetIndex: number) => {
    setExtraData((prev) => ({
      ...prev,
      attachments: normalizeApprovalAttachments(prev.attachments).filter((_, index) => index !== targetIndex),
    }));
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm animate-in fade-in duration-300">
      <div className="border-b border-[var(--border)] bg-emerald-50/70 px-4 py-3">
        <h4 className="text-sm font-bold text-emerald-800">보고서 작성</h4>
        <p className="mt-1 text-[11px] font-semibold text-emerald-700/80">
          사건보고서, 월말보고서, 출장보고서 등 다양한 보고서를 첨부파일과 함께 상신할 수 있습니다.
        </p>
      </div>

      <div className="space-y-4 bg-[var(--tab-bg)]/30 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
              보고서 종류
            </label>
            <select
              value={reportType}
              onChange={(event) => handleReportTypeChange(event.target.value)}
              className="w-full rounded-[var(--radius-md)] bg-[var(--card)] p-3 text-xs font-semibold outline-none shadow-sm focus:ring-2 focus:ring-emerald-200"
            >
              <option value="">보고서 종류를 선택하세요</option>
              {REPORT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
              관련 부서
            </label>
            <input
              type="text"
              value={String(extraData.report_department || '').trim()}
              onChange={(event) => patchExtraData({ report_department: event.target.value })}
              placeholder="예: 원무팀, 수술팀, 관리팀"
              className="w-full rounded-[var(--radius-md)] bg-[var(--card)] p-3 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-emerald-200"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
            보고 주제
          </label>
          <input
            type="text"
            value={String(extraData.report_subject || '').trim()}
            onChange={(event) => patchExtraData({ report_subject: event.target.value })}
            placeholder="예: 3월 수술실 운영 결과, 대전 거래처 방문 결과"
            className="w-full rounded-[var(--radius-md)] bg-[var(--card)] p-3 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-emerald-200"
          />
        </div>

        {reportType === 'incident' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
                사건 발생일
              </label>
              <SmartDatePicker
                value={String(extraData.incident_date || '').trim()}
                onChange={(value) => patchExtraData({ incident_date: value })}
                inputClassName="h-11 rounded-[var(--radius-md)] bg-[var(--card)] px-4 text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
                발생 장소
              </label>
              <input
                type="text"
                value={String(extraData.incident_location || '').trim()}
                onChange={(event) => patchExtraData({ incident_location: event.target.value })}
                placeholder="예: 3층 회복실, 외래 접수창구"
                className="w-full rounded-[var(--radius-md)] bg-[var(--card)] p-3 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-emerald-200"
              />
            </div>
          </div>
        )}

        {reportType === 'month_end' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
                대상 월
              </label>
              <SmartMonthPicker
                value={String(extraData.report_month || '').trim()}
                onChange={(value) => patchExtraData({ report_month: value })}
                inputClassName="h-11 rounded-[var(--radius-md)] bg-[var(--card)] px-4 text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
                보고 기준일
              </label>
              <SmartDatePicker
                value={String(extraData.report_target_date || '').trim()}
                onChange={(value) => patchExtraData({ report_target_date: value })}
                inputClassName="h-11 rounded-[var(--radius-md)] bg-[var(--card)] px-4 text-xs font-bold"
              />
            </div>
          </div>
        )}

        {reportType === 'business_trip' && (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
                  출장 시작일
                </label>
                <SmartDatePicker
                  value={String(extraData.trip_start_date || '').trim()}
                  onChange={(value) => patchExtraData({ trip_start_date: value })}
                  inputClassName="h-11 rounded-[var(--radius-md)] bg-[var(--card)] px-4 text-xs font-bold"
                />
              </div>
              <div className="space-y-1.5">
                <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
                  출장 종료일
                </label>
                <SmartDatePicker
                  value={String(extraData.trip_end_date || '').trim()}
                  onChange={(value) => patchExtraData({ trip_end_date: value })}
                  inputClassName="h-11 rounded-[var(--radius-md)] bg-[var(--card)] px-4 text-xs font-bold"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
                  출장지
                </label>
                <input
                  type="text"
                  value={String(extraData.trip_destination || '').trim()}
                  onChange={(event) => patchExtraData({ trip_destination: event.target.value })}
                  placeholder="예: 서울 본사, 부산 거래처"
                  className="w-full rounded-[var(--radius-md)] bg-[var(--card)] p-3 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-emerald-200"
                />
              </div>
              <div className="space-y-1.5">
                <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
                  출장 목적
                </label>
                <input
                  type="text"
                  value={String(extraData.trip_purpose || '').trim()}
                  onChange={(event) => patchExtraData({ trip_purpose: event.target.value })}
                  placeholder="예: 장비 점검 협의, 거래처 미팅"
                  className="w-full rounded-[var(--radius-md)] bg-[var(--card)] p-3 text-xs font-bold outline-none shadow-sm focus:ring-2 focus:ring-emerald-200"
                />
              </div>
            </div>
          </>
        )}

        {reportType === 'daily' && (
          <div className="space-y-1.5">
            <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
              보고 일자
            </label>
            <SmartDatePicker
              value={String(extraData.report_target_date || '').trim()}
              onChange={(value) => patchExtraData({ report_target_date: value })}
              inputClassName="h-11 rounded-[var(--radius-md)] bg-[var(--card)] px-4 text-xs font-bold"
            />
          </div>
        )}

        {['weekly', 'other'].includes(reportType) && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
                보고 시작일
              </label>
              <SmartDatePicker
                value={String(extraData.report_period_start || '').trim()}
                onChange={(value) => patchExtraData({ report_period_start: value })}
                inputClassName="h-11 rounded-[var(--radius-md)] bg-[var(--card)] px-4 text-xs font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <label className="ml-1 text-[11px] font-semibold uppercase text-[var(--toss-gray-4)]">
                보고 종료일
              </label>
              <SmartDatePicker
                value={String(extraData.report_period_end || '').trim()}
                onChange={(value) => patchExtraData({ report_period_end: value })}
                inputClassName="h-11 rounded-[var(--radius-md)] bg-[var(--card)] px-4 text-xs font-bold"
              />
            </div>
          </div>
        )}

        <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h5 className="text-sm font-bold text-[var(--foreground)]">첨부파일</h5>
              <p className="mt-0.5 text-[11px] font-semibold text-[var(--toss-gray-4)]">
                증빙자료, 사진, PDF, 엑셀 등을 함께 올려 승인받을 수 있습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-all hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploading ? '업로드 중...' : '파일 선택'}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />

          {uploadingNames.length > 0 && (
            <div className="rounded-[var(--radius-md)] bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700">
              업로드 중: {uploadingNames.join(', ')}
            </div>
          )}

          {attachments.length === 0 ? (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--muted)]/70 px-3 py-4 text-center text-[11px] font-semibold text-[var(--toss-gray-4)]">
              아직 첨부된 파일이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {attachments.map((attachment, index) => (
                <div
                  key={`${attachment.url}-${attachment.name}-${index}`}
                  className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-[var(--foreground)]">{attachment.name}</p>
                    <p className="mt-0.5 text-[11px] font-semibold text-[var(--toss-gray-4)]">
                      {formatApprovalAttachmentSize(attachment.size) || '크기 정보 없음'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(index)}
                    className="rounded-[var(--radius-md)] px-2 py-1 text-[11px] font-bold text-rose-600 transition-all hover:bg-rose-50"
                  >
                    제거
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
