'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  buildOfficialDocumentApprovalContent,
  extractOfficialDocRequest,
  type OfficialDocRequest,
} from '@/lib/official-document-approval';

interface Props {
  staffs: any[];
  selectedCo: string;
  user: any;
  onOpenApproval?: (intent?: Record<string, unknown>) => void;
}

interface OfficialDoc {
  id?: number;
  sent_date: string;
  doc_number: string;
  title: string;
  recipient: string;
  manager: string;
  is_received: boolean;
  note: string;
  company: string;
}

type ApprovalWorkflowItem = {
  id: string;
  status: string;
  title: string;
  created_at: string;
  sender_name: string;
  current_approver_id: string;
  current_approver_name: string;
  doc_number: string;
  request: OfficialDocRequest;
};

function buildApprovalStatusClass(status: string) {
  if (status === '승인') return 'bg-emerald-100 text-emerald-700';
  if (status === '반려') return 'bg-red-500/10 text-red-600';
  if (status === '회수') return 'bg-slate-100 text-slate-600';
  return 'bg-orange-500/15 text-orange-700';
}

export default function OfficialDocumentLog({ staffs, selectedCo, user, onOpenApproval }: Props) {
  const [docs, setDocs] = useState<OfficialDoc[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<ApprovalWorkflowItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editingDoc, setEditingDoc] = useState<OfficialDoc | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [filterReceived, setFilterReceived] = useState<'전체' | '확인' | '미확인'>('전체');
  const [form, setForm] = useState<Partial<OfficialDoc>>({
    sent_date: new Date().toISOString().slice(0, 10),
    doc_number: '',
    title: '',
    recipient: '',
    manager: user?.name || '',
    is_received: false,
    note: '',
    company: selectedCo !== '전체' ? selectedCo : '',
  });

  const staffNameById = useMemo(
    () =>
      new Map(
        (staffs || [])
          .filter((staff) => staff?.id)
          .map((staff) => [String(staff.id), String(staff.name || '').trim()])
      ),
    [staffs],
  );

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const [docResult, approvalResult] = await Promise.all([
        supabase
          .from('official_doc_log')
          .select('*')
          .order('sent_date', { ascending: false }),
        supabase
          .from('approvals')
          .select('id, status, title, created_at, sender_name, current_approver_id, doc_number, meta_data')
          .order('created_at', { ascending: false })
          .limit(200),
      ]);

      if (docResult.error) throw docResult.error;
      if (approvalResult.error) throw approvalResult.error;

      setDocs((docResult.data || []) as OfficialDoc[]);

      const workflowRows = ((approvalResult.data || []) as Array<Record<string, unknown>>)
        .map((item) => {
          const request = extractOfficialDocRequest(item.meta_data);
          if (!request) return null;
          const metaData =
            item.meta_data && typeof item.meta_data === 'object'
              ? (item.meta_data as Record<string, unknown>)
              : null;
          if (String(item.status || '').trim() === '회수' || metaData?.superseded_by) {
            return null;
          }

          const currentApproverId = String(item.current_approver_id || '').trim();
          return {
            id: String(item.id || '').trim(),
            status: String(item.status || '').trim() || '대기',
            title: String(item.title || request.title || '').trim(),
            created_at: String(item.created_at || ''),
            sender_name: String(item.sender_name || '').trim(),
            current_approver_id: currentApproverId,
            current_approver_name: staffNameById.get(currentApproverId) || currentApproverId || '-',
            doc_number: String(item.doc_number || '').trim(),
            request,
          } satisfies ApprovalWorkflowItem;
        })
        .filter(Boolean) as ApprovalWorkflowItem[];

      setApprovalQueue(workflowRows);
    } catch (e: unknown) {
      console.warn('공문서발송대장 조회 실패:', ((e as Error)?.message ?? String(e)));
      setDocs([]);
      setApprovalQueue([]);
    } finally {
      setLoading(false);
    }
  }, [staffNameById]);

  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs, selectedCo]);

  const resetForm = useCallback(() => {
    setForm({
      sent_date: new Date().toISOString().slice(0, 10),
      doc_number: '',
      title: '',
      recipient: '',
      manager: user?.name || '',
      is_received: false,
      note: '',
      company: selectedCo !== '전체' ? selectedCo : '',
    });
  }, [selectedCo, user?.name]);

  const openAdd = () => {
    setEditingDoc(null);
    resetForm();
    setShowForm(true);
    setMessage(null);
  };

  const openEdit = (doc: OfficialDoc) => {
    setEditingDoc(doc);
    setForm({ ...doc });
    setShowForm(true);
    setMessage(null);
  };

  const handleSave = async () => {
    if (!form.title || !form.sent_date || !form.recipient) {
      setMessage({ type: 'error', text: '발송일, 수신처, 제목은 필수입니다.' });
      return;
    }

    const requestPayload: OfficialDocRequest = {
      sent_date: String(form.sent_date || '').slice(0, 10),
      doc_number: String(form.doc_number || '').trim(),
      title: String(form.title || '').trim(),
      recipient: String(form.recipient || '').trim(),
      manager: String(form.manager || user?.name || '').trim(),
      is_received: false,
      note: String(form.note || '').trim(),
      company: String(form.company || '').trim(),
    };

    if (!editingDoc?.id) {
      if (!onOpenApproval) {
        setMessage({ type: 'error', text: '전자결재 화면을 열 수 없어 상신할 수 없습니다.' });
        return;
      }

      onOpenApproval({
        viewMode: '작성하기',
        formType: '업무기안',
        title: `[공문 발송 승인] ${requestPayload.title}`,
        content: buildOfficialDocumentApprovalContent(requestPayload),
        extraData: {
          official_doc_request: requestPayload,
          request_category: 'official_document_dispatch',
        },
      });

      setShowForm(false);
      setEditingDoc(null);
      resetForm();
      setMessage({
        type: 'success',
        text: '전자결재 작성 화면으로 이동했습니다. 상신 후 최종 승인되면 발송대장에 자동 반영됩니다.',
      });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        sent_date: requestPayload.sent_date,
        doc_number: requestPayload.doc_number,
        title: requestPayload.title,
        recipient: requestPayload.recipient,
        manager: requestPayload.manager,
        is_received: form.is_received ?? false,
        note: requestPayload.note,
        company: requestPayload.company,
      };
      const { error } = await supabase.from('official_doc_log').update(payload).eq('id', editingDoc.id);
      if (error) throw error;

      setMessage({ type: 'success', text: '수정되었습니다.' });
      setShowForm(false);
      setEditingDoc(null);
      void fetchDocs();
    } catch (e: unknown) {
      setMessage({ type: 'error', text: `저장 실패: ${((e as Error)?.message ?? String(e))}` });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try {
      const { error } = await supabase.from('official_doc_log').delete().eq('id', id);
      if (error) throw error;
      void fetchDocs();
    } catch (e: unknown) {
      setMessage({ type: 'error', text: `삭제 실패: ${((e as Error)?.message ?? String(e))}` });
    }
  };

  const handleToggleReceived = async (doc: OfficialDoc) => {
    try {
      const { error } = await supabase
        .from('official_doc_log')
        .update({ is_received: !doc.is_received })
        .eq('id', doc.id!);
      if (error) throw error;
      void fetchDocs();
    } catch (e: unknown) {
      setMessage({ type: 'error', text: `수신 확인 처리 실패: ${((e as Error)?.message ?? String(e))}` });
    }
  };

  const displayDocs = docs.filter((d) => {
    const kw = searchKeyword.toLowerCase();
    const matchKw =
      !kw ||
      d.title?.toLowerCase().includes(kw) ||
      d.recipient?.toLowerCase().includes(kw) ||
      d.doc_number?.toLowerCase().includes(kw) ||
      d.manager?.toLowerCase().includes(kw);
    const matchFilter =
      filterReceived === '전체' ||
      (filterReceived === '확인' && d.is_received) ||
      (filterReceived === '미확인' && !d.is_received);
    return matchKw && matchFilter;
  });

  const pendingApprovals = approvalQueue.filter((item) => item.status === '대기');
  const approvedApprovals = approvalQueue.filter((item) => item.status === '승인');
  const rejectedApprovals = approvalQueue.filter((item) => item.status === '반려');
  const receivedCount = docs.filter((d) => d.is_received).length;
  const unreceivedCount = docs.length - receivedCount;

  return (
    <div className="space-y-4 p-4 md:p-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-bold text-[var(--foreground)]">공문서 발송 대장</h2>
          <p className="mt-1 text-xs font-semibold text-[var(--toss-gray-3)]">
            신규 공문은 전자결재 승인 후 자동 반영되고, 대장에서는 발송 이후 이력과 수신 확인을 관리합니다.
          </p>
        </div>
        <button
          onClick={openAdd}
          className="rounded-[var(--radius-md)] bg-[var(--accent)] px-5 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
        >
          + 공문 승인 상신
        </button>
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm font-bold ${message.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-500/20 bg-red-500/10 text-red-700'}`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs font-bold text-[var(--toss-gray-3)]">대장 반영 건수</p>
          <p className="mt-1 text-2xl font-extrabold text-[var(--foreground)]">{docs.length}<span className="ml-1 text-sm">건</span></p>
        </div>
        <div className="rounded-2xl border border-orange-500/20 bg-orange-500/10 p-4">
          <p className="text-xs font-bold text-orange-600">승인 대기</p>
          <p className="mt-1 text-2xl font-extrabold text-orange-700">{pendingApprovals.length}<span className="ml-1 text-sm">건</span></p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-xs font-bold text-emerald-500">수신 확인</p>
          <p className="mt-1 text-2xl font-extrabold text-emerald-600">{receivedCount}<span className="ml-1 text-sm">건</span></p>
        </div>
        <div className="rounded-2xl border border-red-500/15 bg-red-500/5 p-4">
          <p className="text-xs font-bold text-red-500">반려 / 미확인</p>
          <p className="mt-1 text-2xl font-extrabold text-red-600">{rejectedApprovals.length + unreceivedCount}<span className="ml-1 text-sm">건</span></p>
        </div>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-blue-500/10 p-4">
          <h3 className="text-sm font-bold text-[var(--accent)]">{editingDoc ? '공문 대장 수정' : '공문 발송 승인 상신'}</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--toss-gray-4)]">발송 예정일 *</label>
              <input
                type="date"
                value={form.sent_date ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, sent_date: e.target.value }))}
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--toss-gray-4)]">문서번호</label>
              <input
                type="text"
                value={form.doc_number ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, doc_number: e.target.value }))}
                placeholder="비워두면 승인 시 자동 채번"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--toss-gray-4)]">수신처 *</label>
              <input
                type="text"
                value={form.recipient ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, recipient: e.target.value }))}
                placeholder="예: 보건복지부"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-bold text-[var(--toss-gray-4)]">제목 *</label>
              <input
                type="text"
                value={form.title ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                placeholder="공문서 제목 입력"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--toss-gray-4)]">담당자</label>
              <input
                type="text"
                value={form.manager ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, manager: e.target.value }))}
                placeholder="담당자명"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-[var(--toss-gray-4)]">비고</label>
              <input
                type="text"
                value={form.note ?? ''}
                onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="추가 메모"
                className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
              />
            </div>
            <div className="flex items-center gap-3 pt-6">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_received ?? false}
                  onChange={(e) => setForm((p) => ({ ...p, is_received: e.target.checked }))}
                  className="h-4 w-4 rounded"
                  disabled={!editingDoc}
                />
                <span className="text-xs font-bold text-[var(--toss-gray-4)]">수신 확인됨</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-[var(--radius-md)] bg-[var(--accent)] px-5 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {editingDoc ? (saving ? '저장 중...' : '저장') : '전자결재 작성하기'}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setEditingDoc(null);
              }}
              className="rounded-[var(--radius-md)] bg-[var(--muted)] px-5 py-1.5 text-xs font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--toss-gray-2)]"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {approvalQueue.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[var(--foreground)]">공문 결재 진행 현황</h3>
              <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                상신된 공문은 최종 승인되면 아래 발송대장으로 자동 이동합니다.
              </p>
            </div>
            <span className="text-xs font-bold text-[var(--toss-gray-3)]">{approvalQueue.length}건</span>
          </div>
          <div className="space-y-2">
            {approvalQueue.slice(0, 8).map((item) => (
              <div key={item.id} className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--muted)]/30 p-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-[var(--foreground)]">{item.request.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${buildApprovalStatusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                    <span>수신처 {item.request.recipient}</span>
                    <span>기안자 {item.sender_name || '-'}</span>
                    <span>현재 결재자 {item.current_approver_name || '-'}</span>
                    <span>{item.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR') : '-'}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenApproval?.({ approvalId: item.id, viewMode: '기안함' })}
                  className="self-start rounded-[var(--radius-md)] bg-[var(--muted)] px-3 py-1.5 text-[11px] font-bold text-[var(--foreground)] transition-colors hover:bg-[var(--toss-gray-2)]"
                >
                  결재 보기
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          placeholder="제목, 수신처, 문서번호, 담당자 검색..."
          className="w-72 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/30"
        />
        <div className="flex gap-1">
          {(['전체', '확인', '미확인'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setFilterReceived(filter)}
              className={`rounded-[var(--radius-md)] px-3 py-1.5 text-xs font-bold transition-all ${filterReceived === filter ? 'bg-[var(--accent)] text-white' : 'bg-[var(--muted)] text-[var(--toss-gray-3)] hover:text-[var(--foreground)]'}`}
            >
              {filter}
            </button>
          ))}
        </div>
        {(searchKeyword || filterReceived !== '전체') && (
          <button onClick={() => { setSearchKeyword(''); setFilterReceived('전체'); }} className="text-xs text-[var(--toss-gray-3)] hover:text-[var(--foreground)]">
            필터 초기화
          </button>
        )}
        <span className="text-xs text-[var(--toss-gray-3)]">{displayDocs.length}건 표시</span>
      </div>

      <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)]">
        {loading ? (
          <div className="p-5 text-center text-sm text-[var(--toss-gray-3)]">불러오는 중...</div>
        ) : displayDocs.length === 0 ? (
          <div className="p-5 text-center text-sm text-[var(--toss-gray-3)]">공문 발송 기록이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--muted)]">
                <tr>
                  {['발송일', '문서번호', '제목', '수신처', '담당자', '수신확인', '비고', ''].map((header) => (
                    <th key={header} className="whitespace-nowrap px-4 py-2 text-left font-bold text-[var(--toss-gray-4)]">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {displayDocs.map((doc) => (
                  <tr key={doc.id} className="transition-colors hover:bg-[var(--muted)]/50">
                    <td className="whitespace-nowrap px-4 py-2 font-bold text-[var(--foreground)]">{doc.sent_date}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--toss-gray-4)]">{doc.doc_number || '-'}</td>
                    <td className="max-w-xs truncate px-4 py-2 font-bold text-[var(--foreground)]">{doc.title}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--toss-gray-4)]">{doc.recipient}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-[var(--toss-gray-4)]">{doc.manager || '-'}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleToggleReceived(doc)}
                        className={`rounded-lg px-2 py-1 text-[10px] font-extrabold transition-all ${doc.is_received ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-orange-500/20 text-orange-700 hover:bg-orange-200'}`}
                      >
                        {doc.is_received ? '✓ 확인' : '미확인'}
                      </button>
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-3 text-[var(--toss-gray-3)]">{doc.note || '-'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => openEdit(doc)} className="rounded-lg bg-blue-500/10 px-2 py-1 text-[10px] font-bold text-[var(--accent)] transition-colors hover:bg-blue-500/20">수정</button>
                        <button onClick={() => handleDelete(doc.id!)} className="rounded-lg bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-500 transition-colors hover:bg-red-500/20">삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
