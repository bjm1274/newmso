'use client';

import type { StaffMember } from '@/types';

type MessengerAvatarProps = {
  name?: string | null;
  photoUrl?: string | null;
  className: string;
  imageClassName?: string;
  decorative?: boolean;
  alt?: string;
  fallbackText?: string;
};

export function MessengerAvatar({
  name,
  photoUrl,
  className,
  imageClassName = '',
  decorative = false,
  alt,
  fallbackText,
}: MessengerAvatarProps) {
  const resolvedName = String(name || '').trim();
  const resolvedAlt = decorative
    ? ''
    : alt || (resolvedName ? `${resolvedName} 프로필 사진` : '프로필 사진');
  const fallback = String(fallbackText || resolvedName || '?').trim().slice(0, 1) || '?';

  return (
    <div className={className}>
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={resolvedAlt}
          className={`h-full w-full object-cover ${imageClassName}`.trim()}
          loading="lazy"
        />
      ) : (
        fallback
      )}
    </div>
  );
}

export function buildMessengerImageAlt(fileName: string | null | undefined, fallback: string): string {
  const resolvedName = String(fileName || '').trim();
  return resolvedName || fallback;
}

type MessengerStatusUserRowProps = {
  staff: StaffMember;
  tone?: 'default' | 'success';
};

export function MessengerStatusUserRow({
  staff,
  tone = 'default',
}: MessengerStatusUserRowProps) {
  const containerClass =
    tone === 'success'
      ? 'flex items-center gap-3 rounded-xl bg-[var(--tab-bg)] p-2 dark:bg-zinc-800/30'
      : 'flex items-center gap-3 rounded-xl bg-[var(--tab-bg)] p-2 dark:bg-zinc-800/30';
  const avatarClass =
    tone === 'success'
      ? 'h-7 w-7 overflow-hidden rounded-lg bg-emerald-100 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/30'
      : 'h-7 w-7 overflow-hidden rounded-lg bg-[var(--tab-bg)] text-[10px] font-bold text-[var(--toss-gray-3)] dark:bg-zinc-700';

  return (
    <div className={containerClass}>
      <MessengerAvatar
        name={staff.name}
        photoUrl={staff.photo_url}
        className={avatarClass}
        decorative
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-bold text-foreground">{staff.name}</p>
        <p className="truncate text-[9px] font-bold text-[var(--toss-gray-3)]">
          {[staff.department, staff.position].filter(Boolean).join(' · ')}
        </p>
      </div>
    </div>
  );
}
