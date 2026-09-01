/**
 * absent-auto-create.ts
 *
 * 매일 자정(KST 00:00) 크론으로 전날 근태를 마감한다.
 *
 * ── 1단계: 결근 자동 생성 ──
 * **근무표(shift_assignments)에 실근무가 배정됐는데 근태 기록이 없는 직원**만 결근이다.
 *
 * 예전에는 판정이 반대였다 — "근태 기록이 없으면 결근"이라, 배정표가 없는 직원은
 * 평일이라는 이유만으로 결근이 됐다. 그래서 출퇴근 체크 기능을 쓴 적이 없는 급여직원
 * (병원장·원장 등)에게 매 평일 유령 결근이 찍혔고, 그 결근 하나하나가
 * absent_use_daily_rate=1 로 일급 전액 공제 + 월 만근 연차 박탈로 이어졌다(10차 LV-01).
 *
 * 결근이 아닌 것:
 *   - 그날 배정 행이 아예 없음 (= 오프)
 *   - 배정 셀을 비운 행 (shift_id·shift_name 둘 다 NULL — 근무표 UI 가 배정을 지우면
 *     행을 지우지 않고 shift_id 를 NULL 로 덮어쓴다. RosterWorkspace.tsx:254 참조)
 *   - 휴무·휴가·외근·재택 성격의 배정
 *   - 비교대(상근) 배정이 주말·공휴일·회사지정휴일에 남아 있는 경우 (10차 LV-04)
 *
 * ── 2단계: 출근 체크인만 하고 퇴근 체크아웃을 하지 않은 행 마감 ──
 * 근무시간 추정의 종료 경계를 **근무표의 퇴근 예정시각(work_shifts.end_time)** 으로 잡는다.
 * 고정 18:00 KST 경계는 오후 출근자를 4시간 미만으로 떨어뜨려 '결근'(일급 전액 공제)으로
 * 만들고, 18시 이후 출근자는 480분 폴백으로 '조퇴'(시급 1/6)가 되는 역전을 낳았다(10차 DLT-01).
 *
 * - attendance (단수): date, check_in/out, status
 * - attendances (복수): work_date, check_in_time/out, status
 *
 * 크론 호출: /api/cron/absent-auto-create
 * (server.mjs '0 0 * * *' = KST 00:00 매일)
 */

import { getD1Binding } from '@/lib/db';
import { logger } from '@/lib/logger';
import { syncAttendanceToAttendances, LEGACY_STATUS_TO_MODERN } from '@/lib/attendance-sync';
import { getKoreanTodayString, formatKoreanDateKey } from '@/lib/seoul-time';
import { isKoreanPublicHoliday } from '@/lib/korean-public-holidays';

import { isGroupAccount } from '@/types';

/** YYYY-MM-DD 에 일수를 더한 날짜 키 (UTC 산술 — 런타임 로컬 TZ 를 타지 않는다) */
function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/**
 * 전날 날짜(YYYY-MM-DD)를 KST 기준으로 반환.
 *
 * setDate/getDate 는 런타임 로컬 TZ 를 쓴다. Workers 는 UTC 라 KST 자정 전후에
 * 하루가 어긋날 수 있어, KST 날짜 키를 먼저 만든 뒤 키 위에서 -1 한다.
 */
function getYesterdayKST(now: Date = new Date()): string {
  return shiftDateKey(formatKoreanDateKey(now), -1);
}

/**
 * 결근 판정에서 제외할 배정(오프·휴가·예외 근무형태).
 *
 * **운영 D1 실측값으로 만들었다.** 코드가 가정하던 값과 실제 값이 달랐다.
 *  - work_shifts.shift_type 실측: 상근 / 비상근 / 2교대 / 3교대 / 나이트전담 / 야간전담 /
 *    데이전담 / 데이이브전담 / 1일근무1일휴무 / 2일근무 1일휴무 / 휴무
 *  - work_shifts.name 에 `1on1off`(08:00~20:00, 실근무 교대)가 있다. 예전 정규식
 *    `/off|휴무|.../i` 는 이 이름을 '오프'로 오분류해 1on1off 배정자를 결근 판정에서
 *    통째로 빼고 있었다. 그래서 `off`·`오프` 는 **단독 토큰일 때만** 오프로 본다.
 *  - `1일근무1일휴무`·`2일근무 1일휴무` 는 '휴무' 를 포함하지만 실근무 유형이다.
 *    그래서 shift_type 은 부분일치가 아니라 **정확일치** 로만 본다.
 *  - 외근·재택·교육·출장·파견은 현재 운영 work_shifts 에 **존재하지 않는다**(실측).
 *    출퇴근 체크로 관리되는 근무형태가 아니므로 생길 때를 대비해 미리 제외해 둔다.
 */
