/**
 * 마이페이지 > 증명서관리 인쇄/다운로드 헬퍼.
 *
 * 두 가지 데이터 소스를 동일한 "실제 발행본" 양식으로 인쇄하기 위한 빌더 모음:
 *   1) approvals (type='증명서발급' | '양식신청') — 결재 완료 문서 → 결재용 풀 인쇄 HTML
 *   2) certificate_issuances — 인사관리에서 직접 발급된 증명서 → 직인/대표자/발급번호 포함 풀 양식
 *
 * 결재용 인쇄 HTML은 전자결재서브/approval-print-utils.tsx 의 `buildApprovalPrintHtml`을
 * 그대로 재사용하여 도장·서명·문서번호·결재선까지 누락 없이 출력한다.
 *
 * 인쇄 출력은 항상 새 창(window.open)으로 띄우고, 결재 인쇄와 동일하게
 * 모바일에서는 iframe + window.print() 폴백 흐름을 유지한다.
 */

import { toast } from '@/lib/toast';
import { buildApprovalPrintHtml, openApprovalPrintView } from '../전자결재서브/approval-print-utils';
import { DEFAULT_APPROVAL_TEMPLATE_DESIGN } from '../전자결재서브/approval-constants';
import { BUILTIN_TEMPLATE_DEFAULTS } from '../관리자전용서브/전자결재양식관리/design-utils';

// ─────────────────────────────────────────────
// 공용 유틸
// ─────────────────────────────────────────────

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeFilename(value: string) {
  return (value || 'certificate')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80);
}

function formatDateLabel(value?: string | null) {
  if (!value) return new Date().toLocaleDateString('ko-KR');
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('ko-KR');
}

// ─────────────────────────────────────────────
// 1) 결재 완료 문서 → 결재용 풀 인쇄 HTML
// ─────────────────────────────────────────────

type ApprovalRecord = Record<string, unknown>;

/**
 * 결재 승인 문서를 결재용 풀 인쇄 HTML로 변환한다.
 * 결재선·도장·문서번호·기안일이 그대로 포함된다.
 */
export function buildApprovalCertificatePrintHtml(
  approval: ApprovalRecord,
  options?: { autoPrint?: boolean },
) {
  // approval-print-utils 는 design/templateMeta 리졸버 콜백을 요구한다.
  // 마이페이지 단독에서는 외부 design store 가 없으므로 기본값 + 증명서 프리셋으로 채운다.
  const resolveApprovalTemplateMeta = () => ({
    slug: 'generic',
    name: '증명서 발급 신청서',
  });

  const genericPreset = BUILTIN_TEMPLATE_DEFAULTS.generic || {};
  const companyLabel =
    String(approval?.sender_company || DEFAULT_APPROVAL_TEMPLATE_DESIGN.companyLabel || 'SY INC.').trim() ||
    'SY INC.';

  const resolveApprovalTemplateDesign = () => ({
    ...DEFAULT_APPROVAL_TEMPLATE_DESIGN,
    ...genericPreset,
    title: genericPreset.title || '증명서 발급 신청서',
    companyLabel,
    sealLabel: `${companyLabel} 직인`,
    templateName: '증명서발급',
    templateSlug: 'generic',
  });

  return buildApprovalPrintHtml({
    item: approval,
    approvalDirectoryStaffs: [],
    resolveApprovalTemplateDesign,
    resolveApprovalTemplateMeta,
    options,
  });
}

/**
 * 결재 승인 문서를 새 창으로 띄워 인쇄까지 자동 실행한다.
 * 모바일은 iframe 폴백을 사용한다.
 */
export function openApprovalCertificatePrintView(approval: ApprovalRecord) {
  openApprovalPrintView({
    item: approval,
    buildHtml: (item, opts) => buildApprovalCertificatePrintHtml(item, opts),
  });
}

// ─────────────────────────────────────────────
// 2) certificate_issuances → 풀 증명서 양식 HTML
// ─────────────────────────────────────────────

export type IssuedCertificate = {
  id: string | number;
  cert_type: string;
  serial_no?: string | null;
  purpose?: string | null;
  issued_at?: string | null;
  staff_members?: { name?: string | null } | null;
};

export type IssuedCertificateContext = {
  companyLabel?: string | null;
  staffName?: string | null;
  position?: string | null;
  department?: string | null;
  joinedAt?: string | null;
  sealImageUrl?: string | null;
  primaryColor?: string | null;
  borderColor?: string | null;
};

