'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export default function VehicleDispatch({ user, staffs = [] }: { user: any; staffs: any[] }) {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [showVehicleModal, setShowVehicleModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);
  const [vehicleForm, setVehicleForm] = useState({ name: '', number: '', type: '승용', capacity: '5', fuel_type: '가솔린', notes: '' });
  const [bookingForm, setBookingForm] = useState({ vehicle_id: '', purpose: '', start_datetime: '', end_datetime: '', destination: '' });
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'현황' | '이력' | '차량관리'>('현황');

  const fetchAll = useCallback(async () => {
    const [{ data: v }, { data: b }] = await Promise.all([
      supabase.from('vehicles').select('*').order('name'),
      supabase.from('vehicle_bookings').select('*').order('start_datetime', { ascending: false }).limit(100),
    ]);
    setVehicles(v || []);
    setBookings(b || []);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const isInUse = (vehicleId: string) => {
    const now = new Date().toISOString();
    return bookings.some(b => b.vehicle_id === vehicleId && b.start_datetime <= now && b.end_datetime >= now && b.status !== '취소');
  };

  const handleVehicleSave = async () => {
    if (!vehicleForm.name.trim() || !vehicleForm.number.trim()) return alert('차량명과 번호판을 입력하세요.');
    setSaving(true);
    try {
      await supabase.from('vehicles').insert([{ ...vehicleForm, capacity: Number(vehicleForm.capacity) }]);
      setShowVehicleModal(false);
      setVehicleForm({ name: '', number: '', type: '승용', capacity: '5', fuel_type: '가솔린', notes: '' });
      fetchAll();
    } catch { alert('저장 실패'); } finally { setSaving(false); }
  };

  const handleBookingSave = async () => {
    if (!bookingForm.vehicle_id || !bookingForm.purpose.trim() || !bookingForm.start_datetime || !bookingForm.end_datetime) return alert('모든 필수 항목을 입력하세요.');
    if (bookingForm.start_datetime >= bookingForm.end_datetime) return alert('종료 시간은 시작 시간 이후여야 합니다.');
    setSaving(true);
    try {
      await supabase.from('vehicle_bookings').insert([{
        ...bookingForm,
        driver_id: user?.id,
        driver_name: user?.name,
        status: '예정',
      }]);
      setShowBookingModal(false);
      setBookingForm({ vehicle_id: '', purpose: '', start_datetime: '', end_datetime: '', destination: '' });
      fetchAll();
    } catch { alert('저장 실패'); } finally { setSaving(false); }
  };

  const handleReturn = async (bookingId: string) => {
    await supabase.from('vehicle_bookings').update({ status: '반납완료', returned_at: new Date().toISOString() }).eq('id', bookingId);
    fetchAll();
  };

  const upcomingBookings = bookings.filter(b => b.status === '예정' && b.end_datetime >= new Date().toISOString());

  return (
    <div className="p-4 md:p-8 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">법인차 · 차량 배차 관리</h2>
          <p className="text-xs text-[var(--toss-gray-3)]">차량 배차 신청, 운행 이력, 반납 처리를 관리합니다.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowBookingModal(true)} className="px-4 py-2 bg-[var(--toss-blue)] text-white rounded-[10px] text-sm font-bold">+ 배차 신청</button>
          <button onClick={() => setShowVehicleModal(true)} className="px-4 py-2 bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] rounded-[10px] text-sm font-bold">차량 등록</button>
        </div>
      </div>

      {/* 탭 */}
      <div className="flex gap-1 p-1 bg-[var(--toss-gray-1)] rounded-[12px] w-fit">
        {(['현황', '이력', '차량관리'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-[10px] text-xs font-bold transition-all ${tab === t ? 'bg-[var(--toss-card)] text-[var(--toss-blue)] shadow-sm' : 'text-[var(--toss-gray-3)]'}`}>{t}</button>
        ))}
      </div>

      {tab === '현황' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vehicles.map(v => {
            const inUse = isInUse(v.id);
            const activeBooking = bookings.find(b => b.vehicle_id === v.id && b.status === '예정' && b.start_datetime <= new Date().toISOString() && b.end_datetime >= new Date().toISOString());
            return (
              <div key={v.id} className={`bg-[var(--toss-card)] border rounded-[16px] p-5 shadow-sm ${inUse ? 'border-orange-300' : 'border-[var(--toss-border)]'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">{v.name}</p>
                    <p className="text-[10px] text-[var(--toss-gray-3)]">{v.number} · {v.type} · {v.capacity}인승</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${inUse ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>{inUse ? '운행중' : '대기'}</span>
                </div>
                {inUse && activeBooking && (
                  <div className="text-[10px] text-orange-600 bg-orange-50 rounded-[8px] p-2 mb-2">
                    <p>{activeBooking.driver_name} · {activeBooking.purpose}</p>
                    <p>~{new Date(activeBooking.end_datetime).toLocaleString('ko-KR')}</p>
                  </div>
                )}
                {inUse && activeBooking && activeBooking.driver_id === user?.id && (
                  <button onClick={() => handleReturn(activeBooking.id)} className="w-full py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-[8px]">반납 처리</button>
                )}
              </div>
            );
          })}
          {vehicles.length === 0 && <p className="col-span-3 text-center py-10 text-[var(--toss-gray-3)] text-sm font-bold">등록된 차량이 없습니다.</p>}
        </div>
      )}

      {tab === '이력' && (
        <div className="bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[16px] shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead><tr className="bg-[var(--toss-gray-1)]/60 border-b border-[var(--toss-border)]">
              {['차량', '운전자', '목적지/용도', '출발', '반납', '상태'].map(h => <th key={h} className="px-4 py-3 text-[10px] font-semibold text-[var(--toss-gray-3)] uppercase">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-[var(--toss-border)]">
              {bookings.slice(0, 30).map(b => {
                const v = vehicles.find(vv => vv.id === b.vehicle_id);
                return (
                  <tr key={b.id} className="hover:bg-[var(--toss-gray-1)]/30">
                    <td className="px-4 py-2.5 text-xs font-semibold">{v?.name || '-'}</td>
                    <td className="px-4 py-2.5 text-xs">{b.driver_name}</td>
                    <td className="px-4 py-2.5 text-xs">{b.destination && <span className="text-[var(--toss-blue)] mr-1">[{b.destination}]</span>}{b.purpose}</td>
                    <td className="px-4 py-2.5 text-[10px] text-[var(--toss-gray-3)]">{new Date(b.start_datetime).toLocaleString('ko-KR')}</td>
                    <td className="px-4 py-2.5 text-[10px] text-[var(--toss-gray-3)]">{new Date(b.end_datetime).toLocaleString('ko-KR')}</td>
                    <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${b.status === '반납완료' ? 'bg-green-100 text-green-600' : b.status === '취소' ? 'bg-gray-100 text-gray-400' : 'bg-orange-100 text-orange-600'}`}>{b.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === '차량관리' && (
        <div className="space-y-2">
          {vehicles.map(v => (
            <div key={v.id} className="flex items-center justify-between p-4 bg-[var(--toss-card)] border border-[var(--toss-border)] rounded-[12px]">
              <div>
                <p className="text-sm font-bold">{v.name} <span className="text-[var(--toss-gray-3)] font-normal text-xs">{v.number}</span></p>
                <p className="text-[10px] text-[var(--toss-gray-3)]">{v.type} · {v.capacity}인승 · {v.fuel_type}</p>
              </div>
              <button onClick={async () => { if (confirm('차량을 삭제하시겠습니까?')) { await supabase.from('vehicles').delete().eq('id', v.id); fetchAll(); } }}
                className="px-2 py-1 bg-red-50 text-red-500 text-[10px] font-bold rounded-[6px]">삭제</button>
            </div>
          ))}
        </div>
      )}

      {/* 차량 등록 모달 */}
      {showVehicleModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowVehicleModal(false)}>
          <div className="bg-[var(--toss-card)] rounded-[20px] shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-4">차량 등록</h3>
            <div className="space-y-3">
              {[
                { label: '차량명 *', key: 'name', placeholder: '예: 쏘나타(흰색)' },
                { label: '번호판 *', key: 'number', placeholder: '예: 12가 3456' },
                { label: '좌석 수', key: 'capacity', type: 'number' },
                { label: '비고', key: 'notes' },
              ].map(({ label, key, placeholder, type }) => (
                <div key={key}>
                  <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">{label}</label>
                  <input type={type || 'text'} value={(vehicleForm as any)[key]} onChange={e => setVehicleForm((f: any) => ({ ...f, [key]: e.target.value }))} placeholder={placeholder}
                    className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" />
                </div>
              ))}
              <div><label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">차종</label>
                <select value={vehicleForm.type} onChange={e => setVehicleForm(f => ({...f, type: e.target.value}))} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none">
                  {['승용', '승합', 'SUV', '화물', '버스'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowVehicleModal(false)} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button onClick={handleVehicleSave} disabled={saving} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-blue)] text-white font-semibold text-sm">{saving ? '저장 중...' : '등록'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 배차 신청 모달 */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowBookingModal(false)}>
          <div className="bg-[var(--toss-card)] rounded-[20px] shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold mb-4">배차 신청</h3>
            <div className="space-y-3">
              <div><label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">차량 선택 *</label>
                <select value={bookingForm.vehicle_id} onChange={e => setBookingForm(f => ({...f, vehicle_id: e.target.value}))} className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none">
                  <option value="">선택하세요</option>
                  {vehicles.map(v => <option key={v.id} value={v.id} disabled={isInUse(v.id)}>{v.name} {isInUse(v.id) ? '(운행중)' : ''}</option>)}
                </select>
              </div>
              {[
                { label: '목적지', key: 'destination', placeholder: '예: 서울 강남구' },
                { label: '사용 목적 *', key: 'purpose', placeholder: '예: 거래처 방문' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">{label}</label>
                  <input value={(bookingForm as any)[key]} onChange={e => setBookingForm((f: any) => ({...f, [key]: e.target.value}))} placeholder={placeholder}
                    className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" />
                </div>
              ))}
              <div><label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">출발 일시 *</label>
                <input type="datetime-local" value={bookingForm.start_datetime} onChange={e => setBookingForm(f => ({...f, start_datetime: e.target.value}))}
                  className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" /></div>
              <div><label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">반납 예정 일시 *</label>
                <input type="datetime-local" value={bookingForm.end_datetime} onChange={e => setBookingForm(f => ({...f, end_datetime: e.target.value}))}
                  className="w-full px-3 py-2 border border-[var(--toss-border)] rounded-[10px] text-sm bg-[var(--toss-card)] outline-none" /></div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowBookingModal(false)} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-gray-1)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button onClick={handleBookingSave} disabled={saving} className="flex-1 py-3 rounded-[12px] bg-[var(--toss-blue)] text-white font-semibold text-sm">{saving ? '신청 중...' : '신청'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
