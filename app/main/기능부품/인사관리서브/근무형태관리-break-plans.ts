// 휴게 플랜(A·B·C…) 정의 및 요일별 휴게 플랜 매핑 유틸리티
// 근무형태관리.tsx 에서 분리: 휴게시간을 단일 값이 아닌 여러 플랜으로 관리하고
// 요일별로 어떤 플랜을 적용할지 선택할 수 있게 한다.
//
// id 는 위치 기반 라벨('A','B','C'…)로 결정적으로 부여한다.
// 동일한 근무형태가 여러 사업체에 적용될 때 그룹키가 일치하려면 id 가
// 콘텐츠로부터 결정적으로 도출되어야 하기 때문이다.

export type BreakPlan = {
  id: string; // 'A' | 'B' | 'C' … (요일 스케줄의 break_plan_id 가 이 값을 참조)
  start_time: string; // 'HH:MM'
  end_time: string; // 'HH:MM'
};

const BREAK_PLAN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;
export const MAX_BREAK_PLANS = BREAK_PLAN_LABELS.length;

function normalizeTime(value: unknown, fallback: string): string {
  const time = String(value ?? '').slice(0, 5);
  return /^\d{2}:\d{2}$/.test(time) ? time : fallback;
}

export function indexToBreakPlanLabel(index: number): string {
  return BREAK_PLAN_LABELS[index] ?? `#${index + 1}`;
}

export function createBreakPlan(index: number, start = '12:00', end = '13:00'): BreakPlan {
  return {
    id: indexToBreakPlanLabel(index),
    start_time: normalizeTime(start, '12:00'),
    end_time: normalizeTime(end, '13:00'),
  };
}

// 저장된 배열을 정규화. id 는 위치 기반으로 재부여해 항상 결정적이게 만든다.
export function normalizeBreakPlans(input: unknown): BreakPlan[] {
  if (!Array.isArray(input)) return [];
  const plans: BreakPlan[] = [];
  for (const raw of input) {
    if (plans.length >= MAX_BREAK_PLANS) break;
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    plans.push(createBreakPlan(plans.length, normalizeTime(record.start_time, '12:00'), normalizeTime(record.end_time, '13:00')));
  }
  return plans;
}

// 플랜 목록의 id 를 위치 기준으로 다시 매긴다(삭제 후 재번호용).
// 반환: 재번호된 목록 + 이전 id → 새 id 매핑
export function reindexBreakPlans(plans: BreakPlan[]): { plans: BreakPlan[]; idMap: Map<string, string> } {
  const idMap = new Map<string, string>();
  const reindexed = plans.slice(0, MAX_BREAK_PLANS).map((plan, index) => {
    const next = createBreakPlan(index, plan.start_time, plan.end_time);
    idMap.set(plan.id, next.id);
    return next;
  });
  return { plans: reindexed, idMap };
}

export function getBreakPlan(plans: BreakPlan[], id: string | null | undefined): BreakPlan | null {
  if (!id) return null;
  return plans.find((plan) => plan.id === id) ?? null;
}

export function canAddBreakPlan(plans: BreakPlan[]): boolean {
  return plans.length < MAX_BREAK_PLANS;
}

// 레거시 데이터(work_shifts.break_start_time/break_end_time 단일 컬럼)를
// 휴게 플랜 배열로 변환. 메타에 break_plans 가 이미 있으면 그대로 사용한다.
export function deriveBreakPlans(
  metaBreakPlans: unknown,
  legacyBreakStart?: string | null,
  legacyBreakEnd?: string | null,
): BreakPlan[] {
  const normalized = normalizeBreakPlans(metaBreakPlans);
  if (normalized.length > 0) return normalized;

  const start = normalizeTime(legacyBreakStart, '');
  const end = normalizeTime(legacyBreakEnd, '');
  if (start && end) {
    return [createBreakPlan(0, start, end)];
  }
  return [];
}

// 요일 스케줄의 break_plan_id 를 결정한다.
// - 신형식(break_plan_id) 우선: 존재하는 플랜이면 그대로, 사라진 플랜이면 첫 플랜으로 대체
// - 명시적 null 이면 '휴게 없음' 유지
// - 레거시 apply_break 플래그: true → 첫 플랜, false → 없음
// - 둘 다 없으면(아주 오래된 데이터) 첫 플랜 (과거엔 휴게가 전 요일에 적용됐으므로)
export function resolveDayBreakPlanId(
  current: { break_plan_id?: unknown; apply_break?: unknown } | null | undefined,
  plans: BreakPlan[],
): string | null {
  const firstPlanId = plans[0]?.id ?? null;
  if (current && 'break_plan_id' in current) {
    const id = current.break_plan_id;
    if (id === null) return null;
    if (typeof id === 'string') {
      return plans.some((plan) => plan.id === id) ? id : firstPlanId;
    }
  }
  if (current && 'apply_break' in current) {
    return current.apply_break ? firstPlanId : null;
  }
  return firstPlanId;
}
