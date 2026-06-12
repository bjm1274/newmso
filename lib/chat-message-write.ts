import { withMissingColumnsFallback } from './supabase-compat';

const MESSAGE_INSERT_OPTIONAL_COLUMNS = [
  'file_name',
  'file_size_bytes',
  'file_kind',
  'reply_to_id',
  'album_id',
  'album_index',
  'album_total',
];

type ChatMessageWriteClient = {
  from: (table: string) => any;
};

export async function insertChatMessageWithFallback<
  TData extends Record<string, unknown> = Record<string, unknown>,
>(
  client: ChatMessageWriteClient,
  payload: Record<string, unknown>,
  selectClause = '*',
) {
  const result = await withMissingColumnsFallback<TData>(
    (omittedColumns) => {
      const fallbackPayload = { ...payload };
      omittedColumns.forEach((column) => {
        delete fallbackPayload[column];
      });
      return client.from('messages').insert([fallbackPayload]).select(selectClause).single();
    },
    MESSAGE_INSERT_OPTIONAL_COLUMNS,
  );

  // 서버 측 D1 mutate route가 메시지 INSERT 직후 updateChatRoomLastMessage를
  // fire-and-forget으로 실행하므로, 클라이언트에서 별도로 chat_rooms를 UPDATE할
  // 필요가 없다. 전송 훅(PC)과 data-hooks(모바일)에서 setChatRooms로 로컬 상태를
  // 즉시 갱신하고, 폴링이 DB 값을 회수하는 구조.

  return result;
}
