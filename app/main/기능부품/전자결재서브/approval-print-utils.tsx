import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';
import { DEFAULT_APPROVAL_TEMPLATE_DESIGN } from './approval-constants';
import { normalizeApprovalCcUsers, alphaColor, escapeHtml } from '../전자결재-utils';
import {
  renderApprovalAttachmentsHtml,
  renderLeaveRequestInfoHtml,
  renderResignationRequestInfoHtml,
  renderReportInfoHtml,
  renderSupplyRequestItemsHtml,
  renderRosterInfoHtml,
  renderEmployeeEvaluationHtml,
} from './ApprovalMetaPanels';

type ApprovalTemplateMeta = {
  slug?: string | null;
  name?: string | null;
};

type ApprovalTemplateDesign = Record<string, any>;
type ApprovalLineEntry = string | number | Record<string, unknown>;
type ApprovalStaffSnapshot = {
  id: string;
  name: string;
  position?: string | null;
  company?: string | null;
  department?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function resolveApprovalLineEntryId(entry: unknown) {
  if (entry == null) return '';
  if (typeof entry === 'string' || typeof entry === 'number') return String(entry).trim();
  if (isRecord(entry) && entry.id != null) return String(entry.id).trim();
  return '';
}

function resolveApprovalLineEntryText(entry: unknown, key: string) {
  if (!isRecord(entry)) return '';
  return String(entry[key] || '').trim();
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function collectApprovalLineEntries(item: Record<string, unknown>, metaData?: Record<string, unknown> | null) {
  const candidates = [
    item?.approver_line,
    metaData?.approver_line,
    metaData?.approver_line_details,
    metaData?.approverLine,
    metaData?.approvers,
  ];
  const firstLine = candidates.find(Array.isArray);
  return (Array.isArray(firstLine) ? firstLine : []) as ApprovalLineEntry[];
}

function buildApprovalStaffSnapshotMap(params: {
  approvalDirectoryStaffs: StaffMember[];
  approvalLineEntries: ApprovalLineEntry[];
  approvalHistory: Array<{ actor_id?: string | null; actor_name?: string | null }>;
}) {
  const { approvalDirectoryStaffs, approvalLineEntries, approvalHistory } = params;
  const map = new Map<string, ApprovalStaffSnapshot>();

  approvalDirectoryStaffs.forEach((staff) => {
    const id = String(staff?.id || '').trim();
    if (!id) return;
    map.set(id, {
      id,
      name: staff.name || '',
      position: staff.position || null,
      company: staff.company || null,
      department: staff.department || null,
    });
  });

  approvalLineEntries.forEach((entry) => {
    const id = resolveApprovalLineEntryId(entry);
    if (!id || map.get(id)?.name) return;
    const name = resolveApprovalLineEntryText(entry, 'name');
    if (!name) return;
    map.set(id, {
      id,
      name,
      position: resolveApprovalLineEntryText(entry, 'position') || null,
      company: resolveApprovalLineEntryText(entry, 'company') || null,
      department: resolveApprovalLineEntryText(entry, 'department') || null,
    });
  });

  approvalHistory.forEach((entry) => {
    const id = String(entry?.actor_id || '').trim();
    const name = String(entry?.actor_name || '').trim();
    if (!id || !name || map.get(id)?.name) return;
    map.set(id, { id, name, position: null, company: null, department: null });
  });

  return map;
}

export function buildApprovalPrintHtml(params: {
  item: Record<string, unknown>;
  approvalDirectoryStaffs: StaffMember[];
  resolveApprovalTemplateDesign: (item: Record<string, unknown>) => ApprovalTemplateDesign;
  resolveApprovalTemplateMeta: (item: Record<string, unknown>) => ApprovalTemplateMeta;
  options?: { autoPrint?: boolean };
}) {
  const { item, approvalDirectoryStaffs, resolveApprovalTemplateDesign, resolveApprovalTemplateMeta, options } = params;
  const design = resolveApprovalTemplateDesign(item);
  const templateMeta = resolveApprovalTemplateMeta(item);
  const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
  const ccUsers = normalizeApprovalCcUsers(metaData?.cc_users, approvalDirectoryStaffs);
  const reportInfoSection = renderReportInfoHtml(metaData);
  const leaveRequestSection = renderLeaveRequestInfoHtml(metaData);
  const resignationRequestSection = renderResignationRequestInfoHtml(metaData);
  const supplyItemsSection = renderSupplyRequestItemsHtml(metaData);
  const rosterSection = renderRosterInfoHtml(metaData);
  const employeeEvaluationSection = renderEmployeeEvaluationHtml(metaData);
  const attachmentSection = renderApprovalAttachmentsHtml(metaData);
  const autoPrintScript = options?.autoPrint ? `<script>
window.onafterprint = () => {
  try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch (error) {}
  try { window.close(); } catch (error) {}
};
window.onload = () => window.print();
</script>` : '';

  const currentApproverId = String(item?.current_approver_id || '').trim();
  const editHistory = Array.isArray((item?.meta_data as Record<string, unknown> | null | undefined)?.edit_history)
    ? ((item.meta_data as Record<string, unknown>).edit_history as Array<{
        actor_id?: string;
        actor_name?: string;
        action?: string;
        at?: string;
        note?: string | null;
      }>)
    : [];
  const approvedActionSet = new Set(['approved_step', 'approved_final']);
  const approvalHistoryByActor = new Map<string, { action?: string; at?: string; note?: string | null }>();
  editHistory.forEach((entry) => {
    if (!entry?.action || !approvedActionSet.has(entry.action) && entry.action !== 'rejected') return;
    const id = String(entry.actor_id || '').trim();
    if (!id) return;
    approvalHistoryByActor.set(id, entry);
  });
  const draftEntry = editHistory.find((entry) => entry?.action === 'created');
  const approvalLineEntries = collectApprovalLineEntries(item, metaData);
  const approvalStaffSnapshotMap = buildApprovalStaffSnapshotMap({
    approvalDirectoryStaffs,
    approvalLineEntries,
    approvalHistory: editHistory,
  });

  const formatTime = (value: string | null | undefined) => {
    if (!value) return '';
    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('ko-KR', {
      timeZone: 'Asia/Seoul',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderApprovalBox = (params: {
    role: 'draft' | 'approved' | 'rejected' | 'current' | 'pending';
    stepLabel: string;
    name: string;
    position: string;
    timeText: string;
  }) => {
    const { role, stepLabel, name, position, timeText } = params;
    const isApproved = role === 'approved';
    const isRejected = role === 'rejected';
    const isCurrent = role === 'current';
    const isDraft = role === 'draft';
    const accent = escapeHtml(design.primaryColor || '#155eef');
    let borderStyle = 'border:1px dashed #cbd5e1';
    if (isCurrent) {
      borderStyle = `border:2px solid ${accent};background:${escapeHtml(alphaColor(design.primaryColor || '#155eef', 0.06))}`;
    } else if (isRejected) {
      borderStyle = 'border:2px solid #ef4444;background:#fef2f2';
    } else if (isApproved || isDraft) {
      borderStyle = 'border:1px solid #cbd5e1';
    }
    let headerLine = `<div style="font-size:9px;color:#94a3b8;margin-bottom:2px">${escapeHtml(stepLabel)}</div>`;
    if (isApproved) {
      headerLine = `<div style="color:#16a34a;font-weight:800;font-size:11px;margin-bottom:2px">✓ ${escapeHtml(stepLabel)}</div>`;
    } else if (isRejected) {
      headerLine = `<div style="color:#dc2626;font-weight:800;font-size:11px;margin-bottom:2px">✕ ${escapeHtml(stepLabel)}</div>`;
    } else if (isCurrent) {
      headerLine = `<div style="color:${accent};font-weight:700;font-size:9px;margin-bottom:2px">▶ ${escapeHtml(stepLabel)}</div>`;
    } else if (isDraft) {
      headerLine = `<div style="color:#475569;font-weight:700;font-size:9px;margin-bottom:2px">${escapeHtml(stepLabel)}</div>`;
    }
    const nameWithSeal = isDraft
      ? escapeHtml(name)
      : `${escapeHtml(name)} <span style="margin-left:2px;font-size:10px;font-weight:600;color:#94a3b8">(인)</span>`;
    const positionLine = position
      ? `<div style="font-size:10px;color:#64748b">${escapeHtml(position)}</div>`
      : '';
    const timeLine = timeText
      ? `<div style="margin-top:4px;font-size:10px;color:#64748b">${escapeHtml(timeText)}</div>`
      : '';
    return `<div class="sig-box" style="${borderStyle}">${headerLine}<div style="font-weight:700;font-size:12px;color:#111827">${nameWithSeal}</div>${positionLine}${timeLine}</div>`;
  };

  const draftBox = renderApprovalBox({
    role: 'draft',
    stepLabel: '1단계 기안',
    name: String(item?.sender_name || '').trim() || '기안자',
    position: String(item?.sender_position || '').trim(),
    timeText: formatTime(String(item?.created_at || '') || draftEntry?.at || null),
  });

  type ApprovalComment = { stepLabel: string; name: string; comment: string };
  const approvalComments: ApprovalComment[] = [];

  const approverBoxes = approvalLineEntries
    .map((entry, index) => {
      const approverId = resolveApprovalLineEntryId(entry);
      if (!approverId) return '';
      const staff = approvalStaffSnapshotMap.get(approverId);
      const fallbackName = isUuidLike(approverId) ? `결재자 ${index + 1}` : approverId;
      const name = staff?.name || resolveApprovalLineEntryText(entry, 'name') || fallbackName;
      const position = staff?.position || resolveApprovalLineEntryText(entry, 'position');
      const history = approvalHistoryByActor.get(approverId);
      const isApproved = history && approvedActionSet.has(history.action || '');
      const isRejected = history?.action === 'rejected';
      const isCurrent = !history && approverId === currentApproverId;
      const stepLabel = isApproved
        ? `${index + 2}단계 승인`
        : isRejected
          ? `${index + 2}단계 반려`
          : isCurrent
            ? '결재 차례'
            : `${index + 2}단계`;
      const role: 'approved' | 'rejected' | 'current' | 'pending' = isApproved
        ? 'approved'
        : isRejected
          ? 'rejected'
          : isCurrent
            ? 'current'
            : 'pending';
      const noteText = String(history?.note || '').trim();
      // 사용자가 직접 입력한 코멘트만 추출 — note는 "1차 승인" / "최종 승인: <코멘트>" 형태로 들어옴
      const commentText = noteText.includes(':')
        ? noteText.split(':').slice(1).join(':').trim()
        : '';
      if (commentText && (isApproved || isRejected)) {
        approvalComments.push({ stepLabel, name, comment: commentText });
      }
      return renderApprovalBox({
        role,
        stepLabel,
        name,
        position,
        timeText: formatTime(history?.at || null),
      });
    })
    .filter(Boolean)
    .join('');

  const sealImageUrl = String(design.sealImageUrl || '').trim();
  const sealCompanyLabel = String(
    design.companyLabel || item?.sender_company || 'SY INC.',
  ).trim() || 'SY INC.';
  const sealHtml = design.showSeal === false
    ? ''
    : sealImageUrl
      ? `<div class="seal seal-trailing"><img src="${escapeHtml(sealImageUrl)}" alt=""></div>`
      : `<div class="seal seal-trailing">${escapeHtml(`${sealCompanyLabel} 직인`)}</div>`;

  const approvalBoxes = `${draftBox}${approverBoxes}`;
  const approvalCommentsSection = approvalComments.length > 0
    ? `<div class="approval-comments">${approvalComments
        .map(
          (entry) =>
            `<div class="approval-comment"><span class="approval-comment-label">${escapeHtml(entry.stepLabel)} · ${escapeHtml(entry.name)}</span><span class="approval-comment-body">${escapeHtml(entry.comment)}</span></div>`,
        )
        .join('')}</div>`
    : '';
  const referenceSection = ccUsers.length > 0
    ? `<div class="reference"><strong>참조자</strong><span>${ccUsers.map((user) => escapeHtml(user.position ? `${user.name} ${user.position}` : user.name)).join(', ')}</span></div>`
    : '';
  const docNumberText = String(
    (item?.doc_number as string) ||
      ((item?.meta_data as Record<string, unknown> | null | undefined)?.doc_number as string) ||
      '',
  ).trim();
  const draftedAtText = (() => {
    const created = item?.created_at as string | null | undefined;
    if (!created) return '';
    const date = new Date(String(created));
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });
  })();
  const senderNameText = String(item?.sender_name || '').trim();
  const metaBoxes = [
    docNumberText ? `<div><strong>문서번호</strong>${escapeHtml(docNumberText)}</div>` : '',
    draftedAtText ? `<div><strong>기안일</strong>${escapeHtml(draftedAtText)}</div>` : '',
    senderNameText ? `<div><strong>기안자</strong>${escapeHtml(senderNameText)}</div>` : '',
  ].filter(Boolean);
  const metaSection = metaBoxes.length > 0
    ? `<div class="meta">${metaBoxes.join('')}</div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(templateMeta.name || '결재문서')}</title>
  <style>
    *,*::before,*::after{-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact}
    @page{size:A4;margin:15mm 12mm}
    body{font-family:'Malgun Gothic',sans-serif;background:#f5f7fb;margin:0;padding:16px;color:#111827}
    .sheet{position:relative;max-width:820px;min-width:600px;margin:0 auto;background:#fff;border:1px solid ${escapeHtml(design.borderColor || '#d7e3ff')};border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,.10)}
    .sheet::before{content:'';position:absolute;inset:0;background:url('${escapeHtml(design.backgroundLogoUrl || DEFAULT_APPROVAL_TEMPLATE_DESIGN.backgroundLogoUrl)}') center 52% / 72px 72px no-repeat;opacity:${escapeHtml(String(design.backgroundLogoOpacity ?? DEFAULT_APPROVAL_TEMPLATE_DESIGN.backgroundLogoOpacity))};pointer-events:none;mix-blend-mode:multiply;z-index:0}
    .sheet > *{position:relative;z-index:1}
    .hero{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 28px 14px;background:linear-gradient(135deg, ${escapeHtml(alphaColor(design.primaryColor, 0.14))} 0%, rgba(255,255,255,0) 68%);break-inside:avoid}
    h1{margin:0;font-size:22px;line-height:1.2;color:${escapeHtml(design.primaryColor || '#155eef')}}
    .hero .company{font-size:13px;font-weight:700;color:#475569;white-space:nowrap}
    .meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:6px 28px 12px;break-inside:avoid}
    .meta div{border:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.9))};border-radius:10px;padding:8px 12px;font-size:12px;background:#fff}
    .meta strong{display:block;margin-bottom:2px;color:#64748b;font-size:11px;font-weight:600}
    .approval-comments{display:flex;flex-direction:column;gap:4px;padding:0 28px 12px;break-inside:avoid}
    .approval-comment{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;padding:6px 10px;border-left:3px solid ${escapeHtml(design.primaryColor || '#155eef')};background:${escapeHtml(alphaColor(design.primaryColor, 0.05))};border-radius:0 8px 8px 0;font-size:11px;line-height:1.5}
    .approval-comment-label{font-weight:700;color:${escapeHtml(design.primaryColor || '#155eef')};font-size:10px;white-space:nowrap}
    .approval-comment-body{color:#1f2937;font-weight:500}
    .body{padding:14px 28px 16px;break-inside:avoid}
    .doc-title{font-size:17px;font-weight:800;color:#111827;margin:0 0 8px}
    .content{border:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.9))};border-radius:12px;padding:8px 16px;min-height:20px;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word}
    .section{padding:0 28px 16px}
    .section-title{margin:0 0 8px;font-size:14px;font-weight:800;color:#111827;break-after:avoid}
    .supply-table thead{display:table-header-group}
    .supply-table tr{break-inside:avoid}
    .supply-warning{margin:0 0 8px;padding:8px 12px;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:12px;font-weight:700;line-height:1.6}
    .supply-warning strong{margin-right:6px}
    .supply-table{width:100%;border-collapse:collapse;border:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.9))};border-radius:12px;overflow:hidden;font-size:12px}
    .supply-table th,.supply-table td{padding:8px 12px;border-bottom:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.75))};text-align:left;vertical-align:top}
    .supply-table th{background:${escapeHtml(alphaColor(design.primaryColor, 0.08))};font-weight:800;color:#475569}
    .supply-table tbody tr:last-child td{border-bottom:none}
    .warning-mark{display:inline-block;margin-right:4px;color:#dc2626;font-weight:900}
    .warning-note{margin-top:3px;color:#b91c1c;font-size:10px;font-weight:700}
    .reference{display:flex;gap:10px;align-items:center;margin:0 28px 14px;padding:8px 14px;font-size:12px;line-height:1.6;color:#1f2937;break-inside:avoid}
    .reference strong{flex-shrink:0;color:${escapeHtml(design.primaryColor || '#155eef')};font-size:11px;font-weight:700}
    .approval-line{display:flex;flex-wrap:wrap;align-items:stretch;gap:8px;padding:0 28px 12px;break-inside:avoid}
    .sig-box{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;box-sizing:border-box;border:1px dashed ${escapeHtml(alphaColor(design.primaryColor || '#155eef', 0.45))};border-radius:10px;padding:10px 12px;width:120px;min-height:104px;text-align:center;font-size:11px;color:#475569;background:#fff}
    /* 직인 주변 원형 테두리/배경 제거 — 위조 방지를 위해 실 직인 이미지만 노출 */
    .seal{width:72px;height:72px;display:flex;align-items:center;justify-content:center;text-align:center;font-weight:800;font-size:10px;color:${escapeHtml(design.primaryColor || '#155eef')};overflow:visible;background:transparent;flex-shrink:0}
    .seal img{max-width:100%;max-height:100%;object-fit:contain;mix-blend-mode:multiply}
    .seal-trailing{margin-left:auto}
    @media print{
      html,body{background:#fff;padding:0;margin:0}
      .sheet{box-shadow:none;border-radius:0;max-width:none;border:none;padding:0;overflow:visible;background:transparent !important}
      .sheet::before{display:none}
      body::before{content:'';position:fixed;top:50%;left:50%;width:160px;height:160px;transform:translate(-50%,-50%);background:url('${escapeHtml(design.backgroundLogoUrl || DEFAULT_APPROVAL_TEMPLATE_DESIGN.backgroundLogoUrl)}') center / contain no-repeat;opacity:0.12;pointer-events:none;z-index:0}
      .sheet > *{position:relative;z-index:1}
      .hero{background:linear-gradient(135deg, ${escapeHtml(alphaColor(design.primaryColor, 0.14))} 0%, rgba(255,255,255,0) 68%) !important;border-radius:12px}
      .meta div,.content,.sig-box,.seal,.supply-table{background:transparent !important}
      .supply-table th{background:${escapeHtml(alphaColor(design.primaryColor, 0.08))} !important}
      .approval-comment{background:${escapeHtml(alphaColor(design.primaryColor, 0.05))} !important}
      .supply-warning{background:#fef2f2 !important}
      .hero,.meta,.body,.reference,.approval-line,.approval-comments{break-inside:avoid}
      .section-title{break-after:avoid}
      .supply-table tr{break-inside:avoid}
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <h1>${escapeHtml(design.title || templateMeta.name || '결재 문서')}</h1>
      <span class="company">${escapeHtml(design.companyLabel || item?.sender_company || '')}</span>
    </div>
    ${metaSection}
    ${design.showSignArea === false ? '' : `<div class="approval-line">${approvalBoxes}${sealHtml}</div>`}
    ${approvalCommentsSection}
    ${referenceSection}
    <div class="body">
      <div class="doc-title">${escapeHtml(item?.title || '(제목 없음)')}</div>
      <div class="content">${escapeHtml(item?.content || '-').replace(/\n/g, '<br>')}</div>
    </div>
    ${reportInfoSection}
    ${leaveRequestSection}
    ${resignationRequestSection}
    ${supplyItemsSection}
    ${rosterSection}
    ${employeeEvaluationSection}
    ${attachmentSection}
  </div>
  ${autoPrintScript}
</body>
</html>`;
  return html;
}

export function openApprovalPrintView(params: {
  item: Record<string, unknown>;
  buildHtml: (item: Record<string, unknown>, options?: { autoPrint?: boolean }) => string;
}) {
  const { item, buildHtml } = params;

  // PC·모바일 모두 hidden iframe + srcdoc 으로 인쇄한다.
  // 데스크톱의 기존 window.open('', '_blank') 경로는 브라우저 팝업 차단 시 null 을 반환하고,
  // 차단된 about:blank 가 OS 로 핸드오프되어 Windows "이 'about' 링크를 열 앱" 다이얼로그를 띄우는 문제가 있었다.
  // iframe 방식은 새 창을 열지 않아 팝업 차단·about: 핸드오프를 원천 차단한다.
  const printViaIframe = (): boolean => {
    if (typeof document === 'undefined') return false;
    try {
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
          toast('인쇄 미리보기를 여는 중 오류가 발생했습니다.', 'error');
          return;
        }
        try {
          frameWindow.focus();
          frameWindow.print();
        } catch {
          toast('인쇄 미리보기를 여는 중 오류가 발생했습니다.', 'error');
        }
        cleanup();
      };

      // onload 에서 직접 print() 를 호출하므로 autoPrint 스크립트는 넣지 않는다.
      iframe.srcdoc = buildHtml(item);
      document.body.appendChild(iframe);
      return true;
    } catch {
      return false;
    }
  };

  if (printViaIframe()) return;

  // 최후 폴백: iframe 생성 자체가 실패한 환경에서만 새 탭 시도 (autoPrint 스크립트 내장).
  const win = typeof window !== 'undefined' ? window.open('', '_blank') : null;
  if (!win) {
    toast('인쇄 미리보기를 열 수 없습니다. 팝업 차단을 확인해 주세요.', 'error');
    return;
  }
  win.document.write(buildHtml(item, { autoPrint: true }));
  win.document.close();
}
