'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { withMissingColumnFallback } from '@/lib/supabase-compat';
import type { InventoryItem, StaffMember } from '@/types';
import {
  ZHSUNYCO_CONFIG_STORAGE_KEY,
  ZHSUNYCO_GOODS_SLOT_LABELS,
  buildZhsunycoGoodsPayload,
  buildZhsunycoGoodsPreview,
  createZhsunycoDraftFromInventory,
  type ZhsunycoGoodsDraft,
  type ZhsunycoPersistedConfig,
  type ZhsunycoSyncConfig,
} from '@/lib/zhsunyco-esl';

type InventoryRecord = InventoryItem & Record<string, unknown>;
type StoreRecord = Record<string, unknown>;

const DEFAULT_CONFIG: ZhsunycoSyncConfig = {
  baseUrl: '',
  userName: '',
  password: '',
  shopCode: '',
  customerStoreCode: '',
  template: 'REG',
  notifyRefresh: true,
};

function getName(item: InventoryRecord | null | undefined) {
  return String(item?.item_name || item?.name || '').trim() || '이름 없음';
}

function getQty(item: InventoryRecord | null | undefined) {
  return Number(item?.quantity ?? item?.stock ?? 0);
}

function getPrice(item: InventoryRecord | null | undefined) {
  return Number(item?.unit_price ?? item?.price ?? 0);
}

function money(value: number) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}

function toDebugText(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? '');
  }
}

function persistedConfig(config: ZhsunycoSyncConfig): ZhsunycoPersistedConfig {
  const { password: _password, ...rest } = config;
  return rest;
}

