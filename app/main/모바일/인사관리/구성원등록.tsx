 
'use client';

/**
 * SFormMember — 모바일 인사관리: 구성원 등록/수정 폼 (4-step wizard)
 *
 * PC 버전 [구성원현황.tsx](file:///d:/newmso/app/main/기능부품/인사관리서브/구성원현황.tsx)와 100% 동기화.
 *   Step 0: 기본 정보 (성명·주민번호·연락처·이메일·거주지·급여계좌)
 *   Step 1: 계약 및 근무 (부서·직급·계약형태·계약종료일·입사일·내선번호·수습·근무형태·근로조건)
 *   Step 2: 급여 구성 및 역산 (목표 급여·비과세 수당 5종·과세 수당·최저임금 역산 기본급/약정수당 계산)
 *   Step 3: 4대보험 및 권한 (국민·건강·고용·산재·두루누리 기간·복지수급·권한 등급)
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { getKoreanTodayString } from '@/lib/seoul-time';
import MChip from '../공통/MChip';
import MBtn from '../공통/MBtn';
import MIcon from '../공통/MIcon';
import { toast } from '@/lib/toast';
import { db } from '@/lib/db-client';
import { enqueueD1Mutation } from '@/lib/offline-queue-d1';
import { canAccessHrSection } from '@/lib/access-control';
import { getMinimumWageByYear } from '@/lib/tax-free-limits';
import { getMonthlyWorkingHours } from '@/lib/payroll-working-hours';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  MStepDots,
  useFieldIdPrefix } from './form-helpers';

async function uploadProfilePhoto(file: File, staffId: string): Promise<boolean> {
  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('staffId', staffId);
    const res = await fetch('/api/staff/profile-photo/upload', {
      method: 'POST',
      body: fd,
      credentials: 'same-origin',
    });
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      toast(j?.error || '사진 업로드에 실패했습니다.', 'error');
      return false;
    }
    toast('프로필 사진이 저장되었습니다.', 'success');
    return true;
  } catch {
    toast('사진 업로드 중 오류가 발생했습니다.', 'error');
    return false;
  }
}

export type SFormMemberProps = {
  /** 등록 완료 후 콜백 (새 직원 id 전달). 미전달 시 onBack 호출. */
  onCreated?: (id: string) => void;
  onBack: () => void;
  /** 현재 사용자 — 인사 권한 검증용. 미전달/권한 없음 시 등록 차단. */
  user?: Record<string, unknown> | null;
  /** 등록 대상 회사. undefined/'전체' 면 회사 특정 불가로 차단. */
  company?: string;
  /** 수정 대상 직원 ID. 전달 시 기존 정보를 수정합니다. */
  editStaffId?: string | null;
};

type AuthLevel = 'employee' | 'team' | 'manager' | 'admin';
type EmployType = '정규직' | '계약직' | '시간제';

type FormState = {
  name: string;
  emp: string;
  phone: string;
  email: string;
  dept: string;
  role: string;
  type: EmployType;
  start: string;
  salary: string;
  salary_type: 'year' | 'month'; // 연봉제 / 월급제
  auth: AuthLevel;

  resident_no: string;
  address: string;
  bank_name: string;
  bank_account: string;
  extension: string;
  contract_end: string;
  probation_months: number;
  probation_percent: number;
  shift_id: string;

  base_salary: number;
  meal_allowance: number;
  night_duty_allowance: number;
  vehicle_allowance: number;
  childcare_allowance: number;
  research_allowance: number;
  other_taxfree: number;
  position_allowance: number;
  overtime_allowance: number;
  night_work_allowance: number;
  holiday_work_allowance: number;
  annual_leave_pay: number;
  agreed_overtime_allowance: number;
  agreed_night_allowance: number;

  working_hours_per_week: number;
  working_days_per_week: number;

  ins_national: boolean;
  ins_health: boolean;
  ins_employment: boolean;
  ins_injury: boolean;
  is_basic_living: boolean;
  is_medical_benefit: boolean;
  ins_duru_nuri: boolean;
  duru_nuri_start: string;
  duru_nuri_end: string;
  other_welfare: string;
};

const DEPT_OPTIONS = ['경영지원팀', '영상의학팀', '간호부', '외래팀', 'OP실', '행정팀'];
const STEP_TITLES = ['기본 정보', '계약 및 근무', '급여 및 역산', '4대보험 및 권한'];

function normalizeResidentNo(value: string | null | undefined) {
  return String(value || '').replace(/[^0-9]/g, '');
}

