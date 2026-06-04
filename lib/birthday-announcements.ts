import { createHash } from 'node:crypto';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { NOTICE_ROOM_ID } from '@/lib/constants';
import {
  messages as messagesTable,
  staff_members as staffMembersTable,
  getD1Binding,
  getD1Drizzle,
  updateChatRoomLastMessage,
  eq,
  sql,
} from '@/lib/db';

type D1Db = ReturnType<typeof getD1Drizzle>;

export type BirthdayAnnouncementsResult = {
  ok: boolean;
  targetDate: string;
  processedCount: number;
  addedToWelfare: number;
  postedToChat: number;
  errors: string[];
};

export async function processBirthdayAnnouncements(now = new Date()): Promise<BirthdayAnnouncementsResult> {
  const d1 = await getD1Binding();
  if (!d1) {
    throw new Error('[birthday-announcements] D1 binding not available');
  }
  const db = getD1Drizzle(d1);

  // KST date today (정본 헬퍼 사용 — 하드코딩 +9h 오프셋 대체)
  const kstDateStr = formatKoreanDateKey(now);
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
      birth_date: staffMembersTable.birth_date,
    })
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
  const nowIso = now.toISOString();

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
      sender_name: '시스템',
      content,
      created_at: nowIso,
    };

    try {
      const inserted = await db
        .insert(messagesTable)
        .values(messageRow)
        .onConflictDoNothing()
        .returning({ id: messagesTable.id });

      const duplicateMessage = inserted.length === 0;

      if (!duplicateMessage) {
        await updateChatRoomLastMessage(db, {
          room_id: NOTICE_ROOM_ID,
          created_at: nowIso,
          content,
        });
        postedToChat += 1;
      }
    } catch (err) {
      errors.push(`Chat error for ${staff.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    ok: true,
    targetDate: kstDateStr,
    processedCount: birthdayStaffs.length,
    addedToWelfare,
    postedToChat,
    errors,
  };
}

function buildDeterministicId(namespace: string, staffId: string, year: string) {
  const source = `erp-birthday:${namespace}:${staffId}:${year}`;
  const bytes = createHash('sha256').update(source).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; // Set version to 5
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // Set variant
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