const OFF_LIKE_SHIFT_TYPES = new Set(['휴무', '휴일', '오프', '연차', 'off']);
const OFF_LIKE_SHIFT_NAME =
  /휴무|휴일|연차|반차|휴가|외근|재택|교육|출장|파견|^\s*(off|오프)\s*$/i;

/** 근무유형 이름/유형이 '그날 출근하지 않는 배정'인가 */
function isOffLikeShift(shiftName: string, shiftType: string): boolean {
  if (OFF_LIKE_SHIFT_TYPES.has(shiftType.trim().toLowerCase())) return true;
  if (OFF_LIKE_SHIFT_TYPES.has(shiftType.trim())) return true;
  return OFF_LIKE_SHIFT_NAME.test(shiftName);
}

/**
 * 'HH:mm' / 'HH:mm:ss' 를 그 날짜의 KST 순간으로 만든다.
 * Workers 는 UTC 라 Date 생성에 로컬 시각 API 를 쓰면 9시간 어긋난다 — 오프셋을 명시한다.
 */
function toKstInstant(dateKey: string, clock: string): Date | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(clock || '').trim());
  if (!m) return null;
  const hh = String(Number(m[1])).padStart(2, '0');
  const at = new Date(`${dateKey}T${hh}:${m[2]}:${m[3] ?? '00'}+09:00`);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * DB 타임스탬프를 Date 로 파싱한다.
 *
 * 운영 attendance.check_in 은 전부 T형이고 오프셋(`Z` 또는 `+00:00`)을 달고 있다(실측 3,133건).
 * 다만 오프셋 없는 값이 섞여 들어오면 ES 규격상 **로컬 시각**으로 해석되므로,
 * lib/date-formatter 의 parseDbTimestamp 규약과 같게 UTC 로 고정한다.
 */
function parseDbInstant(value: string): Date | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw);
  const normalized = hasZone ? raw : `${raw.replace(' ', 'T')}Z`;
  const at = new Date(normalized);
  return Number.isNaN(at.getTime()) ? null : at;
}

interface StaffMember {
  id: string;
  name?: string;
  status?: string;
  permissions?: string | null;
  [key: string]: unknown;
}

/**
 * D1 바인딩을 직접 쓴다.
 *
 * 예전에는 `fetch('/api/d1/query')` 를 호출했는데, 이 모듈은 크론(Workers 런타임)에서
 * 실행되므로 두 가지 이유로 반드시 실패했다.
 *   1) 상대 경로 fetch — 서버에는 기준 origin 이 없어 요청 자체가 만들어지지 않는다.
 *   2) /api/d1/query 는 raw SQL 페이로드를 받지 않는다 (테이블·조건 기반 API).
 * 즉 이 크론은 트리거가 걸려 있었더라도 첫 조회에서 죽었다.
 */
async function queryD1(sql: string, params: unknown[] = []): Promise<Record<string, unknown>[]> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[absent-auto-create] D1 binding not available');
  try {
    const stmt = d1.prepare(sql);
    const bound = params.length ? stmt.bind(...params) : stmt;
    const res = await bound.all<Record<string, unknown>>();
    return res.results ?? [];
  } catch (err) {
    logger.error('[absent-auto-create] D1 query failed:', err);
    throw err;
  }
}

/** 쓰기 문장 실행 (INSERT/UPDATE). 결과 메타는 쓰지 않는다. */
async function execD1(sql: string, params: unknown[] = []): Promise<void> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[absent-auto-create] D1 binding not available');
  const stmt = d1.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  await bound.run();
}

