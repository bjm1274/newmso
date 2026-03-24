'use client';
﻿import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getStaffLikeId, normalizeStaffLike, resolveStaffLike } from '@/lib/staff-identity';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPrintableHtml(doc: { title: string; content: string }) {
  const title = escapeHtml(doc.title || '증명서');
  const content = escapeHtml(doc.content || '').replace(/\n/g, '<br />');
  const issuedAt = escapeHtml(new Date().toLocaleDateString());

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${title}</title>
        <style>
          body { font-family: sans-serif; padding: 40px; }
          h1 { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; }
          .content { margin-top: 40px; white-space: normal; line-height: 1.6; }
          .footer { margin-top: 100px; text-align: center; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <div class="content">${content}</div>
        <div class="footer">
          <p>위와 같이 증명(승인)합니다.</p>
          <p>${issuedAt}</p>
          <p>박철홍정형외과 대표원장 (인)</p>
        </div>
      </body>
    </html>
  `;
}

function sanitizeFilename(value: string) {
  return (value || 'certificate')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

export default function MyCertificates({ user }: Record<string, unknown>) {
  const _user = normalizeStaffLike((user ?? {}) as Record<string, unknown>);
  const [resolvedUser, setResolvedUser] = useState<Record<string, unknown>>(_user);
  const [approvedDocs, setApprovedDocs] = useState<any[]>([]);
  const [issuedCerts, setIssuedCerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const effectiveUserId = getStaffLikeId(resolvedUser);

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

  useEffect(() => {
    const fetchData = async () => {
      if (!effectiveUserId) {
        setLoading(false);
        return;
      }
      const approvalRes = await supabase
        .from('approvals')
        .select('*')
        .eq('sender_id', effectiveUserId)
        .eq('status', '승인')
        .eq('type', '양식신청')
        .order('created_at', { ascending: false });
      setApprovedDocs(approvalRes.data || []);
      const certRes = await supabase
        .from('certificate_issuances')
        .select('*, staff_members(name)')
        .eq('staff_id', effectiveUserId)
        .order('issued_at', { ascending: false })
        .limit(20);
      setIssuedCerts(certRes.error ? [] : (certRes.data || []));
      setLoading(false);
    };

    fetchData();
  }, [effectiveUserId]);

  // 간단한 인쇄 기능 (브라우저 기본 인쇄창 호출)
  const handlePrint = (doc: any) => {
    const html = buildPrintableHtml(doc);
    const printWindow = window.open('', '', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(`${html}<script>window.print();</script>`);
      printWindow.document.close();
    }
  };

  const handleDownload = (doc: any) => {
    const html = buildPrintableHtml(doc);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${sanitizeFilename(doc.title)}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div data-testid="mypage-certificates-panel" className="space-y-4">
      <div className="bg-[var(--card)] p-5 border border-[var(--border)] shadow-sm rounded-[var(--radius-lg)]">
        <h3 className="text-xs font-semibold text-[var(--toss-gray-3)] uppercase tracking-widest mb-4">발급된 증명서</h3>

        {loading ? (
          <div className="text-center py-10">로딩 중...</div>
        ) : issuedCerts.length === 0 && approvedDocs.length === 0 ? (
          <div className="text-center py-20 bg-[var(--muted)] rounded-[var(--radius-md)] border border-dashed border-[var(--border)]">
            <span className="text-4xl mb-2 block">📂</span>
            <p className="font-bold text-[var(--toss-gray-3)] text-sm">발급된 증명서가 없습니다.</p>
            <p className="text-xs text-[var(--toss-gray-3)] mt-1">전자결재 양식신청 후 승인되면, 또는 인사관리 증명서에서 발급하세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {issuedCerts.map((c) => (
              <div data-testid={`certificate-issued-${c.id}`} key={c.id} className="p-4 border border-[var(--border)] rounded-[var(--radius-md)] hover:shadow-md transition-all flex flex-col justify-between bg-[var(--card)] group">
                <div>
                  <span className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--accent)] rounded text-[11px] font-semibold">발급완료</span>
                  <h4 className="font-semibold text-[var(--foreground)] text-lg mt-2 mb-1">{c.cert_type}</h4>
                  <p className="text-xs text-[var(--toss-gray-3)]">{c.serial_no} · {new Date(c.issued_at).toLocaleDateString()}</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid={`certificate-print-${c.id}`}
                    onClick={() => handlePrint({ title: c.cert_type, content: `${c.staff_members?.name || ''} ${c.cert_type}\n발급번호: ${c.serial_no}\n용도: ${c.purpose || ''}` })}
                    className="w-full py-3 bg-gray-900 text-white rounded-[var(--radius-lg)] text-xs font-semibold"
                  >
                    🖨️ 인쇄
                  </button>
                  <button
                    type="button"
                    data-testid={`certificate-download-${c.id}`}
                    onClick={() => handleDownload({ title: c.cert_type, content: `${c.staff_members?.name || ''} ${c.cert_type}\n발급번호: ${c.serial_no}\n용도: ${c.purpose || ''}` })}
                    className="w-full py-3 border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] rounded-[var(--radius-lg)] text-xs font-semibold"
                  >
                    ⬇ 다운로드
                  </button>
                </div>
              </div>
            ))}
            {approvedDocs.map((doc) => (
              <div data-testid={`certificate-approved-${doc.id}`} key={doc.id} className="p-4 border border-[var(--border)] rounded-[var(--radius-md)] hover:shadow-md transition-all flex flex-col justify-between bg-[var(--card)] group">
                <div>
                  <span className="px-2 py-1 bg-green-100 text-green-600 rounded text-[11px] font-semibold">승인완료</span>
                  <h4 className="font-semibold text-[var(--foreground)] text-lg mt-2 mb-1 truncate">{doc.title}</h4>
                  <p className="text-xs text-[var(--toss-gray-3)] line-clamp-2">{doc.content}</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid={`certificate-print-${doc.id}`}
                    onClick={() => handlePrint(doc)}
                    className="w-full py-3 bg-gray-900 text-white rounded-[var(--radius-lg)] text-xs font-semibold"
                  >
                    🖨️ 인쇄
                  </button>
                  <button
                    type="button"
                    data-testid={`certificate-download-${doc.id}`}
                    onClick={() => handleDownload(doc)}
                    className="w-full py-3 border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] rounded-[var(--radius-lg)] text-xs font-semibold"
                  >
                    ⬇ 다운로드
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
