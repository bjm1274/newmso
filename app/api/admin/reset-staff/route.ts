/**
 * 관리자 제외 전 직원 삭제 (RLS 우회)
 * 서버에서 Service Role 키로 삭제하므로 Supabase RLS 정책 없이 동작합니다.
 */
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';

export async function POST(req: Request) {
  try {
    const session = await readSessionFromRequest(req);
    if (!session || !isAdminSession(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { password } = body || {};
    const resetHash = process.env.RESET_SECRET_HASH;
    if (!resetHash || !(await bcrypt.compare(password, resetHash))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: '서버 설정 오류: Supabase URL 또는 Service Role Key가 없습니다.' },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // 관리자(role='admin')는 항상 제외하고 삭제
    const { data: toDelete, error: selectErr } = await supabase
      .from('staff_members')
      .select('id')
      .neq('role', 'admin');

    if (selectErr) {
      return NextResponse.json(
        { error: selectErr.message },
        { status: 500 }
      );
    }

    if (!toDelete?.length) {
      return NextResponse.json({
        deleted: 0,
        message: '삭제할 직원이 없습니다. (관리자만 있음)',
      });
    }

    const ids = toDelete.map((r) => r.id);

    // 종속 테이블 데이터 먼저 삭제 (외래키 제약조건 해소)
    const dependentTables = [
      // 전자결재
      { table: 'approvals', column: 'sender_id' },
      // 근로계약
      { table: 'employment_contracts', column: 'staff_id' },
      // 근태/출퇴근
      { table: 'attendance', column: 'staff_id' },
      { table: 'shift_assignments', column: 'staff_id' },
      // 휴가
      { table: 'leave_requests', column: 'staff_id' },
      // 자격면허
      { table: 'staff_certifications', column: 'staff_id' },
      // 할일
      { table: 'todos', column: 'user_id' },
      // 알림
      { table: 'notifications', column: 'user_id' },
      // 인수인계
      { table: 'handover_notes', column: 'author_id' },
      // 채팅
      { table: 'pinned_messages', column: 'pinned_by' },
      { table: 'message_reactions', column: 'user_id' },
      { table: 'message_reads', column: 'user_id' },
      { table: 'messages', column: 'sender_id' },
      { table: 'room_notification_settings', column: 'user_id' },
      { table: 'polls', column: 'creator_id' },
      { table: 'poll_votes', column: 'user_id' },
      { table: 'chat_rooms', column: 'created_by' },
      // 게시판
      { table: 'board_post_likes', column: 'user_id' },
      { table: 'board_post_comments', column: 'author_id' },
      { table: 'board_posts', column: 'author_id' },
      { table: 'posts', column: 'author_id' },
      // 문서/감사
      { table: 'document_repository', column: 'created_by' },
      { table: 'audit_logs', column: 'user_id' },
      { table: 'audit_logs', column: 'target_id' },
    ];

    const BATCH = 100;
    for (const dep of dependentTables) {
      for (let i = 0; i < ids.length; i += BATCH) {
        const chunk = ids.slice(i, i + BATCH);
        await supabase.from(dep.table).delete().in(dep.column, chunk);
      }
    }

    // 직원 데이터 삭제
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      const { error } = await supabase.from('staff_members').delete().in('id', chunk);
      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      deleted: ids.length,
      message: '관리자 제외 전 직원이 삭제되었습니다.',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg },
      { status: 500 }
    );
  }
}
