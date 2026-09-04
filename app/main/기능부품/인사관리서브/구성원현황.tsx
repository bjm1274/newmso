'use client';
import { toast } from '@/lib/toast';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import ProfilePhotoThumbnail from '@/app/components/ProfilePhotoThumbnail';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
import { type StaffMember } from '@/types';
import { isGroupAccount } from '@/types';
import { db } from '@/lib/db-client';
import { isActiveStaff } from '@/lib/active-staff';
import { isMissingColumnError, withMissingColumnsFallback } from '@/lib/db-compat';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';
import { getChecklistTargetDate, getDefaultChecklist } from '@/lib/hr-checklists';
import { getMinimumWageByYear, MONTHLY_STANDARD_HOURS } from '@/lib/tax-free-limits';
import {
  calculateHourlyRateFromMonthlySalary,
  getMonthlyWorkingHours,
  resolveWeeklyWorkingHours,
  resolveWorkingDaysPerWeek } from '@/lib/payroll-working-hours';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import {
  cleanOptionalText,
  getStaffContractEndDate,
  getStaffEmploymentType,
  getStaffExtension,
  getStaffProbationMonths,
  getStaffProbationPercent,
  toIntegerOrFallback } from '@/lib/staff-meta';
import {
  fetchStaffLicensesGrouped,
  summarizeLicenses,
  type StaffLicenseRow } from './구성원현황/staff-license-link';
import StaffHistoryTimeline from './인사이력타임라인';
import SalaryChangeHistoryModal from './급여변경이력관리';
import OnboardingChecklist from './급여명세/입퇴사온보딩';
import CertTransferPanel from './교육자격인사이동패널';
import RiskActionDialog from './RiskActionDialog';
import SmartDatePicker from '../공통/SmartDatePicker';
import { formatWon as libFormatWon } from '@/lib/date-formatter';
import { getWeeklyRotationShiftIds } from '@/lib/contract-shift-rotation';
import { formatResidentBirthDateKey, resolveResidentBirthCentury } from '@/lib/resident-number';
import { averageShiftHoursAndDays, type Shift as WorkShift } from '@/lib/shift-working-hours';
import {
  HOURS_BASED_ALLOWANCE_FIELDS,
  allowanceWonFromHours,
  getAllowanceMultiplier,
  isHoursBasedAllowance,
  type AllowanceHoursKey } from '@/lib/payroll-allowance-hours';

const formatWon = (amount: number) => libFormatWon(Math.round(amount || 0));

// 시간 입력 기반 수당의 기본 시간값(전부 0) — createEmptyStaffForm·로드 복원에서 공통 사용 (JM4)
const EMPTY_ALLOWANCE_HOURS = Object.fromEntries(
  HOURS_BASED_ALLOWANCE_FIELDS.map((field) => [field.key, 0]),
) as Record<AllowanceHoursKey, number>;

function createEmptyStaffForm(selectedCompany?: string) {
  const company = selectedCompany && selectedCompany !== '전체' ? selectedCompany : '';

  return {
    성명: '', 전화번호: '', 내선번호: '', 사업체: company, 팀: '', 직함: '', 입사일: '', 퇴사일: '',
    주민번호: '', 이메일: '', 주소: '', 면허사항: '', 면허번호: '', 취득일자: '', 면허기타내용: '', 계좌정보: '', 임금정보: '', 상태: '재직',
    연차총개수: 0, 연차사용개수: 0, 근무형태ID: '', 근무형태IDs: [] as string[],
    고용형태: '정규직' as string, 계약종료일: '' as string,
    is_group_account: false as boolean,
    account_type: 'personal' as 'personal' | 'team_group',
    probation_months: 0,
    probation_percent: 90,
    base_salary: 0,
    meal_allowance: 0, night_duty_allowance: 0, vehicle_allowance: 0, childcare_allowance: 0, research_allowance: 0, other_taxfree: 0, position_allowance: 0,
    overtime_allowance: 0, night_work_allowance: 0, holiday_work_allowance: 0, annual_leave_pay: 0,
    agreed_overtime_allowance: 0, agreed_night_allowance: 0,
    ins_national: true, ins_national_amount: '' as number | '', ins_health: true, ins_employment: true, ins_injury: true, is_basic_living: false, other_welfare: '',
    ins_duru_nuri: false, duru_nuri_start: '', duru_nuri_end: '', is_medical_benefit: false,
    working_hours_per_week: 40, working_days_per_week: 5,
    allowance_hours: { ...EMPTY_ALLOWANCE_HOURS } };
}

const TAXABLE_SALARY_FIELDS = [
  { key: 'base_salary', label: '기본급 (월)' },
  { key: 'position_allowance', label: '직책수당' },
  { key: 'agreed_overtime_allowance', label: '약정연장수당' },
  { key: 'agreed_night_allowance', label: '약정야간수당' },
  { key: 'overtime_allowance', label: '연장근로수당' },
  { key: 'night_work_allowance', label: '야간근로수당' },
  { key: 'holiday_work_allowance', label: '휴일근로수당' },
  { key: 'annual_leave_pay', label: '연차휴가수당' },
] as const;

const TAXFREE_SALARY_FIELDS = [
  { key: 'meal_allowance', label: '식대' },
  { key: 'night_duty_allowance', label: '야간당직수당' },
  { key: 'vehicle_allowance', label: '자가운전' },
  { key: 'childcare_allowance', label: '보육수당' },
  { key: 'research_allowance', label: '연구비' },
  { key: 'other_taxfree', label: '기타 비과세' },
] as const;

const STAFF_MUTATION_ALLOWANCE_COLUMNS = [
  'meal_allowance',
  'night_duty_allowance',
  'vehicle_allowance',
  'childcare_allowance',
  'research_allowance',
  'other_taxfree',
  'position_allowance',
  'overtime_allowance',
  'night_work_allowance',
  'holiday_work_allowance',
  'annual_leave_pay',
  'salary_info',
  'agreed_night_allowance',
  'agreed_overtime_allowance',
] as const;

const STAFF_MUTATION_WORK_CONDITION_COLUMNS = [
  'working_hours_per_week',
  'working_days_per_week',
] as const;

/**
 * `staff_members` 스키마에 **실제로 존재하지 않는** 컬럼.
 *
 * /api/d1/mutate 는 모르는 컬럼을 에러 없이 조용히 제거하므로,
 * 에러를 보고 재시도하는 withMissingColumnsFallback 이 영영 발동하지 않았다.
 * 그 결과 약정연장·야간수당을 입력하고 저장하면 성공 토스트만 뜨고 값은 사라졌다.
 * 처음부터 permissions.payroll_allowances 로 보내도록 강제한다(읽기 경로도 그쪽을 폴백으로 본다).
 */
const STAFF_COLUMNS_NOT_IN_SCHEMA = [
  'agreed_overtime_allowance',
  'agreed_night_allowance',
] as const;

const ESS_FIELD_LABELS: Record<string, string> = {
  email: '이메일',
  phone: '연락처',
  extension: '내선번호',
  address: '거주지 주소',
  bank_name: '급여 은행',
  bank_account: '급여 계좌번호',
  permissions: '권한/복지 정보' };

function buildStaffMutationPayload(
  payload: Record<string, unknown>,
  omittedColumns: ReadonlySet<string>,
) {
  if (omittedColumns.size === 0) {
    return payload;
  }

  const nextPayload: Record<string, unknown> = { ...payload };
  const permissions =
    nextPayload.permissions && typeof nextPayload.permissions === 'object' && !Array.isArray(nextPayload.permissions)
      ? { ...(nextPayload.permissions as Record<string, unknown>) }
      : {};
  const fallbackAllowances =
    permissions.payroll_allowances && typeof permissions.payroll_allowances === 'object' && !Array.isArray(permissions.payroll_allowances)
      ? { ...(permissions.payroll_allowances as Record<string, unknown>) }
      : {};
  const fallbackWorkConditions =
    permissions.work_conditions && typeof permissions.work_conditions === 'object' && !Array.isArray(permissions.work_conditions)
      ? { ...(permissions.work_conditions as Record<string, unknown>) }
      : {};

  omittedColumns.forEach((columnName) => {
    if (!(columnName in nextPayload)) return;
    if ((STAFF_MUTATION_ALLOWANCE_COLUMNS as readonly string[]).includes(columnName)) {
      fallbackAllowances[columnName] = nextPayload[columnName];
    }
    if ((STAFF_MUTATION_WORK_CONDITION_COLUMNS as readonly string[]).includes(columnName)) {
      fallbackWorkConditions[columnName] = nextPayload[columnName];
    }
    delete nextPayload[columnName];
  });

  if (Object.keys(fallbackAllowances).length > 0) {
    permissions.payroll_allowances = fallbackAllowances;
  }
  if (Object.keys(fallbackWorkConditions).length > 0) {
    permissions.work_conditions = fallbackWorkConditions;
  }
  nextPayload.permissions = permissions;
  return nextPayload;
}


function normalizeResidentNo(value: string | null | undefined) {
  return String(value || '').replace(/[^0-9]/g, '');
}

function normalizeStaffName(value: string | null | undefined) {
  return String(value || '').trim();
}

function isDuplicateStaffIdentityError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  return message.includes('duplicate_staff_identity');
}

function isInvalidIntegerInputError(error: unknown, value?: unknown) {
  const message = error instanceof Error ? error.message : String(error || '');
  if (!message.includes('invalid input syntax for type integer')) {
    return false;
  }
  return value === undefined ? true : message.includes(`"${String(value)}"`);
}

function hasFractionalValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && !Number.isInteger(numeric);
}