export default function ZhsunycoEslSync({
  user,
  selectedCo,
  selectedCompanyId,
}: {
  user?: StaffMember | null;
  selectedCo?: string | null;
  selectedCompanyId?: string | null;
}) {
  const [config, setConfig] = useState<ZhsunycoSyncConfig>(DEFAULT_CONFIG);
  const [inventory, setInventory] = useState<InventoryRecord[]>([]);
  const [draftsById, setDraftsById] = useState<Record<string, ZhsunycoGoodsDraft>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [keyword, setKeyword] = useState('');
  const [busy, setBusy] = useState<'test' | 'stores' | 'push' | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState('');
  const [debugText, setDebugText] = useState('');
  const [deviceMode, setDeviceMode] = useState<'tft' | 'esl'>('tft');
  const [deviceId, setDeviceId] = useState('');
  const [bindTemplateName, setBindTemplateName] = useState('');
  const [bindAreaId, setBindAreaId] = useState('0');

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ZHSUNYCO_CONFIG_STORAGE_KEY);
      if (!raw) return;
      setConfig((prev) => ({
        ...prev,
        ...(JSON.parse(raw) as Partial<ZhsunycoPersistedConfig>),
        password: '',
      }));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(ZHSUNYCO_CONFIG_STORAGE_KEY, JSON.stringify(persistedConfig(config)));
    } catch {
      // ignore
    }
  }, [config.baseUrl, config.customerStoreCode, config.notifyRefresh, config.shopCode, config.template, config.userName]);

  const fetchInventory = useCallback(async () => {
    setLoading(true);

    try {
      const isMsoUser = user?.company === 'SY INC.' || user?.permissions?.mso === true;
      const companyName = !isMsoUser ? String(user?.company || '').trim() || null : selectedCo && selectedCo !== '전체' ? selectedCo : null;
      const companyId = !isMsoUser ? String(user?.company_id || '').trim() || null : companyName && selectedCompanyId ? selectedCompanyId : null;

      const { data, error } = await withMissingColumnFallback(
        async () => {
          let query = supabase.from('inventory').select('*').order('item_name', { ascending: true });
          if (companyName) query = query.eq('company', companyName);
          else if (companyId) query = query.eq('company_id', companyId);
          return query;
        },
        async () => {
          let query = supabase.from('inventory').select('*').order('name', { ascending: true });
          if (companyName) query = query.eq('company', companyName);
          return query;
        },
      );

      if (error) throw error;

      const rows = Array.isArray(data) ? (data as InventoryRecord[]) : [];
      setInventory(rows);
      setDraftsById((prev) => {
        const next = { ...prev };
        rows.forEach((item) => {
          const id = String(item.id || '');
          if (!id || next[id]) return;
          next[id] = createZhsunycoDraftFromInventory(item, String(user?.name || ''));
        });
        return next;
      });
    } catch (error) {
      console.error('ESL inventory load failed:', error);
      toast('재고 목록을 불러오지 못했습니다.', 'error');
    } finally {
      setLoading(false);
    }
  }, [selectedCo, selectedCompanyId, user?.company, user?.company_id, user?.name, user?.permissions?.mso]);

  useEffect(() => {
    void fetchInventory();
  }, [fetchInventory]);

  const filteredInventory = useMemo(() => {
    if (!keyword.trim()) return inventory;
    const lower = keyword.trim().toLowerCase();
    return inventory.filter((item) => {
      const draft = draftsById[String(item.id || '')];
      return [
        getName(item),
        String(item.code || ''),
        String(item.barcode || ''),
        String(item.category || ''),
        draft?.goodsCode || '',
        draft?.goodsName || '',
      ].join(' ').toLowerCase().includes(lower);
    });
  }, [draftsById, inventory, keyword]);

  const selectedItems = useMemo(() => {
    const selected = new Set(selectedIds);
    return inventory.filter((item) => selected.has(String(item.id || '')));
  }, [inventory, selectedIds]);

  const previewRows = useMemo(() => {
    const first = selectedItems[0];
    if (!first) return [];
    const draft = draftsById[String(first.id || '')];
    if (!draft) return [];
    return buildZhsunycoGoodsPreview(config.customerStoreCode.trim() || config.shopCode.trim(), draft);
  }, [config.customerStoreCode, config.shopCode, draftsById, selectedItems]);

  const updateDraft = useCallback((id: string, patch: Partial<ZhsunycoGoodsDraft>) => {
    setDraftsById((prev) => prev[id] ? { ...prev, [id]: { ...prev[id], ...patch } } : prev);
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);
  }, []);

  const toggleVisible = useCallback(() => {
    const visibleIds = filteredInventory.map((item) => String(item.id || ''));
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
    setSelectedIds((prev) => allSelected ? prev.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...prev, ...visibleIds])));
  }, [filteredInventory, selectedIds]);

  const callApi = useCallback(async (action: 'test' | 'queryStores' | 'pushGoods' | 'bindDevice', payload?: unknown) => {
    const response = await fetch('/api/esl/zhsunyco', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, config, ...(payload ? { payload } : {}) }),
    });

    const result = await response.json().catch(() => ({ ok: false, error: '응답 해석 실패' }));
    if (!response.ok || result?.ok === false) {
      throw new Error(String(result?.error || result?.upstream?.message || '연동 요청 실패'));
    }
    return result;
  }, [config]);

  const handleTest = useCallback(async () => {
    if (!config.baseUrl.trim() || !config.userName.trim() || !config.password.trim()) {
      toast('기본 주소, 계정, 비밀번호를 입력해 주세요.', 'error');
      return;
    }
    setBusy('test');
    try {
      const result = await callApi('test');
      const helloStatus = Number(result?.hello?.status || 0);
      setSummary(helloStatus === 200 ? 'API 연결과 로그인을 확인했습니다.' : `로그인은 확인됐지만 /api/hello 는 ${helloStatus} 상태입니다.`);
      setDebugText(toDebugText(result));
      toast('연결 테스트를 마쳤습니다.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '연결 테스트 실패';
      setSummary(message);
      setDebugText(message);
      toast(message, 'error');
    } finally {
      setBusy(null);
    }
  }, [callApi, config.baseUrl, config.password, config.userName]);

  const handleStoreQuery = useCallback(async () => {
    if (!config.baseUrl.trim() || !config.userName.trim() || !config.password.trim()) {
      toast('기본 주소, 계정, 비밀번호를 입력해 주세요.', 'error');
      return;
    }
    setBusy('stores');
    try {
      const result = await callApi('queryStores');
      const nextStores = Array.isArray(result?.stores) ? (result.stores as StoreRecord[]) : [];
      setStores(nextStores);
      setDebugText(toDebugText(result));
      toast(nextStores.length > 0 ? `${nextStores.length}개 매장을 찾았습니다.` : '매장 목록이 비어 있습니다.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '매장 조회 실패';
      setDebugText(message);
      toast(message, 'error');
    } finally {
      setBusy(null);
    }
  }, [callApi, config.baseUrl, config.password, config.userName]);

  const handlePush = useCallback(async () => {
    if (!config.baseUrl.trim() || !config.userName.trim() || !config.password.trim()) {
      toast('기본 주소, 계정, 비밀번호를 입력해 주세요.', 'error');
      return;
    }
    if (!config.shopCode.trim() || !config.template.trim()) {
      toast('shopCode 와 template 을 입력해 주세요.', 'error');
      return;
    }
    if (selectedItems.length === 0) {
      toast('전송할 품목을 선택해 주세요.', 'error');
      return;
    }

    const drafts = selectedItems
      .map((item) => draftsById[String(item.id || '')])
      .filter((draft): draft is ZhsunycoGoodsDraft => Boolean(draft));

    const invalid = drafts.find((draft) => !draft.goodsCode.trim() || !draft.goodsName.trim());
    if (invalid) {
      toast('선택 품목 중 상품코드 또는 상품명이 비어 있습니다.', 'error');
      return;
    }

    setBusy('push');
    try {
      const payload = buildZhsunycoGoodsPayload(config, drafts);
      const result = await callApi('pushGoods', payload);
      setDebugText(toDebugText(result));
      toast(`${result?.itemCount || drafts.length}건을 전송했습니다.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '전송 실패';
      setDebugText(message);
      toast(message, 'error');
    } finally {
      setBusy(null);
    }
  }, [callApi, config, draftsById, selectedItems]);

  const handlePushAndBind = useCallback(async () => {
    if (!deviceId.trim()) {
      toast('기기 옆면 바코드 값을 입력해 주세요.', 'error');
      return;
    }

    if (deviceMode === 'tft' && !bindTemplateName.trim()) {
      toast('템플릿명을 입력해 주세요.', 'error');
      return;
    }

    if (!(config.shopCode.trim() || config.customerStoreCode.trim())) {
      toast('실매장이 없어도 테스트용 shopCode 또는 고객 매장코드는 하나 필요합니다. 예: TEST01', 'error');
      return;
    }

    if (selectedItems.length === 0) {
      toast('먼저 상품을 하나 이상 선택해 주세요.', 'error');
      return;
    }

    const drafts = selectedItems
      .map((item) => draftsById[String(item.id || '')])
      .filter((draft): draft is ZhsunycoGoodsDraft => Boolean(draft));

    const invalid = drafts.find((draft) => !draft.goodsCode.trim() || !draft.goodsName.trim());
    if (invalid) {
      toast('선택 상품 중 상품코드 또는 상품명이 비어 있습니다.', 'error');
      return;
    }

    setBusy('push');
    try {
      const goodsPayload = buildZhsunycoGoodsPayload(config, drafts);
      const saveResult = await callApi('pushGoods', goodsPayload);
      const bindResult = await callApi('bindDevice', {
        mode: deviceMode,
        deviceId,
        templateName: bindTemplateName,
        goodsCodes: drafts.map((draft) => draft.goodsCode),
        areaId: Number(bindAreaId || 0),
        displayIndex: 0,
        refreshAfterBind: true,
      });

      setDebugText(`${toDebugText(saveResult)}\n\n${toDebugText(bindResult)}`);
      toast('상품 저장 후 기기 바인딩까지 완료했습니다.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : '바인딩 실패';
      setDebugText(message);
      toast(message, 'error');
    } finally {
      setBusy(null);
    }
  }, [bindAreaId, bindTemplateName, callApi, config, deviceId, deviceMode, draftsById, selectedItems]);

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <h2 className="text-lg font-bold text-[var(--foreground)]">Zhsunyco ESL 연동</h2>
        <p className="mt-2 text-sm text-[var(--toss-gray-3)]">
          초기 태그 바인딩 이후 반복 전송을 단순화하는 화면입니다. 제공하신 관리자 URL은 로그인 시 서버 오류가 보여서, 공식 eRetail API 주소를 직접 넣는 방식으로 구성했습니다.
        </p>
        <p className="mt-2 text-[12px] text-[var(--toss-gray-3)]">
          사진처럼 옆면 바코드를 스캔해 붙이는 흐름이면, 아래에서 테스트용 코드 하나를 넣고 상품 저장 후 바로 바인딩하면 됩니다. 실매장이 없어도 `TEST01` 같은 코드로 시작해도 됩니다.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={config.baseUrl} onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))} placeholder="API 기본 주소" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
          <input value={config.userName} onChange={(e) => setConfig((prev) => ({ ...prev, userName: e.target.value }))} placeholder="API 계정" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
          <input type="password" value={config.password} onChange={(e) => setConfig((prev) => ({ ...prev, password: e.target.value }))} placeholder="비밀번호" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
          <input value={config.template} onChange={(e) => setConfig((prev) => ({ ...prev, template: e.target.value }))} placeholder="Template" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
          <input value={config.shopCode} onChange={(e) => setConfig((prev) => ({ ...prev, shopCode: e.target.value }))} placeholder="shopCode" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
          <input value={config.customerStoreCode} onChange={(e) => setConfig((prev) => ({ ...prev, customerStoreCode: e.target.value }))} placeholder="고객 매장코드" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
        </div>

        <label className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-[var(--foreground)]">
          <input type="checkbox" checked={config.notifyRefresh} onChange={(e) => setConfig((prev) => ({ ...prev, notifyRefresh: e.target.checked }))} />
          상품 저장 후 라벨 갱신도 같이 요청
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void handleTest()} disabled={busy !== null} className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60">{busy === 'test' ? '확인 중...' : '연결 테스트'}</button>
          <button type="button" onClick={() => void handleStoreQuery()} disabled={busy !== null} className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-[12px] font-semibold text-[var(--foreground)] disabled:opacity-60">{busy === 'stores' ? '조회 중...' : '매장 조회'}</button>
        </div>

        {summary ? <p className="mt-3 text-[12px] font-semibold text-[var(--foreground)]">{summary}</p> : null}
        {stores.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {stores.map((store, index) => {
              const shopCode = String(store.shopCode || '').trim();
              const shopCodeCst = String(store.shopCodeCst || '').trim();
              const shopName = String(store.shopName || shopCode || `store-${index + 1}`);
              return (
                <button
                  key={`${shopCode}-${shopCodeCst}-${index}`}
                  type="button"
                  onClick={() => setConfig((prev) => ({ ...prev, shopCode: shopCode || prev.shopCode, customerStoreCode: shopCodeCst || prev.customerStoreCode }))}
                  className="rounded-full border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]"
                >
                  {shopName} · {shopCode || '-'}{shopCodeCst ? ` / ${shopCodeCst}` : ''}
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-[var(--foreground)]">재고 선택</h3>
          <div className="flex gap-2">
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="검색" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
            <button type="button" onClick={toggleVisible} className="rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-2 text-[12px] font-semibold text-[var(--foreground)]">보이는 항목 선택/해제</button>
          </div>
        </div>

        <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)]">
          <div className="grid grid-cols-[52px_minmax(0,2fr)_minmax(0,1fr)_90px_110px] border-b border-[var(--border)] bg-[var(--muted)]/35 px-4 py-3 text-[11px] font-bold text-[var(--toss-gray-3)]">
            <span>선택</span>
            <span>품목</span>
            <span>상품코드</span>
            <span>재고</span>
            <span>단가</span>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-sm font-semibold text-[var(--toss-gray-3)]">불러오는 중...</div>
          ) : filteredInventory.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm font-semibold text-[var(--toss-gray-3)]">표시할 품목이 없습니다.</div>
          ) : (
            <div className="max-h-[360px] overflow-y-auto">
              {filteredInventory.map((item) => {
                const id = String(item.id || '');
                const draft = draftsById[id] || createZhsunycoDraftFromInventory(item, String(user?.name || ''));
                const selected = selectedIds.includes(id);
                return (
                  <label key={id} className={`grid grid-cols-[52px_minmax(0,2fr)_minmax(0,1fr)_90px_110px] items-center border-b border-[var(--border)] px-4 py-3 text-sm ${selected ? 'bg-[var(--toss-blue-light)]/35' : ''}`}>
                    <span><input type="checkbox" checked={selected} onChange={() => toggleSelected(id)} /></span>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-[var(--foreground)]">{getName(item)}</span>
                      <span className="block truncate text-[11px] text-[var(--toss-gray-3)]">{String(item.barcode || item.spec || item.category || '').trim() || '보조 정보 없음'}</span>
                    </span>
                    <span className="truncate pr-2 text-[12px] font-semibold text-[var(--foreground)]">{draft.goodsCode || '-'}</span>
                    <span className="text-[12px] font-semibold text-[var(--foreground)]">{getQty(item)}</span>
                    <span className="text-[12px] font-semibold text-[var(--foreground)]">{money(getPrice(item))}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-bold text-[var(--foreground)]">전송 큐</h3>
          <button type="button" onClick={() => void handlePush()} disabled={busy !== null || selectedItems.length === 0} className="rounded-[var(--radius-md)] bg-emerald-600 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60">{busy === 'push' ? '전송 중...' : `선택 ${selectedItems.length}건 전송`}</button>
        </div>

        {selectedItems.length === 0 ? (
          <div className="mt-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border)] px-4 py-8 text-center text-sm font-semibold text-[var(--toss-gray-3)]">선택된 품목이 없습니다.</div>
        ) : (
          <div className="mt-4 space-y-3">
            {selectedItems.map((item) => {
              const id = String(item.id || '');
              const draft = draftsById[id] || createZhsunycoDraftFromInventory(item, String(user?.name || ''));
              return (
                <div key={id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-bold text-[var(--foreground)]">{getName(item)}</p>
                      <p className="text-[11px] text-[var(--toss-gray-3)]">재고 {draft.inventory || '0'} · 바코드 {draft.upc1 || '-'}</p>
                    </div>
                    <button type="button" onClick={() => toggleSelected(id)} className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--foreground)]">제외</button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <input value={draft.goodsCode} onChange={(e) => updateDraft(id, { goodsCode: e.target.value })} placeholder="상품코드" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
                    <input value={draft.goodsName} onChange={(e) => updateDraft(id, { goodsName: e.target.value })} placeholder="상품명" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
                    <input value={draft.upc1} onChange={(e) => updateDraft(id, { upc1: e.target.value })} placeholder="바코드 / UPC1" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
                    <input value={draft.price1} onChange={(e) => updateDraft(id, { price1: e.target.value })} placeholder="가격1" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {previewRows.length > 0 ? (
          <details className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] p-4">
            <summary className="cursor-pointer text-sm font-bold text-[var(--foreground)]">기본 필드 매핑 보기 ({ZHSUNYCO_GOODS_SLOT_LABELS.length}칸)</summary>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {previewRows.map((row) => (
                <div key={`${row.index}-${row.label}`} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2">
                  <p className="text-[10px] font-bold text-[var(--toss-gray-3)]">{row.index}. {row.label}</p>
                  <p className="mt-1 truncate text-[12px] font-semibold text-[var(--foreground)]">{row.value || '(빈값)'}</p>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[var(--foreground)]">기기 바인딩</h3>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)]">
              선택 상품을 저장한 뒤, 옆면 바코드의 기기 ID에 템플릿을 묶습니다. 환자정보판처럼 큰 화면이면 보통 `TFT/사이니지` 쪽이 맞습니다.
            </p>
          </div>
          <button type="button" onClick={() => void handlePushAndBind()} disabled={busy !== null || selectedItems.length === 0} className="rounded-[var(--radius-md)] bg-[var(--accent)] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60">{busy === 'push' ? '처리 중...' : '상품 저장 + 기기 바인딩'}</button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">기기 종류</span>
            <select value={deviceMode} onChange={(e) => setDeviceMode(e.target.value === 'esl' ? 'esl' : 'tft')} className="w-full rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm">
              <option value="tft">TFT / 사이니지</option>
              <option value="esl">일반 ESL</option>
            </select>
          </label>
          <input value={deviceId} onChange={(e) => setDeviceId(e.target.value)} placeholder="기기 옆면 바코드 / ID" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
          <input value={bindTemplateName} onChange={(e) => setBindTemplateName(e.target.value)} placeholder="템플릿명" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
          <input value={bindAreaId} onChange={(e) => setBindAreaId(e.target.value)} placeholder="areaId (기본 0)" className="rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-sm" />
        </div>
      </section>

      {debugText ? (
        <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
          <h3 className="text-base font-bold text-[var(--foreground)]">최근 응답</h3>
          <pre className="mt-3 overflow-x-auto rounded-[var(--radius-lg)] bg-[#0f172a] p-4 text-[11px] leading-5 text-slate-100">{debugText}</pre>
        </section>
      ) : null}
    </div>
  );
}
