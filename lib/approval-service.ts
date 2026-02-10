/**
 * 전자결재 서비스 (Supabase 연동)
 * company-collab-system approval-service 구조 기반
 */

import { supabase } from './supabase';

export interface CreateApprovalRequest {
  company_id?: string;
  sender_id: string;
  sender_name: string;
  sender_company?: string;
  type: string;
  title: string;
  content?: string;
  meta_data?: Record<string, unknown>;
}

export interface ApprovalDocument {
  id: string;
  sender_id: string;
  sender_name?: string;
  sender_company?: string;
  type: string;
  title: string;
  content?: string;
  status: string;
  meta_data?: Record<string, unknown>;
  created_at?: string;
}

/**
 * 결재 문서 생성
 */
export async function createApprovalDocument(request: CreateApprovalRequest) {
  const { error } = await supabase.from('approvals').insert([
    {
      sender_id: request.sender_id,
      sender_name: request.sender_name,
      sender_company: request.sender_company,
      type: request.type,
      title: request.title,
      content: request.content ?? '',
      status: '대기',
      meta_data: request.meta_data ?? {},
    },
  ]);

  if (error) {
    console.error('[Approval] Create Document Error:', error);
    throw error;
  }

  return { success: true, message: '결재 문서가 생성되었습니다' };
}

/**
 * 결재 문서 조회
 */
export async function getApprovalDocument(approvalId: string) {
  const { data, error } = await supabase
    .from('approvals')
    .select('*')
    .eq('id', approvalId)
    .single();

  if (error) {
    console.error('[Approval] Get Document Error:', error);
    return null;
  }

  return data;
}

/**
 * 회사/송신자별 결재 문서 목록 조회
 */
export async function getApprovalDocuments(params: {
  companyId?: string;
  senderId?: string;
  status?: string;
  limit?: number;
}) {
  let query = supabase
    .from('approvals')
    .select('*')
    .order('created_at', { ascending: false });

  if (params.senderId) {
    query = query.eq('sender_id', params.senderId);
  }
  if (params.companyId) {
    query = query.eq('sender_company', params.companyId);
  }
  if (params.status) {
    query = query.eq('status', params.status);
  }
  if (params.limit) {
    query = query.limit(params.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Approval] List Documents Error:', error);
    return [];
  }

  return data ?? [];
}

/**
 * 결재 상태 업데이트
 */
export async function updateApprovalStatus(
  approvalId: string,
  status: '대기' | '승인' | '반려' | '취소',
  approverId?: string,
  comment?: string
) {
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (approverId) updates.approver_id = approverId;
  if (comment) updates.approval_comment = comment;
  if (status === '승인' || status === '반려') {
    updates.approved_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('approvals')
    .update(updates)
    .eq('id', approvalId);

  if (error) {
    console.error('[Approval] Update Status Error:', error);
    throw error;
  }

  return { success: true };
}
