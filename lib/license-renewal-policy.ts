/**
 * 면허·자격증 법정 갱신주기 정책
 * - 한국 의료인·보건의료인 면허신고/보수교육 주기 기준
 * - expiry_date가 명시되어 있으면 그것을 우선
 * - expiry_date가 없으면 (renewed_date ?? issued_date) + 법정 갱신주기로 산출
 */

export type LicenseRenewalRule = {
  /** 신고 주기(개월) — 만료 트리거. 의료인 면허신고/응급구조사 자격신고 = 36 */
  cycleMonths: number;
  /** 화면 표시용 설명 */
  label: string;
  /** 보수교육 주기(개월) — 매년=12, 격년=24, 신고만 있고 보수교육 없음=null */
  ceMonths: number | null;
  /** 보수교육 주기 표시용 */
  ceLabel: string | null;
};

/**
 * license_type → 법정 만료/갱신 주기 매핑
 *
 * 한국 면허 제도는 두 트랙 — (a) 신고 주기 (b) 보수교육 주기 — 가 별도로 운영됩니다.
 * 본 시스템의 "만료" 추적은 (a) 신고 주기를 우선 적용합니다.
 * 보수교육 이수증은 신고를 위한 누적 요건이며, 인사 검토 시 신고일(=교육일 확정값)로
 * 만료를 갱신하는 워크플로우입니다.
 *
 * - 의료법 §25조: 의료인(의사·치과·한의사·조산사·간호사) 면허신고 3년
 * - 간호법 §17조: 간호사·간호조무사 면허·자격신고 3년 (2025.6.21 시행규칙)
 *   ※ 간호법 시행규칙 §16조: 간호조무사 보수교육 매년 8시간(별도 트랙, 누적 요건)
 * - 약사법 §15조: 약사 면허신고 3년
 * - 의료기사법 §11조: 임상병리사·방사선사·물리치료사 등 면허신고 3년
 * - 응급의료법 §36조의2: 응급구조사 자격신고 3년
 * - 국민영양관리법 §17조: 영양사 면허신고 3년
 * - 식품위생법 §56조 / 시행규칙 §83조: 조리사 보수교육 2년 (신고 제도 없음 → 보수교육이 갱신 트리거)
 */
const RENEWAL_RULES: Record<string, LicenseRenewalRule> = {
  의사면허: {
    cycleMonths: 36, label: '면허신고 3년 (의료법 §25조)',
    ceMonths: 12, ceLabel: '보수교육 매년 8평점 (의료법 시행규칙 §20조)' },
  간호사면허: {
    cycleMonths: 36, label: '면허신고 3년 (간호법 §17조)',
    ceMonths: 12, ceLabel: '보수교육 매년 8시간 (간호법 §16조)' },
  약사면허: {
    cycleMonths: 36, label: '면허신고 3년 (약사법 §15조)',
    ceMonths: 12, ceLabel: '연수교육 매년 6평점 (약사 연수교육 등에 관한 규정)' },
  방사선사면허: {
    cycleMonths: 36, label: '면허신고 3년 (의료기사법 §11조)',
    ceMonths: 12, ceLabel: '보수교육 매년 8시간 (의료기사법 시행규칙 §18조)' },
  물리치료사면허: {
    cycleMonths: 36, label: '면허신고 3년 (의료기사법 §11조)',
    ceMonths: 12, ceLabel: '보수교육 매년 8시간 (의료기사법 시행규칙 §18조)' },
  임상병리사면허: {
    cycleMonths: 36, label: '면허신고 3년 (의료기사법 §11조)',
    ceMonths: 12, ceLabel: '보수교육 매년 8시간 (의료기사법 시행규칙 §18조)' },
  간호조무사자격: {
    cycleMonths: 36, label: '자격신고 3년 (간호법 §17조)',
    ceMonths: 12, ceLabel: '보수교육 매년 8시간 (간호법 시행규칙 §16조)' },
  응급구조사자격: {
    cycleMonths: 36, label: '자격신고 3년 (응급의료법 §36조의2)',
    ceMonths: 12, ceLabel: '보수교육 매년 4시간 이상 (응급의료법 시행규칙 §39조)' },
  영양사면허: {
    cycleMonths: 36, label: '면허신고 3년 (국민영양관리법 §17조)',
    ceMonths: 24, ceLabel: '보수교육 2년 6시간 (국민영양관리법 시행규칙 §18조)' },
  조리사면허: {
    // 신고 제도 없음 → 보수교육이 사실상 갱신 트리거이므로 cycleMonths=24로 통일
    cycleMonths: 24, label: '보수교육 2년 (식품위생법 시행규칙 §83조)',
    ceMonths: 24, ceLabel: '보수교육 2년 6시간 (식품위생법 시행규칙 §83조)' } };

