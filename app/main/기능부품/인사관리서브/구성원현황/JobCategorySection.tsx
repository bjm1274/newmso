'use client';

/**
 * 직종 다중 선택 섹션
 * - job_categories 테이블 로드 (display_order 정렬)
 * - 체크박스 그룹 + 주직종 라디오
 * - JM6: fieldset+legend, label 연결
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { JobCategory, SelectedJobCategory } from './staff-registration-types';

interface JobCategorySectionProps {
  selected: SelectedJobCategory[];
  onChange: (selected: SelectedJobCategory[]) => void;
  error?: string;
}

export default function JobCategorySection({
  selected,
  onChange,
  error,
}: JobCategorySectionProps) {
  const [categories, setCategories] = useState<JobCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('job_categories')
        .select('id, code, name, is_medical_staff, display_order')
        .order('display_order');
      if (!cancelled && data) {
        setCategories(data as JobCategory[]);
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const isChecked = (id: string) => selected.some((s) => s.job_category_id === id);
  const isPrimary = (id: string) => selected.some((s) => s.job_category_id === id && s.is_primary);

  const toggle = (id: string) => {
    if (isChecked(id)) {
      const next = selected.filter((s) => s.job_category_id !== id);
      // 주직종이 제거되면 첫 항목을 주직종으로
      if (isPrimary(id) && next.length > 0) {
        next[0] = { ...next[0], is_primary: true };
      }
      onChange(next);
    } else {
      const hasPrimary = selected.some((s) => s.is_primary);
      onChange([...selected, { job_category_id: id, is_primary: !hasPrimary }]);
    }
  };

  const setPrimary = (id: string) => {
    onChange(
      selected.map((s) => ({ ...s, is_primary: s.job_category_id === id })),
    );
  };

  if (loading) {
    return (
      <div className="p-4 bg-[var(--muted)] rounded-[var(--radius-xl)] border border-[var(--border)]">
        <p className="text-[11px] text-[var(--toss-gray-3)] font-medium">직종 목록 로딩 중...</p>
      </div>
    );
  }

  if (categories.length === 0) {
    return (
      <div className="p-4 bg-[var(--muted)] rounded-[var(--radius-xl)] border border-[var(--border)]">
        <p className="text-[11px] text-[var(--toss-gray-3)] font-medium">
          등록된 직종이 없습니다. (job_categories 테이블 seed 확인 필요)
        </p>
      </div>
    );
  }

  return (
    <fieldset className="p-4 bg-[var(--muted)] rounded-[var(--radius-xl)] border border-[var(--border)] space-y-3">
      <legend className="text-[11px] font-extrabold text-[var(--foreground)] px-1 flex items-center gap-1.5">
        직종
        <span className="text-[10px] font-medium text-[var(--toss-gray-3)]">
          (1개 이상 선택 필수 · 주직종 1개 지정)
        </span>
      </legend>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {categories.map((cat) => {
          const checked = isChecked(cat.id);
          const primary = isPrimary(cat.id);

          return (
            <div
              key={cat.id}
              className={`rounded-[var(--radius-md)] border p-2.5 transition-all ${
                checked
                  ? 'border-[var(--accent)] bg-[var(--accent-selected-subtle)]'
                  : 'border-[var(--border)] bg-[var(--card)]'
              }`}
            >
              {/* 체크박스 */}
              <label
                htmlFor={`job-cat-check-${cat.id}`}
                className="flex items-center gap-2 cursor-pointer"
              >
                <input
                  id={`job-cat-check-${cat.id}`}
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(cat.id)}
                  className="w-3.5 h-3.5 accent-[var(--accent)] shrink-0"
                />
                <span
                  className={`text-[11px] font-bold truncate ${
                    checked ? 'text-[var(--accent)]' : 'text-[var(--foreground)]'
                  }`}
                >
                  {cat.name}
                </span>
                {cat.is_medical_staff && (
                  <span className="ml-auto shrink-0 text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded">
                    의료직
                  </span>
                )}
              </label>

              {/* 주직종 라디오 (체크된 항목에만 표시) */}
              {checked && (
                <label
                  htmlFor={`job-cat-primary-${cat.id}`}
                  className="flex items-center gap-1.5 mt-1.5 ml-5 cursor-pointer"
                >
                  <input
                    id={`job-cat-primary-${cat.id}`}
                    type="radio"
                    name="job-category-primary"
                    checked={primary}
                    onChange={() => setPrimary(cat.id)}
                    className="w-3 h-3 accent-[var(--accent)]"
                  />
                  <span className="text-[10px] font-bold text-[var(--toss-gray-4)]">
                    주직종
                  </span>
                </label>
              )}
            </div>
          );
        })}
      </div>

      {selected.length > 0 && (
        <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">
          선택:{' '}
          {selected
            .map((s) => {
              const cat = categories.find((c) => c.id === s.job_category_id);
              return cat ? (s.is_primary ? `${cat.name}(주)` : cat.name) : s.job_category_id;
            })
            .join(', ')}
        </p>
      )}

      {error && (
        <p role="alert" className="text-[11px] font-bold text-red-500">
          {error}
        </p>
      )}
    </fieldset>
  );
}
