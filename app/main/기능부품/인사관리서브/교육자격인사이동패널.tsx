'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function CertTransferPanel({ staffId, staffName }: { staffId: string; staffName: string }) {
  const [certs, setCerts] = useState<any[]>([]);
  const [transfers, setTransfers] = useState<any[]>([]);

  useEffect(() => {
    if (!staffId) return;
    (async () => {
      const { data: c } = await supabase.from('staff_certifications').select('*').eq('staff_id', staffId).order('issue_date', { ascending: false });
      const { data: t } = await supabase.from('staff_transfer_history').select('*').eq('staff_id', staffId).order('effective_date', { ascending: false });
      setCerts(c || []);
      setTransfers(t || []);
    })();
  }, [staffId]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="border border-[var(--toss-border)] p-6 bg-white rounded-lg">
        <h3 className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-4">교육·자격 현황</h3>
        {certs.length === 0 ? <p className="text-xs text-[var(--toss-gray-3)]">등록된 자격이 없습니다.</p> : (
          <div className="space-y-2">
            {certs.map((x) => (
              <div key={x.id} className="p-3 bg-[var(--toss-gray-1)] rounded-lg">
                <p className="text-sm font-bold">{x.name}</p>
                <p className="text-[10px] text-[var(--toss-gray-3)]">{x.issuer} · {x.issue_date} {x.expiry_date ? `~ ${x.expiry_date}` : ''}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="border border-[var(--toss-border)] p-6 bg-white rounded-lg">
        <h3 className="text-[11px] font-semibold text-[var(--toss-gray-4)] uppercase tracking-widest mb-4">인사이동 이력</h3>
        {transfers.length === 0 ? <p className="text-xs text-[var(--toss-gray-3)]">이동 이력이 없습니다.</p> : (
          <div className="space-y-2">
            {transfers.map((x) => (
              <div key={x.id} className="p-3 bg-[var(--toss-gray-1)] rounded-lg">
                <p className="text-sm font-bold">{x.transfer_type}</p>
                <p className="text-[10px] text-[var(--toss-gray-3)]">{x.before_value} → {x.after_value} ({x.effective_date})</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
