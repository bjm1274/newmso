'use client';

/**
 * 문서보관함 > 발급된 증명서 섹션
 *
 * certificate_issuances 테이블에서 발급된 실제 증명서 목록을 표시하고
 * 인쇄/다운로드를 지원한다. 마이페이지 증명서관리와 동일한 print-utils를 재사용.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { getProfilePhotoUrl } from '@/lib/profile-photo';
import {
  buildIssuedCertificatePrintHtml,
  downloadHtmlFile,
  openIssuedCertificatePrintView,
  type IssuedCertificate,
  type IssuedCertificateContext,
} from '../마이페이지/certificate-print-utils';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

type StaffRow = {
  id: string;
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
  profile_photo_url?: string | null;
  profile_photo_path?: string | null;
  profile_photo_updated_at?: string | null;
  avatar_url?: string | null;
  photo_url?: string | null;
};

type IssuedRow = IssuedCertificate & {
  staff_members?: { name?: string | null; company?: string | null } | null;
};

type Props = {
  selectedCo: string;
  staffFilterName?: string | null;
};

// ─────────────────────────────────────────────
// 헬퍼
// ─────────────────────────────────────────────

function buildContext(staff: StaffRow | null, sealUrl: string): IssuedCertificateContext {
  if (!staff) return {};
  const companyLabel = String(staff.company || '').trim() || 'SY INC.';
  const duty =
    staff.duty || staff.job_duty || staff.responsibility || staff.role || null;
  const rank = staff.rank || staff.grade || staff.level || null;
  const employeeNo = staff.employee_no || staff.id || null;
  return {
    companyLabel,
    staffName: staff.name || null,
    position: staff.position || null,
    department: staff.department || null,
    joinedAt: staff.joined_at || staff.join_date || null,
    sealImageUrl: sealUrl || null,
    employeeNo,
    duty,
    rank,
    profilePhotoUrl: getProfilePhotoUrl(staff) || null,
  };
}

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

export default function IssuedCertificateSection({ selectedCo, staffFilterName }: Props) {
  const [issuedCerts, setIssuedCerts] = useState<IssuedRow[]>([]);
  const [staffMap, setStaffMap] = useState<Record<string, StaffRow>>({});
  const [sealMap, setSealMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedCert, setSelectedCert] = useState<IssuedRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      setLoading(true);
      try {
        const certQuery = supabase
          .from('certificate_issuances')
          .select('*')
          .order('issued_at', { ascending: false })
          .limit(200);

        const [certRes, staffRes, sealRes] = await Promise.all([
          certQuery,
          supabase
            .from('staff_members')
            .select('id, name, company, department, position, joined_at, join_date, employee_no, duty, job_duty, responsibility, role, rank, grade, level, profile_photo_url, profile_photo_path, profile_photo_updated_at, avatar_url, photo_url'),
          supabase
            .from('contract_templates')
            .select('company_name, seal_url'),
        ]);

        if (cancelled) return;

        if (certRes.error) {
          console.error('발급 증명서 조회 실패:', certRes.error);
        }

        const rawCerts = (certRes.data || []) as (IssuedCertificate & { staff_id?: string | null })[];
        const staffList = (staffRes.data || []) as StaffRow[];
        const sealRows = sealRes.data || [];

        const newStaffMap: Record<string, StaffRow> = {};
        for (const s of staffList) {
          if (s.id) newStaffMap[s.id] = s;
        }

        // staff_members embed 대신 JS에서 staff_id → staffMap 으로 병합
        const certs: IssuedRow[] = rawCerts.map((cert) => {
          const staffId = String(cert.staff_id || '');
          const matched = newStaffMap[staffId];
          return {
            ...cert,
            staff_members: matched
              ? { name: matched.name ?? null, company: matched.company ?? null }
              : null,
          };
        });

        const newSealMap: Record<string, string> = {};
        for (const row of sealRows) {
          if (row.company_name && row.seal_url) {
            newSealMap[row.company_name] = row.seal_url;
          }
        }

        setIssuedCerts(certs);
        setStaffMap(newStaffMap);
        setSealMap(newSealMap);
      } catch (err) {
        console.error('발급 증명서 섹션 로드 실패:', err);
        toast('발급 증명서 목록을 불러오지 못했습니다.', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchData();
    return () => {
      cancelled = true;
    };
  }, [selectedCo]);

  // 회사·이름 필터
  const visibleCerts = useMemo(() => {
    return issuedCerts.filter((cert) => {
      const certCompany = String(
        cert.staff_members?.company || ''
      ).trim();
      const scope = String(selectedCo || '전체').trim() || '전체';
      const matchCompany =
        scope === '전체' || certCompany === scope || certCompany === '';
      const matchName = staffFilterName
        ? String(cert.staff_members?.name || '').includes(staffFilterName)
        : true;
      return matchCompany && matchName;
    });
  }, [issuedCerts, selectedCo, staffFilterName]);

  const resolveContext = (cert: IssuedRow): IssuedCertificateContext => {
    const staffId =
      typeof cert === 'object' && cert !== null && 'staff_id' in cert
        ? String((cert as Record<string, unknown>).staff_id || '')
        : '';
    const staff = staffMap[staffId] || null;
    const companyName = String(staff?.company || cert.staff_members?.company || selectedCo || '').trim();
    const sealUrl = sealMap[companyName] || '';
    return buildContext(staff, sealUrl);
  };

  const handlePrint = (cert: IssuedRow) => {
    try {
      openIssuedCertificatePrintView(cert, resolveContext(cert));
    } catch (err) {
      console.error('발급 증명서 인쇄 실패:', err);
      toast('인쇄 창을 여는 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleDownload = (cert: IssuedRow) => {
    try {
      const html = buildIssuedCertificatePrintHtml(cert, resolveContext(cert));
      downloadHtmlFile(html, `${cert.cert_type}_${cert.serial_no || ''}`);
    } catch (err) {
      console.error('발급 증명서 다운로드 실패:', err);
      toast('다운로드 중 오류가 발생했습니다.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-[var(--toss-gray-3)]">
        발급 증명서 로딩 중...
      </div>
    );
  }

  if (visibleCerts.length === 0) {
    return (
      <div className="py-10 text-center text-sm text-[var(--toss-gray-3)]">
        {staffFilterName
          ? `"${staffFilterName}" 직원의 발급 증명서가 없습니다.`
          : '발급된 증명서가 없습니다.'}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 목록 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {visibleCerts.map((cert) => {
          const isSelected = selectedCert?.id === cert.id;
          return (
            <article
              key={cert.id}
              className={`p-4 border rounded-[var(--radius-md)] flex flex-col justify-between bg-[var(--card)] cursor-pointer transition-all ${
                isSelected
                  ? 'border-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)]/20'
                  : 'border-[var(--border)] hover:shadow-sm'
              }`}
              onClick={() => setSelectedCert(isSelected ? null : cert)}
              aria-pressed={isSelected}
            >
              <div>
                <span className="px-2 py-0.5 bg-[var(--toss-blue-light)] text-[var(--accent)] rounded text-[11px] font-semibold">
                  발급완료
                </span>
                <h4 className="font-semibold text-[var(--foreground)] text-sm mt-2 mb-0.5">
                  {cert.cert_type}
                </h4>
                <p className="text-[11px] text-[var(--toss-gray-3)]">
                  {cert.staff_members?.name || '-'} ·{' '}
                  {cert.issued_at
                    ? new Date(cert.issued_at).toLocaleDateString('ko-KR')
                    : '-'}
                </p>
                {cert.serial_no && (
                  <p className="text-[10px] text-[var(--toss-gray-3)] mt-0.5">
                    {cert.serial_no}
                  </p>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePrint(cert);
                  }}
                  aria-label={`${cert.cert_type} 인쇄`}
                  className="flex-1 py-2 bg-[var(--foreground)] text-[var(--card)] rounded-[var(--radius-md)] text-xs font-semibold"
                >
                  인쇄
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(cert);
                  }}
                  aria-label={`${cert.cert_type} 다운로드`}
                  className="flex-1 py-2 border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] rounded-[var(--radius-md)] text-xs font-semibold"
                >
                  다운로드
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
