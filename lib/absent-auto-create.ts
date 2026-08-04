/**
 * absent-auto-create.ts
 *
 * 매일 자정 이후(새벽) 전날 근태 기록이 없는 재직 직원에 대해
 * attendance / attendances 양 테이블에 '결근(absent)' 행을 자동 생성한다.
 *
 * 또한 출근 체크인만 하고 퇴근 체크아웃을 하지 않은 직원도 자동으로 처리한다:
 *   - 출근 후 4시간 이상 근무한 경우 → '조퇴(early_leave)' 처리
 *   - 출근 후 4시간 미만 근무한 경우 → '결근(absent)' 처리
 *
 * - attendance (단수): date, check_in/out, status
 * - attendances (복수): work_date, check_in_time/out, status
 *
 * 크론 호출: /api/cron/absent-auto-create (KST 00:30 매일)
 */

import { getD1Binding } from '@/lib/db';
import { logger } from '@/lib/logger';
import { syncAttendanceToAttendances, LEGACY_STATUS_TO_MODERN } from '@/lib/attendance-sync';
import { getKoreanTodayString, formatKoreanDateKey } from '@/lib/seoul-time';

/** 전날 날짜(YYYY-MM-DD)를 KST 기준으로 반환 */
function getYesterdayKST(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  return formatKoreanDateKey(d);
}

interface StaffMember {
  id: string;
  name?: string;
  status?: string;
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
    `SELECT sm.id, sm.name, sm.status
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
       )`,
    [yesterday, yesterday, yesterday],
  );
  return rows as unknown as StaffMember[];
}

/**
 * 전날 출근 체크인은 했지만 퇴근 체크아웃을 하지 않은 attendance 행 목록을 조회.
 * (check_in IS NOT NULL AND check_out IS NULL)
 */
async function fetchUncheckedOutAttendanceRows(yesterday: string): Promise<Record<string, unknown>[]> {
  const rows = await queryD1(
    `SELECT a.staff_id, a.date, a.check_in, a.status
     FROM attendance a
     INNER JOIN staff_members sm ON sm.id = a.staff_id AND sm.status NOT IN ('퇴사', '퇴직')
     WHERE a.date = ?
       AND a.check_in IS NOT NULL
       AND a.check_out IS NULL`,
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

/**
 * check_in, check_out, status를 받아 근무 시간 기준으로 최종 상태를 판정한다.
 *
 * 규칙:
 *  - 근무 시간이 4시간(240분) 미만 → '결근(absent)' (반차 미만 수준)
 *  - 근무 시간이 4시간 이상 → '조퇴(early_leave)'
 */
function decideUncheckedOutStatus(
  checkIn: string | null | undefined,
): { legacyStatus: string; modernStatus: string; workMinutes: number } {
  if (!checkIn) {
    return { legacyStatus: '결근', modernStatus: 'absent', workMinutes: 0 };
  }

  // 체크인 시각부터 자정까지의 근무 시간 계산
  const checkInDate = new Date(checkIn);
  if (Number.isNaN(checkInDate.getTime())) {
    return { legacyStatus: '결근', modernStatus: 'absent', workMinutes: 0 };
  }

  // 종료 시간을 해당 일자의 근무유형 기준으로 계산할 수 없으므로,
  // 보수적으로 체크인 시각부터 18:00까지를 근무 시간으로 산정
  const workDayEnd = new Date(checkInDate);
  workDayEnd.setHours(18, 0, 0, 0);
  if (workDayEnd.getTime() <= checkInDate.getTime()) {
    workDayEnd.setDate(workDayEnd.getDate() + 1);
  }

  const workMinutes = Math.max(0, Math.round((workDayEnd.getTime() - checkInDate.getTime()) / 60000));

  // 4시간(240분) 기준 판정
  if (workMinutes >= 240) {
    return { legacyStatus: '조퇴', modernStatus: 'early_leave', workMinutes };
  }
  return { legacyStatus: '결근', modernStatus: 'absent', workMinutes };
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

export interface AbsentAutoCreateResult {
  ok: boolean;
  yesterday: string;
  /** attendance 행이 아예 없는 직원 수 */
  absentTotal: number;
  /** 결근 처리된 직원 수 */
  absentCreated: number;
  /** 결근 처리 건너뜀 */
  absentSkipped: number;
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

/**
 * 전날 근태 기록이 없는 재직 직원 전체에 대해 결근 행을 자동 생성하고,
 * 퇴근 미체크 직원도 자동 처리한다.
 *
 * @param now 기준 시각 (테스트용, 기본값 현재)
 * @returns 처리 결과 요약
 */
export async function runAbsentAutoCreate(
  now: Date = new Date(),
): Promise<AbsentAutoCreateResult> {
  const yesterday = getYesterdayKST(now);
  const today = getKoreanTodayString(now);

  logger.info(`[absent-auto-create] 시작: ${yesterday} 기준 (실행일: ${today})`);

  let errors = 0;

  // ── 1단계: attendance 행이 아예 없는 직원 → 결근 처리 ──
  let absentTotal = 0;
  let absentCreated = 0;
  let absentSkipped = 0;

  try {
    const staffsWithoutAttendance = await fetchStaffsWithoutYesterdayAttendance(yesterday);
    absentTotal = staffsWithoutAttendance.length;
    logger.info(`[absent-auto-create] 출근 기록 없는 직원: ${absentTotal}명`);

    for (const staff of staffsWithoutAttendance) {
      if (!staff.id) {
        absentSkipped++;
        continue;
      }
      try {
        await insertAbsentAttendance(staff.id, yesterday);
        await insertAbsentAttendances(staff.id, yesterday);
        absentCreated++;
      } catch (err) {
        errors++;
        logger.warn(
          `[absent-auto-create] ${staff.id} (${staff.name || '이름없음'}) 결근 생성 실패:`,
          err,
        );
      }
    }
  } catch (err) {
    errors++;
    logger.error('[absent-auto-create] 재직 직원 조회 실패:', err);
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
        const { legacyStatus, modernStatus, workMinutes } = decideUncheckedOutStatus(checkIn);
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
    `결근 자동 생성: 전체 ${absentTotal}명 중 ${absentCreated}명 생성, ${absentSkipped}명 건너뜀`,
    `퇴근 미체크 처리: 전체 ${uncheckedTotal}명 중 ${uncheckedProcessed}명 처리 (조퇴 ${uncheckedEarlyLeave} / 결근 ${uncheckedAbsent})`,
    errors > 0 ? `오류: ${errors}건` : null,
  ]
    .filter(Boolean)
    .join(' | ');

  const result: AbsentAutoCreateResult = {
    ok: errors === 0,
    yesterday,
    absentTotal,
    absentCreated,
    absentSkipped,
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