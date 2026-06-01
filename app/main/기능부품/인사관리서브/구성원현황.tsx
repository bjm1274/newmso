'use client';
import { toast } from '@/lib/toast';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import ProfilePhotoThumbnail from '@/app/components/ProfilePhotoThumbnail';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
import type { StaffMember } from '@/types';
import { supabase } from '@/lib/supabase';
import { isActiveStaff } from '@/lib/active-staff';
import { isMissingColumnError, withMissingColumnsFallback } from '@/lib/supabase-compat';
import { buildAuditDiff, logAudit, readClientAuditActor } from '@/lib/audit';
import { getChecklistTargetDate, getDefaultChecklist } from '@/lib/hr-checklists';
import { getMinimumWageByYear, MONTHLY_STANDARD_HOURS } from '@/lib/tax-free-limits';
import {
  calculateHourlyRateFromMonthlySalary,
  getMonthlyWorkingHours,
  resolveWeeklyWorkingHours,
  resolveWorkingDaysPerWeek,
} from '@/lib/payroll-working-hours';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import {
  cleanOptionalText,
  getStaffContractEndDate,
  getStaffEmploymentType,
  getStaffExtension,
  getStaffProbationMonths,
  getStaffProbationPercent,
  toIntegerOrFallback,
} from '@/lib/staff-meta';
import {
  fetchStaffLicensesGrouped,
  summarizeLicenses,
  type StaffLicenseRow,
} from './구성원현황/staff-license-link';
import StaffHistoryTimeline from './인사이력타임라인';
import OnboardingChecklist from './급여명세/입퇴사온보딩';
import CertTransferPanel from './교육자격인사이동패널';
import RiskActionDialog from './RiskActionDialog';
import SmartDatePicker from '../공통/SmartDatePicker';
import { formatWon as libFormatWon } from '@/lib/date-formatter';
import { getWeeklyRotationShiftIds } from '@/lib/contract-shift-rotation';

const formatWon = (amount: number) => libFormatWon(Math.round(amount || 0));

