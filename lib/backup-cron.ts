/**
 * MSO 정기 백업 실행 로직 (Cron용)
 * - 6h: 핵심 6개 테이블
 * - 24h: 전체 주요 테이블
 * Supabase Storage 버킷 'mso-backups'에 JSON 저장.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SIX_HOUR_TABLES = [
  'staff_members',
  'payroll_records',
  'leave_requests',
  'attendances',
  'approvals',
  'audit_logs',
];

const FULL_BACKUP_TABLES = [
  'staff_members',
  'companies',
  'chat_rooms',
  'push_subscriptions',
  'messages',
  'board_posts',
  'posts',
  'approvals',
  'inventory',
  'tasks',
  'notifications',
  'attendance',
  'work_shifts',
  'attendances',
  'leave_requests',
  'payroll_records',
  'attendance_deduction_rules',
  'audit_logs',
  'approval_history',
  'approval_templates',
  'message_reads',
  'room_read_cursors',
  'room_notification_settings',
  'polls',
  'poll_votes',
  'message_reactions',
  'pinned_messages',
  'board_post_likes',
  'board_post_comments',
  'suppliers',
  'purchase_orders',
  'inventory_logs',
  'employment_contracts',
  'attendance_corrections',
  'popups',
  'payroll_locks',
  'approval_form_types',
  'certificate_issuances',
  'corporate_cards',
  'corporate_card_transactions',
];

const BUCKET = 'mso-backups';

export type BackupType = '6h' | '24h';

export interface BackupResult {
  ok: boolean;
  type: BackupType;
  path?: string;
  tables?: number;
  error?: string;
  hint?: string;
}

export async function runBackup(type: BackupType): Promise<BackupResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      type,
      error: 'Missing Supabase env',
    };
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey);
  const tables = type === '24h' ? FULL_BACKUP_TABLES : SIX_HOUR_TABLES;
  const data: Record<string, unknown[]> = {};
  const now = new Date();
  const iso = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dateOnly = now.toISOString().slice(0, 10);

  for (const table of tables) {
    try {
      const { data: rows, error } = await supabase.from(table).select('*');
      if (error) {
        console.warn(`[backup] skip ${table}:`, error.message);
        continue;
      }
      data[table] = rows ?? [];
    } catch (e) {
      console.warn(`[backup] skip ${table}:`, e);
    }
  }

  const json = JSON.stringify(data, null, 2);
  const path =
    type === '24h'
      ? `24h/mso-full-${dateOnly}-${iso}.json`
      : `6h/mso-data-${iso}.json`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Blob([json], { type: 'application/json' }), {
      contentType: 'application/json',
      upsert: true,
    });

  if (uploadError) {
    console.error('[backup] upload failed', uploadError);
    return {
      ok: false,
      type,
      error: uploadError.message,
      hint: `Supabase Storage에 '${BUCKET}' 버킷을 생성해 주세요.`,
    };
  }

  return {
    ok: true,
    type,
    path,
    tables: Object.keys(data).length,
  };
}
