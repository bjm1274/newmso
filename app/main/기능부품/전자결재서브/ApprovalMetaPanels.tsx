'use client';

import { useMemo, useState, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
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
import { supabase } from '@/lib/supabase';

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
  return parsed.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
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
                (attachment) => {
                  const href = buildStorageDownloadUrl(attachment.url, attachment.name);
                  return `
                  <tr>
                    <td>
                      <a href="${escapeHtml(href)}" download="${escapeHtml(attachment.name)}" target="_blank" style="color: var(--accent, #2563eb); text-decoration: underline; font-weight: bold;">
                        ${escapeHtml(attachment.name)}
                      </a>
                    </td>
                    <td>${escapeHtml(formatApprovalAttachmentSize(attachment.size) || '-')}</td>
                  </tr>`;
                }
              )
              .join('')}
          </tbody>
        </table>
      </div>
    `;
}

type SupplyRequestRow = SupplyRequestItem & {
  _rowKey: string;
  _isUnregistered: boolean;
};

export function SupplyRequestItemsPanel({ metaData }: { metaData: ApprovalMetaData }) {
  const items = getSupplyRequestItems(metaData);
  const unregisteredNames = getSupplyRequestUnregisteredNames(metaData);
  const unregisteredNameSet = useMemo(
    () => buildUnregisteredNameSet(metaData),
    [metaData],
  );

  const rows = useMemo<SupplyRequestRow[]>(
    () =>
      items.map((row, index) => ({
        ...row,
        _rowKey: `${row.name}-${row.qty}-${row.unit}-${index}`,
        _isUnregistered: unregisteredNameSet.has(normalizeInventoryText(row.name)),
      })),
    [items, unregisteredNameSet],
  );

  const columns = useMemo<Column<SupplyRequestRow>[]>(
    () => [
      {
        key: 'name',
        label: '품목명',
        primary: true,
        render: (row) => (
          <>
            <span className="inline-flex items-center gap-1 font-semibold text-[var(--foreground)]">
              {row._isUnregistered ? (
                <span className="font-black text-[var(--danger)]">!</span>
              ) : null}
              {row.name || '-'}
            </span>
            {row._isUnregistered ? (
              <span className="mt-1 block text-[10px] font-bold text-[var(--danger)]">
                주의: 미등록 품목
              </span>
            ) : null}
          </>
        ),
      },
      {
        key: 'qty',
        label: '수량',
        render: (row) => (
          <span className="font-bold text-[var(--accent)]">{`${row.qty} ${row.unit}`}</span>
        ),
      },
      {
        key: 'category',
        label: '품목구분',
        render: (row) => row.category || '-',
      },
      {
        key: 'purpose',
        label: '용도',
        render: (row) => row.purpose || '-',
      },
    ],
    [],
  );

  if (items.length === 0) return null;

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
      <ResponsiveTable<SupplyRequestRow>
        columns={columns}
        rows={rows}
        keyField="_rowKey"
        emptyMessage="물품 신청 내역이 없습니다."
      />
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

export function renderRosterInfoHtml(metaData: ApprovalMetaData) {
  if (!metaData || (metaData.form_name !== '근무표' && metaData.form_slug !== 'roster' && metaData.roster_request_type !== 'monthly_schedule')) {
    return '';
  }
  const yearMonth = String(metaData.year_month || '').trim();
  const assignments = Array.isArray(metaData.assignments) ? metaData.assignments : [];
  if (!yearMonth || assignments.length === 0) return '';

  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return '';
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // 직원별 일자 배정 맵 구축
  const staffRowMap = new Map<string, { staffName: string; cells: Record<number, string> }>();
  assignments.forEach((a: any) => {
    const staffId = String(a.staff_id || '').trim();
    const staffName = String(a.staff_name || '').trim() || staffId;
    const dateStr = String(a.work_date || '').trim();
    const day = Number(dateStr.slice(8, 10));
    const shiftName = String(a.shift_name || '').trim();

    if (!staffId || !day) return;
    if (!staffRowMap.has(staffId)) {
      staffRowMap.set(staffId, { staffName, cells: {} });
    }
    staffRowMap.get(staffId)!.cells[day] = shiftName;
  });

  const staffRows = Array.from(staffRowMap.values());
  if (staffRows.length === 0) return '';

  const resolveBand = (shift: string) => {
    const s = String(shift || '').toLowerCase();
    if (s.includes('데이') || s.includes('day') || s.includes('d/') || s === 'd' || s === 'd · 데이' || s.includes('조기') || s.includes('오전') || s.includes('조식') || s.includes('중식') || s.includes('상근')) return 'day';
    if (s.includes('이브') || s.includes('eve') || s.includes('e/') || s === 'e' || s === 'e · 이브닝' || s.includes('석식') || s.includes('오후')) return 'evening';
    if (s.includes('나이') || s.includes('night') || s.includes('n/') || s === 'n' || s === 'n · 나이트' || s.includes('야간') || s.includes('심야')) return 'night';
    if (s.includes('오프') || s.includes('off') || s.includes('휴무') || s.includes('비번') || s === 'o' || s === 'off · 휴무') return 'off';
    return 'day';
  };

  const getStyleForBand = (band: string) => {
    switch (band) {
      case 'day': return 'background:#ecfdf5;color:#047857;border-color:#a7f3d0;';
      case 'evening': return 'background:#fff7ed;color:#c2410c;border-color:#fed7aa;';
      case 'night': return 'background:#eef2ff;color:#4338ca;border-color:#c7d2fe;';
      case 'off': default: return 'background:#f8fafc;color:#64748b;border-color:#e2e8f0;';
    }
  };

  const headers = daysArray.map(d => {
    const dow = new Date(year, month - 1, d).getDay();
    const isWeekend = dow === 0 || dow === 6;
    const weekendColor = dow === 0 ? 'color:#ef4444' : dow === 6 ? 'color:#3b82f6' : '';
    return `<th style="text-align:center;padding:4px 2px;font-size:9px;min-width:22px;border:1px solid #cbd5e1;${weekendColor}">
      <div>${d}</div>
      <div style="font-size:8px;font-weight:normal;opacity:0.8">${['일','월','화','수','목','금','토'][dow]}</div>
    </th>`;
  }).join('');

  const resolvedBands = new Set<string>();
  const bodyRows = staffRows.map(row => {
    const cellsHtml = daysArray.map(d => {
      const shift = row.cells[d] || '휴무';
      const band = resolveBand(shift);
      resolvedBands.add(band);
      const style = getStyleForBand(band);
      const shortLabel = band === 'day' ? 'D' : band === 'evening' ? 'E' : band === 'night' ? 'N' : 'OFF';
      return `<td style="text-align:center;padding:4px 2px;font-size:9px;border:1px solid #cbd5e1;font-weight:bold;${style}" title="${escapeHtml(shift)}">
        ${shortLabel}
      </td>`;
    }).join('');

    return `<tr>
      <td style="padding:6px 8px;font-size:11px;font-weight:bold;border:1px solid #cbd5e1;background:#f8fafc;white-space:nowrap;">${escapeHtml(row.staffName)}</td>
      ${cellsHtml}
    </tr>`;
  }).join('');

  const legendHtml = [
    resolvedBands.has('day') ? `<span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#ecfdf5;border:1px solid #a7f3d0;"></span> D · 데이</span>` : '',
    resolvedBands.has('evening') ? `<span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#fff7ed;border:1px solid #fed7aa;"></span> E · 이브닝</span>` : '',
    resolvedBands.has('night') ? `<span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#eef2ff;border:1px solid #c7d2fe;"></span> N · 나이트</span>` : '',
    resolvedBands.has('off') ? `<span style="display:flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:#f8fafc;border:1px solid #e2e8f0;"></span> OFF · 휴무</span>` : '',
  ].filter(Boolean).join('\n');

  return `
    <div class="section" style="margin-top:16px;">
      <div class="section-title" style="font-size:14px;font-weight:bold;margin-bottom:8px;color:#111827;">근무표 배정 상세 (${yearMonth})</div>
      <div style="overflow-x:auto;border:1px solid #cbd5e1;border-radius:8px;background:#fff;margin-bottom:12px;">
        <table style="width:100%;border-collapse:collapse;font-size:10px;">
          <thead>
            <tr style="background:#f1f5f9;">
              <th style="text-align:left;padding:6px 8px;font-size:10px;border:1px solid #cbd5e1;white-space:nowrap;">직원명</th>
              ${headers}
            </tr>
          </thead>
          <tbody>
            ${bodyRows}
          </tbody>
        </table>
      </div>
      <div style="display:flex;gap:12px;font-size:10px;color:#64748b;font-weight:600;margin-top:4px;">
        ${legendHtml}
      </div>
    </div>
  `;
}

