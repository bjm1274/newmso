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

// ============================================================
// 초대형 행 처리
// D1 statement 한도는 100KB. 단일 행이 이를 넘으면 인라인 INSERT 불가.
// → INSERT(초대형 컬럼은 '')  +  UPDATE ... SET col = col || '청크'  반복.
// ============================================================

/** toSqlLiteral의 문자열 경로와 동일한 raw 콘텐츠. 문자열이 아니면 null. */
export function columnStringContent(value, coerce) {
  if (value === null || value === undefined) return null;
  if (coerce === 'json') return JSON.stringify(value);
  if (coerce === 'bool' || coerce === 'int') return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return null;
  return JSON.stringify(value);
}

/** 문자열을 escape 후 바이트가 maxBytes 이하인 조각들로 분할(코드포인트 경계 유지). */
export function chunkStringForSql(s, maxBytes) {
  const chunks = [];
  let buf = '';
  let bytes = 0;
  for (const ch of s) {
    const escBytes = Buffer.byteLength(ch === "'" ? "''" : ch, 'utf8');
    if (bytes + escBytes > maxBytes && buf.length > 0) {
      chunks.push(buf);
      buf = '';
      bytes = 0;
    }
    buf += ch;
    bytes += escBytes;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

/**
 * statement 한도를 넘는 단일 행을 분할 SQL로 변환.
 * onConflict: 'ignore' | 'replace'. pk: UPDATE WHERE에 쓸 단일 키 컬럼명.
 */
export function buildOversizedRowSql(table, columns, row, defaults, conflict, pk) {
  const INSERT_BUDGET = 80_000;
  const UPDATE_CHUNK_BYTES = 55_000;

  const cols = columns.map(({ name, coerce }) => {
    let value = row[name];
    if ((value === undefined || value === null) && defaults[name]) {
      value = defaults[name](row);
    }
    return {
      name,
      literal: toSqlLiteral(value, coerce),
      str: columnStringContent(value, coerce),
    };
  });

  const pkCol = cols.find((c) => c.name === pk);
  if (!pkCol) throw new Error(`oversized row: pk '${pk}' not in columns of ${table}`);

  // INSERT가 예산에 맞을 때까지 큰 문자열 컬럼을 deferred 처리(큰 것부터)
  const deferred = new Set();
  const colListBytes = columns.reduce((s, c) => s + c.name.length + 4, 0);
  const litBytes = (c) => (deferred.has(c.name) ? 2 : Buffer.byteLength(c.literal, 'utf8'));
  const insertBytes = () =>
    50 + table.length + colListBytes + cols.reduce((s, c) => s + litBytes(c) + 2, 0);
  const candidates = cols
    .filter((c) => c.str !== null && c.name !== pk)
    .sort((a, b) => Buffer.byteLength(b.literal, 'utf8') - Buffer.byteLength(a.literal, 'utf8'));
  for (const c of candidates) {
    if (insertBytes() <= INSERT_BUDGET) break;
    deferred.add(c.name);
  }

  const out = [];
  const colList = columns.map((c) => `"${c.name}"`).join(', ');
  const valList = cols.map((c) => (deferred.has(c.name) ? "''" : c.literal)).join(', ');
  const verb = conflict === 'replace' ? 'INSERT OR REPLACE' : 'INSERT OR IGNORE';
  out.push(`${verb} INTO "${table}" (${colList}) VALUES (${valList});`);

  for (const c of cols) {
    if (!deferred.has(c.name)) continue;
    const pieces = chunkStringForSql(c.str, UPDATE_CHUNK_BYTES);
    pieces.forEach((piece, idx) => {
      const lit = `'${piece.replace(/'/g, "''")}'`;
      const rhs = idx === 0 ? lit : `"${c.name}" || ${lit}`;
      out.push(`UPDATE "${table}" SET "${c.name}" = ${rhs} WHERE "${pk}" = ${pkCol.literal};`);
    });
  }
  return out.join('\n') + '\n';
}
