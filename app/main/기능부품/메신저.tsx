'use client';
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { sendNotification } from './알림시스템';

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';
const NOTICE_ROOM_NAME = '공지메시지';
const CAN_WRITE_NOTICE_POSITIONS = ['팀장', '부장', '실장', '원장', '병원장', '대표이사'];
const CHAT_ROOM_KEY = 'erp_chat_last_room';
const CHAT_FOCUS_KEY = 'erp_chat_focus_keyword';

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

export default function ChatView({ user, onRefresh, staffs = [] }: any) {
  const [messages, setMessages] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [msgSearchKeyword, setMsgSearchKeyword] = useState(''); // 메시지 본문 검색
  const [searchDateFrom, setSearchDateFrom] = useState('');
  const [searchDateTo, setSearchDateTo] = useState('');
  const [searchFileOnly, setSearchFileOnly] = useState(false);
  const [inputMsg, setInputMsg] = useState('');
  const [activeActionMsg, setActiveActionMsg] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgRefs = useRef<any>({});
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
  const [showSearchPanel, setShowSearchPanel] = useState(false);
  const [toolbarMsgId, setToolbarMsgId] = useState<string | null>(null);
  const [showMediaPanel, setShowMediaPanel] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'file' | 'link'>('all');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const [roomNotifyOn, setRoomNotifyOn] = useState(true);

  // 다중 선택 나가기용 상태
  const [selectedRoomIdsForLeave, setSelectedRoomIdsForLeave] = useState<string[]>([]);

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
  const [pollOptions, setPollOptions] = useState('찬성, 반대');
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());

  // 메시지 전달/공유용 상태
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardSourceMsg, setForwardSourceMsg] = useState<any>(null);

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

  const fetchData = useCallback(async () => {
    let query = supabase
      .from('messages')
      .select('*, staff:staff_members(name, photo_url)')
      .eq('room_id', selectedRoomId)
      .order('created_at', { ascending: true });
    const { data: msgs } = await query;
    if (msgs) setMessages(msgs);

    const { data: rooms } = await supabase.from('chat_rooms').select('*').order('created_at', { ascending: false });
    const noticeRoom =
      (rooms || []).find((r: any) => r.id === NOTICE_ROOM_ID) || {
        id: NOTICE_ROOM_ID,
        name: NOTICE_ROOM_NAME,
        type: 'notice',
      };
    // 공지메시지 방 하나만 별도로 두고, 나머지는 일반 채팅방으로 취급
    const others = (rooms || []).filter((r: any) => r.id !== NOTICE_ROOM_ID);
    const list = [noticeRoom, ...others];
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

    // 마지막 읽은 시점 업데이트 (현재 방만)
    lastReadAtRef.current = new Date().toISOString();
    await supabase.from('room_read_cursors').upsert(
      {
        user_id: user?.id,
        room_id: selectedRoomId,
        last_read_at: lastReadAtRef.current,
      },
      { onConflict: 'user_id,room_id' }
    );

    // 모든 방에 대해 안읽은 개수 갱신
    await updateUnreadForRooms(list);
  }, [selectedRoomId, user?.id, updateUnreadForRooms]);

  const roomNotifyRef = useRef(true);
  useEffect(() => { roomNotifyRef.current = roomNotifyOn; }, [roomNotifyOn]);

  useEffect(() => {
    const loadRooms = async () => {
      await supabase.from('chat_rooms').upsert(
        { id: NOTICE_ROOM_ID, name: NOTICE_ROOM_NAME, type: 'notice', members: [] },
        { onConflict: 'id' }
      );
      const { data: rooms } = await supabase.from('chat_rooms').select('*').order('created_at', { ascending: false });
      const others = (rooms || []).filter((r: any) => r.id !== NOTICE_ROOM_ID);
      const noticeRoom = (rooms || []).find((r: any) => r.id === NOTICE_ROOM_ID) || {
        id: NOTICE_ROOM_ID,
        name: NOTICE_ROOM_NAME,
        type: 'notice',
      };
      const list = [noticeRoom, ...others];
      setChatRooms(list);
      await updateUnreadForRooms(list);
    };
    loadRooms();
  }, [selectedRoomId, updateUnreadForRooms]);

  // 다른 화면(수술·검사 일정 등)에서 설정한 검색 키워드 복원
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const key = window.localStorage.getItem(CHAT_FOCUS_KEY);
      if (key) {
        setMsgSearchKeyword(key);
        setShowSearchPanel(true);
        window.localStorage.removeItem(CHAT_FOCUS_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  // 전역 신규 메시지 감지: 어떤 방이든 새 메시지가 오면 안 읽은 개수와 화면 데이터를 자동 갱신
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
          // 방 목록이 준비된 경우 안 읽은 개수 재계산
          if (chatRoomsRef.current.length) {
            await updateUnreadForRooms(chatRoomsRef.current);
          }
          // 현재 보고 있는 방에 온 메시지면 목록도 즉시 새로고침
          if (msg.room_id === selectedRoomId) {
            fetchData();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, selectedRoomId, fetchData, updateUnreadForRooms]);

  useEffect(() => {
    if (!selectedRoomId) return;
    fetchData();
    const channel = supabase.channel(`chat-realtime-${selectedRoomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `room_id=eq.${selectedRoomId}` }, (payload: any) => {
        fetchData();
        if (!isFocusedRef.current && payload.new?.sender_id !== user?.id && roomNotifyRef.current) {
          const senderName = staffs.find((s: any) => s.id === payload.new.sender_id)?.name || '알 수 없음';
          sendNotification(`💬 ${senderName}`, { body: (payload.new.content || '📎 파일').slice(0, 50) });
        }
      })
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
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarMsgId && !(e.target as Element)?.closest?.('[data-msg-toolbar-area]')) {
        setToolbarMsgId(null);
      }
    };
    document.addEventListener('click', handleClickOutside, true);
    return () => document.removeEventListener('click', handleClickOutside, true);
  }, [toolbarMsgId]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const pinnedMessages = useMemo(
    () => messages.filter((m) => pinnedIds.includes(m.id)),
    [messages, pinnedIds]
  );

  const mediaMessages = useMemo(
    () =>
      messages.filter((m: any) => {
        if (m.file_url) return true;
        const text = (m.content || '') as string;
        return /https?:\/\/\S+/i.test(text);
      }),
    [messages]
  );

  const filteredMediaMessages = useMemo(
    () =>
      mediaMessages.filter((m: any) => {
        const fileUrl: string | null = m.file_url || null;
        const hasFile = !!fileUrl;
        const image = hasFile && isImageUrl(fileUrl as string);
        const hasLink = /(https?:\/\/\S+)/i.test(m.content || '');

        if (mediaFilter === 'image') return hasFile && image;
        if (mediaFilter === 'file') return hasFile && !image;
        if (mediaFilter === 'link') return hasLink;
        return true;
      }),
    [mediaMessages, mediaFilter]
  );

  const roomMembers = useMemo(() => {
    if (!selectedRoomId) return [];
    const room = chatRooms.find((r: any) => r.id === selectedRoomId);
    if (!room || !Array.isArray(room.members) || !room.members.length) return [];
    const memberIds = room.members.map((id: any) => String(id));
    return staffs.filter((s: any) => memberIds.includes(String(s.id)));
  }, [chatRooms, selectedRoomId, staffs]);

  const selectedRoom = useMemo(
    () => chatRooms.find((r: any) => r.id === selectedRoomId) || null,
    [chatRooms, selectedRoomId]
  );

  const visibleRooms = useMemo(
    () =>
      chatRooms.filter((room: any) => {
        if (room.id === NOTICE_ROOM_ID) return true;
        // 공지메시지 방 하나만 특별 취급, 나머지는 일반 채팅방
        // members가 지정된 경우: 해당 멤버만
        if (Array.isArray(room.members) && room.members.length > 0) {
          return room.members.some((id: any) => String(id) === String(user?.id));
        }
        // 그 외에는 기본적으로 표시
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

  // 특정 메시지의 미열람자 목록 불러오기
  const loadUnreadUsersForMessage = useCallback(
    async (msg: any) => {
      if (!msg?.id) return;
      setUnreadLoading(true);
      setUnreadUsers([]);
      setUnreadModalMsg(msg);
      try {
        const { data: reads } = await supabase
          .from('message_reads')
          .select('user_id')
          .eq('message_id', msg.id);
        const readIds = new Set((reads || []).map((r: any) => r.user_id));
        const { data: staff } = await supabase
          .from('staff_members')
          .select('id, name, department, position, company')
          .order('name', { ascending: true });
        const base = (staff || []).filter((s: any) =>
          user?.company ? s.company === user.company : true
        );
        const notRead = base.filter((s: any) => !readIds.has(s.id));
        notRead.sort((a: any, b: any) => (a.department || '').localeCompare(b.department || '') || (a.name || '').localeCompare(b.name || ''));
        setUnreadUsers(notRead);
      } catch (e) {
        console.error('loadUnreadUsersForMessage error', e);
        alert('미열람자 목록을 불러오지 못했습니다.');
      } finally {
        setUnreadLoading(false);
      }
    },
    [user?.company]
  );

  const handleLeaveRoom = async () => {
    if (!selectedRoom || selectedRoom.id === NOTICE_ROOM_ID) return;
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

  const handleBulkLeaveRooms = async () => {
    if (!user?.id) return;
    const targets = chatRooms.filter(
      (room: any) =>
        selectedRoomIdsForLeave.includes(room.id) &&
        room.id !== NOTICE_ROOM_ID
    );
    if (!targets.length) {
      alert('나갈 수 있는 채팅방이 선택되지 않았습니다.');
      return;
    }
    if (
      !confirm(
        `선택한 ${targets.length}개 채팅방에서 한 번에 나가시겠습니까?\n\n나간 후에는 다시 초대 받아야 합니다.`
      )
    )
      return;

    try {
      const userIdStr = String(user.id);
      const updates = targets.map((room: any) => {
        const currentMembers: any[] = Array.isArray(room.members) ? room.members : [];
        const newMembers = currentMembers.filter((id: any) => String(id) !== userIdStr);
        return { id: room.id, members: newMembers };
      });

      for (const u of updates) {
        await supabase.from('chat_rooms').update({ members: u.members }).eq('id', u.id);
      }

      setChatRooms((prev) =>
        prev.map((room: any) => {
          const upd = updates.find((u) => u.id === room.id);
          return upd ? { ...room, members: upd.members } : room;
        })
      );

      // 현재 보고 있던 방도 나간 방이면 선택 해제
      if (selectedRoomId && updates.some((u) => u.id === selectedRoomId)) {
        setRoom(null);
        setMessages([]);
      }

      setSelectedRoomIdsForLeave([]);
      alert('선택한 채팅방에서 나갔습니다.');
    } catch (e) {
      console.error('handleBulkLeaveRooms error', e);
      alert('채팅방 일괄 나가기 중 오류가 발생했습니다.');
    }
  };

  const handleSendMessage = async (fileUrl?: string) => {
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
    const content = trimmed || (fileUrl ? '📎 파일을 공유했습니다' : '');
    const { error } = await supabase.from('messages').insert([{ 
      room_id: selectedRoomId, 
      sender_id: user.id, 
      content, 
      file_url: fileUrl || null, 
      reply_to_id: replyTo?.id || null 
    }]);
    if (!error) {
      setInputMsg(''); 
      setReplyTo(null);
      fetchData();
    } else {
      alert('메시지 전송에 실패했습니다.');
    }
  };

  const [fileUploading, setFileUploading] = useState(false);
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileUploading(true);
    try {
      const path = `chat/${Date.now()}_${file.name}`;
      const { data, error } = await supabase.storage.from('pchos-files').upload(path, file);
      if (error) throw error;
      const publicUrl = supabase.storage.from('pchos-files').getPublicUrl(path).data.publicUrl;
      await handleSendMessage(publicUrl);
    } catch (err) {
      console.error('파일 업로드 실패:', err);
      alert('파일 업로드에 실패했습니다. pchos-files 버킷이 생성되어 있는지 확인하세요.');
    } finally {
      setFileUploading(false);
      e.target.value = '';
    }
  };

  const handleAction = async (type: 'task') => {
    if (!activeActionMsg) return;
    if (type === 'task') {
      const { error } = await supabase.from('tasks').insert([{ 
        assignee_id: user.id, 
        title: `[채팅] ${activeActionMsg.content}`, 
        status: 'pending' 
      }]);
      if (!error) { alert("할일 등록 완료"); if(onRefresh) onRefresh(); }
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
    }
  };

  const filteredStaffs = useMemo(() => {
    return staffs.filter((s: any) => 
      s.name.includes(searchTerm) || s.department?.includes(searchTerm)
    );
  }, [staffs, searchTerm]);

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
    const options = pollOptions.split(',').map((o) => o.trim()).filter((o) => o.length > 0);
    if (options.length < 2) { alert('선택지는 최소 2개 이상 입력해 주세요.'); return; }
    try {
      const { data: poll, error } = await supabase.from('polls').insert([{
        room_id: selectedRoomId, creator_id: user.id, question: pollQuestion, options
      }]).select().single();
      if (!error && poll) {
        setPolls((p: any[]) => [...p, poll]);
        setPollQuestion('');
        setPollOptions('찬성, 반대');
        setShowPollModal(false);
      } else throw new Error();
    } catch {
      const id = Date.now().toString();
      setPolls((p: any[]) => [...p, { id, room_id: selectedRoomId, question: pollQuestion, options }]);
      setPollQuestion('');
      setPollOptions('찬성, 반대');
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
    } catch (_) {}
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
    } catch (_) {}
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
    } catch (_) {}
  };

  const filteredMessages = useMemo(() => {
    let list = messages.filter((m: any) => !m.is_deleted);
    if (msgSearchKeyword) list = list.filter((m) => (m.content || '').includes(msgSearchKeyword) || (m.file_url && '파일'.includes(msgSearchKeyword)));
    if (searchFileOnly) list = list.filter((m) => !!m.file_url);
    if (searchDateFrom) list = list.filter((m) => new Date(m.created_at).toISOString().slice(0, 10) >= searchDateFrom);
    if (searchDateTo) list = list.filter((m) => new Date(m.created_at).toISOString().slice(0, 10) <= searchDateTo);
    return list;
  }, [messages, msgSearchKeyword, searchFileOnly, searchDateFrom, searchDateTo]);

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
    <div className="flex flex-1 overflow-hidden relative font-sans h-full bg-white">
      {/* 좌측 사이드바: 검색 및 목록 */}
      <aside className="w-80 border-r bg-slate-900 flex flex-col shrink-0 text-slate-50">
        <div className="p-6 space-y-3">
          <div className="flex gap-1 bg-slate-800 p-1 rounded-[12px]">
            <button
              onClick={() => setViewMode('chat')}
              className={`flex-1 py-2 text-[10px] font-black rounded-[12px] transition-all ${
                viewMode === 'chat'
                  ? 'bg-slate-50 text-slate-900 shadow-md'
                  : 'text-slate-300 hover:bg-slate-700/80'
              }`}
            >
              채팅목록
            </button>
            <button
              onClick={() => setViewMode('org')}
              className={`flex-1 py-2 text-[10px] font-black rounded-[12px] transition-all ${
                viewMode === 'org'
                  ? 'bg-slate-50 text-slate-900 shadow-md'
                  : 'text-slate-300 hover:bg-slate-700/80'
              }`}
            >
              조직도검색
            </button>
          </div>
          
          <input 
            className="w-full p-4 bg-slate-800 border border-slate-700 rounded-2xl text-xs font-bold outline-none text-slate-50 placeholder:text-slate-400 focus:ring-2 focus:ring-blue-400" 
            placeholder={viewMode === 'chat' ? "채팅방 검색..." : "이름 또는 부서 검색..."}
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)}
            aria-label="채팅방 또는 조직 검색"
          />
          {viewMode === 'chat' && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSearchPanel(!showSearchPanel)}
                  className="flex-1 py-2 text-[10px] font-black text-blue-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                  aria-label="메시지 검색 패널 열기"
                >
                  🔍 메시지 검색
                </button>
                <button
                  type="button"
                  onClick={() => setShowUnreadOnly((v) => !v)}
                  className={`px-3 py-2 text-[10px] font-black rounded-xl border transition-colors ${
                    showUnreadOnly
                      ? 'bg-rose-500/20 border-rose-300 text-rose-200'
                      : 'bg-slate-800 border-slate-700 text-slate-300'
                  }`}
                >
                  {showUnreadOnly ? '전체 보기' : '안읽은 방'}
                </button>
              </div>
              <div className="flex gap-2">
                <label className="flex-1 flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl cursor-pointer">
                  {/* 일반 채팅방 전체 선택 */}
                  <input
                    type="checkbox"
                    checked={
                      selectedRoomIdsForLeave.length > 0 &&
                      visibleRooms.some(
                        (room: any) =>
                          room.id !== NOTICE_ROOM_ID &&
                          selectedRoomIdsForLeave.includes(room.id)
                      )
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        const ids = visibleRooms
                          .filter((room: any) => room.id !== NOTICE_ROOM_ID)
                          .map((r: any) => r.id);
                        setSelectedRoomIdsForLeave(ids);
                      } else {
                        setSelectedRoomIdsForLeave([]);
                      }
                    }}
                  />
                  <span className="text-[10px] font-black text-slate-200">일반 채팅방 전체 선택</span>
                </label>
                <button
                  type="button"
                  onClick={handleBulkLeaveRooms}
                  className="px-3 py-2 text-[10px] font-black rounded-xl bg-rose-500/20 text-rose-100 hover:bg-rose-500/40 disabled:opacity-40"
                  disabled={selectedRoomIdsForLeave.length === 0}
                >
                  선택 방 나가기
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2 custom-scrollbar">
          {viewMode === 'chat' ? (
            <>
              <button
                onClick={() => setShowGroupModal(true)}
                className="w-full p-4 bg-emerald-500 text-white rounded-2xl text-[10px] font-black shadow-md hover:bg-emerald-400 hover:scale-[0.98] transition-all"
              >
                + 단체 채팅방 생성
              </button>
              {[...visibleRooms]
                .filter(r => {
                  const name = r.id === NOTICE_ROOM_ID ? NOTICE_ROOM_NAME : (r.name || '');
                  return r.id === NOTICE_ROOM_ID || name.includes(searchTerm);
                })
                .filter(room => !showUnreadOnly || room.id === NOTICE_ROOM_ID || (roomUnreadCounts[room.id] || 0) > 0)
                .sort((a, b) => (roomUnreadCounts[b.id] || 0) - (roomUnreadCounts[a.id] || 0))
                .map(room => {
                  const unread = roomUnreadCounts[room.id] || 0;
                  const isSelected = selectedRoomId === room.id;
                  const isNoticeChannel = room.id === NOTICE_ROOM_ID;
                  const label = room.id === NOTICE_ROOM_ID ? NOTICE_ROOM_NAME : room.name || '채팅방';
                  const isBulkSelectable = !isNoticeChannel;
                  const checked = selectedRoomIdsForLeave.includes(room.id);
                  return (
                    <div 
                      key={room.id}
                      onClick={() => setRoom(room.id)}
                      className={`p-4 rounded-2xl cursor-pointer transition-all flex items-center justify-between gap-2 ${
                        isSelected
                          ? 'bg-slate-100 text-slate-900 shadow-lg'
                          : 'bg-slate-800/60 border border-slate-700 hover:border-emerald-400'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {isBulkSelectable && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              e.stopPropagation();
                              setSelectedRoomIdsForLeave((prev) =>
                                e.target.checked
                                  ? [...prev, room.id]
                                  : prev.filter((id) => id !== room.id)
                              );
                            }}
                            className="w-3 h-3 rounded border-slate-400 bg-slate-900 text-emerald-400"
                          />
                        )}
                        <div className="flex flex-col min-w-0">
                          <p className="text-xs font-black truncate text-slate-50">
                            {isNoticeChannel ? '📢 ' : '👥 '}
                            {label}
                          </p>
                        </div>
                      </div>
                      {unread > 0 && (
                        <span
                          className={`ml-2 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-black ${
                            isSelected ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                          }`}
                        >
                          {unread > 99 ? '99+' : unread}
                        </span>
                      )}
                    </div>
                  );
                })}
            </>
          ) : (
            <div className="space-y-1">
              {filteredStaffs.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-3 bg-white border border-gray-100 rounded-xl hover:border-blue-300 cursor-pointer transition-all">
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-black text-gray-400 overflow-hidden">
                    {s.photo_url ? <img src={s.photo_url} className="w-full h-full object-cover" /> : s.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-gray-800 truncate">{s.name}</p>
                    <p className="text-[9px] font-bold text-gray-400 truncate">{s.department} · {s.position}</p>
                  </div>
                  <button onClick={async () => {
                    const otherId = s.id;
                    const pair = new Set([user.id, otherId]);
                    const { data: rooms } = await supabase.from('chat_rooms').select('id, members').eq('type', 'direct');
                    const found = (rooms || []).find((r: any) => {
                      const m = new Set((r.members || []).map((x: any) => String(x)));
                      const p = new Set([String(user.id), String(otherId)]);
                      return m.size === p.size && [...p].every((id) => m.has(id));
                    });
                    if (found) setRoom(found.id);
                    else {
                      const { data: room } = await supabase.from('chat_rooms').insert([{ name: `${s.name}`, type: 'direct', members: [user.id, otherId] }]).select('id').single();
                      if (room) setRoom(room.id);
                    }
                    setViewMode('chat');
                    fetchData();
                  }} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black hover:bg-blue-600 hover:text-white transition-all">대화</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* 우측: 채팅창 본문 */}
      <main className="flex-1 flex flex-col bg-slate-100 h-full relative">
        {/* 선택된 채팅방 정보 및 액션 버튼들 */}
        {selectedRoomId && selectedRoom && (
          <header className="px-6 pt-4 pb-3 flex items-center justify-between border-b border-slate-200 bg-slate-50/90 backdrop-blur-sm shrink-0">
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                현재 채팅방
              </p>
              <p className="text-sm font-black text-gray-800 mt-0.5">
                {selectedRoom.id === NOTICE_ROOM_ID
                  ? NOTICE_ROOM_NAME
                  : selectedRoom.name || '채팅방'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMediaPanel(true)}
                className="w-8 h-8 flex items-center justify-center text-gray-500 border border-gray-200 rounded-full hover:bg-gray-50 hover:text-blue-600 transition-colors text-lg"
                aria-label="파일·사진·링크 메뉴 열기"
                title="파일·사진·링크 보기"
              >
                ☰
              </button>
            </div>
          </header>
        )}
        {showSearchPanel && (
          <div className="shrink-0 p-4 bg-gray-50 border-b border-gray-100 space-y-3">
            <p className="text-[10px] font-black text-gray-500 uppercase">메시지 검색</p>
            <div className="flex flex-wrap gap-2">
              <input
                value={msgSearchKeyword}
                onChange={(e) => setMsgSearchKeyword(e.target.value)}
                placeholder="키워드"
                className="flex-1 min-w-[120px] p-2 text-xs font-bold border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-200"
                aria-label="검색 키워드"
              />
              <input type="date" value={searchDateFrom} onChange={(e) => setSearchDateFrom(e.target.value)} className="p-2 text-[10px] font-bold border rounded-lg" aria-label="시작일" />
              <input type="date" value={searchDateTo} onChange={(e) => setSearchDateTo(e.target.value)} className="p-2 text-[10px] font-bold border rounded-lg" aria-label="종료일" />
              <label className="flex items-center gap-2 text-[10px] font-bold">
                <input type="checkbox" checked={searchFileOnly} onChange={(e) => setSearchFileOnly(e.target.checked)} className="rounded" />
                파일만
              </label>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-3 custom-scrollbar">
          {!selectedRoomId ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <span className="text-4xl mb-2">💬</span>
              <p className="text-sm font-bold">채팅방을 선택하세요</p>
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20">
              <span className="text-6xl mb-4">💬</span>
              <p className="font-black text-sm">대화 내용이 없습니다.</p>
            </div>
          ) : (
            (() => {
              let lastDateLabel = '';
              return filteredMessages.map((msg) => {
                const isMine = msg.sender_id === user.id;
                const msgReacts = reactions[msg.id] || {};
                const hasReacts = Object.keys(msgReacts).some(e => (msgReacts[e] || 0) > 0);
                const readCount = readCounts[msg.id] || 0;
                const TOOLBAR_EMOJIS = ['👍', '👌', '😎', '😍', '😂', '😕', '😢', '😠'];
                const showToolbar = toolbarMsgId === msg.id;

                const created = new Date(msg.created_at);
                const dateLabel = created.toLocaleDateString('ko-KR', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  weekday: 'short',
                });
                const showDateDivider = dateLabel !== lastDateLabel;
                if (showDateDivider) lastDateLabel = dateLabel;

                return (
                  <div key={msg.id} className="space-y-1">
                    {showDateDivider && (
                      <div className="flex justify-center my-2">
                        <span className="px-3 py-1 rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                          {dateLabel}
                        </span>
                      </div>
                    )}
                    <div
                      ref={el => { msgRefs.current[msg.id] = el; }}
                      data-msg-toolbar-area
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                      onMouseEnter={() => setToolbarMsgId(msg.id)}
                      onMouseLeave={() => setToolbarMsgId(prev => prev === msg.id ? null : prev)}
                    >
                      {!isMine && (
                        <span className="text-[10px] text-gray-400 px-2 mb-1 font-bold">
                          {msg.staff?.name} {msg.staff?.position}
                        </span>
                      )}
                      <div 
                        onClick={(e) => { e.stopPropagation(); setToolbarMsgId(msg.id); markMessageRead(msg); }}
                        className={`group relative px-3 py-2 rounded-2xl text-sm shadow-sm cursor-pointer transition-all max-w-[70%] ${
                          isMine
                            ? 'bg-emerald-600 text-white rounded-tr-none'
                            : 'bg-white border border-slate-200 rounded-tl-none hover:border-emerald-400 text-slate-900'
                        }`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && (setToolbarMsgId(msg.id), markMessageRead(msg))}
                        aria-label={`${msg.staff?.name || '알 수 없음'} 메시지`}
                      >
                        {msg.reply_to_id && (() => {
                          const parent = messages.find((m: any) => m.id === msg.reply_to_id);
                          return parent ? (
                            <div className={`mb-2 p-2 rounded-lg text-[10px] border-l-2 ${
                              isMine ? 'bg-white/10 border-white/30' : 'bg-gray-100 border-gray-300'
                            }`}>
                              <span className="font-bold opacity-80">↩️ {parent.staff?.name}: </span>
                              <span className="truncate">{parent.content || '📎 파일'}</span>
                            </div>
                          ) : null;
                        })()}
                        {msg.content}
                        {msg.file_url && (
                          <div className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                            {isImageUrl(msg.file_url) ? (
                              <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="block">
                                <img
                                  src={msg.file_url}
                                  alt="첨부 이미지"
                                  className="max-w-[200px] max-h-[150px] rounded-lg object-cover border border-gray-200"
                                />
                              </a>
                            ) : null}
                            <a
                              href={msg.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download
                              className={`block p-2 rounded-lg text-[10px] font-bold border flex items-center gap-2 hover:opacity-80 transition-opacity ${
                                isMine ? 'bg-white/10 border-white/20' : 'bg-gray-50 border-gray-100 text-blue-600'
                              }`}
                            >
                              📎 파일 첨부됨 — 다운로드
                            </a>
                          </div>
                        )}

                        {(hasReacts || (readCount > 0 && !isMine)) && (
                          <div className="mt-2 flex items-center gap-2 text-[10px] flex-wrap">
                            {hasReacts && (
                              <span className="flex gap-1 flex-wrap">
                                {Object.entries(msgReacts).map(([emoji, cnt]) =>
                                  ((cnt as number) > 0 ? (
                                    <span
                                      key={emoji}
                                      className={`px-1.5 py-0.5 rounded text-[9px] ${
                                        isMine ? 'bg-white/20' : 'bg-gray-100'
                                      }`}
                                    >
                                      {emoji} {cnt as number}
                                    </span>
                                  ) : null)
                                )}
                              </span>
                            )}
                            {readCount > 0 && !isMine && (
                              <span className="text-gray-400 font-bold">{readCount}명이 읽음</span>
                            )}
                          </div>
                        )}

                        <span
                          className={`absolute bottom-0 ${
                            isMine ? 'right-full mr-2' : 'left-full ml-2'
                          } text-[8px] font-bold text-gray-300 whitespace-nowrap`}
                        >
                          {created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {showToolbar && (
                        <div 
                          className={`flex items-center gap-1 px-3 py-2 mt-1 rounded-2xl bg-white/95 backdrop-blur border border-gray-100 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-200 ${
                            isMine ? 'flex-row-reverse' : ''
                          }`}
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => { setReplyTo(msg); setToolbarMsgId(null); }}
                            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
                            title="답글"
                          >
                            ↩️
                          </button>
                          {TOOLBAR_EMOJIS.map(emoji => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => toggleReaction(msg.id, emoji)}
                              className="p-1.5 rounded-xl hover:bg-gray-100 text-lg transition-colors"
                              title={emoji}
                            >
                              {emoji}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => { setActiveActionMsg(msg); setToolbarMsgId(null); }}
                            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors ml-0.5"
                            title="더보기"
                          >
                            ⋯
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              });
            })()
          )}

          {/* 투표 메시지들 (DEMO: 로컬 상태) */}
          {polls
            .filter((p: any) => p.room_id === selectedRoomId)
            .map((poll: any) => {
              const votes = pollVotes[poll.id] || {};
              const totalVotes = (Object.values(votes) as number[]).reduce(
                (a: number, b: number) => a + b,
                0
              );
              return (
                <div
                  key={poll.id}
                  className="max-w-[70%] bg-white border border-blue-100 rounded-2xl p-4 shadow-sm text-xs font-bold text-gray-700"
                >
                  <p className="text-[10px] font-black text-blue-600 mb-2">📊 투표</p>
                  <p className="mb-3 text-sm">{poll.question}</p>
                  <div className="space-y-1">
                    {poll.options.map((opt: string, idx: number) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleVote(poll.id, idx)}
                        className="w-full flex justify-between items-center px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-[11px]"
                      >
                        <span>{opt}</span>
                        <span className="text-blue-700">
                          {(votes[idx] || 0)}표
                          {totalVotes > 0 && (
                            <span className="ml-1 text-[9px] text-blue-400">
                              ({Math.round(((votes[idx] || 0) / totalVotes) * 100)}%)
                            </span>
                          )}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

          <div ref={scrollRef} />
        </div>

        {/* 입력창 */}
        <div className="p-6 bg-white border-t shrink-0">
           {replyTo && (
             <div className="mb-3 flex items-center justify-between bg-blue-50 p-3 rounded-xl border border-blue-100 animate-in slide-in-from-bottom-2">
               <p className="text-[10px] font-bold text-blue-600">@{replyTo.staff?.name}님에게 답글 작성 중...</p>
               <button onClick={()=>setReplyTo(null)} className="text-blue-400 hover:text-blue-600 font-black">✕</button>
             </div>
           )}
           {selectedRoomId === NOTICE_ROOM_ID && user?.position && !CAN_WRITE_NOTICE_POSITIONS.includes(user.position) && (
             <div className="mb-3 py-2 px-4 bg-amber-50 border border-amber-200 rounded-xl text-[11px] font-bold text-amber-800">
               📢 공지메시지 방에는 부서장(팀장·부장·원장 등) 이상만 작성할 수 있습니다.
             </div>
           )}
           <div className={`flex items-center gap-3 p-3 rounded-[2rem] border transition-all ${
             selectedRoomId === NOTICE_ROOM_ID && user?.position && !CAN_WRITE_NOTICE_POSITIONS.includes(user.position)
               ? 'bg-gray-100 border-gray-200 opacity-80 pointer-events-none'
               : 'bg-gray-50 border-gray-100 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50'
           }`}>
             <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
             <button
               onClick={()=>fileInputRef.current?.click()}
               disabled={fileUploading}
               title="파일 첨부"
               className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
             >
               {fileUploading ? <span className="animate-pulse text-xs">...</span> : '📎'}
             </button>
             <button onClick={()=>setShowPollModal(true)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-colors">📊</button>
             <div className="relative flex-1">
               <input 
                 className="w-full bg-transparent p-2 outline-none text-sm font-bold" 
                 placeholder={selectedRoomId === NOTICE_ROOM_ID && user?.position && !CAN_WRITE_NOTICE_POSITIONS.includes(user.position) ? "부서장 이상만 작성 가능" : "메시지를 입력하세요... (예: @홍길동 메모) "}
                 value={inputMsg} 
                 onChange={e=>{
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
                 onKeyDown={e=>e.key==='Enter'&&handleSendMessage()} 
               />
               {showMentionList && mentionCandidates.length > 0 && (
                 <div className="absolute left-0 bottom-full mb-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-2xl shadow-lg z-20 text-xs">
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
                       className="w-full px-3 py-2 flex items-center gap-2 hover:bg-blue-50 text-left"
                     >
                       <span className="text-[11px] font-black text-gray-800 truncate">{m.name}</span>
                       <span className="text-[10px] text-gray-400 truncate">
                         {(m.department || '')}{m.position ? ` · ${m.position}` : ''}
                       </span>
                     </button>
                   ))}
                 </div>
               )}
             </div>
             <button onClick={()=>handleSendMessage()} className="bg-blue-600 text-white w-10 h-10 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center">↑</button>
           </div>
        </div>

        {/* 파일·사진·링크 모아보기 패널 */}
        {showMediaPanel && selectedRoomId && (
          <>
            <div
              className="absolute inset-0 bg-black/10 z-40"
              onClick={() => setShowMediaPanel(false)}
              aria-hidden="true"
            />
            <aside className="absolute top-0 right-0 bottom-0 w-80 bg-white border-l border-gray-100 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    파일·사진·링크
                  </p>
                  <p className="text-xs font-black text-gray-800 mt-0.5 line-clamp-1">
                    {selectedRoom?.id === NOTICE_ROOM_ID
                      ? NOTICE_ROOM_NAME
                      : selectedRoom?.name || '채팅방'}
                  </p>
                </div>
                <button
                  onClick={() => setShowMediaPanel(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 rounded-[12px] hover:bg-gray-100"
                >
                  ✕
                </button>
              </div>
              <div className="p-3 border-b border-gray-100 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-gray-500">
                  총 {filteredMediaMessages.length}개
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleRoomNotify}
                    className="px-2.5 py-1 text-[10px] font-black rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    {roomNotifyOn ? '🔔 알림 on' : '🔕 알림 off'}
                  </button>
                  {selectedRoom?.id !== NOTICE_ROOM_ID && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowMediaPanel(false);
                        handleLeaveRoom();
                      }}
                      className="px-3 py-1.5 text-[10px] font-black text-red-600 border border-red-100 rounded-xl hover:bg-red-50 transition-colors"
                    >
                      채팅방 나가기
                    </button>
                  )}
                </div>
              </div>
              <div className="px-3 py-2 border-b border-gray-100 flex flex-wrap gap-2 text-[10px] font-black">
                <button
                  type="button"
                  onClick={() => setMediaFilter('all')}
                  className={`px-2.5 py-1 rounded-full transition-colors ${
                    mediaFilter === 'all'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  전체
                </button>
                <button
                  type="button"
                  onClick={() => setMediaFilter('image')}
                  className={`px-2.5 py-1 rounded-full transition-colors ${
                    mediaFilter === 'image'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  사진
                </button>
                <button
                  type="button"
                  onClick={() => setMediaFilter('file')}
                  className={`px-2.5 py-1 rounded-full transition-colors ${
                    mediaFilter === 'file'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  파일함
                </button>
                <button
                  type="button"
                  onClick={() => setMediaFilter('link')}
                  className={`px-2.5 py-1 rounded-full transition-colors ${
                    mediaFilter === 'link'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  링크
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-4">
                {filteredMediaMessages.length === 0 ? (
                  <p className="text-[11px] text-gray-400 font-bold text-center mt-4">
                    이 채팅방에서 공유된 파일·사진·링크가 없습니다.
                  </p>
                ) : (
                  filteredMediaMessages.map((msg: any) => {
                    const isImage = msg.file_url && isImageUrl(msg.file_url);
                    const isVideo = msg.file_url && isVideoUrl(msg.file_url);
                    const hasFile = !!msg.file_url;
                    const hasLink = /(https?:\/\/\S+)/i.test(msg.content || '');
                    const createdAt = new Date(msg.created_at);
                    const urlMatch = (msg.content || '').match(/https?:\/\/\S+/i);
                    const firstLink = urlMatch ? urlMatch[0] : null;

                    return (
                      <div
                        key={msg.id}
                        className="border border-gray-100 rounded-2xl p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-[11px] space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-gray-800 truncate">
                            {msg.staff?.name || '알 수 없음'}
                          </span>
                          <span className="text-[10px] text-gray-400">
                            {createdAt.toLocaleDateString('ko-KR')}{' '}
                            {createdAt.toLocaleTimeString('ko-KR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {hasFile && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-black text-gray-500">
                              {isImage
                                ? '📷 이미지'
                                : isVideo
                                ? '🎬 동영상'
                                : '📎 파일'}
                            </p>
                            {isImage && (
                              <a
                                href={msg.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                <img
                                  src={msg.file_url}
                                  alt="첨부 이미지"
                                  className="w-full max-h-40 object-cover rounded-xl border border-gray-200"
                                />
                              </a>
                            )}
                            {!isImage && hasFile && (
                              <a
                                href={msg.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block px-3 py-2 rounded-xl bg-white border border-gray-200 text-blue-600 font-bold hover:bg-blue-50 truncate"
                              >
                                파일 열기 / 다운로드
                              </a>
                            )}
                          </div>
                        )}
                        {hasLink && firstLink && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-black text-gray-500">
                              🔗 링크
                            </p>
                            <a
                              href={firstLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block px-3 py-2 rounded-xl bg-white border border-gray-200 text-[10px] text-blue-600 font-bold hover:bg-blue-50 break-all"
                            >
                              {firstLink}
                            </a>
                          </div>
                        )}
                        {msg.content && (
                          <p className="text-[11px] text-gray-700 line-clamp-2">
                            {msg.content}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}

                {/* 참여 멤버 목록 */}
                {roomMembers.length > 0 && (
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                      참여 멤버 ({roomMembers.length})
                    </p>
                    <div className="space-y-1">
                      {roomMembers.map((m: any) => {
                        const lastSeen = m.last_seen_at ? new Date(m.last_seen_at).getTime() : 0;
                        const now = Date.now();
                        const diffSec = lastSeen ? (now - lastSeen) / 1000 : Infinity;
                        let presenceLabel = '오프라인';
                        let presenceColor = 'bg-gray-300';
                        if (diffSec <= 60) {
                          presenceLabel = '온라인';
                          presenceColor = 'bg-emerald-500';
                        } else if (diffSec <= 300) {
                          presenceLabel = '자리비움';
                          presenceColor = 'bg-amber-400';
                        }
                        return (
                          <div
                            key={m.id}
                            className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-[11px] font-black text-gray-400 overflow-hidden">
                              {m.photo_url ? (
                                <img
                                  src={m.photo_url}
                                  alt={m.name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                (m.name || '?').charAt(0)
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-black text-gray-800 truncate">
                                {m.name}
                              </p>
                              <p className="text-[10px] font-bold text-gray-400 truncate">
                                {(m.position || '')}{" "}
                                {m.company || m.department
                                  ? `· ${m.company || m.department}`
                                  : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <span className={`w-2 h-2 rounded-full ${presenceColor}`} />
                              <span className="text-[9px] font-bold text-gray-400">
                                {presenceLabel}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </>
        )}

        {/* 메시지 액션 슬라이드 패널 */}
        {activeActionMsg && (
          <>
            <div className="absolute inset-0 bg-black/10 z-30 animate-in fade-in duration-200" onClick={()=>{setActiveActionMsg(null); setEditingMsg(null);}} aria-hidden="true" />
            <div className="absolute top-0 right-0 bottom-0 w-72 bg-white border-l border-gray-100 shadow-2xl z-40 flex flex-col animate-in slide-in-from-right duration-300">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-400 uppercase">메시지 액션</span>
                <button onClick={()=>{setActiveActionMsg(null); setEditingMsg(null)}} className="p-2 text-gray-400 hover:text-gray-600 rounded-[12px] hover:bg-gray-100">✕</button>
              </div>
              <div className="p-4 space-y-4 overflow-y-auto flex-1">
                <p className="text-[10px] font-black text-gray-400 uppercase">감정 표현</p>
                <div className="flex gap-2 flex-wrap">
                  {['👍','😂','❤️','😮','😢'].map(emoji => (
                    <button key={emoji} onClick={()=>{toggleReaction(activeActionMsg.id, emoji);}} className="w-11 h-11 flex items-center justify-center rounded-[12px] bg-gray-100 hover:bg-blue-50 text-xl transition-colors" title={emoji}>
                      {emoji}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] font-black text-gray-400 uppercase pt-2">기능</p>
                <div className="space-y-1">
                  <button onClick={()=>{setReplyTo(activeActionMsg); setActiveActionMsg(null)}} className="w-full p-3 text-left hover:bg-blue-50 rounded-[12px] text-xs font-black text-blue-600 transition-colors">↩️ 답글 달기</button>
                  {activeActionMsg.sender_id === user.id && (
                    <>
                      <button onClick={()=>{setEditingMsg(activeActionMsg); setEditContent(activeActionMsg.content||''); setActiveActionMsg(null)}} className="w-full p-3 text-left hover:bg-gray-50 rounded-[12px] text-xs font-black transition-colors">✏️ 수정</button>
                      <button onClick={()=>{deleteMessage(activeActionMsg); setActiveActionMsg(null)}} className="w-full p-3 text-left hover:bg-red-50 rounded-[12px] text-xs font-black text-red-600 transition-colors">🗑️ 삭제</button>
                    </>
                  )}
                  <button onClick={()=>{handleAction('task'); setActiveActionMsg(null)}} className="w-full p-3 text-left hover:bg-gray-50 rounded-[12px] text-xs font-black transition-colors">✅ 할일로 등록</button>
                  {selectedRoom?.id === NOTICE_ROOM_ID && (
                    <button
                      onClick={() => {
                        loadUnreadUsersForMessage(activeActionMsg);
                        setActiveActionMsg(null);
                      }}
                      className="w-full p-3 text-left hover:bg-gray-50 rounded-[12px] text-xs font-black transition-colors"
                    >
                      👀 아직 안 읽은 사람 보기
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setForwardSourceMsg(activeActionMsg);
                      setShowForwardModal(true);
                      setActiveActionMsg(null);
                    }}
                    className="w-full p-3 text-left hover:bg-gray-50 rounded-[12px] text-xs font-black transition-colors"
                  >
                    📤 다른 채팅방으로 전달
                  </button>
                  <button
                    onClick={() => {
                      setThreadRoot(activeActionMsg);
                      setActiveActionMsg(null);
                    }}
                    className="w-full p-3 text-left hover:bg-blue-50 rounded-[12px] text-xs font-black text-blue-600 transition-colors"
                  >
                    🧵 이 메시지 스레드 보기
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const base =
                          `[채팅] ${activeActionMsg.staff?.name || '알 수 없음'} (${new Date(activeActionMsg.created_at).toLocaleString('ko-KR')})\n` +
                          `${activeActionMsg.content || ''}` +
                          (activeActionMsg.file_url ? `\n파일: ${activeActionMsg.file_url}` : '');
                        await navigator.clipboard?.writeText(`[전자결재 메모]\n${base}`);
                        alert('전자결재에 붙여넣을 수 있도록 복사되었습니다.');
                      } catch {
                        alert('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');
                      }
                      setActiveActionMsg(null);
                    }}
                    className="w-full p-3 text-left hover:bg-gray-50 rounded-[12px] text-xs font-black transition-colors"
                  >
                    📋 전자결재용 내용 복사
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const base =
                          `[채팅] ${activeActionMsg.staff?.name || '알 수 없음'} (${new Date(activeActionMsg.created_at).toLocaleString('ko-KR')})\n` +
                          `${activeActionMsg.content || ''}` +
                          (activeActionMsg.file_url ? `\n파일: ${activeActionMsg.file_url}` : '');
                        await navigator.clipboard?.writeText(`[게시판 메모]\n${base}`);
                        alert('게시판 글에 붙여넣을 수 있도록 복사되었습니다.');
                      } catch {
                        alert('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해 주세요.');
                      }
                      setActiveActionMsg(null);
                    }}
                    className="w-full p-3 text-left hover:bg-gray-50 rounded-[12px] text-xs font-black transition-colors"
                  >
                    📝 게시판용 내용 복사
                  </button>
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
                    className="w-full p-3 text-left hover:bg-gray-50 rounded-[12px] text-xs font-black transition-colors"
                  >
                    {bookmarkedIds.has(activeActionMsg.id) ? '⭐ 북마크 해제' : '⭐ 중요 메시지 북마크'}
                  </button>
                  <button onClick={()=>{togglePin(activeActionMsg.id); setActiveActionMsg(null)}} className={`w-full p-3 text-left rounded-[12px] text-xs font-black transition-colors ${pinnedIds.includes(activeActionMsg.id) ? 'hover:bg-gray-50 text-gray-500' : 'hover:bg-orange-50 text-orange-500'}`}>{pinnedIds.includes(activeActionMsg.id) ? '📢 공지 해제' : '📢 공지로 등록'}</button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* 수정 모달 */}
        {editingMsg && (
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-30" onClick={()=>{setEditingMsg(null); setEditContent('');}}>
            <div className="bg-white p-6 rounded-2xl w-80 shadow-2xl" onClick={e=>e.stopPropagation()}>
              <p className="text-xs font-black text-gray-500 mb-2">메시지 수정</p>
              <input value={editContent} onChange={e=>setEditContent(e.target.value)} className="w-full p-3 border rounded-xl text-sm mb-4" />
              <div className="flex gap-2">
                <button onClick={()=>{setEditingMsg(null); setEditContent('');}} className="flex-1 py-2 bg-gray-100 rounded-xl text-xs font-black">취소</button>
                <button onClick={saveEditMessage} className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-xs font-black">저장</button>
              </div>
            </div>
          </div>
        )}

        {/* 단체방 생성 모달 */}
        {showGroupModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => setShowGroupModal(false)}>
            <div className="bg-white w-full max-w-md rounded-[3rem] p-10 shadow-2xl space-y-8" onClick={e => e.stopPropagation()}>
              <h3 className="text-xl font-black text-gray-800 italic">새 단체 채팅방</h3>
              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">방 이름</label>
                  <input value={groupName} onChange={e => setGroupName(e.target.value)} className="w-full p-4 bg-gray-50 rounded-2xl border-none outline-none font-bold text-sm focus:ring-2 focus:ring-blue-100" placeholder="예: 행정팀 단체방" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">멤버 선택 ({selectedMembers.length}명)</label>
                  <div className="h-48 overflow-y-auto border border-gray-100 rounded-2xl p-4 space-y-2 custom-scrollbar bg-gray-50/30">
                    {staffs.filter((s:any) => s.id !== user.id).map((s: any) => (
                      <label key={s.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 cursor-pointer hover:border-blue-300 transition-all">
                        <input type="checkbox" checked={selectedMembers.includes(s.id)} onChange={e => {
                          if (e.target.checked) setSelectedMembers([...selectedMembers, s.id]);
                          else setSelectedMembers(selectedMembers.filter(id => id !== s.id));
                        }} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-xs font-bold text-gray-700">{s.name} ({s.position})</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setShowGroupModal(false)} className="flex-1 py-4 bg-gray-100 text-gray-400 rounded-2xl font-black text-xs">취소</button>
                  <button onClick={createGroupChat} className="flex-2 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs shadow-lg shadow-blue-200">채팅방 생성</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 투표 생성 모달 */}
      {showPollModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-gray-200">
            <h3 className="text-lg font-black text-gray-900">새 투표 만들기</h3>
            <p className="text-[10px] text-gray-500 font-bold">
              질문과 선택지를 입력하세요. 선택지는 콤마(,)로 구분합니다.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase">질문</label>
                <input
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                  placeholder="예: 이번 주 회의 시간은 언제가 좋을까요?"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-gray-400 uppercase">선택지 (쉼표로 구분)</label>
                <input
                  value={pollOptions}
                  onChange={(e) => setPollOptions(e.target.value)}
                  className="w-full mt-1 p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:border-blue-500"
                  placeholder="찬성, 반대"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPollModal(false)}
                className="flex-1 py-3 rounded-xl text-[10px] font-black text-gray-400 hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleCreatePoll}
                className="flex-1 py-3 rounded-xl text-[10px] font-black bg-blue-600 text-white hover:bg-blue-700 shadow-md"
              >
                투표 생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 슬래시 명령 폼 모달 (/연차, /발주) */}
      {showSlashModal && slashCommand && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowSlashModal(false)}>
          <div className="bg-white w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-gray-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-gray-900">
              {slashCommand === 'annual_leave' ? '🗓️ 연차 신청 초안 만들기' : '📦 발주 요청 초안 만들기'}
            </h3>
            {slashCommand === 'annual_leave' ? (
              <>
                <p className="text-[10px] text-gray-500 font-bold">
                  시작일/종료일과 사유를 입력하면 전자결재에 연차/휴가 기안 초안이 생성됩니다.
                </p>
                <div className="space-y-3 text-xs font-bold">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">시작일</label>
                      <input
                        type="date"
                        value={slashForm.startDate}
                        onChange={e => setSlashForm((f: any) => ({ ...f, startDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">종료일</label>
                      <input
                        type="date"
                        value={slashForm.endDate}
                        onChange={e => setSlashForm((f: any) => ({ ...f, endDate: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">사유(선택)</label>
                    <input
                      type="text"
                      value={slashForm.reason}
                      onChange={e => setSlashForm((f: any) => ({ ...f, reason: e.target.value }))}
                      placeholder="예: 개인 일정, 병원 방문 등"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSlashModal(false)}
                    className="flex-1 py-3 rounded-xl text-[10px] font-black text-gray-400 hover:bg-gray-50"
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
                    className="flex-1 py-3 rounded-xl text-[10px] font-black bg-blue-600 text-white hover:bg-blue-700 shadow-md"
                  >
                    전자결재 초안 생성
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] text-gray-500 font-bold">
                  품목명과 수량을 입력하면 비품구매(발주) 결재 초안이 생성됩니다.
                </p>
                <div className="space-y-3 text-xs font-bold">
                  <div>
                    <label className="block text-[10px] text-gray-400 mb-1">품목명</label>
                    <input
                      type="text"
                      value={slashForm.itemName}
                      onChange={e => setSlashForm((f: any) => ({ ...f, itemName: e.target.value }))}
                      placeholder="예: A사 프린터 토너"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">수량</label>
                      <input
                        type="number"
                        min={1}
                        value={slashForm.quantity}
                        onChange={e => setSlashForm((f: any) => ({ ...f, quantity: Number(e.target.value) || 1 }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-400 mb-1">비고(선택)</label>
                      <input
                        type="text"
                        value={slashForm.reason}
                        onChange={e => setSlashForm((f: any) => ({ ...f, reason: e.target.value }))}
                        placeholder="예: 재고 부족, 교체 주기 도래 등"
                        className="w-full px-3 py-2 border border-gray-200 rounded-xl text-xs"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowSlashModal(false)}
                    className="flex-1 py-3 rounded-xl text-[10px] font-black text-gray-400 hover:bg-gray-50"
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
                    className="flex-1 py-3 rounded-xl text-[10px] font-black bg-blue-600 text-white hover:bg-blue-700 shadow-md"
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
          <aside className="absolute top-0 right-0 bottom-0 w-80 bg-white border-l border-gray-100 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  스레드
                </p>
                <p className="text-xs font-black text-gray-800 mt-0.5 line-clamp-2">
                  {threadRoot.content || '📎 파일 메시지'}
                </p>
              </div>
              <button
                onClick={() => setThreadRoot(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-[12px] hover:bg-gray-100"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
              {threadMessages.length === 0 ? (
                <p className="text-[11px] text-gray-400 font-bold mt-4 text-center">
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
                      className={`border rounded-2xl p-3 text-[11px] space-y-1 ${
                        isRoot ? 'bg-blue-50 border-blue-100' : 'bg-gray-50 border-gray-100'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black text-gray-800 truncate">
                          {staff?.name || '알 수 없음'} {staff?.position || ''}
                        </span>
                        <span className="text-[9px] text-gray-400">
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
                      <p className="text-[11px] text-gray-700 whitespace-pre-wrap break-words">
                        {m.content || '📎 파일 메시지'}
                      </p>
                      {m.file_url && (
                        <a
                          href={m.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 mt-1 rounded-lg bg-white border border-gray-200 text-[10px] font-bold text-blue-600 hover:bg-blue-50"
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

      {/* 공지/중요 메시지 미열람자 목록 모달 */}
      {unreadModalMsg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setUnreadModalMsg(null)}>
          <div className="bg-white w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-gray-200" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  공지 미열람 대상자
                </p>
                <p className="text-xs font-black text-gray-800 mt-0.5 line-clamp-2">
                  {unreadModalMsg.content || '📎 파일 공지'}
                </p>
              </div>
              <button
                onClick={() => setUnreadModalMsg(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-[12px] hover:bg-gray-100"
              >
                ✕
              </button>
            </div>
            <div className="border-t border-gray-100 pt-3">
              {unreadLoading ? (
                <div className="py-8 flex justify-center">
                  <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
                </div>
              ) : unreadUsers.length === 0 ? (
                <p className="text-[11px] text-gray-500 font-bold py-4 text-center">
                  모든 대상자가 이 공지를 읽었습니다.
                </p>
              ) : (
                <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1">
                  {unreadUsers.map((u: any) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-[11px]"
                    >
                      <div className="min-w-0">
                        <p className="font-black text-gray-800 truncate">
                          {u.name}
                        </p>
                        <p className="text-[10px] font-bold text-gray-400 truncate">
                          {(u.department || '')} {u.position ? `· ${u.position}` : ''}
                        </p>
                      </div>
                      <span className="text-[9px] font-bold text-gray-300">
                        미열람
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 메시지 전달 모달 */}
      {showForwardModal && forwardSourceMsg && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setShowForwardModal(false); setForwardSourceMsg(null); }}>
          <div className="bg-white w-full max-w-md rounded-3xl p-6 space-y-4 shadow-2xl border border-gray-200" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-gray-900">📤 다른 채팅방으로 전달</h3>
            <p className="text-[11px] text-gray-500 font-bold">
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
                    className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-gray-100 hover:bg-blue-50 text-left text-xs font-bold text-gray-700"
                  >
                    <span className="truncate">
                      {room.id === NOTICE_ROOM_ID ? '📢 ' : '👥 '}
                      {room.name || '채팅방'}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {roomUnreadCounts[room.id] ? `안읽음 ${roomUnreadCounts[room.id]}건` : ''}
                    </span>
                  </button>
                ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => { setShowForwardModal(false); setForwardSourceMsg(null); }}
                className="flex-1 py-3 rounded-xl text-[10px] font-black text-gray-400 hover:bg-gray-50"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
