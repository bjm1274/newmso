/**
 * scripts/_lib/d1.mjs
 *
 * wrangler d1 실행 헬퍼 하나.
 *
 * 예전에는 스크립트마다 제 나름의 d1Query/d1Json 이 있었고, 그중 절반이
 *   execSync(`npx wrangler d1 execute ${DB} --command "${sql.replace(/"/g,'\\"')}"`, { shell: true })
 * 형태였다. 이 방식은 Windows cmd.exe 에서 SQL 이 조용히 바뀐다.
 *
 * 실측한 실패 조건은 `%VAR%` 형태의 환경변수 확장이다.
 *   SELECT * FROM notes WHERE body LIKE '%TEMP%'
 *     → SELECT * FROM notes WHERE body LIKE 'C:\Users\...\Temp'
 * 오류 없이 조건만 바뀌어 엉뚱한 결과가 나온다. 사용자 입력이나 검색어를 SQL 에
 * 끼워 넣는 경로에서는 `%` 두 개 사이에 무엇이 오느냐에 따라 결과가 달라진다.
 * (인용부호 안에 있으면 `&` `|` `^` 나 홑 `%` 는 살아남는다 — 문제는 `%VAR%` 뿐이다.)
 *
 * 그래서 셸을 아예 거치지 않는다. wrangler 를 node 로 직접 실행하고
 * SQL 은 인자 배열의 한 원소로 넘긴다 — 어떤 문자가 들어와도 그대로 전달된다.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(__dirname, '..', '..');

/** wrangler.toml 의 database_name 과 일치해야 한다. */
export const D1_DB_NAME = 'pchos-d1-v2';

const WRANGLER_JS = join(REPO_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function wranglerEntry() {
  if (!existsSync(WRANGLER_JS)) {
    throw new Error(`wrangler 를 찾을 수 없습니다: ${WRANGLER_JS} (npm install 이 필요합니다)`);
  }
  return WRANGLER_JS;
}

/**
 * wrangler d1 execute 를 실행하고 원시 stdout 을 반환한다.
 * @param {string} sql
 * @param {{ db?: string, remote?: boolean, json?: boolean, cwd?: string }} [opts]
 */
export function d1Exec(sql, opts = {}) {
  const { db = D1_DB_NAME, remote = true, json = true, cwd = REPO_ROOT } = opts;
  const args = [wranglerEntry(), 'd1', 'execute', db, remote ? '--remote' : '--local'];
  if (json) args.push('--json');
  args.push('--command', sql);

  return execFileSync(process.execPath, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
}

/**
 * wrangler 출력에서 JSON 본문만 뽑는다.
 * wrangler 는 JSON 앞뒤로 배너·경고를 섞어 내보내므로 그대로 JSON.parse 하면 깨진다.
 * @param {string} out
 */
export function extractJson(out) {
  const firstArray = out.indexOf('[');
  const firstObject = out.indexOf('{');
  const candidates = [firstArray, firstObject].filter((i) => i >= 0);
  if (!candidates.length) {
    throw new Error(`wrangler 출력에서 JSON 을 찾지 못했습니다: ${out.slice(0, 300)}`);
  }
  const start = Math.min(...candidates);
  const body = out.slice(start).trim();

  try {
    return JSON.parse(body);
  } catch {
    // 뒤에 배너가 붙은 경우 마지막 닫는 괄호까지만 잘라 다시 시도한다.
    const lastClose = Math.max(body.lastIndexOf(']'), body.lastIndexOf('}'));
    if (lastClose > 0) return JSON.parse(body.slice(0, lastClose + 1));
    throw new Error(`wrangler 출력 JSON 파싱 실패: ${body.slice(0, 300)}`);
  }
}

/**
 * SELECT 결과 행 배열을 반환한다.
 * wrangler 는 다중 문장이면 결과 블록 배열을 주므로, 행이 담긴 첫 블록을 고른다.
 * @param {string} sql
 * @param {{ db?: string, remote?: boolean, cwd?: string }} [opts]
 * @returns {any[]}
 */
export function d1Query(sql, opts = {}) {
  const parsed = extractJson(d1Exec(sql, { ...opts, json: true }));
  return pickRows(parsed);
}

/**
 * wrangler 의 결과 구조에서 실제 행 배열을 고른다.
 * 다중 문장이면 블록 배열이 오는데, 그중 하나는 'Total queries executed' 같은
 * 실행 요약이라 행 데이터로 착각하면 안 된다.
 * @param {any} parsed
 * @returns {any[]}
 */
export function pickRows(parsed) {
  if (Array.isArray(parsed)) {
    for (const block of parsed) {
      const rows = block?.results;
      if (Array.isArray(rows) && rows.length > 0) {
        const keys = Object.keys(rows[0] ?? {});
        if (!keys.includes('Total queries executed')) return rows;
      }
    }
    // 행이 있는 블록이 없으면 첫 결과 블록(보통 빈 배열)을 그대로 돌려준다.
    for (const block of parsed) {
      if (Array.isArray(block?.results)) return block.results;
    }
    return [];
  }
  if (Array.isArray(parsed?.results)) return parsed.results;
  return [];
}

/**
 * SQL 을 임시 파일로 넘겨 실행한다 (--command 길이 한계를 넘는 대량 문장용).
 * @param {string} sql
 * @param {{ db?: string, remote?: boolean, cwd?: string, workDir?: string }} [opts]
 */
export function d1File(sql, opts = {}) {
  const { db = D1_DB_NAME, remote = true, cwd = REPO_ROOT, workDir } = opts;
  const dir = workDir ?? mkdtempSync(join(tmpdir(), 'd1-exec-'));
  const sqlPath = join(dir, `stmt-${process.pid}-${counter++}.sql`);
  writeFileSync(sqlPath, sql, 'utf8');
  try {
    const args = [wranglerEntry(), 'd1', 'execute', db, remote ? '--remote' : '--local', '--json', '--file', sqlPath];
    const out = execFileSync(process.execPath, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
    return extractJson(out);
  } finally {
    try {
      unlinkSync(sqlPath);
    } catch {
      /* 임시 파일 정리 실패는 무시 */
    }
  }
}

let counter = 0;

/**
 * 쓰기 문장을 실행한다. 반환값은 wrangler 가 준 메타(변경 행 수 등).
 * @param {string} sql
 * @param {{ db?: string, remote?: boolean, cwd?: string }} [opts]
 */
export function d1Mutate(sql, opts = {}) {
  return extractJson(d1Exec(sql, { ...opts, json: true }));
}

/**
 * SQL 문자열 리터럴로 안전하게 감싼다.
 * 값을 문자열 연결로 SQL 에 넣어야 할 때 사용한다.
 * @param {string | number | null | undefined} value
 */
export function sqlLiteral(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`SQL 리터럴로 쓸 수 없는 수: ${value}`);
    return String(value);
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}
