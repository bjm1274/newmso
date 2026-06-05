import { APPROVAL_VIEW_KEY } from '@/app/main/navigation-state';
import { isApprovalLocked } from '@/lib/approval-workflow';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { isActiveStaff, isDepartmentHeadOrAbove, getPositionOrder } from '@/lib/active-staff';
import type { StaffMember } from '@/types';
import { useCallback,useEffect,useRef,type Dispatch,type MutableRefObject,type SetStateAction } from 'react';
import {
ALL_DOCUMENT_FILTER,
APPROVAL_DRAFT_STORAGE_KEY,
type ApprovalCcUser,
} from '../전자결재-types';
import {
normalizeApprovalCcUsers,
normalizeComposeFormType,
resolveApprovalStaffLine,
} from '../전자결재-utils';

type ApprovalRecord = Record<string, unknown>;

type UseApprovalComposeDraftParams = {
  user: StaffMember | null;
  viewMode: string;
  setViewMode: Dispatch<SetStateAction<string>>;
  defaultApprovalView: string;
  initialView?: string | null;
  initialComposeRequest?: ApprovalRecord | null;
  onConsumeComposeRequest?: () => void;
  onViewChange?: (view: string) => void;
  resolveAccessibleView: (requestedView?: string | null) => string | null;
  approvalDirectoryStaffs: StaffMember[];
  defaultApprovalMonth: string;
  defaultApprovalWeekDate: string;
  approvals: ApprovalRecord[];
  selectedApprovalId: string | null;
  setApprovals: Dispatch<SetStateAction<ApprovalRecord[]>>;
  setSelectedApprovalId: Dispatch<SetStateAction<string | null>>;
  formType: string;
  setFormType: Dispatch<SetStateAction<string>>;
  formTitle: string;
  setFormTitle: Dispatch<SetStateAction<string>>;
  formContent: string;
  setFormContent: Dispatch<SetStateAction<string>>;
  extraData: ApprovalRecord;
  setExtraData: Dispatch<SetStateAction<ApprovalRecord>>;
  approverLine: StaffMember[];
  setApproverLine: Dispatch<SetStateAction<StaffMember[]>>;
  ccLine: ApprovalCcUser[];
  setCcLine: Dispatch<SetStateAction<ApprovalCcUser[]>>;
  lastDraftByType: Record<string, ApprovalRecord | null>;
  setLastDraftByType: Dispatch<SetStateAction<Record<string, ApprovalRecord | null>>>;
  suppliesLoadKey: number;
  setSuppliesLoadKey: Dispatch<SetStateAction<number>>;
  composeSeedApproval: ApprovalRecord | null;
  setComposeSeedApproval: Dispatch<SetStateAction<ApprovalRecord | null>>;
  setSupplyInventoryReview: Dispatch<SetStateAction<any>>;
  setApprovalStatusFilter: Dispatch<SetStateAction<'전체' | '대기' | '승인' | '반려' | '회수'>>;
  setApprovalDocumentFilter: Dispatch<SetStateAction<string>>;
  setApprovalKeyword: Dispatch<SetStateAction<string>>;
  setApprovalDateMode: Dispatch<SetStateAction<'month' | 'week' | 'range'>>;
  setApprovalMonth: Dispatch<SetStateAction<string>>;
  setApprovalWeekDate: Dispatch<SetStateAction<string>>;
  setApprovalDateFrom: Dispatch<SetStateAction<string>>;
  setApprovalDateTo: Dispatch<SetStateAction<string>>;
  setAttendanceCorrectionSeedDates: Dispatch<SetStateAction<string[]>>;
  setAutoSaveMsg: Dispatch<SetStateAction<string | null>>;
  setDraftBanner: Dispatch<SetStateAction<boolean>>;
  autoSaveTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  autoSaveMsgTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  isHydratingComposeRef: MutableRefObject<boolean>;
  resolveDefaultReferenceUsersForForm: (targetFormType: string) => ApprovalCcUser[];
};

