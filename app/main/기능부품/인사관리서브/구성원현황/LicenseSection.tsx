'use client';

/**
 * 면허/자격증 다중 입력 섹션
 * - 빈 row 1개로 시작, "+ 면허 추가" 버튼으로 N개 입력
 * - is_primary 라디오 (한 명에 1개만)
 * - JM6: fieldset+legend, label 연결, 키보드 접근
 */

import SmartDatePicker from '../../공통/SmartDatePicker';
import type { LicenseRow } from './staff-registration-types';
import {
  createEmptyLicenseRow,
  LICENSE_TYPE_OPTIONS,
} from './staff-registration-types';

interface LicenseSectionProps {
  rows: LicenseRow[];
  onChange: (rows: LicenseRow[]) => void;
  error?: string;
}

const INPUT_CLS =
  'w-full p-2.5 bg-[var(--card)] rounded-[var(--radius-md)] border border-[var(--border)] outline-none text-xs font-bold text-[var(--foreground)] focus:ring-2 focus:ring-amber-300';
const LABEL_CLS = 'text-[10px] font-bold text-amber-700 ml-0.5 block mb-1';

export default function LicenseSection({
  rows,
  onChange,
  error,
}: LicenseSectionProps) {
  const updateRow = (index: number, patch: Partial<LicenseRow>) => {
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const setPrimary = (index: number) => {
    onChange(rows.map((r, i) => ({ ...r, is_primary: i === index })));
  };

  const addRow = () => {
    const hasPrimary = rows.some((r) => r.is_primary);
    onChange([...rows, createEmptyLicenseRow(!hasPrimary && rows.length === 0)]);
  };

  const removeRow = (index: number) => {
    const next = rows.filter((_, i) => i !== index);
    // 제거된 row가 primary였으면 첫 row를 primary로
    const wasPrimary = rows[index]?.is_primary;
    if (wasPrimary && next.length > 0) {
      next[0] = { ...next[0], is_primary: true };
    }
    onChange(next);
  };

  return (
    <fieldset className="p-4 bg-amber-50 rounded-[var(--radius-xl)] border border-amber-100 space-y-3">
      <legend className="text-[11px] font-extrabold text-amber-800 px-1 flex items-center gap-1.5">
        면허 / 자격증
        <span className="text-[10px] font-medium text-amber-600">(선택 사항 — 입력 시 대표 1개 지정 필수)</span>
      </legend>

      {rows.length === 0 && (
        <p className="text-[11px] text-amber-600 font-medium py-1">
          면허/자격증이 없습니다. 아래 버튼으로 추가하세요.
        </p>
      )}

      <div className="space-y-4">
        {rows.map((row, index) => {
          const rowId = row._key;
          return (
            <div
              key={rowId}
              className="rounded-[var(--radius-lg)] border border-amber-200 bg-[var(--card)] p-3 space-y-2 relative"
            >
              {/* 대표 라디오 + 삭제 */}
              <div className="flex items-center justify-between gap-2 mb-2">
                <label
                  htmlFor={`license-primary-${rowId}`}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <input
                    id={`license-primary-${rowId}`}
                    type="radio"
                    name="license-primary"
                    checked={row.is_primary}
                    onChange={() => setPrimary(index)}
                    className="w-3.5 h-3.5 accent-amber-500"
                  />
                  <span className="text-[11px] font-bold text-amber-700">
                    {row.is_primary ? '대표 면허' : `면허 ${index + 1}`}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => removeRow(index)}
                  className="text-[10px] font-bold text-red-400 hover:text-red-600 px-2 py-1 rounded-[var(--radius-md)] hover:bg-red-50 transition"
                  aria-label={`면허 ${index + 1} 삭제`}
                >
                  삭제
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {/* 면허 종류 */}
                <div>
                  <label htmlFor={`license-type-${rowId}`} className={LABEL_CLS}>
                    면허 종류
                  </label>
                  <select
                    id={`license-type-${rowId}`}
                    value={row.license_type ?? ''}
                    onChange={(e) =>
                      updateRow(index, {
                        license_type: e.target.value
                          ? (e.target.value as LicenseRow['license_type'])
                          : null,
                      })
                    }
                    className={INPUT_CLS + ' appearance-none'}
                  >
                    <option value="">종류 선택</option>
                    {LICENSE_TYPE_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 면허명 */}
                <div>
                  <label htmlFor={`license-name-${rowId}`} className={LABEL_CLS}>
                    면허명 (상세)
                  </label>
                  <input
                    id={`license-name-${rowId}`}
                    type="text"
                    value={row.license_name ?? ''}
                    onChange={(e) => updateRow(index, { license_name: e.target.value })}
                    placeholder="예: 1급 응급구조사"
                    className={INPUT_CLS}
                  />
                </div>

                {/* 면허 번호 */}
                <div>
                  <label htmlFor={`license-number-${rowId}`} className={LABEL_CLS}>
                    면허 번호
                  </label>
                  <input
                    id={`license-number-${rowId}`}
                    type="text"
                    value={row.license_number ?? ''}
                    onChange={(e) => updateRow(index, { license_number: e.target.value })}
                    placeholder="번호 입력"
                    className={INPUT_CLS}
                  />
                </div>

                {/* 발급기관 */}
                <div>
                  <label htmlFor={`license-issuing-${rowId}`} className={LABEL_CLS}>
                    발급기관
                  </label>
                  <input
                    id={`license-issuing-${rowId}`}
                    type="text"
                    value={row.issuing_body ?? ''}
                    onChange={(e) => updateRow(index, { issuing_body: e.target.value })}
                    placeholder="보건복지부 등"
                    className={INPUT_CLS}
                  />
                </div>

                {/* 취득일 */}
                <div>
                  <label htmlFor={`license-issued-${rowId}`} className={LABEL_CLS}>
                    취득일
                  </label>
                  <SmartDatePicker
                    value={row.issued_date ?? ''}
                    onChange={(val) => updateRow(index, { issued_date: val || '' })}
                    data-testid={`license-issued-${rowId}`}
                    inputClassName={INPUT_CLS}
                  />
                </div>

                {/* 만료일 */}
                <div>
                  <label htmlFor={`license-expiry-${rowId}`} className={LABEL_CLS}>
                    만료일
                  </label>
                  <SmartDatePicker
                    value={row.expiry_date ?? ''}
                    onChange={(val) => updateRow(index, { expiry_date: val || '' })}
                    data-testid={`license-expiry-${rowId}`}
                    inputClassName={INPUT_CLS}
                  />
                </div>
              </div>

              {/* 메모 */}
              <div>
                <label htmlFor={`license-memo-${rowId}`} className={LABEL_CLS}>
                  메모 (특이사항, 세부 범위 등)
                </label>
                <textarea
                  id={`license-memo-${rowId}`}
                  value={row.memo ?? ''}
                  onChange={(e) => updateRow(index, { memo: e.target.value })}
                  rows={2}
                  placeholder="발급 세부 내용, 갱신 필요 여부 등"
                  className={INPUT_CLS + ' resize-none'}
                />
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 hover:text-amber-900 px-3 py-2 rounded-[var(--radius-md)] bg-amber-100 hover:bg-amber-200 transition"
      >
        + 면허 추가
      </button>

      {error && (
        <p role="alert" className="text-[11px] font-bold text-red-500 mt-1">
          {error}
        </p>
      )}
    </fieldset>
  );
}
