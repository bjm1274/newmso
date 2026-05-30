'use client';

/**
 * SFormItem — 모바일 재고관리: 물품 등록 폼.
 *
 * 핸드오프: m-screens-forms.jsx §SFormItem
 *
 * 구성:
 *  - FormHeader (취소 / 물품 등록 / 저장)
 *  - 사진 / QR 스캔 듀얼 버튼
 *  - 품목명 · SKU · 카테고리 · 단위 · 단가 · 안전재고 · 주거래처
 *  - DesktopHint: CSV 일괄 업로드는 데스크톱
 *
 * 데이터: supabase.from('inventory').insert (PC 패턴 동일 — 물품등록.tsx)
 *
 * JM: ~330줄
 * JM3: try/catch + toast (필드 검증·insert 실패 모두 분기)
 * JM4: 입력 상태 타입 명시, unit union, payload type 명시
 * JM5: company는 user.company 자동 채움 — 다른 회사 데이터 insert 차단
 * JM6: label htmlFor 연결, button 시맨틱, 저장 중 aria-busy
 */

import { useState } from 'react';
import { toast } from '@/lib/toast';
import { enqueueSupabaseMutation } from '@/lib/offline-queue-supabase';
import type { ErpUser } from '@/types';
import MIcon from '../공통/MIcon';
import MAvatar from '../공통/MAvatar';
import {
  MFormHeader,
  MField,
  MInput,
  MSegRow,
  useFieldIdPrefix,
} from '../인사관리/form-helpers';

export type ItemUnit = '개' | '팩' | '박스' | 'EA';
const CATEGORIES = ['의료소모품', '영상의학', '의약품', '멸균/소독', '사무용품'] as const;
type ItemCat = (typeof CATEGORIES)[number];

// 모바일 UI 카테고리 → DB 카테고리 매핑 (PC 물품등록.tsx select 옵션 기준)
const CATEGORY_TO_DB: Record<ItemCat, string> = {
  의료소모품: '소모품',
  영상의학: '의료기기',
  의약품: '약품',
  '멸균/소독': '소모품',
  사무용품: '사무용품',
};

type FormState = {
  name: string;
  sku: string;
  cat: ItemCat;
  unit: ItemUnit;
  price: string;
  safety: string;
  vendor: string;
  imgAttached: boolean;
};

const INITIAL: FormState = {
  name: '',
  sku: '',
  cat: '의료소모품',
  unit: '개',
  price: '',
  safety: '',
  vendor: '',
  imgAttached: false,
};

type InventoryInsertPayload = {
  item_name: string;
  category: string;
  quantity: number;
  stock: number;
  min_quantity: number;
  unit_price: number;
  supplier_name: string | null;
  insurance_code: string | null;
  company: string;
  department: string;
  is_udi: boolean;
};

export type 물품등록Props = {
  user: ErpUser;
  onBack: () => void;
};

