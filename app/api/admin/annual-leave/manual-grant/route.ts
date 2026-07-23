import { NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';
import { isNamedSystemMasterAccount } from '@/lib/system-master';
import { setManualAnnualLeaveTarget } from '@/lib/unified-leave-ledger';

type ManualGrantUpdate = {
  staffId: string;
  total: number;
  used: number;
  expired: number;
  compensated: number;
};

type ManualGrantPayload = {
  staffId?: string;
  total?: number;
  used?: number;
  expired?: number;
  compensated?: number;
  updates?: Array<Partial<ManualGrantUpdate>>;
};

function nonNegative(value: unknown, fallback = 0): number | null {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeUpdates(payload: ManualGrantPayload | null): ManualGrantUpdate[] {
  const candidates = Array.isArray(payload?.updates)
    ? payload!.updates!
    : payload?.staffId
      ? [payload]
      : [];
  const byStaff = new Map<string, ManualGrantUpdate>();
  for (const row of candidates) {
    const staffId = String(row?.staffId ?? '').trim();
    const total = nonNegative(row?.total);
    const used = nonNegative(row?.used);
    const expired = nonNegative(row?.expired);
    const compensated = nonNegative(row?.compensated);
    if (!staffId || total === null || used === null || expired === null || compensated === null) continue;
    byStaff.set(staffId, { staffId, total, used, expired, compensated });
  }
  return [...byStaff.values()];
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
      return NextResponse.json({ error: 'At least one valid leave adjustment is required.' }, { status: 400 });
    }

    const invalid = updates.find((row) => row.used + row.expired + row.compensated > row.total + 1e-9);
    if (invalid) {
      return NextResponse.json({ error: `Leave components exceed total for ${invalid.staffId}.` }, { status: 400 });
    }

    const summaries = [];
    for (const update of updates) {
      summaries.push(await setManualAnnualLeaveTarget(update.staffId, {
        total: update.total,
        used: update.used,
        expired: update.expired,
        compensated: update.compensated,
        note: 'Administrator manual leave adjustment',
      }));
    }

    return NextResponse.json({
      success: true,
      updatedCount: summaries.length,
      summaries: summaries.map((summary) => ({
        staffId: summary.staffId,
        total: summary.total,
        used: summary.used,
        expired: summary.expired,
        compensated: summary.compensated,
        remaining: summary.remaining,
        cycle: summary.cycle,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Manual leave adjustment failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
