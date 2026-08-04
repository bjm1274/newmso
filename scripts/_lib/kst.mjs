/**
 * scripts/_lib/kst.mjs
 *
 * KST(Asia/Seoul) 날짜 헬퍼. 같은 구현이 스크립트 4곳에 복사돼 있었다.
 *
 * 서버·크론은 UTC 로 돈다. UTC 15:00 이 KST 자정이므로, UTC 기준으로 "오늘"을
 * 계산하면 하루가 밀린다. 날짜 키는 항상 Asia/Seoul 로 환산해서 만들어야 한다.
 */

/** @returns {string} KST 기준 오늘 (YYYY-MM-DD) */
export function kstToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** @returns {string} KST 기준 현재 시각 (YYYY-MM-DD HH:mm:ss) — D1 의 CURRENT_TIMESTAMP 형식과 같다 */
export function kstNowStamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value ?? '00';
  // en-CA 는 자정을 24 로 주는 환경이 있어 00 으로 정규화한다.
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`;
}

/** KST 기준으로 days 만큼 이동한 날짜 (YYYY-MM-DD) */
export function kstDateShift(days, now = new Date()) {
  const base = new Date(`${kstToday(now)}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}
