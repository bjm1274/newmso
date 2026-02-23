'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function MyTodoList({ user: initialUser }: any) {
  const [user, setUser] = useState<any>(initialUser || {});
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

  // 1. 유저 ID 확인 및 자동 복구 로직
  useEffect(() => {
    const checkAndRecoverUser = async () => {
      if (initialUser?.id) {
        setUser(initialUser);
        fetchTasks(initialUser.id);
        setRecoverAttempted(true);
        return;
      }

      if (initialUser?.name) {
        setRecoverAttempted(true);
        try {
          const { data, error } = await supabase
            .from('staff_members')
            .select('*')
            .eq('name', initialUser.name)
            .maybeSingle();

          if (data && !error) {
            setUser(data);
            localStorage.setItem('user_session', JSON.stringify(data));
            localStorage.setItem('erp_user', JSON.stringify(data));
            fetchTasks(data.id);
          }
        } catch (_) {}
      } else {
        setRecoverAttempted(true);
      }
    };

    checkAndRecoverUser();
  }, [initialUser, selectedDate]);

  useEffect(() => {
    if (user?.id) fetchTasks(user.id);
  }, [viewRange]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`todos-realtime-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${user.id}` }, () => {
        fetchTasks(user.id);
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
      alert("잠시만 기다려주세요. 사용자 정보를 확인 중입니다.");
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

    } catch (error: any) {
      alert('저장 실패: ' + error.message);
      fetchTasks(user.id);
    }
  };

  const toggleTask = async (taskId: number, currentStatus: boolean) => {
    try {
      setTasks(tasks.map(t => t.id === taskId ? { ...t, is_complete: !currentStatus } : t));
      await supabase.from('todos').update({ is_complete: !currentStatus }).eq('id', taskId);
    } catch (error) {
      if(user?.id) fetchTasks(user.id);
    }
  };

  const deleteTask = async (taskId: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      setTasks(tasks.filter(t => t.id !== taskId));
      await supabase.from('todos').delete().eq('id', taskId);
    } catch (error) {
      if(user?.id) fetchTasks(user.id);
    }
  };

  // 렌더링: 일별은 기존 로직, 주/월은 해당 기간 전체
  const inProgressTasks = tasks.filter(t => !t.is_complete);
  const completedTasks = viewRange === 'day'
    ? tasks.filter(t => t.is_complete && t.task_date === selectedDate)
    : tasks.filter(t => t.is_complete);

  return (
    <div className="bg-white border border-gray-100 shadow-sm rounded-[2.5rem] p-8 h-full flex flex-col space-y-6">
      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">나의 할일 관리</h3>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              {(['day', 'week', 'month'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setViewRange(r)}
                  className={`px-3 py-1.5 rounded-md text-[10px] font-bold ${viewRange === r ? 'bg-white text-[#3182F6] shadow-sm' : 'text-gray-500'}`}
                >
                  {r === 'day' ? '일별' : r === 'week' ? '주간별' : '월별'}
                </button>
              ))}
            </div>
            <input
              type={viewRange === 'month' ? 'month' : 'date'}
              value={viewRange === 'month' ? selectedDate.slice(0, 7) : selectedDate}
              onChange={(e) => setSelectedDate(viewRange === 'month' ? e.target.value + '-01' : e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-700 outline-none focus:border-blue-500 cursor-pointer"
            />
          </div>
        </div>
        {viewRange !== 'day' && (
          <p className="text-[10px] text-gray-400 font-bold">
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
          className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold outline-none focus:bg-white focus:border-blue-500 transition-all disabled:bg-gray-100"
        />
        <button
          onClick={handleAddTask}
          disabled={!user?.id || !newTask.trim()}
          className="bg-gray-900 text-white rounded-xl px-6 py-3 text-sm font-semibold hover:bg-black transition-all shadow-md disabled:opacity-50"
        >
          등록
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-8 pr-2 custom-scrollbar">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-blue-600 rounded-full animate-spin"></div>
          </div>
        ) : !user?.id ? (
           <div className="h-60 flex flex-col items-center justify-center text-gray-400 gap-3 px-4 text-center">
             <span className="text-3xl">📋</span>
             <p className="text-xs font-bold">할일은 직원 계정(이름으로 로그인)으로 이용해 주세요.</p>
             <p className="text-[10px] text-gray-300">MSO 관리자 계정은 이 기능을 사용할 수 없습니다.</p>
           </div>
        ) : tasks.length > 0 ? (
          <>
            <section className="space-y-3">
              <h4 className="text-[10px] font-semibold text-blue-600 uppercase flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></span>
                진행 중 ({inProgressTasks.length})
              </h4>
              {inProgressTasks.map(task => (
                <TodoItem key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />
              ))}
              {inProgressTasks.length === 0 && <p className="text-[10px] text-gray-300 italic pl-3">진행 중인 일이 없습니다.</p>}
            </section>

            {completedTasks.length > 0 && (
              <section className="space-y-3 opacity-60">
                <h4 className="text-[10px] font-semibold text-gray-400 uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span>
                  완료 내역 ({completedTasks.length})
                </h4>
                {completedTasks.map(task => (
                  <TodoItem key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />
                ))}
              </section>
            )}
          </>
        ) : (
          <div className="h-60 flex flex-col items-center justify-center text-gray-300 gap-3 border-2 border-dashed border-gray-50 rounded-[2rem]">
            <span className="text-4xl grayscale opacity-50">📝</span>
            <p className="text-xs font-bold">{selectedDate}의 일정이 비어있습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TodoItem({ task, onToggle, onDelete }: any) {
  return (
    <div className="group flex items-center gap-3 p-4 bg-white border border-gray-100 rounded-lg hover:border-blue-200 hover:shadow-sm transition-all animate-fade-in-up">
      <button onClick={() => onToggle(task.id, task.is_complete)} className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all flex-shrink-0 ${task.is_complete ? 'bg-green-500 border-green-500 text-white' : 'border-gray-200 hover:border-blue-400'}`}>
        {task.is_complete && <span className="text-[10px] font-bold">V</span>}
      </button>
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className={`flex-1 text-sm font-bold truncate ${task.is_complete ? 'text-gray-300 line-through decoration-2' : 'text-gray-700'}`}>
          {task.content}
        </span>
        {task.task_date && (
          <span className="shrink-0 text-[10px] font-bold text-gray-300">
            {task.task_date}
          </span>
        )}
      </div>
      <button onClick={() => onDelete(task.id)} className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-[10px] font-semibold px-2 py-1 bg-gray-50 hover:bg-red-50 rounded-md">삭제</button>
    </div>
  );
}