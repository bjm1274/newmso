import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readSessionFromRequest } from '@/lib/server-session';
import { isNamedSystemMasterAccount } from '@/lib/system-master';

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase service role configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function clampLimit(value: string | null, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value || fallback), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function sanitizeStaffRow(row: Record<string, any>) {
  const safe = { ...row };
  delete safe.password;
  delete safe.passwd;
  return safe;
}

function getStaffLabel(staff: Record<string, any> | undefined) {
  if (!staff) return '-';
  const pieces = [staff.name, staff.employee_no ? `#${staff.employee_no}` : null].filter(Boolean);
  return pieces.join(' ');
}

function getRoomLabel(room: Record<string, any>, staffMap: Map<string, Record<string, any>>) {
  if (!room) return '채팅방';
  if (room.id === NOTICE_ROOM_ID) return '공지메시지';
  if (room.name) return room.name;

  const memberNames = Array.isArray(room.members)
    ? room.members
        .map((memberId: string) => staffMap.get(String(memberId))?.name)
        .filter(Boolean)
    : [];

  return memberNames.length > 0 ? memberNames.join(', ') : '채팅방';
}

function getAuditCategory(log: Record<string, any>) {
  const action = String(log.action || '').toLowerCase();
  const targetType = String(log.target_type || '').toLowerCase();

  if (
    targetType.includes('payroll') ||
    action.includes('급여') ||
    action.includes('정산') ||
    action.includes('salary')
  ) {
    return 'payroll';
  }

  if (
    targetType.includes('message') ||
    targetType.includes('chat') ||
    targetType.includes('room') ||
    action.includes('message_') ||
    action.includes('채팅')
  ) {
    return 'chat';
  }

  if (
    targetType.includes('staff') ||
    targetType.includes('ess_profile') ||
    action.includes('인사') ||
    action.includes('권한') ||
    action.includes('직원') ||
    action.includes('profile')
  ) {
    return 'staff';
  }

  return 'general';
}

function matchSearch(value: unknown, keyword: string) {
  if (!keyword) return true;
  return JSON.stringify(value || '')
    .toLowerCase()
    .includes(keyword.toLowerCase());
}

function normalizeAuditLog(log: Record<string, any>, staffMap: Map<string, Record<string, any>>) {
  const details = log.details && typeof log.details === 'object' ? log.details : {};
  const targetStaff = log.target_id ? staffMap.get(String(log.target_id)) : undefined;
  const changedFields = Array.isArray((details as Record<string, any>).changed_fields)
    ? (details as Record<string, any>).changed_fields
    : Object.keys((details as Record<string, any>).after || (details as Record<string, any>).requested_changes || {});

  return {
    ...log,
    category: getAuditCategory(log),
    actor_label: log.user_name || getStaffLabel(log.user_id ? staffMap.get(String(log.user_id)) : undefined),
    target_label: targetStaff ? getStaffLabel(targetStaff) : log.target_id || '-',
    changed_fields: changedFields,
    details,
  };
}

function normalizeChatRoom(room: Record<string, any>, staffMap: Map<string, Record<string, any>>) {
  const memberNames = Array.isArray(room.members)
    ? room.members
        .map((memberId: string) => getStaffLabel(staffMap.get(String(memberId))))
        .filter((label: string) => label !== '-')
    : [];

  return {
    id: room.id,
    type: room.type || 'group',
    room_label: getRoomLabel(room, staffMap),
    member_count: Array.isArray(room.members) ? room.members.length : 0,
    member_labels: memberNames,
    created_at: room.created_at,
    last_message_at: room.last_message_at || null,
    last_activity_at: room.last_message_at || room.created_at || null,
  };
}