/**
 * 전날 근태 기록(attendance)이 아예 없는 재직 직원 목록을 조회.
 *
 * 제외 대상:
 *  - status='퇴사' 또는 '퇴직' (퇴직자)
 *  - attendance 테이블에 전날 date가 이미 있는 직원
 */
async function fetchStaffsWithoutYesterdayAttendance(yesterday: string): Promise<StaffMember[]> {
  const rows = await queryD1(
    `SELECT sm.id, sm.name, sm.status, sm.permissions
     FROM staff_members sm
     WHERE sm.status NOT IN ('퇴사', '퇴직')
       AND sm.id NOT IN (
         SELECT DISTINCT a.staff_id
         FROM attendance a
         WHERE a.date = ?
       )
       AND sm.id NOT IN (
         SELECT DISTINCT lr.staff_id
         FROM leave_requests lr
         WHERE (lr.status = '승인' OR lr.status = 'approved')
           AND lr.start_date <= ?
           AND lr.end_date >= ?
       )
       AND sm.id NOT IN (
         SELECT DISTINCT app.sender_id
         FROM approvals app
         WHERE (app.status = '승인' OR app.status = 'approved')
           AND (
             app.type IN ('외근신청서', '출장신청서', '재택근무신청서', '교육신청서', '외부교육신청서')
             OR app.title LIKE '%외근%'
             OR app.title LIKE '%출장%'
             OR app.title LIKE '%재택%'
           )
           AND substr(app.created_at, 1, 10) <= ?
           AND substr(COALESCE(app.updated_at, app.created_at), 1, 10) >= ?
       )`,
    [yesterday, yesterday, yesterday, yesterday, yesterday],
  );
  return rows as unknown as StaffMember[];
}

/** 전날 근무표에 배정된 실근무 시프트 1건 */
export interface ScheduledShift {
  /** 배정 행의 회사(직원 소속). 회사 지정 휴일 판정에 쓴다. */
  companyName: string;
  shiftName: string;
  shiftType: string;
  /** 근무표의 출근/퇴근 예정시각 'HH:mm[:ss]'. 레거시 배정(shift_name 만 있는 행)은 빈 문자열 */
  startTime: string;
  endTime: string;
  /** work_shifts.is_shift — 교대·주말근무 유형인가 */
  isShiftWork: boolean;
}

export interface ScheduleContext {
  yesterday: string;
  /** 전날 실근무가 배정된 직원 → 그 배정 (오프·휴무·빈 배정은 애초에 안 들어온다) */
  scheduledYesterday: Map<string, ScheduledShift>;
  /** 전날이 토·일인가 */
  yesterdayIsWeekend: boolean;
  /** 전날이 법정공휴일인가 */
  yesterdayIsPublicHoliday: boolean;
  /** 전날을 휴일로 지정한 회사 이름 집합. '전체' 가 들어 있으면 전 회사 휴일이다. */
  holidayCompanies: Set<string>;
}

/**
 * 전날이 **누구의 소정근로일이었는지** 판정하기 위한 자료를 모은다.
 *
 * 조회 범위는 전날 하루다. 예전에는 ±30일 창을 읽어 "창 안에 배정이 하나라도 있으면
 * 교대 근무자"라는 간접 판정을 했는데, 창 밖의 직원이 폴백으로 떨어져 평일마다
 * 결근이 됐다(10차 LV-01). 지금은 그날 배정 자체가 유일한 판정 근거다.
 */
