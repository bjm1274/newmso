'use client';

import { toast } from '@/lib/toast';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import SmartDatePicker from '../공통/SmartDatePicker';

const DEFAULT_ASSET_TYPES = ['노트북', 'PC', '모니터', '키보드', '마우스', '회의실키', '기타'];

type StaffRow = {
  id: string;
  name?: string;
  company?: string;
};

type AssetLoanRow = {
  id: string;
  staff_id?: string;
  asset_type?: string;
  asset_name?: string | null;
  loaned_at?: string | null;
  returned_at?: string | null;
  staff_members?: {
    name?: string;
    company?: string;
  } | null;
};

function getSettingScope(selectedCo: unknown) {
  const companyName = typeof selectedCo === 'string' ? selectedCo.trim() : '';
  return companyName && companyName !== '전체' ? companyName : '전체';
}

function getAssetTypeStorageKey(scope: string) {
  return `erp_asset_loan_item_settings:${scope}`;
}

function isMissingRelationError(error: unknown, relationName: string) {
  const payload = error as { code?: string; message?: string; details?: string } | null;
  const message = `${payload?.message || ''} ${payload?.details || ''}`.toLowerCase();
  return ['42P01', 'PGRST205'].includes(String(payload?.code || '')) || message.includes(relationName.toLowerCase());
}

function normalizeAssetTypes(items: unknown): string[] {
  const values = Array.isArray(items) ? items : [];
  const normalized = values
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);
  return normalized.length > 0 ? normalized : [...DEFAULT_ASSET_TYPES];
}

function readAssetTypesFromStorage(scope: string) {
  if (typeof window === 'undefined') return [...DEFAULT_ASSET_TYPES];
  try {
    const raw = window.localStorage.getItem(getAssetTypeStorageKey(scope));
    if (!raw) return [...DEFAULT_ASSET_TYPES];
    return normalizeAssetTypes(JSON.parse(raw));
  } catch {
    return [...DEFAULT_ASSET_TYPES];
  }
}

function writeAssetTypesToStorage(scope: string, items: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getAssetTypeStorageKey(scope), JSON.stringify(items));
  } catch {
    // ignore local storage failures
  }
}

async function fetchAssetTypes(scope: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('asset_loan_item_settings')
      .select('items')
      .eq('company_name', scope)
      .maybeSingle();

    if (error) {
      if (isMissingRelationError(error, 'asset_loan_item_settings')) {
        return readAssetTypesFromStorage(scope);
      }
      throw error;
    }

    if (data?.items) {
      const normalized = normalizeAssetTypes(data.items);
      writeAssetTypesToStorage(scope, normalized);
      return normalized;
    }

    if (scope !== '전체') {
      const fallback: string[] = await fetchAssetTypes('전체');
      writeAssetTypesToStorage(scope, fallback);
      return fallback;
    }

    return readAssetTypesFromStorage(scope);
  } catch {
    return readAssetTypesFromStorage(scope);
  }
}

