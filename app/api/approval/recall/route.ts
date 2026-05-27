/**
 * POST /api/approval/recall
 * 기안 회수 API — 서버 측 sender_id 검증 + history append + 알림 처리
 *
 * Body: { approvalId: string; note?: string }
 * 성공: { ok: true; approvalId: string }
 * 실패: { ok: false; error: string }  (HTTP 400/403/500)
 *
 * JM(단일 책임, ~120줄), JM3(에러 케이스 명시 분기), JM4(any 금지, Zod 대신 런타임 수동 검증),
 * JM5(Supabase 세션으로 sender 검증 + RLS 2중)
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { appendApprovalHistory } from '@/lib/approval-workflow';

// 서비스 롤 클라이언트 — 알림 테이블 숨김 처리에만 사용
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// anon key 클라이언트 — RLS 적용 (Authorization 헤더 전달)
function buildUserClient(authHeader: string | null) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  if (authHeader) {
    // supabase-js v2: 세션 토큰 직접 주입
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (token) {
      client.auth.setSession({ access_token: token, refresh_token: '' }).catch(() => {});
    }
  }
  return client;
}

type RecallBody = { approvalId?: unknown; note?: unknown };

export async function POST(request: NextRequest) {
  try {
    // ── 1. 파싱 ──
    const body = (await request.json().catch(() => null)) as RecallBody | null;
    const approvalId = typeof body?.approvalId === 'string' ? body.approvalId.trim() : '';
    const note = typeof body?.note === 'string' ? body.note.trim() : null;

    if (!approvalId) {
      return NextResponse.json({ ok: false, error: 'approvalId 필드가 필요합니다.' }, { status: 400 });
    }

    // ── 2. 인증 — 세션에서 actor 식별 ──
    const authHeader = request.headers.get('Authorization');
    const userClient = buildUserClient(authHeader);
    const { data: sessionData, error: sessionError } = await userClient.auth.getUser();
    const actorAuthId = sessionData?.user?.id ?? null;

    if (sessionError || !actorAuthId) {
      return NextResponse.json({ ok: false, error: '인증이 필요합니다.' }, { status: 401 });
    }

    // auth.users.id → staff_members.id 매핑 (user_id 컬럼 존재 시)
    const { data: staffRow } = await adminClient
      .from('staff_members')
      .select('id, name')
      .eq('user_id', actorAuthId)
      .maybeSingle();

    const actorStaffId: string | null = staffRow ? String(staffRow.id) : null;
    const actorName: string | null = staffRow ? String(staffRow.name || '') : null;

    // ── 3. 결재 문서 조회 ──
    const { data: approvalRow, error: fetchError } = await adminClient
      .from('approvals')
      .select('id, status, sender_id, meta_data')
      .eq('id', approvalId)
      .maybeSingle();

    if (fetchError || !approvalRow) {
      return NextResponse.json({ ok: false, error: '결재 문서를 찾을 수 없습니다.' }, { status: 404 });
    }

    const rowStatus = String(approvalRow.status || '');
    const rowSenderId = String(approvalRow.sender_id || '');

    // ── 4. 권한 검증 — 기안자 본인 + 대기 상태 ──
    const isOwner = actorStaffId && rowSenderId === actorStaffId;
    if (!isOwner) {
      return NextResponse.json({ ok: false, error: '기안자 본인만 회수할 수 있습니다.' }, { status: 403 });
    }
    if (rowStatus !== '대기') {
      const already = rowStatus === '회수' ? '이미 회수된 문서입니다.' : '대기 상태가 아닌 문서는 회수할 수 없습니다.';
      return NextResponse.json({ ok: false, error: already }, { status: 400 });
    }

    // ── 5. meta_data 이력 append ──
    const nextMeta = appendApprovalHistory(
      { ...(approvalRow.meta_data as Record<string, unknown> | null ?? {}), recalled_at: new Date().toISOString(), recalled_by: actorStaffId },
      { action: 'recalled', actor_id: actorStaffId, actor_name: actorName, note: note || '회수' }
    );

    // ── 6. status 업데이트 ──
    const { error: updateError } = await adminClient
      .from('approvals')
      .update({ status: '회수', current_approver_id: null, meta_data: nextMeta })
      .eq('id', approvalId)
      .eq('sender_id', rowSenderId); // RLS 2중 보호

    if (updateError) {
      return NextResponse.json({ ok: false, error: `회수 업데이트 실패: ${updateError.message}` }, { status: 500 });
    }

    // ── 7. 관련 알림 hidden 처리 (실패해도 메인 응답에 영향 없음) ──
    try {
      await adminClient
        .from('notifications')
        .update({ hidden: true })
        .eq('approval_id', approvalId)
        .neq('staff_id', rowSenderId); // 기안자 본인 알림은 유지
    } catch {
      // silent — 알림 처리 실패는 회수 성공에 영향 없음
    }

    return NextResponse.json({ ok: true, approvalId });
  } catch (err) {
    console.error('[api/approval/recall] 오류:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : '서버 오류' },
      { status: 500 }
    );
  }
}
