/**
 * 결재(전자결재) 공용 순수 유틸 — cross-lib 4중 중복 통합.
 *
 * 서버(lib/server-approval-transition.ts, app/api/approvals/process-final/route.ts)와
 * 클라이언트 훅(전자결재서브/*), 대시보드 유틸(마이페이지/역할별대시보드/format-utils.ts)에
 * 독립 정의되던 순수 함수들을 한곳으로 모음.
 *
 * 주의: `user`/`actor`를 캡처하던 useCallback 클로저는 순수하지 않으므로 여기로 옮기지 않는다.
 *       대신 순수 "코어"만 제공하고, 각 클로저가 자신의 actor 식별자를 인자로 넘겨 코어를 호출한다.
 */

import { resolveApprovalDelegateConfig } from '@/lib/approval-workflow';

type ApprovalLike = Record<string, unknown>;

/**
 * 결재선(approver_line) 값을 string id 배열로 정규화 (중복 제거).
 * - 문자열/숫자 → String 변환
 * - { id } 객체 → id 추출
 * - 그 외/null → 제외
 * (trim 없음: server-approval-transition / format-utils / useApprovalRouting 의 다수 동작과 동일)
 */
export function normalizeApprovalLineIds(line: unknown): string[] {
  if (!Array.isArray(line)) return [];
  const ids = line
    .map((entry) => {
      if (entry == null) return null;
      if (typeof entry === 'string' || typeof entry === 'number') return String(entry);
      if (
        typeof entry === 'object' &&
        entry !== null &&
        'id' in entry &&
        (entry as ApprovalLike).id != null
      ) {
        return String((entry as ApprovalLike).id);
      }
      return null;
    })
    .filter(Boolean) as string[];
  return Array.from(new Set(ids));
}

/**
 * 결재 항목에서 결재선 id 목록을 해석.
 * approver_line(또는 meta_data.approver_line) 우선, 없으면 current_approver_id 단일 사용.
 */
export function resolveApprovalLineIds(item: ApprovalLike): string[] {
  const metaData = item?.meta_data as ApprovalLike | null | undefined;
  const explicitLineIds = normalizeApprovalLineIds(item?.approver_line ?? metaData?.approver_line);
  if (explicitLineIds.length > 0) return explicitLineIds;
  if (item?.current_approver_id != null) return [String(item.current_approver_id)];
  return [];
}

/**
 * 저장된 "현재 결재자" id 해석.
 * 위임(delegated_to/from)이 적용된 경우, 위임 받은 사람이 현재 결재자라면 위임 보낸 원본 id를 돌려준다.
 */
export function resolveStoredCurrentApproverId(item: ApprovalLike): string | null {
  const metaData = item?.meta_data as ApprovalLike | null | undefined;
  if (item?.current_approver_id != null) {
    const currentApproverId = String(item.current_approver_id);
    const delegatedToId = String(metaData?.delegated_to_id || '');
    const delegatedFromId = String(metaData?.delegated_from_id || '');
    if (delegatedToId && delegatedToId === currentApproverId && delegatedFromId) {
      return delegatedFromId;
    }
    return currentApproverId;
  }

  const lineIds = resolveApprovalLineIds(item);
  return lineIds[0] ?? null;
}

/**
 * 위임 설정을 반영한 "실효 결재자" id 해석 — 순수 코어.
 * 호출측에서 approverId 에 해당하는 staff/approver 레코드(권한 포함)를 찾아 넘긴다.
 * (server 는 { permissions } 형태로, 클라이언트는 staff 객체를 그대로 넘기는 등 매핑 방식이 달라
 *  matched 레코드 준비는 호출측 책임으로 둔다 — 기존 동작 보존)
 */
export function resolveEffectiveApproverIdCore(
  approverId: string | null | undefined,
  matchedApprover: Record<string, unknown> | null | undefined,
): string | null {
  if (!approverId) return null;
  const delegateConfig = resolveApprovalDelegateConfig(matchedApprover ?? null);
  if (delegateConfig.active && delegateConfig.delegateId) {
    return String(delegateConfig.delegateId);
  }
  return String(approverId);
}

/**
 * 결재 이력 엔트리 생성 — 순수 코어.
 * actor 식별자를 인자로 받으므로 클로저(user 캡처)와 서버(actor context) 양쪽에서 재사용 가능.
 * action 은 호출측 유니온을 그대로 보존하도록 제네릭.
 */
export function buildApprovalHistoryEntryCore<A extends string>(
  actorId: string | null,
  actorName: string | null,
  action: A,
  note?: string | null,
): { action: A; actor_id: string | null; actor_name: string | null; note: string | null } {
  return {
    action,
    actor_id: actorId,
    actor_name: actorName,
    note: note ?? null,
  };
}
