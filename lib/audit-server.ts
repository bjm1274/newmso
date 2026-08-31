import 'server-only';
import {
  audit_logs as auditLogsTable,
  getD1Binding,
  getD1Drizzle,
  resolveDataBackend,
} from './db';
import { logD1BindingMissing } from './db/mirror-metrics';

export async function logAuditServer(
  action: string,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown>,
  userId?: string,
  userName?: string,
) {
  const createdAt = new Date().toISOString();
  try {
    const backend = await resolveDataBackend();
    const d1 = await getD1Binding();
    if (!d1) {
      logD1BindingMissing({ label: 'logAuditServer', backend });
      return;
    }
    const db = getD1Drizzle(d1);
    await db.insert(auditLogsTable).values({
      id: crypto.randomUUID(),
      user_id: userId || null,
      user_name: userName || null,
      action,
      target_type: targetType,
      target_id: targetId,
      details: JSON.stringify(details),
      created_at: createdAt,
    });
  } catch (e) {
    console.error('[audit_logs] logAuditServer failed:', e);
  }
}
