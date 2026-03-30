import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from './supabase';

type ApprovalArchiveSource = Record<string, unknown>;

function formatApprovalArchiveDate(value: unknown) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('ko-KR');
}

function resolveApprovalDocNumber(item: ApprovalArchiveSource) {
  const metaData = (item.meta_data || {}) as Record<string, unknown>;
  return String(item.doc_number || metaData.doc_number || '').trim();
}

function resolveApprovalCategory(item: ApprovalArchiveSource) {
  const type = String(item.type || '').trim();
  if (type.includes('계약')) return '근로계약서';
  if (
    type === '연차/휴가' ||
    type === '연차계획서' ||
    type === '연장근무' ||
    type === '물품신청' ||
    type === '수리요청' ||
    type === '업무기안' ||
    type === '업무협조' ||
    type === '양식신청' ||
    type === '출결정정' ||
    type === '인사명령'
  ) {
    return '서식';
  }
  return '기타';
}

function buildApprovalArchiveContent(item: ApprovalArchiveSource) {
  const metaData = (item.meta_data || {}) as Record<string, unknown>;
  const ccUsers = Array.isArray(metaData.cc_users)
    ? metaData.cc_users
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return '';
          return String((entry as Record<string, unknown>).name || '').trim();
        })
        .filter(Boolean)
    : [];

  const headerLines = [
    `문서번호: ${resolveApprovalDocNumber(item) || '-'}`,
    `문서종류: ${String(item.type || metaData.form_name || '-').trim() || '-'}`,
    `기안자: ${String(item.sender_name || '-').trim() || '-'}`,
    `기안일시: ${formatApprovalArchiveDate(item.created_at)}`,
  ];

  if (ccUsers.length > 0) {
    headerLines.push(`참조자: ${ccUsers.join(', ')}`);
  }

  const body = String(item.content || '').trim();
  return `${headerLines.join('\n')}\n\n${body}`.trim();
}

function hasMatchingFallbackDocument(doc: Record<string, unknown>, item: ApprovalArchiveSource) {
  const sameTitle = String(doc.title || '').trim() === String(item.title || '').trim();
  const sameCreator = String(doc.created_by || '').trim() === String(item.sender_id || '').trim();
  const sameCompany = String(doc.company_name || '').trim() === String(item.sender_company || '').trim();
  return sameTitle && sameCreator && sameCompany;
}

export function extractApprovalDocNumberFromDocument(doc: Record<string, unknown>) {
  const content = String(doc.content || '');
  const match = content.match(/문서번호:\s*([^\n\r]+)/);
  return match?.[1]?.trim() || '';
}

export function mapApprovalToDocumentRepositoryEntry(item: ApprovalArchiveSource) {
  return {
    id: `approval-${String(item.id || '')}`,
    title: String(item.title || '').trim() || '전자결재 문서',
    category: resolveApprovalCategory(item),
    content: buildApprovalArchiveContent(item),
    file_url: null,
    version: 1,
    company_name: String(item.sender_company || '').trim() || '전체',
    created_by: item.sender_id || null,
    created_at: item.created_at || null,
    updated_at: item.updated_at || item.created_at || null,
    source_type: 'approval',
    read_only: true,
    approval_id: item.id || null,
    approval_type: item.type || null,
  };
}

export async function syncApprovalToDocumentRepository(
  item: ApprovalArchiveSource,
  client: SupabaseClient = supabase
) {
  const title = String(item.title || '').trim();
  if (!title) return;

  const nextRow = {
    title,
    category: resolveApprovalCategory(item),
    content: buildApprovalArchiveContent(item),
    file_url: null,
    version: 1,
    company_name: String(item.sender_company || '').trim() || '전체',
    created_by: item.sender_id || null,
  };

  const docNumber = resolveApprovalDocNumber(item);
  const companyName = nextRow.company_name;
  let query = client.from('document_repository').select('*').order('updated_at', { ascending: false }).limit(300);
  if (companyName && companyName !== '전체') {
    query = query.eq('company_name', companyName);
  }

  const { data: existingDocs, error: listError } = await query;
  if (listError) throw listError;

  const matchedDoc = (existingDocs || []).find((doc) => {
    const archivedDocNumber = extractApprovalDocNumberFromDocument(doc as Record<string, unknown>);
    if (docNumber && archivedDocNumber) {
      return archivedDocNumber === docNumber;
    }
    return hasMatchingFallbackDocument(doc as Record<string, unknown>, item);
  }) as Record<string, unknown> | undefined;

  if (matchedDoc?.id) {
    const currentVersion = Number(matchedDoc.version) || 1;
    const { error } = await client
      .from('document_repository')
      .update({
        ...nextRow,
        updated_at: new Date().toISOString(),
        version: currentVersion,
        file_url: matchedDoc.file_url || null,
      })
      .eq('id', matchedDoc.id);
    if (error) throw error;
    return matchedDoc.id;
  }

  const { data, error } = await client
    .from('document_repository')
    .insert(nextRow)
    .select('id')
    .single();
  if (error) throw error;
  return data?.id || null;
}
