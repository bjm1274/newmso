/**
 * 멀티회사(MSO) 권한·범위 유틸
 * - MSO_ADMIN: 여러 회사 조회/설정 가능, 직원 데이터 직접 수정은 제한
 * - HOSPITAL_ADMIN / STAFF: 자기 company_id만 접근
 */

export type CompanyType = 'MSO' | 'HOSPITAL' | 'CLINIC';
export type StaffRole = 'MSO_ADMIN' | 'HOSPITAL_ADMIN' | 'STAFF';

export interface Company {
  id: string;
  name: string;
  type: CompanyType;
  mso_id: string | null;
  is_active: boolean;
  ceo_name?: string | null;
  business_no?: string | null;
  address?: string | null;
  phone?: string | null;
  memo?: string | null;
  created_at?: string;
}

export interface CompanyScope {
  /** 현재 선택된 회사 ID (병원 직원은 자기 회사 고정) */
  companyId: string | null;
  /** MSO 관리자가 조회 가능한 회사 ID 목록 */
  allowedCompanyIds: string[];
  /** MSO 관리자 여부 */
  isMsoAdmin: boolean;
  /** 병원/클리닉 관리자(해당 회사 HR) */
  isHospitalAdmin: boolean;
  /** 로그인 사용자 표시명(회사명) - 기존 company 문자열 호환 */
  companyName: string;
}

const MSO_COMPANY_IDS = ['a0000000-0000-0000-0000-000000000001'];

/**
 * localStorage의 erp_user 기반으로 권한·범위 계산
 * (DB에 company_id/role 반영 후에는 API에서 내려주는 값 사용 권장)
 */
export function getCompanyScopeFromUser(user: any): CompanyScope {
  const isMso = user?.company === 'SY INC.' || user?.permissions?.mso === true;
  const companyName = user?.company ?? '';

  return {
    companyId: user?.company_id ?? null,
    allowedCompanyIds: isMso ? MSO_COMPANY_IDS : user?.company_id ? [user.company_id] : [],
    isMsoAdmin: isMso,
    isHospitalAdmin: user?.role === 'admin' && !isMso,
    companyName,
  };
}

/**
 * 쿼리 시 사용할 회사 ID 목록
 * - MSO: 선택된 회사 또는 전체(빈 배열이면 필터 없음은 별도 처리)
 * - 병원: 자기 회사만
 */
export function getCompanyFilterIds(scope: CompanyScope, selectedCompanyId: string | null): string[] | null {
  if (scope.isMsoAdmin) {
    if (selectedCompanyId) return [selectedCompanyId];
    return null; // null = 전체(MSO 대시보드)
  }
  if (scope.companyId) return [scope.companyId];
  return [];
}
