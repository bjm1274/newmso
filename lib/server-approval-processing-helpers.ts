/**
 * 결재 최종 후처리(processFinalApprovalEffects)용 순수 헬퍼.
 * server-approval-processing.ts 비대화를 줄이기 위해 분리 (phase 8-D TODO 일부).
 */

import { leaveTypeToAttendanceStatus } from '@/lib/leave-type';

/** server_processing 완료 상태로 취급하는 값 (재실행 시 side effect 금지). */
const DONE_SERVER_PROCESSING_STATUSES = new Set(['completed', 'completed_with_warnings']);

/** 결재 문서 상태가 최종 확정(승인/완료)인지. */
export function isFinalizedApprovalStatus(status: unknown): boolean {
  const normalized = String(status || '').trim();
  return normalized === '승인' || normalized === '완료';
}

/**
 * meta_data.server_processing 이 이미 완료 마커를 갖고 있는지 판별.
 * - completed / completed_with_warnings + processed_at 있으면 재처리 금지
 */
export function isFinalApprovalEffectsDone(metaData: unknown): {
  done: boolean;
  processedAt: string | null;
  lifecycleStatus: string | null;
} {
  const meta =
    metaData && typeof metaData === 'object' && !Array.isArray(metaData)
      ? (metaData as Record<string, unknown>)
      : null;
  const lifecycle =
    meta?.server_processing &&
    typeof meta.server_processing === 'object' &&
    !Array.isArray(meta.server_processing)
      ? (meta.server_processing as Record<string, unknown>)
      : null;

  const lifecycleStatus = lifecycle?.status != null ? String(lifecycle.status).trim() : null;
  const processedAt =
    lifecycle?.processed_at != null && String(lifecycle.processed_at).trim()
      ? String(lifecycle.processed_at)
      : null;

  const done = Boolean(processedAt && lifecycleStatus && DONE_SERVER_PROCESSING_STATUSES.has(lifecycleStatus));

  return {
    done,
    processedAt: done ? processedAt : null,
    lifecycleStatus,
  };
}

export function normalizeLeaveAttendanceStatus(leaveTypeValue: unknown) {
  const modern = leaveTypeToAttendanceStatus(leaveTypeValue);
  if (modern === 'sick_leave') {
    return { legacy: '병가', modern: 'sick_leave' as const };
  }
  if (modern === 'half_leave') {
    return { legacy: '반차휴가', modern: 'half_leave' as const };
  }
  return { legacy: '연차휴가', modern: 'annual_leave' as const };
}

export function resolveAttendanceCorrectionStatusPair(correctionTypeValue: string) {
  const statusMap: Record<string, { att: string; atts: string }> = {
    정상반영: { att: '정상', atts: 'present' },
    지각처리: { att: '지각', atts: 'late' },
    결근처리: { att: '결근', atts: 'absent' },
  };

  return statusMap[correctionTypeValue] || statusMap['정상반영'];
}
