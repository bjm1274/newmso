import { logger } from '@/lib/logger';
import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from '@/lib/toast';
import {
  appendApprovalHistory,
  buildApprovalDocNumber,
  buildRevisionDocNumber,
  getApprovalRevision,
  resolveApprovalDocNumberConfig,
} from '@/lib/approval-workflow';
import { syncApprovalToDocumentRepository } from '@/lib/approval-document-archive';
import { buildApprovalHistoryEntryCore } from '@/lib/approval-shared';
import { isMissingColumnError } from '@/lib/supabase-compat';
import {
  extractOfficialDocRequest,
} from '@/lib/official-document-approval';
import { getReportApprovalSummary, getReportApprovalValidationMessage } from '@/lib/approval-report-utils';
import { extractLeaveRequestMeta } from '@/lib/leave-notice';
import {
  fetchSupportInventoryRows,
  getItemName,
  getItemQuantity,
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
  normalizeInventoryText,
  normalizeSupplyRequestItems,
  resolveInventoryDepartment,
} from '@/app/main/inventory-utils';
import { supabase } from '@/lib/supabase';
import type { StaffMember } from '@/types';
import {
  APPROVAL_OPTIONAL_INSERT_COLUMNS,
  BUILTIN_FORM_TYPE_DEFINITIONS,
  type ApprovalCcUser,
  type SupplyInventoryReviewRow,
  type SupplyInventoryReviewState,
} from '../전자결재-types';
import { normalizeApprovalCcUsers } from '../전자결재-utils';

type ApprovalRecord = Record<string, unknown>;
type ApprovalHistoryEntry = Parameters<typeof appendApprovalHistory>[1];
type SupplyItem = Array<{ name: string; qty: number; unit: string; category: string; dept: string; purpose: string }>;
type ApprovalSubmitOptions = {
  skipSupplyInventoryReview?: boolean;
  unregisteredItemNames?: string[];
};
type ConfirmApprovalSubmit = (options: {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'default' | 'accent' | 'danger';
}) => Promise<boolean>;

