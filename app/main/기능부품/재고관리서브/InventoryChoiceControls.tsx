'use client';

export type InventoryUnit = 'EA' | 'BOX';

export const INVENTORY_CATEGORY_PRESETS = [
  '소모품',
  '의료기기',
  '의료용품',
  '의약품',
  '약품',
  '보조기',
  '사무용품',
  '기타',
] as const;

const UNIT_OPTIONS: Array<{
  value: InventoryUnit;
  title: string;
  detail: string;
}> = [
  { value: 'EA', title: 'EA', detail: '낱개' },
  { value: 'BOX', title: 'BOX', detail: '박스' },
];

export function normalizeInventoryUnit(value: unknown): InventoryUnit {
  return String(value || '').trim().toUpperCase() === 'BOX' ? 'BOX' : 'EA';
}

export function getInventoryCategoryOptions(existingCategories: string[] = [], currentCategory = '') {
  const normalized = new Set<string>();
  const options: string[] = [];

  [...INVENTORY_CATEGORY_PRESETS, ...existingCategories, currentCategory].forEach((category) => {
    const value = String(category || '').trim();
    const key = value.toLowerCase();
    if (!value || normalized.has(key)) return;
    normalized.add(key);
    options.push(value);
  });

  return options;
}

function UnitGlyph({ unit, selected }: { unit: InventoryUnit; selected: boolean }) {
  const squareClass = selected ? 'bg-white' : 'bg-current';

  if (unit === 'BOX') {
    return (
      <span className="grid h-5 w-5 grid-cols-2 gap-0.5 rounded-[var(--radius-sm)] border border-current/25 p-0.5">
        {[0, 1, 2, 3].map((index) => (
          <span key={index} className={`rounded-[3px] ${squareClass}`} />
        ))}
      </span>
    );
  }

  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-[var(--radius-sm)] border border-current/25">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${squareClass}`} />
    </span>
  );
}

function categoryMark(category: string) {
  const value = category.trim();
  if (value.includes('약')) return '약';
  if (value.includes('의료')) return '의';
  if (value.includes('소모')) return '소';
  if (value.includes('사무')) return '문';
  if (value.includes('보조')) return '보';
  if (value.includes('기타')) return '기';
  return value.slice(0, 1) || '?';
}

export function UnitChoiceGroup({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (value: InventoryUnit) => void;
  testId?: string;
}) {
  const selectedUnit = normalizeInventoryUnit(value);

  return (
    <div className="relative">
      {testId && (
        <select
          data-testid={testId}
          aria-hidden="true"
          tabIndex={-1}
          value={selectedUnit}
          onChange={(event) => onChange(normalizeInventoryUnit(event.target.value))}
          className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
        >
          {UNIT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.value}
            </option>
          ))}
        </select>
      )}
      <div className="inline-grid grid-cols-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)] p-1">
        {UNIT_OPTIONS.map((option) => {
          const selected = selectedUnit === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              data-testid={testId ? `${testId}-${option.value.toLowerCase()}` : undefined}
              onClick={() => onChange(option.value)}
              className={`flex h-8 min-w-[78px] items-center justify-center gap-1.5 rounded-[var(--radius-sm)] border border-transparent px-2 text-center transition-all ${
                selected
                  ? 'bg-[var(--accent)] text-white shadow-sm'
                  : 'text-[var(--toss-gray-4)] hover:bg-[var(--card)] hover:text-[var(--foreground)]'
              }`}
            >
              <UnitGlyph unit={option.value} selected={selected} />
              <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                <span className="text-[12px] font-black leading-none">{option.title}</span>
                <span className={`text-[10px] font-semibold ${selected ? 'text-white/80' : 'text-[var(--toss-gray-4)]'}`}>
                  {option.detail}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CategoryChoiceGroup({
  value,
  options,
  onChange,
  testId,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  testId?: string;
}) {
  const selectedValue = String(value || '').trim();
  const categoryOptions = getInventoryCategoryOptions(options, selectedValue);

  return (
    <div className="relative">
      {testId && (
        <select
          data-testid={testId}
          aria-hidden="true"
          tabIndex={-1}
          value={selectedValue}
          onChange={(event) => onChange(event.target.value)}
          className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0"
        >
          <option value="">분류 선택</option>
          {categoryOptions.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      )}
      <div className="flex flex-wrap gap-1.5">
        {categoryOptions.map((category) => {
          const selected = selectedValue === category;
          return (
            <button
              key={category}
              type="button"
              aria-pressed={selected}
              data-testid={testId ? `${testId}-${category}` : undefined}
              onClick={() => onChange(category)}
              className={`flex h-9 min-w-0 items-center gap-1.5 rounded-[var(--radius-md)] border px-2.5 text-left transition-all ${
                selected
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)] shadow-sm'
                  : 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)] hover:border-[var(--accent)] hover:bg-[var(--accent)]/5'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[10px] font-black ${
                  selected
                    ? 'bg-[var(--accent)] text-white'
                    : 'border border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)]'
                }`}
              >
                {categoryMark(category)}
              </span>
              <span className="min-w-0 truncate text-[11px] font-black">{category}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
