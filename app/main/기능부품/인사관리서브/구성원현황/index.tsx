'use client';
import ProfilePhotoThumbnail from '@/app/components/ProfilePhotoThumbnail';
import { useActionDialog } from '@/app/components/useActionDialog';
import { isActiveStaff } from '@/lib/active-staff';
import { buildAuditDiff,logAudit,readClientAuditActor } from '@/lib/audit';
import { getWeeklyRotationShiftIds } from '@/lib/contract-shift-rotation';
import { formatWon as libFormatWon } from '@/lib/date-formatter';
import { getChecklistTargetDate,getDefaultChecklist } from '@/lib/hr-checklists';
import { logger } from '@/lib/logger';
import {
calculateHourlyRateFromMonthlySalary,
getMonthlyWorkingHours,
resolveWeeklyWorkingHours,
resolveWorkingDaysPerWeek,
} from '@/lib/payroll-working-hours';
import { getPayrollStaffAge,isNationalPensionAgeEligible } from '@/lib/payroll-insurance-settings';
import { buildProfilePhotoUrlFromPath,getProfilePhotoUrl } from '@/lib/profile-photo';
import {
cleanOptionalText,
getStaffContractEndDate,
getStaffEmploymentType,
getStaffExtension,
getStaffLicenseDate,
getStaffLicenseNo,
getStaffLicenseNote,
getStaffProbationMonths,
toIntegerOrFallback,
} from '@/lib/staff-meta';
import { supabase } from '@/lib/supabase';
import { isMissingColumnError,withMissingColumnsFallback } from '@/lib/supabase-compat';
import { getMinimumWageByYear,MONTHLY_STANDARD_HOURS } from '@/lib/tax-free-limits';
import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';
import { useEffect,useMemo,useRef,useState,type ChangeEvent } from 'react';
import SmartDatePicker from '../../공통/SmartDatePicker';
import { LucideIcon } from '../../조직도서브/조직도측면창';
import CertTransferPanel from '../교육자격인사이동패널';
import OnboardingChecklist from '../급여명세/입퇴사온보딩';
import StaffHistoryTimeline from '../인사이력타임라인';
import {
buildStaffMutationPayload,
createEmptyStaffForm,
hasFractionalValue,
isDuplicateStaffIdentityError,
isInvalidIntegerInputError,
normalizeResidentNo,
normalizeStaffName,
STAFF_MUTATION_ALLOWANCE_COLUMNS,
STAFF_MUTATION_WORK_CONDITION_COLUMNS,
TAXABLE_SALARY_FIELDS,
TAXFREE_SALARY_FIELDS,
} from './staff-form-utils';
import LicenseSection from './LicenseSection';
import JobCategorySection from './JobCategorySection';
import ShiftAssignmentSection from './ShiftAssignmentSection';
import {
  validateStaffRegistration,
  isEmptyLicenseRow,
  createEmptyLicenseRow,
  type LicenseRow,
  type SelectedJobCategory,
  type SelectedShiftAssignment,
} from './staff-registration-types';
import { calculateAnnualLeaveExpiryDate } from '@/lib/annual-leave-promotion';

const formatWon = (amount: number) => libFormatWon(Math.round(amount || 0));

const SALARY_CHANGE_TYPE_BY_FIELD: Record<string, string> = {
  base_salary: 'base_salary',
  meal_allowance: 'meal',
  night_duty_allowance: 'night_duty_allowance',
  vehicle_allowance: 'vehicle',
  childcare_allowance: 'childcare',
  research_allowance: 'research',
  other_taxfree: 'other',
  position_allowance: 'position_allowance',
  overtime_allowance: 'overtime_allowance',
  night_work_allowance: 'night_work_allowance',
  holiday_work_allowance: 'holiday_work_allowance',
  annual_leave_pay: 'annual_leave_pay',
};

const SALARY_CHANGE_TRACKED_FIELDS = [
  ...TAXABLE_SALARY_FIELDS.map(({ key }) => key),
  ...TAXFREE_SALARY_FIELDS.map(({ key }) => key),
] as const;

const ESS_PROFILE_FIELD_KEYS = ['email', 'phone', 'extension', 'address', 'bank_name', 'bank_account'] as const;