function createEmptyStaffForm(selectedCompany?: string) {
  const company = selectedCompany && selectedCompany !== '전체' ? selectedCompany : '';

  return {
    성명: '', 전화번호: '', 내선번호: '', 사업체: company, 팀: '', 직함: '', 입사일: '', 퇴사일: '',
    주민번호: '', 이메일: '', 주소: '', 면허사항: '', 면허번호: '', 취득일자: '', 면허기타내용: '', 계좌정보: '', 임금정보: '', 상태: '재직',
    연차총개수: 0, 연차사용개수: 0, 근무형태ID: '', 근무형태IDs: [] as string[],
    고용형태: '정규직' as string, 계약종료일: '' as string,
    probation_months: 0,
    probation_percent: 90,
    base_salary: 0,
    meal_allowance: 0, night_duty_allowance: 0, vehicle_allowance: 0, childcare_allowance: 0, research_allowance: 0, other_taxfree: 0, position_allowance: 0,
    overtime_allowance: 0, night_work_allowance: 0, holiday_work_allowance: 0, annual_leave_pay: 0,
    agreed_overtime_allowance: 0, agreed_night_allowance: 0,
    ins_national: true, ins_health: true, ins_employment: true, ins_injury: true, is_basic_living: false, other_welfare: '',
    ins_duru_nuri: false, duru_nuri_start: '', duru_nuri_end: '', is_medical_benefit: false,
    working_hours_per_week: 40, working_days_per_week: 5,
  };
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

const ESS_FIELD_LABELS: Record<string, string> = {
  email: '이메일',
  phone: '연락처',
  extension: '내선번호',
  address: '거주지 주소',
  bank_name: '급여 은행',
  bank_account: '급여 계좌번호',
  permissions: '권한/복지 정보',
};

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
        message: '고정 수당 합계가 목표 월급보다 큽니다. 고정 수당을 조정하거나 목표 월급을 높여주세요.',
      };
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
        message: `최저시급 미달 (역산시급: ${derivedHourlyRate.toLocaleString()}원 / 기준: ${previewMinimumWage.toLocaleString()}원). 최소 세전 ${minTarget.toLocaleString()}원 이상 입력하셔야 합니다.`,
      };
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
      message: `최저시급 준수 완료 (역산시급: ${derivedHourlyRate.toLocaleString()}원)`,
    };
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
      agreed_night_allowance: reverseCalculateSplit.agreed_night_allowance || 0,
    }));
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

  // ESS (직원 셀프 서비스) 승인 대기함 관련
  const [essRequests, setEssRequests] = useState<any[]>([]);
  const [showEssModal, setShowEssModal] = useState(false);
  const [pendingEssAction, setPendingEssAction] = useState<{
    type: 'approve' | 'reject';
    request: Record<string, unknown>;
  } | null>(null);
  const [pendingRetirementStaff, setPendingRetirementStaff] = useState<StaffMember | null>(null);
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
        textValue: raw,
      };
    }

    return {
      isNumeric: false,
      numericValue: Number.POSITIVE_INFINITY,
      textValue: raw,
    };
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
    return sortShiftOptions(
      근무형태목록.filter((shift: StaffMember) => {
        const isActive = shift?.is_active !== false;
        const shiftCompany = getShiftCompanyName(shift);
        return isActive && (!selectedCompany || !shiftCompany || shiftCompany === selectedCompany);
      })
    );
  };

  const 선택근무형태IDs = useMemo(
    () => getStaffFormShiftIds(신규직원),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [신규직원.근무형태ID, 신규직원.근무형태IDs],
  );
  const 추가가능근무형태목록 = useMemo(
    () =>
      getVisibleShiftOptions(신규직원.사업체).filter(
        (shift: StaffMember) => !선택근무형태IDs.includes(String(shift.id)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [신규직원.사업체, 선택근무형태IDs, 근무형태목록],
  );

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
        return { ...prev, 근무형태ID: nextShiftId, 근무형태IDs: [nextShiftId, ...restShiftIds] };
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
        return { ...prev, 근무형태ID: nextIds[0] || '', 근무형태IDs: nextIds };
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
        return { ...prev, 근무형태ID: nextIds[0] || '', 근무형태IDs: nextIds };
      });
    } catch (error) {
      console.error('근무형태 제거 실패:', error);
      toast('근무형태 제거 중 오류가 발생했습니다.', 'error');
    }
  };

  useEffect(() => {
    const loadCompanyOptions = async () => {
      const { data, error } = await supabase
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
      const staffIdsInCompany = 직원목록
        .filter((s: StaffMember) => s.company === 선택사업체)
        .map((s: StaffMember) => s.id);

      if (staffIdsInCompany.length === 0) {
        setEssRequests([]);
        return;
      }

      const { data: logs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('target_type', 'ESS_PROFILE_UPDATE_PENDING')
        .in('target_id', staffIdsInCompany)
        .order('created_at', { ascending: false })
        .limit(200);

      if (!logs) {
        setEssRequests([]);
        return;
      }

      const filtered = logs;

      setEssRequests(filtered);
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
        after: typeof changes[key] === 'object' ? JSON.stringify(changes[key]) : String(changes[key] ?? '(빈 값)'),
      }));
  };

  const handleApproveEssSafe = async (request: Record<string, unknown>) => {
    try {
      const updates =
        ((request.details as Record<string, unknown> | undefined)?.requested_changes as Record<string, unknown> | undefined) || {};
      const { data: staffRow, error: staffLoadError } = await supabase
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

      const updatePayload: Record<string, unknown> = {
        email: (updates.email as string | null | undefined) ?? null,
        phone: (updates.phone as string | null | undefined) ?? null,
        address: (updates.address as string | null | undefined) ?? null,
        bank_account: (updates.bank_account as string | null | undefined) ?? null,
        permissions: {
          ...currentPermissions,
          ...requestedPermissions,
        },
        bank_name:
          (updates.bank_name as string | null | undefined) ??
          (requestedPermissions.bank_name as string | null | undefined) ??
          null,
      };

      const primaryUpdate = await supabase
        .from('staff_members')
        .update(updatePayload)
        .eq('id', request.target_id);

      if (primaryUpdate.error) {
        if (!isMissingColumnError(primaryUpdate.error, 'bank_name')) throw primaryUpdate.error;

        const fallbackPayload = { ...updatePayload };
        delete fallbackPayload.bank_name;
        const fallbackUpdate = await supabase
          .from('staff_members')
          .update(fallbackPayload)
          .eq('id', request.target_id);

        if (fallbackUpdate.error) throw fallbackUpdate.error;
      }

      await supabase
        .from('audit_logs')
        .update({
          target_type: 'ESS_PROFILE_UPDATE_APPROVED',
          details: {
            ...((request.details as Record<string, unknown>) || {}),
            approved_at: new Date().toISOString(),
          },
        })
        .eq('id', request.id);

      toast('승인했습니다.');
      setEssRequests(prev => prev.filter(r => r.id !== request.id));
      새로고침?.();
    } catch (error) {
      console.error('ESS profile approve failed:', error);
      toast('승인 처리 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleApproveEss = async (request: Record<string, unknown>) => {
    try {
      const updates = (request.details as Record<string, unknown>)?.requested_changes as Record<string, unknown>;
      // 1. 실제 직원 정보 업데이트
      await supabase.from('staff_members').update(updates).eq('id', request.target_id);
      // 2. 요청 상태 변경
      await supabase.from('audit_logs').update({ target_type: 'ESS_PROFILE_UPDATE_APPROVED' }).eq('id', request.id);

      toast('승인되었습니다.');
      setEssRequests(prev => prev.filter(r => r.id !== request.id));
      새로고침?.();
    } catch (error) {
      toast('승인 처리 중 오류 발생', 'error');
    }
  };

  const handleRejectEss = async (request: Record<string, unknown>) => {
    try {
      await supabase.from('audit_logs').update({ target_type: 'ESS_PROFILE_UPDATE_REJECTED' }).eq('id', request.id);
      toast('반려되었습니다.');
      setEssRequests(prev => prev.filter(r => r.id !== request.id));
    } catch (error) {
      toast('반려 처리 중 오류 발생', 'error');
    }
  };

  useEffect(() => {
    const fetchShifts = async () => {
      const { data } = await supabase.from('work_shifts').select('*');
      if (data) {
        근무형태목록설정(
          [...data].sort((a: StaffMember, b: StaffMember) => 한글정렬(a?.name || '', b?.name || ''))
        );
      }
    };
    fetchShifts();
  }, []);

  useEffect(() => {
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
        근무형태IDs: filteredIds,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [신규직원.사업체, 선택근무형태IDs.join('|'), 근무형태목록]);

  useEffect(() => {
    const fetchTeams = async () => {
      const { data } = await supabase.from('org_teams').select('company_name, team_name, division').order('division').order('sort_order');
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
      body: formData,
    });
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
      profile_photo_url: photoUrl,
    };

    const avatarUpdate = await supabase
      .from('staff_members')
      .update({ avatar_url: photoUrl, permissions: nextPermissions })
      .eq('id', String(staffId));

    if (avatarUpdate.error) {
      if (!isMissingColumnError(avatarUpdate.error, 'avatar_url')) {
        throw avatarUpdate.error;
      }

      const photoUpdate = await supabase
        .from('staff_members')
        .update({ photo_url: photoUrl, permissions: nextPermissions })
        .eq('id', String(staffId));

      if (photoUpdate.error) {
        if (!isMissingColumnError(photoUpdate.error, 'photo_url')) {
          throw photoUpdate.error;
        }

        const permissionsUpdate = await supabase
          .from('staff_members')
          .update({ permissions: nextPermissions })
          .eq('id', String(staffId));

        if (permissionsUpdate.error) {
          throw permissionsUpdate.error;
        }
      }
    }

    프로필사진파일설정(null);
    프로필사진미리보기설정(photoUrl);
    return { photoUrl, filePath, uploadedAt };
  };

  const 직원고용형태 = (직원: StaffMember): string => getStaffEmploymentType(직원);
  // staff_licenses 기준 면허 요약 (0건 '-', 1건 이름, N건 'X 외 N-1건')
  const 직원면허요약 = (직원: StaffMember) =>
    summarizeLicenses(licensesByStaff[String(직원.id)]);
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
      팀: defaultTeam,
    });
    setTargetSalaryInput('');
    setTargetNightHoursInput('');
  }, [창상태, 편집모드, 선택사업체, 팀목록캐시]);

  const findDuplicateStaffMember = async (staffName: string, residentNo: string, excludeId?: string | number | null) => {
    const normalizedName = normalizeStaffName(staffName);
    const normalizedResident = normalizeResidentNo(residentNo);

    if (!normalizedName || !normalizedResident) return null;

    const { data, error } = await supabase
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
    memo: 신규직원.면허기타내용?.trim() || null,
  });
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
      if (편집중면허ID) {
        // 입력값을 전부 비웠으면 기존 row를 건드리지 않는다(삭제·공란화 방지 — 자격안전센터에서 관리).
        if (!hasLicenseInput()) return null;
        const { error } = await supabase
          .from('staff_licenses')
          .update(payload)
          .eq('id', 편집중면허ID);
        if (error) throw error;
        return null;
      }
      // 신규 row: 면허 입력값이 하나라도 있을 때만 insert
      if (!hasLicenseInput()) return null;
      const { error } = await supabase.from('staff_licenses').insert([
        {
          staff_id: String(staffId),
          ...payload,
          license_name: payload.license_name || '(이름 없음)',
        },
      ]);
      if (error) throw error;
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
        shift_group_ids: selectedShiftIds,
        weekly_rotation_shift_ids: selectedShiftIds.slice(1),
        secondary_shift_id: selectedShiftIds[1] || null,
      };

      // ── 주민번호 기반 생일 자동 추출 ──────────────────────────────
      let birthDateStr: string | null = null;
      if (신규직원.주민번호) {
        const digits = String(신규직원.주민번호).replace(/[^0-9]/g, '');
        if (digits.length >= 7) {
          const yearPrefix = Number(digits.slice(0, 2));
          const month = Number(digits.slice(2, 4));
          const day = Number(digits.slice(4, 6));
          const genderDigit = digits.slice(6, 7);
          const century =
            genderDigit === '1' || genderDigit === '2' || genderDigit === '5' || genderDigit === '6'
              ? 1900
              : genderDigit === '3' || genderDigit === '4' || genderDigit === '7' || genderDigit === '8'
              ? 2000
              : genderDigit === '9' || genderDigit === '0'
              ? 1800
              : null;
          if (century !== null) {
            const year = century + yearPrefix;
            const date = new Date(year, month - 1, day);
            if (
              date.getFullYear() === year &&
              date.getMonth() === month - 1 &&
              date.getDate() === day
            ) {
              birthDateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            }
          }
        }
      }

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
          extension: 신규직원.내선번호 || null,
          employment_type: 신규직원.고용형태 || '정규직',
          contract_end_date: 신규직원.고용형태 === '계약직' ? dateOrNull(신규직원.계약종료일) : null,
          insurance: {
            national: 신규직원.ins_national,
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
          // ── 다중 근무형태 메타 (신버전과 동일 형식 유지) ─────────────
          work_conditions: nextWorkConditions,
          shift_group_ids: selectedShiftIds,
          weekly_rotation_shift_ids: selectedShiftIds.slice(1),
          secondary_shift_id: selectedShiftIds[1] || null,
        },
        annual_leave_total: 0,
        annual_leave_used: 0,
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
        annual_leave_pay: 신규직원.annual_leave_pay ?? 0
      };

      if (편집모드 && 선택된직원ID) {
        const beforeStaff = 직원목록.find((staff: StaffMember) => String(staff.id) === String(선택된직원ID)) || null;
        const afterStaff = {
          ...beforeStaff,
          ...commonData,
          annual_leave_total: 신규직원.연차총개수,
          annual_leave_used: 신규직원.연차사용개수,
        };

        const updatePayload: Record<string, unknown> = {
          ...commonData,
          annual_leave_total: afterStaff.annual_leave_total,
          annual_leave_used: afterStaff.annual_leave_used,
        };
        // ── 주민번호 안전 가드(JM5) ───────────────────────────────────
        // 폼의 주민번호가 비어 있으면 DB 기존 값을 덮어쓰지 않음.
        const residentDigits = String(신규직원.주민번호 ?? '').replace(/[^0-9]/g, '');
        if (residentDigits.length === 0) {
          delete updatePayload.resident_no;
        }
        const forcedOmittedWorkConditionColumns = hasFractionalValue(updatePayload.working_hours_per_week)
          ? ['working_hours_per_week']
          : [];
        const { error: updateErr } = await withMissingColumnsFallback(
          (omittedColumns) => {
            const allOmittedColumns = new Set<string>([
              ...omittedColumns,
              ...forcedOmittedWorkConditionColumns,
            ]);
            return supabase
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

        await logAudit(
          '직원정보수정',
          'staff_member',
          String(선택된직원ID),
          {
            staff_name: 신규직원.성명,
            employee_no: beforeStaff?.employee_no || null,
            ...buildAuditDiff(beforeStaff, afterStaff, Object.keys(afterStaff)),
          },
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
        // 사번 부여 로직: 박철홍이면 1, 아니면 기존 숫자 사번의 최대값 다음 번호 사용
        let newEmployeeNo = '';
        if (신규직원.성명 === '박철홍') {
          newEmployeeNo = '1';
        } else {
          const { data: employeeNos, error: employeeNoError } = await supabase
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

          const lastNo = (employeeNos || []).reduce((maxNo: number, row: { employee_no?: unknown }) => {
            const parsed = Number.parseInt(String(row?.employee_no || ''), 10);
            if (!Number.isFinite(parsed) || parsed < 2) {
              return maxNo;
            }
            return Math.max(maxNo, parsed);
          }, 1);

          let nextNo = Math.max(2, lastNo + 1);
          while (existingEmployeeNos.has(String(nextNo))) {
            nextNo += 1;
          }
          newEmployeeNo = String(nextNo);
        }

        const insertPayload = {
          ...commonData,
          employee_no: newEmployeeNo,
          role: 'staff',
          password: '',
          join_date: dateOrNull(신규직원.입사일),
        };
        const insertOmittedColumns = new Set<string>(
          hasFractionalValue(insertPayload.working_hours_per_week) ? ['working_hours_per_week'] : [],
        );
        let { error: insertErr, data: insertedStaff } = await supabase
          .from('staff_members')
          .insert([buildStaffMutationPayload(insertPayload, insertOmittedColumns)])
          .select()
          .single();

        if (
          insertErr &&
          hasFractionalValue(insertPayload.working_hours_per_week) &&
          isInvalidIntegerInputError(insertErr, insertPayload.working_hours_per_week)
        ) {
          ({ error: insertErr, data: insertedStaff } = await supabase
            .from('staff_members')
            .insert([buildStaffMutationPayload(insertPayload, new Set(['working_hours_per_week']))])
            .select()
            .single());
        }

        if (insertErr) {
          return toast('직원 등록 실패: ' + (insertErr.message || 'DB 오류'), 'error');
        }

        let onboardingChecklistInitFailed = false;
        if (insertedStaff?.id) {
          const { error: onboardingInitError } = await supabase
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
                completed_at: null,
              },
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
            created_fields: buildAuditDiff({}, insertedStaff || commonData, Object.keys(commonData)).after,
          },
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
    프로필사진미리보기설정(getProfilePhotoUrl(직원));
    const extensionValue = getStaffExtension(직원);
    // staff_licenses 첫 번째 row를 폼에 로드 (없으면 빈 값 + null)
    const 직원면허목록 = licensesByStaff[String(직원.id)] || [];
    const 첫면허 = 직원면허목록[0] ?? null;
    편집중면허ID설정(첫면허?.id ?? null);
    const ins = (직원.permissions?.insurance as Record<string, unknown>) || { national: true, health: true, employment: true, injury: true };
    // 다중 근무형태 IDs 추출 (신버전 동일 방식): permissions.shift_group_ids / weekly_rotation_shift_ids / secondary_shift_id
    const 직원근무형태IDs = getWeeklyRotationShiftIds(직원 as unknown as Record<string, unknown>, 직원.shift_id);
    신규직원설정({
      성명: 직원.name || '', 전화번호: 직원.phone || '', 내선번호: extensionValue as string, 사업체: 직원.company || '박철홍정형외과',
      팀: 직원.department ?? '', 직함: 직원.position || '', 입사일: (직원.joined_at as string) || (직원.join_date as string) || '',
      퇴사일: (직원.resigned_at as string) || '', 주민번호: (직원.resident_no as string) || '', 이메일: 직원.email || '',
      주소: 직원.address || '',
      면허사항: 첫면허?.license_name || '',
      면허번호: 첫면허?.license_number || '',
      취득일자: 첫면허?.issued_date || '',
      면허기타내용: 첫면허?.memo || '',
      계좌정보: 직원.bank_account || '',
      임금정보: (직원.salary_info as string) || (직원.permissions?.payroll_allowances as any)?.salary_info || '', 상태: 직원.status || '재직',
      연차총개수: typeof 직원.annual_leave_total === 'number' ? 직원.annual_leave_total : 0,
      연차사용개수: (직원.annual_leave_used as number) || 0,
      근무형태ID: 직원근무형태IDs[0] || (직원.shift_id as string) || '',
      근무형태IDs: 직원근무형태IDs,
      base_salary: (직원.base_salary as number) || 0,
      meal_allowance: (직원.meal_allowance as number) ?? 0, night_duty_allowance: (직원.night_duty_allowance as number) ?? 0,
      vehicle_allowance: (직원.vehicle_allowance as number) ?? 0, childcare_allowance: (직원.childcare_allowance as number) ?? 0, research_allowance: (직원.research_allowance as number) ?? 0,
      other_taxfree: (직원.other_taxfree as number) ?? 0, position_allowance: (직원.position_allowance as number) ?? 0,
      overtime_allowance: (직원.overtime_allowance as number) ?? 0, night_work_allowance: (직원.night_work_allowance as number) ?? 0,
      holiday_work_allowance: (직원.holiday_work_allowance as number) ?? 0, annual_leave_pay: (직원.annual_leave_pay as number) ?? 0,
      agreed_overtime_allowance: Number(직원.agreed_overtime_allowance || (직원.permissions?.payroll_allowances as any)?.agreed_overtime_allowance || 0),
      agreed_night_allowance: Number(직원.agreed_night_allowance || (직원.permissions?.payroll_allowances as any)?.agreed_night_allowance || 0),
      고용형태: getStaffEmploymentType(직원),
      계약종료일: getStaffContractEndDate(직원),
      probation_months: getStaffProbationMonths(직원, 0),
      probation_percent: getStaffProbationPercent(직원, 90),
      ins_national: ins.national !== false,
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
      working_days_per_week: resolveWorkingDaysPerWeek(직원, 5)
    });
    편집모드설정(true);

    // ── 주민번호 보정 fetch (JM5) ────────────────────────────────────
    // 직원 부트스트랩 select(STAFF_BOOTSTRAP_COLUMNS)에 resident_no가 빠져 있어
    // 편집 진입 시 빈 값으로 시작 → 그대로 저장하면 빈 문자열로 덮어쓰는 버그가 있었음.
    // 주민번호는 전역 메모리에 띄우지 않고 편집 시점에만 별도 select.
    const staffId = String(직원.id);
    supabase
      .from('staff_members')
      .select('resident_no')
      .eq('id', staffId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        const fetched = String((data as { resident_no?: string | null }).resident_no ?? '');
        if (!fetched) return;
        신규직원설정((prev) => {
          const current = String(prev.주민번호 ?? '');
          if (current.replace(/[^0-9]/g, '').length > 0) return prev;
          const raw = fetched.replace(/[^0-9]/g, '').slice(0, 13);
          const formatted = raw.length > 6 ? `${raw.slice(0, 6)}-${raw.slice(6)}` : raw;
          return { ...prev, 주민번호: formatted };
        });
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
      팀: 팀목록가져오기(defaultCompany)[0] ?? '원무팀',
    });
    창닫기?.();
  };

  const 직원삭제 = async (직원: StaffMember) => {
    try {
      const actor = readClientAuditActor();
      const today = new Date().toISOString().slice(0, 10);
      const afterStaff = {
        ...직원,
        status: '퇴사',
        resigned_at: 직원.resigned_at || today,
      };
      await supabase
        .from('staff_members')
        .update({
          status: '퇴사',
          resigned_at: 직원.resigned_at || today,
        })
        .eq('id', 직원.id);

      await logAudit(
        '직원퇴사처리',
        'staff_member',
        String(직원.id),
        {
          staff_name: 직원.name,
          employee_no: 직원.employee_no || null,
          ...buildAuditDiff(직원, afterStaff, ['status', 'resigned_at']),
        },
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
          sensitivity: 'base',
        });

        if (employeeNoCompare !== 0) {
          return employeeNoCompare;
        }

        return String(a.name || '').localeCompare(String(b.name || ''), 'ko', {
          sensitivity: 'base',
        });
      });
  }, [appliedStaffNameSearch, 보기상태, 선택사업체, 직원목록]);
  const 면허등록인원수 = 필터목록.filter(
    (직원: StaffMember) => (licensesByStaff[String(직원.id)]?.length ?? 0) > 0,
  ).length;
  const 계약직인원수 = 필터목록.filter((직원: StaffMember) => 직원고용형태(직원) === '계약직').length;
  const 부서수 = new Set(필터목록.map((직원: StaffMember) => 직원.department).filter(Boolean)).size;

  const staffTableColumns = useMemo((): Column<StaffMember>[] => [
    {
      key: 'employee_no',
      label: '사번',
      render: (직원) => (
        <span className="font-semibold text-[var(--accent)] text-xs">{직원.employee_no ?? '-'}</span>
      ),
    },
    {
      key: 'name',
      label: '성명/직함',
      primary: true,
      render: (직원) => (
        <div>
          <p className="text-sm font-semibold text-[var(--foreground)]">{직원.name}</p>
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">{직원.position || '-'}</p>
          <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
            {직원.resident_no ? '주민번호 등록' : '주민번호 미등록'}
          </p>
        </div>
      ),
    },
    {
      key: 'company',
      label: '소속',
      render: (직원) => (
        <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">{직원.company}</span>
      ),
    },
    {
      key: 'department',
      label: '부서/팀',
      render: (직원) => (
        <span className="text-xs font-bold text-[var(--toss-gray-4)]">{직원.department}</span>
      ),
    },
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
      ),
    },
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
      ),
    },
    {
      key: 'license',
      label: '면허/자격',
      render: (직원) => (
        <div>
          <p className="text-xs font-bold text-[var(--foreground)]">{직원면허요약(직원)}</p>
          <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
            취득일 {licensesByStaff[String(직원.id)]?.[0]?.issued_date || '-'}
          </p>
        </div>
      ),
    },
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
      ),
    },
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
            className="px-3 py-2 bg-red-500/10 text-red-600 text-[11px] font-semibold rounded-[var(--radius-md)] hover:bg-red-500/20 transition-all"
          >
            삭제
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
      ),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          {essRequests.length > 0 && (
            <button
              onClick={() => setShowEssModal(true)}
              className="relative bg-amber-100 text-amber-800 px-4 py-2 text-[11px] font-bold rounded-[var(--radius-md)] hover:bg-amber-200 transition-all shadow-sm ring-1 ring-amber-300"
            >
              내정보 변경 요청
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500/100 text-white flex items-center justify-center rounded-full text-[10px] shadow-sm animate-bounce">
                {essRequests.length}
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
          />
        </div>
      </div>

      {/* 등록/수정 모달 - 모바일 최적화 */}
      {(창상태 || 편집모드) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-4 min-h-screen" onClick={닫기함수}>
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
                                const yearPrefix = parseInt(raw.slice(0, 2), 10);
                                const genderDigit = parseInt(raw.slice(6, 7), 10);
                                const birthYear = (genderDigit === 1 || genderDigit === 2) ? 1900 + yearPrefix : 2000 + yearPrefix;
                                const age = new Date().getFullYear() - birthYear;
                                if (age >= 60 && 신규직원.ins_national) toast(`만 ${age}세는 국민연금 의무 가입 대상이 아닙니다.\n국민연금 체크를 해제해 주세요.`);
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
                        {편집모드 && (licensesByStaff[String(선택된직원ID)]?.length ?? 0) >= 2 && (
                          <p className="text-[10px] font-bold text-amber-800 bg-amber-100 rounded-[var(--radius-md)] px-2 py-1">
                            이 직원은 면허 {licensesByStaff[String(선택된직원ID)]?.length}건 — 여기서는 첫 번째 면허만 수정됩니다
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
                        <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                          <span className="w-1.5 h-4 bg-[var(--accent)] rounded-full" />
                          월 급여 및 고정 수당 (과세)
                        </h4>
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
                          return (
                            <div key={key} className="space-y-1">
                              <label className="text-[10px] font-bold text-[var(--toss-gray-4)] ml-1">{label}</label>
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
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-[var(--muted)] p-3 rounded-[var(--radius-xl)]">
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
                        <div className="grid grid-cols-2 gap-2 bg-[var(--muted)] p-4 rounded-[var(--radius-xl)]">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[120] flex items-center justify-center p-4 min-h-screen" onClick={() => setShowEssModal(false)}>
          <div className="bg-[var(--page-bg)] w-full max-w-3xl rounded-[var(--radius-xl)] overflow-hidden shadow-sm flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--card)]">
              <div>
                <h3 className="text-lg font-bold text-[var(--foreground)]">내정보 변경 요청 (ESS)</h3>
                <p className="text-xs text-[var(--toss-gray-3)] mt-1">직원들이 요청한 프로필 변경 사항을 검토하고 승인하세요.</p>
              </div>
              <button onClick={() => setShowEssModal(false)} className="text-[var(--toss-gray-3)] hover:text-red-500 text-xl font-bold">✕</button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 bg-[var(--muted)]">
              {essRequests.length === 0 ? (
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
                              <p className="text-[10px] text-[var(--toss-gray-3)]">{new Date(req.created_at).toLocaleString()}</p>
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
          { label: '요청 일시', value: pendingEssAction?.request.created_at ? new Date(String(pendingEssAction.request.created_at)).toLocaleString() : '-' },
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
          { label: '퇴사일', value: String(pendingRetirementStaff?.resigned_at || new Date().toISOString().slice(0, 10)) },
          { label: '사번', value: String(pendingRetirementStaff?.employee_no || '-') },
          { label: '직함', value: String(pendingRetirementStaff?.position || '-') },
        ]}
        changes={[
          { label: '상태', before: String(pendingRetirementStaff?.status || '재직'), after: '퇴사' },
          { label: '퇴사일', before: String(pendingRetirementStaff?.resigned_at || '(빈 값)'), after: String(pendingRetirementStaff?.resigned_at || new Date().toISOString().slice(0, 10)) },
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
    </div>
  );
}
