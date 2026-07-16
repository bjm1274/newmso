'use client';

/**
 * 모바일 증명서 발급(옵션A 셀프서비스) 공용 코어.
 *
 * PC 인사관리 도구(증명서발급.tsx)는 HR 로스터에서 임의 직원을 선택해 발급하지만,
 * 모바일은 "본인 1건"만 발급한다. 따라서 staffId는 호출부에서 고정으로 전달받고
 * 여기서는 본인 staff_members 1건 + 회사 직인만 조회해 발급 컨텍스트를 구성한다.
 *
 * 흐름(증명서발급.tsx handleIssue 1:1 모방, 본인 1건으로 축소):
 *   1) staff_members(본인 1건) + contract_templates(회사 직인) 조회
 *   2) certificate_issuances insert (issued_by = 세션 사용자)
 *   3) openIssuedCertificatePrintView 로 발행본 인쇄(모바일 iframe 폴백 내장)
 *
 * JM: 단일 책임(발급 코어) / JM3: try/catch + 사용자 메시지 / JM4: any 금지
 * JM5: staffId 고정 — 본인 외 데이터 접근 금지.
 */

import { db } from '@/lib/db-client';
import { toast } from '@/lib/toast';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import {
  openIssuedCertificatePrintView,
  type IssuedCertificate,
  type IssuedCertificateContext } from '@/app/main/기능부품/마이페이지/certificate-print-utils';

/** PC buildSerialNo()와 동일 규칙. */
function buildSerialNo(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const tail = String(Date.now()).slice(-6);
  return `CERT-${year}${month}-${tail}`;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/** 세션 사용자 id (issued_by) — localStorage erp_user. */
function getSessionUserId(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_KEYS.USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown };
    return typeof parsed?.id === 'string' ? parsed.id : null;
  } catch {
    return null;
  }
}

type StaffRow = {
  id?: string | null;
  name?: string | null;
  company?: string | null;
  department?: string | null;
  position?: string | null;
  joined_at?: string | null;
  join_date?: string | null;
  employee_no?: string | null;
  duty?: string | null;
  job_duty?: string | null;
  responsibility?: string | null;
  role?: string | null;
  rank?: string | null;
  grade?: string | null;
  level?: string | null;
  base_salary?: number | null;
  base?: number | null;
  meal_allowance?: number | null;
  meal?: number | null;
  status?: string | null;
  resigned_at?: string | null;
  resign_date?: string | null;
  resigned_reason?: string | null;
  resign_reason?: string | null;
  profile_photo_url?: string | null;
  profile_photo_path?: string | null;
  profile_photo_updated_at?: string | null;
  avatar_url?: string | null;
  photo_url?: string | null;
  permissions?: Record<string, unknown> | null;
};

const SALARY_CERT_TYPES = new Set<string>([
  '급여인증서',
  '보수지급명세서',
  '연봉금액확인서',
  '소득금액증명원',
  '원천징수영수증',
  '근로소득원천징수필증',
  '급여지급증명서',
  '소득금액증명서',
]);

/**
 * 본인 1건 증명서를 발급하고 발행본을 인쇄한다.
 * @param staffId 본인 staff_id (고정 — 호출부에서 세션 사용자로 전달)
 * @param certType certificate_types id (예: '재직증명서')
 * @param purpose 제출 용도 (기본값 '기관 제출용')
 * @returns 성공 여부
 */
