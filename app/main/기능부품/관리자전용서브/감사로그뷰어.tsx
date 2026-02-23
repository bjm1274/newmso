'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(100);
      setLogs(data || []);
      setLoading(false);
    };
    fetchLogs();
  }, []);

  return (
    <div className="bg-white border border-[var(--toss-border)] rounded-[12px] overflow-hidden shadow-xl">
      <div className="p-6 border-b border-[var(--toss-border)]">
        <h3 className="text-xl font-semibold text-[var(--foreground)]">감사 로그</h3>
        <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1">급여·결재·인사 등 주요 변경 이력</p>
      </div>
      <div className="max-h-[500px] overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-[var(--toss-gray-3)]">로딩 중...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-[var(--toss-gray-3)]">기록이 없습니다.</div>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="bg-[var(--toss-gray-1)] text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">
              <tr>
                <th className="p-4">시간</th>
                <th className="p-4">작업</th>
                <th className="p-4">대상</th>
                <th className="p-4">사용자</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {logs.map((l: any) => (
                <tr key={l.id} className="hover:bg-[var(--toss-gray-1)]">
                  <td className="p-4 font-mono text-[11px]">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="p-4 font-bold">{l.action}</td>
                  <td className="p-4 text-[var(--toss-gray-3)]">{l.target_type} {l.target_id ? `#${String(l.target_id).slice(0, 8)}` : ''}</td>
                  <td className="p-4">{l.user_name || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
