'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function BoardView({ user }: any) {
  const [activeBoard, setActiveBoard] = useState('공지사항');
  const [posts, setPosts] = useState<any[]>([]);
  const [showNewPost, setShowNewPost] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleRoom, setScheduleRoom] = useState('');
  const [schedulePatient, setSchedulePatient] = useState('');
  const [loading, setLoading] = useState(false);

  const boards = [
    { id: '공지사항', label: '📢 공지사항', icon: '📢' },
    { id: '자유게시판', label: '💬 자유게시판', icon: '💬' },
    { id: '수술일정', label: '🏥 수술일정표', icon: '🏥' },
    { id: 'MRI일정', label: '🔬 MRI일정표', icon: '🔬' }
  ];

  const fetchPosts = async () => {
    const { data } = await supabase.from('board_posts').select('*').eq('board_type', activeBoard).order('created_at', { ascending: false });
    if (data) setPosts(data as any);
  };

  useEffect(() => {
    fetchPosts();
  }, [activeBoard]);

  const handleNewPost = async () => {
    if (!title) return alert('제목을 입력해주세요.');
    if (activeBoard === '수술일정' || activeBoard === 'MRI일정') {
      if (!scheduleDate || !scheduleTime || !scheduleRoom) return alert('필수 정보를 입력해주세요.');
    } else if (!content) {
      return alert('내용을 입력해주세요.');
    }

    setLoading(true);
    try {
      const postData = {
        board_type: activeBoard,
        title: title,
        content: content || null,
        schedule_date: scheduleDate || null,
        schedule_time: scheduleTime || null,
        schedule_room: scheduleRoom || null,
        patient_name: schedulePatient || null,
        author_name: user?.name || '익명',
        created_at: new Date().toISOString()
      };

      const { error } = await supabase.from('board_posts').insert([postData]);
      if (!error) {
        alert('게시물이 등록되었습니다.');
        setTitle('');
        setContent('');
        setScheduleDate('');
        setScheduleTime('');
        setScheduleRoom('');
        setSchedulePatient('');
        setShowNewPost(false);
        fetchPosts();
      }
    } catch (error) {
      console.error('게시물 등록 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 md:space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-800 tracking-tighter italic">게시판</h2>
          <p className="text-[10px] md:text-xs text-gray-400 font-bold uppercase mt-1">병원 공지 및 일정 관리</p>
        </div>
        
        {(activeBoard === '공지사항' || activeBoard === '자유게시판' || activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
          <button
            onClick={() => setShowNewPost(!showNewPost)}
            className="px-4 md:px-6 py-2.5 md:py-3 bg-black text-white rounded-xl text-[11px] md:text-xs font-black shadow-lg hover:scale-[0.98] transition-all"
          >
            {showNewPost ? '✕ 취소' : '+ 새 게시물'}
          </button>
        )}
      </header>

      {/* 게시판 탭 - 모바일 가로 스크롤 */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar bg-white p-2 md:p-4 rounded-2xl border border-gray-100 shadow-sm shrink-0">
        {boards.map(board => (
          <button
            key={board.id}
            onClick={() => setActiveBoard(board.id)}
            className={`flex-1 min-w-[100px] md:min-w-0 px-4 md:px-6 py-2.5 md:py-3 rounded-xl text-[11px] md:text-xs font-black transition-all whitespace-nowrap ${
              activeBoard === board.id
                ? 'bg-blue-600 text-white shadow-lg'
                : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
            }`}
          >
            {board.label}
          </button>
        ))}
      </div>

      {/* 새 게시물 작성 폼 */}
      {showNewPost && (
        <div className="bg-white p-6 md:p-8 border border-gray-100 shadow-xl rounded-[2rem] space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <h3 className="text-lg font-black text-gray-800">새 게시물 작성</h3>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">제목</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="게시물 제목을 입력하세요."
                className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {(activeBoard === '수술일정' || activeBoard === 'MRI일정') ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">날짜</label>
                    <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">시간</label>
                    <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">수술실/검사실</label>
                    <input value={scheduleRoom} onChange={e => setScheduleRoom(e.target.value)} placeholder="예: 수술실 1" className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">환자명</label>
                    <input value={schedulePatient} onChange={e => setSchedulePatient(e.target.value)} placeholder="환자명 입력" className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100" />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">내용</label>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="게시물 내용을 입력하세요."
                  className="w-full h-32 md:h-48 p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold leading-relaxed focus:ring-2 focus:ring-blue-100 resize-none"
                />
              </div>
            )}
          </div>

          <button
            onClick={handleNewPost}
            disabled={loading}
            className="w-full py-4 bg-blue-600 text-white rounded-xl font-black text-sm shadow-lg hover:scale-[0.98] transition-all disabled:opacity-50"
          >
            {loading ? '등록 중...' : '게시물 등록'}
          </button>
        </div>
      )}

      {/* 게시물 목록 - 반응형 그리드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.length > 0 ? (
          posts.map((post, idx) => (
            <div
              key={post.id || idx}
              className="bg-white p-6 border border-gray-100 shadow-sm rounded-[1.5rem] md:rounded-[2rem] hover:border-blue-300 hover:shadow-xl hover:shadow-blue-50/50 transition-all group cursor-pointer flex flex-col justify-between"
            >
              {(activeBoard === '수술일정' || activeBoard === 'MRI일정') ? (
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-black text-gray-800 text-base md:text-lg line-clamp-1">{post.title}</h3>
                      <p className="text-[11px] text-blue-600 font-black mt-1 uppercase tracking-widest">{post.patient_name || '환자명 미지정'}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-[8px] font-black shrink-0 ${
                      activeBoard === '수술일정' ? 'bg-red-100 text-red-600' : 'bg-purple-100 text-purple-600'
                    }`}>
                      {activeBoard === '수술일정' ? '🏥 수술' : '🔬 MRI'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-4 border-t border-gray-50">
                    <div>
                      <p className="text-[8px] font-bold text-gray-400 uppercase">날짜</p>
                      <p className="text-[11px] font-black text-gray-800">{post.schedule_date}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-bold text-gray-400 uppercase">시간</p>
                      <p className="text-[11px] font-black text-gray-800">{post.schedule_time}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-bold text-gray-400 uppercase">위치</p>
                      <p className="text-[11px] font-black text-gray-800 line-clamp-1">{post.schedule_room}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="flex-1">
                    <h3 className="font-black text-gray-800 text-base md:text-lg group-hover:text-blue-600 transition-colors line-clamp-1">{post.title}</h3>
                    <p className="text-xs md:text-sm text-gray-500 mt-3 line-clamp-3 leading-relaxed">{post.content}</p>
                  </div>
                  <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-50">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px]">👤</div>
                      <span className="text-[10px] font-bold text-gray-400">{post.author_name}</span>
                    </div>
                    <span className="text-[10px] font-bold text-gray-300">
                      {new Date(post.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="col-span-full text-center py-20 text-gray-300">
            <p className="font-black text-sm italic">게시물이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
