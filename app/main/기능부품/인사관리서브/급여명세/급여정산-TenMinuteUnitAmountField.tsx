'use client';
// 10분 단위 금액 입력 필드 (순수 추출 — 동작 보존)
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { parsePayrollWonInput, PAYROLL_TIME_STEP_MINUTES, HOLD_TO_UNIT_INPUT_MS } from './급여정산-utils';

export function TenMinuteUnitAmountField({
  label,
  value,
  hourlyRate,
  onChange,
  dataTestId,
  labelClassName,
  inputClassName,
  allowManualAmountInput = false,
}: {
  label: string;
  value: number | '';
  hourlyRate: number;
  onChange: (nextValue: number | '') => void;
  dataTestId: string;
  labelClassName: string;
  inputClassName: string;
  allowManualAmountInput?: boolean;
}) {
  const amount = parsePayrollWonInput(value);
  const [inputValue, setInputValue] = useState(
    value === '' || value === undefined || value === null ? '' : (value === 0 ? '0' : Number(value).toLocaleString())
  );

  useEffect(() => {
    const currentNumeric = parseInt(inputValue.replace(/,/g, ''), 10) || 0;
    const targetNumeric = Number(value) || 0;
    if (currentNumeric !== targetNumeric) {
      setInputValue(value === '' || value === undefined || value === null ? '' : (value === 0 ? '0' : Number(value).toLocaleString()));
    }
  }, [value]);

  const quickInputRef = useRef<HTMLInputElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedByHoldRef = useRef(false);
  const [unitInputOpen, setUnitInputOpen] = useState(false);
  const [unitInputValue, setUnitInputValue] = useState('');
  const stepAmount = Math.round(parsePayrollWonInput(hourlyRate) * (PAYROLL_TIME_STEP_MINUTES / 60));
  const stepLabel = `${PAYROLL_TIME_STEP_MINUTES}분`;

  const clearHoldTimer = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };
  const getUnitCountText = () => {
    if (amount <= 0 || stepAmount <= 0) return '';
    return String(Math.round(amount / stepAmount));
  };
  const openUnitInput = () => {
    openedByHoldRef.current = true;
    setUnitInputValue(getUnitCountText());
    setUnitInputOpen(true);
    window.setTimeout(() => {
      quickInputRef.current?.focus();
      quickInputRef.current?.select();
    }, 0);
  };
  const startHoldToUnitInput = () => {
    clearHoldTimer();
    openedByHoldRef.current = false;
    holdTimerRef.current = setTimeout(openUnitInput, HOLD_TO_UNIT_INPUT_MS);
  };
  const applyStep = (direction: -1 | 1) => {
    if (openedByHoldRef.current) {
      openedByHoldRef.current = false;
      return;
    }
    onChange(Math.max(0, amount + stepAmount * direction));
  };
  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    const rawValue = event.target.value;
    setInputValue(rawValue);
    const numeric = rawValue.replace(/[^\d.-]/g, '');
    if (numeric === '') {
      onChange('');
    } else {
      onChange(parsePayrollWonInput(rawValue));
    }
  };
  const handleUnitInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setUnitInputValue(event.target.value.replace(/[^\d]/g, ''));
  };
  const applyUnitInput = () => {
    const unitCount = parsePayrollWonInput(unitInputValue);
    onChange(unitCount * stepAmount);
    setUnitInputOpen(false);
  };

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    };
  }, []);

  return (
    <div className="relative space-y-1">
      <div className="flex items-center justify-between gap-2">
        <label className={`text-[10px] font-bold ml-1 ${labelClassName}`}>{label}</label>
        <span className="text-[9px] font-bold text-[var(--toss-gray-3)]">
          {stepLabel} 단위 1 = {stepAmount.toLocaleString()}원
        </span>
      </div>
      <div className="flex h-8 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--card)]">
        <button
          type="button"
          data-testid={`${dataTestId}-decrease`}
          onPointerDown={startHoldToUnitInput}
          onPointerUp={clearHoldTimer}
          onPointerLeave={clearHoldTimer}
          onPointerCancel={clearHoldTimer}
          onClick={() => applyStep(-1)}
          disabled={stepAmount <= 0 || amount <= 0}
          className="w-9 shrink-0 border-r border-[var(--border)] text-sm font-black text-[var(--toss-gray-4)] disabled:opacity-40"
          aria-label={`${label} ${stepLabel} 차감`}
        >
          -
        </button>
        <input
          data-testid={dataTestId}
          type="text"
          inputMode="numeric"
          value={inputValue}
          readOnly={!allowManualAmountInput}
          onChange={allowManualAmountInput ? handleAmountChange : undefined}
          className={`min-w-0 flex-1 border-0 bg-transparent px-3 text-xs font-bold outline-none ${inputClassName}`}
        />
        <button
          type="button"
          data-testid={`${dataTestId}-increase`}
          onPointerDown={startHoldToUnitInput}
          onPointerUp={clearHoldTimer}
          onPointerLeave={clearHoldTimer}
          onPointerCancel={clearHoldTimer}
          onClick={() => applyStep(1)}
          disabled={stepAmount <= 0}
          className="w-9 shrink-0 border-l border-[var(--border)] text-sm font-black text-[var(--accent)] disabled:opacity-40"
          aria-label={`${label} ${stepLabel} 추가`}
        >
          +
        </button>
      </div>
      {unitInputOpen && (
        <div
          data-testid={`${dataTestId}-quick-input-panel`}
          className="absolute left-0 right-0 top-full z-30 mt-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg"
        >
          <label className="mb-1 block text-[10px] font-bold text-[var(--toss-gray-4)]">
            {label} {stepLabel} 단위 입력
          </label>
          <div className="flex gap-2">
            <input
              ref={quickInputRef}
              data-testid={`${dataTestId}-quick-input`}
              type="text"
              inputMode="numeric"
              value={unitInputValue}
              onChange={handleUnitInputChange}
              onKeyDown={(event) => {
                if (event.key === 'Enter') applyUnitInput();
                if (event.key === 'Escape') setUnitInputOpen(false);
              }}
              placeholder="개수"
              className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--input-bg)] px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
            <button
              type="button"
              data-testid={`${dataTestId}-quick-apply`}
              onClick={applyUnitInput}
              className="rounded-md bg-[var(--accent)] px-3 py-2 text-xs font-bold text-white"
            >
              적용
            </button>
            <button
              type="button"
              data-testid={`${dataTestId}-quick-close`}
              onClick={() => setUnitInputOpen(false)}
              className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-bold text-[var(--toss-gray-4)]"
            >
              닫기
            </button>
          </div>
          <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">
            1 = {stepLabel} = {stepAmount.toLocaleString()}원
          </p>
        </div>
      )}
    </div>
  );
}
