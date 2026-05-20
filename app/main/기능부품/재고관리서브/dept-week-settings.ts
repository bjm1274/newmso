/**
 * 부서별 재고 — 주(week) 기반 최소재고 설정 헬퍼
 *
 * - 저장소: LocalStorage (inventory 테이블에 weekly/min_weeks 컬럼이 없어 클라이언트 저장 사용)
 * - 키 구조: `inv_week_settings_v1` → { [department]: { [itemId]: { weeks, weekly } } }
 * - 부서마다 독립 저장 (외래팀=1주, 병동팀=4주 식)
 *
 * JM4: any 금지, unknown 활용. 외부(localStorage) 입력은 안전 파싱.
 * JM3: try/catch 범위는 최소화, 실패 시 빈 기본값으로 graceful fallback.
 */

export type WeekBasis = 1 | 2 | 3 | 4;

export interface ItemWeekSetting {
  weeks: WeekBasis;
  weekly: number; // 주간 평균 소비량 (개/주)
}

export type DeptWeekSettings = Record<string, ItemWeekSetting>; // itemId → setting
export type AllWeekSettings = Record<string, DeptWeekSettings>; // department → ...

const STORAGE_KEY = 'inv_week_settings_v1';
const DEFAULT_WEEKS: WeekBasis = 2;
const DEFAULT_WEEKLY = 0;

/** WeekBasis 가드 — 1·2·3·4만 통과. */
export function isWeekBasis(v: unknown): v is WeekBasis {
  return v === 1 || v === 2 || v === 3 || v === 4;
}

/** unknown → ItemWeekSetting 안전 파싱. 실패 시 기본값. */
function parseItemSetting(raw: unknown): ItemWeekSetting {
  if (!raw || typeof raw !== 'object') {
    return { weeks: DEFAULT_WEEKS, weekly: DEFAULT_WEEKLY };
  }
  const obj = raw as Record<string, unknown>;
  const weeks: WeekBasis = isWeekBasis(obj.weeks) ? obj.weeks : DEFAULT_WEEKS;
  const weeklyRaw = obj.weekly;
  const weekly =
    typeof weeklyRaw === 'number' && Number.isFinite(weeklyRaw) && weeklyRaw >= 0
      ? weeklyRaw
      : DEFAULT_WEEKLY;
  return { weeks, weekly };
}

/** unknown → AllWeekSettings 안전 파싱. */
function parseAllSettings(raw: unknown): AllWeekSettings {
  if (!raw || typeof raw !== 'object') return {};
  const out: AllWeekSettings = {};
  for (const [dept, deptVal] of Object.entries(raw as Record<string, unknown>)) {
    if (!deptVal || typeof deptVal !== 'object') continue;
    const deptMap: DeptWeekSettings = {};
    for (const [itemId, itemVal] of Object.entries(deptVal as Record<string, unknown>)) {
      deptMap[itemId] = parseItemSetting(itemVal);
    }
    out[dept] = deptMap;
  }
  return out;
}

/** LocalStorage에서 전체 설정 로드. SSR 안전 / 실패 시 빈 객체. */
export function loadAllWeekSettings(): AllWeekSettings {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return parseAllSettings(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

/** 특정 부서의 설정 로드. */
export function loadDeptWeekSettings(department: string): DeptWeekSettings {
  const all = loadAllWeekSettings();
  return all[department] || {};
}

/** 특정 부서 설정 저장 (다른 부서는 보존). */
export function saveDeptWeekSettings(department: string, settings: DeptWeekSettings): void {
  if (typeof window === 'undefined' || !department) return;
  try {
    const all = loadAllWeekSettings();
    all[department] = settings;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* 저장 실패는 호출자에게 위임 — UI에서 토스트로 통지 */
  }
}

/** 단일 품목 setting upsert (즉시 LocalStorage 반영). */
export function upsertItemSetting(
  department: string,
  itemId: string,
  patch: Partial<ItemWeekSetting>
): DeptWeekSettings {
  const current = loadDeptWeekSettings(department);
  const prev = current[itemId] || { weeks: DEFAULT_WEEKS, weekly: DEFAULT_WEEKLY };
  const next: ItemWeekSetting = {
    weeks: isWeekBasis(patch.weeks) ? patch.weeks : prev.weeks,
    weekly:
      typeof patch.weekly === 'number' && Number.isFinite(patch.weekly) && patch.weekly >= 0
        ? patch.weekly
        : prev.weekly,
  };
  const updated: DeptWeekSettings = { ...current, [itemId]: next };
  saveDeptWeekSettings(department, updated);
  return updated;
}

/** 품목의 effective setting 조회 (없으면 기본값). */
export function getItemSetting(
  settings: DeptWeekSettings,
  itemId: string
): ItemWeekSetting {
  return settings[itemId] || { weeks: DEFAULT_WEEKS, weekly: DEFAULT_WEEKLY };
}

/** 최소재고 자동 계산: weekly × weeks. */
export function calcMinStock(setting: ItemWeekSetting): number {
  return Math.max(0, Math.round(setting.weekly * setting.weeks));
}

/** 잔여수량 / weekly → 보유 분량(주). weekly 0이면 null. */
export function calcCoverageWeeks(qty: number, weekly: number): number | null {
  if (!weekly || weekly <= 0) return null;
  return qty / weekly;
}