export default function 구성원등록({ onBack, onCreated, user, company, editStaffId }: SFormMemberProps) {
  const [step, setStep] = useState(0);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [shifts, setShifts] = useState<any[]>([]);

  // 직원 등록은 인사 권한(hr_구성원) 보유자/관리자만 가능.
  const canRegister = canAccessHrSection(user, 'hr_구성원');
  // 회사 특정 불가('전체'/미지정) 시 타 회사 PII 혼입 위험 → 차단.
  const resolvedCompany = (company ?? '').trim();
  const hasValidCompany = resolvedCompany !== '' && resolvedCompany !== '전체';
  const canSubmit = canRegister && hasValidCompany;

  const [form, setForm] = useState<FormState>({
    name: '',
    emp: '',
    phone: '',
    email: '',
    dept: '경영지원팀',
    role: '사원',
    type: '정규직',
    start: getKoreanTodayString().replaceAll('-', '.'),
    salary: '',
    salary_type: 'year',
    auth: 'employee',

    resident_no: '',
    address: '',
    bank_name: '',
    bank_account: '',
    extension: '',
    contract_end: '',
    probation_months: 0,
    probation_percent: 90,
    shift_id: '',

    base_salary: 0,
    meal_allowance: 0,
    night_duty_allowance: 0,
    vehicle_allowance: 0,
    childcare_allowance: 0,
    research_allowance: 0,
    other_taxfree: 0,
    position_allowance: 0,
    overtime_allowance: 0,
    night_work_allowance: 0,
    holiday_work_allowance: 0,
    annual_leave_pay: 0,
    agreed_overtime_allowance: 0,
    agreed_night_allowance: 0,

    working_hours_per_week: 40,
    working_days_per_week: 5,

    ins_national: true,
    ins_health: true,
    ins_employment: true,
    ins_injury: true,
    is_basic_living: false,
    is_medical_benefit: false,
    ins_duru_nuri: false,
    duru_nuri_start: '',
    duru_nuri_end: '',
    other_welfare: '' });

  const fieldId = useFieldIdPrefix('form-member');

  // 근무형태 목록 로드
  useEffect(() => {
    const fetchShifts = async () => {
      try {
        const { data } = await db.from('work_shifts').select('*');
        if (data) {
          const sorted = [...data].sort((a: any, b: any) =>
            (a.name || '').localeCompare(b.name || '', 'ko'),
          );
          setShifts(sorted);
        }
      } catch (err) {
        console.error('근무형태 로드 실패:', err);
      }
    };
    void fetchShifts();
  }, []);

  // 기존 직원 정보 로드 (수정 모드)
  useEffect(() => {
    if (!editStaffId) return;
    const loadStaff = async () => {
      try {
        const { data, error } = await db
          .from('staff_members')
          .select('*')
          .eq('id', editStaffId)
          .single();
        if (error) throw error;
        if (data) {
          const ins = (data.permissions?.insurance as Record<string, unknown>) || {
            national: true,
            health: true,
            employment: true,
            injury: true };

          let bankName = '';
          let bankAccount = '';
          if (data.bank_account) {
            const parts = String(data.bank_account).split(' ');
            bankName = parts[0] || '';
            bankAccount = parts.slice(1).join(' ') || '';
          }

          // salary_info 및 수당 로드
          const allowances = (data.permissions?.payroll_allowances as any) || {};

          setForm({
            name: data.name || '',
            emp: data.employee_no || '',
            phone: data.phone || '',
            email: data.email || '',
            dept: data.department || '경영지원팀',
            role: data.position || '사원',
            type: (data.employment_type || '정규직') as EmployType,
            start: data.hire_date ? data.hire_date.replaceAll('-', '.') : '',
            salary: data.salary ? String(data.salary) : '',
            salary_type: data.salary_info?.includes('월급') || allowances.salary_info?.includes('월급') ? 'month' : 'year',
            auth: (data.role || 'employee') as AuthLevel,

            resident_no: data.resident_no || '',
            address: data.address || '',
            bank_name: bankName,
            bank_account: bankAccount,
            extension: data.extension || (data.permissions?.extension as string) || '',
            contract_end: data.contract_end || (data.permissions?.contract_end as string) || '',
            probation_months: typeof data.probation_months === 'number' ? data.probation_months : (data.permissions?.probation_months as number) || 0,
            probation_percent: typeof data.probation_percent === 'number' ? data.probation_percent : (data.permissions?.probation_percent as number) || 90,
            shift_id: (data.shift_id as string) || '',

            base_salary: (data.base_salary as number) || 0,
            meal_allowance: Number(data.meal_allowance || allowances.meal_allowance || 0),
            night_duty_allowance: Number(data.night_duty_allowance || allowances.night_duty_allowance || 0),
            vehicle_allowance: Number(data.vehicle_allowance || allowances.vehicle_allowance || 0),
            childcare_allowance: Number(data.childcare_allowance || allowances.childcare_allowance || 0),
            research_allowance: Number(data.research_allowance || allowances.research_allowance || 0),
            other_taxfree: Number(data.other_taxfree || allowances.other_taxfree || 0),
            position_allowance: Number(data.position_allowance || allowances.position_allowance || 0),
            overtime_allowance: Number(data.overtime_allowance || allowances.overtime_allowance || 0),
            night_work_allowance: Number(data.night_work_allowance || allowances.night_work_allowance || 0),
            holiday_work_allowance: Number(data.holiday_work_allowance || allowances.holiday_work_allowance || 0),
            annual_leave_pay: Number(data.annual_leave_pay || allowances.annual_leave_pay || 0),
            agreed_overtime_allowance: Number(data.agreed_overtime_allowance || allowances.agreed_overtime_allowance || 0),
            agreed_night_allowance: Number(data.agreed_night_allowance || allowances.agreed_night_allowance || 0),

            working_hours_per_week: typeof data.working_hours_per_week === 'number' ? data.working_hours_per_week : (data.permissions?.work_conditions?.working_hours_per_week as number) || 40,
            working_days_per_week: typeof data.working_days_per_week === 'number' ? data.working_days_per_week : (data.permissions?.work_conditions?.working_days_per_week as number) || 5,

            ins_national: ins.national !== false,
            ins_health: ins.health !== false,
            ins_employment: ins.employment !== false,
            ins_injury: ins.injury !== false,
            is_basic_living: (data.permissions?.is_basic_living as boolean) || false,
            is_medical_benefit: (data.permissions?.is_medical_benefit as boolean) || false,
            ins_duru_nuri: (ins.duru_nuri as boolean) || false,
            duru_nuri_start: (ins.duru_nuri_start as string) || '',
            duru_nuri_end: (ins.duru_nuri_end as string) || '',
            other_welfare: (data.permissions?.other_welfare as string) || '' });
        }
      } catch (err) {
        console.error('직원 정보 로드 실패:', err);
        toast('직원 정보를 불러오지 못했습니다.', 'error');
      }
    };
    void loadStaff();
  }, [editStaffId]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // 최저임금 연동 역산 급여 계산 로직
  const reverseCalculateSplit = () => {
    const target = Number(form.salary.replace(/[^0-9]/g, '')) || 0;
    if (target <= 0) return null;

    const monthlyTarget = form.salary_type === 'year' ? Math.floor(target / 12) : target;

    const allowances =
      Number(form.meal_allowance || 0) +
      Number(form.vehicle_allowance || 0) +
      Number(form.childcare_allowance || 0) +
      Number(form.research_allowance || 0) +
      Number(form.other_taxfree || 0) +
      Number(form.position_allowance || 0);

    const rem = monthlyTarget - allowances;
    if (rem <= 0) {
      return {
        isValid: false,
        message: '고정 수당 합계가 목표 월급보다 큽니다. 고정 수당을 조정하거나 목표 월급을 높여주세요.' };
    }

    const wHours = Number(form.working_hours_per_week || 40);
    const nHours = 0; // 약정 야간 고정 시간 (기본 0)

    let hBase = getMonthlyWorkingHours(wHours);
    let hOver = 0;

    const primaryShift = shifts.find((s) => String(s.id) === String(form.shift_id));
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

    const previewMinimumWageYear = Math.max(2025, new Date().getFullYear());
    const previewMinimumWage = getMinimumWageByYear(previewMinimumWageYear);

    if (derivedHourlyRate < previewMinimumWage) {
      const minRem = Math.ceil(totalHours * previewMinimumWage);
      const minTarget = minRem + allowances;
      const minTargetDisplay = form.salary_type === 'year' ? minTarget * 12 : minTarget;

      return {
        isValid: false,
        derivedHourlyRate,
        minTarget: minTargetDisplay,
        message: `최저시급 미달 (역산시급: ${derivedHourlyRate.toLocaleString()}원 / 기준: ${previewMinimumWage.toLocaleString()}원). 최소 세전 ${minTargetDisplay.toLocaleString()}원 이상 입력하셔야 합니다.` };
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
  };

  const handleSave = async () => {
    if (step < 3) {
      setStep(step + 1);
      return;
    }

    // 권한 가드
    if (!canRegister) {
      toast(editStaffId ? '직원 수정 권한이 없습니다.' : '직원 등록 권한이 없습니다.', 'error');
      return;
    }
    if (!hasValidCompany) {
      toast(editStaffId ? '수정할 회사를 특정할 수 없습니다.' : '등록할 회사를 특정할 수 없습니다.', 'error');
      return;
    }

    if (!form.name.trim()) {
      toast('이름을 입력해주세요.', 'warning');
      return;
    }
    setSubmitting(true);

    const salaryNum = form.salary ? Number(form.salary.replace(/[^0-9]/g, '')) : null;
    const hireDate = form.start.trim() ? form.start.trim().replaceAll('.', '-') : null;
    const contractEndFormatted = form.contract_end.trim() ? form.contract_end.trim().replaceAll('.', '-') : null;

    // 급여 정보 빌드 (역산 결과 또는 입력값 기준)
    const reverseCalc = reverseCalculateSplit();
    let finalBaseSalary = form.base_salary;
    let finalAgreedOvertime = form.agreed_overtime_allowance;
    let finalAgreedNight = form.agreed_night_allowance;

    if (reverseCalc && reverseCalc.isValid) {
      finalBaseSalary = reverseCalc.base_salary || 0;
      finalAgreedOvertime = reverseCalc.agreed_overtime_allowance || 0;
      finalAgreedNight = reverseCalc.agreed_night_allowance || 0;
    }

    // PC 데이터 스키마에 맞춰 permissions JSON 구성
    const permissions: Record<string, unknown> = {
      insurance: {
        national: form.ins_national,
        health: form.ins_health,
        employment: form.ins_employment,
        injury: form.ins_injury,
        duru_nuri: form.ins_duru_nuri,
        duru_nuri_start: form.ins_duru_nuri ? form.duru_nuri_start : '',
        duru_nuri_end: form.ins_duru_nuri ? form.duru_nuri_end : '' },
      payroll_allowances: {
        salary_info: form.salary_type === 'month' ? '월급제' : '연봉제',
        meal_allowance: form.meal_allowance,
        night_duty_allowance: form.night_duty_allowance,
        vehicle_allowance: form.vehicle_allowance,
        childcare_allowance: form.childcare_allowance,
        research_allowance: form.research_allowance,
        other_taxfree: form.other_taxfree,
        position_allowance: form.position_allowance,
        overtime_allowance: form.overtime_allowance,
        night_work_allowance: form.night_work_allowance,
        holiday_work_allowance: form.holiday_work_allowance,
        annual_leave_pay: form.annual_leave_pay,
        agreed_overtime_allowance: finalAgreedOvertime,
        agreed_night_allowance: finalAgreedNight },
      work_conditions: {
        working_hours_per_week: form.working_hours_per_week,
        working_days_per_week: form.working_days_per_week },
      is_basic_living: form.is_basic_living,
      is_medical_benefit: form.is_medical_benefit,
      other_welfare: form.other_welfare,
      contract_end: contractEndFormatted,
      probation_months: form.probation_months,
      probation_percent: form.probation_percent,
      extension: form.extension || null };

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      company: resolvedCompany,
      department: form.dept,
      position: form.role,
      employment_type: form.type,
      role: form.auth,
      status: '재직',
      permissions,
      // 메인 컬럼들 동기화
      resident_no: form.resident_no ? normalizeResidentNo(form.resident_no) : null,
      address: form.address.trim() || null,
      bank_account:
        form.bank_name.trim() && form.bank_account.trim()
          ? `${form.bank_name.trim()} ${form.bank_account.trim()}`
          : null,
      shift_id: form.shift_id || null,
      base_salary: finalBaseSalary,
      salary_info: form.salary_type === 'month' ? '월급제' : '연봉제' };
    if (hireDate) {
      payload.hire_date = hireDate;
    }
    if (form.emp.trim()) payload.employee_no = form.emp.trim();
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.email.trim()) payload.email = form.email.trim();
    if (salaryNum && salaryNum > 0) payload.salary = salaryNum;

    const mutationOpts: any = {
      table: 'staff_members',
      payload };

    if (editStaffId) {
      mutationOpts.kind = 'update';
      mutationOpts.match = { id: editStaffId };
    } else {
      mutationOpts.kind = 'insert';
    }

    const { data, queued, error } = await enqueueD1Mutation<{ id: string }>(mutationOpts);

    setSubmitting(false);

    if (error) {
      toast(editStaffId ? `직원 수정 실패: ${error}` : `직원 등록 실패: ${error}`, 'error');
      return;
    }
    if (queued) {
      toast(editStaffId ? '오프라인 — 직원 수정 대기 중' : '오프라인 — 직원 등록 대기 중', 'info');
      onBack();
      return;
    }
    toast(editStaffId ? '직원 정보가 수정되었습니다.' : '직원이 등록되었습니다.', 'success');
    const row = Array.isArray(data)
      ? (data as { id: string }[])[0]
      : (data as { id: string } | null);
    const newId = String(row?.id ?? editStaffId ?? '');
    // 신규 등록 후 대기 중이던 프로필 사진 업로드
    if (!editStaffId && photoFile && newId) {
      void uploadProfilePhoto(photoFile, String(newId));
    }
    if (onCreated && newId) onCreated(newId);
    else onBack();
  };

  return (
    <div className="m-screen">
      <MFormHeader
        onCancel={onBack}
        title={editStaffId ? '구성원 수정' : '구성원 등록'}
        sub={`${step + 1}/4 · ${STEP_TITLES[step] ?? ''}`}
        saveLabel={
          submitting ? (editStaffId ? '수정 중...' : '등록 중...') : step < 3 ? '다음' : editStaffId ? '수정' : '등록'
        }
        onSave={() => void handleSave()}
        saveDisabled={
          (step === 0 && form.name.trim() === '') || submitting || (step === 3 && !canSubmit)
        }
      />
      <MStepDots total={4} cur={step} />
      {!canSubmit && (
        <div
          role="alert"
          style={{
            margin: '12px 16px 0',
            padding: '12px 14px',
            borderRadius: 12,
            background: 'var(--m-warning-soft)',
            color: 'var(--m-warning)',
            fontSize: 12,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 10 }}
        >
          <MIcon name="alertTri" size={18} color="var(--m-warning)" />
          <span style={{ flex: 1 }}>
            {!canRegister
              ? editStaffId
                ? '직원 수정 권한이 없습니다.'
                : '직원 등록 권한이 없습니다.'
              : '회사가 특정되지 않아 저장할 수 없습니다.'}
          </span>
        </div>
      )}
      <div className="m-scroll" aria-busy={submitting}>
        {step === 0 && (
          <Step0
            form={form}
            update={update}
            fieldId={fieldId}
            photoPreview={photoPreview}
            photoInputRef={photoInputRef}
            editStaffId={editStaffId}
            onPickPhoto={(f) => {
              setPhotoFile(f);
              setPhotoPreview(URL.createObjectURL(f));
              if (editStaffId) void uploadProfilePhoto(f, String(editStaffId));
              else toast('저장 완료 후 사진이 업로드됩니다. (신규 등록)', 'info');
            }}
          />
        )}
        {step === 1 && <Step1 form={form} update={update} fieldId={fieldId} shifts={shifts} />}
        {step === 2 && <Step2 form={form} update={update} fieldId={fieldId} reverseCalc={reverseCalculateSplit()} />}
        {step === 3 && <Step3 form={form} update={update} fieldId={fieldId} />}
      </div>
      <div className="m-sticky-foot" style={{ display: 'flex', gap: 10 }}>
        {step > 0 ? (
          <MBtn block onClick={() => setStep(step - 1)} disabled={submitting}>
            이전
          </MBtn>
        ) : (
          <MBtn
            block
            onClick={onBack}
            disabled={submitting}
            style={{ background: 'var(--z-100)', color: 'var(--z-700)' }}
          >
            취소
          </MBtn>
        )}
        <MBtn
          block
          variant="primary"
          onClick={() => void handleSave()}
          disabled={submitting || (step === 3 && !canSubmit)}
        >
          {submitting
            ? editStaffId
              ? '수정 중...'
              : '등록 중...'
            : step < 3
            ? '다음'
            : editStaffId
            ? '수정 완료'
            : '등록 완료'}
        </MBtn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 0 — 기본 정보
// ─────────────────────────────────────────────────────────────
function Step0({
  form,
  update,
  fieldId,
  photoPreview,
  photoInputRef,
  editStaffId,
  onPickPhoto,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  fieldId: (k: string) => string;
  photoPreview: string | null;
  photoInputRef: React.RefObject<HTMLInputElement | null>;
  editStaffId?: string | null;
  onPickPhoto: (f: File) => void;
}) {
  return (
    <>
      <div
        style={{
          padding: '18px 16px',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
          display: 'flex',
          alignItems: 'center',
          gap: 14 }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: 'var(--z-100)',
            display: 'grid',
            placeItems: 'center',
            color: 'var(--z-400)',
            overflow: 'hidden',
            backgroundImage: photoPreview ? `url(${photoPreview})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
          aria-hidden="true"
        >
          {!photoPreview && <MIcon name="user" size={28} />}
        </div>
        <div style={{ flex: 1 }}>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 4 * 1024 * 1024) {
                toast('사진은 4MB 이하로 선택해 주세요.', 'warning');
                return;
              }
              onPickPhoto(f);
            }}
          />
          <MBtn icon="plus" onClick={() => photoInputRef.current?.click()}>
            {photoPreview ? '사진 변경' : '사진 추가'}
          </MBtn>
          <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 6, fontWeight: 600 }}>
            선택사항 · 최대 4MB · 앨범/카메라
            {editStaffId ? ' · 즉시 업로드' : ' · 등록 후 업로드'}
          </div>
        </div>
      </div>
      <div className="m-card flush macos-glass macos-squircle" style={{ margin: '16px', overflow: 'hidden' }}>
        <MField label="이름" required htmlFor={fieldId('name')}>
          <MInput
            id={fieldId('name')}
            value={form.name}
            onChange={(v) => update('name', v)}
            placeholder="홍길동"
            autoFocus
          />
        </MField>
        <MField label="주민등록번호" htmlFor={fieldId('resident_no')}>
          <MInput
            id={fieldId('resident_no')}
            value={form.resident_no}
            onChange={(v) => update('resident_no', v)}
            placeholder="000000-0000000"
          />
        </MField>
        <MField label="사번" htmlFor={fieldId('emp')} sub="비워두면 자동 생성됩니다">
          <MInput
            id={fieldId('emp')}
            value={form.emp}
            onChange={(v) => update('emp', v)}
            placeholder="자동 — 예: 0033"
            kind="numeric"
          />
        </MField>
        <MField label="연락처" htmlFor={fieldId('phone')}>
          <MInput
            id={fieldId('phone')}
            value={form.phone}
            onChange={(v) => update('phone', v)}
            placeholder="010-0000-0000"
            kind="tel"
          />
        </MField>
        <MField label="이메일" htmlFor={fieldId('email')}>
          <MInput
            id={fieldId('email')}
            value={form.email}
            onChange={(v) => update('email', v)}
            placeholder="user@hospital.kr"
            kind="email"
          />
        </MField>
        <MField label="거주지 주소" htmlFor={fieldId('address')}>
          <MInput
            id={fieldId('address')}
            value={form.address}
            onChange={(v) => update('address', v)}
            placeholder="서울특별시 강남구 테헤란로..."
          />
        </MField>
        <MField label="급여 은행 및 계좌" htmlFor={fieldId('bank_account')}>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <input
              type="text"
              value={form.bank_name}
              onChange={(e) => update('bank_name', e.target.value)}
              placeholder="은행명"
              style={{
                width: '100px',
                padding: '10px 12px',
                fontSize: 14,
                borderRadius: 10,
                border: '1px solid var(--m-border)',
                background: 'var(--m-bg)',
                color: 'var(--z-900)',
                outline: 'none' }}
            />
            <input
              id={fieldId('bank_account')}
              type="text"
              value={form.bank_account}
              onChange={(e) => update('bank_account', e.target.value)}
              placeholder="계좌번호"
              style={{
                flex: 1,
                padding: '10px 12px',
                fontSize: 14,
                borderRadius: 10,
                border: '1px solid var(--m-border)',
                background: 'var(--m-bg)',
                color: 'var(--z-900)',
                outline: 'none' }}
            />
          </div>
        </MField>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 1 — 계약 및 근무
// ─────────────────────────────────────────────────────────────
function Step1({
  form,
  update,
  fieldId,
  shifts }: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  fieldId: (k: string) => string;
  shifts: any[];
}) {
  const [useProbation, setUseProbation] = useState(form.probation_months > 0);

  return (
    <div className="m-card flush macos-glass macos-squircle" style={{ margin: '16px', overflow: 'hidden' }}>
      <MField label="부서">
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {DEPT_OPTIONS.map((d) => {
            const active = form.dept === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => update('dept', d)}
                aria-pressed={active}
                style={{
                  padding: '8px 12px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  background: active ? 'var(--m-accent)' : 'var(--m-bg)',
                  color: active ? '#fff' : 'var(--z-700)',
                  border: 'none',
                  cursor: 'pointer' }}
              >
                {d}
              </button>
            );
          })}
        </div>
      </MField>
      <MField label="직급" htmlFor={fieldId('role')}>
        <MInput
          id={fieldId('role')}
          value={form.role}
          onChange={(v) => update('role', v)}
          placeholder="사원 / 대리 / 팀장 / 이사"
        />
      </MField>
      <MField label="계약 형태">
        <MSegRow
          value={form.type}
          onPick={(t) => {
            update('type', t);
            if (t !== '계약직') update('contract_end', '');
          }}
          options={[
            { id: '정규직', label: '정규직' },
            { id: '계약직', label: '계약직' },
            { id: '시간제', label: '시간제' },
          ]}
          ariaLabel="계약 형태"
        />
      </MField>
      {form.type === '계약직' && (
        <MField label="계약 종료일" htmlFor={fieldId('contract_end')}>
          <MInput
            id={fieldId('contract_end')}
            value={form.contract_end}
            onChange={(v) => update('contract_end', v)}
            placeholder="YYYY.MM.DD"
          />
        </MField>
      )}
      <MField label="입사일" htmlFor={fieldId('start')}>
        <MInput
          id={fieldId('start')}
          value={form.start}
          onChange={(v) => update('start', v)}
          placeholder="YYYY.MM.DD"
        />
      </MField>
      <MField label="내선번호" htmlFor={fieldId('extension')}>
        <MInput
          id={fieldId('extension')}
          value={form.extension}
          onChange={(v) => update('extension', v)}
          placeholder="예: 101"
        />
      </MField>

      {/* 수습 설정 */}
      <MField label="수습 적용 여부">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <input
            type="checkbox"
            id={fieldId('use_probation')}
            checked={useProbation}
            onChange={(e) => {
              const checked = e.target.checked;
              setUseProbation(checked);
              if (!checked) {
                update('probation_months', 0);
              } else if (form.probation_months === 0) {
                update('probation_months', 3);
              }
            }}
            style={{ width: 18, height: 18 }}
          />
          <label htmlFor={fieldId('use_probation')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--z-700)' }}>
            수습기간 설정하기
          </label>
        </div>
      </MField>
      {useProbation && (
        <div style={{ display: 'flex', gap: 12, paddingLeft: 8, marginTop: 4 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)' }}>수습 개월수</span>
            <select
              value={form.probation_months}
              onChange={(e) => update('probation_months', Number(e.target.value))}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: 14,
                borderRadius: 10,
                border: '1px solid var(--m-border)',
                background: 'var(--m-bg)',
                color: 'var(--z-900)',
                marginTop: 2 }}
            >
              {[1, 2, 3, 4, 5, 6].map((m) => (
                <option key={m} value={m}>
                  {m}개월
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)' }}>지급 비율 (%)</span>
            <select
              value={form.probation_percent}
              onChange={(e) => update('probation_percent', Number(e.target.value))}
              style={{
                width: '100%',
                padding: '10px',
                fontSize: 14,
                borderRadius: 10,
                border: '1px solid var(--m-border)',
                background: 'var(--m-bg)',
                color: 'var(--z-900)',
                marginTop: 2 }}
            >
              {[70, 80, 90, 100].map((p) => (
                <option key={p} value={p}>
                  {p}% 지급
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* 근무형태 및 시간 */}
      <MField label="기본 근무형태">
        <select
          value={form.shift_id}
          onChange={(e) => update('shift_id', e.target.value)}
          style={{
            width: '100%',
            padding: '10px 12px',
            fontSize: 14,
            borderRadius: 10,
            border: '1px solid var(--m-border)',
            background: 'var(--m-bg)',
            color: 'var(--z-900)',
            marginTop: 4,
            outline: 'none' }}
        >
          <option value="">근무형태 선택 (기본)</option>
          {shifts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} {s.shift_type ? `(${s.shift_type})` : ''}
            </option>
          ))}
        </select>
      </MField>

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <MField label="주 근로시간" htmlFor={fieldId('hours_per_week')}>
            <MInput
              id={fieldId('hours_per_week')}
              value={String(form.working_hours_per_week)}
              onChange={(v) => update('working_hours_per_week', Number(v) || 40)}
              kind="numeric"
            />
          </MField>
        </div>
        <div style={{ flex: 1 }}>
          <MField label="주 근로일수" htmlFor={fieldId('days_per_week')}>
            <MInput
              id={fieldId('days_per_week')}
              value={String(form.working_days_per_week)}
              onChange={(v) => update('working_days_per_week', Number(v) || 5)}
              kind="numeric"
            />
          </MField>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 2 — 급여 및 역산
// ─────────────────────────────────────────────────────────────
function Step2({
  form,
  update,
  fieldId,
  reverseCalc }: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  fieldId: (k: string) => string;
  reverseCalc: any;
}) {
  const [showAllowances, setShowAllowances] = useState(false);

  const handleSalaryChange = (val: string) => {
    const rawNum = val.replace(/[^0-9]/g, '');
    update('salary', rawNum ? Number(rawNum).toLocaleString() : '');
  };

  const handleAllowanceChange = (key: keyof FormState, val: string) => {
    const rawNum = Number(val.replace(/[^0-9]/g, '')) || 0;
    update(key, rawNum as any);
  };

  return (
    <div className="m-card flush macos-glass macos-squircle" style={{ margin: '16px', overflow: 'hidden' }}>
      <MField label="급여 형태 선택">
        <MSegRow
          value={form.salary_type}
          onPick={(t) => update('salary_type', t as any)}
          options={[
            { id: 'year', label: '연봉제' },
            { id: 'month', label: '월급제' },
          ]}
          ariaLabel="급여 형태"
        />
      </MField>

      <MField
        label={form.salary_type === 'year' ? '목표 연봉액' : '목표 월급여액'}
        htmlFor={fieldId('salary_target')}
      >
        <MInput
          id={fieldId('salary_target')}
          value={form.salary}
          onChange={handleSalaryChange}
          placeholder={form.salary_type === 'year' ? '₩ 36,000,000' : '₩ 3,000,000'}
          kind="decimal"
        />
      </MField>

      {/* 비과세 및 고정수당 토글 */}
      <div style={{ marginTop: 14 }}>
        <button
          type="button"
          onClick={() => setShowAllowances(!showAllowances)}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 10,
            background: 'var(--z-100)',
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--z-800)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer' }}
        >
          <span>수당 상세 설정 (비과세 5종 / 직책수당 등)</span>
          <MIcon name={showAllowances ? 'chevronUp' : 'chevronDown'} size={16} />
        </button>
      </div>

      {showAllowances && (
        <div style={{ marginTop: 8, padding: '0 4px', borderLeft: '2px solid var(--m-border)', marginLeft: 4 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)', margin: '8px 0 4px' }}>비과세 수당</div>
          <MField label="식대 (월)" htmlFor={fieldId('meal_allowance')}>
            <MInput
              id={fieldId('meal_allowance')}
              value={form.meal_allowance ? form.meal_allowance.toLocaleString() : ''}
              onChange={(v) => handleAllowanceChange('meal_allowance', v)}
              placeholder="₩ 200,000 (식대 비과세 한도)"
              kind="decimal"
            />
          </MField>
          <MField label="자가운전보조금 (월)" htmlFor={fieldId('vehicle_allowance')}>
            <MInput
              id={fieldId('vehicle_allowance')}
              value={form.vehicle_allowance ? form.vehicle_allowance.toLocaleString() : ''}
              onChange={(v) => handleAllowanceChange('vehicle_allowance', v)}
              placeholder="₩ 0"
              kind="decimal"
            />
          </MField>
          <MField label="보육수당 (월)" htmlFor={fieldId('childcare_allowance')}>
            <MInput
              id={fieldId('childcare_allowance')}
              value={form.childcare_allowance ? form.childcare_allowance.toLocaleString() : ''}
              onChange={(v) => handleAllowanceChange('childcare_allowance', v)}
              placeholder="₩ 0"
              kind="decimal"
            />
          </MField>
          <MField label="연구활동비 (월)" htmlFor={fieldId('research_allowance')}>
            <MInput
              id={fieldId('research_allowance')}
              value={form.research_allowance ? form.research_allowance.toLocaleString() : ''}
              onChange={(v) => handleAllowanceChange('research_allowance', v)}
              placeholder="₩ 0"
              kind="decimal"
            />
          </MField>
          <MField label="기타 비과세 (월)" htmlFor={fieldId('other_taxfree')}>
            <MInput
              id={fieldId('other_taxfree')}
              value={form.other_taxfree ? form.other_taxfree.toLocaleString() : ''}
              onChange={(v) => handleAllowanceChange('other_taxfree', v)}
              placeholder="₩ 0"
              kind="decimal"
            />
          </MField>

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)', margin: '14px 0 4px' }}>과세 수당</div>
          <MField label="직책수당 (월)" htmlFor={fieldId('position_allowance')}>
            <MInput
              id={fieldId('position_allowance')}
              value={form.position_allowance ? form.position_allowance.toLocaleString() : ''}
              onChange={(v) => handleAllowanceChange('position_allowance', v)}
              placeholder="₩ 0"
              kind="decimal"
            />
          </MField>
        </div>
      )}

      {/* 실시간 최저임금 역산 결과 카드 */}
      {reverseCalc && (
        <div
          style={{
            marginTop: 18,
            padding: '14px',
            borderRadius: 12,
            background: reverseCalc.isValid ? 'var(--m-accent-soft)' : 'var(--m-warning-soft)',
            border: `1px solid ${reverseCalc.isValid ? 'var(--m-accent)' : 'var(--m-warning)'}` }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <MIcon
              name={reverseCalc.isValid ? 'checkCircle' : 'alertTri'}
              size={18}
              color={reverseCalc.isValid ? 'var(--m-accent)' : 'var(--m-warning)'}
            />
            <span
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: reverseCalc.isValid ? 'var(--m-accent)' : 'var(--m-warning)' }}
            >
              {reverseCalc.isValid ? '최저임금 적합성 통과' : '최저임금 적합성 미달'}
            </span>
          </div>
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.4,
              color: 'var(--z-800)',
              fontWeight: 600,
              marginBottom: 10 }}
          >
            {reverseCalc.message}
          </p>

          {reverseCalc.isValid && (
            <div
              style={{
                fontSize: 11,
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
                borderTop: '1px solid var(--m-border)',
                paddingTop: 8 }}
            >
              <div>
                <span style={{ color: 'var(--z-500)' }}>기본급: </span>
                <span style={{ fontWeight: 700, color: 'var(--z-900)' }}>
                  {reverseCalc.base_salary.toLocaleString()}원
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--z-500)' }}>약정연장수당: </span>
                <span style={{ fontWeight: 700, color: 'var(--z-900)' }}>
                  {reverseCalc.agreed_overtime_allowance.toLocaleString()}원
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--z-500)' }}>약정야간수당: </span>
                <span style={{ fontWeight: 700, color: 'var(--z-900)' }}>
                  {reverseCalc.agreed_night_allowance.toLocaleString()}원
                </span>
              </div>
              <div>
                <span style={{ color: 'var(--z-500)' }}>역산시급: </span>
                <span style={{ fontWeight: 700, color: 'var(--z-900)' }}>
                  {reverseCalc.derivedHourlyRate.toLocaleString()}원
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Step 3 — 4대보험 및 권한
// ─────────────────────────────────────────────────────────────
function Step3({
  form,
  update,
  fieldId }: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  fieldId: (k: string) => string;
}) {
  const AUTH_OPTIONS: ReadonlyArray<{
    id: AuthLevel;
    title: string;
    desc: string;
  }> = [
    { id: 'employee', title: '사용자 (기본)', desc: '자신의 정보 조회, 결재 기안, 근태 확인 가능' },
    { id: 'team', title: '부서장 권한', desc: '부서원 근태 승인, 결재선 중간 결재 및 참조 권한' },
    { id: 'manager', title: '인사담당자 권한', desc: '직원 정보 등록/수정, 연차 일괄 부여, 월급 정산' },
    { id: 'admin', title: '최고 관리자', desc: '모든 시스템 설정 변경, 부서 관리, 전체 정보 제어' },
  ];

  return (
    <div className="m-card flush macos-glass macos-squircle" style={{ margin: '16px', overflow: 'hidden' }}>
      {/* 4대보험 체크박스 */}
      <MField label="4대보험 가입 여부">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            marginTop: 4,
            padding: '10px 12px',
            background: 'var(--z-50)',
            borderRadius: 10,
            border: '1px solid var(--m-border)' }}
        >
          {[
            { key: 'ins_national', label: '국민연금' },
            { key: 'ins_health', label: '건강보험' },
            { key: 'ins_employment', label: '고용보험' },
            { key: 'ins_injury', label: '산재보험' },
          ].map((item) => (
            <label
              key={item.key}
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={form[item.key as keyof FormState] as boolean}
                onChange={(e) => update(item.key as any, e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              {item.label}
            </label>
          ))}
        </div>
      </MField>

      {/* 두루누리 지원 */}
      <MField label="두루누리 지원 여부">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
          <input
            type="checkbox"
            id={fieldId('ins_duru_nuri')}
            checked={form.ins_duru_nuri}
            onChange={(e) => update('ins_duru_nuri', e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          <label htmlFor={fieldId('ins_duru_nuri')} style={{ fontSize: 13, fontWeight: 600, color: 'var(--z-700)' }}>
            두루누리 지원 적용
          </label>
        </div>
      </MField>
      {form.ins_duru_nuri && (
        <div style={{ display: 'flex', gap: 12, paddingLeft: 8, marginTop: 4 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)' }}>지원 시작월</span>
            <MInput
              id={fieldId('duru_start')}
              value={form.duru_nuri_start}
              onChange={(v) => update('duru_nuri_start', v)}
              placeholder="YYYY.MM"
            />
          </div>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--z-500)' }}>지원 종료월</span>
            <MInput
              id={fieldId('duru_end')}
              value={form.duru_nuri_end}
              onChange={(v) => update('duru_nuri_end', v)}
              placeholder="YYYY.MM"
            />
          </div>
        </div>
      )}

      {/* 복지 수급 여부 */}
      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <div style={{ flex: 1 }}>
          <MField label="기초생활수급">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <input
                type="checkbox"
                id={fieldId('basic_living')}
                checked={form.is_basic_living}
                onChange={(e) => update('is_basic_living', e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <label htmlFor={fieldId('basic_living')} style={{ fontSize: 12, fontWeight: 600 }}>수급 대상</label>
            </div>
          </MField>
        </div>
        <div style={{ flex: 1 }}>
          <MField label="의료급여수급">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <input
                type="checkbox"
                id={fieldId('medical_benefit')}
                checked={form.is_medical_benefit}
                onChange={(e) => update('is_medical_benefit', e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              <label htmlFor={fieldId('medical_benefit')} style={{ fontSize: 12, fontWeight: 600 }}>수급 대상</label>
            </div>
          </MField>
        </div>
      </div>

      <MField label="기타 복지/우대 사항" htmlFor={fieldId('other_welfare')}>
        <MInput
          id={fieldId('other_welfare')}
          value={form.other_welfare}
          onChange={(v) => update('other_welfare', v)}
          placeholder="우대 조건 등 직접 기재"
        />
      </MField>

      {/* 권한 등급 */}
      <MField label="시스템 권한 등급" required>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            marginTop: 6 }}
        >
          {AUTH_OPTIONS.map((opt) => {
            const active = form.auth === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => update('auth', opt.id)}
                aria-pressed={active}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  border: `1.5px solid ${active ? 'var(--m-accent)' : 'var(--m-border)'}`,
                  background: active ? 'var(--m-accent-soft)' : 'var(--m-card)',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  cursor: 'pointer' }}
              >
                <div style={{ marginTop: 2 }}>
                  <input
                    type="radio"
                    name="auth_level"
                    checked={active}
                    readOnly
                    style={{ width: 16, height: 16, pointerEvents: 'none' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--z-900)' }}>
                    {opt.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--z-500)', marginTop: 2, lineHeight: 1.3 }}>
                    {opt.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </MField>
    </div>
  );
}
