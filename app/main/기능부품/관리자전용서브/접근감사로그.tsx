'use client';
import { useState, useEffect } from 'react';
import { LoadingPanel, StatePanel } from '@/app/components/StatePanel';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';
import { supabase } from '@/lib/supabase';
import { useIsMobile } from '@/app/components/useIsMobile';
import { DesktopOnlyNotice } from '@/app/components/DesktopOnlyNotice';

interface Props {
  user: unknown;
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

function isSuspicious(log: AccessLog) {
  const h = new Date(log.created_at).getHours();
  return h >= 0 && h < 6;
}

const AUDIT_COLUMNS: Column<AccessLog>[] = [
    {
      key: 'created_at',
      label: '시각',
      primary: true,
      render: (log) => {
        const suspicious = isSuspicious(log);
        return (
          <span className={`font-bold ${suspicious ? 'text-danger' : ''}`}>
            {new Date(log.created_at).toLocaleString('ko-KR', {
              month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
            })}
            {suspicious && (
              <span className="ml-1 text-[9px] bg-danger text-white px-1 rounded-[var(--radius-md)]">새벽</span>
            )}
          </span>
        );
      },
    },
    {
      key: 'user_name',
      label: '직원명',
      render: (log) => <span className="font-bold">{log.user_name || '-'}</span>,
    },
    {
      key: 'company',
      label: '소속',
      render: (log) => <span className="text-[var(--toss-gray-4)]">{log.company || '-'}</span>,
      showOnMobile: false,
    },
    {
      key: 'menu',
      label: '메뉴',
      render: (log) => <>{log.menu || '-'}</>,
    },
    {
      key: 'action',
      label: '액션',
      render: (log) => <>{log.action || '-'}</>,
    },
    {
      key: 'ip_address',
      label: 'IP',
      render: (log) => <span className="text-[var(--toss-gray-3)]">{log.ip_address || '-'}</span>,
      showOnMobile: false,
    },
];

export default function AccessAuditLog(props: Props) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DesktopOnlyNotice feature="접근 감사 로그" />;
  }
  return <AccessAuditLogDesktop {...props} />;
}

function AccessAuditLogDesktop({ user: _user }: Props) {
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
        <StatePanel
          title="access_logs 테이블이 없습니다"
          description="아래 SQL을 Supabase SQL Editor에서 실행하여 테이블을 생성하세요."
          tone="warning"
          eyebrow="스키마 확인"
        >
          <pre className="mt-3 p-3 bg-[var(--muted)] text-xs font-mono text-[var(--foreground)] rounded-[var(--radius-md)] overflow-x-auto whitespace-pre-wrap">{`CREATE TABLE access_logs (
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
        </StatePanel>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-4 space-y-4 max-w-5xl mx-auto" data-testid="admin-audit-access">
      <div className="flex items-center justify-end flex-wrap gap-3">
        <button onClick={handleCsvDownload} className="px-4 py-2 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)] hover:opacity-90">CSV 내보내기</button>
      </div>

      {/* 필터 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
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
        <LoadingPanel title="접근 로그를 불러오는 중입니다" />
      ) : (
        <ResponsiveTable<AccessLog>
          columns={AUDIT_COLUMNS}
          rows={filtered}
          keyField="id"
          emptyMessage="로그 데이터가 없습니다. 기간이나 필터 조건을 변경해 보세요."
          className="rounded-[var(--radius-md)] border border-[var(--border)] overflow-hidden"
        />
      )}
    </div>
  );
}