export default function 물품등록({ user, onBack }: 물품등록Props) {
  const [v, setV] = useState<FormState>(INITIAL);
  const [saving, setSaving] = useState(false);
  const fid = useFieldIdPrefix('item');

  const set = <K extends keyof FormState>(k: K, val: FormState[K]) => {
    setV((prev) => ({ ...prev, [k]: val }));
  };

  const handleSave = async () => {
    if (saving) return;

    const trimmedName = v.name.trim();
    if (!trimmedName) {
      toast('품목명을 입력해 주세요.', 'error');
      return;
    }
    const company = typeof user.company === 'string' ? user.company.trim() : '';
    if (!company) {
      toast('보유 회사 정보가 없습니다. 관리자에게 문의하세요.', 'error');
      return;
    }

    const parsedPrice = v.price.trim() === '' ? 0 : Number(v.price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      toast('단가는 0 이상의 숫자여야 합니다.', 'error');
      return;
    }
    const parsedSafety = v.safety.trim() === '' ? 0 : Number(v.safety);
    if (!Number.isFinite(parsedSafety) || parsedSafety < 0) {
      toast('안전 재고는 0 이상의 숫자여야 합니다.', 'error');
      return;
    }

    setSaving(true);
    try {
      const payload: InventoryInsertPayload = {
        item_name: trimmedName,
        category: CATEGORY_TO_DB[v.cat],
        quantity: 0, // 모바일 등록은 0으로 시작 — 입고는 별도 흐름
        stock: 0,
        min_quantity: parsedSafety,
        unit_price: parsedPrice,
        // inventory 테이블에 unit 컬럼이 없어 insert 시 500 발생 → 페이로드에서 제외.
        // (단위 UI는 유지하되 DB에는 저장하지 않음 — 데스크톱 자산등록과 동일 정책)
        supplier_name: v.vendor.trim() || null,
        insurance_code: v.sku.trim() || null,
        company,
        department: typeof user.department === 'string' ? user.department : '',
        is_udi: false,
      };

      const { queued, error } = await enqueueSupabaseMutation<{ id: string }[]>({
        kind: 'insert',
        table: 'inventory',
        payload: payload as unknown as Record<string, unknown>,
        retryable: true,
      });

      if (error) {
        toast(`저장 실패: ${error}`, 'error');
        return;
      }
      if (queued) {
        toast('오프라인 — 물품 등록 대기 중', 'info');
        onBack();
        return;
      }

      toast(`${trimmedName} 등록이 완료되었습니다.`, 'success');
      onBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="m-screen">
      <MFormHeader
        title="물품 등록"
        onCancel={onBack}
        onSave={() => { void handleSave(); }}
        saveDisabled={!v.name.trim() || saving}
        saveLabel={saving ? '저장 중…' : '저장'}
      />

      <div className="m-scroll">
        {/* 이미지 / QR */}
        <div
          style={{
            padding: '18px 16px',
            background: 'var(--m-card)',
            borderBottom: '1px solid var(--m-border)',
          }}
        >
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => set('imgAttached', !v.imgAttached)}
              aria-label={v.imgAttached ? '사진 첨부 해제' : '사진 추가'}
              style={{
                flex: 1,
                height: 90,
                borderRadius: 'var(--m-radius-md)',
                background: v.imgAttached
                  ? 'linear-gradient(135deg, #94A3B8, #64748B)'
                  : 'var(--z-100)',
                color: v.imgAttached ? '#fff' : 'var(--z-500)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                border: v.imgAttached ? 'none' : '1px dashed var(--z-300)',
              }}
            >
              <MIcon name="image" size={22} />
              <span style={{ fontSize: 11, fontWeight: 700 }}>
                {v.imgAttached ? '사진 첨부됨' : '사진 추가'}
              </span>
            </button>
            <button
              type="button"
              aria-label="QR 또는 바코드 스캔"
              style={{
                flex: 1,
                height: 90,
                borderRadius: 'var(--m-radius-md)',
                background: 'var(--m-accent-soft)',
                color: 'var(--m-accent)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                border: '1px dashed var(--m-accent)',
              }}
            >
              <MIcon name="qr" size={22} />
              <span style={{ fontSize: 11, fontWeight: 800 }}>QR/바코드 스캔</span>
            </button>
          </div>
        </div>

        <div
          className="m-card flush"
          style={{ borderRadius: 0, border: 'none' }}
        >
          <MField label="품목명" required htmlFor={fid('name')}>
            <MInput
              id={fid('name')}
              value={v.name}
              onChange={(val) => set('name', val)}
              placeholder="예: 카테터 18Ga"
              autoFocus
            />
          </MField>

          <MField label="SKU" htmlFor={fid('sku')} sub="비워두면 자동 생성">
            <MInput
              id={fid('sku')}
              value={v.sku}
              onChange={(val) => set('sku', val)}
              placeholder="자동 — 예: M-C18"
            />
          </MField>

          <MField label="카테고리">
            <div
              style={{
                display: 'flex',
                gap: 6,
                marginTop: 4,
                flexWrap: 'wrap',
              }}
              role="radiogroup"
              aria-label="카테고리"
            >
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set('cat', c)}
                  role="radio"
                  aria-checked={v.cat === c}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    background: v.cat === c ? 'var(--m-accent)' : 'var(--m-bg)',
                    color: v.cat === c ? '#fff' : 'var(--z-700)',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </MField>

          <MField label="단위">
            <MSegRow
              ariaLabel="단위"
              value={v.unit}
              onPick={(u) => set('unit', u as ItemUnit)}
              options={[
                { id: '개', label: '개' },
                { id: '팩', label: '팩' },
                { id: '박스', label: '박스' },
                { id: 'EA', label: 'EA' },
              ]}
            />
          </MField>

          <MField label="단가 (선택)" htmlFor={fid('price')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 15, color: 'var(--z-500)', fontWeight: 700 }}>₩</span>
              <MInput
                id={fid('price')}
                value={v.price}
                onChange={(val) => set('price', val)}
                placeholder="0"
                kind="decimal"
              />
            </div>
          </MField>

          <MField
            label="안전 재고"
            htmlFor={fid('safety')}
            sub="이 수량 이하로 떨어지면 자동 발주 권장 알림"
          >
            <MInput
              id={fid('safety')}
              value={v.safety}
              onChange={(val) => set('safety', val)}
              placeholder="예: 100"
              kind="numeric"
            />
          </MField>

          <MField label="주거래처">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 0',
              }}
            >
              <MAvatar tone="cyan" size="sm">
                {(v.vendor || '?').charAt(0)}
              </MAvatar>
              <MInput
                id={fid('vendor')}
                value={v.vendor}
                onChange={(val) => set('vendor', val)}
                placeholder="예: 동인의료"
              />
            </div>
          </MField>
        </div>

        <div
          style={{
            padding: '14px 16px 24px',
          }}
        >
          <div
            style={{
              padding: '12px 14px',
              borderRadius: 'var(--m-radius-md)',
              background: 'var(--m-accent-soft)',
              color: 'var(--m-accent)',
              fontSize: 12,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <MIcon name="info" size={14} />
            품목 다량 등록·CSV 일괄 업로드는 데스크톱에서
          </div>
        </div>
      </div>
    </div>
  );
}
