'use client';

// 메신저.tsx에서 추출한 구성원 상세 정보 모달 + 근태 표시 헬퍼.
// 순수 프레젠테이션/유틸만 포함하며 동작은 원본과 동일하다.

import { getProfilePhotoUrl } from '@/lib/profile-photo';
import ProfilePhotoThumbnail from '@/app/components/ProfilePhotoThumbnail';
import { getStaffExtensionText } from '../조직도서브/org-chart-types';
import type { StaffMember } from '@/types';

export type PresenceState = 'working' | 'checked_out' | 'before_work';

export type PresenceMeta = {
  state: PresenceState;
  label: string;
  toneClass: string;
  dotClass: string;
  checkInLabel: string | null;
  checkOutLabel: string | null;
};

export interface AttendanceSnapshot {
  staff_id: string;
  date?: string | null;
  work_date?: string | null;
  check_in?: string | null;
  check_out?: string | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  status?: string | null;
}

function normalizeText(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value).trim();
  }
  return '';
}

function formatClockLabel(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(text)) return text.slice(0, 5);
  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    return new Intl.DateTimeFormat('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Seoul',
    }).format(new Date(parsed));
  }
  return text.length >= 16 && text[10] === 'T' ? text.slice(11, 16) : text.slice(0, 5);
}

function getAttendanceCheckIn(attendance?: AttendanceSnapshot | null) {
  return normalizeText(attendance?.check_in) || normalizeText(attendance?.check_in_time) || null;
}

function getAttendanceCheckOut(attendance?: AttendanceSnapshot | null) {
  return normalizeText(attendance?.check_out) || normalizeText(attendance?.check_out_time) || null;
}

export function getPresenceMeta(attendance?: AttendanceSnapshot | null): PresenceMeta {
  const checkInLabel = formatClockLabel(getAttendanceCheckIn(attendance));
  const checkOutLabel = formatClockLabel(getAttendanceCheckOut(attendance));

  if (checkInLabel && !checkOutLabel) {
    return {
      state: 'working',
      label: '근무중',
      toneClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      dotClass: 'bg-emerald-500',
      checkInLabel,
      checkOutLabel: null,
    };
  }

  if (checkInLabel && checkOutLabel) {
    return {
      state: 'checked_out',
      label: '퇴근 완료',
      toneClass: 'border-[var(--border)] bg-[var(--muted)] text-[var(--toss-gray-4)]',
      dotClass: 'bg-[var(--toss-gray-3)]',
      checkInLabel,
      checkOutLabel,
    };
  }

  return {
    state: 'before_work',
    label: '출근 전',
    toneClass: 'border-amber-200 bg-amber-50 text-amber-700',
    dotClass: 'bg-amber-400',
    checkInLabel: null,
    checkOutLabel: null,
  };
}

function getCompanyName(staff: StaffMember) {
  return normalizeText(staff.company) || '회사 미지정';
}

function getDepartmentName(staff: StaffMember) {
  return normalizeText(staff.department) || '부서 미지정';
}

