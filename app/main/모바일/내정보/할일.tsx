'use client';

/**
 * STodo — 모바일 할일 화면
 *   - 칩바 필터: 오늘 / 미완료 / 완료 / 전체
 *   - 카드 리스트 (체크박스 + 내용 + 우선순위 칩)
 *   - 우상단 + 버튼: 빠른 추가 인라인 입력
 * 데이터는 todos 테이블에서 staff(user) 본인 것만.
 * JM(파일당 500줄), JM2(필요한 칼럼만 select), JM3(에러는 toast), JM6(체크박스 input semantic)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { getKoreanTodayString } from '@/lib/seoul-time';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import MobileHeader from '../셸/MobileHeader';
import MIcon from '../공통/MIcon';
import MChip from '../공통/MChip';

type TodoFilter = 'today' | 'open' | 'done' | 'all';

type Todo = {
  id: string | number;
  user_id: string;
  content: string;
  is_complete: boolean;
  task_date: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
};

function getTodayKr() {
  // KST(Asia/Seoul) 기준 오늘 날짜(YYYY-MM-DD). Intl 기반 정본 헬퍼라 디바이스
  // 타임존과 무관하게 항상 한국 날짜이며 +9h 이중 가산 위험도 없다.
  return getKoreanTodayString();
}

const FILTER_LABEL: Record<TodoFilter, string> = {
  today: '오늘',
  open: '미완료',
  done: '완료',
  all: '전체',
};

const PRIORITY_TONE: Record<NonNullable<Todo['priority']>, 'danger' | 'warning' | ''> = {
  urgent: 'danger',
  high: 'warning',
  medium: '',
  low: '',
};
const PRIORITY_LABEL: Record<NonNullable<Todo['priority']>, string> = {
  urgent: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
};

export type STodoProps = {
  staffId: string | null;
  onBack: () => void;
};

export default function STodo({ staffId, onBack }: STodoProps) {
  const [filter, setFilter] = useState<TodoFilter>('today');
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [showInput, setShowInput] = useState(false);

  const today = getTodayKr();

  const fetchTodos = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('todos')
        .select('id, user_id, content, is_complete, task_date, priority')
        .eq('user_id', staffId)
        .order('task_date', { ascending: true });
      if (error) throw error;
      setTodos((data as Todo[]) ?? []);
    } catch (err) {
      toast(`할일 조회 실패: ${(err as Error)?.message ?? '오류'}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useEffect(() => { void fetchTodos(); }, [fetchTodos]);

  const filtered = useMemo(() => {
    return todos.filter((t) => {
      if (filter === 'today') return t.task_date === today;
      if (filter === 'open') return !t.is_complete;
      if (filter === 'done') return t.is_complete;
      return true;
    });
  }, [todos, filter, today]);

  const counts: Record<TodoFilter, number> = useMemo(() => ({
    today: todos.filter(t => t.task_date === today).length,
    open: todos.filter(t => !t.is_complete).length,
    done: todos.filter(t => t.is_complete).length,
    all: todos.length,
  }), [todos, today]);

  const toggleDone = async (todo: Todo) => {
    const nextComplete = !todo.is_complete;
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, is_complete: nextComplete } : t));
    const { queued, error } = await enqueueSupabaseMutation({
      kind: 'update',
      table: 'todos',
      payload: { is_complete: nextComplete },
      match: { id: todo.id },
    });
    if (error) {
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, is_complete: todo.is_complete } : t));
      toast(`상태 변경 실패: ${error}`, 'error');
    } else if (queued) {
      toast('오프라인 — 동기화 대기 중', 'warning');
    }
  };

  const handleAdd = async () => {
    const content = draft.trim();
    if (!content || !staffId) return;
    setAdding(true);
    const newPayload = { user_id: staffId, content, is_complete: false, task_date: today, priority: 'medium' as const };
    const { data, queued, error } = await enqueueSupabaseMutation<Todo>({
      kind: 'insert',
      table: 'todos',
      payload: newPayload,
    });
    if (error) {
      toast(`추가 실패: ${error}`, 'error');
    } else if (queued) {
      // 낙관적 추가 (임시 id)
      const optimistic: Todo = { ...newPayload, id: `pending-${Date.now()}`, priority: 'medium' };
      setTodos(prev => [optimistic, ...prev]);
      setDraft('');
      setShowInput(false);
      toast('오프라인 — 동기화 대기 중', 'warning');
    } else {
      const row = Array.isArray(data) ? (data[0] as Todo) : (data as Todo | null);
      if (row) setTodos(prev => [row, ...prev]);
      setDraft('');
      setShowInput(false);
    }
    setAdding(false);
  };

  return (
    <div className="m-screen">
      <MobileHeader
        title="할일"
        sub={`총 ${todos.length}건`}
        back={onBack}
        actions={
          <button type="button" onClick={() => setShowInput(v => !v)} aria-label="할일 추가">
            <MIcon name="plus" size={20} />
          </button>
        }
      />
      <div className="m-chip-bar">
        {(['today', 'open', 'done', 'all'] as TodoFilter[]).map(f => (
          <button
            key={f}
            type="button"
            className={filter === f ? 'on' : ''}
            onClick={() => setFilter(f)}
          >
            {FILTER_LABEL[f]}<span className="cnt">{counts[f]}</span>
          </button>
        ))}
      </div>

      {showInput && (
        <div style={{
          padding: '10px 16px',
          background: 'var(--m-card)',
          borderBottom: '1px solid var(--m-border)',
          display: 'flex', gap: 8, alignItems: 'center',
        }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleAdd(); }}
            placeholder="오늘 할일을 적어주세요"
            autoFocus
            style={{
              flex: 1, height: 36, padding: '0 12px',
              background: 'var(--m-bg)', borderRadius: 10, fontSize: 14, fontWeight: 600,
            }}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!draft.trim() || adding}
            className="m-btn primary"
            style={{ height: 36, padding: '0 14px' }}
          >
            추가
          </button>
        </div>
      )}

      <div className="m-scroll">
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', fontSize: 13, color: 'var(--z-500)' }}>
              불러오는 중…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="m-card" style={{ textAlign: 'center', padding: '32px 16px' }}>
              <MIcon name="check" size={24} color="var(--z-400)" />
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 700, color: 'var(--z-600)' }}>
                {filter === 'today' ? '오늘 할일이 없습니다' : '항목이 없습니다'}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                우상단 + 버튼으로 추가할 수 있어요
              </div>
            </div>
          )}
          {filtered.map((t) => {
            const priority = t.priority ?? 'medium';
            const tone = PRIORITY_TONE[priority];
            return (
              <div
                key={t.id}
                className="m-card"
                style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'flex-start' }}
              >
                <button
                  type="button"
                  onClick={() => void toggleDone(t)}
                  aria-label={t.is_complete ? '완료 취소' : '완료 처리'}
                  style={{
                    width: 22, height: 22, borderRadius: 6,
                    border: t.is_complete ? '0' : '2px solid var(--z-300)',
                    background: t.is_complete ? 'var(--m-accent)' : 'transparent',
                    display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2,
                  }}
                >
                  {t.is_complete && <MIcon name="check" size={14} color="#fff" strokeWidth={3} />}
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14, fontWeight: 600, letterSpacing: '-0.012em', lineHeight: 1.5,
                      color: t.is_complete ? 'var(--z-400)' : 'var(--z-900)',
                      textDecoration: t.is_complete ? 'line-through' : 'none',
                    }}
                  >
                    {t.content}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                    {(priority === 'urgent' || priority === 'high') && (
                      <MChip tone={tone || undefined}>{PRIORITY_LABEL[priority]}</MChip>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>{t.task_date}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