function getClosingText(certType: string) {
  const map: Record<string, string> = {
    재직증명서: '위와 같이 현재 재직 중임을 증명합니다.',
    경력증명서: '위와 같이 재직 경력을 증명합니다.',
    퇴직증명서: '위와 같이 퇴직 사실을 증명합니다.',
    급여지급증명서: '위와 같이 급여 지급 사실을 증명합니다.',
    급여인증서: '위와 같이 급여 지급 사실을 증명합니다.',
    보수지급명세서: '위와 같이 보수 지급 사실을 증명합니다.',
    연봉금액확인서: '위와 같이 계약 연봉 금액을 확인합니다.',
    근무확인서: '위와 같이 근무 사실을 확인합니다.',
    '직무교육 이수확인서': '위와 같이 직무교육 이수 사실을 증명합니다.',
    원천징수영수증: '위와 같이 원천징수 사실을 확인합니다.',
    소득금액증명원: '위와 같이 소득 금액을 확인합니다.',
    소득금액증명서: '위와 같이 소득 금액을 확인합니다.',
    근로소득원천징수필증: '위와 같이 근로소득 원천징수 사실을 확인합니다.',
  };
  return map[certType] || '위와 같이 증명합니다.';
}

/**
 * certificate_issuances 1건을 풀 증명서 양식 HTML 문자열로 빌드한다.
 * - 발급번호·발급일자 표기
 * - 회사명·대표자·직인 이미지 출력
 * - 인쇄 시 색상/배경 보존(`print-color-adjust:exact`)
 */
