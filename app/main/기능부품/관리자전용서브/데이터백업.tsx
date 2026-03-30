'use client';

import { toast } from '@/lib/toast';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BACKUP_GROUPS, BACKUP_RESTORE_ORDER, resolveBackupTables } from '@/lib/backup-config';
import { supabase } from '@/lib/supabase';
import { useActionDialog } from '@/app/components/useActionDialog';

const PAGE_SIZE = 1000;
const RESTORE_BATCH_SIZE = 200;

type BackupMeta = {
  version?: number;
  exported_at?: string;
  selected_groups?: string[];
  selected_tables?: string[];
  skipped_tables?: Array<{ table: string; reason: string }>;
};

type RestorePreview = {
  meta: BackupMeta | null;
  tables: Array<{ table: string; rowCount: number }>;
  totalRows: number;
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

export default function DataBackup() {
  const [loading, setLoading] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [restorePreview, setRestorePreview] = useState<RestorePreview | null>(null);
  const [restoreLogs, setRestoreLogs] = useState<string[]>([]);
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

  useEffect(() => {
    if (!restoreFile) {
      setRestorePreview(null);
      return;
    }

    let cancelled = false;
    const parseRestorePreview = async () => {
      try {
        const text = await restoreFile.text();
        const parsed = normalizeBackupPayload(JSON.parse(text));
        const tables = Object.entries(parsed.tables)
          .filter(([, rows]) => Array.isArray(rows))
          .map(([table, rows]) => ({
            table,
            rowCount: Array.isArray(rows) ? rows.length : 0,
          }))
          .sort((a, b) => b.rowCount - a.rowCount || a.table.localeCompare(b.table));

        if (!cancelled) {
          setRestorePreview({
            meta: parsed.meta,
            tables,
            totalRows: tables.reduce((sum, entry) => sum + entry.rowCount, 0),
          });
        }
      } catch {
        if (!cancelled) {
          setRestorePreview(null);
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

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mso-backup-${exportedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`;
      anchor.click();
      URL.revokeObjectURL(url);

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

  const restoreData = async () => {
    if (!restoreFile || !restorePreview) {
      toast('복원할 JSON 파일을 먼저 선택해 주세요.', 'warning');
      return;
    }

    const answer = await openPrompt({
      title: '백업 복원',
      description: `${restorePreview.tables.length}개 테이블 / ${restorePreview.totalRows.toLocaleString()}건 데이터를 복원합니다.\n기존 데이터와 겹치는 항목은 갱신될 수 있습니다. 계속하려면 아래에 "복원"을 입력해 주세요.`,
      confirmText: '복원 실행',
      cancelText: '취소',
      tone: 'danger',
      placeholder: '복원',
      required: true,
      helperText: '이 작업은 백업 파일 기준으로 upsert 됩니다. 먼저 최신 백업을 하나 더 받아두는 것을 권장합니다.',
    });

    if (answer?.trim() !== '복원') {
      return;
    }

    setLoading(true);
    setRestoreLogs([]);

    try {
      const text = await restoreFile.text();
      const parsed = normalizeBackupPayload(JSON.parse(text));
      const tableEntries = Object.entries(parsed.tables).filter(([, rows]) => Array.isArray(rows) && rows.length > 0);
      const restoreOrder = [
        ...BACKUP_RESTORE_ORDER.filter((table) => Array.isArray(parsed.tables[table]) && parsed.tables[table].length > 0),
        ...tableEntries.map(([table]) => table).filter((table) => !BACKUP_RESTORE_ORDER.includes(table)),
      ];

      const nextLogs: string[] = [];
      for (const table of restoreOrder) {
        const rows = parsed.tables[table];
        if (!Array.isArray(rows) || rows.length === 0) continue;

        nextLogs.push(`${table}: ${rows.length}건 복원 시작`);
        setRestoreLogs([...nextLogs]);

        let failed = false;
        for (const batch of chunkRows(rows, RESTORE_BATCH_SIZE)) {
          const { error } = await supabase
            .from(table)
            .upsert(batch as any[]);

          if (error) {
            failed = true;
            nextLogs.push(`${table}: 실패 - ${String(error.message || error.details || 'unknown error')}`);
            setRestoreLogs([...nextLogs]);
            break;
          }
        }

        if (!failed) {
          nextLogs.push(`${table}: 완료`);
          setRestoreLogs([...nextLogs]);
        }
      }

      toast('복원 작업을 완료했습니다. 로그를 확인해 주세요.', 'success');
      setRestoreFile(null);
      setRestorePreview(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (error) {
      console.error(error);
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
          운영 중인 핵심 테이블만 골라 JSON으로 내보내고, 복원 전에는 미리보기와 로그를 함께 확인할 수 있습니다.
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
              <p className="mt-1">누락된 테이블 없이 백업되었습니다.</p>
            )}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-[24px] border border-[var(--border)] bg-[var(--background)]/40 p-4">
        <div className="space-y-1">
          <h4 className="text-sm font-black text-[var(--foreground)]">백업 복원</h4>
          <p className="text-[11px] font-semibold leading-relaxed text-[var(--toss-gray-3)]">
            복원은 파일 기준으로 upsert 되며, 파일에 들어 있지 않은 기존 행은 그대로 유지됩니다.
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
            disabled={!restoreFile || !restorePreview || loading}
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

        {restorePreview ? (
          <div className="rounded-[18px] border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-black text-[var(--foreground)]">
                {restorePreview.tables.length}개 테이블 / {restorePreview.totalRows.toLocaleString()}건
              </p>
              {restorePreview.meta?.exported_at ? (
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
                  내보낸 시각: {new Date(restorePreview.meta.exported_at).toLocaleString()}
                </p>
              ) : null}
            </div>
            <div className="mt-3 max-h-48 space-y-1 overflow-y-auto pr-1 text-[12px] font-semibold text-[var(--toss-gray-4)]">
              {restorePreview.tables.map((entry) => (
                <div key={entry.table} className="flex items-center justify-between rounded-[12px] bg-[var(--background)]/60 px-3 py-2">
                  <span>{entry.table}</span>
                  <span>{entry.rowCount.toLocaleString()}건</span>
                </div>
              ))}
            </div>
          </div>
        ) : restoreFile ? (
          <div className="rounded-[18px] border border-red-200 bg-red-50 px-4 py-3 text-[12px] font-semibold text-red-600">
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
    </div>
  );
}
