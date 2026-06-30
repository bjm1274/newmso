import { NextResponse } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  payroll_records as payrollRecordsTable,
  chat_rooms as chatRoomsTable,
  push_subscriptions as pushSubscriptionsTable,
  approvals as approvalsTable } from '@/lib/db';
import {
  buildIntegrityChecks,
  type ApprovalRow,
  type ChatRoomRow,
  type PayrollRow,
  type PushSubscriptionRow,
  type StaffRow } from '../_shared';

export async function handleIntegrity(safeStaffRows: StaffRow[]) {
  const d1 = await getD1Binding();
  if (!d1) return NextResponse.json({ error: '[system-master] D1 binding not available' }, { status: 500 });
  const db = getD1Drizzle(d1);
  const [pRows, sRows, rRows, aRows] = await Promise.all([
    db.select({
      id: payrollRecordsTable.id,
      staff_id: payrollRecordsTable.staff_id,
      year_month: payrollRecordsTable.year_month,
      status: payrollRecordsTable.status }).from(payrollRecordsTable),
    db.select({
      id: pushSubscriptionsTable.id,
      staff_id: pushSubscriptionsTable.staff_id,
      endpoint: pushSubscriptionsTable.endpoint }).from(pushSubscriptionsTable),
    db.select({
      id: chatRoomsTable.id,
      name: chatRoomsTable.name,
      members: chatRoomsTable.members }).from(chatRoomsTable),
    db.select({
      id: approvalsTable.id,
      title: approvalsTable.title,
      status: approvalsTable.status,
      current_approver_id: approvalsTable.current_approver_id }).from(approvalsTable),
  ]);
  // chat_rooms.members TEXT → JSON
  const integrityRoomRows: ChatRoomRow[] = rRows.map((row) => {
    const r = { ...row } as Record<string, unknown>;
    if (typeof r.members === 'string') {
      try { r.members = JSON.parse(r.members); } catch { r.members = []; }
    }
    return r as ChatRoomRow;
  });
  const integrityPayrollRows = pRows as unknown as PayrollRow[];
  const integritySubRows = sRows as unknown as PushSubscriptionRow[];
  const integrityApprovalRows = aRows as unknown as ApprovalRow[];

  const issues = buildIntegrityChecks({
    staffRows: safeStaffRows,
    payrollRows: integrityPayrollRows,
    subscriptionRows: integritySubRows,
    roomRows: integrityRoomRows,
    approvalRows: integrityApprovalRows });

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    issues });
}
