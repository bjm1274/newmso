'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const PAGE_SIZE = 100;

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const fetchLogs = useCallback(async (offset = 0) => {
    setLoading(true);
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    const rows = data || [];
    if (offset === 0) {
      setLogs(rows);
    } else {
      setLogs((prev) => [...prev, ...rows]);
    }
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchLogs(0);
  }, [fetchLogs]);

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden shadow-sm" data-testid="admin-audit-general">
      <div className="p-4 border-b border-[var(--border)] flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-[var(--foreground)]">감사 로그</h3>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1">급여·결재·인사 등 주요 변경 이력 ({logs.length}건)</p>
        </div>
        <button
          type="button"
          onClick={() => fetchLogs(0)}
          disabled={loading}
          className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
        >
          새로고침
        </button>
      </div>
      <div className="max-h-[500px] overflow-y-auto">
        {loading && logs.length === 0 ? (
          <div className="p-5 text-center text-[var(--toss-gray-3)]">로딩 중...</div>
        ) : logs.length === 0 ? (
          <div className="p-5 text-center text-[var(--toss-gray-3)]">기록이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--muted)] text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase sticky top-0">
              <tr>
                <th className="p-2">시간</th>
                <th className="p-2">작업</th>
                <th className="p-2">대상</th>
                <th className="p-2">사용자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {logs.map((l: any) => (
                <tr key={l.id} className="hover:bg-[var(--muted)]">
                  <td className="p-2 font-mono text-[11px] whitespace-nowrap">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="p-2 font-bold whitespace-nowrap">{l.action}</td>
                  <td className="p-2 text-[var(--toss-gray-3)] max-w-[200px] truncate">{l.target_type} {l.target_id ? `#${String(l.target_id).slice(0, 8)}` : ''}</td>
                  <td className="p-2 whitespace-nowrap">{l.user_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {hasMore && logs.length > 0 && (
          <div className="p-3 text-center border-t border-[var(--border)]">
            <button
              type="button"
              onClick={() => fetchLogs(logs.length)}
              disabled={loading}
              className="rounded-[var(--radius-md)] bg-[var(--muted)] px-4 py-2 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--tab-bg)] disabled:opacity-50"
            >
              {loading ? '로딩 중...' : '더 보기'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
