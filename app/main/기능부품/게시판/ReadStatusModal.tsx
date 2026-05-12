'use client';

/**
 * 게시글 읽음 현황 모달
 * - 읽은 직원 / 미확인 직원 목록을 2열로 표시
 * - 모든 데이터는 props로 수신; 내부 state 없음
 */

import type { BoardPost } from '@/types';
import type { StaffSummary } from '../게시판-view-utils';
import { isAnonymousReadStatusPost } from './post-helpers';

interface ReadStatusModalProps {
  post: BoardPost;
  readers: StaffSummary[];
  pending: StaffSummary[];
  loading: boolean;
  onClose: () => void;
}

export default function ReadStatusModal({
  post,
  readers,
  pending,
  loading,
  onClose,
}: ReadStatusModalProps) {
  if (isAnonymousReadStatusPost(post)) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end md:items-center justify-center bg-black/40 p-0 md:p-5"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[80dvh] overflow-y-auto bg-[var(--card)] border-0 md:border border-[var(--border)] rounded-t-[24px] md:rounded-[var(--radius-xl)] shadow-sm p-4 md:p-5 space-y-4 safe-area-pb"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-1">
              읽음 현황
            </p>
            <h3 className="text-lg font-semibold text-[var(--foreground)]">
              {post.title}
            </h3>
            <p className="mt-1 text-[12px] text-[var(--toss-gray-3)] font-medium">
              읽음 {readers.length}명 · 미확인 {pending.length}명
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
          >
            닫기
          </button>
        </div>

        {loading ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)] px-4 py-6 text-center text-sm font-semibold text-[var(--toss-gray-3)]">
            읽음 현황을 불러오는 중입니다.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 읽음 목록 */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[var(--foreground)]">읽음</p>
                <span className="text-xs font-semibold text-emerald-600">{readers.length}명</span>
              </div>
              <div className="space-y-2">
                {readers.length > 0 ? (
                  readers.map((member) => (
                    <div
                      key={`reader-${String(member.id ?? '')}`}
                      className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)]/40 px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-[var(--foreground)]">{member.name || '이름 없음'}</p>
                      <p className="text-[11px] text-[var(--toss-gray-3)] font-medium">
                        {[member.department, member.position].filter(Boolean).join(' · ') || '부서/직급 미지정'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-[12px] font-medium text-[var(--toss-gray-3)]">아직 읽은 직원이 없습니다.</p>
                )}
              </div>
            </div>

            {/* 미확인 목록 */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-[var(--foreground)]">미확인</p>
                <span className="text-xs font-semibold text-amber-600">{pending.length}명</span>
              </div>
              <div className="space-y-2">
                {pending.length > 0 ? (
                  pending.map((member) => (
                    <div
                      key={`pending-${String(member.id ?? '')}`}
                      className="rounded-[var(--radius-md)] bg-amber-50 px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-[var(--foreground)]">{member.name || '이름 없음'}</p>
                      <p className="text-[11px] text-[var(--toss-gray-3)] font-medium">
                        {[member.department, member.position].filter(Boolean).join(' · ') || '부서/직급 미지정'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-[12px] font-medium text-[var(--toss-gray-3)]">모든 대상자가 읽었습니다.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