function normalizeMessage(message: Record<string, any>, rooms: Map<string, Record<string, any>>, staffMap: Map<string, Record<string, any>>) {
  const sender = message.sender_id ? staffMap.get(String(message.sender_id)) : undefined;
  const room = rooms.get(String(message.room_id));
  return {
    id: message.id,
    room_id: message.room_id,
    room_label: room ? getRoomLabel(room, staffMap) : '채팅방',
    sender_id: message.sender_id,
    sender_name: sender?.name || '알 수 없음',
    sender_company: sender?.company || '',
    content: message.content || '',
    file_url: message.file_url || null,
    is_deleted: message.is_deleted === true,
    created_at: message.created_at,
    edited_at: message.edited_at || null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const scope = searchParams.get('scope') || 'overview';
    const limit = clampLimit(searchParams.get('limit'), 120, 500);
    const keyword = String(searchParams.get('keyword') || '').trim();
    const roomId = String(searchParams.get('roomId') || '').trim();
    const category = String(searchParams.get('category') || 'all').trim();

    const supabase = getAdminClient();

    const { data: staffRows, error: staffError } = await supabase
      .from('staff_members')
      .select('*')
      .order('employee_no', { ascending: true })
      .limit(500);

    if (staffError) {
      return NextResponse.json({ error: '직원 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
    }

    const safeStaffRows = (staffRows || []).map((row: any) => sanitizeStaffRow(row));
    const staffMap = new Map<string, Record<string, any>>(
      safeStaffRows.map((staff: Record<string, any>) => [String(staff.id), staff])
    );

    if (scope === 'overview') {
      const [
        staffCountRes,
        auditCountRes,
        payrollCountRes,
        roomCountRes,
        messageCountRes,
        auditRes,
        payrollRes,
        roomRes,
        messageRes,
      ] = await Promise.all([
        supabase.from('staff_members').select('id', { head: true, count: 'exact' }),
        supabase.from('audit_logs').select('id', { head: true, count: 'exact' }),
        supabase.from('payroll_records').select('id', { head: true, count: 'exact' }),
        supabase.from('chat_rooms').select('id', { head: true, count: 'exact' }),
        supabase.from('messages').select('id', { head: true, count: 'exact' }),
        supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(40),
        supabase.from('payroll_records').select('*').order('created_at', { ascending: false }).limit(80),
        supabase.from('chat_rooms').select('*').order('created_at', { ascending: false }).limit(80),
        supabase.from('messages').select('*').order('created_at', { ascending: false }).limit(80),
      ]);

      const rooms = roomRes.data || [];
      const roomMap = new Map<string, Record<string, any>>(
        rooms.map((room: Record<string, any>) => [String(room.id), room])
      );

      const payrollItems = (payrollRes.data || []).map((record: Record<string, any>) => {
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
          staffCount: staffCountRes.count || 0,
          auditCount: auditCountRes.count || 0,
          payrollCount: payrollCountRes.count || 0,
          roomCount: roomCountRes.count || 0,
          messageCount: messageCountRes.count || 0,
        },
        recentAudits: (auditRes.data || []).map((log: Record<string, any>) => normalizeAuditLog(log, staffMap)),
        sensitiveStaffs: safeStaffRows,
        recentPayrolls: payrollItems,
        chatRooms: rooms.map((room: Record<string, any>) => normalizeChatRoom(room, staffMap)),
        recentMessages: (messageRes.data || []).map((message: Record<string, any>) =>
          normalizeMessage(message, roomMap, staffMap)
        ),
      });
    }

    if (scope === 'audit') {
      const { data: auditRows, error: auditError } = await supabase
        .from('audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (auditError) {
        return NextResponse.json({ error: auditError.message }, { status: 500 });
      }

      const filtered = (auditRows || [])
        .map((log: Record<string, any>) => normalizeAuditLog(log, staffMap))
        .filter((log: Record<string, any>) => category === 'all' || log.category === category)
        .filter((log: Record<string, any>) => matchSearch(log, keyword));

      return NextResponse.json({
        logs: filtered,
      });
    }

    if (scope === 'chats') {
      const [roomRes, messageRes] = await Promise.all([
        supabase.from('chat_rooms').select('*').order('created_at', { ascending: false }),
        (() => {
          let query = supabase
            .from('messages')
            .select('*')
            .order('created_at', { ascending: false });

          if (roomId) {
            query = query.eq('room_id', roomId);
          }

          if (keyword) {
            query = query.ilike('content', `%${keyword}%`);
          }

          return query;
        })(),
      ]);

      if (roomRes.error) {
        return NextResponse.json({ error: '채팅방 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
      }

      if (messageRes.error) {
        return NextResponse.json({ error: '메시지 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
      }

      const rooms = roomRes.data || [];
      const roomMap = new Map<string, Record<string, any>>(
        rooms.map((room: Record<string, any>) => [String(room.id), room])
      );
      const normalizedRooms = rooms
        .map((room: Record<string, any>) => normalizeChatRoom(room, staffMap))
        .sort((left: Record<string, any>, right: Record<string, any>) => {
          const leftTime = new Date(String(left.last_activity_at || left.created_at || 0)).getTime();
          const rightTime = new Date(String(right.last_activity_at || right.created_at || 0)).getTime();
          return rightTime - leftTime;
        });

      const filteredMessages = (messageRes.data || [])
        .filter((message: Record<string, any>) => !keyword || matchSearch(message, keyword))
        .map((message: Record<string, any>) => normalizeMessage(message, roomMap, staffMap));

      return NextResponse.json({
        rooms: normalizedRooms,
        messages: filteredMessages,
      });
    }

    return NextResponse.json({ error: 'Unsupported scope' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const scope = searchParams.get('scope') || 'overview';
    const roomId = String(searchParams.get('roomId') || '').trim();

    if (scope !== 'chats' || !roomId) {
      return NextResponse.json({ error: 'Unsupported delete request' }, { status: 400 });
    }

    const supabase = getAdminClient();

    const { data: room, error: roomError } = await supabase
      .from('chat_rooms')
      .select('id')
      .eq('id', roomId)
      .maybeSingle();

    if (roomError) {
      return NextResponse.json({ error: roomError.message }, { status: 500 });
    }

    if (!room) {
      return NextResponse.json({ error: 'Chat room not found' }, { status: 404 });
    }

    const { data: messageRows, error: messageRowsError } = await supabase
      .from('messages')
      .select('id')
      .eq('room_id', roomId);

    if (messageRowsError) {
      return NextResponse.json({ error: messageRowsError.message }, { status: 500 });
    }

    const { data: pollRows, error: pollRowsError } = await supabase
      .from('polls')
      .select('id')
      .eq('room_id', roomId);

    if (pollRowsError) {
      return NextResponse.json({ error: pollRowsError.message }, { status: 500 });
    }

    const messageIds = (messageRows || []).map((row: Record<string, any>) => String(row.id)).filter(Boolean);
    const pollIds = (pollRows || []).map((row: Record<string, any>) => String(row.id)).filter(Boolean);

    if (pollIds.length > 0) {
      const { error } = await supabase.from('poll_votes').delete().in('poll_id', pollIds);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (messageIds.length > 0) {
      const [{ error: reactionsError }, { error: bookmarksByMessageError }] = await Promise.all([
        supabase.from('message_reactions').delete().in('message_id', messageIds),
        supabase.from('message_bookmarks').delete().in('message_id', messageIds),
      ]);

      if (reactionsError) {
        return NextResponse.json({ error: reactionsError.message }, { status: 500 });
      }

      if (bookmarksByMessageError) {
        return NextResponse.json({ error: bookmarksByMessageError.message }, { status: 500 });
      }
    }

    const cleanupResults = await Promise.all([
      supabase.from('message_bookmarks').delete().eq('room_id', roomId),
      supabase.from('pinned_messages').delete().eq('room_id', roomId),
      supabase.from('room_read_cursors').delete().eq('room_id', roomId),
      supabase.from('room_notification_settings').delete().eq('room_id', roomId),
      supabase.from('polls').delete().eq('room_id', roomId),
      supabase.from('messages').delete().eq('room_id', roomId),
    ]);

    for (const result of cleanupResults) {
      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 500 });
      }
    }

    const { error: deleteRoomError } = await supabase.from('chat_rooms').delete().eq('id', roomId);

    if (deleteRoomError) {
      return NextResponse.json({ error: deleteRoomError.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      deletedRoomId: roomId,
      deletedMessageCount: messageIds.length,
      deletedPollCount: pollIds.length,
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
