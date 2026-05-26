export function getPayrollGrossPay(record: Record<string, any> | null | undefined): number {
  const gross = Number(record?.gross_pay ?? 0);
  if (Number.isFinite(gross) && gross > 0) return gross;

  const taxable = Number(record?.total_taxable ?? 0);
  const taxfree = Number(record?.total_taxfree ?? 0);
  return taxable + taxfree;
}

type PayrollRecordLike = {
  record_type?: unknown;
} | null | undefined;

export function isInterimPayrollRecord(record: PayrollRecordLike): boolean {
  const recordType = String(record?.record_type ?? '').trim().toLowerCase();
  return recordType === 'interim';
}

export function filterNonInterimPayrollRecords<T extends { record_type?: unknown }>(
  records: T[] | null | undefined,
): T[] {
  return (records ?? []).filter((record) => !isInterimPayrollRecord(record));
}

/**
 * 급여명세 알림 제목/본문에서 연-월(YYYY-MM)을 추출한다.
 * "2026-05" 또는 "2026년 5월" 두 표기를 모두 인식한다.
 */
export function extractPayrollYearMonth(value: unknown): string | null {
  const text = String(value ?? '');
  const dashMatch = text.match(/(20\d{2})-(\d{1,2})/);
  if (dashMatch) {
    return `${dashMatch[1]}-${String(Number(dashMatch[2])).padStart(2, '0')}`;
  }
  const koreanMatch = text.match(/(20\d{2})년\s*(\d{1,2})월/);
  if (koreanMatch) {
    return `${koreanMatch[1]}-${String(Number(koreanMatch[2])).padStart(2, '0')}`;
  }
  return null;
}

type IssuedPayrollRecordLike = {
  record_type?: unknown;
  status?: unknown;
  year_month?: unknown;
};

type PayrollNotificationLike = { title?: unknown; body?: unknown };

/**
 * 직원 마이페이지에 노출할 "발송된" 급여명세서 레코드를 추린다.
 * 배지 카운트와 명세서 뷰어가 동일 기준을 쓰도록 판단 로직을 한 곳에 둔다.
 * - 중간정산(interim) 레코드 제외
 * - 상태가 '확정'(또는 미기재)인 레코드만 후보
 * - '급여명세' 알림이 하나라도 있으면 알림에 적힌 월만 노출, 없으면 후보 전체 폴백
 */
export function resolveIssuedPayrollRecords<T extends IssuedPayrollRecordLike>(
  records: T[] | null | undefined,
  payrollNotifications: PayrollNotificationLike[] | null | undefined,
): T[] {
  const issuedCandidates = filterNonInterimPayrollRecords(records).filter((record) => {
    const status = String(record.status ?? '').trim();
    return status === '확정' || status === '';
  });

  const sentMonths = new Set(
    (payrollNotifications ?? [])
      .map((row) => extractPayrollYearMonth(`${row.title ?? ''} ${row.body ?? ''}`))
      .filter((value): value is string => Boolean(value)),
  );

  if (sentMonths.size === 0) return issuedCandidates;
  return issuedCandidates.filter((record) => sentMonths.has(String(record.year_month ?? '')));
}

export function formatPayrollMutationError(error: unknown): string {
  if (!error) return '알 수 없는 오류';

  if (typeof error === 'string') return error;

  if (error instanceof Error) {
    return error.message || error.name || '오류';
  }

  if (typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    const parts = [
      candidate.message,
      candidate.code,
      candidate.details,
      candidate.hint,
      candidate.error_description,
      candidate.msg,
    ]
      .map((value) => String(value ?? '').trim())
      .filter(Boolean);

    if (parts.length > 0) {
      return parts.join(' / ');
    }
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
