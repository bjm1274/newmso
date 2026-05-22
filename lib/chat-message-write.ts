import type { SupabaseClient } from '@supabase/supabase-js';
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

// `supabase`(lib/supabase.ts) 프록시는 SupabaseClient 형태로 노출되며
// 런타임에 D1으로 라우팅된다. from()만 사용하는 최소 구조적 타입.
type ChatMessageWriteClient = Pick<SupabaseClient<any, any, any>, 'from'>;

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
