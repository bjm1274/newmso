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
  const [scheduleTransfusion, setScheduleTransfusion] = useState(false);
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

  // 수술/MRI 부위 필터 (사람 모형 버튼용)
  const BODY_PARTS = [
    { id: 'all', label: '전체', emoji: '👤' },
    { id: 'cervical', label: '경추/목', emoji: '🧠' },
    { id: 'lumbar', label: '요추/허리', emoji: '🦴' },
    { id: 'shoulder', label: '어깨', emoji: '🏋️' },
    { id: 'elbow', label: '팔꿈치', emoji: '💪' },
    { id: 'wrist', label: '손목/손', emoji: '✋' },
    { id: 'hip', label: '고관절', emoji: '🦵' },
    { id: 'knee', label: '무릎', emoji: '🦿' },
    { id: 'ankle', label: '발목/발', emoji: '🦶' },
    { id: 'other', label: '기타', emoji: '➕' },
  ];
  const [selectedBodyPart, setSelectedBodyPart] = useState<string>('all');
  const [showBodyPicker, setShowBodyPicker] = useState(false);

  // 수술일정·MRI일정 달력 뷰용 현재 월
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => new Date());
  // 상세보기용 선택된 게시물
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  // 댓글 대댓글용 부모 댓글 ID
  const [replyParentId, setReplyParentId] = useState<string | null>(null);

  const boards = [
    { id: '공지사항', label: '📢 공지사항', icon: '📢' },
    { id: '자유게시판', label: '💬 자유게시판', icon: '💬' },
    { id: '경조사', label: '🎉 경조사', icon: '🎉' },
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

  // 부위 선택에 따른 템플릿 필터링
  const filteredTemplates = useMemo(() => {
    if (selectedBodyPart === 'all' || !currentTemplates.length) return currentTemplates;

    const keywordMap: Record<string, string[]> = {
      cervical: ['경추', '목', '경추부'],
      lumbar: ['요추', '허리', '요추부', '요추부 MRI'],
      shoulder: ['어깨', '견', '견관절'],
      elbow: ['팔꿈치', '주관절'],
      wrist: ['손목', '수근', '손'],
      hip: ['고관절', '둔부', '고관절'],
      knee: ['무릎', '슬관절', '무릎관절'],
      ankle: ['발목', '족관절', '발'],
      other: [],
    };

    const keywords = keywordMap[selectedBodyPart] || [];
    if (keywords.length === 0) return currentTemplates;

    return currentTemplates.filter((t: any) => {
      const name = (t.name || '') as string;
      return keywords.some((k) => name.includes(k));
    });
  }, [currentTemplates, selectedBodyPart]);

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

  // 상세 게시글이 변경될 때 자동으로 댓글 불러오기
  useEffect(() => {
    if (!selectedPostId) return;
    if (comments[selectedPostId]) return;
    fetchComments(selectedPostId);
  }, [selectedPostId, comments]);

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

  const handleAddComment = async (postId: string, parentCommentId?: string | null) => {
    if (!newComment.trim() || !user?.id) return;
    const { data } = await supabase
      .from('board_post_comments')
      .insert([{
        post_id: postId,
        author_id: user.id,
        author_name: user.name,
        content: newComment.trim(),
        parent_comment_id: parentCommentId ?? null,
      }])
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

  const selectedPost = useMemo(
    () => posts.find((p: any) => p.id === selectedPostId) || null,
    [posts, selectedPostId]
  );

  // 상세 보기 열릴 때 조회수 1 증가
  useEffect(() => {
    if (!selectedPostId) return;
    const target = posts.find((p: any) => p.id === selectedPostId);
    if (!target) return;
    const currentViews = target.views ?? 0;
    const nextViews = currentViews + 1;

    (async () => {
      try {
        await supabase
          .from('board_posts')
          .update({ views: nextViews })
          .eq('id', selectedPostId);
        setPosts((prev) =>
          prev.map((p: any) =>
            p.id === selectedPostId ? { ...p, views: nextViews } : p
          )
        );
      } catch {
        // 조회수 업데이트 실패는 무시
      }
    })();
  }, [selectedPostId, posts]);

  const canDeletePost = (post: any) => {
    if (!user) return false;
    const isAuthor = post.author_id && String(post.author_id) === String(user.id);
    const isAdmin = user.permissions?.mso || user.role === 'admin';
    return !!(isAuthor || isAdmin);
  };

  const handleDeletePost = async (post: any) => {
    if (!canDeletePost(post)) {
      alert('이 게시물을 삭제할 권한이 없습니다.');
      return;
    }
    if (!confirm('이 게시물을 정말 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('board_posts').delete().eq('id', post.id);
    if (error) {
      alert('게시물 삭제 중 오류가 발생했습니다.');
      return;
    }
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    setSelectedPostId((prev) => (prev === post.id ? null : prev));
    alert('게시물이 삭제되었습니다.');
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
        postData.surgery_transfusion = scheduleTransfusion;
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
        setScheduleTransfusion(false);
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
        
        {(activeBoard === '공지사항' || activeBoard === '자유게시판' || activeBoard === '경조사' || activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
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
                <div className="space-y-3">
                  {/* 사람 모형 선택 버튼만 노출 (상단 부위 버튼 제거) */}
                  <div className="flex justify-end mb-1">
                    <button
                      type="button"
                      onClick={() => setShowBodyPicker(true)}
                      className="px-3 py-1.5 rounded-full bg-white border border-[#E5E8EB] text-[10px] font-bold text-[#3182F6] hover:bg-[#E8F3FF]"
                    >
                      👤 사람 모형으로 선택
                    </button>
                  </div>
                  <select
                    value=""
                    onChange={(e) => {
                      const v = e.target.value;
                      if (!v) return;
                      setTitle(v);
                    }}
                    className="w-full p-3 bg-[#F2F4F6] rounded-[12px] border border-[#E5E8EB] outline-none text-xs font-bold focus:ring-2 focus:ring-[#3182F6]/20"
                  >
                    <option value="">
                      {activeBoard === '수술일정'
                        ? '자주 쓰는 수술명 선택 (부위 선택 또는 사람 모형에서 선택 가능)'
                        : '자주 쓰는 검사명 선택 (부위 선택 또는 사람 모형에서 선택 가능)'}
                    </option>
                    {filteredTemplates.map((t: any) => (
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
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={scheduleTransfusion}
                          onChange={(e) => setScheduleTransfusion(e.target.checked)}
                          className="w-4 h-4 rounded border-[#E5E8EB]"
                        />
                        <span>수혈 필요</span>
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

      {/* 수술/MRI용 사람 모형 선택 모달 - 사람 이미지 + 부위 하이라이트 */}
      {showBodyPicker && (activeBoard === '수술일정' || activeBoard === 'MRI일정') && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-3 md:p-6" onClick={() => setShowBodyPicker(false)}>
          <div
            className="w-full max-w-3xl max-h-[90vh] bg-white rounded-[20px] shadow-2xl border border-[#E5E8EB] p-5 md:p-7 flex flex-col md:flex-row gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 왼쪽: 사람 모형 이미지 + 부위 클릭 (첨부 이미지 스타일) */}
            <div className="flex-1 relative min-h-[260px] bg-slate-950/90 rounded-[18px] border border-slate-800 overflow-hidden flex items-center justify-center">
              <div className="pointer-events-none absolute inset-[-20%] bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.24),_transparent_55%),radial-gradient(circle_at_bottom,_rgba(59,130,246,0.35),_transparent_55%)] opacity-80" />
              <div className="relative w-[190px] h-[300px] md:w-[220px] md:h-[340px] flex items-center justify-center">
                {/* 실제 사람 모형 이미지는 /public 폴더에 human-body-mri.png 로 배치해서 사용 */}
                <img
                  src="/human-body-mri.png"
                  alt="사람 전신 모형"
                  className="max-h-full max-w-full object-contain pointer-events-none select-none"
                />

                {/* 각 부위 클릭 영역 (이미지 위에 오버레이) */}
                {[
                  { id: 'cervical', top: '15%', left: '50%' },
                  { id: 'lumbar', top: '43%', left: '50%' },
                  { id: 'shoulder', top: '21%', left: '31%' },
                  { id: 'shoulder', top: '21%', left: '69%' },
                  { id: 'wrist', top: '40%', left: '18%' },
                  { id: 'wrist', top: '40%', left: '82%' },
                  { id: 'hip', top: '56%', left: '50%' },
                  { id: 'knee', top: '73%', left: '50%' },
                  { id: 'ankle', top: '90%', left: '50%' },
                ].map((spot, idx) => {
                  const isActive = selectedBodyPart === spot.id;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedBodyPart(spot.id)}
                      style={{ top: spot.top, left: spot.left }}
                      className={`
                        group absolute -translate-x-1/2 -translate-y-1/2
                        flex items-center justify-center
                        w-7 h-7 md:w-8 md:h-8 rounded-full border
                        ${isActive
                          ? 'bg-sky-400 border-white shadow-[0_0_25px_rgba(56,189,248,0.95)] animate-pulse'
                          : 'bg-sky-500/30 border-cyan-100/70 hover:bg-sky-400/70 hover:shadow-[0_0_18px_rgba(56,189,248,0.9)]'}
                      `}
                    >
                      <span className="w-2 h-2 rounded-full bg-white/90" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 오른쪽: 선택된 부위에 해당하는 수술/검사명 목록 */}
            <div className="flex-1 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-[10px] font-black text-[#8B95A1] uppercase tracking-widest">
                    {activeBoard === '수술일정' ? '수술명 선택' : '검사명 선택'}
                  </p>
                  <p className="text-xs font-bold text-[#4E5968] mt-1">
                    {BODY_PARTS.find((b) => b.id === selectedBodyPart)?.label || '전체'} 기준 추천 목록
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBodyPicker(false)}
                  className="px-3 py-1.5 rounded-full border border-gray-200 text-[10px] font-bold text-gray-500 hover:bg-gray-50"
                >
                  닫기
                </button>
              </div>
              <div className="flex-1 mt-2 bg-[#F8FAFC] border border-[#E5E8EB] rounded-[12px] p-2 overflow-y-auto custom-scrollbar">
                {filteredTemplates.length === 0 ? (
                  <p className="text-[11px] text-[#8B95A1] font-bold py-4 text-center">
                    선택한 부위에 해당하는 등록된 수술·검사명이 없습니다.<br />
                    관리자 메뉴의 “수술·검사명”에서 템플릿을 추가해주세요.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {filteredTemplates.map((t: any) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setTitle(t.name);
                            setShowBodyPicker(false);
                          }}
                          className="w-full text-left px-3 py-2 rounded-[8px] text-[12px] font-bold text-[#191F28] hover:bg-white hover:shadow-sm flex items-center gap-2"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#3182F6]" />
                          <span className="flex-1 truncate">{t.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
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
                              <button
                                type="button"
                                onClick={() => events[0] && setSelectedPostId(events[0].id)}
                                className="text-[9px] font-black text-[#3182F6] px-1 py-0.5 rounded-full hover:bg-[#E8F3FF]"
                              >
                                {events.length}건
                              </button>
                            )}
                          </div>
                          <div className="space-y-1">
                            {events.slice(0, 3).map((ev: any) => (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => setSelectedPostId(ev.id)}
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

      {/* 게시물 목록 (수술일정·MRI일정은 달력으로만 표시) */}
      {(activeBoard !== '수술일정' && activeBoard !== 'MRI일정') && (
      <div className="space-y-2">
        {posts.length > 0 ? (
          posts.map((post, idx) => {
            const rowNumber = posts.length - idx;
            const isSchedule = activeBoard === '수술일정' || activeBoard === 'MRI일정';
            return (
            <div
              key={post.id || idx}
              className={`bg-white border border-[#E5E8EB] shadow-sm rounded-[14px] px-3 md:px-4 py-2.5 md:py-3 hover:border-[#3182F6]/40 hover:shadow-md transition-all cursor-pointer`}
              onClick={() => setSelectedPostId(post.id)}
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
                  {(post.surgery_fasting || post.surgery_inpatient || post.surgery_guardian || post.surgery_caregiver || post.surgery_transfusion) && (
                    <div className="pt-2 flex flex-wrap gap-1 items-center">
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
                      {post.surgery_transfusion && (
                        <span className="px-2 py-1 rounded-full bg-red-50 text-red-700 text-[9px] font-black ml-auto">
                          수혈
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-3 text-[11px] md:text-xs">
                  <div className="w-8 text-center text-[10px] font-bold text-[#8B95A1] shrink-0">
                    {rowNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[#191F28] truncate group-hover:text-[#3182F6]">
                      {post.title}
                    </p>
                  </div>
                  <div className="hidden md:flex w-32 text-[10px] font-bold text-[#8B95A1] justify-center shrink-0">
                    {post.author_name || '익명'}
                  </div>
                  <div className="w-20 md:w-24 text-[10px] font-bold text-[#8B95A1] text-center shrink-0">
                    {new Date(post.created_at).toLocaleDateString()}
                  </div>
                  <div className="w-14 text-[10px] font-bold text-[#8B95A1] text-center shrink-0">
                    조회 {post.views ?? 0}
                  </div>
                </div>
              )}
            </div>
          )})
        ) : (
          <div className="text-center py-20 text-[#8B95A1]">
            <p className="font-black text-sm italic">게시물이 없습니다.</p>
          </div>
        )}
      </div>
      )}

      {/* 게시글 상세 보기 모달 */}
      {selectedPost && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-2 md:p-8">
          <div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white border border-[#E5E8EB] rounded-[24px] shadow-2xl p-5 md:p-8 space-y-5 text-[13px] md:text-[14px]">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-[11px] md:text-[12px] font-black text-[#8B95A1] uppercase tracking-widest mb-1">
                {selectedPost.board_type}
              </p>
              <h3 className="text-lg md:text-2xl font-black text-[#191F28]">
                {selectedPost.title}
              </h3>
              <p className="mt-2 text-[11px] md:text-[12px] text-[#8B95A1] font-bold">
                👤 {selectedPost.author_name || '익명'} ·{' '}
                {new Date(selectedPost.created_at).toLocaleString('ko-KR')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {canDeletePost(selectedPost) && (
                <button
                  type="button"
                  onClick={() => handleDeletePost(selectedPost)}
                  className="px-3 py-1.5 rounded-full border border-red-100 text-[11px] font-bold text-red-600 hover:bg-red-50"
                >
                  삭제
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedPostId(null)}
                className="px-3 py-1.5 rounded-full border border-gray-200 text-[11px] font-bold text-gray-500 hover:bg-gray-50"
              >
                닫기
              </button>
            </div>
          </div>

          {(selectedPost.board_type === '수술일정' || selectedPost.board_type === 'MRI일정') && (
            <div className="space-y-4 border-t border-[#E5E8EB] pt-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-[11px] font-bold text-[#4E5968]">
                <div>
                  <p className="text-[9px] font-black text-[#8B95A1] uppercase">수술/검사명</p>
                  <p className="mt-1 text-sm font-black text-[#191F28]">{selectedPost.title}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-[#8B95A1] uppercase">날짜·시간</p>
                  <p className="mt-1 text-sm font-black text-[#191F28]">
                    {selectedPost.schedule_date} {selectedPost.schedule_time}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-[#8B95A1] uppercase">위치 / 환자명</p>
                  <p className="mt-1 text-sm font-black text-[#191F28]">
                    {selectedPost.schedule_room || '-'} / {selectedPost.patient_name || '-'}
                  </p>
                </div>
              </div>

              {(selectedPost.surgery_fasting ||
                selectedPost.surgery_inpatient ||
                selectedPost.surgery_guardian ||
                selectedPost.surgery_caregiver ||
                selectedPost.surgery_transfusion) && (
                <div className="bg-[#F8FAFC] border border-[#E5E8EB] rounded-[12px] p-3 space-y-1 text-[11px] font-bold text-[#4E5968]">
                  <p className="text-[10px] font-black text-[#8B95A1] uppercase">수술/검사 준비 상태</p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {selectedPost.surgery_fasting && (
                      <span className="px-2 py-1 rounded-full bg-red-50 text-red-600 text-[9px] font-black">
                        금식
                      </span>
                    )}
                    {selectedPost.surgery_inpatient && (
                      <span className="px-2 py-1 rounded-full bg-[#E8F3FF] text-[#3182F6] text-[9px] font-black">
                        입원
                      </span>
                    )}
                    {selectedPost.surgery_guardian && (
                      <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-black">
                        보호자 동반
                      </span>
                    )}
                    {selectedPost.surgery_caregiver && (
                      <span className="px-2 py-1 rounded-full bg-purple-50 text-purple-600 text-[9px] font-black">
                        간병인
                      </span>
                    )}
                    {selectedPost.surgery_transfusion && (
                      <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-[9px] font-black">
                        수혈 필요
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 같은 날짜의 전체 일정 목록 */}
              <div className="bg-[#F8FAFC] border border-[#E5E8EB] rounded-[12px] p-3 space-y-2">
                <p className="text-[10px] font-black text-[#4E5968] flex items-center gap-2">
                  📅 {selectedPost.schedule_date || '날짜 미지정'} 의 전체 일정
                </p>
                <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-1 text-[11px]">
                  {posts
                    .filter(
                      (p: any) =>
                        p.board_type === selectedPost.board_type &&
                        p.schedule_date === selectedPost.schedule_date
                    )
                    .map((p: any) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPostId(p.id)}
                        className={`w-full flex items-center gap-2 px-2 py-1 rounded-[8px] text-left hover:bg-white ${
                          p.id === selectedPost.id ? 'bg-white shadow-sm border border-[#E5E8EB]' : ''
                        }`}
                      >
                        <span className="text-[10px] font-bold text-[#8B95A1] w-14 shrink-0">
                          {p.schedule_time || ''}
                        </span>
                        <span className="flex-1 truncate font-bold text-[#191F28]">
                          {p.title}
                        </span>
                        <span className="text-[10px] font-bold text-[#3182F6] shrink-0">
                          {p.patient_name || ''}
                        </span>
                      </button>
                    ))}
                </div>
              </div>
            </div>
          )}

          {selectedPost.content && (
            <div className="pt-4 border-t border-[#F1F3F5]">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#4E5968]">
                {selectedPost.content}
              </p>
            </div>
          )}

          {(Array.isArray(selectedPost.tags) ? selectedPost.tags : []).length > 0 && (
            <div className="flex flex-wrap gap-1 pt-2">
              {(Array.isArray(selectedPost.tags) ? selectedPost.tags : []).map(
                (tag: string, i: number) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-[#E8F3FF] text-[#3182F6] rounded-full text-[9px] font-bold"
                  >
                    #{tag}
                  </span>
                ),
              )}
            </div>
          )}

          {/* 댓글 + 대댓글 */}
          <div className="pt-4 border-t border-[#F1F3F5] space-y-3">
            <p className="text-[11px] font-black text-[#4E5968] flex items-center gap-2">
              💬 댓글
              <span className="text-[10px] text-[#8B95A1] font-bold">
                {(comments[selectedPost.id] || []).length}개
              </span>
            </p>
            {(() => {
              const list = comments[selectedPost.id] || [];
              const roots = list.filter((c: any) => !c.parent_comment_id);
              const repliesByParent: Record<string, any[]> = {};
              list.forEach((c: any) => {
                if (!c.parent_comment_id) return;
                const key = String(c.parent_comment_id);
                if (!repliesByParent[key]) repliesByParent[key] = [];
                repliesByParent[key].push(c);
              });
              return (
                <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                  {roots.map((c: any) => (
                    <div key={c.id} className="space-y-1">
                      <div className="text-xs text-[#4E5968] flex gap-2">
                        <span className="font-bold">{c.author_name}:</span>
                        <span>{c.content}</span>
                        {user?.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setReplyParentId(c.id);
                              setNewComment('');
                            }}
                            className="ml-auto text-[10px] text-[#8B95A1] hover:text-[#3182F6]"
                          >
                            답글
                          </button>
                        )}
                      </div>
                      {(repliesByParent[String(c.id)] || []).map((r: any) => (
                        <div key={r.id} className="ml-6 text-xs text-[#4E5968] flex gap-2">
                          <span className="font-bold">{r.author_name}:</span>
                          <span>{r.content}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                  {roots.length === 0 && (
                    <p className="text-[11px] text-[#C1C5D0] font-bold">첫 댓글을 남겨보세요.</p>
                  )}
                </div>
              );
            })()}
            {user?.id && (
              <div className="flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="댓글을 입력하세요."
                  className="flex-1 px-3 py-2 border-[#E5E8EB] rounded-lg text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    handleAddComment(selectedPost.id, replyParentId);
                    setReplyParentId(null);
                  }}
                  className="px-3 py-2 bg-[#3182F6] text-white rounded-[12px] text-xs font-bold hover:opacity-95"
                >
                  등록
                </button>
              </div>
            )}
          </div>

        </div>
        </div>
      )}
    </div>
  );
}
