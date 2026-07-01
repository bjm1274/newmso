'use client';

import React, { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { toast } from '@/lib/toast';
import { db } from '@/lib/db-client';
import ProfilePhotoThumbnail from '@/app/components/ProfilePhotoThumbnail';
import SmartDatePicker from '../../공통/SmartDatePicker';
import type { StaffMember } from '@/types';
import { fetchStaffLicensesGrouped, type StaffLicenseRow } from './staff-license-link';
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
  calculateHourlyRateFromMonthlySalary,
  getMonthlyWorkingHours,
  resolveWeeklyWorkingHours,
  resolveWorkingDaysPerWeek } from '@/lib/payroll-working-hours';
import { getMinimumWageByYear, MONTHLY_STANDARD_HOURS } from '@/lib/tax-free-limits';
import { formatWon as libFormatWon } from '@/lib/date-formatter';
import { getWeeklyRotationShiftIds } from '@/lib/contract-shift-rotation';
import { averageShiftHoursAndDays, type Shift as WorkShift } from '@/lib/shift-working-hours';
import {
  HOURS_BASED_ALLOWANCE_FIELDS,
  allowanceWonFromHours,
  getAllowanceMultiplier,
  isHoursBasedAllowance,
  type AllowanceHoursKey } from '@/lib/payroll-allowance-hours';
import { withMissingColumnsFallback } from '@/lib/db-compat';
import { readClientAuditActor, logAudit, buildAuditDiff } from '@/lib/audit';
import { getDefaultChecklist, getChecklistTargetDate } from '@/lib/hr-checklists';

const formatWon = (amount: number) => libFormatWon(Math.round(amount || 0));

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
    probation_months: 0,
    probation_percent: 90,
    base_salary: 0,
    meal_allowance: 0, night_duty_allowance: 0, vehicle_allowance: 0, childcare_allowance: 0, research_allowance: 0, other_taxfree: 0, position_allowance: 0,
    overtime_allowance: 0, night_work_allowance: 0, holiday_work_allowance: 0, annual_leave_pay: 0,
    agreed_overtime_allowance: 0, agreed_night_allowance: 0,
    ins_national: true, ins_national_amount: 0, ins_health: true, ins_employment: true, ins_injury: true, is_basic_living: false, other_welfare: '',
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

function hasFractionalValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && !Number.isInteger(numeric);
}

interface StaffFormModalProps {
  isOpen: boolean;
  editingStaff: StaffMember | null;
  선택사업체: string;
  부서목록: any[];
  직원목록: StaffMember[];
  licensesByStaff: Record<string, StaffLicenseRow[]>;
  canRegisterNewStaff: boolean;
  onClose: () => void;
  onSave: () => void;
}

