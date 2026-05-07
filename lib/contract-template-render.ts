import {
  calculateHourlyRateFromMonthlySalary,
  getMonthlyWorkingHours,
  resolveWeeklyWorkingHours,
  resolveWorkingDaysPerWeek,
} from '@/lib/payroll-working-hours';
import { buildShiftContractVariables } from '@/lib/contract-shift-rotation';

const OPTIONAL_ALLOWANCE_FIELDS = [
  { token: '{{position_allowance}}', labels: ['직책수당'] },
  { token: '{{meal_allowance}}', labels: ['식대'] },
  { token: '{{vehicle_allowance}}', labels: ['자가운전보조금', '자가운전'] },
  { token: '{{childcare_allowance}}', labels: ['보육수당'] },
  { token: '{{research_allowance}}', labels: ['연구활동비'] },
  { token: '{{other_taxfree}}', labels: ['기타 비과세', '비과세'] },
] as const;

function formatDate(value?: unknown) {
  if (value === null || value === undefined || value === '') return '';

  const stringValue = value instanceof Date
    ? value.toISOString()
    : String(value).trim();

  if (!stringValue) return '';

  const date = new Date(stringValue);
  if (Number.isNaN(date.getTime())) {
    return stringValue.includes('T') ? stringValue.split('T')[0] : stringValue;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}년 ${month}월 ${day}일`;
}

function formatWon(value?: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue === 0) return '';

  try {
    return numberValue.toLocaleString('ko-KR');
  } catch {
    return String(numberValue);
  }
}

function toMoneyNumber(value?: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatDayOfMonth(value?: unknown, fallback = '7') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  const numberValue = Number(raw);
  if (!Number.isFinite(numberValue)) return raw;

  return String(Math.min(31, Math.max(1, Math.round(numberValue))));
}

function parseBirthFromResident(value?: unknown) {
  const raw = String(value ?? '').replace(/[^0-9]/g, '');
  if (raw.length < 7) return '';

  const yy = raw.slice(0, 2);
  const mm = raw.slice(2, 4);
  const dd = raw.slice(4, 6);
  const genderCode = raw[6];
  const century =
    genderCode === '1' || genderCode === '2' || genderCode === '5' || genderCode === '6'
      ? '19'
      : '20';

  return `${century}${yy}년 ${mm}월 ${dd}일`;
}

function formatResidentNo(value?: unknown) {
  const raw = String(value ?? '').replace(/[^0-9]/g, '');
  if (!raw) return '';
  if (raw.length < 7) return raw;
  return raw.replace(/(\d{6})(\d{1,7})/, '$1-$2');
}

function removeAllowanceLinesWithoutAmounts(
  content: string,
  allowanceValues: Record<string, number>,
) {
  let nextContent = content.replace(/\r\n/g, '\n');

  OPTIONAL_ALLOWANCE_FIELDS.forEach(({ token }) => {
    if ((allowanceValues[token] || 0) > 0) return;
    nextContent = nextContent
      .split('\n')
      .filter((line) => !line.includes(token))
      .join('\n');
  });

  nextContent = nextContent
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;

      const matchedField = OPTIONAL_ALLOWANCE_FIELDS.find(({ labels }) =>
        labels.some((label) => trimmed.startsWith(label))
      );
      if (!matchedField) return true;

      if ((allowanceValues[matchedField.token] || 0) > 0) return true;

      return /\d[\d,]*\s*원/.test(trimmed);
    })
    .join('\n');

  return nextContent.replace(/\n{3,}/g, '\n\n').trim();
}

export function fillEmploymentContractTemplate(
  template: string,
  user?: Record<string, unknown> | null,
  contract?: Record<string, unknown> | null,
  shift?: Record<string, unknown> | Record<string, unknown>[] | null,
  company?: Record<string, unknown> | null,
) {
  if (!template) return '';

  const safeUser = user ?? {};
  const safeContract = contract ?? {};
  const safeCompany = company ?? {};
  const salarySource = contract || user || {};
  const getSalaryAmount = (fieldName: string) =>
    toMoneyNumber(salarySource[fieldName] ?? safeUser[fieldName] ?? 0);
  const allowanceValues = {
    '{{position_allowance}}': getSalaryAmount('position_allowance'),
    '{{meal_allowance}}': getSalaryAmount('meal_allowance'),
    '{{vehicle_allowance}}': getSalaryAmount('vehicle_allowance'),
    '{{childcare_allowance}}': getSalaryAmount('childcare_allowance'),
    '{{research_allowance}}': getSalaryAmount('research_allowance'),
    '{{other_taxfree}}': getSalaryAmount('other_taxfree'),
  };

  const weeklyWorkHours = resolveWeeklyWorkingHours(
    salarySource,
    resolveWeeklyWorkingHours(safeUser, 40),
  );
  const workingDaysPerWeek = resolveWorkingDaysPerWeek(
    salarySource,
    resolveWorkingDaysPerWeek(safeUser, 5),
  );
  const shiftVars = buildShiftContractVariables(shift, safeContract, safeUser);

  const salaryItems = [
    getSalaryAmount('base_salary'),
    getSalaryAmount('position_allowance'),
    getSalaryAmount('meal_allowance'),
    getSalaryAmount('vehicle_allowance'),
    getSalaryAmount('childcare_allowance'),
    getSalaryAmount('research_allowance'),
    getSalaryAmount('other_taxfree'),
  ];
  const totalMonthlyWage = salaryItems.reduce((sum, amount) => sum + amount, 0);
  const monthlyWorkHours = getMonthlyWorkingHours(weeklyWorkHours);
  const hourlyWage = calculateHourlyRateFromMonthlySalary(totalMonthlyWage, weeklyWorkHours);
  const paymentDay = formatDayOfMonth(
    safeCompany.payment_day ??
    safeCompany.payday ??
    safeContract.payment_day ??
    safeContract.payday ??
    safeUser.payment_day ??
    safeUser.payday,
  );

  const vars: Record<string, string> = {
    staff_name: String(safeUser.name || ''),
    employee_name: String(safeUser.name || ''),
    employee_no: String(safeUser.employee_no ?? ''),
    company_name: String(safeCompany.name || safeUser.company || safeContract.company_name || ''),
    company_ceo: String(safeCompany.ceo_name || ''),
    ceo_name: String(safeCompany.ceo_name || ''),
    company_business_no: String(safeCompany.business_no || ''),
    business_no: String(safeCompany.business_no || ''),
    company_address: String(safeCompany.address || ''),
    address_company: String(safeCompany.address || ''),
    company_phone: String(safeCompany.phone || ''),
    phone_company: String(safeCompany.phone || ''),
    department: String(safeUser.department || ''),
    position: String(safeUser.position || ''),
    join_date: formatDate(safeUser.joined_at || salarySource.join_date),
    license_name: String(safeUser.license || ''),
    license_no: String((safeUser.permissions as Record<string, unknown> | undefined)?.license_no || ''),
    license_date: formatDate((safeUser.permissions as Record<string, unknown> | undefined)?.license_date || ''),
    phone: String(safeUser.phone || ''),
    address: String(safeUser.address || ''),
    birth_date: parseBirthFromResident(safeUser.resident_no),
    resident_no: formatResidentNo(safeUser.resident_no),
    base_salary: formatWon(getSalaryAmount('base_salary')),
    position_allowance: formatWon(getSalaryAmount('position_allowance')),
    meal_allowance: formatWon(getSalaryAmount('meal_allowance')),
    vehicle_allowance: formatWon(getSalaryAmount('vehicle_allowance')),
    childcare_allowance: formatWon(getSalaryAmount('childcare_allowance')),
    research_allowance: formatWon(getSalaryAmount('research_allowance')),
    other_taxfree: formatWon(getSalaryAmount('other_taxfree')),
    total_monthly: formatWon(totalMonthlyWage),
    total_salary: formatWon(totalMonthlyWage),
    annual_salary: formatWon(totalMonthlyWage * 12),
    hourly_wage: formatWon(hourlyWage),
    monthly_work_hours: String(monthlyWorkHours),
    ...shiftVars,
    working_hours_per_week: String(weeklyWorkHours),
    weekly_work_hours: String(weeklyWorkHours),
    working_days_per_week: String(workingDaysPerWeek),
    work_days_per_week: String(workingDaysPerWeek),
    contract_type: String(
      safeUser.employment_type ||
      salarySource.contract_type ||
      safeUser['고용형태'] ||
      '정규직'
    ),
    probation_months: String(safeContract.probation_months ?? safeUser.probation_months ?? '3'),
    probation_percent: String(safeContract.probation_percent || '90'),
    payment_day: paymentDay,
    payday: paymentDay,
    contract_start: formatDate(safeContract.contract_start_date || safeUser.joined_at || salarySource.join_date),
    contract_end: safeContract.contract_end_date ? formatDate(safeContract.contract_end_date) : '정년도달시',
    conditions_applied_at: formatDate(safeContract.conditions_applied_at || salarySource.effective_date),
    today: formatDate(new Date()),
  };

  let result = removeAllowanceLinesWithoutAmounts(
    template.replace(/\[\s*수습\s*기간\s*\]/g, ''),
    allowanceValues,
  );

  Object.entries(vars).forEach(([key, value]) => {
    const token = `{{${key}}}`;
    if (result.includes(token)) {
      result = result.split(token).join(value || '');
    }
  });

  const companyLineValues: Record<string, string | undefined> = {
    회사명: vars.company_name,
    대표자: vars.company_ceo,
    사업자등록번호: vars.company_business_no,
    주소: vars.company_address,
    전화번호: vars.company_phone,
  };

  Object.entries(companyLineValues).forEach(([label, value]) => {
    if (!value) return;
    const re = new RegExp(`(${label}\\s*:\\s*)([_\\s]*)`, 'g');
    result = result.replace(re, `$1${value}`);
  });

  return result;
}
