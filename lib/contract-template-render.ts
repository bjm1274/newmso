import {
  calculateHourlyRateFromMonthlySalary,
  getMonthlyWorkingHours,
  resolveWeeklyWorkingHours,
  resolveWorkingDaysPerWeek } from '@/lib/payroll-working-hours';
import { buildShiftContractVariables } from '@/lib/contract-shift-rotation';
import { resolveResidentBirthCentury } from '@/lib/resident-number';
import {
  cleanOptionalText,
  getStaffContractEndDate,
  getStaffEmploymentType,
  getStaffLicenseDate,
  getStaffLicenseNo,
  getStaffProbationMonths,
  getStaffProbationPercent } from '@/lib/staff-meta';

const OPTIONAL_ALLOWANCE_FIELDS = [
  { token: '{{position_allowance}}', labels: ['직책수당'] },
  { token: '{{meal_allowance}}', labels: ['식대'] },
  { token: '{{vehicle_allowance}}', labels: ['자가운전보조금', '자가운전'] },
  { token: '{{childcare_allowance}}', labels: ['보육수당'] },
  { token: '{{research_allowance}}', labels: ['연구활동비'] },
  { token: '{{other_taxfree}}', labels: ['기타 비과세', '비과세'] },
] as const;

/**
 * 0022 마이그레이션으로 `employment_contracts` 에 새로 생긴 "체결 시점 스냅샷" 수당 컬럼.
 *
 * 이 컬럼들은 DEFAULT 가 없어서
 *   - 마이그레이션 이전에 만들어진 계약서 → NULL  → 지금까지처럼 staff_members 폴백
 *   - 이후 발송된 계약서                → 0 포함 확정값 → 그 값을 그대로 사용
 * 로 구분된다. 기존 급여 컬럼(base_salary 등)은 DEFAULT 0 이라 0/NULL 구분이 불가능하므로
 * 회귀를 피하려고 기존 `contractVal > 0` 규칙을 그대로 둔다.
 */
const SNAPSHOT_ONLY_SALARY_FIELDS = new Set([
  'agreed_overtime_allowance',
  'agreed_night_allowance',
  'night_duty_allowance',
]);

/** 계약서 행에 값이 "기록되어 있는지"(0 포함) 판정. NULL/undefined/'' 는 미기록. */
function hasRecordedValue(value: unknown) {
  if (value === null || value === undefined || typeof value === 'boolean') return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return Number.isFinite(Number(typeof value === 'string' ? value.replace(/,/g, '').trim() : value));
}

function formatDate(value?: unknown) {
  if (typeof value === 'boolean') return '';
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
  if (typeof value === 'boolean') return '';
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '0';

  try {
    return numberValue.toLocaleString('ko-KR');
  } catch {
    return String(numberValue);
  }
}

function toMoneyNumber(value?: unknown) {
  if (typeof value === 'boolean' || value === null || value === undefined || value === '') {
    return 0;
  }
  const raw = typeof value === 'string' ? value.replace(/,/g, '').trim() : value;
  const numberValue = Number(raw);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatDayOfMonth(value?: unknown, fallback = '7') {
  if (typeof value === 'boolean') return fallback;
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
  // 8차 D04-011: 여기 사본은 1/2/5/6 만 1900 으로 보고 **나머지 전부** 2000 으로 단정했다.
  // 실측: '990101-9######' → 이 사본 '2099년', 정본 '1899년'.
  // 세기 판정만 SSOT 로 넘기고 표기 형식(월·일 원문 그대로)은 그대로 둔다 —
  // 계약서는 주민번호 문자열을 사람이 읽는 형태로 옮겨 적는 자리라 날짜 유효성 보정이 목적이 아니다.
  const century = resolveResidentBirthCentury(raw[6]);
  if (century === null) return '';

  return `${String(century).slice(0, 2)}${yy}년 ${mm}월 ${dd}일`;
}

function formatResidentNo(value?: unknown) {
  const raw = String(value ?? '').replace(/[^0-9]/g, '');
  if (!raw) return '';
  if (raw.length < 7) return raw;
  return raw.replace(/(\d{6})(\d{1,7})/, '$1-$2');
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'boolean') continue;
    const text = cleanOptionalText(value);
    if (text) return text;
  }
  return '';
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getPrimaryShiftRecord(
  shift?: Record<string, unknown> | Record<string, unknown>[] | null,
) {
  if (Array.isArray(shift)) return toRecord(shift[0]);

  const shiftRecord = toRecord(shift);
  if (Array.isArray(shiftRecord.weekly_rotation_shifts)) {
    return toRecord(shiftRecord.weekly_rotation_shifts[0]);
  }

  return shiftRecord;
}

