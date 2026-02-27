'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

const PRIORITY_LABELS: Record<string, { label: string; color: string }> = {
  urgent: { label: '긴급', color: 'bg-red-100 text-red-700 border-red-200' },
  high: { label: '높음', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  medium: { label: '보통', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  low: { label: '낮음', color: 'bg-green-100 text-green-700 border-green-200' },
};

// 메인 화면의 '할일'은 Supabase tasks 테이블과 직접 연동해
// 다른 메뉴로 이동했다 돌아와도 목록이 유지되도록 한다.
export default function TaskView({ user, tasks, subView, setSubView, onRefresh }: any) {
  const [newTask, setNewTask] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [taskList, setTaskList] = useState<any[]>(tasks || []);
  const [loading, setLoading] = useState(false);

  const fetchMyTasks = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('assignee_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setTaskList(data || []);
    } catch (e) {
      console.error('업무 목록 로딩 실패:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyTasks();
  }, [user?.id]);

  const handleAddTask = async () => {
    if (!newTask.trim() || !user?.id) return;
    try {
      const { data, error } = await supabase
        .from('tasks')
        .insert([{
          assignee_id: user.id,
          title: newTask.trim(),
          status: 'pending',
          priority: newPriority,
        }])
        .select()
        .single();
      if (error) throw error;
      setNewTask('');
      setTaskList(prev => [data, ...prev]);
      if (onRefresh) onRefresh();
    } catch (e) {
      console.error('업무 등록 실패:', e);
      alert('업무 등록 중 오류가 발생했습니다.');
    }
  };

  const toggleStatus = async (task: any) => {
    const newStatus = task.status === 'pending' ? 'completed' : 'pending';
    setTaskList(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
    if (error) {
      console.error('업무 상태 변경 실패:', error);
      fetchMyTasks(); // DB에서 다시 불러와 UI 복구
    }
  };

  const filteredTasks = useMemo(
    () =>
      (taskList || []).filter((t: any) => {
        if (subView === '완료') return t.status === 'completed';
        if (subView === '진행중') return t.status === 'pending';
        return true;
      }),
    [taskList, subView]
  );

  return (
    <div className="flex-1 flex flex-col bg-[var(--page-bg)] h-full relative">
      <header className="px-10 py-8 flex justify-between items-center bg-[var(--toss-card)] border-b border-[var(--toss-border)] shrink-0">
        <h1 className="text-2xl font-semibold text-[var(--foreground)]">나의 업무</h1>
        <div className="flex gap-2">
          {['전체', '진행중', '완료'].map((menu) => (
            <button
              key={menu}
              onClick={() => setSubView(menu)}
              className={`px-5 py-2 rounded-[12px] text-xs font-bold transition-all ${
                subView === menu ? 'bg-[var(--foreground)] text-white shadow-lg' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]'
              }`}
            >
              {menu}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-6">
        <div className="bg-[var(--toss-card)] p-4 rounded-[16px] shadow-sm border border-[var(--toss-border)] flex items-center gap-4">
          <input
            value={newTask}
            onChange={(e) => setNewTask(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            className="flex-1 bg-transparent p-2 outline-none text-sm font-bold"
            placeholder="+ 새로운 업무를 입력하세요"
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            className="px-3 py-2 rounded-[16px] border border-[var(--toss-border)] text-xs font-bold"
          >
            <option value="low">낮음</option>
            <option value="medium">보통</option>
            <option value="high">높음</option>
            <option value="urgent">긴급</option>
          </select>
          <button
            onClick={handleAddTask}
            className="w-10 h-10 bg-[var(--toss-blue)] text-white rounded-full font-bold shadow-md hover:scale-105 transition-transform"
          >
            +
          </button>
        </div>

        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-20 text-[var(--toss-gray-3)] text-xs">업무를 불러오는 중입니다...</div>
          ) : filteredTasks.length === 0 ? (
            <div className="text-center py-20 text-[var(--toss-gray-3)] text-xs">업무 내역이 없습니다.</div>
          ) : (
            filteredTasks.map((t: any) => {
              const pr = PRIORITY_LABELS[t.priority || 'medium'] || PRIORITY_LABELS.medium;
              return (
                <div
                  key={t.id}
                  className={`p-6 rounded-[16px] border flex items-center justify-between transition-all ${
                    t.status === 'completed'
                      ? 'bg-[var(--toss-gray-1)] border-[var(--toss-border)] opacity-60'
                      : 'bg-[var(--toss-card)] border-[var(--toss-border)] shadow-sm hover:border-[var(--toss-blue)]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => toggleStatus(t)}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                        t.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-[var(--toss-border)]'
                      }`}
                    >
                      {t.status === 'completed' && <span className="text-white text-xs">✓</span>}
                    </button>
                    <div className="flex flex-col gap-1">
                      <span
                        className={`text-sm font-bold ${
                          t.status === 'completed' ? 'line-through text-[var(--toss-gray-3)]' : 'text-[var(--foreground)]'
                        }`}
                      >
                        {t.title}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${pr.color}`}>
                        {pr.label}
                      </span>
                    </div>
                  </div>
                  <span className="text-[11px] text-[var(--toss-gray-3)]">
                    {new Date(t.created_at).toLocaleDateString()}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
}