'use client';

import { toast } from '@/lib/toast';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { canAccessApprovalSection, hasPermission } from '@/lib/access-control';
import { isActiveStaff, isDepartmentHeadOrAbove, getPositionOrder } from '@/lib/active-staff';
import { supabase, d1 } from '@/lib/supabase';
import { subscribeRealtime } from '@/lib/realtime-bus';
import { withMissingColumnsFallback, isMissingColumnError } from '@/lib/supabase-compat';
import { APPROVAL_OPTIONAL_COLUMNS, buildApprovalSelect } from '@/lib/approval-query-columns';
import { notificationMatchesApprovalId } from '@/lib/notification-metadata';
import type { StaffMember } from '@/types';
import { extractOfficialDocRequest } from '@/lib/official-document-approval';
import { useActionDialog } from '@/app/components/useActionDialog';
import { STORAGE_KEYS } from '@/lib/storage-keys';
import ApprovalComposerView from './전자결재서브/ApprovalComposerView';
import ApprovalInboxView from './전자결재서브/ApprovalInboxView';
import ApprovalDetailModal from './전자결재서브/ApprovalDetailModal';
import { buildApprovalPrintHtml as buildApprovalPrintHtmlDocument, openApprovalPrintView as openApprovalPrintViewDocument } from './전자결재서브/approval-print-utils';
import { getLeaveRequestSummary } from './전자결재서브/ApprovalMetaPanels';
import { useApprovalComposeDraft } from './전자결재서브/useApprovalComposeDraft';
import { useApprovalBulkActions } from './전자결재서브/useApprovalBulkActions';
import { useApprovalActions } from './전자결재서브/useApprovalActions';
import { useApprovalSubmit } from './전자결재서브/useApprovalSubmit';
import { useApprovalRouting } from './전자결재서브/useApprovalRouting';

import {
  APPROVAL_VIEWS,
  APPROVER_POSITIONS,
  BUILTIN_FORM_TYPE_DEFINITIONS,
  BUILTIN_FORM_TYPE_NAMES,
  ALL_DOCUMENT_FILTER,
  APPROVAL_INBOX_HIDDEN_STATUSES,
  APPROVAL_REFERENCE_ALL_KEY,
  APPROVAL_REFERENCE_DEFAULTS_KEY,
  DEFAULT_APPROVAL_TEMPLATE_DESIGN,
  LOCAL_APPROVAL_FORM_TYPES_KEY,
  LOCAL_FORM_TEMPLATE_DESIGNS_KEY,
  type ApprovalCcUser,
  type ApproverTemplate,
  type SupplyInventoryReviewState,
  type ApprovalViewProps,
} from './전자결재-types';

import {
  normalizeApprovalCcUsers,
  mergeApprovalCcUsers,
  mergeApprovalStaffDirectory,
  normalizeApproverTemplates,
  normalizeApprovalReferenceDefaultsMap,
  getCurrentMonthValue,
  getCurrentDateValue,
  getDateRangeFromMonth,
  getDateRangeFromWeek,
  matchesCreatedDateRange,
  normalizeComposeFormType,
  matchesInventorySupportCompanyName,
  sanitizeCustomFormTypes,
} from './전자결재-utils';

function normalizeApprovalCompanyName(value?: unknown, fallback = '') {
  const text = String(value || '').trim();
  return text && text !== '전체' ? text : fallback;
}

function getScopedApprovalRows<T extends Record<string, unknown>>(value: unknown, companyName: string): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== 'object') return [];

  const raw = value as { version?: number; defaults?: T[]; companies?: Record<string, T[]> };
  if (raw.version === 2 && raw.companies) {
    return raw.companies[companyName] || raw.defaults || [];
  }

  return [];
}

function resolveStoredTemplateDesign(
  store: Record<string, any>,
  slug: string,
  companyName: string,
) {
  if (store?.version === 2) {
    return store.companies?.[companyName]?.[slug] || store.defaults?.[slug] || {};
  }

  return store?.[slug] || {};
}