async function loadScheduleContext(yesterday: string): Promise<ScheduleContext> {
  const rows = await queryD1(
    `SELECT sa.staff_id,
            sa.company_name,
            sa.shift_id,
            sa.shift_name AS assigned_shift_name,
            ws.name       AS shift_name,
            ws.shift_type AS shift_type,
            ws.start_time AS start_time,
            ws.end_time   AS end_time,
            ws.is_shift   AS is_shift
       FROM shift_assignments sa
       LEFT JOIN work_shifts ws ON ws.id = sa.shift_id
      WHERE sa.work_date = ?`,
    [yesterday],
  );

  const scheduledYesterday = new Map<string, ScheduledShift>();

  for (const row of rows) {
    const staffId = String(row.staff_id || '').trim();
    if (!staffId) continue;

    const shiftName = String(row.shift_name || row.assigned_shift_name || '').trim();
    // 배정 셀을 비운 행 — 근무표 UI 는 배정을 지울 때 행을 삭제하지 않고 shift_id 를
    // NULL 로 덮어쓴다(RosterWorkspace.tsx:254 upsert). 이 행을 '배정'으로 세면
    // 배정을 지운 날이 결근이 된다(10차 LV-01, 지민수 4건의 실제 경로).
    if (!shiftName) continue;

    const shiftType = String(row.shift_type || '').trim();
    if (isOffLikeShift(shiftName, shiftType)) continue;

    scheduledYesterday.set(staffId, {
      companyName: String(row.company_name || '').trim(),
      shiftName,
      shiftType,
      startTime: String(row.start_time || '').trim(),
      endTime: String(row.end_time || '').trim(),
      isShiftWork: Number(row.is_shift ?? 0) === 1,
    });
  }

  // 회사 지정 휴일(company_holidays). company_name='전체' 행과 회사별 행이 섞여 있다.
  // 급여·휴일 계열 크론(lib/substitute-holiday.ts:77-87)과 같은 자료를 본다.
  const holidayCompanies = new Set<string>();
  try {
    const holidayRows = await queryD1(
      `SELECT company_name FROM company_holidays WHERE holiday_date = ?`,
      [yesterday],
    );
    for (const row of holidayRows) {
      holidayCompanies.add(String(row.company_name || '전체').trim());
    }
  } catch (err) {
    // 휴일 조회 실패는 결근 생성을 막을 이유가 아니다 — 배정 기반 판정이 이미 좁다.
    logger.warn('[absent-auto-create] company_holidays 조회 실패 — 회사 휴일 제외 없이 진행:', err);
  }

  const [year, month, day] = yesterday.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();

  return {
    yesterday,
    scheduledYesterday,
    yesterdayIsWeekend: weekday === 0 || weekday === 6,
    yesterdayIsPublicHoliday: isKoreanPublicHoliday(yesterday),
    holidayCompanies,
  };
}

/** 전날이 이 배정의 회사에서 지정 휴일이었는가 */
function isCompanyHoliday(companyName: string, ctx: ScheduleContext): boolean {
  if (ctx.holidayCompanies.has('전체')) return true;
  return companyName ? ctx.holidayCompanies.has(companyName) : false;
}

/**
 * 외래 근무(평일 클리닉)인가.
 * work_shifts.is_shift 가 1이어도 이름은 외래A/외래B/외래B(토) 다.
 * 공휴일에 월~금 템플릿이 남아 있으면 결근이 찍히고 월차 만근이 깨진다.
 */
export function isOutpatientClinicShift(shift: Pick<ScheduledShift, 'shiftName' | 'shiftType'>): boolean {
  return /외래/.test(shift.shiftName) || /외래/.test(shift.shiftType);
}

/**
 * 전날이 이 직원의 소정근로일이었는가 (판정 규칙 단위 테스트 대상)
 *
 * 배정이 유일한 근거다. 배정이 없으면 결근이 아니다.
 *
 * 주말: 교대(is_shift=1)는 근무일, 상근은 아님. 토요 외래는 실제 진료라 유지.
 * 법정·회사 공휴일: 병동 교대만 근무일. 외래·상근 템플릿이 휴일에 남은 것은
 * 소정근로가 아니다 — 광복절 대체에 외래B 가 남아 결근이 찍히면 월차가 나가지 않는다.
 */
export function wasScheduledToWork(staffId: string, ctx: ScheduleContext): boolean {
  const shift = ctx.scheduledYesterday.get(staffId);
  if (!shift) return false;

  const closedDay =
    ctx.yesterdayIsPublicHoliday || isCompanyHoliday(shift.companyName, ctx);
  if (closedDay) {
    if (isOutpatientClinicShift(shift)) return false;
    if (!shift.isShiftWork) return false;
    return true;
  }

  if (shift.isShiftWork) return true;
  if (ctx.yesterdayIsWeekend) return false;
  return true;
}

