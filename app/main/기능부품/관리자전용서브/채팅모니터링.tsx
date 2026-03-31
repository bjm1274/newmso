'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';

type Staff = {
  id: string;
  name: string;
  position?: string;
  department?: string;
  company?: string;
};

type ChatRoom = {
  id: string;
  name?: string;
  type?: string;
  members?: string[];
  last_message?: string;
  last_message_at?: string;
  updated_at?: string;
};

type Message = {
  id: string;
  room_id: string;
  sender_id: string;
  content?: string;
  file_url?: string;
  file_name?: string;
  created_at: string;
};

const BANNED_WORDS_KEY = 'erp-banned-words';
const DEFAULT_BANNED = ['씨발', '개새끼', '병신', '지랄', '미친놈', '꺼져', '죽어', '쓰레기', '찐따', '바보', '멍청이', 'ㅅㅂ', 'ㅂㅅ', 'ㅈㄹ'];

function loadBannedWords(): string[] {
  if (typeof window === 'undefined') return DEFAULT_BANNED;
  try {
    const raw = localStorage.getItem(BANNED_WORDS_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_BANNED;
  } catch { return DEFAULT_BANNED; }
}

function saveBannedWords(words: string[]) {
  localStorage.setItem(BANNED_WORDS_KEY, JSON.stringify(words));
}

function containsBanned(content: string, banned: string[]): boolean {
  const lower = content.toLowerCase();
  return banned.some((w) => lower.includes(w.toLowerCase()));
}

function highlightBanned(content: string, banned: string[]): React.ReactNode[] {
  if (!banned.length) return [content];
  const pattern = banned.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts = content.split(regex);
  return parts.map((part, i) => {
    if (banned.some((w) => part.toLowerCase() === w.toLowerCase())) {
      return <mark key={i} className="bg-red-400 text-white rounded px-0.5">{part}</mark>;
    }
    return part;
  });
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const palette = ['bg-sky-100 text-sky-700','bg-emerald-100 text-emerald-700','bg-violet-100 text-violet-700','bg-amber-100 text-amber-700','bg-rose-100 text-rose-700'];
  const color = palette[(name.charCodeAt(0) || 0) % palette.length];
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div className={`${sz} ${color} rounded-full flex items-center justify-center font-bold shrink-0`}>
      {name[0] || '?'}
    </div>
  );
}

function formatTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  if (diffDays < 7) return `${diffDays}일 전`;
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

