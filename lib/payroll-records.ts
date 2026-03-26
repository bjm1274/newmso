export function getPayrollGrossPay(record: Record<string, any> | null | undefined): number {
  const gross = Number(record?.gross_pay ?? 0);
  if (Number.isFinite(gross) && gross > 0) return gross;

  const taxable = Number(record?.total_taxable ?? 0);
  const taxfree = Number(record?.total_taxfree ?? 0);
  return taxable + taxfree;
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
