import { selectChatMessagesWithFallback as defaultSelectChatMessagesWithFallback } from './메신저데이터유틸';
import { CHAT_METADATA_QUERY_CHUNK_SIZE, type SelectChatMessagesWithFallback } from './메신저방데이터-types';

export function normalizeMessageCursorTime(value: string | null | undefined) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  const parsedTime = new Date(rawValue).getTime();
  return Number.isNaN(parsedTime) ? rawValue : new Date(rawValue).toISOString();
}

export const defaultLegacySelectChatMessagesWithFallback: SelectChatMessagesWithFallback = (execute) =>
  defaultSelectChatMessagesWithFallback(({ selectClause }) => execute(selectClause));

export function chunkArray<T>(items: T[], chunkSize = CHAT_METADATA_QUERY_CHUNK_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

export function describeQueryError(error: unknown) {
  if (!error) return '알 수 없는 오류';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const pieces = [
      record.message,
      record.details,
      record.hint,
      record.code ? `code=${record.code}` : null,
      record.status ? `status=${record.status}` : null,
    ].filter(Boolean);
    if (pieces.length > 0) return pieces.join(' / ');
    try {
      const serialized = JSON.stringify(error);
      return serialized && serialized !== '{}' ? serialized : '응답 메타데이터 조회 실패';
    } catch {
      return '응답 메타데이터 조회 실패';
    }
  }
  return String(error);
}
