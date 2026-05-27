'use client';

/**
 * 백업·복원 탭
 *
 * JM:  단일 책임, 500줄 이내
 * JM2: 1회 fetch + 정적 fallback
 * JM3: try/catch 폴백 + 액션 실패 토스트 없이 콘솔
 * JM4: any 금지
 * JM5: 즉시 백업 / 복원은 권한 검증된 서버 라우트에 위임 (클라 측은 트리거만)
 * JM6: button 태그, aria-label, table scope
 */

import { useEffect, useState } from 'react';
import { Card, Chip, SmBtn } from '../admin-workcenter-common';
import { DR_RULES, FALLBACK_BACKUPS, POLICY_RULES } from './fallback';
import type { BackupItem } from './types';
import type { ChipTone } from '../admin-types';

interface ApiBackupRow {
  id?: string;
  file?: string;
  createdAt?: string;
  size?: string;
  kind?: string;
  duration?: string;
}

function parseRow(r: ApiBackupRow): BackupItem | null {
  if (!r || typeof r !== 'object') return null;
  const file = typeof r.file === 'string' ? r.file : '';
  const createdAt = typeof r.createdAt === 'string' ? r.createdAt : '';
  const size = typeof r.size === 'string' ? r.size : '';
  if (!file || !createdAt) return null;
  const kind: '자동' | '수동' = r.kind === '수동' ? '수동' : '자동';
  const tone: ChipTone = kind === '수동' ? 'accent' : 'success';
  return {
    id: typeof r.id === 'string' ? r.id : undefined,
    file,
    createdAt,
    size,
    kind,
    duration: typeof r.duration === 'string' ? r.duration : undefined,
    tone,
  };
}

export default function AuditBackupTab() {
  const [rows, setRows] = useState<BackupItem[]>(FALLBACK_BACKUPS);
  const [loaded, setLoaded] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/audit/backups', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json: unknown = await res.json();
        const list = Array.isArray(json)
          ? json
          : (json as { rows?: unknown } | null)?.rows;
        if (!Array.isArray(list) || list.length === 0) throw new Error('empty');
        const parsed = list
          .map((r) => parseRow(r as ApiBackupRow))
          .filter((r): r is BackupItem => r !== null);
        if (parsed.length === 0) throw new Error('invalid');
        if (alive) setRows(parsed);
      } catch {
        // 폴백 유지
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function runBackupNow() {
    if (running) return;
    setRunning(true);
    try {
      const res = await fetch('/api/admin/audit/backups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: '수동' }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // 성공 시 목록 새로고침
      const refreshed = await fetch('/api/admin/audit/backups', { cache: 'no-store' });
      if (refreshed.ok) {
        const json: unknown = await refreshed.json();
        const list = Array.isArray(json)
          ? json
          : (json as { rows?: unknown } | null)?.rows;
        if (Array.isArray(list)) {
          const parsed = list
            .map((r) => parseRow(r as ApiBackupRow))
            .filter((r): r is BackupItem => r !== null);
          if (parsed.length > 0) setRows(parsed);
        }
      }
    } catch (err) {
      console.warn('[backup] 즉시 백업 실패', err);
    } finally {
      setRunning(false);
    }
  }

  async function restore(item: BackupItem) {
    try {
      const res = await fetch('/api/admin/audit/backups/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: item.file }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn('[backup] 복구 요청 실패', err);
    }
  }

  const autoRows = rows.filter((r) => r.kind === '자동').slice(0, 5);
  const manualRows = rows.filter((r) => r.kind === '수동').slice(0, 2);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
      {/* 좌: 자동/수동 백업 목록 */}
      <Card
        title={`자동 백업 (최근 ${autoRows.length})`}
        action={
          <SmBtn primary onClick={runBackupNow} ariaLabel="즉시 백업 실행">
            {running ? '실행 중…' : '즉시 백업'}
          </SmBtn>
        }
        className="p-0 overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]" aria-label="자동 백업 목록">
            <thead>
              <tr className="text-left text-[10.5px] font-bold text-[var(--toss-gray-4)] border-b border-[var(--border)]">
                <th scope="col" className="px-3 py-2">파일</th>
                <th scope="col" className="px-2 py-2">생성일</th>
                <th scope="col" className="px-2 py-2">크기</th>
                <th scope="col" className="px-2 py-2 text-right">복구</th>
              </tr>
            </thead>
            <tbody>
              {autoRows.map((b, i) => (
                <tr key={b.id ?? b.file ?? i} className="border-b border-[var(--border)]/60">
                  <td className="px-3 py-1.5 text-[10.5px] truncate max-w-[200px]">
                    <Chip tone={b.tone ?? 'success'}>{b.kind}</Chip>
                    <span className="ml-1.5 align-middle">{b.file}</span>
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-[10.5px] text-[var(--toss-gray-4)]">
                    {b.createdAt}
                  </td>
                  <td className="px-2 py-1.5 tabular-nums text-[10.5px]">{b.size}</td>
                  <td className="px-2 py-1.5 text-right">
                    <SmBtn onClick={() => void restore(b)} ariaLabel={`${b.file} 복구`}>
                      복구
                    </SmBtn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {manualRows.length > 0 && (
          <div className="border-t border-[var(--border)] px-3 py-2">
            <div className="text-[10.5px] font-bold text-[var(--toss-gray-4)] mb-1.5">
              수동 백업
            </div>
            <ul className="space-y-1" aria-label="수동 백업 목록">
              {manualRows.map((b, i) => (
                <li
                  key={b.id ?? b.file ?? i}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-[var(--radius-md)] bg-[var(--muted)] border border-[var(--border)]"
                >
                  <Chip tone={b.tone ?? 'accent'}>{b.kind}</Chip>
                  <span className="text-[11px] flex-1 truncate">{b.file}</span>
                  <span className="text-[10.5px] tabular-nums text-[var(--toss-gray-4)]">
                    {b.createdAt} · {b.size}
                  </span>
                  <SmBtn onClick={() => void restore(b)} ariaLabel={`${b.file} 복구`}>
                    복구
                  </SmBtn>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!loaded && (
          <div className="px-3 py-1.5 text-[10.5px] text-[var(--toss-gray-4)] border-t border-[var(--border)]">
            로딩…
          </div>
        )}
      </Card>

      {/* 우: 정책 + DR */}
      <Card title="백업 정책 · DR">
        <ul className="space-y-1.5" aria-label="백업 정책">
          {POLICY_RULES.map((r) => (
            <li
              key={r.label}
              className="flex items-center justify-between gap-2 text-[12px] py-1 border-b border-dashed border-[var(--border)]/60 last:border-0"
            >
              <span className="text-[var(--toss-gray-4)]">{r.label}</span>
              <span className="font-bold text-[var(--foreground)]">{r.value}</span>
            </li>
          ))}
        </ul>

        <h4 className="mt-4 mb-1.5 text-[11px] font-bold text-[var(--foreground)]">
          DR (재해 복구)
        </h4>
        <ul className="space-y-1.5" aria-label="DR 정책">
          {DR_RULES.map((r) => (
            <li
              key={r.label}
              className="flex items-center justify-between gap-2 text-[12px] py-1 border-b border-dashed border-[var(--border)]/60 last:border-0"
            >
              <span className="text-[var(--toss-gray-4)]">{r.label}</span>
              <span className="font-bold text-[var(--foreground)]">{r.value}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex justify-end">
          <SmBtn primary onClick={runBackupNow} ariaLabel="즉시 백업 실행">
            {running ? '실행 중…' : '즉시 백업 실행'}
          </SmBtn>
        </div>
      </Card>
    </div>
  );
}
