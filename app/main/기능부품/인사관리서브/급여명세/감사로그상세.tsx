'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function AuditLogDetail({ targetType, limit = 50 }: { targetType?: string; limit?: number }) {
  const [list, setList] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      let q = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
      if (targetType) q = q.eq('target_type', targetType);
      const { data } = await q;
      setList(data || []);
    })();
  }, [targetType, limit]);

  return (
    <div className="border border-[var(--toss-border)] p-4 bg-[var(--toss-card)] rounded-lg shadow-sm">
      <div className="pb-2 border-b border-[var(--toss-border)] mb-3">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">감사 로그</h3>
      </div>
      <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
        {list.map((r) => (
          <div key={r.id} className="flex flex-wrap gap-2 py-2 border-b border-[var(--toss-border)] text-[11px]">
            <span className="font-semibold text-[var(--toss-blue)]">{r.action}</span>
            <span className="text-[var(--toss-gray-3)]">{r.user_name || '-'}</span>
            <span className="text-[var(--toss-gray-4)]">{r.target_type} {r.target_id}</span>
            <span className="text-[var(--toss-gray-3)]">{new Date(r.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
