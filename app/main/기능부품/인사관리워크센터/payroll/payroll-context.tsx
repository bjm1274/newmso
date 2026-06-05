'use client';

/**
 * 급여 워크센터 — Context Provider
 *
 * PayrollWorkcenter.tsx 한 곳에서 fetch 후, 13 모듈이 useContext로 공유.
 *
 * JM2: fetch는 워크센터 마운트 시 1회 + yearMonth/selectedCo 변경 시.
 *       모듈 전환은 state 변경만 — 재호출 X.
 * JM3: error는 errors[] 로 모듈에 inline 노출.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  fetchPayrollWorkcenterData,
  type PayrollWorkcenterData,
} from './payroll-fetch';
import { getPayrollPolicy } from './payroll-policy';
import { getKoreanMonthString } from '@/lib/seoul-time';

interface PayrollContextValue {
  data: PayrollWorkcenterData | null;
  loading: boolean;
  yearMonth: string;
  setYearMonth: (ym: string) => void;
  selectedCo: string;
  setSelectedCo: (co: string) => void;
  reload: () => void;
}

const initialDate = () => getKoreanMonthString();

const PayrollContext = createContext<PayrollContextValue | null>(null);

const EMPTY_DATA = (yearMonth: string, selectedCo: string): PayrollWorkcenterData => ({
  policy: getPayrollPolicy(),
  staffs: [],
  records: [],
  recordsPrev: [],
  yearMonth,
  yearMonthPrev: yearMonth,
  selectedCo,
  errors: [],
  isLocked: false,
  payrollDay: 15,
});

export function PayrollProvider({
  children,
  selectedCo: propSelectedCo,
}: {
  children: ReactNode;
  selectedCo?: string;
}) {
  const [yearMonth, setYearMonth] = useState<string>(initialDate);
  const [selectedCo, setSelectedCo] = useState<string>('전체');
  const [reloadNonce, setReloadNonce] = useState(0);
  const [data, setData] = useState<PayrollWorkcenterData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (propSelectedCo) {
      setSelectedCo(propSelectedCo);
    }
  }, [propSelectedCo]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    fetchPayrollWorkcenterData({ yearMonth, selectedCo, signal: controller.signal })
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch((e) => {
        if (cancelled || (e as Error)?.name === 'AbortError') return;
        console.warn('[payroll] fetch fail:', e);
        setData(EMPTY_DATA(yearMonth, selectedCo));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [yearMonth, selectedCo, reloadNonce]);

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  const value = useMemo<PayrollContextValue>(
    () => ({ data, loading, yearMonth, setYearMonth, selectedCo, setSelectedCo, reload }),
    [data, loading, yearMonth, selectedCo, reload],
  );

  return <PayrollContext.Provider value={value}>{children}</PayrollContext.Provider>;
}

export function usePayroll(): PayrollContextValue {
  const ctx = useContext(PayrollContext);
  if (!ctx) {
    throw new Error('usePayroll must be used inside <PayrollProvider>');
  }
  return ctx;
}

/** 데이터가 준비될 때까지 폴백을 보여주는 헬퍼 */
export function usePayrollData(): PayrollWorkcenterData {
  const { data, yearMonth, selectedCo } = usePayroll();
  return data ?? EMPTY_DATA(yearMonth, selectedCo);
}
