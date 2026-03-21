'use client';
import { toast } from '@/lib/toast';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

function isUuidLike(value: string | null | undefined) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export default function MyTodoList({ user: initialUser, onChatNavigate: _onChatNavigate }: Record<string, unknown>) {
  const onChatNavigate = _onChatNavigate as ((roomId: string, messageId: string) => void) | undefined;
  const _iu = (initialUser ?? {}) as Record<string, unknown>;
  const [user, setUser] = useState<Record<string, unknown>>(_iu);
  const [tasks, setTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState('');
  const [recoverAttempted, setRecoverAttempted] = useState(false);
  
  // 날짜 설정
  const getToday = () => {
    const now = new Date();
    const krTime = new Date(now.getTime() + (9 * 60 * 60 * 1000));
    return krTime.toISOString().split('T')[0];
  };
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [viewRange, setViewRange] = useState<'day' | 'week' | 'month'>('day');
  const [loading, setLoading] = useState(false);

  // 1. 유저 ID 확인 및 자동 복구 로직 (user 변경 시에만 실행, selectedDate 변경 시 불필요한 재조회 방지)
  useEffect(() => {
    const checkAndRecoverUser = async () => {
      if ((_iu)?.id && isUuidLike(_iu.id as string)) {
        setUser((_iu));
        fetchTasks(_iu.id as string);
        setRecoverAttempted(true);
        return;
      }

      if ((_iu)?.name) {
        setRecoverAttempted(true);
        try {
          const { data, error } = await supabase
            .from('staff_members')
            .select('*')
            .eq('name', (_iu)?.name)
            .maybeSingle();

          if (data && !error) {
            setUser(data);
            localStorage.setItem('erp_user', JSON.stringify(data));
            fetchTasks(data.id);
          }
        } catch (_) {}
      } else {
        setRecoverAttempted(true);
      }
    };

    checkAndRecoverUser();
  }, [(_iu)]);

  useEffect(() => {
    if (user?.id) fetchTasks(user.id as string);
  }, [viewRange, selectedDate]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`todos-realtime-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${user.id}` }, () => {
        fetchTasks(user.id as string);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, selectedDate, viewRange]);

  // 일별: 해당일 포함 이전 할일. 주간별: 그 주 범위. 월별: 그 달 범위
  const getDateRange = () => {
    const d = new Date(selectedDate + 'T12:00:00');
    if (viewRange === 'day') {
      return { start: selectedDate, end: selectedDate };
    }
    if (viewRange === 'week') {
      const day = d.getDay();
      const sun = new Date(d);
      sun.setDate(d.getDate() - (day === 0 ? 7 : day));
      const sat = new Date(sun);
      sat.setDate(sun.getDate() + 6);
      return {
        start: sun.toISOString().slice(0, 10),
        end: sat.toISOString().slice(0, 10),
      };
    }
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
    return {
      start: `${y}-${m}-01`,
      end: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
    };
  };

  const fetchTasks = async (userId: string) => {
    if (!userId) return;
    const { start, end } = getDateRange();
    try {
      setLoading(true);
      let query = supabase
        .from('todos')
        .select('*')
        .eq('user_id', userId);
      if (viewRange === 'day') {
        query = query.lte('task_date', selectedDate);
      } else {
        query = query.gte('task_date', start).lte('task_date', end);
      }
      const { data, error } = await query
        .order('task_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTasks(data || []);
    } catch (error) {
      console.error('로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    
    // 안전장치: ID가 없으면 한 번 더 확인
    if (!user?.id) {
      toast("잠시만 기다려주세요. 사용자 정보를 확인 중입니다.", 'warning');
      return;
    }

    try {
      // 낙관적 업데이트
      const optimisticTask = {
        id: Date.now(),
        user_id: user.id,
        content: newTask,
        is_complete: false,
        task_date: selectedDate,
        created_at: new Date().toISOString()
      };
      setTasks([optimisticTask, ...tasks]);
      setNewTask('');

      const { data, error } = await supabase
        .from('todos')
        .insert([{ 
          user_id: user.id, 
          content: newTask, 
          is_complete: false,
          task_date: selectedDate
        }])
        .select()
        .single();

      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === optimisticTask.id ? data : t));

    } catch (error: unknown) {
      toast('저장 실패: ' + ((error as Error)?.message ?? String(error)), 'error');
      fetchTasks(user.id as string);
    }
  };

  const toggleTask = async (taskId: number, currentStatus: boolean) => {
    try {
      setTasks(tasks.map(t => t.id === taskId ? { ...t, is_complete: !currentStatus } : t));
      await supabase.from('todos').update({ is_complete: !currentStatus }).eq('id', taskId);
    } catch (error) {
      if(user?.id) fetchTasks(user.id as string);
    }
  };

  const deleteTask = async (taskId: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      setTasks(tasks.filter(t => t.id !== taskId));
      await supabase.from('todos').delete().eq('id', taskId);
    } catch (error) {
      if(user?.id) fetchTasks(user.id as string);
    }
  };

  // 렌더링: 일별은 기존 로직, 주/월은 해당 기간 전체
  const inProgressTasks = tasks.filter(t => !t.is_complete);
  const completedTasks = viewRange === 'day'
    ? tasks.filter(t => t.is_complete && t.task_date === selectedDate)
    : tasks.filter(t => t.is_complete);

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] shadow-sm rounded-2xl p-5 h-full flex flex-col space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h3 className="text-xs font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">나의 할일 관리</h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-[var(--muted)] p-1 rounded-[var(--radius-md)]">
              {(['day', 'week', 'month'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setViewRange(r)}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold ${viewRange === r ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)]'}`}
                >
                  {r === 'day' ? '일별' : r === 'week' ? '주간별' : '월별'}
                </button>
              ))}
            </div>
            <input
              type={viewRange === 'month' ? 'month' : 'date'}
              value={viewRange === 'month' ? selectedDate.slice(0, 7) : selectedDate}
              onChange={(e) => setSelectedDate(viewRange === 'month' ? e.target.value + '-01' : e.target.value)}
              className="bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)] cursor-pointer"
            />
          </div>
        </div>
        {viewRange !== 'day' && (
          <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
            {viewRange === 'week' && (() => {
              const { start, end } = getDateRange();
              return `${start} ~ ${end}`;
            })()}
            {viewRange === 'month' && `${selectedDate.slice(0, 7)} 전체`}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
          placeholder={user?.id ? `${selectedDate}의 할일을 입력하세요...` : (recoverAttempted ? "직원 계정으로 로그인하면 할일을 등록할 수 있습니다." : "사용자 정보 확인 중...")}
          disabled={!user?.id}
          className="flex-1 bg-[var(--input-bg)] border border-[var(--border)] rounded-[var(--radius-lg)] px-4 py-3 text-sm font-bold outline-none focus:bg-[var(--card)] focus:border-[var(--accent)] transition-all disabled:bg-[var(--muted)]"
        />
        <button
          onClick={handleAddTask}
          disabled={!user?.id || !newTask.trim()}
          className="bg-[var(--foreground)] text-white rounded-[var(--radius-lg)] px-4 py-3 text-sm font-semibold hover:opacity-90 transition-all shadow-md disabled:opacity-50"
        >
          등록
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-5 pr-2 custom-scrollbar">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-[var(--border)] border-t-[var(--accent)] rounded-full animate-spin"></div>
          </div>
        ) : !user?.id ? (
           <div className="h-60 flex flex-col items-center justify-center text-[var(--toss-gray-3)] gap-3 px-4 text-center">
             <span className="text-3xl">📋</span>
             <p className="text-xs font-bold">할일은 직원 계정(이름으로 로그인)으로 이용해 주세요.</p>
             <p className="text-[11px] text-[var(--toss-gray-3)]">MSO 관리자 계정은 이 기능을 사용할 수 없습니다.</p>
           </div>
        ) : tasks.length > 0 ? (
          <>
            <section className="space-y-3">
              <h4 className="text-[11px] font-semibold text-[var(--accent)] uppercase flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full animate-pulse"></span>
                진행 중 ({inProgressTasks.length})
              </h4>
              {inProgressTasks.map(task => (
                <TodoItem key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} onChatNavigate={onChatNavigate} />
              ))}
              {inProgressTasks.length === 0 && <p className="text-[11px] text-[var(--toss-gray-3)] italic pl-3">진행 중인 일이 없습니다.</p>}
            </section>

            {completedTasks.length > 0 && (
              <section className="space-y-3 opacity-60">
                <h4 className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[var(--toss-gray-3)] rounded-full"></span>
                  완료 내역 ({completedTasks.length})
                </h4>
                {completedTasks.map(task => (
                  <TodoItem key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} onChatNavigate={onChatNavigate} />
                ))}
              </section>
            )}
          </>
        ) : (
          <div className="h-60 flex flex-col items-center justify-center text-[var(--toss-gray-3)] gap-3 border-2 border-dashed border-[var(--border)] rounded-[var(--radius-lg)]">
            <span className="text-4xl grayscale opacity-50">📝</span>
            <p className="text-xs font-bold">{selectedDate}의 일정이 비어있습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TodoItem({ task: _rawTask, onToggle: _onToggle, onDelete: _onDelete, onChatNavigate: _onChatNavigate }: Record<string, unknown>) {
  const task = (_rawTask ?? {}) as Record<string, unknown>;
  const onToggle = _onToggle as (id: unknown, status: unknown) => void;
  const onDelete = _onDelete as (id: unknown) => void;
  const onChatNavigate = _onChatNavigate as ((roomId: string, messageId: string) => void) | undefined;
  const isChatSource = !!(task.source_message_id && task.source_room_id);
  return (
    <div className="group flex items-center gap-3 p-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] hover:border-[var(--accent)] hover:shadow-sm transition-all animate-fade-in-up">
      <button onClick={() => onToggle(task.id, task.is_complete)} className={`w-6 h-6 rounded-[var(--radius-md)] border-2 flex items-center justify-center transition-all flex-shrink-0 ${task.is_complete ? 'bg-green-500 border-green-500 text-white' : 'border-[var(--border)] hover:border-[var(--accent)]'}`}>
        {!!task.is_complete && <span className="text-[11px] font-bold">V</span>}
      </button>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className={`flex-1 text-sm font-bold truncate ${task.is_complete ? 'text-[var(--toss-gray-3)] line-through decoration-2' : 'text-[var(--foreground)]'}`}>
          {task.content as string}
        </span>
        {!!task.task_date && (
          <span className="shrink-0 text-[11px] font-bold text-[var(--toss-gray-3)]">
            {task.task_date as string}
          </span>
        )}
      </div>
      {isChatSource && onChatNavigate && (
        <button
          onClick={() => onChatNavigate(task.source_room_id as string, task.source_message_id as string)}
          title="채팅 메시지로 이동"
          className="shrink-0 text-[var(--accent)] hover:text-white hover:bg-[var(--accent)] transition-all text-[11px] font-semibold px-2 py-1 bg-[var(--toss-blue-light)] rounded-md"
        >
          💬 채팅
        </button>
      )}
      <button onClick={() => onDelete(task.id)} className="opacity-0 group-hover:opacity-100 text-[var(--toss-gray-3)] hover:text-red-500 transition-all text-[11px] font-semibold px-2 py-1 bg-[var(--muted)] hover:bg-red-50 rounded-md">삭제</button>
    </div>
  );
}