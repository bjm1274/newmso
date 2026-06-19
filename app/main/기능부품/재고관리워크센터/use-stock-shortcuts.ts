'use client';

import { useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────
// 1. 바코드 리더기 자동 포커싱 훅 (Wedge Mode Autofocus)
// ─────────────────────────────────────────────────
export function useBarcodeAutofocus(enabled = true) {
  const lastKeyTimeRef = useRef<number>(0);
  const strokeIntervalsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Modifier 키는 제외
      if (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Shift') return;

      const now = Date.now();
      const diff = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // 단일 키 문자(length === 1) 혹은 엔터인 경우 속도 판별
      if (e.key.length === 1 || e.key === 'Enter') {
        strokeIntervalsRef.current.push(diff);
        if (strokeIntervalsRef.current.length > 4) {
          strokeIntervalsRef.current.shift();
        }

        // 마지막 3~4개의 입력 평균 간격이 40ms 이하인 경우 바코드 스캐너의 고속 자동입력으로 판단
        const isFast =
          strokeIntervalsRef.current.length >= 3 &&
          strokeIntervalsRef.current.reduce((a, b) => a + b, 0) / strokeIntervalsRef.current.length < 40;

        if (isFast) {
          // data-barcode-autofocus="true" 표시된 타겟 인풋을 먼저 탐색, 없으면 첫 검색/텍스트 인풋 포커스
          const targetInput = document.querySelector(
            'input[data-barcode-autofocus="true"], input[placeholder*="검색"], input[type="text"]'
          ) as HTMLInputElement | null;

          if (targetInput && document.activeElement !== targetInput) {
            targetInput.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [enabled]);
}

// ─────────────────────────────────────────────────
// 2. 바코드 수신 핸들러 훅 (Global Scanner Interceptor)
// ─────────────────────────────────────────────────
interface UseBarcodeScannerOptions {
  onScan: (barcode: string) => void;
  enabled?: boolean;
}

export function useBarcodeScanner({ onScan, enabled = true }: UseBarcodeScannerOptions) {
  const bufferRef = useRef<string>('');
  const lastKeyTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const currentTime = Date.now();
      const timeDiff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      // 수동 입력(키 입력 지연 > 50ms) 시 버퍼 초기화
      if (bufferRef.current.length > 0 && timeDiff > 50) {
        bufferRef.current = '';
      }

      if (e.key === 'Enter') {
        if (bufferRef.current.length >= 3) {
          onScan(bufferRef.current);
          e.preventDefault();
        }
        bufferRef.current = '';
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onScan, enabled]);
}

// ─────────────────────────────────────────────────
// 3. 그리드/테이블 키보드 단축키 훅 (Ctrl+N, ArrowUp/Down, Enter, Esc)
// ─────────────────────────────────────────────────
interface UseGridShortcutsOptions {
  rowCount: number;
  onSelectRow?: (index: number) => void;
  onNew?: () => void;
  onEscape?: () => void;
  enabled?: boolean;
}

export function useGridShortcuts({
  rowCount,
  onSelectRow,
  onNew,
  onEscape,
  enabled = true,
}: UseGridShortcutsOptions) {
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + N: 신규 등록
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        if (onNew) {
          onNew();
          e.preventDefault();
        }
        return;
      }

      // Escape: 선택 취소 또는 창 닫기
      if (e.key === 'Escape') {
        if (onEscape) {
          onEscape();
        }
        setSelectedIndex(-1);
        return;
      }

      if (rowCount <= 0) return;

      // Arrow Down: 다음 행
      if (e.key === 'ArrowDown') {
        setSelectedIndex((prev) => {
          const next = prev < rowCount - 1 ? prev + 1 : 0;
          scrollIntoView(next);
          return next;
        });
        e.preventDefault();
      }
      // Arrow Up: 이전 행
      else if (e.key === 'ArrowUp') {
        setSelectedIndex((prev) => {
          const next = prev > 0 ? prev - 1 : rowCount - 1;
          scrollIntoView(next);
          return next;
        });
        e.preventDefault();
      }
      // Enter: 선택 확정
      else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && onSelectRow) {
          onSelectRow(selectedIndex);
          e.preventDefault();
        }
      }
    };

    const scrollIntoView = (index: number) => {
      setTimeout(() => {
        const el = document.querySelector(`[data-row-index="${index}"]`);
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }, 0);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [rowCount, selectedIndex, onSelectRow, onNew, onEscape, enabled]);

  return { selectedIndex, setSelectedIndex };
}
