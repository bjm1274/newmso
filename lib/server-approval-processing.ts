import { sql } from 'drizzle-orm';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildSupplyRequestWorkflowItems,
  fetchSupportInventoryRows,
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
  summarizeSupplyRequestWorkflow,
} from '@/app/main/inventory-utils';
import { syncApprovalToDocumentRepository } from '@/lib/approval-document-archive';
import { ensureApprovedAnnualLeaveRequest, isAnnualLeaveType, syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import { extractLeaveRequestMeta } from '@/lib/leave-notice';
import { syncOfficialDocumentLogFromApproval } from '@/lib/official-document-approval';
import { isMissingColumnError } from '@/lib/supabase-compat';
import { formatKoreanDateKey, getKoreanTodayString } from '@/lib/seoul-time';
import { mirrorNotificationsToD1, type NotificationRow } from './notification-utils';
import {
  mirrorRowsToD1,
  attendance as attendanceTable,
  attendances as attendancesTable,
  attendance_corrections as attendanceCorrectionsTable,
  staff_transfer_history as staffTransferHistoryTable,
  certificate_issuances as certificateIssuancesTable,
} from '@/lib/db';

type ApprovalRow = Record<string, unknown>;

type ApprovalFinalizeResult = {
  alreadyProcessed: boolean;
  processedAt: string | null;
  steps: string[];
  warnings: string[];
  supplySummary?: ReturnType<typeof summarizeSupplyRequestWorkflow> | null;
};

function normalizeLeaveAttendanceStatus(leaveTypeValue: unknown) {
  const normalized = String(leaveTypeValue || '').trim().toLowerCase();
  if (normalized.includes('병가')) {
    return { legacy: '병가', modern: 'sick_leave' };
  }
  if (normalized.includes('반차') || normalized.includes('0.5')) {
    return { legacy: '반차휴가', modern: 'half_leave' };
  }
  return { legacy: '연차휴가', modern: 'annual_leave' };
}

function resolveAttendanceCorrectionStatusPair(correctionTypeValue: string) {
  const statusMap: Record<string, { att: string; atts: string }> = {
    정상반영: { att: '정상', atts: 'present' },
    지각처리: { att: '지각', atts: 'late' },
    결근처리: { att: '결근', atts: 'absent' },
  };

  return statusMap[correctionTypeValue] || statusMap['정상반영'];
}

function isAttendanceCorrectionApprovalSchemaError(error: unknown) {
  return ['attendance_date', 'requested_at', 'approval_status', 'approved_by', 'approved_at'].some((column) =>
    isMissingColumnError(error, column)
  );
}

async function upsertAttendanceCorrectionRows(
  supabase: SupabaseClient,
  correctionRows: Array<Record<string, unknown>>
) {
  const primaryResult = await supabase.from('attendance_corrections').upsert(correctionRows, {
    onConflict: 'staff_id,attendance_date',
  });

  if (!isAttendanceCorrectionApprovalSchemaError(primaryResult.error)) {
    if (primaryResult.error) throw primaryResult.error;
    // D1 미러 — (staff_id, attendance_date) 충돌 시 update
    const d1Rows = correctionRows.map((r) => ({
      id: crypto.randomUUID(),
      staff_id: r.staff_id as string | null,
      original_date: (r.original_date ?? null) as string | null,
      attendance_date: (r.attendance_date ?? null) as string | null,
      correction_type: (r.correction_type ?? null) as string | null,
      reason: (r.reason ?? null) as string | null,
      status: (r.status ?? '대기') as string,
      requested_at: (r.requested_at ?? new Date().toISOString()) as string,
      created_at: new Date().toISOString(),
    }));
    await mirrorRowsToD1(attendanceCorrectionsTable, d1Rows, {
      label: 'attendance_corrections',
      onConflict: 'update',
      target: [attendanceCorrectionsTable.staff_id, attendanceCorrectionsTable.attendance_date],
      set: {
        correction_type: sql`excluded.correction_type`,
        reason: sql`excluded.reason`,
        status: sql`excluded.status`,
        requested_at: sql`excluded.requested_at`,
      },
    });
    return;
  }

  for (const row of correctionRows) {
    const { data: existingRow, error: existingRowError } = await supabase
      .from('attendance_corrections')
      .select('id')
      .eq('staff_id', row.staff_id)
      .eq('original_date', row.original_date)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingRowError) throw existingRowError;

    if (existingRow?.id) {
      const { error: updateError } = await supabase
        .from('attendance_corrections')
        .update({
          status: '승인',
          reason: row.reason,
          correction_type: row.correction_type,
        })
        .eq('id', existingRow.id);

      if (updateError) throw updateError;
      continue;
    }

    const { error: insertError } = await supabase.from('attendance_corrections').insert({
      staff_id: row.staff_id,
      original_date: row.original_date,
      reason: row.reason,
      correction_type: row.correction_type,
      status: '승인',
    });

    if (insertError) throw insertError;

    // D1 미러 — 폴백 경로 단일 INSERT (attendance_date 부재 → onConflict 부적용)
    await mirrorRowsToD1(attendanceCorrectionsTable, {
      id: crypto.randomUUID(),
      staff_id: row.staff_id as string | null,
      original_date: (row.original_date ?? null) as string | null,
      attendance_date: null,
      correction_type: (row.correction_type ?? null) as string | null,
      reason: (row.reason ?? null) as string | null,
      status: '승인',
      requested_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    }, { label: 'attendance_corrections' });
  }
}

