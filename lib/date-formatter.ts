/**
 * 공통 날짜/금액 포매팅 유틸
 * 기존에 approval-report-utils.ts, hr-history-ledger.ts에 분산되어 있던
 * 날짜 포맷 함수들을 통합
 */

/**
 * DB(TEXT) 타임스탬프 문자열 → epoch ms. **공백형은 UTC 로 고정 해석한다.**
 *
 * 왜 이 함수가 생겼는가 — D1 의 `DEFAULT CURRENT_TIMESTAMP` 는
 * `'YYYY-MM-DD HH:MM:SS'`(UTC)를 넣는데, 저장소 안에 같은 문자열을
 * ① `+00:00`(알림 유틸) ② `+09:00`(OP체크) ③ 접미사 없이 디바이스 로컬 TZ
 * 세 가지로 읽는 파서가 따로 있었다. 그래서 같은 행이 화면마다 최대 18시간까지
 * 어긋났다(8차 감사 D10-009). 해석 규약을 여기 한 곳으로 모은다.
 *
 * - 숫자 / 10·13자리 숫자문자열 → epoch(초·밀리초)
 * - `Z` 또는 `±HH:MM` 접미사 → 그대로 신뢰
 * - 공백형(`YYYY-MM-DD HH:MM:SS`) → **UTC**
 * - 그 밖(날짜만 등) → 런타임 기본 파싱
 */
export function parseDbTimestampMs(value: unknown): number {
  if (typeof value === 'number') return value;
  const raw = String(value ?? '').trim();
  if (!raw) return NaN;
  if (/^\d{10}$/.test(raw)) return Number(raw) * 1000;
  if (/^\d{13}$/.test(raw)) return Number(raw);
  if (/[zZ]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw)) return new Date(raw).getTime();
  // 공백형 = UTC. 'T' 로 바꾸고 +00:00 을 명시해야 로컬 TZ 로 새지 않는다.
  if (/\d{2}:\d{2}/.test(raw)) return new Date(`${raw.replace(' ', 'T')}+00:00`).getTime();
  return new Date(raw).getTime();
}

/** `parseDbTimestampMs` 의 Date 판. 파싱 불가면 Invalid Date 를 그대로 돌려준다. */
export function parseDbTimestamp(value: unknown): Date {
  return new Date(parseDbTimestampMs(value));
}

/**
 * 저장된 타임스탬프 → **KST 기준 `HH:mm`**. 프로그램 전체 시각 표시의 정본.
 *
 * 화면마다 제각각이었다. `getHours()`(브라우저 TZ), `slice(11,16)`(UTC 그대로),
 * `toLocaleTimeString()`(timeZone 누락) 세 가지가 섞여 있었는데 셋 다 KST 를
 * 보장하지 못한다 — 특히 slice 는 항상 9시간 이르게, getHours 와 timeZone 없는
 * toLocaleTimeString 은 서버 렌더(Workers=UTC)에서 9시간 이르게 나온다.
 * 출근 05:09 가 20:09 로 보이던 것이 이것이다.
 *
 * 이미 `HH:mm` 만 들어온 값은 KST 로 간주해 그대로 돌려준다(근무 시프트의
 * start_time 처럼 시각만 저장하는 컬럼이 있다).
 */
export function formatKoreanClock(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) {
    const [hour, minute] = raw.split(':');
    return `${hour.padStart(2, '0')}:${minute}`;
  }

  const parsed = parseDbTimestamp(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23' }).format(parsed);
}

/** 저장된 타임스탬프 → KST `YYYY-MM-DD HH:mm`. 날짜까지 같이 보여야 할 때. */
export function formatKoreanDateTime(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = parseDbTimestamp(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23' }).format(parsed);
  return parts.replace(',', '');
}

/**
 * 날짜 문자열 → 한국 날짜 형식 (예: 2024. 1. 5.).
 *
 * **날짜 전용 입력만 받는다** (`YYYY-MM-DD`). 타임스탬프를 넣지 말 것 —
 * 시각이 붙은 값의 '날짜' 는 어느 시간대에서 보느냐에 따라 달라지므로
 * 그 판단은 호출부가 `parseDbTimestamp` 로 명시해야 한다.
 *
 * 왜 `timeZone` 이 붙었는가 — 예전에는 timeZone 을 지정하지 않아
 * `new Date('2026-05-02')`(=UTC 자정)를 렌더 환경의 로컬 TZ 로 포맷했다.
 * KST·UTC 에서는 우연히 맞았지만 음수 오프셋 디바이스에서는 하루 전으로 밀렸고,
 * 같은 함수의 사본 3곳은 이미 `Asia/Seoul` 을 박아 두어 정본만 달랐다(8차 D12-012).
 */
export function formatDateLabel(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
}

/** "YYYY-MM" 형식 → "YYYY년 M월" */
export function formatMonthLabel(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const [year, month] = raw.split('-');
  if (!year || !month) return raw;
  const numericMonth = Number(month);
  if (!Number.isFinite(numericMonth)) return raw;
  return `${year}년 ${numericMonth}월`;
}

/** 시작일~종료일을 "YYYY. M. D. ~ YYYY. M. D." 형식으로 반환. 같으면 단일 날짜. */
export function buildDateRangeLabel(startValue: unknown, endValue: unknown): string {
  const startLabel = formatDateLabel(startValue);
  const endLabel = formatDateLabel(endValue);
  if (startLabel && endLabel) {
    return startLabel === endLabel ? startLabel : `${startLabel} ~ ${endLabel}`;
  }
  return startLabel || endLabel;
}

/** string이면 그대로, null/undefined면 빈 문자열 반환 (DB 날짜 필드 정규화용). */
export function normalizeDateString(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

/** 숫자를 "N원" 형식으로 변환 (예: 3000000 → "3,000,000원") */
export function formatWon(value: number): string {
  return `${value.toLocaleString()}원`;
}
