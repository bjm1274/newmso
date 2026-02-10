'use client';

import { useMemo } from 'react';
import { getCompanyScopeFromUser, type CompanyScope } from './company';

const STORAGE_KEY_USER = 'erp_user';
const STORAGE_KEY_SELECTED_COMPANY = 'erp_selected_company_id';

/**
 * 현재 로그인 사용자 기준 회사 권한·범위
 */
export function useCompanyScope(): CompanyScope | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(STORAGE_KEY_USER);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    return getCompanyScopeFromUser(user);
  } catch {
    return null;
  }
}

/**
 * MSO 관리자용: 선택한 회사 ID (localStorage)
 */
export function getSelectedCompanyId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(STORAGE_KEY_SELECTED_COMPANY);
}

export function setSelectedCompanyId(companyId: string | null): void {
  if (typeof window === 'undefined') return;
  if (companyId) localStorage.setItem(STORAGE_KEY_SELECTED_COMPANY, companyId);
  else localStorage.removeItem(STORAGE_KEY_SELECTED_COMPANY);
}

/**
 * 화면에서 사용할 "현재 회사 ID"
 * - MSO: 선택된 회사 또는 null(전체)
 * - 병원: 자기 회사 ID
 */
export function useCurrentCompanyId(): string | null {
  const scope = useCompanyScope();
  const selected = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY_SELECTED_COMPANY) : null;
  return useMemo(() => {
    if (!scope) return null;
    if (scope.isMsoAdmin && selected) return selected;
    return scope.companyId;
  }, [scope, selected]);
}
