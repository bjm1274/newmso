'use client';
import { useState, useEffect, useCallback } from 'react';

const AS_STORAGE_KEY = 'erp_as_records';
const RETURN_STORAGE_KEY = 'erp_return_records';

type AsStatus = '접수' | '처리중' | '완료' | '반품';
type ReturnStatus = '요청' | '승인' | '완료';
type ActiveTab = 'as' | 'return' | 'history';

interface AsRecord {
  id: string;
  device_name: string;
  model_name: string;
  received_date: string;
  problem_description: string;
  company_name: string;
  manager_name: string;
  status: AsStatus;
  created_at: string;
  type: 'as';
}

interface ReturnRecord {
  id: string;
  item_name: string;
  quantity: number;
  return_reason: string;
  company_name: string;
  return_date: string;
  status: ReturnStatus;
  created_at: string;
  type: 'return';
}

const AS_STATUS_COLORS: Record<AsStatus, string> = {
  접수: 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]',
  처리중: 'bg-blue-50 text-blue-600',
  완료: 'bg-green-50 text-green-600',
  반품: 'bg-red-50 text-red-600',
};

const RETURN_STATUS_COLORS: Record<ReturnStatus, string> = {
  요청: 'bg-[var(--tab-bg)] text-[var(--toss-gray-4)]',
  승인: 'bg-blue-50 text-blue-600',
  완료: 'bg-green-50 text-green-600',
};

const generateId = () => crypto.randomUUID();

