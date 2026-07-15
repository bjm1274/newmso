import { readSessionFromRequest } from '@/lib/server-session';
import { getD1Binding } from '@/lib/db';
import { hasPermission, isAdminUser } from '@/lib/access-control';
// 읽음 처리 SSOT: POST /api/notifications/mark-read (PUT 은 하위 호환 위임)
import { handleMarkNotificationsRead } from './_mark-read-handler';

export const dynamic = 'force-dynamic';

function getUserId(session: any): string | null {
  if (!session?.user) return null;
  const uid = String(session.user.id ?? session.user.user_id ?? '').trim();
  return uid || null;
}

/** 알림 관리 발송 권한: role admin | permissions.admin | menu_관리자 */
function canSendAsNotificationAdmin(sessionUser: unknown): boolean {
  const user = sessionUser as { role?: string | null; permissions?: Record<string, unknown> | null } | null;
  return isAdminUser(user) || hasPermission(user, 'menu_관리자');
}

function parsePermissions(raw: unknown): Record<string, unknown> {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function isAdminStaffRow(row: {
  role?: string | null;
  permissions?: unknown;
}): boolean {
  const role = String(row.role ?? '').trim().toLowerCase();
  if (role === 'admin') return true;
  const permissions = parsePermissions(row.permissions);
  const adminFlag = permissions.admin;
  if (adminFlag === true || adminFlag === 1 || adminFlag === '1' || adminFlag === 'true') return true;
  if (permissions.menu_관리자 === true) return true;
  return false;
}

// 1. GET: 알림 목록 조회 또는 안읽은 갯수 카운트
export async function GET(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const uid = getUserId(session);
    if (!uid) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return new Response(JSON.stringify({ ok: false, error: 'D1 binding not available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const url = new URL(request.url);
    const countOnly = url.searchParams.get('count') === 'true';
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || '200')));

    if (countOnly) {
      const result = await d1
        .prepare('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND read_at IS NULL')
        .bind(uid)
        .first<{ count: number }>();
      return new Response(JSON.stringify({ ok: true, count: result?.count ?? 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const result = await d1
      .prepare('SELECT id, user_id, type, title, body, metadata, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(uid, limit)
      .all<any>();

    const rows = (result?.results || []).map((row) => {
      let meta = {};
      if (typeof row.metadata === 'string') {
        try {
          meta = JSON.parse(row.metadata);
        } catch {
          meta = {};
        }
      } else if (row.metadata && typeof row.metadata === 'object') {
        meta = row.metadata;
      }
      return {
        ...row,
        metadata: meta };
    });

    return new Response(JSON.stringify({ ok: true, data: rows }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[GET /api/notifications] error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// 2. POST: 새로운 알림 생성 (단일, 벌크, 어드민 발송 지원)
export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const uid = getUserId(session);
    if (!uid) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return new Response(JSON.stringify({ ok: false, error: 'D1 binding not available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await request.json();
    // uid 검증 후 session.user 보장 (TS null 좁히기)
    const sessionUser = session?.user;
    if (!sessionUser) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const isNotifAdmin = canSendAsNotificationAdmin(sessionUser);

    if (body.send_to_admins === true && Array.isArray(body.alerts)) {
      // 호출자 관리자 권한 필수 (role admin | permissions.admin | menu_관리자)
      if (!isNotifAdmin) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Forbidden: admin only' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const sessionCompany = String((sessionUser as any)?.company ?? '').trim();
      const sessionCompanyId = String((sessionUser as any)?.company_id ?? '').trim();

      // 관리자 직원 조회 후 권한·회사 스코프 필터
      const adminUsersResult = await d1
        .prepare(
          `SELECT id, company, company_id, role, permissions, status
           FROM staff_members
           WHERE status IS NULL OR TRIM(COALESCE(status, '')) = '' OR status = '재직'`,
        )
        .all<{
          id: string;
          company: string | null;
          company_id: string | null;
          role: string | null;
          permissions: string | null;
          status: string | null;
        }>();

      const adminUsers = (adminUsersResult?.results || []).filter((row) => {
        if (!isAdminStaffRow(row)) return false;
        // 세션에 회사 정보가 있으면 동일 회사만
        if (sessionCompanyId || sessionCompany) {
          const rowCompanyId = String(row.company_id ?? '').trim();
          const rowCompany = String(row.company ?? '').trim();
          if (sessionCompanyId && rowCompanyId) return rowCompanyId === sessionCompanyId;
          if (sessionCompany && rowCompany) return rowCompany === sessionCompany;
          // 한쪽만 비어 있으면 보수적으로 제외
          return false;
        }
        return true;
      });

      if (adminUsers.length === 0) {
        return new Response(JSON.stringify({ ok: true, data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      const statements = [];
      const insertedIds = [];

      for (const admin of adminUsers) {
        for (const alert of body.alerts) {
          const type = String(alert.type || 'notification').trim();
          const title = String(alert.title || '알림').trim();
          const content = String(alert.body || '').trim();
          const metadata = typeof alert.metadata === 'object' ? JSON.stringify(alert.metadata) : JSON.stringify({});
          const newId = alert.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
            ? crypto.randomUUID()
            : `noti-${Date.now()}-${Math.random().toString(16).slice(2)}`);
          const createdAt = new Date().toISOString();

          insertedIds.push(newId);
          statements.push(
            d1
              .prepare('INSERT INTO notifications (id, user_id, type, title, body, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
              .bind(newId, admin.id, type, title, content, metadata, createdAt)
          );
        }
      }

      if (statements.length > 0) {
        await d1.batch(statements);
      }

      return new Response(JSON.stringify({ ok: true, data: insertedIds.map(id => ({ id })) }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const items = Array.isArray(body) ? body : [body];
    if (items.length === 0) {
      return new Response(JSON.stringify({ ok: true, data: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 일반 insert: 기본 본인만. 타인 target 은 관리자만 (세션 검증 필수)
    for (const item of items) {
      const requestedUserId = String(item.user_id || uid).trim();
      if (requestedUserId !== uid && !isNotifAdmin) {
        return new Response(
          JSON.stringify({ ok: false, error: 'Forbidden: can only create notifications for self' }),
          { status: 403, headers: { 'Content-Type': 'application/json' } },
        );
      }
    }

    const statements = [];
    const insertedIds = [];

    for (const item of items) {
      const requestedUserId = String(item.user_id || uid).trim();
      // 비관리자는 무조건 세션 uid. 관리자도 세션 검증을 통과한 요청 user_id 만 허용
      const targetUserId = isNotifAdmin ? requestedUserId : uid;
      const type = String(item.type || 'notification').trim();
      const title = String(item.title || '알림').trim();
      const content = String(item.body || '').trim();
      const metadata = typeof item.metadata === 'object' ? JSON.stringify(item.metadata) : JSON.stringify({});
      const newId = item.id || (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `noti-${Date.now()}-${Math.random().toString(16).slice(2)}`);
      const createdAt = item.created_at || new Date().toISOString();

      insertedIds.push(newId);

      statements.push(
        d1
          .prepare('INSERT INTO notifications (id, user_id, type, title, body, metadata, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
          .bind(newId, targetUserId, type, title, content, metadata, createdAt)
      );
    }

    await d1.batch(statements);

    const responseData = Array.isArray(body)
      ? insertedIds.map(id => ({ id }))
      : { id: insertedIds[0] };

    return new Response(JSON.stringify({ ok: true, data: responseData }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[POST /api/notifications] error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// 3. PUT: 알림 읽음 처리 (하위 호환 — SSOT는 POST /api/notifications/mark-read)
// 신규 클라이언트(인앱 notification-api · SW push-notification-shared)는 mark-read POST 사용.
export async function PUT(request: Request) {
  return handleMarkNotificationsRead(request);
}

// 4. DELETE: 알림 삭제 (단일/벌크)
export async function DELETE(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const uid = getUserId(session);
    if (!uid) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return new Response(JSON.stringify({ ok: false, error: 'D1 binding not available' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await request.json();

    if (body.cleanup === true) {
      // 7일 이상된 읽은 알림 삭제
      const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      await d1
        .prepare('DELETE FROM notifications WHERE user_id = ? AND created_at < ? AND read_at IS NOT NULL')
        .bind(uid, cutoff)
        .run();
    } else if (Array.isArray(body.ids) && body.ids.length > 0) {
      // 벌크 ID 리스트 삭제
      const placeholders = body.ids.map(() => '?').join(',');
      const query = `DELETE FROM notifications WHERE user_id = ? AND id IN (${placeholders})`;
      await d1
        .prepare(query)
        .bind(uid, ...body.ids)
        .run();
    } else if (typeof body.id === 'string' && body.id.trim()) {
      // 단일 알림 삭제
      await d1
        .prepare('DELETE FROM notifications WHERE user_id = ? AND id = ?')
        .bind(uid, body.id.trim())
        .run();
    } else {
      return new Response(JSON.stringify({ ok: false, error: 'Invalid payload' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error: any) {
    console.error('[DELETE /api/notifications] error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
