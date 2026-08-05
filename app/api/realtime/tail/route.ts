// ============================================================
// app/api/realtime/tail/route.ts
// 클라이언트 polling용 "변경 신호" endpoint.
//
// 동작:
//   1) 쿼리: ?tables=table1,table2,...
//   2) 각 테이블의 max(created_at)을 D1(dual-write 적용분) 또는 Supabase
//      (그 외)에서 조회해 응답
//   3) 클라이언트가 직전 호출 결과와 비교해 변경 감지 시 callback 호출
//
// 권한: 로그인 사용자만
// 한도: 한 요청에 최대 10개 테이블
//
// Phase 5-A — Supabase Realtime 채널을 polling으로 대체하는 인프라.
// Phase 6   — d1 모드: D1 drizzle로 테이블별 max(created_at) 조회
// ============================================================
import { NextResponse } from 'next/server';
import { userId } from '@/lib/d1-api-helpers';
import { readSessionFromRequest } from '@/lib/server-session';
import { getD1Binding } from '@/lib/db';
import {
  REALTIME_ALLOWED_TABLE_SET as ALLOWED_TABLES,
  REALTIME_TABLE_TIMESTAMP_COLUMN as TABLE_TIMESTAMP_COLUMN,
  getRealtimeTimestampColumn,
  isRealtimeAllowedFilterColumn,
} from '@/lib/realtime/allowed-tables';

export const dynamic = 'force-dynamic';

const MAX_TABLES_PER_REQUEST = 10;

/** 허용되지 않은 필터 컬럼·연산자 요청 — 400 으로 거부하기 위한 표식. */
class RealtimeFilterNotAllowedError extends Error {
  constructor(table: string, column: string, op: string) {
    super(`허용되지 않은 필터입니다: ${table}:${column}=${op}`);
    this.name = 'RealtimeFilterNotAllowedError';
  }
}

// D1에서 테이블의 최신 변경 timestamp 조회 — allowedTables whitelist 내에서만 호출됨.
// 컬럼명은 TABLE_TIMESTAMP_COLUMN 매핑에서 우선 결정, 없으면 created_at.
// tableSpec은 "tableName:filter" 또는 "tableName" 형태.
async function fetchMaxCreatedAtD1(
  d1: NonNullable<Awaited<ReturnType<typeof getD1Binding>>>,
  tableSpec: string,
): Promise<string | null> {
  const [tableName, filterPart] = tableSpec.split(':');
  const column = getRealtimeTimestampColumn(tableName);
  
  let query = `SELECT "${column}" AS ts FROM "${tableName}"`;
  const params: unknown[] = [];
  
  if (filterPart) {
    // 형식: col=op.val (예: room_id=eq.123)
    const [col, opAndVal] = filterPart.split('=');
    if (col && opAndVal) {
      const dotIdx = opAndVal.indexOf('.');
      if (dotIdx !== -1) {
        const op = opAndVal.substring(0, dotIdx);
        const val = opAndVal.substring(dotIdx + 1);

        // 컬럼은 화이트리스트로 제한한다.
        //
        // 예전에는 `/^[a-zA-Z0-9_]+$/` 만 검사했다. SQL 인젝션은 막았지만
        // 조회 결과 유무가 그대로 응답에 드러나므로 **임의 컬럼 값의 존재 여부를
        // 확인하는 오라클**이 됐다(비밀번호 해시·주민번호 등).
        // 필터를 못 쓰는 컬럼이 오면 조건을 조용히 무시하지 않고 요청을 거부한다 —
        // 무시하면 필터 없는 전체 조회가 되어 더 넓은 결과를 돌려주게 된다.
        if (op !== 'eq' || !isRealtimeAllowedFilterColumn(col)) {
          throw new RealtimeFilterNotAllowedError(tableName, col, op);
        }
        query += ` WHERE "${col}" = ?`;
        params.push(val);
      }
    }
  }
  
  query += ` ORDER BY "${column}" DESC LIMIT 1`;

  try {
    const statement = d1.prepare(query);
    const result = await (params.length > 0 ? statement.bind(...params) : statement).first<{ ts: string | null }>();
    return result?.ts ?? null;
  } catch (err) {
    // 필터 거부는 삼키지 않는다 — null 로 뭉개면 호출자가 "변경 없음"으로 읽는다.
    if (err instanceof RealtimeFilterNotAllowedError) throw err;
    console.error(`[fetchMaxCreatedAtD1] query failed: ${query}`, err);
    return null;
  }
}

export async function GET(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!userId(session?.user)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    const tablesParam = url.searchParams.get('tables') ?? '';
    const requested = tablesParam
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, MAX_TABLES_PER_REQUEST);

    // tableSpec에서 tableName만 추출하여 ALLOWED_TABLES 화이트리스트 검사 수행
    const tables = requested.filter((t) => {
      const tableName = t.split(':')[0];
      return ALLOWED_TABLES.has(tableName);
    });
    if (tables.length === 0) {
      return NextResponse.json({ ok: true, tail: {} });
    }

    const tail: Record<string, string | null> = {};

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[realtime/tail] D1 binding not available');
    try {
      await Promise.all(
        tables.map(async (t) => {
          tail[t] = await fetchMaxCreatedAtD1(d1, t);
        }),
      );
    } catch (err) {
      if (err instanceof RealtimeFilterNotAllowedError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true, tail });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
