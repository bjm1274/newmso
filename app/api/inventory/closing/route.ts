/**
 * POST /api/inventory/closing
 * 재고 월마감 잠금/해제
 *
 * body: {
 *   action: 'lock' | 'unlock',
 *   company?: string,       // 기본: 세션 사용자 회사
 *   closingMonth?: string,  // YYYY-MM, 기본: 이번 달(KST)
 * }
 *
 * GET /api/inventory/closing?company=&month=
 * 현재 월마감 스냅샷 조회
 */
import { NextResponse } from 'next/server';
import { userId } from '@/lib/d1-api-helpers';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { readSessionFromRequest, isAdminSession, type SessionUser } from '@/lib/server-session';
import { getD1Binding, getD1Drizzle } from '@/lib/db';
import { inventory, inventory_closing_snapshots } from '@/lib/db/schema';
import { getKoreanMonthString } from '@/lib/seoul-time';

export const dynamic = 'force-dynamic';

const PayloadSchema = z.object({
  action: z.enum(['lock', 'unlock', 'advance_step', 'reset_steps']),
  company: z.string().optional(),
  closingMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  /** advance_step 시 목표 단계(1~5). 생략 시 +1 */
  step: z.number().int().min(1).max(5).optional(),
});

function canManageClosing(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  if (isAdminSession(user)) return true;
  const perms = user.permissions || {};
  return Boolean(
    perms.inventory_월마감 ||
      perms.inventory ||
      perms.mso ||
      perms.admin,
  );
}

/**
 * 잠금 해제 전용 권한.
 * 예전에는 lock/unlock 이 같은 canManageClosing 하나로 통과해, 일반 재고 담당자가
 * 확정된 월마감을 스스로 풀고 수량을 손댄 뒤 다시 잠글 수 있었다(회계 스냅샷 통제 무력화).
 * 잠그는 것은 재고 담당의 일상 업무지만 푸는 것은 통제 되돌리기이므로 상위 권한으로 올린다.
 */
function canUnlockClosing(user: SessionUser | null | undefined): boolean {
  if (!user) return false;
  if (isAdminSession(user)) return true;
  const perms = user.permissions || {};
  return Boolean(perms.inventory_월마감 || perms.mso || perms.admin);
}

/**
 * 대상 회사 확정.
 *
 * 예전에는 `parsed.data.company?.trim() || 세션회사` 로 요청자가 준 값을 그대로 썼다.
 * 같은 재고 도메인의 다른 6개 라우트가 쓰는 assertInventoryCompanyScope 가 이 파일에는
 * import 조차 되지 않아, 재고 권한만 가진 일반 직원이 company:'타사' 를 실어 보내면
 * 그 회사의 월마감을 잠그고 풀 수 있었다.
 * 8차 D07-014 실측: E2E-002(admin=false, inventory=true)로
 * POST {action:'lock', company:'FOREIGN CO'} → 200, 스냅샷 status='locked' 생성.
 * 관리자만 임의 회사를 지정할 수 있고, 그 외에는 세션 회사로 강제(불일치 403)한다.
 */
function resolveClosingCompany(
  user: SessionUser | null | undefined,
  requested: string | undefined,
): { ok: true; company: string } | { ok: false; response: NextResponse } {
  const sessionCompany = String(user?.company || '').trim();
  const asked = String(requested || '').trim();

  if (isAdminSession(user) || user?.permissions?.mso || user?.permissions?.admin) {
    return { ok: true, company: asked || sessionCompany || 'SY INC.' };
  }
  if (!sessionCompany) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: '세션에 회사 정보가 없어 월마감 대상을 확정할 수 없습니다.', code: 'FORBIDDEN' },
        { status: 403 },
      ),
    };
  }
  if (asked && asked !== sessionCompany) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: '다른 회사의 월마감은 조회·변경할 수 없습니다.', code: 'FORBIDDEN' },
        { status: 403 },
      ),
    };
  }
  return { ok: true, company: sessionCompany };
}

