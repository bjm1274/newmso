import { createHash } from 'node:crypto';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { NOTICE_ROOM_ID } from '@/lib/constants';
import {
  messages as messagesTable,
  staff_members as staffMembersTable,
  congratulations_condolences as welfareTable,
  chat_rooms as chatRoomsTable,
  getD1Binding,
  getD1Drizzle,
  eq,
  and,
  ne,
  sql,
  lte,
  or,
  isNull } from '@/lib/db';
import { enqueueChatPushJob } from '@/lib/chat-push-enqueue';

export type BirthdayAnnouncementsResult = {
  ok: boolean;
  targetDate: string;
  processedCount: number;
  addedToWelfare: number;
  postedToChat: number;
  postedWelfareEvents?: number;
  errors: string[];
};

/**
 * @param nowOrDate Date 또는 KST 기준 'YYYY-MM-DD' (소급 실행용). 기본값: 현재 시각.
 */
export async function processBirthdayAnnouncements(
  nowOrDate: Date | string = new Date(),
): Promise<BirthdayAnnouncementsResult> {
  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error('[birthday-announcements] D1 binding not available');
  }
  const db = getD1Drizzle(d1);

  // KST date (정본 헬퍼 사용 — 하드코딩 +9h 오프셋 대체). 문자열이면 소급 날짜로 해석.
  const kstDateStr =
    typeof nowOrDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(nowOrDate.trim())
      ? nowOrDate.trim()
      : formatKoreanDateKey(nowOrDate instanceof Date ? nowOrDate : new Date());
  const [yearStr, monthStr, dayStr] = kstDateStr.split('-');
  const kstMonth = Number(monthStr);
  const kstDay = Number(dayStr);

  const activeStaffs = await db
    .select({
      id: staffMembersTable.id,
      name: staffMembersTable.name,
      company: staffMembersTable.company,
      department: staffMembersTable.department,
      position: staffMembersTable.position,
      resident_no: staffMembersTable.resident_no,
      birth_date: staffMembersTable.birth_date })
    .from(staffMembersTable)
    .where(eq(staffMembersTable.status, '재직'));

  const birthdayStaffs = activeStaffs.filter((staff) => {
    let birthMonth: number | null = null;
    let birthDay: number | null = null;

    if (staff.birth_date) {
      const cleanBirth = String(staff.birth_date).replace(/[^0-9]/g, '');
      if (cleanBirth.length === 8) {
        birthMonth = Number(cleanBirth.slice(4, 6));
        birthDay = Number(cleanBirth.slice(6, 8));
      } else if (cleanBirth.length === 4) {
        birthMonth = Number(cleanBirth.slice(0, 2));
        birthDay = Number(cleanBirth.slice(2, 4));
      } else if (String(staff.birth_date).includes('-')) {
        const parts = String(staff.birth_date).split('-');
        if (parts.length === 3) {
          birthMonth = Number(parts[1]);
          birthDay = Number(parts[2]);
        }
      }
    }

    if ((birthMonth === null || birthDay === null) && staff.resident_no) {
      const digits = String(staff.resident_no).replace(/[^0-9]/g, '');
      if (digits.length >= 6) {
        birthMonth = Number(digits.slice(2, 4));
        birthDay = Number(digits.slice(4, 6));
      }
    }

    return birthMonth === kstMonth && birthDay === kstDay;
  });

  let addedToWelfare = 0;
  let postedToChat = 0;
  const errors: string[] = [];
  // 항상 KST 오전 09:00 (UTC 00:00)을 메시지 발송 시간으로 고정하여 지연 시에도 09:00으로 표시되게 함
  const nowIso = `${kstDateStr}T00:00:00.000Z`;

  for (const staff of birthdayStaffs) {
    const welfareId = buildDeterministicId('welfare', staff.id, yearStr);
    const messageId = buildDeterministicId('chat', staff.id, yearStr);

    // 1) Add to congratulations_condolences
    try {
      await db.run(sql`
        INSERT OR IGNORE INTO congratulations_condolences (
          id, staff_id, staff_name, company, department, 
          event_type, event_date, relation, recipient, 
          amount, wreath_sent, status, memo
        ) VALUES (
          ${welfareId}, ${staff.id}, ${staff.name}, ${staff.company}, ${staff.department || ''},
          '생일', ${kstDateStr}, '본인', ${staff.name},
          50000, 0, '지급완료', '생일자 자동 등록'
        )
      `);
      addedToWelfare += 1;
    } catch (err) {
      errors.push(`Welfare error for ${staff.name}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 2) Post to Chat Notice room
    const companyLabel = staff.company || '병원';
    const deptLabel = staff.department ? `${staff.department} ` : '';
    const posLabel = staff.position || '직원';

    const content = `🎉 오늘은 [ ${companyLabel} ] ${deptLabel}${staff.name} ${posLabel}님의 기분 좋은 생일입니다!
마주치면 축하의 말 한마디씩 나누는 행복한 하루가 되었으면 좋겠습니다. 🎂🎈

${staff.name}님, 오늘 세상에서 가장 특별하고 행복한 하루 보내세요! 축하드립니다! 🥳❤️`;

    const messageRow = {
      id: messageId,
      room_id: NOTICE_ROOM_ID,
      sender_id: null,
      sender_name: '공지봇',
      content,
      created_at: nowIso };

    try {
      const inserted = await db
        .insert(messagesTable)
        .values(messageRow)
        .onConflictDoNothing()
        .returning({ id: messagesTable.id });

      const duplicateMessage = inserted.length === 0;

      if (!duplicateMessage) {
        // 소급 실행 시 과거 created_at 으로 last_message 를 덮지 않도록 가드
        await db
          .update(chatRoomsTable)
          .set({
            last_message: content,
            last_message_at: nowIso,
            last_message_preview: content.slice(0, 80) })
          .where(
            and(
              eq(chatRoomsTable.id, NOTICE_ROOM_ID),
              or(isNull(chatRoomsTable.last_message_at), lte(chatRoomsTable.last_message_at, nowIso)),
            ),
          )
          .run();
        await enqueueChatPushJob({
          messageId,
          roomId: NOTICE_ROOM_ID,
          senderId: null }).catch((err) => {
          console.warn('[birthday-announcements] Failed to enqueue chat push job', err);
        });
        postedToChat += 1;
      }
    } catch (err) {
      errors.push(`Chat error for ${staff.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 3) Process other family events from congratulations_condolences table
  let postedWelfareEvents = 0;
  try {
    const welfareEvents = await db
      .select({
        id: welfareTable.id,
        staff_name: welfareTable.staff_name,
        company: welfareTable.company,
        department: welfareTable.department,
        event_type: welfareTable.event_type,
        event_date: welfareTable.event_date,
        relation: welfareTable.relation,
        recipient: welfareTable.recipient,
        memo: welfareTable.memo })
      .from(welfareTable)
      .where(
        and(
          eq(welfareTable.event_date, kstDateStr),
          ne(welfareTable.event_type, '생일')
        )
      );

    for (const event of welfareEvents) {
      const eventMessageId = buildDeterministicWelfareEventMessageId(event.id, kstDateStr);
      
      const eventContent = formatWelfareEventNoticeMessage({
        eventType: event.event_type || '경조사',
        employeeName: event.staff_name || '직원',
        department: event.department || '',
        company: event.company || 'SY INC.',
        relation: event.relation || '본인',
        recipient: event.recipient || '',
        eventDate: event.event_date || kstDateStr,
        memo: event.memo || '' });

      const eventMessageRow = {
        id: eventMessageId,
        room_id: NOTICE_ROOM_ID,
        sender_id: null,
        sender_name: '공지봇',
        content: eventContent,
        created_at: nowIso };

      try {
        const inserted = await db
          .insert(messagesTable)
          .values(eventMessageRow)
          .onConflictDoNothing()
          .returning({ id: messagesTable.id });

        const duplicateMessage = inserted.length === 0;

        if (!duplicateMessage) {
          await db
            .update(chatRoomsTable)
            .set({
              last_message: eventContent,
              last_message_at: nowIso,
              last_message_preview: eventContent.slice(0, 80) })
            .where(
              and(
                eq(chatRoomsTable.id, NOTICE_ROOM_ID),
                or(isNull(chatRoomsTable.last_message_at), lte(chatRoomsTable.last_message_at, nowIso)),
              ),
            )
            .run();
          await enqueueChatPushJob({
            messageId: eventMessageId,
            roomId: NOTICE_ROOM_ID,
            senderId: null }).catch((err) => {
            console.warn('[birthday-announcements] Failed to enqueue welfare chat push job', err);
          });
          postedWelfareEvents += 1;
        }
      } catch (err) {
        errors.push(`Welfare event chat error for ${event.staff_name} (${event.event_type}): ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    errors.push(`Welfare event fetch error: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    ok: true,
    targetDate: kstDateStr,
    processedCount: birthdayStaffs.length,
    addedToWelfare,
    postedToChat,
    postedWelfareEvents,
    errors };
}

function buildDeterministicId(namespace: string, staffId: string, year: string) {
  const source = `erp-birthday:${namespace}:${staffId}:${year}`;
  const bytes = createHash('sha256').update(source).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // Set version to 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Set variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function buildDeterministicWelfareEventMessageId(welfareId: string, eventDate: string) {
  const source = `erp-welfare-event:${welfareId}:${eventDate}`;
  const bytes = createHash('sha256').update(source).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // Set version to 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Set variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function formatWelfareEventNoticeMessage(event: {
  eventType: string;
  employeeName: string;
  department: string;
  company: string;
  relation: string;
  recipient: string;
  eventDate: string;
  memo: string;
}) {
  const companyLabel = event.company || 'SY INC.';
  const deptLabel = event.department ? `${event.department} ` : '';
  const relationLabel = event.relation || '본인';
  const recipientLabel = event.recipient ? ` (${event.recipient})` : '';
  const memoLabel = event.memo ? `\n• 비고: ${event.memo}` : '';
  
  if (event.eventType === '결혼') {
    return [
      `🎉 [경조사 알림] 임직원 [ ${companyLabel} ] ${deptLabel}${event.employeeName}님의 결혼 소식을 전해드립니다.`,
      `• 일시: ${event.eventDate}`,
      `• 대상: ${relationLabel}${recipientLabel}${memoLabel}`,
      '',
      '새롭게 시작하는 두 사람의 앞날에 따뜻한 축복을 보내주시기 바랍니다. 🤵👰'
    ].join('\n');
  }
  
  if (event.eventType.includes('사망') || event.eventType.includes('부고')) {
    return [
      `🙏 [경조사 알림] 임직원 [ ${companyLabel} ] ${deptLabel}${event.employeeName}님의 부고를 전해드립니다.`,
      `• 일시: ${event.eventDate}`,
      `• 대상: ${relationLabel}${recipientLabel}${memoLabel}`,
      '',
      '삼가 고인의 명복을 빌며, 임직원 여러분의 따뜻한 위로를 부탁드립니다. 🖤'
    ].join('\n');
  }

  if (event.eventType === '출산') {
    return [
      `🎉 [경조사 알림] 임직원 [ ${companyLabel} ] ${deptLabel}${event.employeeName}님의 득남/득녀(출산) 소식을 전해드립니다.`,
      `• 일시: ${event.eventDate}`,
      `• 대상: ${relationLabel}${recipientLabel}${memoLabel}`,
      '',
      '새로운 가족의 탄생을 진심으로 축하하며, 행복과 건강을 기원합니다. 👶'
    ].join('\n');
  }

  const prefix = event.eventType.includes('회갑') || event.eventType.includes('칠순') || event.eventType.includes('입학') || event.eventType.includes('졸업') ? '🎉' : '📢';
  return [
    `${prefix} [경조사 알림] 임직원 [ ${companyLabel} ] ${deptLabel}${event.employeeName}님의 경조사(${event.eventType}) 소식을 전해드립니다.`,
    `• 일시: ${event.eventDate}`,
    `• 대상: ${relationLabel}${recipientLabel}${memoLabel}`,
    '',
    '기쁜 일은 함께 축하하고, 뜻깊은 날에 따뜻한 격려를 보내주시기 바랍니다. ✨'
  ].join('\n');
}
