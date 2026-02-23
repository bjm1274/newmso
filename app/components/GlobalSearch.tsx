'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

type SearchResult = {
  type: 'staff' | 'post' | 'approval' | 'message';
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
};

export default function GlobalSearch({
  user,
  onSelect,
  staffs = [],
  posts = [],
  variant = 'input'
}: {
  user: any;
  onSelect: (type: string, id: string, item?: any) => void;
  staffs?: any[];
  posts?: any[];
  variant?: 'input' | 'icon';
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (variant === 'icon' && open) inputRef.current?.focus();
  }, [variant, open]);

  useEffect(() => {
    if (variant !== 'icon' || !open) return;
    const onOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onOutside);
    return () => document.removeEventListener('click', onOutside);
  }, [variant, open]);

  const search = useCallback(async (q: string) => {
    if (!q || q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const term = `%${q.trim()}%`;
    const list: SearchResult[] = [];

    try {
      // 직원 (이름, 부서, 직함)
      const staffMatches = (staffs || []).filter(
        (s: any) =>
          (s.name && String(s.name).toLowerCase().includes(q.trim().toLowerCase())) ||
          (s.department && String(s.department).toLowerCase().includes(q.trim().toLowerCase())) ||
          (s.position && String(s.position).toLowerCase().includes(q.trim().toLowerCase())) ||
          (s.company && String(s.company).toLowerCase().includes(q.trim().toLowerCase()))
      );
      staffMatches.slice(0, 5).forEach((s: any) =>
        list.push({ type: 'staff', id: s.id, title: s.name, subtitle: `${s.department || ''} ${s.position || ''}`.trim(), meta: s.company })
      );

      // 게시글
      const postMatches = (posts || []).filter(
        (p: any) =>
          (p.title && String(p.title).toLowerCase().includes(q.trim().toLowerCase())) ||
          (p.content && String(p.content).toLowerCase().includes(q.trim().toLowerCase()))
      );
      postMatches.slice(0, 5).forEach((p: any) =>
        list.push({ type: 'post', id: p.id, title: p.title, subtitle: p.content?.slice(0, 80), meta: p.board_type })
      );

      // 결재 (실시간 조회)
      const { data: approvalsByTitle } = await supabase.from('approvals').select('id, title, type, status, sender_name, created_at').ilike('title', term);
      const { data: approvalsByContent } = await supabase.from('approvals').select('id, title, type, status, sender_name, created_at').ilike('content', term);
      const approvalMap = new Map<string, any>();
      [...(approvalsByTitle || []), ...(approvalsByContent || [])].forEach((a: any) => approvalMap.set(a.id, a));
      Array.from(approvalMap.values()).slice(0, 5).forEach((a: any) =>
        list.push({ type: 'approval', id: a.id, title: a.title, subtitle: a.sender_name, meta: `${a.type} · ${a.status}` })
      );

      // 채팅 (내가 참여한 방의 메시지)
      const { data: myRooms } = await supabase.from('chat_rooms').select('id').contains('members', [user?.id]);
      const roomIds = (myRooms || []).map((r: any) => r.id);
      if (roomIds.length > 0) {
        const { data: msgs } = await supabase
          .from('messages')
          .select('id, content, room_id')
          .in('room_id', roomIds)
          .ilike('content', term)
          .eq('is_deleted', false)
          .order('created_at', { ascending: false })
          .limit(5);
        (msgs || []).forEach((m: any) =>
          list.push({ type: 'message', id: m.id, title: (m.content || '').slice(0, 60), subtitle: '채팅', meta: '' })
        );
      }

      setResults(list);
      setActiveIdx(0);
    } catch (e) {
      console.error(e);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, staffs, posts]);

  useEffect(() => {
    const t = setTimeout(() => search(query), 300);
    return () => clearTimeout(t);
  }, [query, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter' && results[activeIdx]) {
      e.preventDefault();
      const r = results[activeIdx];
      onSelect(r.type, r.id);
      setOpen(false);
      setQuery('');
    }
  };

  const typeLabel: Record<string, string> = { staff: '👤 직원', post: '📋 게시글', approval: '✍️ 결재', message: '💬 채팅' };

  const dropdown = open && (variant === 'icon' ? true : query.length >= 2 || results.length > 0) ? (
    <div
      ref={listRef}
      className={`absolute z-[999] bg-[var(--toss-card)] rounded-[12px] shadow-lg border border-[var(--toss-border)] overflow-hidden max-h-[320px] overflow-y-auto ${
        variant === 'icon' ? 'left-full top-0 ml-1 min-w-[280px]' : 'top-full left-0 right-0 mt-1'
      }`}
    >
      {variant === 'icon' && (
        <div className="p-2 border-b border-[var(--toss-border)]">
          <input
            ref={inputRef}
            type="search"
            placeholder="직원·게시글·결재·채팅 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full min-h-[40px] px-3 py-2 rounded-[10px] bg-[var(--input-bg)] text-sm text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
          />
        </div>
      )}
      {(query.length >= 2 || results.length > 0) && (
        <>
          {loading ? (
            <div className="p-6 text-center text-[var(--toss-gray-3)] text-sm">검색 중...</div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-[var(--toss-gray-3)] text-sm">검색 결과 없음</div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onSelect(r.type, r.id); setOpen(false); setQuery(''); }}
                className={`w-full text-left min-h-[44px] px-4 py-3 flex gap-3 items-start hover:bg-[var(--toss-gray-1)] transition-colors touch-manipulation ${i === activeIdx ? 'bg-[var(--toss-blue-light)]' : ''}`}
              >
                <span className="text-[10px] font-semibold text-[var(--toss-gray-3)] shrink-0">{typeLabel[r.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[var(--foreground)] truncate">{r.title}</p>
                  {r.subtitle && <p className="text-xs text-[var(--toss-gray-3)] truncate">{r.subtitle}</p>}
                </div>
              </button>
            ))
          )}
        </>
      )}
    </div>
  ) : null;

  if (variant === 'icon') {
    return (
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-[12px] text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)] hover:text-[var(--foreground)] transition-colors touch-manipulation"
          aria-label="검색"
        >
          <span className="text-xl">🔍</span>
        </button>
        {open && dropdown}
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="search"
        placeholder="직원·게시글·결재·채팅 검색..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={handleKeyDown}
        className="w-full max-w-[240px] min-h-[44px] px-4 py-2 rounded-[12px] bg-[var(--input-bg)] text-sm text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30 touch-manipulation"
      />
      {dropdown}
    </div>
  );
}
