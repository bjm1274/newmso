/**
 * SQL LIKE/ILIKE 패턴 이스케이프.
 * `%`, `_`, `\` 를 백슬래시로 이스케이프해 사용자 입력을 리터럴로 검색한다.
 * (D1/Postgres 공통. 호출부는 `%${escapeLikePattern(term)}%` 형태로 감싸 사용.)
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}
