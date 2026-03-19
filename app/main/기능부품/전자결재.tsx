'use client';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { canAccessApprovalSection } from '@/lib/access-control';
import { supabase } from '@/lib/supabase';
import { isMissingColumnError, withMissingColumnFallback } from '@/lib/supabase-compat';
import type { StaffMember } from '@/types';
import {
  buildSupplyRequestWorkflowItems,
  fetchSupportInventoryRows,
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
  summarizeSupplyRequestWorkflow,
} from '@/app/main/inventory-utils';
import AttendanceForms from './전자결재서브/근태신청양식';
import SuppliesForm from './전자결재서브/비품구매양식';
import AdminForms from './전자결재서브/관리행정양식';
import FormRequest from './전자결재서브/양식신청';
import AttendanceCorrectionForm from './전자결재서브/출결정정양식';
import RepairRequestForm from './전자결재서브/수리요청서양식';
import AnnualLeavePlanForm from './전자결재서브/연차사용계획서양식';

const APPROVAL_VIEW_KEY = 'erp_approval_view';
const DRAFT_STORAGE_KEY = 'erp_draft_approval';
const LOCAL_APPROVAL_FORM_TYPES_KEY = 'erp_approval_form_types_custom';
const LOCAL_FORM_TEMPLATE_DESIGNS_KEY = 'erp_form_template_designs';
const APPROVAL_OPTIONAL_INSERT_COLUMNS = ['company_id', 'approver_line', 'doc_number'];
const ALL_DOCUMENT_FILTER = '전체 문서';

const APPROVAL_VIEWS = ['기안함', '결재함', '작성하기'] as const;
const BUILTIN_FORM_TYPE_DEFINITIONS = [
  { slug: 'leave', name: '연차/휴가' },
  { slug: 'annual_plan', name: '연차계획서' },
  { slug: 'overtime', name: '연장근무' },
  { slug: 'purchase', name: '물품신청' },
  { slug: 'repair_request', name: '수리요청서' },
  { slug: 'draft_business', name: '업무기안' },
  { slug: 'cooperation', name: '업무협조' },
  { slug: 'generic', name: '양식신청' },
  { slug: 'attendance_fix', name: '출결정정' },
] as const;
const SYSTEM_FORM_TYPE_SLUGS = new Set([...BUILTIN_FORM_TYPE_DEFINITIONS.map((item) => item.slug), 'personnel_order']);
const DEFAULT_APPROVAL_TEMPLATE_DESIGN = {
  title: '결재 문서',
  subtitle: '전자결재 승인 문서',
  companyLabel: 'SY INC.',
  primaryColor: '#155eef',
  borderColor: '#d7e3ff',
  footerText: '전자결재 승인 문서입니다.',
  showSignArea: true,
  showBackgroundLogo: true,
  backgroundLogoUrl: '/logo.png',
  backgroundLogoOpacity: 0.055,
  showSeal: true,
  sealLabel: 'SY INC. 직인',
};

