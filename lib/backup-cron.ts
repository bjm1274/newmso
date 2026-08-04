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
import { BACKUP_EXCLUDED_TABLES, SIX_HOUR_BACKUP_TABLES } from '@/lib/backup-config';
import { uploadToR2, isR2ChatStorageEnabled } from '@/lib/object-storage';
import { getD1Binding } from '@/lib/db';

const R2_BUCKET = 'pchos-files';
const PAGE_SIZE = 1000;
const TABLE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * 전체 백업 대상 테이블을 DB 에서 직접 열거한다.
 *
 * 예전에는 손으로 관리하는 목록(BACKUP_GROUPS)을 썼고, 그 결과 스키마 162개 중
 * 52개만 백업되고 있었다. 새 테이블이 추가돼도 아무도 목록에 넣지 않았기 때문이다.
 * 이제는 DB 에 있는 것이 기본 백업 대상이고, 빼려면 BACKUP_EXCLUDED_TABLES 에
 * 명시해야 한다 — 누락이 조용히 생기지 않도록 방향을 뒤집었다.
 */
async function listBackupTables(
  d1: NonNullable<Awaited<ReturnType<typeof getD1Binding>>>,
): Promise<string[]> {
  const result = await d1
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table'
         AND name NOT LIKE 'sqlite_%'
         AND name NOT LIKE '_cf_%'
       ORDER BY name`,
    )
    .all<{ name: string }>();

  return (result.results ?? [])
    .map((row) => String(row.name))
    .filter((name) => TABLE_NAME_RE.test(name))
    .filter((name) => !BACKUP_EXCLUDED_TABLES.has(name));
}

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

  const tables =
    type === '24h' ? await listBackupTables(d1) : [...SIX_HOUR_BACKUP_TABLES];
  const skipped: Array<{ table: string; error: string }> = [];
  const files: Array<{ table: string; key: string; rows: number; bytes: number }> = [];
  let totalRows = 0;
  let totalBytes = 0;
  const now = new Date();
  const iso = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dateOnly = formatKoreanDateKey(now);

  // **테이블별로 따로 올린다. 전부 모아서 한 파일로 만들면 워커가 죽는다.**
  //
  // 예전에는 모든 테이블의 전 행을 data 객체에 쌓고 JSON.stringify → Buffer 로
  // 3중 복사한 뒤 한 번에 업로드했다. JSON 텍스트만 40~60MB 인데 JS 객체 상태의
  // 메모리는 그 2~5배라(행마다 20여 개 문자열 키) 워커 128MB 한계를 넘겨
  // 아이솔레이트가 그냥 죽었다. 죽으면 아래 recordBackupRun 도 실행되지 않아
  // backup_restore_runs 에 성공도 실패도 안 남고, 관리자 화면에서는
  // "버튼을 눌러도 아무 반응이 없는" 상태가 된다. cron 도 같은 이유로
  // audit_logs 에 아무 기록 없이 사라졌다(2026-07-28 15:00 UTC).
  //
  // 이제 한 번에 한 테이블만 메모리에 두고 즉시 업로드한 뒤 참조를 버린다.
  // 최대 사용량은 가장 큰 테이블 하나(현재 notifications 약 12MB) 수준이다.
  // 앱에서 이 백업 JSON 을 파싱하는 코드는 없고(관리자 목록은 D1 메타만 읽는다)
  // 복구는 수동이므로 파일 분할이 안전하다.
  const folderKey =
    type === '24h'
      ? `backup/24h/mso-full-${dateOnly}-${iso}`
      : `backup/6h/mso-data-${iso}`;

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

      const tableJson = JSON.stringify(allRows);
      const tableBytes = Buffer.byteLength(tableJson, 'utf-8');
      const tableKey = `${folderKey}/${table}.json`;
      await uploadToR2(R2_BUCKET, tableKey, Buffer.from(tableJson, 'utf-8'), 'application/json');

      files.push({ table, key: tableKey, rows: allRows.length, bytes: tableBytes });
      totalRows += allRows.length;
      totalBytes += tableBytes;
      // allRows/tableJson 은 여기서 참조가 끊겨 다음 테이블 전에 회수된다.
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[backup] skip ${table}:`, message);
      skipped.push({ table, error: message.slice(0, 200) });
    }
  }

  // 매니페스트는 마지막에 올린다 — 이 파일이 있으면 백업이 끝까지 갔다는 뜻이다.
  const manifestKey = `${folderKey}/manifest.json`;
  const manifestJson = JSON.stringify({
    meta: {
      type,
      createdAt: startedAt,
      finishedAt: new Date().toISOString(),
      tables: files.length,
      rows: totalRows,
      bytes: totalBytes,
      skipped,
      layout: 'per-table',
    },
    files,
  });

  try {
    await uploadToR2(
      R2_BUCKET,
      manifestKey,
      Buffer.from(manifestJson, 'utf-8'),
      'application/json',
    );
  } catch (uploadError: unknown) {
    const message = uploadError instanceof Error ? uploadError.message : String(uploadError);
    console.error('[backup] manifest upload failed', uploadError);
    const result: BackupResult = {
      ok: false,
      type,
      error: message,
      hint: `R2 버킷 '${R2_BUCKET}'에 backup/ prefix로 쓸 수 있는지 확인하세요.`,
      tables: files.length,
      rows: totalRows,
      bytes: totalBytes,
    };
    await recordBackupRun({
      id: runId,
      fileName: manifestKey,
      status: 'failed',
      totalTables: files.length,
      totalRows,
      resultSummary: { ...result, skipped },
      startedAt,
      finishedAt: new Date().toISOString(),
      requestedByName: 'cron',
    });
    return result;
  }

  // 테이블을 하나도 못 올렸으면 성공이 아니다 (빈 백업을 성공으로 남기지 않는다).
  if (files.length === 0) {
    const result: BackupResult = {
      ok: false,
      type,
      error: '백업된 테이블이 없습니다.',
      hint: skipped.length > 0 ? `${skipped.length}개 테이블이 모두 실패했습니다.` : undefined,
      tables: 0,
      rows: 0,
      bytes: totalBytes,
    };
    await recordBackupRun({
      id: runId,
      fileName: manifestKey,
      status: 'failed',
      totalTables: 0,
      totalRows: 0,
      resultSummary: { ...result, skipped },
      startedAt,
      finishedAt: new Date().toISOString(),
      requestedByName: 'cron',
    });
    return result;
  }

  // 일부 테이블이 실패했으면 성공이 아니다.
  //
  // 예전에는 skipped 가 있어도 ok:true / status:'completed' 로 끝내서,
  // 특정 테이블이 매일 실패해도 관리자 화면에는 계속 "완료"로 보였고
  // cron 도 성공으로 보고해 아무 알림이 뜨지 않았다.
  // 복구가 필요한 시점에야 그 테이블이 어느 백업에도 없다는 걸 알게 된다.
  if (skipped.length > 0) {
    const result: BackupResult = {
      ok: false,
      type,
      path: manifestKey,
      error: `${tables.length}개 중 ${skipped.length}개 테이블 백업 실패`,
      hint: `실패 테이블: ${skipped.map((s) => s.table).join(', ').slice(0, 300)}`,
      tables: files.length,
      rows: totalRows,
      bytes: totalBytes,
    };
    await recordBackupRun({
      id: runId,
      fileName: manifestKey,
      status: 'failed',
      totalTables: files.length,
      totalRows,
      resultSummary: { ...result, attemptedTables: tables.length, skipped },
      startedAt,
      finishedAt: new Date().toISOString(),
      requestedByName: 'cron',
    });
    return result;
  }

  const result: BackupResult = {
    ok: true,
    type,
    path: manifestKey,
    tables: files.length,
    rows: totalRows,
    bytes: totalBytes,
  };
  await recordBackupRun({
    id: runId,
    fileName: manifestKey,
    status: 'completed',
    totalTables: files.length,
    totalRows,
    resultSummary: { ...result, skipped },
    startedAt,
    finishedAt: new Date().toISOString(),
    requestedByName: 'cron',
  });
  console.log(
    `[backup] ok type=${type} path=${manifestKey} tables=${result.tables} rows=${totalRows} bytes=${totalBytes}`,
  );
  return result;
}
