import { supabase } from './supabase';

export type AuditAction = '급여수정' | '결재승인' | '결재반려' | '연차차감' | '인사변경' | '출결정정' | '설정변경' | '중간정산확정';

export async function logAudit(
  action: AuditAction,
  targetType: string,
  targetId: string | null,
  details: Record<string, unknown>,
  userId?: string,
  userName?: string
) {
  try {
    await supabase.from('audit_logs').insert([{
      user_id: userId || null,
      user_name: userName || null,
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      created_at: new Date().toISOString(),
    }]);
  } catch (e) {
    console.error('Audit log failed:', e);
  }
}
