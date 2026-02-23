'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ChatMessengerAdvanced({ user }: any) {
  const [chatRooms, setChatRooms] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomType, setRoomType] = useState('1:1'); // '1:1' 또는 '그룹'
  const [roomName, setRoomName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  useEffect(() => {
    fetchChatRooms();
    fetchStaffList();
  }, []);

  const fetchChatRooms = async () => {
    const { data } = await supabase
      .from('chat_rooms')
      .select('*')
      .order('created_at', { ascending: false });
    setChatRooms(data || []);
  };

  const fetchStaffList = async () => {
    const { data } = await supabase.from('staffs').select('id, name, position');
    setStaffList(data || []);
  };

  const fetchMessages = async (roomId: string) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
  };

  const createChatRoom = async () => {
    if (!roomName) {
      alert('채팅방 이름을 입력해주세요.');
      return;
    }

    if (roomType === '그룹' && selectedMembers.length === 0) {
      alert('그룹 멤버를 선택해주세요.');
      return;
    }

    const newRoom = {
      name: roomName,
      type: roomType,
      members: roomType === '1:1' ? [] : selectedMembers,
      created_by: user.id,
      is_announcement: false,
    };

    const { data } = await supabase
      .from('chat_rooms')
      .insert([newRoom])
      .select();

    if (data) {
      setChatRooms([...chatRooms, data[0]]);
      setShowCreateModal(false);
      setRoomName('');
      setSelectedMembers([]);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom) return;

    const message = {
      room_id: selectedRoom.id,
      sender_id: user.id,
      content: newMessage,
      type: 'text',
      created_at: new Date().toISOString(),
    };

    const { data } = await supabase
      .from('chat_messages')
      .insert([message])
      .select();

    if (data) {
      setMessages([...messages, data[0]]);
      setNewMessage('');
    }
  };

  const deleteMessage = async (messageId: string) => {
    await supabase.from('chat_messages').delete().eq('id', messageId);
    setMessages(messages.filter((m) => m.id !== messageId));
    setShowDeleteConfirm(false);
    setDeleteTarget(null);
  };

  const deleteAnnouncement = async (messageId: string) => {
    if (selectedRoom?.is_announcement) {
      await deleteMessage(messageId);
    }
  };

  return (
    <div className="flex h-full gap-4">
      {/* 채팅방 목록 */}
      <div className="w-80 bg-white border border-[var(--toss-border)] rounded-xl shadow-sm flex flex-col">
        <div className="p-6 border-b border-[var(--toss-border)] flex justify-between items-center">
          <h3 className="font-semibold text-[var(--foreground)]">💬 채팅</h3>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-3 py-2 bg-[var(--toss-blue)] text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-all"
          >
            + 새 채팅
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 p-4">
          {chatRooms.map((room) => (
            <button
              key={room.id}
              onClick={() => {
                setSelectedRoom(room);
                fetchMessages(room.id);
              }}
              className={`w-full text-left p-4 rounded-lg transition-all ${
                selectedRoom?.id === room.id
                  ? 'bg-[var(--toss-blue-light)] border-2 border-blue-600'
                  : 'bg-[var(--toss-gray-1)] hover:bg-[var(--toss-gray-1)] border border-[var(--toss-border)]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-[var(--foreground)]">{room.name}</p>
                  <p className="text-xs text-[var(--toss-gray-3)]">
                    {room.type === '1:1' ? '1:1 채팅' : '그룹 채팅'}
                    {room.is_announcement && ' • 공지'}
                  </p>
                </div>
                {room.is_announcement && <span className="text-lg">📢</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* 채팅 영역 */}
      {selectedRoom ? (
        <div className="flex-1 bg-white border border-[var(--toss-border)] rounded-xl shadow-sm flex flex-col">
          {/* 헤더 */}
          <div className="p-6 border-b border-[var(--toss-border)] flex justify-between items-center">
            <div>
              <h2 className="font-semibold text-lg text-[var(--foreground)]">{selectedRoom.name}</h2>
              <p className="text-xs text-[var(--toss-gray-3)]">
                {selectedRoom.type === '1:1' ? '1:1 채팅' : `그룹 채팅 (${selectedRoom.members?.length || 0}명)`}
              </p>
            </div>
            {selectedRoom.is_announcement && (
              <span className="px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-bold">
                📢 공지사항
              </span>
            )}
          </div>

          {/* 메시지 영역 */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender_id === user.id ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs px-4 py-3 rounded-lg ${
                    msg.sender_id === user.id
                      ? 'bg-[var(--toss-blue)] text-white'
                      : 'bg-[var(--toss-gray-1)] text-[var(--foreground)]'
                  } group relative`}
                >
                  <p className="text-sm">{msg.content}</p>
                  <p className="text-xs mt-1 opacity-70">
                    {new Date(msg.created_at).toLocaleTimeString('ko-KR')}
                  </p>

                  {/* 삭제 버튼 (공지사항 또는 본인 메시지) */}
                  {(selectedRoom.is_announcement || msg.sender_id === user.id) && (
                    <button
                      onClick={() => {
                        setDeleteTarget(msg);
                        setShowDeleteConfirm(true);
                      }}
                      className="absolute -right-8 top-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-600 hover:text-red-700 text-xs font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 입력 영역 */}
          <div className="p-6 border-t border-[var(--toss-border)] flex gap-3">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="메시지를 입력하세요..."
              className="flex-1 px-4 py-3 border border-[var(--toss-border)] rounded-lg focus:outline-none focus:border-[var(--toss-blue)]"
            />
            <button
              onClick={sendMessage}
              className="px-6 py-3 bg-[var(--toss-blue)] text-white rounded-lg font-bold hover:bg-blue-700 transition-all"
            >
              전송
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white border border-[var(--toss-border)] rounded-xl shadow-sm flex items-center justify-center">
          <p className="text-[var(--toss-gray-3)] font-bold">채팅방을 선택해주세요.</p>
        </div>
      )}

      {/* 채팅방 생성 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 w-96 shadow-2xl">
            <h3 className="text-xl font-semibold text-[var(--foreground)] mb-6">새 채팅방 만들기</h3>

            {/* 채팅 유형 선택 */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-[var(--foreground)] mb-3">
                채팅 유형
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => setRoomType('1:1')}
                  className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                    roomType === '1:1'
                      ? 'bg-[var(--toss-blue)] text-white'
                      : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'
                  }`}
                >
                  1:1 채팅
                </button>
                <button
                  onClick={() => setRoomType('그룹')}
                  className={`flex-1 py-3 rounded-lg font-bold transition-all ${
                    roomType === '그룹'
                      ? 'bg-[var(--toss-blue)] text-white'
                      : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'
                  }`}
                >
                  그룹 채팅
                </button>
              </div>
            </div>

            {/* 채팅방 이름 */}
            <div className="mb-6">
              <label className="block text-sm font-bold text-[var(--foreground)] mb-2">
                채팅방 이름
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="채팅방 이름을 입력하세요"
                className="w-full px-4 py-3 border border-[var(--toss-border)] rounded-lg focus:outline-none focus:border-[var(--toss-blue)]"
              />
            </div>

            {/* 그룹 멤버 선택 */}
            {roomType === '그룹' && (
              <div className="mb-6">
                <label className="block text-sm font-bold text-[var(--foreground)] mb-3">
                  멤버 선택
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {staffList.map((staff) => (
                    <label
                      key={staff.id}
                      className="flex items-center gap-3 p-2 hover:bg-[var(--toss-gray-1)] rounded-lg cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedMembers.includes(staff.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedMembers([...selectedMembers, staff.id]);
                          } else {
                            setSelectedMembers(
                              selectedMembers.filter((id) => id !== staff.id)
                            );
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <div>
                        <p className="text-sm font-bold text-[var(--foreground)]">{staff.name}</p>
                        <p className="text-xs text-[var(--toss-gray-3)]">{staff.position}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* 버튼 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setRoomName('');
                  setSelectedMembers([]);
                }}
                className="flex-1 py-3 bg-[var(--toss-gray-1)] text-[var(--foreground)] rounded-lg font-bold hover:bg-[var(--toss-gray-2)] transition-all"
              >
                취소
              </button>
              <button
                onClick={createChatRoom}
                className="flex-1 py-3 bg-[var(--toss-blue)] text-white rounded-lg font-bold hover:bg-blue-700 transition-all"
              >
                생성
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-8 w-80 shadow-2xl">
            <h3 className="text-lg font-semibold text-[var(--foreground)] mb-4">메시지 삭제</h3>
            <p className="text-sm text-[var(--toss-gray-4)] mb-6">
              {selectedRoom.is_announcement
                ? '이 공지사항을 삭제하시겠습니까?'
                : '이 메시지를 삭제하시겠습니까?'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 bg-[var(--toss-gray-1)] text-[var(--foreground)] rounded-lg font-bold hover:bg-[var(--toss-gray-2)] transition-all"
              >
                취소
              </button>
              <button
                onClick={() => deleteMessage(deleteTarget.id)}
                className="flex-1 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-all"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
