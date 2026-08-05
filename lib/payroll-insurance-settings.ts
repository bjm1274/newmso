import type { StaffMember } from '@/types';
import { parseBirthDateFromResidentNo } from '@/lib/resident-number';

export const NATIONAL_PENSION_MIN_AGE = 18;
export const NATIONAL_PENSION_MAX_EXCLUSIVE_AGE = 60;
export const DURU_NURI_MONTHLY_PAY_LIMIT = 2_700_000;
export const DURU_NURI_SUPPORT_BASE_LIMIT = 2_300_000;
export const DURU_NURI_SUPPORT_RATE = 0.8;

export type PayrollInsuranceSettings = {
  national: boolean;
  health: boolean;
  employment: boolean;
  injury: boolean;
  incomeTax: boolean;
  duruNuri: boolean;
  duruNuriStart: string;
  duruNuriEnd: string;
  medicalBenefit: boolean;
  nationalPensionAgeEligible: boolean;
};

type StaffLike = Partial<StaffMember> & Record<string, unknown>;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parsePayrollDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  const rawText = String(value ?? '').trim();
  const text = rawText.slice(0, 10);
  const compactText = rawText.replace(/[^0-9]/g, '');
  const match =
    /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(text) ||
    (/^\d{8}$/.test(compactText) ? /^(\d{4})(\d{2})(\d{2})$/.exec(compactText) : null);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function parseYearMonthEnd(value: unknown): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = new Date(year, month, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolvePayrollAsOfDate(value?: unknown): Date {
  return parsePayrollDate(value) || parseYearMonthEnd(value) || new Date();
}

// 세기 판정 본체는 `lib/resident-number.ts` 로 이관했다(8차 D04-011).
// 이 파일의 구현이 3사본 중 유일하게 9/0→1800 과 '판정 불가=null' 을 지켜 정본이 됐다.

function getStaffBirthDate(staff?: StaffLike | null): Date | null {
  if (!staff) return null;
  return (
    parsePayrollDate(staff.birth_date) ||
    parsePayrollDate(staff.birthday) ||
    parsePayrollDate(staff.date_of_birth) ||
    parseBirthDateFromResidentNo(staff.resident_no)
  );
}

export function getPayrollStaffAge(staff?: StaffLike | null, asOf: Date = new Date()): number | null {
  const birthDate = getStaffBirthDate(staff);
  if (!birthDate || Number.isNaN(asOf.getTime())) return null;

  let age = asOf.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    asOf.getMonth() < birthDate.getMonth() ||
    (asOf.getMonth() === birthDate.getMonth() && asOf.getDate() < birthDate.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function isNationalPensionAgeEligible(staff?: StaffLike | null, asOf: Date = new Date()) {
  const age = getPayrollStaffAge(staff, asOf);
  if (age === null) return true;
  return age >= NATIONAL_PENSION_MIN_AGE && age < NATIONAL_PENSION_MAX_EXCLUSIVE_AGE;
}

export function getPayrollInsuranceSettings(
  staff?: StaffLike | null,
  asOf: Date = new Date(),
): PayrollInsuranceSettings {
  const permissions = isPlainRecord(staff?.permissions) ? (staff?.permissions as Record<string, unknown>) : {};
  const source = isPlainRecord(permissions.insurance) ? permissions.insurance : {};
  const nationalPensionAgeEligible = isNationalPensionAgeEligible(staff, asOf);

  return {
    national: source.national !== false && nationalPensionAgeEligible,
    health: source.health !== false,
    employment: source.employment !== false,
    injury: source.injury !== false,
    incomeTax: source.income_tax !== false,
    duruNuri: Boolean(source.duru_nuri),
    duruNuriStart: String(source.duru_nuri_start || '').slice(0, 7),
    duruNuriEnd: String(source.duru_nuri_end || '').slice(0, 7),
    medicalBenefit: Boolean(permissions.is_medical_benefit),
    nationalPensionAgeEligible };
}

export function hasAnyEmployeePayrollInsurance(settings: PayrollInsuranceSettings) {
  return settings.national || settings.health || settings.employment;
}

function parseYearMonthIndex(value: unknown): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isFinite(year) || month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

export function isDuruNuriActiveForYearMonth(
  settings: PayrollInsuranceSettings,
  yearMonth: string,
  monthlyPay?: number,
) {
  if (!settings.duruNuri) return false;
  const targetMonthIndex = parseYearMonthIndex(yearMonth);
  const startMonthIndex = parseYearMonthIndex(settings.duruNuriStart);
  if (targetMonthIndex === null || startMonthIndex === null) return false;
  if (targetMonthIndex < startMonthIndex) return false;
  const endMonthIndex = parseYearMonthIndex(settings.duruNuriEnd);
  if (endMonthIndex !== null && targetMonthIndex > endMonthIndex) return false;
  if (targetMonthIndex - startMonthIndex >= 36) {
    return false;
  }
  if (monthlyPay !== undefined && Math.max(0, Number(monthlyPay) || 0) > DURU_NURI_MONTHLY_PAY_LIMIT) return false;
  return true;
}

export function applyDuruNuriEmployeeSupport(
  fullEmployeePremium: number,
  premiumBase: number,
  employeeRate: number,
) {
  const fullPremium = Math.max(0, Math.floor(Number(fullEmployeePremium) || 0));
  const base = Math.min(
    Math.max(0, Math.floor(Number(premiumBase) || 0)),
    DURU_NURI_SUPPORT_BASE_LIMIT,
  );
  const rate = Math.max(0, Number(employeeRate) || 0);
  const supportAmount = Math.floor(Math.floor(base * rate) * DURU_NURI_SUPPORT_RATE);
  return Math.max(0, fullPremium - supportAmount);
}
