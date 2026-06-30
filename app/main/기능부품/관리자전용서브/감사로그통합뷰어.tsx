'use client';

import { useState, useEffect, useCallback, useRef, type CSSProperties, type ReactElement } from 'react';
import { List } from 'react-window';
import { EmptyState, LoadingPanel, StatePanel } from '@/app/components/StatePanel';
import { db } from '@/lib/db-client';
import { useIsMobile } from '@/app/components/useIsMobile';
import { DesktopOnlyNotice } from '@/app/components/DesktopOnlyNotice';
import { escapeLikePattern } from '@/lib/like-escape';
import { getKoreanTodayString, formatKoreanDateKey } from '@/lib/seoul-time';
import { ResponsiveTable, type Column } from '@/app/components/ResponsiveTable';

// ==========================================
// 1. GENERAL AUDIT LOG VIEW (감사 로그 뷰어)
// ==========================================
const PAGE_SIZE = 100;
const ROW_HEIGHT = 36;
const LIST_HEIGHT = 500;

interface AuditRowProps {
  logs: any[];
}

function AuditRow({ index, style, logs }: {
  index: number;
  style: CSSProperties;
  ariaAttributes: { 'aria-posinset': number; 'aria-setsize': number; role: 'listitem' };
} & AuditRowProps): ReactElement | null {
  const l = logs[index];
  if (!l) return null;
  return (
    <div
      style={style}
      className="flex items-center text-xs border-b border-[var(--border)] hover:bg-[var(--muted)]"
    >
      <div className="w-[30%] px-2 font-mono text-[11px] whitespace-nowrap truncate">
        {new Date(l.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
      </div>
      <div className="w-[20%] px-2 font-bold whitespace-nowrap truncate">
        {l.action}
      </div>
      <div className="w-[30%] px-2 text-[var(--toss-gray-3)] truncate">
        {l.target_type} {l.target_id ? `#${String(l.target_id).slice(0, 8)}` : ''}
      </div>
      <div className="w-[20%] px-2 whitespace-nowrap truncate">
        {l.user_name || '-'}
      </div>
    </div>
  );
}

export function AuditLogViewer() {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <AuditLogViewerMobile />;
  }
  return <AuditLogViewerDesktop />;
}

function AuditLogViewerDesktop() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const requestIdRef = useRef(0);

  const fetchLogs = useCallback(async (offset = 0, keyword = searchKeyword) => {
    const myId = ++requestIdRef.current;
    setLoading(true);
    
    // Optimized select('*') query (L69) to fetch only required columns
    let query = db
      .from('audit_logs')
      .select('id, created_at, action, target_type, target_id, user_name')
      .order('created_at', { ascending: false });

    if (keyword.trim()) {
      const safe = escapeLikePattern(keyword.trim());
      query = query.or(
        `user_name.ilike.%${safe}%,action.ilike.%${safe}%,target_id.ilike.%${safe}%,details.ilike.%${safe}%`
      );
    }

    const { data } = await query.range(offset, offset + PAGE_SIZE - 1);
    
    if (myId !== requestIdRef.current) return;
    const rows = data || [];
    if (offset === 0) {
      setLogs(rows);
    } else {
      setLogs((prev) => [...prev, ...rows]);
    }
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  }, [searchKeyword]);

  useEffect(() => {
    fetchLogs(0, '');
    return () => {
      requestIdRef.current = -1;
    };
  }, []);

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] overflow-hidden shadow-sm" data-testid="admin-audit-general">
      <div className="p-4 border-b border-[var(--border)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-[var(--card)]">
        <div>
          <h3 className="text-base font-semibold text-[var(--foreground)]">감사 로그</h3>
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-1">급여·결재·인사 등 주요 변경 이력 ({logs.length}건)</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                fetchLogs(0, searchKeyword);
              }
            }}
            placeholder="직원명·사번·작업 검색"
            aria-label="감사로그 검색"
            className="px-3 py-1.5 text-xs rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--page-bg)] text-[var(--foreground)] placeholder-[var(--toss-gray-3)] outline-none min-w-[200px]"
          />
          <button
            type="button"
            onClick={() => fetchLogs(0, searchKeyword)}
            disabled={loading}
            className="rounded-[var(--radius-md)] bg-[var(--accent)] text-white px-3 py-1.5 text-[11px] font-bold shadow-sm hover:opacity-90 disabled:opacity-50"
          >
            검색
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchKeyword('');
              fetchLogs(0, '');
            }}
            disabled={loading}
            className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50"
          >
            새로고침
          </button>
        </div>
      </div>
      <div>
        {loading && logs.length === 0 ? (
          <div className="p-4">
            <LoadingPanel title="감사 로그를 불러오는 중입니다" />
          </div>
        ) : logs.length === 0 ? (
          <div className="p-4">
            <EmptyState
              title="기록이 없습니다"
              description="급여, 결재, 인사 등 주요 변경 이력이 발생하면 이곳에 표시됩니다."
              compact
            />
          </div>
        ) : (
          <>
            <div className="flex items-center bg-[var(--muted)] text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">
              <div className="w-[30%] px-2 py-2">시간</div>
              <div className="w-[20%] px-2 py-2">작업</div>
              <div className="w-[30%] px-2 py-2">대상</div>
              <div className="w-[20%] px-2 py-2">사용자</div>
            </div>
            <List
              rowComponent={AuditRow}
              rowCount={logs.length}
              rowHeight={ROW_HEIGHT}
              rowProps={{ logs }}
              style={{ height: LIST_HEIGHT }}
            />
          </>
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

// ==========================================
// 2. ACCESS AUDIT LOG VIEW (접근 감사 로그)
// ==========================================
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
            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
          {suspicious && (
            <span className="ml-1 text-[9px] bg-danger text-white px-1 rounded-[var(--radius-md)]">새벽</span>
          )}
        </span>
      );
    } },
  {
    key: 'user_name',
    label: '직원명',
    render: (log) => <span className="font-bold">{log.user_name || '-'}</span> },
  {
    key: 'company',
    label: '소속',
    render: (log) => <span className="text-[var(--toss-gray-4)]">{log.company || '-'}</span>,
    showOnMobile: false },
  {
    key: 'menu',
    label: '메뉴',
    render: (log) => <>{log.menu || '-'}</> },
  {
    key: 'action',
    label: '액션',
    render: (log) => <>{log.action || '-'}</> },
  {
    key: 'ip_address',
    label: 'IP',
    render: (log) => <span className="text-[var(--toss-gray-3)]">{log.ip_address || '-'}</span>,
    showOnMobile: false },
];