const loadFromStorage = <T,>(key: string): T[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveToStorage = <T,>(key: string, data: T[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch { /* ignore */ }
};

const DEFAULT_AS_FORM = {
  device_name: '',
  model_name: '',
  received_date: new Date().toISOString().slice(0, 10),
  problem_description: '',
  company_name: '',
  manager_name: '',
  status: '접수' as AsStatus,
};

const DEFAULT_RETURN_FORM = {
  item_name: '',
  quantity: 1,
  return_reason: '',
  company_name: '',
  return_date: new Date().toISOString().slice(0, 10),
  status: '요청' as ReturnStatus,
};

export default function ASReturnManagement({ user }: { user: any }) {
  const [activeTab, setActiveTab] = useState<ActiveTab>('as');
  const [asRecords, setAsRecords] = useState<AsRecord[]>([]);
  const [returnRecords, setReturnRecords] = useState<ReturnRecord[]>([]);
  const [showAsModal, setShowAsModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [asForm, setAsForm] = useState({ ...DEFAULT_AS_FORM });
  const [returnForm, setReturnForm] = useState({ ...DEFAULT_RETURN_FORM });
  const [editingAsId, setEditingAsId] = useState<string | null>(null);
  const [editingReturnId, setEditingReturnId] = useState<string | null>(null);

  // Supabase 연동 시도 → 실패 시 localStorage 폴백
  const loadAsRecords = useCallback(async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase
        .from('as_repair_records')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        const mapped: AsRecord[] = data.map((r: any) => ({ ...r, type: 'as' }));
        setAsRecords(mapped);
        return;
      }
    } catch { /* supabase 없으면 localStorage */ }
    setAsRecords(loadFromStorage<AsRecord>(AS_STORAGE_KEY));
  }, []);

  const loadReturnRecords = useCallback(async () => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { data, error } = await supabase
        .from('return_records')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        const mapped: ReturnRecord[] = data.map((r: any) => ({ ...r, type: 'return' }));
        setReturnRecords(mapped);
        return;
      }
    } catch { /* supabase 없으면 localStorage */ }
    setReturnRecords(loadFromStorage<ReturnRecord>(RETURN_STORAGE_KEY));
  }, []);

  useEffect(() => {
    loadAsRecords();
    loadReturnRecords();
  }, [loadAsRecords, loadReturnRecords]);

  // AS 저장 (Supabase 우선, 실패 시 localStorage)
  const saveAsRecord = async () => {
    if (!asForm.device_name.trim()) return alert('기기명을 입력해주세요.');
    if (!asForm.received_date) return alert('접수일을 입력해주세요.');

    const now = new Date().toISOString();

    try {
      const { supabase } = await import('@/lib/supabase');
      if (editingAsId) {
        const { error } = await supabase
          .from('as_repair_records')
          .update({ ...asForm, updated_at: now })
          .eq('id', editingAsId);
        if (!error) { await loadAsRecords(); closeAsModal(); return; }
      } else {
        const { error } = await supabase
          .from('as_repair_records')
          .insert([{ ...asForm, created_at: now, created_by: user?.id }]);
        if (!error) { await loadAsRecords(); closeAsModal(); return; }
      }
    } catch { /* localStorage 폴백 */ }

    // localStorage 폴백
    const current = loadFromStorage<AsRecord>(AS_STORAGE_KEY);
    if (editingAsId) {
      const updated = current.map(r =>
        r.id === editingAsId ? { ...r, ...asForm } : r
      );
      saveToStorage(AS_STORAGE_KEY, updated);
      setAsRecords(updated);
    } else {
      const newRecord: AsRecord = {
        id: generateId(),
        ...asForm,
        created_at: now,
        type: 'as',
      };
      const updated = [newRecord, ...current];
      saveToStorage(AS_STORAGE_KEY, updated);
      setAsRecords(updated);
    }
    closeAsModal();
  };

  // 반품 저장
  const saveReturnRecord = async () => {
    if (!returnForm.item_name.trim()) return alert('품목명을 입력해주세요.');
    if (returnForm.quantity < 1) return alert('수량은 1 이상이어야 합니다.');

    const now = new Date().toISOString();

    try {
      const { supabase } = await import('@/lib/supabase');
      if (editingReturnId) {
        const { error } = await supabase
          .from('return_records')
          .update({ ...returnForm, updated_at: now })
          .eq('id', editingReturnId);
        if (!error) { await loadReturnRecords(); closeReturnModal(); return; }
      } else {
        const { error } = await supabase
          .from('return_records')
          .insert([{ ...returnForm, created_at: now, created_by: user?.id }]);
        if (!error) { await loadReturnRecords(); closeReturnModal(); return; }
      }
    } catch { /* localStorage 폴백 */ }

    const current = loadFromStorage<ReturnRecord>(RETURN_STORAGE_KEY);
    if (editingReturnId) {
      const updated = current.map(r =>
        r.id === editingReturnId ? { ...r, ...returnForm } : r
      );
      saveToStorage(RETURN_STORAGE_KEY, updated);
      setReturnRecords(updated);
    } else {
      const newRecord: ReturnRecord = {
        id: generateId(),
        ...returnForm,
        created_at: now,
        type: 'return',
      };
      const updated = [newRecord, ...current];
      saveToStorage(RETURN_STORAGE_KEY, updated);
      setReturnRecords(updated);
    }
    closeReturnModal();
  };

  // AS 상태 변경
  const updateAsStatus = async (id: string, status: AsStatus) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase
        .from('as_repair_records')
        .update({ status })
        .eq('id', id);
      if (!error) { await loadAsRecords(); return; }
    } catch { /* localStorage */ }
    const current = loadFromStorage<AsRecord>(AS_STORAGE_KEY);
    const updated = current.map(r => r.id === id ? { ...r, status } : r);
    saveToStorage(AS_STORAGE_KEY, updated);
    setAsRecords(updated);
  };

  // 반품 상태 변경
  const updateReturnStatus = async (id: string, status: ReturnStatus) => {
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase
        .from('return_records')
        .update({ status })
        .eq('id', id);
      if (!error) { await loadReturnRecords(); return; }
    } catch { /* localStorage */ }
    const current = loadFromStorage<ReturnRecord>(RETURN_STORAGE_KEY);
    const updated = current.map(r => r.id === id ? { ...r, status } : r);
    saveToStorage(RETURN_STORAGE_KEY, updated);
    setReturnRecords(updated);
  };

  // AS 삭제
  const deleteAsRecord = async (id: string) => {
    if (!confirm('이 AS 접수 내역을 삭제하시겠습니까?')) return;
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('as_repair_records').delete().eq('id', id);
      if (!error) { await loadAsRecords(); return; }
    } catch { /* localStorage */ }
    const current = loadFromStorage<AsRecord>(AS_STORAGE_KEY);
    const updated = current.filter(r => r.id !== id);
    saveToStorage(AS_STORAGE_KEY, updated);
    setAsRecords(updated);
  };

  // 반품 삭제
  const deleteReturnRecord = async (id: string) => {
    if (!confirm('이 반품 내역을 삭제하시겠습니까?')) return;
    try {
      const { supabase } = await import('@/lib/supabase');
      const { error } = await supabase.from('return_records').delete().eq('id', id);
      if (!error) { await loadReturnRecords(); return; }
    } catch { /* localStorage */ }
    const current = loadFromStorage<ReturnRecord>(RETURN_STORAGE_KEY);
    const updated = current.filter(r => r.id !== id);
    saveToStorage(RETURN_STORAGE_KEY, updated);
    setReturnRecords(updated);
  };

  const openAsEdit = (record: AsRecord) => {
    setAsForm({
      device_name: record.device_name,
      model_name: record.model_name,
      received_date: record.received_date,
      problem_description: record.problem_description,
      company_name: record.company_name,
      manager_name: record.manager_name,
      status: record.status,
    });
    setEditingAsId(record.id);
    setShowAsModal(true);
  };

  const openReturnEdit = (record: ReturnRecord) => {
    setReturnForm({
      item_name: record.item_name,
      quantity: record.quantity,
      return_reason: record.return_reason,
      company_name: record.company_name,
      return_date: record.return_date,
      status: record.status,
    });
    setEditingReturnId(record.id);
    setShowReturnModal(true);
  };

  const closeAsModal = () => {
    setShowAsModal(false);
    setAsForm({ ...DEFAULT_AS_FORM });
    setEditingAsId(null);
  };

  const closeReturnModal = () => {
    setShowReturnModal(false);
    setReturnForm({ ...DEFAULT_RETURN_FORM });
    setEditingReturnId(null);
  };

  // 이력 탭: AS + 반품 통합, 날짜 내림차순
  const historyList = [
    ...asRecords.map(r => ({
      id: r.id,
      type: 'as' as const,
      title: `[AS] ${r.device_name} (${r.model_name || '-'})`,
      subtitle: `${r.company_name || '-'} · 담당: ${r.manager_name || '-'}`,
      statusLabel: r.status,
      statusClass: AS_STATUS_COLORS[r.status],
      date: r.received_date,
      created_at: r.created_at,
      detail: r.problem_description,
    })),
    ...returnRecords.map(r => ({
      id: r.id,
      type: 'return' as const,
      title: `[반품] ${r.item_name} × ${r.quantity}`,
      subtitle: `${r.company_name || '-'} · 사유: ${r.return_reason || '-'}`,
      statusLabel: r.status,
      statusClass: RETURN_STATUS_COLORS[r.status],
      date: r.return_date,
      created_at: r.created_at,
      detail: r.return_reason,
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const TABS: { id: ActiveTab; label: string }[] = [
    { id: 'as', label: 'AS 접수' },
    { id: 'return', label: '반품' },
    { id: 'history', label: '전체 이력' },
  ];

  return (
    <div className="space-y-4" data-testid="as-return-management-view">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm text-center">
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">AS 접수</p>
          <p className="mt-0.5 text-lg font-bold text-[var(--accent)]">{asRecords.filter(r => r.status === '접수').length}</p>
        </div>
        <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm text-center">
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">AS 처리중</p>
          <p className="mt-0.5 text-lg font-bold text-blue-500">{asRecords.filter(r => r.status === '처리중').length}</p>
        </div>
        <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm text-center">
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">반품 요청</p>
          <p className="mt-0.5 text-lg font-bold text-orange-500">{returnRecords.filter(r => r.status === '요청').length}</p>
        </div>
        <div className="bg-[var(--card)] p-3 rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm text-center">
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase">전체 이력</p>
          <p className="mt-0.5 text-lg font-bold text-[var(--foreground)]">{historyList.length}</p>
        </div>
      </div>

      {/* 탭 + 등록 버튼 */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div className="flex flex-wrap gap-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              data-testid={`as-return-tab-${tab.id}`}
              className={`px-3.5 py-2 rounded-[var(--radius-md)] text-[11px] font-semibold transition-all ${activeTab === tab.id
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'bg-[var(--muted)] text-[var(--toss-gray-4)] hover:bg-[var(--border)]'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === 'as' && (
          <button
            onClick={() => { setAsForm({ ...DEFAULT_AS_FORM }); setEditingAsId(null); setShowAsModal(true); }}
            data-testid="as-record-add-button"
            className="px-3.5 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-[11px] font-semibold hover:opacity-90 transition-opacity shadow-sm"
          >
            + AS 등록
          </button>
        )}
        {activeTab === 'return' && (
          <button
            onClick={() => { setReturnForm({ ...DEFAULT_RETURN_FORM }); setEditingReturnId(null); setShowReturnModal(true); }}
            data-testid="return-record-add-button"
            className="px-3.5 py-2 rounded-[var(--radius-md)] bg-[var(--accent)] text-white text-[11px] font-semibold hover:opacity-90 transition-opacity shadow-sm"
          >
            + 반품 등록
          </button>
        )}
      </div>

      {/* AS 접수 탭 */}
      {activeTab === 'as' && (
        <div className="bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm overflow-hidden">
          {asRecords.length === 0 ? (
            <div className="py-8 text-center text-[var(--toss-gray-3)] font-semibold text-sm">
              <p className="mb-2 text-2xl">🔧</p>
              <p>등록된 AS 접수 내역이 없습니다.</p>
              <p className="text-[11px] mt-1 text-[var(--toss-gray-3)]">우측 상단의 + AS 등록 버튼을 눌러 새 항목을 추가하세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">기기명 / 모델</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">접수일</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">문제 내용</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">업체 / 담당자</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-center">상태</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {asRecords.map(record => (
                    <tr key={record.id} className="hover:bg-[var(--toss-blue-light)]/40 transition-all group" data-testid={`as-record-row-${record.id}`}>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">{record.device_name}</p>
                        {record.model_name && (
                          <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5">{record.model_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-[var(--toss-gray-4)]">{record.received_date}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-xs text-[var(--toss-gray-4)] truncate" title={record.problem_description}>
                          {record.problem_description || '-'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-[var(--foreground)]">{record.company_name || '-'}</p>
                        <p className="text-[11px] text-[var(--toss-gray-3)]">{record.manager_name || '-'}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          value={record.status}
                          onChange={e => updateAsStatus(record.id, e.target.value as AsStatus)}
                          data-testid={`as-status-${record.id}`}
                          className={`px-2 py-1 rounded-full text-[11px] font-semibold border-0 cursor-pointer outline-none ${AS_STATUS_COLORS[record.status]}`}
                        >
                          {(['접수', '처리중', '완료', '반품'] as AsStatus[]).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <button
                          onClick={() => openAsEdit(record)}
                          data-testid={`as-edit-${record.id}`}
                          className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--accent)] text-[11px] font-semibold rounded-md hover:opacity-80"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => deleteAsRecord(record.id)}
                          data-testid={`as-delete-${record.id}`}
                          className="px-2 py-1 bg-red-50 text-red-600 text-[11px] font-semibold rounded-md hover:bg-red-100"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 반품 탭 */}
      {activeTab === 'return' && (
        <div className="bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm overflow-hidden">
          {returnRecords.length === 0 ? (
            <div className="py-8 text-center text-[var(--toss-gray-3)] font-semibold text-sm">
              <p className="mb-2 text-2xl">↩</p>
              <p>등록된 반품 내역이 없습니다.</p>
              <p className="text-[11px] mt-1 text-[var(--toss-gray-3)]">우측 상단의 + 반품 등록 버튼을 눌러 새 항목을 추가하세요.</p>
            </div>
          ) : (
            <div className="overflow-x-auto no-scrollbar">
              <table className="w-full text-left border-collapse min-w-[700px]">
                <thead>
                  <tr className="bg-[var(--muted)]/50 border-b border-[var(--border)]">
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">품목명</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-center">수량</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">반품사유</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">업체</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">반품일</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-center">상태</th>
                    <th className="px-4 py-3 text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {returnRecords.map(record => (
                    <tr key={record.id} className="hover:bg-[var(--toss-blue-light)]/40 transition-all group" data-testid={`return-record-row-${record.id}`}>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-[var(--foreground)] group-hover:text-[var(--accent)] transition-colors">{record.item_name}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <p className="text-xs font-semibold text-[var(--foreground)]">{record.quantity}</p>
                      </td>
                      <td className="px-4 py-3 max-w-[180px]">
                        <p className="text-xs text-[var(--toss-gray-4)] truncate" title={record.return_reason}>
                          {record.return_reason || '-'}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-[var(--toss-gray-4)]">{record.company_name || '-'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-xs font-semibold text-[var(--toss-gray-4)]">{record.return_date}</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <select
                          value={record.status}
                          onChange={e => updateReturnStatus(record.id, e.target.value as ReturnStatus)}
                          data-testid={`return-status-${record.id}`}
                          className={`px-2 py-1 rounded-full text-[11px] font-semibold border-0 cursor-pointer outline-none ${RETURN_STATUS_COLORS[record.status]}`}
                        >
                          {(['요청', '승인', '완료'] as ReturnStatus[]).map(s => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right space-x-1">
                        <button
                          onClick={() => openReturnEdit(record)}
                          data-testid={`return-edit-${record.id}`}
                          className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--accent)] text-[11px] font-semibold rounded-md hover:opacity-80"
                        >
                          수정
                        </button>
                        <button
                          onClick={() => deleteReturnRecord(record.id)}
                          data-testid={`return-delete-${record.id}`}
                          className="px-2 py-1 bg-red-50 text-red-600 text-[11px] font-semibold rounded-md hover:bg-red-100"
                        >
                          삭제
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* 이력 탭 */}
      {activeTab === 'history' && (
        <div className="bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] shadow-sm overflow-hidden">
          {historyList.length === 0 ? (
            <div className="py-8 text-center text-[var(--toss-gray-3)] font-semibold text-sm">
              <p className="mb-2 text-2xl">📋</p>
              <p>이력이 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {historyList.map(item => (
                <div key={`${item.type}_${item.id}`} className="px-4 py-3.5 flex items-start justify-between gap-4 hover:bg-[var(--toss-blue-light)]/30 transition-all">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${item.type === 'as' ? 'bg-purple-50 text-purple-600' : 'bg-orange-50 text-orange-600'}`}>
                        {item.type === 'as' ? 'AS' : '반품'}
                      </span>
                      <p className="text-xs font-semibold text-[var(--foreground)] truncate">{item.title.replace(/^\[AS\] |\[반품\] /, '')}</p>
                    </div>
                    <p className="text-[11px] text-[var(--toss-gray-3)] mt-1">{item.subtitle}</p>
                    {item.detail && (
                      <p className="text-[11px] text-[var(--toss-gray-3)] mt-0.5 truncate" title={item.detail}>상세: {item.detail}</p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${item.statusClass}`}>
                      {item.statusLabel}
                    </span>
                    <p className="text-[10px] font-mono text-[var(--toss-gray-3)]">{item.date}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* AS 등록/수정 모달 */}
      {showAsModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          onClick={closeAsModal}
        >
          <div
            className="bg-[var(--card)] rounded-[var(--radius-lg)] shadow-sm p-4 w-full max-w-[420px] max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
            data-testid="as-record-modal"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--foreground)]">
                {editingAsId ? 'AS 접수 수정' : 'AS 접수 등록'}
              </h3>
              <button onClick={closeAsModal} className="p-1.5 hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-[var(--toss-gray-3)]">✕</button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">기기명 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={asForm.device_name}
                  onChange={e => setAsForm(p => ({ ...p, device_name: e.target.value }))}
                  data-testid="as-field-device-name"
                  placeholder="예: 내시경 세척기"
                  className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">모델명</label>
                <input
                  type="text"
                  value={asForm.model_name}
                  onChange={e => setAsForm(p => ({ ...p, model_name: e.target.value }))}
                  data-testid="as-field-model-name"
                  placeholder="예: OES-V1"
                  className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">접수일 <span className="text-red-500">*</span></label>
                <input
                  type="date"
                  value={asForm.received_date}
                  onChange={e => setAsForm(p => ({ ...p, received_date: e.target.value }))}
                  data-testid="as-field-received-date"
                  className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">문제 내용</label>
                <textarea
                  value={asForm.problem_description}
                  onChange={e => setAsForm(p => ({ ...p, problem_description: e.target.value }))}
                  data-testid="as-field-problem-description"
                  placeholder="증상 및 문제 내용을 입력하세요"
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none resize-none"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">업체명</label>
                  <input
                    type="text"
                    value={asForm.company_name}
                    onChange={e => setAsForm(p => ({ ...p, company_name: e.target.value }))}
                    data-testid="as-field-company-name"
                    placeholder="업체명"
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">담당자</label>
                  <input
                    type="text"
                    value={asForm.manager_name}
                    onChange={e => setAsForm(p => ({ ...p, manager_name: e.target.value }))}
                    data-testid="as-field-manager-name"
                    placeholder="담당자명"
                    className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">처리 상태</label>
                <select
                  value={asForm.status}
                  onChange={e => setAsForm(p => ({ ...p, status: e.target.value as AsStatus }))}
                  data-testid="as-field-status"
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                >
                  <option value="접수">접수</option>
                  <option value="처리중">처리중</option>
                  <option value="완료">완료</option>
                  <option value="반품">반품</option>
                </select>
              </div>
            </div>

              <div className="mt-4 flex gap-3">
                <button onClick={closeAsModal} className="flex-1 rounded-[var(--radius-md)] bg-[var(--muted)] py-2.5 text-sm font-semibold text-[var(--toss-gray-4)] transition-all hover:bg-[var(--border)]">취소</button>
                <button onClick={saveAsRecord} data-testid="as-save-button" className="flex-1 rounded-[var(--radius-md)] bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 shadow-sm">
                  {editingAsId ? '수정 완료' : '등록'}
                </button>
              </div>
          </div>
        </div>
      )}

      {/* 반품 등록/수정 모달 */}
      {showReturnModal && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[110] flex items-center justify-center p-4"
          onClick={closeReturnModal}
        >
          <div
            className="bg-[var(--card)] rounded-[var(--radius-lg)] shadow-sm p-4 w-full max-w-[420px] max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
            data-testid="return-record-modal"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--foreground)]">
                {editingReturnId ? '반품 수정' : '반품 등록'}
              </h3>
              <button onClick={closeReturnModal} className="p-1.5 hover:bg-[var(--muted)] rounded-[var(--radius-md)] text-[var(--toss-gray-3)]">✕</button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">품목명 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={returnForm.item_name}
                    onChange={e => setReturnForm(p => ({ ...p, item_name: e.target.value }))}
                    data-testid="return-field-item-name"
                  placeholder="예: 봉합사 2-0"
                  className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">수량 <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min={1}
                  value={returnForm.quantity}
                    onChange={e => setReturnForm(p => ({ ...p, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                    data-testid="return-field-quantity"
                  className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">반품사유</label>
                <textarea
                  value={returnForm.return_reason}
                  onChange={e => setReturnForm(p => ({ ...p, return_reason: e.target.value }))}
                  data-testid="return-field-reason"
                  placeholder="반품 사유를 입력하세요"
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">업체</label>
                <input
                  type="text"
                  value={returnForm.company_name}
                    onChange={e => setReturnForm(p => ({ ...p, company_name: e.target.value }))}
                    data-testid="return-field-company-name"
                  placeholder="업체명"
                  className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">반품일</label>
                <input
                  type="date"
                  value={returnForm.return_date}
                  onChange={e => setReturnForm(p => ({ ...p, return_date: e.target.value }))}
                  data-testid="return-field-return-date"
                  className="w-full px-3.5 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-[var(--toss-gray-3)] mb-1.5 block">처리 상태</label>
                <select
                  value={returnForm.status}
                  onChange={e => setReturnForm(p => ({ ...p, status: e.target.value as ReturnStatus }))}
                  data-testid="return-field-status"
                  className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] text-sm font-semibold focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] outline-none"
                >
                  <option value="요청">요청</option>
                  <option value="승인">승인</option>
                  <option value="완료">완료</option>
                </select>
              </div>
            </div>

              <div className="mt-4 flex gap-3">
                <button onClick={closeReturnModal} className="flex-1 rounded-[var(--radius-md)] bg-[var(--muted)] py-2.5 text-sm font-semibold text-[var(--toss-gray-4)] transition-all hover:bg-[var(--border)]">취소</button>
                <button onClick={saveReturnRecord} data-testid="return-save-button" className="flex-1 rounded-[var(--radius-md)] bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 shadow-sm">
                  {editingReturnId ? '수정 완료' : '등록'}
                </button>
              </div>
          </div>
        </div>
      )}
    </div>
  );
}
