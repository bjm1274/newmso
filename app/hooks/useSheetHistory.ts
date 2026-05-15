'use client';

/**
 * useSheetHistory — 모바일 뒤로가기로 시트/다이얼로그 닫기
 *
 * 시트가 열릴 때 history entry 한 개를 push하고, popstate(브라우저 뒤로가기 또는
 * 모바일 뒤로가기 버튼) 이벤트가 발생하면 onClose를 호출한다.
 * 시트가 정상적으로 닫힐 때(닫기 버튼/Esc 등)는 push한 entry를 정리하여
 * 히스토리 스택이 쌓이지 않도록 한다.
 *
 * JM:  단일 책임, ~50줄
 * JM3: 기존 닫기 동작 보존(보조 채널), 실패 시 조용히 fallback
 * JM4: 명시적 타입, any 금지
 * JM6: 키보드 닫기(X 버튼/Esc)와 popstate가 동일하게 onClose 호출
 */

import { useEffect, useRef } from 'react';

type SheetHistoryState = { __sheet?: boolean };

export function useSheetHistory(open: boolean, onClose: () => void): void {
  const pushedRef = useRef(false);
  const closedByPopRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!open) return;

    closedByPopRef.current = false;

    // 시트가 열릴 때 sentinel entry 한 개 push
    try {
      const state: SheetHistoryState = { __sheet: true };
      window.history.pushState(state, '');
      pushedRef.current = true;
    } catch {
      pushedRef.current = false;
    }

    function handlePopState() {
      // 시트 entry가 pop되어 들어오는 경우 — 닫기만 수행, back() 호출 금지
      closedByPopRef.current = true;
      pushedRef.current = false;
      onClose();
    }

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      // popstate가 아닌 정상 닫힘이면 push한 entry를 정리
      if (pushedRef.current && !closedByPopRef.current) {
        try {
          window.history.back();
        } catch {
          // 정리 실패 시 무시
        }
        pushedRef.current = false;
      }
    };
  }, [open, onClose]);
}
