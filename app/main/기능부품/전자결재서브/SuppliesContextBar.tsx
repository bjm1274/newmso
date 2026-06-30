'use client';

/**
 * 비품구매양식 — 컨텍스트 바
 *
 * - 펄싱 dot + UPPERCASE "신청부서" 라벨 + 부서 selector.
 * - 우측: 임시저장 시각 chip, 재고 0 경고 chip.
 * - 부서 옵션은 props로 받아 재사용성 확보 (코드베이스 hospitalDepts 등과 자유 결합).
 *
 * JM6: select에 aria-label, dot은 aria-hidden, 경고 chip은 role="status".
 */

type SuppliesContextBarProps = {
  requesterDepartment: string;
  inventoryLabel: string;
  /** 부서 옵션. 미제공 시 기본 목록 사용. */
  departmentOptions?: readonly string[];
  /** 부서 변경 핸들러. 미제공 시 readonly. */
  onDepartmentChange?: (next: string) => void;
  draftSavedAt: string | null;
  outOfStockCount: number;
};

const DEFAULT_DEPARTMENT_OPTIONS = [
  'MSO 본사',
  '외래팀',
  '병동팀',
  '검사팀',
  '진료팀',
  '영양팀',
  '경영지원팀',
] as const;

export default function SuppliesContextBar({
  requesterDepartment,
  inventoryLabel,
  departmentOptions = DEFAULT_DEPARTMENT_OPTIONS,
  onDepartmentChange,
  draftSavedAt,
  outOfStockCount }: SuppliesContextBarProps) {
  const readonly = !onDepartmentChange;
  // 부서 옵션에 현재값이 없으면 추가하여 옵션 불일치로 인한 빈 선택 방지.
  const options = (() => {
    if (!requesterDepartment) return departmentOptions;
    if (departmentOptions.includes(requesterDepartment)) return departmentOptions;
    return [requesterDepartment, ...departmentOptions];
  })();

  return (
    <div
      data-testid="supplies-context-bar"
      className="flex flex-col gap-2 border-b border-[var(--accent)]/20 bg-gradient-to-r from-[var(--accent-light)] to-[var(--card)] px-3 py-2.5 md:flex-row md:items-center md:justify-between"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]"
        />
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--accent)]">
          신청부서
        </span>
        {readonly ? (
          <span
            data-testid="supplies-context-department-readonly"
            className="inline-flex min-h-[32px] items-center rounded-[var(--radius-md)] bg-[var(--card)] px-3 text-[12px] font-black text-[var(--foreground)] shadow-sm"
          >
            {inventoryLabel}
          </span>
        ) : (
          <label className="inline-flex items-center gap-2">
            <span className="sr-only">신청부서 선택</span>
            <select
              data-testid="supplies-context-department"
              aria-label="신청부서 선택"
              value={requesterDepartment}
              onChange={(event) => onDepartmentChange?.(event.target.value)}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 text-[12px] font-bold text-[var(--foreground)] shadow-sm outline-none transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            >
              {options.map((dept) => (
                <option key={dept} value={dept}>
                  {dept}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="hidden text-[11px] font-semibold text-[var(--toss-gray-3)] md:inline">
          선택한 부서의 재고를 기준으로 현재 재고가 자동 표시됩니다
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {draftSavedAt ? (
          <span
            data-testid="supplies-context-draft-chip"
            className="inline-flex items-center rounded-full bg-[var(--card)] px-2.5 py-1 text-[10px] font-bold text-[var(--toss-gray-4)] shadow-sm"
          >
            임시저장 {draftSavedAt}
          </span>
        ) : null}
        {outOfStockCount > 0 ? (
          <span
            data-testid="supplies-context-out-of-stock-chip"
            role="status"
            aria-live="polite"
            className="inline-flex items-center rounded-full bg-red-500/10 px-2.5 py-1 text-[10px] font-black text-red-600"
          >
            재고 0 품목 {outOfStockCount}건
          </span>
        ) : null}
      </div>
    </div>
  );
}
