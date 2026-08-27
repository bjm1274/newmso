import { NextRequest, NextResponse } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  nurse_schedules as nurseSchedulesTable,
  staff_members as staffMembersTable,
  leave_requests as leaveRequestsTable,
  company_holidays as companyHolidaysTable,
  eq,
  or,
} from '@/lib/db';
import { verifyCalendarFeedToken } from '@/lib/calendar-feed-token';

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function formatICSDateOnly(date: Date): string {
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * 구독 캘린더에 내보낼 연차 상태.
 * 운영 실측(2026-08-27) leave_requests.status 는 승인 46 · 반려 3 · 회수 2 · 대기 1 이다.
 * 영문 표기는 과거 데이터 호환용으로만 둔다.
 */
const CALENDAR_VISIBLE_LEAVE_STATUS = new Set(['승인', '완료', 'approved', 'APPROVED']);

/**
 * 'YYYY-MM-DD' 를 UTC 자정 Date 로. 형식이 어긋나면 **null 을 돌려준다.**
 *
 * 예전에는 각 루프가 `value.split('-').map(Number)` 결과를 검증 없이
 * `new Date(Date.UTC(...))` 에 넣었다. 운영 데이터에 `holiday_date = "5/1"`
 * (근로자의날, company_name='전체') 한 행이 있었는데:
 *
 *   "5/1".split('-')  ->  ["5/1"]  ->  map(Number)  ->  [NaN]
 *   new Date(Date.UTC(NaN, NaN, undefined))  ->  Invalid Date
 *   Invalid Date.toISOString()  ->  RangeError 를 **던진다**
 *
 * 이 예외가 company_holidays 조회를 감싼 try/catch 밖에서 터져 최상위 catch 로
 * 떨어졌고, `/api/calendar/feed` 가 **구독한 전 직원에게 500** 을 냈다.
 * 캘린더 앱은 조용히 동기화를 멈추므로 "일정이 안 올라온다" 로만 보였다(9차 P-01).
 *
 * 한 행이 피드 전체를 죽이지 않도록, 잘못된 행은 그 이벤트만 건너뛴다.
 */
function parseDateKeyToUtc(value: unknown): Date | null {
  const raw = String(value ?? '').trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  // 2026-02-31 처럼 존재하지 않는 날짜는 굴러가 버리므로 되돌려 확인한다.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/**
 * GET /api/calendar/feed?token=<signed>
 * 서명 토큰 필수 (createCalendarFeedToken). 평문 staff_id 는 거부.
 * 근무표(nurse_schedules), 연차/휴가(leave_requests), 회사행사/공휴일(company_holidays) 통합 내보내기.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse('Unauthorized: Missing token', { status: 401 });
  }

  const staffId = await verifyCalendarFeedToken(token);
  if (!staffId) {
    return new NextResponse('Unauthorized: Invalid or expired token', { status: 401 });
  }

  try {
    const d1 = await getD1Binding();
    if (!d1) {
      return new NextResponse('Service unavailable', { status: 503 });
    }
    const db = getD1Drizzle(d1);

    const staffRows = await db
      .select({ name: staffMembersTable.name, company: staffMembersTable.company })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.id, staffId))
      .limit(1);

    const staffName = staffRows[0]?.name || '직원';
    const staffCompany = staffRows[0]?.company || '';

    // 1. 근무표 (nurse_schedules)
    let schedules: Array<{
      year_month: string | null;
      day: number | null;
      shift_code: string | null;
    }> = [];
    try {
      schedules = await db
        .select({
          year_month: nurseSchedulesTable.year_month,
          day: nurseSchedulesTable.day,
          shift_code: nurseSchedulesTable.shift_code,
        })
        .from(nurseSchedulesTable)
        .where(eq(nurseSchedulesTable.staff_id, staffId));
    } catch (scheduleError) {
      console.warn('[calendar/feed] nurse_schedules:', scheduleError);
    }

    // 2. 직원 승인 연차/휴가 (leave_requests)
    let leaves: Array<{
      id: string;
      leave_type: string;
      start_date: string;
      end_date: string;
      reason: string | null;
      status: string | null;
    }> = [];
    try {
      leaves = await db
        .select({
          id: leaveRequestsTable.id,
          leave_type: leaveRequestsTable.leave_type,
          start_date: leaveRequestsTable.start_date,
          end_date: leaveRequestsTable.end_date,
          reason: leaveRequestsTable.reason,
          status: leaveRequestsTable.status,
        })
        .from(leaveRequestsTable)
        .where(eq(leaveRequestsTable.staff_id, staffId));
    } catch (leaveError) {
      console.warn('[calendar/feed] leave_requests:', leaveError);
    }

    // 3. 회사 행사 및 공휴일 (company_holidays)
    let holidays: Array<{
      id: string;
      name: string;
      holiday_date: string;
      note: string | null;
      company_name: string | null;
    }> = [];
    try {
      if (staffCompany) {
        holidays = await db
          .select({
            id: companyHolidaysTable.id,
            name: companyHolidaysTable.name,
            holiday_date: companyHolidaysTable.holiday_date,
            note: companyHolidaysTable.note,
            company_name: companyHolidaysTable.company_name,
          })
          .from(companyHolidaysTable)
          .where(
            or(
              eq(companyHolidaysTable.company_name, '전체'),
              eq(companyHolidaysTable.company_name, staffCompany)
            )
          );
      } else {
        holidays = await db
          .select({
            id: companyHolidaysTable.id,
            name: companyHolidaysTable.name,
            holiday_date: companyHolidaysTable.holiday_date,
            note: companyHolidaysTable.note,
            company_name: companyHolidaysTable.company_name,
          })
          .from(companyHolidaysTable);
      }
    } catch (holidayError) {
      console.warn('[calendar/feed] company_holidays:', holidayError);
    }

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MSO ERP//Calendar Sync//KO',
      `X-WR-CALNAME:${staffName}님의 MSO 일정`,
      'X-WR-TIMEZONE:Asia/Seoul',
      'CALSCALE:GREGORIAN',
    ];

    const now = new Date();
    const dtStamp = formatICSDate(now);

    // 1) 근무표 이벤트
    for (const sched of schedules) {
      if (!sched.year_month || !sched.day || !sched.shift_code) continue;
      if (sched.shift_code === 'OFF') continue;

      const day = Number(sched.day);
      const eventDate = parseDateKeyToUtc(
        `${sched.year_month}-${String(day).padStart(2, '0')}`,
      );
      if (!eventDate) {
        console.warn('[calendar/feed] 잘못된 근무표 날짜, 건너뜀:', sched.year_month, sched.day);
        continue;
      }
      const dtStart = formatICSDateOnly(eventDate);
      const nextDate = new Date(eventDate);
      nextDate.setDate(nextDate.getDate() + 1);
      const dtEnd = formatICSDateOnly(nextDate);

      let summary = `[근무] ${sched.shift_code}`;
      if (sched.shift_code === 'D') summary = '데이 (Day) 근무';
      if (sched.shift_code === 'E') summary = '이브닝 (Evening) 근무';
      if (sched.shift_code === 'N') summary = '나이트 (Night) 근무';
      if (sched.shift_code === 'LEAVE') summary = '휴가';
      if (sched.shift_code === 'TRAINING') summary = '교육';

      icsContent.push(
        'BEGIN:VEVENT',
        `UID:shift-${sched.year_month}-${sched.day}-${staffId}@mso.erp`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;VALUE=DATE:${dtStart}`,
        `DTEND;VALUE=DATE:${dtEnd}`,
        `SUMMARY:${summary}`,
        'END:VEVENT',
      );
    }

    // 2) 연차/휴가 이벤트
    for (const lv of leaves) {
      // 승인된 연차만 내보낸다.
      //
      // 예전에는 `status === '반려'` 만 걸러서, 아직 결재가 끝나지 않은 '대기'
      // 건과 결재 회수로 무효가 된 '회수' 건까지 구독 캘린더에 나갔다(9차 R04).
      // 신청만 해 두고 승인 안 난 휴가가 남의 캘린더에 확정 일정처럼 보였다.
      if (!lv.start_date || !CALENDAR_VISIBLE_LEAVE_STATUS.has(String(lv.status ?? '').trim())) {
        continue;
      }

      const startDate = parseDateKeyToUtc(lv.start_date);
      const endDate = parseDateKeyToUtc(lv.end_date || lv.start_date);
      if (!startDate || !endDate) {
        console.warn('[calendar/feed] 잘못된 연차 날짜, 건너뜀:', lv.start_date, lv.end_date);
        continue;
      }
      endDate.setDate(endDate.getDate() + 1); // ICS 종일 일정은 다음날 자정까지

      const dtStart = formatICSDateOnly(startDate);
      const dtEnd = formatICSDateOnly(endDate);

      const summary = `[휴가] ${lv.leave_type || '연차'}`;
      const description = lv.reason ? `사유: ${lv.reason}` : '';

      icsContent.push(
        'BEGIN:VEVENT',
        `UID:leave-${lv.id}-${staffId}@mso.erp`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;VALUE=DATE:${dtStart}`,
        `DTEND;VALUE=DATE:${dtEnd}`,
        `SUMMARY:${summary}`,
        ...(description ? [`DESCRIPTION:${description}`] : []),
        'END:VEVENT',
      );
    }

    // 3) 회사 행사 및 공휴일 이벤트
    for (const h of holidays) {
      if (!h.holiday_date) continue;
      const hDate = parseDateKeyToUtc(h.holiday_date);
      if (!hDate) {
        // 운영에 "5/1"(근로자의날) 같은 값이 실재한다. 이 한 행 때문에 피드
        // 전체가 500 이 되던 것을 막는다 — 이 이벤트만 빠지고 나머지는 나간다.
        console.warn('[calendar/feed] 잘못된 holiday_date, 건너뜀:', h.id, h.holiday_date);
        continue;
      }
      const nextDate = new Date(hDate);
      nextDate.setDate(nextDate.getDate() + 1);

      const dtStart = formatICSDateOnly(hDate);
      const dtEnd = formatICSDateOnly(nextDate);

      const summary = `[행사] ${h.name}`;
      const description = h.note ? `메모: ${h.note}` : '';

      icsContent.push(
        'BEGIN:VEVENT',
        `UID:holiday-${h.id}@mso.erp`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;VALUE=DATE:${dtStart}`,
        `DTEND;VALUE=DATE:${dtEnd}`,
        `SUMMARY:${summary}`,
        ...(description ? [`DESCRIPTION:${description}`] : []),
        'END:VEVENT',
      );
    }

    icsContent.push('END:VCALENDAR');

    return new NextResponse(icsContent.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="calendar.ics"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('ICS export error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}

