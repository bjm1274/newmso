'use client';

import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import { supabase } from '@/lib/supabase';
import type { ChatMessage } from '@/types';
import { getMessageDisplayText } from './메신저첨부';

const MESSAGE_INSERT_OPTIONAL_COLUMNS = [
  'file_name',
  'file_size_bytes',
  'file_kind',
  'reply_to_id',
  'album_id',
  'album_index',
  'album_total',
];

export type SendMessageOptions = {
  fileUrl?: string;
  fileSizeBytes?: number;
  fileKind?: 'image' | 'video' | 'file';
  retryMessageId?: string;
  fileName?: string;
  contentOverride?: string;
  clearComposerIfUnchangedFrom?: string;
  replyToIdOverride?: string | null;
  albumId?: string | null;
  albumIndex?: number | null;
  albumTotal?: number | null;
};

export async function insertChatMessageWithFallback<TData extends Record<string, unknown> = Record<string, unknown>>(
  payload: Record<string, unknown>,
  selectClause = '*',
) {
  return withMissingColumnsFallback<TData>(
    (omittedColumns) => {
      const fallbackPayload = { ...payload };
      omittedColumns.forEach((column) => {
        delete fallbackPayload[column];
      });
      return supabase.from('messages').insert([fallbackPayload]).select(selectClause).single();
    },
    MESSAGE_INSERT_OPTIONAL_COLUMNS,
  );
}

export function buildForwardedMessageContent(message: ChatMessage) {
  const senderName =
    (message.staff as { name?: string } | null | undefined)?.name || '이름 없음';

  return `[전달] ${senderName}: ${getMessageDisplayText(
    message.content,
    message.file_name,
    message.file_url,
    '첨부 파일 확인',
  )}`;
}
