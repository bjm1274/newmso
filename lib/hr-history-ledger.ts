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
  if (!value) return '';
  return value;
}

function sortDescByDate<T extends { occurredAt: string }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(b.occurredAt || 0).getTime() - new Date(a.occurredAt || 0).getTime(),
  );
}

function formatAppointmentDescription(record: Record<string, unknown>) {
  const pieces: string[] = [];
  const beforeDept = typeof record.before_dept === 'string' ? record.before_dept.trim() : '';
  const afterDept = typeof record.after_dept === 'string' ? record.after_dept.trim() : '';
  const beforePosition =
    typeof record.before_position === 'string' ? record.before_position.trim() : '';
  const afterPosition =
    typeof record.after_position === 'string' ? record.after_position.trim() : '';
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';

  if (beforeDept || afterDept) {
    pieces.push(`부서 ${beforeDept || '-'} → ${afterDept || beforeDept || '-'}`);
  }
  if (beforePosition || afterPosition) {
    pieces.push(`직급 ${beforePosition || '-'} → ${afterPosition || beforePosition || '-'}`);
  }
  if (reason) {
    pieces.push(`사유: ${reason}`);
  }

  return pieces.join(' · ') || '인사발령 이력이 등록되었습니다.';
}

function formatSalaryDescription(record: Record<string, unknown>) {
  const before = Number(record.before_value || 0).toLocaleString();
  const after = Number(record.after_value || 0).toLocaleString();
  const changeType = typeof record.change_type === 'string' ? record.change_type : '급여';
  const labels: Record<string, string> = {
    base_salary: '기본급',
    meal: '식대',
    vehicle: '차량지원',
    childcare: '보육수당',
    research: '연구활동비',
    position_allowance: '직책수당',
    other: '기타수당',
  };

  return `${labels[changeType] || changeType} ${before}원 → ${after}원`;
}

function formatWorkTypeDescription(record: Record<string, unknown>) {
  const prevType = typeof record.prev_type === 'string' ? record.prev_type : '';
  const nextType = typeof record.new_type === 'string' ? record.new_type : '';
  const reason = typeof record.reason === 'string' ? record.reason.trim() : '';
  const pieces = [`${prevType || '이전 근무형태 미설정'} → ${nextType || '미설정'}`];
  if (reason) pieces.push(`사유: ${reason}`);
  return pieces.join(' · ');
}

function formatLeaveDescription(record: Record<string, unknown>) {
  const leaveType = typeof record.leave_type === 'string' ? record.leave_type : '휴가';
  const startDate = typeof record.start_date === 'string' ? record.start_date : '';
  const endDate = typeof record.end_date === 'string' ? record.end_date : '';
  const days = Number(record.days || record.used_days || 0);
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
    const orderType = typeof record.order_type === 'string' ? record.order_type : '인사발령';
    events.push({
      id: `appointment-${record.id}`,
      type: 'appointment',
      occurredAt: normalizeDate((record.effective_date as string) || (record.created_at as string)),
      title: `${orderType} 발령`,
      description: formatAppointmentDescription(record),
      badge: '인사발령',
      status: typeof record.status === 'string' ? record.status : null,
      accentClass: 'bg-blue-50 text-blue-700 border-blue-200',
    });
  });

  contracts.forEach((record) => {
    const contractType =
      typeof record.contract_type === 'string' && record.contract_type.trim()
        ? record.contract_type
        : '근로계약';
    const status = typeof record.status === 'string' ? record.status : '';
    const requestedAt = normalizeDate(
      (record.signed_at as string) ||
        (record.requested_at as string) ||
        (record.effective_date as string) ||
        (record.created_at as string),
    );
    const lines = [
      typeof record.effective_date === 'string' && record.effective_date
        ? `적용일: ${record.effective_date}`
        : null,
      typeof record.base_salary === 'number'
        ? `기본급: ${record.base_salary.toLocaleString()}원`
        : null,
    ].filter(Boolean);

    events.push({
      id: `contract-${record.id}`,
      type: 'contract',
      occurredAt: requestedAt,
      title: `${contractType} ${status || ''}`.trim(),
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
    events.push({
      id: `leave-${record.id}`,
      type: 'leave',
      occurredAt: normalizeDate(
        (record.start_date as string) || (record.created_at as string) || (record.updated_at as string),
      ),
      title: `${(record.leave_type as string) || '휴가'} ${((record.status as string) || '').trim()}`.trim(),
      description: formatLeaveDescription(record),
      badge: '휴가',
      status: typeof record.status === 'string' ? record.status : null,
      accentClass: 'bg-sky-50 text-sky-700 border-sky-200',
    });
  });

  audits.forEach((record) => {
    const action = typeof record.action === 'string' ? record.action : '감사 로그';
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
