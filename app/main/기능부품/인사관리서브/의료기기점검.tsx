'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

const INSPECTION_CYCLE = ['월 1회', '분기 1회', '반기 1회', '연 1회', '수시'];
const DEVICE_CATEGORIES = ['진단장비', '치료장비', '수술장비', '모니터링', '검사장비', '기타'];

function getStatus(nextDate: string | null): 'ok' | 'due' | 'overdue' {
  if (!nextDate) return 'ok';
  const diff = Math.ceil((new Date(nextDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return 'overdue';
  if (diff <= 14) return 'due';
  return 'ok';
}

export default function MedicalDeviceInspection({ selectedCo, user }: { selectedCo: string; user: any }) {
  const [devices, setDevices] = useState<any[]>([]);
  const [histories, setHistories] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'devices' | 'history'>('devices');
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [showInspectModal, setShowInspectModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [editDeviceId, setEditDeviceId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterCategory, setFilterCategory] = useState('전체');
  const [filterStatus, setFilterStatus] = useState<'전체' | '정상' | '점검필요' | '기한초과'>('전체');

  const [deviceForm, setDeviceForm] = useState({ name: '', model: '', serial: '', category: DEVICE_CATEGORIES[0], location: '', cycle: INSPECTION_CYCLE[1], next_inspection_date: '', memo: '' });
  const [inspectForm, setInspectForm] = useState({ inspected_at: new Date().toISOString().split('T')[0], inspector: '', result: '정상', notes: '', next_inspection_date: '' });

  const fetchDevices = useCallback(async () => {
    const { data } = await supabase.from('medical_devices').select('*').order('next_inspection_date');
    setDevices(data || []);
  }, []);

  const fetchHistories = useCallback(async () => {
    const { data } = await supabase.from('device_inspections').select('*').order('inspected_at', { ascending: false }).limit(100);
    setHistories(data || []);
  }, []);

  useEffect(() => { fetchDevices(); fetchHistories(); }, [fetchDevices, fetchHistories]);

  const enriched = devices.map(d => ({ ...d, status: getStatus(d.next_inspection_date) }));

  const filtered = enriched.filter(d => {
    if (filterCategory !== '전체' && d.category !== filterCategory) return false;
    if (filterStatus === '정상' && d.status !== 'ok') return false;
    if (filterStatus === '점검필요' && d.status !== 'due') return false;
    if (filterStatus === '기한초과' && d.status !== 'overdue') return false;
    return true;
  });

  const openAddDevice = () => {
    setEditDeviceId(null);
    setDeviceForm({ name: '', model: '', serial: '', category: DEVICE_CATEGORIES[0], location: '', cycle: INSPECTION_CYCLE[1], next_inspection_date: '', memo: '' });
    setShowDeviceModal(true);
  };

  const openEditDevice = (d: any) => {
    setEditDeviceId(d.id);
    setDeviceForm({ name: d.name, model: d.model || '', serial: d.serial || '', category: d.category || DEVICE_CATEGORIES[0], location: d.location || '', cycle: d.cycle || INSPECTION_CYCLE[1], next_inspection_date: d.next_inspection_date || '', memo: d.memo || '' });
    setShowDeviceModal(true);
  };

  const openInspect = (d: any) => {
    setSelectedDevice(d);
    setInspectForm({ inspected_at: new Date().toISOString().split('T')[0], inspector: user?.name || '', result: '정상', notes: '', next_inspection_date: '' });
    setShowInspectModal(true);
  };

  const handleSaveDevice = async () => {
    if (!deviceForm.name.trim()) return alert('장비명을 입력하세요.');
    setSaving(true);
    try {
      if (editDeviceId) {
        await supabase.from('medical_devices').update(deviceForm).eq('id', editDeviceId);
      } else {
        await supabase.from('medical_devices').insert([deviceForm]);
      }
      setShowDeviceModal(false);
      fetchDevices();
    } catch { alert('저장 실패'); } finally { setSaving(false); }
  };

  const handleSaveInspection = async () => {
    if (!selectedDevice) return;
    setSaving(true);
    try {
      await supabase.from('device_inspections').insert([{ device_id: selectedDevice.id, device_name: selectedDevice.name, ...inspectForm }]);
      if (inspectForm.next_inspection_date) {
        await supabase.from('medical_devices').update({ next_inspection_date: inspectForm.next_inspection_date, last_inspection_date: inspectForm.inspected_at }).eq('id', selectedDevice.id);
      }
      setShowInspectModal(false);
      fetchDevices();
      fetchHistories();
      alert('점검 기록이 등록되었습니다.');
    } catch { alert('저장 실패'); } finally { setSaving(false); }
  };

  const handleDeleteDevice = async (id: string) => {
    if (!confirm('장비를 삭제하시겠습니까?')) return;
    await supabase.from('medical_devices').delete().eq('id', id);
    fetchDevices();
  };

  const overdueCount = enriched.filter(d => d.status === 'overdue').length;
  const dueCount = enriched.filter(d => d.status === 'due').length;

  return (
    <div className="p-4 md:p-5 space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-[var(--foreground)]">의료기기 정기점검 관리</h2>
          <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">의료기기 점검 일정 및 이력을 관리합니다.</p>
        </div>
        <button onClick={openAddDevice} className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-bold shadow-sm hover:opacity-90">+ 장비 등록</button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '전체 장비', value: devices.length, color: 'bg-blue-50 text-blue-700 border-blue-200' },
          { label: '점검 임박 (14일)', value: dueCount, color: 'bg-orange-50 text-orange-700 border-orange-200' },
          { label: '점검 기한 초과', value: overdueCount, color: 'bg-red-50 text-red-600 border-red-200' },
        ].map(c => (
          <div key={c.label} className={`p-3 rounded-[var(--radius-lg)] border ${c.color} text-center`}>
            <p className="text-xl font-bold">{c.value}</p>
            <p className="text-[10px] font-semibold mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-[var(--muted)] rounded-[var(--radius-md)] p-1 w-fit">
        {[{ key: 'devices', label: '장비 목록' }, { key: 'history', label: '점검 이력' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={`px-4 py-1.5 rounded-[var(--radius-md)] text-xs font-bold transition-all ${activeTab === t.key ? 'bg-[var(--card)] text-[var(--foreground)] shadow-sm' : 'text-[var(--toss-gray-3)]'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'devices' && (
        <>
          <div className="flex flex-wrap gap-2">
            {(['전체', ...DEVICE_CATEGORIES]).map(c => (
              <button key={c} onClick={() => setFilterCategory(c)}
                className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold ${filterCategory === c ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>{c}</button>
            ))}
            <div className="ml-auto flex gap-1">
              {(['전체', '정상', '점검필요', '기한초과'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold ${filterStatus === s ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-4)]'}`}>{s}</button>
              ))}
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-10 text-[var(--toss-gray-3)] font-bold text-sm">등록된 장비가 없습니다.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map(d => {
                const daysLeft = d.next_inspection_date ? Math.ceil((new Date(d.next_inspection_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
                return (
                  <div key={d.id} className={`bg-[var(--card)] border rounded-[var(--radius-lg)] p-4 shadow-sm ${d.status === 'overdue' ? 'border-red-300' : d.status === 'due' ? 'border-orange-300' : 'border-[var(--border)]'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-[var(--foreground)]">{d.name}</p>
                          <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${d.status === 'overdue' ? 'bg-red-100 text-red-600' : d.status === 'due' ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-700'}`}>
                            {d.status === 'overdue' ? '기한초과' : d.status === 'due' ? '점검임박' : '정상'}
                          </span>
                        </div>
                        <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">{d.category} · {d.location} {d.model && `· ${d.model}`}</p>
                      </div>
                    </div>
                    <div className="text-[10px] text-[var(--toss-gray-3)] space-y-0.5">
                      <p>점검 주기: {d.cycle}</p>
                      {d.last_inspection_date && <p>최근 점검: {d.last_inspection_date}</p>}
                      {d.next_inspection_date && (
                        <p className={`font-bold ${d.status === 'overdue' ? 'text-red-500' : d.status === 'due' ? 'text-orange-500' : 'text-[var(--toss-gray-3)]'}`}>
                          다음 점검: {d.next_inspection_date}
                          {daysLeft !== null && ` (${daysLeft < 0 ? Math.abs(daysLeft) + '일 초과' : daysLeft + '일 후'})`}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-1.5 mt-3">
                      <button onClick={() => openInspect(d)} className="flex-1 py-1.5 text-[10px] bg-green-50 text-green-700 font-bold rounded-[var(--radius-md)] hover:bg-green-100">점검 기록</button>
                      <button onClick={() => openEditDevice(d)} className="px-3 py-1.5 text-[10px] bg-blue-50 text-blue-600 font-bold rounded-[var(--radius-md)] hover:bg-blue-100">편집</button>
                      <button onClick={() => handleDeleteDevice(d.id)} className="px-3 py-1.5 text-[10px] bg-red-50 text-red-500 font-bold rounded-[var(--radius-md)] hover:bg-red-100">삭제</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {activeTab === 'history' && (
        <div className="space-y-2">
          {histories.length === 0 ? (
            <div className="text-center py-10 text-[var(--toss-gray-3)] font-bold text-sm">점검 이력이 없습니다.</div>
          ) : histories.map(h => (
            <div key={h.id} className="flex items-center justify-between p-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)]">
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">{h.device_name}</p>
                <p className="text-[10px] text-[var(--toss-gray-3)]">{h.inspected_at} · {h.inspector} · 결과: <span className={h.result === '정상' ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>{h.result}</span></p>
                {h.notes && <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">{h.notes}</p>}
              </div>
              {h.next_inspection_date && <p className="text-[10px] text-[var(--toss-gray-3)]">다음: {h.next_inspection_date}</p>}
            </div>
          ))}
        </div>
      )}

      {/* 장비 모달 */}
      {showDeviceModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowDeviceModal(false)}>
          <div className="bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm w-full max-w-sm p-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--foreground)] mb-4">{editDeviceId ? '장비 편집' : '장비 등록'}</h3>
            <div className="space-y-3">
              {[
                { label: '장비명 *', key: 'name', type: 'text', placeholder: '예: 초음파 진단기' },
                { label: '모델명', key: 'model', type: 'text', placeholder: '예: GE Voluson E10' },
                { label: '시리얼 번호', key: 'serial', type: 'text', placeholder: '' },
                { label: '위치', key: 'location', type: 'text', placeholder: '예: 3층 초음파실' },
                { label: '다음 점검일', key: 'next_inspection_date', type: 'date', placeholder: '' },
                { label: '메모', key: 'memo', type: 'text', placeholder: '' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">{label}</label>
                  <input type={type} value={(deviceForm as any)[key]} onChange={e => setDeviceForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">카테고리</label>
                <select value={deviceForm.category} onChange={e => setDeviceForm(f => ({ ...f, category: e.target.value }))} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none">
                  {DEVICE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">점검 주기</label>
                <select value={deviceForm.cycle} onChange={e => setDeviceForm(f => ({ ...f, cycle: e.target.value }))} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none">
                  {INSPECTION_CYCLE.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowDeviceModal(false)} className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button onClick={handleSaveDevice} disabled={saving} className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm disabled:opacity-50">{saving ? '저장 중...' : '저장'}</button>
            </div>
          </div>
        </div>
      )}

      {/* 점검 기록 모달 */}
      {showInspectModal && selectedDevice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowInspectModal(false)}>
          <div className="bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm w-full max-w-sm p-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--foreground)] mb-1">점검 기록</h3>
            <p className="text-xs text-[var(--toss-gray-3)] mb-4">{selectedDevice.name}</p>
            <div className="space-y-3">
              {[
                { label: '점검일 *', key: 'inspected_at', type: 'date' },
                { label: '점검자', key: 'inspector', type: 'text', placeholder: '점검자 이름' },
                { label: '다음 점검일', key: 'next_inspection_date', type: 'date' },
                { label: '특이사항', key: 'notes', type: 'text', placeholder: '점검 내용 요약' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">{label}</label>
                  <input type={type} value={(inspectForm as any)[key]} onChange={e => setInspectForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none" />
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-semibold text-[var(--toss-gray-3)] mb-1">점검 결과</label>
                <select value={inspectForm.result} onChange={e => setInspectForm(f => ({ ...f, result: e.target.value }))} className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] outline-none">
                  {['정상', '요주의', '수리필요', '교체필요'].map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowInspectModal(false)} className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button onClick={handleSaveInspection} disabled={saving} className="flex-1 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm disabled:opacity-50">{saving ? '저장 중...' : '기록'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
