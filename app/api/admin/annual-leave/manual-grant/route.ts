import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { readSessionFromRequest } from '@/lib/server-session';
import { isNamedSystemMasterAccount } from '@/lib/system-master';

type ManualGrantUpdate = {
  staffId: string;
  total: number;
  used: number;
};

type ManualGrantPayload = {
  staffId?: string;
  total?: number;
  used?: number;
  updates?: Array<{
    staffId?: string;
    total?: number;
    used?: number;
  }>;
};

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing.');
  }

  return createClient(supabaseUrl, serviceKey);
}

function normalizeLeaveValue(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function normalizeUpdates(payload: ManualGrantPayload | null) {
  const rawUpdates = Array.isArray(payload?.updates)
    ? payload.updates
    : payload?.staffId
      ? [{ staffId: payload.staffId, total: payload.total, used: payload.used }]
      : [];

  const normalized = rawUpdates
    .map((update) => {
      const staffId = typeof update?.staffId === 'string' ? update.staffId.trim() : '';
      const total = normalizeLeaveValue(update?.total);
      const used = normalizeLeaveValue(update?.used);

      if (!staffId || total === null || used === null) {
        return null;
      }

      return {
        staffId,
        total,
        used,
      } satisfies ManualGrantUpdate;
    })
    .filter((update): update is ManualGrantUpdate => update !== null);

  return Array.from(
    normalized.reduce((map, update) => map.set(update.staffId, update), new Map<string, ManualGrantUpdate>()).values(),
  );
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isNamedSystemMasterAccount(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as ManualGrantPayload | null;
    const updates = normalizeUpdates(payload);

    if (updates.length === 0) {
      return NextResponse.json({ error: '수정할 연차 정보가 올바르지 않습니다.' }, { status: 400 });
    }

    const supabase = getAdminClient();

    for (const update of updates) {
      const { error } = await supabase
        .from('staff_members')
        .update({
          annual_leave_total: update.total,
          annual_leave_used: update.used,
        })
        .eq('id', update.staffId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount: updates.length,
      message:
        updates.length === 1
          ? '연차 수동 부여 내역이 저장되었습니다.'
          : `${updates.length}명의 연차 수동 부여 내역이 저장되었습니다.`,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '연차 수동 부여 저장 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