// ESLint가 React 컴포넌트로 인식하도록 함수 이름을
// 영문 대문자로 시작하는 형태로 지정합니다.
// default export이므로 외부 import 이름(구성원관리 등)은 그대로 사용 가능합니다.
interface StaffListManagerProps {
  직원목록?: StaffMember[];
  부서목록?: string[];
  선택사업체?: string | null;
  보기상태?: string;
  새로고침?: () => void;
  창상태?: string;
  창닫기?: () => void;
  onOpenDocumentRepoForStaff?: (staff: StaffMember) => void;
  canRegisterNewStaff?: boolean;
  onOpenNewStaff?: () => void;
  initialEditStaff?: StaffMember | null;
}
export default function StaffListManager({ 직원목록 = [], 부서목록 = [], 선택사업체, 보기상태 = '재직', 새로고침, 창상태, 창닫기, onOpenDocumentRepoForStaff, canRegisterNewStaff = false, onOpenNewStaff, initialEditStaff }: StaffListManagerProps) {
  const [편집모드, 편집모드설정] = useState(false);
  const [선택된직원ID, 선택된직원ID설정] = useState<string | number | null>(null);
  const [근무형태목록, 근무형태목록설정] = useState<any[]>([]);
  // 다중 근무형태(주간 로테이션) 선택 UI 상태
  const [새근무형태표시, 새근무형태표시설정] = useState(false);
  const [추가근무형태ID, 추가근무형태ID설정] = useState('');
  const [팀목록캐시, 팀목록캐시설정] = useState<Record<string, string[]>>({});
  const [activeTab, setActiveTab] = useState('기본'); // '기본', '소속', '급여'
  const [신규직원, 신규직원설정] = useState(() => createEmptyStaffForm(선택사업체 ?? undefined));
  const [showSalaryHistoryModal, setShowSalaryHistoryModal] = useState(false);
  const [targetSalaryInput, setTargetSalaryInput] = useState('');
  const [targetNightHoursInput, setTargetNightHoursInput] = useState('');
  const previewMinimumWageYear = Math.max(2025, new Date().getFullYear());
  const previewMinimumWage = getMinimumWageByYear(previewMinimumWageYear);

  const reverseCalculateSplit = useMemo(() => {
    const target = parseInt(targetSalaryInput.replace(/,/g, ''), 10) || 0;
    if (target <= 0) return null;

    const allowances =
      Number(신규직원.meal_allowance || 0) +
      Number(신규직원.vehicle_allowance || 0) +
      Number(신규직원.childcare_allowance || 0) +
      Number(신규직원.research_allowance || 0) +
      Number(신규직원.other_taxfree || 0) +
      Number(신규직원.position_allowance || 0);

    const rem = target - allowances;
    if (rem <= 0) {
      return {
        isValid: false,
        message: '고정 수당 합계가 목표 월급보다 큽니다. 고정 수당을 조정하거나 목표 월급을 높여주세요.' };
    }

    const wHours = Number(신규직원.working_hours_per_week || 40);
    const nHours = Number(targetNightHoursInput || 0);

    let hBase = getMonthlyWorkingHours(wHours);
    let hOver = 0;

    const primaryShift = 근무형태목록.find(s => String(s.id) === String(신규직원.근무형태ID));
    const isAlternateDayShift = primaryShift?.shift_type === '1일근무1일휴무';

    if (isAlternateDayShift) {
      const dailyHours = wHours / 3.5;
      const dailyOvertime = Math.max(0, dailyHours - 8);
      const weeklyBase = Math.min(8, dailyHours) * 3.5;
      const weeklyOvertime = dailyOvertime * 3.5;

      hBase = getMonthlyWorkingHours(weeklyBase);
      hOver = weeklyOvertime * 4.345 * 1.5;
    } else if (wHours > 40) {
      hBase = 209;
      hOver = (wHours - 40) * 4.345 * 1.5;
    }

    const hNight = nHours * 4.345 * 0.5;
    const totalHours = hBase + hOver + hNight;
    const derivedHourlyRate = Math.ceil(rem / totalHours);

    if (derivedHourlyRate < previewMinimumWage) {
      const minRem = Math.ceil(totalHours * previewMinimumWage);
      const minTarget = minRem + allowances;
      return {
        isValid: false,
        derivedHourlyRate,
        minTarget,
        message: `최저시급 미달 (역산시급: ${derivedHourlyRate.toLocaleString()}원 / 기준: ${previewMinimumWage.toLocaleString()}원). 최소 세전 ${minTarget.toLocaleString()}원 이상 입력하셔야 합니다.` };
    }

    const calculatedBase = Math.floor(derivedHourlyRate * hBase);
    const calculatedAgreedNight = Math.floor(derivedHourlyRate * hNight);
    const calculatedAgreedOvertime = rem - calculatedBase - calculatedAgreedNight;

    return {
      isValid: true,
      derivedHourlyRate,
      base_salary: calculatedBase,
      agreed_overtime_allowance: calculatedAgreedOvertime,
      agreed_night_allowance: calculatedAgreedNight,
      message: `최저시급 준수 완료 (역산시급: ${derivedHourlyRate.toLocaleString()}원)` };
  }, [targetSalaryInput, targetNightHoursInput, 신규직원.meal_allowance, 신규직원.vehicle_allowance, 신규직원.childcare_allowance, 신규직원.research_allowance, 신규직원.other_taxfree, 신규직원.position_allowance, 신규직원.working_hours_per_week, 신규직원.근무형태ID, 근무형태목록, previewMinimumWage]);

  const handleApplySplit = () => {
    if (!reverseCalculateSplit || !reverseCalculateSplit.isValid) {
      toast('역산 조건이 맞지 않습니다. 입력값을 확인하세요.', 'warning');
      return;
    }
    신규직원설정((prev) => ({
      ...prev,
      base_salary: reverseCalculateSplit.base_salary || 0,
      agreed_overtime_allowance: reverseCalculateSplit.agreed_overtime_allowance || 0,
      agreed_night_allowance: reverseCalculateSplit.agreed_night_allowance || 0 }));
    toast('기본급과 약정수당이 최적의 법적 비율로 분할 적용되었습니다.');
  };
  // staff_licenses 연동: staff_id별 면허 rows. 자격안전센터와 공유하는 단일 기준값.
  const [licensesByStaff, licensesByStaff설정] = useState<Record<string, StaffLicenseRow[]>>({});
  // 편집 중인 직원의 첫 번째 면허 row id (없으면 null → 저장 시 insert)
  const [편집중면허ID, 편집중면허ID설정] = useState<string | null>(null);
  const [프로필사진파일, 프로필사진파일설정] = useState<File | null>(null);
  const [프로필사진미리보기, 프로필사진미리보기설정] = useState<string | null>(null);
  const previousModalOpenRef = useRef(false);
  const [companySelectOptions, setCompanySelectOptions] = useState<string[]>([]);
  // 직원목록에서 회사 목록 동적 생성
  const 회사목록 = useMemo(
    () => Array.from(new Set(직원목록.map((s) => s.company).filter(Boolean))).sort() as string[],
    [직원목록],
  );

  /*
  const availableCompanyOptions = useMemo(
    () =>
      Array.from(
        new Set([
          ...companySelectOptions,
          ...직원목록.map((s) => s.company).filter(Boolean),
        ]),
      ).sort() as string[],
    [companySelectOptions, 직원목록],
  );

  );
  */

  const availableCompanyOptions = useMemo(
    () => Array.from(new Set([...companySelectOptions, ...회사목록])).sort() as string[],
    [companySelectOptions, 회사목록],
  );

  const taxableSalaryTotal = useMemo(
    () =>
      TAXABLE_SALARY_FIELDS.reduce(
        (sum, { key }) => sum + Number(신규직원[key as keyof typeof 신규직원] || 0),
        0,
      ),
    [신규직원],
  );
  const taxfreeSalaryTotal = useMemo(
    () =>
      TAXFREE_SALARY_FIELDS.reduce(
        (sum, { key }) => sum + Number(신규직원[key as keyof typeof 신규직원] || 0),
        0,
      ),
    [신규직원],
  );
  const totalSalaryAmount = taxableSalaryTotal + taxfreeSalaryTotal;
  const ordinarySalaryTotal = useMemo(() => {
    const base = Number(신규직원.base_salary || 0);
    const position = Number(신규직원.position_allowance || 0);
    const agreedOvertime = Number(신규직원.agreed_overtime_allowance || 0);
    const agreedNight = Number(신규직원.agreed_night_allowance || 0);
    const meal = Number(신규직원.meal_allowance || 0);
    const vehicle = Number(신규직원.vehicle_allowance || 0);
    const childcare = Number(신규직원.childcare_allowance || 0);
    const research = Number(신규직원.research_allowance || 0);
    const otherTaxfree = Number(신규직원.other_taxfree || 0);
    return base + position + agreedOvertime + agreedNight + meal + vehicle + childcare + research + otherTaxfree;
  }, [
    신규직원.base_salary,
    신규직원.position_allowance,
    신규직원.agreed_overtime_allowance,
    신규직원.agreed_night_allowance,
    신규직원.meal_allowance,
    신규직원.vehicle_allowance,
    신규직원.childcare_allowance,
    신규직원.research_allowance,
    신규직원.other_taxfree,
  ]);
  const primaryShift = useMemo(
    () => 근무형태목록.find(s => String(s.id) === String(신규직원.근무형태ID)),
    [근무형태목록, 신규직원.근무형태ID]
  );
  const isAlternateDayShift = !!(primaryShift?.shift_type === '1일근무1일휴무');

  const monthlyWorkingHours = useMemo(
    () => getMonthlyWorkingHours(신규직원.working_hours_per_week, isAlternateDayShift),
    [신규직원.working_hours_per_week, isAlternateDayShift],
  );
  const rawHourlySalaryAmount = useMemo(
    () => calculateHourlyRateFromMonthlySalary(ordinarySalaryTotal, 신규직원.working_hours_per_week, 'ceil', isAlternateDayShift),
    [신규직원.working_hours_per_week, ordinarySalaryTotal, isAlternateDayShift],
  );
  const hasHourlyPremiumAdjustments = useMemo(
    () =>
      Number(신규직원.overtime_allowance || 0) > 0 ||
      Number(신규직원.night_work_allowance || 0) > 0 ||
      Number(신규직원.holiday_work_allowance || 0) > 0 ||
      Number(신규직원.annual_leave_pay || 0) > 0 ||
      taxfreeSalaryTotal > 0,
    [
      신규직원.annual_leave_pay,
      신규직원.holiday_work_allowance,
      신규직원.night_work_allowance,
      신규직원.overtime_allowance,
      taxfreeSalaryTotal,
    ],
  );
  const hourlySalaryUsesMinimumFloor = useMemo(
    () =>
      monthlyWorkingHours > MONTHLY_STANDARD_HOURS &&
      hasHourlyPremiumAdjustments &&
      rawHourlySalaryAmount < previewMinimumWage,
    [hasHourlyPremiumAdjustments, monthlyWorkingHours, previewMinimumWage, rawHourlySalaryAmount],
  );
  const hourlySalaryAmount = useMemo(
    () => (hourlySalaryUsesMinimumFloor ? previewMinimumWage : rawHourlySalaryAmount),
    [hourlySalaryUsesMinimumFloor, previewMinimumWage, rawHourlySalaryAmount],
  );

  const parsedShiftMeta = useMemo(() => {
    if (!primaryShift) return null;
    const description = String(primaryShift.description || '');
    const marker = '[SHIFT_META]';
    const markerIndex = description.lastIndexOf(marker);
    if (markerIndex === -1) {
      return {
        shift_type: primaryShift.shift_type || null,
        weekly_work_days: primaryShift.weekly_work_days || 5,
        is_weekend_work: primaryShift.is_weekend_work || false,
        daily_schedules: null as any,
        break_plans: null as any };
    }
    try {
      const metaText = description.slice(markerIndex + marker.length).trim();
      const parsed = JSON.parse(metaText);
      return {
        shift_type: parsed.shift_type || primaryShift.shift_type || null,
        weekly_work_days: parsed.weekly_work_days ?? primaryShift.weekly_work_days ?? 5,
        is_weekend_work: parsed.is_weekend_work ?? primaryShift.is_weekend_work ?? false,
        daily_schedules: parsed.daily_schedules || null,
        break_plans: parsed.break_plans || null };
    } catch {
      return {
        shift_type: primaryShift.shift_type || null,
        weekly_work_days: primaryShift.weekly_work_days || 5,
        is_weekend_work: primaryShift.is_weekend_work || false,
        daily_schedules: null as any,
        break_plans: null as any };
    }
  }, [primaryShift]);



  const calculateDailyNightHours = (start?: string, end?: string) => {
    if (!start || !end) return 0;
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return 0;
    const sMins = sh * 60 + sm;
    let eMins = eh * 60 + em;
    if (eMins <= sMins) {
      eMins += 24 * 60; // Overnight
    }
    
    let nightMins = 0;
    for (let m = sMins; m < eMins; m++) {
      const modM = m % (24 * 60);
      if (modM >= 22 * 60 || modM < 6 * 60) {
        nightMins++;
      }
    }
    return nightMins / 60;
  };

  const allowanceRecommendations = useMemo(() => {
    const weeklyHours = Number(신규직원.working_hours_per_week || 40);
    const weeklyDays = Number(신규직원.working_days_per_week || 5);
    const hourlyRate = hourlySalaryAmount || previewMinimumWage;
    
    // 1. 약정연장수당
    const dailyHours = isAlternateDayShift ? (weeklyHours / 3.5) : (weeklyHours / weeklyDays);
    let weeklyOvertime = 0;
    if (isAlternateDayShift) {
      weeklyOvertime = Math.max(0, dailyHours - 8) * 3.5;
    } else {
      weeklyOvertime = Math.max(0, weeklyHours - 40);
    }
    const monthlyOvertimeHours = weeklyOvertime * 4.345;
    const recommendedAgreedOvertime = Math.round(hourlyRate * monthlyOvertimeHours * 1.5);
    const showAgreedOvertime = monthlyOvertimeHours > 0;

    // 2. 약정야간수당
    let weeklyNightHours = 0;
    if (parsedShiftMeta?.daily_schedules) {
      const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      days.forEach(day => {
        const sched = parsedShiftMeta.daily_schedules[day];
        if (sched?.enabled) {
          weeklyNightHours += calculateDailyNightHours(sched.start_time, sched.end_time);
        }
      });
    } else if (primaryShift) {
      const dailyNight = calculateDailyNightHours(primaryShift.start_time, primaryShift.end_time);
      weeklyNightHours = dailyNight * (primaryShift.weekly_work_days || 5);
    }
    const monthlyNightHours = weeklyNightHours * 4.345;
    const recommendedAgreedNight = Math.round(hourlyRate * monthlyNightHours * 0.5);
    const showAgreedNight = monthlyNightHours > 0;

    // 3. 휴일근로수당
    let weeklyHolidayHours = 0;
    const isWeekendWork = !!(parsedShiftMeta?.is_weekend_work || primaryShift?.is_weekend_work);
    if (parsedShiftMeta?.daily_schedules) {
      ['sat', 'sun'].forEach(day => {
        const sched = parsedShiftMeta.daily_schedules[day];
        if (sched?.enabled) {
          const start = sched.start_time || primaryShift?.start_time || '09:00';
          const end = sched.end_time || primaryShift?.end_time || '18:00';
          const [sh, sm] = start.split(':').map(Number);
          const [eh, em] = end.split(':').map(Number);
          if (!isNaN(sh) && !isNaN(eh)) {
            let diff = (eh * 60 + em - (sh * 60 + sm)) / 60;
            if (diff <= 0) diff += 24;
            
            let breakDiff = 1;
            if (primaryShift?.break_start_time && primaryShift?.break_end_time) {
              const [bsh, bsm] = primaryShift.break_start_time.split(':').map(Number);
              const [beh, bem] = primaryShift.break_end_time.split(':').map(Number);
              if (!isNaN(bsh) && !isNaN(beh)) {
                const bdiff = (beh * 60 + bem - (bsh * 60 + bsm)) / 60;
                if (bdiff > 0) breakDiff = bdiff;
              }
            }
            weeklyHolidayHours += Math.max(0, diff - breakDiff);
          }
        }
      });
    } else if (isWeekendWork && primaryShift) {
      const start = primaryShift.start_time || '09:00';
      const end = primaryShift.end_time || '18:00';
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      if (!isNaN(sh) && !isNaN(eh)) {
        let diff = (eh * 60 + em - (sh * 60 + sm)) / 60;
        if (diff <= 0) diff += 24;
        let breakDiff = 1;
        if (primaryShift.break_start_time && primaryShift.break_end_time) {
          const [bsh, bsm] = primaryShift.break_start_time.split(':').map(Number);
          const [beh, bem] = primaryShift.break_end_time.split(':').map(Number);
          if (!isNaN(bsh) && !isNaN(beh)) {
            const bdiff = (beh * 60 + bem - (bsh * 60 + bsm)) / 60;
            if (bdiff > 0) breakDiff = bdiff;
          }
        }
        weeklyHolidayHours = Math.max(0, diff - breakDiff);
      }
    }
    const monthlyHolidayHours = weeklyHolidayHours * 4.345;
    const recommendedHoliday = Math.round(hourlyRate * monthlyHolidayHours * 1.5);
    const showHoliday = monthlyHolidayHours > 0;

    // 4. 연차휴가수당
    const annualLeaves = Number(신규직원.연차총개수 || 0);
    const recommendedAnnualLeave = Math.round((annualLeaves / 12) * 8 * hourlyRate);
    const showAnnualLeave = annualLeaves > 0;

    return {
      agreedOvertime: {
        show: showAgreedOvertime,
        hours: monthlyOvertimeHours,
        amount: recommendedAgreedOvertime,
        dailyOvertime: isAlternateDayShift ? Math.max(0, dailyHours - 8) : 0,
        dailyHours },
      agreedNight: {
        show: showAgreedNight,
        hours: monthlyNightHours,
        amount: recommendedAgreedNight },
      holiday: {
        show: showHoliday,
        hours: monthlyHolidayHours,
        amount: recommendedHoliday },
      annualLeave: {
        show: showAnnualLeave,
        amount: recommendedAnnualLeave }
    };
  }, [신규직원.working_hours_per_week, 신규직원.working_days_per_week, 신규직원.연차총개수, hourlySalaryAmount, isAlternateDayShift, parsedShiftMeta, primaryShift, previewMinimumWage]);

  // ESS (직원 셀프 서비스) 승인 대기함 관련
  const [essRequests, setEssRequests] = useState<any[]>([]);
  /**
   * ESS 대기함 "조회 실패" 상태.
   *
   * db-client 는 실패해도 reject 하지 않고 { data: null, error } 로 resolve 한다.
   * error 를 버리면 403/500 도 빈 배열과 구분되지 않아 화면에 "대기 중인 요청이 없습니다"로
   * 표시되고, 실제로는 승인 대기 중인 요청이 방치된다. 실패를 별도 상태로 남긴다.
   */
  const [essLoadError, setEssLoadError] = useState<string | null>(null);
  // 같은 조회 실패로 토스트가 반복되는 것을 막기 위한 최근 통지 메시지(effect 의존성이 자주 바뀜)
  const essLoadErrorNotifiedRef = useRef<string | null>(null);
  const [showEssModal, setShowEssModal] = useState(false);
  const [pendingEssAction, setPendingEssAction] = useState<{
    type: 'approve' | 'reject';
    request: Record<string, unknown>;
  } | null>(null);
  const [pendingRetirementStaff, setPendingRetirementStaff] = useState<StaffMember | null>(null);
  const [pendingDeleteStaff, setPendingDeleteStaff] = useState<StaffMember | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [staffNameSearchInput, setStaffNameSearchInput] = useState('');
  const [appliedStaffNameSearch, setAppliedStaffNameSearch] = useState('');

  const 한글정렬 = (a: string, b: string) => a.localeCompare(b, 'ko');

  const normalizeEmployeeNoForSort = (value: unknown) => {
    const raw = String(value ?? '').trim();
    const digitsOnly = raw.replace(/[^0-9]/g, '');

    if (digitsOnly && digitsOnly.length === raw.length) {
      return {
        isNumeric: true,
        numericValue: Number(digitsOnly),
        textValue: raw };
    }

    return {
      isNumeric: false,
      numericValue: Number.POSITIVE_INFINITY,
      textValue: raw };
  };

  // 다중 근무형태(주간 로테이션) 헬퍼 (JM4)
  const getShiftCompanyName = (shift: StaffMember) =>
    String(shift?.company_name || shift?.company || '').trim();
  const sortShiftOptions = (list: StaffMember[]) =>
    [...list].sort((a: StaffMember, b: StaffMember) => 한글정렬(a?.name || '', b?.name || ''));
  const normalizeShiftIdList = (values: unknown[]): string[] =>
    Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
  const getStaffFormShiftIds = (form: typeof 신규직원): string[] =>
    normalizeShiftIdList([
      form.근무형태ID,
      ...(Array.isArray(form.근무형태IDs) ? form.근무형태IDs : []),
    ]);
  const findShiftById = (shiftId: string) =>
    근무형태목록.find((shift: StaffMember) => String(shift.id) === String(shiftId));
  const getVisibleShiftOptions = (companyName: string) => {
    const selectedCompany = String(companyName || '').trim();
    const visibleList = 근무형태목록.filter((shift: StaffMember) => {
      // is_active가 false이거나 0(D1 소프트삭제)인 경우를 안전하게 판정하여 비활성 항목 제외
      const isActive = shift?.is_active !== false && shift?.is_active !== 0 && shift?.is_active !== 'false';
      const shiftCompany = getShiftCompanyName(shift);
      return isActive && (!selectedCompany || !shiftCompany || shiftCompany === selectedCompany);
    });

    const seen = new Set<string>();
    const uniqueList: StaffMember[] = [];
    for (const shift of visibleList) {
      const name = String(shift?.name || '').trim();
      const comp = getShiftCompanyName(shift);
      const start = String(shift?.start_time || '').trim();
      const end = String(shift?.end_time || '').trim();
      const key = `${name}|${comp}|${start}|${end}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueList.push(shift);
      }
    }

    return sortShiftOptions(uniqueList);
  };

  const 선택근무형태IDs = useMemo(
    () => getStaffFormShiftIds(신규직원),
     
    [신규직원.근무형태ID, 신규직원.근무형태IDs],
  );
  const 추가가능근무형태목록 = useMemo(
    () =>
      getVisibleShiftOptions(신규직원.사업체).filter(
        (shift: StaffMember) => !선택근무형태IDs.includes(String(shift.id)),
      ),
     
    [신규직원.사업체, 선택근무형태IDs, 근무형태목록],
  );

  // 선택된 근무형태들의 시간·일수 평균을 계산 (JM4: 순수 헬퍼 lib/shift-working-hours 재사용)
  // 근무형태를 1개만 넣으면 그 형태값, 여러 개(또는 중복)면 평균값을 상세 근로시간에 주입한다.
  const 선택형태평균계산 = (shiftIds: string[]) => {
    const shifts = shiftIds
      .map((id) => findShiftById(id))
      .filter((shift): shift is StaffMember => Boolean(shift))
      .map((shift) => shift as unknown as WorkShift);
    return averageShiftHoursAndDays(shifts);
  };

  const 대표근무형태설정 = (shiftId: string) => {
    try {
      const nextShiftId = String(shiftId || '').trim();
      신규직원설정((prev) => {
        if (!nextShiftId) {
          return { ...prev, 근무형태ID: '', 근무형태IDs: [] };
        }
        const previousPrimary = String(prev.근무형태ID || '').trim();
        const restShiftIds = getStaffFormShiftIds(prev).filter(
          (id) => id !== previousPrimary && id !== nextShiftId,
        );
        const nextIds = [nextShiftId, ...restShiftIds];
        const { hours, days } = 선택형태평균계산(nextIds);
        return {
          ...prev,
          근무형태ID: nextShiftId,
          근무형태IDs: nextIds,
          working_hours_per_week: hours,
          working_days_per_week: days };
      });
    } catch (error) {
      console.error('대표 근무형태 설정 실패:', error);
      toast('근무형태 변경 중 오류가 발생했습니다.', 'error');
    }
  };

  const 추가근무형태선택창열기 = () => {
    const nextDefault = 추가가능근무형태목록[0]?.id ? String(추가가능근무형태목록[0].id) : '';
    추가근무형태ID설정(nextDefault);
    새근무형태표시설정((value) => !value);
  };

  const 추가근무형태반영 = () => {
    try {
      const shiftId = String(추가근무형태ID || '').trim();
      if (!shiftId) {
        toast('추가할 근무형태를 선택하세요.', 'warning');
        return;
      }
      신규직원설정((prev) => {
        const currentIds = getStaffFormShiftIds(prev);
        if (currentIds.includes(shiftId)) return prev;
        const nextIds = currentIds.length > 0 ? [...currentIds, shiftId] : [shiftId];
        const { hours, days } = 선택형태평균계산(nextIds);
        return {
          ...prev,
          근무형태ID: nextIds[0] || '',
          근무형태IDs: nextIds,
          working_hours_per_week: hours,
          working_days_per_week: days };
      });
      추가근무형태ID설정('');
      새근무형태표시설정(false);
    } catch (error) {
      console.error('근무형태 추가 실패:', error);
      toast('근무형태 추가 중 오류가 발생했습니다.', 'error');
    }
  };

  const 근무형태제거 = (shiftId: string) => {
    try {
      신규직원설정((prev) => {
        const nextIds = getStaffFormShiftIds(prev).filter((id) => id !== shiftId);
        if (nextIds.length === 0) {
          return { ...prev, 근무형태ID: '', 근무형태IDs: [] };
        }
        const { hours, days } = 선택형태평균계산(nextIds);
        return {
          ...prev,
          근무형태ID: nextIds[0] || '',
          근무형태IDs: nextIds,
          working_hours_per_week: hours,
          working_days_per_week: days };
      });
    } catch (error) {
      console.error('근무형태 제거 실패:', error);
      toast('근무형태 제거 중 오류가 발생했습니다.', 'error');
    }
  };

  useEffect(() => {
    const loadCompanyOptions = async () => {
      const { data, error } = await db
        .from('companies')
        .select('name, is_active')
        .eq('is_active', true)
        .order('name');

      if (!error && data) {
        setCompanySelectOptions(
          data.map((row: any) => row.name).filter(Boolean) as string[],
        );
      }
    };

    loadCompanyOptions();
  }, []);

  useEffect(() => {
    const fetchEssRequests = async () => {
      // 1. 먼저 보류 중인 모든 요청을 가져옴
      // 서버 사이드 필터: 해당 사업체 직원 ID 목록으로 직접 필터링 (N+1 제거)
      // 사업체 선택이 '전체'(또는 미지정)이면 **전 회사** 직원을 대상으로 한다.
      //
      // 예전에는 `s.company === 선택사업체` 단독 비교라, 기본값인 '전체' 에서는
      // 어느 직원도 매칭되지 않아 staffIdsInCompany 가 항상 빈 배열이 됐고
      // ESS 변경요청 대기함이 **영구히 0건**으로 보였다.
      // MSO 구조상 모회사가 자회사 직원 요청까지 처리해야 하므로 전체 조회가 기본이다.
      const 사업체필터 = String(선택사업체 ?? '').trim();
      const 전체보기 = !사업체필터 || 사업체필터 === '전체';
      const staffIdsInCompany = 직원목록
        .filter((s: StaffMember) => 전체보기 || s.company === 사업체필터)
        .map((s: StaffMember) => s.id);

      if (staffIdsInCompany.length === 0) {
        setEssRequests([]);
        setEssLoadError(null);
        essLoadErrorNotifiedRef.current = null;
        return;
      }

      // error 를 반드시 받는다. audit_logs 는 ADMIN_ONLY 라 권한이 없으면 403 이 오는데,
      // 예전 코드는 error 를 버리고 data(null)만 보아 "요청 없음"으로 위장했다.
      const { data: logs, error: logsError } = await db
        .from('audit_logs')
        .select('*')
        .eq('target_type', 'ESS_PROFILE_UPDATE_PENDING')
        .in('target_id', staffIdsInCompany)
        .order('created_at', { ascending: false })
        .limit(200);

      if (logsError) {
        const message =
          (logsError as { message?: string } | null)?.message || '알 수 없는 오류';
        console.error('ESS 변경 요청 대기함 조회 실패:', logsError);
        setEssRequests([]);
        setEssLoadError(message);
        // 의존성(직원목록)이 자주 바뀌므로 같은 메시지로는 한 번만 알린다.
        if (essLoadErrorNotifiedRef.current !== message) {
          essLoadErrorNotifiedRef.current = message;
          toast(`내정보 변경 요청 목록을 불러오지 못했습니다: ${message}`, 'error');
        }
        return;
      }

      setEssLoadError(null);
      essLoadErrorNotifiedRef.current = null;
      setEssRequests(logs ?? []);
    };
    fetchEssRequests();
  }, [새로고침, 선택사업체, 직원목록]);

  const getEssReviewChanges = (request: Record<string, unknown>) => {
    const details = (request.details as Record<string, unknown> | undefined) || {};
    const changes = (details.requested_changes as Record<string, unknown> | undefined) || {};
    const original = (details.original_data as Record<string, unknown> | undefined) || {};

    return Object.keys(changes)
      .filter((key) => JSON.stringify(changes[key] ?? null) !== JSON.stringify(original[key] ?? null))
      .map((key) => ({
        label: ESS_FIELD_LABELS[key] || key,
        before: typeof original[key] === 'object' ? JSON.stringify(original[key]) : String(original[key] ?? '(빈 값)'),
        after: typeof changes[key] === 'object' ? JSON.stringify(changes[key]) : String(changes[key] ?? '(빈 값)') }));
  };

  /**
   * ESS 요청에서 "직원이 실제로 바꾸려는" 필드인지 판정한다.
   *
   * lib/profile-change-request.ts 의 requestedChanges 는 직원이 건드리지 않은 항목까지
   * 항상 모든 키(email/phone/address/bank_account/bank_name/permissions)를 담는다.
   * 따라서 키 존재 여부만 보고 덮어쓰면, 요청 제출 이후 HR 이 따로 고친 값이
   * 요청 당시 값으로 롤백되거나 NULL 로 지워진다. original_data 와 다른 항목만 반영한다.
   * (대기함 UI 의 getEssReviewChanges 와 동일한 비교 기준을 쓴다.)
   */
  const isEssFieldChanged = (
    changes: Record<string, unknown>,
    original: Record<string, unknown>,
    key: string,
  ) =>
    Object.prototype.hasOwnProperty.call(changes, key) &&
    JSON.stringify(changes[key] ?? null) !== JSON.stringify(original[key] ?? null);

  const readEssErrorMessage = (error: unknown) =>
    (error as { message?: string } | null)?.message || String(error || '알 수 없는 오류');

  const handleApproveEssSafe = async (request: Record<string, unknown>) => {
    try {
      const details = (request.details as Record<string, unknown> | undefined) || {};
      const updates = (details.requested_changes as Record<string, unknown> | undefined) || {};
      const original = (details.original_data as Record<string, unknown> | undefined) || {};
      const { data: staffRow, error: staffLoadError } = await db
        .from('staff_members')
        .select('permissions')
        .eq('id', request.target_id)
        .maybeSingle();

      if (staffLoadError) throw staffLoadError;

      const currentPermissions =
        staffRow?.permissions && typeof staffRow.permissions === 'object' && !Array.isArray(staffRow.permissions)
          ? (staffRow.permissions as Record<string, unknown>)
          : {};
      const requestedPermissions =
        updates.permissions && typeof updates.permissions === 'object' && !Array.isArray(updates.permissions)
          ? (updates.permissions as Record<string, unknown>)
          : {};
      const originalPermissions =
        original.permissions && typeof original.permissions === 'object' && !Array.isArray(original.permissions)
          ? (original.permissions as Record<string, unknown>)
          : {};

      // 요청에 실제로 담겨 "바뀐" 컬럼만 payload 에 넣는다. 나머지는 아예 제외해야
      // HR 이 그 사이 수정한 값이 보존된다.
      const updatePayload: Record<string, unknown> = {};
      for (const column of ['email', 'phone', 'address', 'bank_account', 'bank_name'] as const) {
        if (isEssFieldChanged(updates, original, column)) {
          updatePayload[column] = (updates[column] as string | null | undefined) ?? null;
        }
      }

      /*
       * 내선번호는 ESS 요청이 permissions.extension 에만 담는다.
       * 하지만 HR 등록 경로는 staff_members.extension 컬럼에 직접 쓰고, 조회
       * (lib/staff-meta.ts getStaffExtension)는 컬럼을 우선한다.
       * permissions 만 갱신하면 승인해도 화면에 옛 컬럼 값이 계속 보이므로 둘 다 맞춘다.
       * (extension 컬럼은 lib/db/schema.ts staff_members 에 존재함을 확인함)
       */
      const requestedExtension = Object.prototype.hasOwnProperty.call(requestedPermissions, 'extension')
        ? ((requestedPermissions.extension as string | null | undefined) ?? null)
        : undefined;
      const originalExtension =
        (original.extension as string | null | undefined) ??
        (originalPermissions.extension as string | null | undefined) ??
        null;
      const extensionChanged =
        requestedExtension !== undefined &&
        JSON.stringify(requestedExtension) !== JSON.stringify(originalExtension);

      if (extensionChanged) {
        updatePayload.extension = requestedExtension ?? null;
      }

      /*
       * permissions 는 admin 전용 컬럼(lib/db/auth/policies.ts staffPrivilegeGuard)이라
       * 실제로 값이 바뀔 때만 payload 에 넣는다. 또한 ESS 가 소유하는 키(extension)만
       * 현재 DB 값 위에 덧씌워, 요청 이후 바뀐 다른 권한 값이 롤백되지 않게 한다.
       */
      if (extensionChanged) {
        updatePayload.permissions = {
          ...currentPermissions,
          extension: requestedExtension ?? null };
      }

      const runStaffUpdate = (payload: Record<string, unknown>) =>
        db.from('staff_members').update(payload).eq('id', request.target_id);

      if (Object.keys(updatePayload).length > 0) {
        const mutationPayload: Record<string, unknown> = { ...updatePayload };
        let updateResult = await runStaffUpdate(mutationPayload);

        // extension 컬럼이 없는 스키마라면 컬럼 없이 재시도한다(값은 permissions.extension 에 남는다).
        if (
          updateResult.error &&
          'extension' in mutationPayload &&
          isMissingColumnError(updateResult.error, 'extension')
        ) {
          delete mutationPayload.extension;
          updateResult = await runStaffUpdate(mutationPayload);
        }

        // bank_name 컬럼이 없는 스키마라면 permissions.bank_name 으로 우회 저장한다(기존 동작 유지).
        if (
          updateResult.error &&
          'bank_name' in mutationPayload &&
          isMissingColumnError(updateResult.error, 'bank_name')
        ) {
          const fallbackBankName = mutationPayload.bank_name;
          delete mutationPayload.bank_name;
          const basePermissions =
            mutationPayload.permissions && typeof mutationPayload.permissions === 'object' && !Array.isArray(mutationPayload.permissions)
              ? (mutationPayload.permissions as Record<string, unknown>)
              : currentPermissions;
          mutationPayload.permissions = {
            ...basePermissions,
            bank_name: (fallbackBankName as string | null | undefined) ?? null };
          updateResult = await runStaffUpdate(mutationPayload);
        }

        // 실패를 삼키면 목록에서만 사라지고 새로고침 시 다시 나타나 중복 승인(중복 덮어쓰기)이 된다.
        if (updateResult.error) throw updateResult.error;
      }

      // 상태 전환이 실패하면 요청은 여전히 대기 상태다. 목록에서 지우지 않도록 여기서도 throw 한다.
      const statusUpdate = await db
        .from('audit_logs')
        .update({
          target_type: 'ESS_PROFILE_UPDATE_APPROVED',
          details: {
            ...details,
            approved_at: new Date().toISOString() } })
        .eq('id', request.id);

      if (statusUpdate.error) throw statusUpdate.error;

      toast('승인했습니다.');
      setEssRequests(prev => prev.filter(r => r.id !== request.id));
      새로고침?.();
    } catch (error) {
      console.error('ESS profile approve failed:', error);
      // 낙관적 제거 금지: 목록을 그대로 두고 실패를 알린다.
      toast(`승인 처리에 실패했습니다: ${readEssErrorMessage(error)}`, 'error');
    }
  };

  const handleRejectEss = async (request: Record<string, unknown>) => {
    try {
      const { error } = await db
        .from('audit_logs')
        .update({ target_type: 'ESS_PROFILE_UPDATE_REJECTED' })
        .eq('id', request.id);

      // db-client 는 실패해도 reject 하지 않으므로 error 를 직접 확인해야 한다.
      // 확인하지 않으면 반려 실패인데도 목록에서 사라져 요청이 방치된다.
      if (error) throw error;

      toast('반려되었습니다.');
      setEssRequests(prev => prev.filter(r => r.id !== request.id));
    } catch (error) {
      console.error('ESS profile reject failed:', error);
      toast(`반려 처리에 실패했습니다: ${readEssErrorMessage(error)}`, 'error');
    }
  };

  useEffect(() => {
    const fetchShifts = async () => {
      const { data } = await db.from('work_shifts').select('*');
      if (data) {
        근무형태목록설정(
          [...data].sort((a: StaffMember, b: StaffMember) => 한글정렬(a?.name || '', b?.name || ''))
        );
      }
    };
    fetchShifts();
  }, []);

  useEffect(() => {
    if (근무형태목록.length === 0) return; // 근무형태 목록이 아직 비어 있으면 필터링 처리를 보류한다.

    const visibleShiftIds = new Set(
      getVisibleShiftOptions(신규직원.사업체).map((shift: StaffMember) => String(shift.id)),
    );
    const filteredIds = 선택근무형태IDs.filter((shiftId) => visibleShiftIds.has(shiftId));
    if (
      filteredIds.length !== 선택근무형태IDs.length ||
      신규직원.근무형태ID !== (filteredIds[0] || '')
    ) {
      신규직원설정((prev) => ({
        ...prev,
        근무형태ID: filteredIds[0] || '',
        근무형태IDs: filteredIds }));
    }
     
  }, [신규직원.사업체, 선택근무형태IDs.join('|'), 근무형태목록]);

  useEffect(() => {
    const fetchTeams = async () => {
      const { data } = await db.from('org_teams').select('company_name, team_name, division').order('division').order('sort_order');
      if (!data) return;
      const byCo: Record<string, string[]> = {};
      (data as { company_name: string; team_name: string; division?: string }[]).forEach((r) => {
        if (!byCo[r.company_name]) byCo[r.company_name] = [];
        byCo[r.company_name].push(r.team_name);
      });
      팀목록캐시설정(byCo);
    };
    fetchTeams();
  }, [새로고침]);

  // 직원목록의 staff_licenses를 일괄 조회·그룹핑 (자격안전센터와 동기화). 새로고침 시에도 갱신.
  useEffect(() => {
    let cancelled = false;
    const loadLicenses = async () => {
      const staffIds = 직원목록.map((staff: StaffMember) => staff.id).filter(Boolean);
      const grouped = await fetchStaffLicensesGrouped(staffIds);
      if (!cancelled) licensesByStaff설정(grouped);
    };
    loadLicenses();
    return () => {
      cancelled = true;
    };
  }, [직원목록, 새로고침]);

  // 주당 근로시간 변경 시 연차 자동 계산 (비례 산정)
  useEffect(() => {
    const hours = 신규직원.working_hours_per_week || 0;
    if (hours > 0) {
      // (주당 근로시간 / 40) * 8시간 / 8시간(1일 기준) = 연차 일수
      // 1개월 개근 시 발생하는 연차를 기준으로 계산 (단위: 일)
      const calculatedLeave = (hours / 40); // 1일 기준 8시간이므로 단순히 시간 비중만 계산하면 일수가 됨
      // 소수점 첫째 자리까지 반올림 (예: 주 24시간 -> 0.6일)
      const roundedLeave = Math.round(calculatedLeave * 10) / 10;

      // 1년 미만 근로자의 매월 발생하는 연차를 annual_leave_total에 기본값으로 세팅 (사용자가 원하면 수정 가능)
      // 단, 기존 값이 0이거나 편집모드가 아닐 때만 자동 세팅하여 사용자 입력을 방해하지 않음
      if (!편집모드 && 신규직원.연차총개수 === 0) {
        신규직원설정(prev => ({ ...prev, 연차총개수: roundedLeave }));
      }
    }
  }, [신규직원.working_hours_per_week]);

  const 팀목록가져오기 = (회사: string) => {
    if (팀목록캐시[회사]?.length) return 팀목록캐시[회사];
    if (회사 === 'SY INC.') return ['경영지원팀', '진료지원팀', '관리팀', '재무팀', '인사팀', '전략기획팀', '마케팅팀'];
    return ['진료부', '간호부', '총무부', '진료팀', '병동팀', '수술팀', '외래팀', '외래간호팀', '검사팀', '원무팀', '총무팀', '행정팀', '관리팀', '영양팀'];
  };

  const 프로필사진선택 = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast('프로필 사진은 이미지 파일만 등록할 수 있습니다.', 'warning');
      return;
    }

    프로필사진파일설정(file);
    const reader = new FileReader();
    reader.onload = () => {
      프로필사진미리보기설정(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  const 프로필사진업로드 = async (
    staffId: string | number,
    file: File,
    currentStaff?: Record<string, unknown> | null,
  ) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('staffId', String(staffId));

    const response = await fetch('/api/staff/profile-photo/upload', {
      method: 'POST',
      body: formData });
    if (!response.ok) {
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error || '프로필 사진 업로드에 실패했습니다.');
    }
    const result = (await response.json()) as { path: string; url: string; uploadedAt: string };
    const { path: filePath, url: photoUrl, uploadedAt } = result;

    const currentPermissions =
      currentStaff?.permissions && typeof currentStaff.permissions === 'object' && !Array.isArray(currentStaff.permissions)
        ? (currentStaff.permissions as Record<string, unknown>)
        : {};
    const nextPermissions = {
      ...currentPermissions,
      profile_photo_path: filePath,
      profile_photo_updated_at: uploadedAt,
      profile_photo_url: photoUrl };

    const avatarUpdate = await db
      .from('staff_members')
      .update({
        avatar_url: photoUrl,
        photo_url: photoUrl,
        profile_photo_path: filePath,
        profile_photo_updated_at: uploadedAt,
        permissions: nextPermissions,
      })
      .eq('id', String(staffId));

    if (avatarUpdate.error) {
      if (!isMissingColumnError(avatarUpdate.error, 'avatar_url') && !isMissingColumnError(avatarUpdate.error, 'photo_url')) {
        throw avatarUpdate.error;
      }

      const permissionsUpdate = await db
        .from('staff_members')
        .update({ permissions: nextPermissions })
        .eq('id', String(staffId));

      if (permissionsUpdate.error) {
        throw permissionsUpdate.error;
      }
    }

    프로필사진파일설정(null);
    프로필사진미리보기설정(photoUrl);
    return { photoUrl, filePath, uploadedAt };
  };

  const 직원고용형태 = (직원: StaffMember): string => getStaffEmploymentType(직원);
  // staff_licenses 기준 면허 요약 (0건 '-', 1건 이름, N건 'X 외 N-1건')
  const 직원면허요약 = (직원: StaffMember) =>
    summarizeLicenses(licensesByStaff[String(직원.id || '').toLowerCase().trim()]);
  const 직원연락요약 = (직원: StaffMember) => {
    const extension = getStaffExtension(직원);
    const parts = [
      직원?.phone,
      직원?.email,
      extension ? `내선 ${extension}` : '',
    ]
      .map((value) => cleanOptionalText(value))
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : '-';
  };

  useEffect(() => {
    const justOpened = 창상태 && !previousModalOpenRef.current;
    previousModalOpenRef.current = !!창상태;

    if (!justOpened || 편집모드) return;

    const defaultCompany = 선택사업체 && 선택사업체 !== '전체' ? 선택사업체 : '';
    const defaultTeam = 팀목록가져오기(defaultCompany)[0] ?? '원무팀';
    프로필사진파일설정(null);
    프로필사진미리보기설정(null);
    편집중면허ID설정(null);

    신규직원설정({
      ...createEmptyStaffForm(defaultCompany),
      팀: defaultTeam });
    setTargetSalaryInput('');
    setTargetNightHoursInput('');
  }, [창상태, 편집모드, 선택사업체, 팀목록캐시]);

  const findDuplicateStaffMember = async (staffName: string, residentNo: string, excludeId?: string | number | null) => {
    const normalizedName = normalizeStaffName(staffName);
    const normalizedResident = normalizeResidentNo(residentNo);

    if (!normalizedName || !normalizedResident) return null;

    const { data, error } = await db
      .from('staff_members')
      .select('id, name, employee_no, resident_no, status')
      .eq('name', normalizedName);

    if (error) throw error;

    return (data || []).find((staff: any) => {
      if (excludeId != null && String(staff.id) === String(excludeId)) return false;
      return normalizeResidentNo(String(staff.resident_no || '')) === normalizedResident;
    }) || null;
  };

  // 폼의 면허 입력값 → staff_licenses 컬럼 페이로드. license_type/expiry_date/renewed_date/issuing_body는 입력 UI가 없어 생략.
  const buildLicensePayload = () => ({
    license_name: 신규직원.면허사항?.trim() || '',
    license_number: 신규직원.면허번호?.trim() || null,
    issued_date: 신규직원.취득일자?.trim() || null,
    memo: 신규직원.면허기타내용?.trim() || null });
  const hasLicenseInput = () =>
    Boolean(
      신규직원.면허사항?.trim() ||
        신규직원.면허번호?.trim() ||
        신규직원.취득일자?.trim() ||
        신규직원.면허기타내용?.trim(),
    );

  // staff_members 저장 성공 후 staff_licenses upsert. 실패해도 직원 저장은 막지 않고 warning 토스트만 노출(JM3).
  const saveStaffLicense = async (staffId: string): Promise<string | null> => {
    try {
      const payload = buildLicensePayload();
      const hasInput = hasLicenseInput();

      // 입력값이 전부 비어 있으면 무의미한 row를 생성하지 않음
      if (!hasInput) {
        return null;
      }

      let savedLicenseId: string | null = 편집중면허ID;

      if (savedLicenseId) {
        // 1. 이미 편집 중인 면허 ID가 있는 경우 update
        const { error } = await db
          .from('staff_licenses')
          .update(payload)
          .eq('id', savedLicenseId);
        if (error) throw error;
      } else {
        // 2. 편집중면허ID가 없더라도, DB에 이미 해당 staff_id의 면허 row가 있는지 실시간 조회
        const { data: existingLicenses, error: searchError } = await db
          .from('staff_licenses')
          .select('id')
          .eq('staff_id', String(staffId))
          .order('id', { ascending: true });

        if (!searchError && Array.isArray(existingLicenses) && existingLicenses.length > 0) {
          // 기존 면허 row가 이미 있으면 첫 번째 row를 UPDATE (중복 증식 방지)
          savedLicenseId = String(existingLicenses[0].id);
          const { error: updateError } = await db
            .from('staff_licenses')
            .update(payload)
            .eq('id', savedLicenseId);
          if (updateError) throw updateError;
          편집중면허ID설정(savedLicenseId);
        } else {
          // 전혀 없을 때만 신규 INSERT
          savedLicenseId =
            typeof crypto !== 'undefined' && crypto.randomUUID
              ? crypto.randomUUID()
              : `lic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
          const { error: insertError } = await db.from('staff_licenses').insert([
            {
              id: savedLicenseId,
              staff_id: String(staffId),
              ...payload,
              license_name: payload.license_name || '(이름 없음)',
            },
          ]);
          if (insertError) throw insertError;
          편집중면허ID설정(savedLicenseId);
        }
      }

      // staff_members.license 컬럼에도 미러링 동기화
      if (payload.license_name) {
        try {
          await db
            .from('staff_members')
            .update({ license: payload.license_name })
            .eq('id', String(staffId));
        } catch {
          // ignore
        }
      }

      // licensesByStaff 캐시 즉시 동기화
      const cleanStaffId = String(staffId).toLowerCase().trim();
      const refreshedGrouped = await fetchStaffLicensesGrouped([staffId]);
      if (refreshedGrouped[cleanStaffId]) {
        licensesByStaff설정((prev) => ({
          ...prev,
          [cleanStaffId]: refreshedGrouped[cleanStaffId],
        }));
      }

      return null;
    } catch (error) {
      console.error('staff_licenses 저장 실패:', error);
      return '직원 정보는 저장되었지만 면허/자격 정보 저장은 실패했습니다.';
    }
  };

  const 정보저장 = async () => {
    if (!편집모드 && !canRegisterNewStaff) {
      return toast('신규 직원 등록 권한이 없습니다.', 'error');
    }
    if (!신규직원.성명 || !신규직원.입사일 || 신규직원.입사일 === '0000-00-00' || 신규직원.입사일 === '') return toast('성함과 실제 입사일은 필수 입력 사항입니다.', 'warning');
    try {
      const actor = readClientAuditActor();
      let 프로필사진업로드경고: string | null = null;
      const dateOrNull = (val: string) => (val === '0000-00-00' || val === '0000-00' || !val || val === '') ? null : val;
      const duplicateStaff = await findDuplicateStaffMember(
        신규직원.성명,
        신규직원.주민번호,
        편집모드 ? 선택된직원ID : null
      );

      if (duplicateStaff) {
        return toast(
          `같은 이름과 주민번호를 가진 직원이 이미 있습니다. (${duplicateStaff.name} / 사번 ${duplicateStaff.employee_no || '-'} / ${duplicateStaff.status || '재직'})`,
          'warning'
        );
      }

      const weeklyWorkingHours = resolveWeeklyWorkingHours(신규직원, 40);
      const workingDaysPerWeek = resolveWorkingDaysPerWeek(신규직원, 5);

      // 다중 근무형태 ID 정규화 (신버전 동일)
      const selectedShiftIds = getStaffFormShiftIds(신규직원);
      const primaryShiftId = selectedShiftIds[0] || '';
      const existingStaffForPermissions =
        편집모드 && 선택된직원ID
          ? 직원목록.find((s: StaffMember) => String(s.id) === String(선택된직원ID))
          : null;
      const existingPermissions =
        existingStaffForPermissions?.permissions &&
        typeof existingStaffForPermissions.permissions === 'object' &&
        !Array.isArray(existingStaffForPermissions.permissions)
          ? (existingStaffForPermissions.permissions as Record<string, unknown>)
          : {};
      const existingWorkConditions =
        existingPermissions.work_conditions &&
        typeof existingPermissions.work_conditions === 'object' &&
        !Array.isArray(existingPermissions.work_conditions)
          ? (existingPermissions.work_conditions as Record<string, unknown>)
          : {};
      const nextWorkConditions = {
        ...existingWorkConditions,
        working_hours_per_week: weeklyWorkingHours,
        working_days_per_week: workingDaysPerWeek,
        shift_group_ids: selectedShiftIds,
        weekly_rotation_shift_ids: selectedShiftIds.slice(1),
        secondary_shift_id: selectedShiftIds[1] || null };

      // ── 주민번호 기반 생일 자동 추출 ──────────────────────────────
      // 8차 D04-011: 여기 있던 30줄 사본은 lib/resident-number 정본과 글자 단위로 같았다.
      const birthDateStr = formatResidentBirthDateKey(신규직원.주민번호);

      const commonData = {
        name: normalizeStaffName(신규직원.성명),
        phone: 신규직원.전화번호,
        company: 신규직원.사업체,
        department: 신규직원.팀 === '' ? null : 신규직원.팀,
        position: 신규직원.직함,
        resident_no: 신규직원.주민번호.trim(),
        birth_date: birthDateStr,
        email: 신규직원.이메일,
        address: 신규직원.주소,
        // staff_licenses가 기준값 — license 컬럼은 타 화면 호환용 미러
        license: 신규직원.면허사항?.trim() || '',
        bank_account: 신규직원.계좌정보,
        salary_info: 신규직원.임금정보,
        joined_at: dateOrNull(신규직원.입사일),
        resigned_at: dateOrNull(신규직원.퇴사일),
        status: 신규직원.상태,
        permissions: {
          ...existingPermissions,
          is_group_account: 신규직원.is_group_account ? 1 : 0,
          account_type: 신규직원.is_group_account ? 'team_group' : 'personal',
          extension: 신규직원.내선번호 || null,
          employment_type: 신규직원.고용형태 || '정규직',
          contract_end_date: 신규직원.고용형태 === '계약직' ? dateOrNull(신규직원.계약종료일) : null,
          insurance: {
            ...((existingPermissions.insurance as Record<string, unknown>) || {}),
            national: 신규직원.ins_national,
            national_amount: 신규직원.ins_national_amount !== '' && 신규직원.ins_national_amount != null ? Number(신규직원.ins_national_amount) : null,
            health: 신규직원.ins_health,
            employment: 신규직원.ins_employment,
            injury: 신규직원.ins_injury,
            duru_nuri: 신규직원.ins_duru_nuri,
            duru_nuri_start: dateOrNull(신규직원.duru_nuri_start),
            duru_nuri_end: dateOrNull(신규직원.duru_nuri_end)
          },
          probation_months: toIntegerOrFallback(신규직원.probation_months, 0),
          probation_percent: toIntegerOrFallback(신규직원.probation_percent, 90),
          is_basic_living: 신규직원.is_basic_living,
          is_medical_benefit: 신규직원.is_medical_benefit,
          other_welfare: 신규직원.other_welfare,
          // 수당 '시간' 입력값 보존(환산시급×시간×법정배수의 원천 시간값) — DB 컬럼이 아니라 permissions에 저장
          payroll_allowance_hours: 신규직원.allowance_hours,
          // ── 다중 근무형태 메타 (신버전과 동일 형식 유지) ─────────────
          work_conditions: nextWorkConditions,
          shift_group_ids: selectedShiftIds,
          weekly_rotation_shift_ids: selectedShiftIds.slice(1),
          secondary_shift_id: selectedShiftIds[1] || null },
        annual_leave_total: 신규직원.연차총개수,
        annual_leave_used: 신규직원.연차사용개수,
        shift_id: primaryShiftId || null,
        working_hours_per_week: weeklyWorkingHours > 0 ? weeklyWorkingHours : 40,
        working_days_per_week: workingDaysPerWeek > 0 ? workingDaysPerWeek : 5,
        base_salary: 신규직원.base_salary,
        meal_allowance: 신규직원.meal_allowance ?? 0,
        night_duty_allowance: 신규직원.night_duty_allowance ?? 0,
        vehicle_allowance: 신규직원.vehicle_allowance ?? 0,
        childcare_allowance: 신규직원.childcare_allowance ?? 0,
        research_allowance: 신규직원.research_allowance ?? 0,
        other_taxfree: 신규직원.other_taxfree ?? 0,
        position_allowance: 신규직원.position_allowance ?? 0,
        overtime_allowance: 신규직원.overtime_allowance ?? 0,
        night_work_allowance: 신규직원.night_work_allowance ?? 0,
        holiday_work_allowance: 신규직원.holiday_work_allowance ?? 0,
        annual_leave_pay: 신규직원.annual_leave_pay ?? 0,
        agreed_overtime_allowance: 신규직원.agreed_overtime_allowance ?? 0,
        agreed_night_allowance: 신규직원.agreed_night_allowance ?? 0
      };

      if (편집모드 && 선택된직원ID) {
        const beforeStaff = 직원목록.find((staff: StaffMember) => String(staff.id) === String(선택된직원ID)) || null;
        const afterStaff = {
          ...beforeStaff,
          ...commonData,
          annual_leave_total: 신규직원.연차총개수,
          annual_leave_used: 신규직원.연차사용개수 };

        const updatePayload: Record<string, unknown> = {
          ...commonData,
          annual_leave_total: afterStaff.annual_leave_total,
          annual_leave_used: afterStaff.annual_leave_used };

        // ── 기존 프로필 사진 정보 보존 (사진 미선택 시 덮어쓰기 방지) ─────────────
        if (beforeStaff?.avatar_url) updatePayload.avatar_url = beforeStaff.avatar_url;
        if (beforeStaff?.photo_url) updatePayload.photo_url = beforeStaff.photo_url;
        if (beforeStaff?.profile_photo_path) updatePayload.profile_photo_path = beforeStaff.profile_photo_path;
        if (beforeStaff?.profile_photo_updated_at) updatePayload.profile_photo_updated_at = beforeStaff.profile_photo_updated_at;

        // ── 주민번호 안전 가드(JM5) ───────────────────────────────────
        // 폼의 주민번호가 비어 있으면 DB 기존 값을 덮어쓰지 않음.
        const residentDigits = String(신규직원.주민번호 ?? '').replace(/[^0-9]/g, '');
        if (residentDigits.length === 0) {
          delete updatePayload.resident_no;
        }
        const forcedOmittedWorkConditionColumns = hasFractionalValue(updatePayload.working_hours_per_week)
          ? ['working_hours_per_week']
          : [];

        // `permissions` 는 PRIVILEGED_STAFF_COLUMNS 라 **admin 만** 쓸 수 있다
        // (lib/db/auth/policies.ts staffPrivilegeGuard). 그런데 이 payload 는 값이 그대로여도
        // permissions 를 항상 포함해서, 인사담당자(perms.hr, 비-admin)의 저장이 전부 403 이었다.
        // 실제로 달라진 게 없으면 빼서 불필요한 권한 요구를 없앤다.
        const prevPermissions = (beforeStaff as Record<string, unknown> | null)?.permissions;
        const permissionsUnchanged =
          prevPermissions !== undefined &&
          JSON.stringify(prevPermissions ?? null) === JSON.stringify(updatePayload.permissions ?? null);
        if (permissionsUnchanged) {
          delete (updatePayload as Record<string, unknown>).permissions;
        }
        const { error: updateErr } = await withMissingColumnsFallback(
          (omittedColumns) => {
            const allOmittedColumns = new Set<string>([
              ...omittedColumns,
              ...forcedOmittedWorkConditionColumns,
              ...STAFF_COLUMNS_NOT_IN_SCHEMA,
            ]);
            return db
              .from('staff_members')
              .update(buildStaffMutationPayload(updatePayload, allOmittedColumns))
              .eq('id', String(afterStaff.id || ''))
              .select();
          },
          [...STAFF_MUTATION_ALLOWANCE_COLUMNS, ...STAFF_MUTATION_WORK_CONDITION_COLUMNS],
        );

        if (updateErr) {
          throw updateErr;
        }

        // 입사일이 변경된 경우 연차 자동 재계산 및 부여 동기화
        const beforeHire = (beforeStaff as Record<string, any>)?.hire_date || (beforeStaff as Record<string, any>)?.join_date;
        const afterHire = (afterStaff as Record<string, any>)?.hire_date || (afterStaff as Record<string, any>)?.join_date;
        if (beforeHire !== afterHire && 선택된직원ID) {
          void fetch('/api/admin/annual-leave/diagnose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ staffIds: [String(선택된직원ID)], year: new Date().getFullYear() }),
          }).catch((err) => console.error('입사일 변경 후 연차 재계산 실패:', err));
        }

        await logAudit(
          '직원정보수정',
          'staff_member',
          String(선택된직원ID),
          {
            staff_name: 신규직원.성명,
            employee_no: beforeStaff?.employee_no || null,
            ...buildAuditDiff(beforeStaff, afterStaff, Object.keys(afterStaff)) },
          actor.userId,
          actor.userName
        );

        if (프로필사진파일 && afterStaff.id) {
          try {
            await 프로필사진업로드(afterStaff.id, 프로필사진파일, afterStaff as Record<string, unknown>);
          } catch (photoError) {
            console.error('직원 프로필 사진 업로드 실패:', photoError);
            프로필사진업로드경고 = '직원 정보는 수정되었지만 프로필 사진 업로드는 실패했습니다.';
          }
        }

        const 면허저장경고 = await saveStaffLicense(String(선택된직원ID));

        toast(프로필사진업로드경고 || '직원 정보가 수정되었습니다.', 프로필사진업로드경고 ? 'warning' : 'success');
        if (면허저장경고) toast(면허저장경고, 'warning');
      } else {
        // 사번 부여 로직: 기존 숫자 사번의 최대값 다음 번호 사용
        let newEmployeeNo = '';
        const { data: employeeNos, error: employeeNoError } = await db
          .from('staff_members')
          .select('employee_no');

        if (employeeNoError) {
          throw employeeNoError;
        }

        const existingEmployeeNos = new Set(
          (employeeNos || [])
            .map((row: { employee_no?: unknown }) => String(row?.employee_no || '').trim())
            .filter(Boolean)
        );

        let maxNumericEmpNo = 0;
        for (const empNo of Array.from(existingEmployeeNos)) {
          const empStr = String(empNo);
          if (/^\d+$/.test(empStr)) {
            const num = parseInt(empStr, 10);
            if (num > maxNumericEmpNo) maxNumericEmpNo = num;
          }
        }

        let candidateNum = maxNumericEmpNo > 0 ? maxNumericEmpNo + 1 : 1;
        let padLength = maxNumericEmpNo > 0 ? String(maxNumericEmpNo).length : 4;
        if (padLength < 4) padLength = 4;

        while (existingEmployeeNos.has(String(candidateNum).padStart(padLength, '0'))) {
          candidateNum++;
        }
        newEmployeeNo = String(candidateNum).padStart(padLength, '0');

        const insertPayload: Record<string, unknown> = {
          ...commonData,
          employee_no: newEmployeeNo,
          annual_leave_total: 신규직원.연차총개수,
          annual_leave_used: 신규직원.연차사용개수
        };

        const forcedInsertOmittedColumns = hasFractionalValue(insertPayload.working_hours_per_week)
          ? ['working_hours_per_week']
          : [];
        const { data: insertResult, error: insertErr } = await withMissingColumnsFallback(
          (omittedColumns) => {
            const allOmittedColumns = new Set<string>([
              ...omittedColumns,
              ...forcedInsertOmittedColumns,
            ]);
            return db
              .from('staff_members')
              .insert([buildStaffMutationPayload(insertPayload, allOmittedColumns)])
              .select()
              .single();
          },
          [...STAFF_MUTATION_ALLOWANCE_COLUMNS, ...STAFF_MUTATION_WORK_CONDITION_COLUMNS]
        );

        if (insertErr) {
          return toast('직원 등록 실패: ' + (insertErr.message || 'DB 오류'), 'error');
        }

        const insertedStaff = (Array.isArray(insertResult) ? insertResult[0] : insertResult) as Record<string, any> | null;

        let onboardingChecklistInitFailed = false;
        if (insertedStaff?.id) {
          const { error: onboardingInitError } = await db
            .from('onboarding_checklists')
            .upsert(
              {
                staff_id: insertedStaff.id,
                checklist_type: '입사',
                items: getDefaultChecklist('입사'),
                target_date: getChecklistTargetDate(
                  '입사',
                  (insertedStaff.joined_at as string) ||
                    (insertedStaff.join_date as string) ||
                    dateOrNull(신규직원.입사일),
                ),
                completed_at: null },
              { onConflict: 'staff_id,checklist_type' },
            );

          if (onboardingInitError) {
            onboardingChecklistInitFailed = true;
            console.warn('입사 온보딩 체크리스트 초기화 실패:', onboardingInitError);
          }
        }

        await logAudit(
          '직원등록',
          'staff_member',
          String(insertedStaff?.id || newEmployeeNo),
          {
            staff_name: 신규직원.성명,
            employee_no: newEmployeeNo,
            created_fields: buildAuditDiff({}, insertedStaff || commonData, Object.keys(commonData)).after },
          actor.userId,
          actor.userName
        );

        if (프로필사진파일 && insertedStaff?.id) {
          try {
            await 프로필사진업로드(insertedStaff.id, 프로필사진파일, insertedStaff as Record<string, unknown>);
          } catch (photoError) {
            console.error('신규 직원 프로필 사진 업로드 실패:', photoError);
            프로필사진업로드경고 = '직원은 등록되었지만 프로필 사진 업로드는 실패했습니다.';
          }
        }

        let 면허저장경고: string | null = null;
        if (insertedStaff?.id) {
          면허저장경고 = await saveStaffLicense(String(insertedStaff.id));
        }

        toast(
          onboardingChecklistInitFailed
            ? `직원 등록 완료!\n로그인 아이디: 사번 ${newEmployeeNo} 또는 이름 ${신규직원.성명}\n(온보딩 패키지 자동 생성은 실패해 직원 상세에서 다시 생성됩니다.)`
            : `직원 등록 완료!\n로그인 아이디: 사번 ${newEmployeeNo} 또는 이름 ${신규직원.성명}\n(동명이인이 있으면 사번으로 로그인하세요)`,
          onboardingChecklistInitFailed ? 'warning' : 'success',
        );
        if (프로필사진업로드경고) {
          toast(프로필사진업로드경고, 'warning');
        }
        if (면허저장경고) {
          toast(면허저장경고, 'warning');
        }
      }
      닫기함수(); 새로고침?.();
    } catch (error: unknown) {
      if (isDuplicateStaffIdentityError(error)) {
        toast('같은 이름과 주민번호를 가진 직원은 중복 등록할 수 없습니다.', 'error');
        return;
      }
      toast('처리 중 오류가 발생했습니다: ' + (((error as Error)?.message ?? String(error)) || 'Unknown error'), 'error');
    }
  };

  const 수정시작 = (직원: StaffMember) => {
    선택된직원ID설정(직원.id);
    프로필사진파일설정(null);
    setTargetSalaryInput('');
    setTargetNightHoursInput('');

    // 1차 사진 미리보기
    프로필사진미리보기설정(getProfilePhotoUrl(직원));

    const extensionValue = getStaffExtension(직원);
    const cleanStaffId = String(직원.id || '').toLowerCase().trim();
    const 직원면허목록 = licensesByStaff[cleanStaffId] || [];
    const 첫면허 = 직원면허목록[0] ?? null;
    편집중면허ID설정(첫면허?.id ?? null);
    const ins = (직원.permissions?.insurance as Record<string, unknown>) || { national: true, health: true, employment: true, injury: true };
    // 다중 근무형태 IDs 추출 (신버전 동일 방식): permissions.shift_group_ids / weekly_rotation_shift_ids / secondary_shift_id
    const 직원근무형태IDs = getWeeklyRotationShiftIds(직원 as unknown as Record<string, unknown>, 직원.shift_id);
    신규직원설정({
      성명: 직원.name || '', 전화번호: 직원.phone || '', 내선번호: extensionValue as string, 사업체: 직원.company || '',
      팀: 직원.department ?? '', 직함: 직원.position || '', 입사일: (직원.joined_at as string) || (직원.join_date as string) || '',
      퇴사일: (직원.resigned_at as string) || '', 주민번호: (직원.resident_no as string) || '', 이메일: 직원.email || '',
      주소: 직원.address || '',
      면허사항: 첫면허?.license_name || (직원.license as string) || '',
      면허번호: 첫면허?.license_number || '',
      취득일자: 첫면허?.issued_date || '',
      면허기타내용: 첫면허?.memo || '',
      계좌정보: 직원.bank_account || '',
      임금정보: (직원.salary_info as string) || (직원.permissions?.payroll_allowances as any)?.salary_info || '', 상태: 직원.status || '재직',
      연차총개수: typeof 직원.annual_leave_total === 'number' ? 직원.annual_leave_total : 0,
      연차사용개수: (직원.annual_leave_used as number) || 0,
      근무형태ID: 직원근무형태IDs[0] || (직원.shift_id as string) || '',
      근무형태IDs: 직원근무형태IDs,
      is_group_account: isGroupAccount(직원),
      account_type: isGroupAccount(직원) ? ('team_group' as const) : ('personal' as const),
      base_salary: (직원.base_salary as number) || 0,
      // DB 컬럼이 없어 permissions.payroll_allowances(JSON)에 저장된 경우도 폴백으로 읽는다.
      // (직접 컬럼만 읽으면 저장 후 재편집 시 0으로 보여 "저장 안 됨"처럼 나타남)
      meal_allowance: Number(직원.meal_allowance || (직원.permissions?.payroll_allowances as any)?.meal_allowance || 0), night_duty_allowance: Number(직원.night_duty_allowance || (직원.permissions?.payroll_allowances as any)?.night_duty_allowance || 0),
      vehicle_allowance: Number(직원.vehicle_allowance || (직원.permissions?.payroll_allowances as any)?.vehicle_allowance || 0), childcare_allowance: Number(직원.childcare_allowance || (직원.permissions?.payroll_allowances as any)?.childcare_allowance || 0), research_allowance: Number(직원.research_allowance || (직원.permissions?.payroll_allowances as any)?.research_allowance || 0),
      other_taxfree: Number(직원.other_taxfree || (직원.permissions?.payroll_allowances as any)?.other_taxfree || 0), position_allowance: Number(직원.position_allowance || (직원.permissions?.payroll_allowances as any)?.position_allowance || 0),
      overtime_allowance: Number(직원.overtime_allowance || (직원.permissions?.payroll_allowances as any)?.overtime_allowance || 0), night_work_allowance: Number(직원.night_work_allowance || (직원.permissions?.payroll_allowances as any)?.night_work_allowance || 0),
      holiday_work_allowance: Number(직원.holiday_work_allowance || (직원.permissions?.payroll_allowances as any)?.holiday_work_allowance || 0), annual_leave_pay: Number(직원.annual_leave_pay || (직원.permissions?.payroll_allowances as any)?.annual_leave_pay || 0),
      agreed_overtime_allowance: Number(직원.agreed_overtime_allowance || (직원.permissions?.payroll_allowances as any)?.agreed_overtime_allowance || 0),
      agreed_night_allowance: Number(직원.agreed_night_allowance || (직원.permissions?.payroll_allowances as any)?.agreed_night_allowance || 0),
      고용형태: getStaffEmploymentType(직원),
      계약종료일: getStaffContractEndDate(직원),
      probation_months: getStaffProbationMonths(직원, 0),
      probation_percent: getStaffProbationPercent(직원, 90),
      ins_national: ins.national !== false,
      ins_national_amount: ins.national_amount != null && ins.national_amount !== '' ? Number(ins.national_amount) : '',
      ins_health: ins.health !== false,
      ins_employment: ins.employment !== false,
      ins_injury: ins.injury !== false,
      is_basic_living: (직원.permissions?.is_basic_living as boolean) || false,
      is_medical_benefit: (직원.permissions?.is_medical_benefit as boolean) || false,
      ins_duru_nuri: (ins.duru_nuri as boolean) || false,
      duru_nuri_start: (ins.duru_nuri_start as string) || '',
      duru_nuri_end: (ins.duru_nuri_end as string) || '',
      other_welfare: (직원.permissions?.other_welfare as string) || '',
      working_hours_per_week: resolveWeeklyWorkingHours(직원, 40),
      working_days_per_week: resolveWorkingDaysPerWeek(직원, 5),
      allowance_hours: {
        ...EMPTY_ALLOWANCE_HOURS,
        ...((직원.permissions?.payroll_allowance_hours as Record<string, number>) || {}) }
    });
    편집모드설정(true);

    const staffId = String(직원.id);

    // ── 직원 최신 정보 및 사진/주민번호 DB 직접 fetch ────────────────────────
    db
      .from('staff_members')
      .select('resident_no, avatar_url, photo_url, profile_photo_path, profile_photo_updated_at, license, permissions')
      .eq('id', staffId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        const record = data as Record<string, unknown>;
        const fetchedResident = String(record.resident_no ?? '');
        if (fetchedResident) {
          신규직원설정((prev) => {
            const current = String(prev.주민번호 ?? '');
            if (current.replace(/[^0-9]/g, '').length > 0) return prev;
            const raw = fetchedResident.replace(/[^0-9]/g, '').slice(0, 13);
            const formatted = raw.length > 6 ? `${raw.slice(0, 6)}-${raw.slice(6)}` : raw;
            return { ...prev, 주민번호: formatted };
          });
        }
        const freshPhotoUrl = getProfilePhotoUrl(record);
        if (freshPhotoUrl) {
          프로필사진미리보기설정(freshPhotoUrl);
        }
        if (record.license && typeof record.license === 'string') {
          신규직원설정((prev) => (prev.면허사항 ? prev : { ...prev, 면허사항: record.license as string }));
        }
      });

    // ── staff_licenses 단건 실시간 직접 fetch (면허 중복 생성 및 공란 로드 방지) ──
    db
      .from('staff_licenses')
      .select('id, staff_id, license_type, license_name, license_number, issued_date, expiry_date, renewed_date, issuing_body, memo')
      .eq('staff_id', staffId)
      .then(({ data, error }) => {
        if (error || !Array.isArray(data) || data.length === 0) return;
        const licenses = data as StaffLicenseRow[];
        const primaryLic = licenses[0];
        if (primaryLic) {
          편집중면허ID설정(primaryLic.id);
          신규직원설정((prev) => ({
            ...prev,
            면허사항: primaryLic.license_name || prev.면허사항 || '',
            면허번호: primaryLic.license_number || '',
            취득일자: primaryLic.issued_date || '',
            면허기타내용: primaryLic.memo || '',
          }));
          licensesByStaff설정((prev) => ({
            ...prev,
            [cleanStaffId]: licenses,
          }));
        }
      });
  };

  useEffect(() => {
    if (initialEditStaff) {
      수정시작(initialEditStaff);
    }
  }, [initialEditStaff]);

  const 닫기함수 = () => {
    편집모드설정(false); 선택된직원ID설정(null);
    편집중면허ID설정(null);
    프로필사진파일설정(null);
    프로필사진미리보기설정(null);
    // 다중 근무형태 추가 패널 상태 초기화
    추가근무형태ID설정('');
    새근무형태표시설정(false);
    const defaultCompany = 선택사업체 && 선택사업체 !== '전체' ? 선택사업체 : '';
    신규직원설정({
      ...createEmptyStaffForm(defaultCompany),
      팀: 팀목록가져오기(defaultCompany)[0] ?? '원무팀' });
    창닫기?.();
  };

  const 직원삭제 = async (직원: StaffMember) => {
    try {
      const actor = readClientAuditActor();
      const today = getKoreanTodayString();
      const afterStaff = {
        ...직원,
        status: '퇴사',
        resigned_at: 직원.resigned_at || today };
      const { error: updateErr } = await db
        .from('staff_members')
        .update({
          status: '퇴사',
          resigned_at: 직원.resigned_at || today })
        .eq('id', 직원.id);

      if (updateErr) throw updateErr;

      await logAudit(
        '직원퇴사처리',
        'staff_member',
        String(직원.id),
        {
          staff_name: 직원.name,
          employee_no: 직원.employee_no || null,
          ...buildAuditDiff(직원, afterStaff, ['status', 'resigned_at']) },
        actor.userId,
        actor.userName
      );
      toast('직원이 삭제(퇴사 처리)되었습니다.', 'success');
      if (선택된직원ID === 직원.id) {
        닫기함수();
      }
      새로고침?.();
    } catch (e: unknown) {
      toast('직원 삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  const 직원완전삭제 = async (직원: StaffMember) => {
    setIsDeleting(true);
    try {
      const actor = readClientAuditActor();
      const { error } = await db
        .from('staff_members')
        .delete()
        .eq('id', 직원.id);

      if (error) throw error;

      await logAudit(
        '직원완전삭제',
        'staff_member',
        String(직원.id),
        {
          staff_name: 직원.name,
          employee_no: 직원.employee_no || null },
        actor.userId,
        actor.userName
      );

      toast('직원 정보가 데이터베이스에서 완전히 삭제되었습니다.', 'success');
      if (선택된직원ID === 직원.id) {
        닫기함수();
      }
      새로고침?.();
    } catch (e: any) {
      console.error('직원 완전 삭제 실패:', e);
      const errMsg = e?.message || String(e || '');
      if (errMsg.includes('FOREIGN KEY') || errMsg.includes('foreign key') || errMsg.includes('constraint') || errMsg.includes('삭제할 수 없습니다')) {
        toast('이 직원은 연결된 결재 문서, 근태, 급여 또는 공지채팅 등 활동 이력이 존재하여 완전 삭제할 수 없습니다. 대신 퇴사 처리를 진행해 주세요.', 'error');
      } else {
        toast(`직원 삭제 중 오류가 발생했습니다: ${errMsg}`, 'error');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const 필터목록 = useMemo(() => {
    const normalizedKeyword = appliedStaffNameSearch.trim().toLocaleLowerCase('ko-KR');

    return [...직원목록]
      .filter((s: StaffMember) => {
        const companyMatch = 선택사업체 === '전체' ? true : s.company === 선택사업체;
        const status = s.status || '재직';
        const nameMatch = !normalizedKeyword
          ? true
          : String(s.name || '').toLocaleLowerCase('ko-KR').includes(normalizedKeyword);

        if (보기상태 === '퇴사') {
          return companyMatch && !isActiveStaff(s) && nameMatch;
        }

        // 기본은 재직자 위주
        return companyMatch && isActiveStaff(s) && nameMatch;
      })
      .sort((a: StaffMember, b: StaffMember) => {
        const aEmployeeNo = normalizeEmployeeNoForSort(a.employee_no);
        const bEmployeeNo = normalizeEmployeeNoForSort(b.employee_no);

        if (aEmployeeNo.isNumeric && bEmployeeNo.isNumeric && aEmployeeNo.numericValue !== bEmployeeNo.numericValue) {
          return aEmployeeNo.numericValue - bEmployeeNo.numericValue;
        }

        if (aEmployeeNo.isNumeric !== bEmployeeNo.isNumeric) {
          return aEmployeeNo.isNumeric ? -1 : 1;
        }

        const employeeNoCompare = aEmployeeNo.textValue.localeCompare(bEmployeeNo.textValue, 'ko', {
          numeric: true,
          sensitivity: 'base' });

        if (employeeNoCompare !== 0) {
          return employeeNoCompare;
        }

        return String(a.name || '').localeCompare(String(b.name || ''), 'ko', {
          sensitivity: 'base' });
      });
  }, [appliedStaffNameSearch, 보기상태, 선택사업체, 직원목록]);
  const 면허등록인원수 = 필터목록.filter(
    (직원: StaffMember) => (licensesByStaff[String(직원.id || '').toLowerCase().trim()]?.length ?? 0) > 0,
  ).length;
  const 계약직인원수 = 필터목록.filter((직원: StaffMember) => 직원고용형태(직원) === '계약직').length;
  const 부서수 = new Set(필터목록.map((직원: StaffMember) => 직원.department).filter(Boolean)).size;

  const staffTableColumns = useMemo((): Column<StaffMember>[] => [
    {
      key: 'employee_no',
      label: '사번',
      render: (직원) => (
        <span className="font-semibold text-[var(--accent)] text-xs">{직원.employee_no ?? '-'}</span>
      ) },
    {
      key: 'name',
      label: '성명/직함',
      primary: true,
      render: (직원) => (
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-[var(--foreground)]">{직원.name}</p>
            {isGroupAccount(직원) && (
              <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-blue-500/15 text-blue-600 dark:text-blue-400 rounded">
                👥 단체용
              </span>
            )}
          </div>
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">{직원.position || '-'}</p>
          <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
            {직원.resident_no ? '주민번호 등록' : '주민번호 미등록'}
          </p>
        </div>
      ) },
    {
      key: 'company',
      label: '소속',
      render: (직원) => (
        <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">{직원.company}</span>
      ) },
    {
      key: 'department',
      label: '부서/팀',
      render: (직원) => (
        <span className="text-xs font-bold text-[var(--toss-gray-4)]">{직원.department}</span>
      ) },
    {
      key: 'contact',
      label: '연락/계정',
      render: (직원) => (
        <div>
          <p className="text-xs font-bold text-[var(--foreground)]">{직원연락요약(직원)}</p>
          <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
            입사일 {(직원.joined_at as string) || (직원.join_date as string) || '-'}
          </p>
        </div>
      ) },
    {
      key: 'work',
      label: '근무정보',
      render: (직원) => (
        <div className="flex flex-col gap-1">
          <span className="w-fit px-3 py-1 bg-[var(--muted)] text-[var(--toss-gray-4)] text-[11px] font-semibold rounded-[var(--radius-md)]">
            {(근무형태목록.find((s) => s.id === (직원.shift_id as string))?.name as string) || '-'}
          </span>
          <span
            className={`w-fit px-3 py-1 text-[10px] font-semibold rounded-full ${
              직원고용형태(직원) === '계약직'
                ? 'bg-orange-500/20 text-orange-700'
                : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {직원고용형태(직원)}
          </span>
        </div>
      ) },
    {
      key: 'license',
      label: '면허/자격',
      render: (직원) => (
        <div>
          <p className="text-xs font-bold text-[var(--foreground)]">{직원면허요약(직원)}</p>
          <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
            취득일 {licensesByStaff[String(직원.id || '').toLowerCase().trim()]?.[0]?.issued_date || '-'}
          </p>
        </div>
      ) },
    {
      key: 'status',
      label: '상태',
      render: (직원) => (
        <span
          className={`px-3 py-1 text-[11px] font-semibold rounded-full ${
            직원.status === '퇴사'
              ? 'bg-red-500/20 text-red-600'
              : 'bg-green-500/20 text-green-600'
          }`}
        >
          {직원.status || '재직중'}
        </span>
      ) },
    {
      key: 'actions',
      label: '관리',
      align: 'right',
      render: (직원) => (
        <div className="flex justify-end gap-2 flex-wrap">
          <button
            onClick={(e) => { e.stopPropagation(); 수정시작(직원); }}
            className="px-4 py-2 bg-[var(--foreground)] text-white text-[11px] font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-all"
          >
            수정
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setPendingRetirementStaff(직원); }}
            className="px-3 py-2 bg-amber-500/10 text-amber-600 text-[11px] font-semibold rounded-[var(--radius-md)] hover:bg-amber-500/20 transition-all"
          >
            퇴사 처리
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setPendingDeleteStaff(직원); }}
            className="px-3 py-2 bg-red-500/10 text-red-600 text-[11px] font-semibold rounded-[var(--radius-md)] hover:bg-red-500/20 transition-all"
          >
            완전 삭제
          </button>
          {onOpenDocumentRepoForStaff && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenDocumentRepoForStaff(직원); }}
              className="px-3 py-2 bg-[var(--toss-blue-light)] text-[var(--accent)] text-[11px] font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-all"
            >
              문서
            </button>
          )}
        </div>
      ) },
     
  ], [근무형태목록, licensesByStaff, onOpenDocumentRepoForStaff]);

  return (
    <div className="flex flex-col h-full app-page">
      <header className="border-b border-[var(--border)] bg-[var(--card)] p-3 md:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-[var(--accent)] font-bold">[{선택사업체}]</span>
          <p className="text-[11px] md:text-xs text-[var(--toss-gray-3)] font-bold">
            {보기상태 === '퇴사'
              ? '퇴사 처리된 직원만 표시됩니다.'
              : '재직 중인 직원만 표시됩니다.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0 overflow-x-auto">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={staffNameSearchInput}
              onChange={(event) => setStaffNameSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  setAppliedStaffNameSearch(staffNameSearchInput);
                }
              }}
              placeholder="직원 검색"
              className="h-10 w-full sm:w-[140px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-semibold text-[var(--foreground)] outline-none transition focus:border-[var(--accent)] md:w-[170px]"
            />
            <button
              type="button"
              onClick={() => setAppliedStaffNameSearch(staffNameSearchInput)}
              className="h-10 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[11px] font-semibold text-[var(--foreground)] transition hover:bg-[var(--muted)]"
            >
              검색
            </button>
            {(staffNameSearchInput || appliedStaffNameSearch) && (
              <button
                type="button"
                onClick={() => {
                  setStaffNameSearchInput('');
                  setAppliedStaffNameSearch('');
                }}
                className="h-10 rounded-[var(--radius-md)] border border-[var(--border)] px-3 text-[11px] font-semibold text-[var(--toss-gray-4)] transition hover:bg-[var(--muted)]"
              >
                초기화
              </button>
            )}
          </div>
          {/* 조회 실패(essLoadError)일 때도 버튼을 노출해야 사용자가 실패 사실을 확인할 수 있다. */}
          {(essRequests.length > 0 || essLoadError) && (
            <button
              onClick={() => setShowEssModal(true)}
              className="relative bg-amber-100 text-amber-800 px-4 py-2 text-[11px] font-bold rounded-[var(--radius-md)] hover:bg-amber-200 transition-all shadow-sm ring-1 ring-amber-300"
              title={essLoadError ? `요청 목록 조회 실패: ${essLoadError}` : undefined}
            >
              내정보 변경 요청
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500/100 text-white flex items-center justify-center rounded-full text-[10px] shadow-sm animate-bounce">
                {essLoadError ? '!' : essRequests.length}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => canRegisterNewStaff && onOpenNewStaff && onOpenNewStaff()}
            className="bg-[var(--accent)] text-white px-5 py-2.5 text-[11px] font-bold rounded-[var(--radius-md)] shadow-md hover:opacity-95 transition-all"
            style={{ display: canRegisterNewStaff ? undefined : 'none' }}
            disabled={!canRegisterNewStaff}
            data-testid="new-staff-button"
          >
            신규 직원 등록
          </button>
        </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {false && (
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 보기상태 === '퇴사' ? '퇴사자 수' : '재직자 수', value: 필터목록.length, tone: 'bg-[var(--card)] border-[var(--border)] text-[var(--foreground)]' },
            { label: '면허/자격 등록', value: 면허등록인원수, tone: 'bg-amber-50 border-amber-200 text-amber-900' },
            { label: '계약직', value: 계약직인원수, tone: 'bg-blue-500/10 border-blue-500/20 text-blue-900' },
            { label: '부서 수', value: 부서수, tone: 'bg-emerald-50 border-emerald-200 text-emerald-900' },
          ].map((card) => (
            <div key={card.label} className={`rounded-[var(--radius-lg)] border p-4 shadow-sm ${card.tone}`}>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-70">{card.label}</p>
              <p className="mt-2 text-2xl font-bold">{card.value}</p>
            </div>
          ))}
          </div>
        )}

        {선택된직원ID && (
          <div className="mb-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StaffHistoryTimeline staffId={선택된직원ID} staffName={필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.name || 직원목록.find((s: StaffMember) => s.id === 선택된직원ID)?.name || ''} />
              <div className="flex gap-4 flex-wrap">
                <OnboardingChecklist
                  staffId={String(선택된직원ID)}
                  staffName={필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.name || ''}
                  joinedAt={
                    (필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.joined_at as string) ||
                    (필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.join_date as string) ||
                    null
                  }
                  company={필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.company || null}
                  position={필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.position || null}
                  type="입사"
                />
                <OnboardingChecklist
                  staffId={String(선택된직원ID)}
                  staffName={필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.name || ''}
                  joinedAt={
                    (필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.joined_at as string) ||
                    (필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.join_date as string) ||
                    null
                  }
                  company={필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.company || null}
                  position={필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.position || null}
                  type="퇴사"
                />
              </div>
            </div>
            <CertTransferPanel staffId={String(선택된직원ID)} staffName={필터목록.find((s: StaffMember) => s.id === 선택된직원ID)?.name || ''} />
          </div>
        )}
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] overflow-x-auto shadow-sm">
          <ResponsiveTable<StaffMember>
            columns={staffTableColumns}
            rows={필터목록}
            keyField="id"
            emptyMessage="표시할 직원이 없습니다."
            onRowDoubleClick={수정시작}
          />
        </div>
      </div>

      {/* 등록/수정 모달 - 모바일 최적화 */}
      {(창상태 || 편집모드) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-4 min-h-screen">
          <div data-testid="new-staff-modal" className="bg-[var(--card)] w-full max-w-5xl rounded-2xl md:rounded-2xl overflow-hidden shadow-sm flex flex-col h-[90vh] md:h-[85vh] animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--card)] shrink-0">
              <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">{편집모드 ? '구성원 정보 수정' : '신규 직원 등록'}</h3>
              <button onClick={닫기함수} className="text-[var(--toss-gray-3)] hover:text-red-500 text-2xl">✕</button>
            </div>

            {/* Content Body */}
            <div className="p-4 overflow-y-auto overflow-x-hidden flex-1 bg-[var(--card)] relative">
              {/* 탭 메뉴 */}
              <div className="flex gap-1 p-1 bg-[var(--muted)] rounded-[var(--radius-lg)] mb-4 w-fit">
                {[
                  { id: '기본', label: '인적사항', icon: '👤' },
                  { id: '소속', label: '소속/근무', icon: '🏢' },
                  { id: '급여', label: '급여/보험', icon: '💰' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    data-testid={`new-staff-tab-${tab.id === '기본' ? 'basic' : tab.id === '소속' ? 'affiliation' : 'payroll'}`}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2 rounded-[var(--radius-md)] text-sm font-bold transition-all flex items-center gap-2 ${activeTab === tab.id
                      ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm'
                      : 'text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)]'
                      }`}
                  >
                    <span className="text-base">{tab.icon}</span>
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="min-h-[450px]">
                {activeTab === '기본' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="md:col-span-2 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--page-bg)] p-4">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--border)] bg-[var(--muted)] shadow-sm">
                          {프로필사진미리보기 ? (
                            <ProfilePhotoThumbnail
                              src={프로필사진미리보기}
                              alt={신규직원.성명 ? `${신규직원.성명} 프로필 사진` : '직원 프로필 사진'}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="text-4xl text-[var(--toss-gray-3)]">👤</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[var(--foreground)]">프로필 사진</p>
                          <p className="mt-1 text-[11px] font-medium text-[var(--toss-gray-3)]">
                            신규 직원 등록 또는 구성원 정보 수정 저장 시 함께 반영됩니다.
                          </p>
                          {프로필사진파일 ? (
                            <p className="mt-2 text-[11px] font-bold text-[var(--accent)]">
                              선택한 파일: {프로필사진파일.name}
                            </p>
                          ) : null}
                        </div>
                        <div className="shrink-0">
                          <label
                            htmlFor="new-staff-profile-photo-input"
                            className="inline-flex cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-[var(--toss-blue-light)] bg-[var(--toss-blue-light)] px-4 py-2 text-xs font-bold text-[var(--accent)] transition-all hover:opacity-90"
                          >
                            {프로필사진미리보기 ? '사진 변경' : '사진 등록'}
                          </label>
                          <input
                            id="new-staff-profile-photo-input"
                            data-testid="new-staff-profile-photo-input"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={프로필사진선택}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-[var(--accent)] rounded-full" />
                        필수 입력
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[12px] font-bold text-[var(--toss-gray-4)] ml-1">성명 *</label>
                          <input data-testid="new-staff-name-input" type="text" value={신규직원.성명} onChange={e => 신규직원설정({ ...신규직원, 성명: e.target.value })} className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30" placeholder="성명을 입력하세요" />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[12px] font-bold text-[var(--toss-gray-4)] ml-1">주민번호</label>
                          <input
                            type="text"
                            value={신규직원.주민번호}
                            maxLength={14}
                            onChange={e => {
                              const raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 13);
                              const formatted = raw.length > 6 ? `${raw.slice(0, 6)}-${raw.slice(6)}` : raw;
                              if (raw.length >= 7 && 신규직원.주민번호.replace(/[^0-9]/g, '').length < 7) {
                                // 8차 D04-011: 축약 사본(1/2 만 1900, 나머지 2000)이라
                                // 외국인 코드 5/6(1900년대)을 2000년대로 봐 만 60세 경고가 뜨지 않았다.
                                const yearPrefix = parseInt(raw.slice(0, 2), 10);
                                const century = resolveResidentBirthCentury(raw.slice(6, 7));
                                if (century !== null) {
                                  const age = new Date().getFullYear() - (century + yearPrefix);
                                  if (age >= 60 && 신규직원.ins_national) toast(`만 ${age}세는 국민연금 의무 가입 대상이 아닙니다.\n국민연금 체크를 해제해 주세요.`);
                                }
                              }
                              신규직원설정({ ...신규직원, 주민번호: formatted });
                            }}
                            className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30"
                            placeholder="000000-0000000"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[12px] font-bold text-[var(--toss-gray-4)] ml-1">연락처 (개인)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={신규직원.전화번호}
                          onChange={e => {
                            let raw = e.target.value.replace(/[^0-9]/g, '');
                            let formatted = '';
                            if (raw.startsWith('010')) {
                              raw = raw.slice(0, 11);
                              if (raw.length <= 3) formatted = raw;
                              else if (raw.length <= 7) formatted = raw.slice(0, 3) + '-' + raw.slice(3);
                              else formatted = raw.slice(0, 3) + '-' + raw.slice(3, 7) + '-' + raw.slice(7);
                            } else if (raw.startsWith('02')) {
                              raw = raw.slice(0, 9);
                              if (raw.length <= 2) formatted = raw;
                              else if (raw.length <= 5) formatted = raw.slice(0, 2) + '-' + raw.slice(2);
                              else formatted = raw.slice(0, 2) + '-' + raw.slice(2, 5) + '-' + raw.slice(5);
                            } else {
                              raw = raw.slice(0, 10);
                              if (raw.length <= 3) formatted = raw;
                              else if (raw.length <= 6) formatted = raw.slice(0, 3) + '-' + raw.slice(3);
                              else formatted = raw.slice(0, 3) + '-' + raw.slice(3, 6) + '-' + raw.slice(6);
                            }
                            신규직원설정({ ...신규직원, 전화번호: formatted });
                          }}
                          placeholder="010-1234-5678"
                          className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[12px] font-bold text-[var(--toss-gray-4)] ml-1">주소</label>
                        <input type="text" value={신규직원.주소} onChange={e => 신규직원설정({ ...신규직원, 주소: e.target.value })} className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30" placeholder="상세 주소 입력" />
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-amber-400 rounded-full" />
                        부가 정보
                      </h4>
                      <div className="space-y-2">
                        <label className="text-[12px] font-bold text-[var(--toss-gray-4)] ml-1">내선번호</label>
                        <input type="text" value={신규직원.내선번호} onChange={e => 신규직원설정({ ...신규직원, 내선번호: e.target.value })} placeholder="1234" className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30" />
                      </div>
                      <div className="p-5 bg-amber-50 rounded-[var(--radius-xl)] border border-amber-100 space-y-4">
                        <h5 className="text-[11px] font-extrabold text-amber-800 flex items-center gap-1.5">📜 면허/자격 사항</h5>
                        <p className="text-[10px] font-semibold text-amber-700">
                          만료일·갱신일·다중 면허는 자격안전센터에서 관리됩니다.
                        </p>
                        {편집모드 && (licensesByStaff[String(선택된직원ID || '').toLowerCase().trim()]?.length ?? 0) >= 2 && (
                          <p className="text-[10px] font-bold text-amber-800 bg-amber-100 rounded-[var(--radius-md)] px-2 py-1">
                            이 직원은 면허 {licensesByStaff[String(선택된직원ID || '').toLowerCase().trim()]?.length}건 — 여기서는 첫 번째 면허만 수정됩니다
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-amber-700 ml-1">자격 명칭</label>
                            <input type="text" placeholder="간호사 등" value={신규직원.면허사항} onChange={e => 신규직원설정({ ...신규직원, 면허사항: e.target.value })} className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-amber-700 ml-1">면허 번호</label>
                            <input type="text" placeholder="번호 입력" value={신규직원.면허번호} onChange={e => 신규직원설정({ ...신규직원, 면허번호: e.target.value })} className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300" />
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-amber-700 ml-1">취득 일자</label>
                          <SmartDatePicker
                            value={신규직원.취득일자}
                            onChange={val => 신규직원설정({ ...신규직원, 취득일자: val })}
                            inputClassName="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-amber-700 ml-1">기타 내용</label>
                          <textarea
                            value={신규직원.면허기타내용}
                            onChange={e => 신규직원설정({ ...신규직원, 면허기타내용: e.target.value })}
                            placeholder="발급기관, 세부 자격 범위, 특이사항 등을 자유롭게 입력"
                            className="min-h-[88px] w-full resize-none p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === '소속' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                        소속 및 직책
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[12px] font-bold text-[var(--toss-gray-4)] ml-1">사업체</label>
                          <select value={신규직원.사업체} onChange={e => { 신규직원설정({ ...신규직원, 사업체: e.target.value, 팀: 팀목록가져오기(e.target.value)[0] ?? '', 근무형태ID: '', 근무형태IDs: [] }); 추가근무형태ID설정(''); 새근무형태표시설정(false); }} className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30 appearance-none" data-testid="new-staff-company-select">
                            <option value="">사업체 선택</option>
                            {availableCompanyOptions.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <label className="text-[12px] font-bold text-[var(--toss-gray-4)] ml-1">부서/팀</label>
                          <select data-testid="new-staff-team-select" value={신규직원.팀} onChange={e => 신규직원설정({ ...신규직원, 팀: e.target.value })} className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30 appearance-none">
                            <option value="">팀 선택 안함</option>
                            {팀목록가져오기(신규직원.사업체).map(팀 => <option key={팀} value={팀}>{팀}</option>)}
                          </select>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[12px] font-bold text-[var(--toss-gray-4)] ml-1">직함</label>
                        <select data-testid="new-staff-position-select" value={신규직원.직함} onChange={e => 신규직원설정({ ...신규직원, 직함: e.target.value })} className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30 appearance-none">
                          <option value="">직함 선택</option>
                          {['사원', '주임', '대리', '팀장', '간호과장', '간호부장', '실장', '부장', '진료부장', '총무부장', '이사', '원장', '병원장'].map(pos => (
                            <option key={pos} value={pos}>{pos}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-purple-500/100 rounded-full" />
                        근무 조건
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[12px] font-bold text-[var(--toss-gray-4)] ml-1">입사일 *</label>
                          <SmartDatePicker
                            value={신규직원.입사일}
                            onChange={val => 신규직원설정({ ...신규직원, 입사일: val || '' })}
                            data-testid="new-staff-joined-at-input"
                            className="w-full p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--accent)]/30"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[12px] font-bold text-[var(--toss-gray-4)] ml-1">고용형태</label>
                          <div className="flex gap-1 p-1 bg-[var(--muted)] rounded-[var(--radius-md)]">
                            {['정규직', '계약직'].map(type => (
                              <button
                                key={type}
                                type="button"
                                onClick={() => 신규직원설정({ ...신규직원, 고용형태: type, ...(type === '정규직' ? { 계약종료일: '' } : {}) })}
                                className={`flex-1 py-2 rounded-[var(--radius-md)] text-xs font-bold transition-all ${신규직원.고용형태 === type
                                  ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm'
                                  : 'text-[var(--toss-gray-3)]'
                                  }`}
                              >
                                {type}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[11px] font-bold text-blue-600 ml-1">수습 기간 설정</label>
                          <select
                            value={신규직원.probation_months}
                            onChange={e => 신규직원설정({ ...신규직원, probation_months: Number(e.target.value), ...(Number(e.target.value) === 0 ? { probation_percent: 100 } : {}) })}
                            className="w-full p-4 bg-blue-500/10 rounded-[var(--radius-lg)] border border-blue-100 outline-none font-bold text-sm focus:ring-2 focus:ring-blue-300 appearance-none"
                          >
                            <option value={0}>수습 없음</option>
                            <option value={1}>1개월</option>
                            <option value={2}>2개월</option>
                            <option value={3}>3개월</option>
                            <option value={6}>6개월</option>
                          </select>
                        </div>
                        {Number(신규직원.probation_months) > 0 && (
                          <div className="space-y-2 animate-in fade-in duration-300">
                            <label className="text-[11px] font-bold text-blue-600 ml-1">수습 급여 적용률</label>
                            <select
                              value={신규직원.probation_percent || 90}
                              onChange={e => 신규직원설정({ ...신규직원, probation_percent: Number(e.target.value) })}
                              className="w-full p-4 bg-blue-500/10 rounded-[var(--radius-lg)] border border-blue-100 outline-none font-bold text-sm focus:ring-2 focus:ring-blue-300 appearance-none"
                            >
                              <option value={100}>100% (지급액 동일)</option>
                              <option value={95}>95%</option>
                              <option value={90}>90% (일반적)</option>
                              <option value={85}>85%</option>
                              <option value={80}>80%</option>
                            </select>
                          </div>
                        )}
                      </div>
                      <div className="p-5 bg-purple-500/10 rounded-[var(--radius-xl)] border border-purple-100 space-y-4">
                        <h5 className="text-[11px] font-extrabold text-purple-800 flex items-center gap-1.5">⏱️ 상세 근로 시간 설정</h5>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-purple-700 ml-1">주당 근로시간 (시간)</label>
                            <input
                              type="number"
                              value={신규직원.working_hours_per_week}
                              onChange={e => 신규직원설정({ ...신규직원, working_hours_per_week: Number.parseFloat(e.target.value) || 0 })}
                              className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-purple-900 focus:ring-2 focus:ring-purple-300"
                              data-testid="new-staff-working-hours-per-week"
                              inputMode="decimal"
                              min="0"
                              step="0.1"
                              placeholder="40.0"
                            />
                            {신규직원.working_hours_per_week < 40 && 신규직원.working_hours_per_week > 0 && (
                              <p className="text-[9px] font-bold text-purple-600 mt-1 ml-1">
                                ✨ 단시간 근로자 비례 연차: 월 {Math.round((신규직원.working_hours_per_week / 40) * 10) / 10}일 발생
                              </p>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-purple-700 ml-1">주당 근무일수 (일)</label>
                            <input
                              type="number"
                              value={신규직원.working_days_per_week}
                              onChange={e => 신규직원설정({ ...신규직원, working_days_per_week: parseInt(e.target.value, 10) || 0 })}
                              className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-purple-900 focus:ring-2 focus:ring-purple-300"
                              data-testid="new-staff-working-days-per-week"
                              placeholder="5"
                            />
                          </div>
                        </div>
                      </div>
                      {신규직원.고용형태 === '계약직' && (
                        <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                          <label className="text-[11px] font-bold text-orange-600 ml-1">계약 종료일</label>
                          <SmartDatePicker
                            value={신규직원.계약종료일}
                            onChange={val => 신규직원설정({ ...신규직원, 계약종료일: val || '' })}
                            className="w-full p-4 bg-orange-500/10 rounded-[var(--radius-lg)] border border-orange-100 outline-none font-bold text-sm focus:ring-2 focus:ring-orange-300"
                          />
                        </div>
                      )}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-[12px] font-bold text-[var(--toss-gray-4)] ml-1">지정 스케줄 (근무형태)</label>
                          <button
                            type="button"
                            onClick={추가근무형태선택창열기}
                            className="text-[11px] font-bold text-[var(--accent)] flex items-center gap-0.5 hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30 rounded-[var(--radius-md)]"
                            aria-label="근무형태 추가 패널 열기"
                          >
                            + 새 유형 추가
                          </button>
                        </div>
                        <select
                          value={신규직원.근무형태ID}
                          onChange={e => 대표근무형태설정(e.target.value)}
                          className="w-full p-4 bg-[var(--toss-blue-light)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30 appearance-none"
                          data-testid="new-staff-shift-select"
                          aria-label="대표 근무형태 선택"
                        >
                          <option value="">근무형태 선택</option>
                          {getVisibleShiftOptions(신규직원.사업체).map((s: StaffMember) => (
                            <option key={s.id} value={s.id}>
                              {s.name as string} ({s.start_time as string}~{s.end_time as string})
                            </option>
                          ))}
                        </select>
                        {선택근무형태IDs.length > 0 && (
                          <div className="space-y-2" data-testid="new-staff-selected-shifts">
                            {선택근무형태IDs.map((shiftId, index) => {
                              const shift = findShiftById(shiftId) as StaffMember | undefined;
                              const startTime = String(shift?.start_time || '').slice(0, 5);
                              const endTime = String(shift?.end_time || '').slice(0, 5);
                              const timeLabel = startTime || endTime ? `${startTime || '-'}~${endTime || '-'}` : '시간 미설정';
                              return (
                                <div key={shiftId} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] px-3 py-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-[12px] font-bold text-[var(--foreground)]">
                                      {index === 0 ? '대표 ' : `${index + 1}번째 `}
                                      {String(shift?.name || '근무형태')}
                                    </p>
                                    <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
                                      {timeLabel}
                                      {shift?.shift_type ? ` · ${String(shift.shift_type)}` : ''}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => 근무형태제거(shiftId)}
                                    className="shrink-0 rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--toss-gray-4)] hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                                    data-testid={`new-staff-remove-shift-${shiftId}`}
                                    aria-label="근무형태 제거"
                                  >
                                    제거
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {새근무형태표시 && (
                          <div className="bg-blue-500/10 border border-blue-100 rounded-[var(--radius-lg)] p-3 space-y-3 animate-in fade-in slide-in-from-top-2">
                            <p className="text-[11px] font-bold text-blue-700">회사 근무형태에서 추가</p>
                            {추가가능근무형태목록.length > 0 ? (
                              <>
                                <select
                                  value={추가근무형태ID}
                                  onChange={e => 추가근무형태ID설정(e.target.value)}
                                  className="w-full p-2.5 text-xs font-bold bg-[var(--card)] rounded-[var(--radius-md)] border border-blue-100 outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                                  data-testid="new-staff-extra-shift-select"
                                  aria-label="추가할 근무형태 선택"
                                >
                                  {추가가능근무형태목록.map((shift: StaffMember) => (
                                    <option key={shift.id} value={shift.id}>
                                      {String(shift.name || '근무형태')} ({String(shift.start_time || '').slice(0, 5)}~{String(shift.end_time || '').slice(0, 5)})
                                    </option>
                                  ))}
                                </select>
                                <div className="flex gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={추가근무형태반영}
                                    className="flex-1 py-2 bg-[var(--accent)] text-white text-[11px] font-bold rounded-[var(--radius-md)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                                    data-testid="new-staff-extra-shift-add-button"
                                  >
                                    선택 추가
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => 새근무형태표시설정(false)}
                                    className="px-3 py-2 bg-[var(--card)] text-[11px] font-bold text-[var(--toss-gray-3)] rounded-[var(--radius-md)] border border-blue-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                                  >
                                    취소
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-bold text-blue-700">
                                  선택 가능한 회사 근무형태가 없습니다.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => 새근무형태표시설정(false)}
                                  className="px-3 py-2 bg-[var(--card)] text-[11px] font-bold text-[var(--toss-gray-3)] rounded-[var(--radius-md)] border border-blue-100 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
                                >
                                  닫기
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        <p className="text-[10px] font-semibold text-[var(--toss-gray-3)] ml-1">
                          회사·조직에 등록된 근무유형만 선택할 수 있습니다. 새 근무유형은 근무유형 관리에서 추가하세요. 대표 근무형태 외에 추가 유형을 등록하면 주간 로테이션 스케줄로 활용됩니다.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === '급여' && (
                  <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {/* 🎯 포괄임금 월급 역산 도우미 */}
                    <div className="p-4 rounded-[var(--radius-xl)] bg-[var(--page-bg)] border border-[var(--border)] space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-base" aria-hidden="true">🎯</span>
                        <h4 className="text-xs font-bold text-[var(--foreground)]">
                          포괄임금 월급 역산 도우미
                        </h4>
                        <span className="text-[10px] text-[var(--toss-gray-3)] font-semibold">
                          (근무 스케줄 기준 법적 비율 분할)
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--toss-gray-4)] font-medium">
                        합의된 세전 월급 총액을 입력하시면, 설정된 **주 소정근로시간({신규직원.working_hours_per_week}시간)** 및 입력된 고정 수당(식대, 직책수당 등)을 계산하여 법적으로 가장 안전한 비율의 **기본급과 약정연장수당**으로 자동 배분해 드립니다.
                      </p>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="relative">
                          <input
                            type="text"
                            placeholder="약정 세전 월급 입력 (예: 3,500,000)"
                            value={targetSalaryInput ? Number(targetSalaryInput.replace(/,/g, '')).toLocaleString() : ''}
                            onChange={(e) => {
                              const raw = e.target.value.replace(/,/g, '');
                              if (/^\d*$/.test(raw)) {
                                setTargetSalaryInput(raw);
                              }
                            }}
                            className="w-full p-3 pr-8 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none font-bold text-xs focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                          />
                          {targetSalaryInput && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--toss-gray-4)]">
                              원
                            </span>
                          )}
                        </div>

                        <div className="relative">
                          <input
                            type="text"
                            placeholder="주 평균 야간근로시간 (선택, 예: 4)"
                            value={targetNightHoursInput}
                            onChange={(e) => {
                              const raw = e.target.value;
                              if (/^\d*$/.test(raw)) {
                                setTargetNightHoursInput(raw);
                              }
                            }}
                            className="w-full p-3 pr-16 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none font-semibold text-xs focus:ring-2 focus:ring-[var(--accent)]/30 focus:border-[var(--accent)]"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--toss-gray-4)]">
                            시간/주
                          </span>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={handleApplySplit}
                          disabled={!reverseCalculateSplit?.isValid}
                          className="w-full sm:w-auto px-5 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-bold text-xs shadow-sm hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        >
                          자동 분할 적용하기
                        </button>
                      </div>
                      
                      {reverseCalculateSplit && (
                        <div className={`p-3 rounded-[var(--radius-lg)] text-[11px] font-semibold border ${
                          reverseCalculateSplit.isValid 
                            ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' 
                            : 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                        }`}>
                          <div className="flex items-start gap-2">
                            <span className="text-[12px]">{reverseCalculateSplit.isValid ? '✅' : '⚠️'}</span>
                            <div className="flex-1 space-y-1">
                              <p>{reverseCalculateSplit.message}</p>
                              {reverseCalculateSplit.isValid && (
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1.5 mt-1.5 border-t border-emerald-500/20 text-[10px] text-emerald-600">
                                  <div>· 기본급(예정): <span className="font-bold">{reverseCalculateSplit.base_salary?.toLocaleString()}원</span></div>
                                  <div>· 약정연장(예정): <span className="font-bold">{reverseCalculateSplit.agreed_overtime_allowance?.toLocaleString()}원</span></div>
                                  {reverseCalculateSplit.agreed_night_allowance && reverseCalculateSplit.agreed_night_allowance > 0 ? (
                                    <div>· 약정야간(예정): <span className="font-bold">{reverseCalculateSplit.agreed_night_allowance.toLocaleString()}원</span></div>
                                  ) : null}
                                  <div>· 역산시급: <span className="font-bold">{reverseCalculateSplit.derivedHourlyRate?.toLocaleString()}원</span></div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* (과세) 월 급여 및 고정 수당 */}
                    <div className="space-y-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                            <span className="w-1.5 h-4 bg-[var(--accent)] rounded-full" />
                            월 급여 및 고정 수당 (과세)
                          </h4>
                          {편집모드 && 선택된직원ID && (
                            <button
                              type="button"
                              onClick={() => setShowSalaryHistoryModal(true)}
                              className="px-2.5 py-1 rounded-lg bg-[var(--toss-blue-light)] text-[var(--accent)] text-[11px] font-bold hover:opacity-80 transition-opacity border border-[var(--accent)]/20 flex items-center gap-1 shadow-xs"
                            >
                              <span>💰</span> 급여 변동 이력 관리
                            </button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-3 rounded-[var(--radius-xl)] bg-[var(--toss-blue-light)] px-4 py-3 md:min-w-[320px]">
                          <div>
                            <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">총 급여</p>
                            <p data-testid="new-staff-total-salary" className="mt-1 text-base font-black text-[var(--foreground)]">{formatWon(totalSalaryAmount)}</p>
                          </div>
                          <div className="border-l border-[var(--border)] pl-3">
                            <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">시급</p>
                            <p data-testid="new-staff-hourly-wage" className="mt-1 text-base font-black text-[var(--accent)]">{formatWon(hourlySalaryAmount)}</p>
                          </div>
                          <div className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                            <span>과세 {formatWon(taxableSalaryTotal)}</span>
                            <span>비과세 {formatWon(taxfreeSalaryTotal)}</span>
                            <span>월 소정근로시간 {monthlyWorkingHours.toLocaleString('ko-KR')}시간 기준</span>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-[var(--muted)] p-3 rounded-[var(--radius-xl)]">
                        {TAXABLE_SALARY_FIELDS.map(({ key, label }) => {
                          const val = Number(신규직원[key as keyof typeof 신규직원] ?? 0);
                          const hoursKey = isHoursBasedAllowance(key) ? key : null;
                          const hoursVal = hoursKey ? Number(신규직원.allowance_hours?.[hoursKey] ?? 0) : 0;
                          const multiplier = hoursKey ? getAllowanceMultiplier(hoursKey) : 1;
                          return (
                            <div key={key} className="space-y-1">
                              <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1 flex items-center gap-1">
                                {label}
                                {hoursKey && (
                                  <span className="text-[8px] font-extrabold text-[var(--accent)] bg-[var(--toss-blue-light)] px-1 py-0.5 rounded">
                                    시급×{multiplier}
                                  </span>
                                )}
                              </label>
                              <input
                                type="text"
                                inputMode="numeric"
                                data-testid={`new-staff-salary-${key}`}
                                value={val ? val.toLocaleString() : ''}
                                onChange={e => {
                                  const n = parseInt(e.target.value.replace(/,/g, ''), 10) || 0;
                                  신규직원설정({ ...신규직원, [key]: n });
                                }}
                                placeholder="0"
                                className="w-full p-2 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none font-bold text-xs focus:ring-2 focus:ring-[var(--accent)]/30"
                              />
                              {hoursKey && (
                                <div className="flex items-center gap-1">
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    data-testid={`new-staff-salary-hours-${key}`}
                                    value={hoursVal ? String(hoursVal) : ''}
                                    onChange={e => {
                                      const h = parseFloat(e.target.value.replace(/[^0-9.]/g, '')) || 0;
                                      const won = allowanceWonFromHours(hourlySalaryAmount, h, hoursKey);
                                      신규직원설정(prev => ({
                                        ...prev,
                                        allowance_hours: { ...prev.allowance_hours, [hoursKey]: h },
                                        [hoursKey]: won }));
                                    }}
                                    placeholder="시간 입력"
                                    className="flex-1 min-w-0 p-1.5 bg-[var(--toss-blue-light)] rounded-[var(--radius-md)] border-none outline-none font-bold text-[11px] text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30"
                                    aria-label={`${label} 시간 입력 (환산시급 × 시간 × ${multiplier})`}
                                  />
                                  <span className="text-[8px] font-bold text-[var(--toss-gray-3)] whitespace-nowrap">시간</span>
                                </div>
                              )}
                            </div>
                        );
                      })}
                      </div>


                    </div>

                    {/* (비과세) 항목 */}
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                        비과세 수당 항목
                      </h4>
                      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 bg-[var(--muted)] p-3 rounded-[var(--radius-xl)]">
                        {TAXFREE_SALARY_FIELDS.map(({ key, label }) => {
                          const val = Number(신규직원[key as keyof typeof 신규직원] ?? 0);
                          return (
                            <div key={key} className="space-y-1">
                              <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">{label}</label>
                              <input
                                type="text"
                                inputMode="numeric"
                                data-testid={`new-staff-taxfree-${key}`}
                                value={val ? val.toLocaleString() : ''}
                                onChange={e => {
                                  const n = parseInt(e.target.value.replace(/,/g, ''), 10) || 0;
                                  신규직원설정({ ...신규직원, [key]: n });
                                }}
                                placeholder="0"
                                className="w-full p-2 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none font-bold text-[11px] focus:ring-2 focus:ring-emerald-500/30"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 사회보험 및 복지 (하단) */}
                    <div className="space-y-4 pt-4 border-t border-[var(--border)]">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-red-400 rounded-full" />
                        사회보험 및 복지 설정
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-[var(--muted)] p-4 rounded-[var(--radius-xl)] space-y-3">
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { key: 'ins_national', label: '국민연금' },
                              { key: 'ins_health', label: '건강보험' },
                              { key: 'ins_employment', label: '고용보험' },
                              { key: 'ins_injury', label: '산재보험' },
                            ].map((item) => (
                              <label key={item.key} className="flex items-center gap-3 p-3 bg-[var(--card)] rounded-[var(--radius-md)] shadow-sm cursor-pointer border-2 border-transparent hover:border-[var(--toss-blue-light)] transition-all">
                                <input
                                  type="checkbox"
                                  checked={신규직원[item.key as keyof typeof 신규직원] as boolean}
                                  onChange={e => {
                                    if (item.key === 'ins_national' && e.target.checked && 신규직원.주민번호.length >= 7) {
                                      const raw = 신규직원.주민번호.replace('-', '');
                                      const yearPrefix = parseInt(raw.slice(0, 2), 10);
                                      const genderDigit = parseInt(raw.slice(6, 7), 10);
                                      const birthYear = (genderDigit === 1 || genderDigit === 2) ? 1900 + yearPrefix : 2000 + yearPrefix;
                                      const age = new Date().getFullYear() - birthYear;
                                      if (age >= 60) return toast('만 60세 이상은 국민연금 가입 대상이 아닙니다.');
                                    }
                                    신규직원설정({ ...신규직원, [item.key]: e.target.checked });
                                  }}
                                  className="w-4 h-4 rounded text-[var(--accent)]"
                                />
                                <span className="text-xs font-bold text-[var(--foreground)]">{item.label}</span>
                              </label>
                            ))}
                          </div>
                          {신규직원.ins_national && (
                            <div className="p-2.5 bg-[var(--card)] border border-blue-200 rounded-[var(--radius-md)] space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-bold text-blue-900 flex items-center gap-1">
                                  <span>🏛️</span> 국민연금 결정세액 (고지금액)
                                </span>
                                <span className="text-[10px] text-[var(--toss-gray-3)]">미입력 시 2026년 요율(4.75%) 자동계산</span>
                              </div>
                              <div className="relative flex items-center">
                                <span className="absolute left-2.5 text-xs text-[var(--toss-gray-3)] font-bold">₩</span>
                                <input
                                  type="number"
                                  min={0}
                                  placeholder="공단 고지액 (예: 180000)"
                                  value={신규직원.ins_national_amount}
                                  onChange={(e) =>
                                    신규직원설정({
                                      ...신규직원,
                                      ins_national_amount: e.target.value === '' ? '' : Math.max(0, parseInt(e.target.value, 10) || 0)
                                    })
                                  }
                                  className="w-full h-8 pl-6 pr-2 text-xs font-bold rounded border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] outline-none focus:ring-2 focus:ring-blue-500/20"
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="p-4 bg-blue-500/10 border border-blue-100 rounded-[var(--radius-xl)] space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-base">💎</span>
                              <h4 className="text-xs font-bold text-blue-900">두루누리 지원 (80%)</h4>
                            </div>
                            <input type="checkbox" checked={신규직원.ins_duru_nuri} onChange={e => 신규직원설정({ ...신규직원, ins_duru_nuri: e.target.checked })} className="w-4 h-4 rounded" />
                          </div>
                          {신규직원.ins_duru_nuri && (
                            <div className="grid grid-cols-2 gap-2 animate-in fade-in">
                              <SmartDatePicker
                                placeholder="0000-00"
                                value={신규직원.duru_nuri_start}
                                onChange={val => 신규직원설정({ ...신규직원, duru_nuri_start: val || '' })}
                                inputClassName="p-2.5 bg-[var(--card)] border border-blue-500/20 rounded-lg text-[10px] font-bold"
                              />
                              <SmartDatePicker
                                placeholder="0000-00"
                                value={신규직원.duru_nuri_end}
                                onChange={val => 신규직원설정({ ...신규직원, duru_nuri_end: val || '' })}
                                inputClassName="p-2.5 bg-[var(--card)] border border-blue-500/20 rounded-lg text-[10px] font-bold"
                              />
                            </div>
                          )}
                        </div>

                        <div className="p-4 bg-emerald-50 rounded-[var(--radius-xl)] border border-emerald-100 space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={신규직원.is_basic_living} onChange={e => {
                              if (e.target.checked && 신규직원.ins_health) {
                                toast('기초생활수급 및 의료급여 수급자는 건강보험 가입 제외 대상일 수 있습니다.\n건강보험 체크 상태를 확인 및 해제해 주세요.', 'warning');
                              }
                              신규직원설정({ ...신규직원, is_basic_living: e.target.checked });
                            }} className="w-4 h-4 rounded text-emerald-600" />
                            <span className="text-xs font-bold text-emerald-800">기초생활수급/차상위</span>
                          </label>
                          {신규직원.is_basic_living && (
                            <label className="ml-7 flex items-center gap-2 animate-in slide-in-from-left-2">
                              <input type="checkbox" checked={신규직원.is_medical_benefit} onChange={e => 신규직원설정({ ...신규직원, is_medical_benefit: e.target.checked })} className="w-3.5 h-3.5 rounded text-emerald-600" />
                              <span className="text-[10px] font-bold text-emerald-700">의료급여 (건보 제외)</span>
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 하단 버튼 영역 (Footer) - 스크롤 영역 외부에 고정 */}
              <div className="px-4 py-3 bg-[var(--page-bg)] border-t border-[var(--border)] flex gap-3 shrink-0">
                <button onClick={닫기함수} className="flex-1 py-3.5 md:py-4 bg-[var(--muted)] text-[var(--toss-gray-4)] rounded-[var(--radius-md)] font-semibold text-sm hover:opacity-90 transition-all">취소</button>
                <button data-testid="new-staff-save-button" onClick={정보저장} className="flex-[2] py-3.5 md:py-4 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-semibold text-sm shadow-sm hover:scale-[0.99] active:scale-95 transition-all">정보 저장하기</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ESS 승인 대기함 모달 */}
      {showEssModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120] flex items-center justify-center p-4 min-h-screen">
          <div className="bg-[var(--page-bg)] w-full max-w-3xl rounded-[var(--radius-xl)] overflow-hidden shadow-sm flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--card)]">
              <div>
                <h3 className="text-lg font-bold text-[var(--foreground)]">내정보 변경 요청 (ESS)</h3>
                <p className="text-xs text-[var(--toss-gray-3)] mt-1">직원들이 요청한 프로필 변경 사항을 검토하고 승인하세요.</p>
              </div>
              <button onClick={() => setShowEssModal(false)} className="text-[var(--toss-gray-3)] hover:text-red-500 text-xl font-bold">✕</button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-[var(--muted)]">
              {/* 조회 실패와 "요청 없음"을 반드시 구분해서 보여준다(실패를 빈 목록으로 위장하지 않는다). */}
              {essLoadError ? (
                <div className="py-16 px-4 text-center">
                  <p className="text-sm font-bold text-red-600">변경 요청 목록을 불러오지 못했습니다.</p>
                  <p className="mt-2 text-xs text-[var(--toss-gray-3)] break-words">{essLoadError}</p>
                  <p className="mt-2 text-[11px] text-[var(--toss-gray-4)]">
                    대기 중인 요청이 없다는 뜻이 아닙니다. 권한 또는 네트워크 상태를 확인한 뒤 새로고침하세요.
                  </p>
                </div>
              ) : essRequests.length === 0 ? (
                <div className="py-20 text-center text-[var(--toss-gray-3)] font-medium text-sm">
                  대기 중인 변경 요청이 없습니다.
                </div>
              ) : (
                <div className="space-y-4">
                  {essRequests.map(req => {
                    const changes = req.details.requested_changes || {};
                    const original = req.details.original_data || {};
                    // 바뀐 항목만 필터링
                    const changedKeys = Object.keys(changes).filter(k => changes[k] !== original[k]);

                    return (
                      <div key={req.id} className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm p-5 space-y-4">
                        <div className="flex justify-between items-center border-b border-[var(--border)] pb-3">
                          <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-full bg-[var(--toss-blue-light)] text-[var(--accent)] flex items-center justify-center font-bold">{req.user_name?.[0]}</span>
                            <div>
                              <p className="font-bold text-[var(--foreground)] text-sm">{req.user_name} <span className="text-xs font-medium text-[var(--toss-gray-3)] ml-1">님의 변경 요청</span></p>
                              <p className="text-[10px] text-[var(--toss-gray-3)]">{new Date(req.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {changedKeys.length === 0 ? (
                            <p className="text-xs text-[var(--toss-gray-4)] p-2">변경된 실질 항목이 없습니다.</p>
                          ) : (
                            changedKeys.map(k => (
                              <div key={k} className="p-3 bg-[var(--muted)] rounded-[var(--radius-md)] flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">{ESS_FIELD_LABELS[k] || k}</span>
                                <div className="text-xs font-semibold text-[var(--foreground)] break-words">
                                  <span className="line-through text-[var(--toss-gray-3)] text-[11px] block">{original[k] || '(빈 값)'}</span>
                                  <span className="text-emerald-600 block mt-0.5">→ {changes[k] || '(빈 값)'}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        <div className="flex justify-end gap-2 pt-2">
                          <button onClick={() => setPendingEssAction({ type: 'reject', request: req })} className="px-5 py-2.5 bg-red-500/10 text-red-600 hover:bg-red-500/20 rounded-[var(--radius-md)] font-semibold text-[11px] transition-colors">반려</button>
                          <button onClick={() => setPendingEssAction({ type: 'approve', request: req })} className="px-5 py-2.5 bg-emerald-500 text-white hover:bg-emerald-600 rounded-[var(--radius-md)] font-semibold text-[11px] transition-colors shadow-sm">승인하기</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {essRequests.length > 0 && (
              <div className="bg-[var(--card)] p-4 border-t border-[var(--border)] text-center">
                <p className="text-xs font-semibold text-[var(--toss-gray-4)]">총 <span className="text-[var(--accent)]">{essRequests.length}건</span>의 리뷰 대기 건이 있습니다.</p>
              </div>
            )}
          </div>
        </div>
      )}

      <RiskActionDialog
        open={!!pendingEssAction}
        title={pendingEssAction?.type === 'approve' ? 'ESS 정보 변경 승인' : 'ESS 정보 변경 반려'}
        description="직원 셀프서비스 요청을 처리하기 전 변경 전후와 영향 범위를 확인합니다."
        targetLabel={pendingEssAction ? `${pendingEssAction.request.user_name || '-'}님의 프로필 변경 요청` : undefined}
        tone={pendingEssAction?.type === 'reject' ? 'danger' : 'success'}
        items={[
          { label: '처리 결과', value: pendingEssAction?.type === 'approve' ? '직원 기본정보에 반영' : '요청 반려 및 대기함 제거', tone: pendingEssAction?.type === 'reject' ? 'danger' : 'success' },
          { label: '요청 일시', value: pendingEssAction?.request.created_at ? new Date(String(pendingEssAction.request.created_at)).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : '-' },
        ]}
        changes={pendingEssAction ? getEssReviewChanges(pendingEssAction.request) : []}
        impacts={[
          pendingEssAction?.type === 'approve'
            ? '급여 계좌, 연락처, 주소 등 직원 마스터 데이터가 즉시 갱신됩니다.'
            : '직원 마스터 데이터는 변경되지 않고 요청 상태만 반려로 기록됩니다.',
          '처리 결과는 audit_logs에 남아 이후 검토 이력으로 사용됩니다.',
        ]}
        warnings={[
          '급여 계좌 변경은 급여 지급 전 검토가 필요합니다.',
          '권한/복지 정보가 포함된 요청은 접근 범위 변경 여부를 다시 확인하세요.',
        ]}
        confirmLabel={pendingEssAction?.type === 'approve' ? '승인 확정' : '반려 확정'}
        onCancel={() => setPendingEssAction(null)}
        onConfirm={async () => {
          if (!pendingEssAction) return;
          const action = pendingEssAction;
          if (action.type === 'approve') {
            await handleApproveEssSafe(action.request);
          } else {
            await handleRejectEss(action.request);
          }
          setPendingEssAction(null);
        }}
      />

      <RiskActionDialog
        open={!!pendingRetirementStaff}
        title="퇴사 처리 확인"
        description="직원 삭제 버튼은 실제 삭제가 아니라 재직 상태를 퇴사로 전환합니다."
        targetLabel={pendingRetirementStaff ? `${pendingRetirementStaff.name} · ${pendingRetirementStaff.company || '-'} · ${pendingRetirementStaff.department || '-'}` : undefined}
        tone="danger"
        items={[
          { label: '처리 방식', value: '재직 → 퇴사', tone: 'danger' },
          { label: '퇴사일', value: String(pendingRetirementStaff?.resigned_at || getKoreanTodayString()) },
          { label: '사번', value: String(pendingRetirementStaff?.employee_no || '-') },
          { label: '직함', value: String(pendingRetirementStaff?.position || '-') },
        ]}
        changes={[
          { label: '상태', before: String(pendingRetirementStaff?.status || '재직'), after: '퇴사' },
          { label: '퇴사일', before: String(pendingRetirementStaff?.resigned_at || '(빈 값)'), after: String(pendingRetirementStaff?.resigned_at || getKoreanTodayString()) },
        ]}
        impacts={[
          '재직자 목록과 인사관리 기본 필터에서 제외됩니다.',
          '퇴사 처리 감사 로그가 남고 선택 중인 직원 편집 화면은 닫힙니다.',
          '급여, 계약, 문서 이력은 삭제되지 않으며 기존 데이터와 연결을 유지합니다.',
        ]}
        warnings={[
          '최종 급여 정산, 계약 종료, 장비 반납 등 오프보딩 작업 완료 여부를 확인하세요.',
        ]}
        confirmLabel="퇴사 처리"
        onCancel={() => setPendingRetirementStaff(null)}
        onConfirm={async () => {
          if (!pendingRetirementStaff) return;
          const staff = pendingRetirementStaff;
          await 직원삭제(staff);
          setPendingRetirementStaff(null);
        }}
      />

      <RiskActionDialog
        open={!!pendingDeleteStaff}
        title="직원 정보 완전 삭제"
        description="이 작업은 선택된 직원의 모든 마스터 데이터를 데이터베이스에서 영구적으로 삭제합니다."
        targetLabel={pendingDeleteStaff ? `${pendingDeleteStaff.name} · ${pendingDeleteStaff.company || '-'} · ${pendingDeleteStaff.department || '-'}` : undefined}
        tone="danger"
        loading={isDeleting}
        items={[
          { label: '처리 방식', value: '데이터베이스 영구 삭제 (완전 삭제)', tone: 'danger' },
          { label: '사번', value: String(pendingDeleteStaff?.employee_no || '-') },
          { label: '입사일', value: String(pendingDeleteStaff?.joined_at || '-') },
          { label: '직함', value: String(pendingDeleteStaff?.position || '-') },
        ]}
        changes={[
          { label: '직원 정보', before: pendingDeleteStaff?.name, after: '완전 삭제 (복구 불가)' },
        ]}
        impacts={[
          '해당 직원의 인적 사항, 급여 기준, 면허 사항 등 모든 정보가 삭제됩니다.',
          '직원 삭제 감사 로그가 영구 기록됩니다.',
        ]}
        warnings={[
          '실제 결재 내역, 메신저 메시지 등 감사 추적이 필요한 다른 정보에 이 직원의 ID가 사용된 경우 외래키 제약조건에 의해 삭제가 차단될 수 있습니다. 이 경우, 완전 삭제 대신 퇴사 처리를 해야 합니다.',
          '삭제 후에는 데이터를 복구할 수 없습니다. 신중히 실행하세요.',
        ]}
        confirmLabel="완전 삭제 실행"
        onCancel={() => setPendingDeleteStaff(null)}
        onConfirm={async () => {
          if (!pendingDeleteStaff) return;
          await 직원완전삭제(pendingDeleteStaff);
          setPendingDeleteStaff(null);
        }}
      />

      {showSalaryHistoryModal && (
        <SalaryChangeHistoryModal
          open={showSalaryHistoryModal}
          onClose={() => setShowSalaryHistoryModal(false)}
          staff={직원목록.find((s: StaffMember) => s.id === 선택된직원ID) || null}
          onRefresh={새로고침}
        />
      )}
    </div>
  );
}
