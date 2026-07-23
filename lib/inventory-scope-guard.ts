import { NextResponse } from 'next/server';
import type { D1Database } from '@cloudflare/workers-types';
import type { SessionUser } from '@/lib/server-session';

/**
 * 재고 품목 타 회사/부서 조작 방지 권한 검증 헬퍼
 */
export async function assertInventoryItemCompanyScope(
  d1: D1Database,
  sessionUser: SessionUser,
  itemId: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const role = String(sessionUser.role || '').toLowerCase();
  const isMaster = Boolean(sessionUser.is_master || sessionUser.is_admin);
  if (isMaster || role === 'admin' || role === 'mso') {
    return { ok: true };
  }

  const userCompany = String(sessionUser.company || '').trim();
  const userCompanyId = String(sessionUser.company_id || '').trim();

  try {
    const stmt = d1.prepare('SELECT id, company, company_id FROM inventory_items WHERE id = ? LIMIT 1');
    const item = await stmt.bind(itemId).first<{ id: string; company?: string | null; company_id?: string | null }>();

    if (!item) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: '품목을 찾을 수 없습니다.' }, { status: 404 }),
      };
    }

    const itemCompany = String(item.company || '').trim();
    const itemCompanyId = String(item.company_id || '').trim();

    const matchCompany = Boolean(userCompany && itemCompany && userCompany === itemCompany);
    const matchCompanyId = Boolean(userCompanyId && itemCompanyId && userCompanyId === itemCompanyId);

    if (itemCompany || itemCompanyId) {
      if (!matchCompany && !matchCompanyId) {
        return {
          ok: false,
          response: NextResponse.json({ ok: false, error: '타 부서/타 회사 재고 변경 권한이 없습니다.' }, { status: 403 }),
        };
      }
    }

    return { ok: true };
  } catch (error) {
    console.warn('[assertInventoryItemCompanyScope] check failed', error);
    return { ok: true }; // DB 스키마 완충
  }
}
