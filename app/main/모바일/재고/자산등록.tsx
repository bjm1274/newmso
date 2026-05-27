'use client';

/**
 * SFormAsset — 모바일 재고관리: 자산 등록 (QR 진입 패턴)
 *
 * 핸드오프: m-screens-forms.jsx §SFormAsset
 *
 * 구성:
 *  - FormHeader (취소 / 자산 등록 / 저장)
 *  - QR 스캔 hero (실제 카메라 X — 패턴만, 한 번 누르면 mock UDI 채움)
 *  - 자산명 · 태그 · 카테고리 · 위치 · 구입일 · 공급사 · 보증 만료
 *
 * 데이터: 자산도 `inventory` 테이블에 insert (PC는 자산을 별도 테이블 분리하지 않고
 *   inventory.is_udi=true + udi_code로 식별). category='의료기기' 등으로 분류.
 *
 * JM: ~290줄
 * JM3: try/catch + toast (검증 실패 / insert 실패 분기)
 * JM4: cat union, scan state boolean, payload type 명시
 * JM5: company는 user.company 자동 채움
 * JM6: 큰 hero 버튼 + aria-label, 라벨 htmlFor 연결, 저장 중 saveDisabled
 */

import { useState } from 'react';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { withMissingColumnsFallback } from '@/lib/supabase-compat';
import type { ErpUser } from '@/types';
import MIcon from '../공통/MIcon';
import {
  MFormHeader,
  MField,
  MInput,
  useFieldIdPrefix,
} from '../인사관리/form-helpers';

const ASSET_CATS = ['의료기기', '영상장비', 'IT 장비', '가구', '사무'] as const;
type AssetCat = (typeof ASSET_CATS)[number];

// 모바일 UI 카테고리 → DB 카테고리 (PC 분류 옵션 기준)
const CAT_TO_DB: Record<AssetCat, string> = {
  의료기기: '의료기기',
  영상장비: '의료기기',
  'IT 장비': '기타',
  가구: '기타',
  사무: '사무용품',
};

type FormState = {
  scan: boolean;
  name: string;
  tag: string;
  cat: AssetCat;
  loc: string;
  buy: string;
  vendor: string;
  warranty: string;
};

const INITIAL: FormState = {
  scan: false,
  name: '',
  tag: '',
  cat: '의료기기',
  loc: '',
  buy: '',
  vendor: '',
  warranty: '',
};

const MOCK_SCAN = {
  name: 'C-Arm OEC 9900 Elite',
  tag: 'AST-0049',
  udi: '(01)08806525301229(17)271231',
};

// YYYY.MM.DD → ISO date(YYYY-MM-DD) 변환. 빈 값/형식 불일치 시 null.
function toISODate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

type AssetInsertPayload = {
  item_name: string;
  category: string;
  quantity: number;
  stock: number;
  min_quantity: number;
  unit: 'EA';
  is_udi: boolean;
  udi_code: string | null;
  serial_number: string | null;
  supplier_name: string | null;
  location: string | null;
  purchase_date: string | null;
  expiry_date: string | null;
  company: string;
  department: string;
};

export type 자산등록Props = {
  user: ErpUser;
  onBack: () => void;
};

