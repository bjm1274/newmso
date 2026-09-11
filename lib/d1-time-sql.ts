import { sql, type SQL } from 'drizzle-orm';

// 과거 SQL/ISO 형식을 보존하면서 시각으로 비교한다. 원본 데이터의 재작성은 불필요하다.
export function isChatTimeColumn(table: string | undefined, field: string): boolean {
  return (table === 'messages' && field === 'created_at') ||
    (table === 'chat_rooms' && (field === 'last_message_at' || field === 'created_at'));
}
export function orderedColumn(table: string | undefined, field: string): SQL {
  const column = sql.identifier(field);
  return isChatTimeColumn(table, field) ? sql`julianday(${column})` : sql`${column}`;
}
export function comparisonValue(table: string | undefined, field: string, value: unknown): unknown {
  return isChatTimeColumn(table, field) && value != null ? sql`julianday(${value})` : value;
}
