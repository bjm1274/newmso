/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function readEnv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = rawLine.indexOf('=');
    if (eqIndex === -1) continue;
    const key = rawLine.slice(0, eqIndex).trim();
    let value = rawLine.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function parseShiftTime(value) {
  const match = String(value || '')
    .trim()
    .match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function getKstMinutes(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

function formatMinutes(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return null;
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

async function main() {
  const since = process.argv[2] || '2026-01-01';
  const apply = process.argv.includes('--apply');
  const env = readEnv(path.join(process.cwd(), '.env.local'));
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: lateRows, error: lateError } = await supabase
    .from('attendances')
    .select('id, staff_id, work_date, status, check_in_time, check_out_time')
    .eq('status', 'late')
    .gte('work_date', since)
    .not('check_in_time', 'is', null)
    .order('work_date', { ascending: false })
    .limit(5000);

  if (lateError) throw lateError;

  const staffIds = [...new Set((lateRows || []).map((row) => row.staff_id).filter(Boolean))];

  const [staffRes, assignmentRes] = await Promise.all([
    staffIds.length > 0
      ? supabase.from('staff_members').select('id, name, company, department, shift_id').in('id', staffIds)
      : { data: [], error: null },
    staffIds.length > 0
      ? supabase
          .from('shift_assignments')
          .select('staff_id, work_date, shift_id')
          .in('staff_id', staffIds)
          .gte('work_date', since)
      : { data: [], error: null },
  ]);

  if (staffRes.error) throw staffRes.error;
  if (assignmentRes.error) throw assignmentRes.error;

  const shiftIds = [
    ...new Set([
      ...(staffRes.data || []).map((row) => row.shift_id).filter(Boolean),
      ...(assignmentRes.data || []).map((row) => row.shift_id).filter(Boolean),
    ]),
  ];

  const shiftRes =
    shiftIds.length > 0
      ? await supabase
          .from('work_shifts')
          .select('id, name, start_time, end_time, is_active')
          .in('id', shiftIds)
      : { data: [], error: null };

  if (shiftRes.error) throw shiftRes.error;

  const staffMap = new Map((staffRes.data || []).map((row) => [row.id, row]));
  const assignmentMap = new Map(
    (assignmentRes.data || []).map((row) => [`${row.staff_id}_${String(row.work_date).slice(0, 10)}`, row])
  );
  const shiftMap = new Map((shiftRes.data || []).map((row) => [row.id, row]));

  const candidates = [];
  const unresolved = [];

  for (const row of lateRows || []) {
    const workDate = String(row.work_date).slice(0, 10);
    const assignment = assignmentMap.get(`${row.staff_id}_${workDate}`);
    const staff = staffMap.get(row.staff_id);
    const shift = assignment?.shift_id
      ? shiftMap.get(assignment.shift_id)
      : staff?.shift_id
        ? shiftMap.get(staff.shift_id)
        : null;

    const checkInMinutes = getKstMinutes(row.check_in_time);
    const shiftStartMinutes = parseShiftTime(shift?.start_time);

    if (checkInMinutes == null || shiftStartMinutes == null || !shift) {
      unresolved.push({
        id: row.id,
        staff_id: row.staff_id,
        staff_name: staff?.name || null,
        work_date: workDate,
        check_in_time: row.check_in_time,
        via: assignment?.shift_id ? 'assignment' : 'default-shift',
        shift_id: assignment?.shift_id || staff?.shift_id || null,
      });
      continue;
    }

    if (checkInMinutes <= shiftStartMinutes) {
      candidates.push({
        id: row.id,
        staff_id: row.staff_id,
        staff_name: staff?.name || null,
        company: staff?.company || null,
        department: staff?.department || null,
        work_date: workDate,
        check_in_time: row.check_in_time,
        check_in_kst: formatMinutes(checkInMinutes),
        shift_id: shift.id,
        shift_name: shift.name,
        shift_start: shift.start_time,
        via: assignment?.shift_id ? 'assignment' : 'default-shift',
      });
    }
  }

  if (apply && candidates.length > 0) {
    for (const candidate of candidates) {
      const { error: attendanceError } = await supabase
        .from('attendance')
        .update({ status: '정상' })
        .eq('staff_id', candidate.staff_id)
        .eq('date', candidate.work_date)
        .eq('status', '지각');
      if (attendanceError) throw attendanceError;

      const { error: attendancesError } = await supabase
        .from('attendances')
        .update({ status: 'present' })
        .eq('id', candidate.id)
        .eq('status', 'late');
      if (attendancesError) throw attendancesError;
    }
  }

  console.log(
    JSON.stringify(
      {
        since,
        apply,
        late_count: lateRows?.length || 0,
        candidate_count: candidates.length,
        unresolved_count: unresolved.length,
        candidates,
        unresolved,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        error: error?.message || String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
