'use client';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export default function ChatMessenger({ user, staffs }: any) {
  const [activeTab, setActiveTab] = useState<'채팅' | '공지' | '검색'>('채팅');
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredStaffs, setFilteredStaffs] = useState<any[]>([]);
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadChatRooms();
    loadAnnouncements();
  }, []);

  // 실시간 메시지 구독
  useEffect(() => {
    if (!selectedRoom) return;

    const channel = supabase
      .channel(`room-${selectedRoom.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `room_id=eq.${selectedRoom.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedRoom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadChatRooms = async () => {
    const { data } = await supabase
      .from('chat_rooms')
      .select('*')
      .order('created_at', { ascending: false });
    
    const sortedRooms = (data || []).sort((a: any, b: any) => {
      if (a.type === 'group' && b.type !== 'group') return -1;
      if (a.type !== 'group' && b.type === 'group') return 1;
      return 0;
    });
    setChatRooms(sortedRooms);
  };

  const loadAnnouncements = async () => {
    const { data } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('is_announcement', true)
      .order('created_at', { ascending: false });
    setAnnouncements(data || []);
  };

  const loadMessages = async (roomId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const handleSelectRoom = (room: any) => {
    setSelectedRoom(room);
    loadMessages(room.id);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom) return;

    const messageContent = newMessage;
    setNewMessage(''); // 즉시 입력창 비우기

    const { error } = await supabase.from('chat_messages').insert({
      room_id: selectedRoom.id,
      sender_id: user.id,
      content: messageContent,
      type: 'text',
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('메시지 전송 실패:', error);
      alert('메시지 전송에 실패했습니다.');
      setNewMessage(messageContent); // 실패 시 복구
    } else {
      // 실시간 구독이 메시지를 추가하겠지만, 즉각적인 피드백을 위해 수동 로드도 병행 가능
      // loadMessages(selectedRoom.id); 
    }
  };

  const deleteAnnouncement = async (announcementId: string) => {
    await supabase
      .from('chat_rooms')
      .delete()
      .eq('id', announcementId);
    loadAnnouncements();
    setSelectedRoom(null);
  };

  const createGroupChat = async () => {
    if (!groupName.trim() || selectedMembers.length === 0) return;

    const { data: newRoom } = await supabase
      .from('chat_rooms')
      .insert({
        name: groupName,
        type: 'group',
        created_by: user.id,
        is_announcement: false,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (newRoom) {
      const memberInserts = selectedMembers.map((memberId: string) => ({
        room_id: newRoom.id,
        user_id: memberId,
        joined_at: new Date().toISOString(),
      }));

      await supabase.from('chat_room_members').insert(memberInserts);

      setGroupName('');
      setSelectedMembers([]);
      setShowNewGroupModal(false);
      loadChatRooms();
    }
  };

  const handleSearch = (term: string) => {
    setSearchTerm(term);
    if (term.trim()) {
      const filtered = staffs.filter((staff: any) =>
        staff.name?.includes(term) || staff.email?.includes(term)
      );
      setFilteredStaffs(filtered);
    } else {
      setFilteredStaffs([]);
    }
  };

  const startDirectChat = async (targetStaff: any) => {
    const { data: existingRoom } = await supabase
      .from('chat_rooms')
      .select('*')
      .eq('type', 'direct')
      .contains('members', [user.id, targetStaff.id])
      .single();

    if (existingRoom) {
      handleSelectRoom(existingRoom);
    } else {
      const { data: newRoom } = await supabase
        .from('chat_rooms')
        .insert({
          name: `${user.name} & ${targetStaff.name}`,
          type: 'direct',
          members: [user.id, targetStaff.id],
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (newRoom) {
        handleSelectRoom(newRoom);
        loadChatRooms();
      }
    }

    setSearchTerm('');
    setFilteredStaffs([]);
  };

  return (
    <div className="flex h-full bg-white overflow-hidden">
      {/* 좌측 사이드바 */}
      <div className="w-80 border-r border-gray-200 flex flex-col shrink-0">
        <div className="flex border-b border-gray-200">
          {(['채팅', '공지', '검색'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 font-black text-sm transition-all ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {tab === '채팅' && '💬'}
              {tab === '공지' && '📢'}
              {tab === '검색' && '🔍'}
              {' '}{tab}
            </button>
          ))}
        </div>

        {activeTab === '채팅' && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4">
              <button
                onClick={() => setShowNewGroupModal(true)}
                className="w-full mb-4 px-4 py-2 bg-blue-600 text-white rounded-lg font-black text-sm hover:bg-blue-700 transition-all"
              >
                ➕ 단체채팅방 만들기
              </button>

              <div className="space-y-2">
                {chatRooms.map((room: any) => (
                  <div
                    key={room.id}
                    onClick={() => handleSelectRoom(room)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${
                      selectedRoom?.id === room.id
                        ? 'bg-blue-100 border-2 border-blue-600'
                        : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    <p className="font-bold text-gray-800 truncate">
                      {room.type === 'group' ? '👥' : '💬'} {room.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {room.last_message || '메시지 없음'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === '공지' && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-4 space-y-2">
              <div className="p-4 mb-4 bg-blue-600 rounded-2xl shadow-lg border-2 border-blue-400">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">📢</div>
                  <div>
                    <p className="text-white font-black text-sm">전직원 공지방</p>
                    <p className="text-blue-100 text-[10px] font-bold">필독 사항 및 주요 공지</p>
                  </div>
                </div>
              </div>

              {announcements.map((announce: any) => (
                <div
                  key={announce.id}
                  onClick={() => handleSelectRoom(announce)}
                  className={`p-3 rounded-lg cursor-pointer transition-all group ${
                    selectedRoom?.id === announce.id
                      ? 'bg-red-100 border-2 border-red-600'
                      : 'bg-red-50 hover:bg-red-100'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-black text-red-800">📢 {announce.name}</p>
                      <p className="text-xs text-red-600 mt-1">
                        {new Date(announce.created_at).toLocaleDateString('ko-KR')}
                      </p>
                    </div>
                    {user.role === 'admin' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteAnnouncement(announce.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 font-black"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === '검색' && (
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <input
                type="text"
                placeholder="직원 검색..."
                value={searchTerm}
                onChange={(e) => handleSearch(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-600"
              />
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {filteredStaffs.map((staff: any) => (
                <div
                  key={staff.id}
                  onClick={() => startDirectChat(staff)}
                  className="p-3 rounded-lg bg-gray-50 hover:bg-blue-50 cursor-pointer transition-all mb-2 border border-gray-200 hover:border-blue-300"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-black text-xs">
                      {staff.name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 truncate">{staff.name}</p>
                      <p className="text-xs text-gray-500 truncate">{staff.position}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 우측 채팅 영역 */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {selectedRoom ? (
          <>
            <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shrink-0">
              <h3 className="font-black text-lg text-gray-800">{selectedRoom.name}</h3>
              {selectedRoom.is_announcement && user.role === 'admin' && (
                <button
                  onClick={() => deleteAnnouncement(selectedRoom.id)}
                  className="px-3 py-1 bg-red-100 text-red-600 rounded text-sm font-black hover:bg-red-200"
                >
                  공지 내리기
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
              {messages.map((msg: any) => {
                const sender = staffs.find((s: any) => s.id === msg.sender_id);
                const isOwn = msg.sender_id === user.id;

                return (
                  <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[70%] ${isOwn ? 'bg-blue-600 text-white rounded-l-2xl rounded-tr-2xl' : 'bg-white text-gray-800 rounded-r-2xl rounded-tl-2xl shadow-sm'} p-4`}>
                      {!isOwn && <p className="text-[10px] font-black text-blue-600 mb-1">{sender?.name || '알 수 없음'}</p>}
                      <p className="text-sm font-medium leading-relaxed">{msg.content}</p>
                      <p className={`text-[9px] mt-2 ${isOwn ? 'text-blue-100' : 'text-gray-400'} font-bold`}>
                        {new Date(msg.created_at).toLocaleTimeString('ko-KR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 bg-white border-t border-gray-200 flex gap-2 shrink-0">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="메시지를 입력하세요..."
                className="flex-1 px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-100 text-sm font-bold"
              />
              <button
                onClick={sendMessage}
                className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black text-sm hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
              >
                전송
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300 space-y-4">
            <p className="text-6xl">💬</p>
            <p className="font-black text-xl italic">대화를 시작할 채팅방을 선택하세요</p>
          </div>
        )}
      </div>

      {showNewGroupModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-300">
            <h3 className="text-2xl font-black text-gray-900 mb-6 tracking-tighter italic">단체채팅방 만들기</h3>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">채팅방 이름</label>
                <input
                  type="text"
                  placeholder="예: 행정팀 주간회의"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-blue-100 font-bold"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">멤버 선택</label>
                <div className="max-h-48 overflow-y-auto space-y-2 bg-gray-50 rounded-xl p-4 custom-scrollbar">
                  {staffs.map((staff: any) => (
                    <label key={staff.id} className="flex items-center gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(staff.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMembers([...selectedMembers, staff.id]);
                          } else {
                            setSelectedMembers(selectedMembers.filter(id => id !== staff.id));
                          }
                        }}
                        className="w-5 h-5 rounded-lg border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-bold text-gray-700 group-hover:text-blue-600 transition-colors">{staff.name} ({staff.position})</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => {
                    setShowNewGroupModal(false);
                    setGroupName('');
                    setSelectedMembers([]);
                  }}
                  className="flex-1 px-4 py-4 bg-gray-100 text-gray-500 rounded-2xl font-black text-sm hover:bg-gray-200 transition-all"
                >
                  취소
                </button>
                <button
                  onClick={createGroupChat}
                  className="flex-1 px-4 py-4 bg-blue-600 text-white rounded-2xl font-black text-sm hover:bg-blue-700 transition-all shadow-xl shadow-blue-100"
                >
                  생성하기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