function readShiftMeta(shiftRecord: Record<string, unknown>) {
  const description = String(shiftRecord.description || '');
  const markerIndex = description.lastIndexOf('[SHIFT_META]');
  if (markerIndex < 0) return {};

  try {
    return toRecord(JSON.parse(description.slice(markerIndex + '[SHIFT_META]'.length).trim()));
  } catch {
    return {};
  }
}

function resolveWorkDayMode(
  workingDaysPerWeek: number,
  shift?: Record<string, unknown> | Record<string, unknown>[] | null,
  contract?: Record<string, unknown> | null,
  user?: Record<string, unknown> | null,
) {
  const shiftRecord = getPrimaryShiftRecord(shift);
  const shiftMeta = readShiftMeta(shiftRecord);
  const explicitMode = firstText(
    contract?.work_day_mode,
    user?.work_day_mode,
    shiftRecord.work_day_mode,
    shiftMeta.work_day_mode,
  );

  if (explicitMode === 'all_days' || explicitMode.includes('월~일')) return 'all_days';
  if (explicitMode === 'weekdays' || explicitMode.includes('월~금')) return 'weekdays';
  if (
    shiftRecord.is_weekend_work === true ||
    shiftRecord.is_weekend_work === 1 ||
    String(shiftRecord.is_weekend_work) === 'true' ||
    Number(shiftRecord.weekly_work_days) >= 7
  ) return 'all_days';
  if (workingDaysPerWeek >= 7) return 'all_days';

  return 'weekdays';
}

function buildWorkDayText(
  workingDaysPerWeek: number,
  shift?: Record<string, unknown> | Record<string, unknown>[] | null,
  contract?: Record<string, unknown> | null,
  user?: Record<string, unknown> | null,
) {
  const shiftRecord = getPrimaryShiftRecord(shift);
  const explicitWorkingDays = firstText(
    contract?.working_days,
    contract?.work_days,
    user?.working_days,
    user?.work_days,
    shiftRecord.working_days,
    shiftRecord.work_days,
  );
  if (explicitWorkingDays && !/^\d+(\.\d+)?$/.test(explicitWorkingDays)) {
    return explicitWorkingDays;
  }

  // 모든 shift 레코드들 모아서 토요일 근무 여부 확인
  const allShifts: Record<string, unknown>[] = [];
  if (Array.isArray(shift)) {
    shift.forEach(s => {
      if (s && typeof s === 'object') {
        allShifts.push(s as Record<string, unknown>);
        const rotation = (s as Record<string, unknown>).weekly_rotation_shifts;
        if (Array.isArray(rotation)) {
          rotation.forEach(r => r && typeof r === 'object' && allShifts.push(r as Record<string, unknown>));
        }
      }
    });
  } else if (shift && typeof shift === 'object') {
    allShifts.push(shift as Record<string, unknown>);
    const rotation = (shift as Record<string, unknown>).weekly_rotation_shifts;
    if (Array.isArray(rotation)) {
      rotation.forEach(r => r && typeof r === 'object' && allShifts.push(r as Record<string, unknown>));
    }
  }

  const hasSaturdayWork = allShifts.some(s => {
    const isWeekendWork = s.is_weekend_work === true || s.is_weekend_work === 1 || String(s.is_weekend_work) === 'true';
    const weeklyWorkDays = Number(s.weekly_work_days || 0);
    const nameIncludesSat = String(s.name || '').includes('토');
    return isWeekendWork || weeklyWorkDays >= 6 || nameIncludesSat;
  });

  if (hasSaturdayWork) {
    return '월요일~토요일 (또는 근무표에 따른 요일)';
  }

  const workDayMode = resolveWorkDayMode(workingDaysPerWeek, shift, contract, user);
  if (workDayMode === 'all_days') return '근무표에 따른 요일';

  let effectiveDays = workingDaysPerWeek;
  if (shiftRecord && typeof shiftRecord.weekly_work_days === 'number') {
    effectiveDays = shiftRecord.weekly_work_days;
  }

  if (effectiveDays >= 6 || (shiftRecord && shiftRecord.is_weekend_work)) return '월요일~토요일 (또는 근무표에 따른 요일)';
  if (effectiveDays === 5) return '월요일~금요일';

  return `주 ${effectiveDays}일`;
}