/**
 * 전날 출근 체크인은 했지만 퇴근 체크아웃을 하지 않은 attendance 행 목록을 조회.
 * (check_in IS NOT NULL AND check_out IS NULL)
 *
 * 휴가 계열 상태는 제외한다. 반차를 쓰고 반나절 근무한 뒤 퇴근 체크를 잊으면
 * 이 루프가 '조퇴'로 덮어써 반차 기록이 사라진다(운영 실측: 반차휴가 2건이 대상에 들어 있다).
 */
async function fetchUncheckedOutAttendanceRows(yesterday: string): Promise<Record<string, unknown>[]> {
  const rows = await queryD1(
    `SELECT a.staff_id, a.date, a.check_in, a.status
     FROM attendance a
     INNER JOIN staff_members sm ON sm.id = a.staff_id AND sm.status NOT IN ('퇴사', '퇴직')
     WHERE a.date = ?
       AND a.check_in IS NOT NULL
       AND a.check_out IS NULL
       AND COALESCE(a.status, '') NOT IN ('연차휴가', '반차휴가', '휴가')`,
    [yesterday],
  );
  return rows;
}

/**
 * attendance (단수) 테이블에 결근 행 생성.
 * ON CONFLICT(staff_id, date) DO NOTHING — 이미 존재하면 무시.
 */
async function insertAbsentAttendance(staffId: string, date: string): Promise<void> {
  await execD1(
    `INSERT INTO attendance (id, staff_id, date, check_in, check_out, status)
     VALUES (?, ?, ?, NULL, NULL, '결근')
     ON CONFLICT(staff_id, date) DO NOTHING`,
    [crypto.randomUUID(), staffId, date],
  );
}

/**
 * attendances (복수) 테이블에 absent 행 생성.
 */
async function insertAbsentAttendances(staffId: string, workDate: string): Promise<void> {
  await execD1(
    `INSERT INTO attendances (id, staff_id, work_date, check_in_time, check_out_time, status, work_hours_minutes)
     VALUES (?, ?, ?, NULL, NULL, 'absent', 0)
     ON CONFLICT(staff_id, work_date) DO NOTHING`,
    [crypto.randomUUID(), staffId, workDate],
  );
}

/** 근무표를 모를 때 쓰는 소정근로 추정치 */
const NOMINAL_SHIFT_MINUTES = 8 * 60;
/** 어떤 경우에도 넘지 못하는 상한. 하루 근무로 설명되지 않는 추정치는 추정이 아니라 오류다. */
const MAX_ESTIMATED_MINUTES = 12 * 60;

/**
 * 근무표의 퇴근 예정시각까지의 분을 구한다. 판정 불가면 null.
 *
 * `end_time <= start_time` 이면 야간 교대(예: 병동3교대/N 22:00~07:00)라 다음날로 넘긴다.
 * 실측 근무유형에 22:00~07:00 / 21:00~08:00 / 23:00~07:00 이 실재한다.
 */
function estimateMinutesFromRoster(
  workDate: string,
  checkInDate: Date,
  shift: ScheduledShift | undefined,
): number | null {
  if (!shift?.endTime) return null;

  const start = toKstInstant(workDate, shift.startTime);
  let end = toKstInstant(workDate, shift.endTime);
  if (!end) return null;
  if (start && end.getTime() <= start.getTime()) {
    end = toKstInstant(shiftDateKey(workDate, 1), shift.endTime);
    if (!end) return null;
  }

  // 출근 예정시각보다 일찍 찍은 체크인은 예정시각부터 센다.
  // 조기 체크인을 그대로 근무시간으로 잡으면 급여 화면의 미지급 연장수당 판정
  // (workMins > 480)에 유령 연장근로가 잡힌다 — 추정은 과다보다 과소가 안전하다.
  const effectiveStart =
    start && start.getTime() > checkInDate.getTime() ? start : checkInDate;

  if (end.getTime() > effectiveStart.getTime()) {
    return Math.round((end.getTime() - effectiveStart.getTime()) / 60000);
  }

  // 퇴근 예정시각을 이미 지나서 찍힌 체크인.
  // 남은 시간이 아니라 **그 근무유형의 소정근로 길이**로 대체한다.
  if (start) {
    return Math.round((end.getTime() - start.getTime()) / 60000);
  }
  return NOMINAL_SHIFT_MINUTES;
}