export function buildIssuedCertificatePrintHtml(
  cert: IssuedCertificate,
  context: IssuedCertificateContext = {},
  options?: { autoPrint?: boolean },
) {
  const certType = cert.cert_type || '증명서';
  const title = escapeHtml(certType);
  const serial = escapeHtml(cert.serial_no || '');
  const issuedAt = escapeHtml(formatDateLabel(cert.issued_at));
  const purpose = escapeHtml(cert.purpose || '-');
  const staffName = escapeHtml(context.staffName || cert.staff_members?.name || '-');
  const companyLabel = escapeHtml(context.companyLabel || 'SY INC.');
  const department = escapeHtml(context.department || '-');
  const position = escapeHtml(context.position || '-');
  const joinedAt = escapeHtml(formatDateLabel(context.joinedAt));
  const sealUrl = escapeHtml(context.sealImageUrl || '');
  const primaryColor = escapeHtml(context.primaryColor || '#197c86');
  const borderColor = escapeHtml(context.borderColor || '#d7dee5');
  const closingText = escapeHtml(getClosingText(certType));

  const autoPrintScript = options?.autoPrint
    ? `<script>
window.onafterprint = () => {
  try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch (error) {}
  try { window.close(); } catch (error) {}
};
window.onload = () => window.print();
</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>${title}${serial ? ` (${serial})` : ''}</title>
  <style>
    *,*::before,*::after{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;box-sizing:border-box}
    @page{size:A4 portrait;margin:0}
    body{margin:0;background:#f5f7fb;color:#111827;font-family:'Malgun Gothic','Noto Sans KR',sans-serif}
    .sheet{position:relative;max-width:820px;margin:0 auto;background:#fff;border:1px solid ${borderColor};border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,.10);padding:32px 40px 48px}
    .sheet::before{content:'';position:absolute;inset:0;background:url('/logo.png') center 52% / 140px 140px no-repeat;opacity:0.06;pointer-events:none;mix-blend-mode:multiply;z-index:0}
    .sheet > *{position:relative;z-index:1}
    h1{margin:0;font-size:30px;line-height:1.2;color:${primaryColor};letter-spacing:-0.02em}
    .accent-bar{height:3px;background:${primaryColor};margin:14px 0 22px}
    .meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:12px 0}
    .meta-row{border:1px solid ${borderColor};border-radius:10px;padding:10px 14px;font-size:12px;background:#fff}
    .meta-row strong{display:block;margin-bottom:2px;color:#64748b;font-size:11px;font-weight:600}
    .closing{margin:28px 0;text-align:center;font-size:15px;font-weight:600;color:#111827}
    .info-table{width:100%;border-collapse:collapse;border-top:2px solid ${primaryColor};border-bottom:2px solid ${primaryColor};font-size:12px}
    .info-table tr td{padding:10px 14px;border-bottom:1px solid ${borderColor}}
    .info-table tr:last-child td{border-bottom:none}
    .info-table td.label{width:140px;font-weight:700;color:#111827;background:#f8fafc}
    .sign-block{margin-top:48px;text-align:center}
    .issued-label{font-size:13px;color:#64748b;margin-bottom:10px}
    /* 회사명 끝에 직인이 살짝 겹치도록 배치(조작 방지). 직인 자체에는 테두리/배경 없음. */
    .company-row{display:inline-flex;align-items:center;justify-content:center;gap:0}
    .company-name{font-size:26px;font-weight:900;letter-spacing:-0.02em;color:#111827;position:relative;z-index:1}
    .seal{width:90px;height:90px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;color:${primaryColor};background:transparent;overflow:visible;margin-left:-32px;position:relative;z-index:2}
    .seal img{max-width:100%;max-height:100%;object-fit:contain;mix-blend-mode:multiply}
    .footer-note{margin-top:24px;text-align:center;font-size:11px;color:#94a3b8}
    @media print{
      html,body{background:#fff;margin:0;padding:0}
      .sheet{box-shadow:none;border-radius:0;border:none;max-width:none;padding:14mm 14mm}
      .sheet::before{background:url('/logo.png') center / 160px 160px no-repeat;opacity:0.10}
    }
  </style>
</head>
<body>
  <main class="sheet" aria-label="${title}">
    <header>
      <h1>${title}</h1>
      <div class="accent-bar" aria-hidden="true"></div>
    </header>

    <section class="meta-grid" aria-label="발급 정보">
      ${serial ? `<div class="meta-row"><strong>발급번호</strong>${serial}</div>` : ''}
      <div class="meta-row"><strong>발급일자</strong>${issuedAt}</div>
      <div class="meta-row"><strong>용도</strong>${purpose}</div>
      <div class="meta-row"><strong>발급기관</strong>${companyLabel}</div>
    </section>

    <table class="info-table" aria-label="대상자 정보">
      <tbody>
        <tr><td class="label">성명</td><td>${staffName}</td></tr>
        <tr><td class="label">소속</td><td>${companyLabel}</td></tr>
        <tr><td class="label">부서</td><td>${department}</td></tr>
        <tr><td class="label">직위</td><td>${position}</td></tr>
        <tr><td class="label">입사일</td><td>${joinedAt}</td></tr>
      </tbody>
    </table>

    <p class="closing">${closingText}</p>

    <section class="sign-block" aria-label="발급 책임자">
      <div class="issued-label">발급일자 ${issuedAt}</div>
      <div class="company-row">
        <span class="company-name">${companyLabel} 대표</span>
        <span class="seal" aria-label="${companyLabel} 직인">
          ${sealUrl ? `<img src="${sealUrl}" alt="" />` : `${companyLabel}<br />직인`}
        </span>
      </div>
      <p class="footer-note">본 문서는 ERP 시스템을 통해 전자 발급된 증명서입니다.</p>
    </section>
  </main>
  ${autoPrintScript}
</body>
</html>`;
}

/**
 * certificate_issuances 1건을 새 창 인쇄 미리보기로 띄운다.
 * 모바일에서는 iframe 폴백을 사용해 window.print() 호출.
 */
export function openIssuedCertificatePrintView(
  cert: IssuedCertificate,
  context: IssuedCertificateContext = {},
) {
  const isMobilePrintFlow =
    typeof navigator !== 'undefined' &&
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  if (isMobilePrintFlow) {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.opacity = '0';

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
      }, 1200);
    };

    iframe.onload = () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) {
        cleanup();
        toast('모바일 인쇄 미리보기를 여는 중 오류가 발생했습니다.', 'error');
        return;
      }
      frameWindow.focus();
      frameWindow.print();
      cleanup();
    };

    iframe.srcdoc = buildIssuedCertificatePrintHtml(cert, context, { autoPrint: true });
    document.body.appendChild(iframe);
    return;
  }

  const win = window.open('', '_blank');
  if (!win) {
    toast('인쇄 창을 열 수 없습니다. 팝업 차단을 확인해 주세요.', 'error');
    return;
  }
  const html = buildIssuedCertificatePrintHtml(cert, context, { autoPrint: true });
  win.document.write(html);
  win.document.close();
}

// ─────────────────────────────────────────────
// 다운로드 (.html 파일로 저장)
// ─────────────────────────────────────────────

export function downloadHtmlFile(html: string, filename: string) {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(filename)}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
