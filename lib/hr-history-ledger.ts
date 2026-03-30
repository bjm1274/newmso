import { supabase } from './supabase';

export type HrLedgerEventType =
  | 'appointment'
  | 'contract'
  | 'salary'
  | 'work_type'
  | 'leave'
  | 'audit';

export type HrLedgerEvent = {
  id: string;
  type: HrLedgerEventType;
  occurredAt: string;
  title: string;
  description: string;
  badge: string;
  status?: string | null;
  accentClass: string;
};

async function safeQuery<T>(
  label: string,
  query: PromiseLike<{ data: T[] | null; error: { message?: string } | null }>,
) {
  try {
    const { data, error } = await query;
    if (error) {
      console.warn(`[HR LEDGER] ${label} load failed:`, error.message || error);
      return [] as T[];
    }
    return data ?? [];
  } catch (error) {
    console.warn(`[HR LEDGER] ${label} load failed:`, error);
    return [] as T[];
  }
}

function normalizeDate(value: string | null | undefined) {
  return typeof value === 'string' ? value : '';
}

function sortDescByDate<T extends { occurredAt: string }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime(),
  );
}

function asTrimmedString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function asNumber(value: unknown) {
  const normalized = typeof value === 'string' ? Number(value.replace(/,/g, '')) : Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function formatWon(value: number) {
  return `${value.toLocaleString()}원`;
}

function formatAppointmentDescription(record: Record<string, unknown>) {
  const pieces: string[] = [];
  const beforeDept = asTrimmedString(record.before_dept);
  const afterDept = asTrimmedString(record.after_dept);
  const beforePosition = asTrimmedString(record.before_position);
  const afterPosition = asTrimmedString(record.after_position);
  const reason = asTrimmedString(record.reason);

  if (beforeDept || afterDept) {
    pieces.push(`부서 ${beforeDept || '-'} -> ${afterDept || beforeDept || '-'}`);
  }
  if (beforePosition || afterPosition) {
    pieces.push(`직급 ${beforePosition || '-'} -> ${afterPosition || beforePosition || '-'}`);
  }
  if (reason) {
    pieces.push(`사유: ${reason}`);
  }

  return pieces.join(' · ') || '인사발령 이력이 등록되었습니다.';
}

function formatSalaryDescription(record: Record<string, unknown>) {
  const beforeValue = asNumber(record.before_value);
  const afterValue = asNumber(record.after_value);
  const changeType = asTrimmedString(record.change_type) || '급여';
  const labels: Record<string, string> = {
    base_salary: '기본급',
    meal: '식대',
    vehicle: '차량지원',
    childcare: '보육수당',
    research: '연구활동비',
    position_allowance: '직책수당',
    other: '기타수당',
  };

  return `${labels[changeType] || changeType} ${formatWon(beforeValue ?? 0)} -> ${formatWon(afterValue ?? 0)}`;
}

function formatWorkTypeDescription(record: Record<string, unknown>) {
  const prevType = asTrimmedString(record.prev_type);
  const nextType = asTrimmedString(record.new_type);
  const reason = asTrimmedString(record.reason);
  const pieces = [`${prevType || '이전 근무형태 미설정'} -> ${nextType || '미설정'}`];
  if (reason) pieces.push(`사유: ${reason}`);
  return pieces.join(' · ');
}

function formatLeaveDescription(record: Record<string, unknown>) {
  const leaveType = asTrimmedString(record.leave_type) || '휴가';
  const startDate = asTrimmedString(record.start_date);
  const endDate = asTrimmedString(record.end_date);
  const days = asNumber(record.days) ?? asNumber(record.used_days) ?? 0;
  const range = startDate && endDate ? `${startDate} ~ ${endDate}` : startDate || endDate;
  return `${leaveType}${days > 0 ? ` ${days}일` : ''}${range ? ` · ${range}` : ''}`;
}

export async function fetchHrHistoryLedger(staffId: string) {
  const [appointments, contracts, salaryChanges, workTypeChanges, leaveRequests, audits] =
    await Promise.all([
      safeQuery<Record<string, unknown>>(
        'personnel_appointments',
        supabase
          .from('personnel_appointments')
          .select('*')
          .eq('staff_id', staffId)
          .order('effective_date', { ascending: false })
          .limit(20),
      ),
      safeQuery<Record<string, unknown>>(
        'employment_contracts',
        supabase
          .from('employment_contracts')
          .select('*')
          .eq('staff_id', staffId)
          .order('created_at', { ascending: false })
          .limit(20),
      ),
      safeQuery<Record<string, unknown>>(
        'salary_change_history',
        supabase
          .from('salary_change_history')
          .select('*')
          .eq('staff_id', staffId)
          .order('effective_date', { ascending: false })
          .limit(20),
      ),
      safeQuery<Record<string, unknown>>(
        'work_type_change_history',
        supabase
          .from('work_type_change_history')
          .select('*')
          .eq('staff_id', staffId)
          .order('changed_date', { ascending: false })
          .limit(20),
      ),
      safeQuery<Record<string, unknown>>(
        'leave_requests',
        supabase
          .from('leave_requests')
          .select('*')
          .eq('staff_id', staffId)
          .order('created_at', { ascending: false })
          .limit(20),
      ),
      safeQuery<Record<string, unknown>>(
        'audit_logs',
        supabase
          .from('audit_logs')
          .select('*')
          .eq('target_id', staffId)
          .order('created_at', { ascending: false })
          .limit(20),
      ),
    ]);

  const events: HrLedgerEvent[] = [];

  appointments.forEach((record) => {
    const orderType = asTrimmedString(record.order_type) || '인사발령';
    events.push({
      id: `appointment-${record.id}`,
      type: 'appointment',
      occurredAt: normalizeDate((record.effective_date as string) || (record.created_at as string)),
      title: `${orderType} 발령`,
      description: formatAppointmentDescription(record),
      badge: '인사발령',
      status: asTrimmedString(record.status) || null,
      accentClass: 'bg-blue-50 text-blue-700 border-blue-200',
    });
  });

  contracts.forEach((record) => {
    const contractType = asTrimmedString(record.contract_type) || '근로계약';
    const status = asTrimmedString(record.status);
    const requestedAt = normalizeDate(
      (record.signed_at as string) ||
        (record.requested_at as string) ||
        (record.effective_date as string) ||
        (record.created_at as string),
    );
    const lines = [
      asTrimmedString(record.effective_date)
        ? `적용일 ${asTrimmedString(record.effective_date)}`
        : null,
      asNumber(record.base_salary) !== null
        ? `기본급 ${formatWon(asNumber(record.base_salary) ?? 0)}`
        : null,
    ].filter(Boolean);

    events.push({
      id: `contract-${record.id}`,
      type: 'contract',
      occurredAt: requestedAt,
      title: `${contractType} ${status}`.trim(),
      description: lines.join(' · ') || '근로계약 문서가 등록되었습니다.',
      badge: '계약',
      status: status || null,
      accentClass: 'bg-violet-50 text-violet-700 border-violet-200',
    });
  });

  salaryChanges.forEach((record) => {
    events.push({
      id: `salary-${record.id}`,
      type: 'salary',
      occurredAt: normalizeDate((record.effective_date as string) || (record.created_at as string)),
      title: '급여 조건 변경',
      description: formatSalaryDescription(record),
      badge: '급여',
      status: null,
      accentClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    });
  });

  workTypeChanges.forEach((record) => {
    events.push({
      id: `worktype-${record.id}`,
      type: 'work_type',
      occurredAt: normalizeDate((record.changed_date as string) || (record.created_at as string)),
      title: '근무형태 변경',
      description: formatWorkTypeDescription(record),
      badge: '근무형태',
      status: null,
      accentClass: 'bg-amber-50 text-amber-700 border-amber-200',
    });
  });

  leaveRequests.forEach((record) => {
    const leaveType = asTrimmedString(record.leave_type) || '휴가';
    const status = asTrimmedString(record.status);
    events.push({
      id: `leave-${record.id}`,
      type: 'leave',
      occurredAt: normalizeDate(
        (record.start_date as string) ||
          (record.created_at as string) ||
          (record.updated_at as string),
      ),
      title: `${leaveType} ${status}`.trim(),
      description: formatLeaveDescription(record),
      badge: '휴가',
      status: status || null,
      accentClass: 'bg-sky-50 text-sky-700 border-sky-200',
    });
  });

  audits.forEach((record) => {
    const action = asTrimmedString(record.action) || '감사 로그';
    const details =
      record.details && typeof record.details === 'object'
        ? JSON.stringify(record.details).slice(0, 120)
        : '';
    events.push({
      id: `audit-${record.id}`,
      type: 'audit',
      occurredAt: normalizeDate(record.created_at as string),
      title: action,
      description: details || '감사 로그가 기록되었습니다.',
      badge: '감사',
      status: null,
      accentClass: 'bg-slate-100 text-slate-700 border-slate-200',
    });
  });

  return sortDescByDate(events);
}
