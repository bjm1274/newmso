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
  return withMissingColumnsFallback<TData>(
    (omittedColumns) => {
      const fallbackPayload = { ...payload };
      omittedColumns.forEach((column) => {
        delete fallbackPayload[column];
      });
      return client.from('messages').insert([fallbackPayload]).select(selectClause).single();
    },
    MESSAGE_INSERT_OPTIONAL_COLUMNS,
  );
}
