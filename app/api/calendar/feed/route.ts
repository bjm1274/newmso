import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// Helper to format date array to ICS datetime (e.g. 20260617T090000Z)
function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

function formatICSDateOnly(date: Date): string {
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');

  if (!token) {
    return new NextResponse('Unauthorized: Missing token', { status: 401 });
  }

  // Token is assumed to be the staff_id for now.
  const staffId = token;

  try {
    // 1. Get staff info
    const { data: staff } = await supabase
      .from('staff_members')
      .select('name')
      .eq('id', staffId)
      .single();

    const staffName = staff?.name || '직원';

    // 2. Get shift schedules (nurse_schedules)
    const { data: schedules } = await supabase
      .from('nurse_schedules')
      .select('year_month, day, shift_code')
      .eq('staff_id', staffId);

    // 3. Generate ICS string
    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MSO ERP//Calendar Sync//KO',
      `X-WR-CALNAME:${staffName}님의 MSO 근무표`,
      'X-WR-TIMEZONE:Asia/Seoul',
      'CALSCALE:GREGORIAN',
    ];

    if (schedules) {
      const now = new Date();
      const dtStamp = formatICSDate(now);

      schedules.forEach((sched: { year_month: string | null; day: number | null; shift_code: string | null }) => {
        if (!sched.year_month || !sched.day || !sched.shift_code) return;
        
        // Skip OFF, LEAVE, TRAINING for now, or add them as all-day events
        if (sched.shift_code === 'OFF') return;

        const [year, month] = sched.year_month.split('-').map(Number);
        const day = Number(sched.day);
        
        const eventDate = new Date(Date.UTC(year, month - 1, day));
        const dtStart = formatICSDateOnly(eventDate);
        
        const nextDate = new Date(eventDate);
        nextDate.setDate(nextDate.getDate() + 1);
        const dtEnd = formatICSDateOnly(nextDate);

        let summary = `[근무] ${sched.shift_code}`;
        if (sched.shift_code === 'D') summary = '🌞 데이 (Day) 근무';
        if (sched.shift_code === 'E') summary = '🌇 이브닝 (Evening) 근무';
        if (sched.shift_code === 'N') summary = '🌙 나이트 (Night) 근무';
        if (sched.shift_code === 'LEAVE') summary = '🌴 휴가';
        if (sched.shift_code === 'TRAINING') summary = '📖 교육';

        icsContent.push(
          'BEGIN:VEVENT',
          `UID:${sched.year_month}-${sched.day}-${staffId}@mso.erp`,
          `DTSTAMP:${dtStamp}`,
          `DTSTART;VALUE=DATE:${dtStart}`,
          `DTEND;VALUE=DATE:${dtEnd}`,
          `SUMMARY:${summary}`,
          'END:VEVENT'
        );
      });
    }

    icsContent.push('END:VCALENDAR');

    return new NextResponse(icsContent.join('\r\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="shift_${staffId}.ics"`,
      },
    });

  } catch (error) {
    console.error('ICS export error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
