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

async function checkSync() {
  const { data: staffData } = await supabase.from('staff_members').select('id, name, department');
  const staffMap = new Map();
  staffData?.forEach(s => staffMap.set(s.id, s));

  // Get recent attendance logs
  const { data: attendanceLogs } = await supabase.from('attendance')
    .select('staff_id, date, check_in, check_out, status')
    .order('date', { ascending: false })
    .limit(5000);
    
  const { data: attendances } = await supabase.from('attendances')
    .select('staff_id, work_date, check_in_time, check_out_time, status')
    .order('work_date', { ascending: false })
    .limit(5000);

  const calendarMap = new Map();
  attendances?.forEach(a => {
    calendarMap.set(`${a.staff_id}_${a.work_date}`, a);
  });
  
  const unsynced = [];
  
  attendanceLogs?.forEach(log => {
    if (!log.check_in && !log.check_out) return;
    
    const cal = calendarMap.get(`${log.staff_id}_${log.date}`);
    const staff = staffMap.get(log.staff_id) || { name: '알수없음', department: '알수없음' };
    
    if (!cal) {
      unsynced.push({ type: '미연동(달력없음)', name: staff.name, dept: staff.department, date: log.date, check_in: log.check_in, check_out: log.check_out });
    } else if (log.check_in && !cal.check_in_time) {
      unsynced.push({ type: '출근누락', name: staff.name, dept: staff.department, date: log.date, log_in: log.check_in, cal_in: cal.check_in_time });
    } else if (log.check_out && !cal.check_out_time) {
      unsynced.push({ type: '퇴근누락', name: staff.name, dept: staff.department, date: log.date, log_out: log.check_out, cal_out: cal.check_out_time });
    }
  });
  
  console.log(`=== 연동 누락 확인결과 (최근 5000건 기준) ===`);
  console.log(`총 ${unsynced.length}건 발견`);
  unsynced.slice(0, 30).forEach(u => console.log(JSON.stringify(u)));
}

checkSync();
