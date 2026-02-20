-- 프로필 사진 업로드용 Storage 버킷 정책
-- 1. Supabase 대시보드 → Storage → New bucket → 이름 "profiles", Public 체크 후 생성
-- 2. 이 파일을 DB에 적용 (일부 환경에서는 storage 스키마 권한으로 실패할 수 있음)
--    실패 시: 대시보드 → Storage → profiles → Policies에서 동일한 정책을 수동 추가

-- 모든 사용자(anon)가 profiles 버킷에 파일 업로드 가능 (직원 프로필 사진)
create policy "profiles_allow_insert"
on storage.objects for insert
to public
with check (bucket_id = 'profiles');

-- 모든 사용자가 profiles 버킷 파일 조회 가능 (Public URL로 이미지 표시)
create policy "profiles_allow_select"
on storage.objects for select
to public
using (bucket_id = 'profiles');

-- 본인 파일 업데이트 허용 (같은 파일명으로 재업로드 시)
create policy "profiles_allow_update"
on storage.objects for update
to public
using (bucket_id = 'profiles');