export function AccessAuditLog(props: Props) {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <AccessAuditLogMobile />;
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
    return formatKoreanDateKey(d);
  });
  const [dateTo, setDateTo] = useState(getKoreanTodayString());
  const [filterUser, setFilterUser] = useState('');
  const [filterMenu, setFilterMenu] = useState('');
  const [filterAction, setFilterAction] = useState('');

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        // Optimized select('*') query (L107) to retrieve only required fields
        const query = db
          .from('access_logs')
          .select('id, user_id, user_name, company, menu, action, ip_address, created_at')
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

  const menuStats: Record<string, number> = {};
  filtered.forEach(l => {
    if (l.menu) {
      menuStats[l.menu] = (menuStats[l.menu] || 0) + 1;
    }
  });

  const sortedStats = Object.entries(menuStats)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 max-w-7xl mx-auto pb-12" data-testid="admin-audit-access">
      <div className="xl:col-span-3 space-y-4">
        {/* 필터 설정 */}
        <div className="bg-[var(--card)] p-4 border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--toss-gray-4)]">기간</span>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="p-1.5 border border-[var(--border)] rounded-[var(--radius-md)] text-xs bg-[var(--page-bg)] text-[var(--foreground)]"
            />
            <span className="text-xs text-[var(--toss-gray-3)]">~</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="p-1.5 border border-[var(--border)] rounded-[var(--radius-md)] text-xs bg-[var(--page-bg)] text-[var(--foreground)]"
            />
          </div>

          <input
            type="text"
            placeholder="직원명 필터"
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            className="p-1.5 border border-[var(--border)] rounded-[var(--radius-md)] text-xs bg-[var(--page-bg)] text-[var(--foreground)] placeholder-[var(--toss-gray-3)] outline-none w-28"
          />
          <input
            type="text"
            placeholder="메뉴명 필터"
            value={filterMenu}
            onChange={e => setFilterMenu(e.target.value)}
            className="p-1.5 border border-[var(--border)] rounded-[var(--radius-md)] text-xs bg-[var(--page-bg)] text-[var(--foreground)] placeholder-[var(--toss-gray-3)] outline-none w-28"
          />
          <input
            type="text"
            placeholder="액션 필터"
            value={filterAction}
            onChange={e => setFilterAction(e.target.value)}
            className="p-1.5 border border-[var(--border)] rounded-[var(--radius-md)] text-xs bg-[var(--page-bg)] text-[var(--foreground)] placeholder-[var(--toss-gray-3)] outline-none w-28"
          />
        </div>

        {/* 테이블 내역 */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm overflow-hidden">
          {!tableExists ? (
            <div className="p-8 text-center">
              <StatePanel
                title="감사 테이블이 존재하지 않습니다"
                description="access_logs 테이블 및 정책 설정을 확인하세요."
                compact
              />
            </div>
          ) : loading && filtered.length === 0 ? (
            <div className="p-8">
              <LoadingPanel title="접근 감사 로그를 불러오는 중입니다" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8">
              <EmptyState title="접근 로그가 없습니다" description="지정된 기간 및 필터 조건에 부합하는 접근 이력이 없습니다." compact />
            </div>
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
      </div>

      {/* 우측 사이드 통계 패널 */}
      <div className="space-y-4">
        <div className="bg-[var(--card)] p-4 border border-[var(--border)] rounded-[var(--radius-lg)] shadow-sm">
          <h3 className="text-xs font-black text-[var(--foreground)] mb-3 uppercase tracking-wider">주요 메뉴 접근 분포</h3>
          {sortedStats.length === 0 ? (
            <p className="text-xs text-[var(--toss-gray-3)] text-center py-6">로그 데이터 없음</p>
          ) : (
            <div className="space-y-2">
              {sortedStats.map(([menu, count]) => (
                <div key={menu} className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-[var(--toss-gray-5)] truncate max-w-[120px]">{menu}</span>
                  <span className="text-[var(--toss-gray-3)] font-bold">{count}회</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-amber-500/10 p-4 border border-amber-500/20 rounded-[var(--radius-lg)]">
          <h4 className="text-xs font-black text-amber-800 dark:text-amber-300">💡 접근 모니터링 안내</h4>
          <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 mt-1.5 leading-relaxed">
            새벽 시간대(00:00 - 06:00)의 접근 기록은 비정상 업무 시간 접근으로 간주되어 목록에 <span className="text-danger font-bold">새벽</span> 태그로 강조 표시됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function AuditLogViewerMobile() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRecentLogs = async () => {
      setLoading(true);
      try {
        const { data } = await db
          .from('audit_logs')
          .select('id, created_at, action, target_type, target_id, user_name')
          .order('created_at', { ascending: false })
          .limit(20);
        setLogs(data || []);
      } catch {
        // 오류 무시
      } finally {
        setLoading(false);
      }
    };
    fetchRecentLogs();
  }, []);

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm space-y-3" data-testid="audit-log-viewer-mobile">
      <div className="border-b border-[var(--border)] pb-2">
        <h3 className="text-sm font-black text-[var(--foreground)]">최근 변경 감사 로그 (최대 20건)</h3>
        <p className="text-[10px] text-[var(--toss-gray-3)] font-bold mt-0.5">상세 조회/검색은 PC 버전을 이용해 주세요.</p>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--toss-gray-3)] text-center py-6">로그를 불러오는 중...</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-[var(--toss-gray-3)] text-center py-6">변경 감사 로그가 없습니다.</p>
      ) : (
        <div className="space-y-2 overflow-y-auto max-h-[300px]">
          {logs.map((l) => (
            <div key={l.id} className="p-2.5 rounded-[var(--radius-md)] bg-[var(--muted)]/40 text-[11px] space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-[var(--foreground)] bg-[var(--toss-blue-light)] text-[var(--accent)] px-1.5 py-0.5 rounded-[var(--radius-md)] text-[9px]">{l.action}</span>
                <span className="text-[10px] text-[var(--toss-gray-3)] font-mono">{new Date(l.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex justify-between items-center text-[10.5px]">
                <span className="text-[var(--foreground)] font-semibold">{l.target_type} {l.target_id ? `#${String(l.target_id).slice(0, 6)}` : ''}</span>
                <span className="text-[var(--toss-gray-4)] font-bold">{l.user_name || '-'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccessAuditLogMobile() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchRecentAccess = async () => {
      setLoading(true);
      try {
        const { data } = await db
          .from('access_logs')
          .select('id, user_name, company, menu, action, created_at')
          .order('created_at', { ascending: false })
          .limit(20);
        setLogs(data || []);
      } catch {
        // 오류 무시
      } finally {
        setLoading(false);
      }
    };
    fetchRecentAccess();
  }, []);

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 shadow-sm space-y-3" data-testid="access-audit-log-mobile">
      <div className="border-b border-[var(--border)] pb-2">
        <h3 className="text-sm font-black text-[var(--foreground)]">최근 메뉴 접근 로그 (최대 20건)</h3>
        <p className="text-[10px] text-[var(--toss-gray-3)] font-bold mt-0.5">상세 조회/검색은 PC 버전을 이용해 주세요.</p>
      </div>

      {loading ? (
        <p className="text-xs text-[var(--toss-gray-3)] text-center py-6">로그를 불러오는 중...</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-[var(--toss-gray-3)] text-center py-6">접근 감사 로그가 없습니다.</p>
      ) : (
        <div className="space-y-2 overflow-y-auto max-h-[300px]">
          {logs.map((l) => {
            const h = new Date(l.created_at).getHours();
            const suspicious = h >= 0 && h < 6;
            return (
              <div key={l.id} className="p-2.5 rounded-[var(--radius-md)] bg-[var(--muted)]/40 text-[11px] space-y-1.5 border border-[var(--border)]/30">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <span className="font-black text-[var(--foreground)]">{l.user_name || '-'}</span>
                    <span className="text-[9.5px] text-[var(--toss-gray-3)]">({l.company || '-'})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {suspicious && <span className="bg-red-500 text-white px-1.5 py-0.2 rounded text-[8px] font-black">새벽</span>}
                    <span className="text-[9.5px] text-[var(--toss-gray-3)] font-mono">{new Date(l.created_at).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="text-[var(--toss-gray-4)] font-bold">메뉴: {l.menu || '-'}</span>
                  <span className="text-[var(--accent)] font-black">{l.action || '-'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
