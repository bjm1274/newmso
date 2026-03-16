'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatPatientBedLabel, normalizeHandoverNote, type HandoverNoteRow } from '@/lib/handover-notes';

type SearchType = 'staff' | 'post' | 'approval' | 'message' | 'handover';

type SearchResult = {
  type: SearchType;
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
};

type GlobalSearchProps = {
  user: any;
  onSelect: (type: string, id: string, item?: any) => void;
  staffs?: any[];
  posts?: any[];
  variant?: 'input' | 'icon';
  compact?: boolean;
};

export default function GlobalSearch({
  user,
  onSelect,
  staffs = [],
  posts = [],
  variant = 'input',
  compact = false,
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [results, setResults] = useState<SearchResult[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (variant === 'icon' && open) {
      inputRef.current?.focus();
    }
  }, [open, variant]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const searchLocally = useMemo(
    () => (term: string) => {
      const normalized = term.trim().toLowerCase();
      const nextResults: SearchResult[] = [];

      (staffs || [])
        .filter((staff: any) => {
          return [
            staff?.name,
            staff?.department,
            staff?.position,
            staff?.company,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalized));
        })
        .slice(0, 5)
        .forEach((staff: any) => {
          nextResults.push({
            type: 'staff',
            id: String(staff.id),
            title: staff.name || '이름 없음',
            subtitle: [staff.department, staff.position].filter(Boolean).join(' '),
            meta: staff.company || '',
          });
        });

      (posts || [])
        .filter((post: any) => {
          return [post?.title, post?.content]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalized));
        })
        .slice(0, 5)
        .forEach((post: any) => {
          nextResults.push({
            type: 'post',
            id: String(post.id),
            title: post.title || '제목 없음',
            subtitle: String(post.content || '').slice(0, 80),
            meta: post.board_type || '',
          });
        });

      return nextResults;
    },
    [posts, staffs]
  );

  const search = useCallback(
    async (term: string) => {
      const normalized = term.trim();
      if (normalized.length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      const nextResults = searchLocally(normalized);
      const likeTerm = `%${normalized}%`;

      try {
        const { data: approvalsByTitle } = await supabase
          .from('approvals')
          .select('id, title, type, status, sender_name')
          .ilike('title', likeTerm)
          .limit(5);

        const { data: approvalsByContent } = await supabase
          .from('approvals')
          .select('id, title, type, status, sender_name')
          .ilike('content', likeTerm)
          .limit(5);

        const approvalMap = new Map<string, any>();
        [...(approvalsByTitle || []), ...(approvalsByContent || [])].forEach((approval: any) => {
          approvalMap.set(String(approval.id), approval);
        });
        Array.from(approvalMap.values())
          .slice(0, 5)
          .forEach((approval: any) => {
            nextResults.push({
              type: 'approval',
              id: String(approval.id),
              title: approval.title || '결재 문서',
              subtitle: approval.sender_name || '',
              meta: [approval.type, approval.status].filter(Boolean).join(' · '),
            });
          });

        if (user?.id) {
          const { data: myRooms } = await supabase
            .from('chat_rooms')
            .select('id')
            .contains('members', [user.id]);

          const roomIds = (myRooms || []).map((room: any) => room.id).filter(Boolean);
          if (roomIds.length > 0) {
            const { data: messages } = await supabase
              .from('messages')
              .select('id, content')
              .in('room_id', roomIds)
              .ilike('content', likeTerm)
              .eq('is_deleted', false)
              .order('created_at', { ascending: false })
              .limit(5);

            (messages || []).forEach((message: any) => {
              nextResults.push({
                type: 'message',
                id: String(message.id),
                title: String(message.content || '').slice(0, 60) || '채팅 메시지',
                subtitle: '채팅',
              });
            });
          }
        }

        if (user?.department === '병동팀') {
          const { data: notes } = await supabase
            .from('handover_notes')
            .select('id, content, author_name, created_at')
            .ilike('content', likeTerm)
            .order('created_at', { ascending: false })
            .limit(5);

          (notes || []).forEach((note: any) => {
            const normalized = normalizeHandoverNote(note as HandoverNoteRow);
            if (normalized.handover_kind === 'room_config') return;
            nextResults.push({
              type: 'handover',
              id: String(normalized.id),
              title: normalized.content.slice(0, 60) || '인계노트',
              subtitle: normalized.note_scope === 'patient'
                ? formatPatientBedLabel(normalized)
                : (normalized.author_name ? `[인계] ${normalized.author_name}` : '인계노트'),
              meta: normalized.handover_date || (normalized.created_at ? String(normalized.created_at).slice(0, 10) : ''),
            });
          });
        }

        setResults(nextResults);
        setActiveIndex(0);
      } catch (error) {
        console.error('통합 검색 실패:', error);
        setResults(nextResults);
      } finally {
        setLoading(false);
      }
    },
    [searchLocally, user?.department, user?.id]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void search(query);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, search]);

  const handleSelect = (result: SearchResult) => {
    onSelect(result.type, result.id, result);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, Math.max(results.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (event.key === 'Enter' && results[activeIndex]) {
      event.preventDefault();
      handleSelect(results[activeIndex]);
    }
    if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  const typeLabel: Record<SearchType, string> = {
    staff: '직원',
    post: '게시글',
    approval: '결재',
    message: '채팅',
    handover: '인계',
  };

  const dropdown = open ? (
    <div
      className={`absolute z-[999] overflow-hidden rounded-[14px] border border-[var(--toss-border)] bg-[var(--toss-card)] shadow-lg ${
        variant === 'icon'
          ? 'left-full top-0 ml-2 min-w-[320px]'
          : 'left-0 right-0 top-full mt-2'
      }`}
    >
      {variant === 'icon' ? (
        <div className="border-b border-[var(--toss-border)] p-2">
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="직원, 게시글, 결재, 채팅 검색"
            className="w-full rounded-[12px] bg-[var(--input-bg)] px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
          />
        </div>
      ) : null}

      {query.trim().length < 2 ? (
        <div className="px-4 py-6 text-center text-sm text-[var(--toss-gray-3)]">
          두 글자 이상 입력해 주세요.
        </div>
      ) : loading ? (
        <div className="px-4 py-6 text-center text-sm text-[var(--toss-gray-3)]">
          검색 중입니다.
        </div>
      ) : results.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-[var(--toss-gray-3)]">
          검색 결과가 없습니다.
        </div>
      ) : (
        <div className="max-h-[320px] overflow-y-auto">
          {results.map((result, index) => (
            <button
              key={`${result.type}-${result.id}`}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(result);
              }}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                index === activeIndex ? 'bg-[var(--toss-blue-light)]' : 'hover:bg-[var(--page-bg)]'
              }`}
            >
              <span className="shrink-0 text-[10px] font-semibold text-[var(--toss-gray-3)]">
                {typeLabel[result.type]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--foreground)]">
                  {result.title}
                </div>
                {result.subtitle ? (
                  <div className="truncate text-xs text-[var(--toss-gray-3)]">{result.subtitle}</div>
                ) : null}
                {result.meta ? (
                  <div className="truncate text-[11px] text-[var(--toss-gray-3)]">{result.meta}</div>
                ) : null}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  if (variant === 'icon') {
    return (
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          className={`flex items-center justify-center rounded-[12px] text-[var(--toss-gray-3)] transition hover:bg-[var(--page-bg)] hover:text-[var(--foreground)] ${
            compact ? 'min-h-[38px] min-w-[38px] p-2' : 'min-h-[44px] min-w-[44px] p-2.5'
          }`}
          aria-label="검색"
        >
          <span className="text-lg">⌕</span>
        </button>
        {dropdown}
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder="직원, 게시글, 결재, 채팅 검색"
        className="w-full rounded-[12px] bg-[var(--input-bg)] px-4 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/20"
      />
      {dropdown}
    </div>
  );
}