function buildWeeklyHolidayText(
  workingDaysPerWeek: number,
  shift?: Record<string, unknown> | Record<string, unknown>[] | null,
  contract?: Record<string, unknown> | null,
  user?: Record<string, unknown> | null,
) {
  const explicitHoliday = firstText(
    contract?.weekly_holiday,
    contract?.holiday,
    user?.weekly_holiday,
    user?.holiday,
  );
  if (explicitHoliday) return explicitHoliday;

  const workDayMode = resolveWorkDayMode(workingDaysPerWeek, shift, contract, user);
  if (workDayMode === 'all_days') return '근무표에 따른 휴일(주 1회 이상)';

  return '일요일';
}

function removeAllowanceLinesWithoutAmounts(
  content: string,
  allowanceValues: Record<string, number>,
) {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const resultLines = lines.filter(line => {
    // Check if the line contains any allowance token
    const matchingTokens = Object.keys(allowanceValues).filter(token => line.includes(token));
    if (matchingTokens.length === 0) return true; // No allowance token, keep line
    
    // If it contains allowance tokens, check if AT LEAST ONE has a non-zero value
    const hasValue = matchingTokens.some(token => allowanceValues[token] > 0);
    return hasValue;
  });
  return resultLines.join('\n').trim();
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

  // Resolve a salary field by checking both contract and user, preferring
  // whichever has a positive value. Contract overrides user when both > 0.
  const getSalaryAmount = (fieldName: string) => {
    const alternates: Record<string, string[]> = {
      agreed_overtime_allowance: ['overtime_allowance'],
      agreed_night_allowance: ['night_work_allowance', 'night_duty_allowance'] };
    const tryResolve = (source: Record<string, unknown>) => {
      let val = toMoneyNumber(source[fieldName]);
      if (val === 0 && alternates[fieldName]) {
        for (const alt of alternates[fieldName]) {
          val = toMoneyNumber(source[alt]);
          if (val > 0) break;
        }
      }
      return val;
    };

    // 스냅샷 컬럼은 계약서 행에 값이 기록되어 있으면 0 이라도 그것이 이긴다.
    // (0 = "이 계약에는 해당 수당 없음" 이라는 확정 사실이므로 현재 급여로 폴백하면 안 된다.)
    if (SNAPSHOT_ONLY_SALARY_FIELDS.has(fieldName) && hasRecordedValue(safeContract[fieldName])) {
      return toMoneyNumber(safeContract[fieldName]);
    }

    const contractVal = tryResolve(safeContract);
    const userVal = tryResolve(safeUser);

    // Use contract value if positive, otherwise fall back to user value
    return contractVal > 0 ? contractVal : userVal;
  };
  const allowanceValues: Record<string, number> = {
    '{{position_allowance}}': getSalaryAmount('position_allowance'),
    '{{meal_allowance}}': getSalaryAmount('meal_allowance'),
    '{{vehicle_allowance}}': getSalaryAmount('vehicle_allowance'),
    '{{childcare_allowance}}': getSalaryAmount('childcare_allowance'),
    '{{research_allowance}}': getSalaryAmount('research_allowance'),
    '{{other_taxfree}}': getSalaryAmount('other_taxfree'),
    '{{agreed_overtime_allowance}}': getSalaryAmount('agreed_overtime_allowance'),
    '{{agreed_night_allowance}}': getSalaryAmount('agreed_night_allowance'),
    '{{night_duty_allowance}}': getSalaryAmount('night_duty_allowance') };

  const weeklyWorkHours = resolveWeeklyWorkingHours(
    safeContract,
    resolveWeeklyWorkingHours(safeUser, 40),
  );
  const workingDaysPerWeek = resolveWorkingDaysPerWeek(
    safeContract,
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
    getSalaryAmount('agreed_overtime_allowance'),
    getSalaryAmount('agreed_night_allowance'),
    getSalaryAmount('night_duty_allowance'),
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
  const companyRepresentativeName = firstText(
    safeCompany.ceo_name,
    safeCompany.representative_name,
    safeCompany.owner_name,
  );
  const companyBusinessNo = firstText(safeCompany.business_no, safeCompany.business_number);
  const companyAddress = firstText(safeCompany.address, safeCompany.company_address);
  const companyPhone = firstText(safeCompany.phone, safeCompany.company_phone, safeCompany.tel);
  const employeePhone = firstText(safeUser.phone, safeUser.employee_phone, safeUser.mobile);
  const employeeAddress = firstText(safeUser.address, safeUser.employee_address);
  const workingDaysText = buildWorkDayText(workingDaysPerWeek, shift, safeContract, safeUser);
  const weeklyHolidayText = buildWeeklyHolidayText(workingDaysPerWeek, shift, safeContract, safeUser);
  // 계약종료일은 staff 레코드의 permissions.contract_end_date 에 저장되므로
  // top-level 뿐 아니라 permissions 내부까지 탐색하는 헬퍼로 해석한다.
  const resolvedContractEndDate =
    getStaffContractEndDate(safeContract) || getStaffContractEndDate(safeUser);
  const contractEndDate = formatDate(resolvedContractEndDate);
  const contractType = firstText(
    salarySource.contract_type,
    getStaffEmploymentType(safeUser),
    safeUser['고용형태'],
    '정규직',
  );
  const isFixedTerm =
    String(contractType).includes('계약직') ||
    !!resolvedContractEndDate;

  const vars: Record<string, string> = {
    staff_name: String(safeUser.name || ''),
    employee_name: String(safeUser.name || ''),
    employee_no: String(safeUser.employee_no ?? ''),
    company_name: String(safeCompany.name || safeUser.company || safeContract.company_name || ''),
    company_ceo: companyRepresentativeName,
    ceo_name: companyRepresentativeName,
    representative_name: companyRepresentativeName,
    company_representative_name: companyRepresentativeName,
    company_business_no: companyBusinessNo,
    business_no: companyBusinessNo,
    company_business_number: companyBusinessNo,
    business_number: companyBusinessNo,
    company_address: companyAddress,
    address_company: companyAddress,
    company_phone: companyPhone,
    phone_company: companyPhone,
    department: String(safeUser.department || ''),
    position: String(safeUser.position || ''),
    join_date: formatDate(safeUser.joined_at || salarySource.join_date),
    license_name: String(safeUser.license || ''),
    license_no: getStaffLicenseNo(safeUser),
    license_date: formatDate(getStaffLicenseDate(safeUser)),
    phone: employeePhone,
    employee_phone: employeePhone,
    address: employeeAddress,
    employee_address: employeeAddress,
    birth_date: parseBirthFromResident(safeUser.resident_no),
    employee_birth_date: parseBirthFromResident(safeUser.resident_no),
    resident_no: formatResidentNo(safeUser.resident_no),
    employee_resident_no: formatResidentNo(safeUser.resident_no),
    base_salary: formatWon(getSalaryAmount('base_salary')),
    position_allowance: formatWon(getSalaryAmount('position_allowance')),
    meal_allowance: formatWon(getSalaryAmount('meal_allowance')),
    vehicle_allowance: formatWon(getSalaryAmount('vehicle_allowance')),
    childcare_allowance: formatWon(getSalaryAmount('childcare_allowance')),
    research_allowance: formatWon(getSalaryAmount('research_allowance')),
    other_taxfree: formatWon(getSalaryAmount('other_taxfree')),
    agreed_overtime_allowance: formatWon(getSalaryAmount('agreed_overtime_allowance')),
    agreed_night_allowance: formatWon(getSalaryAmount('agreed_night_allowance')),
    night_duty_allowance: formatWon(getSalaryAmount('night_duty_allowance')),
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
    working_days: workingDaysText,
    work_days: workingDaysText,
    weekly_holiday: weeklyHolidayText,
    holiday: weeklyHolidayText,
    contract_type: contractType,
    probation_months: String(
      getStaffProbationMonths(
        { probation_months: safeContract.probation_months },
        getStaffProbationMonths(safeUser, 0),
      ),
    ),
    probation_percent: String(
      safeContract.probation_percent ||
      getStaffProbationPercent(safeUser, 90)
    ),
    payment_day: paymentDay,
    payday: paymentDay,
    contract_start: formatDate(safeContract.contract_start_date || safeUser.joined_at || salarySource.join_date),
    contract_end: contractEndDate || (isFixedTerm ? '계약만료일' : '정년도달시'),
    conditions_applied_at: formatDate(safeContract.conditions_applied_at || salarySource.effective_date),
    today: formatDate(safeContract.requested_at || new Date()) };

  const probationMonthsNum = getStaffProbationMonths(
    { probation_months: safeContract.probation_months },
    getStaffProbationMonths(safeUser, 0),
  );

  const probationPercentNum = Number(
    safeContract.probation_percent ||
    getStaffProbationPercent(safeUser, 90)
  );

  let probationStart = '';
  let probationEnd = '';
  if (probationMonthsNum > 0) {
    const startDateStr = safeContract.contract_start_date || safeUser.joined_at || salarySource.join_date;
    if (startDateStr) {
      const startD = new Date(String(startDateStr));
      if (!isNaN(startD.getTime())) {
        probationStart = formatDate(startD);
        const endD = new Date(startD);
        endD.setMonth(endD.getMonth() + probationMonthsNum);
        endD.setDate(endD.getDate() - 1);
        probationEnd = formatDate(endD);
      }
    }
  }

  // Add the computed probation dates to the variables map
  vars.probation_start = probationStart;
  vars.probation_end = probationEnd;

  let transformedTemplate = template;

  // Replace "{{break_start}} ~ {{break_end}}" or similar with "{{break_time_range}}" dynamically
  transformedTemplate = transformedTemplate.replace(/\{\{\s*break_start\s*\}\}\s*(?:~|-)\s*\{\{\s*break_end\s*\}\}/g, '{{break_time_range}}');
  transformedTemplate = transformedTemplate.replace(/\{\{\s*shift_start\s*\}\}\s*(?:~|-)\s*\{\{\s*shift_end\s*\}\}/g, '{{shift_time_range}}');

  if (isFixedTerm) {
    // 계약직인 경우: 기간의 정함이 없는 -> 지정된 계약종료일까지 계약
    transformedTemplate = transformedTemplate.replace(
      /①\s*근로자는\s*(?:\{\{\s*(?:join_date|contract_start)\s*\}\})\s*부터\s*(?:기간의\s*정함이\s*없는\s*근로계약을\s*체결한\s*것으로\s*한다|정년까지로\s*한다|.*?까지로\s*한다)\.?/g,
      '① 근로자는 {{join_date}}부터 {{contract_end}}까지 근로계약을 체결한 것으로 한다.'
    );
  } else {
    // 정규직인 경우: 기간의 정함이 없는 -> 정년까지로 한다
    transformedTemplate = transformedTemplate.replace(
      /①\s*근로자는\s*(?:\{\{\s*(?:join_date|contract_start)\s*\}\})\s*부터\s*(?:기간의\s*정함이\s*없는\s*근로계약을\s*체결한\s*것으로\s*한다|정년까지로\s*한다|.*?까지로\s*한다)\.?/g,
      '① 근로자는 {{join_date}}부터 정년까지로 한다.'
    );
  }

  if (probationMonthsNum > 0) {
    // 수습기간이 존재하는 경우: 수습기간 범위와 임금 비율을 명시하는 문구로 치환
    const probationText = `② 신규 입사자의 경우 입사일로부터 ${probationMonthsNum}개월간(${probationStart} ~ ${probationEnd})을 수습기간으로 하며, 수습기간 중 급여는 기본급의 ${probationPercentNum}%를 지급한다. 사용자는 수습기간 중 근무태도, 업무수행능력, 자질, 건강상태, 조직 적응도 등을 종합적으로 평가할 수 있다.`;
    
    transformedTemplate = transformedTemplate.replace(
      /②\s*신규\s*입사자의\s*경우[\s\S]*?종합적으로\s*평가할\s*수\s*있다\.?/g,
      probationText
    );
  } else {
    // 수습기간이 없는 경우: 수습 미적용 문구로 단순화하고 관련 조항 해지 문구(③)를 제거
    transformedTemplate = transformedTemplate.replace(
      /②\s*신규\s*입사자의\s*경우[\s\S]*?종합적으로\s*평가할\s*수\s*있다\.?/g,
      '② 본 계약은 별도의 수습기간을 두지 아니한다.'
    );
    transformedTemplate = transformedTemplate.replace(
      /③\s*수습기간\s*중\s*또는\s*수습기간\s*만료\s*시[\s\S]*?종료할\s*수\s*있다\.?\n?/g,
      ''
    );
  }

  let result = removeAllowanceLinesWithoutAmounts(
    transformedTemplate.replace(/\[\s*수습\s*기간\s*\]/g, ''),
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
    전화번호: vars.company_phone };

  Object.entries(companyLineValues).forEach(([label, value]) => {
    if (!value) return;
    // `{2,}` → `{2 }` 일괄 치환 사고(8차 D04-002)로 이 치환은 한 번도 동작한 적이 없다.
    // 복원 실측: '회사명: ____ ' → 손상판 무변화 / 복원판 '회사명: (실제값) '.
    const re = new RegExp(`(${label}\\s*:\\s*)(?:_{2,}|\\s{2,})(?=\\s|$)`, 'g');
    result = result.replace(re, `$1${value}`);
  });

  return result;
}
