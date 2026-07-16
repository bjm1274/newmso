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

async function triggerMutationSignal(payload: Payload, allResults?: Record<string, unknown>[]) {
  try {
    const table = payload.table;
    const channels = new Set<string>();

    if (table === 'messages') {
      channels.add('messages');
      channels.add('chat_rooms');
      
      const rowIds = new Set<string>();
      if (allResults) {
        allResults.forEach(r => {
          if (r.room_id) rowIds.add(String(r.room_id));
        });
      }
      if (rowIds.size === 0 && payload.op === 'insert') {
        payload.values.forEach(v => {
          if (v.room_id) rowIds.add(String(v.room_id));
        });
      }
      if (rowIds.size === 0 && payload.op === 'update') {
        payload.where.forEach(w => {
          if (w.field === 'room_id' && w.op === 'eq') rowIds.add(String(w.value));
        });
        if (payload.set.room_id) rowIds.add(String(payload.set.room_id));
      }
      rowIds.forEach(rid => {
        channels.add(`messages:room_id=eq.${rid}`);
      });
    } else if (table === 'chat_rooms') {
      channels.add('chat_rooms');
    } else if (table === 'room_read_cursors') {
      channels.add('room_read_cursors');
      channels.add('chat_rooms');
      const rowIds = new Set<string>();
      if (allResults) {
        allResults.forEach(r => {
          if (r.room_id) rowIds.add(String(r.room_id));
        });
      }
      if (payload.op === 'insert') {
        payload.values.forEach(v => {
          if (v.room_id) rowIds.add(String(v.room_id));
        });
      }
      if (payload.op === 'update') {
        payload.where.forEach(w => {
          if (w.field === 'room_id' && w.op === 'eq') rowIds.add(String(w.value));
        });
        if (payload.set.room_id) rowIds.add(String(payload.set.room_id));
      }
      rowIds.forEach(rid => {
        channels.add(`room_read_cursors:room_id=eq.${rid}`);
      });
    } else if (table === 'message_reactions') {
      channels.add('message_reactions');
      const rowIds = new Set<string>();
      if (payload.op === 'insert') {
        payload.values.forEach(v => {
          if (v.room_id) rowIds.add(String(v.room_id));
        });
      }
      rowIds.forEach(rid => {
        channels.add(`messages:room_id=eq.${rid}`);
      });
    } else if (table === 'notifications') {
      channels.add('notifications');
      const userIds = new Set<string>();
      if (payload.op === 'insert') {
        payload.values.forEach(v => {
          if (v.user_id) userIds.add(String(v.user_id));
        });
      }
      userIds.forEach(uid => {
        channels.add(`notifications:user_id=eq.${uid}`);
      });
    } else if (table === 'message_bookmarks') {
      channels.add('message_bookmarks');
    } else if (table === 'pinned_messages') {
      channels.add('pinned_messages');
    } else if (table === 'polls') {
      channels.add('polls');
      const rowIds = new Set<string>();
      if (payload.op === 'insert') {
        payload.values.forEach(v => {
          if (v.room_id) rowIds.add(String(v.room_id));
        });
      }
      rowIds.forEach(rid => {
        channels.add(`polls:room_id=eq.${rid}`);
      });
    } else if (table === 'poll_votes') {
      channels.add('poll_votes');
      const rowIds = new Set<string>();
      if (payload.op === 'insert') {
        payload.values.forEach(v => {
          if (v.room_id) rowIds.add(String(v.room_id));
        });
      }
      rowIds.forEach(rid => {
        channels.add(`poll_votes:room_id=eq.${rid}`);
      });
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

/** update/delete 정책이 행 소유자(staff_id 등)를 보려면 기존 행 필드가 필요. */
const PATTERNS_NEEDING_EXISTING_ROW = new Set([
  'SELF_ONLY',
  'SELF_OR_SAME_COMPANY',
  'STAFF_IN_SCOPE',
  'APPROVAL_SCOPE',
  'ROSTER_APPROVER_OR_SELF',
  'MANAGE_COMPANY',
  'MANAGE_COMPANY_OR_NULL',
  'COMPANY_SCOPE_OR_NULL',
  'INVENTORY_SCOPE',
  'CHAT_ROOM_MEMBER',
]);

/**
 * UPDATE/DELETE 시 where 가 id 만 있고 staff_id 가 없으면 policy 가 항상 deny 된다
 * (예: 직원 본인 계약서 서명 → update employment_contracts where id=…).
 * 기존 행을 1건 읽어 row proxy 에 병합한다.
 */
async function enrichRowProxyForPolicy(
  db: ReturnType<typeof getD1Drizzle>,
  table: string,
  op: 'update' | 'delete',
  where: { field: string; op: string; value: unknown }[],
  set?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const proxy = { ...whereToRowProxy(where), ...(set ?? {}) };
  const cfg = POLICY_REGISTRY[table];
  if (!cfg) return proxy;

  const pattern = cfg[op];
  if (!pattern || !PATTERNS_NEEDING_EXISTING_ROW.has(pattern)) return proxy;

  const staffField = cfg.staffIdField ?? 'staff_id';
  const companyField = cfg.companyIdField ?? 'company_id';
  // 이미 소유자/회사 식별자가 있으면 추가 조회 불필요
  if (proxy[staffField] != null || proxy[companyField] != null) return proxy;

  const idCond = where.find((w) => w.field === 'id' && w.op === 'eq');
  if (!idCond || idCond.value == null || idCond.value === '') return proxy;
  if (!ALLOWED_TABLES.has(table) || !COLUMN_RE.test(table)) return proxy;

  try {
    const result = await db.run(
      sql`SELECT * FROM ${sql.identifier(table)} WHERE id = ${normalizeBindValue(idCond.value)} LIMIT 1`,
    );
    const rows = ((result as { results?: unknown[] }).results ?? []) as Record<string, unknown>[];
    const existing = rows[0];
    if (!existing) return proxy;
    // set/where 가 기존 행보다 우선 (서명 시 status 변경 등)
    return { ...existing, ...proxy };
  } catch (err) {
    console.error(`[d1/mutate] enrichRowProxyForPolicy failed for ${table}:`, err);
    return proxy;
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
      const allCols = Array.from(
        serializedValues.reduce<Set<string>>((acc, row) => {
          Object.keys(row).forEach((k) => acc.add(k));
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
      //
      // 서버리스 환경(Cloudflare Pages 등)에서는 비동기 작업이 응답 직후 강제 종료될 수 있으므로,
      // 반드시 await 처리하여 DB 갱신과 큐 적재가 완료된 후 응답을 반환해야 합니다.
      if (payload.table === 'messages' && allResults.length > 0) {
        const bgResults = [...allResults];
        await (async () => {
          // (1) chat_rooms 갱신
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
          // (2) 푸시 알림 큐 적재
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

          // (3) 카톡급 즉시 발송 — 클라이언트 chat-push 트리거 실패/앱 백그라운드여도 서버가 바로 처리.
          // 비용 가드: 이번 INSERT 건수와 10건 중 작은 값만 즉시 처리. 나머지는 5분 cron/flush.
          try {
            const { processPendingChatPushJobs } = await import('@/lib/chat-push-dispatch');
            const immediateLimit = Math.min(Math.max(bgResults.length, 1), 10);
            await processPendingChatPushJobs(immediateLimit);
          } catch (dispatchErr) {
            console.error('[d1/mutate] 즉시 chat-push 디스패치 실패 (non-fatal, cron 회수):', dispatchErr);
          }
        })();
      }

      // RETURNING 결과의 JSON 컬럼 역직렬화 (수정 2)
      await triggerMutationSignal(payload, allResults);
      return NextResponse.json({ ok: true, data: deserializeRows(payload.table, allResults) });
    }

    if (payload.op === 'update') {
      // where 가 id 뿐이면 staff_id 등 소유 필드가 없어 SELF_* 정책이 오판 deny 됨 → 기존 행 병합
      const row = await enrichRowProxyForPolicy(db, payload.table, 'update', payload.where, payload.set);
      await assertAccess({ db, claims, table: payload.table, op: 'update', row });
      // 객체/배열 값을 D1 bound value로 전달 가능한 TEXT로 직렬화 (수정 2)
      const serializedSet = serializeRecord(payload.set);
      const tableSql = sql.identifier(payload.table);
      const setKeys = Object.keys(serializedSet).filter((k) => COLUMN_RE.test(k));
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
        return NextResponse.json({ ok: true, data: deserializeRows(payload.table, updatedRows) });
      }
      return NextResponse.json({ ok: true });
    }

    if (payload.op === 'delete') {
      const row = await enrichRowProxyForPolicy(db, payload.table, 'delete', payload.where);
      await assertAccess({ db, claims, table: payload.table, op: 'delete', row });
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
