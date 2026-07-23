import { sql } from 'drizzle-orm';
import {
  buildSupplyRequestWorkflowItems,
  fetchSupportInventoryRows,
  INVENTORY_SUPPORT_COMPANY,
  INVENTORY_SUPPORT_DEPARTMENT,
  summarizeSupplyRequestWorkflow } from '@/app/main/inventory-utils';
import { syncApprovalToDocumentRepository } from '@/lib/approval-document-archive';
import { ensureApprovedAnnualLeaveRequest, isAnnualLeaveType, syncAnnualLeaveUsedForStaff } from '@/lib/annual-leave-ledger';
import { extractLeaveRequestMeta } from '@/lib/leave-notice';
import { LEAVE_TYPE, normalizeLeaveType } from '@/lib/leave-type';
import { syncOfficialDocumentLogFromApproval } from '@/lib/official-document-approval';
import { formatKoreanDateKey, getKoreanTodayString } from '@/lib/seoul-time';
import { insertNotificationsOrThrow, type NotificationRow } from './notification-utils';
import {
  attendance as attendanceTable,
  attendances as attendancesTable,
  attendance_corrections as attendanceCorrectionsTable,
  staff_transfer_history as staffTransferHistoryTable,
  certificate_issuances as certificateIssuancesTable,
  approvals as approvalsTable,
  staff_members as staffMembersTable,
  eq,
  getD1Binding,
  getD1Drizzle } from '@/lib/db';
import { logD1BindingMissing } from '@/lib/db/mirror-metrics';
import {
  isFinalApprovalEffectsDone,
  normalizeLeaveAttendanceStatus,
  resolveAttendanceCorrectionStatusPair } from '@/lib/server-approval-processing-helpers';

// D1 binding 필수 — Workers env 가 없으면 throw. (서버 라우트 안에서만 호출)
//
// 본 파일은 결재 처리(승인 효과 반영) 헬퍼로 7+1개 dual-write 지점을 가졌으나,
// Phase 8-C 부터는 D1 binding 을 직접 사용해 INSERT/UPSERT 한다.
//
// 순수 헬퍼(normalizeLeaveAttendanceStatus / resolveAttendanceCorrectionStatusPair /
// isFinalApprovalEffectsDone)는 server-approval-processing-helpers.ts 로 분리됨.
// TODO(phase 8-D 이후): type 별 비동기 핸들러
// (handlePersonnelOrder / handleLeaveAttendance / handleAttendanceFix /
//  handleCertificateIssue) 로 추가 분리 권장.
async function requireD1ForApprovalProcessing(label: string) {
  const d1 = await getD1Binding();
  if (!d1) {
    logD1BindingMissing({ label, backend: 'd1' });
    throw new Error(`[server-approval-processing] D1 binding not available (${label})`);
  }
  return getD1Drizzle(d1);
}

type ApprovalRow = Record<string, unknown>;

type ApprovalFinalizeResult = {
  alreadyProcessed: boolean;
  processedAt: string | null;
  steps: string[];
  warnings: string[];
  supplySummary?: ReturnType<typeof summarizeSupplyRequestWorkflow> | null;
};

/** 이미 후처리 완료된 경우의 공통 성공 응답 (side effect 없음). */
function alreadyProcessedResult(processedAt: string | null): ApprovalFinalizeResult {
  return {
    alreadyProcessed: true,
    processedAt,
    steps: [],
    warnings: [],
    supplySummary: null };
}