function alphaColor(hexColor: string | undefined, alpha: number) {
  if (!hexColor) return `rgba(21, 94, 239, ${alpha})`;
  const cleaned = hexColor.replace('#', '');
  const expanded = cleaned.length === 3
    ? cleaned.split('').map((char) => `${char}${char}`).join('')
    : cleaned;

  if (expanded.length !== 6) return `rgba(21, 94, 239, ${alpha})`;

  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toLocalDateKey(value: string | number | Date | null | undefined) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function matchesCreatedDateRange(createdAt: string | number | Date | null | undefined, from: string, to: string) {
  if (!from && !to) return true;
  const createdDate = toLocalDateKey(createdAt);
  if (!createdDate) return false;
  if (from && createdDate < from) return false;
  if (to && createdDate > to) return false;
  return true;
}

function normalizeComposeFormType(value?: string) {
  if (!value || value === '인사명령') return '연차/휴가';
  if (value === 'attendance_fix' || value === '출결정정' || value === '출결 정정') return '출결정정';
  if (value === '휴가신청' || value === 'leave') return '연차/휴가';
  return value;
}

function sanitizeCustomFormTypes(
  rows: Array<{ name?: string; slug?: string; is_active?: boolean }> = [],
  builtInFormTypes: string[] = []
) {
  const seen = new Set<string>();

  return rows
    .filter((row) => row?.is_active !== false)
    .map((row) => ({
      name: String(row?.name || '').trim(),
      slug: String(row?.slug || '').trim(),
    }))
    .filter((row) => row.name && row.slug)
    .filter((row) => row.name !== '인사명령')
    .filter((row) => !SYSTEM_FORM_TYPE_SLUGS.has(row.slug))
    .filter((row) => !builtInFormTypes.includes(row.name))
    .filter((row) => {
      if (seen.has(row.slug)) return false;
      seen.add(row.slug);
      return true;
    });
}

interface ApprovalViewProps {
  user: StaffMember | null;
  staffs: StaffMember[];
  selectedCo: string;
  setSelectedCo: (co: string) => void;
  selectedCompanyId?: string | null;
  onRefresh?: () => void;
  initialView?: string | null;
  onViewChange?: (view: string) => void;
  initialComposeRequest?: Record<string, unknown> | null;
  onConsumeComposeRequest?: () => void;
}

export default function ApprovalView({ user, staffs, selectedCo, setSelectedCo, selectedCompanyId, onRefresh, initialView, onViewChange, initialComposeRequest, onConsumeComposeRequest }: ApprovalViewProps) {
  const defaultApprovalView =
    APPROVAL_VIEWS.find((view) => canAccessApprovalSection(user, view)) || '기안함';
  const [viewMode, setViewMode] = useState(
    initialView && APPROVAL_VIEWS.includes(initialView as (typeof APPROVAL_VIEWS)[number]) && canAccessApprovalSection(user, initialView)
      ? initialView
      : defaultApprovalView
  );
  const [approvals, setApprovals] = useState<Record<string, unknown>[]>([]);
  const [formType, setFormType] = useState('연차/휴가');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [approverLine, setApproverLine] = useState<StaffMember[]>([]);
  const [ccLine, setCcLine] = useState<{ id: string; name: string; position?: string | null }[]>([]);
  const [extraData, setExtraData] = useState<Record<string, unknown>>({});
  const [customFormTypes, setCustomFormTypes] = useState<{ name: string; slug: string }[]>([]);
  const [formTemplateDesigns, setFormTemplateDesigns] = useState<Record<string, Record<string, unknown>>>({});
  const [lastDraftByType, setLastDraftByType] = useState<Record<string, Record<string, unknown> | null>>({});
  const [suppliesLoadKey, setSuppliesLoadKey] = useState(0);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<'전체' | '대기' | '승인' | '반려'>('전체');
  const [approvalDocumentFilter, setApprovalDocumentFilter] = useState(ALL_DOCUMENT_FILTER);
  const [approvalDateFrom, setApprovalDateFrom] = useState('');
  const [approvalDateTo, setApprovalDateTo] = useState('');
  const [savedApproverLine, setSavedApproverLine] = useState<StaffMember[]>([]);
  // 결재선 다중 템플릿 (name + line 배열)
  const [approverTemplates, setApproverTemplates] = useState<{id: string; name: string; line: StaffMember[]}[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState('');
  // 결재함 일괄 처리용
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<string[]>([]);
  // 작성하기 자동 저장용
  const [autoSaveMsg, setAutoSaveMsg] = useState<string | null>(null);
  const [draftBanner, setDraftBanner] = useState<boolean>(false);
  const [attendanceCorrectionSeedDates, setAttendanceCorrectionSeedDates] = useState<string[]>([]);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchApprovalsRef = useRef<() => void>(() => {});
  const isMso = user?.company === 'SY INC.' || user?.permissions?.mso === true;
  const visibleApprovalViews = useMemo(
    () => APPROVAL_VIEWS.filter((view) => canAccessApprovalSection(user, view)),
    [user]
  );
  const resolveAccessibleView = useCallback(
    (requestedView?: string | null) => {
      if (
        requestedView &&
        APPROVAL_VIEWS.includes(requestedView as (typeof APPROVAL_VIEWS)[number]) &&
        visibleApprovalViews.includes(requestedView as (typeof APPROVAL_VIEWS)[number])
      ) {
        return requestedView;
      }
      return visibleApprovalViews[0] || null;
    },
    [visibleApprovalViews]
  );

  const BUILTIN_FORM_TYPES = useMemo(
    () => ['연차/휴가', '연차계획서', '연장근무', '물품신청', '수리요청서', '업무기안', '업무협조', '양식신청', '출결정정'],
    []
  );
  const composeFormTabs = useMemo(
    () => [...BUILTIN_FORM_TYPES, ...customFormTypes.map((item) => item.slug)],
    [customFormTypes]
  );
  const resolveApprovalTemplateMeta = useCallback((item: Record<string, unknown>) => {
    const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
    const rawSlug = String(metaData?.form_slug || '').trim();
    const rawType = String(item?.type || '').trim();
    const rawName = String(metaData?.form_name || '').trim();

    const builtinBySlug = BUILTIN_FORM_TYPE_DEFINITIONS.find((template) => template.slug === rawSlug || template.slug === rawType);
    if (builtinBySlug) return builtinBySlug;

    const builtinByName = BUILTIN_FORM_TYPE_DEFINITIONS.find((template) => template.name === rawName || template.name === rawType);
    if (builtinByName) return builtinByName;

    const customBySlug = customFormTypes.find((template) => template.slug === rawSlug || template.slug === rawType);
    if (customBySlug) return customBySlug;

    const customByName = customFormTypes.find((template) => template.name === rawName || template.name === rawType);
    if (customByName) return customByName;

    return {
      slug: rawSlug || rawType || 'generic',
      name: rawName || rawType || '양식신청',
    };
  }, [customFormTypes]);

  const resolveApprovalTemplateDesign = useCallback((item: Record<string, unknown>) => {
    const template = resolveApprovalTemplateMeta(item);
    const storedDesign = template.slug ? (formTemplateDesigns?.[template.slug] || {}) : {};
    const companyLabel = String(storedDesign.companyLabel || item?.sender_company || user?.company || DEFAULT_APPROVAL_TEMPLATE_DESIGN.companyLabel);

    return {
      ...DEFAULT_APPROVAL_TEMPLATE_DESIGN,
      ...storedDesign,
      title: storedDesign.title || template.name || DEFAULT_APPROVAL_TEMPLATE_DESIGN.title,
      subtitle: storedDesign.subtitle || `${template.name || '결재'} 승인 문서`,
      companyLabel,
      sealLabel: storedDesign.sealLabel || `${companyLabel} 직인`,
      templateName: template.name || (item?.type as string) || '결재 문서',
      templateSlug: template.slug || ((item?.meta_data as Record<string, unknown> | null | undefined)?.form_slug as string) || (item?.type as string) || 'generic',
    };
  }, [formTemplateDesigns, resolveApprovalTemplateMeta, user?.company]);

  const openApprovalPrintView = useCallback((item: Record<string, unknown>) => {
    const design = resolveApprovalTemplateDesign(item);
    const templateMeta = resolveApprovalTemplateMeta(item);
    const win = window.open('', '_blank');
    if (!win) return;

    const approvalBoxes = Array.isArray(item?.approver_line)
      ? item.approver_line.map((_: string, index: number) => (
          `<div class="sig-box">${index + 1}단계<br><br><br>(인)</div>`
        )).join('')
      : '';

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(templateMeta.name || '결재문서')}</title>
  <style>
    body{font-family:'Malgun Gothic',sans-serif;background:#f5f7fb;margin:0;padding:24px;color:#111827}
    .sheet{position:relative;max-width:860px;margin:0 auto;background:#fff;border:1px solid ${escapeHtml(design.borderColor || '#d7e3ff')};border-radius:28px;overflow:hidden;box-shadow:0 24px 60px rgba(15,23,42,.12)}
    .sheet::before{content:'';position:absolute;inset:0;background:url('${escapeHtml(design.backgroundLogoUrl || DEFAULT_APPROVAL_TEMPLATE_DESIGN.backgroundLogoUrl)}') center 52% / 88px 88px no-repeat;opacity:${escapeHtml(String(design.backgroundLogoOpacity ?? DEFAULT_APPROVAL_TEMPLATE_DESIGN.backgroundLogoOpacity))};pointer-events:none;mix-blend-mode:multiply}
    .sheet > *{position:relative;z-index:1}
    .hero{position:relative;padding:36px 40px 28px;background:linear-gradient(135deg, ${escapeHtml(alphaColor(design.primaryColor, 0.18))} 0%, rgba(255,255,255,0) 68%)}
    .kicker{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:rgba(255,255,255,.92);font-size:10px;font-weight:800;letter-spacing:.24em;text-transform:uppercase;color:#64748b}
    .dot{width:8px;height:8px;border-radius:999px;background:${escapeHtml(design.primaryColor || '#155eef')}}
    h1{margin:20px 0 8px;font-size:28px;line-height:1.1;color:${escapeHtml(design.primaryColor || '#155eef')}}
    .subtitle{font-size:13px;line-height:1.7;color:#475569}
    .meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:0 40px 28px}
    .meta div{border:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.9))};border-radius:16px;padding:12px 14px;font-size:12px;background:#fff}
    .meta strong{display:block;margin-bottom:4px;color:#64748b}
    .body{padding:0 40px 24px}
    .doc-title{font-size:20px;font-weight:800;color:#111827;margin:0 0 12px}
    .content{border:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.9))};border-radius:20px;padding:18px 20px;min-height:220px;font-size:13px;line-height:1.75;white-space:pre-wrap}
    .approval-line{display:flex;flex-wrap:wrap;gap:12px;padding:0 40px 28px}
    .sig-box{border:1px dashed ${escapeHtml(alphaColor(design.primaryColor || '#155eef', 0.45))};border-radius:18px;padding:12px 16px;min-width:110px;text-align:center;font-size:11px;color:#475569;background:#fff}
    .footer{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding:20px 40px 32px;border-top:1px solid ${escapeHtml(alphaColor(design.borderColor || '#d7e3ff', 0.9))};font-size:12px;color:#64748b}
    .footer strong{display:block;margin-bottom:6px;letter-spacing:.18em;text-transform:uppercase;color:${escapeHtml(design.primaryColor || '#155eef')}}
    .seal{width:92px;height:92px;border-radius:999px;border:3px solid ${escapeHtml(alphaColor(design.primaryColor || '#155eef', 0.75))};display:flex;align-items:center;justify-content:center;text-align:center;font-weight:800;font-size:10px;color:${escapeHtml(design.primaryColor || '#155eef')}}
    @media print { body{background:#fff;padding:0}.sheet{box-shadow:none;border-radius:0;max-width:none;border:none} }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="hero">
      <div class="kicker"><span class="dot"></span> Basic Approval Form</div>
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
    ${design.showSignArea === false ? '' : `<div class="approval-line">${approvalBoxes}</div>`}
    <div class="footer">
      <div>
        <strong>Smart Approval Document</strong>
        <div>${escapeHtml(design.footerText || DEFAULT_APPROVAL_TEMPLATE_DESIGN.footerText)}</div>
      </div>
      ${design.showSeal === false ? '' : `<div class="seal">${escapeHtml(design.sealLabel || `${design.companyLabel || 'SY INC.'} 직인`)}</div>`}
    </div>
  </div>
  <script>window.onload=()=>window.print()</script>
</body>
</html>`);
    win.document.close();
  }, [resolveApprovalTemplateDesign, resolveApprovalTemplateMeta]);

  // 결재자 후보: 부서장 이상(팀장·부장·병원장 등)을 목록 상단에, 그 다음 나머지 직원 (staffs는 이미 메인에서 회사별로 불러옴)
  const APPROVER_POSITIONS = ['팀장', '간호과장', '실장', '부장', '이사', '병원장'];
  const approverCandidates = useMemo(() => {
    if (!Array.isArray(staffs)) return [];
    const order = (s: StaffMember) => {
      const i = APPROVER_POSITIONS.indexOf(s.position || '');
      return i >= 0 ? i : 999;
    };
    return [...staffs].sort((a, b) => order(a) - order(b) || (a.name || '').localeCompare(b.name || ''));
  }, [staffs]);
  const normalizeApprovalLineIds = useCallback((line: unknown): string[] => {
    if (!Array.isArray(line)) return [];
    const ids = line
      .map((entry: unknown) => {
        if (entry == null) return null;
        if (typeof entry === 'string' || typeof entry === 'number') return String(entry);
        if (typeof entry === 'object' && entry !== null && 'id' in entry && (entry as Record<string, unknown>).id != null) return String((entry as Record<string, unknown>).id);
        return null;
      })
      .filter(Boolean) as string[];
    return Array.from(new Set(ids));
  }, []);
  const resolveApprovalLineIds = useCallback((item: Record<string, unknown>): string[] => {
    const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
    const explicitLineIds = normalizeApprovalLineIds(item?.approver_line ?? metaData?.approver_line);
    if (explicitLineIds.length > 0) return explicitLineIds;
    if (item?.current_approver_id != null) return [String(item.current_approver_id)];
    return [];
  }, [normalizeApprovalLineIds]);
  const resolveCurrentApproverId = useCallback((item: Record<string, unknown>): string | null => {
    if (item?.current_approver_id != null) return String(item.current_approver_id);
    const lineIds = resolveApprovalLineIds(item);
    return lineIds[0] ?? null;
  }, [resolveApprovalLineIds]);
  const insertApprovalWithLegacyFallback = useCallback(async (row: Record<string, unknown>) => {
    let candidateRow = { ...row };

    while (true) {
      const result = await supabase.from('approvals').insert([candidateRow]);
      const missingColumn = APPROVAL_OPTIONAL_INSERT_COLUMNS.find(
        (columnName) => columnName in candidateRow && isMissingColumnError(result.error, columnName)
      );

      if (!missingColumn) return result;

      const { [missingColumn]: _removed, ...legacyRow } = candidateRow;
      candidateRow = legacyRow;
    }
  }, []);
  const prepareSupplyApprovalInventoryWorkflow = useCallback(async (item: Record<string, unknown>) => {
    const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
    const requestedItems = Array.isArray(metaData?.items) ? metaData.items : [];
    if (!item?.id || requestedItems.length === 0) {
      return null;
    }

    const { data: sourceInventoryRows, error: sourceInventoryError } = await fetchSupportInventoryRows();

    if (sourceInventoryError) {
      throw sourceInventoryError;
    }

    const inventoryWorkflow = metaData?.inventory_workflow as Record<string, unknown> | null | undefined;
    const workflowItems = buildSupplyRequestWorkflowItems(
      requestedItems,
      sourceInventoryRows || [],
      inventoryWorkflow?.items as unknown[] | undefined,
    );
    const summary = summarizeSupplyRequestWorkflow(workflowItems);
    const now = new Date().toISOString();
    const workflow = {
      status: 'pending',
      source_company: INVENTORY_SUPPORT_COMPANY,
      source_department: INVENTORY_SUPPORT_DEPARTMENT,
      created_at: inventoryWorkflow?.created_at || now,
      updated_at: now,
      items: workflowItems,
      summary,
    };
    const nextMetaData = {
      ...(metaData || {}),
      inventory_workflow: workflow,
    };

    const { error: metaError } = await supabase
      .from('approvals')
      .update({ meta_data: nextMetaData })
      .eq('id', item.id);

    if (metaError) {
      throw metaError;
    }

    try {
      const { data: inventoryManagers } = await supabase
        .from('staff_members')
        .select('id, name')
        .eq('company', INVENTORY_SUPPORT_COMPANY)
        .eq('department', INVENTORY_SUPPORT_DEPARTMENT);

      const managerNotifications = (inventoryManagers || [])
        .map((staff: { id: string; name: string }) => ({
          user_id: staff.id,
          type: 'inventory',
          title: `[물품신청 승인] ${item.title}`,
          body: `${item.sender_name || '신청자'} 요청이 승인되었습니다. 출고 가능 ${summary.issue_ready_count}건, 발주 필요 ${summary.order_required_count}건을 확인해주세요.`,
          metadata: {
            approval_id: item.id,
            workflow_type: 'supply_request_fulfillment',
            source_company: INVENTORY_SUPPORT_COMPANY,
            source_department: INVENTORY_SUPPORT_DEPARTMENT,
            summary,
          },
        }))
        .filter((notification) => notification.user_id);

      const senderNotification = item?.sender_id
        ? [{
            user_id: item.sender_id,
            type: 'approval',
            title: '물품신청이 승인되었습니다',
            body: '경영지원팀이 실시간 재고를 확인한 뒤 불출 또는 발주를 진행합니다.',
            metadata: {
              approval_id: item.id,
              workflow_type: 'supply_request_fulfillment',
              summary,
            },
          }]
        : [];

      const notificationRows = [...managerNotifications, ...senderNotification];
      if (notificationRows.length > 0) {
        await supabase.from('notifications').insert(notificationRows);
      }
    } catch (notificationError) {
      console.error('물품신청 재고 처리 알림 생성 실패:', notificationError);
    }

    return { workflow, summary };
  }, []);
  const canUserApproveItem = useCallback((item: Record<string, unknown>) => {
    if (item?.status !== '대기' || !user?.id) return false;
    return String(resolveCurrentApproverId(item) || '') === String(user.id);
  }, [resolveCurrentApproverId, user?.id]);
  const syncApprovalRouting = useCallback(async (item: Record<string, unknown>, currentApproverId: string | null) => {
    if (!item?.id || !currentApproverId) return null;
    const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
    const storedLineIds = normalizeApprovalLineIds(item.approver_line ?? metaData?.approver_line);
    const updates: Record<string, unknown> = {};

    if (!item.current_approver_id) {
      updates.current_approver_id = currentApproverId;
    }
    if (storedLineIds.length === 0) {
      updates.approver_line = [currentApproverId];
    }
    if (Object.keys(updates).length === 0) return null;

    let effectiveUpdates = { ...updates };
    while (true) {
      if (Object.keys(effectiveUpdates).length === 0) return null;

      const { error } = await supabase.from('approvals').update(effectiveUpdates).eq('id', item.id);
      if (!isMissingColumnError(error, 'approver_line') || !('approver_line' in effectiveUpdates)) {
        if (!error) {
          setApprovals((prev) => prev.map((approval) => (
            approval.id === item.id ? { ...approval, ...effectiveUpdates } : approval
          )));
        }
        return error;
      }

      const { approver_line, ...legacyUpdates } = effectiveUpdates;
      effectiveUpdates = legacyUpdates;
    }
  }, [normalizeApprovalLineIds]);

  useEffect(() => {
    const fallbackTypes = [
      { name: '?닿??좎껌', slug: 'leave' },
      { name: '?곗옣洹쇰Τ', slug: 'overtime' },
      { name: '鍮꾪뭹援щℓ', slug: 'purchase' },
      { name: '異쒓껐?뺤젙', slug: 'attendance_fix' },
      { name: '?묒떇?좎껌', slug: 'generic' }
    ];

    const normalizedFallbackTypes = [
      { name: '연차/휴가', slug: 'leave' },
      { name: '연장근무', slug: 'overtime' },
      { name: '비품구매', slug: 'purchase' },
      { name: '출결정정', slug: 'attendance_fix' },
      { name: '양식신청', slug: 'generic' }
    ];

    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem(LOCAL_APPROVAL_FORM_TYPES_KEY);
        const parsed = stored ? JSON.parse(stored) : [];
        const activeCustomTypes = Array.isArray(parsed)
          ? parsed
              .filter((row: Record<string, unknown>) => row?.is_active !== false)
              .map((row: Record<string, unknown>) => ({ name: row.name as string, slug: row.slug as string }))
              .filter((row: { name: string; slug: string }) => row.name && row.slug)
          : [];
        setCustomFormTypes(activeCustomTypes.length ? activeCustomTypes : normalizedFallbackTypes);
      } catch {
        setCustomFormTypes(normalizedFallbackTypes);
      }
      return;
    }
    supabase.from('approval_form_types').select('name, slug').eq('is_active', true).order('sort_order').then(({ data, error }) => {
      if (!error && data?.length) {
        setCustomFormTypes(data.map((r: { name: string; slug: string }) => ({ name: r.name, slug: r.slug })));
      } else {
        // Fallback hardcoded types if table is missing or empty
        setCustomFormTypes([
          { name: '휴가신청', slug: 'leave' },
          { name: '연장근무', slug: 'overtime' },
          { name: '비품구매', slug: 'purchase' },
          { name: '출결정정', slug: 'attendance_fix' },
          { name: '양식신청', slug: 'generic' }
        ]);
      }
    });
  }, []);

  useEffect(() => {
    setCustomFormTypes((prev) => {
      const next = sanitizeCustomFormTypes(prev, BUILTIN_FORM_TYPES);
      const changed =
        next.length !== prev.length ||
        next.some((item, index) => item.name !== prev[index]?.name || item.slug !== prev[index]?.slug);
      return changed ? next : prev;
    });
  }, [BUILTIN_FORM_TYPES]);

  useEffect(() => {
    const loadFormTemplateDesigns = async () => {
      if (typeof window !== 'undefined') {
        try {
          const localRaw = window.localStorage.getItem(LOCAL_FORM_TEMPLATE_DESIGNS_KEY);
          if (localRaw) {
            const parsed = JSON.parse(localRaw);
            if (parsed && typeof parsed === 'object') {
              setFormTemplateDesigns(parsed);
            }
          }
        } catch {
          // ignore
        }
      }

      try {
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'form_template_designs')
          .maybeSingle();

        if (error) {
          if (!isMissingColumnError(error, 'value')) {
            console.warn('form_template_designs load failed:', error);
          }
          return;
        }

        if (!data?.value) return;

        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        if (parsed && typeof parsed === 'object') {
          setFormTemplateDesigns(parsed);
          if (typeof window !== 'undefined') {
            window.localStorage.setItem(LOCAL_FORM_TEMPLATE_DESIGNS_KEY, JSON.stringify(parsed));
          }
        }
      } catch (error) {
        console.warn('form_template_designs load failed:', error);
      }
    };

    void loadFormTemplateDesigns();
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && user?.id) {
      try {
        const saved = window.localStorage.getItem(`erp_fav_approveline_${user.id}`);
        if (saved) setSavedApproverLine(JSON.parse(saved));
        const savedTpls = window.localStorage.getItem(`erp_approveline_templates_${user.id}`);
        if (savedTpls) setApproverTemplates(JSON.parse(savedTpls));
      } catch { }
    }
  }, [user?.id]);

  // initialView 또는 로컬스토리지에서 탭 복구
  useEffect(() => {
    const nextView = resolveAccessibleView(initialView);
    if (nextView) {
      setViewMode(nextView);
      try { window.localStorage.setItem(APPROVAL_VIEW_KEY, nextView); } catch { /* ignore */ }
      return;
    }
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(APPROVAL_VIEW_KEY);
      const restored = resolveAccessibleView(saved);
      if (restored) setViewMode(restored);
    } catch { /* ignore */ }
  }, [initialView, resolveAccessibleView]);

  useEffect(() => {
    const normalizedView = resolveAccessibleView(viewMode);
    if (!normalizedView || normalizedView === viewMode) return;
    setViewMode(normalizedView);
    if (typeof onViewChange === 'function') onViewChange(normalizedView);
  }, [onViewChange, resolveAccessibleView, viewMode]);

  useEffect(() => {
    if (!initialComposeRequest) return;

    const requestedView =
      typeof initialComposeRequest?.viewMode === 'string' && initialComposeRequest.viewMode.trim()
        ? initialComposeRequest.viewMode
        : '작성하기';
    const nextView = resolveAccessibleView(requestedView);
    const nextFormType = normalizeComposeFormType((initialComposeRequest?.formType || initialComposeRequest?.type) as string | undefined);

    if (!nextView) {
      onConsumeComposeRequest?.();
      return;
    }

    setViewMode(nextView);
    setFormType(nextFormType);
    try { window.localStorage.setItem(APPROVAL_VIEW_KEY, nextView); } catch { /* ignore */ }

    if (nextFormType === '출결정정') {
      const nextDates = Array.isArray(initialComposeRequest?.dates)
        ? initialComposeRequest.dates
        : [initialComposeRequest?.date || initialComposeRequest?.workDate];

      setAttendanceCorrectionSeedDates(
        Array.from(
          new Set(
            nextDates
              .map((value: unknown) => String(value || '').slice(0, 10))
              .filter(Boolean)
          )
        )
      );
    }

    onConsumeComposeRequest?.();
  }, [initialComposeRequest, onConsumeComposeRequest, resolveAccessibleView]);

  const fetchApprovals = useCallback(async () => {
    const scopedCompanyId = !isMso ? user?.company_id : selectedCompanyId;
    const scopedCompanyName = !isMso ? user?.company : selectedCo !== '전체' ? selectedCo : null;
    const { data } = await withMissingColumnFallback(
      async () => {
        let query = supabase.from('approvals').select('*').order('created_at', { ascending: false });
        if (scopedCompanyId) query = query.eq('company_id', scopedCompanyId);
        else if (scopedCompanyName) query = query.eq('sender_company', scopedCompanyName);
        return query;
      },
      async () => {
        let query = supabase.from('approvals').select('*').order('created_at', { ascending: false });
        if (scopedCompanyName) query = query.eq('sender_company', scopedCompanyName);
        return query;
      }
    );
    if (data) setApprovals(data as Record<string, unknown>[]);
  }, [isMso, user?.company_id, user?.company, selectedCompanyId, selectedCo]);

  // 항상 최신 fetchApprovals를 ref에 유지 (realtime 클로저 stale 방지)
  useEffect(() => { fetchApprovalsRef.current = fetchApprovals; }, [fetchApprovals]);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  // 작성하기에서 선택한 유형별로 내가 마지막 상신한 결재 조회 (이전 기안 불러오기용)
  const fetchMyLastApproval = async (type: string) => {
    if (!user?.id) return null;
    const { data } = await supabase
      .from('approvals')
      .select('*')
      .eq('sender_id', user.id)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  };

  useEffect(() => {
    if (viewMode !== '작성하기' || !user?.id || !formType) return;
    fetchMyLastApproval(formType).then((row) => {
      if (row) setLastDraftByType((p) => ({ ...p, [formType]: row }));
      else setLastDraftByType((p) => ({ ...p, [formType]: null }));
    });
  }, [viewMode, formType, user?.id]);

  // 양식(연차/휴가, 연장근무 등) 탭을 바꿀 때마다 제목/내용/추가데이터는 새로 작성하도록 초기화
  // → 한 양식에서 쓰던 내용이 다른 탭으로 "따라가는" 현상 방지
  useEffect(() => {
    if (viewMode !== '작성하기') return;
    setFormTitle('');
    setFormContent('');
    setExtraData({});
  }, [formType, viewMode]);

  const loadLastDraft = useCallback(() => {
    const last = lastDraftByType[formType];
    if (!last) return;
    const lastMeta = last.meta_data as Record<string, unknown> | null | undefined;
    setFormTitle((last.title as string) || '');
    setFormContent((last.content as string) || '');
    setExtraData((lastMeta as Record<string, unknown>) || {});
    const storedApproverLine = Array.isArray(last.approver_line)
      ? last.approver_line as unknown[]
      : Array.isArray(lastMeta?.approver_line)
        ? lastMeta.approver_line as unknown[]
        : [];
    if (storedApproverLine.length > 0 && Array.isArray(staffs)) {
      const line = storedApproverLine
        .map((id) => staffs.find((s) => s.id === (id as string)))
        .filter(Boolean);
      if (line.length > 0) setApproverLine(line as StaffMember[]);
    }
    if (formType === '물품신청' && (lastMeta?.items as unknown[] | null | undefined)?.length) setSuppliesLoadKey((k) => k + 1);
  }, [lastDraftByType, formType, staffs]);

  // 물품신청은 같은 내용을 자주 쓰므로,
  // 작성하기 탭에서 '물품신청'으로 들어왔을 때 마지막 기안을 자동으로 한번 불러와 주고 수정해서 상신할 수 있게 처리
  useEffect(() => {
    if (viewMode !== '작성하기' || formType !== '물품신청') return;
    const last = lastDraftByType['물품신청'];
    if (!last) return;
    // 사용자가 이미 새로 입력을 시작했다면 자동 불러오지 않음
    if (formTitle || formContent) return;
    // 이미 한번 불러온 상태라면(품목 초기화용 키 사용) 다시 불러오지 않음
    if (suppliesLoadKey > 0) return;
    loadLastDraft();
  }, [viewMode, formType, lastDraftByType, formTitle, formContent, suppliesLoadKey, loadLastDraft]);

  // 작성하기 마운트 시 임시저장 여부 확인
  useEffect(() => {
    if (viewMode !== '작성하기') return;
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.formTitle || parsed?.formContent) {
          setDraftBanner(true);
        }
      }
    } catch { /* ignore */ }
  }, [viewMode]);

  // 작성하기 자동 저장: 3초 디바운스
  useEffect(() => {
    if (viewMode !== '작성하기') return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      if (!formTitle && !formContent && Object.keys(extraData).length === 0) return;
      try {
        const now = new Date();
        const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({ formTitle, formContent, extraData, formType, savedAt: hhmm }));
        setAutoSaveMsg(`임시저장됨 ${hhmm}`);
        if (autoSaveMsgTimer.current) clearTimeout(autoSaveMsgTimer.current);
        autoSaveMsgTimer.current = setTimeout(() => setAutoSaveMsg(null), 3000);
      } catch { /* ignore */ }
    }, 3000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [formTitle, formContent, extraData, viewMode]);

  // 임시저장 불러오기
  const loadDraftFromStorage = useCallback(() => {
    try {
      const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      if (parsed?.formTitle) setFormTitle(parsed.formTitle);
      if (parsed?.formContent) setFormContent(parsed.formContent);
      if (parsed?.extraData) setExtraData(parsed.extraData);
      if (parsed?.formType) setFormType(normalizeComposeFormType(parsed.formType));
    } catch { /* ignore */ }
    setDraftBanner(false);
  }, []);

  // 임시저장 삭제
  const clearDraftFromStorage = useCallback(() => {
    try { window.localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  // 결재함 일괄 승인 처리
  const handleBulkApprove = async () => {
    const count = selectedApprovalIds.length;
    if (count === 0) return;
    if (!confirm(`선택된 ${count}건을 일괄 승인하시겠습니까?`)) return;
    const results = await Promise.all(selectedApprovalIds.map(async (id) => {
      const item = approvals.find((a) => a.id === id);
      if (!item) return null;
      const currentApproverId = resolveCurrentApproverId(item);
      if (!currentApproverId || String(currentApproverId) !== String(user?.id)) return id;
      const routingError = await syncApprovalRouting(item, currentApproverId);
      if (routingError) return id;
      const lineIds = resolveApprovalLineIds({ ...item, current_approver_id: currentApproverId, approver_line: normalizeApprovalLineIds(item.approver_line).length > 0 ? item.approver_line : [currentApproverId] });
      const currentIndex = lineIds.findIndex((lid: string) => String(lid) === String(currentApproverId));
      const isFinal = currentIndex === lineIds.length - 1 || currentIndex === -1;
      const updateData: Record<string, unknown> = isFinal ? { status: '승인' } : { current_approver_id: lineIds[currentIndex + 1] };
      const { error } = await supabase.from('approvals').update(updateData).eq('id', id);
      return error ? id : null;
    }));
    const failedCount = results.filter(Boolean).length;
    setSelectedApprovalIds([]);
    if (failedCount > 0) {
      alert(`${count - failedCount}건 승인 완료, ${failedCount}건 실패했습니다.`);
    } else {
      alert(`${count}건이 일괄 승인 처리되었습니다.`);
    }
    fetchApprovals();
  };

  // 결재함 일괄 반려 처리
  const handleBulkReject = async () => {
    const count = selectedApprovalIds.length;
    if (count === 0) return;
    const reason = window.prompt(`선택된 ${count}건을 일괄 반려합니다.\n반려 사유를 입력해 주세요. (선택)`);
    if (reason === null) return;
    const results = await Promise.all(selectedApprovalIds.map(async (id) => {
      const item = approvals.find((a) => a.id === id);
      if (!item) return null;
      const currentApproverId = resolveCurrentApproverId(item);
      if (!currentApproverId || String(currentApproverId) !== String(user?.id)) return id;
      const routingError = await syncApprovalRouting(item, currentApproverId);
      if (routingError) return id;
      const itemMetaData = item.meta_data as Record<string, unknown> | null | undefined;
      const { error } = await supabase.from('approvals').update({
        status: '반려',
        meta_data: { ...(itemMetaData || {}), reject_reason: reason },
      }).eq('id', id);
      return error ? id : null;
    }));
    const failedCount = results.filter(Boolean).length;
    setSelectedApprovalIds([]);
    if (failedCount > 0) {
      alert(`${count - failedCount}건 반려 완료, ${failedCount}건 실패했습니다.`);
    } else {
      alert(`${count}건이 일괄 반려 처리되었습니다.`);
    }
    fetchApprovals();
  };

  useEffect(() => {
    const channel = supabase
      .channel('approvals-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'approvals' }, () => {
        fetchApprovalsRef.current();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleApproveAction = async (item: Record<string, unknown>) => {
    if (!confirm("승인하시겠습니까? 관련 데이터가 즉시 업데이트됩니다.")) return;

    const currentApproverId = resolveCurrentApproverId(item);
    if (!currentApproverId) {
      alert("결재자가 지정되지 않아 승인할 수 없습니다. 결재선을 다시 확인해 주세요.");
      return;
    }
    if (String(currentApproverId) !== String(user?.id)) {
      alert("현재 결재자만 승인할 수 있습니다.");
      return;
    }
    const routingError = await syncApprovalRouting(item, currentApproverId);
    if (routingError) {
      alert("결재선을 초기화하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const itemMetaForLine = item?.meta_data as Record<string, unknown> | null | undefined;
    const lineIds = resolveApprovalLineIds({
      ...item,
      current_approver_id: currentApproverId,
      approver_line:
        normalizeApprovalLineIds(item.approver_line ?? itemMetaForLine?.approver_line).length > 0
          ? (item.approver_line ?? itemMetaForLine?.approver_line)
          : [currentApproverId],
    });
    const currentIndex = lineIds.findIndex((id: string) => String(id) === String(currentApproverId));
    const isFinalApproval = currentIndex === lineIds.length - 1 || currentIndex === -1;

    const updateData: Record<string, unknown> = {};
    if (isFinalApproval) {
      updateData.status = '승인';
    } else {
      updateData.current_approver_id = lineIds[currentIndex + 1];
    }

    const { error: appError } = await supabase.from('approvals').update(updateData).eq('id', item.id);

    if (!appError) {
      if (isFinalApproval) {
        let supplyApprovalSummary: ReturnType<typeof summarizeSupplyRequestWorkflow> | null = null;
        const itemMetaData = item.meta_data as Record<string, unknown> | null | undefined;
        if (item.type === '물품신청' && itemMetaData?.items) {
          try {
            const workflowResult = await prepareSupplyApprovalInventoryWorkflow(item);
            supplyApprovalSummary = workflowResult?.summary ?? null;
          } catch (workflowError) {
            console.error('물품신청 승인 후 재고 처리 준비 실패:', workflowError);
            alert('최종 승인되었지만 경영지원팀 알림 또는 재고 처리 큐 생성에는 실패했습니다. 재고 화면에서 다시 확인해주세요.');
          }
        }

        if (item.type === '인사명령' && itemMetaData?.orderTargetId) {
          const { orderTargetId, newPosition, orderCategory, targetDept } = itemMetaData as { orderTargetId: string; newPosition?: string; orderCategory?: string; targetDept?: string };
          const { data: currentStaff } = await supabase.from('staff_members').select('department, position').eq('id', orderTargetId).single();

          const staffUpdate: Record<string, unknown> = {};
          if (newPosition) staffUpdate.position = newPosition;
          if (orderCategory === '부서 이동(전보)' && targetDept) {
            staffUpdate.department = targetDept;
          }

          if (Object.keys(staffUpdate).length > 0) {
            await supabase.from('staff_members').update(staffUpdate).eq('id', orderTargetId);

            // 인사이동 이력 기록 (staff_transfer_history 테이블이 있다고 가정하고 insert 시도)
            try {
              await supabase.from('staff_transfer_history').insert({
                staff_id: orderTargetId,
                transfer_type: orderCategory,
                before_value: orderCategory === '부서 이동(전보)' ? currentStaff?.department : currentStaff?.position,
                after_value: orderCategory === '부서 이동(전보)' ? targetDept : newPosition,
                effective_date: new Date().toISOString().split('T')[0],
                approval_id: item.id
              });
            } catch (e) { /* 테이블 부재 시 무시 */ }
          }
        }

        if (item.type === '연차/휴가') {
          const startStr = String(itemMetaData?.startDate || itemMetaData?.start || '');
          const endStr = String(itemMetaData?.endDate || itemMetaData?.end || startStr);
          if (!startStr) {
            alert("최종 승인 처리가 완료되었습니다.");
            fetchApprovals();
            return;
          }
          const start = new Date(startStr);
          const end = new Date(endStr || startStr);
          if (isNaN(start.getTime())) {
            alert("최종 승인 처리가 완료되었습니다.");
            fetchApprovals();
            return;
          }
          const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);

          // 1. 인사관리 휴가신청 테이블(leave_requests) 동기화
          try {
            await supabase.from('leave_requests').insert({
              staff_id: item.sender_id,
              leave_type: itemMetaData?.leaveType || '연차',
              start_date: startStr,
              end_date: endStr,
              reason: item.title,
              status: '승인',
              approved_at: new Date().toISOString()
            });
          } catch (e) { /* 테이블 부재 시 무시 */ }

          // 2. 근태/연차 차감 로직 (기존 유지)
          for (let d = 0; d < days; d++) {
            const dte = new Date(start);
            dte.setDate(dte.getDate() + d);
            const dateStr = dte.toISOString().split('T')[0];
            await supabase.from('attendance').upsert({
              staff_id: item.sender_id,
              date: dateStr,
              status: '휴가',
            }, { onConflict: 'staff_id,date' });
          }
          const { data: staff } = await supabase.from('staff_members').select('annual_leave_used').eq('id', item.sender_id).single();
          const used = (Number(staff?.annual_leave_used) || 0) + days;
          await supabase.from('staff_members').update({ annual_leave_used: used }).eq('id', item.sender_id);
        }

        if (item.type === '양식신청' && itemMetaData?.form_type && itemMetaData?.target_staff && itemMetaData?.auto_issue) {
          try {
            const sn = `CERT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-6)}`;
            await supabase.from('certificate_issuances').insert({
              staff_id: itemMetaData.target_staff,
              cert_type: itemMetaData.form_type,
              serial_no: sn,
              purpose: itemMetaData.purpose || '제출용',
              issued_by: user?.id,
            });
          } catch (_) { }
        }

        if (supplyApprovalSummary) {
          alert(`최종 승인되었습니다. 경영지원팀에 처리 알림을 보냈습니다.\n출고 가능 ${supplyApprovalSummary.issue_ready_count}건, 발주 필요 ${supplyApprovalSummary.order_required_count}건`);
        } else {
          alert("최종 승인 처리가 완료되었습니다.");
        }
      } else {
        alert("승인되어 다음 결재자에게 진행되었습니다.");
      }
      fetchApprovals();
    } else {
      alert("승인 처리에 실패했습니다. " + (appError?.message || ""));
    }
  };

  const handleRejectAction = async (item: Record<string, unknown>) => {
    const currentApproverId = resolveCurrentApproverId(item);
    if (!currentApproverId) {
      alert("결재자가 지정되지 않아 반려할 수 없습니다. 결재선을 다시 확인해 주세요.");
      return;
    }
    if (String(currentApproverId) !== String(user?.id)) {
      alert("현재 결재자만 반려할 수 있습니다.");
      return;
    }
    const reason = window.prompt("반려 사유를 입력해 주세요. (선택)");
    if (reason === null) return;
    const routingError = await syncApprovalRouting(item, currentApproverId);
    if (routingError) {
      alert("결재선을 초기화하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const rejectMetaData = item.meta_data as Record<string, unknown> | null | undefined;
    const { error } = await supabase
      .from('approvals')
      .update({ status: '반려', meta_data: { ...(rejectMetaData || {}), reject_reason: reason } })
      .eq('id', item.id);
    if (!error) {
      alert("반려 처리되었습니다.");
      fetchApprovals();
    } else {
      alert("반려 처리에 실패했습니다. " + (error?.message || ""));
    }
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      alert("로그인한 직원 계정으로만 기안할 수 있습니다.");
      return;
    }
    if (!formTitle || approverLine.length === 0) {
      alert("제목과 결재선을 지정해주세요.");
      return;
    }

    const requiredCc = formType === '물품신청' ? ['관리팀', '행정팀'] : ['행정팀'];
    const extraCc = Array.isArray(extraData?.cc_departments) ? extraData.cc_departments as string[] : [];
    const cc_departments = Array.from(new Set([...extraCc, ...requiredCc]));

    // 문서번호 자동 채번: 연도-월-순번
    const now = new Date();
    const docPrefix = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const { count } = await supabase.from('approvals').select('id', { count: 'exact', head: true });
    const docNumber = `${docPrefix}-${String((count || 0) + 1).padStart(4, '0')}`;
    const selectedCustomForm = customFormTypes.find((item) => item.slug === formType);
    const builtInForm = BUILTIN_FORM_TYPE_DEFINITIONS.find((item) => item.slug === formType || item.name === formType);
    const resolvedFormSlug = selectedCustomForm?.slug || builtInForm?.slug || formType;
    const resolvedFormName = selectedCustomForm?.name || builtInForm?.name || formType;

    const row: Record<string, unknown> = {
      sender_id: user.id,
      sender_name: user.name || '이름 없음',
      sender_company: user.company || '',
      current_approver_id: approverLine[0].id,
      approver_line: approverLine.map((a) => a.id),
      type: formType,
      title: formTitle,
      content: formContent || '',
      meta_data: {
        ...extraData,
        form_slug: resolvedFormSlug,
        form_name: resolvedFormName,
        cc_departments,
        cc_users: ccLine.map(c => ({ id: c.id, name: c.name })),
        approver_line: approverLine.map((a) => a.id),
        doc_number: docNumber,
      },
      doc_number: docNumber,
      status: '대기',
    };
    const companyId = user.company_id ?? selectedCompanyId ?? null;
    if (companyId != null) row.company_id = companyId;

    const { error } = await insertApprovalWithLegacyFallback(row);

    if (error) {
      console.error('기안 상신 실패:', error);
      alert("기안이 올라가지 않았습니다.\n\n" + (error.message || ""));
      return;
    }
    clearDraftFromStorage();
    alert("상신 완료!");
    const nextView = resolveAccessibleView('기안함');
    if (nextView) {
      setViewMode(nextView);
      if (typeof onViewChange === 'function') onViewChange(nextView);
    }
    fetchApprovals();
    if (onRefresh) onRefresh();
  };

  const byCompany = useMemo(() => {
    if (selectedCo === '전체') return approvals;
    return approvals.filter((a) => a.sender_company === selectedCo);
  }, [approvals, selectedCo]);

  const draftBaseList = useMemo(() => {
    return byCompany.filter((a) => a.sender_id === user?.id);
  }, [byCompany, user?.id]);

  const approvalBaseList = useMemo(() => {
    const uid = user?.id != null ? String(user.id) : '';
    return byCompany.filter((a) => {
      const lineIds = resolveApprovalLineIds(a);
      const currentApproverId = resolveCurrentApproverId(a);
      return lineIds.some((id: string) => String(id) === uid) || String(currentApproverId || '') === uid;
    });
  }, [byCompany, resolveApprovalLineIds, resolveCurrentApproverId, user?.id]);

  const documentTypeOptions = useMemo(() => {
    const source = viewMode === '기안함' ? draftBaseList : approvalBaseList;
    return Array.from(
      new Set(
        source
          .map((item) => String(item?.type || '').trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, 'ko-KR'));
  }, [approvalBaseList, draftBaseList, viewMode]);

  const dateRangeInvalid = Boolean(approvalDateFrom && approvalDateTo && approvalDateFrom > approvalDateTo);
  const applyListFilters = useCallback((items: Record<string, unknown>[]) => {
    let filtered = approvalStatusFilter === '전체'
      ? items
      : items.filter((item) => item.status === approvalStatusFilter);

    if (approvalDocumentFilter !== ALL_DOCUMENT_FILTER) {
      filtered = filtered.filter((item) => item.type === approvalDocumentFilter);
    }

    if (approvalDateFrom || approvalDateTo) {
      filtered = filtered.filter((item) => matchesCreatedDateRange(item.created_at as string | null, approvalDateFrom, approvalDateTo));
    }

    return filtered;
  }, [approvalDateFrom, approvalDateTo, approvalDocumentFilter, approvalStatusFilter]);

  const draftBoxList = useMemo(() => {
    return applyListFilters(draftBaseList);
  }, [applyListFilters, draftBaseList]);

  const approvalBoxList = useMemo(() => {
    return applyListFilters(approvalBaseList);
  }, [applyListFilters, approvalBaseList]);

  const listForView = viewMode === '기안함' ? draftBoxList : approvalBoxList;

  // 결재함에서 일괄 처리 대상: status가 '대기'이며 내가 current_approver인 항목
  const bulkTargetList = useMemo(() => {
    if (viewMode !== '결재함') return [];
    return approvalBoxList.filter(
      (a) => canUserApproveItem(a)
    );
  }, [approvalBoxList, canUserApproveItem, viewMode]);

  const allBulkSelected = bulkTargetList.length > 0 && bulkTargetList.every((a) => selectedApprovalIds.includes(a.id as string));

  useEffect(() => {
    setSelectedApprovalIds((prev) => prev.filter((id) => bulkTargetList.some((item) => item.id === id)));
  }, [bulkTargetList]);

  useEffect(() => {
    if (approvalDocumentFilter !== ALL_DOCUMENT_FILTER && !documentTypeOptions.includes(approvalDocumentFilter)) {
      setApprovalDocumentFilter(ALL_DOCUMENT_FILTER);
    }
  }, [approvalDocumentFilter, documentTypeOptions]);

  if (visibleApprovalViews.length === 0) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center bg-[var(--muted)] p-4 text-center"
        data-testid="approval-view"
      >
        <div className="mb-4 text-6xl">🔒</div>
        <h2 className="text-xl font-bold text-[var(--foreground)]">전자결재 접근 권한이 없습니다.</h2>
        <p className="mt-2 text-sm font-semibold text-[var(--toss-gray-3)]">
          메인 메뉴 권한과 전자결재 세부 권한을 확인해 주세요.
        </p>
      </div>
    );
  }

  const toggleSelectAll = () => {
    if (allBulkSelected) {
      setSelectedApprovalIds([]);
    } else {
      setSelectedApprovalIds(bulkTargetList.map((a) => a.id as string));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedApprovalIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-x-hidden app-page"
      data-testid="approval-view"
    >
      {/* 상세 메뉴(기안함·결재함·작성하기)는 메인 좌측 사이드바에서 전자결재 호버/클릭 시 플라이아웃으로 선택 */}
      {/* 메인 콘텐츠 */}
      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-5 bg-[var(--page-bg)] custom-scrollbar">
        {viewMode === '작성하기' ? (
          <div className="max-w-4xl mx-auto space-y-4 md:space-y-5">
            {/* 임시저장 복구 배너 */}
            {draftBanner && (
              <div className="flex items-center gap-3 p-4 bg-[var(--card)] border border-[var(--accent)]/30 rounded-[var(--radius-md)] shadow-sm animate-in fade-in duration-300">
                <span className="text-[13px] font-bold text-[var(--foreground)] flex-1">저장된 임시저장이 있습니다.</span>
                <button
                  type="button"
                  onClick={loadDraftFromStorage}
                  className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-[11px] font-bold hover:opacity-90 transition-all shrink-0"
                >
                  불러오기
                </button>
                <button
                  type="button"
                  onClick={() => { clearDraftFromStorage(); setDraftBanner(false); }}
                  className="px-4 py-2 bg-[var(--muted)] text-[var(--toss-gray-3)] border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold hover:bg-[var(--toss-gray-2)] transition-all shrink-0"
                >
                  무시
                </button>
              </div>
            )}
            <div className="bg-[var(--card)] p-4 md:p-4 rounded-[var(--radius-lg)] md:rounded-[var(--radius-xl)] border border-[var(--border)] shadow-sm space-y-4 md:space-y-4">
              <div className="bg-[var(--toss-blue-light)] p-4 md:p-5 rounded-[var(--radius-lg)] border border-[var(--toss-blue-light)] space-y-3">
                <div className="flex justify-start md:justify-end">
                  <div className="flex gap-0.5 p-1 app-tab-bar w-full md:w-auto overflow-x-auto no-scrollbar">
                    {['전체', '박철홍정형외과', '수연의원', 'SY INC.'].map(co => (
                      <button
                        key={co}
                        onClick={() => setSelectedCo(co)}
                        className={`min-h-[44px] touch-manipulation flex-1 md:flex-none px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-bold transition-all whitespace-nowrap ${selectedCo === co ? 'bg-[var(--card)] shadow-sm text-[var(--accent)]' : 'text-[var(--toss-gray-3)]'}`}
                      >
                        {co}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 items-start">
                  <select data-testid="approval-approver-select" onChange={(e) => {
                    const s = approverCandidates.find((st) => st.id === e.target.value);
                    if (s && !approverLine.find(al => al.id === s.id)) setApproverLine([...approverLine, s]);
                    e.target.value = '';
                  }} className="min-w-0 p-3 bg-[var(--input-bg)] rounded-[var(--radius-md)] text-xs font-bold border border-[var(--border)] outline-none shadow-sm">
                    <option value="">결재자 추가...</option>
                    {approverCandidates.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} {s.position || ''} {s.company ? `(${s.company})` : ''}</option>
                    ))}
                  </select>
                  <select onChange={e => {
                    const s = staffs.find((sf) => String(sf.id) === e.target.value);
                    if (s && !ccLine.find(c => c.id === s.id)) setCcLine(prev => [...prev, { id: s.id, name: s.name, position: s.position }]);
                    e.target.value = '';
                  }} className="min-w-0 p-3 bg-[var(--input-bg)] rounded-[var(--radius-md)] text-xs font-bold border border-[var(--border)] outline-none shadow-sm">
                    <option value="">참조자 추가...</option>
                    {staffs.filter((s) => !ccLine.find(c => c.id === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name} ({s.position})</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => { setTemplateNameInput(''); setShowTemplateModal(true); }}
                    className="px-3 py-3 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] font-bold text-[var(--accent)] hover:bg-[var(--muted)] whitespace-nowrap"
                  >
                    💾 템플릿 저장
                  </button>
                  {approverTemplates.length > 0 && (
                    <div className="relative group col-span-3 justify-self-end">
                      <button type="button" className="w-full sm:w-auto px-4 py-3 bg-[var(--accent)] border border-[var(--accent)] rounded-[var(--radius-md)] text-[11px] font-bold text-white shadow-sm hover:opacity-95">
                        📂 템플릿 불러오기 ({approverTemplates.length})
                      </button>
                      <div className="absolute right-0 top-full mt-1 w-56 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm z-50 hidden group-hover:block">
                        {approverTemplates.map(tpl => (
                          <div key={tpl.id} className="flex items-center justify-between px-3 py-2 hover:bg-[var(--muted)] first:rounded-t-[12px] last:rounded-b-[12px]">
                            <button
                              type="button"
                              onClick={() => setApproverLine(tpl.line)}
                              className="flex-1 text-left text-xs font-semibold text-[var(--foreground)]"
                            >
                              {tpl.name}
                              <span className="text-[10px] text-[var(--toss-gray-3)] ml-1">({tpl.line.length}명)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const next = approverTemplates.filter(t => t.id !== tpl.id);
                                setApproverTemplates(next);
                                if (typeof window !== 'undefined' && user?.id) {
                                  window.localStorage.setItem(`erp_approveline_templates_${user.id}`, JSON.stringify(next));
                                }
                              }}
                              className="ml-2 text-[var(--toss-gray-3)] hover:text-red-500 text-xs"
                            >✕</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">{approverLine.map((a, i) => <div key={i} className="bg-[var(--card)] px-4 py-2.5 rounded-[var(--radius-md)] border border-[var(--border)] text-[11px] font-bold shadow-sm text-[var(--accent)] flex items-center gap-2">{i + 1}. {a.name} {a.position} <button onClick={() => setApproverLine(approverLine.filter((_, idx) => idx !== i))} className="ml-1 text-[var(--toss-gray-3)] hover:text-red-500">✕</button></div>)}</div>
                {ccLine.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {ccLine.map((c, i) => (
                      <div key={i} className="bg-yellow-50 border border-yellow-200 px-3 py-1.5 rounded-[var(--radius-md)] text-[11px] font-bold text-yellow-700 flex items-center gap-1.5">
                        CC {c.name} <button onClick={() => setCcLine(prev => prev.filter((_, idx) => idx !== i))} className="text-yellow-400 hover:text-red-500">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-5 bg-gradient-to-r from-[var(--card)] to-transparent" />
                  <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-5 bg-gradient-to-l from-[var(--card)] to-transparent" />
                  <div className="flex w-full gap-1.5 overflow-x-auto no-scrollbar rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--muted)] p-1.5 scroll-smooth snap-x snap-mandatory">
                    {composeFormTabs.map((t, idx) => {
                      const label = BUILTIN_FORM_TYPES.includes(t) ? t : (customFormTypes.find(c => c.slug === t)?.name ?? t);
                      return (
                        <button
                          type="button"
                          key={`${t}-${idx}`}
                          data-testid={`approval-form-type-${idx}`}
                          onClick={() => setFormType(normalizeComposeFormType(t))}
                          className={`snap-start shrink-0 rounded-[var(--radius-md)] px-3 py-2 text-[11px] font-bold leading-tight whitespace-nowrap transition-all cursor-pointer touch-manipulation ${formType === t ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm ring-1 ring-[var(--accent)]/10' : 'text-[var(--toss-gray-3)] hover:bg-[var(--card)]/80 hover:text-[var(--toss-gray-5)]'}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {formType !== '양식신청' && lastDraftByType[formType] && (
                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-[var(--radius-lg)]">
                  <span className="text-[11px] font-bold text-amber-700">
                    마지막 상신: {(lastDraftByType[formType]!.title as string) || '(제목 없음)'} · {new Date(lastDraftByType[formType]!.created_at as string).toLocaleDateString()}
                  </span>
                  <button
                    type="button"
                    onClick={loadLastDraft}
                    className="shrink-0 px-4 py-2 rounded-[var(--radius-lg)] bg-amber-500 text-white text-[11px] font-semibold hover:bg-amber-600 transition-all"
                  >
                    이전 기안 불러오기
                  </button>
                </div>
              )}

              <div className="min-h-[200px] animate-in fade-in duration-500">
                {['연차/휴가', '연장근무'].includes(formType) ? (
                  <AttendanceForms user={user} staffs={staffs} formType={formType} setExtraData={setExtraData} setFormTitle={setFormTitle} />
                ) : formType === '물품신청' ? (
                  <SuppliesForm key={suppliesLoadKey} setExtraData={setExtraData} initialItems={suppliesLoadKey > 0 ? ((lastDraftByType['물품신청']?.meta_data as Record<string, unknown> | null | undefined)?.items as unknown[] | undefined) : undefined} />
                ) : formType === '수리요청서' ? (
                  <RepairRequestForm setExtraData={setExtraData} />
                ) : formType === '양식신청' ? (
                  <FormRequest user={user} staffs={staffs} />
                ) : formType === '출결정정' ? (
                  <AttendanceCorrectionForm
                    user={user}
                    staffs={staffs}
                    initialSelectedDates={attendanceCorrectionSeedDates}
                    onConsumeInitialSelectedDates={() => setAttendanceCorrectionSeedDates([])}
                  />
                ) : formType === '연차계획서' ? (
                  <AnnualLeavePlanForm user={user} staffs={staffs} setExtraData={setExtraData} setFormTitle={setFormTitle} />
                ) : (
                  <AdminForms staffs={staffs as { id: string; name: string; position: string }[]} formType={formType} setExtraData={setExtraData} />
                )}
              </div>

              {formType !== '양식신청' && (
                <div className="space-y-4 pt-8 md:pt-10 border-t border-[var(--border)]">
                  <input
                    data-testid="approval-title-input"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    className="w-full p-4 md:p-5 bg-[var(--muted)] rounded-[var(--radius-md)] font-bold outline-none text-lg md:text-xl focus:ring-2 focus:ring-[var(--accent)]/20 border border-[var(--border)] transition-all"
                    placeholder="기안 제목을 입력하세요"
                  />
                  <textarea
                    data-testid="approval-content-input"
                    value={formContent}
                    onChange={e => setFormContent(e.target.value)}
                    className="w-full h-48 md:h-56 p-4 md:p-4 bg-[var(--muted)] rounded-[var(--radius-lg)] outline-none text-sm font-bold leading-relaxed border border-[var(--border)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-all"
                    placeholder="상세 사유 및 내용을 입력하세요."
                  />
                  <button
                    data-testid="approval-submit-button"
                    onClick={handleSubmit}
                    className="w-full py-4 md:py-5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] font-bold text-sm shadow-sm hover:opacity-95 active:scale-[0.99] transition-all"
                  >
                    결재 상신
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="shrink-0">
                <h2 className="text-xl font-bold text-[var(--foreground)]">{viewMode} <span className="text-[var(--accent)] ml-2">{listForView.length}건</span></h2>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 shadow-sm lg:flex-nowrap lg:justify-center">
                  <span className="shrink-0 text-xs font-bold text-[var(--foreground)]">기안일</span>
                  <select
                    value={approvalDocumentFilter}
                    onChange={(e) => setApprovalDocumentFilter(e.target.value)}
                    className="h-10 min-w-[128px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                    aria-label="문서 종류 선택"
                    data-testid="approval-document-filter"
                  >
                    <option value={ALL_DOCUMENT_FILTER}>{ALL_DOCUMENT_FILTER}</option>
                    {documentTypeOptions.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={approvalDateFrom}
                    onChange={(e) => setApprovalDateFrom(e.target.value)}
                    className="h-10 min-w-[138px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                    aria-label="조회 시작일"
                  />
                  <span className="text-sm font-semibold text-[var(--toss-gray-3)]">~</span>
                  <input
                    type="date"
                    value={approvalDateTo}
                    onChange={(e) => setApprovalDateTo(e.target.value)}
                    className="h-10 min-w-[138px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--input-bg)] px-3 text-sm font-semibold text-[var(--foreground)] outline-none focus:border-[var(--accent)]"
                    aria-label="조회 종료일"
                  />
                  {(approvalDocumentFilter !== ALL_DOCUMENT_FILTER || approvalDateFrom || approvalDateTo) && (
                    <button
                      type="button"
                      onClick={() => {
                        setApprovalDocumentFilter(ALL_DOCUMENT_FILTER);
                        setApprovalDateFrom('');
                        setApprovalDateTo('');
                      }}
                      className="h-10 shrink-0 rounded-[var(--radius-md)] border border-[var(--border)] px-3 text-sm font-bold text-[var(--toss-gray-3)] hover:bg-[var(--muted)]"
                    >
                      초기화
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-1.5 p-1.5 bg-[var(--muted)] rounded-[var(--radius-lg)] w-full lg:w-auto overflow-x-auto no-scrollbar shrink-0">
                {[
                  { value: '전체' as const, label: '전체' },
                  { value: '대기' as const, label: '대기중' },
                  { value: '승인' as const, label: '승인됨' },
                  ...(viewMode === '기안함' ? [{ value: '반려' as const, label: '반려' }] : []),
                ].map(({ value, label }) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setApprovalStatusFilter(value)}
                    className={`shrink-0 px-4 py-2 rounded-[var(--radius-md)] text-xs font-bold transition-all whitespace-nowrap ${approvalStatusFilter === value ? 'bg-[var(--card)] text-[var(--accent)] shadow-sm' : 'text-[var(--toss-gray-3)] hover:text-[var(--toss-gray-4)]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {viewMode === '기안함' && approvalStatusFilter === '대기' && listForView.length > 0 && (
              <p className="text-xs text-[var(--toss-gray-3)]">대기중인 문서는 결재자가 <strong className="text-[var(--accent)]">결재함</strong>에서 승인·반려합니다. 내가 결재자이면 카드에 버튼이 표시됩니다.</p>
            )}

            {dateRangeInvalid && (
              <p className="text-[11px] font-semibold text-red-500">종료일은 시작일보다 빠를 수 없습니다.</p>
            )}

            {/* 결재함 일괄 처리 바 */}
            {viewMode === '결재함' && bulkTargetList.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 p-4 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-md)] shadow-sm animate-in fade-in duration-200">
                <label className="flex items-center gap-2 cursor-pointer select-none shrink-0" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={allBulkSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
                  />
                  <span className="text-sm font-bold text-[var(--foreground)]">전체 선택</span>
                </label>
                {selectedApprovalIds.length > 0 && (
                  <span className="text-xs font-bold text-[var(--accent)] bg-[var(--toss-blue-light)] px-3 py-1 rounded-[var(--radius-md)]">
                    {selectedApprovalIds.length}건 선택됨
                  </span>
                )}
                <div className="flex gap-2 ml-auto shrink-0">
                  <button
                    type="button"
                    disabled={selectedApprovalIds.length === 0}
                    onClick={handleBulkApprove}
                    className="px-5 py-2.5 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-xs font-bold shadow-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    일괄 승인
                  </button>
                  <button
                    type="button"
                    disabled={selectedApprovalIds.length === 0}
                    onClick={handleBulkReject}
                    className="px-5 py-2.5 bg-red-50 text-red-600 border border-red-200 rounded-[var(--radius-md)] text-xs font-bold shadow-sm hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    일괄 반려
                  </button>
                </div>
              </div>
            )}

            {listForView.length === 0 ? (
              <div className="h-96 flex flex-col items-center justify-center opacity-20">
                <span className="text-6xl mb-4">📄</span>
                <p className="font-semibold text-base">
                  {approvalStatusFilter === '전체' ? '조건에 맞는 결재 내역이 없습니다.' : `${approvalStatusFilter === '대기' ? '대기중' : approvalStatusFilter === '승인' ? '승인된' : '반려된'} 건이 없습니다.`}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 sm:[grid-template-columns:repeat(auto-fill,minmax(176px,176px))] sm:justify-start">
                {listForView.map((item) => {
                  const itemId = item.id as string;
                  const itemType = item.type as string | null | undefined;
                  const itemStatus = item.status as string | null | undefined;
                  const itemSenderCompany = item.sender_company as string | null | undefined;
                  const itemTitle = item.title as string | null | undefined;
                  const itemSenderName = item.sender_name as string | null | undefined;
                  const itemCreatedAt = item.created_at as string;
                  const itemDocNumber = item.doc_number as string | null | undefined;
                  const lineIds = resolveApprovalLineIds(item);
                  const currentApproverId = resolveCurrentApproverId(item);
                  const steps = lineIds.map((id: string, i: number) => {
                    const staff = Array.isArray(staffs) ? staffs.find((s) => s.id === id) : null;
                    const name = staff?.name || '?';
                    const isCurrent = String(id) === String(currentApproverId || '');
                    return { step: i + 1, name, isCurrent };
                  });
                  const currentStep = steps.find((s: { step: number; name: string; isCurrent: boolean }) => s.isCurrent) || null;
                  const isBulkTarget = viewMode === '결재함' && canUserApproveItem(item);
                  const isChecked = selectedApprovalIds.includes(itemId);
                  const templateMeta = resolveApprovalTemplateMeta(item);
                  const templateDesign = resolveApprovalTemplateDesign(item);
                  return (
                    <div
                      key={itemId}
                      data-testid={`approval-card-${itemId}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedApprovalId(itemId)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedApprovalId(itemId); } }}
                      className={`w-full min-h-[112px] bg-[var(--card)] px-2 py-1.5 border rounded-[var(--radius-md)] shadow-sm flex flex-col justify-between gap-1 group hover:border-[var(--accent)]/30 hover:shadow-md transition-all animate-in fade-in-up cursor-pointer ${isChecked ? 'border-[var(--accent)]/50 bg-[var(--toss-blue-light)]' : 'border-[var(--border)]'}`}
                    >
                      <div className="flex gap-1 items-start flex-1 min-w-0">
                        {/* 일괄 처리 체크박스 (결재함 대기 항목에만 표시) */}
                        {isBulkTarget && (
                          <div onClick={(e) => { e.stopPropagation(); toggleSelectOne(itemId); }} className="shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleSelectOne(itemId)}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 accent-[var(--accent)] rounded cursor-pointer"
                            />
                          </div>
                        )}
                        <div
                          className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-[11px] shadow-inner transition-colors"
                          style={{ backgroundColor: alphaColor(templateDesign.primaryColor, 0.12), color: templateDesign.primaryColor || '#155eef' }}
                        >
                          {itemType === '물품신청' ? '📦' : itemType === '양식신청' ? '📄' : itemType === '인사명령' ? '🎖️' : itemType === '수리요청서' ? '🔧' : '📋'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap gap-0.5 mb-0 items-center">
                            <span
                              className="px-1.5 py-[2px] rounded-md text-[10px] font-semibold"
                              style={{ backgroundColor: alphaColor(templateDesign.primaryColor, 0.1), color: templateDesign.primaryColor || '#155eef' }}
                            >
                              {templateMeta.name || itemType}
                            </span>
                            <span className={`px-1.5 py-[2px] rounded-md text-[10px] font-semibold ${itemStatus === '승인' ? 'bg-green-100 text-green-600' : itemStatus === '반려' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-500'}`}>{itemStatus}</span>
                            <span className="px-1.5 py-[2px] bg-[var(--toss-blue-light)] rounded-md text-[10px] font-semibold text-[var(--accent)]">{itemSenderCompany}</span>
                          </div>
                          <h3 className="font-semibold text-[13px] text-[var(--foreground)] tracking-tight line-clamp-2 leading-[1.35]">{itemTitle}</h3>
                          <p className="text-[10px] text-[var(--toss-gray-3)] font-medium mt-0.5 line-clamp-2 leading-[1.35]">기안자: {itemSenderName || '사용자'} | {new Date(itemCreatedAt).toLocaleDateString()}{itemDocNumber && ` | 문서번호: ${itemDocNumber}`}</p>
                          {steps.length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-0.5">
                              <span className="inline-flex items-center px-1.5 py-[2px] rounded-md text-[10px] font-semibold bg-[var(--muted)] text-[var(--toss-gray-3)]">결재선 {steps.length}명</span>
                              {itemStatus === '승인' ? (
                                <span className="inline-flex items-center px-1.5 py-[2px] rounded-md text-[10px] font-semibold bg-green-50 text-green-600">최종 승인</span>
                              ) : currentStep ? (
                                <span className="inline-flex items-center px-1.5 py-[2px] rounded-md text-[10px] font-semibold bg-amber-100 text-amber-700">현재 {currentStep.step}. {currentStep.name}</span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1 shrink-0 pt-0" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => {
                          openApprovalPrintView(item);
                          return;
                          const win = window.open('', '_blank')!;
                          win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>결재문서</title><style>body{font-family:'Malgun Gothic',sans-serif;padding:30px;max-width:800px;margin:0 auto}h1{font-size:20px;text-align:center;border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px;font-size:12px}.meta div{border:1px solid #ccc;padding:8px;border-radius:4px}.content{border:1px solid #ccc;padding:15px;min-height:200px;font-size:13px;line-height:1.6;border-radius:4px}.approval-line{margin-top:20px;display:flex;gap:10px}.sig-box{border:1px solid #ccc;padding:10px;min-width:80px;text-align:center;font-size:11px}@media print{button{display:none}}</style></head><body><h1>결 재 문 서</h1><div class="meta"><div><strong>문서번호:</strong> ${itemDocNumber || '-'}</div><div><strong>기안일:</strong> ${new Date(itemCreatedAt).toLocaleDateString('ko-KR')}</div><div><strong>기안자:</strong> ${itemSenderName}</div><div><strong>소속:</strong> ${itemSenderCompany}</div><div><strong>문서종류:</strong> ${itemType}</div><div><strong>상태:</strong> ${itemStatus}</div></div><h3 style="font-size:16px;margin-bottom:10px">${itemTitle}</h3><div class="content">${((item.content as string) || '').replace(/\n/g, '<br>')}</div><div class="approval-line">${((item.approver_line as string[]) || []).map((id: string, i: number) => `<div class="sig-box">${i + 1}단계<br><br><br>(인)</div>`).join('')}</div><script>window.onload=()=>window.print()</script></body></html>`);
                          win.document.close();
                        }} className="px-2 py-1 bg-[var(--tab-bg)] text-[var(--toss-gray-4)] border border-[var(--border)] rounded-md text-[10px] font-semibold hover:bg-[var(--muted)]">PDF</button>
                        {(viewMode === '결재함' || (viewMode === '기안함' && itemStatus === '대기')) && canUserApproveItem(item) && (
                          <>
                            <button type="button" onClick={() => handleApproveAction(item)} className="px-2 py-1 bg-[var(--accent)] text-white rounded-md text-[10px] font-semibold shadow-sm hover:opacity-95 active:scale-[0.98] transition-all">승인</button>
                            <button type="button" onClick={() => handleRejectAction(item)} className="px-2 py-1 bg-red-50 text-red-600 border border-red-200 rounded-md text-[10px] font-semibold shadow-sm hover:bg-red-100 active:scale-[0.98] transition-all">반려</button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* 자동 저장 메시지 (우하단 고정, 작성하기 뷰에서만) */}
      {viewMode === '작성하기' && autoSaveMsg && (
        <div className="fixed bottom-8 right-6 z-[90] pointer-events-none animate-in fade-in duration-300">
          <span className="text-[11px] font-bold text-[var(--toss-gray-3)] bg-[var(--card)] border border-[var(--border)] px-3 py-2 rounded-[var(--radius-md)] shadow-sm">
            {autoSaveMsg}
          </span>
        </div>
      )}

      {/* 모바일 전용 기안 작성 FAB (작성하기 아닐 때만 노출) */}
      {viewMode !== '작성하기' && canAccessApprovalSection(user, '작성하기') && (
        <button
          onClick={() => {
            setViewMode('작성하기');
            if (typeof onViewChange === 'function') onViewChange('작성하기');
          }}
          className="md:hidden fixed bottom-24 right-6 w-14 h-14 bg-[var(--accent)] text-white rounded-full shadow-sm flex items-center justify-center z-[80] active:scale-90 transition-transform animate-in zoom-in duration-300"
          aria-label="기안 작성하기"
        >
          <span className="text-3xl">✍️</span>
        </button>
      )}

      {/* 결재 상세 모달 */}
      {selectedApprovalId && (() => {
        const item = approvals.find((a) => a.id === selectedApprovalId);
        if (!item) return null;
        const detailType = item.type as string | null | undefined;
        const detailTitle = item.title as string | null | undefined;
        const detailSenderName = item.sender_name as string | null | undefined;
        const detailCreatedAt = item.created_at as string;
        const detailContent = item.content as string | null | undefined;
        const detailStatus = item.status as string | null | undefined;
        const templateMeta = resolveApprovalTemplateMeta(item);
        const templateDesign = resolveApprovalTemplateDesign(item);
        return (
          <div
            className="fixed inset-0 z-[110] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/50"
            onClick={() => setSelectedApprovalId(null)}
          >
            <div
              className="bg-[var(--card)] rounded-t-[16px] md:rounded-[var(--radius-md)] shadow-sm max-w-lg w-full max-h-[90dvh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="p-3 md:p-4 border-b flex items-center justify-between"
                style={{
                  borderColor: alphaColor(templateDesign.borderColor, 0.9),
                  background: `linear-gradient(135deg, ${alphaColor(templateDesign.primaryColor, 0.12)} 0%, rgba(255,255,255,0) 70%)`,
                }}
              >
                <div className="min-w-0">
                  <span
                    className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-semibold"
                    style={{ backgroundColor: alphaColor(templateDesign.primaryColor, 0.1), color: templateDesign.primaryColor || '#155eef' }}
                  >
                    {templateMeta.name || detailType}
                  </span>
                  <p className="mt-2 text-[11px] text-[var(--toss-gray-3)]">{(templateDesign.subtitle as string | null | undefined) || '전자결재 승인 문서'}</p>
                </div>
                <button type="button" onClick={() => setSelectedApprovalId(null)} className="p-2 rounded-[var(--radius-md)] text-[var(--toss-gray-3)] hover:bg-[var(--muted)]">✕</button>
              </div>
              <div className="p-4 md:p-4 overflow-y-auto flex-1">
                <h3 className="font-bold text-[var(--foreground)] text-lg mb-2">{detailTitle || '(제목 없음)'}</h3>
                <p className="text-[11px] text-[var(--toss-gray-3)] mb-4">기안자: {detailSenderName} · {new Date(detailCreatedAt).toLocaleString('ko-KR')}</p>
                <div className="text-sm text-[var(--toss-gray-4)] whitespace-pre-wrap border-t border-[var(--border)] pt-4">{detailContent || '-'}</div>
              </div>
              {detailStatus === '대기' && (
                <div className="p-4 md:p-4 border-t border-[var(--border)] safe-area-pb">
                  {canUserApproveItem(item) ? (
                    <div className="flex gap-3">
                      <button type="button" onClick={async () => { await handleApproveAction(item); setSelectedApprovalId(null); }} className="flex-1 py-3 bg-[var(--accent)] text-white rounded-[var(--radius-lg)] text-sm font-bold">승인</button>
                      <button type="button" onClick={async () => { await handleRejectAction(item); setSelectedApprovalId(null); }} className="flex-1 py-3 bg-red-50 border border-red-200 text-red-600 rounded-[var(--radius-lg)] text-sm font-bold hover:bg-red-100 transition-all">반려</button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-[var(--toss-gray-3)] text-center py-2">승인·반려는 <strong className="text-[var(--accent)]">결재함</strong>에서 결재자 계정으로만 할 수 있습니다. 왼쪽 메뉴에서 <strong>결재함</strong>을 눌러 주세요.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* 결재선 템플릿 저장 모달 */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={() => setShowTemplateModal(false)}>
          <div className="bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--foreground)] mb-1">결재선 템플릿 저장</h3>
            <p className="text-xs text-[var(--toss-gray-3)] mb-4">
              현재 결재선 ({approverLine.length}명)을 이름을 붙여 저장합니다.
            </p>
            {approverLine.length === 0 ? (
              <p className="text-xs text-red-500 mb-4">결재선을 먼저 지정해주세요.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {approverLine.map((a, i) => (
                  <span key={i} className="px-2 py-1 bg-[var(--toss-blue-light)] text-[var(--accent)] rounded-[var(--radius-md)] text-[10px] font-semibold">
                    {i + 1}. {a.name}
                  </span>
                ))}
              </div>
            )}
            <input
              type="text"
              value={templateNameInput}
              onChange={e => setTemplateNameInput(e.target.value)}
              placeholder="템플릿 이름 (예: 연차 기본, 물품 신청)"
              className="w-full px-4 py-3 border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-semibold bg-[var(--muted)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] mb-4"
              onKeyDown={e => { if (e.key === 'Enter' && templateNameInput.trim() && approverLine.length > 0) { const newTpl = { id: Date.now().toString(), name: templateNameInput.trim(), line: approverLine }; const next = [...approverTemplates, newTpl]; setApproverTemplates(next); if (typeof window !== 'undefined' && user?.id) window.localStorage.setItem(`erp_approveline_templates_${user.id}`, JSON.stringify(next)); setShowTemplateModal(false); alert(`"${newTpl.name}" 템플릿이 저장되었습니다.`); } }}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowTemplateModal(false)} className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button
                onClick={() => {
                  if (!templateNameInput.trim()) return alert('템플릿 이름을 입력하세요.');
                  if (approverLine.length === 0) return alert('결재선을 먼저 지정해주세요.');
                  const newTpl = { id: Date.now().toString(), name: templateNameInput.trim(), line: approverLine };
                  const next = [...approverTemplates, newTpl];
                  setApproverTemplates(next);
                  if (typeof window !== 'undefined' && user?.id) {
                    window.localStorage.setItem(`erp_approveline_templates_${user.id}`, JSON.stringify(next));
                  }
                  setShowTemplateModal(false);
                  alert(`"${newTpl.name}" 템플릿이 저장되었습니다.`);
                }}
                className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--accent)] text-white font-semibold text-sm"
              >
                저장
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
