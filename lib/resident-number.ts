/**
 * 주민등록번호 세기(century) 판정 SSOT.
 *
 * 8차 D04-011: 같은 판정이 3곳에 따로 구현돼 있었고 규칙이 갈라져 있었다.
 *  - `lib/payroll-insurance-settings.ts` — 1/2/5/6→1900, 3/4/7/8→2000, 9/0→1800, 그 외 null (정본)
 *  - `lib/contract-template-render.ts`   — 1/2/5/6→1900, **나머지 전부 2000**
 *  - `구성원현황.tsx` (직원 등록)         — 정본과 동일한 사본 1벌 + 나이 경고용 축약판(1/2→1900, 나머지 2000)
 *
 * 실측 차이(주민번호 990101-9######):
 *   contract-template-render → 2099년생 / payroll-insurance-settings → 1899년생
 * 미배정 코드(예: 성별코드가 숫자가 아님)에서도 render 판은 조용히 2000년대로 단정했다.
 *
 * 정본은 `payroll-insurance-settings` 쪽을 택한다 — 9/0(1800년대)을 실제로 배정하고
 * 판정 불가를 null 로 돌려주기 때문이다. 세기를 임의로 단정하면 4대보험 연령 판정
 * (만 60세 이상 국민연금 면제)이 조용히 틀어진다.
 */

/** 성별코드 → 출생 세기(1800/1900/2000). 배정되지 않은 코드는 null. */
export function resolveResidentBirthCentury(genderDigit: string): number | null {
  switch (genderDigit) {
    case '1':
    case '2':
    case '5':
    case '6':
      return 1900;
    case '3':
    case '4':
    case '7':
    case '8':
      return 2000;
    case '9':
    case '0':
      return 1800;
    default:
      return null;
  }
}

export type ResidentBirthParts = {
  year: number;
  month: number;
  day: number;
};

/**
 * 주민번호에서 생년월일 구성요소를 뽑는다. 존재하지 않는 날짜(2월 30일 등)는 null.
 */
export function parseResidentBirthParts(value: unknown): ResidentBirthParts | null {
  const digits = String(value ?? '').replace(/[^0-9]/g, '');
  if (digits.length < 7) return null;

  const yearSuffix = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const day = Number(digits.slice(4, 6));
  const century = resolveResidentBirthCentury(digits.slice(6, 7));
  if (century === null) return null;

  const year = century + yearSuffix;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** 주민번호 → Date(로컬 자정). 판정 불가면 null. */
export function parseBirthDateFromResidentNo(value: unknown): Date | null {
  const parts = parseResidentBirthParts(value);
  if (!parts) return null;
  return new Date(parts.year, parts.month - 1, parts.day);
}

/** 주민번호 → 'YYYY-MM-DD'. 판정 불가면 null. */
export function formatResidentBirthDateKey(value: unknown): string | null {
  const parts = parseResidentBirthParts(value);
  if (!parts) return null;
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}
