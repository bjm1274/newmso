'use client';

import type { MouseEvent as ReactMouseEvent } from 'react';
import { buildStorageDownloadUrl } from '@/lib/object-storage-url';
import {
  formatApprovalAttachmentSize,
  getReportApprovalSummary,
  normalizeApprovalAttachments,
} from '@/lib/approval-report-utils';
import { extractLeaveRequestMeta } from '@/lib/leave-notice';
import { normalizeInventoryText, normalizeSupplyRequestItems } from '@/app/main/inventory-utils';
import { handleManagedDownloadClick } from '../공통/managed-download';
import { escapeHtml } from '../전자결재-utils';

export type ApprovalMetaData = Record<string, unknown> | null | undefined;

export type SupplyRequestItem = {
  name: string;
  qty: number;
  unit: string;
  category: string;
  dept: string;
  purpose: string;
};

export function getSupplyRequestItems(metaData: ApprovalMetaData) {
  if (!Array.isArray(metaData?.items)) {
    return [] as SupplyRequestItem[];
  }

  return normalizeSupplyRequestItems(metaData.items);
}

export function getSupplyRequestUnregisteredNames(metaData: ApprovalMetaData) {
  const fromMeta = Array.isArray(metaData?.unregistered_item_names)
    ? metaData.unregistered_item_names
    : [];
  const fromItems = Array.isArray(metaData?.items)
    ? metaData.items
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const row = item as Record<string, unknown>;
          if (row.inventory_registered !== false && row.unregistered_inventory_item !== true) {
            return null;
          }
          return String(row.name || row.item_name || '').trim();
        })
        .filter(Boolean)
    : [];

  const seen = new Set<string>();
  return [...fromMeta, ...fromItems]
    .map((name) => String(name || '').trim())
    .filter((name) => {
      const key = normalizeInventoryText(name);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function buildUnregisteredNameSet(metaData: ApprovalMetaData) {
  return new Set(getSupplyRequestUnregisteredNames(metaData).map((name) => normalizeInventoryText(name)));
}

export function formatLeaveDateLabel(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('ko-KR');
}

export function getLeaveRequestSummary(metaData: ApprovalMetaData) {
  const leaveMeta = extractLeaveRequestMeta(metaData);
  if (!leaveMeta) return null;
  const { startDate, endDate, leaveType, reason, delegateName, delegateDepartment, delegatePosition, delegateLabel } = leaveMeta;
  return {
    startDate,
    endDate,
    leaveType,
    reason,
    delegateName,
    delegateDepartment,
    delegatePosition,
    delegateLabel,
    dateLabel:
      startDate === endDate
        ? formatLeaveDateLabel(startDate)
        : `${formatLeaveDateLabel(startDate)} ~ ${formatLeaveDateLabel(endDate)}`,
  };
}

export function renderSupplyRequestItemsHtml(metaData: ApprovalMetaData) {
  const items = getSupplyRequestItems(metaData);
  if (items.length === 0) return '';
  const unregisteredNames = getSupplyRequestUnregisteredNames(metaData);
  const unregisteredNameSet = buildUnregisteredNameSet(metaData);

  return `
      <div class="section">
        <div class="section-title">물품 신청 목록</div>
        ${
          unregisteredNames.length > 0
            ? `<div class="supply-warning"><strong>주의</strong> 재고관리에 등록되지 않은 품목이 포함되어 있습니다: ${escapeHtml(unregisteredNames.join(', '))}</div>`
            : ''
        }
        <table class="supply-table">
          <thead>
            <tr>
              <th>품목명</th>
              <th>수량</th>
              <th>품목구분</th>
              <th>용도</th>
            </tr>
          </thead>
          <tbody>
            ${items
              .map(
                (row) => {
                  const isUnregistered = unregisteredNameSet.has(normalizeInventoryText(row.name));
                  return `
                  <tr>
                    <td>
                      ${isUnregistered ? '<span class="warning-mark">!</span>' : ''}${escapeHtml(row.name || '-')}
                      ${isUnregistered ? '<div class="warning-note">주의: 재고관리 미등록 품목</div>' : ''}
                    </td>
                    <td>${escapeHtml(`${row.qty} ${row.unit}`)}</td>
                    <td>${escapeHtml(row.category || '-')}</td>
                    <td>${escapeHtml(row.purpose || '-')}</td>
                  </tr>`;
                }
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
}

export function renderLeaveRequestInfoHtml(metaData: ApprovalMetaData) {
  const leaveSummary = getLeaveRequestSummary(metaData);
  if (!leaveSummary) return '';

  return `
      <div class="section">
        <div class="section-title">휴가 정보</div>
        <table class="supply-table">
          <tbody>
            <tr>
              <th>휴가일시</th>
              <td>${escapeHtml(leaveSummary.dateLabel)}</td>
            </tr>
            <tr>
              <th>휴가구분</th>
              <td>${escapeHtml(leaveSummary.leaveType)}</td>
            </tr>
            <tr>
              <th>업무대행</th>
              <td>${escapeHtml(leaveSummary.delegateLabel || '-')}</td>
            </tr>
            <tr>
              <th>사유</th>
              <td>${escapeHtml(leaveSummary.reason || '-')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
}

export function renderReportInfoHtml(metaData: ApprovalMetaData) {
  const summary = getReportApprovalSummary(metaData);
  if (!summary.reportTypeLabel) return '';

  const rows = [
    ['보고서 종류', summary.reportTypeLabel],
    ['관련 부서', summary.relatedDepartment],
    ['보고 주제', summary.reportSubject],
    ['대상 월', summary.reportMonthLabel],
    ['보고 일자', summary.reportTargetDateLabel],
    ['보고 기간', summary.reportPeriodLabel],
    ['사건 발생일', summary.incidentDateLabel],
    ['발생 장소', summary.incidentLocation],
    ['출장 기간', summary.tripDateLabel],
    ['출장지', summary.tripDestination],
    ['출장 목적', summary.tripPurpose],
  ].filter(([, value]) => value);

  if (rows.length === 0) return '';

  return `
      <div class="section">
        <div class="section-title">보고서 정보</div>
        <table class="supply-table">
          <tbody>
            ${rows
              .map(
                ([label, value]) => `
                  <tr>
                    <th>${escapeHtml(label)}</th>
                    <td>${escapeHtml(value)}</td>
                  </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
}

export function renderApprovalAttachmentsHtml(metaData: ApprovalMetaData) {
  const attachments = normalizeApprovalAttachments(metaData?.attachments);
  if (attachments.length === 0) return '';

  return `
      <div class="section">
        <div class="section-title">첨부파일</div>
        <table class="supply-table">
          <thead>
            <tr>
              <th>파일명</th>
              <th>크기</th>
            </tr>
          </thead>
          <tbody>
            ${attachments
              .map(
                (attachment) => `
                  <tr>
                    <td>${escapeHtml(attachment.name)}</td>
                    <td>${escapeHtml(formatApprovalAttachmentSize(attachment.size) || '-')}</td>
                  </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
}

export function SupplyRequestItemsPanel({ metaData }: { metaData: ApprovalMetaData }) {
  const items = getSupplyRequestItems(metaData);
  if (items.length === 0) return null;
  const unregisteredNames = getSupplyRequestUnregisteredNames(metaData);
  const unregisteredNameSet = buildUnregisteredNameSet(metaData);

  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h4 className="text-sm font-bold text-[var(--foreground)]">물품 신청 목록</h4>
      </div>
      {unregisteredNames.length > 0 ? (
        <div className="border-b border-[var(--danger)]/20 bg-[var(--danger-light)] px-4 py-3 text-xs font-bold leading-relaxed text-[var(--danger)]">
          주의: 재고관리에 등록되지 않은 품목이 포함되어 있습니다. ({unregisteredNames.join(', ')})
        </div>
      ) : null}
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left font-bold text-[var(--toss-gray-4)]">품목명</th>
              <th className="px-3 py-2 text-left font-bold text-[var(--toss-gray-4)]">수량</th>
              <th className="px-3 py-2 text-left font-bold text-[var(--toss-gray-4)]">품목구분</th>
              <th className="px-3 py-2 text-left font-bold text-[var(--toss-gray-4)]">용도</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row, index) => {
              const isUnregistered = unregisteredNameSet.has(normalizeInventoryText(row.name));
              return (
                <tr
                  key={`${row.name}-${row.qty}-${row.unit}-${index}`}
                  className={`border-t border-[var(--border)] ${isUnregistered ? 'bg-[var(--danger-light)]/35' : ''}`}
                >
                  <td className="px-3 py-2 font-semibold text-[var(--foreground)]">
                    <span className="inline-flex items-center gap-1">
                      {isUnregistered ? <span className="font-black text-[var(--danger)]">!</span> : null}
                      {row.name || '-'}
                    </span>
                    {isUnregistered ? (
                      <span className="mt-1 block text-[10px] font-bold text-[var(--danger)]">주의: 미등록 품목</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 font-bold text-[var(--accent)]">{`${row.qty} ${row.unit}`}</td>
                  <td className="px-3 py-2 text-[var(--toss-gray-4)]">{row.category || '-'}</td>
                  <td className="px-3 py-2 text-[var(--toss-gray-4)]">{row.purpose || '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function LeaveRequestInfoPanel({ metaData }: { metaData: ApprovalMetaData }) {
  const leaveSummary = getLeaveRequestSummary(metaData);
  if (!leaveSummary) return null;

  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h4 className="text-sm font-bold text-[var(--foreground)]">휴가 정보</h4>
      </div>
      <div className="grid gap-0 divide-y divide-[var(--border)] text-xs">
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-3">
          <span className="font-bold text-[var(--toss-gray-4)]">휴가일시</span>
          <span className="font-semibold text-[var(--foreground)]">{leaveSummary.dateLabel}</span>
        </div>
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-3">
          <span className="font-bold text-[var(--toss-gray-4)]">휴가구분</span>
          <span className="font-semibold text-[var(--foreground)]">{leaveSummary.leaveType}</span>
        </div>
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-3">
          <span className="font-bold text-[var(--toss-gray-4)]">업무대행</span>
          <span className="text-[var(--toss-gray-4)]">{leaveSummary.delegateLabel || '-'}</span>
        </div>
        <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-3">
          <span className="font-bold text-[var(--toss-gray-4)]">사유</span>
          <span className="text-[var(--toss-gray-4)]">{leaveSummary.reason || '-'}</span>
        </div>
      </div>
    </div>
  );
}

export function ReportInfoPanel({ metaData }: { metaData: ApprovalMetaData }) {
  const summary = getReportApprovalSummary(metaData);
  if (!summary.reportTypeLabel) return null;

  const rows = [
    { label: '보고서 종류', value: summary.reportTypeLabel },
    { label: '관련 부서', value: summary.relatedDepartment },
    { label: '보고 주제', value: summary.reportSubject },
    { label: '대상 월', value: summary.reportMonthLabel },
    { label: '보고 일자', value: summary.reportTargetDateLabel },
    { label: '보고 기간', value: summary.reportPeriodLabel },
    { label: '사건 발생일', value: summary.incidentDateLabel },
    { label: '발생 장소', value: summary.incidentLocation },
    { label: '출장 기간', value: summary.tripDateLabel },
    { label: '출장지', value: summary.tripDestination },
    { label: '출장 목적', value: summary.tripPurpose },
  ].filter((row) => row.value);

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h4 className="text-sm font-bold text-[var(--foreground)]">보고서 정보</h4>
      </div>
      <div className="grid gap-0 divide-y divide-[var(--border)] text-xs">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 px-4 py-3">
            <span className="font-bold text-[var(--toss-gray-4)]">{row.label}</span>
            <span className="text-[var(--foreground)]">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ApprovalAttachmentsPanel({ metaData }: { metaData: ApprovalMetaData }) {
  const attachments = normalizeApprovalAttachments(metaData?.attachments);
  if (attachments.length === 0) return null;

  const handleAttachmentDownloadClick = async (
    event: ReactMouseEvent<HTMLAnchorElement>,
    url: string,
    fileName: string,
  ) => {
    await handleManagedDownloadClick(event, url, fileName, {
      logLabel: 'approval attachment download',
    });
  };

  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h4 className="text-sm font-bold text-[var(--foreground)]">첨부파일</h4>
      </div>
      <div className="space-y-2 p-4">
        {attachments.map((attachment, index) => {
          const href = buildStorageDownloadUrl(attachment.url, attachment.name);

          return (
            <a
              key={`${attachment.url}-${attachment.name}-${index}`}
              href={href}
              onClick={(event) => void handleAttachmentDownloadClick(event, attachment.url, attachment.name)}
              download={attachment.name}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/60 px-3 py-2 transition-all hover:border-[var(--accent)]/30 hover:bg-[var(--muted)]"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[var(--foreground)]">{attachment.name}</p>
                <p className="mt-0.5 text-[11px] font-semibold text-[var(--toss-gray-4)]">
                  {formatApprovalAttachmentSize(attachment.size) || '다운로드'}
                </p>
              </div>
              <span className="shrink-0 text-[11px] font-bold text-[var(--accent)]">다운로드</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