type EssProfileFieldKey = (typeof ESS_PROFILE_FIELD_KEYS)[number];
type EssProfileDisplayChange = {
  key: EssProfileFieldKey;
  label: string;
  before: string;
  after: string;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getRecord(value: unknown): Record<string, unknown> {
  return isPlainRecord(value) ? value : {};
}

function hasOwnRecordKey(record: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function getNationalPensionAgeFromResidentNo(residentNo: string) {
  return getPayrollStaffAge({ resident_no: residentNo }, new Date());
}

function isResidentNoNationalPensionEligible(residentNo: string) {
  return isNationalPensionAgeEligible({ resident_no: residentNo }, new Date());
}

function normalizeSalaryAmount(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(Math.max(0, amount)) : 0;
}

function normalizeUuid(value: unknown) {
  const text = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)
    ? text
    : null;
}

function buildSalaryChangeRows({
  beforeStaff,
  afterStaff,
  effectiveDate,
  reason,
  createdBy,
}: {
  beforeStaff: StaffMember | null;
  afterStaff: Record<string, unknown>;
  effectiveDate: string;
  reason: string;
  createdBy?: string;
}) {
  if (!beforeStaff) return [];

  return SALARY_CHANGE_TRACKED_FIELDS
    .map((field) => {
      const beforeValue = normalizeSalaryAmount((beforeStaff as Record<string, unknown>)[field]);
      const afterValue = normalizeSalaryAmount(afterStaff[field]);
      if (beforeValue === afterValue) return null;
      return {
        staff_id: beforeStaff.id,
        change_type: SALARY_CHANGE_TYPE_BY_FIELD[field],
        before_value: beforeValue,
        after_value: afterValue,
        effective_date: effectiveDate,
        reason,
        created_by: normalizeUuid(createdBy),
      };
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
}

function normalizeEssProfileFieldValue(value: unknown, key: EssProfileFieldKey) {
  if (isPlainRecord(value)) {
    return hasOwnRecordKey(value, key) ? value[key] : null;
  }
  return value ?? null;
}

function getEssProfileFieldValue(record: Record<string, unknown>, key: EssProfileFieldKey) {
  const permissions = getRecord(record.permissions);
  const rawValue =
    key === 'extension' || key === 'bank_name' || key === 'bank_account'
      ? record[key] ?? permissions[key] ?? null
      : record[key] ?? null;
  return normalizeEssProfileFieldValue(rawValue, key);
}

function hasEssProfileField(record: Record<string, unknown>, key: EssProfileFieldKey) {
  const permissions = getRecord(record.permissions);
  return hasOwnRecordKey(record, key) || hasOwnRecordKey(permissions, key);
}

function normalizeEssProfileComparableValue(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}

function formatEssProfileDisplayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '(빈 값)';
  if (typeof value === 'boolean') return value ? '예' : '아니오';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  try {
    const serialized = JSON.stringify(value);
    return serialized || '(빈 값)';
  } catch {
    return String(value);
  }
}

function getEssProfileUpdateText(record: Record<string, unknown>, key: EssProfileFieldKey) {
  const value = getEssProfileFieldValue(record, key);
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return null;
}

function buildEssProfileDisplayChanges(
  details: unknown,
  fieldLabels: Record<EssProfileFieldKey, string>,
): EssProfileDisplayChange[] {
  const detailRecord = getRecord(details);
  const requestedChanges = getRecord(detailRecord.requested_changes);
  const originalData = getRecord(detailRecord.original_data);

  return ESS_PROFILE_FIELD_KEYS.flatMap((key) => {
    const beforeValue = getEssProfileFieldValue(originalData, key);
    const afterValue = getEssProfileFieldValue(requestedChanges, key);

    if (normalizeEssProfileComparableValue(beforeValue) === normalizeEssProfileComparableValue(afterValue)) {
      return [];
    }

    return [
      {
        key,
        label: fieldLabels[key],
        before: formatEssProfileDisplayValue(beforeValue),
        after: formatEssProfileDisplayValue(afterValue),
      },
    ];
  });
}

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
}

export default function StaffListManager({ 직원목록 = [], 선택사업체, 보기상태 = '재직', 새로고침, 창상태, 창닫기, onOpenDocumentRepoForStaff, canRegisterNewStaff = false, onOpenNewStaff }: StaffListManagerProps) {
  const { dialog, openConfirm } = useActionDialog();
  const [편집모드, 편집모드설정] = useState(false);
  const [선택된직원ID, 선택된직원ID설정] = useState<string | number | null>(null);
  const [근무형태목록, 근무형태목록설정] = useState<any[]>([]);
  const [팀목록캐시, 팀목록캐시설정] = useState<Record<string, string[]>>({});
  const [새근무형태표시, 새근무형태표시설정] = useState(false);
  const [추가근무형태ID, 추가근무형태ID설정] = useState('');
  const [activeTab, setActiveTab] = useState('기본');
  const [신규직원, 신규직원설정] = useState(() => createEmptyStaffForm(선택사업체 ?? undefined));
  const [프로필사진파일, 프로필사진파일설정] = useState<File | null>(null);
  const [프로필사진미리보기, 프로필사진미리보기설정] = useState<string | null>(null);
  const previousModalOpenRef = useRef(false);
  const [companySelectOptions, setCompanySelectOptions] = useState<string[]>([]);

  const 회사목록 = useMemo(
    () => Array.from(new Set(직원목록.map((s) => s.company).filter(Boolean))).sort() as string[],
    [직원목록],
  );

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
  const monthlyWorkingHours = useMemo(
    () => getMonthlyWorkingHours(신규직원.working_hours_per_week),
    [신규직원.working_hours_per_week],
  );
  const previewMinimumWageYear = Math.max(2025, new Date().getFullYear());
  const previewMinimumWage = getMinimumWageByYear(previewMinimumWageYear);
  const rawHourlySalaryAmount = useMemo(
    () => calculateHourlyRateFromMonthlySalary(totalSalaryAmount, 신규직원.working_hours_per_week, 'ceil'),
    [신규직원.working_hours_per_week, totalSalaryAmount],
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

  const [essRequests, setEssRequests] = useState<any[]>([]);
  const [showEssModal, setShowEssModal] = useState(false);
  const 한글정렬 = (a: string, b: string) => a.localeCompare(b, 'ko');

  const normalizeEmployeeNoForSort = (value: unknown) => {
    const raw = String(value ?? '').trim();
    const digitsOnly = raw.replace(/[^0-9]/g, '');
    if (digitsOnly && digitsOnly.length === raw.length) {
      return { isNumeric: true, numericValue: Number(digitsOnly), textValue: raw };
    }
    return { isNumeric: false, numericValue: Number.POSITIVE_INFINITY, textValue: raw };
  };

  const getShiftCompanyName = (shift: StaffMember) => String(shift?.company_name || shift?.company || '').trim();
  const sortShiftOptions = (list: StaffMember[]) =>
    [...list].sort((a: StaffMember, b: StaffMember) => 한글정렬(a?.name || '', b?.name || ''));
  const normalizeShiftIdList = (values: unknown[]) =>
    Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
  const getStaffFormShiftIds = (form: typeof 신규직원) =>
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
  const 선택근무형태IDs = getStaffFormShiftIds(신규직원);
  const 추가가능근무형태목록 = getVisibleShiftOptions(신규직원.사업체).filter(
    (shift: StaffMember) => !선택근무형태IDs.includes(String(shift.id))
  );

  const 대표근무형태설정 = (shiftId: string) => {
    const nextShiftId = String(shiftId || '').trim();
    신규직원설정((prev) => {
      if (!nextShiftId) {
        return { ...prev, 근무형태ID: '', 근무형태IDs: [] };
      }
      const previousPrimary = String(prev.근무형태ID || '').trim();
      const restShiftIds = getStaffFormShiftIds(prev).filter(
        (id) => id !== previousPrimary && id !== nextShiftId
      );
      return { ...prev, 근무형태ID: nextShiftId, 근무형태IDs: [nextShiftId, ...restShiftIds] };
    });
  };

  const 추가근무형태선택창열기 = () => {
    const nextDefault = 추가가능근무형태목록[0]?.id ? String(추가가능근무형태목록[0].id) : '';
    추가근무형태ID설정(nextDefault);
    새근무형태표시설정((value) => !value);
  };

  const 추가근무형태반영 = () => {
    const shiftId = String(추가근무형태ID || '').trim();
    if (!shiftId) {
      return toast('추가할 근무형태를 선택하세요.', 'warning');
    }
    신규직원설정((prev) => {
      const currentIds = getStaffFormShiftIds(prev);
      if (currentIds.includes(shiftId)) return prev;
      const nextIds = currentIds.length > 0 ? [...currentIds, shiftId] : [shiftId];
      return { ...prev, 근무형태ID: nextIds[0] || '', 근무형태IDs: nextIds };
    });
    추가근무형태ID설정('');
    새근무형태표시설정(false);
  };

  const 근무형태제거 = (shiftId: string) => {
    신규직원설정((prev) => {
      const nextIds = getStaffFormShiftIds(prev).filter((id) => id !== shiftId);
      return { ...prev, 근무형태ID: nextIds[0] || '', 근무형태IDs: nextIds };
    });
  };

  useEffect(() => {
    const loadCompanyOptions = async () => {
      const { data, error } = await supabase
        .from('companies')
        .select('name, is_active')
        .eq('is_active', true)
        .order('name');
      if (!error && data) {
        setCompanySelectOptions(data.map((row: any) => row.name).filter(Boolean) as string[]);
      }
    };
    loadCompanyOptions();
  }, []);

  useEffect(() => {
    const fetchEssRequests = async () => {
      const staffIdsInCompany = 직원목록
        .filter((s: StaffMember) => s.company === 선택사업체)
        .map((s: StaffMember) => s.id);
      if (staffIdsInCompany.length === 0) { setEssRequests([]); return; }
      const { data: logs } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('target_type', 'ESS_PROFILE_UPDATE_PENDING')
        .in('target_id', staffIdsInCompany)
        .order('created_at', { ascending: false })
        .limit(200);
      setEssRequests(logs ?? []);
    };
    fetchEssRequests();
  }, [새로고침, 선택사업체, 직원목록]);

  const handleApproveEssSafe = async (request: Record<string, unknown>) => {
    const userName = String(request.user_name || '선택 직원');
    const confirmed = await openConfirm({
      title: '정보 변경 요청 승인',
      description: `${userName}님의 정보 변경 요청을 승인합니다.`,
      confirmText: '승인',
      tone: 'accent',
    });
    if (!confirmed) return;
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
      const nextPermissions = { ...currentPermissions };
      (['extension', 'bank_name'] as const).forEach((key) => {
        if (hasEssProfileField(updates, key)) {
          nextPermissions[key] = getEssProfileUpdateText(updates, key);
        }
      });
      const updatePayload: Record<string, unknown> = { permissions: nextPermissions };
      (['email', 'phone', 'address', 'bank_account', 'bank_name'] as const).forEach((key) => {
        if (hasEssProfileField(updates, key)) {
          updatePayload[key] = getEssProfileUpdateText(updates, key);
        }
      });
      const primaryUpdate = await supabase.from('staff_members').update(updatePayload).eq('id', request.target_id);
      if (primaryUpdate.error) {
        if (!isMissingColumnError(primaryUpdate.error, 'bank_name')) throw primaryUpdate.error;
        const fallbackPayload = { ...updatePayload };
        delete fallbackPayload.bank_name;
        const fallbackUpdate = await supabase.from('staff_members').update(fallbackPayload).eq('id', request.target_id);
        if (fallbackUpdate.error) throw fallbackUpdate.error;
      }
      await supabase
        .from('audit_logs')
        .update({
          target_type: 'ESS_PROFILE_UPDATE_APPROVED',
          details: { ...((request.details as Record<string, unknown>) || {}), approved_at: new Date().toISOString() },
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

  const handleRejectEss = async (request: Record<string, unknown>) => {
    const userName = String(request.user_name || '선택 직원');
    const confirmed = await openConfirm({
      title: '정보 변경 요청 반려',
      description: `${userName}님의 정보 변경 요청을 반려합니다.`,
      confirmText: '반려',
      tone: 'danger',
    });
    if (!confirmed) return;
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
        근무형태목록설정([...data].sort((a: StaffMember, b: StaffMember) => 한글정렬(a?.name || '', b?.name || '')));
      }
    };
    fetchShifts();
  }, []);

  useEffect(() => {
    const visibleShiftIds = new Set(getVisibleShiftOptions(신규직원.사업체).map((shift: StaffMember) => String(shift.id)));
    const filteredIds = 선택근무형태IDs.filter((shiftId) => visibleShiftIds.has(shiftId));
    if (filteredIds.length !== 선택근무형태IDs.length || 신규직원.근무형태ID !== (filteredIds[0] || '')) {
      신규직원설정((prev) => ({
        ...prev,
        근무형태ID: filteredIds[0] || '',
        근무형태IDs: filteredIds,
      }));
    }
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

  useEffect(() => {
    const hours = 신규직원.working_hours_per_week || 0;
    if (hours > 0) {
      const calculatedLeave = (hours / 40);
      const roundedLeave = Math.round(calculatedLeave * 10) / 10;
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
    const filePath = `${staffId}/avatar`;
    const uploadedAt = new Date().toISOString();
    const { error: uploadError } = await supabase.storage
      .from('profiles')
      .upload(filePath, file, { upsert: true, contentType: file.type || undefined });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('profiles').getPublicUrl(filePath);
    const photoUrl =
      buildProfilePhotoUrlFromPath(filePath, uploadedAt) ||
      `${data.publicUrl}?v=${encodeURIComponent(uploadedAt)}`;
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
      if (!isMissingColumnError(avatarUpdate.error, 'avatar_url')) throw avatarUpdate.error;
      const photoUpdate = await supabase
        .from('staff_members')
        .update({ photo_url: photoUrl, permissions: nextPermissions })
        .eq('id', String(staffId));
      if (photoUpdate.error) {
        if (!isMissingColumnError(photoUpdate.error, 'photo_url')) throw photoUpdate.error;
        const permissionsUpdate = await supabase
          .from('staff_members')
          .update({ permissions: nextPermissions })
          .eq('id', String(staffId));
        if (permissionsUpdate.error) throw permissionsUpdate.error;
      }
    }
    프로필사진파일설정(null);
    프로필사진미리보기설정(photoUrl);
    return { photoUrl, filePath, uploadedAt };
  };

  const 직원고용형태 = (직원: StaffMember): string => getStaffEmploymentType(직원);
  const 직원면허요약 = (직원: StaffMember) => {
    const parts = [직원?.license, getStaffLicenseNo(직원), getStaffLicenseNote(직원)]
      .map((value) => cleanOptionalText(value))
      .filter(Boolean);
    return parts.length ? parts.join(' · ') : '-';
  };
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
    추가근무형태ID설정('');
    새근무형태표시설정(false);
    신규직원설정({
      ...createEmptyStaffForm(defaultCompany),
      팀: defaultTeam,
      licenses: [createEmptyLicenseRow(true)],
      jobCategories: [],
      shiftAssignments: [],
    });
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
    return (data || []).find((staff) => {
      if (excludeId != null && String(staff.id) === String(excludeId)) return false;
      return normalizeResidentNo(String(staff.resident_no || '')) === normalizedResident;
    }) || null;
  };

  const 정보저장 = async () => {
    if (!편집모드 && !canRegisterNewStaff) {
      return toast('신규 직원 등록 권한이 없습니다.', 'error');
    }
    if (!신규직원.성명 || !신규직원.입사일 || 신규직원.입사일 === '0000-00-00' || 신규직원.입사일 === '') return toast('성함과 실제 입사일은 필수 입력 사항입니다.', 'warning');

    // 폼 검증
    const validationResult = validateStaffRegistration({
      성명: 신규직원.성명,
      입사일: 신규직원.입사일,
      이메일: 신규직원.이메일,
      licenses: 신규직원.licenses,
      jobCategories: 신규직원.jobCategories,
      shiftAssignments: 신규직원.shiftAssignments,
    });
    if (!validationResult.ok) {
      return toast(validationResult.message, 'warning');
    }
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
      const selectedShiftIds = getStaffFormShiftIds(신규직원);
      const primaryShiftId = selectedShiftIds[0] || '';
      const beforeStaffForPermissions =
        편집모드 && 선택된직원ID
          ? 직원목록.find((s: StaffMember) => String(s.id) === String(선택된직원ID))
          : null;
      const existingPermissions =
        beforeStaffForPermissions?.permissions &&
        typeof beforeStaffForPermissions.permissions === 'object' &&
        !Array.isArray(beforeStaffForPermissions.permissions)
          ? beforeStaffForPermissions.permissions
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
      const commonData = {
        name: normalizeStaffName(신규직원.성명),
        phone: 신규직원.전화번호,
        company: 신규직원.사업체,
        department: 신규직원.팀 === '' ? null : 신규직원.팀,
        position: 신규직원.직함,
        resident_no: 신규직원.주민번호.trim(),
        email: 신규직원.이메일,
        address: 신규직원.주소,
        license: 신규직원.면허사항,
        bank_account: 신규직원.계좌정보,
        salary_info: 신규직원.임금정보,
        joined_at: dateOrNull(신규직원.입사일),
        join_date: dateOrNull(신규직원.입사일),
        resigned_at: dateOrNull(신규직원.퇴사일),
        status: 신규직원.상태,
        permissions: {
          ...existingPermissions,
          extension: 신규직원.내선번호 || null,
          license_no: 신규직원.면허번호 || null,
          license_date: dateOrNull(신규직원.취득일자),
          license_note: 신규직원.면허기타내용?.trim() || null,
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
          is_basic_living: 신규직원.is_basic_living,
          is_medical_benefit: 신규직원.is_medical_benefit,
          other_welfare: 신규직원.other_welfare,
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
        const updatePayload = {
          ...commonData,
          annual_leave_total: afterStaff.annual_leave_total,
          annual_leave_used: afterStaff.annual_leave_used,
        };
        const salaryChangeEffectiveDate = dateOrNull(신규직원.salary_change_effective_date);
        const salaryChangeReason = String(신규직원.salary_change_reason || '').trim();
        const salaryChangeRows = buildSalaryChangeRows({
          beforeStaff,
          afterStaff,
          effectiveDate: salaryChangeEffectiveDate || '',
          reason: salaryChangeReason,
          createdBy: actor.userId,
        });
        if (salaryChangeRows.length > 0 && !salaryChangeEffectiveDate) {
          toast('급여 변동 적용일을 입력해 주세요.', 'warning');
          return;
        }
        if (salaryChangeRows.length > 0 && !salaryChangeReason) {
          toast('급여 변동 사유를 입력해 주세요.', 'warning');
          return;
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
        if (updateErr) throw updateErr;

        // ── 수정 시 서브 테이블 diff 처리 ──────────────────────────────────────
        const editStaffId = String(afterStaff.id || '');
        if (editStaffId) {
          // 면허 — 기존 rows 전체 delete 후 re-insert (단순 전략)
          const filledLicensesEdit = (신규직원.licenses ?? []).filter(
            (l: LicenseRow) => !isEmptyLicenseRow(l),
          );
          // is_primary 면허 → staff_members 호환 컬럼 업데이트
          const primaryLicenseEdit = filledLicensesEdit.find((l: LicenseRow) => l.is_primary) ?? filledLicensesEdit[0];
          if (primaryLicenseEdit) {
            await supabase.from('staff_members').update({
              license: String(primaryLicenseEdit.license_name || primaryLicenseEdit.license_type || ''),
              permissions: {
                ...(typeof afterStaff.permissions === 'object' && afterStaff.permissions !== null ? afterStaff.permissions as Record<string, unknown> : {}),
                license_no: primaryLicenseEdit.license_number || null,
                license_date: primaryLicenseEdit.issued_date || null,
                license_note: primaryLicenseEdit.memo || null,
              },
            }).eq('id', editStaffId);
          }
          // DB id가 없는 row (_key=UUID 임시값) = 신규, id 있는 row = 업데이트
          const { error: licDelErr } = await supabase
            .from('staff_licenses')
            .delete()
            .eq('staff_id', editStaffId);
          if (licDelErr) {
            logger.warn('면허 기존 삭제 실패:', licDelErr);
            toast(`면허·자격증 기존 데이터 삭제 실패: ${licDelErr.message ?? '권한/정책 확인 필요'}`, 'error');
          }
          if (filledLicensesEdit.length > 0) {
            const { error: licInsErr } = await supabase.from('staff_licenses').insert(
              filledLicensesEdit.map((l: LicenseRow) => ({
                staff_id: editStaffId,
                license_type: l.license_type ?? null,
                license_name: l.license_name ?? null,
                license_number: l.license_number ?? null,
                issued_date: l.issued_date || null,
                expiry_date: l.expiry_date || null,
                issuing_body: l.issuing_body ?? null,
                memo: l.memo ?? null,
                is_primary: l.is_primary,
              })),
            );
            if (licInsErr) {
              logger.warn('면허 재삽입 실패:', licInsErr);
              toast(`면허·자격증 저장 실패: ${licInsErr.message ?? '권한/정책 확인 필요'}`, 'error');
            }
          }

          // 저장 직후 검증 — 화면 입력보다 잔재 row가 더 많으면 사용자에게 경고
          const { data: verifyRows, error: verifyErr } = await supabase
            .from('staff_licenses')
            .select('id, license_name, license_type')
            .eq('staff_id', editStaffId);
          if (verifyErr) {
            logger.warn('면허 저장 후 검증 실패:', verifyErr);
          } else if ((verifyRows?.length ?? 0) > filledLicensesEdit.length) {
            const leftover = (verifyRows ?? [])
              .map((r) => String(r.license_name || r.license_type || '미상'))
              .join(', ');
            toast(
              `면허·자격증 DB에 잔재가 남아 있습니다 (${verifyRows?.length}건: ${leftover}). 자격·안전센터 → 면허/자격증 메뉴에서 직접 확인해 주세요.`,
              'warning',
            );
          }

          // 직종 — upsert + 체크 해제된 것 delete
          const editJobCats = (신규직원.jobCategories ?? []) as SelectedJobCategory[];
          if (editJobCats.length > 0) {
            const { error: jobUpsErr } = await supabase.from('staff_job_categories').upsert(
              editJobCats.map((j) => ({
                staff_id: editStaffId,
                job_category_id: j.job_category_id,
                is_primary: j.is_primary,
              })),
              { onConflict: 'staff_id,job_category_id' },
            );
            if (jobUpsErr) logger.warn('직종 upsert 실패:', jobUpsErr);
          }

          // 근무유형 — upsert + is_primary 반영 + staff_members.shift_id 호환
          const editShiftAsgns = (신규직원.shiftAssignments ?? []) as SelectedShiftAssignment[];
          if (editShiftAsgns.length > 0) {
            const { error: shiftUpsErr } = await supabase.from('staff_shift_assignments').upsert(
              editShiftAsgns.map((s) => ({
                staff_id: editStaffId,
                shift_id: s.shift_id,
                is_primary: s.is_primary,
                priority: s.priority,
              })),
              { onConflict: 'staff_id,shift_id' },
            );
            if (shiftUpsErr) logger.warn('근무유형 배정 upsert 실패:', shiftUpsErr);
            const primaryShiftEdit = editShiftAsgns.find((s) => s.is_primary) ?? editShiftAsgns[0];
            if (primaryShiftEdit) {
              await supabase.from('staff_members')
                .update({ shift_id: primaryShiftEdit.shift_id })
                .eq('id', editStaffId);
            }
          }
        }

        await logAudit(
          '직원정보수정', 'staff_member', String(선택된직원ID),
          {
            staff_name: 신규직원.성명,
            employee_no: beforeStaff?.employee_no || null,
            ...buildAuditDiff(beforeStaff, afterStaff, Object.keys(afterStaff)),
          },
          actor.userId, actor.userName
        );
        if (salaryChangeRows.length > 0) {
          const { error: salaryHistoryError } = await supabase
            .from('salary_change_history')
            .insert(salaryChangeRows);
          if (salaryHistoryError) {
            logger.warn('급여 변경 이력 저장 실패:', salaryHistoryError);
            toast('직원 정보는 수정되었지만 급여 변경 이력 저장은 실패했습니다.', 'warning');
          }
        }
        if (프로필사진파일 && afterStaff.id) {
          try {
            await 프로필사진업로드(afterStaff.id, 프로필사진파일, afterStaff as Record<string, unknown>);
          } catch (photoError) {
            console.error('직원 프로필 사진 업로드 실패:', photoError);
            프로필사진업로드경고 = '직원 정보는 수정되었지만 프로필 사진 업로드는 실패했습니다.';
          }
        }
        toast(프로필사진업로드경고 || '직원 정보가 수정되었습니다.', 프로필사진업로드경고 ? 'warning' : 'success');
      } else {
        let newEmployeeNo = '';
        if (신규직원.성명 === '박철홍') {
          newEmployeeNo = '1';
        } else {
          const { data: employeeNos, error: employeeNoError } = await supabase
            .from('staff_members')
            .select('employee_no');
          if (employeeNoError) throw employeeNoError;
          const existingEmployeeNos = new Set(
            (employeeNos || [])
              .map((row: { employee_no?: unknown }) => String(row?.employee_no || '').trim())
              .filter(Boolean)
          );
          const lastNo = (employeeNos || []).reduce((maxNo: number, row: { employee_no?: unknown }) => {
            const parsed = Number.parseInt(String(row?.employee_no || ''), 10);
            if (!Number.isFinite(parsed) || parsed < 2) return maxNo;
            return Math.max(maxNo, parsed);
          }, 1);
          let nextNo = Math.max(2, lastNo + 1);
          while (existingEmployeeNos.has(String(nextNo))) { nextNo += 1; }
          newEmployeeNo = String(nextNo);
        }
        // ── 면허 호환 (is_primary row → staff_members.license* 컬럼에 병기) ──────
        const filledLicenses = (신규직원.licenses ?? []).filter(
          (l: LicenseRow) => !isEmptyLicenseRow(l),
        );
        const primaryLicense = filledLicenses.find((l: LicenseRow) => l.is_primary) ?? filledLicenses[0];

        // ── 근무형태 호환 (is_primary → staff_members.shift_id 병기) ─────────────
        const primaryShiftAssign = (신규직원.shiftAssignments ?? []).find(
          (s: SelectedShiftAssignment) => s.is_primary,
        ) ?? (신규직원.shiftAssignments ?? [])[0];

        const staffPayload: Record<string, unknown> = {
          ...commonData,
          employee_no: newEmployeeNo,
          role: 'staff',
          join_date: dateOrNull(신규직원.입사일),
          // 면허 호환: is_primary 면허 → 기존 컬럼 병기
          ...(primaryLicense ? {
            license: String(primaryLicense.license_name || primaryLicense.license_type || ''),
            permissions: {
              ...(typeof commonData.permissions === 'object' && commonData.permissions !== null
                ? commonData.permissions as Record<string, unknown>
                : {}),
              license_no: primaryLicense.license_number || null,
              license_date: primaryLicense.issued_date || null,
              license_note: primaryLicense.memo || null,
            },
          } : {}),
          // 근무유형 호환: is_primary → shift_id 컬럼 병기
          ...(primaryShiftAssign ? { shift_id: primaryShiftAssign.shift_id } : {}),
        };

        // ── leave_balances total_days 계산 ──────────────────────────────────────
        const hireDate = dateOrNull(신규직원.입사일);
        const leaveYear = new Date().getFullYear();
        const leaveExpiryDate = hireDate
          ? calculateAnnualLeaveExpiryDate(hireDate)
          : new Date(leaveYear, 11, 31);
        // 입사일~만료일 기간(일) 기반 비례 부여 (간단 계산, 정밀 계산은 별도 모듈)
        const msPerDay = 86_400_000;
        const hireMs = hireDate ? new Date(hireDate).getTime() : Date.now();
        const expiryMs = leaveExpiryDate.getTime();
        const daysUntilExpiry = Math.max(0, Math.ceil((expiryMs - hireMs) / msPerDay));
        const leaveTotalDays = Math.min(15, Math.round((daysUntilExpiry / 365) * 15 * 10) / 10);

        // ── RPC 호출 (트랜잭션 보장) ────────────────────────────────────────────
        const { data: rpcResult, error: rpcErr } = await supabase.rpc(
          'register_staff_full',
          {
            p_staff: staffPayload,
            p_licenses: filledLicenses.map((l: LicenseRow) => ({
              license_type: l.license_type ?? null,
              license_name: l.license_name ?? null,
              license_number: l.license_number ?? null,
              issued_date: l.issued_date ?? null,
              expiry_date: l.expiry_date ?? null,
              issuing_body: l.issuing_body ?? null,
              memo: l.memo ?? null,
              is_primary: l.is_primary,
            })),
            p_job_cats: (신규직원.jobCategories ?? []).map((j: SelectedJobCategory) => ({
              job_category_id: j.job_category_id,
              is_primary: j.is_primary,
            })),
            p_shift_asgns: (신규직원.shiftAssignments ?? []).map((s: SelectedShiftAssignment) => ({
              shift_id: s.shift_id,
              is_primary: s.is_primary,
              priority: s.priority,
            })),
            p_leave_year: leaveYear,
            p_leave_total: leaveTotalDays,
          },
        );

        // RPC 실패 → 폴백: 기존 방식으로 staff_members만 INSERT
        let insertedStaffId: string | null = null;
        if (rpcErr || !rpcResult?.staff_id) {
          logger.warn('register_staff_full RPC 실패, 폴백 INSERT 시도:', rpcErr);
          const insertPayload = { ...staffPayload };
          const insertOmittedColumns = new Set<string>(
            hasFractionalValue(insertPayload.working_hours_per_week) ? ['working_hours_per_week'] : [],
          );
          let { error: insertErr, data: insertedStaff } = await supabase
            .from('staff_members')
            .insert([buildStaffMutationPayload(insertPayload, insertOmittedColumns)])
            .select('id, joined_at, join_date')
            .single();
          if (
            insertErr &&
            hasFractionalValue(insertPayload.working_hours_per_week) &&
            isInvalidIntegerInputError(insertErr, insertPayload.working_hours_per_week)
          ) {
            ({ error: insertErr, data: insertedStaff } = await supabase
              .from('staff_members')
              .insert([buildStaffMutationPayload(insertPayload, new Set(['working_hours_per_week']))])
              .select('id, joined_at, join_date')
              .single());
          }
          if (insertErr) {
            return toast('직원 등록 실패: ' + (insertErr.message || 'DB 오류'), 'error');
          }
          insertedStaffId = String(insertedStaff?.id ?? '');

          // 폴백: 서브 테이블들을 순차 INSERT (클라이언트 보상 패턴)
          if (insertedStaffId) {
            // 면허
            if (filledLicenses.length > 0) {
              const { error: licErr } = await supabase.from('staff_licenses').insert(
                filledLicenses.map((l: LicenseRow) => ({
                  staff_id: insertedStaffId,
                  license_type: l.license_type ?? null,
                  license_name: l.license_name ?? null,
                  license_number: l.license_number ?? null,
                  issued_date: l.issued_date || null,
                  expiry_date: l.expiry_date || null,
                  issuing_body: l.issuing_body ?? null,
                  memo: l.memo ?? null,
                  is_primary: l.is_primary,
                })),
              );
              if (licErr) logger.warn('면허 저장 실패 (폴백):', licErr);
            }
            // 직종
            if ((신규직원.jobCategories ?? []).length > 0) {
              const { error: jobErr } = await supabase.from('staff_job_categories').insert(
                (신규직원.jobCategories ?? []).map((j: SelectedJobCategory) => ({
                  staff_id: insertedStaffId,
                  job_category_id: j.job_category_id,
                  is_primary: j.is_primary,
                })),
              );
              if (jobErr) logger.warn('직종 저장 실패 (폴백):', jobErr);
            }
            // 근무유형
            if ((신규직원.shiftAssignments ?? []).length > 0) {
              const { error: shiftErr } = await supabase.from('staff_shift_assignments').insert(
                (신규직원.shiftAssignments ?? []).map((s: SelectedShiftAssignment) => ({
                  staff_id: insertedStaffId,
                  shift_id: s.shift_id,
                  is_primary: s.is_primary,
                  priority: s.priority,
                })),
              );
              if (shiftErr) logger.warn('근무유형 배정 저장 실패 (폴백):', shiftErr);
            }
            // leave_balances
            const { error: lvErr } = await supabase.from('leave_balances').insert({
              staff_id: insertedStaffId,
              year: leaveYear,
              total_days: leaveTotalDays,
              used_days: 0,
              remaining_days: leaveTotalDays,
              expiry_date: leaveExpiryDate.toISOString().slice(0, 10),
            });
            if (lvErr) logger.warn('leave_balances 초기화 실패 (폴백):', lvErr);
          }
        } else {
          insertedStaffId = String(rpcResult.staff_id);
        }

        let onboardingChecklistInitFailed = false;
        if (insertedStaffId) {
          const { error: onboardingInitError } = await supabase
            .from('onboarding_checklists')
            .upsert(
              {
                staff_id: insertedStaffId,
                checklist_type: '입사',
                items: getDefaultChecklist('입사'),
                target_date: getChecklistTargetDate('입사', dateOrNull(신규직원.입사일)),
                completed_at: null,
              },
              { onConflict: 'staff_id,checklist_type' },
            );
          if (onboardingInitError) {
            onboardingChecklistInitFailed = true;
            logger.warn('입사 온보딩 체크리스트 초기화 실패:', onboardingInitError);
          }
        }
        await logAudit(
          '직원등록', 'staff_member', String(insertedStaffId || newEmployeeNo),
          {
            staff_name: 신규직원.성명,
            employee_no: newEmployeeNo,
            created_fields: buildAuditDiff({}, commonData, Object.keys(commonData)).after,
            licenses_count: filledLicenses.length,
            job_categories_count: (신규직원.jobCategories ?? []).length,
            shift_assignments_count: (신규직원.shiftAssignments ?? []).length,
          },
          actor.userId, actor.userName
        );
        if (프로필사진파일 && insertedStaffId) {
          try {
            await 프로필사진업로드(insertedStaffId, 프로필사진파일);
          } catch (photoError) {
            console.error('신규 직원 프로필 사진 업로드 실패:', photoError);
            프로필사진업로드경고 = '직원은 등록되었지만 프로필 사진 업로드는 실패했습니다.';
          }
        }
        toast(
          onboardingChecklistInitFailed
            ? `직원 등록 완료!\n로그인 아이디: 사번 ${newEmployeeNo} 또는 이름 ${신규직원.성명}\n(온보딩 패키지 자동 생성은 실패해 직원 상세에서 다시 생성됩니다.)`
            : `직원 등록 완료!\n로그인 아이디: 사번 ${newEmployeeNo} 또는 이름 ${신규직원.성명}\n(동명이인이 있으면 사번으로 로그인하세요)`,
          onboardingChecklistInitFailed ? 'warning' : 'success',
        );
        if (프로필사진업로드경고) toast(프로필사진업로드경고, 'warning');
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
    프로필사진미리보기설정(getProfilePhotoUrl(직원));
    const extensionValue = getStaffExtension(직원);
    const ins = (직원.permissions?.insurance as Record<string, unknown>) || { national: true, health: true, employment: true, injury: true };
    const 직원근무형태IDs = getWeeklyRotationShiftIds(직원, 직원.shift_id);
    신규직원설정({
      성명: 직원.name || '', 전화번호: 직원.phone || '', 내선번호: extensionValue as string, 사업체: 직원.company || '박철홍정형외과',
      팀: 직원.department ?? '', 직함: 직원.position || '', 입사일: (직원.joined_at as string) || (직원.join_date as string) || '',
      퇴사일: (직원.resigned_at as string) || '', 주민번호: (직원.resident_no as string) || '', 이메일: 직원.email || '',
      주소: 직원.address || '', 면허사항: (직원.license as string) || '',
      면허번호: getStaffLicenseNo(직원),
      취득일자: getStaffLicenseDate(직원),
      면허기타내용: getStaffLicenseNote(직원),
      계좌정보: 직원.bank_account || '',
      임금정보: (직원.salary_info as string) || '', 상태: 직원.status || '재직',
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
      salary_change_effective_date: new Date().toISOString().slice(0, 10),
      salary_change_reason: '',
      고용형태: getStaffEmploymentType(직원),
      계약종료일: getStaffContractEndDate(직원),
      probation_months: getStaffProbationMonths(직원, 0),
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
      working_days_per_week: resolveWorkingDaysPerWeek(직원, 5),
      licenses: [],
      jobCategories: [],
      shiftAssignments: [],
    });
    편집모드설정(true);

    // 서브 테이블 데이터 비동기 로드
    const staffId = String(직원.id);
    Promise.all([
      supabase.from('staff_licenses').select('*').eq('staff_id', staffId).order('is_primary', { ascending: false }),
      supabase.from('staff_job_categories').select('*').eq('staff_id', staffId),
      supabase.from('staff_shift_assignments').select('*').eq('staff_id', staffId).order('priority'),
    ]).then(([licRes, jobRes, shiftRes]) => {
      const loadedLicenses: LicenseRow[] = (licRes.data ?? []).map((r: Record<string, unknown>) => ({
        _key: String(r.id ?? crypto.randomUUID()),
        license_type: (r.license_type as LicenseRow['license_type']) ?? null,
        license_name: String(r.license_name ?? ''),
        license_number: String(r.license_number ?? ''),
        issued_date: String(r.issued_date ?? ''),
        expiry_date: String(r.expiry_date ?? ''),
        issuing_body: String(r.issuing_body ?? ''),
        memo: String(r.memo ?? ''),
        is_primary: Boolean(r.is_primary),
      }));
      const loadedJobs: SelectedJobCategory[] = (jobRes.data ?? []).map((r: Record<string, unknown>) => ({
        job_category_id: String(r.job_category_id),
        is_primary: Boolean(r.is_primary),
      }));
      const loadedShifts: SelectedShiftAssignment[] = (shiftRes.data ?? []).map((r: Record<string, unknown>) => ({
        shift_id: String(r.shift_id),
        is_primary: Boolean(r.is_primary),
        priority: Number(r.priority ?? 0),
      }));
      신규직원설정((prev) => ({
        ...prev,
        licenses: loadedLicenses.length > 0 ? loadedLicenses : [createEmptyLicenseRow(true)],
        jobCategories: loadedJobs,
        shiftAssignments: loadedShifts,
      }));
    }).catch((err) => {
      logger.warn('수정 모달 서브 테이블 로드 실패:', err);
    });
  };

  const 닫기함수 = () => {
    편집모드설정(false); 선택된직원ID설정(null);
    프로필사진파일설정(null);
    프로필사진미리보기설정(null);
    추가근무형태ID설정('');
    새근무형태표시설정(false);
    const defaultCompany = 선택사업체 && 선택사업체 !== '전체' ? 선택사업체 : '';
    신규직원설정({
      ...createEmptyStaffForm(defaultCompany),
      팀: 팀목록가져오기(defaultCompany)[0] ?? '원무팀',
      licenses: [createEmptyLicenseRow(true)],
      jobCategories: [],
      shiftAssignments: [],
    });
    창닫기?.();
  };

  const 직원삭제 = async (직원: StaffMember) => {
    const confirmed = await openConfirm({
      title: '직원 퇴사 처리',
      description: `${직원.name} 직원을 퇴사 처리합니다.\n구성원 목록에서 상태가 퇴사로 변경됩니다.`,
      confirmText: '퇴사 처리',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      const actor = readClientAuditActor();
      const today = new Date().toISOString().slice(0, 10);
      const afterStaff = { ...직원, status: '퇴사', resigned_at: 직원.resigned_at || today };
      await supabase
        .from('staff_members')
        .update({ status: '퇴사', resigned_at: 직원.resigned_at || today })
        .eq('id', 직원.id);
      await logAudit(
        '직원퇴사처리', 'staff_member', String(직원.id),
        {
          staff_name: 직원.name,
          employee_no: 직원.employee_no || null,
          ...buildAuditDiff(직원, afterStaff, ['status', 'resigned_at']),
        },
        actor.userId, actor.userName
      );
      toast('직원이 삭제(퇴사 처리)되었습니다.', 'success');
      if (선택된직원ID === 직원.id) 닫기함수();
      새로고침?.();
    } catch (e: unknown) {
      toast('직원 삭제 중 오류가 발생했습니다.', 'error');
    }
  };

  const 필터목록 = useMemo(() => {
    return [...직원목록]
      .filter((s: StaffMember) => {
        const companyMatch = 선택사업체 === '전체' ? true : s.company === 선택사업체;
        if (보기상태 === '퇴사') return companyMatch && !isActiveStaff(s);
        return companyMatch && isActiveStaff(s);
      })
      .sort((a: StaffMember, b: StaffMember) => {
        const aEmployeeNo = normalizeEmployeeNoForSort(a.employee_no);
        const bEmployeeNo = normalizeEmployeeNoForSort(b.employee_no);
        if (aEmployeeNo.isNumeric && bEmployeeNo.isNumeric && aEmployeeNo.numericValue !== bEmployeeNo.numericValue) {
          return aEmployeeNo.numericValue - bEmployeeNo.numericValue;
        }
        if (aEmployeeNo.isNumeric !== bEmployeeNo.isNumeric) return aEmployeeNo.isNumeric ? -1 : 1;
        const employeeNoCompare = aEmployeeNo.textValue.localeCompare(bEmployeeNo.textValue, 'ko', { numeric: true, sensitivity: 'base' });
        if (employeeNoCompare !== 0) return employeeNoCompare;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ko', { sensitivity: 'base' });
      });
  }, [보기상태, 선택사업체, 직원목록]);
  const 이번달키 = new Date().toISOString().slice(0, 7);
  const 사업체직원목록 = 직원목록.filter((직원: StaffMember) => 선택사업체 === '전체' || 직원.company === 선택사업체);
  const 전체직원수 = 사업체직원목록.filter((직원: StaffMember) => isActiveStaff(직원)).length;
  const 이번달입사수 = 사업체직원목록.filter((직원: StaffMember) => {
    const joinedAt = String((직원.joined_at as string) || (직원.join_date as string) || '');
    return joinedAt.startsWith(이번달키);
  }).length;
  const 휴직인원수 = 사업체직원목록.filter((직원: StaffMember) => 직원.status === '휴직').length;
  const 이번달퇴사수 = 사업체직원목록.filter((직원: StaffMember) => {
    const resignedAt = String((직원.resigned_at as string) || '');
    return resignedAt.startsWith(이번달키);
  }).length;

  const 구성원내보내기 = () => {
    if (typeof window === 'undefined') return;
    const header = ['이름', '부서', '직책', '입사일', '상태'];
    const rows = 필터목록.map((직원: StaffMember) => [
      직원.name || '',
      직원.department || '',
      직원.position || '',
      (직원.joined_at as string) || (직원.join_date as string) || '',
      직원.status || '재직',
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `구성원_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full app-page">
      {dialog}
      <header className="flex min-h-[72px] items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-tight text-[var(--foreground)]">인사관리</h2>
          <p className="mt-1 text-[12px] font-medium text-[var(--zinc-500)]">구성원 : 총 {필터목록.length}명</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {essRequests.length > 0 && (
            <button
              onClick={() => setShowEssModal(true)}
              className="relative h-9 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 text-[11px] font-bold text-amber-700 transition hover:bg-amber-100"
            >
              내정보 변경 요청
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--danger)] text-[10px] font-bold text-white">
                {essRequests.length}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => canRegisterNewStaff && onOpenNewStaff && onOpenNewStaff()}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent)] px-3.5 text-[12px] font-bold text-white shadow-sm transition hover:bg-[var(--accent-hover)]"
            style={{ display: canRegisterNewStaff ? undefined : 'none' }}
            disabled={!canRegisterNewStaff}
            data-testid="new-staff-button"
          >
            <LucideIcon name="Plus" size={14} strokeWidth={2.2} />
            직원 등록
          </button>
          <button
            type="button"
            onClick={구성원내보내기}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3.5 text-[12px] font-bold text-[var(--foreground)] transition hover:bg-[var(--surface-subtle)]"
          >
            <LucideIcon name="Download" size={14} strokeWidth={2} />
            내보내기
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          {[
            { label: '전체 직원', value: `${전체직원수}명`, icon: 'Users', tone: 'blue' },
            { label: '이번 달 입사', value: `${이번달입사수}명`, icon: 'Plus', tone: 'green' },
            { label: '휴직', value: `${휴직인원수}명`, icon: 'Calendar', tone: 'yellow' },
            { label: '이번 달 퇴사', value: `${이번달퇴사수}명`, icon: 'LogOut', tone: 'blue' },
          ].map((card) => (
            <div key={card.label} className="erp-stat-card flex min-h-[98px] items-center justify-between">
              <div>
                <p className="text-[12px] font-medium text-[var(--zinc-500)]">{card.label}</p>
                <p className="mt-3 text-[25px] font-black leading-none text-[var(--foreground)]">{card.value}</p>
              </div>
              <span className={`erp-icon-box ${
                card.tone === 'green'
                  ? 'bg-[var(--success-light)] text-[var(--success)]'
                  : card.tone === 'yellow'
                    ? 'bg-amber-50 text-amber-500'
                    : ''
              }`}>
                <LucideIcon name={card.icon} size={17} strokeWidth={2} />
              </span>
            </div>
          ))}
        </div>

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

        {/* PC 버전 테이블 */}
        <div className="erp-table-card hidden md:block overflow-x-auto">
          <table className="erp-table min-w-[780px]">
            <thead>
              <tr>
                <th>이름</th>
                <th>부서</th>
                <th>직책</th>
                <th>입사일</th>
                <th>상태</th>
                <th className="w-[110px] text-center">상세</th>
              </tr>
            </thead>
            <tbody>
              {필터목록.map((직원: StaffMember) => {
                const status = 직원.status || '재직';
                const statusClass =
                  status === '퇴사'
                    ? 'erp-status-red'
                    : status === '휴직'
                      ? 'erp-status-yellow'
                      : 'erp-status-green';
                return (
                  <tr key={직원.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent-selected-subtle)] text-[12px] font-bold text-[var(--accent)]">
                          {String(직원.name || '?').slice(0, 1)}
                        </span>
                        <span className="font-bold text-[var(--foreground)]">{직원.name || '-'}</span>
                      </div>
                    </td>
                    <td className="font-medium text-[var(--foreground)]">{직원.department || '-'}</td>
                    <td className="font-medium text-[var(--foreground)]">{직원.position || '-'}</td>
                    <td className="font-medium text-[var(--foreground)]">
                      {(직원.joined_at as string) || (직원.join_date as string) || '-'}
                    </td>
                    <td>
                      <span className={`erp-status ${statusClass}`}>{status}</span>
                    </td>
                    <td className="text-center">
                      <button
                        type="button"
                        onClick={() => 수정시작(직원)}
                        className="h-8 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-[12px] font-bold text-[var(--foreground)] transition hover:bg-[var(--surface-subtle)]"
                      >
                        상세
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 모바일 버전 카드 리스트 */}
        <div className="md:hidden grid grid-cols-1 gap-4">
          {필터목록.map((직원: StaffMember) => (
            <div key={직원.id} className="bg-[var(--card)] p-4 rounded-[var(--radius-lg)] border border-[var(--border)] shadow-sm flex flex-col gap-4">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[var(--toss-blue-light)] rounded-[var(--radius-md)] flex items-center justify-center text-[var(--accent)] font-semibold text-xs">#{직원.employee_no}</div>
                  <div>
                    <h4 className="text-base font-semibold text-[var(--foreground)]">{직원.name}</h4>
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)]">{직원.company} · {직원.position} · {(직원.joined_at as string) || (직원.join_date as string)}</p>
                  </div>
                </div>
                <span className={`px-3 py-1 text-[11px] font-semibold rounded-full ${직원.status === '퇴사' ? 'bg-red-500/20 text-red-600' : 'bg-green-500/20 text-green-600'}`}>{직원.status || '재직중'}</span>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[var(--border)]">
                <div>
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">부서</p>
                  <p className="text-[13px] font-bold text-[var(--foreground)]">{직원.department}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">근무형태</p>
                  <p className="text-[13px] font-bold text-[var(--foreground)]">
                    {근무형태목록.find(s => s.id === 직원.shift_id)?.name || '-'}
                    {근무형태목록.find(s => s.id === 직원.shift_id)?.is_shift && (
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-500/20 text-indigo-700">교대</span>
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">연락처</p>
                  <p className="text-[13px] font-bold text-[var(--foreground)] break-all">{직원연락요약(직원)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">고용형태</p>
                  <p className="text-[13px] font-bold text-[var(--foreground)]">{직원고용형태(직원)}</p>
                </div>
              </div>
              <div className="pt-4 border-t border-[var(--border)]">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">면허/자격</p>
                <p className="text-[13px] font-bold text-[var(--foreground)] break-words">{직원면허요약(직원)}</p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => 수정시작(직원)} className="flex-1 py-3 bg-[var(--muted)] text-[var(--foreground)] text-[11px] font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-all">정보 수정하기</button>
                <button onClick={() => 직원삭제(직원)} className="px-3 py-3 bg-red-500/10 text-red-600 text-[11px] font-semibold rounded-[var(--radius-md)] hover:bg-red-500/20 transition-all">삭제</button>
                {onOpenDocumentRepoForStaff && (
                  <button onClick={() => onOpenDocumentRepoForStaff(직원)} className="px-3 py-3 bg-[var(--toss-blue-light)] text-[var(--accent)] text-[11px] font-semibold rounded-[var(--radius-md)] hover:opacity-90 transition-all">문서</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 등록/수정 모달 */}
      {(창상태 || 편집모드) && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[110] flex items-center justify-center p-4 min-h-screen" onClick={닫기함수}>
          <div data-testid="new-staff-modal" className="bg-[var(--card)] w-full max-w-5xl rounded-[var(--radius-lg)] md:rounded-[var(--radius-lg)] overflow-hidden shadow-sm flex flex-col h-[90vh] md:h-[85vh] animate-in slide-in-from-bottom duration-300" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-[var(--card)] shrink-0">
              <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">{편집모드 ? '구성원 정보 수정' : '신규 직원 등록'}</h3>
              <button onClick={닫기함수} className="text-[var(--toss-gray-3)] hover:text-red-500 text-2xl">✕</button>
            </div>
            <div className="p-4 overflow-y-auto overflow-x-hidden flex-1 bg-[var(--card)] relative">
              <div className="flex gap-1 p-1 bg-[var(--muted)] rounded-[var(--radius-lg)] mb-4 w-fit">
                {[
                  { id: '기본', label: '인적사항', icon: 'User' },
                  { id: '소속', label: '소속/근무', icon: 'Building2' },
                  { id: '급여', label: '급여/보험', icon: 'Coins' },
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
                    <span className="flex items-center justify-center w-4 h-4"><LucideIcon name={tab.icon} size={16} /></span>
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
                            <span className="flex items-center justify-center text-[var(--toss-gray-3)]"><LucideIcon name="User" size={36} strokeWidth={1.5} /></span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[var(--foreground)]">프로필 사진</p>
                          <p className="mt-1 text-[11px] font-medium text-[var(--toss-gray-3)]">
                            신규 직원 등록 또는 구성원 정보 수정 저장 시 함께 반영됩니다.
                          </p>
                          {프로필사진파일 ? (
                            <p className="mt-2 text-[11px] font-bold text-[var(--accent)]">선택한 파일: {프로필사진파일.name}</p>
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
                                const age = getNationalPensionAgeFromResidentNo(formatted);
                                if (age !== null && !isResidentNoNationalPensionEligible(formatted) && 신규직원.ins_national) toast(`만 ${age}세는 국민연금 의무 가입 대상이 아닙니다.\n국민연금 체크를 해제해 주세요.`);
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
                      <LicenseSection
                        rows={신규직원.licenses}
                        onChange={rows => 신규직원설정(prev => ({ ...prev, licenses: rows }))}
                      />
                    </div>
                  </div>
                )}

                {activeTab === '소속' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-[var(--success)] rounded-full" />
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
                                className={`flex-1 py-2 rounded-[var(--radius-md)] text-xs font-bold transition-all ${신규직원.고용형태 === type ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--toss-gray-3)]'}`}
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
                            onChange={e => 신규직원설정({ ...신규직원, probation_months: Number(e.target.value) })}
                            className="w-full p-4 bg-blue-500/10 rounded-[var(--radius-lg)] border border-blue-100 outline-none font-bold text-sm focus:ring-2 focus:ring-blue-300 appearance-none"
                          >
                            <option value={0}>수습 없음</option>
                            <option value={1}>1개월</option>
                            <option value={2}>2개월</option>
                            <option value={3}>3개월</option>
                            <option value={6}>6개월</option>
                          </select>
                        </div>
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
                            className="text-[11px] font-bold text-[var(--accent)] flex items-center gap-0.5 hover:underline"
                          >
                            + 새 유형 추가
                          </button>
                        </div>
                        <select value={신규직원.근무형태ID} onChange={e => 대표근무형태설정(e.target.value)} className="w-full p-4 bg-[var(--toss-blue-light)] rounded-[var(--radius-lg)] border-none outline-none font-bold text-sm text-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/30 appearance-none" data-testid="new-staff-shift-select">
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
                                    className="shrink-0 rounded-[var(--radius-md)] bg-[var(--card)] px-2.5 py-1.5 text-[10px] font-bold text-[var(--toss-gray-4)] hover:text-red-500"
                                    data-testid={`new-staff-remove-shift-${shiftId}`}
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
                                  className="w-full p-2.5 text-xs font-bold bg-[var(--card)] rounded-[var(--radius-md)] border border-blue-100 outline-none"
                                  data-testid="new-staff-extra-shift-select"
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
                                    className="flex-1 py-2 bg-[var(--accent)] text-white text-[11px] font-bold rounded-[var(--radius-md)]"
                                    data-testid="new-staff-extra-shift-add-button"
                                  >
                                    선택 추가
                                  </button>
                                  <button type="button" onClick={() => 새근무형태표시설정(false)} className="px-3 py-2 bg-[var(--card)] text-[11px] font-bold text-[var(--toss-gray-3)] rounded-[var(--radius-md)] border border-blue-100">취소</button>
                                </div>
                              </>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-[11px] font-bold text-blue-700">
                                  선택 가능한 회사 근무형태가 없습니다.
                                </p>
                                <button type="button" onClick={() => 새근무형태표시설정(false)} className="px-3 py-2 bg-[var(--card)] text-[11px] font-bold text-[var(--toss-gray-3)] rounded-[var(--radius-md)] border border-blue-100">닫기</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── 직종 다중 선택 ── */}
                    <div className="md:col-span-2 space-y-2">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-emerald-500 rounded-full" />
                        직종
                      </h4>
                      <JobCategorySection
                        selected={신규직원.jobCategories}
                        onChange={cats => 신규직원설정(prev => ({ ...prev, jobCategories: cats }))}
                      />
                    </div>

                    {/* ── 근무유형 다중 배정 ── */}
                    <div className="md:col-span-2 space-y-2">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-blue-500 rounded-full" />
                        근무유형 배정 (신규)
                      </h4>
                      <ShiftAssignmentSection
                        companyName={신규직원.사업체}
                        selected={신규직원.shiftAssignments}
                        onChange={asgns => 신규직원설정(prev => ({ ...prev, shiftAssignments: asgns }))}
                      />
                    </div>
                  </div>
                )}

                {activeTab === '급여' && (
                  <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
                      {편집모드 && (
                        <div className="grid grid-cols-1 gap-3 rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 md:grid-cols-[180px_1fr]">
                          <div className="space-y-1.5">
                            <label className="ml-1 text-[10px] font-bold text-[var(--toss-gray-4)]">급여 변동 적용일</label>
                            <SmartDatePicker
                              value={신규직원.salary_change_effective_date}
                              onChange={val => 신규직원설정({ ...신규직원, salary_change_effective_date: val || '' })}
                              inputClassName="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none font-bold text-xs focus:ring-2 focus:ring-[var(--accent)]/30"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="ml-1 text-[10px] font-bold text-[var(--toss-gray-4)]">급여 변동 사유</label>
                            <input
                              type="text"
                              value={신규직원.salary_change_reason}
                              onChange={e => 신규직원설정({ ...신규직원, salary_change_reason: e.target.value })}
                              placeholder="승급, 직무 변경, 계약 변경 등"
                              className="w-full p-3 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none font-bold text-xs focus:ring-2 focus:ring-[var(--accent)]/30"
                            />
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-[var(--muted)] p-4 rounded-[var(--radius-xl)]">
                        {TAXABLE_SALARY_FIELDS.map(({ key, label }) => {
                          const val = Number(신규직원[key as keyof typeof 신규직원] ?? 0);
                          return (
                            <div key={key} className="space-y-1.5">
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
                                className="w-full p-3 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none font-bold text-xs focus:ring-2 focus:ring-[var(--accent)]/30"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h4 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                        <span className="w-1.5 h-4 bg-[var(--success)] rounded-full" />
                        비과세 수당 항목
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 bg-[var(--muted)] p-4 rounded-[var(--radius-xl)]">
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
                                className="w-full p-2.5 bg-[var(--card)] rounded-[var(--radius-md)] border-none outline-none font-bold text-[11px] focus:ring-2 focus:ring-[var(--success)]/30"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
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
                                    const age = getNationalPensionAgeFromResidentNo(신규직원.주민번호);
                                    if (age !== null && !isResidentNoNationalPensionEligible(신규직원.주민번호)) return toast(`만 ${age}세는 국민연금 가입 대상이 아닙니다.`);
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
                        <div className="p-4 bg-[var(--success-light)] rounded-[var(--radius-xl)] border border-[var(--success-light)] space-y-3">
                          <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" checked={신규직원.is_basic_living} onChange={e => {
                              if (e.target.checked && 신규직원.ins_health) {
                                toast('기초생활수급 및 의료급여 수급자는 건강보험 가입 제외 대상일 수 있습니다.\n건강보험 체크 상태를 확인 및 해제해 주세요.', 'warning');
                              }
                              신규직원설정({ ...신규직원, is_basic_living: e.target.checked });
                            }} className="w-4 h-4 rounded text-[var(--success)]" />
                            <span className="text-xs font-bold text-[var(--foreground)]">기초생활수급/차상위</span>
                          </label>
                          {신규직원.is_basic_living && (
                            <label className="ml-7 flex items-center gap-2 animate-in slide-in-from-left-2">
                              <input type="checkbox" checked={신규직원.is_medical_benefit} onChange={e => 신규직원설정({ ...신규직원, is_medical_benefit: e.target.checked })} className="w-3.5 h-3.5 rounded text-[var(--success)]" />
                              <span className="text-[10px] font-bold text-[var(--success)]">의료급여 (건보 제외)</span>
                            </label>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

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
                <h3 className="text-lg font-bold text-[var(--foreground)]">내정보 변경 요청</h3>
              </div>
              <button onClick={() => setShowEssModal(false)} className="text-[var(--toss-gray-3)] hover:text-red-500 text-xl font-bold">✕</button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 bg-[var(--muted)]">
              {essRequests.length === 0 ? (
                <div className="py-8 md:py-20 text-center text-[var(--toss-gray-3)] font-medium text-sm">대기 중인 변경 요청이 없습니다.</div>
              ) : (
                <div className="space-y-4">
                  {essRequests.map(req => {
                    const fieldLabels: Record<EssProfileFieldKey, string> = {
                      email: '이메일', phone: '연락처', extension: '내선번호',
                      address: '거주지 주소', bank_name: '급여 은행', bank_account: '급여 계좌번호'
                    };
                    const displayChanges = buildEssProfileDisplayChanges(req.details, fieldLabels);
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
                          {displayChanges.length === 0 ? (
                            <p className="text-xs text-[var(--toss-gray-4)] p-2">변경된 실질 항목이 없습니다.</p>
                          ) : (
                            displayChanges.map(change => (
                              <div key={change.key} className="p-3 bg-[var(--muted)] rounded-[var(--radius-md)] flex flex-col gap-1">
                                <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">{change.label}</span>
                                <div className="text-xs font-semibold text-[var(--foreground)] break-words">
                                  <span className="line-through text-[var(--toss-gray-3)] text-[11px] block">{formatEssProfileDisplayValue(change.before)}</span>
                                  <span className="text-[var(--success)] block mt-0.5">→ {formatEssProfileDisplayValue(change.after)}</span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                        <div className="flex justify-end gap-2 pt-2">
                          <button onClick={() => handleRejectEss(req)} className="px-5 py-2.5 bg-red-500/10 text-red-600 hover:bg-red-500/20 rounded-[var(--radius-md)] font-semibold text-[11px] transition-colors">반려</button>
                          <button onClick={() => handleApproveEssSafe(req)} className="px-5 py-2.5 bg-[var(--success)] text-white hover:opacity-90 rounded-[var(--radius-md)] font-semibold text-[11px] transition-colors shadow-sm">승인하기</button>
                        </div>
                      </div>
                    );
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
    </div>
  );
}
