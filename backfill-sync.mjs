import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.join(process.cwd(), '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.trim().match(/^([^=]+)=(.*)$/);
  if (match) {
    env[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = env['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = env['SUPABASE_SERVICE_ROLE_KEY'] || env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
const supabase = createClient(supabaseUrl, supabaseKey);

const COMMUTE_STATUS_TO_ATTENDANCES = {
  '정상': 'present',
  '지각': 'late',
  '조퇴': 'early_leave',
  '결근': 'absent',
};

async function syncAll() {
  console.log('Fetching all attendance logs...');
  let allLogs = [];
  let page = 0;
  while (true) {
    const { data, error } = await supabase.from('attendance')
      .select('staff_id, date, check_in, check_out, status')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (data.length === 0) break;
    allLogs.push(...data);
    page++;
  }
  console.log(`Fetched ${allLogs.length} attendance logs.`);

  console.log('Fetching all attendances...');
  let allCal = [];
  page = 0;
  while (true) {
    const { data, error } = await supabase.from('attendances')
      .select('staff_id, work_date, check_in_time, check_out_time')
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (error) throw error;
    if (data.length === 0) break;
    allCal.push(...data);
    page++;
  }
  console.log(`Fetched ${allCal.length} calendar records.`);

  const calendarMap = new Map();
  allCal.forEach(a => calendarMap.set(`${a.staff_id}_${a.work_date}`, a));

  const toSync = [];
  
  allLogs.forEach(log => {
    if (!log.check_in && !log.check_out) return;
    const cal = calendarMap.get(`${log.staff_id}_${log.date}`);
    
    let needsSync = false;
    if (!cal) needsSync = true;
    else if (log.check_in && !cal.check_in_time) needsSync = true;
    else if (log.check_out && !cal.check_out_time) needsSync = true;

    if (needsSync) {
      const attStatus = COMMUTE_STATUS_TO_ATTENDANCES[log.status] || 'present';
      const mins = (log.check_in && log.check_out) 
        ? Math.round((new Date(log.check_out).getTime() - new Date(log.check_in).getTime()) / 60000)
        : null;

      toSync.push({
        staff_id: log.staff_id,
        work_date: log.date,
        check_in_time: log.check_in,
        check_out_time: log.check_out,
        status: attStatus,
        work_hours_minutes: mins
      });
    }
  });

  console.log(`Found ${toSync.length} records to sync.`);

  if (toSync.length > 0) {
    console.log('Syncing...');
    // Upsert in batches of 500
    for (let i = 0; i < toSync.length; i += 500) {
      const batch = toSync.slice(i, i + 500);
      const { error } = await supabase.from('attendances').upsert(batch, { onConflict: 'staff_id,work_date' });
      if (error) {
        console.error('Upsert error:', error);
      } else {
        console.log(`Synced batch ${i / 500 + 1} (${batch.length} records)`);
      }
    }
    console.log('Sync complete.');
  }
}

syncAll().catch(console.error);
