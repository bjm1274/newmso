'use client';

/**
 * 경영 대시보드 — 개요 탭 실데이터 페처 (G2 정직화)
 *
 * 검증된 기존 쿼리만 재사용해 실연동:
 *  - 미결재 건수: dashboard-widgets.fetchPendingApprovalCount (approvals.status='대기')
 *  - 현금 잔고: daily_closures 오늘자 total_amount 합산 (재무대시보드 패턴, 전사 합산)
 *  - 법인별 인건비·직원수: payroll_records + staffs (법인손익현황 로직 재사용)
 *
 * 매출·영업이익·이익률·미수금·예산집행률·매출추세는 데이터 소스가 없어
 * 컴포넌트에서 '집계 준비중'으로 표기한다(가짜 숫자 금지).
 *
 * JM2: 개요 진입 시 Promise.all 1회 배치 페치.
 * 회사 간 전사 집계는 의도된 MSO 설계 → 테넌트 필터 없음.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getKoreanTodayString, getKoreanMonthString } from '@/lib/seoul-time';
import { getPayrollGrossPay, filterNonInterimPayrollRecords } from '@/lib/payroll-records';
import { fetchPendingApprovalCount } from '@/lib/data/dashboard-widgets';
import type { StaffMember } from '@/types';

export interface CorpPnlRow {
  company: string;
  headcount: number;
  laborCost: number;
}

export interface ExecOverviewData {
  loading: boolean;
  pendingApprovalCount: number;
  cashBalance: number;
  /** 현금 잔고 집계에 사용된 법인 수(오늘 마감 등록 법인) */
  cashCompanyCount: number;
  /** 법인별 인건비·직원수 (이번 달 payroll_records 기준) */
  corpRows: CorpPnlRow[];
  /** 전사 재직 직원 수 */
  activeStaffCount: number;
  /** 집계 기준 연-월 (YYYY-MM) */
  yearMonth: string;
}

type PayrollRow = {
  staff_id: string;
  total_taxable?: number | null;
  total_taxfree?: number | null;
  gross_pay?: number | null;
  record_type?: string | null;
};

const RESIGNED = '퇴사';

/**
 * 개요 탭 실데이터를 1회 배치로 페치한다.
 * staffs는 AppDataContext에서 이미 로드된 값을 받아 추가 네트워크 없이 그룹핑에 사용.
 */
export function useExecOverview(staffs: StaffMember[]): ExecOverviewData {
  const [state, setState] = useState<ExecOverviewData>({
    loading: true,
    pendingApprovalCount: 0,
    cashBalance: 0,
    cashCompanyCount: 0,
    corpRows: [],
    activeStaffCount: 0,
    yearMonth: getKoreanMonthString(),
  });

  useEffect(() => {
    let cancelled = false;
    const yearMonth = getKoreanMonthString();
    const today = getKoreanTodayString();

    const run = async () => {
      try {
        const [pendingCount, closuresRes, payrollRes] = await Promise.all([
          fetchPendingApprovalCount(),
          // 전사 합산: 오늘자 daily_closures 모든 법인 행 (MSO 전사 집계 — 필터 없음)
          supabase.from('daily_closures').select('company_id, total_amount').eq('date', today),
          // 이번 달 급여명세 (법인손익현황과 동일 컬럼)
          supabase
            .from('payroll_records')
            .select('staff_id, total_taxable, total_taxfree, gross_pay, record_type')
            .eq('year_month', yearMonth),
        ]);

        const closureRows = (closuresRes.data ?? []) as { company_id: string | null; total_amount: number | null }[];
        const cashBalance = closureRows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
        const cashCompanyCount = new Set(closureRows.map((r) => r.company_id).filter(Boolean)).size;

        const payrollRows = filterNonInterimPayrollRecords((payrollRes.data ?? []) as PayrollRow[]);

        // 법인별 직원수·인건비 (법인손익현황 로직 재사용)
        const activeStaffs = staffs.filter(
          (s) => String(s.status ?? '').trim() !== RESIGNED,
        );
        const companies = Array.from(
          new Set(activeStaffs.map((s) => s.company).filter(Boolean)),
        ) as string[];

        const corpRows: CorpPnlRow[] = companies.map((co) => {
          const coStaffs = activeStaffs.filter((s) => s.company === co);
          const coIds = new Set(coStaffs.map((s) => String(s.id)));
          const laborCost = payrollRows
            .filter((p) => coIds.has(String(p.staff_id)))
            .reduce((sum, p) => sum + getPayrollGrossPay(p), 0);
          return { company: co, headcount: coStaffs.length, laborCost };
        });

        if (!cancelled) {
          setState({
            loading: false,
            pendingApprovalCount: pendingCount,
            cashBalance,
            cashCompanyCount,
            corpRows,
            activeStaffCount: activeStaffs.length,
            yearMonth,
          });
        }
      } catch (err) {
        console.error('경영 개요 데이터 로드 실패:', err);
        if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
    // staffs 참조 변경 시 재계산 (AppDataContext 1회 로드 후 안정적)
  }, [staffs]);

  return state;
}