// ── 금지어 관리 패널 ──────────────────────────────────────────────────
function BannedWordManager({ onClose }: { onClose: () => void }) {
  const [words, setWords] = useState<string[]>(loadBannedWords);
  const [input, setInput] = useState('');

  const add = () => {
    const w = input.trim();
    if (!w) return;
    if (words.includes(w)) { toast('이미 등록된 단어입니다.', 'warning'); return; }
    const next = [...words, w];
    setWords(next);
    saveBannedWords(next);
    setInput('');
    toast(`"${w}" 등록 완료`, 'success');
  };

  const remove = (w: string) => {
    const next = words.filter((x) => x !== w);
    setWords(next);
    saveBannedWords(next);
  };

  const reset = () => {
    if (!confirm('기본 금지어 목록으로 초기화하시겠습니까?')) return;
    setWords(DEFAULT_BANNED);
    saveBannedWords(DEFAULT_BANNED);
    toast('초기화 완료', 'success');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-[var(--foreground)]">🚫 금지어 관리</h3>
          <button onClick={onClose} className="text-[var(--toss-gray-3)] hover:text-[var(--foreground)] text-lg leading-none">×</button>
        </div>

        <div className="flex gap-2 mb-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="금지어 입력 후 Enter"
            className="flex-1 px-3 py-1.5 text-sm border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--page-bg)] text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
          />
          <button onClick={add} className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)]">추가</button>
        </div>

        <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto mb-4 p-2 bg-[var(--page-bg)] rounded-[var(--radius-md)] border border-[var(--border)]">
          {words.length === 0 && <p className="text-xs text-[var(--toss-gray-3)]">등록된 금지어 없음</p>}
          {words.map((w) => (
            <span key={w} className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/20 text-red-700 text-xs font-semibold rounded-full">
              {w}
              <button onClick={() => remove(w)} className="hover:text-red-900 font-bold">×</button>
            </span>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={reset} className="px-3 py-1.5 text-xs text-[var(--toss-gray-3)] border border-[var(--border)] rounded-[var(--radius-md)] hover:bg-[var(--muted)]">기본값으로 초기화</button>
          <button onClick={onClose} className="px-3 py-1.5 bg-[var(--accent)] text-white text-xs font-bold rounded-[var(--radius-md)]">확인</button>
        </div>
      </div>
    </div>
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────
export default function ChatMonitor({ staffs: propStaffs }: { staffs?: Staff[] }) {
  const [staffs, setStaffs] = useState<Staff[]>(propStaffs || []);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom | null>(null);
  const [staffSearch, setStaffSearch] = useState('');
  const [msgSearch, setMsgSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [msgLoading, setMsgLoading] = useState(false);
  const [bannedWords, setBannedWords] = useState<string[]>(loadBannedWords);
  const [showBannedManager, setShowBannedManager] = useState(false);
  const [showFlaggedOnly, setShowFlaggedOnly] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!propStaffs || propStaffs.length === 0) {
      supabase.from('staff_members').select('id,name,position,department,company').then(({ data }) => {
        setStaffs((data as Staff[]) || []);
      });
    }
  }, [propStaffs]);

  useEffect(() => {
    if (!selectedStaff) { setRooms([]); setSelectedRoom(null); setMessages([]); return; }
    setLoading(true);
    setSelectedRoom(null);
    setMessages([]);
    supabase
      .from('chat_rooms')
      .select('*')
      .contains('members', [selectedStaff.id])
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        setRooms((data as ChatRoom[]) || []);
        setLoading(false);
      });
  }, [selectedStaff]);

  useEffect(() => {
    if (!selectedRoom) { setMessages([]); return; }
    setMsgLoading(true);
    supabase
      .from('messages')
      .select('*')
      .eq('room_id', selectedRoom.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setMessages((data as Message[]) || []);
        setMsgLoading(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      });
  }, [selectedRoom]);

  // 금지어 관리 모달 닫을 때 최신 목록 반영
  const handleCloseBannedManager = () => {
    setBannedWords(loadBannedWords());
    setShowBannedManager(false);
  };

  const staffMap = useMemo(() => new Map(staffs.map((s) => [s.id, s])), [staffs]);

  const filteredStaffs = useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    if (!q) return staffs;
    return staffs.filter((s) => [s.name, s.position, s.department, s.company].some((v) => (v || '').toLowerCase().includes(q)));
  }, [staffs, staffSearch]);

  const displayMessages = useMemo(() => {
    let list = messages;
    if (showFlaggedOnly) list = list.filter((m) => m.content && containsBanned(m.content, bannedWords));
    if (msgSearch.trim()) {
      const q = msgSearch.trim().toLowerCase();
      list = list.filter((m) => (m.content || '').toLowerCase().includes(q));
    }
    return list;
  }, [messages, showFlaggedOnly, msgSearch, bannedWords]);

  const flaggedCount = useMemo(
    () => messages.filter((m) => m.content && containsBanned(m.content, bannedWords)).length,
    [messages, bannedWords],
  );

  const deleteMessage = async (msg: Message) => {
    if (!confirm('이 메시지를 삭제하시겠습니까?')) return;
    setDeletingId(msg.id);
    const { error } = await supabase.from('messages').delete().eq('id', msg.id);
    if (error) {
      toast('삭제 실패: ' + error.message, 'error');
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      toast('메시지가 삭제되었습니다.', 'success');
    }
    setDeletingId(null);
  };

  function getRoomLabel(room: ChatRoom) {
    if (room.name) return room.name;
    if (room.type === 'direct' && room.members && selectedStaff) {
      const otherId = room.members.find((m) => m !== selectedStaff.id);
      const other = otherId ? staffMap.get(otherId) : null;
      return other ? other.name : '1:1 대화';
    }
    return '채팅방';
  }

  function getRoomSubLabel(room: ChatRoom) {
    if (!room.members) return '';
    return room.members
      .filter((m) => m !== selectedStaff?.id)
      .map((m) => staffMap.get(m)?.name || '알 수 없음')
      .slice(0, 3)
      .join(', ') + (room.members.length > 4 ? ` 외 ${room.members.length - 4}명` : '');
  }

  return (
    <>
      {showBannedManager && <BannedWordManager onClose={handleCloseBannedManager} />}

      <div className="flex h-[calc(100vh-200px)] min-h-[500px] gap-0 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)]">

        {/* ── 직원 목록 ── */}
        <div className="w-48 shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--card)]">
          <div className="p-2 border-b border-[var(--border)]">
            <p className="text-xs font-bold text-[var(--foreground)] mb-1.5">전체 직원</p>
            <input
              value={staffSearch}
              onChange={(e) => setStaffSearch(e.target.value)}
              placeholder="이름·부서 검색"
              className="w-full px-2 py-1 text-xs border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--page-bg)] text-[var(--foreground)] placeholder:text-[var(--toss-gray-3)] outline-none"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredStaffs.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedStaff(s)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 text-left transition hover:bg-[var(--muted)] ${selectedStaff?.id === s.id ? 'bg-[var(--accent)]/10 border-r-2 border-[var(--accent)]' : ''}`}
              >
                <Avatar name={s.name} size="sm" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[var(--foreground)] truncate">{s.name}</p>
                  <p className="text-[10px] text-[var(--toss-gray-3)] truncate">{s.department || s.company || '-'}</p>
                </div>
              </button>
            ))}
            {filteredStaffs.length === 0 && <p className="text-xs text-[var(--toss-gray-3)] text-center py-6">검색 결과 없음</p>}
          </div>
        </div>

        {/* ── 채팅방 목록 ── */}
        <div className="w-52 shrink-0 flex flex-col border-r border-[var(--border)] bg-[var(--card)]">
          <div className="px-3 py-2.5 border-b border-[var(--border)]">
            {selectedStaff ? (
              <div>
                <p className="text-xs font-bold text-[var(--foreground)]">{selectedStaff.name}의 채팅방</p>
                <p className="text-[10px] text-[var(--toss-gray-3)]">총 {rooms.length}개</p>
              </div>
            ) : (
              <p className="text-xs text-[var(--toss-gray-3)]">직원을 선택하세요</p>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && <div className="flex items-center justify-center py-8"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>}
            {!loading && selectedStaff && rooms.length === 0 && <p className="text-xs text-[var(--toss-gray-3)] text-center py-6">채팅방 없음</p>}
            {!loading && rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                onClick={() => setSelectedRoom(room)}
                className={`w-full flex items-start gap-2 px-2.5 py-2.5 text-left transition hover:bg-[var(--muted)] border-b border-[var(--border)]/50 ${selectedRoom?.id === room.id ? 'bg-[var(--accent)]/10 border-r-2 border-[var(--accent)]' : ''}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 ${room.type === 'direct' ? 'bg-sky-100 text-sky-700' : room.type === 'notice' ? 'bg-amber-100 text-amber-700' : 'bg-violet-100 text-violet-700'}`}>
                  {room.type === 'direct' ? '1:1' : room.type === 'notice' ? '공지' : '그룹'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-[var(--foreground)] truncate">{getRoomLabel(room)}</p>
                  <p className="text-[10px] text-[var(--toss-gray-3)] truncate">{getRoomSubLabel(room)}</p>
                  {room.last_message && <p className="text-[10px] text-[var(--toss-gray-4)] truncate mt-0.5">{room.last_message}</p>}
                </div>
                <span className="text-[9px] text-[var(--toss-gray-3)] shrink-0 mt-0.5">{formatTime(room.updated_at || room.last_message_at)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── 메시지 영역 ── */}
        <div className="flex-1 flex flex-col bg-[var(--page-bg)] min-w-0">
          {/* 툴바 */}
          <div className="px-4 py-2 border-b border-[var(--border)] bg-[var(--card)] flex items-center gap-2 flex-wrap">
            {selectedRoom ? (
              <>
                <p className="text-sm font-bold text-[var(--foreground)]">{getRoomLabel(selectedRoom)}</p>
                <span className="text-[10px] text-[var(--toss-gray-3)] bg-[var(--muted)] px-2 py-0.5 rounded-full">{selectedRoom.members?.length || 0}명</span>
                {flaggedCount > 0 && (
                  <span className="text-[10px] font-bold text-red-600 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                    🚫 금지어 {flaggedCount}건
                  </span>
                )}
                {/* 메시지 검색 */}
                <input
                  value={msgSearch}
                  onChange={(e) => setMsgSearch(e.target.value)}
                  placeholder="메시지 검색..."
                  className="ml-auto px-2.5 py-1 text-xs border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--page-bg)] text-[var(--foreground)] outline-none w-36"
                />
                <button
                  onClick={() => setShowFlaggedOnly((v) => !v)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-[var(--radius-md)] border transition ${showFlaggedOnly ? 'bg-red-500/100 text-white border-red-500' : 'border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]'}`}
                >
                  🚫 금지어만
                </button>
                <button
                  onClick={() => setShowBannedManager(true)}
                  className="px-2.5 py-1 text-xs font-bold rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)] transition"
                >
                  금지어 관리
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-[var(--toss-gray-3)] flex-1">채팅방을 선택하면 대화 내용이 표시됩니다</p>
                <button
                  onClick={() => setShowBannedManager(true)}
                  className="px-2.5 py-1 text-xs font-bold rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)] transition"
                >
                  🚫 금지어 관리
                </button>
              </>
            )}
          </div>

          {/* 메시지 목록 */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5">
            {msgLoading && <div className="flex items-center justify-center py-8"><div className="w-5 h-5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" /></div>}
            {!msgLoading && selectedRoom && displayMessages.length === 0 && (
              <p className="text-xs text-[var(--toss-gray-3)] text-center py-8">
                {showFlaggedOnly ? '금지어 포함 메시지가 없습니다' : msgSearch ? '검색 결과 없음' : '대화 내용이 없습니다'}
              </p>
            )}
            {!msgLoading && displayMessages.map((msg) => {
              const sender = staffMap.get(msg.sender_id);
              const senderName = sender?.name || '알 수 없음';
              const isMine = msg.sender_id === selectedStaff?.id;
              const isFlagged = !!(msg.content && containsBanned(msg.content, bannedWords));
              return (
                <div key={msg.id} className={`flex gap-2 group ${isMine ? 'flex-row-reverse' : ''} ${isFlagged ? 'bg-red-500/10 -mx-2 px-2 rounded-lg' : ''}`}>
                  {!isMine && <Avatar name={senderName} size="sm" />}
                  <div className={`flex flex-col gap-0.5 max-w-[70%] ${isMine ? 'items-end' : 'items-start'}`}>
                    {!isMine && (
                      <p className="text-[10px] font-semibold text-[var(--toss-gray-3)] px-1">
                        {senderName} · {sender?.department || ''}
                        {isFlagged && <span className="ml-1 text-red-500 font-bold">🚫</span>}
                      </p>
                    )}
                    <div className={`flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : ''}`}>
                      <div className={`px-2.5 py-1.5 rounded-xl text-xs leading-relaxed ${
                        isFlagged
                          ? 'bg-red-500/20 border border-red-300 text-[var(--foreground)] rounded-tl-sm'
                          : isMine
                            ? 'bg-[var(--accent)] text-white rounded-tr-sm'
                            : 'bg-[var(--card)] border border-[var(--border)] text-[var(--foreground)] rounded-tl-sm'
                      }`}>
                        {msg.content ? (
                          <p className="whitespace-pre-wrap break-words">
                            {isFlagged ? highlightBanned(msg.content, bannedWords) : msg.content}
                          </p>
                        ) : msg.file_url ? (
                          <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className="underline opacity-80">
                            📎 {msg.file_name || '첨부파일'}
                          </a>
                        ) : null}
                      </div>
                      {/* 삭제 버튼 */}
                      <button
                        onClick={() => deleteMessage(msg)}
                        disabled={deletingId === msg.id}
                        className={`opacity-0 group-hover:opacity-100 transition-opacity shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold
                          ${isFlagged ? 'bg-red-500/100 text-white opacity-100' : 'bg-[var(--muted)] text-[var(--toss-gray-3)] hover:bg-red-500/100 hover:text-white'}`}
                        title="메시지 삭제"
                      >
                        {deletingId === msg.id ? '…' : '🗑'}
                      </button>
                    </div>
                    <p className={`text-[9px] text-[var(--toss-gray-3)] px-1 ${isMine ? 'text-right' : ''}`}>
                      {new Date(msg.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>
      </div>
    </>
  );
}
