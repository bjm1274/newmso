'use client';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';
import { toast } from '@/lib/toast';
import {
  buildApprovalCertificatePrintHtml,
  buildIssuedCertificatePrintHtml,
  downloadHtmlFile,
  openApprovalCertificatePrintView,
  openIssuedCertificatePrintView,
  type IssuedCertificate,
  type IssuedCertificateContext,
} from './certificate-print-utils';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

type ApprovalDoc = {
  id: string;
  title?: string | null;
  content?: string | null;
  type?: string | null;
  status?: string | null;
  sender_id?: string | null;
  sender_name?: string | null;
  sender_company?: string | null;
  current_approver_id?: string | null;
  approver_line?: unknown;
  doc_number?: string | null;
  meta_data?: Record<string, unknown> | null;
  created_at?: string | null;
};

type IssuedCertificateRow = IssuedCertificate;

type CertificateContextStaff = {
  id?: string | null;
  name?: string | null;
  company?: string | null;
  department?: string | null;
  position?: string | null;
  joined_at?: string | null;
  join_date?: string | null;
};

// ─────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────

export default function MyCertificates({ user }: Record<string, unknown>) {
  const _user = normalizeStaffLike((user ?? {}) as Record<string, unknown>);
  const [resolvedUser, setResolvedUser] = useState<Record<string, unknown>>(_user);
  const [approvedDocs, setApprovedDocs] = useState<ApprovalDoc[]>([]);
  const [issuedCerts, setIssuedCerts] = useState<IssuedCertificateRow[]>([]);
  const [staffDetail, setStaffDetail] = useState<CertificateContextStaff | null>(null);
  const [sealUrl, setSealUrl] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const effectiveUserId = getStaffLikeId(resolvedUser);

  // ── 사용자 식별 동기화 ───────────────────────
  useEffect(() => {
    let cancelled = false;

    const syncUserIdentity = async () => {
      const directId = getStaffLikeId(_user);
      if (directId) {
        setResolvedUser(_user);
        return;
      }
      if (!_user?.name && !_user?.employee_no && !_user?.auth_user_id) {
        setResolvedUser(_user);
        return;
      }
      const recoveredUser = await resolveStaffLike(_user);
      if (!cancelled) {
        setResolvedUser(recoveredUser);
      }
    };

    void syncUserIdentity();
    return () => {
      cancelled = true;
    };
  }, [_user?.id, _user?.name, _user?.employee_no, _user?.auth_user_id]);

  // ── 본인 결재 승인 문서 + 발급 이력 + 직원 상세 + 직인 URL 동시 로딩 ──
  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      if (!effectiveUserId) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const [approvalRes, certRes, staffRes] = await Promise.all([
          supabase
            .from('approvals')
            .select('*')
            .eq('sender_id', effectiveUserId)
            .eq('status', '승인')
            // 기존 '양식신청' 레코드와 신규 '증명서발급' 레코드 모두 조회
            .in('type', ['양식신청', '증명서발급'])
            .order('created_at', { ascending: false }),
          supabase
            .from('certificate_issuances')
            .select('*, staff_members!certificate_issuances_staff_id_fkey(name)')
            .eq('staff_id', effectiveUserId)
            .order('issued_at', { ascending: false })
            .limit(20),
          supabase
            .from('staff_members')
            .select('id, name, company, department, position, joined_at, join_date')
            .eq('id', effectiveUserId)
            .maybeSingle(),
        ]);

        if (cancelled) return;

        const approvalRows = (approvalRes.data || []) as ApprovalDoc[];
        const issuedRows = certRes.error ? [] : ((certRes.data || []) as IssuedCertificateRow[]);
        const staff = (staffRes.error ? null : (staffRes.data || null)) as CertificateContextStaff | null;

        setApprovedDocs(approvalRows);
        setIssuedCerts(issuedRows);
        setStaffDetail(staff);

        // 직인 URL은 회사명을 기준으로 contract_templates 에서 한 번만 조회
        const companyName = String(staff?.company || '').trim();
        if (companyName) {
          try {
            const sealRes = await supabase
              .from('contract_templates')
              .select('seal_url')
              .eq('company_name', companyName)
              .maybeSingle();
            if (!cancelled && !sealRes.error && sealRes.data?.seal_url) {
              setSealUrl(String(sealRes.data.seal_url));
            }
          } catch (sealError) {
            console.error('증명서 직인 조회 실패:', sealError);
          }
        }
      } catch (error) {
        console.error('증명서 목록 조회 실패:', error);
        if (!cancelled) {
          toast('증명서 목록을 불러오지 못했습니다.', 'error');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchAll();
    return () => {
      cancelled = true;
    };
  }, [effectiveUserId]);

  // ── 발행 컨텍스트 (회사명/직위/부서/입사일/직인) ──
  const issuedContext = useMemo<IssuedCertificateContext>(() => {
    const companyLabel =
      String(staffDetail?.company || (resolvedUser?.company as string) || '').trim() || 'SY INC.';
    return {
      companyLabel,
      staffName: staffDetail?.name || (resolvedUser?.name as string) || null,
      position: staffDetail?.position || (resolvedUser?.position as string) || null,
      department: staffDetail?.department || (resolvedUser?.department as string) || null,
      joinedAt: staffDetail?.joined_at || staffDetail?.join_date || null,
      sealImageUrl: sealUrl || null,
    };
  }, [resolvedUser, sealUrl, staffDetail]);

  // ── 인쇄/다운로드 핸들러 ──
  const handlePrintApproval = (doc: ApprovalDoc) => {
    try {
      openApprovalCertificatePrintView(doc as unknown as Record<string, unknown>);
    } catch (error) {
      console.error('결재 증명서 인쇄 실패:', error);
      toast('인쇄 창을 여는 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleDownloadApproval = (doc: ApprovalDoc) => {
    try {
      const html = buildApprovalCertificatePrintHtml(doc as unknown as Record<string, unknown>);
      downloadHtmlFile(html, doc.title || '증명서');
    } catch (error) {
      console.error('결재 증명서 다운로드 실패:', error);
      toast('다운로드 중 오류가 발생했습니다.', 'error');
    }
  };

  const handlePrintIssued = (cert: IssuedCertificateRow) => {
    try {
      openIssuedCertificatePrintView(cert, issuedContext);
    } catch (error) {
      console.error('발급 증명서 인쇄 실패:', error);
      toast('인쇄 창을 여는 중 오류가 발생했습니다.', 'error');
    }
  };

  const handleDownloadIssued = (cert: IssuedCertificateRow) => {
    try {
      const html = buildIssuedCertificatePrintHtml(cert, issuedContext);
      downloadHtmlFile(html, `${cert.cert_type}_${cert.serial_no || ''}`);
    } catch (error) {
      console.error('발급 증명서 다운로드 실패:', error);
      toast('다운로드 중 오류가 발생했습니다.', 'error');
    }
  };

  return (
    <div data-testid="mypage-certificates-panel" className="space-y-4">
      <div className="bg-[var(--card)] p-5 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)]">
        <h3 className="text-xs font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-4">
          발급된 증명서
        </h3>

        {loading ? (
          <div className="text-center py-10">로딩 중...</div>
        ) : issuedCerts.length === 0 && approvedDocs.length === 0 ? (
          <div className="text-center py-20 bg-[var(--muted)] rounded-[var(--radius-md)] border border-dashed border-[var(--border)]">
            <span className="text-4xl mb-2 block">📂</span>
            <p className="font-bold text-[var(--toss-gray-3)] text-sm">발급된 증명서가 없습니다.</p>
            <p className="text-xs text-[var(--toss-gray-3)] mt-1">
              전자결재에서 증명서 발급을 신청해 승인받거나, 인사관리 증명서에서 발급하세요.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {issuedCerts.map((cert) => (
              <article
                data-testid={`certificate-issued-${cert.id}`}
                key={cert.id}
                className="p-4 border border-[var(--border)] rounded-[var(--radius-md)] hover:shadow-md transition-all flex flex-col justify-between bg-[var(--card)] group"
              >
                <div>
                  <span className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--accent)] rounded text-[11px] font-semibold">
                    발급완료
                  </span>
                  <h4 className="font-semibold text-[var(--foreground)] text-lg mt-2 mb-1">
                    {cert.cert_type}
                  </h4>
                  <p className="text-xs text-[var(--toss-gray-3)]">
                    {cert.serial_no || '발급번호 미발급'} ·{' '}
                    {cert.issued_at ? new Date(cert.issued_at).toLocaleDateString() : ''}
                  </p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid={`certificate-print-${cert.id}`}
                    onClick={() => handlePrintIssued(cert)}
                    aria-label={`${cert.cert_type} 인쇄`}
                    className="w-full py-3 bg-[var(--foreground)] text-[var(--card)] rounded-[var(--radius-lg)] text-xs font-semibold"
                  >
                    🖨️ 인쇄
                  </button>
                  <button
                    type="button"
                    data-testid={`certificate-download-${cert.id}`}
                    onClick={() => handleDownloadIssued(cert)}
                    aria-label={`${cert.cert_type} 다운로드`}
                    className="w-full py-3 border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] rounded-[var(--radius-lg)] text-xs font-semibold"
                  >
                    ⬇ 다운로드
                  </button>
                </div>
              </article>
            ))}
            {approvedDocs.map((doc) => (
              <article
                data-testid={`certificate-approved-${doc.id}`}
                key={doc.id}
                className="p-4 border border-[var(--border)] rounded-[var(--radius-md)] hover:shadow-md transition-all flex flex-col justify-between bg-[var(--card)] group"
              >
                <div>
                  <span className="px-2 py-1 bg-green-500/15 text-green-600 dark:text-green-400 rounded text-[11px] font-semibold">
                    승인완료
                  </span>
                  <h4 className="font-semibold text-[var(--foreground)] text-lg mt-2 mb-1 truncate">
                    {doc.title || '(제목 없음)'}
                  </h4>
                  <p className="text-xs text-[var(--toss-gray-3)] line-clamp-2">{doc.content || ''}</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid={`certificate-print-${doc.id}`}
                    onClick={() => handlePrintApproval(doc)}
                    aria-label={`${doc.title || '결재 증명서'} 인쇄`}
                    className="w-full py-3 bg-[var(--foreground)] text-[var(--card)] rounded-[var(--radius-lg)] text-xs font-semibold"
                  >
                    🖨️ 인쇄
                  </button>
                  <button
                    type="button"
                    data-testid={`certificate-download-${doc.id}`}
                    onClick={() => handleDownloadApproval(doc)}
                    aria-label={`${doc.title || '결재 증명서'} 다운로드`}
                    className="w-full py-3 border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] rounded-[var(--radius-lg)] text-xs font-semibold"
                  >
                    ⬇ 다운로드
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
