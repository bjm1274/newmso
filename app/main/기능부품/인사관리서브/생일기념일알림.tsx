'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

export default function BirthdayAnniversary({ staffs = [], user }: { staffs: any[]; user: any }) {
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'이번달' | '오늘' | '전체'>('이번달');

  const today = new Date();
  const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const thisMonth = String(today.getMonth() + 1).padStart(2, '0');

  const enriched = useMemo(() => staffs.map(s => {
    const birth = s.birth_date || s.birthdate;
    const join = s.join_date;
    const birthMD = birth ? birth.slice(5) : null;
    const joinMD = join ? join.slice(5) : null;
    const joinYear = join ? Number(join.slice(0, 4)) : null;
    const yearsWorked = joinYear ? today.getFullYear() - joinYear : null;
    return { ...s, birthMD, joinMD, yearsWorked };
  }), [staffs]);

  const isBirthToday = (s: any) => s.birthMD === todayMD;
  const isJoinToday = (s: any) => s.joinMD === todayMD;
  const isBirthMonth = (s: any) => s.birthMD?.startsWith(thisMonth);
  const isJoinMonth = (s: any) => s.joinMD?.startsWith(thisMonth);

  const filtered = useMemo(() => {
    if (filter === '오늘') return enriched.filter(s => isBirthToday(s) || isJoinToday(s));
    if (filter === '이번달') return enriched.filter(s => isBirthMonth(s) || isJoinMonth(s));
    return enriched.filter(s => s.birthMD || s.joinMD);
  }, [enriched, filter]);

  const sortedList = useMemo(() => [...filtered].sort((a, b) => {
    const aDay = a.birthMD || a.joinMD || '12-31';
    const bDay = b.birthMD || b.joinMD || '12-31';
    return aDay.localeCompare(bDay);
  }), [filtered]);

  const sendChatMessage = async (staff: any, type: '생일' | '기념일') => {
    setSendingId(staff.id);
    try {
      const msg = type === '생일'
        ? `🎂 ${staff.name}님 생일을 축하합니다! 행복한 하루 되세요!`
        : `🎉 ${staff.name}님 입사 ${staff.yearsWorked}주년을 축하합니다! 함께해 주셔서 감사합니다!`;

      const { data: rooms } = await supabase.from('chat_rooms').select('id').eq('type', 'notice').single();
      if (rooms?.id) {
        await supabase.from('messages').insert([{
          room_id: rooms.id,
          sender_id: user?.id,
          content: msg,
        }]);
      }
      await supabase.from('notifications').insert([{
        user_id: staff.id,
        type: type === '생일' ? 'birthday' : 'work_anniversary',
        title: type === '생일' ? '생일 축하 메시지' : `입사 ${staff.yearsWorked}주년`,
        body: msg,
      }]);
      setSent(prev => new Set([...prev, `${staff.id}-${type}`]));
      alert('축하 메시지를 전송했습니다.');
    } catch {
      alert('전송 실패');
    } finally {
      setSendingId(null);
    }
  };

  const todayBirths = enriched.filter(isBirthToday);
  const todayJoins = enriched.filter(isJoinToday);

  return (
    <div className="p-4 md:p-8 space-y-6">
      {/* 오늘 배너 */}
      {(todayBirths.length > 0 || todayJoins.length > 0) && (
        <div className="bg-gradient-to-r from-pink-500 to-purple-600 rounded-[20px] p-5 text-white shadow-lg">
          <p className="text-xs font-bold opacity-80 mb-2">오늘의 이벤트</p>
          <div className="flex flex-wrap gap-3">
            {todayBirths.map(s => (
              <div key={s.id} className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1.5">
                <span>🎂</span>
                <span className="text-sm font-bold">{s.name} 생일</span>
              </div>
            ))}
            {todayJoins.map(s => (
              <div key={s.id} className="flex items-center gap-2 bg-white/20 rounded-full px-3 py-1.5">
                <span>🎉</span>
                <span className="text-sm font-bold">{s.name} 입사 {s.yearsWorked}주년</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="flex gap-2">
        {(['오늘', '이번달', '전체'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${filter === f ? 'bg-[var(--toss-blue)] text-white shadow-sm' : 'bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)]'}`}>
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-[var(--toss-gray-3)] self-center">{sortedList.length}명</span>
      </div>

      {/* 목록 */}
      {sortedList.length === 0 ? (
        <div className="text-center py-16 text-[var(--toss-gray-3)] font-bold text-sm">
          {filter === '오늘' ? '오늘 생일/기념일인 직원이 없습니다.' : '해당 기간에 생일/기념일인 직원이 없습니다.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {sortedList.map(s => {
            const birthToday = isBirthToday(s);
            const joinToday = isJoinToday(s);
            return (
              <div key={s.id} className={`bg-[var(--toss-card)] border rounded-[16px] p-4 shadow-sm transition-all ${birthToday || joinToday ? 'border-pink-300 bg-pink-50/30' : 'border-[var(--toss-border)]'}`}>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--toss-blue)] to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                    {s.name?.[0]}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">{s.name}</p>
                    <p className="text-[10px] text-[var(--toss-gray-3)]">{s.department} · {s.position}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {s.birthMD && (
                    <div className={`flex items-center justify-between text-xs p-2 rounded-[8px] ${birthToday ? 'bg-pink-100' : 'bg-[var(--toss-gray-1)]'}`}>
                      <span>🎂 생일 {s.birthMD.replace('-', '월 ')}일</span>
                      {birthToday && (
                        <button
                          onClick={() => sendChatMessage(s, '생일')}
                          disabled={sendingId === s.id || sent.has(`${s.id}-생일`)}
                          className="px-2 py-0.5 bg-pink-500 text-white rounded-full text-[9px] font-bold disabled:opacity-50"
                        >
                          {sent.has(`${s.id}-생일`) ? '전송됨' : '축하 메시지'}
                        </button>
                      )}
                    </div>
                  )}
                  {s.joinMD && (
                    <div className={`flex items-center justify-between text-xs p-2 rounded-[8px] ${joinToday ? 'bg-purple-100' : 'bg-[var(--toss-gray-1)]'}`}>
                      <span>🎉 입사기념 {s.joinMD.replace('-', '월 ')}일{s.yearsWorked ? ` (${s.yearsWorked}년차)` : ''}</span>
                      {joinToday && s.yearsWorked && s.yearsWorked > 0 && (
                        <button
                          onClick={() => sendChatMessage(s, '기념일')}
                          disabled={sendingId === s.id || sent.has(`${s.id}-기념일`)}
                          className="px-2 py-0.5 bg-purple-500 text-white rounded-full text-[9px] font-bold disabled:opacity-50"
                        >
                          {sent.has(`${s.id}-기념일`) ? '전송됨' : '축하 메시지'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
