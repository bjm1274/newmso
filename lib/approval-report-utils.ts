export type ApprovalAttachmentMeta = {
  name: string;
  url: string;
  mimeType?: string | null;
  size?: number | null;
  provider?: string | null;
  bucket?: string | null;
  path?: string | null;
  uploadedAt?: string | null;
};

export const REPORT_TYPE_OPTIONS = [
  { value: 'incident', label: '사건보고서' },
  { value: 'month_end', label: '월말보고서' },
  { value: 'business_trip', label: '출장보고서' },
  { value: 'daily', label: '일일보고서' },
  { value: 'weekly', label: '주간보고서' },
  { value: 'other', label: '기타보고서' },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? ({ ...(value as Record<string, unknown>) }) : {};
}

function cleanString(value: unknown) {
  return String(value ?? '').trim();
}

function formatDateLabel(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('ko-KR');
}

function formatMonthLabel(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return '';
  const [year, month] = raw.split('-');
  if (!year || !month) return raw;
  const numericMonth = Number(month);
  if (!Number.isFinite(numericMonth)) return raw;
  return `${year}년 ${numericMonth}월`;
}

function buildDateRangeLabel(startValue: unknown, endValue: unknown) {
  const startLabel = formatDateLabel(startValue);
  const endLabel = formatDateLabel(endValue);
  if (startLabel && endLabel) {
    return startLabel === endLabel ? startLabel : `${startLabel} ~ ${endLabel}`;
  }
  return startLabel || endLabel;
}

export function getReportTypeLabel(value: unknown) {
  const raw = cleanString(value);
  if (!raw) return '';
  const matched = REPORT_TYPE_OPTIONS.find((option) => option.value === raw || option.label === raw);
  return matched?.label || raw;
}

export function normalizeApprovalAttachments(value: unknown): ApprovalAttachmentMeta[] {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const record = entry as Record<string, unknown>;
      const name = cleanString(record.name || record.fileName);
      const url = cleanString(record.url || record.fileUrl);
      if (!name || !url) return null;

      const size = Number(record.size);
      return {
        name,
        url,
        mimeType: cleanString(record.mimeType) || null,
        size: Number.isFinite(size) && size >= 0 ? size : null,
        provider: cleanString(record.provider) || null,
        bucket: cleanString(record.bucket) || null,
        path: cleanString(record.path) || null,
        uploadedAt: cleanString(record.uploadedAt || record.uploaded_at) || null,
      } satisfies ApprovalAttachmentMeta;
    })
    .filter(Boolean) as ApprovalAttachmentMeta[];

  return Array.from(new Map(normalized.map((item) => [`${item.url}::${item.name}`, item])).values());
}

export function formatApprovalAttachmentSize(size: number | null | undefined) {
  const numeric = Number(size);
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  if (numeric < 1024) return `${numeric}B`;
  if (numeric < 1024 * 1024) return `${(numeric / 1024).toFixed(1)}KB`;
  if (numeric < 1024 * 1024 * 1024) return `${(numeric / (1024 * 1024)).toFixed(1)}MB`;
  return `${(numeric / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

export function getReportApprovalSummary(metaData: unknown) {
  const meta = asRecord(metaData);
  const attachments = normalizeApprovalAttachments(meta.attachments);

  return {
    reportTypeValue: cleanString(meta.report_type || meta.reportType),
    reportTypeLabel: getReportTypeLabel(meta.report_type_label || meta.report_type || meta.reportType),
    reportMonthLabel: formatMonthLabel(meta.report_month || meta.reportMonth),
    reportTargetDateLabel: formatDateLabel(meta.report_target_date || meta.reportTargetDate),
    reportPeriodLabel: buildDateRangeLabel(meta.report_period_start || meta.reportPeriodStart, meta.report_period_end || meta.reportPeriodEnd),
    relatedDepartment: cleanString(meta.report_department || meta.related_department || meta.department),
    reportSubject: cleanString(meta.report_subject || meta.subject),
    incidentDateLabel: formatDateLabel(meta.incident_date || meta.incidentDate),
    incidentLocation: cleanString(meta.incident_location || meta.incidentLocation),
    tripDateLabel: buildDateRangeLabel(meta.trip_start_date || meta.tripStartDate, meta.trip_end_date || meta.tripEndDate),
    tripDestination: cleanString(meta.trip_destination || meta.tripDestination),
    tripPurpose: cleanString(meta.trip_purpose || meta.tripPurpose),
    attachments,
  };
}

export function buildReportApprovalTitle(metaData: unknown) {
  const summary = getReportApprovalSummary(metaData);
  const base = summary.reportTypeLabel || '보고서';
  const suffix =
    summary.reportMonthLabel ||
    summary.tripDestination ||
    summary.incidentDateLabel ||
    summary.reportPeriodLabel ||
    summary.reportTargetDateLabel ||
    summary.reportSubject;

  return suffix ? `${base} - ${suffix}` : base;
}

export function getReportApprovalValidationMessage(metaData: unknown) {
  const meta = asRecord(metaData);
  const reportType = cleanString(meta.report_type || meta.reportType);
  if (!reportType) {
    return '보고서 종류를 선택해주세요.';
  }

  if (reportType === 'incident' && !cleanString(meta.incident_date || meta.incidentDate)) {
    return '사건 발생일을 입력해주세요.';
  }

  if (reportType === 'month_end' && !cleanString(meta.report_month || meta.reportMonth)) {
    return '월말보고서 대상 월을 선택해주세요.';
  }

  if (reportType === 'business_trip') {
    if (!cleanString(meta.trip_start_date || meta.tripStartDate) || !cleanString(meta.trip_end_date || meta.tripEndDate)) {
      return '출장 기간을 입력해주세요.';
    }
    if (!cleanString(meta.trip_destination || meta.tripDestination)) {
      return '출장지를 입력해주세요.';
    }
  }

  if (reportType === 'daily' && !cleanString(meta.report_target_date || meta.reportTargetDate)) {
    return '일일보고서 기준 일자를 입력해주세요.';
  }

  if (reportType === 'weekly') {
    if (!cleanString(meta.report_period_start || meta.reportPeriodStart) || !cleanString(meta.report_period_end || meta.reportPeriodEnd)) {
      return '주간보고서 기간을 입력해주세요.';
    }
  }

  return null;
}
