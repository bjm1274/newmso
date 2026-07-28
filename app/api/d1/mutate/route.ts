// ============================================================
// app/api/d1/mutate/route.ts
// Generic D1 INSERT / UPDATE / DELETE 엔드포인트.
//
// /api/d1/query (SELECT 전용)과 짝을 이루어 db.from() 호출의
// write 경로를 D1으로 라우팅. db-compatible 클라이언트 헬퍼가
// chained .insert / .update / .delete 호출 시 이 라우트로 fetch.
//
// 권한: 로그인 사용자 + POLICY_REGISTRY (Phase 4)로 op별 검증.
// 보안:
//   - ALLOWED_TABLES whitelist (POLICY_REGISTRY 등록 테이블만)
//   - 컬럼명/필드명 정규식 검증 (SQLi 차단)
//   - zod로 모든 입력 검증
//   - UPDATE/DELETE는 WHERE 절 필수 (전체 row 변경 금지)
//   - assertAccess로 각 op별 정책 검사
// ============================================================
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sql, getTableColumns, type SQL } from 'drizzle-orm';
import { readSessionFromRequest } from '@/lib/server-session';
import { emitRealtimeSignal } from '@/lib/realtime/server-signal';
import {
  userId,
  buildClaimsFromSession,
  normalizeBindValue,
  buildWhereSql } from '@/lib/d1-api-helpers';

/** Collect room_id values from insert/update/returning rows for scoped realtime channels. */
function collectRoomIds(payload: Payload, allResults?: Record<string, unknown>[]): Set<string> {
  const rowIds = new Set<string>();
  if (allResults) {
    allResults.forEach((r) => {
      if (r.room_id) rowIds.add(String(r.room_id));
    });
  }
  if (payload.op === 'insert') {
    payload.values.forEach((v) => {
      if (v.room_id) rowIds.add(String(v.room_id));
    });
  }
  if (payload.op === 'update') {
    payload.where.forEach((w) => {
      if (w.field === 'room_id' && w.op === 'eq') rowIds.add(String(w.value));
    });
    if (payload.set.room_id) rowIds.add(String(payload.set.room_id));
  }
  if (payload.op === 'delete') {
    payload.where.forEach((w) => {
      if (w.field === 'room_id' && w.op === 'eq') rowIds.add(String(w.value));
    });
  }
  return rowIds;
}

async function triggerMutationSignal(payload: Payload, allResults?: Record<string, unknown>[]) {
  try {
    const table = payload.table;
    const channels = new Set<string>();

    if (table === 'messages') {
      // Bare table for global unread list; room-scoped for open conversation.
      channels.add('messages');
      channels.add('chat_rooms');
      collectRoomIds(payload, allResults).forEach((rid) => {
        channels.add(`messages:room_id=eq.${rid}`);
      });
    } else if (table === 'chat_rooms') {
      channels.add('chat_rooms');
    } else if (table === 'room_read_cursors') {
      channels.add('room_read_cursors');
      channels.add('chat_rooms');
      collectRoomIds(payload, allResults).forEach((rid) => {
        channels.add(`room_read_cursors:room_id=eq.${rid}`);
      });
    } else if (table === 'message_reactions') {
      // No room_id column on message_reactions — table-level only.
      channels.add('message_reactions');
    } else if (table === 'notifications') {
      channels.add('notifications');
      const userIds = new Set<string>();
      if (allResults) {
        allResults.forEach((r) => {
          if (r.user_id) userIds.add(String(r.user_id));
        });
      }
      if (payload.op === 'insert') {
        payload.values.forEach((v) => {
          if (v.user_id) userIds.add(String(v.user_id));
        });
      }
      userIds.forEach((uid) => {
        channels.add(`notifications:user_id=eq.${uid}`);
      });
    } else if (table === 'message_bookmarks') {
      channels.add('message_bookmarks');
      collectRoomIds(payload, allResults).forEach((rid) => {
        channels.add(`message_bookmarks:room_id=eq.${rid}`);
      });
    } else if (table === 'pinned_messages') {
      channels.add('pinned_messages');
      collectRoomIds(payload, allResults).forEach((rid) => {
        channels.add(`pinned_messages:room_id=eq.${rid}`);
      });
    } else if (table === 'polls') {
      channels.add('polls');
      collectRoomIds(payload, allResults).forEach((rid) => {
        channels.add(`polls:room_id=eq.${rid}`);
      });
    } else if (table === 'poll_votes') {
      // poll_votes has no room_id column — table-level for poll UI refresh.
      channels.add('poll_votes');
    } else {
      channels.add(table);
    }

    if (channels.size > 0) {
      await emitRealtimeSignal({
        channels: Array.from(channels),
        source: `mutate-${payload.op}-${table}`,
      });
    }
  } catch (err) {
    console.error('[triggerMutationSignal] Failed to send realtime signal:', err);
  }
}

