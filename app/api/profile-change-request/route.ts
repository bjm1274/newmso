/**
 * ESS(본인 인사정보 변경) 요청 접수 — 서버 전용 라우트.
 *
 * 왜 필요한가
 * ----------
 * 이 요청 큐는 전용 테이블이 아니라 `audit_logs` 를 전용(轉用)해 쓰고 있는데,
 * `audit_logs` 는 감사 무결성 때문에 ADMIN_ONLY 다(lib/db/auth/policies.ts).
 * 그래서 클라이언트가 `/api/d1/mutate` 로 직접 insert 하던 기존 구조에서는
 * **일반 직원의 "내 정보 수정"이 항상 403** 으로 실패했다.
 *
 * 감사로그를 아무나 쓰게 여는 것은 잘못된 해법이므로(위조 가능해짐),
 * 세션으로 본인을 확인한 뒤 **서버 권한으로** 대기 행을 기록한다.
 *
 * 보안
 * ----
 *  - `user_id` / `user_name` 은 **세션에서만** 취한다. 본문 값은 신뢰하지 않는다
 *    → 타인 명의 요청 위조 차단.
 *  - `target_type` 은 'ESS_PROFILE_UPDATE_PENDING' 으로 고정한다
 *    → 이 라우트로 임의 감사로그를 만들 수 없다.
 *  - 같은 사용자의 대기 요청이 이미 있으면 새로 만들지 않고 갱신한다(중복 방지).
 */
import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { getD1Binding } from '@/lib/db';

export const dynamic = 'force-dynamic';

const PENDING_TARGET_TYPE = 'ESS_PROFILE_UPDATE_PENDING';

export async function POST(req: NextRequest) {
  try {
    const session = await readSessionFromRequest(req);
    const userId = String(session?.user?.id ?? session?.user?.user_id ?? '').trim();
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    // mypage_수정 이 명시적으로 false 인 계정만 차단(미설정/true 는 허용).
    const perms = (session?.user?.permissions ?? {}) as Record<string, unknown>;
    if (perms.mypage_수정 === false) {
      return NextResponse.json({ ok: false, error: '정보 수정 권한이 없습니다.' }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { details?: unknown } | null;
    const details = typeof body?.details === 'string' ? body.details : '';
    if (!details) {
      return NextResponse.json({ ok: false, error: 'details 가 필요합니다.' }, { status: 400 });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 binding not available' }, { status: 500 });
    }

    const now = new Date().toISOString();
    const userName = String(session?.user?.name ?? '') || null;

    const existing = await d1
      .prepare(
        'SELECT id FROM audit_logs WHERE target_type = ?1 AND user_id = ?2 ORDER BY created_at DESC LIMIT 1',
      )
      .bind(PENDING_TARGET_TYPE, userId)
      .first<{ id: string }>();

    if (existing?.id) {
      await d1
        .prepare(
          'UPDATE audit_logs SET user_name = ?1, action = ?2, details = ?3, created_at = ?4 WHERE id = ?5',
        )
        .bind(userName, '인사변경', details, now, existing.id)
        .run();
      return NextResponse.json({ ok: true, status: 'submitted', updated: true });
    }

    await d1
      .prepare(
        'INSERT INTO audit_logs (id, user_id, user_name, action, target_type, target_id, details, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
      )
      .bind(
        crypto.randomUUID(),
        userId,
        userName,
        '인사변경',
        PENDING_TARGET_TYPE,
        userId,
        details,
        now,
      )
      .run();

    return NextResponse.json({ ok: true, status: 'submitted', updated: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : '요청 처리 중 오류가 발생했습니다.';
    console.error('[profile-change-request] 실패:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
