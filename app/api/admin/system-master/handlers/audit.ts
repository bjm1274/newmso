import { NextResponse } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  audit_logs as auditLogsTable,
  desc,
  eq,
} from '@/lib/db';
import {
  buildPermissionChangeSummary,
  matchSearch,
  normalizeAuditLog,
  type AuditLogRow,
  type LooseRecord,
  type StaffRow,
} from '../_shared';

export async function handleAudit(
  staffMap: Map<string, StaffRow>,
  options: { limit: number; keyword: string; category: string },
) {
  const { limit, keyword, category } = options;
  const d1 = await getD1Binding();
  if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available' }, { status: 500 });
  const db = getD1Drizzle(d1);
  const rows = await db
    .select()
    .from(auditLogsTable)
    .orderBy(desc(auditLogsTable.created_at))
    .limit(limit);
  const auditRows: AuditLogRow[] = rows.map((row) => {
    const r = { ...row } as Record<string, unknown>;
    if (typeof r.details === 'string') {
      try { r.details = JSON.parse(r.details) as LooseRecord; } catch { r.details = {}; }
    }
    return r as AuditLogRow;
  });

  const filtered = auditRows
    .map((log) => normalizeAuditLog(log, staffMap))
    .filter((log) => category === 'all' || log.category === category)
    .filter((log) => matchSearch(log, keyword));

  return NextResponse.json({ logs: filtered });
}

export async function handlePermissionDiffs(
  staffMap: Map<string, StaffRow>,
  options: { limit: number; keyword: string },
) {
  const { limit, keyword } = options;
  const d1 = await getD1Binding();
  if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available' }, { status: 500 });
  const db = getD1Drizzle(d1);
  const rows = await db
    .select()
    .from(auditLogsTable)
    .where(eq(auditLogsTable.target_type, 'staff_permission'))
    .orderBy(desc(auditLogsTable.created_at))
    .limit(limit);
  const auditPermRows: AuditLogRow[] = rows.map((row) => {
    const r = { ...row } as Record<string, unknown>;
    if (typeof r.details === 'string') {
      try { r.details = JSON.parse(r.details) as LooseRecord; } catch { r.details = {}; }
    }
    return r as AuditLogRow;
  });

  const logs = auditPermRows
    .map((log) => normalizeAuditLog(log, staffMap))
    .map((log) => ({
      ...log,
      permission_summary: buildPermissionChangeSummary(log.details || {}),
    }))
    .filter((log) => matchSearch(log, keyword));

  return NextResponse.json({ logs });
}
