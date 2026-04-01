'use client';

import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useMemo } from 'react';
import SmartDatePicker from '../공통/SmartDatePicker';
import {
  buildOfficialDocumentApprovalContent,
  type OfficialDocRequest,
} from '@/lib/official-document-approval';

type OfficialDocumentDraft = Partial<OfficialDocRequest>;

type OfficialDocumentFormProps = {
  user?: Record<string, unknown> | null;
  extraData?: Record<string, unknown> | null;
  setExtraData: Dispatch<SetStateAction<Record<string, unknown>>>;
  setFormTitle: (value: string) => void;
  setFormContent: (value: string) => void;
};

function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

function readDraft(extraData?: Record<string, unknown> | null): OfficialDocumentDraft {
  const raw =
    extraData?.official_doc_request && typeof extraData.official_doc_request === 'object'
      ? (extraData.official_doc_request as Record<string, unknown>)
      : {};

  return {
    sent_date: String(raw.sent_date || '').slice(0, 10),
    doc_number: String(raw.doc_number || '').trim(),
    title: String(raw.title || '').trim(),
    recipient: String(raw.recipient || '').trim(),
    manager: String(raw.manager || '').trim(),
    is_received: raw.is_received === true,
    note: String(raw.note || '').trim(),
    company: String(raw.company || '').trim(),
  };
}

function normalizeRequest(
  draft: OfficialDocumentDraft,
  user?: Record<string, unknown> | null,
): OfficialDocRequest {
  return {
    sent_date: String(draft.sent_date || '').slice(0, 10) || getTodayDate(),
    doc_number: String(draft.doc_number || '').trim(),
    title: String(draft.title || '').trim(),
    recipient: String(draft.recipient || '').trim(),
    manager: String(draft.manager || user?.name || '').trim(),
    is_received: false,
    note: String(draft.note || '').trim(),
    company: String(draft.company || user?.company || '').trim(),
  };
}

function buildApprovalTitle(request: OfficialDocRequest) {
  const baseTitle = request.title || '제목 미입력';
  return `[공문 발송 승인] ${baseTitle}`;
}

export default function OfficialDocumentDispatchForm({
  user,
  extraData,
  setExtraData,
  setFormTitle,
  setFormContent,
}: OfficialDocumentFormProps) {
  const draft = useMemo(() => readDraft(extraData), [extraData]);
  const request = useMemo(() => normalizeRequest(draft, user), [draft, user]);

  useEffect(() => {
    if (extraData?.official_doc_request) return;

    setExtraData((previous) => ({
      ...previous,
      official_doc_request: request,
      request_category: 'official_document_dispatch',
    }));
  }, [extraData?.official_doc_request, request, setExtraData]);

  useEffect(() => {
    setFormTitle(buildApprovalTitle(request));
    setFormContent(buildOfficialDocumentApprovalContent(request));
  }, [request, setFormContent, setFormTitle]);

  const updateRequest = <K extends keyof OfficialDocRequest>(key: K, value: OfficialDocRequest[K]) => {
    setExtraData((previous) => {
      const previousDraft = readDraft(previous);
      const nextDraft = {
        ...previousDraft,
        [key]: value,
      };

      return {
        ...previous,
        official_doc_request: normalizeRequest(nextDraft, user),
        request_category: 'official_document_dispatch',
      };
    });
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)] shadow-sm animate-in fade-in duration-300">
      <div className="border-b border-[var(--border)] bg-sky-500/10 p-4">
        <h4 className="text-sm font-bold text-[var(--foreground)]">공문 발송 승인 양식</h4>
        <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-4)]">
          발송 정보 입력 후 전자결재로 상신하면 최종 승인 시 공문 발송대장에 자동 반영됩니다.
        </p>
      </div>

      <div className="space-y-4 bg-[var(--tab-bg)]/30 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
              발송 예정일
            </label>
            <SmartDatePicker
              value={request.sent_date}
              onChange={(value) => updateRequest('sent_date', value)}
              inputClassName="h-[46px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
              공문 번호
            </label>
            <input
              type="text"
              value={request.doc_number}
              onChange={(event) => updateRequest('doc_number', event.target.value)}
              placeholder="비우면 승인 시 자동 채번"
              className="h-[46px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
              수신처
            </label>
            <input
              type="text"
              value={request.recipient}
              onChange={(event) => updateRequest('recipient', event.target.value)}
              placeholder="예: OO기관, 협력사, 관공서"
              className="h-[46px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
              담당자
            </label>
            <input
              type="text"
              value={request.manager}
              onChange={(event) => updateRequest('manager', event.target.value)}
              placeholder="담당자명"
              className="h-[46px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
              공문 제목
            </label>
            <input
              type="text"
              value={request.title}
              onChange={(event) => updateRequest('title', event.target.value)}
              placeholder="발송할 공문 제목"
              className="h-[46px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
              법인
            </label>
            <input
              type="text"
              value={request.company}
              onChange={(event) => updateRequest('company', event.target.value)}
              placeholder="법인명"
              className="h-[46px] w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold text-[var(--toss-gray-3)]">
            발송 내용 / 비고
          </label>
          <textarea
            value={request.note}
            onChange={(event) => updateRequest('note', event.target.value)}
            placeholder="발송 목적, 주요 내용, 참고 사항을 입력하세요."
            className="min-h-[140px] w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
          />
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--muted)]/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-[var(--foreground)]">결재 본문 미리보기</p>
              <p className="mt-1 text-[11px] font-semibold text-[var(--toss-gray-3)]">
                아래 내용이 전자결재 본문으로 자동 반영됩니다.
              </p>
            </div>
            <span className="rounded-full bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-700">
              자동 생성
            </span>
          </div>
          <pre className="mt-3 whitespace-pre-wrap break-words rounded-[var(--radius-md)] bg-[var(--card)] p-3 text-[12px] font-semibold text-[var(--foreground)]">
            {buildOfficialDocumentApprovalContent(request)}
          </pre>
        </div>
      </div>
    </div>
  );
}
