'use client';
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getStaffLikeId, resolveStaffLike } from '@/lib/staff-identity';
import { formatProfileRequestDateTime, getProfileRequestStatusMeta, summarizeProfileRequestFields } from './format-utils';

const PROFILE_REQUEST_TARGET_TYPES = [
  'ESS_PROFILE_UPDATE_PENDING',
  'ESS_PROFILE_UPDATE_APPROVED',
  'ESS_PROFILE_UPDATE_REJECTED',
] as const;

export function ProfileChangeRequestHistory({ user: rawUser }: { user: Record<string, unknown> }) {
  const [requests, setRequests] = useState<Record<string, unknown>[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const resolvedUser = await resolveStaffLike(rawUser);
      const staffId = getStaffLikeId(resolvedUser);
      if (!staffId) {
        if (!cancelled) setRequests([]);
        return;
      }

      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, target_type, created_at, details')
        .in('target_type', [...PROFILE_REQUEST_TARGET_TYPES])
        .eq('target_id', String(staffId))
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('프로필 변경 요청 이력 로드 실패:', error);
        if (!cancelled) setRequests([]);
        return;
      }

      if (!cancelled) {
        setRequests(Array.isArray(data) ? (data as Record<string, unknown>[]) : []);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [rawUser]);

  if (requests === null) {
    return (
      <div className="bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5 text-[12px] text-[var(--toss-gray-3)] font-semibold">
        변경 요청 이력을 불러오는 중입니다...
      </div>
    );
  }

  return (
    <div className="bg-[var(--muted)] border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold text-[var(--toss-gray-3)] uppercase tracking-widest">
            내정보 변경 요청
          </p>
          <p className="text-[13px] font-bold text-[var(--foreground)] mt-1">
            최근 요청 상태를 확인할 수 있습니다.
          </p>
        </div>
        <span className="text-[11px] font-semibold text-[var(--toss-gray-3)]">
          최근 {requests.length}건
        </span>
      </div>

      {requests.length === 0 ? (
        <p className="text-[12px] text-[var(--toss-gray-4)]">최근 내정보 변경 요청이 없습니다.</p>
      ) : (
        <div className="space-y-2.5">
          {requests.map((request) => {
            const statusMeta = getProfileRequestStatusMeta(request.target_type);
            const changedFields = summarizeProfileRequestFields(request.details);
            return (
              <div
                key={String(request.id)}
                className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${statusMeta.className}`}>
                    {statusMeta.label}
                  </span>
                  <span className="text-[11px] text-[var(--toss-gray-4)]">
                    {formatProfileRequestDateTime(request.created_at)}
                  </span>
                </div>
                <p className="text-[12px] font-semibold text-[var(--foreground)]">
                  {changedFields.length > 0 ? changedFields.join(', ') : '변경 항목 확인'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
