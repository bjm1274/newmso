import { NextRequest, NextResponse } from 'next/server';
import { getD1Binding, getD1Drizzle, nurse_schedules as nurseSchedulesTable, staff_members as staffMembersTable, eq } from '@/lib/db';
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
      .select({ name: staffMembersTable.name })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.id, staffId))
      .limit(1);
    const staffName = staffRows[0]?.name || '직원';

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

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MSO ERP//Calendar Sync//KO',
      `X-WR-CALNAME:${staffName}님의 MSO 근무표`,
      'X-WR-TIMEZONE:Asia/Seoul',
      'CALSCALE:GREGORIAN',
    ];

    const now = new Date();
    const dtStamp = formatICSDate(now);

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
        `UID:${sched.year_month}-${sched.day}-${staffId}@mso.erp`,
        `DTSTAMP:${dtStamp}`,
        `DTSTART;VALUE=DATE:${dtStart}`,
        `DTEND;VALUE=DATE:${dtEnd}`,
        `SUMMARY:${summary}`,
        'END:VEVENT',
      );
    }

    icsContent.push('END:VCALENDAR');

    return new NextResponse(icsContent.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="shift.ics"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('ICS export error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