async function upsertAttendanceCorrectionRows(
  correctionRows: Array<Record<string, unknown>>
) {
  if (correctionRows.length === 0) return;

  // Phase 8-C: D1 직접 upsert — db + mirror 2단 처리 대체.
  // attendance_corrections D1 스키마는 attendance_date 보유 → 항상 onConflictDoUpdate 사용.
  // (Supabase 측 'approval_status'/'approved_by'/'approved_at' 컬럼은 D1엔 없으므로 row 매핑에서 자동 제외)
  const db = await requireD1ForApprovalProcessing('attendance_corrections.upsert');
  const d1Rows = correctionRows.map((r) => ({
    id: crypto.randomUUID(),
    staff_id: (r.staff_id ?? null) as string | null,
    original_date: (r.original_date ?? null) as string | null,
    attendance_date: (r.attendance_date ?? null) as string | null,
    correction_type: (r.correction_type ?? null) as string | null,
    reason: (r.reason ?? null) as string | null,
    status: (r.status ?? '대기') as string,
    requested_at: (r.requested_at ?? new Date().toISOString()) as string,
    created_at: new Date().toISOString() }));

  await db
    .insert(attendanceCorrectionsTable)
    .values(d1Rows)
    .onConflictDoUpdate({
      target: [sql`staff_id`, sql`attendance_date`],
      set: {
        correction_type: sql`excluded.correction_type`,
        reason: sql`excluded.reason`,
        status: sql`excluded.status`,
        requested_at: sql`excluded.requested_at` } });
}

async function prepareSupplyApprovalInventoryWorkflow(item: ApprovalRow) {
  const metaData = item.meta_data as Record<string, unknown> | null | undefined;
  const requestedItems = Array.isArray(metaData?.items) ? metaData.items : [];
  if (!item?.id || requestedItems.length === 0) {
    return null;
  }

  const { data: sourceInventoryRows, error: sourceInventoryError } = await fetchSupportInventoryRows();
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
    summary };

  const nextMetaData = {
    ...(metaData || {}),
    inventory_workflow: workflow };

  {
    const d1 = await getD1Binding();
    if (!d1) throw new Error('[server-approval-processing] D1 binding not available (supply:approvals.update)');
    const db = getD1Drizzle(d1);
    await db
      .update(approvalsTable)
      .set({ meta_data: JSON.stringify(nextMetaData) })
      .where(eq(approvalsTable.id, String(item.id)));
  }

  try {
    let inventoryManagerRows: Array<{ id: string; name: string }> = [];
    {
      const d1 = await getD1Binding();
      if (d1) {
        const db = getD1Drizzle(d1);
        const { and: drizzleAnd, eq: drizzleEq } = await import('drizzle-orm');
        const rows = await db
          .select({ id: staffMembersTable.id, name: staffMembersTable.name })
          .from(staffMembersTable)
          .where(
            drizzleAnd(
              drizzleEq(staffMembersTable.company, INVENTORY_SUPPORT_COMPANY),
              drizzleEq(staffMembersTable.department, INVENTORY_SUPPORT_DEPARTMENT),
            )
          );
        inventoryManagerRows = rows.map((r) => ({ id: String(r.id ?? ''), name: String(r.name ?? '') }));
      }
    }
    // 이하 코드를 위해 inventoryManagers 변수명으로 통합
    const inventoryManagers = inventoryManagerRows;

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
          summary } }))
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
            summary } }]
      : [];

    const notificationRows = [...managerNotifications, ...senderNotification];
    if (notificationRows.length > 0) {
      // Phase 8-C: D1 직접 INSERT — db + mirror 2단 처리 대체.
      await insertNotificationsOrThrow(notificationRows as NotificationRow[]);
    }
  } catch {
    // inventory workflow notification failure is non-blocking
  }

  return summary;
}

