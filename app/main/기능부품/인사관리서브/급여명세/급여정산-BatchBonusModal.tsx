'use client';

import { useMemo, useState } from 'react';
import type { StaffMember } from '@/types';
import type { SettlementEntry } from './급여정산-types';

type BonusMode = 'fixed' | 'percent';

interface Props {
  open: boolean;
  onClose: () => void;
  staffs: StaffMember[];
  settlementData: Record<string, SettlementEntry>;
  onApply: (bonusMap: Record<string, number>) => void;
}

export function BatchBonusModal({
  open,
  onClose,
  staffs,
  settlementData,
  onApply,
}: Props) {
  const [mode, setMode] = useState<BonusMode>('percent');
  const [percent, setPercent] = useState<number | ''>(100);
  const [fixedAmount, setFixedAmount] = useState<number | ''>(500000);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(staffs.map((s) => String(s.id)))
  );

  // 직원 목록이 바뀌거나 모달이 열릴 때 기본 전체 선택 유지
  const allStaffIds = useMemo(() => staffs.map((s) => String(s.id)), [staffs]);

  const handleToggleAll = () => {
    if (selectedIds.size === allStaffIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allStaffIds));
    }
  };

  const handleToggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 각 직원별 계산된 상여금
  const calculatedBonuses = useMemo(() => {
    const map: Record<string, number> = {};
    staffs.forEach((s) => {
      const staffId = String(s.id);
      const entry = settlementData[staffId];
      // 기본급 우선순위: 현재 정산화면의 기본급 > 직원 마스터 기본급
      const baseSalary = Number(entry?.base_salary ?? s.base_salary ?? 0);

      if (mode === 'fixed') {
        map[staffId] = typeof fixedAmount === 'number' && fixedAmount > 0 ? fixedAmount : 0;
      } else {
        const rate = typeof percent === 'number' && percent > 0 ? percent / 100 : 0;
        // 10원 단위 절사
        map[staffId] = Math.floor((baseSalary * rate) / 10) * 10;
      }
    });
    return map;
  }, [staffs, settlementData, mode, percent, fixedAmount]);

  // 선택된 인원의 총 상여금 합계
  const totalSelectedBonus = useMemo(() => {
    let sum = 0;
    selectedIds.forEach((id) => {
      sum += calculatedBonuses[id] || 0;
    });
    return sum;
  }, [selectedIds, calculatedBonuses]);

  const handleConfirm = () => {
    const result: Record<string, number> = {};
    selectedIds.forEach((id) => {
      result[id] = calculatedBonuses[id] || 0;
    });
    onApply(result);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-2xl rounded-2xl bg-[var(--card)] border border-[var(--border)] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-[var(--foreground)] flex items-center gap-2">
              <span>🎁</span> 일괄 상여금 지급 설정
            </h3>
            <p className="text-xs text-[var(--toss-gray-3)] mt-0.5">
              기본급 비례(%) 또는 정액(원)을 선택하고, 적용 대상 직원을 선택적으로 지정할 수 있습니다.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-[var(--toss-gray-3)] hover:bg-[var(--muted)] transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 바디 */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
          {/* 방식 선택 탭 */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-[var(--foreground)] block">지급 방식 선택</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode('percent')}
                className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                  mode === 'percent'
                    ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)] ring-1 ring-[var(--accent)]/30'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                }`}
              >
                <span>📊</span> 기본급 비례 지급 (%)
              </button>
              <button
                type="button"
                onClick={() => setMode('fixed')}
                className={`py-2.5 px-4 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 ${
                  mode === 'fixed'
                    ? 'border-[var(--accent)] bg-[var(--toss-blue-light)] text-[var(--accent)] ring-1 ring-[var(--accent)]/30'
                    : 'border-[var(--border)] bg-[var(--card)] text-[var(--toss-gray-4)] hover:bg-[var(--muted)]'
                }`}
              >
                <span>💵</span> 균등 정액 지급 (원)
              </button>
            </div>
          </div>

          {/* 금액 / 비율 입력 */}
          <div className="p-4 rounded-xl bg-[var(--muted)]/50 border border-[var(--border)] space-y-3">
            {mode === 'percent' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--foreground)]">기본급 대비 지급 비율 (%)</label>
                  <div className="flex gap-1.5">
                    {[30, 50, 100, 150, 200].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setPercent(preset)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${
                          percent === preset
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                            : 'bg-[var(--card)] text-[var(--toss-gray-4)] border-[var(--border)] hover:bg-[var(--card-hover)]'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    value={percent}
                    onChange={(e) => setPercent(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="예: 100"
                    className="w-full h-10 px-3 pr-8 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm font-bold outline-none focus:border-[var(--accent)]"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-[var(--toss-gray-3)]">%</span>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-[var(--foreground)]">1인당 상여 지급액 (원)</label>
                  <div className="flex gap-1.5">
                    {[300000, 500000, 1000000, 2000000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setFixedAmount(preset)}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-colors ${
                          fixedAmount === preset
                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                            : 'bg-[var(--card)] text-[var(--toss-gray-4)] border-[var(--border)] hover:bg-[var(--card-hover)]'
                        }`}
                      >
                        {(preset / 10000).toLocaleString()}만원
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={fixedAmount === '' ? '' : Number(fixedAmount || 0).toLocaleString()}
                    onChange={(e) => {
                      const num = parseInt(e.target.value.replace(/,/g, ''), 10);
                      setFixedAmount(isNaN(num) ? '' : num);
                    }}
                    placeholder="예: 500,000"
                    className="w-full h-10 px-3 pr-8 rounded-lg border border-[var(--border)] bg-[var(--card)] text-sm font-bold outline-none focus:border-[var(--accent)]"
                  />
                  <span className="absolute right-3 top-2.5 text-xs font-bold text-[var(--toss-gray-3)]">원</span>
                </div>
              </div>
            )}
          </div>

          {/* 대상자 선택 및 미리보기 테이블 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="batch-bonus-select-all"
                  checked={selectedIds.size === allStaffIds.length && allStaffIds.length > 0}
                  onChange={handleToggleAll}
                  className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
                />
                <label htmlFor="batch-bonus-select-all" className="text-xs font-bold text-[var(--foreground)] cursor-pointer">
                  지급 대상 직원 ({selectedIds.size} / {allStaffIds.length}명 선택됨)
                </label>
              </div>
              <button
                type="button"
                onClick={handleToggleAll}
                className="text-xs font-bold text-[var(--accent)] hover:underline"
              >
                {selectedIds.size === allStaffIds.length ? '선택 해제' : '전체 선택'}
              </button>
            </div>

            <div className="rounded-xl border border-[var(--border)] overflow-hidden max-h-56 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-[var(--muted)] text-[var(--toss-gray-4)] font-bold sticky top-0 z-10 border-b border-[var(--border)]">
                  <tr>
                    <th className="py-2 px-3 w-10 text-center">선택</th>
                    <th className="py-2 px-3">직원명</th>
                    <th className="py-2 px-3">부서/직급</th>
                    <th className="py-2 px-3 text-right">기본급</th>
                    <th className="py-2 px-3 text-right">계산된 상여금</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {staffs.map((s) => {
                    const id = String(s.id);
                    const isChecked = selectedIds.has(id);
                    const base = Number(settlementData[id]?.base_salary ?? s.base_salary ?? 0);
                    const bonus = calculatedBonuses[id] || 0;

                    return (
                      <tr
                        key={id}
                        onClick={() => handleToggleOne(id)}
                        className={`cursor-pointer transition-colors ${
                          isChecked ? 'bg-[var(--toss-blue-light)]/40' : 'hover:bg-[var(--muted)]/50'
                        }`}
                      >
                        <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggleOne(id)}
                            className="rounded border-[var(--border)] text-[var(--accent)] focus:ring-[var(--accent)]"
                          />
                        </td>
                        <td className="py-2 px-3 font-bold text-[var(--foreground)]">{s.name}</td>
                        <td className="py-2 px-3 text-[var(--toss-gray-4)]">
                          {s.department || '-'} / {s.position || '-'}
                        </td>
                        <td className="py-2 px-3 text-right text-[var(--toss-gray-4)] font-medium">
                          ₩{base.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right font-black text-[var(--accent)]">
                          {isChecked ? `₩${bonus.toLocaleString()}` : <span className="text-gray-400 font-normal">제외됨</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 합계 요약 카드 */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs">
            <span className="font-bold text-amber-800">
              선택 {selectedIds.size}명 총 상여 지급 예상 합계
            </span>
            <span className="text-base font-black text-amber-700">
              ₩ {totalSelectedBonus.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 풋터 */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] px-6 py-4 bg-[var(--muted)]/20">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--card)] text-xs font-bold text-[var(--toss-gray-4)] hover:bg-[var(--muted)] transition-colors"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={selectedIds.size === 0}
            className="px-5 py-2.5 rounded-xl bg-[var(--accent)] text-white text-xs font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {selectedIds.size}명에게 상여금 일괄 적용
          </button>
        </div>
      </div>
    </div>
  );
}