export default function StaffFormModal({
  isOpen,
  editingStaff,
  선택사업체,
  부서목록,
  직원목록,
  licensesByStaff,
  canRegisterNewStaff,
  onClose,
  onSave }: StaffFormModalProps) {
  const 편집모드 = !!editingStaff;
  const 선택된직원ID = editingStaff?.id ?? null;

  const [activeTab, setActiveTab] = useState('기본'); // '기본', '소속', '급여'
  const [신규직원, 신규직원설정] = useState(() => createEmptyStaffForm(선택사업체));
  const [targetSalaryInput, setTargetSalaryInput] = useState('');
  const [targetNightHoursInput, setTargetNightHoursInput] = useState('');
  
  const [licenses, setLicenses] = useState<Partial<StaffLicenseRow>[]>([]);
  const [프로필사진파일, 프로필사진파일설정] = useState<File | null>(null);
  const [프로필사진미리보기, 프로필사진미리보기설정] = useState<string | null>(null);
  
  const [근무형태목록, 근무형태목록설정] = useState<any[]>([]);
  const [새근무형태표시, 새근무형태표시설정] = useState(false);
  const [추가근무형태ID, 추가근무형태ID설정] = useState('');
  const [팀목록캐시, 팀목록캐설정] = useState<Record<string, string[]>>({});
  const [companySelectOptions, setCompanySelectOptions] = useState<string[]>([]);

  const previewMinimumWageYear = Math.max(2025, new Date().getFullYear());
  const previewMinimumWage = getMinimumWageByYear(previewMinimumWageYear);

  const 한글정렬 = (a: string, b: string) => a.localeCompare(b, 'ko');

  const 팀목록가져오기 = (회사: string) => {
    if (팀목록캐시[회사]?.length) return 팀목록캐시[회사];
    if (회사 === 'SY INC.') return ['경영지원팀', '진료지원팀', '관리팀', '재무팀', '인사팀', '전략기획팀', '마케팅팀'];
    return ['진료부', '간호부', '총무부', '진료팀', '병동팀', '수술팀', '외래팀', '외래간호팀', '검사팀', '원무팀', '총무팀', '행정팀', '관리팀', '영양팀'];
  };

  const 직원고용형태 = (직원: StaffMember): string => getStaffEmploymentType(직원);

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

  // 근무형태 목록 로드
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

  // 팀 목록 로드
  useEffect(() => {
    const fetchTeams = async () => {
      const { data } = await db.from('org_teams').select('company_name, team_name, division').order('division').order('sort_order');
      if (!data) return;
      const byCo: Record<string, string[]> = {};
      (data as { company_name: string; team_name: string; division?: string }[]).forEach((r) => {
        if (!byCo[r.company_name]) byCo[r.company_name] = [];
        byCo[r.company_name].push(r.team_name);
      });
      팀목록캐설정(byCo);
    };
    fetchTeams();
  }, []);

  // 회사 목록 로드
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

  // 폼 초기화 & 로드
  useEffect(() => {
    if (!isOpen) return;

    if (editingStaff) {
      const 직원 = editingStaff;
      const extensionValue = getStaffExtension(직원);
      const cleanStaffId = String(직원.id || '').toLowerCase().trim();
      const 직원면허목록 = licensesByStaff[cleanStaffId] || [];
      setLicenses(직원면허목록.map(row => ({ ...row })));
      
      const ins = (직원.permissions?.insurance as Record<string, unknown>) || { national: true, health: true, employment: true, injury: true };
      const 직원근무형태IDs = getWeeklyRotationShiftIds(직원 as unknown as Record<string, unknown>, 직원.shift_id);
      
      신규직원설정({
        성명: 직원.name || '',
        전화번호: 직원.phone || '',
        내선번호: extensionValue as string,
        사업체: 직원.company || '',
        팀: 직원.department ?? '',
        직함: 직원.position || '',
        입사일: (직원.joined_at as string) || (직원.join_date as string) || '',
        퇴사일: (직원.resigned_at as string) || '',
        주민번호: (직원.resident_no as string) || '',
        이메일: 직원.email || '',
        주소: 직원.address || '',
        면허사항: '',
        면허번호: '',
        취득일자: '',
        면허기타내용: '',
        계좌정보: 직원.bank_account || '',
        임금정보: (직원.salary_info as string) || (직원.permissions?.payroll_allowances as any)?.salary_info || '',
        상태: 직원.status || '재직',
        연차총개수: typeof 직원.annual_leave_total === 'number' ? 직원.annual_leave_total : 0,
        연차사용개수: (직원.annual_leave_used as number) || 0,
        근무형태ID: 직원근무형태IDs[0] || (직원.shift_id as string) || '',
        근무형태IDs: 직원근무형태IDs,
        base_salary: (직원.base_salary as number) || 0,
        meal_allowance: Number(직원.meal_allowance || (직원.permissions?.payroll_allowances as any)?.meal_allowance || 0),
        night_duty_allowance: Number(직원.night_duty_allowance || (직원.permissions?.payroll_allowances as any)?.night_duty_allowance || 0),
        vehicle_allowance: Number(직원.vehicle_allowance || (직원.permissions?.payroll_allowances as any)?.vehicle_allowance || 0),
        childcare_allowance: Number(직원.childcare_allowance || (직원.permissions?.payroll_allowances as any)?.childcare_allowance || 0),
        research_allowance: Number(직원.research_allowance || (직원.permissions?.payroll_allowances as any)?.research_allowance || 0),
        other_taxfree: Number(직원.other_taxfree || (직원.permissions?.payroll_allowances as any)?.other_taxfree || 0),
        position_allowance: Number(직원.position_allowance || (직원.permissions?.payroll_allowances as any)?.position_allowance || 0),
        overtime_allowance: Number(직원.overtime_allowance || (직원.permissions?.payroll_allowances as any)?.overtime_allowance || 0),
        night_work_allowance: Number(직원.night_work_allowance || (직원.permissions?.payroll_allowances as any)?.night_work_allowance || 0),
        holiday_work_allowance: Number(직원.holiday_work_allowance || (직원.permissions?.payroll_allowances as any)?.holiday_work_allowance || 0),
        annual_leave_pay: Number(직원.annual_leave_pay || (직원.permissions?.payroll_allowances as any)?.annual_leave_pay || 0),
        agreed_overtime_allowance: Number(직원.agreed_overtime_allowance || (직원.permissions?.payroll_allowances as any)?.agreed_overtime_allowance || 0),
        agreed_night_allowance: Number(직원.agreed_night_allowance || (직원.permissions?.payroll_allowances as any)?.agreed_night_allowance || 0),
        고용형태: getStaffEmploymentType(직원),
        계약종료일: getStaffContractEndDate(직원),
        probation_months: getStaffProbationMonths(직원, 0),
        probation_percent: getStaffProbationPercent(직원, 90),
        ins_national: ins.national !== false,
        ins_national_amount: ins.national_amount != null ? Number(ins.national_amount) : 0,
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
      프로필사진파일설정(null);
      프로필사진미리보기설정(getProfilePhotoUrl(직원));
      setTargetSalaryInput('');
      setTargetNightHoursInput('');
      setActiveTab('기본');

      const staffId = String(직원.id);
      db
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
    } else {
      const defaultCompany = 선택사업체 && 선택사업체 !== '전체' ? 선택사업체 : '';
      const defaultTeam = 팀목록가져오기(defaultCompany)[0] ?? '원무팀';
      
      신규직원설정({
        ...createEmptyStaffForm(defaultCompany),
        팀: defaultTeam });
      프로필사진파일설정(null);
      프로필사진미리보기설정(null);
      setLicenses([]);
      setTargetSalaryInput('');
      setTargetNightHoursInput('');
      setActiveTab('기본');
    }
  }, [isOpen, editingStaff, 선택사업체, licensesByStaff]);

  // 주당 근로시간 변경 시 연차 자동 계산 (비례 산정)
  useEffect(() => {
    const hours = 신규직원.working_hours_per_week || 0;
    if (hours > 0) {
      const calculatedLeave = (hours / 40);
      const roundedLeave = Math.round(calculatedLeave * 10) / 10;
      if (!편집모드 && 신규직원.연차총개수 === 0) {
        신규직원설정(prev => ({ ...prev, 연차총개수: roundedLeave }));
      }
    }
  }, [신규직원.working_hours_per_week, 편집모드]);

  const 회사목록 = useMemo(
    () => Array.from(new Set(직원목록.map((s) => s.company).filter(Boolean))).sort() as string[],
    [직원목록],
  );

  const availableCompanyOptions = useMemo(
    () => Array.from(new Set([...companySelectOptions, ...회사목록])).sort() as string[],
    [companySelectOptions, 회사목록],
  );

  // 근무형태 헬퍼
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

  // 급여 계산기/역산 관련 memos
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

    const isAlternateDay = primaryShift?.shift_type === '1일근무1일휴무';

    if (isAlternateDay) {
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
  }, [targetSalaryInput, targetNightHoursInput, 신규직원.meal_allowance, 신규직원.vehicle_allowance, 신규직원.childcare_allowance, 신규직원.research_allowance, 신규직원.other_taxfree, 신규직원.position_allowance, 신규직원.working_hours_per_week, primaryShift, previewMinimumWage]);

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

  const handleLicenseChange = (index: number, field: keyof StaffLicenseRow, value: any) => {
    setLicenses((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddLicense = () => {
    setLicenses((prev) => [
      ...prev,
      {
        license_name: '',
        license_number: '',
        issued_date: '',
        expiry_date: '',
        memo: '' },
    ]);
  };

  const handleRemoveLicense = (index: number) => {
    setLicenses((prev) => prev.filter((_, i) => i !== index));
  };

  const saveStaffLicense = async (staffId: string): Promise<string | null> => {
    try {
      const cleanStaffId = staffId.toLowerCase().trim();
      const originalLicenses = licensesByStaff[cleanStaffId] || [];
      const remainingIds = new Set(licenses.map(l => l.id).filter(Boolean));
      const deletedIds = originalLicenses.map(l => l.id).filter(id => !remainingIds.has(id));

      if (deletedIds.length > 0) {
        const { error } = await db
          .from('staff_licenses')
          .delete()
          .in('id', deletedIds);
        if (error) throw error;
      }

      for (const lic of licenses) {
        const payload = {
          license_name: lic.license_name?.trim() || '',
          license_number: lic.license_number?.trim() || null,
          issued_date: lic.issued_date?.trim() || null,
          expiry_date: lic.expiry_date?.trim() || null,
          memo: lic.memo?.trim() || null };

        if (!payload.license_name) continue;

        if (lic.id) {
          const { error } = await db
            .from('staff_licenses')
            .update(payload)
            .eq('id', lic.id);
          if (error) throw error;
        } else {
          const { error } = await db
            .from('staff_licenses')
            .insert([{
              ...payload,
              staff_id: staffId }]);
          if (error) throw error;
        }
      }
      return null;
    } catch (error) {
      console.error('License upsert failed:', error);
      return '직원 면허 정보 저장 중 오류가 발생하여 일부 자격은 저장되지 않았습니다. 자격안전센터에서 면허를 다시 등록하세요.';
    }
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
      .update({ avatar_url: photoUrl, permissions: nextPermissions })
      .eq('id', String(staffId));

    if (avatarUpdate.error) {
      const isMissingColumnErr = (err: any, col: string) => {
        const msg = err?.message || String(err || '');
        return msg.includes(`column "${col}" of relation "staff_members" does not exist`);
      };

      if (!isMissingColumnErr(avatarUpdate.error, 'avatar_url')) {
        throw avatarUpdate.error;
      }

      const photoUpdate = await db
        .from('staff_members')
        .update({ photo_url: photoUrl, permissions: nextPermissions })
        .eq('id', String(staffId));

      if (photoUpdate.error) {
        if (!isMissingColumnErr(photoUpdate.error, 'photo_url')) {
          throw photoUpdate.error;
        }

        const permissionsUpdate = await db
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

  const 닫기함수 = () => {
    onClose();
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
        (편집모드 && 선택된직원ID) ? 선택된직원ID : null
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
      const existingStaffForPermissions =
        (편집모드 && 선택된직원ID)
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
        license: licenses.map(l => l.license_name).filter(Boolean).join(', '),
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
            national_amount: 신규직원.ins_national_amount ? Number(신규직원.ins_national_amount) : null,
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
          payroll_allowance_hours: 신규직원.allowance_hours,
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

        const residentDigits = String(신규직원.주민번호 ?? '').replace(/[^0-9]/g, '');
        if (residentDigits.length === 0) {
          delete updatePayload.resident_no;
        }
        const forcedOmittedWorkConditionColumns = hasFractionalValue(updatePayload.working_hours_per_week)
          ? ['working_hours_per_week']
          : [];
        
        const isMissingColumnErr = (err: any, col: string) => {
          const msg = err?.message || String(err || '');
          return msg.includes(`column "${col}" of relation "staff_members" does not exist`);
        };

        const { error: updateErr } = await withMissingColumnsFallback(
          (omittedColumns) => {
            const allOmittedColumns = new Set<string>([
              ...omittedColumns,
              ...forcedOmittedWorkConditionColumns,
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

        const lastNo = (employeeNos || []).reduce((maxNo: number, row: { employee_no?: unknown }) => {
          const parsed = Number.parseInt(String(row?.employee_no || ''), 10);
          if (!Number.isFinite(parsed) || parsed < 1) {
            return maxNo;
          }
          return Math.max(maxNo, parsed);
        }, 0);

        let nextNo = Math.max(1, lastNo + 1);
        while (existingEmployeeNos.has(String(nextNo))) {
          nextNo += 1;
        }
        newEmployeeNo = String(nextNo);

        const insertPayload = {
          ...commonData,
          employee_no: newEmployeeNo,
          role: 'staff',
          password: '',
          join_date: dateOrNull(신규직원.입사일),
          password_reset_required: 1 };
        const forcedInsertOmittedColumns = hasFractionalValue(insertPayload.working_hours_per_week)
          ? ['working_hours_per_week']
          : [];
        const { error: insertErr, data } = await withMissingColumnsFallback(
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
        const insertedStaff = data as any;

        if (insertErr) {
          return toast('직원 등록 실패: ' + (insertErr.message || 'DB 오류'), 'error');
        }

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
      onSave();
    } catch (error: unknown) {
      if (isDuplicateStaffIdentityError(error)) {
        toast('같은 이름과 주민번호를 가진 직원은 중복 등록할 수 없습니다.', 'error');
        return;
      }
      toast('처리 중 오류가 발생했습니다: ' + (((error as Error)?.message ?? String(error)) || 'Unknown error'), 'error');
    }
  };

  if (!isOpen) return null;

  return (
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
                      직원의 여러 면허/자격 정보를 편집하고 추가할 수 있습니다.
                    </p>
                    
                    <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                      {licenses.map((lic, index) => (
                        <div key={lic.id || `temp-${index}`} className="p-4 bg-[var(--card)] rounded-[var(--radius-lg)] border border-amber-100 space-y-3 relative">
                          <div className="absolute top-2 right-2">
                            <button
                              type="button"
                              onClick={() => handleRemoveLicense(index)}
                              className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors"
                              title="삭제"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-amber-700 ml-1">자격 명칭</label>
                              <input
                                type="text"
                                placeholder="간호사 등"
                                value={lic.license_name || ''}
                                onChange={(e) => handleLicenseChange(index, 'license_name', e.target.value)}
                                className="w-full p-2 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-amber-700 ml-1">면허 번호</label>
                              <input
                                type="text"
                                placeholder="번호 입력"
                                value={lic.license_number || ''}
                                onChange={(e) => handleLicenseChange(index, 'license_number', e.target.value)}
                                className="w-full p-2 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-amber-700 ml-1">취득 일자</label>
                              <SmartDatePicker
                                value={lic.issued_date || ''}
                                onChange={(val) => handleLicenseChange(index, 'issued_date', val)}
                                inputClassName="w-full p-2 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-amber-700 ml-1">만료 일자</label>
                              <SmartDatePicker
                                value={lic.expiry_date || ''}
                                onChange={(val) => handleLicenseChange(index, 'expiry_date', val)}
                                inputClassName="w-full p-2 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300"
                              />
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-amber-700 ml-1">기타 내용</label>
                            <input
                              type="text"
                              value={lic.memo || ''}
                              onChange={(e) => handleLicenseChange(index, 'memo', e.target.value)}
                              placeholder="발급기관, 세부 범위 등 입력"
                              className="w-full p-2 bg-[var(--muted)] rounded-[var(--radius-md)] border-none outline-none text-xs font-bold text-amber-900 focus:ring-2 focus:ring-amber-300"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={handleAddLicense}
                      className="w-full py-2 bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold rounded-lg text-xs transition-colors flex items-center justify-center gap-1 cursor-pointer"
                    >
                      ➕ 면허/자격 추가
                    </button>
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
                  {신규직원.ins_national && (
                    <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-[var(--radius-xl)] flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-red-900 flex items-center gap-2">
                          📌 국민연금 고정 공제액 설정
                        </h4>
                        <p className="text-[10px] text-red-600">
                          매월 공단 고지서상의 금액으로 고정해 공제하려면 금액을 입력하세요. 미입력 시 급여에 따라 자동 계산(요율 4.75%)됩니다.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          value={신규직원.ins_national_amount ? Number(신규직원.ins_national_amount).toLocaleString() : ''}
                          onChange={e => {
                            const n = parseInt(e.target.value.replace(/,/g, ''), 10) || 0;
                            신규직원설정({ ...신규직원, ins_national_amount: n });
                          }}
                          placeholder="고지 금액 입력"
                          className="w-40 p-2 bg-[var(--card)] rounded-[var(--radius-md)] border border-red-500/20 outline-none font-bold text-xs text-right focus:ring-2 focus:ring-red-500/30"
                        />
                        <span className="text-xs font-bold text-red-900">원</span>
                      </div>
                    </div>
                  )}
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
  );
}
