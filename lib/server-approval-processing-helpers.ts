/**
 * 결재 최종 후처리(processFinalApprovalEffects)용 순수 헬퍼.
 * server-approval-processing.ts 비대화를 줄이기 위해 분리 (phase 8-D TODO 일부).
 */

import { leaveTypeToAttendanceStatus } from '@/lib/leave-type';

/**
 * server_processing 완료 상태로 취급하는 값 (재실행 시 side effect 금지).
 *
 * 예전에는 여기에 'completed_with_warnings' 도 들어 있었다. 후속 처리 8개 블록은
 * 각각 try/catch 로 실패를 warnings 에만 담고 마지막에 그 값을 기록하는데,
 * 그것이 "완료" 로 취급되니 **연차 차감·인사명령 반영이 실패한 문서가 그대로 완료로
 * 굳어 재시도 자체가 불가능**했다. 되돌리거나 실패 단계만 다시 돌리는 크론·관리자
 * 경로도 저장소에 없었다. 이제 재시도 가능한 실패는 'failed_partial' 로 남기고,
 * 재실행 시 steps 에 이미 있는 단계만 건너뛴다.
 */
const DONE_SERVER_PROCESSING_STATUSES = new Set(['completed']);

/** 재시도 가능한 부분 실패 상태. DONE 집합에 넣지 않는다. */
export const PARTIAL_FAILURE_SERVER_PROCESSING_STATUS = 'failed_partial';

/**
 * 'processing' 마커를 중복 실행 차단으로 취급할 시간(ms).
 *
 * 동시에 들어온 두 번째 요청은 첫 요청이 남긴 'processing' 마커를 보고 물러나야
 * 하지만, 처리 도중 프로세스가 죽으면 마커가 영구히 남는다. 그래서 "방금 시작한"
 * 것만 in-flight 로 보고 그 이후에는 재시도를 허용한다.
 */
const PROCESSING_MARKER_TTL_MS = 2 * 60 * 1000;

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

  let done = Boolean(processedAt && lifecycleStatus && DONE_SERVER_PROCESSING_STATUSES.has(lifecycleStatus));

  // 방금 시작해 아직 돌고 있는 처리는 "완료" 로 보고 두 번째 요청을 물린다.
  // 동시 승인 두 건이 모두 후속 처리를 돌려 증명서·인사이력이 2행씩 생기던 경로다.
  if (!done && lifecycleStatus === 'processing') {
    const startedAtRaw = lifecycle?.started_at != null ? String(lifecycle.started_at) : '';
    const startedAt = startedAtRaw ? Date.parse(startedAtRaw) : Number.NaN;
    if (Number.isFinite(startedAt) && Date.now() - startedAt < PROCESSING_MARKER_TTL_MS) {
      done = true;
      return { done, processedAt: null, lifecycleStatus };
    }
  }

  return {
    done,
    processedAt: done ? processedAt : null,
    lifecycleStatus,
  };
}

/**
 * 후속처리 멱등 마커를 approval_history 한 행으로도 남기는 이유.
 *
 * 마커가 `meta_data.server_processing` 안에만 있어서, **meta_data 를 통째로 새로
 * 쓰면 마커가 사라지고 이미 집행된 문서가 재집행**됐다(10차 DLT-01 ②).
 * meta_data 는 게이트웨이(/api/d1/mutate)로 비관리자도 쓸 수 있는 컬럼이지만
 * approval_history 는 UNCLASSIFIED_ADMIN_ONLY_TABLES 라 게이트웨이로는
 * 관리자만 쓸 수 있다(lib/db/auth/policies.ts). 그래서 지울 수 없는 자리에
 * 마커를 하나 더 둔다 — meta_data 마커는 기존 화면·이력 표시가 쓰므로 그대로 둔다.
 *
 * 운영에 별도 컬럼을 새로 만들지 않은 이유: approvals 에 쓸 수 있는 여분 컬럼이
 * 없고(2026-08-27 PRAGMA 확인), 운영 DDL 변경은 이번 범위 밖이다.
 * approval_history 테이블은 운영에 이미 존재한다(행 0개).
 */
export const SERVER_PROCESSING_HISTORY_ACTION_DONE = 'server_processing_completed';
export const SERVER_PROCESSING_HISTORY_ACTION_PARTIAL = 'server_processing_partial';

/** 결재 1건당 마커 1행. 결정적 id 라 재실행해도 행이 늘지 않는다. */
export function buildServerProcessingHistoryId(approvalId: unknown): string {
  return `srvproc-${String(approvalId ?? '').trim()}`;
}

export type ServerProcessingHistoryRow = {
  action?: unknown;
  comment?: unknown;
  created_at?: unknown;
};

/**
 * approval_history 마커 행 해석.
 * - action 이 completed 면 재집행 금지(done)
 * - partial 이면 재시도 허용하되 이미 성공한 단계는 건너뛴다
 */
export function parseServerProcessingHistoryRow(row: ServerProcessingHistoryRow | null | undefined): {
  done: boolean;
  processedAt: string | null;
  steps: string[];
} {
  if (!row) return { done: false, processedAt: null, steps: [] };

  const action = String(row.action ?? '').trim();
  let steps: string[] = [];
  let processedAt: string | null = null;

  if (typeof row.comment === 'string' && row.comment.length > 0) {
    try {
      const parsed = JSON.parse(row.comment) as Record<string, unknown> | null;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if (Array.isArray(parsed.steps)) {
          steps = Array.from(
            new Set(parsed.steps.map((step) => String(step ?? '').trim()).filter(Boolean)),
          );
        }
        if (parsed.processed_at != null && String(parsed.processed_at).trim()) {
          processedAt = String(parsed.processed_at);
        }
      }
    } catch {
      // 손상된 comment 는 무시 — 마커 존재 여부(action)만으로 판정한다.
    }
  }

  if (!processedAt && row.created_at != null && String(row.created_at).trim()) {
    processedAt = String(row.created_at);
  }

  return {
    done: action === SERVER_PROCESSING_HISTORY_ACTION_DONE,
    processedAt: action === SERVER_PROCESSING_HISTORY_ACTION_DONE ? processedAt : null,
    steps,
  };
}

/**
 * 직전 시도에서 이미 성공한 후속 처리 단계 목록.
 * 부분 실패 재시도 시 성공한 단계를 다시 실행해 중복 부작용을 내지 않기 위해 쓴다.
 */
export function getCompletedProcessingSteps(metaData: unknown): string[] {
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

  const steps = lifecycle?.steps;
  if (!Array.isArray(steps)) return [];
  return Array.from(new Set(steps.map((step) => String(step || '').trim()).filter(Boolean)));
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
