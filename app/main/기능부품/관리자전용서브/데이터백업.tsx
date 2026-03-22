'use client';
import { toast } from '@/lib/toast';
import { useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function DataBackup() {
  const [loading, setLoading] = useState(false);
  const [lastExport, setLastExport] = useState<string | null>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setRestoreFile(f);
  };

  const restoreData = async () => {
    if (!restoreFile || !confirm('백업 데이터로 복원합니다. 기존 데이터가 덮어쓰일 수 있습니다. 계속할까요?')) return;
    setLoading(true);
    try {
      const text = await restoreFile.text();
      const data = JSON.parse(text);
      for (const [table, rows] of Object.entries(data as Record<string, any[]>)) {
        if (Array.isArray(rows) && rows.length > 0) {
          await supabase.from(table).upsert(rows, { onConflict: 'id' });
        }
      }
      toast('복원 완료', 'success');
      setRestoreFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      console.error(err);
      toast('복원 실패', 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportData = async () => {
    setLoading(true);
    try {
      const tables = [
        'staff_members', 'payroll_records', 'leave_requests', 'attendances',
        'approvals', 'audit_logs', 'inventory', 'inventory_logs',
        'board_posts', 'posts', 'employment_contracts', 'work_shifts',
        'shift_assignments', 'annual_leave_promotions'
      ];
      const data: Record<string, any[]> = {};
      for (const t of tables) {
        const { data: rows } = await supabase.from(t).select('*');
        data[t] = rows || [];
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mso-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastExport(new Date().toLocaleString());
    } catch (e) {
      console.error(e);
      toast('백업 실패', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] p-4 shadow-sm max-w-lg">
      <h3 className="text-base font-semibold text-[var(--foreground)] mb-2">데이터 백업</h3>
      <p className="text-xs text-[var(--toss-gray-3)] font-bold mb-3">직원, 급여, 휴가, 근태, 결재, 감사로그를 JSON 파일로 내보냅니다.</p>
      <button onClick={exportData} disabled={loading} className="w-full py-2 bg-[var(--accent)] text-white font-semibold rounded-[var(--radius-md)] text-sm hover:bg-blue-700 disabled:opacity-50">
        {loading ? '내보내는 중...' : '📥 백업 파일 내보내기'}
      </button>
      {lastExport && <p className="text-[11px] text-[var(--toss-gray-3)] mt-2">마지막 내보내기: {lastExport}</p>}

      <div className="mt-4 pt-4 border-t border-[var(--border)]">
        <h4 className="text-sm font-semibold text-[var(--foreground)] mb-2">데이터 복원</h4>
        <input ref={fileRef} type="file" accept=".json" onChange={handleRestoreFile} className="hidden" />
        <button onClick={() => fileRef.current?.click()} className="w-full py-2 bg-[var(--muted)] text-[var(--foreground)] font-bold rounded-[var(--radius-md)] text-sm mb-2">복원할 JSON 파일 선택</button>
        {restoreFile && <p className="text-[11px] text-[var(--toss-gray-3)] mb-2">{restoreFile.name}</p>}
        <button onClick={restoreData} disabled={!restoreFile || loading} className="w-full py-2 bg-orange-600 text-white font-semibold rounded-[var(--radius-md)] text-sm disabled:opacity-50">복원 실행</button>
      </div>
    </div>
  );
}
