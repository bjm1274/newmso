import { toast } from '@/lib/toast';
import type { StaffMember } from '@/types';
import { DEFAULT_APPROVAL_TEMPLATE_DESIGN } from './approval-constants';
import { normalizeApprovalCcUsers, alphaColor, escapeHtml } from '../전자결재-utils';
import {
  renderApprovalAttachmentsHtml,
  renderLeaveRequestInfoHtml,
  renderReportInfoHtml,
  renderSupplyRequestItemsHtml,
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
  const supplyItemsSection = renderSupplyRequestItemsHtml(metaData);
  const attachmentSection = renderApprovalAttachmentsHtml(metaData);
  const autoPrintScript = options?.autoPrint ? `<script>
window.onafterprint = () => {
  try { if (window.opener && !window.opener.closed) window.opener.focus(); } catch (error) {}
  try { window.close(); } catch (error) {}
};
window.onload = () => window.print();
</script>` : '';

  const currentApproverId = String(item?.current_approver_id || '').trim();
  const approvalHistory = Array.isArray((item?.meta_data as Record<string, unknown> | null | undefined)?.approval_history)
    ? ((item.meta_data as Record<string, unknown>).approval_history as Array<{ actor_id?: string; actor_name?: string; action?: string }>)
    : [];
  const approvedIds = new Set(
    approvalHistory
      .filter((h) => h.action === 'approved')
      .map((h) => String(h.actor_id || '').trim())
      .filter(Boolean)
  );
  const approvalLineEntries = collectApprovalLineEntries(item, metaData);
  const approvalStaffSnapshotMap = buildApprovalStaffSnapshotMap({
    approvalDirectoryStaffs,
    approvalLineEntries,
    approvalHistory,
  });

  const approvalBoxes = approvalLineEntries.length > 0
    ? approvalLineEntries.map((entry, index) => {
        const approverId = resolveApprovalLineEntryId(entry);
        if (!approverId) return '';
        const staff = approvalStaffSnapshotMap.get(approverId);
        const fallbackName = isUuidLike(approverId) ? `결재자 ${index + 1}` : approverId;
        const name = escapeHtml(staff?.name || resolveApprovalLineEntryText(entry, 'name') || fallbackName);
        const position = escapeHtml(staff?.position || resolveApprovalLineEntryText(entry, 'position'));
        const isApproved = approvedIds.has(approverId);
        const isCurrent = !isApproved && approverId === currentApproverId;
        const borderStyle = isCurrent
          ? `border:2px solid ${escapeHtml(design.primaryColor || '#155eef')};background:${escapeHtml(alphaColor(design.primaryColor || '#155eef', 0.06))}`
          : 'border:1px dashed #cbd5e1';
        const statusLine = isApproved
          ? `<div style="color:#16a34a;font-weight:800;font-size:13px;margin-bottom:2px">✓</div>`
          : isCurrent
          ? `<div style="color:${escapeHtml(design.primaryColor || '#155eef')};font-weight:700;font-size:9px;margin-bottom:2px">▶ 결재 차례</div>`
          : `<div style="font-size:9px;color:#94a3b8;margin-bottom:2px">${index + 1}단계</div>`;
        return `<div class="sig-box" style="${borderStyle}">${statusLine}<div style="font-weight:700;font-size:12px;color:#111827">${name}</div>${position ? `<div style="font-size:10px;color:#64748b">${position}</div>` : ''}<div style="margin-top:6px;font-size:10px;color:#94a3b8">(인)</div></div>`;
      }).join('')
    : '';
  const referenceSection = ccUsers.length > 0
    ? `<div class="reference"><strong>참조자</strong><span>${ccUsers.map((user) => escapeHtml(user.position ? `${user.name} ${user.position}` : user.name)).join(', ')}</span></div>`
    : '';

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(templateMeta.name || '결재문서')}</title>
  <style>
    body{font-family:'Malgun Gothic',sans-serif;background:#f5f7fb;margin:0;padding:16px;color:#111827}
    .sheet{position:relative;max-width:820px;margin:0 auto;background:#fff;border:1px solid ${escapeHtml(design.borderColor || '#d7e3ff')};border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(15,23,42,.10)}
    .sheet::before{content:'';position:absolute;inset:0;background:url('${escapeHtml(design.backgroundLogoUrl || DEFAULT_APPROVAL_TEMPLATE_DESIGN.backgroundLogoUrl)}') center 52% / 72px 72px no-repeat;opacity:${escapeHtml(String(design.backgroundLogoOpacity ?? DEFAULT_APPROVAL_TEMPLATE_DESIGN.backgroundLogoOpacity))};pointer-events:none;mix-blend-mode:multiply}
    .sheet > *{position:relative;z-index:1}
    .hero{position:relative;padding:20px 28px 14px;background:linear-gradient(135deg, ${escapeHtml(alphaColor(design.primaryColor, 0.14))} 0%, rgba(255,255,255,0) 68%);break-inside:avoid}
    h1{margin:0 0 4px;font-size:22px;line-height:1.2;color:${escapeHtml(design.primaryColor || '#155eef')}}
    .subtitle{font-size:12px;line-height:1.6;color:#475569}
    .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:0 28px 14px;break-inside:avoid}
    .meta div{border:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.9))};border-radius:10px;padding:8px 12px;font-size:12px;background:#fff}
    .meta strong{display:block;margin-bottom:2px;color:#64748b;font-size:11px}
    .body{padding:0 28px 16px;break-inside:avoid}
    .doc-title{font-size:17px;font-weight:800;color:#111827;margin:0 0 8px}
    .content{border:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.9))};border-radius:12px;padding:12px 16px;min-height:60px;font-size:13px;line-height:1.75;white-space:pre-wrap;word-break:break-word}
    .section{padding:0 28px 16px;break-inside:avoid}
    .section-title{margin:0 0 8px;font-size:14px;font-weight:800;color:#111827}
    .supply-warning{margin:0 0 8px;padding:8px 12px;border:1px solid #fecaca;border-radius:10px;background:#fef2f2;color:#b91c1c;font-size:12px;font-weight:700;line-height:1.6}
    .supply-warning strong{margin-right:6px}
    .supply-table{width:100%;border-collapse:collapse;border:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.9))};border-radius:12px;overflow:hidden;font-size:12px}
    .supply-table th,.supply-table td{padding:8px 12px;border-bottom:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.75))};text-align:left;vertical-align:top}
    .supply-table th{background:${escapeHtml(alphaColor(design.primaryColor, 0.08))};font-weight:800;color:#475569}
    .supply-table tbody tr:last-child td{border-bottom:none}
    .warning-mark{display:inline-block;margin-right:4px;color:#dc2626;font-weight:900}
    .warning-note{margin-top:3px;color:#b91c1c;font-size:10px;font-weight:700}
    .reference{display:flex;gap:10px;align-items:flex-start;margin:0 28px 14px;padding:10px 14px;border:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.9))};border-radius:10px;background:${escapeHtml(alphaColor(design.primaryColor, 0.05))};font-size:12px;line-height:1.7;break-inside:avoid}
    .reference strong{min-width:48px;color:${escapeHtml(design.primaryColor || '#155eef')}}
    .approval-line{display:flex;flex-wrap:wrap;gap:8px;padding:0 28px 16px;break-inside:avoid}
    .sig-box{border:1px dashed ${escapeHtml(alphaColor(design.primaryColor || '#155eef', 0.45))};border-radius:10px;padding:10px 14px;min-width:90px;text-align:center;font-size:11px;color:#475569;background:#fff}
    .footer{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:12px 28px 16px;border-top:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.9))};font-size:12px;color:#64748b;break-inside:avoid}
    .seal{width:72px;height:72px;border-radius:999px;border:2px solid ${escapeHtml(alphaColor(design.primaryColor || '#155eef', 0.75))};display:flex;align-items:center;justify-content:center;text-align:center;font-weight:800;font-size:10px;color:${escapeHtml(design.primaryColor || '#155eef')}}
    @media print{body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none;border:none}.hero,.meta,.body,.section,.reference,.approval-line,.footer{break-inside:avoid}}
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <h1>${escapeHtml(design.title || templateMeta.name || '결재 문서')}</h1>
      <div class="subtitle">${escapeHtml(design.subtitle || '')}</div>
    </div>
    <div class="meta">
      <div><strong>회사</strong>${escapeHtml(design.companyLabel || item?.sender_company || '')}</div>
      <div><strong>문서번호</strong>${escapeHtml((item?.doc_number as string) || ((item?.meta_data as Record<string, unknown> | null | undefined)?.doc_number as string) || '-')}</div>
      <div><strong>기안일</strong>${escapeHtml(new Date(item.created_at as string).toLocaleDateString('ko-KR'))}</div>
      <div><strong>문서종류</strong>${escapeHtml(templateMeta.name || item?.type || '-')}</div>
      <div><strong>기안자</strong>${escapeHtml(item?.sender_name || '-')}</div>
      <div><strong>상태</strong>${escapeHtml(item?.status || '-')}</div>
    </div>
    <div class="body">
      <div class="doc-title">${escapeHtml(item?.title || '(제목 없음)')}</div>
      <div class="content">${escapeHtml(item?.content || '-').replace(/\n/g, '<br>')}</div>
    </div>
    ${reportInfoSection}
    ${leaveRequestSection}
    ${supplyItemsSection}
    ${attachmentSection}
    ${referenceSection}
    ${design.showSignArea === false ? '' : `<div class="approval-line">${approvalBoxes}</div>`}
    <div class="footer">
      <div>${escapeHtml(design.footerText || DEFAULT_APPROVAL_TEMPLATE_DESIGN.footerText)}</div>
      ${design.showSeal === false ? '' : `<div class="seal">${escapeHtml(design.sealLabel || `${design.companyLabel || 'SY INC.'} 직인`)}</div>`}
    </div>
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
  const html = buildHtml(item, { autoPrint: true });

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

    iframe.srcdoc = buildHtml(item);
    document.body.appendChild(iframe);
    return;
  }

  const win = window.open('', '_blank');
  if (!win) {
    toast('PDF 미리보기를 열 수 없습니다. 팝업 차단을 확인해 주세요.', 'error');
    return;
  }
  win.document.write(html);
  win.document.close();
}