async function prepareSupplyApprovalInventoryWorkflow(supabase: SupabaseClient, item: ApprovalRow) {
  const metaData = item.meta_data as Record<string, unknown> | null | undefined;
  const requestedItems = Array.isArray(metaData?.items) ? metaData.items : [];
  if (!item?.id || requestedItems.length === 0) {
    return null;
  }

  const { data: sourceInventoryRows, error: sourceInventoryError } = await fetchSupportInventoryRows(supabase);
  if (sourceInventoryError) throw sourceInventoryError;

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
    .eq('id', String(item.id));

  if (metaError) throw metaError;

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
        title: `[물품요청 승인] ${String(item.title || '전자결재 문서')}`,
        body: `${String(item.sender_name || '요청자')} 요청이 승인되었습니다. 출고 가능 ${summary.issue_ready_count}건 / 발주 필요 ${summary.order_required_count}건을 확인해 주세요.`,
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
          title: '물품요청이 승인되었습니다.',
          body: '경영지원팀에서 실시간 재고를 확인하여 불출 또는 발주를 진행합니다.',
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
      await mirrorNotificationsToD1(notificationRows as NotificationRow[]);
    }
  } catch {
    // inventory workflow notification failure is non-blocking
  }

  return summary;
}

export async function processFinalApprovalEffects(
  supabase: SupabaseClient,
  item: ApprovalRow,
  actorId?: string | null,
) : Promise<ApprovalFinalizeResult> {
  const metaData = item.meta_data as Record<string, unknown> | null | undefined;
  const lifecycle =
    metaData?.server_processing && typeof metaData.server_processing === 'object'
      ? (metaData.server_processing as Record<string, unknown>)
      : null;

  if (String(lifecycle?.status || '') === 'completed' && lifecycle?.processed_at) {
    return {
      alreadyProcessed: true,
      processedAt: String(lifecycle.processed_at),
      steps: [],
      warnings: [],
      supplySummary: null,
    };
  }

  const startedAt = new Date().toISOString();
  const baseMetaData = {
    ...(metaData || {}),
    server_processing: {
      status: 'processing',
      started_at: startedAt,
      started_by: actorId || null,
      processed_at: null,
      errors: [],
    },
  };

  await supabase
    .from('approvals')
    .update({ meta_data: baseMetaData })
    .eq('id', String(item.id));

  const steps: string[] = [];
  const warnings: string[] = [];
  let supplySummary: ReturnType<typeof summarizeSupplyRequestWorkflow> | null = null;

  try {
    await syncApprovalToDocumentRepository(item, supabase);
    steps.push('document_repository');
  } catch (error) {
    warnings.push(`문서보관함 동기화 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
  }

  const itemMetaData = item.meta_data as Record<string, unknown> | null | undefined;

  if (item.type === '물품요청' && itemMetaData?.items) {
    try {
      supplySummary = await prepareSupplyApprovalInventoryWorkflow(supabase, item);
      steps.push('inventory_workflow');
    } catch (error) {
      warnings.push(`재고 워크플로우 준비 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
    }
  }

  if (item.type === '인사명령' && itemMetaData?.orderTargetId) {
    const { orderTargetId, newPosition, orderCategory, targetDept } = itemMetaData as {
      orderTargetId: string;
      newPosition?: string;
      orderCategory?: string;
      targetDept?: string;
    };

    try {
      const { data: currentStaff } = await supabase
        .from('staff_members')
        .select('department, position')
        .eq('id', orderTargetId)
        .maybeSingle();

      const staffUpdate: Record<string, unknown> = {};
      if (newPosition) staffUpdate.position = newPosition;
      if (orderCategory === '부서이동(전보)' && targetDept) {
        staffUpdate.department = targetDept;
      }

      if (Object.keys(staffUpdate).length > 0) {
        const { error: updateError } = await supabase
          .from('staff_members')
          .update(staffUpdate)
          .eq('id', orderTargetId);
        if (updateError) throw updateError;

        const transferRow = {
          staff_id: orderTargetId,
          transfer_type: orderCategory,
          before_value: orderCategory === '부서이동(전보)' ? currentStaff?.department : currentStaff?.position,
          after_value: orderCategory === '부서이동(전보)' ? targetDept : newPosition,
          effective_date: getKoreanTodayString(),
          approval_id: item.id,
        };
        await supabase.from('staff_transfer_history').insert(transferRow);
        await mirrorRowsToD1(staffTransferHistoryTable, {
          id: crypto.randomUUID(),
          staff_id: orderTargetId as string | null,
          transfer_type: orderCategory as string | null,
          before_value: (transferRow.before_value ?? null) as string | null,
          after_value: (transferRow.after_value ?? null) as string | null,
          effective_date: transferRow.effective_date,
          approval_id: (item.id ?? null) as string | null,
          created_at: new Date().toISOString(),
        }, { label: 'staff_transfer_history' });
      }

      steps.push('personnel_order');
    } catch (error) {
      warnings.push(`인사명령 반영 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
    }
  }

  if (item.type === '연차/휴가') {
    const senderId = String(item.sender_id || '');
    const leaveSummary = extractLeaveRequestMeta(itemMetaData);
    const startStr = leaveSummary?.startDate || '';
    const endStr = leaveSummary?.endDate || startStr;

    if (senderId && startStr) {
      try {
        const start = new Date(startStr);
        const end = new Date(endStr || startStr);
        const days = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const leaveType = leaveSummary?.leaveType || '연차';
        const leaveStatus = normalizeLeaveAttendanceStatus(leaveType);

        await ensureApprovedAnnualLeaveRequest(
          {
            staffId: senderId,
            leaveType,
            startDate: startStr,
            endDate: endStr,
            reason: leaveSummary?.reason || String(item.title || ''),
            approvalId: String(item.id || '').trim() || null,
            companyId: String(item.company_id || '').trim() || null,
            companyName: String(item.sender_company || '').trim() || null,
            delegateId: leaveSummary?.delegateId || null,
            delegateName: leaveSummary?.delegateName || null,
            delegateDepartment: leaveSummary?.delegateDepartment || null,
            delegatePosition: leaveSummary?.delegatePosition || null,
          },
          supabase,
        );

        for (let index = 0; index < days; index += 1) {
          const date = new Date(start);
          date.setDate(date.getDate() + index);
          const dateStr = formatKoreanDateKey(date);

          await supabase.from('attendance').upsert(
            {
              staff_id: senderId,
              date: dateStr,
              status: leaveStatus.legacy,
            },
            { onConflict: 'staff_id,date' },
          );
          await mirrorRowsToD1(attendanceTable, {
            id: crypto.randomUUID(),
            staff_id: senderId,
            date: dateStr,
            status: leaveStatus.legacy,
            created_at: new Date().toISOString(),
          }, {
            label: 'attendance',
            onConflict: 'update',
            target: [attendanceTable.staff_id, attendanceTable.date],
            set: { status: sql`excluded.status` },
          });

          await supabase.from('attendances').upsert(
            {
              staff_id: senderId,
              work_date: dateStr,
              status: leaveStatus.modern,
              check_in_time: null,
              check_out_time: null,
              work_hours_minutes: 0,
            },
            { onConflict: 'staff_id,work_date' },
          );
          await mirrorRowsToD1(attendancesTable, {
            id: crypto.randomUUID(),
            staff_id: senderId,
            work_date: dateStr,
            status: leaveStatus.modern,
            check_in_time: null,
            check_out_time: null,
            work_hours_minutes: 0,
            created_at: new Date().toISOString(),
          }, {
            label: 'attendances',
            onConflict: 'update',
            target: [attendancesTable.staff_id, attendancesTable.work_date],
            set: {
              status: sql`excluded.status`,
              check_in_time: sql`excluded.check_in_time`,
              check_out_time: sql`excluded.check_out_time`,
              work_hours_minutes: sql`excluded.work_hours_minutes`,
            },
          });
        }

        if (isAnnualLeaveType(leaveType)) {
          await syncAnnualLeaveUsedForStaff(senderId, supabase);
        }

        steps.push('leave_attendance');
      } catch (error) {
        warnings.push(`연차/휴가 반영 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
      }
    }
  }

  if (
    (String(item.type || '').trim() === '출결정정' || String(itemMetaData?.form_slug || '').trim() === 'attendance_fix') &&
    Array.isArray(itemMetaData?.correction_dates) &&
    itemMetaData.correction_dates.length > 0
  ) {
    try {
      const approvedAt = new Date().toISOString();
      const correctionType = String(itemMetaData?.correction_type || '정상반영');
      const correctionRows = (itemMetaData.correction_dates as string[]).map((dateStr: string) => ({
        staff_id: item.sender_id,
        attendance_date: dateStr,
        original_date: dateStr,
        reason: String(itemMetaData?.correction_reason || item.content || ''),
        correction_type: correctionType,
        requested_at: approvedAt,
        approval_status: '승인',
        status: '승인',
        approved_by: actorId || null,
        approved_at: approvedAt,
      }));

      await upsertAttendanceCorrectionRows(supabase, correctionRows);

      const { att, atts } = resolveAttendanceCorrectionStatusPair(correctionType);
      for (const dateStr of itemMetaData.correction_dates as string[]) {
        await supabase
          .from('attendance')
          .upsert({ staff_id: item.sender_id, date: dateStr, status: att }, { onConflict: 'staff_id,date' });
        await mirrorRowsToD1(attendanceTable, {
          id: crypto.randomUUID(),
          staff_id: item.sender_id as string | null,
          date: dateStr,
          status: att,
          created_at: new Date().toISOString(),
        }, {
          label: 'attendance',
          onConflict: 'update',
          target: [attendanceTable.staff_id, attendanceTable.date],
          set: { status: sql`excluded.status` },
        });

        await supabase
          .from('attendances')
          .upsert({ staff_id: item.sender_id, work_date: dateStr, status: atts }, { onConflict: 'staff_id,work_date' });
        await mirrorRowsToD1(attendancesTable, {
          id: crypto.randomUUID(),
          staff_id: item.sender_id as string,
          work_date: dateStr,
          status: atts,
          created_at: new Date().toISOString(),
        }, {
          label: 'attendances',
          onConflict: 'update',
          target: [attendancesTable.staff_id, attendancesTable.work_date],
          set: { status: sql`excluded.status` },
        });
      }

      steps.push('attendance_fix');
    } catch (error) {
      warnings.push(`출결정정 반영 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
    }
  }

  if (item.type === '양식요청' && itemMetaData?.form_type && itemMetaData?.target_staff && itemMetaData?.auto_issue) {
    try {
      const serialNo = `CERT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Date.now()).slice(-6)}`;
      const certRow = {
        staff_id: itemMetaData.target_staff as string,
        cert_type: itemMetaData.form_type as string,
        serial_no: serialNo,
        purpose: (itemMetaData.purpose as string) || '제출용',
        issued_by: actorId || null,
      };
      await supabase.from('certificate_issuances').insert(certRow);
      await mirrorRowsToD1(certificateIssuancesTable, {
        id: crypto.randomUUID(),
        staff_id: certRow.staff_id,
        cert_type: certRow.cert_type,
        serial_no: certRow.serial_no,
        purpose: certRow.purpose,
        issued_by: certRow.issued_by,
        issued_at: new Date().toISOString(),
      }, { label: 'certificate_issuances' });
      steps.push('certificate_issue');
    } catch (error) {
      warnings.push(`증명서 발급 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
    }
  }

  try {
    const officialDocResult = await syncOfficialDocumentLogFromApproval(supabase, item);
    if (officialDocResult) {
      steps.push('official_document_log');
    }
  } catch (error) {
    warnings.push(`공문서 발송대장 반영 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
  }

  const processedAt = new Date().toISOString();
  const nextMetaData = {
    ...(itemMetaData || {}),
    server_processing: {
      status: warnings.length > 0 ? 'completed_with_warnings' : 'completed',
      started_at: startedAt,
      started_by: actorId || null,
      processed_at: processedAt,
      errors: warnings,
      steps,
    },
  };

  await supabase
    .from('approvals')
    .update({ meta_data: nextMetaData })
    .eq('id', String(item.id));

  return {
    alreadyProcessed: false,
    processedAt,
    steps,
    warnings,
    supplySummary,
  };
}