export function useApprovalComposeDraft({
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
  suppliesLoadKey: _suppliesLoadKey,
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
}: UseApprovalComposeDraftParams) {
  const hydratedComposeSeedIdRef = useRef<string | null>(null);

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
  }, [initialView, resolveAccessibleView, setViewMode]);

  useEffect(() => {
    const normalizedView = resolveAccessibleView(viewMode);
    if (!normalizedView || normalizedView === viewMode) return;
    setViewMode(normalizedView);
    if (typeof onViewChange === 'function') onViewChange(normalizedView);
  }, [onViewChange, resolveAccessibleView, setViewMode, viewMode]);

  useEffect(() => {
    if (!initialComposeRequest) return;

    const requestedApprovalId = String(initialComposeRequest?.approvalId || '').trim();
    if (requestedApprovalId) {
      const requestedView =
        typeof initialComposeRequest?.viewMode === 'string' && initialComposeRequest.viewMode.trim()
          ? initialComposeRequest.viewMode
          : defaultApprovalView;
      const nextView = resolveAccessibleView(requestedView) || defaultApprovalView;

      setViewMode(nextView);
      setSelectedApprovalId(requestedApprovalId);

      try { window.localStorage.setItem(APPROVAL_VIEW_KEY, nextView); } catch { /* ignore */ }

      onConsumeComposeRequest?.();
      return;
    }

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
    isHydratingComposeRef.current = true;
    setFormType(nextFormType);
    setFormTitle(String(initialComposeRequest?.title || ''));
    setFormContent(String(initialComposeRequest?.content || ''));
    setExtraData(
      initialComposeRequest?.extraData && typeof initialComposeRequest.extraData === 'object'
        ? { ...(initialComposeRequest.extraData as ApprovalRecord) }
        : {}
    );
    setSupplyInventoryReview(null);
    const requestedApproverLine = resolveApprovalStaffLine(
      initialComposeRequest?.approverLine ?? initialComposeRequest?.approver_line,
      approvalDirectoryStaffs
    );
    setApproverLine(requestedApproverLine);
    const requestedCcUsers = normalizeApprovalCcUsers(
      initialComposeRequest?.cc_users ?? initialComposeRequest?.ccLine,
      approvalDirectoryStaffs
    );
    setCcLine(
      requestedCcUsers.length > 0
        ? requestedCcUsers
        : resolveDefaultReferenceUsersForForm(nextFormType)
    );

    if (typeof initialComposeRequest?.statusFilter === 'string') {
      const requestedStatusFilter = initialComposeRequest.statusFilter.trim();
      setApprovalStatusFilter(
        requestedStatusFilter === '대기' || requestedStatusFilter === '승인' || requestedStatusFilter === '반려' || requestedStatusFilter === '회수'
          ? requestedStatusFilter
          : '전체'
      );
    }

    if ('documentFilter' in initialComposeRequest) {
      const requestedDocumentFilter = String(initialComposeRequest.documentFilter || '').trim();
      setApprovalDocumentFilter(requestedDocumentFilter || ALL_DOCUMENT_FILTER);
    }

    if ('keyword' in initialComposeRequest) {
      setApprovalKeyword(String(initialComposeRequest.keyword || ''));
    }

    if ('dateMode' in initialComposeRequest) {
      const requestedDateMode = String(initialComposeRequest.dateMode || '').trim();
      setApprovalDateMode(
        requestedDateMode === 'range'
          ? 'range'
          : requestedDateMode === 'week'
            ? 'week'
            : 'month',
      );
    }

    if ('month' in initialComposeRequest) {
      const requestedMonth = String(initialComposeRequest.month || '').trim();
      setApprovalMonth(/^\d{4}-\d{2}$/.test(requestedMonth) ? requestedMonth : defaultApprovalMonth);
    }

    if ('weekDate' in initialComposeRequest || initialComposeRequest.dateMode === 'week') {
      const requestedWeekDate = String(initialComposeRequest.weekDate || initialComposeRequest.dateFrom || '').trim().slice(0, 10);
      setApprovalWeekDate(/^\d{4}-\d{2}-\d{2}$/.test(requestedWeekDate) ? requestedWeekDate : defaultApprovalWeekDate);
    }

    if ('dateFrom' in initialComposeRequest) {
      setApprovalDateFrom(String(initialComposeRequest.dateFrom || '').slice(0, 10));
    }

    if ('dateTo' in initialComposeRequest) {
      setApprovalDateTo(String(initialComposeRequest.dateTo || '').slice(0, 10));
    }

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

    if (
      nextFormType === '물품신청' &&
      initialComposeRequest?.extraData &&
      typeof initialComposeRequest.extraData === 'object' &&
      Array.isArray((initialComposeRequest.extraData as ApprovalRecord).items)
    ) {
      setSuppliesLoadKey((key) => key + 1);
    }

    onConsumeComposeRequest?.();
  }, [
    approvalDirectoryStaffs,
    defaultApprovalMonth,
    defaultApprovalView,
    defaultApprovalWeekDate,
    initialComposeRequest,
    isHydratingComposeRef,
    onConsumeComposeRequest,
    resolveAccessibleView,
    resolveDefaultReferenceUsersForForm,
    setApprovalDateFrom,
    setApprovalDateMode,
    setApprovalDateTo,
    setApprovalDocumentFilter,
    setApprovalKeyword,
    setApprovalMonth,
    setApprovalStatusFilter,
    setApprovalWeekDate,
    setApproverLine,
    setAttendanceCorrectionSeedDates,
    setCcLine,
    setExtraData,
    setFormContent,
    setFormTitle,
    setFormType,
    setSelectedApprovalId,
    setSuppliesLoadKey,
    setSupplyInventoryReview,
    setViewMode,
  ]);

  useEffect(() => {
    if (!selectedApprovalId) return;
    if (approvals.some((item) => String(item?.id || '') === selectedApprovalId)) return;

    let cancelled = false;

    const loadSelectedApproval = async () => {
      const { data, error } = await supabase
        .from('approvals')
        .select('*')
        .eq('id', selectedApprovalId)
        .maybeSingle();

      if (cancelled || error || !data) return;

      setApprovals((prev) => (
        prev.some((item) => String(item?.id || '') === selectedApprovalId)
          ? prev
          : [data as ApprovalRecord, ...prev]
      ));
    };

    void loadSelectedApproval();

    return () => {
      cancelled = true;
    };
  }, [approvals, selectedApprovalId, setApprovals]);

  const fetchMyLastApproval = useCallback(async (type: string) => {
    if (!user?.id) return null;
    const { data } = await supabase
      .from('approvals')
      .select('*')
      .eq('sender_id', user.id)
      .eq('type', type)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return data as ApprovalRecord | null;
  }, [user?.id]);

  useEffect(() => {
    if (viewMode !== '작성하기' || !user?.id || !formType) return;
    fetchMyLastApproval(formType).then((row) => {
      if (row) setLastDraftByType((prev) => ({ ...prev, [formType]: row }));
      else setLastDraftByType((prev) => ({ ...prev, [formType]: null }));
    });
  }, [fetchMyLastApproval, formType, setLastDraftByType, user?.id, viewMode]);

  useEffect(() => {
    if (viewMode !== '작성하기') return;

    if (ccLine.length === 0) {
      const company = user?.company;
      const defaultCc = approvalDirectoryStaffs
        .filter((s) => isActiveStaff(s) && String(s.id) !== user?.id && s.company === company)
        .map((s) => ({
          id: s.id,
          name: s.name,
          position: s.position ?? null,
        }));
      setCcLine(defaultCc);
    }

    if (approverLine.length === 0) {
      const defaultApprovers = approvalDirectoryStaffs
        .filter((s) => isActiveStaff(s) && isDepartmentHeadOrAbove(s) && String(s.id) !== user?.id)
        .sort((a, b) => getPositionOrder(a.position, a.role) - getPositionOrder(b.position, b.role) || (a.name || '').localeCompare(b.name || ''));
      setApproverLine(defaultApprovers);
    }
  }, [ccLine.length, approverLine.length, approvalDirectoryStaffs, user, setCcLine, setApproverLine, viewMode]);

  useEffect(() => {
    if (viewMode !== '작성하기') return;
    if (isHydratingComposeRef.current) {
      isHydratingComposeRef.current = false;
      return;
    }
    setFormTitle('');
    setFormContent('');
    setExtraData({});
    setSupplyInventoryReview(null);
  }, [formType, isHydratingComposeRef, setExtraData, setFormContent, setFormTitle, setSupplyInventoryReview, viewMode]);

  const loadLastDraft = useCallback(() => {
    const last = lastDraftByType[formType];
    if (!last) return;
    hydratedComposeSeedIdRef.current = null;
    setComposeSeedApproval(null);
    const lastMeta = last.meta_data as ApprovalRecord | null | undefined;
    setFormTitle((last.title as string) || '');
    setFormContent((last.content as string) || '');
    setExtraData((lastMeta as ApprovalRecord) || {});
    const storedApproverLine = Array.isArray(last.approver_line)
      ? last.approver_line as unknown[]
      : Array.isArray(lastMeta?.approver_line)
        ? lastMeta.approver_line as unknown[]
        : [];
    setApproverLine(resolveApprovalStaffLine(storedApproverLine, approvalDirectoryStaffs));
    const storedCcUsers = normalizeApprovalCcUsers(lastMeta?.cc_users, approvalDirectoryStaffs);
    setCcLine(storedCcUsers.length > 0 ? storedCcUsers : resolveDefaultReferenceUsersForForm(formType));
    if (formType === '물품신청' && (lastMeta?.items as unknown[] | null | undefined)?.length) setSuppliesLoadKey((key) => key + 1);
  }, [
    approvalDirectoryStaffs,
    formType,
    lastDraftByType,
    resolveDefaultReferenceUsersForForm,
    setApproverLine,
    setCcLine,
    setExtraData,
    setFormContent,
    setFormTitle,
    setComposeSeedApproval,
    setSuppliesLoadKey,
  ]);

  const hydrateComposeFromApproval = useCallback((approval: ApprovalRecord) => {
    const approvalMeta = approval.meta_data as ApprovalRecord | null | undefined;
    if (isApprovalLocked(approvalMeta)) {
      toast('결재가 완료되어 잠긴 문서는 수정할 수 없습니다.', 'warning');
      return false;
    }
    const nextFormType = normalizeComposeFormType(
      String(approvalMeta?.form_name || approvalMeta?.form_slug || approval.type || '업무기안')
    );
    const storedApproverLine = Array.isArray(approval.approver_line)
      ? approval.approver_line as unknown[]
      : Array.isArray(approvalMeta?.approver_line)
        ? approvalMeta.approver_line as unknown[]
        : [];
    const storedCcUsers = normalizeApprovalCcUsers(approvalMeta?.cc_users, approvalDirectoryStaffs);

    isHydratingComposeRef.current = true;
    setFormType(nextFormType);
    setFormTitle((approval.title as string) || '');
    setFormContent((approval.content as string) || '');
    setExtraData((approvalMeta as ApprovalRecord) || {});
    setApproverLine(resolveApprovalStaffLine(storedApproverLine, approvalDirectoryStaffs));
    setCcLine(storedCcUsers.length > 0 ? storedCcUsers : resolveDefaultReferenceUsersForForm(nextFormType));
    if (nextFormType === '물품신청' && (approvalMeta?.items as unknown[] | null | undefined)?.length) {
      setSuppliesLoadKey((key) => key + 1);
    }
    return true;
  }, [
    approvalDirectoryStaffs,
    isHydratingComposeRef,
    resolveDefaultReferenceUsersForForm,
    setApproverLine,
    setCcLine,
    setExtraData,
    setFormContent,
    setFormTitle,
    setFormType,
    setSuppliesLoadKey,
  ]);

  useEffect(() => {
    if (viewMode !== '작성하기' || !composeSeedApproval) return;
    const seedId = String(composeSeedApproval.id || '');
    const seedKey = seedId || String(composeSeedApproval.created_at || composeSeedApproval.title || '');
    if (seedKey && hydratedComposeSeedIdRef.current === seedKey) return;

    const hydrated = hydrateComposeFromApproval(composeSeedApproval);
    if (hydrated) {
      hydratedComposeSeedIdRef.current = seedKey;
      return;
    }

    hydratedComposeSeedIdRef.current = null;
    setComposeSeedApproval(null);
  }, [composeSeedApproval, hydrateComposeFromApproval, setComposeSeedApproval, viewMode]);

  useEffect(() => {
    if (composeSeedApproval) return;
    hydratedComposeSeedIdRef.current = null;
  }, [composeSeedApproval]);

  useEffect(() => {
    if (viewMode !== '작성하기') return;
    if (typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(APPROVAL_DRAFT_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.formTitle || parsed?.formContent) {
          setDraftBanner(true);
        }
      }
    } catch { /* ignore */ }
  }, [setDraftBanner, viewMode]);

  const saveDraftNow = useCallback(() => {
    if (!formTitle && !formContent && Object.keys(extraData).length === 0) return;
    try {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      window.localStorage.setItem(
        APPROVAL_DRAFT_STORAGE_KEY,
        JSON.stringify({
          formTitle,
          formContent,
          extraData,
          formType,
          approverLine: approverLine.map((approver) => ({
            id: approver.id,
            name: approver.name,
            position: approver.position ?? null,
          })),
          ccLine,
          savedAt: hhmm,
        })
      );
      setAutoSaveMsg(`임시저장됨 ${hhmm}`);
      if (autoSaveMsgTimer.current) clearTimeout(autoSaveMsgTimer.current);
      autoSaveMsgTimer.current = setTimeout(() => setAutoSaveMsg(null), 3000);
    } catch { /* ignore */ }
  }, [approverLine, autoSaveMsgTimer, ccLine, extraData, formContent, formTitle, formType, setAutoSaveMsg]);

  useEffect(() => {
    if (viewMode !== '작성하기') return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveDraftNow();
    }, 3000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [autoSaveTimer, saveDraftNow, viewMode]);

  const loadDraftFromStorage = useCallback(() => {
    try {
      const saved = window.localStorage.getItem(APPROVAL_DRAFT_STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved);
      hydratedComposeSeedIdRef.current = null;
      setComposeSeedApproval(null);
      if (parsed?.formTitle) setFormTitle(parsed.formTitle);
      if (parsed?.formContent) setFormContent(parsed.formContent);
      if (parsed?.extraData) setExtraData(parsed.extraData);
      const nextFormType = parsed?.formType ? normalizeComposeFormType(parsed.formType) : formType;
      if (parsed?.formType) {
        if (nextFormType !== formType) {
          isHydratingComposeRef.current = true;
        }
        setFormType(nextFormType);
      }
      setApproverLine(resolveApprovalStaffLine(parsed?.approverLine, approvalDirectoryStaffs));
      const storedCcUsers = normalizeApprovalCcUsers(parsed?.ccLine, approvalDirectoryStaffs);
      setCcLine(storedCcUsers.length > 0 ? storedCcUsers : resolveDefaultReferenceUsersForForm(nextFormType));
    } catch { /* ignore */ }
    setDraftBanner(false);
  }, [
    approvalDirectoryStaffs,
    formType,
    isHydratingComposeRef,
    resolveDefaultReferenceUsersForForm,
    setApproverLine,
    setCcLine,
    setDraftBanner,
    setExtraData,
    setFormContent,
    setFormTitle,
    setFormType,
    setComposeSeedApproval,
  ]);

  const clearDraftFromStorage = useCallback(() => {
    try { window.localStorage.removeItem(APPROVAL_DRAFT_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return {
    loadLastDraft,
    loadDraftFromStorage,
    clearDraftFromStorage,
    saveDraftNow,
  };
}