function ModalAvatar({
  staff,
  size = 'md',
  presenceState,
}: {
  staff: StaffMember;
  size?: 'sm' | 'md' | 'lg';
  presenceState?: PresenceState;
}) {
  const sizeClass =
    size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-6 w-6 text-[10px]' : 'h-7 w-7 text-[11px]';
  const palette = [
    'bg-sky-100 text-sky-700',
    'bg-emerald-100 text-emerald-700',
    'bg-violet-100 text-violet-700',
    'bg-amber-100 text-amber-700',
    'bg-rose-100 text-rose-700',
    'bg-cyan-100 text-cyan-700',
  ];
  const name = normalizeText(staff.name) || '?';
  const color = palette[(name.charCodeAt(0) || 0) % palette.length];
  const photoUrl = getProfilePhotoUrl(staff);

  const dotMeta =
    presenceState === 'working'
      ? { cls: 'bg-[#10B981]', label: '현재 근무중' }
      : presenceState === 'before_work'
        ? { cls: 'bg-[#FFC72C]', label: '출근 전' }
        : presenceState === 'checked_out'
          ? { cls: 'bg-slate-400', label: '퇴근 완료' }
          : null;

  return (
    <div className="relative shrink-0">
      <div
        className={`${sizeClass} ${photoUrl ? 'overflow-hidden bg-[var(--tab-bg)]' : color} flex items-center justify-center rounded-full font-bold`}
      >
        {photoUrl ? (
          <ProfilePhotoThumbnail
            src={photoUrl}
            alt={`${name} 프로필 사진`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          name[0]
        )}
      </div>
      {dotMeta ? (
        <span
          className={`absolute -bottom-0.5 -right-0.5 ${size === 'lg' ? 'h-3.5 w-3.5 border-[2px]' : 'h-2.5 w-2.5 border-2'} rounded-full border-white shadow-sm ${dotMeta.cls}`}
          aria-label={dotMeta.label}
        />
      ) : null}
    </div>
  );
}

function ModalPresenceBadge({ presence, compact = false, testId }: { presence: PresenceMeta; compact?: boolean; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1 rounded-full border font-bold ${presence.toneClass} ${
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2.5 py-1 text-[10px]'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${presence.dotClass}`} />
      {presence.label}
    </span>
  );
}

function ModalInfoRow({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div data-testid={testId} className="flex items-center justify-between gap-4 py-2.5">
      <span className="text-sm font-semibold text-[var(--toss-gray-3)]">{label}</span>
      <span className="text-right text-sm font-bold text-[var(--foreground)]">{value}</span>
    </div>
  );
}

interface StaffDetailModalProps {
  staff: StaffMember | null;
  presence: PresenceMeta | null;
  isLoadingPresence: boolean;
  onClose: () => void;
}

export function StaffDetailModal({ staff, presence, isLoadingPresence, onClose }: StaffDetailModalProps) {
  if (!staff) return null;
  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end justify-center bg-slate-950/45 backdrop-blur-sm md:items-center md:p-6"
    >
      <div
        className="w-full max-w-md rounded-t-[32px] bg-[var(--card)] p-6 shadow-2xl md:rounded-[32px] animate-in slide-in-from-bottom md:zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4">
          <ModalAvatar staff={staff} size="lg" presenceState={presence?.state} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <p className="truncate text-[22px] font-black text-[var(--foreground)] tracking-tight leading-none">{normalizeText(staff.name)}</p>
              {presence ? (
                <ModalPresenceBadge
                  presence={presence}
                  testId="org-staff-modal-presence"
                />
              ) : isLoadingPresence ? (
                <span className="text-[10px] font-bold text-[var(--toss-gray-3)]">로딩 중…</span>
              ) : null}
            </div>
            <p className="mt-1.5 truncate text-[14px] font-bold text-[var(--toss-gray-3)]">{normalizeText(staff.position) || '직급 미지정'}</p>
          </div>
        </div>

        <div className="mt-5 divide-y divide-[var(--border)]/60 rounded-[24px] border border-[var(--border)] bg-[var(--page-bg)] px-5 py-2.5">
          {presence ? (
            <ModalInfoRow
              testId="org-staff-modal-presence-row"
              label="근무 상태"
              value={[
                presence.label,
                presence.checkInLabel ? `출근 ${presence.checkInLabel}` : null,
                presence.checkOutLabel ? `퇴근 ${presence.checkOutLabel}` : null,
              ].filter(Boolean).join(' · ')}
            />
          ) : (
            <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <span className="font-semibold text-[var(--toss-gray-3)]">근무 상태</span>
              <span className="font-bold text-[var(--foreground)]">{isLoadingPresence ? '확인 중…' : '출근 전'}</span>
            </div>
          )}
          <ModalInfoRow label="회사" value={getCompanyName(staff)} />
          <ModalInfoRow label="부서" value={getDepartmentName(staff)} />
          <ModalInfoRow label="사번" value={normalizeText(staff.employee_no) || '-'} />
          <ModalInfoRow label="내선" value={getStaffExtensionText(staff) || normalizeText(staff.extension) || '-'} />
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-[18px] bg-[#1B64F2] py-4 text-base font-bold text-white transition hover:bg-[#1557b0] active:scale-[0.98] duration-150 shadow-sm"
        >
          닫기
        </button>
      </div>
    </div>
  );
}
