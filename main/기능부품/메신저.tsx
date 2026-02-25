'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';

export default function ChatView({ user, onRefresh, staffs = [], initialOpenChatRoomId, initialOpenMessageId, onConsumeOpenChatRoomId }: any) {
  const [messages, setMessages] = useState<any[]>([]);
  const [latestNotice, setLatestNotice] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [inputMsg, setInputMsg] = useState('');
  const [activeActionMsg, setActiveActionMsg] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msgRefs = useRef<any>({});

  // 추가된 상태
  const [viewMode, setViewMode] = useState<'chat' | 'org'>('chat');
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState(NOTICE_ROOM_ID);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const fetchData = async () => {
    // 메시지 로드
    const { data: msgs } = await supabase
      .from('messages')
      .select('*, staff:staff_members(name, photo_url)')
      .eq('room_id', selectedRoomId)
      .order('created_at', { ascending: true });
    if (msgs) setMessages(msgs);

    // 공지사항 로드
    const { data: notice } = await supabase
      .from('board_posts')
      .select('*')
      .eq('board_type', '공지사항')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLatestNotice(notice);

    // 채팅방 목록 로드
    const { data: rooms } = await supabase
      .from('chat_rooms')
      .select('*')
      .order('created_at', { ascending: false });
    setChatRooms(rooms || []);
  };

  // 추가된 UI 상태
  const [activeTab, setActiveTab] = useState<'friends' | 'chat' | 'more'>('chat');

  useEffect(() => {
    fetchData();
    const channel = supabase.channel(`chat-kakao`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (payload.new.room_id === selectedRoomId) {
          fetchData();
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedRoomId]);

  useEffect(() => {
    if (scrollRef.current && !initialOpenMessageId) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, initialOpenMessageId]);

  useEffect(() => {
    if (initialOpenChatRoomId) {
      setSelectedRoomId(initialOpenChatRoomId);
      if (onConsumeOpenChatRoomId) onConsumeOpenChatRoomId();
    }
  }, [initialOpenChatRoomId]);

  useEffect(() => {
    if (initialOpenMessageId && messages.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`msg-${initialOpenMessageId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('bg-yellow-50', 'transition-colors', 'duration-1000');
          setTimeout(() => el.classList.remove('bg-yellow-50'), 2000);
        }
      }, 100);
    }
  }, [initialOpenMessageId, messages]);

  const handleSendMessage = async (fileUrl?: string) => {
    if (!inputMsg.trim() && !fileUrl) return;
    const { error } = await supabase.from('messages').insert([{
      room_id: selectedRoomId,
      sender_id: user.id,
      content: inputMsg,
      file_url: fileUrl,
      reply_to_id: replyTo?.id
    }]);
    if (!error) {
      setInputMsg('');
      setReplyTo(null);
      // fetchData(); // Handled by real-time subscription
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const path = `chat/${Date.now()}_${file.name}`;
    const { data } = await supabase.storage.from('pchos-files').upload(path, file);
    if (data) handleSendMessage(supabase.storage.from('pchos-files').getPublicUrl(path).data.publicUrl);
  };

  const handleAction = async (type: 'task' | 'notice') => {
    if (!activeActionMsg) return;
    if (type === 'task') {
      const { error } = await supabase.from('todos').insert([{
        user_id: user.id,
        content: `[채팅] ${activeActionMsg.content}`,
        is_complete: false,
        task_date: new Date().toISOString().split('T')[0]
      }]);
      if (!error) { alert("할일 등록 완료 (마이페이지에서 확인 가능)"); if (onRefresh) onRefresh(); }
    } else {
      const { error } = await supabase.from('board_posts').insert([{
        board_type: '공지사항',
        author_name: user?.name || '익명',
        title: '채팅 공지',
        content: activeActionMsg.content,
        created_at: new Date().toISOString()
      }]);
      if (!error) { alert("공지 등록 완료 (게시판에서 확인 가능)"); fetchData(); }
    }
    setActiveActionMsg(null);
  };

  const removeNotice = async () => {
    if (!latestNotice) return;
    if (!confirm("공지를 내리시겠습니까?")) return;
    const { error } = await supabase.from('board_posts').delete().eq('id', latestNotice.id);
    if (!error) fetchData();
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
      setSelectedRoomId(room.id);
      fetchData();
    }
  };

  const filteredStaffs = useMemo(() => {
    return staffs.filter((s: any) =>
      s.name.includes(searchTerm) || s.department?.includes(searchTerm)
    );
  }, [staffs, searchTerm]);

  // 7. 결과 렌더링
  return (
    <div className="flex h-full w-full bg-white overflow-hidden animate-soft-fade select-none">

      {/* 1. 좌측 초슬림 내비게이션 바 (카카오톡 스타일) */}
      <nav className="w-16 bg-[#f2f2f2] border-r border-gray-200 flex flex-col items-center py-10 space-y-8 shrink-0">
        <div
          onClick={() => setActiveTab('friends')}
          className={`cursor-pointer group relative ${activeTab === 'friends' ? 'text-gray-900' : 'text-gray-400'}`}
        >
          <span className="text-2xl">👤</span>
          {activeTab === 'friends' && <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-6 bg-gray-800 rounded-r-full"></div>}
        </div>
        <div
          onClick={() => setActiveTab('chat')}
          className={`cursor-pointer group relative ${activeTab === 'chat' ? 'text-gray-900' : 'text-gray-400'}`}
        >
          <span className="text-2xl">💬</span>
          {activeTab === 'chat' && <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-6 bg-gray-800 rounded-r-full"></div>}
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black px-1 rounded-full border border-white">N</div>
        </div>
        <div className="flex-1"></div>
        <div
          onClick={() => setActiveTab('more')}
          className={`cursor-pointer group relative ${activeTab === 'more' ? 'text-gray-900' : 'text-gray-400'}`}
        >
          <span className="text-2xl">⋯</span>
        </div>
      </nav>

      {/* 2. 리스트 사이드바 (친구/채팅 목록) */}
      <aside className="w-80 flex flex-col border-r border-gray-200">
        <div className="p-6 pb-2">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-gray-900 tracking-tight">
              {activeTab === 'friends' ? '친구' : activeTab === 'chat' ? '채팅' : '더보기'}
            </h2>
            <div className="flex gap-4 text-gray-400">
              <button className="hover:text-gray-900 underline underline-offset-4 decoration-dotted">🔍</button>
              {activeTab === 'chat' && <button onClick={() => setShowGroupModal(true)} className="hover:text-gray-900">💬+</button>}
              <button className="hover:text-gray-900">⚙️</button>
            </div>
          </div>

          <div className="relative mb-4">
            <input
              type="text"
              placeholder="이름, 부서 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-gray-100 border-none rounded-lg p-2 px-4 text-xs font-medium focus:ring-1 focus:ring-gray-300 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'friends' && (
            <div className="space-y-1">
              <div className="px-6 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">내 프로필</div>
              <div className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50 cursor-pointer group">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center text-lg shadow-sm border border-gray-100 overflow-hidden">
                  {user.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" /> : (user.name?.[0] || 'U')}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-black text-gray-900">{user.name}</p>
                  <p className="text-[10px] font-bold text-gray-400">{user.department} · {user.position}</p>
                </div>
              </div>

              <div className="px-6 py-2 pt-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">동료 ({filteredStaffs.length})</div>
              {filteredStaffs.map((s: any) => (
                <div key={s.id} onClick={() => { setViewMode('chat'); setActiveTab('chat'); /* 여기에 해당 유저와의 1:1 방 찾기/생성 로직 추가 가능 */ }} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-gray-200 flex items-center justify-center text-sm shadow-sm border border-gray-100 overflow-hidden text-gray-400">
                    {s.photo_url ? <img src={s.photo_url} className="w-full h-full object-cover" /> : (s.name?.[0] || '?')}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-800">{s.name}</p>
                    <p className="text-[10px] text-gray-400">{s.department}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="space-y-0">
              {/* 공지방 */}
              <div
                onClick={() => setSelectedRoomId(NOTICE_ROOM_ID)}
                className={`px-5 py-4 flex items-center gap-4 cursor-pointer transition-colors ${selectedRoomId === NOTICE_ROOM_ID ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
              >
                <div className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center text-xl shadow-md shrink-0">📢</div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <p className="text-sm font-black text-gray-900 truncate">전직원 공지방</p>
                    <span className="text-[9px] text-gray-400">오전 9:10</span>
                  </div>
                  <p className="text-xs text-gray-400 truncate font-medium">SY Connect 공식 공지사항입니다.</p>
                </div>
              </div>

              {chatRooms.map(room => (
                <div
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`px-5 py-4 flex items-center gap-4 cursor-pointer transition-colors ${selectedRoomId === room.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-600 flex items-center justify-center text-xl shadow-sm border border-blue-500/5 shrink-0">👥</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <p className="text-sm font-black text-gray-900 truncate">{room.name}</p>
                      <span className="text-[9px] text-gray-400">최근</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-gray-400 truncate font-medium">대화에 참여해보세요.</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* 3. 우측 메인 채팅창 (카카오톡 특유의 색감) */}
      <main className="flex-1 flex flex-col bg-[#bacEE0] relative">
        <header className="h-16 px-6 flex items-center justify-between border-b border-gray-200/50 bg-[#bacEE0]/80 backdrop-blur-md shrink-0 z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-black text-gray-800">
              {selectedRoomId === NOTICE_ROOM_ID ? '전직원 공지방' : (chatRooms.find(r => r.id === selectedRoomId)?.name || '채팅')}
            </h3>
            <span className="text-[10px] font-bold text-gray-500 opacity-60">👥 그룹</span>
          </div>
          <div className="flex gap-5 text-gray-600">
            <button className="hover:text-gray-900">🔍</button>
            <button className="hover:text-gray-900 text-xl">≡</button>
          </div>
        </header>

        <div
          className="flex-1 overflow-y-auto px-4 py-6 space-y-6 custom-scrollbar scroll-smooth"
        >
          <div ref={scrollRef as any} />
          {latestNotice && (
            <div className="mx-2 mb-6 bg-white/70 backdrop-blur-sm rounded-2xl p-4 border border-white/50 flex items-center gap-4 shadow-sm animate-in slide-in-from-top-4 relative z-10">
              <span className="text-lg">📢</span>
              <p className="text-xs font-bold text-gray-700 flex-1 truncate">{latestNotice.content}</p>
              <button
                onClick={removeNotice}
                className="text-[10px] font-black text-gray-400 hover:text-red-500"
              >✕</button>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/50 space-y-2 py-20">
              <span className="text-4xl text-white/30">💬</span>
              <p className="text-xs font-black italic tracking-widest">메시지를 시작하세요</p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const isMine = msg.sender_id === user.id;
              const showProfile = !isMine && (idx === 0 || messages[idx - 1].sender_id !== msg.sender_id);

              return (
                <div key={msg.id} id={`msg-${msg.id}`} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'} items-start animate-in fade-in-up duration-300 rounded-xl`}>
                  {!isMine && (
                    <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-gray-400 text-xs shadow-sm shrink-0 mt-1">
                      {showProfile ? (msg.staff?.photo_url ? <img src={msg.staff.photo_url} className="w-full h-full object-cover rounded-xl" /> : (msg.staff?.name?.[0] || '?')) : ''}
                    </div>
                  )}

                  <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[70%]`}>
                    {showProfile && <span className="text-[10px] font-bold text-gray-600 mb-1 ml-1">{msg.staff?.name}</span>}

                    <div className="flex items-end gap-1.5">
                      <div
                        onClick={() => setActiveActionMsg(msg)}
                        className={`p-3 rounded-2xl text-[13px] font-medium leading-relaxed shadow-sm cursor-pointer hover:brightness-95 transition-all
                          ${isMine ? 'bg-[#fee500] text-gray-900 rounded-tr-none' : 'bg-white text-gray-800 rounded-tl-none'}
                        `}
                      >
                        {msg.content}
                        {msg.file_url && (
                          <a target="_blank" href={msg.file_url} className="mt-2 block p-2 bg-black/5 rounded-lg text-[10px] font-black border border-black/5 flex items-center gap-2">
                            📎 파일 첨부
                          </a>
                        )}
                      </div>
                      <span className="text-[8px] font-bold text-gray-500/60 pb-1 shrink-0">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="p-4 bg-white border-t border-gray-200">
          {replyTo && (
            <div className="mb-2 p-2 bg-gray-50 rounded-lg flex items-center justify-between text-[10px] text-gray-500 font-bold border-l-4 border-yellow-400">
              <span>@{replyTo.staff?.name}에게 답장 중</span>
              <button onClick={() => setReplyTo(null)}>✕</button>
            </div>
          )}
          <div className="flex items-end gap-2 bg-gray-50 p-2 rounded-xl focus-within:bg-white border border-transparent focus-within:border-gray-200 transition-all">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-400 hover:text-gray-900 text-xl"
            >+</button>
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            <textarea
              rows={1}
              value={inputMsg}
              onChange={(e) => setInputMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="메시지를 입력하세요"
              className="flex-1 bg-transparent p-2 outline-none text-[13px] font-medium resize-none max-h-32"
            />
            <button className="p-2 text-gray-400 hover:text-yellow-500 text-xl">😊</button>
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputMsg.trim()}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${inputMsg.trim() ? 'bg-[#fee500] text-gray-900 shadow-md' : 'bg-gray-200 text-gray-400'}`}
            >
              전송
            </button>
          </div>
        </div>

        {/* 액션 모달 (카카오톡 스타일) */}
        {activeActionMsg && (
          <div className="absolute inset-0 bg-black/10 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in transition-all" onClick={() => setActiveActionMsg(null)}>
            <div className="bg-white rounded-3xl w-full max-w-xs overflow-hidden shadow-2xl animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-gray-100 bg-gray-50/50">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Message Action</p>
                <p className="text-xs font-bold text-gray-800 line-clamp-2 italic">"{activeActionMsg.content}"</p>
              </div>
              <div className="p-2">
                <button onClick={() => { setReplyTo(activeActionMsg); setActiveActionMsg(null) }} className="w-full text-left p-4 hover:bg-yellow-50 rounded-2xl text-xs font-bold text-gray-700 transition-all flex items-center gap-3">
                  <span>↩️</span> 답장하기
                </button>
                <button onClick={() => handleAction('task')} className="w-full text-left p-4 hover:bg-gray-50 rounded-2xl text-xs font-bold text-gray-700 transition-all flex items-center gap-3">
                  <span>✅</span> 할일로 등록
                </button>
                {(user.role === 'admin') && (
                  <button onClick={() => handleAction('notice')} className="w-full text-left p-4 hover:bg-gray-50 rounded-2xl text-xs font-bold text-gray-700 transition-all flex items-center gap-3">
                    <span>📢</span> 채팅방 공지로 설정
                  </button>
                )}
              </div>
              <div className="p-4 border-t border-gray-50 text-center">
                <button onClick={() => setActiveActionMsg(null)} className="text-[10px] font-black text-gray-400 hover:text-gray-900 uppercase">닫기</button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 단체 채팅방 생성 모달 */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-in fade-in" onClick={() => setShowGroupModal(false)}>
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-8 shadow-2xl space-y-6 animate-in zoom-in-95" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-gray-900 italic tracking-tighter">새로운 대화 시작</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">채팅방 이름</label>
                <input
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  className="w-full p-4 bg-gray-100 rounded-2xl border-none outline-none font-bold text-sm focus:ring-2 focus:ring-yellow-400"
                  placeholder="프로젝트, 모임 이름 등"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase ml-1">초대할 동료 ({selectedMembers.length}명)</label>
                <div className="h-40 overflow-y-auto border border-gray-100 rounded-2xl p-2 space-y-1 custom-scrollbar bg-gray-50/50">
                  {staffs.filter((s: any) => s.id !== user.id).map((s: any) => (
                    <label key={s.id} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-50 cursor-pointer hover:border-yellow-400 transition-all">
                      <input type="checkbox" checked={selectedMembers.includes(s.id)} onChange={e => {
                        if (e.target.checked) setSelectedMembers([...selectedMembers, s.id]);
                        else setSelectedMembers(selectedMembers.filter(id => id !== s.id));
                      }} className="w-4 h-4 rounded border-gray-300 text-yellow-500 focus:ring-yellow-400" />
                      <span className="text-xs font-bold text-gray-700">{s.name} ({s.position})</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setShowGroupModal(false)} className="flex-1 py-4 bg-gray-100 text-gray-400 rounded-2xl font-black text-xs">취소</button>
                <button onClick={createGroupChat} className="flex-2 py-4 bg-[#fee500] text-gray-900 rounded-2xl font-black text-xs shadow-xl shadow-yellow-900/10 active:scale-95 transition-all">개설하기</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
