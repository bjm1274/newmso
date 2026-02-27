'use client';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from './공통/SmartDatePicker';

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
const NOTICE_ROOM_NAME = '공지메시지';
const CAN_WRITE_NOTICE_POSITIONS = ['팀장', '부장', '실장', '원장', '병원장', '대표이사', '이사', '본부장', '총무부장', '진료부장', '간호부장'];
const CHAT_ROOM_KEY = 'erp_chat_last_room';
const CHAT_FOCUS_KEY = 'erp_chat_focus_keyword';

/** 카카오워크 스타일: 마지막 메시지 시각 기준으로 채팅방 목록 정렬 (최신 대화가 위로) */
function sortChatRoomsWithNoticeFirst(rooms: any[]): any[] {
  const notice = rooms.find((r: any) => r.id === NOTICE_ROOM_ID);
  const others = rooms.filter((r: any) => r.id !== NOTICE_ROOM_ID).sort((a: any, b: any) => {
    const at = new Date(a.last_message_at || a.created_at || 0).getTime();
    const bt = new Date(b.last_message_at || b.created_at || 0).getTime();
    return bt - at;
  });
  return notice ? [notice, ...others] : others;
}

// 파일 URL이 이미지인지 확인
function isImageUrl(url: string): boolean {
  const ext = url.split('.').pop()?.toLowerCase();
  return /^(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(ext || '');
}

// 파일 URL이 동영상인지 확인
function isVideoUrl(url: string): boolean {
  const ext = url.split('.').pop()?.toLowerCase();
  return /^(mp4|webm|mov|m4v|avi|mkv)$/.test(ext || '');
}

export default function ChatView({ user, onRefresh, staffs = [], initialOpenChatRoomId, initialOpenMessageId, onConsumeOpenChatRoomId }: any) {
  const [messages, setMessages] = useState<any[]>([]);
  const pendingScrollMsgIdRef = useRef<string | null>(null);
  const [omniSearch, setOmniSearch] = useState(''); // 통합 검색 (Omni-Search)
  const [chatSearch, setChatSearch] = useState(''); // 대화 내용 검색
  const [inputMsg, setInputMsg] = useState('');
  const [activeActionMsg, setActiveActionMsg] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgRefs = useRef<any>({});

  // 메시지 스크롤 이동을 위한 참조 (답글 클릭 시 원문 이동)
  const scrollToMessage = (messageId: string) => {
    const el = msgRefs.current[messageId];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const origClass = el.className;
      el.classList.add('bg-[var(--toss-blue-light)]', 'rounded-xl', 'transition-colors', 'duration-500');
      setTimeout(() => {
        el.className = origClass;
      }, 2000);
    }
  };

  const renderMessageContent = (content: string) => {
    if (!content) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = content.split(urlRegex);
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline hover:text-blue-600 break-words"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={i} className="break-words whitespace-pre-wrap">{part}</span>;
    });
  };

  const lastReadAtRef = useRef<string | null>(null);
  const isFocusedRef = useRef(true);

  // 추가된 상태
  const [viewMode, setViewMode] = useState<'chat' | 'org'>('chat');
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [readCounts, setReadCounts] = useState<Record<string, number>>({});
  const [roomUnreadCounts, setRoomUnreadCounts] = useState<Record<string, number>>({});
  const [showSettings, setShowSettings] = useState(false); // 통합 설정 드롭다운
  const [showDrawer, setShowDrawer] = useState(false); // 채팅방 상세 정보 드로어 (프리미엄)

  const [roomNotifyOn, setRoomNotifyOn] = useState(true);
  const [editingRoomName, setEditingRoomName] = useState(false);
  const [roomNameDraft, setRoomNameDraft] = useState('');

  // 통합 메시지 검색
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [globalSearchResults, setGlobalSearchResults] = useState<any[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);


  const chatRoomsRef = useRef<any[]>([]);

  // @멘션 자동완성용 상태
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentionList, setShowMentionList] = useState(false);

  // 공지/중요 메시지 미열람자 조회용 상태
  const [unreadModalMsg, setUnreadModalMsg] = useState<any | null>(null);
  const [unreadUsers, setUnreadUsers] = useState<any[]>([]);
  const [unreadLoading, setUnreadLoading] = useState(false);

  // 권한/역할 정보
  const permissions = user?.permissions || {};
  const isMso = user?.company === 'SY INC.' || permissions.mso === true || user?.role === 'admin';

  // 현재 선택된 채팅방을 로컬스토리지에 함께 저장해서
  // 새로고침 이후에도 마지막으로 보던 방으로 복원되도록 처리
  const setRoom = (roomId: string | null) => {
    setSelectedRoomId(roomId);
    if (typeof window === 'undefined') return;
    try {
      if (roomId) {
        window.localStorage.setItem(CHAT_ROOM_KEY, roomId);
      } else {
        window.localStorage.removeItem(CHAT_ROOM_KEY);
      }
    } catch {
      // 로컬스토리지 오류는 앱 동작에 치명적이지 않으므로 무시
    }
  };

  // DB 연동: 투표, 반응, 고정 (폴백: 로컬)
  const [polls, setPolls] = useState<any[]>([]);
  const [pollVotes, setPollVotes] = useState<any>({});
  const [reactions, setReactions] = useState<any>({});
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['찬성', '반대']);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video' | 'file'>('all');

  // 메시지 전달/공유용 상태
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardSourceMsg, setForwardSourceMsg] = useState<any>(null);

  // 채팅방 멤버 추가용 상태
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberSelectingIds, setAddMemberSelectingIds] = useState<string[]>([]);

  // 스레드 뷰(특정 메시지만 모아보기) 상태
  const [threadRoot, setThreadRoot] = useState<any | null>(null);

  // 슬래시 명령(/연차, /발주)용 상태
  const [slashCommand, setSlashCommand] = useState<'annual_leave' | 'purchase' | null>(null);
  const [showSlashModal, setShowSlashModal] = useState(false);
  const [slashForm, setSlashForm] = useState<any>({
    startDate: '',
    endDate: '',
    reason: '',
    itemName: '',
    quantity: 1,
  });

  const updateUnreadForRooms = useCallback(
    async (rooms: any[]) => {
      if (!user?.id || !rooms?.length) return;
      try {
        const roomIds = rooms.map((r: any) => r.id);
        const { data: cursors } = await supabase
          .from('room_read_cursors')
          .select('room_id, last_read_at')
          .eq('user_id', user.id)
          .in('room_id', roomIds);

        const cursorMap: Record<string, string | null> = {};
        (cursors || []).forEach((c: any) => {
          cursorMap[c.room_id] = c.last_read_at;
        });

        const counts: Record<string, number> = {};
        for (const roomId of roomIds) {
          const last = cursorMap[roomId];
          let query = supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .eq('room_id', roomId)
            .neq('sender_id', user.id)
            .eq('is_deleted', false);
          if (last) query = query.gt('created_at', last);
          const { count } = await query;
          counts[roomId] = count || 0;
        }
        setRoomUnreadCounts(counts);
      } catch (e) {
        console.error('채팅방 별 안읽은 메시지 계산 실패:', e);
      }
    },
    [user?.id]
  );

  useEffect(() => {
    chatRoomsRef.current = chatRooms;
  }, [chatRooms]);

  // 마지막으로 보던 채팅방 복구
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(CHAT_ROOM_KEY);
      if (saved) {
        setSelectedRoomId(saved);
      } else {
        setSelectedRoomId(NOTICE_ROOM_ID);
      }
    } catch {
      setSelectedRoomId(NOTICE_ROOM_ID);
    }
  }, []);

  // 알림 클릭으로 진입 시 해당 채팅방 자동 선택
  useEffect(() => {
    if (initialOpenChatRoomId) {
      setRoom(initialOpenChatRoomId);
      if (initialOpenMessageId) {
        pendingScrollMsgIdRef.current = initialOpenMessageId;
      }
      onConsumeOpenChatRoomId?.();
    }
  }, [initialOpenChatRoomId, initialOpenMessageId]);

  // 특정 메시지로 스크롤 대기
  useEffect(() => {
    const targetMsgId = pendingScrollMsgIdRef.current;
    if (targetMsgId && messages.length > 0) {
      if (messages.some(m => m.id === targetMsgId)) {
        setTimeout(() => {
          scrollToMessage(targetMsgId);
          pendingScrollMsgIdRef.current = null;
        }, 500);
      }
    }
  }, [messages]);

  const fetchData = useCallback(async () => {
    const query = supabase
      .from('messages')
      .select('*, staff:staff_members(name, photo_url)')
      .eq('room_id', selectedRoomId)
      .order('created_at', { ascending: true });
    const { data: msgs } = await query;
    if (msgs) setMessages(msgs);

    const { data: rooms } = await supabase.from('chat_rooms').select('*');
    const list = sortChatRoomsWithNoticeFirst(rooms || []);
    setChatRooms(list);

    // 읽음 수 집계
    if (msgs?.length) {
      const ids = msgs.map((m: any) => m.id);
      const { data: reads } = await supabase.from('message_reads').select('message_id').in('message_id', ids);
      const counts: Record<string, number> = {};
      reads?.forEach((r: any) => { counts[r.message_id] = (counts[r.message_id] || 0) + 1; });
      setReadCounts(counts);
    }

    // DB: 고정, 반응, 투표 로드
    try {
      const { data: pinned } = await supabase.from('pinned_messages').select('message_id').eq('room_id', selectedRoomId);
      if (pinned) setPinnedIds(pinned.map((p: any) => p.message_id));

      const { data: reacts } = await supabase.from('message_reactions').select('message_id, emoji');
      const reactMap: Record<string, Record<string, number>> = {};
      reacts?.forEach((r: any) => {
        if (!reactMap[r.message_id]) reactMap[r.message_id] = {};
        reactMap[r.message_id][r.emoji] = (reactMap[r.message_id][r.emoji] || 0) + 1;
      });
      setReactions((prev: any) => ({ ...prev, ...reactMap }));

      const { data: dbPolls } = await supabase.from('polls').select('*').eq('room_id', selectedRoomId);
      if (dbPolls?.length) setPolls(dbPolls);
      const { data: votes } = await supabase.from('poll_votes').select('poll_id, option_index');
      const vMap: any = {};
      votes?.forEach((v: any) => {
        if (!vMap[v.poll_id]) vMap[v.poll_id] = {};
        vMap[v.poll_id][v.option_index] = (vMap[v.poll_id][v.option_index] || 0) + 1;
      });
      setPollVotes(vMap);
    } catch (_) { /* 테이블 없으면 무시 */ }

    // 모든 방에 대해 안 읽은 개수 갱신
    await updateUnreadForRooms(list);

    // [추가] 채팅방 진입 시 현재 방의 안 읽은 메시지 자동 읽음 처리
    if (selectedRoomId && msgs?.length) {
      const unreadMsgIds = msgs
        .filter((m: any) => m.sender_id !== user?.id) // 내가 보낸 게 아닌 것
        .filter((m: any) => {
          // 이미 읽었는지 확인 (readCounts는 message_id 별 전체 읽음 수이므로, 
          // 정확히 내가 읽었는지는 message_reads 테이블 조회가 필요하지만 
          // 성능상 룸 진입 시 전체 upsert 처리)
          return true;
        })
        .map((m: any) => m.id);

      if (unreadMsgIds.length > 0) {
        try {
          // message_reads에 내 읽음 기록 추가
          const readPayloads = unreadMsgIds.map(id => ({
            user_id: user.id,
            message_id: id,
            read_at: new Date().toISOString()
          }));

          await supabase.from('message_reads').upsert(readPayloads, { onConflict: 'user_id,message_id' });

          // [추가] 채팅방 전체 안읽음 개수 캐시인 room_read_cursors 업데이트
          await supabase.from('room_read_cursors').upsert({
            user_id: user.id,
            room_id: selectedRoomId,
            last_read_at: new Date().toISOString()
          }, { onConflict: 'user_id,room_id' });

          // 읽음 수 로컬 상태 갱신 (즉시 반영 목적)
          setReadCounts(prev => {
            const next = { ...prev };
            unreadMsgIds.forEach(id => {
              if (!next[id]) next[id] = 0;
              // 내가 읽은 기록이 추가되었으므로 +1 (중복 합산 방지 로직은 upsert가 처리)
              // 여기서는 단순 fetchData 호출로 동기화하는 것이 안전함
            });
            return next;
          });

          // 전역 안읽음 카운트 갱신
          setRoomUnreadCounts(prev => ({ ...prev, [selectedRoomId]: 0 }));
        } catch (e) {
          console.error('자동 읽음 처리 실패:', e);
        }
      }
    }
  }, [selectedRoomId, user?.id, updateUnreadForRooms]);

  const roomNotifyRef = useRef(true);
  useEffect(() => { roomNotifyRef.current = roomNotifyOn; }, [roomNotifyOn]);

  useEffect(() => {
    const loadRooms = async () => {
      await supabase.from('chat_rooms').upsert(
        { id: NOTICE_ROOM_ID, name: NOTICE_ROOM_NAME, type: 'notice', members: [] },
        { onConflict: 'id' }
      );
      const { data: rooms } = await supabase.from('chat_rooms').select('*');
      const list = sortChatRoomsWithNoticeFirst(rooms || []);
      setChatRooms(list);
      await updateUnreadForRooms(list);
    };
    loadRooms();
  }, [selectedRoomId, updateUnreadForRooms]);

  // 채팅방 테이블 변경 시 항상 방 목록 갱신 (신규 방 생성·새 메시지로 순서 변경 시 실시간 반영, 카카오워크 스타일)
  useEffect(() => {
    const channel = supabase.channel('chat-rooms-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, () => {
        supabase.from('chat_rooms').select('*').then(({ data: rooms }) => {
          if (!rooms) return;
          const list = sortChatRoomsWithNoticeFirst(rooms);
          setChatRooms(list);
          updateUnreadForRooms(list);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [updateUnreadForRooms]);

  // 다른 화면(수술·검사 일정 등)에서 설정한 검색 키워드 복원
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = window.localStorage.getItem(CHAT_FOCUS_KEY);
      if (key) {
        setOmniSearch(key);
        window.localStorage.removeItem(CHAT_FOCUS_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  // 전역 신규 메시지 감지: 안 읽은 개수 갱신 (현재 방 메시지는 위 room 채널에서 즉시 반영하므로 fetchData 생략)
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('chat-global-messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload: any) => {
          const msg: any = payload.new;
          if (!msg || msg.sender_id === user.id) return;
          if (chatRoomsRef.current.length) {
            await updateUnreadForRooms(chatRoomsRef.current);
          }
          // 현재 방 메시지는 chat-realtime-${selectedRoomId}에서 이미 즉시 추가함 — fetchData 중복 호출 방지
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, selectedRoomId, updateUnreadForRooms]);

  useEffect(() => {
    if (!selectedRoomId) return;
    fetchData();
    const channel = supabase.channel(`chat-realtime-${selectedRoomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, (payload: any) => {
        const row = payload.new;
        if (!row?.id) return;
        // 카카오톡처럼 상대 메시지 실시간 즉시 반영 (fetch 없이 목록에 바로 추가)
        setMessages((prev) => {
          if (prev.some((m: any) => m.id === row.id)) return prev;
          const sender = Array.isArray(staffs) ? staffs.find((s: any) => String(s.id) === String(row.sender_id)) : null;
          const newMsg = {
            ...row,
            staff: sender ? { name: sender.name, photo_url: sender.avatar_url || sender.photo_url || null } : { name: '알 수 없음', photo_url: null },
          };
          return [...prev, newMsg];
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, () => fetchData())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pinned_messages' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'polls' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedRoomId, fetchData, user?.id, staffs]);

  useEffect(() => {
    const onFocus = () => { isFocusedRef.current = true; };
    const onBlur = () => { isFocusedRef.current = false; };
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    return () => { window.removeEventListener('focus', onFocus); window.removeEventListener('blur', onBlur); };
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const pinnedMessages = useMemo(
    () => messages.filter((m) => pinnedIds.includes(m.id)),
    [messages, pinnedIds]
  );


  const roomMembers = useMemo(() => {
    if (!selectedRoomId) return [];
    if (selectedRoomId === NOTICE_ROOM_ID) return staffs;
    const room = chatRooms.find((r: any) => r.id === selectedRoomId);
    if (!room || !Array.isArray(room.members) || !room.members.length) return [];
    const memberIds = room.members.map((id: any) => String(id));
    return staffs.filter((s: any) => memberIds.includes(String(s.id)));
  }, [chatRooms, selectedRoomId, staffs]);

  const selectedRoom = useMemo(
    () => chatRooms.find((r: any) => r.id === selectedRoomId) || null,
    [chatRooms, selectedRoomId]
  );

  // 현재 방에서 아직 포함되지 않은 직원들 (대화상대 추가용)
  const addableMembers = useMemo(() => {
    if (!selectedRoom) return [];
    const currentMemberIds = new Set(
      Array.isArray(selectedRoom.members)
        ? selectedRoom.members.map((id: any) => String(id))
        : []
    );
    return staffs
      .filter((s: any) => !currentMemberIds.has(String(s.id)))
      .filter((s: any) => {
        if (!addMemberSearch.trim()) return true;
        const key = addMemberSearch.trim();
        return (
          s.name?.includes(key) ||
          s.department?.includes(key) ||
          s.position?.includes(key)
        );
      });
  }, [selectedRoom, staffs, addMemberSearch]);

  const visibleRooms = useMemo(
    () =>
      chatRooms.filter((room: any) => {
        if (room.id === NOTICE_ROOM_ID) return true;
        // 공지메시지 방 하나만 특별 취급, 나머지는 일반 채팅방
        // members 배열이 존재하는 방은 "멤버 기반 방"으로 간주하고,
        // 내 ID가 포함된 경우에만 목록에 노출
        if (Array.isArray(room.members)) {
          return room.members.some((id: any) => String(id) === String(user?.id));
        }
        // members가 아직 설정되지 않은(구 버전) 방은 기존과 동일하게 모두에게 표시
        return true;
      }),
    [chatRooms, user?.id, isMso]
  );

  // 현재 선택된 스레드에 포함되는 메시지들 (루트 + 해당 루트를 reply_to_id로 참조하는 메시지)
  const threadMessages = useMemo(() => {
    if (!threadRoot) return [];
    const rootId = threadRoot.id;
    return messages
      .filter(
        (m: any) =>
          m.id === rootId ||
          m.reply_to_id === rootId
      )
      .sort(
        (a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
  }, [threadRoot, messages]);

  // 특정 메시지의 열람/미열람자 목록 불러오기
  const [readUsers, setReadUsers] = useState<any[]>([]);
  const loadReadStatusForMessage = useCallback(
    async (msg: any) => {
      if (!msg?.id || !selectedRoom) return;
      setUnreadLoading(true);
      setUnreadUsers([]);
      setReadUsers([]);
      setUnreadModalMsg(msg);
      try {
        // 1. 해당 메시지를 읽은 기록 가져오기
        const { data: reads } = await supabase
          .from('message_reads')
          .select('user_id')
          .eq('message_id', msg.id);
        const readUserIds = new Set((reads || []).map((r: any) => r.user_id));

        // 2. 현재 채팅방 멤버 목록 가져오기 (selectedRoom.members 기반)
        const roomMemberIds = selectedRoom.id === NOTICE_ROOM_ID
          ? staffs.map((s: any) => String(s.id))
          : Array.isArray(selectedRoom.members)
            ? selectedRoom.members.map((id: string) => String(id))
            : [];

        // 3. 멤버 정보 매칭
        const allRoomStaffs = staffs.filter((s: any) => roomMemberIds.includes(String(s.id)));

        const readers: any[] = [];
        const nonReaders: any[] = [];

        allRoomStaffs.forEach((s: any) => {
          if (s.id === msg.sender_id) return; // 보낸 사람은 제외
          if (readUserIds.has(s.id)) {
            readers.push(s);
          } else {
            nonReaders.push(s);
          }
        });

        // 정렬
        const sorter = (a: any, b: any) => (a.department || '').localeCompare(b.department || '') || (a.name || '').localeCompare(b.name || '');
        setReadUsers(readers.sort(sorter));
        setUnreadUsers(nonReaders.sort(sorter));
      } catch (e) {
        console.error('loadReadStatusForMessage error', e);
        alert('열람 현황을 불러오지 못했습니다.');
      } finally {
        setUnreadLoading(false);
      }
    },
    [selectedRoom, staffs]
  );

  const handleLeaveRoom = async () => {
    if (!selectedRoom) return;
    if (selectedRoom.id === NOTICE_ROOM_ID && !isMso) {
      alert('공지메시지 방은 관리자 승인 없이 직원 임의로 나갈 수 없습니다.');
      return;
    }
    if (!confirm('이 채팅방에서 나가시겠습니까? 나간 후에는 다시 초대 받아야 합니다.')) return;

    try {
      const currentMembers: any[] = Array.isArray(selectedRoom.members)
        ? selectedRoom.members
        : [];
      const newMembers = currentMembers.filter(
        (id: any) => String(id) !== String(user?.id)
      );

      await supabase
        .from('chat_rooms')
        .update({ members: newMembers })
        .eq('id', selectedRoom.id);

      // 목록에서 즉시 숨기기
      setChatRooms((prev) =>
        prev.map((room: any) =>
          room.id === selectedRoom.id ? { ...room, members: newMembers } : room
        )
      );
      setRoom(null);
      setMessages([]);
      alert('채팅방에서 나갔습니다.');
    } catch {
      alert('채팅방 나가기 중 오류가 발생했습니다.');
    }
  };


  const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB (동영상 업로드 비허용)
  const handleSendMessage = async (
    fileUrl?: string,
    fileSizeBytes?: number,
    fileKind?: 'image' | 'video' | 'file'
  ) => {
    const trimmed = inputMsg.trim();
    if (!trimmed && !fileUrl) return;

    // 슬래시 명령 처리: /연차, /발주
    if (!fileUrl && trimmed.startsWith('/')) {
      if (trimmed.startsWith('/연차')) {
        setSlashCommand('annual_leave');
        setSlashForm({
          startDate: '',
          endDate: '',
          reason: trimmed.replace('/연차', '').trim(),
          itemName: '',
          quantity: 1,
        });
        setShowSlashModal(true);
        return;
      }
      if (trimmed.startsWith('/발주')) {
        setSlashCommand('purchase');
        setSlashForm({
          startDate: '',
          endDate: '',
          reason: '',
          itemName: trimmed.replace('/발주', '').trim(),
          quantity: 1,
        });
        setShowSlashModal(true);
        return;
      }
    }
    if (selectedRoomId === NOTICE_ROOM_ID) {
      const canWrite = user?.position && CAN_WRITE_NOTICE_POSITIONS.includes(user.position);
      if (!canWrite) {
        alert('공지메시지 방에는 부서장 이상만 작성할 수 있습니다.');
        return;
      }
    }
    const content = trimmed;
    const payload: Record<string, unknown> = {
      room_id: selectedRoomId,
      sender_id: user.id,
      content,
      file_url: fileUrl || null,
      reply_to_id: replyTo?.id || null,
    };
    // file_size_bytes, file_kind 컬럼 미존재로 인한 에러 방지를 위해 Payload에서 제거
    const { data: inserted, error } = await supabase.from('messages').insert([payload]).select().single();
    if (!error && inserted) {
      setInputMsg('');
      setReplyTo(null);
      // 카카오톡처럼 내 메시지 즉시 표시 (낙관적 업데이트)
      const optimisticMsg = {
        ...inserted,
        staff: { name: user.name, photo_url: user.avatar_url || null },
      };
      setMessages((prev) => [...prev, optimisticMsg]);
      fetchData(); // 읽음/고정 등 서버 상태 동기화
      // 백엔드 Edge Function을 통해 Web Push 발송 (앱이 닫혀 있어도 푸시)
      try {
        await supabase.functions.invoke('send-web-push', {
          body: {
            room_id: inserted.room_id,
            message_id: inserted.id,
          },
        });
      } catch (e) {
        console.error('send-web-push 호출 실패:', e);
      }
    } else {
      console.error('메시지 전송 실패:', error);
      alert(`메시지 전송에 실패했습니다: ${error?.message || '알 수 없는 오류'}`);
    }
  };

  const [fileUploading, setFileUploading] = useState(false);
  const getFileKind = (mime: string): 'image' | 'video' | 'file' => {
    if (!mime) return 'file';
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    return 'file';
  };
  const CHAT_BUCKET = 'pchos-files';
  const [isDragging, setIsDragging] = useState(false);

  const processFileUpload = async (file: File) => {
    if (file.type.startsWith('video/')) {
      alert('동영상 파일은 업로드할 수 없습니다.\n(사진, 문서, 일반 파일만 가능합니다.)');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      alert('파일 크기는 20MB 이하여야 합니다.');
      return;
    }
    setFileUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const uuid = crypto.randomUUID();
      const path = `chat/${Date.now()}_${uuid}.${ext}`;
      const { error } = await supabase.storage.from(CHAT_BUCKET).upload(path, file, { upsert: false });
      if (error) throw error;
      const publicUrl = supabase.storage.from(CHAT_BUCKET).getPublicUrl(path).data.publicUrl;
      const fileKind = getFileKind(file.type || '');
      await handleSendMessage(publicUrl, file.size, fileKind);
    } catch (err: any) {
      console.error('파일 업로드 실패:', err);
      const msg = err?.message || String(err);
      const hint = msg.includes('Bucket not found') || msg.includes('not found')
        ? 'Supabase 대시보드에서 Storage > New bucket > 이름 "pchos-files" (Public) 생성 후 다시 시도해 주세요.'
        : msg.includes('policy') || msg.includes('RLS')
          ? 'Storage 버킷 pchos-files의 RLS 정책에서 INSERT를 허용해 주세요.'
          : '버킷 생성 여부와 RLS 정책을 확인해 주세요.';
      alert(`파일 업로드에 실패했습니다.\n\n${hint}`);
    } finally {
      setFileUploading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFileUpload(file);
    e.target.value = '';
  };

  const handleAction = async (type: 'task') => {
    if (!activeActionMsg) return;
    if (type === 'task') {
      const { error } = await supabase.from('tasks').insert([{
        assignee_id: user.id,
        title: `[채팅] ${activeActionMsg.content}`,
        status: 'pending'
      }]);
      if (!error) { alert("할일 등록 완료"); if (onRefresh) onRefresh(); }
    }
    setActiveActionMsg(null);
  };

  const createGroupChat = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return alert("방 이름과 멤버를 선택해주세요.");
    const { data: room, error } = await supabase.from('chat_rooms').insert([{
      name: groupName,
      type: 'group',
      created_by: user.id,
      members: [user.id, ...selectedMembers]
    }]).select().single();

    if (!error && room) {
      setGroupName('');
      setSelectedMembers([]);
      setShowGroupModal(false);
      setRoom(room.id);
      fetchData();
      setTimeout(() => fetchData(), 300);
    }
  };

  const groupedStaffs = useMemo(() => {
    const grouped: Record<string, Record<string, any[]>> = {};
    staffs.forEach((s: any) => {
      const company = s.company || '기타';
      const dept = s.department || '미지정';
      if (!grouped[company]) grouped[company] = {};
      if (!grouped[company][dept]) grouped[company][dept] = [];
      grouped[company][dept].push(s);
    });
    return grouped;
  }, [staffs]);

  const mediaMessages = useMemo(() => {
    return messages.filter((m: any) => m.file_url);
  }, [messages]);

  const filteredMediaMessages = useMemo(() => {
    if (mediaFilter === 'all') return mediaMessages;
    return mediaMessages.filter((m: any) => {
      if (mediaFilter === 'image') return isImageUrl(m.file_url);
      if (mediaFilter === 'video') return isVideoUrl(m.file_url);
      return !isImageUrl(m.file_url) && !isVideoUrl(m.file_url);
    });
  }, [mediaMessages, mediaFilter]);

  // 현재 선택된 방 멤버 중에서 @멘션 자동완성 후보
  const mentionCandidates = useMemo(() => {
    if (!showMentionList) return [];
    const base =
      Array.isArray(roomMembers) && roomMembers.length > 0
        ? roomMembers
        : staffs;
    const q = mentionQuery.trim();
    if (!q) return base.slice(0, 8);
    return base
      .filter((s: any) =>
        (s.name || '').toLowerCase().includes(q.toLowerCase())
      )
      .slice(0, 8);
  }, [showMentionList, mentionQuery, roomMembers, staffs]);

  const handleCreatePoll = async () => {
    if (!pollQuestion.trim()) { alert('질문을 입력해 주세요.'); return; }
    const options = pollOptions.map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) { alert('선택지는 최소 2개 이상 입력해 주세요.'); return; }
    try {
      const { data: poll, error } = await supabase.from('polls').insert([{
        room_id: selectedRoomId, creator_id: user.id, question: pollQuestion, options
      }]).select().single();
      if (!error && poll) {
        setPolls((p: any[]) => [...p, poll]);
        setPollQuestion('');
        setPollOptions(['찬성', '반대']);
        setShowPollModal(false);
      } else throw new Error();
    } catch {
      const id = Date.now().toString();
      setPolls((p: any[]) => [...p, { id, room_id: selectedRoomId, question: pollQuestion, options }]);
      setPollQuestion('');
      setPollOptions(['찬성', '반대']);
      setShowPollModal(false);
    }
  };

  const handleVote = async (pollId: string, optionIndex: number) => {
    try {
      const { error } = await supabase.from('poll_votes').upsert(
        { poll_id: pollId, user_id: user.id, option_index: optionIndex },
        { onConflict: 'poll_id,user_id' }
      );
      if (!error) fetchData();
    } catch (_) { }
    setPollVotes((prev: any) => {
      const ex = prev[pollId] || {};
      return { ...prev, [pollId]: { ...ex, [optionIndex]: (ex[optionIndex] || 0) + 1 } };
    });
  };

  const toggleReaction = async (messageId: string, emoji: string) => {
    try {
      const { data: myReact } = await supabase.from('message_reactions').select('id').eq('message_id', messageId).eq('user_id', user.id).eq('emoji', emoji).maybeSingle();
      if (myReact) {
        await supabase.from('message_reactions').delete().eq('message_id', messageId).eq('user_id', user.id).eq('emoji', emoji);
      } else {
        await supabase.from('message_reactions').insert([{ message_id: messageId, user_id: user.id, emoji }]);
      }
      fetchData();
    } catch (_) { }
  };

  const togglePin = async (messageId: string) => {
    const isPinned = pinnedIds.includes(messageId);
    try {
      if (isPinned) {
        await supabase.from('pinned_messages').delete().eq('room_id', selectedRoomId).eq('message_id', messageId);
      } else {
        await supabase.from('pinned_messages').insert([{ room_id: selectedRoomId, message_id: messageId, pinned_by: user.id }]);
      }
      setPinnedIds((p) => (isPinned ? p.filter((id) => id !== messageId) : [...p, messageId]));
      fetchData();
    } catch (_) {
      setPinnedIds((p) => (isPinned ? p.filter((id) => id !== messageId) : [...p, messageId]));
    }
  };

  const markMessageRead = async (msg: any) => {
    if (msg.sender_id === user.id) return;
    try {
      await supabase.from('message_reads').upsert(
        { user_id: user.id, message_id: msg.id, read_at: new Date().toISOString() },
        { onConflict: 'user_id,message_id' }
      );
      fetchData(); // 읽음 수 갱신
    } catch (_) { }
  };

  const handleGlobalSearch = async () => {
    if (!globalSearchQuery.trim()) return;
    setGlobalSearchLoading(true);
    try {
      // 본인이 열람 가능한(참여중인) 방들의 아이디 목록
      const roomIds = visibleRooms.map(r => r.id);
      if (roomIds.length === 0) {
        setGlobalSearchResults([]);
        return;
      }
      const { data, error } = await supabase
        .from('messages')
        .select('*, staff:staff_members!left(name, photo_url), chat_rooms!inner(name, type, members)')
        .in('room_id', roomIds)
        .ilike('content', `%${globalSearchQuery}%`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setGlobalSearchResults(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setGlobalSearchLoading(false);
    }
  };

  const combinedTimeline = useMemo(() => {
    const msgs = messages.filter((m: any) => !m.is_deleted);
    let filtered = msgs;
    if (chatSearch.trim()) {
      const q = chatSearch.toLowerCase();
      filtered = msgs.filter((m) =>
        (m.content || '').toLowerCase().includes(q) ||
        (m.staff?.name || '').toLowerCase().includes(q)
      );
    }
    const ms = filtered.map(m => ({ ...m, type: 'message' }));
    const ps = polls
      .filter((p: any) => p.room_id === selectedRoomId)
      .map(p => ({ ...p, type: 'poll', created_at: p.created_at || new Date().toISOString() }));

    return [...ms, ...ps].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [messages, chatSearch, polls, selectedRoomId]);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('room_notification_settings').select('notifications_enabled').eq('user_id', user?.id).eq('room_id', selectedRoomId).single();
      setRoomNotifyOn(data?.notifications_enabled !== false);
    };
    load();
  }, [selectedRoomId, user?.id]);
  const toggleRoomNotify = async () => {
    setRoomNotifyOn((p) => !p);
    await supabase.from('room_notification_settings').upsert({ user_id: user.id, room_id: selectedRoomId, notifications_enabled: !roomNotifyOn }, { onConflict: 'user_id,room_id' });
  };

  const deleteMessage = async (msg: any) => {
    // 공지메시지 방은 일반 사용자가 삭제 불가
    if (selectedRoom?.id === NOTICE_ROOM_ID && !isMso) {
      alert('공지 채널의 메시지는 삭제할 수 없습니다.');
      return;
    }
    if (msg.sender_id !== user.id && !isMso) return;
    if (!confirm('이 메시지를 삭제하시겠습니까?')) return;
    await supabase.from('messages').update({ is_deleted: true }).eq('id', msg.id);
    // 감사 로그 기록
    try {
      await supabase.from('audit_logs').insert([
        {
          user_id: user.id,
          user_name: user.name,
          action: 'message_delete',
          target_type: 'message',
          target_id: msg.id,
          details: {
            room_id: selectedRoomId,
            content: msg.content,
          },
        },
      ]);
    } catch {
      // 감사 로그 실패는 무시
    }
    fetchData();
    setActiveActionMsg(null);
  };
  const [editingMsg, setEditingMsg] = useState<any>(null);
  const [editContent, setEditContent] = useState('');
  const saveEditMessage = async () => {
    if (!editingMsg || editingMsg.sender_id !== user.id) return;
    const before = editingMsg.content;
    await supabase
      .from('messages')
      .update({ content: editContent, edited_at: new Date().toISOString() })
      .eq('id', editingMsg.id);
    // 감사 로그 기록
    try {
      await supabase.from('audit_logs').insert([
        {
          user_id: user.id,
          user_name: user.name,
          action: 'message_edit',
          target_type: 'message',
          target_id: editingMsg.id,
          details: {
            room_id: selectedRoomId,
            before,
            after: editContent,
          },
        },
      ]);
    } catch {
      // ignore
    }
    fetchData();
    setEditingMsg(null);
    setEditContent('');
  };

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden relative font-sans h-full bg-[var(--background)] md:bg-[var(--toss-card)]">
      {/* 좌측 사이드바: 모바일에서는 채팅방 미선택 시에만 전체 표시, 선택 시 숨김 */}
      <aside className={`${selectedRoomId ? 'hidden md:flex' : 'flex'} w-full md:w-80 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex-col shrink-0 z-50 transition-all`}>
        <div className="p-4 md:p-6 space-y-4 flex flex-col min-h-0">
          <div className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl glass">
            <button
              onClick={() => setViewMode('chat')}
              className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'chat'
                ? 'bg-white dark:bg-zinc-700 text-foreground shadow-premium'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
            >
              채팅
            </button>
            <button
              onClick={() => setViewMode('org')}
              className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${viewMode === 'org'
                ? 'bg-white dark:bg-zinc-700 text-foreground shadow-premium'
                : 'text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
                }`}
            >
              조직도
            </button>
          </div>

          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">
              {viewMode === 'chat' ? '최근 대화' : '조직도'}
            </span>
            {viewMode === 'chat' && (
              <button
                onClick={() => setShowGlobalSearch(true)}
                className="text-[12px] text-zinc-400 hover:text-blue-500 transition-colors p-1 flex items-center justify-center shrink-0"
                title="채팅 내용 전체 검색"
              >
                🔍
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 space-y-2 custom-scrollbar">
          {viewMode === 'chat' ? (
            <>
              {[...visibleRooms]
                .filter(r => {
                  const name = r.id === NOTICE_ROOM_ID ? NOTICE_ROOM_NAME : (r.name || '');
                  return r.id === NOTICE_ROOM_ID || name.toLowerCase().includes(omniSearch.toLowerCase());
                })
                .sort((a, b) => {
                  if (a.id === NOTICE_ROOM_ID) return -1;
                  if (b.id === NOTICE_ROOM_ID) return 1;
                  const at = new Date(a.last_message_at || a.created_at || 0).getTime();
                  const bt = new Date(b.last_message_at || b.created_at || 0).getTime();
                  return bt - at;
                })
                .map(room => {
                  const unread = roomUnreadCounts[room.id] || 0;
                  const isSelected = selectedRoomId === room.id;
                  const isNoticeChannel = room.id === NOTICE_ROOM_ID;

                  let label = room.name || '채팅방';
                  if (isNoticeChannel) {
                    label = NOTICE_ROOM_NAME;
                  } else if (room.type === 'direct' && Array.isArray(room.members)) {
                    // 1:1 채팅방의 경우 내 이름이 아닌 상대방 이름으로 보이도록 (이름이 'A,B' 형태로 되어있을 때)
                    // 현재 DB에 저장된 name이 있으면 그걸 쓰되, 상대방 이름을 추출하려는 시도
                    const otherStaff = staffs.find((s: any) => room.members.includes(String(s.id)) && String(s.id) !== String(user?.id));
                    if (otherStaff) label = otherStaff.name;
                  }

                  return (
                    <div
                      key={room.id}
                      onClick={() => setRoom(room.id)}
                      className={`group p-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 border relative overflow-hidden ${isSelected
                        ? 'bg-zinc-800 border-zinc-700 shadow-sm'
                        : 'bg-white dark:bg-zinc-900 border-transparent hover:border-zinc-200 dark:hover:border-zinc-800'
                        }`}
                    >
                      {isSelected && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500"></div>
                      )}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${isNoticeChannel ? 'bg-blue-100 text-blue-600' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                          {isNoticeChannel ? '📢' : '👥'}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <p className={`text-[12px] font-bold truncate ${isSelected ? 'text-white' : 'text-zinc-600 dark:text-zinc-300'}`}>
                            {label}
                          </p>
                          <p className="text-[10px] text-zinc-400 font-medium truncate">
                            {room.last_message || '대화가 없습니다.'}
                          </p>
                        </div>
                      </div>
                      {unread > 0 && (
                        <span className="ml-2 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-blue-600 text-white text-[9px] font-bold shadow-soft">
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  );
                })}
            </>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedStaffs).map(([company, depts]) => (
                <div key={company} className="space-y-4">
                  <div className="flex items-center gap-2 px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                    <h3 className="text-[11px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{company}</h3>
                    <div className="flex-1 h-[1px] bg-zinc-100 dark:bg-zinc-800/50"></div>
                  </div>
                  <div className="space-y-5 pl-1">
                    {Object.entries(depts).map(([dept, members]) => (
                      <div key={dept} className="space-y-2">
                        <p className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 ml-1">{dept}</p>
                        <div className="space-y-1">
                          {members.map((s: any) => (
                            <div key={s.id} className="flex items-center gap-3 p-2.5 bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/50 rounded-xl hover:border-blue-400/50 dark:hover:border-blue-500/50 cursor-pointer transition-all group">
                              <div className="w-8 h-8 bg-zinc-100 dark:bg-zinc-800 rounded-lg flex items-center justify-center text-xs font-bold text-zinc-400 overflow-hidden shrink-0">
                                {s.photo_url ? <img src={s.photo_url} alt={s.name} className="w-full h-full object-cover" /> : s.name[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-xs font-bold text-foreground truncate">{s.name}</p>
                                  <span className="text-[10px] font-medium text-zinc-400">{s.position}</span>
                                </div>
                              </div>
                              <button
                                onClick={async () => {
                                  const otherId = s.id;
                                  const { data: rooms } = await supabase.from('chat_rooms').select('id, members').eq('type', 'direct');
                                  const found = (rooms || []).find((r: any) => {
                                    const m = new Set((r.members || []).map((x: any) => String(x)));
                                    const p = new Set([String(user.id), String(otherId)]);
                                    return m.size === p.size && [...p].every((id) => m.has(id));
                                  });
                                  if (found) setRoom(found.id);
                                  else {
                                    const { data: room } = await supabase.from('chat_rooms').insert([{ name: `${s.name}`, type: 'direct', members: [user.id, otherId] }]).select('id').single();
                                    if (room) { setRoom(room.id); fetchData(); }
                                  }
                                  setViewMode('chat');
                                }}
                                className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-lg text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-all border border-blue-100 dark:border-blue-800/50"
                              >
                                대화
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* 우측: 채팅창 본문 — 모바일에서는 채팅방 선택 시에만 표시 */}
      <main className={`${!selectedRoomId ? 'hidden md:flex' : 'flex'} flex-1 min-h-0 flex-col bg-[var(--toss-gray-1)] relative pb-16 md:pb-0`}>
        {/* 선택된 채팅방 정보 및 액션 버튼들 */}
        {selectedRoomId && selectedRoom && (
          <header className="px-6 py-3.5 flex items-center justify-between border-b border-zinc-200/50 dark:border-zinc-800/50 glass glass-border shrink-0 z-40">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => setRoom(null)} className="md:hidden text-zinc-400">←</button>
              <div className="w-9 h-9 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-lg">
                {selectedRoom.id === NOTICE_ROOM_ID ? '📢' : '👥'}
              </div>
              <div className="min-w-0">
                <h3 className="text-[13px] font-bold text-foreground truncate">
                  {selectedRoom.id === NOTICE_ROOM_ID ? NOTICE_ROOM_NAME : selectedRoom.name || '채팅방'}
                </h3>
                <p className="text-[10px] text-zinc-500 font-medium">
                  {roomMembers.length || 0} 참여중
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDrawer(true)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-foreground"
                title="채팅방 정보 및 대화상대 보기"
              >
                <span className="text-xl">☰</span>
              </button>
            </div>
          </header>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 pb-24 md:pb-6 space-y-3 custom-scrollbar">
          {!selectedRoomId ? (
            <div className="h-full flex flex-col items-center justify-center text-[var(--toss-gray-3)]">
              <span className="text-4xl mb-2">💬</span>
              <p className="text-sm font-bold">채팅방을 선택하세요</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20">
              <span className="text-6xl mb-4">💬</span>
              <p className="font-semibold text-sm">대화 내용이 없습니다.</p>
            </div>
          ) : (
            (() => {
              let lastDateLabel = '';
              return combinedTimeline.map((item) => {
                if (item.type === 'poll') {
                  const votes = pollVotes[item.id] || {};
                  const totalVotes = (Object.values(votes) as number[]).reduce((a: number, b: number) => a + b, 0);
                  return (
                    <div key={`poll-${item.id}`} className="max-w-[85%] md:max-w-[70%] bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 rounded-2xl p-4 shadow-soft">
                      <p className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                        <span className="text-sm">📊</span> 투표
                      </p>
                      <p className="mb-4 text-xs font-bold text-foreground leading-relaxed">{item.question}</p>
                      <div className="space-y-1.5">
                        {item.options.map((opt: string, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => handleVote(item.id, idx)}
                            className="w-full flex justify-between items-center px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-800/50 border border-blue-200/50 dark:border-blue-700/30 hover:border-blue-400 dark:hover:border-blue-500 transition-all text-[11px] font-medium group"
                          >
                            <span className="text-zinc-700 dark:text-zinc-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{opt}</span>
                            <span className="text-blue-600 font-bold bg-blue-50 dark:bg-blue-900/50 px-2 py-0.5 rounded-md">
                              {votes[idx] || 0}
                              {totalVotes > 0 && <span className="ml-1 opacity-60 font-medium">({Math.round(((votes[idx] || 0) / totalVotes) * 100)}%)</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }

                const msg = item;
                const isMine = msg.sender_id === user.id;
                const msgReacts = reactions[msg.id] || {};
                const hasReacts = Object.keys(msgReacts).some(e => (msgReacts[e] || 0) > 0);

                // 라인/텔레그램 스타일 계산: 읽은 사람 수 직접 카운트
                // 본인이 보낸 메시지도 0부터 시작하게 설정, 총 참여자 수는 드로어에서 확인 가능
                const readersCount = readCounts[msg.id] || 0;
                // UI 표기를 '읽은 사람 수'로 변경
                const displayReadCount = Math.max(0, readersCount);

                const TOOLBAR_EMOJIS = ['👍', '👌', '😎', '😍', '😂', '😕', '😢', '😠'];

                const created = new Date(msg.created_at);
                const dateLabel = created.toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                });
                const showDateDivider = dateLabel !== lastDateLabel;
                if (showDateDivider) lastDateLabel = dateLabel;

                const isSystemInvite = typeof msg.content === 'string' && msg.content.startsWith('[초대]');
                const systemText = isSystemInvite ? (msg.content as string).replace(/^\[초대\]\s*/, '') : '';

                return (
                  <div key={msg.id} className="space-y-1">
                    {showDateDivider && (
                      <div className="flex justify-center my-2">
                        <span className="px-3 py-1 rounded-full bg-[var(--toss-gray-1)] text-[11px] font-bold text-[var(--toss-gray-3)]">
                          {dateLabel}
                        </span>
                      </div>
                    )}
                    {isSystemInvite ? (
                      <div className="flex justify-center my-2">
                        <span className="px-3 py-1.5 rounded-full bg-[var(--toss-blue-light)] text-[11px] font-bold text-[var(--toss-blue)]">
                          👥 {systemText}
                        </span>
                      </div>
                    ) : (
                      <div
                        ref={el => { msgRefs.current[msg.id] = el; }}
                        className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        {!isMine && (
                          <span className="text-[11px] text-[var(--toss-gray-4)] px-2 mb-1 font-bold">
                            {msg.staff?.name} {msg.staff?.position}
                          </span>
                        )}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            markMessageRead(msg);
                            setActiveActionMsg(msg); // [복구] 메시지 클릭 시 액션 메뉴 표시
                          }}
                          className={`group relative ${!msg.content ? 'p-0 bg-transparent shadow-none border-none' : 'px-3 py-2 shadow-sm border'} rounded-[12px] text-[13px] md:text-sm cursor-pointer transition-all max-w-[75%] md:max-w-[70%] ${!msg.content ? '' : isMine
                            ? 'bg-emerald-600 text-white border-transparent rounded-tr-none'
                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 rounded-tl-none hover:border-emerald-400 text-foreground'
                            }`}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => e.key === 'Enter' && markMessageRead(msg)}
                          aria-label={`${msg.staff?.name || '알 수 없음'} 메시지`}
                        >
                          {msg.reply_to_id && (() => {
                            const parent = messages.find((m: any) => m.id === msg.reply_to_id);
                            return parent ? (
                              <div
                                className={`mb-2 p-2 rounded-[10px] text-[11px] border-l-2 cursor-pointer hover:opacity-80 transition-opacity ${isMine ? 'bg-white/10 border-white/30 text-white' : 'bg-[var(--toss-gray-1)] border-[var(--toss-border)] text-[var(--foreground)]'
                                  }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  scrollToMessage(msg.reply_to_id);
                                }}
                              >
                                <span className="font-bold opacity-80">↩️ {parent.staff?.name}: </span>
                                <span className="truncate block mt-0.5">{parent.content || '📎 파일'}</span>
                              </div>
                            ) : null;
                          })()}
                          <div className={`leading-relaxed ${msg.content ? 'mb-1' : ''}`}>
                            {renderMessageContent(msg.content)}
                          </div>
                          {msg.file_url && (
                            <div className="space-y-1 mt-2" onClick={(e) => e.stopPropagation()}>
                              {isImageUrl(msg.file_url) ? (
                                <div className="relative group inline-block">
                                  <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="block">
                                    <img
                                      src={msg.file_url}
                                      alt="첨부 이미지"
                                      className={`max-w-[200px] md:max-w-[240px] max-h-[200px] rounded-[12px] object-cover ${msg.content ? 'border border-[var(--toss-border)]' : 'shadow-sm'}`}
                                    />
                                  </a>
                                  <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity inset-0 flex items-center justify-center bg-black/40 rounded-[12px] gap-2 pointer-events-none">
                                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(msg.file_url, '_blank') }} className="pointer-events-auto p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white" title="미리보기">👁️</button>
                                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(msg.file_url).then(() => alert('안전하게 링크가 복사되었습니다.')) }} className="pointer-events-auto p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white" title="공유">🔗</button>
                                    <a href={msg.file_url} download target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="pointer-events-auto p-1.5 bg-white/20 hover:bg-white/40 rounded-full text-white" title="저장">💾</a>
                                  </div>
                                </div>
                              ) : isVideoUrl(msg.file_url) ? (
                                <div className="block">
                                  <video controls className={`max-w-[200px] md:max-w-[240px] max-h-[200px] rounded-[12px] bg-black ${msg.content ? 'border border-[var(--toss-border)]' : 'shadow-sm'}`}>
                                    <source src={msg.file_url} />
                                  </video>
                                </div>
                              ) : (
                                <div className={`p-3 rounded-[12px] border ${isMine ? 'bg-white/10 border-white/20 text-white' : 'bg-[var(--toss-gray-0)] border-[var(--toss-border)] text-[var(--foreground)]'} flex items-start gap-3 shadow-sm min-w-[200px]`}>
                                  <div className="text-3xl">📄</div>
                                  <div className="flex-1 min-w-0 pt-0.5">
                                    <p className={`font-bold text-[12px] truncate mb-1`}>첨부 파일</p>
                                    <div className="flex items-center gap-1.5 mt-2">
                                      <button onClick={() => window.open(msg.file_url, '_blank')} className="text-[10px] font-bold text-[var(--toss-blue)] hover:text-blue-600 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-md">미리보기</button>
                                      <button onClick={() => { navigator.clipboard.writeText(msg.file_url).then(() => alert('공유 링크가 복사되었습니다.')) }} className="text-[10px] font-bold text-zinc-500 hover:text-zinc-600 px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded-md">공유</button>
                                      <a href={msg.file_url} download target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 rounded-md inline-block">저장</a>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {hasReacts && (
                            <div className="mt-2 flex items-center gap-2 text-[11px] flex-wrap">
                              <span className="flex gap-1 flex-wrap">
                                {Object.entries(msgReacts).map(([emoji, cnt]) =>
                                ((cnt as number) > 0 ? (
                                  <span
                                    key={emoji}
                                    className={`px-1.5 py-0.5 rounded text-[11px] ${isMine ? 'bg-white/20' : 'bg-[var(--toss-gray-1)]'
                                      }`}
                                  >
                                    {emoji} {cnt as number}
                                  </span>
                                ) : null)
                                )}
                              </span>
                            </div>
                          )}

                          <div
                            className={`absolute bottom-0 ${isMine ? 'right-full mr-2 items-end' : 'left-full ml-2 items-start'
                              } flex flex-col gap-0.5 whitespace-nowrap`}
                          >
                            {displayReadCount > 0 && (
                              <span className={`text-[10px] font-bold ${isMine ? 'text-emerald-500' : 'text-emerald-500'}`}>
                                {displayReadCount}
                              </span>
                            )}
                            <span className="text-[8px] font-bold text-[var(--toss-gray-4)]">
                              {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        <div
                          className={`flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity ${isMine ? 'flex-row-reverse' : ''}`}
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => { setReplyTo(msg); }}
                            className="p-1 px-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[10px] font-bold text-zinc-400 hover:text-blue-500 transition-colors"
                          >
                            답장
                          </button>
                          <button
                            type="button"
                            onClick={() => { setActiveActionMsg(msg); }}
                            className="p-1 px-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-[10px] font-bold text-zinc-400 hover:text-zinc-600 transition-colors"
                          >
                            더보기
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              });
            })()
          )}

          <div ref={scrollRef} />
        </div>

        {/* 입력창 — 모바일에서 하단 네비 위에 고정 */}
        <div
          className={`absolute left-0 right-0 bottom-0 md:relative p-2 md:p-3 bg-[var(--toss-card)] shrink-0 transition-all z-10 ${isDragging ? 'border-t-2 border-[var(--toss-blue)] border-dashed bg-blue-50 dark:bg-blue-900/20' : 'border-t border-[var(--toss-border)]'}`}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
          onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }}
          onDrop={async (e) => {
            e.preventDefault(); e.stopPropagation(); setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) await processFileUpload(file);
          }}
        >
          {replyTo && (
            <div className="mb-3 flex items-center justify-between bg-[var(--toss-blue-light)] p-3 rounded-[16px] border border-[var(--toss-blue-light)] animate-in slide-in-from-bottom-2">
              <p className="text-[11px] font-bold text-[var(--toss-blue)]">@{replyTo.staff?.name}님에게 답글 작성 중...</p>
              <button onClick={() => setReplyTo(null)} className="text-[var(--toss-blue)] hover:text-[var(--toss-blue)] font-semibold">✕</button>
            </div>
          )}

          <div className={`flex items-center gap-3 p-3 rounded-[16px] border transition-all ${selectedRoomId === NOTICE_ROOM_ID && user?.position && !CAN_WRITE_NOTICE_POSITIONS.includes(user.position)
            ? 'bg-[var(--toss-gray-1)] border-[var(--toss-border)] opacity-80 pointer-events-none'
            : 'bg-[var(--toss-gray-1)] border-[var(--toss-border)] focus-within:bg-[var(--toss-card)] focus-within:ring-4 focus-within:ring-[var(--toss-blue)]'
            }`}>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.hwp" />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={fileUploading}
              title="파일 첨부"
              className="w-8 h-8 flex items-center justify-center text-[var(--toss-gray-3)] hover:text-[var(--toss-blue)] transition-colors disabled:opacity-50"
            >
              {fileUploading ? <span className="animate-pulse text-xs">...</span> : '📎'}
            </button>
            <div className="relative flex-1">
              <input
                className="w-full bg-transparent p-1 px-2 outline-none text-[15px] md:text-sm font-bold min-w-0"
                placeholder={selectedRoomId === NOTICE_ROOM_ID && user?.position && !CAN_WRITE_NOTICE_POSITIONS.includes(user.position) ? "부서장 이상만 작성 가능" : "메시지를 입력하세요... (예: @이름 메모) "}
                value={inputMsg}
                onChange={e => {
                  const value = e.target.value;
                  setInputMsg(value);
                  const caret = e.target.selectionStart ?? value.length;
                  const upToCaret = value.slice(0, caret);
                  const match = upToCaret.match(/@([^\s@]{0,20})$/);
                  if (match) {
                    setMentionQuery(match[1] || '');
                    setShowMentionList(true);
                  } else {
                    setShowMentionList(false);
                    setMentionQuery('');
                  }
                }}
                onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
              />
              {showMentionList && mentionCandidates.length > 0 && (
                <div className="absolute left-0 bottom-full mb-1 w-full max-h-48 overflow-y-auto bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[12px] shadow-lg z-20 text-xs">
                  {mentionCandidates.map((m: any) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        // 마지막 @쿼리 부분을 실제 이름으로 교체
                        const value = inputMsg;
                        const match = value.match(/@([^\s@]{0,20})$/);
                        if (match) {
                          const replaced = value.replace(/@([^\s@]{0,20})$/, `@${m.name} `);
                          setInputMsg(replaced);
                        }
                        setShowMentionList(false);
                        setMentionQuery('');
                      }}
                      className="w-full px-3 py-2 flex items-center gap-2 hover:bg-[var(--toss-blue-light)] text-left"
                    >
                      <span className="text-[11px] font-semibold text-[var(--foreground)] truncate">{m.name}</span>
                      <span className="text-[11px] text-[var(--toss-gray-3)] truncate">
                        {(m.department || '')}{m.position ? ` · ${m.position}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => handleSendMessage()} className="bg-[var(--toss-blue)] text-white w-8 h-8 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center text-sm">↑</button>
          </div>
        </div>


        {/* 채팅방 상세 정보 드로어 (프리미엄 - 이미지 2 스타일) */}
        {showDrawer && (
          <>
            <div className="absolute inset-0 bg-black/10 z-50 animate-in fade-in duration-200" onClick={() => setShowDrawer(false)} aria-hidden="true" />
            <div className="absolute top-0 right-0 bottom-0 w-full md:w-80 bg-white dark:bg-zinc-900 shadow-2xl z-[60] flex flex-col animate-in slide-in-from-right duration-300 border-l border-[var(--toss-border)]">
              <div className="p-4 border-b border-[var(--toss-border)] flex items-center justify-between bg-[var(--toss-card)]">
                <span className="text-sm font-bold">채팅방 정보</span>
                <button onClick={() => setShowDrawer(false)} className="p-2 text-[var(--toss-gray-3)] hover:text-black dark:hover:text-white rounded-full">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                {/* 알림 설정 */}
                <div className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl">
                  <span className="text-sm font-semibold">알림 설정</span>
                  <button
                    onClick={() => setRoomNotifyOn(!roomNotifyOn)}
                    className={`w-12 h-6 rounded-full transition-colors relative ${roomNotifyOn ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${roomNotifyOn ? 'right-1' : 'left-1'}`} />
                  </button>
                </div>

                {/* 투표 액션 버튼 */}
                <button onClick={() => { setShowPollModal(true); setShowDrawer(false); }} className="w-full flex items-center justify-between p-3.5 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors group">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📊</span>
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300">새로운 투표 만들기</span>
                  </div>
                  <span className="text-[10px] text-blue-400 font-bold group-hover:translate-x-1 transition-transform">＞</span>
                </button>

                {/* 공지사항 섹션 */}
                <div className="space-y-3">
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider px-1">소식 / 공지</p>
                  <div className="p-4 bg-orange-50 dark:bg-orange-950/20 rounded-2xl border border-orange-100 dark:border-orange-900/30">
                    <p className="text-xs font-bold text-orange-800 dark:text-orange-300 mb-1">📢 공지</p>
                    <p className="text-xs text-orange-900/70 dark:text-orange-200/50 leading-relaxed whitespace-pre-wrap">
                      {selectedRoom?.notice_message?.content || '등록된 공지가 없습니다.'}
                    </p>
                  </div>
                </div>

                {/* 사진/동영상 (Media) Grid */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">사진 · 동영상</p>
                    <button className="text-[10px] font-bold text-[var(--toss-blue)]">전체보기</button>
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-2xl overflow-hidden">
                    {messages.filter(m => m.file_kind === 'image' || m.file_kind === 'video').slice(-6).map((m, idx) => (
                      <div key={idx} className="aspect-square bg-zinc-100 dark:bg-zinc-800 relative group cursor-pointer">
                        {m.file_kind === 'image' ? (
                          <img src={m.file_url} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">🎬</div>
                        )}
                      </div>
                    ))}
                    {messages.filter(m => m.file_kind === 'image' || m.file_kind === 'video').length === 0 && (
                      <div className="col-span-3 py-8 text-center bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-700">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">주고받은 미디어가 없습니다.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 링크 (Links) */}
                <div className="space-y-3">
                  <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider px-1">링크</p>
                  <div className="space-y-2">
                    {messages.filter(m => m.content && m.content.includes('http')).slice(-3).map((m, idx) => {
                      const urlMatch = m.content.match(/https?:\/\/[^\s]+/);
                      const url = urlMatch ? urlMatch[0] : '';
                      return (
                        <a key={idx} href={url} target="_blank" rel="noreferrer" className="block p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800 hover:border-emerald-500 transition-colors">
                          <p className="text-[11px] font-bold truncate text-emerald-600 mb-0.5">{url}</p>
                          <p className="text-[10px] text-[var(--toss-gray-4)] truncate">{m.staff?.name} · {new Date(m.created_at).toLocaleDateString()}</p>
                        </a>
                      );
                    })}
                    {messages.filter(m => m.content && m.content.includes('http')).length === 0 && (
                      <div className="py-4 text-center bg-zinc-50 dark:bg-zinc-800/30 rounded-xl border border-zinc-100 dark:border-zinc-800">
                        <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">공유된 링크가 없습니다.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* 대화 상대 (Participants) */}
                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1">
                    <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-wider">대화 상대 ({selectedRoom?.members?.length || 0})</p>
                    <button onClick={() => setShowGroupModal(true)} className="w-6 h-6 flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 rounded-full text-zinc-500 hover:text-emerald-500 transition-colors">＋</button>
                  </div>
                  <div className="space-y-3">
                    {selectedRoom?.members?.map((memberId: string) => {
                      const s = staffs.find((st: any) => st.id === memberId);
                      const isOwner = selectedRoom?.created_by === user.id;
                      return (
                        <div key={memberId} className="flex items-center justify-between group">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-[10px] font-bold text-emerald-600">
                              {s?.photo_url ? <img src={s.photo_url} className="w-full h-full rounded-full object-cover" /> : (s?.name?.[0] || '?')}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-foreground">{s?.name || '알 수 없음'}</p>
                              <p className="text-[10px] text-[var(--toss-gray-4)] font-medium">{(s?.department || '')} · {s?.position}</p>
                            </div>
                          </div>
                          {isOwner && memberId !== user.id && (
                            <button className="opacity-0 group-hover:opacity-100 p-1 text-red-500 text-[10px] font-bold hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all">내보내기</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* 하단 액션 */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border-t border-[var(--toss-border)] flex gap-2">
                <button onClick={() => { if (confirm('채팅방을 나가시겠습니까?')) { /* 채팅방 나가기 로직 */ } }} className="flex-1 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl text-[11px] font-bold hover:bg-red-100 transition-colors">방 나가기</button>
                <button onClick={() => { setEditingRoomName(true); setRoomNameDraft(selectedRoom?.name || ''); }} className="flex-1 py-3 bg-[var(--toss-gray-1)] text-foreground rounded-xl text-[11px] font-bold hover:bg-[var(--toss-gray-2)] transition-colors">이름 수정</button>
              </div>
            </div>
          </>
        )}

        {/* 메시지 액션 패널 - PC: 사이드 / 모바일: 바텀시트 */}
        {activeActionMsg && (
          <>
            <div className="absolute inset-0 bg-black/10 z-30 animate-in fade-in duration-200" onClick={() => { setActiveActionMsg(null); setEditingMsg(null); }} aria-hidden="true" />

            {/* 모바일 전용 바텀 시트 (이미지 1 스타일) */}
            <div className="md:hidden absolute left-0 right-0 bottom-0 bg-white dark:bg-zinc-900 rounded-t-[24px] shadow-2xl z-40 flex flex-col animate-in slide-in-from-bottom duration-300 max-h-[85vh] overflow-hidden">
              <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full mx-auto my-3 shrink-0" />
              <div className="px-4 pb-8 space-y-4 overflow-y-auto">
                {/* 이모티콘 반응바 */}
                <div className="flex justify-between items-center bg-zinc-100 dark:bg-zinc-800/50 p-2 rounded-[20px] gap-1 px-4">
                  {['👍', '👌', '👏', '😍', '😆', '😲', '😢', '😡'].map(emoji => (
                    <button key={emoji} onClick={() => { toggleReaction(activeActionMsg.id, emoji); setActiveActionMsg(null); }} className="text-2xl hover:scale-110 transition-transform p-1">{emoji}</button>
                  ))}
                </div>
                {/* 메뉴 리스트 */}
                <div className="space-y-1">
                  <button onClick={() => { handleAction('task'); setActiveActionMsg(null) }} className="w-full flex items-center gap-4 p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-[12px] transition-colors">
                    <span className="text-xl">✅</span>
                    <span className="text-sm font-bold">할일 추가</span>
                  </button>
                  <button onClick={async () => { if (!activeActionMsg) return; await supabase.from('chat_rooms').update({ notice_message_id: activeActionMsg.id }).eq('id', selectedRoomId); alert('공지로 등록되었습니다.'); fetchData(); setActiveActionMsg(null); }} className="w-full flex items-center gap-4 p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-[12px] transition-colors">
                    <span className="text-xl">📢</span>
                    <span className="text-sm font-bold">공지</span>
                  </button>
                  <button onClick={async () => { await navigator.clipboard?.writeText(activeActionMsg.content || ''); alert('복사되었습니다.'); setActiveActionMsg(null); }} className="w-full flex items-center gap-4 p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-[12px] transition-colors">
                    <span className="text-xl">📋</span>
                    <span className="text-sm font-bold">복사</span>
                  </button>
                  {activeActionMsg.sender_id === user.id && (
                    <button onClick={() => { deleteMessage(activeActionMsg); setActiveActionMsg(null) }} className="w-full flex items-center gap-4 p-4 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-[12px] transition-colors text-red-500">
                      <span className="text-xl">🗑️</span>
                      <span className="text-sm font-bold">삭제</span>
                    </button>
                  )}
                  <button onClick={() => { setReplyTo(activeActionMsg); setActiveActionMsg(null) }} className="w-full flex items-center gap-4 p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-[12px] transition-colors">
                    <span className="text-xl">↩️</span>
                    <span className="text-sm font-bold">답장</span>
                  </button>
                  <button onClick={() => { setForwardSourceMsg(activeActionMsg); setShowForwardModal(true); setActiveActionMsg(null); }} className="w-full flex items-center gap-4 p-4 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-[12px] transition-colors">
                    <span className="text-xl">📤</span>
                    <span className="text-sm font-bold">전달</span>
                  </button>
                </div>
              </div>
            </div>

            {/* PC 전용 우측 사이드 패널 (기존 유지) */}
            <div className="hidden md:flex absolute top-0 right-0 bottom-0 w-80 bg-[var(--toss-card)] border-l border-[var(--toss-border)] shadow-2xl z-40 flex-col animate-in slide-in-from-right duration-300">
              <div className="p-4 border-b border-[var(--toss-border)] flex items-center justify-between">
                <span className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">메시지 액션</span>
                <button onClick={() => { setActiveActionMsg(null); setEditingMsg(null) }} className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[12px] hover:bg-[var(--toss-gray-1)]">✕</button>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">감정 표현</p>
                <div className="flex gap-2 flex-wrap">
                  {['👍', '😂', '❤️', '😮', '😢'].map(emoji => (
                    <button key={emoji} onClick={() => { toggleReaction(activeActionMsg.id, emoji); }} className="w-11 h-11 flex items-center justify-center rounded-[12px] bg-[var(--toss-gray-1)] hover:bg-[var(--toss-blue-light)] text-xl transition-colors" title={emoji}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase pt-2">기능</p>
                <div className="space-y-1">
                  <button
                    onClick={() => {
                      setReplyTo(activeActionMsg);
                      setActiveActionMsg(null);
                    }}
                    className="w-full p-3 text-left hover:bg-[var(--toss-gray-1)] rounded-[12px] text-xs font-semibold transition-colors"
                  >
                    💬 답글 달기
                  </button>
                  {activeActionMsg.sender_id === user.id && (
                    <>
                      <button onClick={() => { setEditingMsg(activeActionMsg); setEditContent(activeActionMsg.content || ''); setActiveActionMsg(null) }} className="w-full p-3 text-left hover:bg-[var(--toss-gray-1)] rounded-[12px] text-xs font-semibold transition-colors">✏️ 수정</button>
                      <button onClick={() => { deleteMessage(activeActionMsg); setActiveActionMsg(null) }} className="w-full p-3 text-left hover:bg-red-50 rounded-[12px] text-xs font-semibold text-red-600 transition-colors">🗑️ 삭제</button>
                    </>
                  )}
                  <button
                    onClick={async () => {
                      if (!activeActionMsg) return;
                      try {
                        const { error } = await supabase
                          .from('chat_rooms')
                          .update({ notice_message_id: activeActionMsg.id })
                          .eq('id', selectedRoomId);
                        if (error) throw error;
                        alert('공지로 등록되었습니다.');
                        fetchData();
                      } catch (err) {
                        alert('공지 등록 중 오류가 발생했습니다.');
                      }
                      setActiveActionMsg(null);
                    }}
                    className="w-full p-3 text-left hover:bg-orange-50 rounded-[12px] text-xs font-semibold text-orange-600 transition-colors"
                  >
                    📢 공지로 등록
                  </button>
                  <button onClick={() => { handleAction('task'); setActiveActionMsg(null) }} className="w-full p-3 text-left hover:bg-[var(--toss-gray-1)] rounded-[12px] text-xs font-semibold transition-colors">✅ 할일로 등록</button>
                  <button
                    onClick={() => {
                      loadReadStatusForMessage(activeActionMsg);
                      setActiveActionMsg(null);
                    }}
                    className="w-full p-3 text-left hover:bg-[var(--toss-gray-1)] rounded-[12px] text-xs font-semibold transition-colors"
                  >
                    👀 읽음 확인
                  </button>
                  <button
                    onClick={() => {
                      setForwardSourceMsg(activeActionMsg);
                      setShowForwardModal(true);
                      setActiveActionMsg(null);
                    }}
                    className="w-full p-3 text-left hover:bg-[var(--toss-gray-1)] rounded-[12px] text-xs font-semibold transition-colors"
                  >
                    📤 다른 채팅방으로 전달
                  </button>
                  <button onClick={() => { setThreadRoot(activeActionMsg); setActiveActionMsg(null); }} className="w-full p-3 text-left hover:bg-[var(--toss-blue-light)] rounded-[12px] text-xs font-semibold text-[var(--toss-blue)] transition-colors">🧵 이 메시지 스레드 보기</button>
                  <button onClick={async () => { try { const base = `[채팅] ${activeActionMsg.staff?.name || '알 수 없음'} (${new Date(activeActionMsg.created_at).toLocaleString('ko-KR')})\n${activeActionMsg.content || ''}${activeActionMsg.file_url ? `\n파일: ${activeActionMsg.file_url}` : ''}`; await navigator.clipboard?.writeText(`[전자결재 메모]\n${base}`); alert('전자결재용으로 복사되었습니다.'); } catch { alert('복사 실패'); } setActiveActionMsg(null); }} className="w-full p-3 text-left hover:bg-[var(--toss-gray-1)] rounded-[12px] text-xs font-semibold transition-colors">📋 전자결재용 내용 복사</button>
                  <button onClick={async () => { try { const base = `[채팅] ${activeActionMsg.staff?.name || '알 수 없음'} (${new Date(activeActionMsg.created_at).toLocaleString('ko-KR')})\n${activeActionMsg.content || ''}${activeActionMsg.file_url ? `\n파일: ${activeActionMsg.file_url}` : ''}`; await navigator.clipboard?.writeText(`[게시판 메모]\n${base}`); alert('게시판용으로 복사되었습니다.'); } catch { alert('복사 실패'); } setActiveActionMsg(null); }} className="w-full p-3 text-left hover:bg-[var(--toss-gray-1)] rounded-[12px] text-xs font-semibold transition-colors">📝 게시판용 내용 복사</button>
                  <button
                    onClick={async () => {
                      try {
                        const isBookmarked = bookmarkedIds.has(activeActionMsg.id);
                        if (isBookmarked) {
                          await supabase
                            .from('message_bookmarks')
                            .delete()
                            .eq('user_id', user.id)
                            .eq('message_id', activeActionMsg.id);
                          setBookmarkedIds(prev => {
                            const next = new Set(prev);
                            next.delete(activeActionMsg.id);
                            return next;
                          });
                        } else {
                          await supabase.from('message_bookmarks').insert([
                            {
                              user_id: user.id,
                              message_id: activeActionMsg.id,
                              room_id: selectedRoomId,
                            },
                          ]);
                          setBookmarkedIds(prev => new Set(prev).add(activeActionMsg.id));
                        }
                      } catch {
                        alert('북마크 처리 중 오류가 발생했습니다.');
                      }
                      setActiveActionMsg(null);
                    }}
                    className="w-full p-3 text-left hover:bg-[var(--toss-gray-1)] rounded-[12px] text-xs font-semibold transition-colors"
                  >
                    {bookmarkedIds.has(activeActionMsg.id) ? '⭐ 북마크 해제' : '⭐ 중요 메시지 북마크'}
                  </button>
                  <button onClick={() => { togglePin(activeActionMsg.id); setActiveActionMsg(null) }} className={`w-full p-3 text-left rounded-[12px] text-xs font-semibold transition-colors ${pinnedIds.includes(activeActionMsg.id) ? 'hover:bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)]' : 'hover:bg-orange-50 text-orange-500'}`}>{pinnedIds.includes(activeActionMsg.id) ? '📢 공지 해제' : '📢 공지로 등록'}</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 수정 모달 */}
        {editingMsg && (
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-30" onClick={() => { setEditingMsg(null); setEditContent(''); }}>
            <div className="bg-[var(--toss-card)] p-6 rounded-[12px] w-80 shadow-2xl" onClick={e => e.stopPropagation()}>
              <p className="text-xs font-semibold text-[var(--toss-gray-3)] mb-2">메시지 수정</p>
              <input value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full p-3 border rounded-[16px] text-sm mb-4" />
              <div className="flex gap-2">
                <button onClick={() => { setEditingMsg(null); setEditContent(''); }} className="flex-1 py-2 bg-[var(--toss-gray-1)] rounded-[16px] text-xs font-semibold">취소</button>
                <button onClick={saveEditMessage} className="flex-1 py-2 bg-[var(--toss-blue)] text-white rounded-[16px] text-xs font-semibold">저장</button>
              </div>
            </div>
          </div>
        )}

        {/* 단체방 생성 모달 */}
        {showGroupModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-[110] p-4" onClick={() => setShowGroupModal(false)}>
            <div className="bg-[var(--toss-card)] w-full max-w-md rounded-[3rem] p-10 shadow-2xl space-y-8" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-semibold text-[var(--foreground)] italic">새 단체 채팅방</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest ml-1">방 이름</label>
                  <input value={groupName} onChange={e => setGroupName(e.target.value)} className="w-full p-4 bg-[var(--input-bg)] rounded-[12px] border-none outline-none font-bold text-sm focus:ring-2 focus:ring-[var(--toss-blue)]" placeholder="예: 행정팀 단체방" />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest ml-1">멤버 선택 ({selectedMembers.length}명)</label>
                  <div className="h-48 overflow-y-auto border border-[var(--toss-border)] rounded-[12px] p-4 space-y-2 custom-scrollbar bg-[var(--toss-gray-1)]/30">
                    {staffs.filter((s: any) => s.id !== user.id).map((s: any) => (
                      <label key={s.id} className="flex items-center gap-3 p-3 bg-[var(--toss-card)] rounded-[16px] border border-[var(--toss-border)] cursor-pointer hover:border-[var(--toss-blue)] transition-all">
                        <input type="checkbox" checked={selectedMembers.includes(s.id)} onChange={e => {
                          if (e.target.checked) setSelectedMembers([...selectedMembers, s.id]);
                          else setSelectedMembers(selectedMembers.filter(id => id !== s.id));
                        }} className="w-4 h-4 rounded border-[var(--toss-border)] text-[var(--toss-blue)] focus:ring-[var(--toss-blue)]" />
                        <span className="text-xs font-bold text-[var(--foreground)]">{s.name} ({s.position})</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowGroupModal(false)} className="flex-1 py-4 bg-[var(--toss-gray-1)] text-[var(--toss-gray-3)] rounded-[12px] font-semibold text-xs">취소</button>
                  <button onClick={createGroupChat} className="flex-2 py-4 bg-[var(--toss-blue)] text-white rounded-[12px] font-semibold text-xs shadow-lg shadow-[var(--toss-blue)]">채팅방 생성</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 투표 생성 모달 */}
      {showPollModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4">
          <div className="bg-[var(--toss-card)] w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-[var(--toss-border)]">
            <h3 className="text-lg font-semibold text-[var(--foreground)]">새 투표 만들기</h3>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
              질문과 선택지를 입력하세요. 선택지는 콤마(,)로 구분합니다.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">질문</label>
                <input
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full mt-1 p-3 bg-[var(--input-bg)] border border-[var(--toss-border)] rounded-[16px] text-xs font-bold outline-none focus:border-[var(--toss-blue)]"
                  placeholder="예: 이번 주 회의 시간은 언제가 좋을까요?"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">선택지</label>
                <div className="mt-1 space-y-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        value={opt}
                        onChange={(e) => {
                          const newOpts = [...pollOptions];
                          newOpts[idx] = e.target.value;
                          setPollOptions(newOpts);
                        }}
                        className="flex-1 p-3 bg-[var(--input-bg)] border border-[var(--toss-border)] rounded-[16px] text-xs font-bold outline-none focus:border-[var(--toss-blue)]"
                        placeholder={`선택지 ${idx + 1}`}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                          className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-500 rounded-xl hover:bg-red-100"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPollOptions([...pollOptions, ''])}
                    className="w-full py-3 border-2 border-dashed border-zinc-200 rounded-xl text-xs font-bold text-zinc-500 hover:text-blue-500 hover:border-blue-300"
                  >
                    + 항목 추가
                  </button>
                </div>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPollModal(false)}
                className="flex-1 py-3 rounded-[16px] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreatePoll}
                className="flex-1 py-3 rounded-[16px] text-[11px] font-semibold bg-[var(--toss-blue)] text-white hover:bg-[var(--toss-blue)] shadow-md"
              >
                투표 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 슬래시 명령 폼 모달 (/연차, /발주) */}
      {showSlashModal && slashCommand && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={() => setShowSlashModal(false)}>
          <div className="bg-[var(--toss-card)] w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-[var(--toss-border)]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              {slashCommand === 'annual_leave' ? '🗓️ 연차 신청 초안 만들기' : '📦 발주 요청 초안 만들기'}
            </h3>
            {slashCommand === 'annual_leave' ? (
              <>
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
                  시작일/종료일과 사유를 입력하면 전자결재에 연차/휴가 기안 초안이 생성됩니다.
                </p>
                <div className="space-y-3 text-xs font-bold">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">시작일</label>
                      <input
                        type="date"
                        value={slashForm.startDate}
                        onChange={e => setSlashForm((f: any) => ({ ...f, startDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[16px] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">종료일</label>
                      <input
                        type="date"
                        value={slashForm.endDate}
                        onChange={e => setSlashForm((f: any) => ({ ...f, endDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[16px] text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">사유(선택)</label>
                    <input
                      type="text"
                      value={slashForm.reason}
                      onChange={e => setSlashForm((f: any) => ({ ...f, reason: e.target.value }))}
                      placeholder="예: 개인 일정, 병원 방문 등"
                      className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[16px] text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSlashModal(false)}
                    className="flex-1 py-3 rounded-[16px] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!slashForm.startDate || !slashForm.endDate) {
                        alert('시작일과 종료일을 입력해 주세요.');
                        return;
                      }
                      try {
                        const title = `[채팅]/연차 자동 기안 - ${user.name}`;
                        const contentLines = [
                          `신청자: ${user.name} (${user.department || ''} ${user.position || ''})`,
                          `기간: ${slashForm.startDate} ~ ${slashForm.endDate}`,
                          slashForm.reason ? `사유: ${slashForm.reason}` : '',
                          '',
                          `※ 이 신청서는 채팅 명령어(/연차)로 자동 생성되었습니다.`,
                        ].filter(Boolean);
                        await supabase.from('approvals').insert([
                          {
                            sender_id: user.id,
                            sender_name: user.name,
                            sender_company: user.company,
                            type: '연차/휴가',
                            title,
                            content: contentLines.join('\n'),
                            status: '대기',
                          },
                        ]);
                        alert('연차/휴가 전자결재 초안이 생성되었습니다. 전자결재 메뉴에서 내용을 확인·제출해 주세요.');
                      } catch {
                        alert('연차 초안 생성 중 오류가 발생했습니다.');
                      } finally {
                        setShowSlashModal(false);
                      }
                    }}
                    className="flex-1 py-3 rounded-[16px] text-[11px] font-semibold bg-[var(--toss-blue)] text-white hover:bg-[var(--toss-blue)] shadow-md"
                  >
                    전자결재 초안 생성
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
                  품목명과 수량을 입력하면 비품구매(발주) 결재 초안이 생성됩니다.
                </p>
                <div className="space-y-3 text-xs font-bold">
                  <div>
                    <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">품목명</label>
                    <input
                      type="text"
                      value={slashForm.itemName}
                      onChange={e => setSlashForm((f: any) => ({ ...f, itemName: e.target.value }))}
                      placeholder="예: A사 프린터 토너"
                      className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[16px] text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">수량</label>
                      <input
                        type="number"
                        min={1}
                        value={slashForm.quantity}
                        onChange={e => setSlashForm((f: any) => ({ ...f, quantity: Number(e.target.value) || 1 }))}
                        className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[16px] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[var(--toss-gray-3)] mb-1">비고(선택)</label>
                      <input
                        type="text"
                        value={slashForm.reason}
                        onChange={e => setSlashForm((f: any) => ({ ...f, reason: e.target.value }))}
                        placeholder="예: 재고 부족, 교체 주기 도래 등"
                        className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[16px] text-xs"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSlashModal(false)}
                    className="flex-1 py-3 rounded-[16px] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!slashForm.itemName || !slashForm.quantity) {
                        alert('품목명과 수량을 입력해 주세요.');
                        return;
                      }
                      try {
                        const title = `[채팅]/발주 자동 기안 - ${slashForm.itemName} x ${slashForm.quantity}`;
                        const contentLines = [
                          `요청자: ${user.name} (${user.department || ''} ${user.position || ''})`,
                          `품목: ${slashForm.itemName}`,
                          `수량: ${slashForm.quantity}`,
                          slashForm.reason ? `비고: ${slashForm.reason}` : '',
                          '',
                          `※ 이 신청서는 채팅 명령어(/발주)로 자동 생성되었습니다.`,
                        ].filter(Boolean);
                        await supabase.from('approvals').insert([
                          {
                            sender_id: user.id,
                            sender_name: user.name,
                            sender_company: user.company,
                            type: '비품구매',
                            title,
                            content: contentLines.join('\n'),
                            status: '대기',
                          },
                        ]);
                        alert('비품구매 전자결재 초안이 생성되었습니다. 전자결재 메뉴에서 내용을 확인·제출해 주세요.');
                      } catch {
                        alert('발주 초안 생성 중 오류가 발생했습니다.');
                      } finally {
                        setShowSlashModal(false);
                      }
                    }}
                    className="flex-1 py-3 rounded-[16px] text-[11px] font-semibold bg-[var(--toss-blue)] text-white hover:bg-[var(--toss-blue)] shadow-md"
                  >
                    전자결재 초안 생성
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 스레드 뷰 패널 */}
      {threadRoot && (
        <>
          <div
            className="absolute inset-0 bg-black/10 z-40"
            onClick={() => setThreadRoot(null)}
            aria-hidden="true"
          />
          <aside className="absolute top-0 right-0 bottom-0 w-80 bg-[var(--toss-card)] border-l border-[var(--toss-border)] shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-[var(--toss-border)] flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
                  스레드
                </p>
                <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5 line-clamp-2">
                  {threadRoot.content || '📎 파일 메시지'}
                </p>
              </div>
              <button
                onClick={() => setThreadRoot(null)}
                className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[12px] hover:bg-[var(--toss-gray-1)]"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
              {threadMessages.length === 0 ? (
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold mt-4 text-center">
                  이 메시지에 연결된 대화가 없습니다.
                </p>
              ) : (
                threadMessages.map((m: any) => {
                  const isRoot = m.id === threadRoot.id;
                  const staff = m.staff || staffs.find((s: any) => s.id === m.sender_id);
                  const createdAt = new Date(m.created_at);
                  return (
                    <div
                      key={m.id}
                      className={`border rounded-[12px] p-3 text-[11px] space-y-1 ${isRoot ? 'bg-[var(--toss-blue-light)] border-[var(--toss-blue)]' : 'bg-[var(--toss-gray-1)] border-[var(--toss-border)]'
                        }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[var(--foreground)] truncate">
                          {staff?.name || '알 수 없음'} {staff?.position || ''}
                        </span>
                        <span className="text-[11px] text-[var(--toss-gray-3)]">
                          {createdAt.toLocaleDateString('ko-KR', {
                            month: 'numeric',
                            day: 'numeric',
                          })}{' '}
                          {createdAt.toLocaleTimeString('ko-KR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--foreground)] whitespace-pre-wrap break-words">
                        {m.content || '📎 파일 메시지'}
                      </p>
                      {m.file_url && (
                        <a
                          href={m.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 mt-1 rounded-[12px] bg-[var(--toss-card)] border border-[var(--toss-border)] text-[11px] font-bold text-[var(--toss-blue)] hover:bg-[var(--toss-blue-light)]"
                        >
                          📎 파일 열기
                        </a>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        </>
      )}

      {/* 읽음 확인 상세 모달 */}
      {unreadModalMsg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={() => setUnreadModalMsg(null)}>
          <div className="bg-[var(--toss-card)] w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-[var(--toss-border)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest">
                  읽음 확인 상세
                </p>
                <p className="text-xs font-semibold text-[var(--foreground)] mt-0.5 line-clamp-1 opacity-60">
                  {unreadModalMsg.content || '📎 파일 메시지'}
                </p>
              </div>
              <button
                onClick={() => setUnreadModalMsg(null)}
                className="p-2 text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)] rounded-[12px] hover:bg-[var(--toss-gray-1)]"
              >
                ✕
              </button>
            </div>

            <div className="border-t border-[var(--toss-border)] pt-3 max-h-[60vh] overflow-y-auto custom-scrollbar space-y-6">
              {unreadLoading ? (
                <div className="py-8 flex justify-center">
                  <div className="w-6 h-6 border-2 border-[var(--toss-border)] border-t-[var(--toss-blue)] rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* 안 읽은 멤버 섹션 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider">읽지 않음 ({unreadUsers.length})</p>
                    </div>
                    {unreadUsers.length === 0 ? (
                      <p className="text-[10px] text-zinc-400 font-bold py-2 px-1">모두가 읽었습니다.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1">
                        {unreadUsers.map((u: any) => (
                          <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/30">
                            <div className="w-7 h-7 rounded-lg bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-bold text-zinc-400 overflow-hidden">
                              {u.photo_url ? <img src={u.photo_url} className="w-full h-full object-cover" /> : u.name[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-foreground truncate">{u.name}</p>
                              <p className="text-[9px] font-bold text-zinc-400 truncate">{(u.department || '')} {u.position}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 읽은 멤버 섹션 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <p className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">읽음 ({readUsers.length})</p>
                    </div>
                    {readUsers.length === 0 ? (
                      <p className="text-[10px] text-zinc-400 font-bold py-2 px-1">아직 읽은 사람이 없습니다.</p>
                    ) : (
                      <div className="grid grid-cols-1 gap-1">
                        {readUsers.map((u: any) => (
                          <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/30">
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-[10px] font-bold text-emerald-600 overflow-hidden">
                              {u.photo_url ? <img src={u.photo_url} className="w-full h-full object-cover" /> : u.name[0]}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-bold text-foreground truncate">{u.name}</p>
                              <p className="text-[9px] font-bold text-zinc-400 truncate">{(u.department || '')} {u.position}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 메시지 전달 모달 */}
      {showForwardModal && forwardSourceMsg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4" onClick={() => { setShowForwardModal(false); setForwardSourceMsg(null); }}>
          <div className="bg-[var(--toss-card)] w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-[var(--toss-border)]" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">📤 다른 채팅방으로 전달</h3>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
              선택한 메시지를 전달할 채팅방을 선택하세요.
            </p>
            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-2">
              {chatRooms
                .filter((r: any) => r.id !== selectedRoomId)
                .map((room: any) => (
                  <button
                    key={room.id}
                    type="button"
                    onClick={async () => {
                      try {
                        await supabase.from('messages').insert([
                          {
                            room_id: room.id,
                            sender_id: user.id,
                            content:
                              `[전달] ${forwardSourceMsg.staff?.name || '알 수 없음'}: ` +
                              (forwardSourceMsg.content || '📎 파일'),
                            file_url: forwardSourceMsg.file_url || null,
                          },
                        ]);
                        alert(`"${room.name || '채팅방'}"으로 메시지가 전달되었습니다.`);
                      } catch {
                        alert('메시지 전달 중 오류가 발생했습니다.');
                      } finally {
                        setShowForwardModal(false);
                        setForwardSourceMsg(null);
                      }
                    }}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-[12px] border border-[var(--toss-border)] hover:bg-[var(--toss-blue-light)] text-left text-xs font-bold text-[var(--foreground)]"
                  >
                    <span className="truncate">
                      {room.id === NOTICE_ROOM_ID ? '📢 ' : '👥 '}
                      {room.name || '채팅방'}
                    </span>
                    <span className="text-[11px] text-[var(--toss-gray-3)]">
                      {roomUnreadCounts[room.id] ? `안읽음 ${roomUnreadCounts[room.id]}건` : ''}
                    </span>
                  </button>
                ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowForwardModal(false); setForwardSourceMsg(null); }}
                className="flex-1 py-3 rounded-[16px] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 채팅방 대화상대 추가 모달 */}
      {showAddMemberModal && selectedRoom && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[110] p-4"
          onClick={() => {
            setShowAddMemberModal(false);
            setAddMemberSelectingIds([]);
          }}
        >
          <div
            className="bg-[var(--toss-card)] w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-[var(--toss-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              👥 대화상대 추가
            </h3>
            <p className="text-[11px] text-[var(--toss-gray-3)] font-bold">
              현재 채팅방에 새로 초대할 직원을 선택하세요.
            </p>
            <input
              type="text"
              value={addMemberSearch}
              onChange={(e) => setAddMemberSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-[16px] border border-[var(--toss-border)] text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--toss-blue)]/30"
              placeholder="이름, 부서, 직급으로 검색"
            />
            <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1">
              {addableMembers.length === 0 ? (
                <p className="text-[11px] text-[var(--toss-gray-3)] font-bold py-4 text-center">
                  추가할 수 있는 직원이 없습니다.
                </p>
              ) : (
                addableMembers.map((s: any) => {
                  const checked = addMemberSelectingIds.includes(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-3 py-2 rounded-[16px] border border-[var(--toss-border)] hover:bg-[var(--toss-gray-1)] cursor-pointer text-[11px]"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setAddMemberSelectingIds((prev) =>
                              prev.includes(s.id) ? prev : [...prev, s.id]
                            );
                          } else {
                            setAddMemberSelectingIds((prev) =>
                              prev.filter((id) => id !== s.id)
                            );
                          }
                        }}
                        className="w-3 h-3"
                      />
                      <span className="flex-1">
                        <span className="font-semibold text-[var(--foreground)]">
                          {s.name}
                        </span>
                        <span className="ml-1 text-[var(--toss-gray-3)]">
                          {s.position ? ` ${s.position}` : ''}
                          {s.company || s.department
                            ? ` · ${s.company || s.department}`
                            : ''}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddMemberModal(false);
                  setAddMemberSelectingIds([]);
                }}
                className="flex-1 py-3 rounded-[16px] text-[11px] font-semibold text-[var(--toss-gray-3)] hover:bg-[var(--toss-gray-1)]"
              >
                취소
              </button>
              <button
                type="button"
                disabled={addMemberSelectingIds.length === 0}
                onClick={async () => {
                  if (!selectedRoom) return;
                  try {
                    const currentMembers: any[] = Array.isArray(
                      selectedRoom.members
                    )
                      ? selectedRoom.members
                      : [];
                    const setIds = new Set(
                      currentMembers.map((id: any) => String(id))
                    );
                    addMemberSelectingIds.forEach((id) =>
                      setIds.add(String(id))
                    );
                    const newMembers = Array.from(setIds);

                    await supabase
                      .from('chat_rooms')
                      .update({ members: newMembers })
                      .eq('id', selectedRoom.id);

                    const invitedNames = addMemberSelectingIds
                      .map((id) => staffs.find((s: any) => s.id === id)?.name || '알 수 없음')
                      .join(', ');
                    const inviterName = user?.name || '알 수 없음';
                    const systemContent = `[초대] ${inviterName}님이 ${invitedNames}님을 초대했습니다.`;
                    await supabase.from('messages').insert([{
                      room_id: selectedRoom.id,
                      sender_id: user.id,
                      content: systemContent,
                    }]);

                    setChatRooms((prev) =>
                      prev.map((room: any) =>
                        room.id === selectedRoom.id
                          ? { ...room, members: newMembers }
                          : room
                      )
                    );
                    setShowAddMemberModal(false);
                    setAddMemberSelectingIds([]);
                    fetchData();
                    alert('대화상대가 추가되었습니다.');
                  } catch (e) {
                    console.error('add members error', e);
                    alert('대화상대 추가 중 오류가 발생했습니다.');
                  }
                }}
                className="flex-1 py-3 rounded-[16px] text-[11px] font-semibold text-white bg-[var(--toss-blue)] disabled:bg-[var(--toss-gray-3)] hover:bg-[var(--toss-blue)]"
              >
                추가하기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 우측 미디어 패널 */}
      {showMediaPanel && (
        <>
          <div className="fixed inset-0 bg-black/5 z-[100] md:z-30 animate-in fade-in" onClick={() => setShowMediaPanel(false)} />
          <aside className="fixed top-0 right-0 bottom-0 w-80 bg-[var(--toss-card)] border-l border-[var(--toss-border)] shadow-2xl z-[101] md:z-40 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-[var(--toss-border)] flex items-center justify-between">
              <span className="text-xs font-black text-zinc-500 uppercase tracking-widest">파일/링크 내역</span>
              <button onClick={() => setShowMediaPanel(false)} className="p-2 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl">✕</button>
            </div>

            <div className="flex p-2 gap-1 bg-zinc-50 dark:bg-zinc-900 border-b border-[var(--toss-border)]">
              {(['all', 'image', 'file'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setMediaFilter(f)}
                  className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition-all ${mediaFilter === f ? 'bg-white dark:bg-zinc-800 text-blue-600 shadow-soft' : 'text-zinc-400 hover:text-zinc-600'}`}
                >
                  {f === 'all' ? '전체' : f === 'image' ? '이미지' : '파일'}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {filteredMediaMessages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center opacity-30 text-zinc-400">
                  <span className="text-4xl mb-2">📂</span>
                  <p className="text-[11px] font-bold">내역이 없습니다.</p>
                </div>
              ) : (
                filteredMediaMessages.map((m: any) => (
                  <div key={m.id} className="p-3 bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800 rounded-xl hover:border-blue-300 transition-all group">
                    {isImageUrl(m.file_url) ? (
                      <img src={m.file_url} className="w-full h-24 object-cover rounded-lg mb-2 cursor-pointer" onClick={() => window.open(m.file_url)} />
                    ) : (
                      <div className="w-full h-12 bg-zinc-100 dark:bg-zinc-800 rounded-lg mb-2 flex items-center justify-center text-xl">📄</div>
                    )}
                    <div className="flex flex-col gap-1 min-w-0">
                      <p className="text-[11px] font-bold text-foreground truncate">{m.content || '이름 없음'}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-zinc-400">{new Date(m.created_at).toLocaleDateString()}</span>
                        <a href={m.file_url} target="_blank" className="text-[10px] font-bold text-blue-600 hover:underline">다운로드</a>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </aside>
        </>
      )}

      {/* 투표 생성 모달 */}
      {showPollModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[200] p-4 animate-in fade-in" onClick={() => setShowPollModal(false)}>
          <div className="bg-[var(--toss-card)] w-full max-w-sm rounded-3xl p-6 space-y-5 shadow-2xl border border-[var(--toss-border)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-foreground">📊 새로운 투표</h3>
              <button onClick={() => setShowPollModal(false)} className="text-zinc-400 text-xl font-bold">✕</button>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest pl-1">질문</label>
                <input
                  className="w-full px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                  placeholder="무엇을 투표할까요?"
                  value={pollQuestion}
                  onChange={e => setPollQuestion(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-black text-zinc-400 uppercase tracking-widest pl-1">선택지</label>
                <div className="space-y-2">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        className="flex-1 px-4 py-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500/30 transition-all"
                        placeholder={`선택지 ${idx + 1}`}
                        value={opt}
                        onChange={e => {
                          const newOpts = [...pollOptions];
                          newOpts[idx] = e.target.value;
                          setPollOptions(newOpts);
                        }}
                      />
                      {pollOptions.length > 2 && (
                        <button
                          onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                          className="w-10 h-10 flex items-center justify-center bg-red-50 dark:bg-red-900/20 text-red-500 rounded-xl hover:bg-red-100 transition-colors"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={() => setPollOptions([...pollOptions, ''])}
                    className="w-full py-3 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-bold text-zinc-500 hover:text-blue-500 hover:border-blue-300 transition-colors"
                  >
                    + 항목 추가
                  </button>
                </div>
              </div>
            </div>
            <button
              onClick={async () => {
                const validOptions = pollOptions.map(o => o.trim()).filter(Boolean);
                if (!pollQuestion.trim() || validOptions.length === 0) return alert("질문과 선택지를 입력해주세요.");
                if (validOptions.length < 2) return alert("최소 2개 이상의 선택지가 필요합니다.");

                const { error } = await supabase.from('polls').insert([{
                  room_id: selectedRoomId,
                  creator_id: user.id,
                  question: pollQuestion,
                  options: validOptions
                }]);

                if (!error) {
                  setPollQuestion('');
                  setPollOptions(['찬성', '반대']);
                  setShowPollModal(false);
                  fetchData();
                  alert("투표가 생성되었습니다.");
                } else {
                  alert("투표 생성에 실패했습니다.");
                }
              }}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl text-[13px] font-black shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              투표 만들기
            </button>
          </div>
        </div>
      )}

      {/* 전역 메시지 검색 모달 */}
      {showGlobalSearch && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200] flex items-start md:items-center justify-center p-4 pt-12 md:p-6 animate-in fade-in" onClick={() => setShowGlobalSearch(false)}>
          <div className="bg-white dark:bg-zinc-900 w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] md:max-h-[85vh] border border-zinc-200 dark:border-zinc-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 md:p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-3">
              <span className="text-xl">🔍</span>
              <input
                autoFocus
                value={globalSearchQuery}
                onChange={e => setGlobalSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGlobalSearch()}
                placeholder="전체 채팅방 내용 검색..."
                className="flex-1 bg-transparent text-foreground text-sm font-bold outline-none placeholder:text-zinc-400"
              />
              <button
                onClick={handleGlobalSearch}
                className="px-4 py-2 bg-[var(--toss-blue)] text-white font-bold text-xs rounded-xl shadow-sm hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                {globalSearchLoading ? '검색중...' : '검색'}
              </button>
              <button onClick={() => setShowGlobalSearch(false)} className="ml-2 text-zinc-400 hover:text-zinc-600 text-lg font-bold">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar bg-zinc-50 dark:bg-zinc-950 p-4 md:p-6">
              {!globalSearchLoading && globalSearchResults.length === 0 && globalSearchQuery.trim() && (
                <div className="h-40 flex flex-col items-center justify-center text-zinc-400">
                  <span className="text-3xl mb-2">🤔</span>
                  <p className="text-sm font-bold">검색 결과가 없습니다.</p>
                </div>
              )}
              <div className="space-y-3">
                {globalSearchResults.map((msg: any) => {
                  let roomName = msg.chat_rooms?.name || '채팅방';
                  if (msg.chat_rooms?.type === 'direct' && Array.isArray(msg.chat_rooms?.members)) {
                    const otherStaff = staffs.find((s: any) => msg.chat_rooms.members.includes(String(s.id)) && String(s.id) !== String(user?.id));
                    if (otherStaff) roomName = otherStaff.name;
                  }
                  return (
                    <div
                      key={msg.id}
                      onClick={() => {
                        setRoom(msg.room_id);
                        setShowGlobalSearch(false);
                      }}
                      className="group p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl cursor-pointer hover:border-[var(--toss-blue)] hover:shadow-md transition-all"
                    >
                      <div className="flex items-center justify-between mb-2 gap-4">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded text-[10px] font-bold truncate shrink-0 max-w-[120px]">
                            {roomName}
                          </span>
                          <span className="text-[11px] font-bold text-foreground truncate">{msg.staff?.name || '알 수 없음'}</span>
                        </div>
                        <span className="text-[10px] font-bold text-zinc-400 shrink-0">
                          {new Date(msg.created_at).toLocaleDateString()} {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300 line-clamp-2 leading-relaxed">
                        {msg.content || (msg.file_url ? '📎 첨부 파일' : '')}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