export function getRenewalRule(licenseType?: string | null): LicenseRenewalRule | null {
  if (!licenseType) return null;
  return RENEWAL_RULES[licenseType] ?? null;
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  const target = new Date(d);
  target.setMonth(target.getMonth() + months);
  // YYYY-MM-DD
  const yyyy = target.getFullYear();
  const mm = String(target.getMonth() + 1).padStart(2, '0');
  const dd = String(target.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export type EffectiveExpiry = {
  /** 실효 만료일 (YYYY-MM-DD) — null이면 산출 불가 */
  date: string | null;
  /** 산출 근거 — 'explicit' = expiry_date 입력값, 'renewed' = 갱신일+주기, 'issued' = 취득일+주기, 'unknown' = 정보 부족 */
  source: 'explicit' | 'renewed' | 'issued' | 'unknown';
  /** 적용된 법정 갱신주기(개월) — explicit이면 null */
  cycleMonths: number | null;
};

/**
 * 실효 만료일 산출
 * 우선순위: expiry_date(explicit) > renewed_date+주기 > issued_date+주기
 */
export function computeEffectiveExpiry(input: {
  license_type?: string | null;
  expiry_date?: string | null;
  renewed_date?: string | null;
  issued_date?: string | null;
}): EffectiveExpiry {
  if (input.expiry_date && input.expiry_date.trim()) {
    return { date: input.expiry_date, source: 'explicit', cycleMonths: null };
  }
  const rule = getRenewalRule(input.license_type);
  if (!rule) {
    return { date: null, source: 'unknown', cycleMonths: null };
  }
  if (input.renewed_date && input.renewed_date.trim()) {
    return {
      date: addMonths(input.renewed_date, rule.cycleMonths),
      source: 'renewed',
      cycleMonths: rule.cycleMonths };
  }
  if (input.issued_date && input.issued_date.trim()) {
    return {
      date: addMonths(input.issued_date, rule.cycleMonths),
      source: 'issued',
      cycleMonths: rule.cycleMonths };
  }
  return { date: null, source: 'unknown', cycleMonths: rule.cycleMonths };
}

export type LicenseStatus = 'valid' | 'expiring' | 'expired' | 'unknown';

/**
 * 실효 만료일 기반 상태 산출
 * - 만료일이 산출 불가능하면 'unknown'
 * - 만료일까지 남은 일수: <0 = 만료, <=60 = 임박, 그 외 = 유효
 */
export type CEDueStatus = 'ok' | 'due_soon' | 'overdue' | 'unknown';

/**
 * 보수교육 다음 이수 마감일 산출
 * - 마지막 보수교육일(또는 갱신일/취득일) + ceMonths
 * - ceMonths가 정의되지 않거나 기준일이 없으면 'unknown'
 */
export function computeCENextDue(input: {
  license_type?: string | null;
  /** 마지막 승인된 보수교육 이수일 (license_continuing_education.education_date) */
  last_ce_date?: string | null;
  /** 폴백: 최근 갱신일 */
  renewed_date?: string | null;
  /** 폴백: 취득일 */
  issued_date?: string | null;
}): { date: string | null; status: CEDueStatus; daysLeft: number | null; ceMonths: number | null; ceLabel: string | null } {
  const rule = getRenewalRule(input.license_type);
  if (!rule || rule.ceMonths == null) {
    return { date: null, status: 'unknown', daysLeft: null, ceMonths: null, ceLabel: null };
  }
  const baseDate = input.last_ce_date || input.renewed_date || input.issued_date;
  if (!baseDate || !baseDate.trim()) {
    return { date: null, status: 'unknown', daysLeft: null, ceMonths: rule.ceMonths, ceLabel: rule.ceLabel };
  }
  const dueDate = addMonths(baseDate, rule.ceMonths);
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return { date: null, status: 'unknown', daysLeft: null, ceMonths: rule.ceMonths, ceLabel: rule.ceLabel };
  }
  const now = new Date();
  const t = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((t - b) / (1000 * 60 * 60 * 24));
  let status: CEDueStatus;
  if (daysLeft < 0) status = 'overdue';
  else if (daysLeft <= 60) status = 'due_soon';
  else status = 'ok';
  return { date: dueDate, status, daysLeft, ceMonths: rule.ceMonths, ceLabel: rule.ceLabel };
}

export function computeLicenseStatus(input: {
  license_type?: string | null;
  expiry_date?: string | null;
  renewed_date?: string | null;
  issued_date?: string | null;
}): { status: LicenseStatus; effective: EffectiveExpiry; daysLeft: number | null } {
  const effective = computeEffectiveExpiry(input);
  if (!effective.date) {
    return { status: 'unknown', effective, daysLeft: null };
  }
  const expiry = new Date(effective.date);
  if (Number.isNaN(expiry.getTime())) {
    return { status: 'unknown', effective, daysLeft: null };
  }
  const now = new Date();
  // 일 단위 차이 (날짜 경계 기준)
  const t = Date.UTC(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const daysLeft = Math.round((t - b) / (1000 * 60 * 60 * 24));
  let status: LicenseStatus;
  if (daysLeft < 0) status = 'expired';
  else if (daysLeft <= 60) status = 'expiring';
  else status = 'valid';
  return { status, effective, daysLeft };
}
