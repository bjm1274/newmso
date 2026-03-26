-- 채팅 첨부파일 Storage (SQL Editor에서 실행)
-- 아래 전체를 복사해 SQL Editor에 붙여넣고 Run 실행

insert into storage.buckets (id, name, public)
values ('pchos-files', 'pchos-files', true)
on conflict (id) do nothing;

drop policy if exists "chat_attachments_insert_public" on storage.objects;
create policy "chat_attachments_insert_public"
on storage.objects for insert to public
with check (bucket_id = 'pchos-files');

drop policy if exists "chat_attachments_insert_auth" on storage.objects;
create policy "chat_attachments_insert_auth"
on storage.objects for insert to authenticated
with check (bucket_id = 'pchos-files');

drop policy if exists "chat_attachments_select_public" on storage.objects;
create policy "chat_attachments_select_public"
on storage.objects for select to public
using (bucket_id = 'pchos-files');