export async function issueAndPrintMyCert(
  staffId: string | null,
  certType: string,
  purpose = '기관 제출용',
): Promise<boolean> {
  if (!staffId) {
    toast('로그인 정보를 확인할 수 없어 발급할 수 없습니다.', 'warning');
    return false;
  }

  try {
    // 본인 1건만 조회 (JM5: staffId 고정).
    const { data: staffData, error: staffError } = await db
      .from('staff_members')
      .select(
        'id, name, company, department, position, joined_at, join_date, employee_no, duty, job_duty, responsibility, role, rank, grade, level, base_salary, base, meal_allowance, meal, status, resigned_at, resign_date, resigned_reason, resign_reason, profile_photo_url, profile_photo_path, profile_photo_updated_at, avatar_url, photo_url, permissions',
      )
      .eq('id', staffId)
      .maybeSingle();
    if (staffError) throw staffError;
    const staff = (staffData ?? null) as StaffRow | null;
    if (!staff) {
      toast('본인 인사 정보를 찾을 수 없습니다.', 'error');
      return false;
    }

    // 회사 직인 및 로고 조회
    const companyName = String(staff.company ?? '').trim();
    let sealUrl: string | null = null;
    let companyLogoUrl: string | null = null;
    if (companyName) {
      try {
        const [sealRes, companyRes] = await Promise.all([
          db
            .from('contract_templates')
            .select('seal_url')
            .eq('company_name', companyName)
            .limit(1),
          db
            .from('companies')
            .select('logo_url, seal_url')
            .eq('name', companyName)
            .limit(1)
        ]);
        const sealRow = (sealRes.data?.[0] ?? null) as { seal_url?: string | null } | null;
        const companyRow = (companyRes.data?.[0] ?? null) as {
          logo_url?: string | null;
          seal_url?: string | null;
        } | null;
        if (!sealRes.error && sealRow?.seal_url) {
          sealUrl = String(sealRow.seal_url);
        } else if (!companyRes.error && companyRow?.seal_url) {
          sealUrl = String(companyRow.seal_url);
        }
        if (!companyRes.error && companyRow?.logo_url) {
          companyLogoUrl = String(companyRow.logo_url);
        }
      } catch (sealError) {
        console.error('[mobile-cert] seal/logo lookup failed', sealError);
      }
    }

    const serialNo = buildSerialNo();
    const issuedBy = getSessionUserId();

    // certificate_issuances insert (PC와 동일 컬럼셋).
    try {
      const { error: insertError } = await db.from('certificate_issuances').insert({
        staff_id: staff.id,
        cert_type: certType,
        serial_no: serialNo,
        purpose,
        issued_by: issuedBy });
      if (insertError) throw insertError;
    } catch (insertError) {
      console.error('[mobile-cert] issuance insert failed', insertError);
      // 인쇄는 진행하되 이력 저장 실패는 별도 안내(PC는 무음 처리하나 모바일은 안내).
      toast('발급 이력 저장에 실패했지만 인쇄는 진행합니다.', 'warning');
    }

    // 발급 컨텍스트 구성 (증명서발급.tsx handleIssue 모방, 본인 1건).
    const joinedAt = str(staff.joined_at) || str(staff.join_date);
    const resignedAt = str(staff.resigned_at) || str(staff.resign_date);
    const isResigned = String(staff.status ?? '').trim() === '퇴사';
    const dutyLabel =
      str(staff.duty) ||
      str(staff.job_duty) ||
      str(staff.responsibility) ||
      str(staff.role) ||
      null;
    const rankLabel = str(staff.rank) || str(staff.grade) || str(staff.level) || null;
    const employeeNo = str(staff.employee_no) || (staff.id ? String(staff.id) : null);

    // 급여계열 증명서의 기준 급여(base_salary 등) 의존 — 누락 시 '-' 표기.
    let extraInfoRows: Array<{ label: string; value: string }> | null = null;
    if (SALARY_CERT_TYPES.has(certType)) {
      const base = Number(staff.base_salary ?? staff.base ?? 0);
      const meal = Number(staff.meal_allowance ?? staff.meal ?? 0);
      const hasSalary =
        (staff.base_salary != null || staff.base != null) && Number.isFinite(base);
      const total = (Number.isFinite(base) ? base : 0) + (Number.isFinite(meal) ? meal : 0);
      extraInfoRows = [
        { label: '기준 급여', value: hasSalary ? `${total.toLocaleString()}원` : '-' },
      ];
    }

    const cert: IssuedCertificate = {
      id: String(staff.id ?? ''),
      cert_type: certType,
      serial_no: serialNo,
      purpose,
      issued_at: new Date().toISOString(),
      staff_members: { name: str(staff.name) } };

    const context: IssuedCertificateContext = {
      companyLabel: companyName || 'SY INC.',
      staffName: str(staff.name),
      position: str(staff.position),
      department: str(staff.department),
      joinedAt,
      sealImageUrl: sealUrl,
      companyLogoUrl,
      employeeNo,
      duty: dutyLabel,
      rank: rankLabel,
      profilePhotoUrl: getProfilePhotoUrl(staff),
      extraInfoRows,
      resignedAt,
      resignationReason: str(staff.resigned_reason) || str(staff.resign_reason) || '일신상의 사정',
      isResigned };

    openIssuedCertificatePrintView(cert, context);
    return true;
  } catch (error) {
    console.error('[mobile-cert] issue failed', error);
    toast('증명서 발급 중 오류가 발생했습니다.', 'error');
    return false;
  }
}
