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
  const [schedulePeriod, setSchedulePeriod] = useState('');
  const [scheduleHour, setScheduleHour] = useState('');
  const [scheduleMinute, setScheduleMinute] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<Record<string, any[]>>({});
  const [newComment, setNewComment] = useState('');

  // 수술/검사명 프리셋 (Supabase surgery_templates / mri_templates)
  const [surgeryTemplates, setSurgeryTemplates] = useState<any[]>([]);
  const [mriTemplates, setMriTemplates] = useState<any[]>([]);

  // 수술일정·MRI일정 달력 뷰용 현재 월
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());

  const boards = [
    { id: '공지사항', label: '📢 공지사항', icon: '📢' },
    { id: '자유게시판', label: '💬 자유게시판', icon: '💬' },
    { id: '수술일정', label: '🏥 수술일정표', icon: '🏥' },
    { id: 'MRI일정', label: '🔬 MRI일정표', icon: '🔬' }
  ];

  // 오전/오후 + 시/분 드롭다운 값을 HH:MM 문자열로 변환
  const updateScheduleTime = (period: string, hour: string, minute: string) => {
    if (!period || !hour || !minute) {
      setScheduleTime('');
      return;
    }
    const hNum = parseInt(hour, 10);
    if (Number.isNaN(hNum)) {
      setScheduleTime('');
      return;
    }
    let h24 = hNum;
    if (period === '오전') {
      if (h24 === 12) h24 = 0;
    } else if (period === '오후') {
      if (h24 !== 12) h24 = h24 + 12;
    }
    const hh = String(h24).padStart(2, '0');
    const mm = minute.padStart(2, '0');
    setScheduleTime(`${hh}:${mm}`);
  };

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
    // 다른 게시판에서 다시 수술/MRI 일정으로 돌아올 때는 현재 월 기준으로 달력 리셋
    if (activeBoard === '수술일정' || activeBoard === 'MRI일정') {
      setCalendarMonth(new Date());
    }
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

      // 수술/검사 일정의 경우 수술 관련 체크값을 함께 저장
      if (activeBoard === '수술일정' || activeBoard === 'MRI일정') {
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
        setSchedulePeriod('');
        setScheduleHour('');
        setScheduleMinute('');
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
        const hint = (activeBoard === '수술일정' || activeBoard === 'MRI일정') && (error.message?.includes('column') || error.code === '42703')
          ? '\n\n수술일정/MRI일정용 컬럼이 없을 수 있습니다. Supabase에 board_posts_schedule_columns.sql 마이그레이션을 적용해 주세요.'
          : '';
        alert(`게시물 등록에 실패했습니다.\n\n${error.message || ''}${hint}`);
      }
    } catch (error: any) {
      console.error('게시물 등록 실패:', error);
      const msg = typeof error?.message === 'string' ? error.message : '';
      const hint = (activeBoard === '수술일정' || activeBoard === 'MRI일정') && (msg.includes('column') || error?.code === '42703')
        ? '\n\n수술일정/MRI일정용 컬럼이 없을 수 있습니다. Supabase에 board_posts_schedule_columns.sql 마이그레이션을 적용해 주세요.'
        : '';
      alert(`게시물 등록에 실패했습니다.\n\n${msg}${hint}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC] overflow-y-auto custom-scrollbar p-4 md:p-8 space-y-6 md:space-y-8">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-[#191F28] tracking-tight">게시판</h2>
          <p className="text-[10px] md:text-xs text-[#8B95A1] font-bold uppercase mt-1">병원 공지 및 일정 관리</p>
        </div>
        
        {(activeBoard === '공지사항' || activeBoard === '자유게시판' || activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
          <button
            onClick={() => setShowNewPost(!showNewPost)}
            className="px-4 md:px-6 py-2.5 md:py-3 bg-[#191F28] text-white rounded-[12px] text-[11px] md:text-xs font-bold shadow-sm hover:opacity-95 active:scale-[0.98] transition-all"
          >
            {showNewPost ? '✕ 취소' : '+ 새 게시물'}
          </button>
        )}
      </header>

      {/* 게시판 탭 - 모바일 가로 스크롤 */}
      <div className="flex gap-2 overflow-x-auto no-scrollbar bg-white p-2 md:p-4 rounded-[16px] border border-[#E5E8EB] shadow-sm shrink-0">
        {boards.map(board => (
          <button
            key={board.id}
            onClick={() => setActiveBoard(board.id)}
            className={`flex-1 min-w-[100px] md:min-w-0 px-4 md:px-6 py-2.5 md:py-3 rounded-[12px] text-[11px] md:text-xs font-bold transition-all whitespace-nowrap ${
              activeBoard === board.id
                ? 'bg-[#3182F6] text-white shadow-sm'
                : 'bg-[#F2F4F6] text-[#8B95A1] hover:bg-[#E5E8EB]'
            }`}
          >
            {board.label}
          </button>
        ))}
      </div>

      {/* 새 게시물 작성 폼 */}
      {showNewPost && (
        <div className="bg-white p-6 md:p-8 border border-[#E5E8EB] shadow-sm rounded-[16px] space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
          <h3 className="text-lg font-bold text-[#191F28]">새 게시물 작성</h3>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-black text-[#4E5968] uppercase tracking-widest mb-2 block">
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
                    className="w-full p-3 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] border-[#E5E8EB] outline-none text-xs font-bold focus:ring-2 focus:ring-[#3182F6]/20"
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
                    className="w-full p-4 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[#3182F6]/20"
                  />
                </div>
              ) : (
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="게시물 제목을 입력하세요."
                  className="w-full p-4 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[#3182F6]/20"
                />
              )}
            </div>

            {(activeBoard === '수술일정' || activeBoard === 'MRI일정') ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-[#4E5968] uppercase tracking-widest mb-2 block">날짜 (YYYY-MM-DD)</label>
                    <input
                      type="text"
                      value={scheduleDate}
                      onChange={e => {
                        // 숫자만 추출 후 YYYY-MM-DD 형태로 자동 포맷팅
                        const digits = e.target.value.replace(/[^0-9]/g, '').slice(0, 8);
                        let formatted = '';
                        if (digits.length <= 4) {
                          formatted = digits;
                        } else if (digits.length <= 6) {
                          formatted = `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
                        } else {
                          formatted = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
                        }
                        setScheduleDate(formatted);
                      }}
                      className="w-full p-4 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[#3182F6]/20"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-[#4E5968] uppercase tracking-widest mb-2 block">시간</label>
                    <div className="grid grid-cols-3 gap-2">
                      <select
                        value={schedulePeriod}
                        onChange={(e) => {
                          const v = e.target.value;
                          setSchedulePeriod(v);
                          updateScheduleTime(v, scheduleHour, scheduleMinute);
                        }}
                        className="w-full p-3 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] border-[#E5E8EB] outline-none text-xs font-bold focus:ring-2 focus:ring-[#3182F6]/20"
                      >
                        <option value="">오전/오후</option>
                        <option value="오전">오전</option>
                        <option value="오후">오후</option>
                      </select>
                      <select
                        value={scheduleHour}
                        onChange={(e) => {
                          const v = e.target.value;
                          setScheduleHour(v);
                          updateScheduleTime(schedulePeriod, v, scheduleMinute);
                        }}
                        className="w-full p-3 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] border-[#E5E8EB] outline-none text-xs font-bold focus:ring-2 focus:ring-[#3182F6]/20"
                      >
                        <option value="">시간</option>
                        {Array.from({ length: 12 }).map((_, idx) => {
                          const h = idx + 1;
                          const v = String(h).padStart(2, '0');
                          return (
                            <option key={v} value={v}>{v}시</option>
                          );
                        })}
                      </select>
                      <select
                        value={scheduleMinute}
                        onChange={(e) => {
                          const v = e.target.value;
                          setScheduleMinute(v);
                          updateScheduleTime(schedulePeriod, scheduleHour, v);
                        }}
                        className="w-full p-3 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] border-[#E5E8EB] outline-none text-xs font-bold focus:ring-2 focus:ring-[#3182F6]/20"
                      >
                        <option value="">분</option>
                        <option value="00">00분</option>
                        <option value="30">30분</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-[#4E5968] uppercase tracking-widest mb-2 block">수술실/검사실</label>
                    <input value={scheduleRoom} onChange={e => setScheduleRoom(e.target.value)} placeholder="예: 수술실 1" className="w-full p-4 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[#3182F6]/20" />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-[#4E5968] uppercase tracking-widest mb-2 block">환자명</label>
                    <input value={schedulePatient} onChange={e => setSchedulePatient(e.target.value)} placeholder="환자명 입력" className="w-full p-4 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[#3182F6]/20" />
                  </div>
                </div>
                {(activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-[#4E5968] uppercase tracking-widest mb-1 block">
                      {activeBoard === '수술일정' ? '수술 관련 체크' : '촬영 관련 체크'}
                    </label>
                    <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-[#4E5968]">
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleFasting}
                          onChange={(e) => setScheduleFasting(e.target.checked)}
                          className="w-4 h-4 rounded border-[#E5E8EB]"
                        />
                        <span>금식 필요</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleInpatient}
                          onChange={(e) => setScheduleInpatient(e.target.checked)}
                          className="w-4 h-4 rounded border-[#E5E8EB]"
                        />
                          <span>입원 예정</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleGuardian}
                          onChange={(e) => setScheduleGuardian(e.target.checked)}
                          className="w-4 h-4 rounded border-[#E5E8EB]"
                        />
                        <span>보호자 동반</span>
                      </label>
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleCaregiver}
                          onChange={(e) => setScheduleCaregiver(e.target.checked)}
                          className="w-4 h-4 rounded border-[#E5E8EB]"
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
                  <label className="text-[10px] font-black text-[#4E5968] uppercase tracking-widest mb-2 block">태그 (쉼표로 구분)</label>
                  <input
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="예: 공지, 회의, 환영"
                    className="w-full p-4 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] border-none outline-none text-sm font-bold focus:ring-2 focus:ring-[#3182F6]/20 mb-4"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-[#4E5968] uppercase tracking-widest mb-2 block">내용</label>
                  <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="게시물 내용을 입력하세요."
                  className="w-full h-32 md:h-48 p-4 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] border-none outline-none text-sm font-bold leading-relaxed focus:ring-2 focus:ring-[#3182F6]/20 resize-none"
                />
                </div>
              </>
            )}
          </div>

          <button
            onClick={handleNewPost}
            disabled={loading}
            className="w-full py-4 bg-[#3182F6] text-white rounded-[12px] font-bold text-sm shadow-sm hover:opacity-95 active:scale-[0.99] transition-all disabled:opacity-50"
          >
            {loading ? '등록 중...' : '게시물 등록'}
          </button>
        </div>
      )}

      {/* 수술일정·MRI일정용 달력 뷰 */}
      {(activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
        <div className="bg-white border border-[#E5E8EB] rounded-[16px] shadow-sm p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-[#8B95A1] uppercase tracking-widest">
                {activeBoard === '수술일정' ? '수술 일정 캘린더' : 'MRI 일정 캘린더'}
              </p>
              <h3 className="text-lg md:text-xl font-black text-[#191F28] mt-1">
                {calendarMonth.getFullYear()}년 {calendarMonth.getMonth() + 1}월
              </h3>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1)
                  )
                }
                className="px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                ← 이전달
              </button>
              <button
                type="button"
                onClick={() => setCalendarMonth(new Date())}
                className="px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                오늘
              </button>
              <button
                type="button"
                onClick={() =>
                  setCalendarMonth(
                    new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1)
                  )
                }
                className="px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                다음달 →
              </button>
            </div>
          </div>

          {posts.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#8B95A1] font-bold">
              등록된 일정이 없습니다.
            </div>
          ) : (
            (() => {
              // 날짜별 일정 매핑 (YYYY-MM-DD → 배열)
              const eventsByDate: Record<string, any[]> = {};
              (posts || []).forEach((p: any) => {
                const d = p.schedule_date;
                if (!d) return;
                eventsByDate[d] = eventsByDate[d] ? [...eventsByDate[d], p] : [p];
              });

              const year = calendarMonth.getFullYear();
              const month = calendarMonth.getMonth();
              const firstOfMonth = new Date(year, month, 1);
              const startDay = firstOfMonth.getDay(); // 0:일 ~ 6:토
              const startDate = new Date(year, month, 1 - startDay);
              const days: Date[] = [];
              for (let i = 0; i < 42; i += 1) {
                days.push(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i));
              }

              const toKey = (d: Date) =>
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
                  d.getDate(),
                  )
                  .padStart(2, '0')}`;

              return (
                <div className="border border-[#E5E8EB] rounded-[16px] overflow-hidden">
                  <div className="grid grid-cols-7 bg-[#F2F4F6] text-[10px] font-black text-[#8B95A1]">
                    {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                      <div key={d} className="px-2 py-2 text-center">
                        {d}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 bg-white text-[11px]">
                    {days.map((d, idx) => {
                      const key = toKey(d);
                      const inMonth = d.getMonth() === month;
                      const events = eventsByDate[key] || [];
                      return (
                        <div
                          key={key + idx}
                          className={`min-h-[80px] border border-[#F1F3F5] p-1.5 align-top ${
                            inMonth ? 'bg-white' : 'bg-[#F9FAFB]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span
                              className={`text-[10px] font-black ${
                                !inMonth ? 'text-gray-300' : d.getDay() === 0
                                ? 'text-red-500'
                                : d.getDay() === 6
                                  ? 'text-blue-500'
                                  : 'text-gray-700'
                              }`}
                            >
                              {d.getDate()}
                            </span>
                            {events.length > 0 && (
                              <span className="text-[9px] font-black text-[#3182F6]">
                                {events.length}건
                              </span>
                            )}
                          </div>
                          <div className="space-y-1">
                            {events.slice(0, 3).map((ev: any) => (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => openChatForSchedule(ev)}
                                className="w-full text-left px-1 py-0.5 rounded-[6px] bg-[#E8F3FF] text-[9px] font-bold text-[#3182F6] truncate hover:bg-[#D6EBFF]"
                              >
                                {ev.schedule_time || ''} {ev.title}
                              </button>
                            ))}
                            {events.length > 3 && (
                              <p className="text-[9px] text-gray-400 font-bold">
                                + {events.length - 3}건 더보기
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* 게시물 목록 */}
      <div className="space-y-2">
        {posts.length > 0 ? (
          posts.map((post, idx) => (
            <div
              key={post.id || idx}
              className={`bg-white border border-[#E5E8EB] shadow-sm rounded-[14px] px-4 md:px-6 py-3 md:py-4 hover:border-[#3182F6]/40 hover:shadow-md transition-all cursor-pointer ${
                activeBoard === '수술일정' || activeBoard === 'MRI일정'
                  ? 'flex flex-col md:flex-row md:items-center md:justify-between gap-3'
                  : 'flex flex-col'
              }`}
            >
              {(activeBoard === '수술일정' || activeBoard === 'MRI일정') ? (
                <div className="space-y-2 md:space-y-1">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-bold text-[#191F28] text-base md:text-lg line-clamp-1">{post.title}</h3>
                      <p className="text-[11px] text-[#3182F6] font-bold mt-1 uppercase tracking-widest">{post.patient_name || '환자명 미지정'}</p>
                    </div>
                    <span className={`px-2 py-1 rounded-lg text-[8px] font-black shrink-0 ${
                      activeBoard === '수술일정' ? 'bg-red-100 text-red-600' : 'bg-purple-100 text-purple-600'
                    }`}>
                      {activeBoard === '수술일정' ? '🏥 수술' : '🔬 MRI'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-4 border-t border-[#E5E8EB]">
                    <div>
                      <p className="text-[8px] font-bold text-[#8B95A1] uppercase">날짜</p>
                      <p className="text-[11px] font-black text-[#191F28]">{post.schedule_date}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-bold text-[#8B95A1] uppercase">시간</p>
                      <p className="text-[11px] font-black text-[#191F28]">{post.schedule_time}</p>
                    </div>
                    <div>
                      <p className="text-[8px] font-bold text-[#8B95A1] uppercase">위치</p>
                      <p className="text-[11px] font-black text-[#191F28] line-clamp-1">{post.schedule_room}</p>
                    </div>
                  </div>
                  {(post.surgery_fasting || post.surgery_inpatient || post.surgery_guardian || post.surgery_caregiver) && (
                    <div className="pt-2 flex flex-wrap gap-1">
                      {post.surgery_fasting && (
                        <span className="px-2 py-1 rounded-full bg-red-50 text-red-600 text-[9px] font-black">
                          금식
                        </span>
                      )}
                      {post.surgery_inpatient && (
                        <span className="px-2 py-1 rounded-full bg-[#E8F3FF] text-[#3182F6] text-[9px] font-black">
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
                      className="px-3 py-2 rounded-xl text-[10px] font-black bg-[#E8F3FF] text-[#3182F6] hover:bg-[#D6EBFF] transition-colors"
                    >
                      💬 이 일정 관련 채팅 열기
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  <div className="flex-1">
                    <h3 className="font-black text-[#191F28] text-base md:text-lg group-hover:text-[#3182F6] transition-colors line-clamp-1">{post.title}</h3>
                    <p className="text-xs md:text-sm text-[#4E5968] mt-3 line-clamp-3 leading-relaxed">{post.content}</p>
                  </div>
                    <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-[#E5E8EB]">
                      <span className="text-[10px] font-bold text-[#8B95A1] flex items-center gap-1">
                        👤 {post.author_name}
                      </span>
                      <button
                        onClick={() => handleLike(post)}
                        className="flex items-center gap-1 text-[#4E5968] hover:text-red-500 text-[10px] font-bold"
                        type="button"
                      >
                        👍 {post.likes_count ?? 0}
                      </button>
                      <button
                        onClick={() => handleExpandPost(post.id)}
                        className="flex items-center gap-1 text-[#4E5968] hover:text-[#3182F6] text-[10px] font-bold"
                        type="button"
                      >
                        💬 댓글
                      </button>
                      <span className="ml-auto text-[10px] font-bold text-[#8B95A1]">
                        {new Date(post.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    {(Array.isArray(post.tags) ? post.tags : []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(Array.isArray(post.tags) ? post.tags : []).map((tag: string, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-[#E8F3FF] text-[#3182F6] rounded-full text-[9px] font-bold"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {expandedPostId === post.id && (
                      <div className="mt-3 pt-3 border-t border-[#E5E8EB] space-y-2">
                        {(comments[post.id] || []).map((c: any) => (
                          <div key={c.id} className="text-xs text-[#4E5968] flex gap-2">
                            <span className="font-bold">{c.author_name}:</span>
                            <span>{c.content}</span>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <input
                            value={expandedPostId === post.id ? newComment : ''}
                            onChange={(e) => setNewComment(e.target.value)}
                            placeholder="댓글 입력"
                            className="flex-1 px-3 py-2 border-[#E5E8EB] rounded-lg text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddComment(post.id)}
                            className="px-3 py-2 bg-[#3182F6] text-white rounded-[12px] text-xs font-bold hover:opacity-95"
                          >
                            등록
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-20 text-[#8B95A1]">
            <p className="font-black text-sm italic">게시물이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