async function findSnapshot(
  db: ReturnType<typeof getD1Drizzle>,
  company: string,
  month: string,
) {
  const rows = await db
    .select()
    .from(inventory_closing_snapshots)
    .where(
      and(
        eq(inventory_closing_snapshots.company, company),
        eq(inventory_closing_snapshots.closing_month, month),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function computeInventoryTotals(
  db: ReturnType<typeof getD1Drizzle>,
  company: string,
) {
  const rows = await db
    .select({
      item_count: sql<number>`count(*)`,
      total_quantity: sql<number>`coalesce(sum(coalesce(${inventory.quantity}, ${inventory.stock}, 0)), 0)`,
      total_value: sql<number>`coalesce(sum(coalesce(${inventory.quantity}, ${inventory.stock}, 0) * coalesce(${inventory.unit_price}, ${inventory.price}, 0)), 0)`,
    })
    .from(inventory)
    .where(eq(inventory.company, company));

  const r = rows[0];
  return {
    item_count: Number(r?.item_count ?? 0) || 0,
    total_quantity: Number(r?.total_quantity ?? 0) || 0,
    total_value: Number(r?.total_value ?? 0) || 0,
  };
}

export async function GET(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!userId(session?.user)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }

    const url = new URL(request.url);
    // GET 도 회사 스코프를 태운다. 예전에는 권한 검사 없이 임의 company 를 받아
    // 인증만 있으면 타사 스냅샷의 품목수·수량·평가액 총계를 그대로 읽을 수 있었다.
    const companyScope = resolveClosingCompany(
      session?.user,
      url.searchParams.get('company') ?? undefined,
    );
    if (!companyScope.ok) return companyScope.response;
    const company = companyScope.company;
    const month = url.searchParams.get('month')?.trim() || getKoreanMonthString();

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[closing] D1 binding not available');
    const db = getD1Drizzle(d1);

    const snap = await findSnapshot(db, company, month);
    const status = String(snap?.status || 'open');
    const locked =
      status === 'locked' ||
      status === 'closed' ||
      status === '마감' ||
      status === '확정';

    return NextResponse.json({
      ok: true,
      data: {
        company,
        closingMonth: month,
        locked,
        status: snap ? status : 'open',
        snapshot: snap
          ? {
              id: snap.id,
              item_count: snap.item_count,
              total_quantity: snap.total_quantity,
              total_value: snap.total_value,
              closed_at: snap.closed_at,
              created_by_name: snap.created_by_name,
            }
          : null,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    const user = session?.user;
    const uid = userId(user);
    if (!uid) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (!canManageClosing(user)) {
      return NextResponse.json(
        { ok: false, error: '월마감 권한이 없습니다.', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: 'Invalid payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.action === 'unlock' && !canUnlockClosing(user)) {
      return NextResponse.json(
        { ok: false, error: '월마감 잠금 해제 권한이 없습니다.', code: 'FORBIDDEN' },
        { status: 403 },
      );
    }

    const companyScope = resolveClosingCompany(user, parsed.data.company);
    if (!companyScope.ok) return companyScope.response;
    const company = companyScope.company;
    const month = parsed.data.closingMonth || getKoreanMonthString();
    const actorName = user?.name || null;

    const d1 = await getD1Binding();
    if (!d1) throw new Error('[closing] D1 binding not available');
    const db = getD1Drizzle(d1);

    const existing = await findSnapshot(db, company, month);
    const now = new Date().toISOString();

    const parseSummary = (raw: unknown): Record<string, unknown> => {
      if (!raw) return {};
      if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
        return raw as Record<string, unknown>;
      }
      if (typeof raw === 'string' && raw.trim()) {
        try {
          const p = JSON.parse(raw);
          return p && typeof p === 'object' ? (p as Record<string, unknown>) : {};
        } catch {
          return {};
        }
      }
      return {};
    };

    const currentSteps = Math.min(
      5,
      Math.max(0, Number(parseSummary(existing?.summary).steps_done) || 0),
    );

    // ── 단계 진행 (잠금 전 워크플로) ──
    if (parsed.data.action === 'advance_step' || parsed.data.action === 'reset_steps') {
      const nextSteps =
        parsed.data.action === 'reset_steps'
          ? 0
          : parsed.data.step != null
            ? Math.min(5, Math.max(1, parsed.data.step))
            : Math.min(5, currentSteps + 1);

      const status =
        String(existing?.status || 'open') === 'locked' ||
        String(existing?.status || '') === 'closed'
          ? String(existing?.status)
          : 'open';

      const summary = JSON.stringify({
        ...parseSummary(existing?.summary),
        steps_done: nextSteps,
        steps_updated_at: now,
        steps_updated_by: actorName,
      });

      if (existing) {
        await db
          .update(inventory_closing_snapshots)
          .set({ summary })
          .where(eq(inventory_closing_snapshots.id, existing.id));
      } else {
        await db.insert(inventory_closing_snapshots).values({
          id: crypto.randomUUID(),
          closing_month: month,
          snapshot_date: now.slice(0, 10),
          company,
          status: 'open',
          item_count: 0,
          total_quantity: 0,
          total_value: 0,
          summary,
          items: '[]',
          created_by_id: uid,
          created_by_name: actorName,
          closed_at: null,
          created_at: now,
        });
      }

      return NextResponse.json({
        ok: true,
        data: {
          action: parsed.data.action,
          company,
          closingMonth: month,
          locked: status === 'locked' || status === 'closed',
          status,
          steps_done: nextSteps,
        },
      });
    }

    if (parsed.data.action === 'lock') {
      const totals = await computeInventoryTotals(db, company);
      const summary = JSON.stringify({
        ...parseSummary(existing?.summary),
        locked_at: now,
        locked_by: actorName,
        steps_done: 5,
        ...totals,
      });
      if (existing) {
        await db
          .update(inventory_closing_snapshots)
          .set({
            status: 'locked',
            item_count: totals.item_count,
            total_quantity: totals.total_quantity,
            total_value: totals.total_value,
            closed_at: now,
            created_by_id: uid,
            created_by_name: actorName,
            snapshot_date: now.slice(0, 10),
            summary,
          })
          .where(eq(inventory_closing_snapshots.id, existing.id));
      } else {
        await db.insert(inventory_closing_snapshots).values({
          id: crypto.randomUUID(),
          closing_month: month,
          snapshot_date: now.slice(0, 10),
          company,
          status: 'locked',
          item_count: totals.item_count,
          total_quantity: totals.total_quantity,
          total_value: totals.total_value,
          summary,
          items: '[]',
          created_by_id: uid,
          created_by_name: actorName,
          closed_at: now,
          created_at: now,
        });
      }

      return NextResponse.json({
        ok: true,
        data: {
          action: 'lock',
          company,
          closingMonth: month,
          locked: true,
          status: 'locked',
          steps_done: 5,
          ...totals,
        },
      });
    }

    // unlock
    if (!existing) {
      return NextResponse.json({
        ok: true,
        data: {
          action: 'unlock',
          company,
          closingMonth: month,
          locked: false,
          status: 'open',
          steps_done: 0,
          message: '잠금 기록이 없어 이미 열린 상태입니다.',
        },
      });
    }

    const unlockedSummary = JSON.stringify({
      ...parseSummary(existing.summary),
      unlocked_at: now,
      unlocked_by: actorName,
      // 잠금 해제 시 단계는 유지(재개 가능). 완전 초기화는 reset_steps
    });

    await db
      .update(inventory_closing_snapshots)
      .set({
        status: 'open',
        summary: unlockedSummary,
      })
      .where(eq(inventory_closing_snapshots.id, existing.id));

    return NextResponse.json({
      ok: true,
      data: {
        action: 'unlock',
        company,
        closingMonth: month,
        locked: false,
        status: 'open',
        steps_done: currentSteps,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
