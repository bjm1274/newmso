// ============================================================
// scripts/backfill-d1/normalize.mjs
// Supabase → D1(SQLite) row 변환 공용 함수.
//
// SQL literal 생성은 INSERT문에 인라인 삽입하므로 escape가 핵심.
// SQLite는 single quote(')를 두 번 반복('')로 escape.
// ============================================================

/**
 * SQLite SQL literal로 변환.
 * - null/undefined → 'NULL'
 * - number(finite) → 그대로
 * - boolean → 0 / 1
 * - string → 'escaped'
 * - 그 외(object/array) → JSON.stringify → 'escaped'
 *
 * 호출 측이 컬럼 타입을 알 때 `coerce`로 강제 가능.
 */
export function toSqlLiteral(value, coerce) {
  if (value === null || value === undefined) return 'NULL';
  if (coerce === 'json') {
    return quoteString(JSON.stringify(value));
  }
  if (coerce === 'bool') {
    return value ? '1' : '0';
  }
  if (coerce === 'int') {
    const n = Number(value);
    if (!Number.isFinite(n)) return 'NULL';
    return String(Math.trunc(n));
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'string') {
    return quoteString(value);
  }
  // 객체/배열 → JSON
  return quoteString(JSON.stringify(value));
}

/**
 * SQLite single-quote escape.
 */
export function quoteString(value) {
  const s = String(value);
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * 한 row를 INSERT VALUES (...) 형식으로 변환.
 *
 * @param row              Supabase에서 받은 row (Record<string, unknown>)
 * @param columns          [{ name, coerce? }] D1 측 컬럼 정의 (순서 = INSERT 컬럼 순서)
 * @param defaults         { [colName]: () => value } 누락 시 채움 (예: id: () => crypto.randomUUID())
 */
export function rowToValueTuple(row, columns, defaults = {}) {
  const parts = columns.map(({ name, coerce }) => {
    let value = row[name];
    if ((value === undefined || value === null) && defaults[name]) {
      value = defaults[name](row);
    }
    return toSqlLiteral(value, coerce);
  });
  return `(${parts.join(', ')})`;
}

/**
 * 청크 단위 INSERT 빌더.
 *
 * INSERT OR IGNORE INTO {table} ({cols}) VALUES
 *   (...),
 *   (...);
 *
 * onConflict='ignore' (default) | 'replace'
 */
export function buildInsertChunk(table, columns, rowTuples, onConflict = 'ignore') {
  if (rowTuples.length === 0) return '';
  const verb = onConflict === 'replace' ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
  const colList = columns.map((c) => `"${c.name}"`).join(', ');
  const valueClause = rowTuples.join(',\n  ');
  return `${verb} INTO "${table}" (${colList}) VALUES\n  ${valueClause};\n`;
}
