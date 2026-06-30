'use client';
/**
 * SegmentedDateInput
 * - 연(YYYY) / 월(MM) / 일(DD) 3개 입력으로 분리
 * - 키보드 입력 시 자릿수가 차면 자동으로 다음 칸으로 포커스 이동
 *   - 연: 4자리 입력 시 → 월
 *   - 월: 2자리 입력 시 → 일. 첫 글자가 2~9이면 0X로 자동 패딩 후 → 일
 *   - 일: 2자리 입력 시 완료. 첫 글자가 4~9이면 0X로 자동 패딩
 * - 빈 칸에서 Backspace 시 이전 칸 끝으로 이동
 * - "/", "-", "." 입력 시 다음 칸으로 점프
 * - 풀 데이트 문자열 붙여넣기 지원 (예: 2026-05-14, 2026/5/14, 20260514)
 * - value 형식: 'YYYY-MM-DD' (모든 칸이 채워질 때만 onChange 발화). 전부 비면 ''.
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ChangeEvent, type ClipboardEvent } from 'react';

interface Props {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
  className?: string;
}

const FULL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const PASTE_DATE_RE = /^(\d{4})[-./]?(\d{1,2})[-./]?(\d{1,2})$/;

export default function SegmentedDateInput({
  id,
  value,
  onChange,
  disabled,
  required,
  ariaLabel,
  className }: Props) {
  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [day, setDay] = useState('');

  const yearRef = useRef<HTMLInputElement | null>(null);
  const monthRef = useRef<HTMLInputElement | null>(null);
  const dayRef = useRef<HTMLInputElement | null>(null);

  // 외부 value → 내부 segment 동기화
  useEffect(() => {
    if (!value) {
      setYear(''); setMonth(''); setDay('');
      return;
    }
    const m = value.match(FULL_DATE_RE);
    if (m) { setYear(m[1]); setMonth(m[2]); setDay(m[3]); }
  }, [value]);

  const emit = useCallback((y: string, mo: string, d: string) => {
    if (y === '' && mo === '' && d === '') {
      if (value !== '') onChange('');
      return;
    }
    if (y.length === 4 && mo.length === 2 && d.length === 2) {
      const next = `${y}-${mo}-${d}`;
      if (next !== value) onChange(next);
    }
    // 부분 입력 상태에서는 onChange 발화 안 함 (잘못된 날짜 저장 방지)
  }, [onChange, value]);

  const focusSelect = (el: HTMLInputElement | null) => {
    if (!el) return;
    el.focus();
    requestAnimationFrame(() => el.select());
  };

  const focusEnd = (el: HTMLInputElement | null) => {
    if (!el) return;
    el.focus();
    requestAnimationFrame(() => {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    });
  };

  const onYearChange = (e: ChangeEvent<HTMLInputElement>) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
    setYear(digits);
    emit(digits, month, day);
    if (digits.length === 4) focusSelect(monthRef.current);
  };

  const onMonthChange = (e: ChangeEvent<HTMLInputElement>) => {
    let digits = e.target.value.replace(/\D/g, '').slice(0, 2);
    // 첫 글자가 2~9 → 단일자리 월(02~09)로 자동 패딩하고 일 칸으로 이동
    if (digits.length === 1 && digits >= '2') {
      digits = '0' + digits;
      setMonth(digits);
      emit(year, digits, day);
      focusSelect(dayRef.current);
      return;
    }
    setMonth(digits);
    emit(year, digits, day);
    if (digits.length === 2) {
      const n = parseInt(digits, 10);
      const clamped = n < 1 ? '01' : n > 12 ? '12' : digits;
      if (clamped !== digits) {
        setMonth(clamped);
        emit(year, clamped, day);
      }
      focusSelect(dayRef.current);
    }
  };

  const onDayChange = (e: ChangeEvent<HTMLInputElement>) => {
    let digits = e.target.value.replace(/\D/g, '').slice(0, 2);
    if (digits.length === 1 && digits >= '4') {
      digits = '0' + digits;
      setDay(digits);
      emit(year, month, digits);
      return;
    }
    setDay(digits);
    emit(year, month, digits);
    if (digits.length === 2) {
      const n = parseInt(digits, 10);
      const clamped = n < 1 ? '01' : n > 31 ? '31' : digits;
      if (clamped !== digits) {
        setDay(clamped);
        emit(year, month, clamped);
      }
    }
  };

  const onYearKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '/' || e.key === '-' || e.key === '.') {
      e.preventDefault();
      focusSelect(monthRef.current);
    }
  };

  const onMonthKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '/' || e.key === '-' || e.key === '.') {
      e.preventDefault();
      focusSelect(dayRef.current);
      return;
    }
    if (e.key === 'Backspace') {
      const tgt = e.currentTarget;
      if (tgt.value === '' || (tgt.selectionStart === 0 && tgt.selectionEnd === 0)) {
        e.preventDefault();
        focusEnd(yearRef.current);
      }
    }
  };

  const onDayKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      const tgt = e.currentTarget;
      if (tgt.value === '' || (tgt.selectionStart === 0 && tgt.selectionEnd === 0)) {
        e.preventDefault();
        focusEnd(monthRef.current);
      }
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').trim();
    const m = text.match(PASTE_DATE_RE);
    if (!m) return;
    e.preventDefault();
    const y = m[1];
    const mo = m[2].padStart(2, '0');
    const d = m[3].padStart(2, '0');
    setYear(y); setMonth(mo); setDay(d);
    emit(y, mo, d);
    focusEnd(dayRef.current);
  };

  const fieldLabel = ariaLabel ?? '날짜';

  return (
    <div
      className={`w-full flex items-center gap-2 px-3 py-2 border border-[var(--border)] rounded-[var(--radius-md)] text-sm bg-[var(--card)] focus-within:border-[var(--accent)] ${disabled ? 'opacity-60' : ''} ${className ?? ''}`}
    >
      <input
        ref={yearRef}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="YYYY"
        value={year}
        onChange={onYearChange}
        onKeyDown={onYearKey}
        onPaste={onPaste}
        disabled={disabled}
        required={required}
        aria-label={`${fieldLabel} 연도`}
        className="flex-[2] min-w-0 bg-transparent outline-none text-center tabular-nums"
        maxLength={4}
      />
      <span className="text-[var(--toss-gray-3)] select-none shrink-0" aria-hidden="true">-</span>
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="MM"
        value={month}
        onChange={onMonthChange}
        onKeyDown={onMonthKey}
        onPaste={onPaste}
        disabled={disabled}
        aria-label={`${fieldLabel} 월`}
        className="flex-1 min-w-0 bg-transparent outline-none text-center tabular-nums"
        maxLength={2}
      />
      <span className="text-[var(--toss-gray-3)] select-none shrink-0" aria-hidden="true">-</span>
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD"
        value={day}
        onChange={onDayChange}
        onKeyDown={onDayKey}
        onPaste={onPaste}
        disabled={disabled}
        aria-label={`${fieldLabel} 일`}
        className="flex-1 min-w-0 bg-transparent outline-none text-center tabular-nums"
        maxLength={2}
      />
    </div>
  );
}
