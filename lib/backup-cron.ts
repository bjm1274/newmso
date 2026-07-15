/**
 * MSO 정기 백업 실행 로직 (Cron용)
 * - 6h: 핵심 6개 테이블
 * - 24h: 전체 주요 테이블
 * Cloudflare R2 버킷 'pchos-files'의 backup/ prefix에 JSON 저장.
 *
 * 데이터 소스: Cloudflare D1 (운영 진실원).
 * 성공/실패 모두 backup_restore_runs 에 메타를 남겨 관리자 화면·장애 추적 가능.
 */
import 'server-only';
import { formatKoreanDateKey } from '@/lib/seoul-time';
import { FULL_BACKUP_TABLES, SIX_HOUR_BACKUP_TABLES } from '@/lib/backup-config';
import { uploadToR2, isR2ChatStorageEnabled } from '@/lib/object-storage';
import { getD1Binding } from '@/lib/db';

const R2_BUCKET = 'pchos-files';
const PAGE_SIZE = 1000;
const TABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type BackupType = '6h' | '24h';

export interface BackupResult {
  ok: boolean;
  type: BackupType;
  path?: string;
  tables?: number;
  rows?: number;
  bytes?: number;
  error?: string;
  hint?: string;
}

async function recordBackupRun(params: {
  id: string;
  fileName: string;
  status: 'completed' | 'failed' | 'running' | 'preview';
  totalTables: number;
  totalRows: number;
  resultSummary: Record<string, unknown> | BackupResult;
  startedAt: string;
  finishedAt: string | null;
  requestedByName?: string;
}): Promise<void> {
  try {
    const d1 = await getD1Binding();
    if (!d1) return;
    await d1
      .prepare(
        `INSERT INTO backup_restore_runs (
          id, file_name, result_summary, total_tables, total_rows, status,
          requested_by_name, started_at, finished_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          file_name = excluded.file_name,
          result_summary = excluded.result_summary,
          total_tables = excluded.total_tables,
          total_rows = excluded.total_rows,
          status = excluded.status,
          finished_at = excluded.finished_at`,
      )
      .bind(
        params.id,
        params.fileName,
        JSON.stringify(params.resultSummary as Record<string, unknown>),
        params.totalTables,
        params.totalRows,
        params.status,
        params.requestedByName ?? 'cron',
        params.startedAt,
        params.finishedAt,
      )
      .run();
  } catch (e) {
    console.warn('[backup] backup_restore_runs write failed:', e);
  }
}

export async function runBackup(type: BackupType): Promise<BackupResult> {
  const runId = crypto.randomUUID();
  const startedAt = new Date().toISOString();

  if (!isR2ChatStorageEnabled()) {
    const result: BackupResult = {
      ok: false,
      type,
      error: 'Cloudflare R2 configuration is missing.',
      hint: 'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY 환경변수를 설정해 주세요.',
    };
    await recordBackupRun({
      id: runId,
      fileName: `backup/${type}/failed-${startedAt}`,
      status: 'failed',
      totalTables: 0,
      totalRows: 0,
      resultSummary: result,
      startedAt,
      finishedAt: new Date().toISOString(),
      requestedByName: 'cron',
    });
    return result;
  }

  const d1 = await getD1Binding();
  if (!d1) {
    const result: BackupResult = {
      ok: false,
      type,
      error: 'D1 binding not available',
      hint: 'Cloudflare Workers 환경에서만 백업을 실행할 수 있습니다.',
    };
    await recordBackupRun({
      id: runId,
      fileName: `backup/${type}/failed-${startedAt}`,
      status: 'failed',
      totalTables: 0,
      totalRows: 0,
      resultSummary: result,
      startedAt,
      finishedAt: new Date().toISOString(),
      requestedByName: 'cron',
    });
    return result;
  }

  const tables = type === '24h' ? FULL_BACKUP_TABLES : SIX_HOUR_BACKUP_TABLES;
  const data: Record<string, unknown[]> = {};
  const skipped: Array<{ table: string; error: string }> = [];
  let totalRows = 0;
  const now = new Date();
  const iso = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dateOnly = formatKoreanDateKey(now);

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
      totalRows += allRows.length;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[backup] skip ${table}:`, message);
      skipped.push({ table, error: message.slice(0, 200) });
    }
  }

  // pretty-print 제거 — 메모리·업로드 시간·워커 타임아웃 완화
  const json = JSON.stringify({
    meta: {
      type,
      createdAt: startedAt,
      tables: Object.keys(data).length,
      rows: totalRows,
      skipped,
    },
    data,
  });
  const bytes = Buffer.byteLength(json, 'utf-8');
  const objectKey =
    type === '24h'
      ? `backup/24h/mso-full-${dateOnly}-${iso}.json`
      : `backup/6h/mso-data-${iso}.json`;

  try {
    await uploadToR2(R2_BUCKET, objectKey, Buffer.from(json, 'utf-8'), 'application/json');
  } catch (uploadError: unknown) {
    const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
    console.error('[backup] upload failed', uploadError);
    const result: BackupResult = {
      ok: false,
      type,
      error: message,
      hint: `R2 버킷 '${R2_BUCKET}'에 backup/ prefix로 쓸 수 있는지 확인하세요.`,
      tables: Object.keys(data).length,
      rows: totalRows,
      bytes,
    };
    await recordBackupRun({
      id: runId,
      fileName: objectKey,
      status: 'failed',
      totalTables: Object.keys(data).length,
      totalRows,
      resultSummary: { ...result, skipped },
      startedAt,
      finishedAt: new Date().toISOString(),
      requestedByName: 'cron',
    });
    return result;
  }

  const result: BackupResult = {
    ok: true,
    type,
    path: objectKey,
    tables: Object.keys(data).length,
    rows: totalRows,
    bytes,
  };
  await recordBackupRun({
    id: runId,
    fileName: objectKey,
    status: 'completed',
    totalTables: Object.keys(data).length,
    totalRows,
    resultSummary: { ...result, skipped },
    startedAt,
    finishedAt: new Date().toISOString(),
    requestedByName: 'cron',
  });
  console.log(
    `[backup] ok type=${type} path=${objectKey} tables=${result.tables} rows=${totalRows} bytes=${bytes}`,
  );
  return result;
}
