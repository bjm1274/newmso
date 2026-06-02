'use client';
import { useState, useEffect, useCallback, useRef, type CSSProperties, type ReactElement } from 'react';
import { List } from 'react-window';
import { EmptyState, LoadingPanel } from '@/app/components/StatePanel';
import { supabase } from '@/lib/supabase';
import { useIsMobile } from '@/app/components/useIsMobile';
import { DesktopOnlyNotice } from '@/app/components/DesktopOnlyNotice';
import { escapeLikePattern } from '@/lib/like-escape';

const PAGE_SIZE = 100;
const ROW_HEIGHT = 36; // 각 행의 고정 높이 (px)
const LIST_HEIGHT = 500; // 가상 스크롤 영역 높이 (px)

// react-window v2: rowProps로 전달할 커스텀 props
interface AuditRowProps {
  logs: any[];
}

// react-window v2 rowComponent — index, style, ariaAttributes는 자동 주입됨
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

export default function AuditLogViewer() {
  const isMobile = useIsMobile();
  if (isMobile) {
    return <DesktopOnlyNotice feature="감사 로그 뷰어" />;
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
    
    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (keyword.trim()) {
      const safe = escapeLikePattern(keyword.trim());
      query = query.or(
        `user_name.ilike.%${safe}%,action.ilike.%${safe}%,target_id.ilike.%${safe}%,details.ilike.%${safe}%`
      );
    }

    const { data } = await query.range(offset, offset + PAGE_SIZE - 1);
    
    if (myId !== requestIdRef.current) return; // stale response
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
      requestIdRef.current = -1; // unmount 후 응답은 모두 무효화
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
            {/* 테이블 헤더 */}
            <div className="flex items-center bg-[var(--muted)] text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">
              <div className="w-[30%] px-2 py-2">시간</div>
              <div className="w-[20%] px-2 py-2">작업</div>
              <div className="w-[30%] px-2 py-2">대상</div>
              <div className="w-[20%] px-2 py-2">사용자</div>
            </div>
            {/* react-window v2 가상 스크롤 리스트 */}
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
