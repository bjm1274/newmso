-- 현재 public 테이블의 RLS 활성화 여부
select
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;

-- 현재 정책 목록
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 핵심 테이블만 따로 보기
select
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'staff_members',
    'chat_rooms',
    'messages',
    'notifications',
    'board_posts',
    'approvals',
    'inventory',
    'inventory_logs',
    'attendance',
    'attendances',
    'leave_requests',
    'payroll_records',
    'push_subscriptions'
  )
order by tablename;

-- 회사/사용자 식별 컬럼 준비도 확인
select
  table_name,
  string_agg(column_name, ', ' order by column_name) as columns
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'staff_members',
    'chat_rooms',
    'messages',
    'notifications',
    'board_posts',
    'approvals',
    'inventory',
    'inventory_logs',
    'attendance',
    'attendances',
    'leave_requests',
    'payroll_records',
    'push_subscriptions'
  )
  and column_name in (
    'id',
    'auth_user_id',
    'user_id',
    'staff_id',
    'sender_id',
    'current_approver_id',
    'created_by',
    'updated_by',
    'company',
    'company_name',
    'company_id',
    'members'
  )
group by table_name
order by table_name;

-- Storage 정책 확인
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'storage'
order by tablename, policyname;

-- 위험 정책 후보: 전체 허용/공개 허용
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where
  schemaname in ('public', 'storage')
  and (
    qual ilike '%true%'
    or with_check ilike '%true%'
    or array_to_string(roles, ',') ilike '%public%'
  )
order by schemaname, tablename, policyname;
