-- 채팅 메시지 앨범(묶음 이미지) 기능
-- messages 테이블에 album 관련 컬럼 추가

alter table public.messages
  add column if not exists album_id   uuid    null,
  add column if not exists album_index integer null,
  add column if not exists album_total integer null;

-- album_id 인덱스 (같은 앨범 메시지 조회용)
create index if not exists idx_messages_album_id
  on public.messages(album_id)
  where album_id is not null;
