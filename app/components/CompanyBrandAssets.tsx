'use client';

/**
 * 회사(병원) 로고·직인 등록 UI.
 * 업로드 시 자동 누끼 + 크롭 + 용도별 리사이즈 후 R2 업로드.
 */

import { useRef, useState } from 'react';
import { toast } from '@/lib/toast';
import { processBrandImage } from '@/lib/brand-image-process';
import {
  saveCompanyLogo,
  saveCompanySeal,
  uploadBrandAssetFile,
} from '@/lib/company-brand-assets';

export type CompanyBrandAssetsProps = {
  companyId?: string | null;
  companyName: string;
  logoUrl?: string | null;
  sealUrl?: string | null;
  onLogoChange?: (url: string | null) => void;
  onSealChange?: (url: string | null) => void;
  /** 저장 대상 DB id 가 없으면 로컬 form 만 갱신 (신규 등록 전) */
  persist?: boolean;
  className?: string;
};

function CheckerPreview({
  src,
  alt,
  emptyLabel,
}: {
  src?: string | null;
  alt: string;
  emptyLabel: string;
}) {
  return (
    <div
      className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-[var(--border)] bg-[var(--card)]"
      style={{
        backgroundImage: src
          ? 'linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%)'
          : undefined,
        backgroundSize: src ? '10px 10px' : undefined,
        backgroundPosition: src ? '0 0,0 5px,5px -5px,-5px 0' : undefined,
        backgroundColor: src ? '#fff' : undefined,
      }}
    >
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-contain p-1.5" />
      ) : (
        <span className="px-1 text-center text-[10px] font-bold leading-tight text-[var(--toss-gray-3)]">
          {emptyLabel}
        </span>
      )}
    </div>
  );
}

export default function CompanyBrandAssets({
  companyId,
  companyName,
  logoUrl,
  sealUrl,
  onLogoChange,
  onSealChange,
  persist = true,
  className = '',
}: CompanyBrandAssetsProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const sealInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'logo' | 'seal' | null>(null);
  const [status, setStatus] = useState<string>('');

  const canPersist = Boolean(persist && companyId && companyName.trim());

  const runUpload = async (kind: 'logo' | 'seal', file: File) => {
    const name = companyName.trim();
    if (!name) {
      toast('회사명을 먼저 입력해 주세요.', 'warning');
      return;
    }
    setBusy(kind);
    setStatus('누끼·크기 조절 중…');
    try {
      const processed = await processBrandImage(file, { kind });
      setStatus('업로드 중…');
      const { url } = await uploadBrandAssetFile({
        file: processed.file,
        companyName: name,
        kind,
      });

      if (canPersist && companyId) {
        if (kind === 'logo') {
          await saveCompanyLogo({ companyId, logoUrl: url });
        } else {
          await saveCompanySeal({ companyId, companyName: name, sealUrl: url });
        }
      }

      if (kind === 'logo') onLogoChange?.(url);
      else onSealChange?.(url);

      const nukiLabel = processed.removedBg ? '누끼 적용 · ' : '';
      toast(
        `${kind === 'logo' ? '로고' : '직인'} 등록 완료 (${nukiLabel}${processed.width}×${processed.height})`,
        'success',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '처리 중 오류가 발생했습니다.';
      toast(message, 'error');
    } finally {
      setBusy(null);
      setStatus('');
    }
  };

  const clearAsset = async (kind: 'logo' | 'seal') => {
    if (!confirm(`${kind === 'logo' ? '로고' : '직인'}을 제거하시겠습니까?`)) return;
    try {
      if (canPersist && companyId) {
        if (kind === 'logo') {
          await saveCompanyLogo({ companyId, logoUrl: null });
        } else {
          await saveCompanySeal({
            companyId,
            companyName: companyName.trim(),
            sealUrl: null,
          });
        }
      }
      if (kind === 'logo') onLogoChange?.(null);
      else onSealChange?.(null);
      toast(`${kind === 'logo' ? '로고' : '직인'}을 제거했습니다.`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : '제거에 실패했습니다.';
      toast(message, 'error');
    }
  };

  return (
    <section
      data-testid="company-brand-assets"
      className={`rounded-[var(--radius-lg)] border-2 border-[var(--accent)]/25 bg-[var(--accent)]/[0.04] p-4 ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-black text-[var(--foreground)]">회사 로고 · 직인</h4>
          <p className="mt-0.5 text-[11px] font-medium text-[var(--toss-gray-3)]">
            업로드 시 배경 자동 제거(누끼) · 여백 크롭 · 사용처별 크기 자동 맞춤
          </p>
        </div>
        {busy ? (
          <span className="text-[11px] font-bold text-[var(--accent)] animate-pulse">
            {status || '처리 중…'}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/* 로고 */}
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
          <p className="mb-2 text-[11px] font-bold text-[var(--toss-gray-3)]">로고 (증명서 헤더·워터마크)</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => logoInputRef.current?.click()}
              className="shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:opacity-50"
              aria-label="회사 로고 업로드"
            >
              <CheckerPreview src={logoUrl} alt="회사 로고" emptyLabel="로고 선택" />
            </button>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[11px] font-bold text-[var(--foreground)]">PNG / JPG / WEBP</p>
              <p className="text-[10px] font-medium leading-relaxed text-[var(--toss-gray-3)]">
                흰 배경·스캔본도 자동 투명 처리 · 최대 512px
              </p>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => logoInputRef.current?.click()}
                  className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                >
                  {busy === 'logo' ? '처리 중…' : logoUrl ? '로고 변경' : '로고 등록'}
                </button>
                {logoUrl ? (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void clearAsset('logo')}
                    className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold text-red-500 disabled:opacity-50"
                  >
                    제거
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void runUpload('logo', file);
              e.target.value = '';
            }}
          />
        </div>

        {/* 직인 */}
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-3">
          <p className="mb-2 text-[11px] font-bold text-[var(--toss-gray-3)]">직인/도장 (증명서·계약서)</p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={() => sealInputRef.current?.click()}
              className="shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:opacity-50"
              aria-label="회사 직인 업로드"
            >
              <CheckerPreview src={sealUrl} alt="회사 직인" emptyLabel="직인 선택" />
            </button>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-[11px] font-bold text-[var(--foreground)]">원형 도장 이미지 권장</p>
              <p className="text-[10px] font-medium leading-relaxed text-[var(--toss-gray-3)]">
                흰 종이 배경 자동 제거 · 최대 400px · 계약 템플릿과 동기화
              </p>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <button
                  type="button"
                  disabled={Boolean(busy)}
                  onClick={() => sealInputRef.current?.click()}
                  className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                >
                  {busy === 'seal' ? '처리 중…' : sealUrl ? '직인 변경' : '직인 등록'}
                </button>
                {sealUrl ? (
                  <button
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => void clearAsset('seal')}
                    className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[10px] font-bold text-red-500 disabled:opacity-50"
                  >
                    제거
                  </button>
                ) : null}
              </div>
            </div>
          </div>
          <input
            ref={sealInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void runUpload('seal', file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      {!companyId ? (
        <p className="mt-2 text-[10px] font-semibold text-amber-600">
          신규 회사는 먼저 저장한 뒤, 수정 화면에서 로고·직인을 등록해 주세요.
        </p>
      ) : null}
    </section>
  );
}