export default function AssetLoanManager({ staffs = [], selectedCo }: Record<string, unknown>) {
  const [list, setList] = useState<AssetLoanRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [settingOpen, setSettingOpen] = useState(false);
  const [assetTypes, setAssetTypes] = useState<string[]>([...DEFAULT_ASSET_TYPES]);
  const [assetTypeDrafts, setAssetTypeDrafts] = useState<string[]>([...DEFAULT_ASSET_TYPES]);
  const [newAssetType, setNewAssetType] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [form, setForm] = useState({
    staffId: '',
    assetType: DEFAULT_ASSET_TYPES[0],
    assetName: '',
    loanedAt: new Date().toISOString().slice(0, 10),
  });

  const scope = useMemo(() => getSettingScope(selectedCo), [selectedCo]);
  const filtered = (scope === '전체'
    ? (staffs as StaffRow[])
    : (staffs as StaffRow[]).filter((staff) => staff.company === scope));

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('asset_loans')
        .select('*, staff_members(name, company)')
        .order('loaned_at', { ascending: false });

      let rows = (data || []) as AssetLoanRow[];
      if (scope !== '전체') {
        rows = rows.filter((row) => row.staff_members?.company === scope);
      }
      setList(rows);
    })();
  }, [scope]);

  useEffect(() => {
    let cancelled = false;

    const loadAssetTypes = async () => {
      const nextTypes = await fetchAssetTypes(scope);
      if (cancelled) return;
      setAssetTypes(nextTypes);
      setAssetTypeDrafts(nextTypes);
      setForm((prev) => ({
        ...prev,
        assetType: nextTypes.includes(prev.assetType) ? prev.assetType : nextTypes[0] || DEFAULT_ASSET_TYPES[0],
      }));
    };

    void loadAssetTypes();

    return () => {
      cancelled = true;
    };
  }, [scope]);

  const openSettings = () => {
    setAssetTypeDrafts(assetTypes);
    setNewAssetType('');
    setSettingOpen(true);
  };

  const handleAddDraftAssetType = () => {
    const nextValue = String(newAssetType || '').trim();
    if (!nextValue) return;
    if (assetTypeDrafts.includes(nextValue)) {
      toast('이미 등록된 물품입니다.', 'warning');
      return;
    }
    setAssetTypeDrafts((prev) => [...prev, nextValue]);
    setNewAssetType('');
  };

  const handleSaveAssetTypes = async () => {
    const nextTypes = normalizeAssetTypes(assetTypeDrafts);
    if (nextTypes.length === 0) {
      toast('최소 1개의 물품을 등록해주세요.', 'warning');
      return;
    }

    setSavingSettings(true);
    let savedToDatabase = false;

    try {
      const { error } = await supabase
        .from('asset_loan_item_settings')
        .upsert(
          {
            company_name: scope,
            items: nextTypes,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'company_name' }
        );

      if (error) {
        if (!isMissingRelationError(error, 'asset_loan_item_settings')) {
          throw error;
        }
      } else {
        savedToDatabase = true;
      }
    } catch (error) {
      console.error('비품 대여 물품 설정 저장 실패:', error);
      setSavingSettings(false);
      toast('물품 설정 저장 중 오류가 발생했습니다.', 'error');
      return;
    }

    writeAssetTypesToStorage(scope, nextTypes);
    setAssetTypes(nextTypes);
    setAssetTypeDrafts(nextTypes);
    setForm((prev) => ({
      ...prev,
      assetType: nextTypes.includes(prev.assetType) ? prev.assetType : nextTypes[0],
    }));
    setSettingOpen(false);
    setSavingSettings(false);
    toast(savedToDatabase ? '물품 설정을 저장했습니다.' : '물품 설정을 현재 기기에 저장했습니다.', 'success');
  };

  const handleAdd = async () => {
    if (!form.staffId || !form.loanedAt) {
      return toast('직원과 대여일을 선택하세요.', 'warning');
    }
    if (!form.assetType) {
      return toast('대여 물품을 선택하세요.', 'warning');
    }

    await supabase.from('asset_loans').insert({
      staff_id: form.staffId,
      asset_type: form.assetType,
      asset_name: form.assetName || form.assetType,
      loaned_at: form.loanedAt,
    });

    setForm({
      staffId: '',
      assetType: assetTypes[0] || DEFAULT_ASSET_TYPES[0],
      assetName: '',
      loanedAt: new Date().toISOString().slice(0, 10),
    });
    setAdding(false);

    const { data } = await supabase
      .from('asset_loans')
      .select('*, staff_members(name, company)')
      .order('loaned_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setList((prev) => [data as AssetLoanRow, ...prev]);
  };

  const handleReturn = async (id: string) => {
    const returnedAt = new Date().toISOString().slice(0, 10);
    await supabase.from('asset_loans').update({ returned_at: returnedAt }).eq('id', id);
    setList((prev) => prev.map((row) => (row.id === id ? { ...row, returned_at: returnedAt } : row)));
  };

  return (
    <div className="bg-[var(--card)] p-4 md:p-5 rounded-2xl border border-[var(--border)] shadow-sm">
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <div>
          <h3 className="text-xl font-semibold text-[var(--foreground)] tracking-tight">비품/장비 대여 관리</h3>
          <p className="text-[11px] text-[var(--accent)] font-bold uppercase tracking-widest">입퇴사 시 장비 지급·반납 추적</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={openSettings}
            className="px-4 py-2.5 border border-[var(--border)] text-[var(--foreground)] text-xs font-semibold rounded-[var(--radius-lg)]"
          >
            물품 설정
          </button>
          <button
            onClick={() => setAdding(true)}
            className="px-5 py-2.5 bg-[var(--accent)] text-white text-xs font-semibold rounded-[var(--radius-lg)]"
          >
            + 대여 등록
          </button>
        </div>
      </div>

      <div className="mb-4 rounded-2xl border border-[var(--border)] bg-[var(--tab-bg)] p-4">
        <div className="flex items-center justify-between gap-3 mb-2">
          <div>
            <p className="text-sm font-semibold text-[var(--foreground)]">{scope} 물품 목록</p>
            <p className="text-xs text-[var(--toss-gray-3)]">비품대여 등록 시 이 목록에서 바로 선택합니다.</p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--accent)]">
            {assetTypes.length}개
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {assetTypes.map((item) => (
            <span
              key={item}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1.5 text-xs font-medium text-[var(--foreground)]"
            >
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase">
              <th className="p-2 sm:p-4 text-left">직원</th>
              <th className="p-2 sm:p-4 text-left">물품</th>
              <th className="p-2 sm:p-4 text-left hidden sm:table-cell">대여일</th>
              <th className="p-2 sm:p-4 text-left">반납일</th>
              <th className="p-2 sm:p-4 text-right">관리</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border-subtle)]">
                <td className="p-2 sm:p-4">{row.staff_members?.name}</td>
                <td className="p-2 sm:p-4">
                  {row.asset_type}
                  {row.asset_name ? ` (${row.asset_name})` : ''}
                </td>
                <td className="p-2 sm:p-4 hidden sm:table-cell">{row.loaned_at}</td>
                <td className="p-2 sm:p-4">
                  {row.returned_at ? row.returned_at : <span className="text-orange-600 font-bold">미반납</span>}
                </td>
                <td className="p-2 sm:p-4 text-right">
                  {!row.returned_at && (
                    <button
                      onClick={() => handleReturn(row.id)}
                      className="px-3 py-1 bg-green-500/20 text-green-700 text-[11px] font-semibold rounded-[var(--radius-md)]"
                    >
                      반납
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[110] p-0 sm:p-4"
          onClick={() => setAdding(false)}
        >
          <div
            className="bg-[var(--card)] p-4 sm:p-5 rounded-t-[24px] sm:rounded-[var(--radius-md)] max-w-md w-full space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 className="font-semibold">장비 대여 등록</h4>
            <select
              value={form.staffId}
              onChange={(event) => setForm({ ...form, staffId: event.target.value })}
              className="w-full p-3 border rounded-[var(--radius-lg)]"
            >
              <option value="">직원 선택</option>
              {filtered.map((staff) => (
                <option key={staff.id} value={staff.id}>
                  {staff.name}
                </option>
              ))}
            </select>
            <select
              value={form.assetType}
              onChange={(event) => setForm({ ...form, assetType: event.target.value })}
              className="w-full p-3 border rounded-[var(--radius-lg)]"
            >
              {assetTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={form.assetName}
              onChange={(event) => setForm({ ...form, assetName: event.target.value })}
              placeholder="상세 물품명 (선택)"
              className="w-full p-3 border rounded-[var(--radius-lg)]"
            />
            <SmartDatePicker
              value={form.loanedAt}
              onChange={(value) => setForm({ ...form, loanedAt: value })}
              inputClassName="w-full p-3 border rounded-[var(--radius-lg)]"
            />
            <div className="flex gap-2">
              <button
                onClick={handleAdd}
                className="flex-1 py-3 bg-[var(--accent)] text-white font-semibold rounded-[var(--radius-lg)]"
              >
                등록
              </button>
              <button
                onClick={() => setAdding(false)}
                className="flex-1 py-3 bg-[var(--toss-gray-2)] font-semibold rounded-[var(--radius-lg)]"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}

      {settingOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-[120] p-0 sm:p-4"
          onClick={() => setSettingOpen(false)}
        >
          <div
            className="bg-[var(--card)] p-4 sm:p-5 rounded-t-[24px] sm:rounded-[var(--radius-md)] max-w-lg w-full max-h-[85vh] overflow-y-auto space-y-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="font-semibold text-lg">비품대여 물품 설정</h4>
                <p className="text-xs text-[var(--toss-gray-3)]">{scope}에서 사용할 대여 물품 목록을 직접 관리합니다.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAssetTypeDrafts([...DEFAULT_ASSET_TYPES]);
                  setNewAssetType('');
                }}
                className="text-xs font-semibold text-[var(--accent)]"
              >
                기본값 불러오기
              </button>
            </div>

            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {assetTypeDrafts.map((item, index) => (
                <div key={`${item}-${index}`} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={item}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setAssetTypeDrafts((prev) => prev.map((value, valueIndex) => (valueIndex === index ? nextValue : value)));
                    }}
                    className="flex-1 p-3 border rounded-[var(--radius-lg)]"
                  />
                  <button
                    type="button"
                    onClick={() => setAssetTypeDrafts((prev) => prev.filter((_, valueIndex) => valueIndex !== index))}
                    className="px-3 py-3 bg-red-500/10 text-red-600 text-xs font-semibold rounded-[var(--radius-lg)]"
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newAssetType}
                onChange={(event) => setNewAssetType(event.target.value)}
                placeholder="새 물품명"
                className="flex-1 p-3 border rounded-[var(--radius-lg)]"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddDraftAssetType();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddDraftAssetType}
                className="px-4 py-3 bg-[var(--toss-gray-2)] text-xs font-semibold rounded-[var(--radius-lg)]"
              >
                추가
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleSaveAssetTypes}
                disabled={savingSettings}
                className="flex-1 py-3 bg-[var(--accent)] text-white font-semibold rounded-[var(--radius-lg)] disabled:opacity-60"
              >
                {savingSettings ? '저장 중...' : '저장'}
              </button>
              <button
                type="button"
                onClick={() => setSettingOpen(false)}
                className="flex-1 py-3 bg-[var(--toss-gray-2)] font-semibold rounded-[var(--radius-lg)]"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
