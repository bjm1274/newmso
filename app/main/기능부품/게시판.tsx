'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

const CHAT_ROOM_KEY = 'erp_chat_last_room';
const CHAT_FOCUS_KEY = 'erp_chat_focus_keyword';

export default function BoardView({ user, setMainMenu }: any) {
  const [activeBoard, setActiveBoard] = useState('공지사항');
  const [posts, setPosts] = useState<any[]>([]);
  const [showNewPost, setShowNewPost] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduleRoom, setScheduleRoom] = useState('');
  const [schedulePatient, setSchedulePatient] = useState('');
  const [scheduleFasting, setScheduleFasting] = useState(false);
  const [scheduleInpatient, setScheduleInpatient] = useState(false);
  const [scheduleGuardian, setScheduleGuardian] = useState(false);
  const [scheduleCaregiver, setScheduleCaregiver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState('');

  // 수술/검사명 프리셋 (Supabase surgery_templates / mri_templates)
  const [surgeryTemplates, setSurgeryTemplates] = useState<any[]>([]);
  const [mriTemplates, setMriTemplates] = useState<any[]>([]);

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

  // 수술·MRI 템플릿 불러오기
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        const [{ data: s }, { data: m }] = await Promise.all([
          supabase.from('surgery_templates').select('*').order('sort_order', { ascending: true }),
          supabase.from('mri_templates').select('*').order('sort_order', { ascending: true }),
        ]);
        setSurgeryTemplates(s || []);
        setMriTemplates(m || []);
      } catch {
        // 템플릿 테이블이 없거나 실패해도 치명적이지 않으므로 무시
      }
    };
    loadTemplates();
  }, []);

  const currentTemplates = useMemo(
    () =>
      activeBoard === '수술일정'
        ? surgeryTemplates
        : activeBoard === 'MRI일정'
        ? mriTemplates
        : [],
    [activeBoard, surgeryTemplates, mriTemplates]
  );

  useEffect(() => {
    fetchPosts();
  }, [activeBoard]);

  useEffect(() => {
    const channel = supabase
      .channel('board-posts-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'board_posts' }, () => {
        fetchPosts();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeBoard]);

  const fetchComments = async (postId: string) => {
    const { data } = await supabase
      .from('board_post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    setComments((prev) => ({ ...prev, [postId]: data || [] }));
  };

  // 수술·MRI 일정 카드 → 관련 채팅방 열기
  const openChatForSchedule = async (post: any) => {
    if (!user?.id) {
      alert('직원 계정으로 로그인한 경우에만 채팅을 사용할 수 있습니다.');
      return;
    }
    const baseName = post.patient_name || post.title || '수술/검사 일정';
    const kindLabel = activeBoard === '수술일정' ? '수술' : '검사';
    const roomName = `[${kindLabel}] ${baseName}`;
    try {
      const { data: existing } = await supabase
        .from('chat_rooms')
        .select('*')
        .eq('name', roomName)
        .maybeSingle();
      let roomId = existing?.id;
      if (!roomId) {
        const { data: created, error } = await supabase
          .from('chat_rooms')
          .insert([
            {
              name: roomName,
              type: 'group',
              members: [user.id],
            },
          ])
          .select()
          .single();
        if (error || !created) {
          alert('관련 채팅방 생성 중 오류가 발생했습니다.');
          return;
        }
        roomId = created.id;
      }
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(CHAT_ROOM_KEY, roomId);
        if (post.patient_name) {
          window.localStorage.setItem(CHAT_FOCUS_KEY, post.patient_name);
        }
      }
      setMainMenu?.('채팅');
    } catch (e) {
      console.error('openChatForSchedule error', e);
      alert('관련 채팅방을 여는 중 오류가 발생했습니다.');
    }
  };

  const handleLike = async (post: any) => {
    const postId = post.id;
    const likes = (post.likes_count ?? 0) + 1;
    await supabase.from('board_posts').update({ likes_count: likes }).eq('id', postId);
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, likes_count: likes } : p)));
  };

  const handleAddComment = async (postId: string) => {
    if (!newComment.trim() || !user?.id) return;
    const { data } = await supabase
      .from('board_post_comments')
      .insert([{ post_id: postId, author_id: user.id, author_name: user.name, content: newComment.trim() }])
      .select()
      .single();
    if (data) {
      setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] || []), data] }));
      setNewComment('');
    }
  };

  const handleExpandPost = (postId: string) => {
    setExpandedPostId((prev) => (prev === postId ? null : postId));
    if (expandedPostId !== postId) fetchComments(postId);
  };

  const handleNewPost = async () => {
    if (!title) return alert('제목을 입력해주세요.');
    if (activeBoard === '수술일정' || activeBoard === 'MRI일정') {
      if (!scheduleDate || !scheduleTime || !scheduleRoom) return alert('필수 정보를 입력해주세요.');
    } else if (!content) {
      return alert('내용을 입력해주세요.');
    }

    setLoading(true);
    try {
      const tags = tagsInput ? tagsInput.split(',').map((t) => t.trim()).filter(Boolean) : [];
      const postData: any = {
        board_type: activeBoard,
        title: title,
        content: content || null,
        tags: tags,
        schedule_date: scheduleDate || null,
        schedule_time: scheduleTime || null,
        schedule_room: scheduleRoom || null,
        patient_name: schedulePatient || null,
        author_name: user?.name || '익명',
        author_id: user?.id,
        likes_count: 0,
        created_at: new Date().toISOString(),
      };

      // 수술일정의 경우 수술 관련 체크값을 함께 저장
      if (activeBoard === '수술일정') {
        postData.surgery_fasting = scheduleFasting;
        postData.surgery_inpatient = scheduleInpatient;
        postData.surgery_guardian = scheduleGuardian;
        postData.surgery_caregiver = scheduleCaregiver;
      }

      const { error } = await supabase.from('board_posts').insert([postData]);
      if (!error) {
        alert('게시물이 등록되었습니다.');
        setTitle('');
        setContent('');
        setScheduleDate('');
        setScheduleTime('');
        setScheduleRoom('');
        setSchedulePatient('');
        setScheduleFasting(false);
        setScheduleInpatient(false);
        setScheduleGuardian(false);
        setScheduleCaregiver(false);
        setTagsInput('');
        setShowNewPost(false);
        fetchPosts();
      } else {
        alert(`게시물 등록에 실패했습니다.\n\n${error.message || ''}`);
      }
    } catch (error: any) {
      console.error('게시물 등록 실패:', error);
      const msg = typeof error?.message === 'string' ? error.message : '';
      alert(`게시물 등록에 실패했습니다.\n\n${msg}`);
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
              <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">
                {activeBoard === '수술일정' ? '수술명' : activeBoard === 'MRI일정' ? '검사명' : '제목'}
              </label>
              {(activeBoard === '수술일정' || activeBoard === 'MRI일정') ? (
                <div className="space-y-2">
                  <select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setTitle(v);
                    }}
                    className="w-full p-3 bg-gray-50 rounded-xl border border-gray-200 outline-none text-xs font-bold focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">
                      {activeBoard === '수술일정'
                        ? '자주 쓰는 수술명 선택'
                        : '자주 쓰는 검사명 선택'}
                    </option>
                    {currentTemplates.map((t: any) => (
                      <option key={t.id} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={
                      activeBoard === '수술일정'
                        ? '수술명을 입력하거나 위에서 선택하세요.'
                        : '검사명을 입력하거나 위에서 선택하세요.'
                    }
                    className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              ) : (
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="게시물 제목을 입력하세요."
                  className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100"
                />
              )}
            </div>

            {(activeBoard === '수술일정' || activeBoard === 'MRI일정') ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">날짜 (YYYYMMDD)</label>
                    <input
                      type="text"
                      value={scheduleDate}
                      onChange={e => {
                        let v = e.target.value;
                        // 숫자 8자리만 허용 (YYYYMMDD)
                        v = v.replace(/[^0-9]/g, '').slice(0, 8);
                        setScheduleDate(v);
                      }}
                      className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">시간</label>
                    <input
                      type="time"
                      step={1800}
                      value={scheduleTime}
                      onChange={e => {
                        const raw = e.target.value;
                        if (!raw) {
                          setScheduleTime('');
                          return;
                        }
                        const [hh, mm] = raw.split(':').map((v) => parseInt(v, 10));
                        if (isNaN(hh) || isNaN(mm)) {
                          setScheduleTime(raw);
                          return;
                        }
                        let h = hh;
                        let m = mm;
                        if (m < 15) m = 0;
                        else if (m < 45) m = 30;
                        else {
                          m = 0;
                          h = (h + 1) % 24;
                        }
                        const fixed = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
                        setScheduleTime(fixed);
                      }}
                      className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100"
                    />
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
                {activeBoard === '수술일정' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-1 block">
                      수술 관련 체크
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-gray-700">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleFasting}
                          onChange={(e) => setScheduleFasting(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span>금식 필요</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleInpatient}
                          onChange={(e) => setScheduleInpatient(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                          <span>입원 예정</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleGuardian}
                          onChange={(e) => setScheduleGuardian(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span>보호자 동반</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleCaregiver}
                          onChange={(e) => setScheduleCaregiver(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span>간병인 배치</span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div>
                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">태그 (쉼표로 구분)</label>
                  <input
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="예: 공지, 회의, 환영"
                    className="w-full p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold focus:ring-2 focus:ring-blue-100 mb-4"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-600 uppercase tracking-widest mb-2 block">내용</label>
                  <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="게시물 내용을 입력하세요."
                  className="w-full h-32 md:h-48 p-4 bg-gray-50 rounded-xl border-none outline-none text-sm font-bold leading-relaxed focus:ring-2 focus:ring-blue-100 resize-none"
                />
                </div>
              </>
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
              className="bg-white p-6 border border-gray-100 shadow-sm rounded-[1.5rem] md:rounded-[2rem] hover:border-blue-300 hover:shadow-xl hover:shadow-blue-50/50 transition-all group flex flex-col justify-between"
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
                  {activeBoard === '수술일정' && (
                    <div className="pt-2 flex flex-wrap gap-1">
                      {post.surgery_fasting && (
                        <span className="px-2 py-1 rounded-full bg-red-50 text-red-600 text-[9px] font-black">
                          금식
                        </span>
                      )}
                      {post.surgery_inpatient && (
                        <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-600 text-[9px] font-black">
                          입원
                        </span>
                      )}
                      {post.surgery_guardian && (
                        <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black">
                          보호자 동반
                        </span>
                      )}
                      {post.surgery_caregiver && (
                        <span className="px-2 py-1 rounded-full bg-purple-50 text-purple-600 text-[9px] font-black">
                          간병인
                        </span>
                      )}
                    </div>
                  )}
                  <div className="pt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => openChatForSchedule(post)}
                      className="px-3 py-2 rounded-xl text-[10px] font-black bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                    >
                      💬 이 일정 관련 채팅 열기
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="flex-1">
                    <h3 className="font-black text-gray-800 text-base md:text-lg group-hover:text-blue-600 transition-colors line-clamp-1">{post.title}</h3>
                    <p className="text-xs md:text-sm text-gray-500 mt-3 line-clamp-3 leading-relaxed">{post.content}</p>
                  </div>
                  <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-50">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <div className="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center text-[10px]">👤</div>
                        <span className="text-[10px] font-bold text-gray-400">{post.author_name}</span>
                      </div>
                      <button onClick={() => handleLike(post)} className="flex items-center gap-1 text-gray-500 hover:text-red-500 text-[10px] font-bold">
                        👍 {post.likes_count ?? 0}
                      </button>
                      <button onClick={() => handleExpandPost(post.id)} className="flex items-center gap-1 text-gray-500 hover:text-blue-500 text-[10px] font-bold">
                        💬 댓글
                      </button>
                    </div>
                    <span className="text-[10px] font-bold text-gray-300">
                      {new Date(post.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {(Array.isArray(post.tags) ? post.tags : []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {(Array.isArray(post.tags) ? post.tags : []).map((tag: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-bold">{tag}</span>
                      ))}
                    </div>
                  )}
                  {expandedPostId === post.id && (
                    <div className="mt-4 pt-4 border-t border-gray-100 space-y-2">
                      {(comments[post.id] || []).map((c: any) => (
                        <div key={c.id} className="text-xs text-gray-600 flex gap-2">
                          <span className="font-bold">{c.author_name}:</span>
                          <span>{c.content}</span>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <input value={expandedPostId === post.id ? newComment : ''} onChange={(e) => setNewComment(e.target.value)} placeholder="댓글 입력" className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs" />
                        <button onClick={() => handleAddComment(post.id)} className="px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold">등록</button>
                      </div>
                    </div>
                  )}
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
