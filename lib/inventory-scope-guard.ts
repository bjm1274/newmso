import { NextResponse } from 'next/server';
import type { D1Database } from '@cloudflare/workers-types';
import type { SessionUser } from '@/lib/server-session';

type ScopeResult = { ok: true } | { ok: false; response: NextResponse };

function isInventoryAdmin(user: SessionUser): boolean {
  const role = String(user.role || '').toLowerCase();
  const perms = user.permissions || {};
  return Boolean(
    user.is_system_master || user.is_master || user.is_admin ||
    role === 'admin' || role === 'mso' || perms.admin || perms.mso,
  );
}

function canWriteInventory(user: SessionUser): boolean {
  if (isInventoryAdmin(user)) return true;
  return user.permissions?.inventory === true;
}

function forbidden(message: string): ScopeResult {
  return { ok: false, response: NextResponse.json({ ok: false, error: message }, { status: 403 }) };
}

/** Verify that a company/department target is writable by the current user. */
export function assertInventoryCompanyScope(
  sessionUser: SessionUser,
  target: { company?: string | null; company_id?: string | null; department?: string | null },
): ScopeResult {
  if (!canWriteInventory(sessionUser)) return forbidden('Inventory write permission is required.');
  if (isInventoryAdmin(sessionUser)) return { ok: true };

  const userCompany = String(sessionUser.company || '').trim();
  const userCompanyId = String(sessionUser.company_id || '').trim();
  const userDepartment = String(sessionUser.department || '').trim();
  const company = String(target.company || '').trim();
  const companyId = String(target.company_id || '').trim();
  const department = String(target.department || '').trim();

  // A row without scope metadata cannot be safely delegated to a non-admin.
  if (!company && !companyId) return forbidden('Inventory target has no company scope.');
  if (!(userCompany && company && userCompany === company) && !(userCompanyId && companyId && userCompanyId === companyId)) {
    return forbidden('You cannot change inventory outside your company.');
  }
  if (department && (!userDepartment || userDepartment !== department)) {
    return forbidden('You cannot change inventory outside your department.');
  }
  return { ok: true };
}

/** Verify that an inventory row is writable and belongs to the caller's company/department. */
export async function assertInventoryItemCompanyScope(
  d1: D1Database,
  sessionUser: SessionUser,
  itemId: string,
): Promise<ScopeResult> {
  try {
    const item = await d1
      .prepare('SELECT id, company, company_id, department FROM inventory WHERE id = ? LIMIT 1')
      .bind(itemId)
      .first<{ id: string; company?: string | null; company_id?: string | null; department?: string | null }>();

    if (!item) {
      return {
        ok: false,
        response: NextResponse.json({ ok: false, error: 'Inventory item not found.' }, { status: 404 }),
      };
    }
    return assertInventoryCompanyScope(sessionUser, item);
  } catch (error) {
    console.warn('[assertInventoryItemCompanyScope] check failed', error);
    return forbidden('Inventory authorization check failed.');
  }
}