import {
  getD1Binding,
  getD1Drizzle,
  assertAccess,
  PolicyDenied,
  PolicyMissing,
  POLICY_REGISTRY } from '@/lib/db';
import { JSON_COLUMNS } from '@/lib/db/json-columns';
import * as schema from '@/lib/db/schema';
import { consumeRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Rate limit: 분당 100회 per user
const D1_MUTATE_RATE_LIMIT_MAX = 100;
const D1_MUTATE_RATE_LIMIT_WINDOW_MS = 60 * 1000;

const ALLOWED_TABLES = new Set(Object.keys(POLICY_REGISTRY));
const COLUMN_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const MAX_ROWS_PER_INSERT = 100;

// DDL(CREATE TABLE / INDEX / ALTER)은 핫패스에서 실행하지 않는다.
// disciplinary_committees·employment_contracts 스키마는 lib/db/migrations 로 적용됨.

// RETURNING 컬럼 — 일반 컬럼명 또는 '*'(전체 컬럼). db .select('*') 호환.
const ReturningColSchema = z.string().refine((c) => c === '*' || COLUMN_RE.test(c), {
  message: 'invalid returning column' });

const WhereSchema = z.object({
  field: z.string().regex(COLUMN_RE),
  op: z.enum(['eq', 'neq', 'in', 'lt', 'gt', 'lte', 'gte', 'is', 'isNot', 'like', 'ilike', 'contains']),
  value: z.unknown() });

const InsertSchema = z.object({
  op: z.literal('insert'),
  table: z.string(),
  values: z.array(z.record(z.string().regex(COLUMN_RE), z.unknown())).min(1).max(MAX_ROWS_PER_INSERT),
  onConflict: z.enum(['ignore', 'replace']).optional(),
  conflict: z.object({
    columns: z.array(z.string().regex(COLUMN_RE)).min(1).max(8),
    action: z.enum(['update', 'ignore']) }).optional(),
  returning: z.array(ReturningColSchema).optional() });

const UpdateSchema = z.object({
  op: z.literal('update'),
  table: z.string(),
  set: z.record(z.string().regex(COLUMN_RE), z.unknown()),
  where: z.array(WhereSchema).min(1).max(20),
  returning: z.array(ReturningColSchema).optional() });

const DeleteSchema = z.object({
  op: z.literal('delete'),
  table: z.string(),
  where: z.array(WhereSchema).min(1).max(20) });

const PayloadSchema = z.discriminatedUnion('op', [InsertSchema, UpdateSchema, DeleteSchema]);

type Payload = z.infer<typeof PayloadSchema>;

function whereToRowProxy(where: { field: string; op: string; value: unknown }[]): Record<string, unknown> {
  // assertAccess의 row 인자에 사용. eq 조건만 field=value로 사용.
  const proxy: Record<string, unknown> = {};
  for (const cond of where) {
    if (cond.op === 'eq') proxy[cond.field] = cond.value;
  }
  return proxy;
}

/**
 * 한 번의 update/delete 가 정책 검사를 받을 수 있는 최대 행 수.
 * 초과 요청은 400 으로 거부하고 전용 서버 라우트를 쓰도록 유도한다.
 * (알림 일괄 읽음은 50개 청크, 근태 일괄 정정은 월 단위라 200 이면 충분하다.)
 */
const MAX_POLICY_ROWS_PER_MUTATION = 200;

/**
 * UPDATE/DELETE 정책 판정 대상 행을 **클라이언트 WHERE 로 실제 조회**해서 돌려준다.
 *
 * 이전 구현은 `where` 의 eq 필드 + `set` 을 합성한 *가상 행* 하나에 정책을 적용했다.
 * 그런데 실제 SQL 은 클라이언트 WHERE 를 그대로 실행하므로 판정 대상과 실행 대상이 달랐고,
 * `set` 에 소유권 필드를 심으면(`current_approver_id`, `company` 등) 정책을 통과한 뒤
 * `where: [{id, neq, ''}]` 같은 조건으로 테이블 전체를 바꿀 수 있었다.
 *
 * 이제는 WHERE 가 실제로 잡는 행들을 읽어 각 행마다 정책을 검사한다.
 *
 * 반환하는 행은 **DB 정본 그대로**다. 여기에 set 을 병합하면 안 된다 —
 * 병합하면 `set:{current_approver_id: 내id}` 가 정본을 덮어써 소유권 위조가 다시 뚫린다.
 * (실제로 그렇게 만들었다가 런타임 검증에서 공격이 통과하는 것을 확인했다.)
 * 변경 후 상태를 봐야 하는 컬럼 가드에는 호출부가 `{...정본, ...set}` 을 guardRow 로 따로 넘긴다.
 *
 * 조회가 불가능한 상황(테이블 미허용 등)에서는 기존 방식의 합성 행으로 폴백한다.
 */
async function loadPolicyRowsForMutation(
  db: ReturnType<typeof getD1Drizzle>,
  table: string,
  op: 'update' | 'delete',
  where: { field: string; op: string; value: unknown }[],
  set?: Record<string, unknown>,
): Promise<{ rows: Record<string, unknown>[]; tooMany: boolean; loadedFromDb: boolean }> {
  const whereProxy = whereToRowProxy(where);
  const setProxy = set ?? {};
  const fallback = { rows: [{ ...whereProxy, ...setProxy }], tooMany: false, loadedFromDb: false };

  if (!ALLOWED_TABLES.has(table) || !COLUMN_RE.test(table)) return fallback;
  if (!where || where.length === 0) return fallback;

  // 행 내용과 무관한 정책(PUBLIC/AUTHENTICATED)이고 컬럼 가드도 없으면 조회가 무의미하다.
  // 어떤 행을 잡든 판정이 같으므로 기존처럼 합성 행 1개로 검사해 왕복을 아낀다.
  // (이 경우의 위험은 정책 자체가 과도하게 열려 있다는 것이며, 그건 policies.ts 에서 다룰 문제다.)
  const cfg = POLICY_REGISTRY[table];
  const pattern = cfg?.[op];
  const rowIndependent = pattern === 'PUBLIC' || pattern === 'AUTHENTICATED';
  const hasGuards = Boolean(cfg?.guards?.[op]) || Boolean(cfg?.asyncGuards?.[op]);
  if (cfg && rowIndependent && !hasGuards) return fallback;

  try {
    const whereParts = buildWhereSql(where);
    if (whereParts.length === 0) return fallback;
    const result = await db.run(
      sql`SELECT * FROM ${sql.identifier(table)} WHERE ${sql.join(whereParts, sql` AND `)} LIMIT ${
        MAX_POLICY_ROWS_PER_MUTATION + 1
      }`,
    );
    const existing = ((result as { results?: unknown[] }).results ?? []) as Record<string, unknown>[];

    // 대상 행이 없으면 실행해도 no-op — 정책 검사를 통과시키되 SQL 은 0건에 적용된다.
    if (existing.length === 0) return { rows: [], tooMany: false, loadedFromDb: true };
    if (existing.length > MAX_POLICY_ROWS_PER_MUTATION) {
      return { rows: [], tooMany: true, loadedFromDb: true };
    }

    // DB 정본 그대로 — set 을 병합하지 않는다(위 주석 참조).
    return { rows: existing, tooMany: false, loadedFromDb: true };
  } catch (err) {
    console.error(`[d1/mutate] loadPolicyRowsForMutation failed for ${table}:`, err);
    return fallback;
  }
}

// ─────────────────────────────────────────────────────────────
// JSON 직렬화/역직렬화 헬퍼 (수정 2)
// ─────────────────────────────────────────────────────────────

/**
 * INSERT values / UPDATE set 에서 객체·배열 값을 JSON.stringify 로 변환.
 * D1(SQLite)은 객체/배열을 bound value로 처리하지 못하므로 TEXT로 직렬화.
 * null / 원시값(string, number, boolean)은 그대로 통과.
 */
function serializeRecord(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (v !== null && typeof v === 'object') {
      result[k] = JSON.stringify(v);
    } else if (typeof v === 'boolean') {
      // D1(SQLite)은 boolean bound parameter를 거부 — 정수(0/1)로 변환
      result[k] = v ? 1 : 0;
    } else {
      result[k] = v;
    }
  }
  return result;
}

