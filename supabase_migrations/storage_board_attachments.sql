-- 게시판 첨부파일 Storage (반드시 SQL Editor에서 실행)
-- 1. Supabase 대시보드 → Storage → New bucket → 이름 "board-attachments", Public 체크 후 생성
-- 2. 아래 전체를 복사해 SQL Editor에 붙여넣고 Run 실행

drop policy if exists "board_attachments_insert" on storage.objects;
create policy "board_attachments_insert"
on storage.objects for insert to public
with check (bucket_id = 'board-attachments');

drop policy if exists "board_attachments_insert_auth" on storage.objects;
create policy "board_attachments_insert_auth"
on storage.objects for insert to authenticated
with check (bucket_id = 'board-attachments');

drop policy if exists "board_attachments_select" on storage.objects;
create policy "board_attachments_select"
on storage.objects for select to public
using (bucket_id = 'board-attachments');
