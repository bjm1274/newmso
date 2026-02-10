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
    <div className="border border-gray-200 p-6 bg-white rounded-[1.75rem] shadow-sm">
      <h3 className="text-[11px] font-black text-gray-600 uppercase tracking-widest mb-4">감사 로그</h3>
      <div className="max-h-64 overflow-y-auto space-y-2 custom-scrollbar">
        {list.map((r) => (
          <div key={r.id} className="flex flex-wrap gap-2 py-2 border-b border-gray-50 text-[11px]">
            <span className="font-black text-blue-600">{r.action}</span>
            <span className="text-gray-500">{r.user_name || '-'}</span>
            <span>{r.target_type} {r.target_id}</span>
            <span className="text-gray-400">{new Date(r.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