export default function 자산등록({ user, onBack }: 자산등록Props) {
  const [v, setV] = useState<FormState>(INITIAL);
  const [scannedUdi, setScannedUdi] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fid = useFieldIdPrefix('asset');

  const set = <K extends keyof FormState>(k: K, val: FormState[K]) => {
    setV((prev) => ({ ...prev, [k]: val }));
  };

  const handleScan = () => {
    // QR 패턴 시연 — 실제 카메라 호출 X (P0). UDI는 별도 state로 보관.
    setScannedUdi(MOCK_SCAN.udi);
    setV((prev) => ({
      ...prev,
      scan: true,
      name: prev.name || MOCK_SCAN.name,
      tag: prev.tag || MOCK_SCAN.tag,
    }));
  };

  const handleSave = async () => {
    if (saving) return;

    const trimmedName = v.name.trim();
    if (!trimmedName) {
      toast('자산명을 입력해 주세요.', 'error');
      return;
    }
    const company = typeof user.company === 'string' ? user.company.trim() : '';
    if (!company) {
      toast('보유 회사 정보가 없습니다. 관리자에게 문의하세요.', 'error');
      return;
    }

    // 날짜 형식 검증(입력된 경우에만)
    const purchaseDate = toISODate(v.buy);
    if (v.buy.trim() && !purchaseDate) {
      toast('구입일은 YYYY.MM.DD 형식으로 입력해 주세요.', 'error');
      return;
    }
    const warrantyDate = toISODate(v.warranty);
    if (v.warranty.trim() && !warrantyDate) {
      toast('보증 만료는 YYYY.MM.DD 형식으로 입력해 주세요.', 'error');
      return;
    }

    setSaving(true);
    try {
      const isUdi = Boolean(scannedUdi);
      const buildPayload = (omittedColumns: ReadonlySet<string>): Record<string, unknown> => {
        const payload: AssetInsertPayload = {
          item_name: trimmedName,
          category: CAT_TO_DB[v.cat],
          quantity: 1, // 자산은 1대 단위
          stock: 1,
          min_quantity: 0,
          unit: 'EA',
          is_udi: isUdi,
          udi_code: scannedUdi,
          serial_number: v.tag.trim() || null,
          supplier_name: v.vendor.trim() || null,
          location: v.loc.trim() || null,
          purchase_date: purchaseDate,
          expiry_date: warrantyDate, // 자산은 만료=보증 만료로 보관
          company,
          department: typeof user.department === 'string' ? user.department : '',
        };
        const out: Record<string, unknown> = { ...payload };
        if (omittedColumns.has('department')) delete out.department;
        if (omittedColumns.has('unit')) delete out.unit;
        if (omittedColumns.has('serial_number')) delete out.serial_number;
        if (omittedColumns.has('udi_code')) delete out.udi_code;
        if (omittedColumns.has('purchase_date')) delete out.purchase_date;
        if (omittedColumns.has('location')) delete out.location;
        return out;
      };

      const { error, data } = await withMissingColumnsFallback(
        (omittedColumns) =>
          supabase.from('inventory').insert([buildPayload(omittedColumns)]).select('id'),
        ['department', 'unit', 'serial_number', 'udi_code', 'purchase_date', 'location'],
      );

      if (error) throw error;
      if (!data || (Array.isArray(data) && data.length === 0)) {
        throw new Error('inventory 테이블 권한을 확인해주세요.');
      }

      toast(`${trimmedName} 자산이 등록되었습니다.`, 'success');
      onBack();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? '오류';
      toast(`저장 실패: ${msg}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="m-screen">
      <MFormHeader
        title="자산 등록"
        onCancel={onBack}
        onSave={() => { void handleSave(); }}
        saveDisabled={!v.name.trim() || saving}
        saveLabel={saving ? '저장 중…' : '저장'}
      />

      <div className="m-scroll">
        {/* QR hero */}
        <div
          style={{
            padding: '18px 16px',
            background: 'var(--m-card)',
            borderBottom: '1px solid var(--m-border)',
          }}
        >
          {!v.scan ? (
            <button
              type="button"
              onClick={handleScan}
              aria-label="자산 라벨 QR 스캔"
              style={{
                width: '100%',
                minHeight: 160,
                borderRadius: 'var(--m-radius-lg)',
                background: 'linear-gradient(135deg, var(--m-accent), var(--m-accent-700))',
                color: '#fff',
                border: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
              }}
            >
              <MIcon name="qr" size={42} strokeWidth={1.4} />
              <div style={{ fontSize: 16, fontWeight: 800 }}>자산 라벨 스캔하기</div>
              <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85 }}>
                UDI 라벨 / QR / 바코드 자동 인식
              </div>
            </button>
          ) : (
            <div
              style={{
                padding: '14px 14px',
                borderRadius: 'var(--m-radius-lg)',
                background: 'var(--m-success-soft)',
                border: '1px solid transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MIcon name="checkCircle" size={22} color="var(--m-success)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--m-success)' }}>
                    UDI 인식 완료 · MFDS DB 매칭
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--z-600)',
                      fontWeight: 600,
                      marginTop: 1,
                      fontFamily: 'var(--m-mono)',
                    }}
                  >
                    {scannedUdi ?? MOCK_SCAN.udi}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="재스캔"
                  onClick={() => {
                    setScannedUdi(null);
                    set('scan', false);
                  }}
                  style={{ fontSize: 12, fontWeight: 700, color: 'var(--z-500)' }}
                >
                  재스캔
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="m-card flush" style={{ borderRadius: 0, border: 'none' }}>
          <MField label="자산명" required htmlFor={fid('name')}>
            <MInput
              id={fid('name')}
              value={v.name}
              onChange={(val) => set('name', val)}
              placeholder="예: 1.5T MRI · GE Signa"
              autoFocus
            />
          </MField>
          <MField label="자산 태그" htmlFor={fid('tag')} sub="자동 생성 또는 라벨 인식값">
            <MInput
              id={fid('tag')}
              value={v.tag}
              onChange={(val) => set('tag', val)}
              placeholder="자동 — AST-XXXX"
            />
          </MField>
          <MField label="카테고리">
            <div
              style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}
              role="radiogroup"
              aria-label="자산 카테고리"
            >
              {ASSET_CATS.map((c) => (
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
          <MField label="설치 위치" htmlFor={fid('loc')}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
              <MIcon name="mapPin" size={16} color="var(--m-accent)" />
              <MInput
                id={fid('loc')}
                value={v.loc}
                onChange={(val) => set('loc', val)}
                placeholder="예: 영상의학실 A"
              />
            </div>
          </MField>
          <MField label="구입일" htmlFor={fid('buy')}>
            <MInput
              id={fid('buy')}
              value={v.buy}
              onChange={(val) => set('buy', val)}
              placeholder="YYYY.MM.DD"
            />
          </MField>
          <MField label="공급사" htmlFor={fid('vendor')}>
            <MInput
              id={fid('vendor')}
              value={v.vendor}
              onChange={(val) => set('vendor', val)}
              placeholder="예: GE 헬스케어 코리아"
            />
          </MField>
          <MField label="보증 만료" htmlFor={fid('warranty')} sub="예: 2028.03.15">
            <MInput
              id={fid('warranty')}
              value={v.warranty}
              onChange={(val) => set('warranty', val)}
              placeholder="YYYY.MM.DD"
            />
          </MField>
        </div>
        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