export async function processFinalApprovalEffects(
  item: ApprovalRow,
  actorId?: string | null,
) : Promise<ApprovalFinalizeResult> {
  const metaData = item.meta_data as Record<string, unknown> | null | undefined;

  // 멱등: 이미 server_processing 완료(completed / completed_with_warnings)면 side effect 재실행 금지
  const prior = isFinalApprovalEffectsDone(metaData);
  if (prior.done) {
    return alreadyProcessedResult(prior.processedAt);
  }

  const startedAt = new Date().toISOString();
  const baseMetaData = {
    ...(metaData || {}),
    server_processing: {
      status: 'processing',
      started_at: startedAt,
      started_by: actorId || null,
      processed_at: null,
      errors: [] } };

  {
    const d1 = await getD1Binding();
    if (d1) {
      const db = getD1Drizzle(d1);
      await db
        .update(approvalsTable)
        .set({ meta_data: JSON.stringify(baseMetaData) })
        .where(eq(approvalsTable.id, String(item.id)));
    }
    // d1 binding 없으면 silently skip — 마커 실패가 처리를 막지 않도록
  }

  const steps: string[] = [];
  const warnings: string[] = [];
  let supplySummary: ReturnType<typeof summarizeSupplyRequestWorkflow> | null = null;

  try {
    await syncApprovalToDocumentRepository(item);
    steps.push('document_repository');
  } catch (error) {
    warnings.push(`문서보관함 동기화 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
  }

  const itemMetaData = item.meta_data as Record<string, unknown> | null | undefined;

  if (item.type === '공문발송' || itemMetaData?.official_doc_request) {
    try {
      await syncOfficialDocumentLogFromApproval(item);
      steps.push('official_document_log');
    } catch (error) {
      warnings.push(`공문대장 동기화 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
    }
  }

  if (item.type === '물품신청' && itemMetaData?.items) {
    try {
      supplySummary = await prepareSupplyApprovalInventoryWorkflow(item);
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
      let currentStaffDept: string | null | undefined;
      let currentStaffPosition: string | null | undefined;

      {
        const d1 = await getD1Binding();
        if (!d1) throw new Error('[server-approval-processing] D1 binding not available (personnel_order:staff_members.select)');
        const db = getD1Drizzle(d1);
        const rows = await db
          .select({ department: staffMembersTable.department, position: staffMembersTable.position })
          .from(staffMembersTable)
          .where(eq(staffMembersTable.id, orderTargetId));
        currentStaffDept = rows[0]?.department ?? null;
        currentStaffPosition = rows[0]?.position ?? null;
      }

      const staffUpdate: Record<string, unknown> = {};
      if (newPosition) staffUpdate.position = newPosition;
      if (orderCategory === '부서이동(전보)' && targetDept) {
        staffUpdate.department = targetDept;
      }

      if (Object.keys(staffUpdate).length > 0) {
        {
          const d1 = await getD1Binding();
          if (!d1) throw new Error('[server-approval-processing] D1 binding not available (personnel_order:staff_members.update)');
          const db = getD1Drizzle(d1);
          await db
            .update(staffMembersTable)
            .set(staffUpdate as Parameters<ReturnType<typeof db.update>['set']>[0])
            .where(eq(staffMembersTable.id, orderTargetId));
        }

        const transferRow = {
          staff_id: orderTargetId,
          transfer_type: orderCategory,
          before_value: orderCategory === '부서이동(전보)' ? currentStaffDept : currentStaffPosition,
          after_value: orderCategory === '부서이동(전보)' ? targetDept : newPosition,
          effective_date: getKoreanTodayString(),
          approval_id: item.id };
        // Phase 8-C: D1 직접 INSERT — db + mirror 2단 처리 대체.
        const transferDb = await requireD1ForApprovalProcessing('staff_transfer_history.insert');
        await transferDb.insert(staffTransferHistoryTable).values({
          id: crypto.randomUUID(),
          staff_id: orderTargetId as string | null,
          transfer_type: (orderCategory ?? null) as string | null,
          before_value: (transferRow.before_value ?? null) as string | null,
          after_value: (transferRow.after_value ?? null) as string | null,
          effective_date: transferRow.effective_date,
          approval_id: (item.id ?? null) as string | null,
          created_at: new Date().toISOString() });
      }

      steps.push('personnel_order');
    } catch (error) {
      warnings.push(`인사명령 반영 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
    }
  }

  if (item.type === '연차/휴가' || item.type === '휴가신청') {
    const senderId = String(item.sender_id || '');
    const leaveSummary = extractLeaveRequestMeta(itemMetaData);
    const startStr = leaveSummary?.startDate || '';
    const endStr = leaveSummary?.endDate || startStr;

    if (senderId && startStr) {
      try {
        const start = new Date(startStr);
        const end = new Date(endStr || startStr);
        const days = leaveSummary?.days ?? Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        const leaveType = normalizeLeaveType(leaveSummary?.leaveType || LEAVE_TYPE.ANNUAL);
        const leaveStatus = normalizeLeaveAttendanceStatus(leaveType);

        await ensureApprovedAnnualLeaveRequest({
          staffId: senderId,
          leaveType,
          startDate: startStr,
          endDate: endStr,
          days: leaveSummary?.days,
          reason: leaveSummary?.reason || String(item.title || ''),
          approvalId: String(item.id || '').trim() || null,
          companyId: String(item.company_id || '').trim() || null,
          companyName: String(item.sender_company || '').trim() || null,
          delegateId: leaveSummary?.delegateId || null,
          delegateName: leaveSummary?.delegateName || null,
          delegateDepartment: leaveSummary?.delegateDepartment || null,
          delegatePosition: leaveSummary?.delegatePosition || null });

        // Phase 8-C: D1 직접 upsert — db + mirror 2단 처리 대체.
        const leaveDb = await requireD1ForApprovalProcessing('leave_attendance.upsert');

        // 연차(부여): staff_members.annual_leave_total 직접 쓰기 금지.
        // 잔액 SSOT 는 leave_balances — 아래에서 recalculateLeaveBalance 경로로 반영.

        // 연차(부여) 및 연차(과거사용)는 실제 휴가 사용이 아니므로 출결부 마킹 생략
        if (leaveType !== LEAVE_TYPE.GRANT && leaveType !== LEAVE_TYPE.RETRO_USE) {
          const totalCalendarDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
          for (let index = 0; index < totalCalendarDays; index += 1) {
            const date = new Date(start);
            date.setDate(date.getDate() + index);
            const dayOfWeek = date.getDay();
            // 주말(토:6, 일:0)은 출결부 휴가 마킹 제외
            if (dayOfWeek === 0 || dayOfWeek === 6) continue;

            const dateStr = formatKoreanDateKey(date);

            await leaveDb
              .insert(attendanceTable)
              .values({
                id: crypto.randomUUID(),
                staff_id: senderId,
                date: dateStr,
                status: leaveStatus.legacy,
                created_at: new Date().toISOString() })
              .onConflictDoUpdate({
                target: [sql`staff_id`, sql`date`],
                set: { status: sql`excluded.status` } });

            await leaveDb
              .insert(attendancesTable)
              .values({
                id: crypto.randomUUID(),
                staff_id: senderId,
                work_date: dateStr,
                status: leaveStatus.modern,
                check_in_time: null,
                check_out_time: null,
                work_hours_minutes: 0,
                created_at: new Date().toISOString() })
              .onConflictDoUpdate({
                target: [sql`staff_id`, sql`work_date`],
                set: {
                  status: sql`excluded.status`,
                  check_in_time: sql`excluded.check_in_time`,
                  check_out_time: sql`excluded.check_out_time`,
                  work_hours_minutes: sql`excluded.work_hours_minutes` } });
          }
        }

        if (isAnnualLeaveType(leaveType)) {
          await syncAnnualLeaveUsedForStaff(senderId);
        }

        // 연차 부여/차감/사용 후 잔여연차 및 밸런스 테이블 재계산 트리거
        try {
          const { recalculateLeaveBalance } = await import('@/lib/annual-leave-balance');
          // 당해 연도 잔액 재계산 (year 미지정 시 서버 로컬 연도 — leave_balances.year 와 맞춤)
          await recalculateLeaveBalance(senderId);
        } catch (recalcErr) {
          console.error('[server-approval-processing] recalculateLeaveBalance 실패:', recalcErr);
        }

        steps.push('leave_attendance');

        // Immediately dispatch leave notice if the leave starts today or in the past
        try {
          const { announceLeaveApprovalIfNeeded } = await import('@/lib/leave-notice-cron');
          const approvalRow = {
            id: String(item.id),
            sender_id: item.sender_id as string | null,
            sender_name: item.sender_name as string | null,
            sender_company: item.sender_company as string | null,
            company_id: item.company_id as string | null,
            title: item.title as string | null,
            meta_data: itemMetaData, // Use the latest itemMetaData
            created_at: item.created_at as string | null };
          const announced = await announceLeaveApprovalIfNeeded(leaveDb, approvalRow);
          if (announced) {
            steps.push('leave_immediate_announcement');
          }
        } catch (annErr) {
          console.error('[server-approval-processing] Failed to dispatch immediate leave notice:', annErr);
        }
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
        status: '승인' }));

      await upsertAttendanceCorrectionRows(correctionRows);

      const { att, atts } = resolveAttendanceCorrectionStatusPair(correctionType);
      const fixCheckIn = (itemMetaData?.check_in_time || itemMetaData?.fix_check_in || itemMetaData?.check_in || null) as string | null;
      const fixCheckOut = (itemMetaData?.check_out_time || itemMetaData?.fix_check_out || itemMetaData?.check_out || null) as string | null;
      const fixWorkHours = typeof itemMetaData?.work_hours_minutes === 'number'
        ? itemMetaData.work_hours_minutes
        : typeof itemMetaData?.work_hours === 'number'
          ? itemMetaData.work_hours * 60
          : null;

      // Phase 8-C: D1 직접 upsert — db + mirror 2단 처리 대체.
      const fixDb = await requireD1ForApprovalProcessing('attendance_fix.upsert');
      for (const dateStr of itemMetaData.correction_dates as string[]) {
        await fixDb
          .insert(attendanceTable)
          .values({
            id: crypto.randomUUID(),
            staff_id: item.sender_id as string | null,
            date: dateStr,
            status: att,
            created_at: new Date().toISOString() })
          .onConflictDoUpdate({
            target: [sql`staff_id`, sql`date`],
            set: { status: sql`excluded.status` } });

        await fixDb
          .insert(attendancesTable)
          .values({
            id: crypto.randomUUID(),
            staff_id: item.sender_id as string,
            work_date: dateStr,
            status: atts,
            check_in_time: fixCheckIn,
            check_out_time: fixCheckOut,
            work_hours_minutes: fixWorkHours,
            created_at: new Date().toISOString() })
          .onConflictDoUpdate({
            target: [sql`staff_id`, sql`work_date`],
            set: {
              status: sql`excluded.status`,
              ...(fixCheckIn ? { check_in_time: sql`excluded.check_in_time` } : {}),
              ...(fixCheckOut ? { check_out_time: sql`excluded.check_out_time` } : {}),
              ...(fixWorkHours !== null ? { work_hours_minutes: sql`excluded.work_hours_minutes` } : {}) } });
      }

      steps.push('attendance_fix');
    } catch (error) {
      warnings.push(`출결정정 반영 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
    }
  }

  if (item.type === '양식요청' && itemMetaData?.form_type && itemMetaData?.target_staff && itemMetaData?.auto_issue) {
    try {
      // 증명서 일련번호의 연·월은 KST 기준 (서버 UTC면 월말/연말 자정 부근 어긋남)
      const certYearMonth = getKoreanTodayString().slice(0, 7).replace('-', '');
      const serialNo = `CERT-${certYearMonth}-${String(Date.now()).slice(-6)}`;
      const certRow = {
        staff_id: itemMetaData.target_staff as string,
        cert_type: itemMetaData.form_type as string,
        serial_no: serialNo,
        purpose: (itemMetaData.purpose as string) || '제출용',
        issued_by: actorId || null };
      // Phase 8-C: D1 직접 INSERT — db + mirror 2단 처리 대체.
      const certDb = await requireD1ForApprovalProcessing('certificate_issuances.insert');
      await certDb.insert(certificateIssuancesTable).values({
        id: crypto.randomUUID(),
        staff_id: certRow.staff_id,
        cert_type: certRow.cert_type,
        serial_no: certRow.serial_no,
        purpose: certRow.purpose,
        issued_by: certRow.issued_by,
        issued_at: new Date().toISOString() });
      steps.push('certificate_issue');
    } catch (error) {
      warnings.push(`증명서 발급 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
    }
  }

  if (item.type === '근무표') {
    try {
      const assignments = Array.isArray(itemMetaData?.assignments) ? itemMetaData.assignments : [];
      if (assignments.length > 0) {
        const companyName = String(itemMetaData?.company_name || item.sender_company || '').trim();
        const db = await requireD1ForApprovalProcessing('shift_assignments.upsert');
        const { shift_assignments: shiftAssignmentsTable } = await import('@/lib/db');
        const { and: drizzleAnd, eq: drizzleEq } = await import('drizzle-orm');

        for (const a of assignments) {
          const staffId = String(a.staff_id || '').trim();
          const workDate = String(a.work_date || '').trim();
          const shiftId = a.shift_id ? String(a.shift_id).trim() : null;
          if (!staffId || !workDate) continue;

          // Delete existing to simulate upsert safely without unique index
          await db
            .delete(shiftAssignmentsTable)
            .where(
              drizzleAnd(
                drizzleEq(shiftAssignmentsTable.staff_id, staffId),
                drizzleEq(shiftAssignmentsTable.work_date, workDate)
              )
            );

          // Insert new assignment
          await db
            .insert(shiftAssignmentsTable)
            .values({
              id: crypto.randomUUID(),
              staff_id: staffId,
              work_date: workDate,
              shift_id: shiftId,
              company_name: companyName || null });
        }
        steps.push('shift_assignments_sync');
      }
    } catch (error) {
      warnings.push(`근무표 배정 반영 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
    }
  }

  // ── 급여인상평가서 최종 승인 시 직원 기본급(base_salary) 자동 연동 ──
  const isSalaryIncreaseForm =
    String(item.type || '').trim() === '급여인상평가서' ||
    String(itemMetaData?.form_type || '').trim() === '급여인상평가서' ||
    String(itemMetaData?.form_slug || '').trim() === 'salary_increase_evaluation' ||
    String(itemMetaData?.request_category || '').trim() === 'salary_increase_evaluation' ||
    itemMetaData?.evaluationType === 'salary_increase';

  if (isSalaryIncreaseForm) {
    try {
      const targetStaffId = itemMetaData?.targetStaffId ? String(itemMetaData.targetStaffId).trim() : null;
      const targetStaffName = itemMetaData?.targetStaffName
        ? String(itemMetaData.targetStaffName).trim()
        : itemMetaData?.target
          ? String(itemMetaData.target).trim()
          : null;
      const newSalary = typeof itemMetaData?.newSalary === 'number'
        ? itemMetaData.newSalary
        : typeof itemMetaData?.proposedSalary === 'number'
          ? itemMetaData.proposedSalary
          : typeof itemMetaData?.afterSalary === 'number'
            ? itemMetaData.afterSalary
            : typeof itemMetaData?.currentSalary === 'number' && typeof itemMetaData?.raisePercent === 'number'
              ? Math.round(itemMetaData.currentSalary * (1 + itemMetaData.raisePercent / 100))
              : null;

      if (newSalary && newSalary > 0) {
        const db = await requireD1ForApprovalProcessing('salary_increase.update');
        let matchedStaffId = targetStaffId;

        if (!matchedStaffId && targetStaffName) {
          const { and: drizzleAnd, eq: drizzleEq } = await import('drizzle-orm');
          const rows = await db
            .select({ id: staffMembersTable.id })
            .from(staffMembersTable)
            .where(
              item.company_id
                ? drizzleAnd(
                    drizzleEq(staffMembersTable.name, targetStaffName),
                    drizzleEq(staffMembersTable.company_id, String(item.company_id))
                  )
                : drizzleEq(staffMembersTable.name, targetStaffName)
            )
            .limit(1);

          if (rows[0]?.id) {
            matchedStaffId = String(rows[0].id);
          }
        }

        if (matchedStaffId) {
          await db
            .update(staffMembersTable)
            .set({
              base_salary: Math.round(newSalary),
              updated_at: new Date().toISOString()
            })
            .where(eq(staffMembersTable.id, matchedStaffId));

          steps.push('salary_increase_applied');
        } else {
          warnings.push(`급여 인상 대상 직원을 찾지 못해 기본급을 자동 반영하지 못했습니다. (대상: ${targetStaffName || '미지정'})`);
        }
      }
    } catch (error) {
      warnings.push(`급여 인상 자동 반영 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
    }
  }

  try {
    const officialDocResult = await syncOfficialDocumentLogFromApproval(item);
    if (officialDocResult) {
      steps.push('official_document_log');
    }
  } catch (error) {
    warnings.push(`공문서 발송대장 반영 실패: ${String((error as { message?: string } | null)?.message || error || 'unknown')}`);
  }

  // Fix B: 물품요청 외 타입에 대해 기안자에게 최종 승인 알림 전송
  // (물품요청은 prepareSupplyApprovalInventoryWorkflow 안에서 이미 처리됨)
  if (item.type !== '물품요청') {
    try {
      const senderId = String(item.sender_id || '').trim();
      if (senderId) {
        const approvalTitle = String(item.title || '전자결재 문서');
        await insertNotificationsOrThrow([{
          user_id: senderId,
          type: 'approval',
          title: '결재 승인',
          body: `${approvalTitle} 문서가 최종 승인되었습니다.`,
          metadata: {
            approval_id: String(item.id || ''),
            approval_type: item.type ?? null } } as NotificationRow]);
        steps.push('sender_approval_notification');
      }
    } catch {
      // 알림 실패는 결재 처리에 영향 없음
    }
  }

  // Before final save, refetch the latest meta_data from DB to avoid overwriting concurrent updates
  let latestMetaData = itemMetaData || {};
  try {
    const d1 = await getD1Binding();
    if (d1) {
      const db = getD1Drizzle(d1);
      const rows = await db
        .select({ meta_data: approvalsTable.meta_data })
        .from(approvalsTable)
        .where(eq(approvalsTable.id, String(item.id)))
        .limit(1);
      if (rows[0]?.meta_data) {
        if (typeof rows[0].meta_data === 'string' && rows[0].meta_data.length > 0) {
          try {
            const parsed = JSON.parse(rows[0].meta_data);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              latestMetaData = parsed as Record<string, unknown>;
            }
          } catch {
            // keep old
          }
        } else if (typeof rows[0].meta_data === 'object' && rows[0].meta_data !== null) {
          latestMetaData = rows[0].meta_data as Record<string, unknown>;
        }
      }
    }
  } catch (err) {
    console.error('[server-approval-processing] Failed to refetch latest meta_data:', err);
  }

  const processedAt = new Date().toISOString();
  const nextMetaData = {
    ...latestMetaData,
    server_processing: {
      status: warnings.length > 0 ? 'completed_with_warnings' : 'completed',
      started_at: startedAt,
      started_by: actorId || null,
      processed_at: processedAt,
      errors: warnings,
      steps } };

  {
    const d1 = await getD1Binding();
    if (d1) {
      const db = getD1Drizzle(d1);
      await db
        .update(approvalsTable)
        .set({ meta_data: JSON.stringify(nextMetaData) })
        .where(eq(approvalsTable.id, String(item.id)));
    }
    // d1 binding 없으면 silently skip — 완료 마커 실패가 결과를 바꾸지 않도록
  }

  return {
    alreadyProcessed: false,
    processedAt,
    steps,
    warnings,
    supplySummary };
}