/**
 * 퇴근 체크를 잊은 행의 최종 상태와 추정 근무시간을 판정한다.
 *
 * ── 종료 경계 (10차 DLT-01) ──
 * 고정 18:00 KST 경계를 쓰면 KST 14:00 초과~18:00 출근자는 240분 미만이 돼 '결근'
 * (일급 전액 공제)이 되고, 18:00 이후 출근자는 480분 폴백을 받아 '조퇴'(시급 1/6)가 된다.
 * 늦게 온 쪽이 유리한 역전이다. 그래서 경계를 **근무표의 퇴근 예정시각**으로 바꾼다.
 *
 * ── 체크인이 있으면 '결근'으로 내리지 않는다 ──
 * 체크인이 있다는 것은 출근한 사람이라는 뜻이다. 추정 근무시간이 짧다는 이유로
 * 일급 전액 공제(absent_use_daily_rate=1)가 되는 '결근'으로 바꾸면 **추정 오차를 그대로
 * 급여 손실로 바꾸는 것**이다. 이 경로에는 소정근로일 게이트도 없어 오프·휴일에도 돈다.
 * 배포되어 있던 판정(9차 이전 UTC setHours 버그)도 사실상 전부 '조퇴'였으므로,
 * 이 규칙은 운영에서 돌던 결과와 같고 db16022a 가 새로 만든 결근 절벽만 없앤다.
 * 실제 결근은 1단계(근무표 배정 + 근태 기록 없음)가 판정한다.
 *
 * @returns 판정 불가(체크인 파싱 실패)면 null — 이 경우 그 행은 건드리지 않는다.
 */
function decideUncheckedOutStatus(
  workDate: string,
  checkIn: string | null | undefined,
  shift: ScheduledShift | undefined,
): { legacyStatus: string; modernStatus: string; workMinutes: number } | null {
  if (!checkIn) {
    return { legacyStatus: '결근', modernStatus: 'absent', workMinutes: 0 };
  }

  const checkInDate = parseDbInstant(checkIn);
  if (!checkInDate) return null;

  const rosterMinutes = estimateMinutesFromRoster(workDate, checkInDate, shift);
  const rawMinutes = rosterMinutes ?? NOMINAL_SHIFT_MINUTES;
  const workMinutes = Math.max(0, Math.min(rawMinutes, MAX_ESTIMATED_MINUTES));

  return { legacyStatus: '조퇴', modernStatus: 'early_leave', workMinutes };
}

/**
 * 퇴근 미체크 직원의 attendance 행을 업데이트하고 attendances를 동기화한다.
 */
async function updateUncheckedOutRow(
  staffId: string,
  date: string,
  checkIn: string | null,
  legacyStatus: string,
  modernStatus: string,
  workMinutes: number,
): Promise<void> {
  // attendance(단수) 업데이트 — 퇴근 기록 없음(NULL)은 그대로 두고 상태만 확정한다.
  await execD1(
    `UPDATE attendance SET check_out = NULL, status = ? WHERE staff_id = ? AND date = ?`,
    [legacyStatus, staffId, date],
  );

  // attendances(복수) upsert — 이미 행이 있으면 상태·근무시간을 갱신한다.
  await execD1(
    `INSERT INTO attendances (id, staff_id, work_date, check_in_time, check_out_time, status, work_hours_minutes)
     VALUES (?, ?, ?, ?, NULL, ?, ?)
     ON CONFLICT(staff_id, work_date) DO UPDATE SET
       check_in_time = excluded.check_in_time,
       check_out_time = NULL,
       status = excluded.status,
       work_hours_minutes = excluded.work_hours_minutes`,
    [crypto.randomUUID(), staffId, date, checkIn, modernStatus, workMinutes],
  );
}

/** dry-run 대조용 대상자 1건 */
export interface AbsentCandidate {
  staffId: string;
  name: string;
  /** 결근 대상이면 배정된 근무유형, 제외 대상이면 제외 사유 */
  reason: string;
}