export default function ApprovalView({ user, staffs, selectedCo, selectedCompanyId, onRefresh, initialView, onViewChange, initialComposeRequest, onConsumeComposeRequest }: ApprovalViewProps) {
  const defaultApprovalView =
    APPROVAL_VIEWS.find((view) => canAccessApprovalSection(user, view)) || '기안함';
  const [viewMode, setViewMode] = useState(
    initialView && APPROVAL_VIEWS.includes(initialView as (typeof APPROVAL_VIEWS)[number]) && canAccessApprovalSection(user, initialView)
      ? initialView
      : defaultApprovalView
  );
const [approvals, setApprovals] = useState<Record<string, unknown>[]>([]);
  const [formType, setFormType] = useState('업무기안');
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [approverLine, setApproverLine] = useState<StaffMember[]>([]);
  const [ccLine, setCcLine] = useState<ApprovalCcUser[]>([]);
  const [extraData, setExtraData] = useState<Record<string, unknown>>({});
  const [supplyInventoryReview, setSupplyInventoryReview] = useState<SupplyInventoryReviewState | null>(null);
  const [customFormTypes, setCustomFormTypes] = useState<{ name: string; slug: string }[]>([]);
  const [formTemplateDesigns, setFormTemplateDesigns] = useState<Record<string, Record<string, unknown>>>({});
  const [lastDraftByType, setLastDraftByType] = useState<Record<string, Record<string, unknown> | null>>({});
  const [suppliesLoadKey, setSuppliesLoadKey] = useState(0);
  const [composeSeedApproval, setComposeSeedApproval] = useState<Record<string, unknown> | null>(null);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
const [approvalStatusFilter, setApprovalStatusFilter] = useState<'전체' | '대기' | '승인' | '반려' | '회수'>('대기');
  const [approvalDocumentFilter, setApprovalDocumentFilter] = useState(ALL_DOCUMENT_FILTER);
  const [approvalKeyword, setApprovalKeyword] = useState('');
  const [approvalDateMode, setApprovalDateMode] = useState<'month' | 'week' | 'range'>('week');
  const [approvalMonth, setApprovalMonth] = useState(getCurrentMonthValue);
  const [approvalWeekDate, setApprovalWeekDate] = useState(getCurrentDateValue);
  const [approvalDateFrom, setApprovalDateFrom] = useState('');
  const [approvalDateTo, setApprovalDateTo] = useState('');
  const [approvalDateTouched, setApprovalDateTouched] = useState(false);
  const defaultApprovalMonth = useMemo(() => getCurrentMonthValue(), []);
  const defaultApprovalWeekDate = useMemo(() => getCurrentDateValue(), []);
  const [savedApproverLine, setSavedApproverLine] = useState<StaffMember[]>([]);
  // 결재선 다중 템플릿 (name + line 배열)
  const [approverTemplates, setApproverTemplates] = useState<ApproverTemplate[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState('');
  const [showApproverTemplateMenu, setShowApproverTemplateMenu] = useState(false);
  // 결재함 일괄 처리용
  const [selectedApprovalIds, setSelectedApprovalIds] = useState<string[]>([]);
  // 작성하기 자동 저장용
  const [autoSaveMsg, setAutoSaveMsg] = useState<string | null>(null);
  const [draftBanner, setDraftBanner] = useState<boolean>(false);
  const [attendanceCorrectionSeedDates, setAttendanceCorrectionSeedDates] = useState<string[]>([]);
  const [supportApproverStaffs, setSupportApproverStaffs] = useState<StaffMember[]>([]);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHydratingComposeRef = useRef(false);
  const fetchApprovalsRef = useRef<() => void>(() => {});
  const { dialog, openConfirm, openPrompt } = useActionDialog();
  const isMso = user?.company === 'SY INC.' || user?.permissions?.mso === true;
  const targetCompanyName = useMemo(
    () => normalizeApprovalCompanyName(selectedCo, String(user?.company || '').trim()),
    [selectedCo, user?.company]
  );
  const surgeryStockDepartmentAliases = useMemo(() => ['수술실', '수술팀'], []);
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

  const BUILTIN_FORM_TYPES: string[] = useMemo(() => Array.from(BUILTIN_FORM_TYPE_NAMES), []);
  const hasLegacyOfficialDocumentAccess = useMemo(
    () => hasPermission(user, 'admin_공문서대장'),
    [user]
  );
  const hasGeneralApprovalAccess = useMemo(
    () => hasPermission(user, 'approval'),
    [user]
  );
  const canUseOfficialDocumentForm = useMemo(
    () => Boolean(user?.role === 'admin' || user?.permissions?.mso === true || hasLegacyOfficialDocumentAccess || hasPermission(user, 'admin')),
    [hasLegacyOfficialDocumentAccess, user]
  );
  const officialDocumentComposeOnly = hasLegacyOfficialDocumentAccess && !hasGeneralApprovalAccess;
  const composeFormTabs = useMemo(
    () => [
      ...BUILTIN_FORM_TYPES.filter((item) => {
        if (item === '공문발송') return canUseOfficialDocumentForm;
        if (officialDocumentComposeOnly) return false;
        return true;
      }),
      ...(officialDocumentComposeOnly ? [] : customFormTypes.map((item) => item.slug)),
    ],
    [BUILTIN_FORM_TYPES, canUseOfficialDocumentForm, customFormTypes, officialDocumentComposeOnly]
  );
  const activeComposeFormMeta = useMemo(() => {
    const normalizedFormType = normalizeComposeFormType(formType);
    const builtInForm = BUILTIN_FORM_TYPE_DEFINITIONS.find(
      (item) => item.slug === normalizedFormType || item.name === normalizedFormType
    );
    const customForm = customFormTypes.find(
      (item) => item.slug === normalizedFormType || item.name === normalizedFormType
    );

    return {
      slug: customForm?.slug || builtInForm?.slug || normalizedFormType,
      name: customForm?.name || builtInForm?.name || normalizedFormType,
    };
  }, [customFormTypes, formType]);
  const scopedStaffs = useMemo(
    () =>
      staffs
        .filter(isActiveStaff)
        .filter((staff) => !targetCompanyName || String(staff.company || '').trim() === targetCompanyName),
    [staffs, targetCompanyName]
  );

  const approvalDirectoryStaffs = useMemo(
    () => mergeApprovalStaffDirectory(scopedStaffs, supportApproverStaffs).filter(isActiveStaff),
    [scopedStaffs, supportApproverStaffs]
  );

  // 표시용 lookup staff 배열 — 활성/회사 필터 없이 전체 staffs + 외부 지원 결재자.
  // approvalDirectoryStaffs(결재선 선택용)는 활성+회사 필터를 거치기 때문에
  // 다른 회사 결재자/퇴사한 결재자 이름 lookup이 실패해 UUID가 노출되던 문제를 차단.
  const approvalLookupStaffs = useMemo(
    () => mergeApprovalStaffDirectory(staffs, supportApproverStaffs),
    [staffs, supportApproverStaffs]
  );
  useEffect(() => {
    if (isMso) {
      setSupportApproverStaffs([]);
      return;
    }

    let active = true;

    const loadSupportApprovers = async () => {
      try {
        const [{ data: companyRows, error: companyError }, { data: staffRows, error: staffError }] = await Promise.all([
          supabase.from('companies').select('id, name, type'),
          supabase
            .from('staff_members')
            .select('id, name, position, department, company, company_id, employee_no, role, status, permissions')
            .order('employee_no', { ascending: true }),
        ]);

        if (companyError) throw companyError;
        if (staffError) throw staffError;
        if (!active) return;

        const supportCompanyIds = new Set(
          (Array.isArray(companyRows) ? companyRows : [])
            .filter((company) => {
              const type = String(company?.type || '').trim().toUpperCase();
              return type === 'MSO' || matchesInventorySupportCompanyName(company?.name);
            })
            .map((company) => String(company?.id || '').trim())
            .filter(Boolean)
        );

        setSupportApproverStaffs(
              Array.isArray(staffRows)
            ? (staffRows.filter((staff) => {
                const position = String(staff?.position || '').trim();
                const supportCompanyId = String((staff as Record<string, unknown>)?.company_id || '').trim();
                return (
                  isActiveStaff(staff) &&
                  APPROVER_POSITIONS.includes(position) &&
                  (
                    matchesInventorySupportCompanyName(staff?.company) ||
                    (supportCompanyId !== '' && supportCompanyIds.has(supportCompanyId))
                  )
                );
              }) as StaffMember[])
            : []
        );
      } catch (error) {
        console.error('SY INC. 결재선 디렉터리 조회 실패:', error);
        if (active) {
          setSupportApproverStaffs([]);
        }
      }
    };

    void loadSupportApprovers();

    return () => {
      active = false;
    };
  }, [isMso]);
  const approvalReferenceDefaults = useMemo(
    () =>
      normalizeApprovalReferenceDefaultsMap(
        (user?.permissions as Record<string, unknown> | null | undefined)?.[APPROVAL_REFERENCE_DEFAULTS_KEY],
        approvalDirectoryStaffs
      ),
    [approvalDirectoryStaffs, user?.permissions]
  );
  const resolveDefaultReferenceUsersForForm = useCallback(
    (targetFormType: string) => {
      const normalizedFormType = normalizeComposeFormType(targetFormType);
      const builtInForm = BUILTIN_FORM_TYPE_DEFINITIONS.find(
        (item) => item.slug === normalizedFormType || item.name === normalizedFormType
      );
      const customForm = customFormTypes.find(
        (item) => item.slug === normalizedFormType || item.name === normalizedFormType
      );
      const candidateKeys = Array.from(
        new Set(
          [
            APPROVAL_REFERENCE_ALL_KEY,
            normalizedFormType,
            builtInForm?.slug,
            builtInForm?.name,
            customForm?.slug,
            customForm?.name,
          ].filter(Boolean) as string[]
        )
      );

      return mergeApprovalCcUsers(
        ...candidateKeys.map((key) => approvalReferenceDefaults[key] || [])
      );
    },
    [approvalReferenceDefaults, customFormTypes]
  );
  const applyDefaultReferenceUsers = useCallback(
    (targetFormType: string) => {
      setCcLine(resolveDefaultReferenceUsersForForm(targetFormType));
    },
    [resolveDefaultReferenceUsersForForm]
  );
  const persistApproverTemplates = useCallback(
    (nextTemplates: ApproverTemplate[]) => {
      if (typeof window === 'undefined' || !user?.id) return;
      window.localStorage.setItem(
        STORAGE_KEYS.approvelineTemplates(user.id),
        JSON.stringify(nextTemplates)
      );
    },
    [user?.id]
  );
  const saveCurrentApproverTemplate = useCallback(() => {
    if (!templateNameInput.trim()) {
      toast('템플릿 이름을 입력하세요.', 'warning');
      return;
    }
    if (approverLine.length === 0) {
      toast('결재선을 먼저 지정해주세요.');
      return;
    }

    const newTpl: ApproverTemplate = {
      id: Date.now().toString(),
      name: templateNameInput.trim(),
      line: approverLine,
      ccLine,
    };
    const next = [...approverTemplates, newTpl];
    setApproverTemplates(next);
    persistApproverTemplates(next);
    setShowTemplateModal(false);
    toast(`"${newTpl.name}" 템플릿이 저장되었습니다.`, 'success');
  }, [approverLine, approverTemplates, ccLine, persistApproverTemplates, templateNameInput]);
  const resolveApprovalTemplateMeta = useCallback((item: Record<string, unknown>) => {
    const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
    if (extractOfficialDocRequest(metaData)) {
      return {
        slug: 'official_document_dispatch',
        name: '공문발송',
      };
    }
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
      name: rawName || rawType || '증명서발급',
    };
  }, [customFormTypes]);

  useEffect(() => {
    if (composeFormTabs.length === 0) return;
    if (composeFormTabs.includes(formType)) return;

    const nextFormType = normalizeComposeFormType(composeFormTabs[0]);
    setFormType(nextFormType);
    if (ccLine.length === 0) {
      applyDefaultReferenceUsers(nextFormType);
    }
  }, [applyDefaultReferenceUsers, ccLine.length, composeFormTabs, formType]);

  const resolveApprovalTemplateDesign = useCallback((item: Record<string, unknown>) => {
    const template = resolveApprovalTemplateMeta(item);
    const itemCompanyName = normalizeApprovalCompanyName(item?.sender_company, targetCompanyName || String(user?.company || '').trim());
    const storedDesign = template.slug ? resolveStoredTemplateDesign(formTemplateDesigns, template.slug, itemCompanyName) : {};
    const companyLabel = String(storedDesign.companyLabel || itemCompanyName || DEFAULT_APPROVAL_TEMPLATE_DESIGN.companyLabel);

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
  }, [formTemplateDesigns, resolveApprovalTemplateMeta, targetCompanyName, user?.company]);


  const markApprovalNotificationsAsRead = useCallback(async (approvalIds: string[]) => {
    const normalizedApprovalIds = Array.from(
      new Set(approvalIds.map((approvalId) => String(approvalId || '').trim()).filter(Boolean))
    );

    if (normalizedApprovalIds.length === 0) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp-notification-read'));
      }
      return;
    }

    try {
      const effectiveUserId = String(user?.id || '').trim();
      if (!effectiveUserId) return;

      const { data, error } = await d1.from('notifications')
        .select('id, metadata')
        .eq('user_id', effectiveUserId)
        .in('type', ['approval', 'inventory'])
        .is('read_at', null)
        .limit(500);

      if (error) {
        throw error;
      }

      const matchedIds = ((data || []) as Array<{ id: string; metadata?: Record<string, unknown> | null }>)
        .filter((row) =>
          normalizedApprovalIds.some((approvalId) => notificationMatchesApprovalId(row.metadata, approvalId))
        )
        .map((row) => String(row.id || '').trim())
        .filter(Boolean);

      if (matchedIds.length > 0) {
        const { error: updateError } = await d1.from('notifications')
          .update({ read_at: new Date().toISOString() })
          .in('id', matchedIds);

        if (updateError) {
          throw updateError;
        }
      }
    } catch (notificationError) {
      console.warn('approval notification cleanup skipped', notificationError);
    } finally {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('erp-notification-read'));
      }
    }
  }, [user?.id]);

  const buildApprovalPrintHtml = useCallback((item: Record<string, unknown>, options?: { autoPrint?: boolean }) => {
    return buildApprovalPrintHtmlDocument({
      item,
      approvalDirectoryStaffs,
      resolveApprovalTemplateDesign,
      resolveApprovalTemplateMeta,
      options,
    });
  }, [approvalDirectoryStaffs, resolveApprovalTemplateDesign, resolveApprovalTemplateMeta]);

  const openApprovalPrintView = useCallback((item: Record<string, unknown>) => {
    openApprovalPrintViewDocument({
      item,
      buildHtml: buildApprovalPrintHtml,
    });
  }, [buildApprovalPrintHtml]);

  const allCompaniesApproverCandidates = useMemo(() => {
    const list = Array.isArray(staffs) ? staffs : [];
    return list
      .filter((staff) => isActiveStaff(staff) && isDepartmentHeadOrAbove(staff))
      .sort((a, b) => {
        const order = getPositionOrder(a.position, a.role) - getPositionOrder(b.position, b.role);
        if (order !== 0) return order;
        const companyDiff = String(a.company || '').localeCompare(String(b.company || ''));
        if (companyDiff !== 0) return companyDiff;
        return String(a.name || '').localeCompare(String(b.name || ''));
      });
  }, [staffs]);

  // 참조자 후보: 전 회사·전 부서의 활성 직원 전체 (MSO 특성상 타 회사 직원도 참조자 지정 가능).
  // 결재선과 달리 직책 보유자로 제한하지 않는다.
  const allCompaniesReferenceCandidates = useMemo(() => {
    return mergeApprovalStaffDirectory(Array.isArray(staffs) ? staffs : [], supportApproverStaffs)
      .filter(isActiveStaff)
      .sort((a, b) => {
        const companyDiff = String(a.company || '').localeCompare(String(b.company || ''), 'ko-KR');
        if (companyDiff !== 0) return companyDiff;
        const deptDiff = String(a.department || '').localeCompare(String(b.department || ''), 'ko-KR');
        if (deptDiff !== 0) return deptDiff;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ko-KR');
      });
  }, [staffs, supportApproverStaffs]);

  const {
    normalizeApprovalLineIds,
    resolveApprovalLineIds,
    resolveStoredCurrentApproverId,
    resolveEffectiveApproverId,
    resolveCurrentApproverId,
    resolveApprovalDelegateSnapshot,
    resolveApprovalDelaySnapshot,
    resolveApprovalLockSnapshot,
    syncDelegatedApprovalDelayNotifications,
    syncDelegatedApprovalRouting,
  } = useApprovalRouting({
    user,
    approvalDirectoryStaffs,
    setApprovals,
  });

  useEffect(() => {
    const normalizedFallbackTypes = [
      { name: '연차/휴가', slug: 'leave' },
      { name: '연장근무', slug: 'overtime' },
      { name: '비품구매', slug: 'purchase' },
      { name: '출결정정', slug: 'attendance_fix' },
      { name: '사직서', slug: 'resignation' },
      { name: '증명서발급', slug: 'generic' }
    ];

    const normalizeRows = (rows: Record<string, unknown>[]) =>
      rows
        .filter((row) => row?.is_active !== false)
        .filter((row) => {
          const rowCompany = String(row.company_name || '').trim();
          return !rowCompany || !targetCompanyName || rowCompany === targetCompanyName;
        })
        .map((row) => ({ name: row.name as string, slug: row.slug as string }))
        .filter((row: { name: string; slug: string }) => row.name && row.slug);

    const loadCustomFormTypes = async () => {
      const merged = new Map<string, { name: string; slug: string }>();

      if (typeof window !== 'undefined') {
        try {
          const stored = window.localStorage.getItem(LOCAL_APPROVAL_FORM_TYPES_KEY);
          const parsed = stored ? JSON.parse(stored) : [];
          normalizeRows(getScopedApprovalRows<Record<string, unknown>>(parsed, targetCompanyName))
            .forEach((row) => merged.set(row.slug, row));
        } catch {
          // ignore local storage errors and continue with server rows.
        }
      }

      try {
        const { data, error } = await supabase
          .from('approval_form_types')
          .select('name, slug, company_name, is_active')
          .eq('is_active', true)
          .order('sort_order');

        if (!error && Array.isArray(data)) {
          normalizeRows(data as Record<string, unknown>[]).forEach((row) => merged.set(row.slug, row));
        } else if (error && isMissingColumnError(error, 'company_name')) {
          const legacyResult = await supabase
            .from('approval_form_types')
            .select('name, slug, is_active')
            .eq('is_active', true)
            .order('sort_order');
          if (!legacyResult.error && Array.isArray(legacyResult.data)) {
            normalizeRows(legacyResult.data as Record<string, unknown>[]).forEach((row) => merged.set(row.slug, row));
          }
        } else if (error && !isMissingColumnError(error, 'company_name')) {
          console.warn('approval_form_types load failed:', error);
        }
      } catch (error) {
        console.warn('approval_form_types load failed:', error);
      }

      const next = Array.from(merged.values());
      setCustomFormTypes(next.length ? next : normalizedFallbackTypes);
    };

    void loadCustomFormTypes();
  }, [targetCompanyName]);

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
        const saved = window.localStorage.getItem(STORAGE_KEYS.approvelineFav(user.id));
        if (saved) setSavedApproverLine(JSON.parse(saved));
        const savedTpls = window.localStorage.getItem(STORAGE_KEYS.approvelineTemplates(user.id));
        if (savedTpls) {
          setApproverTemplates(normalizeApproverTemplates(JSON.parse(savedTpls), approvalDirectoryStaffs));
        }
      } catch { }
    }
  }, [approvalDirectoryStaffs, user?.id]);


  const fetchApprovals = useCallback(async () => {
    const { data, error } = await withMissingColumnsFallback(
      (omittedColumns) =>
        supabase
          .from('approvals')
          .select(buildApprovalSelect(omittedColumns))
          .order('created_at', { ascending: false }),
      APPROVAL_OPTIONAL_COLUMNS,
      { cacheKey: 'approval-list' }
    );
    if (error) {
      console.error('전자결재 문서 목록 조회 실패:', error);
      setApprovals([]);
      return;
    }
    if (data) {
      const nextItems = data as unknown as Record<string, unknown>[];
      setApprovals(nextItems);
      void Promise.allSettled(
        nextItems
          .filter((item) => String(item?.status || '') === '대기')
          .map((item) => syncDelegatedApprovalRouting(item, resolveStoredCurrentApproverId(item)))
      );
      void syncDelegatedApprovalDelayNotifications(nextItems);
    }
  }, [resolveStoredCurrentApproverId, syncDelegatedApprovalDelayNotifications, syncDelegatedApprovalRouting]);

  // 항상 최신 fetchApprovals를 ref에 유지 (realtime 클로저 stale 방지)
  useEffect(() => { fetchApprovalsRef.current = fetchApprovals; }, [fetchApprovals]);

  useEffect(() => { fetchApprovals(); }, [fetchApprovals]);

  const {
    loadLastDraft,
    loadDraftFromStorage,
    clearDraftFromStorage,
    saveDraftNow,
  } = useApprovalComposeDraft({
    user,
    viewMode,
    setViewMode,
    defaultApprovalView,
    initialView,
    initialComposeRequest,
    onConsumeComposeRequest,
    onViewChange,
    resolveAccessibleView,
    approvalDirectoryStaffs,
    defaultApprovalMonth,
    defaultApprovalWeekDate,
    approvals,
    selectedApprovalId,
    setApprovals,
    setSelectedApprovalId,
    formType,
    setFormType,
    formTitle,
    setFormTitle,
    formContent,
    setFormContent,
    extraData,
    setExtraData,
    approverLine,
    setApproverLine,
    ccLine,
    setCcLine,
    lastDraftByType,
    setLastDraftByType,
    suppliesLoadKey,
    setSuppliesLoadKey,
    composeSeedApproval,
    setComposeSeedApproval,
    setSupplyInventoryReview,
    setApprovalStatusFilter,
    setApprovalDocumentFilter,
    setApprovalKeyword,
    setApprovalDateMode,
    setApprovalMonth,
    setApprovalWeekDate,
    setApprovalDateFrom,
    setApprovalDateTo,
    setAttendanceCorrectionSeedDates,
    setAutoSaveMsg,
    setDraftBanner,
    autoSaveTimer,
    autoSaveMsgTimer,
    isHydratingComposeRef,
    resolveDefaultReferenceUsersForForm,
  });

  const {
    transitionApprovalsOnServer,
    handleBulkApprove,
    handleBulkReject,
  } = useApprovalBulkActions({
    selectedApprovalIds,
    setSelectedApprovalIds,
    openConfirm,
    openPrompt,
    fetchApprovals,
    markApprovalNotificationsAsRead,
  });

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = subscribeRealtime(
      'approvals-realtime',
      [{ table: 'approvals', event: '*' }],
      () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          fetchApprovalsRef.current();
        }, 300);
      },
      { pollIntervalMs: 5000 },
    );
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
    };
  }, []);

  const {
    canUserApproveItem,
    canUserRecallItem,
    isApprovalEditLockedItem,
    handleApproveAction,
    handleRejectAction,
    handleRecallAction,
  } = useApprovalActions({
    user,
    openConfirm,
    openPrompt,
    fetchApprovals,
    markApprovalNotificationsAsRead,
    transitionApprovalsOnServer,
    resolveStoredCurrentApproverId,
    resolveEffectiveApproverId,
    syncDelegatedApprovalRouting,
    resolveApprovalLineIds,
    normalizeApprovalLineIds,
    resolveCurrentApproverId,
    setComposeSeedApproval,
    setSelectedApprovalId,
    resolveAccessibleView,
    setViewMode,
    onViewChange,
  });
  const hasApproverSelection = approverLine.length > 0;

  const { handleSubmit } = useApprovalSubmit({
    user,
    selectedCompanyId,
    selectedCompanyName: targetCompanyName,
    formType,
    formTitle,
    formContent,
    extraData,
    hasApproverSelection,
    approverLine,
    ccLine,
    customFormTypes,
    composeSeedApproval,
    approvalDirectoryStaffs,
    setSupplyInventoryReview,
    setComposeSeedApproval,
    setCcLine,
    clearDraftFromStorage,
    resolveDefaultReferenceUsersForForm,
    resolveAccessibleView,
    setViewMode,
    onViewChange,
    fetchApprovals,
    onRefresh,
    openConfirm,
    resolveEffectiveApproverId,
    resolveApprovalLineIds,
    surgeryStockDepartmentAliases,
  });

  const visibleApprovals = useMemo(() => approvals, [approvals]);

  const draftBaseList = useMemo(() => {
    return visibleApprovals.filter((a) => a.sender_id === user?.id);
  }, [user?.id, visibleApprovals]);

  const approvalBaseList = useMemo(() => {
    const uid = user?.id != null ? String(user.id) : '';
    return visibleApprovals.filter((a) => {
      const status = String(a.status || '').trim();
      if (APPROVAL_INBOX_HIDDEN_STATUSES.has(status)) return false;
      const lineIds = resolveApprovalLineIds(a);
      const currentApproverId = resolveCurrentApproverId(a);
      return lineIds.some((id: string) => String(id) === uid) || String(currentApproverId || '') === uid;
    });
  }, [resolveApprovalLineIds, resolveCurrentApproverId, user?.id, visibleApprovals]);
  const referenceBaseList = useMemo(() => {
    const uid = user?.id != null ? String(user.id) : '';
    if (!uid) return [];
    return visibleApprovals.filter((item) => {
      // 회수된 문서는 참조자 화면에서 비표시 (요구사항 4번)
      if (APPROVAL_INBOX_HIDDEN_STATUSES.has(String(item?.status || ''))) return false;
      const metaData = item?.meta_data as Record<string, unknown> | null | undefined;
      const ccUsers = normalizeApprovalCcUsers(metaData?.cc_users, approvalDirectoryStaffs);
      return ccUsers.some((ccUser) => String(ccUser.id) === uid);
    });
  }, [approvalDirectoryStaffs, user?.id, visibleApprovals]);

  const documentTypeOptions = useMemo(() => {
    const source =
      viewMode === '기안함'
        ? draftBaseList
        : viewMode === '참조 문서함'
          ? referenceBaseList
          : approvalBaseList;

    const availableForms = new Set([
      ...BUILTIN_FORM_TYPES,
      ...customFormTypes.map((f) => f.name || f.slug),
    ]);

    source.forEach((item) => {
      const type = String(item?.type || '').trim();
      if (type) availableForms.add(type);
    });

    return Array.from(availableForms).sort((a, b) => a.localeCompare(b, 'ko-KR'));
  }, [approvalBaseList, draftBaseList, referenceBaseList, viewMode, BUILTIN_FORM_TYPES, customFormTypes]);

  const buildApprovalSearchText = useCallback((item: Record<string, unknown>) => {
    const metaData = item.meta_data as Record<string, unknown> | null | undefined;
    const ccUsers = normalizeApprovalCcUsers(metaData?.cc_users, approvalDirectoryStaffs);
    const leaveSummary = getLeaveRequestSummary(metaData);
    return [
      item.title,
      item.content,
      item.sender_name,
      item.type,
      item.doc_number,
      metaData?.form_name,
      metaData?.form_slug,
      leaveSummary?.dateLabel,
      leaveSummary?.startDate,
      leaveSummary?.endDate,
      leaveSummary?.leaveType,
      leaveSummary?.delegateName,
      leaveSummary?.delegateDepartment,
      leaveSummary?.delegatePosition,
      leaveSummary?.reason,
      ccUsers.map((ccUser) => `${ccUser.name} ${ccUser.position || ''}`).join(' '),
    ]
      .map((value) => String(value ?? '').trim().toLocaleLowerCase('ko-KR'))
      .filter(Boolean)
      .join(' ');
  }, [approvalDirectoryStaffs, getLeaveRequestSummary]);

  const effectiveApprovalDateRange = useMemo(() => {
    if (approvalDateMode === 'month') {
      return getDateRangeFromMonth(approvalMonth);
    }
    if (approvalDateMode === 'week') {
      return getDateRangeFromWeek(approvalWeekDate);
    }
    return { from: approvalDateFrom, to: approvalDateTo };
  }, [approvalDateFrom, approvalDateMode, approvalDateTo, approvalMonth, approvalWeekDate]);

  const shouldApplyApprovalDateFilter = useMemo(() => {
    if (approvalDateMode === 'range') {
      return Boolean(approvalDateFrom || approvalDateTo);
    }

    if (approvalDateMode === 'week') {
      return Boolean(approvalWeekDate);
    }

    return Boolean(approvalMonth);
  }, [approvalDateFrom, approvalDateMode, approvalDateTo, approvalMonth, approvalWeekDate]);

  const hasApprovalFilterOverrides =
    approvalDocumentFilter !== ALL_DOCUMENT_FILTER ||
    Boolean(approvalKeyword) ||
    approvalDateMode !== 'week' ||
    approvalMonth !== defaultApprovalMonth ||
    approvalWeekDate !== defaultApprovalWeekDate ||
    Boolean(approvalDateFrom) ||
    Boolean(approvalDateTo);

  const dateRangeInvalid =
    approvalDateMode === 'range' &&
    Boolean(effectiveApprovalDateRange.from && effectiveApprovalDateRange.to && effectiveApprovalDateRange.from > effectiveApprovalDateRange.to);
  const applyListFilters = useCallback((items: Record<string, unknown>[]) => {
    let filtered = approvalStatusFilter === '전체'
      ? items
      : items.filter((item) => item.status === approvalStatusFilter);

    if (approvalDocumentFilter !== ALL_DOCUMENT_FILTER) {
      filtered = filtered.filter((item) => item.type === approvalDocumentFilter);
    }

    if (shouldApplyApprovalDateFilter && (effectiveApprovalDateRange.from || effectiveApprovalDateRange.to)) {
      filtered = filtered.filter((item) =>
        matchesCreatedDateRange(
          item.created_at as string | null,
          effectiveApprovalDateRange.from,
          effectiveApprovalDateRange.to
        )
      );
    }

    const normalizedKeyword = approvalKeyword.trim().toLocaleLowerCase('ko-KR');
    if (normalizedKeyword) {
      filtered = filtered.filter((item) => buildApprovalSearchText(item).includes(normalizedKeyword));
    }

    return filtered;
  }, [approvalDocumentFilter, approvalKeyword, approvalStatusFilter, buildApprovalSearchText, effectiveApprovalDateRange.from, effectiveApprovalDateRange.to, shouldApplyApprovalDateFilter]);

  const draftBoxList = useMemo(() => {
    return applyListFilters(draftBaseList);
  }, [applyListFilters, draftBaseList]);

  const approvalBoxList = useMemo(() => {
    return applyListFilters(approvalBaseList);
  }, [applyListFilters, approvalBaseList]);
  const referenceBoxList = useMemo(() => {
    return applyListFilters(referenceBaseList);
  }, [applyListFilters, referenceBaseList]);

  const listForView =
    viewMode === '기안함'
      ? draftBoxList
      : viewMode === '참조 문서함'
        ? referenceBoxList
        : approvalBoxList;

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
      {dialog}
      {supplyInventoryReview ? (
        <div
          data-testid="approval-supply-review-modal"
          className="fixed inset-0 z-[410] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          onClick={() => setSupplyInventoryReview(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-[var(--border)] bg-[var(--card)] shadow-sm"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[var(--border)] px-5 py-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-black tracking-tight text-[var(--foreground)]">
                    재고 연동 최종 확인
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--toss-gray-4)]">
                    최종 제출 전에 SY INC 경영지원팀 보유 재고와 수술실 현재 재고를 함께 확인해 주세요.
                  </p>
                </div>
                <span className="rounded-full bg-[var(--toss-blue-light)] px-3 py-1 text-[11px] font-black text-[var(--accent)]">
                  신청 품목 {supplyInventoryReview.items.length}개
                </span>
              </div>
              {supplyInventoryReview.notice ? (
                <p className="mt-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold leading-relaxed text-amber-700">
                  {supplyInventoryReview.notice}
                </p>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="hidden overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] md:block">
                <table className="min-w-full text-sm">
                  <thead className="bg-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">물품명</th>
                      <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">신청 수량</th>
                      <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">SY INC 경영지원팀 재고</th>
                      <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">수술실 현재고</th>
                      <th className="px-4 py-3 text-left font-bold text-[var(--toss-gray-4)]">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplyInventoryReview.rows.map((row) => (
                      <tr key={row.key} className="border-t border-[var(--border)]">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-bold text-[var(--foreground)]">{row.name}</p>
                            <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                              {row.matchedDepartments.length > 0 ? row.matchedDepartments.join(', ') : '수술실 재고 없음'}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-black text-[var(--foreground)]">{`${row.requestedQty} ${row.unit}`}</td>
                        <td className="px-4 py-3">
                          <div className="font-black text-indigo-600">{`${row.supportStock} ${row.unit}`}</div>
                          <div className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                            부족 {row.supportShortageQty}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-black text-[var(--accent)]">{`${row.surgeryStock} ${row.unit}`}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              row.supportShortageQty > 0
                                ? 'bg-amber-50 text-amber-700'
                                : row.surgeryShortageQty > 0
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'bg-emerald-50 text-emerald-600'
                            }`}
                          >
                            {row.supportShortageQty > 0
                              ? `경영지원팀 부족 ${row.supportShortageQty}`
                              : row.surgeryShortageQty > 0
                                ? `수술실 부족 ${row.surgeryShortageQty}`
                                : '재고 확인 완료'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {supplyInventoryReview.rows.map((row) => (
                  <div
                    key={row.key}
                    className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-[var(--foreground)]">{row.name}</p>
                        <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                          {row.matchedDepartments.length > 0 ? row.matchedDepartments.join(', ') : '수술실 재고 없음'}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          row.supportShortageQty > 0
                            ? 'bg-amber-50 text-amber-700'
                            : row.surgeryShortageQty > 0
                              ? 'bg-rose-50 text-rose-600'
                              : 'bg-emerald-50 text-emerald-600'
                        }`}
                      >
                        {row.supportShortageQty > 0
                          ? `경영지원팀 부족 ${row.supportShortageQty}`
                          : row.surgeryShortageQty > 0
                            ? `수술실 부족 ${row.surgeryShortageQty}`
                            : '확인 완료'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                      <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2 py-2">
                        <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">신청</p>
                        <p className="mt-1 text-sm font-black text-[var(--foreground)]">{`${row.requestedQty} ${row.unit}`}</p>
                      </div>
                      <div className="rounded-[var(--radius-md)] bg-indigo-500/10 px-2 py-2">
                        <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">SY INC 재고</p>
                        <p className="mt-1 text-sm font-black text-indigo-600">{`${row.supportStock} ${row.unit}`}</p>
                        <p className="mt-1 text-[10px] font-semibold text-[var(--toss-gray-3)]">부족 {row.supportShortageQty}</p>
                      </div>
                      <div className="rounded-[var(--radius-md)] bg-[var(--toss-blue-light)] px-2 py-2">
                        <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">수술실 현재고</p>
                        <p className="mt-1 text-sm font-black text-[var(--accent)]">{`${row.surgeryStock} ${row.unit}`}</p>
                      </div>
                      <div className="rounded-[var(--radius-md)] bg-rose-50 px-2 py-2">
                        <p className="text-[10px] font-semibold text-[var(--toss-gray-3)]">수술실 부족</p>
                        <p className="mt-1 text-sm font-black text-rose-600">{`${row.surgeryShortageQty} ${row.unit}`}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 border-t border-[var(--border)] bg-[var(--background)]/40 px-5 py-4">
              <button
                type="button"
                data-testid="approval-supply-review-cancel"
                onClick={() => setSupplyInventoryReview(null)}
                className="flex-1 rounded-[16px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm font-bold text-[var(--toss-gray-4)] transition-colors hover:bg-[var(--muted)]"
              >
                취소
              </button>
              <button
                type="button"
                data-testid="approval-supply-review-confirm"
                onClick={() => {
                  setSupplyInventoryReview(null);
                  void handleSubmit({ skipSupplyInventoryReview: true });
                }}
                className="flex-1 rounded-[16px] bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white transition-colors hover:opacity-95"
              >
                재고 확인 후 최종 신청
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {/* 상세 메뉴(기안함·결재함·작성하기)는 메인 좌측 사이드바에서 전자결재 호버/클릭 시 플라이아웃으로 선택 */}
      {/* 메인 콘텐츠 */}
      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-5 bg-[var(--page-bg)] custom-scrollbar">
        {viewMode === '작성하기' ? (
          <ApprovalComposerView
            user={user}
            staffs={staffs.filter(isActiveStaff)}
            draftBanner={draftBanner}
            setDraftBanner={setDraftBanner}
            loadDraftFromStorage={loadDraftFromStorage}
            clearDraftFromStorage={clearDraftFromStorage}
            approverCandidates={allCompaniesApproverCandidates}
            referenceCandidates={allCompaniesReferenceCandidates}
            approvalDirectoryStaffs={approvalDirectoryStaffs}
            approverLine={approverLine}
            setApproverLine={setApproverLine}
            ccLine={ccLine}
            setCcLine={setCcLine}
            templateNameInput={templateNameInput}
            setTemplateNameInput={setTemplateNameInput}
            setShowTemplateModal={setShowTemplateModal}
            showApproverTemplateMenu={showApproverTemplateMenu}
            setShowApproverTemplateMenu={setShowApproverTemplateMenu}
            approverTemplates={approverTemplates}
            setApproverTemplates={setApproverTemplates}
            persistApproverTemplates={persistApproverTemplates}
            composeFormTabs={composeFormTabs}
            builtinFormTypes={BUILTIN_FORM_TYPES}
            customFormTypes={customFormTypes}
            formType={formType}
            setFormType={setFormType}
            applyDefaultReferenceUsers={applyDefaultReferenceUsers}
            lastDraftByType={lastDraftByType}
            loadLastDraft={loadLastDraft}
            formTitle={formTitle}
            setFormTitle={setFormTitle}
            formContent={formContent}
            setFormContent={setFormContent}
            extraData={extraData}
            setExtraData={setExtraData}
            suppliesLoadKey={suppliesLoadKey}
            attendanceCorrectionSeedDates={attendanceCorrectionSeedDates}
            setAttendanceCorrectionSeedDates={setAttendanceCorrectionSeedDates}
            hasApproverSelection={hasApproverSelection}
            handleSubmit={handleSubmit}
            onSaveDraft={saveDraftNow}
          />
        ) : (
          <ApprovalInboxView
            viewMode={viewMode}
            currentUserId={user?.id ? String(user.id) : null}
            listForView={listForView}
            approvalDocumentFilter={approvalDocumentFilter}
            setApprovalDocumentFilter={setApprovalDocumentFilter}
            documentTypeOptions={documentTypeOptions}
            approvalKeyword={approvalKeyword}
            setApprovalKeyword={setApprovalKeyword}
            approvalDateMode={approvalDateMode}
            setApprovalDateMode={setApprovalDateMode}
            approvalMonth={approvalMonth}
            setApprovalMonth={setApprovalMonth}
            approvalWeekDate={approvalWeekDate}
            setApprovalWeekDate={setApprovalWeekDate}
            approvalDateFrom={approvalDateFrom}
            setApprovalDateFrom={setApprovalDateFrom}
            approvalDateTo={approvalDateTo}
            setApprovalDateTo={setApprovalDateTo}
            setApprovalDateTouched={setApprovalDateTouched}
            defaultApprovalMonth={defaultApprovalMonth}
            defaultApprovalWeekDate={defaultApprovalWeekDate}
            effectiveApprovalDateRange={effectiveApprovalDateRange}
            hasApprovalFilterOverrides={hasApprovalFilterOverrides}
            dateRangeInvalid={dateRangeInvalid}
            approvalStatusFilter={approvalStatusFilter}
            setApprovalStatusFilter={setApprovalStatusFilter}
            bulkTargetList={bulkTargetList}
            allBulkSelected={allBulkSelected}
            selectedApprovalIds={selectedApprovalIds}
            toggleSelectAll={toggleSelectAll}
            toggleSelectOne={toggleSelectOne}
            handleBulkApprove={handleBulkApprove}
            handleBulkReject={handleBulkReject}
            setSelectedApprovalId={setSelectedApprovalId}
            approvalDirectoryStaffs={approvalDirectoryStaffs}
            approvalLookupStaffs={approvalLookupStaffs}
            resolveApprovalLineIds={resolveApprovalLineIds}
            resolveCurrentApproverId={resolveCurrentApproverId}
            resolveApprovalTemplateMeta={resolveApprovalTemplateMeta}
            resolveApprovalTemplateDesign={resolveApprovalTemplateDesign}
            resolveApprovalDelegateSnapshot={resolveApprovalDelegateSnapshot}
            resolveApprovalDelaySnapshot={resolveApprovalDelaySnapshot}
            resolveApprovalLockSnapshot={resolveApprovalLockSnapshot}
            isApprovalEditLockedItem={isApprovalEditLockedItem}
            canUserRecallItem={canUserRecallItem}
            canUserApproveItem={canUserApproveItem}
            handleApproveAction={handleApproveAction}
            handleRejectAction={handleRejectAction}
            handleRecallAction={handleRecallAction}
            onCreateDraft={() => {
              setViewMode('작성하기');
              if (typeof onViewChange === 'function') onViewChange('작성하기');
            }}
          />
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

      <ApprovalDetailModal
        item={selectedApprovalId ? approvals.find((approval) => approval.id === selectedApprovalId) : null}
        approvalDirectoryStaffs={approvalDirectoryStaffs}
        approvalLookupStaffs={approvalLookupStaffs}
        onClose={() => setSelectedApprovalId(null)}
        buildApprovalPrintHtml={buildApprovalPrintHtml}
        openApprovalPrintView={openApprovalPrintView}
        resolveApprovalTemplateMeta={resolveApprovalTemplateMeta}
        resolveApprovalTemplateDesign={resolveApprovalTemplateDesign}
        resolveApprovalLineIds={resolveApprovalLineIds}
        resolveCurrentApproverId={resolveCurrentApproverId}
        resolveApprovalDelegateSnapshot={resolveApprovalDelegateSnapshot}
        resolveApprovalDelaySnapshot={resolveApprovalDelaySnapshot}
        resolveApprovalLockSnapshot={resolveApprovalLockSnapshot}
        canUserApproveItem={canUserApproveItem}
        canUserRecallItem={canUserRecallItem}
        handleApproveAction={handleApproveAction}
        handleRejectAction={handleRejectAction}
        handleRecallAction={handleRecallAction}
      />

      {/* 결재선 템플릿 저장 모달 */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-[var(--card)] rounded-[var(--radius-xl)] shadow-sm p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-bold text-[var(--foreground)] mb-1">결재선 템플릿 저장</h3>
            <p className="text-xs text-[var(--toss-gray-3)] mb-4">
              현재 결재선 ({approverLine.length}명)과 참조자 ({ccLine.length}명)를 이름을 붙여 저장합니다.
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
              data-testid="approval-template-name-input"
              placeholder="템플릿 이름 (예: 연차 기본, 물품 신청)"
              className="w-full px-4 py-3 border border-[var(--border)] rounded-[var(--radius-md)] text-sm font-semibold bg-[var(--muted)] outline-none focus:ring-2 focus:ring-[var(--accent)]/20 focus:border-[var(--accent)] mb-4"
              onKeyDown={e => { if (e.key === 'Enter') saveCurrentApproverTemplate(); }}
            />
            <div className="flex gap-2">
              <button onClick={() => setShowTemplateModal(false)} className="flex-1 py-3 rounded-[var(--radius-md)] bg-[var(--muted)] text-[var(--toss-gray-4)] font-semibold text-sm">취소</button>
              <button
                data-testid="approval-template-save-confirm"
                onClick={saveCurrentApproverTemplate}
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
