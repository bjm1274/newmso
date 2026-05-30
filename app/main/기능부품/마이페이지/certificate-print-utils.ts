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
import { escapeHtml } from '@/lib/escape-html';
import { buildApprovalPrintHtml, openApprovalPrintView } from '../전자결재서브/approval-print-utils';
import { DEFAULT_APPROVAL_TEMPLATE_DESIGN } from '../전자결재서브/approval-constants';
import { BUILTIN_TEMPLATE_DEFAULTS } from '../관리자전용서브/전자결재양식관리/design-utils';

// ─────────────────────────────────────────────
// 공용 유틸
// ─────────────────────────────────────────────

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
  // 인사관리 발급 디자인과 동일하게 표시하기 위한 추가 메타
  employeeNo?: string | null;
  duty?: string | null;
  rank?: string | null;
  profilePhotoUrl?: string | null;
  // 본문 표에 추가로 노출할 행 (예: 급여 증명서의 기준 급여)
  extraInfoRows?: Array<{ label: string; value: string }> | null;
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
  // 인사관리 > 증명서 발급 화면(renderCertificatePaper)과 동일한 디자인으로 발급.
  // 직원 본인이 마이페이지에서 보는 증명서도 동일한 출력 양식을 가지도록 통합.
  const certType = cert.cert_type || '증명서';
  const title = escapeHtml(certType);
  const serial = escapeHtml(cert.serial_no || '');
  const issuedAt = escapeHtml(formatDateLabel(cert.issued_at));
  const staffName = escapeHtml(context.staffName || cert.staff_members?.name || '-');
  const companyLabel = escapeHtml(context.companyLabel || 'SY INC.');
  const department = escapeHtml(context.department || '-');
  const position = escapeHtml(context.position || '-');
  const rankLabel = String(context.rank || '').trim();
  const positionRank = [String(context.position || '').trim(), rankLabel].filter(Boolean).join(' / ') || '-';
  const positionRankSafe = escapeHtml(positionRank);
  const joinedAt = escapeHtml(formatDateLabel(context.joinedAt));
  const employeeNo = escapeHtml(context.employeeNo || '-');
  const duty = escapeHtml(context.duty || '-');
  const sealUrl = escapeHtml(context.sealImageUrl || '');
  const photoUrl = escapeHtml(context.profilePhotoUrl || '');
  const photoInitial = escapeHtml(String(context.staffName || cert.staff_members?.name || '?').slice(0, 1));
  const primaryColor = escapeHtml(context.primaryColor || '#197c86');
  const borderColor = escapeHtml(context.borderColor || '#d7dee5');
  const closingText = escapeHtml(getClosingText(certType));
  const extraInfoRowsHtml = (context.extraInfoRows || [])
    .filter((row) => row && row.label)
    .map(
      (row) =>
        `<div class="info-row"><span class="label">${escapeHtml(row.label)}</span><span>:</span><span class="value">${escapeHtml(row.value)}</span></div>`,
    )
    .join('');

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
    @page{size:A4 portrait;margin:8mm}
    body{margin:0;background:#f5f7fb;color:#111827;font-family:'Noto Sans KR','Malgun Gothic',sans-serif}
    .sheet{position:relative;max-width:780px;margin:0 auto;background:linear-gradient(180deg,#ffffff 0%,#fdfefe 78%,#f5f8fa 100%);border:1px solid ${borderColor};border-radius:6px;padding:20px;min-height:980px;overflow:hidden}
    /* 배경 워터마크: 회사 로고 */
    .watermark{position:absolute;left:50%;top:52%;width:128px;height:128px;transform:translate(-50%,-50%);object-fit:contain;opacity:0.06;mix-blend-mode:multiply;pointer-events:none}
    .stack{position:relative;z-index:1;display:flex;flex-direction:column;height:100%}
    /* 헤더: 로고 박스 + 제목 */
    .header{display:flex;align-items:flex-start;gap:16px}
    .logo-box{width:72px;height:72px;border:1px solid ${borderColor};border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .logo-box img{width:44px;height:44px;object-fit:contain}
    .doc-title{font-size:34px;font-weight:900;letter-spacing:-0.04em;color:#111827;margin:4px 0 0;line-height:1.1}
    .accent-bar{height:3px;width:100%;background:${primaryColor};margin:16px 0 0}
    /* 사진 + 인적사항 */
    .identity-row{display:grid;grid-template-columns:96px 1fr;gap:12px;margin-top:20px}
    .photo-wrap{border:1px solid ${borderColor};border-radius:4px;overflow:hidden;background:#eef2f6}
    .photo-wrap .photo{aspect-ratio:3/4;width:100%;display:flex;align-items:center;justify-content:center;overflow:hidden}
    .photo img{width:100%;height:100%;object-fit:cover}
    .photo-fallback{font-size:38px;font-weight:900;color:#94a3b8}
    .photo-caption{margin-top:4px;text-align:center;font-size:9px;font-weight:600;color:#94a3b8}
    .identity-list{padding-top:2px}
    .identity-row-item{display:grid;grid-template-columns:48px 8px 1fr;gap:6px;padding:4px 0;font-size:11px;align-items:start}
    .identity-row-item:not(:last-child){border-bottom:1px solid ${borderColor}}
    .identity-row-item .label{font-weight:700;color:#111827}
    .identity-row-item .value{font-weight:500;color:#111827;line-height:1.35}
    /* 본문 문구 */
    .closing{margin:18px 0 0;text-align:center;font-size:14px;font-weight:600;color:#111827;line-height:1.6}
    /* 본문 표: 위/아래 굵은 라인 + 행마다 라벨/콜론/값 */
    .info-table{margin-top:18px;border-top:2px solid ${primaryColor};border-bottom:2px solid ${primaryColor};background:#fff}
    .info-row{display:grid;grid-template-columns:96px 14px 1fr;gap:8px;padding:10px 16px;font-size:12px;align-items:start}
    .info-row:not(:last-child){border-bottom:1px solid ${borderColor}}
    .info-row .label{font-weight:700;color:#111827}
    .info-row .value{font-weight:500;color:#111827;line-height:1.6}
    /* 하단 발급 책임자: 회사명 끝에 직인이 살짝 겹치도록 배치 */
    .sign-block{margin-top:auto;padding-top:32px;text-align:center}
    .issued-label{font-size:12px;color:#94a3b8;margin-bottom:14px}
    .company-row{display:inline-flex;align-items:flex-end;gap:0;justify-content:center}
    .company-stack{text-align:center;padding-right:32px}
    .company-name{font-size:30px;font-weight:900;letter-spacing:-0.03em;color:#111827;line-height:1.1}
    .company-sub{margin-top:4px;font-size:12px;font-weight:500;color:#94a3b8}
    .seal{width:72px;height:72px;display:inline-flex;align-items:center;justify-content:center;margin-left:-20px;position:relative;z-index:2}
    .seal img{width:72px;height:72px;object-fit:contain;transform:rotate(12deg);mix-blend-mode:multiply;opacity:0.95}
    .seal-fallback{font-size:10px;font-weight:900;line-height:1.3;color:#b42318}
    @media print{
      html,body{background:#fff !important;margin:0;padding:0}
      .sheet{box-shadow:none;border-radius:0;border:none;max-width:none;padding:14mm}
    }
  </style>
</head>
<body>
  <main class="sheet" aria-label="${title}">
    <img class="watermark" src="/logo.png" alt="" aria-hidden="true" />
    <div class="stack">
      <header class="header">
        <div class="logo-box"><img src="/logo.png" alt="" /></div>
        <h1 class="doc-title">${title}</h1>
      </header>
      <div class="accent-bar" aria-hidden="true"></div>

      <section class="identity-row" aria-label="대상자 인적 사항">
        <div>
          <div class="photo-wrap">
            <div class="photo">
              ${photoUrl ? `<img src="${photoUrl}" alt="${staffName} 사진" />` : `<span class="photo-fallback">${photoInitial}</span>`}
            </div>
          </div>
          <p class="photo-caption">사진</p>
        </div>
        <div class="identity-list">
          <div class="identity-row-item"><span class="label">성명</span><span>:</span><span class="value">${staffName}</span></div>
          <div class="identity-row-item"><span class="label">사번</span><span>:</span><span class="value">${employeeNo}</span></div>
          <div class="identity-row-item"><span class="label">부서</span><span>:</span><span class="value">${department}</span></div>
          <div class="identity-row-item"><span class="label">직위</span><span>:</span><span class="value">${position}</span></div>
        </div>
      </section>

      <p class="closing">${closingText}</p>

      <section class="info-table" aria-label="증명 사항">
        <div class="info-row"><span class="label">근무부서</span><span>:</span><span class="value">${department}</span></div>
        <div class="info-row"><span class="label">직위/직급</span><span>:</span><span class="value">${positionRankSafe}</span></div>
        <div class="info-row"><span class="label">입사일자</span><span>:</span><span class="value">${joinedAt}</span></div>
        <div class="info-row"><span class="label">담당업무</span><span>:</span><span class="value">${duty}</span></div>
        <div class="info-row"><span class="label">발급일자</span><span>:</span><span class="value">${issuedAt}</span></div>
        ${serial ? `<div class="info-row"><span class="label">발급번호</span><span>:</span><span class="value">${serial}</span></div>` : ''}
        ${extraInfoRowsHtml}
      </section>

      <section class="sign-block" aria-label="발급 책임자">
        <div class="issued-label">발급일자 ${issuedAt}</div>
        <div class="company-row">
          <div class="company-stack">
            <p class="company-name">${companyLabel}</p>
            <p class="company-sub">대표자 / 직인</p>
          </div>
          <div class="seal" aria-label="${companyLabel} 직인">
            ${sealUrl ? `<img src="${sealUrl}" alt="" />` : `<span class="seal-fallback">회사<br/>직인</span>`}
          </div>
        </div>
      </section>
    </div>
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
