'use client';

/**
 * 결재 양식 — 개요 탭 실데이터 페처 (G2 정직화)
 *
 *  - 전체/활성/비활성 양식 종수: approval_form_types (전자결재양식관리 패턴)
 *  - 이번 달 사용 횟수 / 양식별 usageCount: approvals 를 이번 달(created_at) 필터 후
 *    type(또는 doc_type)별로 group 집계
 *
 * JM2: Promise.all 1회 배치 페치.
 * 회사 간 전사 집계는 의도된 MSO 설계 → 테넌트 필터 없음.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getKoreanMonthString } from '@/lib/seoul-time';

export interface FormUsageRow {
  /** 양식 구분값 (approvals.type 우선, 없으면 doc_type) */
  type: string;
  count: number;
}

export interface FormsOverviewData {
  loading: boolean;
  /** approval_form_types 전체 종수 */
  totalForms: number;
  activeForms: number;
  inactiveForms: number;
  /** 이번 달 결재 사용 총 건수 */
  monthlyUsage: number;
  /** 양식 구분별 이번 달 사용 건수 (내림차순) */
  usageByType: FormUsageRow[];
  yearMonth: string;
}

type FormTypeRow = { is_active?: number | boolean | null };
type ApprovalUsageRow = { type?: string | null; doc_type?: string | null };

/** is_active 가 0/false/null 이 아니면 활성으로 본다 (스키마 default 1). */
function isActiveRow(row: FormTypeRow): boolean {
  return row.is_active !== 0 && row.is_active !== false && row.is_active != null;
}

export function useFormsOverview(): FormsOverviewData {
  const [state, setState] = useState<FormsOverviewData>({
    loading: true,
    totalForms: 0,
    activeForms: 0,
    inactiveForms: 0,
    monthlyUsage: 0,
    usageByType: [],
    yearMonth: getKoreanMonthString(),
  });

  useEffect(() => {
    let cancelled = false;
    const yearMonth = getKoreanMonthString();
    // created_at 은 'YYYY-MM-DD ...' 형식 → 이번 달 범위로 필터
    const monthStart = `${yearMonth}-01`;

    const run = async () => {
      try {
        const [formTypesRes, approvalsRes] = await Promise.all([
          supabase.from('approval_form_types').select('is_active'),
          // 이번 달 결재 사용 집계 (전사 — MSO 설계상 필터 없음)
          supabase.from('approvals').select('type, doc_type').gte('created_at', monthStart),
        ]);

        const formRows = (formTypesRes.data ?? []) as FormTypeRow[];
        const totalForms = formRows.length;
        const activeForms = formRows.filter(isActiveRow).length;
        const inactiveForms = totalForms - activeForms;

        const approvalRows = (approvalsRes.data ?? []) as ApprovalUsageRow[];
        const monthlyUsage = approvalRows.length;

        const counts = new Map<string, number>();
        for (const row of approvalRows) {
          const key = String(row.type ?? row.doc_type ?? '').trim() || '기타';
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        const usageByType = Array.from(counts.entries())
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count);

        if (!cancelled) {
          setState({
            loading: false,
            totalForms,
            activeForms,
            inactiveForms,
            monthlyUsage,
            usageByType,
            yearMonth,
          });
        }
      } catch (err) {
        console.error('결재 양식 개요 데이터 로드 실패:', err);
        if (!cancelled) setState((prev) => ({ ...prev, loading: false }));
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