/**
 * RETURNING 결과 행의 JSON 컬럼을 TEXT → 객체/배열로 역직렬화.
 * parse 실패 시 원본 문자열 유지 (graceful — JM3).
 */
function deserializeRow(
  table: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const jsonCols = JSON_COLUMNS[table];
  if (!jsonCols || jsonCols.length === 0) return row;
  const result: Record<string, unknown> = { ...row };
  for (const col of jsonCols) {
    const val = result[col];
    if (typeof val === 'string') {
      try {
        result[col] = JSON.parse(val);
      } catch {
        // parse 실패 → 원본 문자열 유지
      }
    }
  }
  return result;
}

function deserializeRows(
  table: string,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const jsonCols = JSON_COLUMNS[table];
  if (!jsonCols || jsonCols.length === 0) return rows;
  return rows.map((row) => deserializeRow(table, row));
}

function buildReturningSql(returning: string[] | undefined): SQL {
  if (!returning || returning.length === 0) return sql.raw('');
  if (returning.includes('*')) return sql` RETURNING *`;
  return sql` RETURNING ${sql.join(returning.map((c) => sql.identifier(c)), sql`, `)}`;
}

/**
 * INSERT 시 id 컬럼에 UUID를 채워야 하는 테이블인지 판별.
 * Supabase→D1 마이그레이션 과정에서 Postgres의 `id DEFAULT gen_random_uuid()`가
 * 유실되어, text PK인 id는 클라이언트가 값을 넘기지 않으면 NOT NULL 위반이 난다.
 * integer PK(SQLite rowid 자동 부여)·id 없는 테이블은 제외한다.
 */
