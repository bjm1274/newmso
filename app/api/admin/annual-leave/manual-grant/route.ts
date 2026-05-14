import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readSessionFromRequest } from '@/lib/server-session';
import { isNamedSystemMasterAccount } from '@/lib/system-master';
import { calculateAnnualLeaveExpiryDate } from '@/lib/annual-leave-promotion';
import {
  isApprovedLeaveStatus,
  isAnnualLeaveType,
  getLeaveUnit,
  calculateLeaveDays,
} from '@/lib/annual-leave-ledger';

type ManualGrantUpdate = {
  staffId: string;
  total: number;
  used: number;
  expired: number;
  compensated: number;
};

type ManualGrantPayload = {
  staffId?: string;
  total?: number;
  used?: number;
  expired?: number;
  compensated?: number;
  updates?: Array<{
    staffId?: string;
    total?: number;
    used?: number;
    expired?: number;
    compensated?: number;
  }>;
};

type StaffRow = {
  id: string;
  employee_no: string;
  name: string;
  company: string;
  join_date: string | null;
  joined_at: string | null;
  hire_date: string | null;
  company_id: string | null;
};

type CompanyRow = {
  id: string;
  leave_policy: string | null;
  fiscal_year_start_month: number | null;
};

type LeaveRequestRow = {
  staff_id: string;
  leave_type: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function normalizeLeaveValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeOptionalLeaveValue(value: unknown) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeUpdates(payload: ManualGrantPayload | null) {
  const rawUpdates = Array.isArray(payload?.updates)
    ? payload.updates
    : payload?.staffId
      ? [{
          staffId: payload.staffId,
          total: payload.total,
          used: payload.used,
          expired: payload.expired,
          compensated: payload.compensated,
        }]
      : [];

  const normalized = rawUpdates
    .map((update) => {
      const staffId = typeof update?.staffId === 'string' ? update.staffId.trim() : '';
      const total = normalizeLeaveValue(update?.total);
      const used = normalizeLeaveValue(update?.used);
      const expired = normalizeOptionalLeaveValue(update?.expired);
      const compensated = normalizeOptionalLeaveValue(update?.compensated);

      if (!staffId || total === null || used === null || expired === null || compensated === null) {
        return null;
      }

      return { staffId, total, used, expired, compensated } satisfies ManualGrantUpdate;
    })
    .filter((update): update is ManualGrantUpdate => update !== null);

  return Array.from(
    normalized.reduce((map, update) => map.set(update.staffId, update), new Map<string, ManualGrantUpdate>()).values(),
  );
}

// 회계연도 만료일: 다음 회계연도 시작일 전날
function fiscalYearExpiryDate(refYear: number, fiscalStartMonth: number): Date {
  const nextFiscalStart = new Date(refYear + 1, fiscalStartMonth - 1, 1);
  return new Date(nextFiscalStart.getTime() - 86_400_000);
}

// syncAnnualLeaveUsedForStaff와 동일한 사용일수 산정 로직 (DB 조회 없이 메모리 계산)
function computeUsedDays(rows: LeaveRequestRow[]): number {
  return rows.reduce((sum, row) => {
    if (!isApprovedLeaveStatus(row?.status)) return sum;
    const unit = getLeaveUnit(row?.leave_type);
    if (unit === 0.5) return sum + 0.5;
    if (!isAnnualLeaveType(row?.leave_type)) return sum;
    return sum + calculateLeaveDays(row?.start_date, row?.end_date);
  }, 0);
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as ManualGrantPayload | null;
    const updates = normalizeUpdates(payload);

    if (updates.length === 0) {
      return NextResponse.json({ error: '수정할 연차 정보가 올바르지 않습니다.' }, { status: 400 });
    }

    // 사용 + 소멸 + 수당지급 합이 총량을 넘으면 거부 (JM3: 사전 검증)
    const invalid = updates.find((u) => u.used + u.expired + u.compensated > u.total + 0.001);
    if (invalid) {
      return NextResponse.json(
        {
          error: `사용(${invalid.used}) + 소멸(${invalid.expired}) + 수당지급(${invalid.compensated}) 합계가 총 연차(${invalid.total})를 초과합니다. (staffId: ${invalid.staffId})`,
        },
        { status: 400 },
      );
    }

    const supabase = getAdminClient();
    const staffIds = updates.map((u) => u.staffId);
    const targetYear = new Date().getFullYear();

    // 1. 대상 직원 일괄 조회 (존재 검증 + 정책 계산용)
    //    NOT NULL·기본값 없는 컬럼(employee_no/name/company)을 함께 읽어 upsert INSERT 경로 충족
    const { data: staffData, error: staffError } = await supabase
      .from('staff_members')
      .select('id, employee_no, name, company, join_date, joined_at, hire_date, company_id')
      .in('id', staffIds);

    if (staffError) {
      return NextResponse.json({ error: staffError.message }, { status: 500 });
    }

    const staffRows = (staffData || []) as StaffRow[];
    const staffMap = new Map(staffRows.map((s) => [s.id, s]));
    const missingIds = staffIds.filter((id) => !staffMap.has(id));
    if (missingIds.length > 0) {
      return NextResponse.json(
        { error: `존재하지 않는 직원 ID가 포함되어 있습니다: ${missingIds.join(', ')}` },
        { status: 400 },
      );
    }

    // 2. 회사 정책 일괄 조회
    const companyIds = Array.from(
      new Set(staffRows.map((s) => s.company_id).filter((v): v is string => !!v)),
    );
    const companyMap = new Map<string, CompanyRow>();
    if (companyIds.length > 0) {
      const { data: companyData, error: companyError } = await supabase
        .from('companies')
        .select('id, leave_policy, fiscal_year_start_month')
        .in('id', companyIds);
      if (companyError) {
        return NextResponse.json({ error: companyError.message }, { status: 500 });
      }
      ((companyData || []) as CompanyRow[]).forEach((c) => companyMap.set(c.id, c));
    }

    // 3. 휴가신청 내역 일괄 조회 → 직원별 사용일수 계산
    const { data: leaveData, error: leaveError } = await supabase
      .from('leave_requests')
      .select('staff_id, leave_type, start_date, end_date, status')
      .in('staff_id', staffIds);
    if (leaveError) {
      return NextResponse.json({ error: leaveError.message }, { status: 500 });
    }

    const leaveByStaff = new Map<string, LeaveRequestRow[]>();
    ((leaveData || []) as LeaveRequestRow[]).forEach((row) => {
      const list = leaveByStaff.get(row.staff_id);
      if (list) list.push(row);
      else leaveByStaff.set(row.staff_id, [row]);
    });

    // 4. 메모리에서 staff_members / leave_balances 갱신 행 구성
    const staffUpserts: Array<Record<string, unknown>> = [];
    const balanceUpserts: Array<Record<string, unknown>> = [];

    for (const update of updates) {
      const staff = staffMap.get(update.staffId)!;
      const usedDays = computeUsedDays(leaveByStaff.get(update.staffId) || []);
      const totalDays = update.total;

      const company = staff.company_id ? companyMap.get(staff.company_id) : undefined;
      let expiryDate: Date;
      if (company?.leave_policy === '회계연도') {
        expiryDate = fiscalYearExpiryDate(targetYear, company.fiscal_year_start_month ?? 1);
      } else {
        const hireDate = staff.hire_date ?? staff.join_date ?? staff.joined_at ?? null;
        expiryDate = hireDate
          ? calculateAnnualLeaveExpiryDate(hireDate, new Date())
          : new Date(targetYear, 11, 31);
      }
      const expiryDateStr = expiryDate.toISOString().slice(0, 10);

      const remainingDays = Math.max(
        0,
        totalDays - usedDays - update.expired - update.compensated,
      );

      // employee_no/name/company는 기존 값 그대로 — upsert INSERT 경로의 NOT NULL 충족용
      staffUpserts.push({
        id: staff.id,
        employee_no: staff.employee_no,
        name: staff.name,
        company: staff.company,
        annual_leave_total: totalDays,
        annual_leave_used: usedDays,
      });

      balanceUpserts.push({
        staff_id: update.staffId,
        year: targetYear,
        total_days: totalDays,
        used_days: usedDays,
        remaining_days: remainingDays,
        expiry_date: expiryDateStr,
        expired_days: update.expired,
        compensated_days: update.compensated,
      });
    }

    // 5. staff_members 일괄 upsert (id 충돌 → UPDATE)
    const { error: staffUpsertError } = await supabase
      .from('staff_members')
      .upsert(staffUpserts, { onConflict: 'id' });
    if (staffUpsertError) {
      return NextResponse.json({ error: staffUpsertError.message }, { status: 500 });
    }

    // 6. leave_balances 일괄 upsert
    const { error: balanceUpsertError } = await supabase
      .from('leave_balances')
      .upsert(balanceUpserts, { onConflict: 'staff_id,year', ignoreDuplicates: false });
    if (balanceUpsertError) {
      return NextResponse.json(
        {
          error: `leave_balances 갱신 실패: ${balanceUpsertError.message}. staff_members와 불일치 상태일 수 있습니다.`,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      updatedCount: updates.length,
      message:
        updates.length === 1
          ? '연차 수동 부여 내역이 저장되었습니다.'
          : `${updates.length}명의 연차 수동 부여 내역이 저장되었습니다.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '연차 수동 부여 저장 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
