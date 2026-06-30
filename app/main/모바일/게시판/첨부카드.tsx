'use client';

/**
 * 게시판 상세 첨부 — 이미지(인라인) / 파일(카드).
 * 게시판상세.tsx에서 분리 (JM 500줄 규율).
 * JM: 단일 책임, JM6: button + aria-label
 */

import { useMemo } from 'react';
import MIcon from '../공통/MIcon';
import type { SafeAttachment } from './data-hooks';
import { buildStorageInlineUrl } from '@/lib/object-storage-url';

export function AttachmentRow({
  attachment,
  onOpen,
  onDownload }: {
  attachment: SafeAttachment;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const ext = (attachment.name.split('.').pop() || '').toUpperCase();
  const sizeLabel = attachment.size && attachment.size > 0
    ? attachment.size > 1024 * 1024
      ? `${(attachment.size / 1024 / 1024).toFixed(1)}MB`
      : `${Math.max(1, Math.round(attachment.size / 1024))}KB`
    : '';
  return (
    <div
      style={{
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        borderBottom: '1px solid var(--m-border)' }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${attachment.name} 열기`}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left' }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: 'var(--m-accent-soft)',
            color: 'var(--m-accent)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0 }}
        >
          <MIcon name="fileText" size={18} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis' }}
          >
            {attachment.name}
          </span>
          {(sizeLabel || ext) && (
            <span style={{ display: 'block', fontSize: 11, color: 'var(--z-500)', marginTop: 1 }}>
              {[sizeLabel, ext].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      </button>
      <button
        type="button"
        onClick={onDownload}
        aria-label={`${attachment.name} 다운로드`}
        style={{ padding: 6, color: 'var(--z-500)' }}
      >
        <MIcon name="download" size={18} />
      </button>
    </div>
  );
}

export function ImageAttachment({
  attachment,
  onOpen }: {
  attachment: SafeAttachment;
  onOpen: () => void;
}) {
  const inlineUrl = useMemo(
    () => buildStorageInlineUrl(attachment.url, attachment.name),
    [attachment.url, attachment.name],
  );
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${attachment.name} 크게 보기`}
      style={{
        display: 'block',
        width: '100%',
        marginBottom: 8,
        padding: 0,
        border: 'none',
        background: 'transparent' }}
    >
      <img
        src={inlineUrl}
        alt={attachment.name}
        loading="lazy"
        style={{
          width: '100%',
          maxWidth: '100%',
          height: 'auto',
          borderRadius: 12,
          display: 'block',
          background: 'var(--m-bg)' }}
      />
    </button>
  );
}