function tableHasTextId(table: string): boolean {
  const def = (schema as Record<string, unknown>)[table];
  if (!def) return false;
  try {
    const idCol = getTableColumns(def as Parameters<typeof getTableColumns>[0]).id;
    return !!idCol && idCol.getSQLType().toLowerCase().startsWith('text');
  } catch {
    return false;
  }
}

/** Drizzle schema에 정의된 해당 테이블의 유효 컬럼 키 Set 리턴 (미존재 컬럼 insert/update 원천 차단). */
function getKnownTableColumns(table: string): Set<string> | null {
  const def = (schema as Record<string, unknown>)[table];
  if (!def) return null;
  try {
    const cols = getTableColumns(def as Parameters<typeof getTableColumns>[0]);
    return new Set(Object.keys(cols));
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!userId(session?.user)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // Rate limit: 분당 100회 per user (check+increment 원자적)
    const uid = userId(session?.user)!;
    const rateKey = `d1-mutate:${uid}`;
    const rate = await consumeRateLimit(rateKey, D1_MUTATE_RATE_LIMIT_MAX, D1_MUTATE_RATE_LIMIT_WINDOW_MS);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: '요청이 너무 잦습니다.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSec ?? 60) } },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const payload: Payload = parsed.data;
    if (!ALLOWED_TABLES.has(payload.table)) {
      return NextResponse.json(
        { ok: false, error: `Table not allowed: ${payload.table}` },
        { status: 403 },
      );
    }
    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 binding not available' }, { status: 500 });
    }

    const db = getD1Drizzle(d1);
    const claims = buildClaimsFromSession(session?.user);

    if (payload.op === 'insert') {
      // 각 row에 정책 검사
      for (const row of payload.values) {
        await assertAccess({ db, claims, table: payload.table, op: 'insert', row });
      }
      // text PK인 id가 누락된 행에 UUID 생성 — D1에는 id DEFAULT가 없다.
      const fillId = tableHasTextId(payload.table);
      // 객체/배열 값을 D1 bound value로 전달 가능한 TEXT로 직렬화 (수정 2)
      const serializedValues = payload.values.map((row) => {
        const withId =
          fillId && (row.id === undefined || row.id === null)
            ? { ...row, id: crypto.randomUUID() }
            : row;
        return serializeRecord(withId);
      });
      const tableSql = sql.identifier(payload.table);
      const knownCols = getKnownTableColumns(payload.table);
      const allCols = Array.from(
        serializedValues.reduce<Set<string>>((acc, row) => {
          Object.keys(row).forEach((k) => {
            if (COLUMN_RE.test(k) && (!knownCols || knownCols.has(k))) {
              acc.add(k);
            }
          });
          return acc;
        }, new Set()),
      );
      const colsSql = sql.join(allCols.map((c) => sql.identifier(c)), sql`, `);
      const returningSql = buildReturningSql(payload.returning);

      // Cloudflare D1 has a limit of 100 bound parameters per query.
      // We dynamically calculate a safe chunk size (e.g. max 90 parameters per chunk) to avoid this limit.
      const maxRowsPerChunk = Math.max(1, Math.floor(90 / allCols.length));
      const chunks: Record<string, unknown>[][] = [];
      for (let i = 0; i < serializedValues.length; i += maxRowsPerChunk) {
        chunks.push(serializedValues.slice(i, i + maxRowsPerChunk));
      }

      const allResults: Record<string, unknown>[] = [];

      for (const chunk of chunks) {
        const valuesSql = sql.join(
          chunk.map((row) =>
            sql`(${sql.join(allCols.map((c) => sql`${row[c] ?? null}`), sql`, `)})`,
          ),
          sql`, `,
        );

        let stmt: SQL;
        if (payload.conflict) {
          // 복합 ON CONFLICT(...) DO UPDATE/NOTHING
          const conflictColsSql = sql.join(
            payload.conflict.columns.map((c) => sql.identifier(c)),
            sql`, `,
          );
          const conflictSet = new Set(payload.conflict.columns);
          // PK(id)는 conflict UPDATE 대상에서 제외 — 기존 행의 기본키를 덮어쓰지 않도록.
          const updateCols = allCols.filter((c) => !conflictSet.has(c) && c !== 'id');
          const shouldUpdate =
            payload.conflict.action === 'update' && updateCols.length > 0;
          const onConflictClause = shouldUpdate
            ? sql` ON CONFLICT(${conflictColsSql}) DO UPDATE SET ${sql.join(
                updateCols.map((c) => sql`${sql.identifier(c)} = excluded.${sql.identifier(c)}`),
                sql`, `,
              )}`
            : sql` ON CONFLICT(${conflictColsSql}) DO NOTHING`;
          stmt = sql`INSERT INTO ${tableSql} (${colsSql}) VALUES ${valuesSql}${onConflictClause}${returningSql}`;
        } else {
          // 기존 INSERT / INSERT OR REPLACE / INSERT OR IGNORE
          const verb = payload.onConflict === 'replace'
            ? sql.raw('INSERT OR REPLACE')
            : payload.onConflict === 'ignore'
              ? sql.raw('INSERT OR IGNORE')
              : sql.raw('INSERT');
          stmt = sql`${verb} INTO ${tableSql} (${colsSql}) VALUES ${valuesSql}${returningSql}`;
        }

        const result = await db.run(stmt);
        const rows = ((result as { results?: unknown[] }).results ?? []) as Record<string, unknown>[];
        allResults.push(...rows);
      }

      // 채팅 메시지 INSERT 시:
      // 1) chat_rooms.last_message_at/last_message_preview를 갱신 (D1 trigger 대체)
      // 2) chat_push_jobs 큐에 적재 (푸시 알림)
      // 3) 즉시 디스패치는 응답 경로 밖에서 처리 (모바일 전송 지연/타임아웃 방지)
      //
      // 핫패스(응답 전 await): room preview + enqueue 만 보장.
      // FCM/WebPush 실발송은 느리고 큐 적체 시 전송 자체를 실패로 보이게 하므로
      // waitUntil(가능 시) 또는 fire-and-forget + client trigger/cron 폴백으로 분리한다.
      if (payload.table === 'messages' && allResults.length > 0) {
        const bgResults = [...allResults];
        // (1)+(2) 응답 전 완료 — 목록 preview·큐 영속성
        try {
          const { updateChatRoomLastMessage } = await import('@/lib/db/functions/triggers');
          const seenRoomIds = new Set<string>();
          for (const r of bgResults) {
            const row = r as Record<string, unknown>;
            const roomId = String(row.room_id ?? '').trim();
            if (!roomId || seenRoomIds.has(roomId)) continue;
            seenRoomIds.add(roomId);
            await updateChatRoomLastMessage(db, {
              room_id: roomId,
              created_at: String(row.created_at ?? new Date().toISOString()),
              content: row.content != null ? String(row.content) : null,
              file_name: row.file_name != null ? String(row.file_name) : null });
          }
        } catch (triggerErr) {
          console.error('[d1/mutate] chat_rooms last_message update failed (non-fatal):', triggerErr);
        }
        try {
          const { enqueueChatPushJob } = await import('@/lib/chat-push-enqueue');
          await Promise.all(
            bgResults.map((r) => {
              const row = r as Record<string, unknown>;
              const messageId = String(row.id ?? '');
              const roomId = String(row.room_id ?? '');
              if (!messageId || !roomId) return Promise.resolve();
              return enqueueChatPushJob({
                messageId,
                roomId,
                senderId: (row.sender_id as string | null) ?? null });
            }),
          );
        } catch (enqueueErr) {
          console.error('[d1/mutate] chat_push_jobs 적재 실패 (non-fatal):', enqueueErr);
        }

        // (3) 이번 INSERT 메시지에 한해 즉시 디스패치 — 전체 pending 큐 drain 금지.
        // processPendingChatPushJobs(N) 은 오래된 job 부터 N건을 처리해 전송 RTT를 폭증시켰다.
        const dispatchInsertedPushes = async () => {
          try {
            const { dispatchChatPushForMessage } = await import('@/lib/chat-push-dispatch');
            const targets = bgResults
              .map((r) => {
                const row = r as Record<string, unknown>;
                return {
                  messageId: String(row.id ?? '').trim(),
                  roomId: String(row.room_id ?? '').trim() };
              })
              .filter((t) => t.messageId && t.roomId)
              .slice(0, 10);
            await Promise.all(
              targets.map((t) =>
                dispatchChatPushForMessage({
                  roomId: t.roomId,
                  messageId: t.messageId }).catch((err) => {
                  console.error('[d1/mutate] immediate chat-push failed (non-fatal):', err);
                }),
              ),
            );
          } catch (dispatchErr) {
            console.error('[d1/mutate] 즉시 chat-push 디스패치 실패 (non-fatal, cron 회수):', dispatchErr);
          }
        };

        // Cloudflare Workers: waitUntil 로 응답 후 작업 보장. 로컬/미지원 시 fire-and-forget.
        // (클라이언트 triggerChatPush + 5분 cron 이 최종 폴백)
        let scheduled = false;
        try {
          const { getCloudflareContext } = await import('@opennextjs/cloudflare');
          const cf = getCloudflareContext();
          const waitUntil = (cf as { ctx?: { waitUntil?: (p: Promise<unknown>) => void } })?.ctx?.waitUntil;
          if (typeof waitUntil === 'function') {
            waitUntil(dispatchInsertedPushes());
            scheduled = true;
          }
        } catch {
          // getCloudflareContext 불가(로컬 next dev 등)
        }
        if (!scheduled) {
          void dispatchInsertedPushes();
        }
      }

      // notifications INSERT — 인앱 행만 만들고 푸시가 나가지 않던 문제 수정.
      //
      // 클라이언트(전자결재 상신·계약서 서명요청·급여명세서 발송·재고 불출 승인·근태·OP 등)가
      // d1.from('notifications').insert(...) 로 만드는 알림은 이 라우트로 들어오는데,
      // 여기에 푸시 디스패치가 없어 "인앱에는 뜨는데 단말에는 안 오는" 상태였다.
      // 서버 경로(insertNotificationsOrThrow / insertNotificationsChunked)는 이미
      // dispatchPushForNotificationRows 를 호출하므로, 그와 동일한 팬아웃을 여기서도 태운다.
      //
      // 주의: 호출부 대부분이 `.select()` 없이 `.insert()` 만 하므로 RETURNING 이 비어
      // allResults 가 빈 배열이다. 그래서 triggerMutationSignal 이 채널을 만들 때와 동일하게
      // payload.values 를 소스로 쓴다(RETURNING 이 있으면 그쪽을 우선).
      if (payload.table === 'notifications') {
        const notiRows: Record<string, unknown>[] =
          allResults.length > 0 ? [...allResults] : [...payload.values];
        const dispatchInsertedNotificationPushes = async () => {
          try {
            const { dispatchPushForNotificationRows } = await import(
              '@/lib/notification-push-dispatch'
            );
            const rows = notiRows
              .map((r) => r as Record<string, unknown>)
              .filter((row) => String(row.user_id ?? '').trim() !== '')
              .map((row) => {
                // notifications.metadata 는 D1 에서 TEXT(JSON) 이다 — 객체로 복원해서 넘긴다.
                let metadata: Record<string, unknown> | null = null;
                const raw = row.metadata;
                if (raw && typeof raw === 'object') {
                  metadata = raw as Record<string, unknown>;
                } else if (typeof raw === 'string' && raw.trim() !== '') {
                  try {
                    const parsed = JSON.parse(raw);
                    if (parsed && typeof parsed === 'object') metadata = parsed as Record<string, unknown>;
                  } catch {
                    // 파싱 불가한 metadata 는 무시 — 푸시 자체는 계속 보낸다.
                  }
                }
                return {
                  user_id: String(row.user_id),
                  type: String(row.type ?? 'notification'),
                  title: String(row.title ?? ''),
                  body: String(row.body ?? row.message ?? ''),
                  metadata };
              });
            if (rows.length === 0) return;
            await dispatchPushForNotificationRows(rows);
          } catch (pushErr) {
            console.error('[d1/mutate] notification push 디스패치 실패 (non-fatal):', pushErr);
          }
        };

        let notiScheduled = false;
        try {
          const { getCloudflareContext } = await import('@opennextjs/cloudflare');
          const cf = getCloudflareContext();
          const waitUntil = (cf as { ctx?: { waitUntil?: (p: Promise<unknown>) => void } })?.ctx?.waitUntil;
          if (typeof waitUntil === 'function') {
            waitUntil(dispatchInsertedNotificationPushes());
            notiScheduled = true;
          }
        } catch {
          // getCloudflareContext 불가(로컬 next dev 등)
        }
        if (!notiScheduled) {
          void dispatchInsertedNotificationPushes();
        }
      }

      // RETURNING 결과의 JSON 컬럼 역직렬화 (수정 2)
      await triggerMutationSignal(payload, allResults);
      return NextResponse.json({ ok: true, data: deserializeRows(payload.table, allResults) });
    }

    if (payload.op === 'update') {
      // where 가 id 뿐이면 staff_id 등 소유 필드가 없어 SELF_* 정책이 오판 deny 됨 → 기존 행 병합
      // 정책은 "클라이언트 WHERE 가 실제로 잡는 행" 전부에 대해 검사한다.
      // (합성 가상 행 1개만 검사하던 시절에는 set 으로 소유권을 위조해 통과한 뒤
      //  WHERE 로 테이블 전체를 바꿀 수 있었다.)
      const updateTargets = await loadPolicyRowsForMutation(
        db,
        payload.table,
        'update',
        payload.where,
        payload.set,
      );
      if (updateTargets.tooMany) {
        return NextResponse.json(
          {
            ok: false,
            error: `한 번에 수정할 수 있는 행 수(${MAX_POLICY_ROWS_PER_MUTATION})를 초과했습니다. 전용 API 를 사용하세요.`,
            code: 'TOO_MANY_ROWS' },
          { status: 400 },
        );
      }
      const updateChangedKeys = new Set(Object.keys(payload.set ?? {}));
      for (const row of updateTargets.rows) {
        await assertAccess({
          db,
          claims,
          table: payload.table,
          op: 'update',
          // 패턴은 변경 전 정본으로, 가드는 변경 후 상태로 판정한다.
          row,
          guardRow: { ...row, ...payload.set },
          changedKeys: updateChangedKeys });
      }
      // 객체/배열 값을 D1 bound value로 전달 가능한 TEXT로 직렬화 (수정 2)
      const serializedSet = serializeRecord(payload.set);
      const tableSql = sql.identifier(payload.table);
      const knownCols = getKnownTableColumns(payload.table);
      const setKeys = Object.keys(serializedSet).filter((k) => COLUMN_RE.test(k) && (!knownCols || knownCols.has(k)));
      // 스키마에 없는 컬럼은 여기서 제거된다. 예전에는 **아무 흔적 없이** 버려져,
      // 화면은 성공 토스트를 띄우는데 값은 저장되지 않는 무음 데이터 유실이 생겼다
      // (예: staff_members.agreed_overtime_allowance — 컬럼이 실재하지 않음).
      // 클라이언트 폴백(withMissingColumnsFallback)이 에러를 봐야 동작하므로,
      // 최소한 서버 로그와 응답에 남겨 유실을 관측 가능하게 한다.
      const droppedColumns = Object.keys(serializedSet).filter((k) => !setKeys.includes(k));
      if (droppedColumns.length > 0) {
        console.warn(
          `[d1/mutate] ${payload.table}: 스키마에 없는 컬럼을 무시함 → ${droppedColumns.join(', ')}`,
        );
      }
      if (setKeys.length === 0) {
        return NextResponse.json({ ok: false, error: 'Empty set' }, { status: 400 });
      }
      const setSql = sql.join(
        setKeys.map((k) => sql`${sql.identifier(k)} = ${serializedSet[k] ?? null}`),
        sql`, `,
      );
      const whereParts = buildWhereSql(payload.where);
      const returningSql = buildReturningSql(payload.returning);
      // 메시지 soft-delete 시 room_id 확보 — returning 없으면 where eq id로 선조회
      let messageRoomIdsForRefresh: string[] = [];
      if (payload.table === 'messages') {
        const touchesDelete =
          Object.prototype.hasOwnProperty.call(payload.set, 'is_deleted') ||
          Object.prototype.hasOwnProperty.call(payload.set, 'content');
        if (touchesDelete) {
          try {
            const idCond = payload.where.find((w) => w.field === 'id' && w.op === 'eq');
            const roomCond = payload.where.find((w) => w.field === 'room_id' && w.op === 'eq');
            if (roomCond?.value) {
              messageRoomIdsForRefresh = [String(roomCond.value)];
            } else if (idCond?.value) {
              const pre = await db.run(
                sql`SELECT room_id FROM messages WHERE id = ${normalizeBindValue(idCond.value)} LIMIT 1`,
              );
              const preRows = ((pre as { results?: unknown[] }).results ?? []) as Record<string, unknown>[];
              const rid = preRows[0]?.room_id;
              if (rid) messageRoomIdsForRefresh = [String(rid)];
            }
          } catch (e) {
            console.error('[d1/mutate] messages room_id prelookup failed:', e);
          }
        }
      }
      const stmt = sql`UPDATE ${tableSql} SET ${setSql} WHERE ${sql.join(whereParts, sql` AND `)}${returningSql}`;
      let updatedRows: Record<string, unknown>[] = [];
      if (payload.returning && payload.returning.length > 0) {
        const result = await db.run(stmt);
        updatedRows = ((result as { results?: unknown[] }).results ?? []) as Record<string, unknown>[];
        await triggerMutationSignal(payload, updatedRows);
      } else {
        await db.run(stmt);
        await triggerMutationSignal(payload);
      }
      // 메시지 삭제/수정 후 chat_rooms.last_message_preview 재계산 (목록에 삭제 전 내용 남는 버그 수정)
      if (payload.table === 'messages') {
        try {
          const { refreshChatRoomLastMessage } = await import('@/lib/db/functions/triggers');
          const roomIds = new Set<string>(messageRoomIdsForRefresh);
          for (const r of updatedRows) {
            const rid = r.room_id != null ? String(r.room_id) : '';
            if (rid) roomIds.add(rid);
          }
          for (const roomId of roomIds) {
            await refreshChatRoomLastMessage(db, roomId);
          }
        } catch (refreshErr) {
          console.error('[d1/mutate] refreshChatRoomLastMessage failed (non-fatal):', refreshErr);
        }
      }
      if (payload.returning && payload.returning.length > 0) {
        return NextResponse.json({ ok: true, data: deserializeRows(payload.table, updatedRows), ...(droppedColumns.length > 0 ? { droppedColumns } : {}) });
      }
      return NextResponse.json({ ok: true, ...(droppedColumns.length > 0 ? { droppedColumns } : {}) });
    }

    if (payload.op === 'delete') {
      // update 와 동일 — WHERE 가 실제로 잡는 행 전부에 정책을 적용한다.
      const deleteTargets = await loadPolicyRowsForMutation(db, payload.table, 'delete', payload.where);
      if (deleteTargets.tooMany) {
        return NextResponse.json(
          {
            ok: false,
            error: `한 번에 삭제할 수 있는 행 수(${MAX_POLICY_ROWS_PER_MUTATION})를 초과했습니다. 전용 API 를 사용하세요.`,
            code: 'TOO_MANY_ROWS' },
          { status: 400 },
        );
      }
      for (const row of deleteTargets.rows) {
        await assertAccess({ db, claims, table: payload.table, op: 'delete', row });
      }
      const tableSql = sql.identifier(payload.table);
      const whereParts = buildWhereSql(payload.where);
      const stmt = sql`DELETE FROM ${tableSql} WHERE ${sql.join(whereParts, sql` AND `)}`;
      await db.run(stmt);
      await triggerMutationSignal(payload);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, error: 'Unsupported op' }, { status: 400 });
  } catch (err) {
    if (err instanceof PolicyDenied || err instanceof PolicyMissing) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
