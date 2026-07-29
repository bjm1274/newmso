/**
 * 백업·복원 메타 목록 (GET) + 즉시 백업 실행 (POST).
 *
 * 소비처: app/main/기능부품/관리자워크센터/AuditWorkcenter/AuditBackupTab.tsx
 *  - GET: 응답은 배열 또는 { rows: [...] } 모두 허용.
 *    row shape: { id?, file, createdAt, size, kind('자동'|'수동'), duration? }
 *  - POST { kind: '수동' } → 즉시 전체 백업 실행. 성공 시 목록 재조회.
 *
 * 권한: GET/POST 모두 세션 없으면 401, 관리자/시스템마스터 아니면 403.
 * 데이터: backup_restore_runs 메타. 백업 인프라(R2)가 없으면 POST는 실패 사유를
 *         반환하되, GET은 항상 안전하게 빈 목록을 반환(무동작 방지).
 *
 * JM3: 조회 실패 → 빈 rows. POST 실패 → 사유/힌트 동봉 500.
 * JM4: any 금지.
 * JM5: 권한 게이트 후에만 실행. 즉시 백업은 서버에서만 트리거.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  backup_restore_runs as backupRestoreRunsTable,
  desc } from '@/lib/db';
import { runBackup } from '@/lib/backup-cron';
import { guardAuditAdmin } from '../_shared';

export const dynamic = 'force-dynamic';

interface BackupListRow {
  id: string | null;
  file_name: string | null;
  result_summary: string | null;
  total_rows: number | null;
  total_tables: number | null;
  status: string | null;
  requested_by: string | null;
  requested_by_name: string | null;
  started_at: string | null;
  finished_at: string | null;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)}${units[unit]}`;
}

function extractSize(row: BackupListRow): string {
  // result_summary(JSON)에 byte/size 정보가 있으면 사용, 없으면 행수로 근사 표기.
  if (row.result_summary) {
    try {
      const parsed = JSON.parse(row.result_summary) as Record<string, unknown>;
      const bytes = Number(parsed.bytes ?? parsed.size ?? parsed.byte_size);
      if (Number.isFinite(bytes) && bytes > 0) return formatBytes(bytes);
    } catch {
      // 무시 — 행수 폴백
    }
  }
  const rows = Number(row.total_rows);
  if (Number.isFinite(rows) && rows > 0) return `${rows.toLocaleString('ko-KR')}행`;
  return '-';
}

function extractDuration(row: BackupListRow): string | undefined {
  if (!row.started_at || !row.finished_at) return undefined;
  const start = new Date(row.started_at).getTime();
  const end = new Date(row.finished_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
  const sec = Math.round((end - start) / 1000);
  if (sec < 60) return `${sec}초`;
  return `${Math.floor(sec / 60)}분 ${sec % 60}초`;
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  // **timeZone 을 반드시 지정한다.** 이 포맷팅은 서버(Cloudflare Worker)에서 돌고
  // 워커의 로컬 타임존은 UTC 라, 생략하면 UTC 시각을 그대로 찍어 9시간 어긋난다.
  // (2026-07-29 백업이 KST 16:46 인데 목록에 "오전 07:46" 으로 표시됐다.)
  return d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit' });
}

async function listBackups() {
  const d1 = await getD1Binding();
  if (!d1) return [];
  const db = getD1Drizzle(d1);
  const rows = (await db
    .select({
      id: backupRestoreRunsTable.id,
      file_name: backupRestoreRunsTable.file_name,
      result_summary: backupRestoreRunsTable.result_summary,
      total_rows: backupRestoreRunsTable.total_rows,
      total_tables: backupRestoreRunsTable.total_tables,
      status: backupRestoreRunsTable.status,
      requested_by: backupRestoreRunsTable.requested_by,
      requested_by_name: backupRestoreRunsTable.requested_by_name,
      started_at: backupRestoreRunsTable.started_at,
      finished_at: backupRestoreRunsTable.finished_at })
    .from(backupRestoreRunsTable)
    .orderBy(desc(backupRestoreRunsTable.started_at))
    .limit(30)) as BackupListRow[];

  return rows.map((row) => {
    // 요청자(requested_by)가 있으면 수동, 없으면 자동(크론).
    const kind: '자동' | '수동' = row.requested_by || row.requested_by_name ? '수동' : '자동';
    return {
      id: String(row.id || ''),
      file: String(row.file_name || row.id || '(이름 없음)'),
      createdAt: formatCreatedAt(String(row.started_at || '')),
      size: extractSize(row),
      kind,
      duration: extractDuration(row) };
  });
}

export async function GET(request: NextRequest) {
  const denied = await guardAuditAdmin(request);
  if (denied) return denied;

  try {
    const rows = await listBackups();
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}

export async function POST(request: NextRequest) {
  const denied = await guardAuditAdmin(request);
  if (denied) return denied;

  try {
    // 즉시 백업 — 전체(24h) 백업을 R2에 생성.
    const result = await runBackup('24h');
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error || '백업 실행에 실패했습니다.', hint: result.hint ?? null },
        { status: 500 },
      );
    }
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '백업 실행 중 오류가 발생했습니다.';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
