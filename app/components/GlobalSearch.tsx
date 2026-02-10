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
  posts = []
}: {
  user: any;
  onSelect: (type: string, id: string, item?: any) => void;
  staffs?: any[];
  posts?: any[];
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
        className="w-full max-w-[240px] px-4 py-2 rounded-[12px] bg-[#F2F4F6] text-sm text-[#191F28] placeholder:text-[#8B95A1] outline-none focus:ring-2 focus:ring-[#3182F6]/30"
      />
      {open && (query.length >= 2 || results.length > 0) && (
        <div
          ref={listRef}
          className="absolute top-full left-0 right-0 mt-1 bg-white rounded-[12px] shadow-lg border border-[#E5E8EB] overflow-hidden z-[999] max-h-[320px] overflow-y-auto"
        >
          {loading ? (
            <div className="p-6 text-center text-[#8B95A1] text-sm">검색 중...</div>
          ) : results.length === 0 ? (
            <div className="p-6 text-center text-[#8B95A1] text-sm">검색 결과 없음</div>
          ) : (
            results.map((r, i) => (
              <button
                key={`${r.type}-${r.id}`}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onSelect(r.type, r.id); setOpen(false); setQuery(''); }}
                className={`w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-[#F2F4F6] transition-colors ${i === activeIdx ? 'bg-[#E8F3FF]' : ''}`}
              >
                <span className="text-[10px] font-semibold text-[#8B95A1] shrink-0">{typeLabel[r.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#191F28] truncate">{r.title}</p>
                  {r.subtitle && <p className="text-xs text-[#8B95A1] truncate">{r.subtitle}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
