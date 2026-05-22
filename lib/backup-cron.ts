/**
 * MSO 정기 백업 실행 로직 (Cron용)
 * - 6h: 핵심 6개 테이블
 * - 24h: 전체 주요 테이블
 * Cloudflare R2 버킷 'pchos-files'의 backup/ prefix에 JSON 저장.
 *
 * 데이터 소스: Cloudflare D1 (운영 진실원). D1 컷오버 이후 Supabase는 stale하므로
 * 반드시 D1에서 직접 읽는다.
 */
import 'server-only';
import { FULL_BACKUP_TABLES, SIX_HOUR_BACKUP_TABLES } from '@/lib/backup-config';
import { uploadToR2, isR2ChatStorageEnabled } from '@/lib/object-storage';
import { getD1Binding } from '@/lib/db';

const R2_BUCKET = 'pchos-files';
const PAGE_SIZE = 1000;
// 백업 대상 테이블명은 backup-config의 하드코딩 화이트리스트지만, 식별자를
// SQL에 직접 끼우므로 방어적으로 형식을 한 번 더 검증한다.
const TABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

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

  const d1 = await getD1Binding();
  if (!d1) {
    return {
      ok: false,
      type,
      error: 'D1 binding not available',
      hint: 'Cloudflare Workers 환경에서만 백업을 실행할 수 있습니다.',
    };
  }

  const tables = type === '24h' ? FULL_BACKUP_TABLES : SIX_HOUR_BACKUP_TABLES;
  const data: Record<string, unknown[]> = {};
  const now = new Date();
  const iso = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dateOnly = now.toISOString().slice(0, 10);

  for (const table of tables) {
    if (!TABLE_NAME_RE.test(table)) {
      console.warn(`[backup] skip invalid table name: ${table}`);
      continue;
    }
    try {
      const allRows: unknown[] = [];
      let offset = 0;
      for (;;) {
        const result = await d1
          .prepare(`SELECT * FROM "${table}" LIMIT ? OFFSET ?`)
          .bind(PAGE_SIZE, offset)
          .all();
        const rows = (result.results ?? []) as unknown[];
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
