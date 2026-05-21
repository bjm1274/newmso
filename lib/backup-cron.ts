/**
 * MSO 정기 백업 실행 로직 (Cron용)
 * - 6h: 핵심 6개 테이블
 * - 24h: 전체 주요 테이블
 * Cloudflare R2 버킷 'pchos-files'의 backup/ prefix에 JSON 저장.
 */
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { FULL_BACKUP_TABLES, SIX_HOUR_BACKUP_TABLES } from '@/lib/backup-config';
import { uploadToR2, isR2ChatStorageEnabled } from '@/lib/object-storage';

const R2_BUCKET = 'pchos-files';

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
  if (!isR2ChatStorageEnabled()) {
    return {
      ok: false,
      type,
      error: 'Cloudflare R2 configuration is missing.',
      hint: 'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY 환경변수를 설정해 주세요.',
    };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return {
      ok: false,
      type,
      error: 'Missing Supabase env',
    };
  }

  const supabase = createClient(supabaseUrl, serviceKey);
  const tables = type === '24h' ? FULL_BACKUP_TABLES : SIX_HOUR_BACKUP_TABLES;
  const data: Record<string, unknown[]> = {};
  const now = new Date();
  const iso = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dateOnly = now.toISOString().slice(0, 10);

  for (const table of tables) {
    try {
      const allRows: unknown[] = [];
      const PAGE_SIZE = 1000;
      let offset = 0;
      while (true) {
        const { data: rows, error } = await supabase
          .from(table)
          .select('*')
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) {
          console.warn(`[backup] skip ${table}:`, error.message);
          break;
        }
        if (!rows || rows.length === 0) break;
        allRows.push(...rows);
        if (rows.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
      data[table] = allRows;
    } catch (e) {
      console.warn(`[backup] skip ${table}:`, e);
    }
  }

  const json = JSON.stringify(data, null, 2);
  const objectKey =
    type === '24h'
      ? `backup/24h/mso-full-${dateOnly}-${iso}.json`
      : `backup/6h/mso-data-${iso}.json`;

  try {
    await uploadToR2(R2_BUCKET, objectKey, Buffer.from(json, 'utf-8'), 'application/json');
  } catch (uploadError: unknown) {
    const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
    console.error('[backup] upload failed', uploadError);
    return {
      ok: false,
      type,
      error: message,
      hint: `R2 버킷 '${R2_BUCKET}'에 backup/ prefix로 쓸 수 있는지 확인하세요.`,
    };
  }

  return {
    ok: true,
    type,
    path: objectKey,
    tables: Object.keys(data).length,
  };
}
