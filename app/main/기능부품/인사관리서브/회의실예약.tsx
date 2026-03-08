'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const ROOMS = ['대회의실', '소회의실A', '소회의실B', '교육실', '면접실'];
const HOURS = Array.from({ length: 10 }, (_, i) => `${i + 9}:00`); // 09:00~18:00

export default function MeetingRoomBooking({ user, staffs = [] }: { user: any; staffs: any[] }) {
  const [bookings, setBookings] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ room: ROOMS[0], start_time: '09:00', end_time: '10:00', title: '', attendees: '' });
  const [saving, setSaving] = useState(false);

  const fetchBookings = useCallback(async () => {
    const { data } = await supabase.from('meeting_room_bookings').select('*').eq('booking_date', selectedDate).order('start_time');
    setBookings(data || []);
  }, [selectedDate]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  const isConflict = (room: string, start: string, end: string, excludeId?: string) =>
    bookings.some(b =>
      b.room === room &&
      b.id !== excludeId &&
      b.start_time < end &&
      b.end_time > start
    );

  const handleSave = async () => {
    if (!form.title.trim()) return alert('회의 제목을 입력하세요.');
    if (form.start_time >= form.end_time) return alert('종료 시간은 시작 시간 이후여야 합니다.');
    if (isConflict(form.room, form.start_time, form.end_time)) return alert(`${form.room}의 해당 시간대는 이미 예약되어 있습니다.`);
    setSaving(true);
    try {
      await supabase.from('meeting_room_bookings').insert([{
        ...form,
        booking_date: selectedDate,
        booked_by: user?.id,
        booked_name: user?.name,
      }]);
      setShowModal(false);
      fetchBookings();
    } catch { alert('저장 실패'); } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, bookedBy: string) => {
    const isMso = user?.company === 'SY INC.' || user?.permissions?.mso;
    if (bookedBy !== user?.id && !isMso) return alert('본인 예약만 취소할 수 있습니다.');
    if (!confirm('예약을 취소하시겠습니까?')) return;
    await supabase.from('meeting_room_bookings').delete().eq('id', id);
    fetchBookings();
  };

  const timeToMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const bookingsForRoom = (room: string) => bookings.filter(b => b.room === room);

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">회의실 예약</h2>
          <p className="text-xs text-[var(--toss-gray-3)]">시간대별 회의실 예약 현황을 확인하고 예약하세요.</p>
        </div>
        <div className="flex gap-3 items-center">
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm font-bold bg-[var(--toss-card)] outline-none" />
          <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-[var(--toss-blue)] text-white rounded-[10px] text-sm font-bold shadow-sm hover:opacity-90">+ 예약</button>
        </div>
      </div>

      {/* 타임라인 그리드 */}
      <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '700px' }}>
            <thead>
              <tr className="bg-[var(--toss-gray-1)]/60 border-b border-[var(--toss-border)]">
                <th className="px-4 py-3 text-[10px] font-semibold text-[var(--toss-gray-3)] w-28 text-left">회의실</th>
                {HOURS.map(h => <th key={h} className="text-[10px] font-semibold text-[var(--toss-gray-3)] text-center py-3 px-1 min-w-[60px]">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--toss-border)]">
              {ROOMS.map(room => {
                const roomBooks = bookingsForRoom(room);
                return (
                  <tr key={room}>
                    <td className="px-4 py-3 text-xs font-bold text-[var(--foreground)] whitespace-nowrap">{room}</td>
                    {HOURS.map(hour => {
                      const hMin = timeToMin(hour);
                      const booking = roomBooks.find(b => timeToMin(b.start_time) <= hMin && timeToMin(b.end_time) > hMin);
                      const isStart = booking && timeToMin(booking.start_time) === hMin;
                      if (booking && !isStart) return null;
                      const span = booking
                        ? Math.ceil((timeToMin(booking.end_time) - timeToMin(booking.start_time)) / 60)
                        : 1;
                      return (
                        <td key={hour} colSpan={booking ? span : 1} className="py-2 px-1 text-center">
                          {booking ? (
                            <button onClick={() => handleDelete(booking.id, booking.booked_by)}
                              className="w-full py-1 px-2 bg-[var(--toss-blue)] text-white text-[9px] font-bold rounded-[6px] leading-tight hover:opacity-80 text-left">
                              <p className="truncate">{booking.title}</p>
                              <p className="opacity-75">{booking.booked_name}</p>
                            </button>
                          ) : (
                            <div className="h-8 rounded-[6px] bg-[var(--toss-gray-1)] opacity-30" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 당일 예약 목록 */}
      {bookings.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">예약 목록</p>
          {bookings.map(b => (
            <div key={b.id} className="flex items-center justify-between p-3 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[12px]">
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">{b.title}</p>
                <p className="text-[10px] text-[var(--toss-gray-3)]">{b.room} · {b.start_time}~{b.end_time} · {b.booked_name}</p>
              </div>
              <button onClick={() => handleDelete(b.id, b.booked_by)} className="px-2 py-1 bg-red-50 text-red-500 text-[10px] font-bold rounded-[6px] hover:bg-red-100">취소</button>
            </div>
          ))}
        </div>
      )}

      {/* 예약 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-[var(--toss-card)] rounded-[20px] shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--foreground)] mb-4">회의실 예약</h3>
            <div className="space-y-3">
              {[
                { label: '회의 제목', el: <input value={form.title} onChange={e => setForm(f => ({...f, title: e.target.value}))} placeholder="예: 주간 팀 미팅" className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" /> },
                { label: '회의실', el: <select value={form.room} onChange={e => setForm(f => ({...f, room: e.target.value}))} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none">{ROOMS.map(r => <option key={r}>{r}</option>)}</select> },
                { label: '시작 시간', el: <input type="time" value={form.start_time} onChange={e => setForm(f => ({...f, start_time: e.target.value}))} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" /> },
                { label: '종료 시간', el: <input type="time" value={form.end_time} onChange={e => setForm(f => ({...f, end_time: e.target.value}))} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" /> },
                { label: '참석자', el: <input value={form.attendees} onChange={e => setForm(f => ({...f, attendees: e.target.value}))} placeholder="예: 김철수, 이영희" className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" /> },
              ].map(({ label, el }) => (
                <div key={label}><label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">{label}</label>{el}</div>
              ))}
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowModal(false)} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-blue)] text-white font-semibold text-sm disabled:opacity-50">{saving ? '저장 중...' : '예약'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