export interface AbsentAutoCreateResult {
  ok: boolean;
  yesterday: string;
  /** 쓰기 없이 판정만 했는가 */
  dryRun: boolean;
  /** attendance 행이 아예 없는 직원 수 */
  absentTotal: number;
  /** 결근 처리된 직원 수 (dry-run 이면 처리됐을 직원 수) */
  absentCreated: number;
  /** 결근 처리 건너뜀 */
  absentSkipped: number;
  /** 전날이 소정근로일이 아니어서 건너뜀 (배정 없음·오프·휴일) */
  absentSkippedNotScheduled: number;
  /** 결근 대상 명단 — 수정 전후 대조용 */
  absentTargets: AbsentCandidate[];
  /** 소정근로일이 아니어서 빠진 명단 — 수정 전후 대조용 */
  notScheduled: AbsentCandidate[];
  /** 퇴근 미체크 직원 수 */
  uncheckedTotal: number;
  /** 퇴근 미체크 처리된 직원 수 (조퇴/결근) */
  uncheckedProcessed: number;
  /** 퇴근 미체크 중 조퇴 처리 */
  uncheckedEarlyLeave: number;
  /** 퇴근 미체크 중 결근 처리 */
  uncheckedAbsent: number;
  /** 전체 에러 수 */
  errors: number;
  details?: string;
}

export interface AbsentAutoCreateOptions {
  /**
   * 쓰기 없이 판정만 한다. 대상자 명단(absentTargets·notScheduled)이 그대로 나오므로
   * 판정 규칙을 바꾼 뒤 변경 전후를 대조할 수 있다.
   */
  dryRun?: boolean;
}

/**
 * 전날 근무표에 배정됐는데 근태 기록이 없는 직원에게 결근 행을 생성하고,
 * 퇴근 미체크 직원의 상태를 마감한다.
 *
 * @param now 기준 시각 (테스트용, 기본값 현재)
 * @param options dry-run 여부
 * @returns 처리 결과 요약 + 대상자 명단
 */
