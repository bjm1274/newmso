'use client';

/**
 * AttachmentsSection / AttachmentCard — 결재 상세 양식 탭의 첨부 inline 보기.
 *
 *  - 이미지: <img> 카드 (max-height 320, lazy)
 *  - 일반파일: 아이콘 + 파일명 + 사이즈 + 다운로드 chevron
 *  - 클릭 시 새 창에서 다운로드 URL 오픈 (R2 public 우선)
 *
 * JM(단일 책임, ~150줄), JM2(useMemo로 다운로드 URL 캐시), JM3(downloadUrl 비어 있으면 toast),
 * JM4(any 금지, ApprovalAttachmentMeta 재사용), JM6(button + aria-label, alt 텍스트)
 */

import { useCallback } from 'react';
import { toast } from '@/lib/toast';
import {
  formatApprovalAttachmentSize,
  type ApprovalAttachmentMeta,
} from '@/lib/approval-report-utils';
import {
  buildStorageDownloadUrl,
  buildStorageInlineUrl,
  extractStorageUrlExtension,
} from '@/lib/object-storage-url';
import MIcon from '../공통/MIcon';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif']);

function isImageAttachment(a: ApprovalAttachmentMeta): boolean {
  const mime = String(a.mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  const ext = extractStorageUrlExtension(a.url || '');
  return IMAGE_EXTS.has(ext);
}

export function AttachmentsSection({ attachments }: { attachments: ApprovalAttachmentMeta[] }) {
  if (attachments.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div
        style={{
          fontSize: 11,
          color: 'var(--z-500)',
          fontWeight: 800,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          padding: '0 4px 6px',
        }}
      >
        첨부 {attachments.length}건
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {attachments.map((a, idx) => (
          <AttachmentCard key={`${a.url}-${idx}`} attachment={a} />
        ))}
      </div>
    </div>
  );
}

function AttachmentCard({ attachment }: { attachment: ApprovalAttachmentMeta }) {
  const isImage = isImageAttachment(attachment);
  const downloadUrl = buildStorageDownloadUrl(attachment.url, attachment.name);
  const inlineUrl = isImage ? buildStorageInlineUrl(attachment.url, attachment.name) : '';
  const sizeLabel = formatApprovalAttachmentSize(attachment.size);

  const handleDownload = useCallback(() => {
    if (!downloadUrl) {
      toast('다운로드 링크를 만들 수 없습니다.', 'error');
      return;
    }
    if (typeof window !== 'undefined') {
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    }
  }, [downloadUrl]);

  if (isImage && inlineUrl) {
    return (
      <button
        type="button"
        className="m-card"
        onClick={handleDownload}
        aria-label={`이미지 첨부 ${attachment.name} 다운로드`}
        style={{ padding: 0, overflow: 'hidden', textAlign: 'left', width: '100%' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={inlineUrl}
          alt={attachment.name}
          loading="lazy"
          style={{
            display: 'block',
            width: '100%',
            maxHeight: 320,
            objectFit: 'cover',
            background: 'var(--m-bg)',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
          <div className="ico-tile tone-accent" style={{ width: 32, height: 32 }}>
            <MIcon name="image" size={16} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: 'var(--z-900)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {attachment.name}
            </div>
            {sizeLabel && (
              <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 1 }}>
                {sizeLabel}
              </div>
            )}
          </div>
          <MIcon name="download" size={18} color="var(--z-500)" />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="m-card"
      onClick={handleDownload}
      aria-label={`첨부 ${attachment.name} 다운로드`}
      style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        textAlign: 'left',
        width: '100%',
      }}
    >
      <div className="ico-tile tone-accent" style={{ width: 40, height: 40 }}>
        <MIcon name="fileText" size={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: 'var(--z-900)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {attachment.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--z-500)', fontWeight: 600, marginTop: 2 }}>
          {[attachment.mimeType || '파일', sizeLabel].filter(Boolean).join(' · ')}
        </div>
      </div>
      <MIcon name="chevR" size={18} color="var(--z-400)" />
    </button>
  );
}
