-- 문서보관함 PDF Storage (반드시 SQL Editor에서 실행)
-- 1. Supabase 대시보드 → Storage → New bucket → 이름 "document-pdfs", Public 체크 후 생성
-- 2. 아래 전체를 복사해 SQL Editor에 붙여넣고 Run 실행

drop policy if exists "document_pdfs_insert" on storage.objects;
create policy "document_pdfs_insert"
on storage.objects for insert to public
with check (bucket_id = 'document-pdfs');

drop policy if exists "document_pdfs_insert_auth" on storage.objects;
create policy "document_pdfs_insert_auth"
on storage.objects for insert to authenticated
with check (bucket_id = 'document-pdfs');

drop policy if exists "document_pdfs_select" on storage.objects;
create policy "document_pdfs_select"
on storage.objects for select to public
using (bucket_id = 'document-pdfs');