export async function runAbsentAutoCreate(
  now: Date = new Date(),
  options: AbsentAutoCreateOptions = {},
): Promise<AbsentAutoCreateResult> {
  const dryRun = options.dryRun === true;
  const yesterday = getYesterdayKST(now);
  const today = getKoreanTodayString(now);

  logger.info(
    `[absent-auto-create] 시작: ${yesterday} 기준 (실행일: ${today})${dryRun ? ' [dry-run]' : ''}`,
  );

  let errors = 0;

  // ── 1단계: 근무표에 배정됐는데 attendance 행이 없는 직원 → 결근 처리 ──
  let absentTotal = 0;
  let absentCreated = 0;
  let absentSkipped = 0;
  let absentSkippedNotScheduled = 0;
  const absentTargets: AbsentCandidate[] = [];
  const notScheduled: AbsentCandidate[] = [];
  // 2단계(퇴근 미체크)도 같은 배정 자료로 퇴근 예정시각을 잡으므로 밖에서 들고 있는다.
  let schedule: ScheduleContext | null = null;

  try {
    // 근무 일정을 먼저 읽는다. 이게 실패하면 결근 생성을 통째로 건너뛴다 —
    // 일정을 모르는 채로 만들면 배정도 없는 날에 결근을 찍고, 그건 곧 급여 공제다.
    const ctx = await loadScheduleContext(yesterday);
    schedule = ctx;

    const staffsWithoutAttendance = await fetchStaffsWithoutYesterdayAttendance(yesterday);
    absentTotal = staffsWithoutAttendance.length;
    logger.info(`[absent-auto-create] 출근 기록 없는 직원: ${absentTotal}명`);

    for (const staff of staffsWithoutAttendance) {
      if (!staff.id) {
        absentSkipped++;
        continue;
      }
      if (isGroupAccount(staff)) {
        absentSkipped++;
        continue;
      }
      const staffId = String(staff.id);
      const staffName = staff.name || '이름없음';
      if (!wasScheduledToWork(staffId, ctx)) {
        absentSkippedNotScheduled++;
        const shift = ctx.scheduledYesterday.get(staffId);
        notScheduled.push({
          staffId,
          name: staffName,
          reason: shift ? `휴일 제외(${shift.shiftName})` : '근무표 배정 없음',
        });
        continue;
      }
      const shiftName = ctx.scheduledYesterday.get(staffId)?.shiftName || '';
      absentTargets.push({ staffId, name: staffName, reason: shiftName });
      if (dryRun) {
        absentCreated++;
        continue;
      }
      try {
        await insertAbsentAttendance(staffId, yesterday);
        await insertAbsentAttendances(staffId, yesterday);
        absentCreated++;
      } catch (err) {
        errors++;
        logger.warn(`[absent-auto-create] ${staffId} (${staffName}) 결근 생성 실패:`, err);
      }
    }
  } catch (err) {
    errors++;
    logger.error('[absent-auto-create] 결근 대상 판정 실패 — 결근 생성을 건너뜁니다:', err);
  }

  // ── 2단계: 출근은 했으나 퇴근을 안 한 직원 → 상태 판정 후 업데이트 ──
  let uncheckedTotal = 0;
  let uncheckedProcessed = 0;
  let uncheckedEarlyLeave = 0;
  let uncheckedAbsent = 0;

  try {
    const uncheckedOutRows = await fetchUncheckedOutAttendanceRows(yesterday);
    uncheckedTotal = uncheckedOutRows.length;
    logger.info(`[absent-auto-create] 퇴근 미체크 직원: ${uncheckedTotal}명`);

    for (const row of uncheckedOutRows) {
      const staffId = String(row.staff_id || '');
      const checkIn = row.check_in ? String(row.check_in) : null;

      if (!staffId) {
        continue;
      }

      try {
        // 퇴근 예정시각은 그날 근무표 배정에서 가져온다(없으면 소정근로 8시간 추정).
        const decided = decideUncheckedOutStatus(
          yesterday,
          checkIn,
          schedule?.scheduledYesterday.get(staffId),
        );
        if (!decided) {
          // check_in 을 해석하지 못했다 — 추측으로 상태를 덮어쓰지 않고 그대로 둔다.
          logger.warn(`[absent-auto-create] ${staffId} check_in 파싱 실패 — 건드리지 않음: ${checkIn}`);
          continue;
        }
        const { legacyStatus, modernStatus, workMinutes } = decided;
        if (dryRun) {
          uncheckedProcessed++;
          if (modernStatus === 'early_leave') uncheckedEarlyLeave++;
          else uncheckedAbsent++;
          continue;
        }
        await updateUncheckedOutRow(staffId, yesterday, checkIn, legacyStatus, modernStatus, workMinutes);
        uncheckedProcessed++;
        if (modernStatus === 'early_leave') {
          uncheckedEarlyLeave++;
        } else {
          uncheckedAbsent++;
        }
      } catch (err) {
        errors++;
        logger.warn(
          `[absent-auto-create] ${staffId} 퇴근 미체크 처리 실패:`,
          err,
        );
      }
    }
  } catch (err) {
    errors++;
    logger.error('[absent-auto-create] 퇴근 미체크 조회 실패:', err);
  }

  const details = [
    dryRun ? '[dry-run · 쓰기 없음]' : null,
    `결근 자동 생성: 전체 ${absentTotal}명 중 ${absentCreated}명 생성, ` +
      `${absentSkippedNotScheduled}명 소정근로일 아님, ${absentSkipped}명 건너뜀`,
    absentTargets.length
      ? `결근 대상: ${absentTargets.map((t) => `${t.name}(${t.reason || '배정'})`).join(', ')}`
      : null,
    `퇴근 미체크 처리: 전체 ${uncheckedTotal}명 중 ${uncheckedProcessed}명 처리 (조퇴 ${uncheckedEarlyLeave} / 결근 ${uncheckedAbsent})`,
    errors > 0 ? `오류: ${errors}건` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const result: AbsentAutoCreateResult = {
    ok: errors === 0,
    yesterday,
    dryRun,
    absentTotal,
    absentCreated,
    absentSkipped,
    absentSkippedNotScheduled,
    absentTargets,
    notScheduled,
    uncheckedTotal,
    uncheckedProcessed,
    uncheckedEarlyLeave,
    uncheckedAbsent,
    errors,
    details,
  };

  logger.info(`[absent-auto-create] 완료: ${details}`);
  return result;
}