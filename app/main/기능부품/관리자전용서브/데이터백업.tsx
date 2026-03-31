'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { BACKUP_GROUPS, BACKUP_RESTORE_ORDER, resolveBackupTables } from '@/lib/backup-config';
import { supabase } from '@/lib/supabase';
import { useActionDialog } from '@/app/components/useActionDialog';
import { getStaffLikeId, normalizeStaffLike } from '@/lib/staff-identity';

const PAGE_SIZE = 1000;
const RESTORE_BATCH_SIZE = 200;
const RESTORE_HISTORY_LIMIT = 6;

type BackupMeta = {
  version?: number;
  exported_at?: string;
  selected_groups?: string[];
  selected_tables?: string[];
  skipped_tables?: Array<{ table: string; reason: string }>;
};

type RestorePreviewTable = {
  table: string;
  rowCount: number;
  currentRowCount: number | null;
  delta: number | null;
};

type RestorePreview = {
  meta: BackupMeta | null;
  tables: RestorePreviewTable[];
  totalRows: number;
  currentTotalRows: number;
};

type RestoreRunRow = {
  id: string;
  file_name: string;
  status: 'preview' | 'running' | 'completed' | 'failed' | string;
  total_tables: number;
  total_rows: number;
  requested_by_name?: string | null;
  started_at: string;
  finished_at?: string | null;
  result_summary?: Record<string, unknown> | null;
};

type Props = {
  user?: Record<string, unknown> | null;
};

function chunkRows<T>(rows: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function normalizeBackupPayload(raw: unknown) {
  if (!raw || typeof raw !== 'object') {
    return { meta: null as BackupMeta | null, tables: {} as Record<string, any[]> };
  }

  const record = raw as Record<string, unknown>;
  const hasWrappedTables =
    record.tables &&
    typeof record.tables === 'object' &&
    !Array.isArray(record.tables);

  return {
    meta: (record.__meta as BackupMeta | null | undefined) ?? null,
    tables: hasWrappedTables
      ? (record.tables as Record<string, any[]>)
      : Object.fromEntries(
          Object.entries(record).filter(([key, value]) => key !== '__meta' && Array.isArray(value))
        ),
  };
}

function downloadJsonFile(fileName: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function readAllRows(table: string) {
  const rows: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      return { rows, error };
    }

    const nextRows = data || [];
    rows.push(...nextRows);
    offset += nextRows.length;
    hasMore = nextRows.length === PAGE_SIZE;
  }

  return { rows, error: null };
}

async function readExactCount(table: string) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (error) {
    return { count: null as number | null, error };
  }

  return { count: typeof count === 'number' ? count : 0, error: null };
}

