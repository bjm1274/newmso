/**
 * Phase 8-A — 교육 마감 임박 알림 보강.
 * education_records.deadline 이 오늘부터 1~7일, completed_at IS NULL
 *   → staff_id 에게 'education' 알림.
 * dedupe key: `education:{record_id}`
 */
import 'server-only';
import { getKoreanTodayString, formatKoreanDateKey } from '@/lib/seoul-time';
import {
  type CheckJobResult,
  type NotificationInsertRow,
  emptyResult,
  errorMessage,
  loadExistingDedupeKeys,
  insertNotificationsChunked,
} from './types';
import {
  getD1Binding,
  getD1Drizzle,
  education_records as educationRecordsTable,
  and,
  gte,
  lte,
  isNull,
  isNotNull,
} from '@/lib/db';

type EducationRow = {
  id: string;
  staff_id: string | null;
  education_name: string | null;
  deadline: string | null;
  completed_at: string | null;
  status: string | null;
};

export async function checkEducationDeadline(): Promise<CheckJobResult> {
  const now = new Date();
  // 교육 마감 비교는 KST 기준 날짜 키 — 서버(UTC)에서 toISOString을 쓰면 자정 부근 하루 어긋난다.
  const todayIso = getKoreanTodayString(now);
  const horizonIso = formatKoreanDateKey(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  const d1 = await getD1Binding();
  if (!d1) return { detected: 0, created: 0, errors: ['[check-education] D1 binding not available'] };
  const db = getD1Drizzle(d1);
  const d1Rows = await db
    .select({
      id: educationRecordsTable.id,
      staff_id: educationRecordsTable.staff_id,
      education_name: educationRecordsTable.education_name,
      deadline: educationRecordsTable.deadline,
      completed_at: educationRecordsTable.completed_at,
      status: educationRecordsTable.status,
    })
    .from(educationRecordsTable)
    .where(
      and(
        isNotNull(educationRecordsTable.deadline),
        isNull(educationRecordsTable.completed_at),
        gte(educationRecordsTable.deadline, todayIso),
        lte(educationRecordsTable.deadline, horizonIso),
      )
    )
    .limit(500);
  const rows = d1Rows as EducationRow[];
  if (rows.length === 0) return emptyResult();

  const userIds = Array.from(
    new Set(rows.map((r) => String(r.staff_id ?? '')).filter(Boolean)),
  );
  let sentKeys: Set<string>;
  try {
    sentKeys = await loadExistingDedupeKeys('education', userIds);
  } catch (err) {
    return { detected: rows.length, created: 0, errors: [errorMessage(err)] };
  }

  const toInsert: NotificationInsertRow[] = [];
  for (const row of rows) {
    const staffId = String(row.staff_id ?? '');
    if (!staffId) continue;
    const dedupeKey = `education:${row.id}`;
    if (sentKeys.has(`${staffId}|${dedupeKey}`)) continue;

    const name = row.education_name || '필수 교육';
    toInsert.push({
      user_id: staffId,
      type: 'education',
      title: `교육 마감 임박 — ${name}`,
      body: `${name} 마감일이 ${row.deadline}입니다. 이수 후 결과를 등록해 주세요.`,
      metadata: {
        type: 'education',
        record_id: row.id,
        deadline: row.deadline,
        dedupe_key: dedupeKey,
      },
      read_at: null,
    });
  }

  if (toInsert.length === 0) {
    return { detected: rows.length, created: 0, errors: [] };
  }
  const { created, errors } = await insertNotificationsChunked(toInsert);
  return { detected: rows.length, created, errors };
}

/**
 * 최근 메시지 — 기존 chat-push-dispatch가 처리.
 * 채팅 알림은 lib/chat-push-dispatch.ts 에서 notifications insert + 푸시까지
 * 일괄 처리되므로 본 cron 에서는 no-op 로 유지.
 */
export async function checkRecentMessages(): Promise<CheckJobResult> {
  return emptyResult();
}
