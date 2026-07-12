'use client';

/**
 * SFormOrder — 모바일 재고관리: 발주 등록 폼.
 *
 * 핸드오프: m-screens-forms.jsx §SFormOrder
 *
 * 구성:
 *  - FormHeader (취소 / 발주 등록 / 결재 올림)
 *  - 거래처 카드 (Avatar + 이름 + 변경 버튼)
 *  - 품목 리스트 (+/- stepper + 소계)
 *  - 배송 희망일 · 배송지 · 요청 메모
 *  - 스티키 푸터: 총금액(VAT 별도) + 결재 올리기
 *
 * P0: 발주 실제 insert는 결재 모듈에 위임 — 화면은 신청 폼만 노출.
 *
 * JM: ~250줄
 * JM3: 권한·필수값 가드 + toast
 * JM4: OrderItem 타입 명시, 수량은 number
 * JM5: canPlaceOrder 권한 가드 (UI는 비활성화)
 * JM6: 수량 +/- 버튼 aria-label, 입력 label htmlFor
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { enqueueD1Mutation } from '@/lib/offline-queue-d1';
import { db } from '@/lib/db-client';
import MIcon from '../공통/MIcon';
import MBtn from '../공통/MBtn';
import MAvatar from '../공통/MAvatar';
import MSheet from '../공통/MSheet';
import {
  MFormHeader,
  MField,
  MInput,
  useFieldIdPrefix } from '../인사관리/form-helpers';
import { canPlaceOrder, formatAmount, type StockMutateUser } from './data-hooks';

// purchase_orders.items jsonb 구조 (PC 발주관리/PurchaseOrderModal과 동일)
type PurchaseOrderItem = {
  item_id: string | null;
  name: string;
  qty: number;
  unit_price: number;
};

type PurchaseOrderInsert = {
  supplier_name: string;
  items: PurchaseOrderItem[];
  status: '대기';
  total_amount: number;
  created_by: string | null;
  notes: string;
  expected_delivery_date?: string | null;
};

// YYYY.MM.DD → ISO date. 형식 불일치/빈 값 → null
function toISODate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

export type OrderItem = {
  id: string | null;
  n: string;
  q: number;
  p: number;
  u: string;
};

type CatalogRow = { id: string; name: string; unit: string; price: number; stock: number };
type SupplierRow = { id: string; name: string };

export type 발주등록Props = {
  user: (StockMutateUser & { id?: string | null; name?: string | null; company?: string | null }) | null;
  onBack: () => void;
};

export default function 발주등록({ user, onBack }: 발주등록Props) {
  const [vendor, setVendor] = useState('');
  const [items, setItems] = useState<OrderItem[]>([]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [address, setAddress] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState<CatalogRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [itemSheetOpen, setItemSheetOpen] = useState(false);
  const [vendorSheetOpen, setVendorSheetOpen] = useState(false);
  const [itemQuery, setItemQuery] = useState('');
  const [vendorQuery, setVendorQuery] = useState('');
  const [customVendor, setCustomVendor] = useState('');
  const fid = useFieldIdPrefix('order');
  const company = typeof user?.company === 'string' ? user.company.trim() : '';

  const total = useMemo(
    () => items.reduce((s, it) => s + it.q * it.p, 0),
    [items],
  );

  const allowOrder = canPlaceOrder(user);

  const loadPickers = useCallback(async () => {
    setCatalogLoading(true);
    try {
      let invQ = db
        .from('inventory')
        .select('id, name, unit, quantity, unit_price, price, company')
        .order('name')
        .limit(300);
      if (company && company !== '전체') invQ = invQ.eq('company', company);
      const [invRes, supRes] = await Promise.all([
        invQ,
        db.from('suppliers').select('id, name, company').order('name').limit(100),
      ]);
      const invRows = Array.isArray(invRes.data) ? invRes.data : [];
      setCatalog(
        invRows.map((r: Record<string, unknown>) => ({
          id: String(r.id ?? ''),
          name: String(r.name ?? '').trim() || '(미명칭)',
          unit: String(r.unit ?? '개').trim() || '개',
          price: Number(r.unit_price ?? r.price ?? 0) || 0,
          stock: Number(r.quantity ?? 0) || 0,
        })),
      );
      let supRows = Array.isArray(supRes.data) ? (supRes.data as Record<string, unknown>[]) : [];
      if (company && company !== '전체') {
        supRows = supRows.filter((s) => {
          const c = String(s.company ?? '').trim();
          return !c || c === company || c === '전체';
        });
      }
      setSuppliers(
        supRows.map((s) => ({
          id: String(s.id ?? ''),
          name: String(s.name ?? '').trim() || '거래처',
        })),
      );
    } catch (err) {
      console.warn('[mobile-order] catalog load failed', err);
      toast('품목/거래처 목록을 불러오지 못했습니다.', 'warning');
    } finally {
      setCatalogLoading(false);
    }
  }, [company]);

  useEffect(() => {
    void loadPickers();
  }, [loadPickers]);

  const filteredCatalog = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return catalog;
    return catalog.filter((c) => c.name.toLowerCase().includes(q));
  }, [catalog, itemQuery]);

  const filteredSuppliers = useMemo(() => {
    const q = vendorQuery.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => s.name.toLowerCase().includes(q));
  }, [suppliers, vendorQuery]);

  const updateQ = (i: number, raw: string | number) => {
    const next = typeof raw === 'number' ? raw : parseInt(String(raw), 10) || 0;
    setItems((prev) => prev.map((it, j) => (j === i ? { ...it, q: Math.max(0, next) } : it)));
  };
  const removeItem = (i: number) => {
    setItems((prev) => prev.filter((_, j) => j !== i));
  };
  const addCatalogItem = (row: CatalogRow) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id && it.id === row.id);
      if (idx >= 0) {
        return prev.map((it, i) => (i === idx ? { ...it, q: it.q + 1 } : it));
      }
      return [...prev, { id: row.id || null, n: row.name, q: 1, p: row.price, u: row.unit }];
    });
    setItemSheetOpen(false);
    setItemQuery('');
    toast(`${row.name} 추가`, 'success');
  };

  const handleSave = async () => {
    if (saving) return;
    if (!allowOrder) {
      toast('발주 권한이 없습니다.', 'error');
      return;
    }
    if (items.length === 0) {
      toast('품목을 1개 이상 추가하세요.', 'error');
      return;
    }
    if (total <= 0) {
      toast('총 금액이 0원입니다.', 'error');
      return;
    }
    const trimmedVendor = vendor.trim();
    if (!trimmedVendor) {
      toast('거래처를 선택해 주세요.', 'error');
      return;
    }

    // 배송 희망일은 선택 — 입력된 경우에만 형식 검증
    let expectedDelivery: string | null = null;
    if (deliveryDate.trim()) {
      expectedDelivery = toISODate(deliveryDate);
      if (!expectedDelivery) {
        toast('배송 희망일은 YYYY.MM.DD 형식으로 입력해 주세요.', 'error');
        return;
      }
    }

    setSaving(true);
    try {
      const orderItems: PurchaseOrderItem[] = items.map((it) => ({
        item_id: it.id,
        name: it.n,
        qty: it.q,
        unit_price: it.p }));

      const noteParts: string[] = [];
      const companyTag = typeof user?.company === 'string' ? user.company.trim() : '';
      if (companyTag) noteParts.push(`[${companyTag}]`);
      noteParts.push('모바일 발주');
      if (address.trim()) noteParts.push(`배송지: ${address.trim()}`);
      if (memo.trim()) noteParts.push(memo.trim());

      const payload: PurchaseOrderInsert = {
        supplier_name: trimmedVendor,
        items: orderItems,
        status: '대기',
        total_amount: total,
        created_by: typeof user?.id === 'string' ? user.id : null,
        notes: noteParts.join(' · ') };
      if (expectedDelivery) payload.expected_delivery_date = expectedDelivery;

      // PC 패턴 분석: purchase_orders에 status='대기'로 insert.
      // 결재 흐름은 같은 테이블의 status 업데이트(대기→승인)로 처리되며
      // approvals 테이블에는 별도 insert하지 않음(PC 발주관리.tsx 244~256 동일).
      const { queued, error } = await enqueueD1Mutation({
        kind: 'insert',
        table: 'purchase_orders',
        payload: payload as Record<string, unknown> });
      if (error) {
        toast(`발주 실패: ${error}`, 'error');
        return;
      }
      if (queued) {
        toast('오프라인 — 발주가 동기화 대기 중입니다. 온라인 복귀 시 자동 전송됩니다.', 'warning');
      } else {
        toast('발주가 등록되었습니다. 결재함에서 확인하세요.', 'success');
      }
      onBack();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? '오류';
      toast(`발주 실패: ${msg}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="m-screen">
      <MFormHeader
        title="발주 등록"
        onCancel={onBack}
        onSave={handleSave}
        saveLabel={saving ? '전송 중…' : '결재 올림'}
        saveDisabled={!allowOrder || items.length === 0 || total <= 0 || saving}
      />

      <div className="m-scroll">
        {/* 거래처 */}
        <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
          <MField label="거래처" required>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
              <MAvatar tone="cyan" size="sm">
                {(vendor || '거').charAt(0)}
              </MAvatar>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{vendor || '거래처 미선택'}</div>
                <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600 }}>
                  등록 거래처 목록에서 선택
                </div>
              </div>
              <button
                type="button"
                aria-label="거래처 변경"
                onClick={() => {
                  setVendorQuery('');
                  setCustomVendor(vendor);
                  setVendorSheetOpen(true);
                }}
                style={{ color: 'var(--m-accent)', fontSize: 12, fontWeight: 700 }}
              >
                변경
              </button>
            </div>
          </MField>
        </div>

        {/* 품목 리스트 */}
        <div
          style={{
            padding: '14px 16px 0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between' }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: 'var(--z-500)',
              letterSpacing: '0.04em',
              textTransform: 'uppercase' }}
          >
            품목 {items.length}
          </div>
          <button
            type="button"
            aria-label="품목 추가"
            onClick={() => {
              setItemQuery('');
              setItemSheetOpen(true);
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--m-accent)' }}
          >
            <MIcon name="plus" size={14} />
            품목 추가
          </button>
        </div>

        <div
          style={{
            padding: '8px 16px 0',
            display: 'flex',
            flexDirection: 'column',
            gap: 10 }}
        >
          {items.length === 0 && (
            <div
              className="m-card"
              style={{ padding: 20, textAlign: 'center', fontSize: 13, color: 'var(--z-500)', fontWeight: 600 }}
            >
              품목이 없습니다. 「품목 추가」로 등록하세요.
            </div>
          )}
          {items.map((it, i) => (
            <div key={`${it.n}-${i}`} className="m-card" style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div
                  className="ico-tile"
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 'var(--m-radius-sm)',
                    background: 'var(--z-100)',
                    color: 'var(--z-700)',
                    display: 'grid',
                    placeItems: 'center' }}
                >
                  <MIcon name="box" size={16} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800 }}>{it.n}</div>
                  <div
                    className="m-tnum"
                    style={{
                      fontSize: 11,
                      color: 'var(--z-500)',
                      fontWeight: 600,
                      marginTop: 2 }}
                  >
                    단가 ₩{it.p}/{it.u}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label={`${it.n} 삭제`}
                  onClick={() => removeItem(i)}
                  style={{ color: 'var(--z-400)' }}
                >
                  <MIcon name="x" size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'var(--m-bg)',
                    borderRadius: 'var(--m-radius-md)',
                    padding: 4 }}
                >
                  <button
                    type="button"
                    aria-label={`${it.n} 수량 감소`}
                    onClick={() => updateQ(i, it.q - 1)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 7,
                      background: 'var(--m-card)',
                      display: 'grid',
                      placeItems: 'center' }}
                  >
                    <MIcon name="x" size={14} />
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={it.q}
                    onChange={(e) => updateQ(i, e.target.value)}
                    aria-label={`${it.n} 수량`}
                    className="m-tnum"
                    style={{
                      width: 60,
                      textAlign: 'center',
                      fontSize: 15,
                      fontWeight: 800,
                      padding: '6px 0' }}
                  />
                  <button
                    type="button"
                    aria-label={`${it.n} 수량 증가`}
                    onClick={() => updateQ(i, it.q + 1)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 7,
                      background: 'var(--m-card)',
                      display: 'grid',
                      placeItems: 'center' }}
                  >
                    <MIcon name="plus" size={14} />
                  </button>
                </div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 700 }}>소계</div>
                  <div
                    className="m-tnum"
                    style={{ fontSize: 15, fontWeight: 800 }}
                  >
                    ₩ {formatAmount(it.q * it.p)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 배송/메모 */}
        <div
          className="m-card flush"
          style={{ borderRadius: 0, border: 'none', marginTop: 14 }}
        >
          <MField label="배송 희망일" htmlFor={fid('delivery')}>
            <MInput
              id={fid('delivery')}
              value={deliveryDate}
              onChange={setDeliveryDate}
              placeholder="2026.05.30"
            />
          </MField>
          <MField label="배송지" htmlFor={fid('address')}>
            <MInput
              id={fid('address')}
              value={address}
              onChange={setAddress}
              placeholder="병원 주소 + 수령 위치"
            />
          </MField>
          <MField label="요청 메모 (선택)" htmlFor={fid('memo')}>
            <MInput
              id={fid('memo')}
              value={memo}
              onChange={setMemo}
              placeholder="예: 오전 배송 부탁드립니다"
            />
          </MField>
        </div>

        <div style={{ height: 120 }} />
      </div>

      {/* sticky 합계 + 발주 버튼 */}
      <div className="m-sticky-foot" style={{ flexDirection: 'column', gap: 10, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)' }}>총 금액 (VAT 별도)</div>
          <div style={{ flex: 1, textAlign: 'right' }} className="m-tnum">
            <span
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: '-0.025em',
                color: 'var(--z-900)' }}
            >
              ₩ {formatAmount(total)}
            </span>
          </div>
        </div>
        <MBtn
          block
          lg
          variant="primary"
          icon="send"
          disabled={!allowOrder || items.length === 0 || total <= 0 || saving}
          ariaLabel={saving ? '발주 전송 중' : '결재 올리기'}
          onClick={() => { void handleSave(); }}
        >
          {saving ? '전송 중…' : '결재 올리기'}
        </MBtn>
        {!allowOrder && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--m-warning)',
              fontWeight: 700,
              textAlign: 'center' }}
          >
            발주 권한이 없습니다. 관리자에게 요청하세요.
          </div>
        )}
      </div>

      {/* 품목 카탈로그 시트 */}
      <MSheet open={itemSheetOpen} onClose={() => setItemSheetOpen(false)} title="품목 선택">
        <div style={{ padding: '0 16px 20px' }}>
          <input
            type="search"
            value={itemQuery}
            onChange={(e) => setItemQuery(e.target.value)}
            placeholder="품목명 검색"
            aria-label="품목 검색"
            style={{
              width: '100%',
              height: 40,
              padding: '0 12px',
              borderRadius: 10,
              border: '1px solid var(--m-border)',
              background: 'var(--m-bg)',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 12 }}
          />
          {catalogLoading && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>불러오는 중…</div>
          )}
          {!catalogLoading && filteredCatalog.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--z-500)', fontSize: 13 }}>
              등록된 품목이 없습니다.
            </div>
          )}
          {filteredCatalog.map((row) => (
            <button
              key={row.id || row.name}
              type="button"
              onClick={() => addCatalogItem(row)}
              className="m-list-row"
              style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '12px 4px' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{row.name}</div>
                <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
                  재고 {row.stock}{row.unit} · 단가 ₩{formatAmount(row.price)}
                </div>
              </div>
              <MIcon name="plus" size={16} color="var(--m-accent)" />
            </button>
          ))}
        </div>
      </MSheet>

      {/* 거래처 시트 */}
      <MSheet open={vendorSheetOpen} onClose={() => setVendorSheetOpen(false)} title="거래처 선택">
        <div style={{ padding: '0 16px 20px' }}>
          <input
            type="search"
            value={vendorQuery}
            onChange={(e) => setVendorQuery(e.target.value)}
            placeholder="거래처 검색"
            aria-label="거래처 검색"
            style={{
              width: '100%',
              height: 40,
              padding: '0 12px',
              borderRadius: 10,
              border: '1px solid var(--m-border)',
              background: 'var(--m-bg)',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 12 }}
          />
          {filteredSuppliers.map((s) => (
            <button
              key={s.id || s.name}
              type="button"
              onClick={() => {
                setVendor(s.name);
                setVendorSheetOpen(false);
              }}
              className="m-list-row"
              style={{ width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '12px 4px' }}
            >
              <div style={{ fontSize: 14, fontWeight: 800 }}>{s.name}</div>
            </button>
          ))}
          <div style={{ marginTop: 12, borderTop: '1px solid var(--m-border)', paddingTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--z-500)', marginBottom: 8 }}>직접 입력</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={customVendor}
                onChange={(e) => setCustomVendor(e.target.value)}
                placeholder="거래처명"
                style={{
                  flex: 1,
                  height: 40,
                  padding: '0 12px',
                  borderRadius: 10,
                  border: '1px solid var(--m-border)',
                  background: 'var(--m-bg)',
                  fontSize: 14,
                  fontWeight: 600 }}
              />
              <button
                type="button"
                onClick={() => {
                  const v = customVendor.trim();
                  if (!v) {
                    toast('거래처명을 입력하세요.', 'warning');
                    return;
                  }
                  setVendor(v);
                  setVendorSheetOpen(false);
                }}
                style={{
                  padding: '0 14px',
                  borderRadius: 10,
                  background: 'var(--m-accent)',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 13,
                  border: 'none' }}
              >
                적용
              </button>
            </div>
          </div>
        </div>
      </MSheet>
    </div>
  );
}
