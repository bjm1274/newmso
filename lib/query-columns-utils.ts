/**
 * query-columns 파일들에서 공통으로 쓰이는 SELECT 절 빌더.
 * 각 build*Select 함수는 내부에서 이 함수를 호출한다.
 */
export function buildSelectClause(
  columns: readonly string[],
  omittedColumns: ReadonlySet<string> = new Set(),
): string {
  return columns.filter((col) => !omittedColumns.has(col)).join(', ');
}
