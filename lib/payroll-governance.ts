import type { TaxFreeSettings } from '@/lib/use-tax-free-settings';
import type { TaxInsuranceRates } from '@/lib/use-tax-insurance-rates';
import type { StaffMember } from '@/types';

export type PayrollVerificationIssueLevel = 'error' | 'warning' | 'info';

export interface PayrollVerificationIssue {
  code: string;
  level: PayrollVerificationIssueLevel;
  message: string;
  staffId?: string;
  staffName?: string;
}

export interface PayrollVerificationRow {
  staffId: string;
  staffName: string;
  companyName?: string | null;
  grossPay: number;
  taxablePay: number;
  taxFreePay: number;
  deductionTotal: number;
  netPay: number;
  customDeduction?: number;
  attendanceDeduction?: number;
  advancePay?: number;
  baseSalary?: number;
  applyTax?: boolean;
  exactTaxConfigured?: boolean;
  bankName?: string | null;
  bankAccount?: string | null;
}

export interface PayrollVerificationReport {
  selectedCount: number;
  grossTotal: number;
  taxableTotal: number;
  taxFreeTotal: number;
  deductionTotal: number;
  netTotal: number;
  issues: PayrollVerificationIssue[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
}

export interface PayrollPolicySnapshot {
  companyName: string;
  effectiveYear: number;
  createdAt: string;
  officialMonthlyTaxTable: boolean;
  taxFreeSettings: TaxFreeSettings;
  taxInsuranceRates: Pick<
    TaxInsuranceRates,
    'national_pension_rate' | 'health_insurance_rate' | 'long_term_care_rate' | 'employment_insurance_rate'
  > & { income_tax_bracket: TaxInsuranceRates['income_tax_bracket'] };
}

export interface PayrollComparisonEmployeeDelta {
  staffId: string;
  staffName: string;
  companyName?: string | null;
  taxableDelta: number;
  deductionDelta: number;
  netDelta: number;
}

export interface PayrollComparisonCompanyDelta {
  companyName: string;
  currentCount: number;
  previousCount: number;
  taxableDelta: number;
  deductionDelta: number;
  netDelta: number;
}

export interface PayrollMonthlyComparison {
  previousYearMonth: string;
  currentCount: number;
  previousCount: number;
  taxableDelta: number;
  deductionDelta: number;
  netDelta: number;
  companyDeltas: PayrollComparisonCompanyDelta[];
  employeeDeltas: PayrollComparisonEmployeeDelta[];
}

type PayrollRecordLike = {
  staff_id?: string | null;
  total_taxable?: number | null;
  total_taxfree?: number | null;
  total_deduction?: number | null;
  net_pay?: number | null;
};

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getPreviousYearMonth(yearMonth: string): string {
  const [year, month] = String(yearMonth || '').split('-').map((value) => Number(value));
  if (!year || !month) return yearMonth;
  const date = new Date(year, month - 2, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function buildPayrollVerificationReport(
  rows: PayrollVerificationRow[],
  options?: { requireExactTaxTable?: boolean }
): PayrollVerificationReport {
  const issues: PayrollVerificationIssue[] = [];
  const requireExactTaxTable = options?.requireExactTaxTable === true;

  rows.forEach((row) => {
    if ((row.baseSalary ?? 0) <= 0 && row.grossPay > 0) {
      issues.push({
        code: 'missing-base-salary',
        level: 'error',
        message: `${row.staffName}의 기본급이 0원입니다.`,
        staffId: row.staffId,
        staffName: row.staffName,
      });
    }

    if (requireExactTaxTable && row.applyTax && row.exactTaxConfigured === false) {
      issues.push({
        code: 'missing-tax-table',
        level: 'error',
        message: `${row.staffName}의 소득세 계산에 공식 월 원천징수표가 필요합니다.`,
        staffId: row.staffId,
        staffName: row.staffName,
      });
    }

    if (!String(row.bankName || '').trim() || !String(row.bankAccount || '').trim()) {
      issues.push({
        code: 'missing-bank-info',
        level: 'warning',
        message: `${row.staffName}의 급여 계좌 정보가 비어 있습니다.`,
        staffId: row.staffId,
        staffName: row.staffName,
      });
    }

    if (row.deductionTotal > row.grossPay && row.grossPay > 0) {
      issues.push({
        code: 'deduction-exceeds-gross',
        level: 'warning',
        message: `${row.staffName}의 공제액이 총지급액보다 큽니다.`,
        staffId: row.staffId,
        staffName: row.staffName,
      });
    }

    if (toNumber(row.advancePay) > 0) {
      issues.push({
        code: 'advance-pay-applied',
        level: 'info',
        message: `${row.staffName}는 선지급 정산으로 처리됩니다.`,
        staffId: row.staffId,
        staffName: row.staffName,
      });
    }
  });

  const grossTotal = rows.reduce((sum, row) => sum + toNumber(row.grossPay), 0);
  const taxableTotal = rows.reduce((sum, row) => sum + toNumber(row.taxablePay), 0);
  const taxFreeTotal = rows.reduce((sum, row) => sum + toNumber(row.taxFreePay), 0);
  const deductionTotal = rows.reduce((sum, row) => sum + toNumber(row.deductionTotal), 0);
  const netTotal = rows.reduce((sum, row) => sum + toNumber(row.netPay), 0);

  return {
    selectedCount: rows.length,
    grossTotal,
    taxableTotal,
    taxFreeTotal,
    deductionTotal,
    netTotal,
    issues,
    errorCount: issues.filter((issue) => issue.level === 'error').length,
    warningCount: issues.filter((issue) => issue.level === 'warning').length,
    infoCount: issues.filter((issue) => issue.level === 'info').length,
  };
}

export function buildPayrollPolicySnapshot(params: {
  companyName: string;
  effectiveYear: number;
  taxFreeSettings: TaxFreeSettings;
  taxInsuranceRates: TaxInsuranceRates;
  officialMonthlyTaxTable: boolean;
}): PayrollPolicySnapshot {
  return {
    companyName: params.companyName,
    effectiveYear: params.effectiveYear,
    createdAt: new Date().toISOString(),
    officialMonthlyTaxTable: params.officialMonthlyTaxTable,
    taxFreeSettings: params.taxFreeSettings,
    taxInsuranceRates: {
      national_pension_rate: params.taxInsuranceRates.national_pension_rate,
      health_insurance_rate: params.taxInsuranceRates.health_insurance_rate,
      long_term_care_rate: params.taxInsuranceRates.long_term_care_rate,
      employment_insurance_rate: params.taxInsuranceRates.employment_insurance_rate,
      income_tax_bracket: params.taxInsuranceRates.income_tax_bracket,
    },
  };
}

export function buildMonthlyPayrollComparison(params: {
  currentYearMonth: string;
  currentRecords: PayrollRecordLike[];
  previousRecords: PayrollRecordLike[];
  staffs: StaffMember[];
  selectedCompany?: string;
}): PayrollMonthlyComparison {
  const previousYearMonth = getPreviousYearMonth(params.currentYearMonth);
  const staffMap = new Map(params.staffs.map((staff) => [String(staff.id), staff]));
  const selectedCompany = params.selectedCompany && params.selectedCompany !== '전체'
    ? params.selectedCompany
    : null;

  const normalizeRecord = (record: PayrollRecordLike) => {
    const staffId = String(record.staff_id || '');
    const staff = staffMap.get(staffId);
    return {
      staffId,
      companyName: staff?.company || '미분류',
      taxable: toNumber(record.total_taxable),
      deduction: toNumber(record.total_deduction),
      net: toNumber(record.net_pay),
    };
  };

  const current = params.currentRecords.map(normalizeRecord).filter((row) => !selectedCompany || row.companyName === selectedCompany);
  const previous = params.previousRecords.map(normalizeRecord).filter((row) => !selectedCompany || row.companyName === selectedCompany);

  const currentByStaff = new Map(current.map((row) => [row.staffId, row]));
  const previousByStaff = new Map(previous.map((row) => [row.staffId, row]));
  const allStaffIds = new Set([...currentByStaff.keys(), ...previousByStaff.keys()]);

  const employeeDeltas: PayrollComparisonEmployeeDelta[] = Array.from(allStaffIds).map((staffId) => {
    const currentRow = currentByStaff.get(staffId);
    const previousRow = previousByStaff.get(staffId);
    const staff = staffMap.get(staffId);
    return {
      staffId,
      staffName: staff?.name || staffId || '미지정',
      companyName: staff?.company || currentRow?.companyName || previousRow?.companyName || '미분류',
      taxableDelta: toNumber(currentRow?.taxable) - toNumber(previousRow?.taxable),
      deductionDelta: toNumber(currentRow?.deduction) - toNumber(previousRow?.deduction),
      netDelta: toNumber(currentRow?.net) - toNumber(previousRow?.net),
    };
  }).sort((left, right) => Math.abs(right.netDelta) - Math.abs(left.netDelta));

  const companyBuckets = new Map<string, PayrollComparisonCompanyDelta>();
  const addCompanySide = (rows: ReturnType<typeof normalizeRecord>[], field: 'currentCount' | 'previousCount', sign: 1 | -1) => {
    rows.forEach((row) => {
      const currentBucket = companyBuckets.get(row.companyName) || {
        companyName: row.companyName,
        currentCount: 0,
        previousCount: 0,
        taxableDelta: 0,
        deductionDelta: 0,
        netDelta: 0,
      };
      currentBucket[field] += 1;
      currentBucket.taxableDelta += row.taxable * sign;
      currentBucket.deductionDelta += row.deduction * sign;
      currentBucket.netDelta += row.net * sign;
      companyBuckets.set(row.companyName, currentBucket);
    });
  };

  addCompanySide(current, 'currentCount', 1);
  addCompanySide(previous, 'previousCount', -1);

  return {
    previousYearMonth,
    currentCount: current.length,
    previousCount: previous.length,
    taxableDelta: current.reduce((sum, row) => sum + row.taxable, 0) - previous.reduce((sum, row) => sum + row.taxable, 0),
    deductionDelta: current.reduce((sum, row) => sum + row.deduction, 0) - previous.reduce((sum, row) => sum + row.deduction, 0),
    netDelta: current.reduce((sum, row) => sum + row.net, 0) - previous.reduce((sum, row) => sum + row.net, 0),
    companyDeltas: Array.from(companyBuckets.values()).sort((left, right) => Math.abs(right.netDelta) - Math.abs(left.netDelta)),
    employeeDeltas: employeeDeltas.slice(0, 10),
  };
}
