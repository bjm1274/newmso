'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

const NOTICE_ROOM_ID = '00000000-0000-0000-0000-000000000000';

export default function ChatView({ user, onRefresh, staffs = [] }: any) {
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

  // 채팅 고도화용 로컬 상태 (DEMO 모드: Supabase 미연동)
  const [polls, setPolls] = useState<any[]>([]);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState('찬성, 반대');
  const [pollVotes, setPollVotes] = useState<any>({});      // { pollId: { optionIndex: count } }
  const [reactions, setReactions] = useState<any>({});      // { messageId: { '👍': count, '❗': count } }
  const [pinnedIds, setPinnedIds] = useState<string[]>([]); // 고정 메시지 ID 목록

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
      .from('posts')
      .select('*')
      .eq('board_type', '공지사항')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    setLatestNotice(notice || null);

    // 채팅방 목록 로드
    const { data: rooms } = await supabase
      .from('chat_rooms')
      .select('*')
      .order('created_at', { ascending: false });
    setChatRooms(rooms || []);
  };

  useEffect(() => {
    fetchData();
    const channel = supabase.channel(`chat-v3`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, () => fetchData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_rooms' }, () => fetchData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedRoomId]);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const pinnedMessages = useMemo(
    () => messages.filter((m) => pinnedIds.includes(m.id)),
    [messages, pinnedIds]
  );

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
      fetchData();
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
      const { error } = await supabase.from('tasks').insert([{ 
        assignee_id: user.id, 
        title: `[채팅] ${activeActionMsg.content}`, 
        status: 'pending' 
      }]);
      if (!error) { alert("할일 등록 완료"); if(onRefresh) onRefresh(); }
    } else {
      const { error } = await supabase.from('posts').insert([{ 
        board_type: '공지사항', 
        sender_id: user.id, 
        title: '채팅 공지', 
        content: activeActionMsg.content 
      }]);
      if (!error) fetchData();
    }
    setActiveActionMsg(null);
  };

  const removeNotice = async () => {
    if (!latestNotice) return;
    if (!confirm("공지를 내리시겠습니까?")) return;
    const { error } = await supabase.from('posts').delete().eq('id', latestNotice.id);
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

  // DEMO: 투표 생성
  const handleCreatePoll = () => {
    if (!pollQuestion.trim()) {
      alert('질문을 입력해 주세요.');
      return;
    }
    const options = pollOptions
      .split(',')
      .map((o) => o.trim())
      .filter((o) => o.length > 0);
    if (options.length < 2) {
      alert('선택지는 최소 2개 이상 입력해 주세요.');
      return;
    }
    const id = Date.now().toString();
    setPolls((prev: any[]) => [
      ...prev,
      { id, room_id: selectedRoomId, question: pollQuestion, options },
    ]);
    setPollQuestion('');
    setPollOptions('찬성, 반대');
    setShowPollModal(false);
  };

  const handleVote = (pollId: string, optionIndex: number) => {
    setPollVotes((prev: any) => {
      const existing = prev[pollId] || {};
      const current = existing[optionIndex] || 0;
      return {
        ...prev,
        [pollId]: {
          ...existing,
          [optionIndex]: current + 1,
        },
      };
    });
  };

  const toggleReaction = (messageId: string, emoji: string) => {
    setReactions((prev: any) => {
      const current = prev[messageId] || {};
      const count = current[emoji] || 0;
      const nextCount = count === 0 ? 1 : 0;
      return {
        ...prev,
        [messageId]: {
          ...current,
          [emoji]: nextCount,
        },
      };
    });
  };

  const togglePin = (messageId: string) => {
    setPinnedIds((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]
    );
  };

  return (
    <div className="flex flex-1 overflow-hidden relative font-sans h-full bg-white">
      {/* 좌측 사이드바: 검색 및 목록 */}
      <aside className="w-80 border-r bg-gray-50 flex flex-col shrink-0">
        <div className="p-6 space-y-4">
          <div className="flex gap-2 bg-white p-1 rounded-xl shadow-sm">
            <button onClick={() => setViewMode('chat')} className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${viewMode === 'chat' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400'}`}>채팅목록</button>
            <button onClick={() => setViewMode('org')} className={`flex-1 py-2 text-[10px] font-black rounded-lg transition-all ${viewMode === 'org' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400'}`}>조직도검색</button>
          </div>
          
          <input 
            className="w-full p-4 bg-white border border-gray-100 rounded-2xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-100" 
            placeholder={viewMode === 'chat' ? "채팅방 검색..." : "이름 또는 부서 검색..."}
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2 custom-scrollbar">
          {viewMode === 'chat' ? (
            <>
              <div 
                onClick={() => setSelectedRoomId(NOTICE_ROOM_ID)}
                className={`p-4 rounded-2xl cursor-pointer transition-all ${selectedRoomId === NOTICE_ROOM_ID ? 'bg-blue-600 text-white shadow-lg' : 'bg-white border hover:border-blue-200'}`}
              >
                <p className="text-xs font-black">📢 전직원 공지방</p>
              </div>
              <button onClick={() => setShowGroupModal(true)} className="w-full p-4 bg-gray-900 text-white rounded-2xl text-[10px] font-black shadow-md hover:scale-[0.98] transition-all">+ 단체 채팅방 생성</button>
              {chatRooms.filter(r => r.name.includes(searchTerm)).map(room => (
                <div 
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`p-4 rounded-2xl cursor-pointer transition-all ${selectedRoomId === room.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-white border hover:border-blue-200'}`}
                >
                  <p className="text-xs font-black">👥 {room.name}</p>
                </div>
              ))}
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
                  <button onClick={() => {/* 1:1 채팅 로직 */}} className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[9px] font-black hover:bg-blue-600 hover:text-white transition-all">대화</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* 우측: 채팅창 본문 */}
      <main className="flex-1 flex flex-col bg-[#FDFDFD] h-full relative">
        {/* 공지 상단 바 */}
        {latestNotice && (
          <div className="w-full bg-orange-50 border-b border-orange-100 p-4 px-8 z-20 flex items-center justify-between shadow-sm shrink-0 animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <span className="text-lg">📢</span>
              <span className="text-sm font-black text-orange-800 truncate">{latestNotice.content}</span>
            </div>
            {(user.role === 'admin' || user.id === latestNotice.sender_id) && (
              <button onClick={removeNotice} className="ml-4 px-3 py-1.5 bg-white border border-orange-200 text-orange-600 rounded-lg text-[10px] font-black hover:bg-orange-600 hover:text-white transition-all shadow-sm">공지 내리기</button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-8 space-y-6 custom-scrollbar">
          {pinnedMessages.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-100 rounded-2xl p-4 space-y-2">
              <p className="text-[10px] font-black text-yellow-700 uppercase tracking-widest">
                📌 고정된 메시지
              </p>
              {pinnedMessages.map((msg: any) => (
                <div key={msg.id} className="text-xs text-gray-700 font-bold truncate">
                  {msg.staff?.name && <span className="text-gray-400 mr-1">[{msg.staff.name}]</span>}
                  {msg.content}
                </div>
              ))}
            </div>
          )}

          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center opacity-20">
              <span className="text-6xl mb-4">💬</span>
              <p className="font-black text-sm">대화 내용이 없습니다.</p>
            </div>
          ) : (
            messages.filter(m => (m.content||'').includes(searchTerm)).map((msg) => {
              const isMine = msg.sender_id === user.id;
              return (
                <div
                  key={msg.id}
                  ref={el => { msgRefs.current[msg.id] = el; }}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  {!isMine && <span className="text-[10px] text-gray-400 px-2 mb-1 font-bold">{msg.staff?.name} {msg.staff?.position}</span>}
                  <div 
                    onClick={() => setActiveActionMsg(msg)} 
                    className={`group relative p-4 rounded-2xl text-sm shadow-sm cursor-pointer transition-all max-w-[70%] ${isMine ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white border rounded-tl-none hover:border-blue-200'}`}
                  >
                    {/* 상단 고정 토글 */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); togglePin(msg.id); }}
                      className={`absolute -top-3 ${isMine ? 'right-2' : 'left-2'} text-[10px] font-black ${
                        pinnedIds.includes(msg.id) ? 'text-yellow-300' : 'text-gray-300'
                      }`}
                    >
                      {pinnedIds.includes(msg.id) ? '★' : '☆'}
                    </button>

                    {msg.content}
                    {msg.file_url && (
                      <a
                        href={msg.file_url}
                        target="_blank"
                        className={`block mt-2 p-2 rounded-lg text-[10px] font-bold border flex items-center gap-2 ${
                          isMine ? 'bg-white/10 border-white/20' : 'bg-gray-50 border-gray-100 text-blue-600'
                        }`}
                      >
                        📎 파일 첨부됨
                      </a>
                    )}

                    {/* 이모지 반응 */}
                    <div className="mt-2 flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleReaction(msg.id, '👍'); }}
                        className="px-2 py-1 rounded-full bg-black/5 hover:bg-black/10 text-xs"
                      >
                        👍
                      </button>
                      {reactions[msg.id] && reactions[msg.id]['👍'] > 0 && (
                        <span className="text-gray-300 font-black">
                          👍 {reactions[msg.id]['👍']}
                        </span>
                      )}
                    </div>

                    <span
                      className={`absolute bottom-0 ${isMine ? 'right-full mr-2' : 'left-full ml-2'} text-[8px] font-bold text-gray-300 whitespace-nowrap`}
                    >
                      {new Date(msg.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              );
            })
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
           <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-[2rem] border border-gray-100 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-50 transition-all">
             <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
             <button onClick={()=>fileInputRef.current?.click()} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-colors">📎</button>
             <button onClick={()=>setShowPollModal(true)} className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 transition-colors">📊</button>
             <input 
               className="flex-1 bg-transparent p-2 outline-none text-sm font-bold" 
               placeholder="메시지를 입력하세요..."
               value={inputMsg} 
               onChange={e=>setInputMsg(e.target.value)} 
               onKeyDown={e=>e.key==='Enter'&&handleSendMessage()} 
             />
             <button onClick={()=>handleSendMessage()} className="bg-blue-600 text-white w-10 h-10 rounded-full shadow-lg hover:scale-105 active:scale-95 transition-all flex items-center justify-center">↑</button>
           </div>
        </div>

        {/* 액션 모달 */}
        {activeActionMsg && (
          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-30 animate-in fade-in duration-200" onClick={()=>setActiveActionMsg(null)}>
            <div className="bg-white p-6 rounded-[2.5rem] space-y-2 w-64 shadow-2xl animate-in zoom-in-95 duration-200" onClick={e=>e.stopPropagation()}>
              <button onClick={()=>{setReplyTo(activeActionMsg); setActiveActionMsg(null)}} className="w-full p-4 text-left hover:bg-blue-50 rounded-2xl text-xs font-black text-blue-600 transition-colors">↩️ 답글 달기</button>
              <button onClick={()=>handleAction('task')} className="w-full p-4 text-left hover:bg-gray-50 rounded-2xl text-xs font-black transition-colors">✅ 할일로 등록</button>
              <button onClick={()=>handleAction('notice')} className="w-full p-4 text-left hover:bg-orange-50 rounded-2xl text-xs font-black text-orange-500 transition-colors">📢 공지로 등록</button>
              <button onClick={()=>setActiveActionMsg(null)} className="w-full p-4 text-center text-gray-400 text-[10px] font-black pt-4">닫기</button>
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

      {/* 투표 생성 모달 (DEMO) */}
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
    </div>
  );
}
