'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Props {
  user: any;
}

interface AccessLog {
  id: string;
  user_id: string;
  user_name: string;
  company: string;
  menu: string;
  action: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

export default function AccessAuditLog({ user }: Props) {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [tableExists, setTableExists] = useState(true);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));
  const [filterUser, setFilterUser] = useState('');
  const [filterMenu, setFilterMenu] = useState('');
  const [filterAction, setFilterAction] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const query = supabase
          .from('access_logs')
          .select('*')
          .gte('created_at', dateFrom + 'T00:00:00')
          .lte('created_at', dateTo + 'T23:59:59')
          .order('created_at', { ascending: false })
          .limit(500);
        const { data, error } = await query;
        if (error) {
          if (error.code === '42P01') {
            setTableExists(false);
          }
          setLogs([]);
        } else {
          setTableExists(true);
          setLogs(data || []);
        }
      } catch {
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [dateFrom, dateTo]);

  const isSuspicious = (log: AccessLog) => {
    const h = new Date(log.created_at).getHours();
    if (h >= 0 && h < 6) return true;
    return false;
  };

  const filtered = logs.filter(l => {
    if (filterUser && !l.user_name?.includes(filterUser)) return false;
    if (filterMenu && !l.menu?.includes(filterMenu)) return false;
    if (filterAction && !l.action?.includes(filterAction)) return false;
    return true;
  });

  // 메뉴별 접근 통계
  const menuStats: Record<string, number> = {};
  filtered.forEach(l => {
    const menu = l.menu || '기타';
    menuStats[menu] = (menuStats[menu] || 0) + 1;
  });
  const maxMenuCount = Math.max(...Object.values(menuStats), 1);

  const handleCsvDownload = () => {
    const header = ['시각', '직원명', '소속', '메뉴', '액션', 'IP'];
    const rows = filtered.map(l => [
      new Date(l.created_at).toLocaleString('ko-KR'),
      l.user_name, l.company, l.menu, l.action, l.ip_address,
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `접근감사로그_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!tableExists) {
    return (
      <div className="p-4 space-y-4 max-w-3xl mx-auto" data-testid="admin-audit-access">
        <h2 className="text-lg font-bold text-[var(--foreground)]">접근 권한 감사 로그</h2>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-[var(--radius-md)]">
          <p className="text-sm font-bold text-amber-700">access_logs 테이블이 없습니다.</p>
          <p className="text-xs text-amber-600 mt-2">아래 SQL을 Supabase SQL Editor에서 실행하여 테이블을 생성하세요:</p>
          <pre className="mt-3 p-3 bg-amber-100 text-xs font-mono text-amber-800 rounded overflow-x-auto whitespace-pre-wrap">{`CREATE TABLE access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text,
  user_name text,
  company text,
  menu text,
  action text,
  ip_address text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);`}</pre>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-4 space-y-4 max-w-5xl mx-auto" data-testid="admin-audit-access">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">접근 권한 감사 로그</h2>
        </div>
        <button onClick={handleCsvDownload} className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)] hover:opacity-90">CSV 내보내기</button>
      </div>

      {/* 필터 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="p-2 text-xs border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)]" />
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="p-2 text-xs border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)]" />
        <input placeholder="직원명" value={filterUser} onChange={e => setFilterUser(e.target.value)} className="p-2 text-xs border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)]" />
        <input placeholder="메뉴명" value={filterMenu} onChange={e => setFilterMenu(e.target.value)} className="p-2 text-xs border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)]" />
        <input placeholder="액션" value={filterAction} onChange={e => setFilterAction(e.target.value)} className="p-2 text-xs border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)]" />
      </div>

      {/* 메뉴별 통계 */}
      {Object.keys(menuStats).length > 0 && (
        <div className="bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] p-4">
          <h3 className="text-xs font-bold text-[var(--foreground)] mb-3">메뉴별 접근 통계</h3>
          {Object.entries(menuStats).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([menu, count]) => (
            <div key={menu} className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] font-bold text-[var(--toss-gray-4)] w-20 shrink-0 truncate">{menu}</span>
              <div className="flex-1 bg-[var(--muted)] rounded-full h-3 overflow-hidden">
                <div className="h-full bg-[var(--accent)] rounded-full" style={{ width: `${(count / maxMenuCount) * 100}%` }} />
              </div>
              <span className="text-[10px] font-bold text-[var(--toss-gray-4)] w-8 text-right">{count}</span>
            </div>
          ))}
        </div>
      )}

      {/* 로그 테이블 */}
      {loading ? (
        <div className="text-center py-5 text-sm text-[var(--toss-gray-3)]">로딩 중...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 border border-dashed border-[var(--border)] rounded-[var(--radius-md)]">
          <p className="text-sm text-[var(--toss-gray-3)]">로그 데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[var(--border)]">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-[var(--muted)]">
                <th className="p-2 text-left font-bold text-[var(--toss-gray-4)]">시각</th>
                <th className="p-2 text-left font-bold text-[var(--toss-gray-4)]">직원명</th>
                <th className="p-2 text-left font-bold text-[var(--toss-gray-4)]">소속</th>
                <th className="p-2 text-left font-bold text-[var(--toss-gray-4)]">메뉴</th>
                <th className="p-2 text-left font-bold text-[var(--toss-gray-4)]">액션</th>
                <th className="p-2 text-left font-bold text-[var(--toss-gray-4)]">IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const suspicious = isSuspicious(log);
                return (
                  <tr key={log.id} className={`border-t border-[var(--border)] ${suspicious ? 'bg-red-500/10' : 'hover:bg-[var(--muted)]/50'}`}>
                    <td className={`p-2 font-bold ${suspicious ? 'text-red-600' : ''}`}>
                      {new Date(log.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                      {suspicious && <span className="ml-1 text-[9px] bg-red-600 text-white px-1 rounded">새벽</span>}
                    </td>
                    <td className="p-2 font-bold">{log.user_name || '-'}</td>
                    <td className="p-2 text-[var(--toss-gray-4)]">{log.company || '-'}</td>
                    <td className="p-2">{log.menu || '-'}</td>
                    <td className="p-2">{log.action || '-'}</td>
                    <td className="p-2 text-[var(--toss-gray-3)]">{log.ip_address || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
