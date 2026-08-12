import type { TemplateDesign, PreviewRow } from './types';
import { DEFAULT_LOGO_URL } from './design-utils';
import { resolveBrandAssetSrc } from '@/lib/company-brand-assets';

type Props = {
  design: TemplateDesign;
  sourceName: string;
  identityRows: PreviewRow[];
  statement: string;
  detailRows: PreviewRow[];
  dateLabel: string;
  documentNumber: string;
};

export default function DocumentPreviewCanvas({
  design,
  sourceName,
  identityRows,
  statement,
  detailRows,
  dateLabel,
  documentNumber }: Props) {
  return (
    <div className="mt-5 flex min-h-[700px] items-center justify-center rounded-[var(--radius-xl)] border border-[var(--border)] bg-[#dde4e8] px-5 py-5">
      <div
        className="relative aspect-[210/297] w-full max-w-[430px] overflow-hidden bg-[var(--card)] shadow-[0_28px_70px_rgba(15,23,42,0.14)]"
        style={{
          border: `1px solid ${design.borderColor || '#d5dce4'}`,
          boxShadow: '0 28px 70px rgba(15,23,42,0.14), 0 0 0 1px rgba(255,255,255,0.85) inset' }}
      >
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#fdfefe_76%,#f5f8fa_100%)]" />
        {design.showBackgroundLogo !== false && design.backgroundLogoUrl && (
          <img
            src={resolveBrandAssetSrc(design.backgroundLogoUrl)}
            alt=""
            className="absolute left-1/2 top-[50%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 object-contain mix-blend-multiply"
            style={{ opacity: design.backgroundLogoOpacity ?? 0.055 }}
          />
        )}

        <div className="relative z-10 flex h-full flex-col px-5 py-5 text-[#1f2937]">
          <div className="flex items-start gap-4">
            <div
              className="flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--card)]"
              style={{ border: `1px solid ${design.borderColor || '#d5dce4'}` }}
            >
              <img src={resolveBrandAssetSrc(design.backgroundLogoUrl) || DEFAULT_LOGO_URL} alt="" className="h-10 w-10 object-contain" />
            </div>
            <div className="min-w-0 flex-1 pt-1">
              <h4 className="mt-1 text-[26px] font-black tracking-[-0.04em] text-[var(--foreground)]">
                {design.title || sourceName}
              </h4>
            </div>
          </div>

          <div className="mt-4 h-[3px] w-full" style={{ backgroundColor: design.primaryColor || '#2d93a8' }} />

          <div className="mt-4 shrink-0 grid grid-cols-[74px_1fr] gap-3">
            <div>
              <div
                className="overflow-hidden rounded bg-[#eef2f6]"
                style={{ border: `1px solid ${design.borderColor || '#d5dce4'}` }}
              >
                <div className="flex aspect-[3/4] items-center justify-center text-[34px] font-black text-[var(--toss-gray-3)]">
                  홍
                </div>
              </div>
              <p className="mt-1 text-center text-[8px] font-medium text-[var(--toss-gray-3)]">사진</p>
            </div>

            <div className="space-y-1 pt-0.5">
              {identityRows.map((row, index) => (
                <div
                  key={row.label}
                  className={`grid grid-cols-[42px_8px_1fr] gap-1.5 ${index < identityRows.length - 1 ? 'border-b pb-1.5' : ''}`}
                  style={{ borderColor: design.borderColor || '#d5dce4' }}
                >
                  <span className="text-[9px] font-bold text-[var(--foreground)]">{row.label}</span>
                  <span className="text-[9px] font-bold text-[var(--foreground)]">:</span>
                  <span className="text-[9px] font-medium leading-[1.35] text-[var(--toss-gray-5)]">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div
            className="mt-4 shrink-0 border-t pt-4 text-center"
            style={{ borderColor: design.borderColor || '#d5dce4' }}
          >
            <p className="mx-auto max-w-[290px] text-[11px] leading-[1.75] text-[var(--toss-gray-5)]">
              {statement}
            </p>
          </div>

          <div
            className="mt-4 shrink-0 overflow-hidden bg-[var(--card)]"
            style={{
              borderTop: `2px solid ${design.primaryColor || '#2d93a8'}`,
              borderBottom: `2px solid ${design.primaryColor || '#2d93a8'}` }}
          >
            {detailRows.map((row, index) => (
              <div
                key={row.label}
                className={`grid grid-cols-[74px_10px_1fr] gap-2 px-3 py-2.5 ${index < detailRows.length - 1 ? 'border-b' : ''}`}
                style={{ borderColor: design.borderColor || '#d5dce4' }}
              >
                <span className="text-[10px] font-bold text-[var(--foreground)]">{row.label}</span>
                <span className="text-[10px] font-bold text-[var(--foreground)]">:</span>
                <span className="text-[10px] font-medium leading-[1.65] text-[var(--toss-gray-5)]">{row.value}</span>
              </div>
            ))}
          </div>

          <div
            className="mt-4 shrink-0 border-t pt-4 text-center"
            style={{ borderColor: design.borderColor || '#d5dce4' }}
          >
            <div className="space-y-1 text-[10px] text-[var(--toss-gray-4)]">
              <p>{dateLabel} 2026년 3월 13일</p>
              <p>발급번호 {documentNumber}</p>
            </div>
            <div className="mt-4 flex justify-center">
              <div className="relative inline-flex items-end pr-8">
                <p className="text-[24px] font-black tracking-[-0.03em] text-[var(--foreground)]">
                  {design.companyLabel || 'SY INC.'}
                </p>
              </div>
              {design.showSeal !== false && (
                <div className="-ml-8 relative z-10 flex h-[72px] w-[72px] items-center justify-center text-center text-[10px] font-black leading-4 text-[#b42318]">
                  {design.sealImageUrl ? (
                    <img
                      src={resolveBrandAssetSrc(design.sealImageUrl)}
                      alt=""
                      className="h-full w-full object-contain mix-blend-multiply"
                    />
                  ) : (
                    <>
                      회사
                      <br />
                      직인
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