export function RosterRequestInfoPanel({ metaData }: { metaData: ApprovalMetaData }) {
  if (!metaData || (metaData.form_name !== '근무표' && metaData.form_slug !== 'roster' && metaData.roster_request_type !== 'monthly_schedule')) {
    return null;
  }
  const yearMonth = String(metaData.year_month || '').trim();
  const assignments = Array.isArray(metaData.assignments) ? metaData.assignments : [];

  const [loadedStaff, setLoadedStaff] = useState<Record<string, string>>({});
  const [loadedShifts, setLoadedShifts] = useState<Record<string, string>>({});

  useEffect(() => {
    const needsStaffLoad = assignments.some((a: any) => !a.staff_name);
    const needsShiftLoad = assignments.some((a: any) => !a.shift_name);

    if (!needsStaffLoad && !needsShiftLoad) return;

    let active = true;
    const fetchLookups = async () => {
      try {
        const [staffRes, shiftRes] = await Promise.all([
          needsStaffLoad ? supabase.from('staff_members').select('id, name') : Promise.resolve({ data: [] }),
          needsShiftLoad ? supabase.from('work_shifts').select('id, name') : Promise.resolve({ data: [] }),
        ]);

        if (!active) return;

        if (staffRes.data) {
          const staffMapObj: Record<string, string> = {};
          staffRes.data.forEach((s: any) => {
            staffMapObj[s.id] = s.name;
          });
          setLoadedStaff(staffMapObj);
        }

        if (shiftRes.data) {
          const shiftMapObj: Record<string, string> = {};
          shiftRes.data.forEach((s: any) => {
            shiftMapObj[s.id] = s.name;
          });
          setLoadedShifts(shiftMapObj);
        }
      } catch (err) {
        console.error('Failed to load lookups for roster approval panel:', err);
      }
    };

    void fetchLookups();
    return () => {
      active = false;
    };
  }, [assignments]);

  if (!yearMonth || assignments.length === 0) return null;

  const [year, month] = yearMonth.split('-').map(Number);
  if (!year || !month) return null;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // 직원별 일자 배정 맵 구축
  const staffRowMap = new Map<string, { staffName: string; cells: Record<number, string> }>();
  assignments.forEach((a: any) => {
    const staffId = String(a.staff_id || '').trim();
    const staffName = String(a.staff_name || loadedStaff[staffId] || '').trim() || staffId;
    const dateStr = String(a.work_date || '').trim();
    const day = Number(dateStr.slice(8, 10));
    const shiftName = String(a.shift_name || loadedShifts[a.shift_id] || '').trim();

    if (!staffId || !day) return;
    if (!staffRowMap.has(staffId)) {
      staffRowMap.set(staffId, { staffName, cells: {} });
    }
    staffRowMap.get(staffId)!.cells[day] = shiftName;
  });

  const staffRows = Array.from(staffRowMap.values());
  if (staffRows.length === 0) return null;

  const resolveBand = (shift: string) => {
    const s = String(shift || '').toLowerCase();
    if (s.includes('데이') || s.includes('day') || s.includes('d/') || s === 'd' || s === 'd · 데이' || s.includes('조기') || s.includes('오전') || s.includes('조식') || s.includes('중식') || s.includes('상근')) return 'day';
    if (s.includes('이브') || s.includes('eve') || s.includes('e/') || s === 'e' || s === 'e · 이브닝' || s.includes('석식') || s.includes('오후')) return 'evening';
    if (s.includes('나이') || s.includes('night') || s.includes('n/') || s === 'n' || s === 'n · 나이트' || s.includes('야간') || s.includes('심야')) return 'night';
    if (s.includes('오프') || s.includes('off') || s.includes('휴무') || s.includes('비번') || s === 'o' || s === 'off · 휴무') return 'off';
    return 'day';
  };

  const resolvedBands = new Set<string>();
  staffRows.forEach((row: { staffName: string; cells: Record<number, string> }) => {
    daysArray.forEach((d: number) => {
      const shift = row.cells[d] || '휴무';
      resolvedBands.add(resolveBand(shift));
    });
  });

  const getStyleForBand = (band: string) => {
    switch (band) {
      case 'day': return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-400';
      case 'evening': return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/20 dark:text-amber-400';
      case 'night': return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/20 dark:text-indigo-400';
      case 'off': default: return 'bg-slate-50 text-slate-500 border-slate-200 dark:bg-slate-900/20 dark:text-slate-400';
    }
  };

  return (
    <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm overflow-hidden">
      <div className="border-b border-[var(--border)] pb-3 mb-3">
        <h4 className="text-sm font-bold text-[var(--foreground)]">근무표 배정 상세 ({yearMonth})</h4>
      </div>
      <div className="overflow-x-auto border border-[var(--border)] rounded-xl custom-scrollbar">
        <table className="w-full border-collapse text-left text-[11px]">
          <thead>
            <tr className="bg-[var(--tab-bg)] border-b border-[var(--border)] text-[var(--toss-gray-4)] font-bold">
              <th className="px-3 py-2 border-r border-[var(--border)] whitespace-nowrap sticky left-0 bg-[var(--tab-bg)] z-10">직원명</th>
              {daysArray.map(d => {
                const dow = new Date(year, month - 1, d).getDay();
                const isWeekend = dow === 0 || dow === 6;
                const colorCls = dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : '';
                return (
                  <th key={d} className={`px-1 py-1.5 text-center border-r border-[var(--border)] min-w-[28px] ${colorCls}`}>
                    <div>{d}</div>
                    <div className="text-[8px] font-medium opacity-60">{['일','월','화','수','목','금','토'][dow]}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {staffRows.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50/50">
                <td className="px-3 py-2 border-r border-[var(--border)] font-bold text-[var(--foreground)] whitespace-nowrap sticky left-0 bg-[var(--card)] z-10">{row.staffName}</td>
                {daysArray.map(d => {
                  const shift = row.cells[d] || '휴무';
                  const band = resolveBand(shift);
                  const styleCls = getStyleForBand(band);
                  const shortLabel = band === 'day' ? 'D' : band === 'evening' ? 'E' : band === 'night' ? 'N' : 'OFF';
                  return (
                    <td key={d} className={`px-1 py-2 text-center border-r border-[var(--border)] font-bold text-[10px] border-l-0 border-t-0 border-b-0 ${styleCls}`} title={shift}>
                      {shortLabel}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-4 mt-3 text-[11px] font-semibold text-[var(--toss-gray-4)]">
        {resolvedBands.has('day') && (
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500 border border-emerald-300"></span> D · 데이</span>
        )}
        {resolvedBands.has('evening') && (
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-400 border border-amber-300"></span> E · 이브닝</span>
        )}
        {resolvedBands.has('night') && (
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-indigo-600 border border-indigo-400"></span> N · 나이트</span>
        )}
        {resolvedBands.has('off') && (
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-slate-100 border border-slate-300"></span> OFF · 휴무</span>
        )}
      </div>
    </div>
  );
}
