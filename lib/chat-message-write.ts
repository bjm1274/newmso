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

  // SQLite (D1) trigger fallback: update chat_rooms.last_message(_at) manually
  if (!result.error && payload.room_id) {
    const roomId = String(payload.room_id);
    const content = payload.content != null ? String(payload.content) : '';
    let createdAt = new Date().toISOString();
    
    if (result.data && typeof result.data === 'object' && 'created_at' in result.data) {
      const dbCreatedAt = (result.data as any).created_at;
      if (typeof dbCreatedAt === 'string') {
        createdAt = dbCreatedAt;
      }
    }

    client.from('chat_rooms')
      .update({
        last_message: content,
        last_message_at: createdAt,
      })
      .eq('id', roomId)
      .then((updateRes: any) => {
        if (updateRes?.error) {
          console.error('Failed to update chat_rooms.last_message', updateRes.error);
        }
      })
      .catch((err: any) => console.error('Failed to update chat_rooms', err));
  }

  return result;
}