function formatDelta(delta: number | null) {
  if (delta === null) return '비교 불가';
  if (delta === 0) return '변화 없음';
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString()}건`;
}

function getRunStatusMeta(status: string) {
  switch (status) {
    case 'completed':
      return { label: '완료', className: 'bg-emerald-100 text-emerald-700' };
    case 'failed':
      return { label: '실패', className: 'bg-red-500/20 text-red-700' };
    case 'running':
      return { label: '진행 중', className: 'bg-amber-100 text-amber-700' };
    default:
      return { label: status || '미상', className: 'bg-slate-100 text-slate-600' };
  }
}

function isMissingRestoreRunSchema(error: unknown) {
  const code = String((error as { code?: string } | null)?.code || '').trim();
  const message = `${String((error as { message?: string } | null)?.message || '')} ${String((error as { details?: string } | null)?.details || '')}`.toLowerCase();
  return code === '42P01' || message.includes('backup_restore_runs');
}

export default function DataBackup({ user }: Props) {
  const normalizedUser = useMemo(
    () => normalizeStaffLike((user ?? {}) as Record<string, unknown>),
    [user]
  );
  const requestedBy = getStaffLikeId(normalizedUser);
  const requestedByName = String(normalizedUser.name || '').trim() || null;

  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreLogs, setRestoreLogs] = useState<string[]>([]);
  const [restoreRuns, setRestoreRuns] = useState<RestoreRunRow[]>([]);
  const [exportSummary, setExportSummary] = useState<{
    exportedAt: string;
    tableCount: number;
    rowCount: number;
    skipped: Array<{ table: string; reason: string }>;
  } | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(
    BACKUP_GROUPS.map((group) => group.id)
  );

  const fileRef = useRef<HTMLInputElement>(null);
  const { dialog, openPrompt } = useActionDialog();

  const selectedTables = useMemo(
    () => resolveBackupTables(selectedGroupIds),
    [selectedGroupIds]
  );

  const loadRestoreRuns = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const { data, error } = await supabase
        .from('backup_restore_runs')
        .select('id,file_name,status,total_tables,total_rows,requested_by_name,started_at,finished_at,result_summary')
        .order('started_at', { ascending: false })
        .limit(RESTORE_HISTORY_LIMIT);
      if (error) throw error;
      setRestoreRuns((data || []) as RestoreRunRow[]);
    } catch (error) {
      console.error('restore run history load failed:', error);
      setRestoreRuns([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRestoreRuns();
  }, [loadRestoreRuns]);

  useEffect(() => {
    const channel = supabase
      .channel('backup-restore-runs-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'backup_restore_runs' }, () => {
        void loadRestoreRuns();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadRestoreRuns]);

  useEffect(() => {
    if (!restoreFile) {
      setRestorePreview(null);
      return;
    }

    let cancelled = false;
    const parseRestorePreview = async () => {
      try {
        setPreviewLoading(true);
        const text = await restoreFile.text();
        const parsed = normalizeBackupPayload(JSON.parse(text));
        const baseTables = Object.entries(parsed.tables)
          .filter(([, rows]) => Array.isArray(rows))
          .map(([table, rows]) => ({
            table,
            rowCount: Array.isArray(rows) ? rows.length : 0,
          }))
          .sort((a, b) => b.rowCount - a.rowCount || a.table.localeCompare(b.table));

        const currentCounts = await Promise.all(
          baseTables.map(async (entry) => {
            const result = await readExactCount(entry.table);
            return {
              table: entry.table,
              currentRowCount: result.error ? null : result.count,
            };
          })
        );

        if (cancelled) return;

        const currentCountMap = new Map(
          currentCounts.map((entry) => [entry.table, entry.currentRowCount])
        );
        const tables = baseTables.map((entry) => {
          const currentRowCount = currentCountMap.get(entry.table) ?? null;
          return {
            table: entry.table,
            rowCount: entry.rowCount,
            currentRowCount,
            delta: currentRowCount === null ? null : entry.rowCount - currentRowCount,
          };
        });

        setRestorePreview({
          meta: parsed.meta,
          tables,
          totalRows: tables.reduce((sum, entry) => sum + entry.rowCount, 0),
          currentTotalRows: tables.reduce(
            (sum, entry) => sum + (typeof entry.currentRowCount === 'number' ? entry.currentRowCount : 0),
            0
          ),
        });
      } catch (error) {
        console.error('restore preview parse failed:', error);
        if (!cancelled) {
          setRestorePreview(null);
        }
      } finally {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      }
    };

    void parseRestorePreview();
    return () => {
      cancelled = true;
    };
  }, [restoreFile]);

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleRestoreFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] || null;
    setRestoreFile(nextFile);
    setRestoreLogs([]);
  };

  const exportData = async () => {
    if (selectedTables.length === 0) {
      toast('내보낼 데이터 범위를 하나 이상 선택해 주세요.', 'warning');
      return;
    }

    setLoading(true);
    setExportSummary(null);

    try {
      const backupTables: Record<string, any[]> = {};
      const skippedTables: Array<{ table: string; reason: string }> = [];
      let totalRows = 0;

      for (const table of selectedTables) {
        const { rows, error } = await readAllRows(table);
        if (error) {
          skippedTables.push({
            table,
            reason: String(error.message || error.details || 'table unavailable'),
          });
          continue;
        }
        backupTables[table] = rows;
        totalRows += rows.length;
      }

      const exportedAt = new Date().toISOString();
      const payload = {
        __meta: {
          version: 2,
          exported_at: exportedAt,
          selected_groups: selectedGroupIds,
          selected_tables: selectedTables,
          skipped_tables: skippedTables,
        },
        tables: backupTables,
      };

      downloadJsonFile(`mso-backup-${exportedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`, payload);

      setLastExport(new Date().toLocaleString());
      setExportSummary({
        exportedAt,
        tableCount: Object.keys(backupTables).length,
        rowCount: totalRows,
        skipped: skippedTables,
      });
      toast('백업 파일을 내보냈습니다.', 'success');
    } catch (error) {
      console.error(error);
      toast('백업 파일 생성 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const createRestoreRun = async (preview: RestorePreview) => {
    const payload = {
      file_name: restoreFile?.name || 'restore.json',
      meta: preview.meta || {},
      preview: preview.tables,
      total_tables: preview.tables.length,
      total_rows: preview.totalRows,
      status: 'running',
      requested_by: requestedBy,
      requested_by_name: requestedByName,
      started_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('backup_restore_runs')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      if (isMissingRestoreRunSchema(error)) return '';
      throw error;
    }
    return String(data?.id || '');
  };

  const updateRestoreRun = async (
    runId: string,
    payload: Record<string, unknown>
  ) => {
    if (!runId) return;
    const { error } = await supabase
      .from('backup_restore_runs')
      .update(payload)
      .eq('id', runId);
    if (error) {
      if (isMissingRestoreRunSchema(error)) return;
      throw error;
    }
  };

  const restoreData = async () => {
    if (!restoreFile || !restorePreview) {
      toast('복원할 JSON 파일을 먼저 선택해 주세요.', 'warning');
      return;
    }

    const answer = await openPrompt({
      title: '백업 복원',
      description: `${restorePreview.tables.length}개 테이블 / ${restorePreview.totalRows.toLocaleString()}건 데이터를 복원합니다.\n현재 기준 ${restorePreview.currentTotalRows.toLocaleString()}건과 비교한 뒤 upsert로 복원합니다. 계속하려면 아래에 "복원"을 입력해 주세요.`,
      confirmText: '복원 실행',
      cancelText: '취소',
      tone: 'danger',
      placeholder: '복원',
      required: true,
      helperText: '복원 실행 이력과 로그가 관리자 화면에 저장됩니다.',
    });

    if (answer?.trim() !== '복원') {
      return;
    }

    setLoading(true);
    setRestoreLogs([]);

    let runId = '';
    let latestLogs: string[] = [];
    try {
      runId = await createRestoreRun(restorePreview);

      const text = await restoreFile.text();
      const parsed = normalizeBackupPayload(JSON.parse(text));
      const tableEntries = Object.entries(parsed.tables).filter(([, rows]) => Array.isArray(rows) && rows.length > 0);
      const restoreOrder = [
        ...BACKUP_RESTORE_ORDER.filter((table) => Array.isArray(parsed.tables[table]) && parsed.tables[table].length > 0),
        ...tableEntries.map(([table]) => table).filter((table) => !BACKUP_RESTORE_ORDER.includes(table)),
      ];

      const nextLogs: string[] = [];
      const failedTables: Array<{ table: string; error: string }> = [];
      let completedTables = 0;
      const rollbackTables: Record<string, any[]> = {};

      nextLogs.push(`롤백 스냅샷 생성 시작: ${restoreOrder.length.toLocaleString()}개 테이블`);
      latestLogs = [...nextLogs];
      setRestoreLogs(latestLogs);

      for (const table of restoreOrder) {
        const snapshot = await readAllRows(table);
        if (snapshot.error) {
          const message = String(snapshot.error.message || snapshot.error.details || 'snapshot failed');
          nextLogs.push(`${table}: 롤백 스냅샷 실패 - ${message}`);
          latestLogs = [...nextLogs];
          setRestoreLogs(latestLogs);
          throw new Error(`롤백 스냅샷 생성 실패 (${table}): ${message}`);
        }
        rollbackTables[table] = snapshot.rows;
        nextLogs.push(`${table}: 롤백 스냅샷 ${snapshot.rows.length.toLocaleString()}건 저장`);
        latestLogs = [...nextLogs];
        setRestoreLogs(latestLogs);
      }

      const rollbackExportedAt = new Date().toISOString();
      const restoreBaseName = (restoreFile.name || 'restore').replace(/\.json$/i, '');
      const rollbackFileName = `rollback-before-${restoreBaseName}-${rollbackExportedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`;
      const rollbackPayload = {
        __meta: {
          version: 1,
          exported_at: rollbackExportedAt,
          type: 'rollback-before-restore',
          source_restore_file: restoreFile.name,
          total_tables: restoreOrder.length,
          total_rows: Object.values(rollbackTables).reduce((sum, rows) => sum + rows.length, 0),
        },
        tables: rollbackTables,
      };

      downloadJsonFile(rollbackFileName, rollbackPayload);
      nextLogs.push(`롤백 스냅샷 다운로드 완료: ${rollbackFileName}`);
      latestLogs = [...nextLogs];
      setRestoreLogs(latestLogs);

      for (const table of restoreOrder) {
        const rows = parsed.tables[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        nextLogs.push(`${table}: ${rows.length.toLocaleString()}건 복원 시작`);
        latestLogs = [...nextLogs];
        setRestoreLogs(latestLogs);

        let failed = false;
        for (const batch of chunkRows(rows, RESTORE_BATCH_SIZE)) {
          const { error } = await supabase
            .from(table)
            .upsert(batch as any[]);

          if (error) {
            failed = true;
            const message = String(error.message || error.details || 'unknown error');
            failedTables.push({ table, error: message });
            nextLogs.push(`${table}: 실패 - ${message}`);
            latestLogs = [...nextLogs];
            setRestoreLogs(latestLogs);
            break;
          }
        }

        if (!failed) {
          completedTables += 1;
          nextLogs.push(`${table}: 완료`);
          latestLogs = [...nextLogs];
          setRestoreLogs(latestLogs);
        }
      }

      const status = failedTables.length > 0 ? 'failed' : 'completed';
      const rollbackTotalRows = Object.values(rollbackTables).reduce((sum, rows) => sum + rows.length, 0);
      await updateRestoreRun(runId, {
        status,
        finished_at: new Date().toISOString(),
        log_lines: nextLogs,
        result_summary: {
          completed_tables: completedTables,
          failed_tables: failedTables,
          preview_total_rows: restorePreview.totalRows,
          preview_current_rows: restorePreview.currentTotalRows,
          rollback_file_name: rollbackFileName,
          rollback_total_tables: restoreOrder.length,
          rollback_total_rows: rollbackTotalRows,
        },
      });

      toast(
        failedTables.length > 0
          ? '일부 테이블 복원에 실패했습니다. 복원 로그를 확인해 주세요.'
          : '복원 작업이 완료되었습니다. 복원 로그를 확인해 주세요.',
        failedTables.length > 0 ? 'warning' : 'success'
      );
      setRestoreFile(null);
      setRestorePreview(null);
      if (fileRef.current) fileRef.current.value = '';
      void loadRestoreRuns();
    } catch (error) {
      console.error(error);
      if (runId) {
        try {
          await updateRestoreRun(runId, {
            status: 'failed',
            finished_at: new Date().toISOString(),
            log_lines: latestLogs,
            result_summary: {
              error: String((error as Error)?.message || error),
            },
          });
        } catch (updateError) {
          console.error('restore run update failed:', updateError);
        }
      }
      toast('복원 중 오류가 발생했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      {dialog}

      <div className="space-y-1">
        <h3 className="text-lg font-black tracking-tight text-[var(--foreground)]">데이터 백업</h3>
        <p className="text-xs font-semibold leading-relaxed text-[var(--toss-gray-3)]">
          운영 중인 핵심 테이블만 골라 JSON으로 내보내고, 복원 전에는 현재 행 수와 차이를 미리 보고 실행 이력까지 남깁니다.
        </p>
      </div>

      <section className="space-y-3 rounded-[24px] border border-[var(--border)] bg-[var(--background)]/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-black text-[var(--foreground)]">백업 범위</h4>
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
              {selectedTables.length}개 테이블 선택됨
            </p>
          </div>
          <button
            type="button"
            onClick={exportData}
            disabled={loading}
            className="rounded-[16px] bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            {loading ? '내보내는 중...' : '선택 범위 백업'}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {BACKUP_GROUPS.map((group) => {
            const checked = selectedGroupIds.includes(group.id);
            return (
              <label
                key={group.id}
                className={`cursor-pointer rounded-[20px] border p-4 transition-colors ${checked ? 'border-[var(--accent)] bg-[var(--accent)]/6' : 'border-[var(--border)] bg-[var(--card)]'}`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleGroup(group.id)}
                    className="mt-1 h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
                  />
                  <div className="space-y-1">
                    <div className="text-sm font-black text-[var(--foreground)]">{group.label}</div>
                    <p className="text-[11px] font-semibold leading-relaxed text-[var(--toss-gray-3)]">
                      {group.description}
                    </p>
                    <p className="text-[11px] font-semibold text-[var(--accent)]">
                      {group.tables.length}개 테이블
                    </p>
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {lastExport ? (
          <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
            마지막 내보내기: {lastExport}
          </p>
        ) : null}

        {exportSummary ? (
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4 text-[12px] font-semibold text-[var(--toss-gray-4)]">
            <p className="font-black text-[var(--foreground)]">
              {exportSummary.tableCount}개 테이블 / {exportSummary.rowCount.toLocaleString()}건 내보냄
            </p>
            {exportSummary.skipped.length > 0 ? (
              <div className="mt-2 space-y-1">
                {exportSummary.skipped.map((entry) => (
                  <p key={entry.table}>
                    {entry.table}: {entry.reason}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-1">제외된 테이블 없이 백업했습니다.</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-[24px] border border-[var(--border)] bg-[var(--background)]/40 p-4">
        <div className="space-y-1">
          <h4 className="text-sm font-black text-[var(--foreground)]">백업 복원</h4>
          <p className="text-[11px] font-semibold leading-relaxed text-[var(--toss-gray-3)]">
            복원은 파일 기준 데이터로 upsert하며, 실행 전에 현재 DB 행 수와 차이를 비교하고 결과를 이력으로 남깁니다.
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".json"
          onChange={handleRestoreFile}
          className="hidden"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            복원할 JSON 선택
          </button>
          <button
            type="button"
            onClick={restoreData}
            disabled={!restoreFile || !restorePreview || loading || previewLoading}
            className="rounded-[16px] bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            복원 실행
          </button>
        </div>

        {restoreFile ? (
          <p className="text-[12px] font-semibold text-[var(--toss-gray-4)]">
            선택 파일: {restoreFile.name}
          </p>
        ) : null}

        {previewLoading ? (
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-[12px] font-semibold text-[var(--toss-gray-4)]">
            현재 DB 기준 행 수를 계산하는 중입니다...
          </div>
        ) : null}

        {restorePreview ? (
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-black text-[var(--foreground)]">
                  {restorePreview.tables.length}개 테이블 / {restorePreview.totalRows.toLocaleString()}건
                </p>
                <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  현재 기준 {restorePreview.currentTotalRows.toLocaleString()}건 비교
                </p>
              </div>
              {restorePreview.meta?.exported_at ? (
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  내보낸 시각: {new Date(restorePreview.meta.exported_at).toLocaleString()}
                </p>
              ) : null}
            </div>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 text-[12px] font-semibold text-[var(--toss-gray-4)]">
              {restorePreview.tables.map((entry) => (
                <div key={entry.table} className="rounded-[12px] bg-[var(--background)]/60 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-bold text-[var(--foreground)]">{entry.table}</span>
                    <span>{entry.rowCount.toLocaleString()}건 가져옴</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--toss-gray-3)]">
                    <span>현재 {entry.currentRowCount === null ? '비교 불가' : `${entry.currentRowCount.toLocaleString()}건`}</span>
                    <span>차이 {formatDelta(entry.delta)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : restoreFile && !previewLoading ? (
          <div className="rounded-[18px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[12px] font-semibold text-red-600">
            파일을 읽지 못했습니다. 유효한 JSON 백업 파일인지 확인해 주세요.
          </div>
        ) : null}

        {restoreLogs.length > 0 ? (
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4">
            <p className="text-sm font-black text-[var(--foreground)]">복원 로그</p>
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto pr-1 text-[12px] font-semibold text-[var(--toss-gray-4)]">
              {restoreLogs.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-[24px] border border-[var(--border)] bg-[var(--background)]/40 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-black text-[var(--foreground)]">최근 복원 이력</h4>
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
              최근 실행된 복원 작업 상태와 결과 요약입니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRestoreRuns()}
            disabled={historyLoading}
            className="rounded-[14px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
          >
            새로고침
          </button>
        </div>

        {restoreRuns.length > 0 ? (
          <div className="space-y-2">
            {restoreRuns.map((run) => {
              const statusMeta = getRunStatusMeta(run.status);
              const failedTables = Array.isArray(run.result_summary?.failed_tables)
                ? (run.result_summary?.failed_tables as Array<Record<string, unknown>>)
                : [];
              const rollbackFileName = String(run.result_summary?.rollback_file_name || '').trim();
              const rollbackRows = Number(run.result_summary?.rollback_total_rows || 0);
              return (
                <article key={run.id} className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-[var(--foreground)]">{run.file_name}</p>
                      <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                        {new Date(run.started_at).toLocaleString('ko-KR')}
                        {run.requested_by_name ? ` · ${run.requested_by_name}` : ''}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${statusMeta.className}`}>
                      {statusMeta.label}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    <span>{Number(run.total_tables || 0).toLocaleString('ko-KR')}개 테이블</span>
                    <span>{Number(run.total_rows || 0).toLocaleString('ko-KR')}건</span>
                    <span>
                      실패 {failedTables.length.toLocaleString('ko-KR')}개
                    </span>
                    <span>
                      종료 {run.finished_at ? new Date(run.finished_at).toLocaleString('ko-KR') : '진행 중'}
                    </span>
                  </div>
                  {rollbackFileName ? (
                    <p className="mt-2 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                      롤백 스냅샷: {rollbackFileName} · {rollbackRows.toLocaleString('ko-KR')}건
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[18px] border border-dashed border-[var(--border)] px-4 py-8 text-center text-[12px] font-semibold text-[var(--toss-gray-3)]">
            아직 기록된 복원 이력이 없습니다.
          </div>
        )}
      </section>
    </div>
  );
}
