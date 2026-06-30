/**
 * Phase 8-A — 단어 필터 (금지어 감지) 알림 보강.
 * messages 최근 MESSAGE_LOOKBACK_MIN(5) 분 내 INSERT 중 BANNED_WORDS 포함
 *   → 시스템 마스터 사용자에게 'word-filter' 알림.
 * dedupe key: `word-filter:{message_id}`
 *
 * BANNED_WORDS 저장 위치:
 *  - 운영: 환경변수 BANNED_WORDS_JSON (콤마 또는 JSON 배열)
 *  - fallback: lib/banned-words 의 DEFAULT_BANNED
 *  - 시스템마스터센터의 클라이언트 localStorage 값은 서버에서 접근 불가하므로
 *    별도 동기화 채널 필요 (현재 범위 밖. 후속 phase 에서 신규 테이블로 확장 가능).
 */
import 'server-only';
import {
  type CheckJobResult,
  type NotificationInsertRow,
  emptyResult,
  errorMessage,
  loadExistingDedupeKeys,
  insertNotificationsChunked } from './types';
import { DEFAULT_BANNED } from '../banned-words';
import {
  getD1Binding,
  getD1Drizzle,
  messages as messagesTable,
  staff_members as staffMembersTable,
  eq,
  and,
  gte,
  isNotNull } from '@/lib/db';

type MessageRow = {
  id: string;
  sender_id: string | null;
  sender_name: string | null;
  content: string | null;
  room_id: string | null;
  created_at: string | null;
};

const MESSAGE_LOOKBACK_MIN = 5;

function parseBannedWordsEnv(): string[] {
  const raw = String(process.env.BANNED_WORDS_JSON || '').trim();
  if (!raw) return DEFAULT_BANNED;
  // JSON 배열 형식 우선 시도
  if (raw.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter(Boolean);
      }
    } catch {
      // 다음 폴백 (콤마 분리)
    }
  }
  const list = raw
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);
  return list.length > 0 ? list : DEFAULT_BANNED;
}

async function loadMasterUserIds(): Promise<string[]> {
  const d1 = await getD1Binding();
  if (!d1) throw new Error('[check-word-filter] D1 binding not available (loadMasterUserIds)');
  const db = getD1Drizzle(d1);
  const rows = await db
    .select({ id: staffMembersTable.id })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.is_system_master, 1));
  return rows.map((r) => String(r.id || '')).filter(Boolean);
}

export async function checkWordFilter(): Promise<CheckJobResult> {
  const banned = parseBannedWordsEnv();
  if (banned.length === 0) return emptyResult();

  const cutoff = new Date(Date.now() - MESSAGE_LOOKBACK_MIN * 60 * 1000).toISOString();
  const d1 = await getD1Binding();
  if (!d1) return { detected: 0, created: 0, errors: ['[check-word-filter] D1 binding not available'] };
  const db = getD1Drizzle(d1);
  const d1Rows = await db
    .select({
      id: messagesTable.id,
      sender_id: messagesTable.sender_id,
      sender_name: messagesTable.sender_name,
      content: messagesTable.content,
      room_id: messagesTable.room_id,
      created_at: messagesTable.created_at })
    .from(messagesTable)
    .where(
      and(
        gte(messagesTable.created_at, cutoff),
        isNotNull(messagesTable.content),
      )
    )
    .limit(500);
  const rows = d1Rows as MessageRow[];
  if (rows.length === 0) return emptyResult();

  let masters: string[];
  try {
    masters = await loadMasterUserIds();
  } catch (err) {
    return { detected: rows.length, created: 0, errors: [errorMessage(err)] };
  }
  if (masters.length === 0) {
    return { detected: rows.length, created: 0, errors: [] };
  }

  const bannedLower = banned.map((w) => w.toLowerCase());
  const hits = rows.filter((row) => {
    const content = String(row.content || '').toLowerCase();
    if (!content) return false;
    return bannedLower.some((w) => w && content.includes(w));
  });
  if (hits.length === 0) return { detected: 0, created: 0, errors: [] };

  let sentKeys: Set<string>;
  try {
    sentKeys = await loadExistingDedupeKeys('word-filter', masters);
  } catch (err) {
    return { detected: hits.length, created: 0, errors: [errorMessage(err)] };
  }

  const toInsert: NotificationInsertRow[] = [];
  for (const msg of hits) {
    const dedupeKey = `word-filter:${msg.id}`;
    const senderText = msg.sender_name ? msg.sender_name : '익명';
    const snippet = (msg.content || '').slice(0, 80);
    for (const userId of masters) {
      if (sentKeys.has(`${userId}|${dedupeKey}`)) continue;
      toInsert.push({
        user_id: userId,
        type: 'word-filter',
        title: '⚠️ 금지어 사용 감지',
        body: `${senderText}: ${snippet}`,
        metadata: {
          type: 'word-filter',
          message_id: msg.id,
          room_id: msg.room_id,
          sender_id: msg.sender_id,
          dedupe_key: dedupeKey },
        read_at: null });
    }
  }

  if (toInsert.length === 0) {
    return { detected: hits.length, created: 0, errors: [] };
  }
  const { created, errors } = await insertNotificationsChunked(toInsert);
  return { detected: hits.length, created, errors };
}