function normalizeUnregisteredItemNames(value: unknown) {
  const names = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  return names
    .map((name) => String(name || '').trim())
    .filter((name) => {
      const key = normalizeInventoryText(name);
      if (!key || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function normalizeDuplicateApprovalTitle(value: unknown) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

type UseApprovalSubmitParams = {
  user: StaffMember | null;
  selectedCompanyId?: string | null;
  selectedCompanyName?: string | null;
  formType: string;
  formTitle: string;
  formContent: string;
  extraData: ApprovalRecord;
  hasApproverSelection: boolean;
  approverLine: StaffMember[];
  ccLine: ApprovalCcUser[];
  customFormTypes: { name: string; slug: string }[];
  composeSeedApproval: ApprovalRecord | null;
  approvalDirectoryStaffs: StaffMember[];
  setSupplyInventoryReview: Dispatch<SetStateAction<SupplyInventoryReviewState | null>>;
  setComposeSeedApproval: Dispatch<SetStateAction<ApprovalRecord | null>>;
  setCcLine: Dispatch<SetStateAction<ApprovalCcUser[]>>;
  clearDraftFromStorage: () => void;
  resolveDefaultReferenceUsersForForm: (targetFormType: string) => ApprovalCcUser[];
  resolveAccessibleView: (requestedView?: string | null) => string | null;
  setViewMode: Dispatch<SetStateAction<string>>;
  onViewChange?: (view: string) => void;
  fetchApprovals: () => void | Promise<void>;
  onRefresh?: () => void;
  openConfirm: ConfirmApprovalSubmit;
  resolveEffectiveApproverId: (approverId: string | null | undefined) => string | null;
  resolveApprovalLineIds: (item: ApprovalRecord) => string[];
  surgeryStockDepartmentAliases: string[];
};

export function useApprovalSubmit({
  user,
  selectedCompanyId,
  selectedCompanyName,
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
}: UseApprovalSubmitParams) {
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const confirmApprovalSubmit = openConfirm;

  const buildApprovalHistoryEntry = useCallback(
    (action: ApprovalHistoryEntry['action'], note?: string | null) =>
      buildApprovalHistoryEntryCore(
        user?.id ? String(user.id) : null,
        user?.name ? String(user.name) : null,
        action,
        note
      ),
    [user?.id, user?.name]
  );

  const insertApprovalWithLegacyFallback = useCallback(async (row: ApprovalRecord) => {
    let candidateRow = { ...row };

    while (true) {
      const result = await supabase.from('approvals').insert([candidateRow]).select().single();
      const missingColumn = APPROVAL_OPTIONAL_INSERT_COLUMNS.find(
        (columnName) => columnName in candidateRow && isMissingColumnError(result.error, columnName)
      );

      if (!missingColumn) return result;

      const { [missingColumn]: _removed, ...legacyRow } = candidateRow;
      void _removed;
      candidateRow = legacyRow;
    }
  }, []);

  const createApprovalReferenceNotifications = useCallback(async (item: ApprovalRecord) => {
    const metaData = item?.meta_data as ApprovalRecord | null | undefined;
    const ccUsers = normalizeApprovalCcUsers(metaData?.cc_users, approvalDirectoryStaffs);
    const fallbackCcUsers = Array.isArray(metaData?.cc_users)
      ? metaData.cc_users
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const record = entry as ApprovalRecord;
            if (!record.id) return null;
            return {
              id: String(record.id),
              name: String(record.name || '이름 없음'),
            } satisfies ApprovalCcUser;
          })
          .filter(Boolean) as ApprovalCcUser[]
      : [];
    const resolvedCcUsers = ccUsers.length > 0 ? ccUsers : fallbackCcUsers;
    if (!item?.id || resolvedCcUsers.length === 0) return;

    const excludedIds = new Set<string>([
      String(item.sender_id || ''),
      ...resolveApprovalLineIds(item).map((id) => String(id)),
    ]);

    const notificationRows = Array.from(
      new Map(
        resolvedCcUsers
          .filter((ccUser) => ccUser.id && !excludedIds.has(String(ccUser.id)))
          .map((ccUser) => [
            String(ccUser.id),
            {
              user_id: String(ccUser.id),
              type: 'approval',
              title: `📎 참조 문서 도착: ${String(item.title || '전자결재 문서')}`,
              body: `${String(item.sender_name || '기안자')}의 문서가 참조로 공유되었습니다.`,
              metadata: {
                id: item.id,
                approval_id: item.id,
                type: 'approval',
                approval_role: 'reference',
                approval_view: '참조 문서함',
                sender_name: item.sender_name || null,
                document_type: item.type || null,
              },
            },
          ])
      ).values()
    );

    if (notificationRows.length === 0) return;

    const { error } = await supabase.from('notifications').insert(notificationRows);
    if (error && String(error.message || '').toLowerCase().includes('fetch')) {
      if (typeof window !== 'undefined') {
        const host = window.location.hostname;
        if (host === '127.0.0.1' || host === 'localhost') {
          try {
            await fetch('/rest/v1/notifications', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
              },
              body: JSON.stringify(notificationRows),
            });
            return;
          } catch {
            return;
          }
        }
      }
      return;
    }
    if (error) {
      console.error('참조자 알림 생성 실패:', error);
    }
  }, [approvalDirectoryStaffs, resolveApprovalLineIds]);

  const buildSupplyInventoryReviewRows = useCallback(
    (
      items: SupplyItem,
      supportInventoryRows: any[] = [],
      surgeryInventoryRows: any[] = [],
      registryInventoryRows: any[] = [],
    ) => {
      const companyName = String(user?.company || '').trim();
      const registeredItemKeys = new Set(
        [...registryInventoryRows, ...supportInventoryRows, ...surgeryInventoryRows]
          .map((row) => normalizeInventoryText(getItemName(row)))
          .filter(Boolean),
      );

      return items.map((item, index) => {
        const itemKey = normalizeInventoryText(item.name);
        const matchedSupportRows = supportInventoryRows.filter((row) => {
          const rowName = normalizeInventoryText(getItemName(row));
          return rowName === itemKey;
        });

        const matchedRows = surgeryInventoryRows.filter((row) => {
          const rowName = normalizeInventoryText(getItemName(row));
          const rowDepartment = String(resolveInventoryDepartment(row) || row?.department || '').trim();
          const rowCompany = String(row?.company || '').trim();

          return (
            rowName === itemKey &&
            surgeryStockDepartmentAliases.includes(rowDepartment) &&
            (!companyName || !rowCompany || rowCompany === companyName)
          );
        });

        const supportStock = matchedSupportRows.reduce((sum, row) => sum + getItemQuantity(row), 0);
        const surgeryStock = matchedRows.reduce((sum, row) => sum + getItemQuantity(row), 0);
        const matchedDepartments = Array.from(
          new Set(
            matchedRows
              .map((row) => String(resolveInventoryDepartment(row) || row?.department || '').trim())
              .filter(Boolean),
          ),
        );

        return {
          key: `${item.name}-${index}`,
          name: item.name,
          requestedQty: item.qty,
          unit: item.unit,
          isRegistered: registeredItemKeys.has(itemKey),
          supportStock,
          supportShortageQty: Math.max(item.qty - supportStock, 0),
          surgeryStock,
          surgeryShortageQty: Math.max(item.qty - surgeryStock, 0),
          matchedDepartments,
        } satisfies SupplyInventoryReviewRow;
      });
    },
    [surgeryStockDepartmentAliases, user?.company],
  );

  const prepareSupplyInventoryReview = useCallback(
    async (items: SupplyItem) => {
      const companyName = String(user?.company || '').trim();
      const notices: string[] = [];
      let supportInventoryRows: any[] = [];
      let surgeryInventoryRows: any[] = [];
      let registryInventoryRows: any[] = [];

      const [supportResult, surgeryResult, registryResult] = await Promise.all([
        fetchSupportInventoryRows(),
        (async () => {
          try {
            let query = supabase.from('inventory').select('*');
            if (companyName) {
              query = query.eq('company', companyName);
            }
            const { data, error } = await query;
            if (error) {
              throw error;
            }
            return { data: data || [], error: null as Error | null };
          } catch (error) {
            return { data: [] as any[], error: error as Error };
          }
        })(),
        (async () => {
          try {
            const { data, error } = await supabase.from('inventory').select('item_name');
            if (error) {
              throw error;
            }
            return { data: data || [], error: null as Error | null };
          } catch (error) {
            return { data: [] as any[], error: error as Error };
          }
        })(),
      ]);

      if (supportResult.error) {
        console.error('SY INC 경영지원팀 재고 조회 실패:', supportResult.error);
        notices.push('SY INC 경영지원팀 재고를 불러오지 못했습니다.');
      } else {
        supportInventoryRows = supportResult.data || [];
      }

      if (surgeryResult.error) {
        console.error('수술실 재고 확인용 재고 조회 실패:', surgeryResult.error);
        notices.push('수술실 현재 재고를 불러오지 못했습니다.');
      } else {
        surgeryInventoryRows = surgeryResult.data || [];
      }

      if (registryResult.error) {
        console.error('등록 품목 확인용 재고 조회 실패:', registryResult.error);
        notices.push('등록 품목 여부를 확인하지 못했습니다.');
      } else {
        registryInventoryRows = registryResult.data || [];
      }

      const reviewRows = buildSupplyInventoryReviewRows(
        items,
        supportInventoryRows,
        surgeryInventoryRows,
        registryInventoryRows,
      );
      const unregisteredItemNames = normalizeUnregisteredItemNames(
        reviewRows.filter((row) => !row.isRegistered).map((row) => row.name),
      );

      setSupplyInventoryReview({
        items,
        rows: reviewRows,
        unregisteredItemNames,
        notice:
          notices.length > 0
            ? `${notices.join(' ')} 재고 데이터 없이도 최종 신청은 진행할 수 있습니다.`
            : null,
      });
    },
    [buildSupplyInventoryReviewRows, setSupplyInventoryReview, user?.company],
  );

  const createStructuredDocNumber = useCallback(async (params: {
    formSlug?: string | null;
    typeName?: string | null;
    companyName?: string | null;
    companyId?: string | null;
    sourceMetaData?: ApprovalRecord | null | undefined;
    sourceDocNumber?: string | null;
  }) => {
    const revision = getApprovalRevision(params.sourceMetaData) + (params.sourceDocNumber ? 1 : 0);
    if (params.sourceDocNumber) {
      return {
        docNumber: buildRevisionDocNumber(params.sourceDocNumber, revision),
        revision,
      };
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    let countQuery = supabase
      .from('approvals')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', dayStart.toISOString())
      .lt('created_at', dayEnd.toISOString());

    if (params.companyId) countQuery = countQuery.eq('company_id', params.companyId);
    else if (params.companyName) countQuery = countQuery.eq('sender_company', params.companyName);

    const { count } = await countQuery;
    return {
      docNumber: buildApprovalDocNumber({
        companyName: params.companyName,
        companyId: params.companyId,
        departmentName: user?.department || null,
        formSlug: params.formSlug,
        typeName: params.typeName,
        createdAt: new Date(),
        sequence: (count || 0) + 1,
        config: resolveApprovalDocNumberConfig(
          user && typeof user === 'object' ? (user as unknown as ApprovalRecord) : null
        ),
      }),
      revision: 1,
    };
  }, [user]);

  const confirmPendingSupplyDuplicate = useCallback(async (trimmedTitle: string) => {
    if (!user?.id || composeSeedApproval?.id) return true;

    const normalizedTitle = normalizeDuplicateApprovalTitle(trimmedTitle);
    if (!normalizedTitle) return true;

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const { data, error } = await supabase
      .from('approvals')
      .select('id, title, created_at, meta_data')
      .eq('sender_id', user.id)
      .eq('type', formType)
      .eq('status', '대기')
      .gte('created_at', dayStart.toISOString())
      .lt('created_at', dayEnd.toISOString())
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) {
      logger.warn('중복 물품신청 확인을 건너뜁니다:', error);
      return true;
    }

    const duplicate = (data || []).find((item) => normalizeDuplicateApprovalTitle(item.title) === normalizedTitle);
    if (!duplicate) return true;

    const metaData = duplicate.meta_data as ApprovalRecord | null | undefined;
    const docNumber = String(metaData?.doc_number || '').trim();
    const createdAt = duplicate.created_at
      ? new Date(String(duplicate.created_at)).toLocaleString('ko-KR', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      : '';

    return confirmApprovalSubmit({
      title: '중복 물품신청 확인',
      description: `${createdAt ? `${createdAt}에 ` : ''}같은 제목의 대기 물품신청${docNumber ? `(${docNumber})` : ''}이 이미 있습니다. 새 문서로 한 건 더 올릴까요?`,
      confirmText: '새로 신청',
      cancelText: '취소',
      tone: 'accent',
    });
  }, [composeSeedApproval?.id, confirmApprovalSubmit, formType, user?.id]);

  const submitApproval = useCallback(async (options?: ApprovalSubmitOptions) => {
    const trimmedTitle = formTitle.trim();
    const officialDocumentRequest =
      formType === '공문발송'
        ? extractOfficialDocRequest(extraData)
        : null;

    if (!user?.id) {
      toast('로그인한 직원 계정으로만 기안할 수 있습니다.');
      return;
    }
    if (!trimmedTitle) {
      toast('기안 제목을 입력해주세요.', 'warning');
      return;
    }
    if (!hasApproverSelection) {
      toast('결재권자를 먼저 선택해주세요.', 'warning');
      return;
    }
    if (!formTitle || approverLine.length === 0) {
      toast('제목과 결재선을 지정해주세요.');
      return;
    }

    if (formType === '연차/휴가') {
      const startDate = extraData.startDate as string | undefined;
      const endDate = extraData.endDate as string | undefined;
      if (!startDate || startDate.length < 10) {
        toast('시작 일자를 입력해주세요.', 'warning');
        return;
      }
      if (!endDate || endDate.length < 10) {
        toast('종료 일자를 입력해주세요.', 'warning');
        return;
      }
    }

    if (formType === '연차계획서') {
      const planDates = extraData.planDates as Array<{ date: string; reason: string }> | undefined;
      if (!planDates || planDates.length === 0 || planDates.some((row) => !row.date || row.date.length < 10)) {
        toast('모든 사용 예정일을 입력해주세요.', 'warning');
        return;
      }
    }

    if (formType === '공문발송' && !officialDocumentRequest) {
      toast('발송 예정일, 수신처, 공문 제목을 입력해주세요.', 'warning');
      return;
    }

    if (formType === '보고서작성') {
      const reportValidationMessage = getReportApprovalValidationMessage(extraData);
      if (reportValidationMessage) {
        toast(reportValidationMessage, 'warning');
        return;
      }
    }

    const normalizedSupplyItems =
      formType === '물품신청'
        ? normalizeSupplyRequestItems(Array.isArray(extraData?.items) ? (extraData.items as any[]) : [])
        : [];

    if (formType === '물품신청') {
      if (normalizedSupplyItems.length === 0) {
        toast('신청할 물품을 1개 이상 입력해주세요.', 'warning');
        return;
      }

      if (!options?.skipSupplyInventoryReview) {
        await prepareSupplyInventoryReview(normalizedSupplyItems);
        return;
      }
    }

    if (normalizedSupplyItems.length > 0) {
      const shouldContinue = await confirmPendingSupplyDuplicate(trimmedTitle);
      if (!shouldContinue) return;
    }

    const requiredCc = formType === '물품신청' ? ['관리팀', '행정팀'] : ['행정팀'];
    const extraCc = Array.isArray(extraData?.cc_departments) ? extraData.cc_departments as string[] : [];
    const cc_departments = Array.from(new Set([...extraCc, ...requiredCc]));
    let nextExtraData = extraData;
    const unregisteredItemNames =
      formType === '물품신청'
        ? normalizeUnregisteredItemNames(
            options?.unregisteredItemNames ?? extraData?.unregistered_item_names,
          )
        : [];
    const unregisteredItemKeySet = new Set(unregisteredItemNames.map((name) => normalizeInventoryText(name)));

    if (formType === '물품신청') {
      nextExtraData = {
        ...extraData,
        items: normalizedSupplyItems.map((item) => {
          const isUnregistered = unregisteredItemKeySet.has(normalizeInventoryText(item.name));
          return {
            ...item,
            inventory_registered: !isUnregistered,
            unregistered_inventory_item: isUnregistered,
          };
        }),
        has_unregistered_items: unregisteredItemNames.length > 0,
        unregistered_item_names: unregisteredItemNames,
        inventory_registration_warning:
          unregisteredItemNames.length > 0
            ? `재고관리에 등록되지 않은 품목이 포함되어 있습니다: ${unregisteredItemNames.join(', ')}`
            : null,
        inventory_source_company: INVENTORY_SUPPORT_COMPANY,
        inventory_source_department: INVENTORY_SUPPORT_DEPARTMENT,
      };
    } else if (formType === '연차/휴가') {
      const leaveMeta = extractLeaveRequestMeta(extraData);
      const leaveTypeValue = leaveMeta?.leaveType || String(extraData.vType || '연차 (1.0)').trim() || '연차 (1.0)';
      nextExtraData = {
        ...extraData,
        vType: leaveTypeValue,
        leaveType: leaveTypeValue,
        delegateId: leaveMeta?.delegateId || String(extraData.delegateId || '').trim(),
        delegateName: leaveMeta?.delegateName || String(extraData.delegateName || '').trim(),
        delegateDepartment: leaveMeta?.delegateDepartment || String(extraData.delegateDepartment || '').trim(),
        delegatePosition: leaveMeta?.delegatePosition || String(extraData.delegatePosition || '').trim(),
        // 군소집휴가 첨부파일
        ...(leaveTypeValue === '군소집휴가' && Array.isArray(extraData.attachments) && extraData.attachments.length > 0
          ? { attachments: extraData.attachments }
          : {}),
      };
    } else if (formType === '공문발송' && officialDocumentRequest) {
      nextExtraData = {
        ...extraData,
        official_doc_request: officialDocumentRequest,
        request_category: 'official_document_dispatch',
      };
    } else if (formType === '보고서작성') {
      const reportSummary = getReportApprovalSummary(extraData);
      nextExtraData = {
        ...extraData,
        report_type_label: reportSummary.reportTypeLabel,
        attachments: reportSummary.attachments,
        request_category: 'report',
      };
    }

    const selectedCustomForm = customFormTypes.find((item) => item.slug === formType);
    const builtInForm = BUILTIN_FORM_TYPE_DEFINITIONS.find((item) => item.slug === formType || item.name === formType);
    const resolvedFormSlug = selectedCustomForm?.slug || builtInForm?.slug || formType;
    const resolvedFormName = selectedCustomForm?.name || builtInForm?.name || formType;
    const sourceApprovalMeta = composeSeedApproval?.meta_data as ApprovalRecord | null | undefined;
    const sourceDocNumber = String(
      composeSeedApproval?.doc_number || sourceApprovalMeta?.doc_number || ''
    ).trim() || null;
    const selectedCompanyLabel = String(selectedCompanyName || '').trim();
    const userCompanyLabel = String(user.company || '').trim();
    const companyName =
      selectedCompanyLabel && selectedCompanyLabel !== '전체'
        ? selectedCompanyLabel
        : userCompanyLabel;
    const companyId =
      selectedCompanyId ??
      (companyName && companyName === userCompanyLabel ? user.company_id ?? null : null);
    const { docNumber: structuredDocNumber, revision } = await createStructuredDocNumber({
      formSlug: resolvedFormSlug,
      typeName: resolvedFormName,
      companyName,
      companyId: companyId ? String(companyId) : null,
      sourceMetaData: sourceApprovalMeta,
      sourceDocNumber,
    });
    const firstApproverId = String(approverLine[0]?.id || '');
    const initialApproverId = resolveEffectiveApproverId(firstApproverId) || firstApproverId;

    const row: ApprovalRecord = {
      sender_id: user.id,
      sender_name: user.name || '이름 없음',
      sender_company: companyName,
      current_approver_id: initialApproverId,
      approver_line: approverLine.map((a) => a.id),
      type: formType,
      title: formTitle,
      content: formContent || '',
      meta_data: {
        ...nextExtraData,
        ...(formType === '연차/휴가' ? { reason: formContent || '' } : {}),
        form_slug: resolvedFormSlug,
        form_name: resolvedFormName,
        cc_departments,
        cc_users: ccLine.map(c => ({ id: c.id, name: c.name })),
        approver_line: approverLine.map((a) => a.id),
        approver_line_details: approverLine.map((approver) => ({
          id: String(approver.id || ''),
          name: approver.name || '',
          position: approver.position || null,
          department: approver.department || null,
          company: approver.company || null,
        })),
        doc_number: structuredDocNumber,
        revision,
        source_approval_id: composeSeedApproval?.id || null,
        previous_doc_number: sourceDocNumber,
      },
      doc_number: structuredDocNumber,
      status: '대기',
    };
    row.meta_data = appendApprovalHistory(row.meta_data as ApprovalRecord | null | undefined, {
      ...buildApprovalHistoryEntry(composeSeedApproval?.id ? 'resubmitted' : 'created', composeSeedApproval?.id ? '회수 후 재상신' : '최초 상신'),
      current_approver_id: initialApproverId || null,
      revision,
    });
    if (companyId != null) row.company_id = companyId;

    const { error, data: insertedApproval } = await insertApprovalWithLegacyFallback(row);

    if (error) {
      console.error('기안 상신 실패:', error);
      toast(`기안이 올라가지 않았습니다.\n\n${error.message || ''}`, 'error');
      return;
    }
    try {
      await syncApprovalToDocumentRepository((insertedApproval as ApprovalRecord | null) ?? row);
    } catch (archiveError) {
      console.error('결재 문서보관함 저장 실패:', archiveError);
      toast('결재 문서는 상신됐지만 문서보관함 저장에는 실패했습니다.', 'warning');
    }
    await createApprovalReferenceNotifications((insertedApproval as ApprovalRecord | null) ?? row);
    if (composeSeedApproval?.id) {
      const supersededMetaData = {
        ...((sourceApprovalMeta || {}) as ApprovalRecord),
        superseded_by: (insertedApproval as ApprovalRecord | null | undefined)?.id || null,
      };
      await supabase.from('approvals').update({ meta_data: supersededMetaData }).eq('id', composeSeedApproval.id);
    }
    clearDraftFromStorage();
    setComposeSeedApproval(null);
    setCcLine(resolveDefaultReferenceUsersForForm(formType));
    toast('상신 완료!', 'success');
    const nextView = resolveAccessibleView('기안함');
    if (nextView) {
      setViewMode(nextView);
      if (typeof onViewChange === 'function') onViewChange(nextView);
    }
    fetchApprovals();
    if (onRefresh) onRefresh();
  }, [
    approvalDirectoryStaffs,
    approverLine,
    buildApprovalHistoryEntry,
    ccLine,
    clearDraftFromStorage,
    composeSeedApproval,
    confirmPendingSupplyDuplicate,
    createApprovalReferenceNotifications,
    createStructuredDocNumber,
    customFormTypes,
    extraData,
    fetchApprovals,
    formContent,
    formTitle,
    formType,
    hasApproverSelection,
    insertApprovalWithLegacyFallback,
    onRefresh,
    onViewChange,
    prepareSupplyInventoryReview,
    resolveAccessibleView,
    resolveDefaultReferenceUsersForForm,
    resolveEffectiveApproverId,
    selectedCompanyId,
    selectedCompanyName,
    setCcLine,
    setComposeSeedApproval,
    setViewMode,
    user,
  ]);

  const handleSubmit = useCallback(async (options?: ApprovalSubmitOptions) => {
    if (isSubmittingRef.current) {
      toast('이미 신청 처리 중입니다. 잠시만 기다려 주세요.', 'warning');
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);

    try {
      await submitApproval(options);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }, [submitApproval]);

  return {
    handleSubmit,
    isSubmitting,
  };
}
