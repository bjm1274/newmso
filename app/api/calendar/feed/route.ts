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

      const [year, month] = sched.year_month.split('-').map(Number);
      const day = Number(sched.day);
      const eventDate = new Date(Date.UTC(year, month - 1, day));
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
      if (!lv.start_date || lv.status === '반려') continue;

      const [sYear, sMonth, sDay] = lv.start_date.split('-').map(Number);
      const [eYear, eMonth, eDay] = (lv.end_date || lv.start_date).split('-').map(Number);

      const startDate = new Date(Date.UTC(sYear, sMonth - 1, sDay));
      const endDate = new Date(Date.UTC(eYear, eMonth - 1, eDay));
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
      const [hYear, hMonth, hDay] = h.holiday_date.split('-').map(Number);
      const hDate = new Date(Date.UTC(hYear, hMonth - 1, hDay));
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

