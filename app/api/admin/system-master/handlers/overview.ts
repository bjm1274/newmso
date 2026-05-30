import { NextResponse } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  staff_members as staffMembersTable,
  audit_logs as auditLogsTable,
  payroll_records as payrollRecordsTable,
  chat_rooms as chatRoomsTable,
  messages as messagesTable,
  desc,
} from '@/lib/db';
import {
  normalizeAuditLog,
  normalizeChatRoom,
  normalizeMessage,
  type AuditLogRow,
  type ChatMessageRow,
  type ChatRoomRow,
  type LooseRecord,
  type PayrollRow,
  type StaffRow,
} from '../_shared';

export async function handleOverview(staffMap: Map<string, StaffRow>, safeStaffRows: StaffRow[]) {
  const d1 = await getD1Binding();
  if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available' }, { status: 500 });
  const db = getD1Drizzle(d1);
  const [
    staffCountRows, auditCountRows, payrollCountRows, roomCountRows, messageCountRows,
    auditRawRows, payrollRawRows, roomRawRows, messageRawRows,
  ] = await Promise.all([
    db.select({ id: staffMembersTable.id }).from(staffMembersTable).limit(10000),
    db.select({ id: auditLogsTable.id }).from(auditLogsTable).limit(10000),
    db.select({ id: payrollRecordsTable.id }).from(payrollRecordsTable).limit(10000),
    db.select({ id: chatRoomsTable.id }).from(chatRoomsTable).limit(10000),
    db.select({ id: messagesTable.id }).from(messagesTable).limit(100000),
    db.select().from(auditLogsTable).orderBy(desc(auditLogsTable.created_at)).limit(40),
    db.select({
      id: payrollRecordsTable.id,
      staff_id: payrollRecordsTable.staff_id,
      year_month: payrollRecordsTable.year_month,
      status: payrollRecordsTable.status,
      net_pay: payrollRecordsTable.net_pay,
      created_at: payrollRecordsTable.created_at,
    }).from(payrollRecordsTable).orderBy(desc(payrollRecordsTable.created_at)).limit(80),
    db.select({
      id: chatRoomsTable.id,
      name: chatRoomsTable.name,
      type: chatRoomsTable.type,
      members: chatRoomsTable.members,
      created_at: chatRoomsTable.created_at,
      last_message_at: chatRoomsTable.last_message_at,
    }).from(chatRoomsTable).orderBy(desc(chatRoomsTable.created_at)).limit(80),
    db.select({
      id: messagesTable.id,
      room_id: messagesTable.room_id,
      sender_id: messagesTable.sender_id,
      content: messagesTable.content,
      file_url: messagesTable.file_url,
      is_deleted: messagesTable.is_deleted,
      created_at: messagesTable.created_at,
      edited_at: messagesTable.edited_at,
    }).from(messagesTable).orderBy(desc(messagesTable.created_at)).limit(80),
  ]);
  // chat_rooms.members는 D1에서 TEXT(JSON) → 파싱
  const parsedRoomRows = (roomRawRows || []).map((row) => {
    const r = { ...row } as Record<string, unknown>;
    if (typeof r.members === 'string') {
      try { r.members = JSON.parse(r.members); } catch { r.members = []; }
    }
    return r as ChatRoomRow;
  });
  // audit_logs.details는 D1에서 TEXT(JSON) → 파싱
  const parsedAuditRows = (auditRawRows || []).map((row) => {
    const r = { ...row } as Record<string, unknown>;
    if (typeof r.details === 'string') {
      try { r.details = JSON.parse(r.details) as LooseRecord; } catch { r.details = {}; }
    }
    return r as AuditLogRow;
  });
  const overviewData = {
    staffCount: staffCountRows.length,
    auditCount: auditCountRows.length,
    payrollCount: payrollCountRows.length,
    roomCount: roomCountRows.length,
    messageCount: messageCountRows.length,
    auditRows: parsedAuditRows,
    payrollRows: payrollRawRows as unknown as PayrollRow[],
    roomRows: parsedRoomRows,
    messageRows: messageRawRows as unknown as ChatMessageRow[],
  };

  const rooms = overviewData.roomRows;
  const roomMap = new Map<string, ChatRoomRow>(rooms.map((room) => [String(room.id), room]));
  const payrollRows = overviewData.payrollRows;
  const payrollItems = payrollRows.map((record) => {
    const staff = staffMap.get(String(record.staff_id));
    return {
      ...record,
      staff_name: staff?.name || '-',
      employee_no: staff?.employee_no || null,
      company: staff?.company || '',
      department: staff?.department || '',
    };
  });

  return NextResponse.json({
    summary: {
      staffCount: overviewData.staffCount,
      auditCount: overviewData.auditCount,
      payrollCount: overviewData.payrollCount,
      roomCount: overviewData.roomCount,
      messageCount: overviewData.messageCount,
    },
    recentAudits: overviewData.auditRows.map((log) =>
      normalizeAuditLog(log, staffMap),
    ),
    sensitiveStaffs: safeStaffRows,
    recentPayrolls: payrollItems,
    chatRooms: rooms.map((room) => normalizeChatRoom(room, staffMap)),
    recentMessages: overviewData.messageRows.map((message) =>
      normalizeMessage(message, roomMap, staffMap),
    ),
  });
}
