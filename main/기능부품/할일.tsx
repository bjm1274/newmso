'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function TaskView({ user, tasks, subView, setSubView, onRefresh }: any) {
  const [newTask, setNewTask] = useState('');

  // 할 일 추가
  const handleAddTask = async () => {
    if (!newTask.trim()) return;
    const { error } = await supabase.from('tasks').insert([{
      assignee_id: user.id,
      title: newTask,
      status: 'pending'
    }]);
    if (!error) {
      setNewTask('');
      onRefresh();
    }
  };

  // 상태 변경 (완료 처리)
  const toggleStatus = async (task: any) => {
    const newStatus = task.status === 'pending' ? 'completed' : 'pending';
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
    onRefresh();
  };

  // 필터링 (전체 / 진행중 / 완료)
  const filteredTasks = tasks.filter((t: any) => {
    if (subView === '완료') return t.status === 'completed';
    if (subView === '진행중') return t.status === 'pending';
    return true; // 전체
  });

  return (
    <div className="flex-1 flex flex-col bg-[#FDFDFD] h-full relative">
      {/* 상단 헤더 */}
      <header className="px-10 py-8 flex justify-between items-center bg-white border-b border-gray-50 shrink-0">
        <h1 className="text-2xl font-black text-gray-800">나의 업무</h1>
        <div className="flex gap-2">
          {['전체', '진행중', '완료'].map(menu => (
            <button key={menu} onClick={() => setSubView(menu)} 
              className={`px-5 py-2 rounded-2xl text-xs font-bold transition-all ${subView === menu ? 'bg-black text-white shadow-lg' : 'bg-gray-50 text-gray-400'}`}>
              {menu}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-6">
        {/* 업무 입력창 */}
        <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100 flex items-center gap-4">
          <input value={newTask} onChange={(e) => setNewTask(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            className="flex-1 bg-transparent p-2 outline-none text-sm font-bold" placeholder="+ 새로운 업무를 입력하세요" />
          <button onClick={handleAddTask} className="w-10 h-10 bg-blue-600 text-white rounded-full font-bold shadow-md hover:scale-105 transition-transform">+</button>
        </div>

        {/* 업무 리스트 */}
        <div className="space-y-3">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-20 text-gray-300 text-xs">업무 내역이 없습니다.</div>
          ) : (
            filteredTasks.map((t: any) => (
              <div key={t.id} className={`p-6 rounded-[2rem] border flex items-center justify-between transition-all ${t.status === 'completed' ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-100 shadow-sm hover:border-blue-200'}`}>
                <div className="flex items-center gap-4">
                  <button onClick={() => toggleStatus(t)} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${t.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-gray-300'}`}>
                    {t.status === 'completed' && <span className="text-white text-xs">✓</span>}
                  </button>
                  <span className={`text-sm font-bold ${t.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.title}</span>
                </div>
                <span className="text-[10px] text-gray-300">{new Date(t.created_at).toLocaleDateString()}</span>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}