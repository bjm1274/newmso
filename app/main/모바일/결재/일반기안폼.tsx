'use client';

/**
 * SApprovalGenericForm — 모바일 결재 신규 기안: 연차 외 모든 양식 범용 인라인 폼.
 *
 * 제목 + 내용 + 결재선(자동 매핑 + 직접 지정) + 첨부 + 상신.
 * 연차신청폼(SApprovalLeaveForm)의 결재선/첨부/상신 패턴을 그대로 재사용해 정합성 유지.
 * "모바일에서도 모든 기능" 정책에 따라 PC 우회 없이 전 양식 작성 지원.
 *
 * JM(파일당 500줄, 단일 책임), JM2(staff fetch 1회), JM3(try/catch + toast),
 * JM4(any 금지, ApproverPick 유니온), JM5(staff_id 변조 불가 + RLS 의존),
 * JM6(label·input 연결, button aria-label)
 *
 * ※ 데이터 레이어는 현재 Supabase — 최종 D1 전환 배치에서 연차폼과 함께 이관.
 */

import { useCallback, useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import { getKoreanTodayString } from '@/lib/seoul-time';
import type { ErpUser } from '@/types';
import { MFormHeader, MField, MInput, useFieldIdPrefix } from '../인사관리/form-helpers';
import SApprovalApproverPicker from './결재선피커';
import SApprovalCcPicker, { type CcPick } from './참조피커';
import AttachmentPicker from './AttachmentPicker';
import { ApproverLinePreviewSection, CcSection } from './ApproverLineCcSections';
import { useApprovalFormBase } from './useApprovalFormBase';
import {
  getFormSchema,
  initSchemaValues,
  missingRequired,
  StructuredFields } from './양식필드';
import { useResolvedStaffId } from '@/lib/use-resolved-staff-id';

export type SApprovalGenericFormProps = {
  user: ErpUser;
  formSlug: string;
  formName: string;
  onCancel: () => void;
  onSubmitted: () => void;
};

export default function SApprovalGenericForm({
  user,
  formSlug,
  formName,
  onCancel,
  onSubmitted }: SApprovalGenericFormProps) {
  const staffId = useResolvedStaffId(user as Record<string, unknown>);
  const company = typeof user.company === 'string' ? user.company.trim() : '';
  const fieldId = useFieldIdPrefix('appr-generic');

  const schema = useMemo(() => getFormSchema(formSlug), [formSlug]);
  const today = useMemo(() => getKoreanTodayString(), []);
  const ctx = useMemo(
    () => ({
      userName: String(user.name || '').trim(),
      userCompany: company,
      today }),
    [user.name, company, today],
  );

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  // 참조(CC) — 선택 사항. PC와 동일하게 meta_data.cc_users로 저장된다.
  const [ccUsers, setCcUsers] = useState<CcPick[]>([]);
  const [ccPickerOpen, setCcPickerOpen] = useState(false);
  // 구조화 양식 입력값 (스키마 있을 때만 사용)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() =>
    schema ? initSchemaValues(schema, today) : {},
  );
  const setField = useCallback((key: string, value: string) => {
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  // 제목 입력란 노출 여부 — 스키마가 제목을 자동 생성하면 숨김
  const showTitleInput = !schema || !schema.buildTitle;

  const base = useApprovalFormBase({ user, staffId, company });
  const {
    submitting, setSubmitting,
    attachments, setAttachments,
    approverDefaults, approverLine, approverLoading, approverManual,
    pickerOpen, setPickerOpen,
    handleApproverApply, submitApproval, queuedAttachmentCount } = base;

  const titleOk = schema?.buildTitle ? true : title.trim() !== '';
  const fieldsOk = schema ? !missingRequired(schema, fieldValues) : true;
  const canSubmit = Boolean(staffId) && titleOk && fieldsOk && approverLine.length > 0;

  const handleSubmit = useCallback(async () => {
    if (!staffId) {
      toast('계정 정보를 확인할 수 없습니다.', 'error');
      return;
    }
    if (schema && missingRequired(schema, fieldValues)) {
      toast('필수 항목을 모두 입력해 주세요.', 'warning');
      return;
    }
    if (!schema && title.trim() === '') {
      toast('제목을 입력해 주세요.', 'warning');
      return;
    }
    if (approverLine.length === 0) {
      toast('결재자를 한 명 이상 지정해 주세요. (상단 "변경" 버튼)', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const resolvedContent = schema ? schema.buildContent(fieldValues, ctx) : content;
      const resolvedTitle =
        (schema?.buildTitle ? schema.buildTitle(fieldValues, ctx) : title.trim()) || formName;
      const extraMeta: Record<string, unknown> = { content: resolvedContent };
      if (schema?.buildMeta) {
        Object.assign(extraMeta, schema.buildMeta(fieldValues, ctx));
      }

      const { queued } = await submitApproval({
        typeName: formName,
        title: resolvedTitle,
        content: resolvedContent,
        formSlug,
        formDisplayName: formName,
        ccUsers: ccUsers.map((c) => ({ id: c.id, name: c.name })),
        extraMeta });

      if (queued) {
        toast('오프라인 — 기안이 동기화 대기 중입니다. 온라인 복귀 시 자동 전송됩니다.', 'warning');
      } else if (queuedAttachmentCount > 0) {
        toast(`기안이 상신되었습니다. 첨부 ${queuedAttachmentCount}개는 온라인 복귀 시 자동 업로드됩니다.`, 'warning');
      } else {
        toast('기안이 결재선에 올라갔습니다.', 'success');
      }
      onSubmitted();
    } catch (err) {
      console.error('[mobile-approval] generic approvals insert failed', err);
      const message = err instanceof Error ? err.message : '결재 상신 실패';
      toast(`결재 상신 실패: ${message}`, 'error');
    } finally {
      setSubmitting(false);
    }
  }, [
    staffId,
    schema,
    fieldValues,
    ctx,
    title,
    content,
    ccUsers,
    approverLine,
    formSlug,
    formName,
    onSubmitted,
    submitApproval,
    setSubmitting,
    queuedAttachmentCount,
  ]);

  return (
    <div className="m-screen" style={{ background: 'transparent' }}>
      <MFormHeader
        onCancel={onCancel}
        title={formName}
        sub="모바일 인라인 작성"
        saveLabel={submitting ? '상신 중...' : '상신'}
        onSave={handleSubmit}
        saveDisabled={!canSubmit || submitting}
      />
      <div className="m-scroll" style={{ background: 'transparent' }}>
        {/* 양식 입력란 macos-glass 위젯화 */}
        <div
          className="macos-glass macos-squircle"
          style={{
            margin: '16px',
            overflow: 'hidden' }}
        >
          {showTitleInput && (
            <MField label="제목" required htmlFor={fieldId('title')}>
              <MInput
                id={fieldId('title')}
                value={title}
                onChange={setTitle}
                placeholder="제목을 입력하세요"
                ariaLabel="제목"
                autoFocus
              />
            </MField>
          )}

          {schema ? (
            <StructuredFields
              schema={schema}
              values={fieldValues}
              onChange={setField}
              idPrefix={fieldId}
            />
          ) : (
            <MField label="내용" htmlFor={fieldId('content')} sub="결재자에게 전달됩니다.">
              <textarea
                id={fieldId('content')}
                rows={6}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="기안 내용을 입력하세요"
                style={{
                  width: '100%',
                  padding: '8px 0',
                  fontSize: 14,
                  fontWeight: 600,
                  fontFamily: 'inherit',
                  resize: 'none',
                  color: 'var(--z-900)',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none' }}
              />
            </MField>
          )}
        </div>

        {/* 결재선 미리보기 · 참조 — 8차 D12-015: 3개 폼에 verbatim 이던 JSX 를 공용 컴포넌트로 */}
        <ApproverLinePreviewSection
          approverLine={approverLine}
          approverLoading={approverLoading}
          approverManual={approverManual}
          onOpenPicker={() => setPickerOpen(true)}
        />

        <CcSection
          ccUsers={ccUsers}
          emptyText="참조자는 선택 사항입니다. 지정하면 해당 직원에게 문서가 참조로 공유됩니다."
          onOpenPicker={() => setCcPickerOpen(true)}
        />

        {/* 첨부 파일 */}
        <div className="m-section" style={{ background: 'transparent', padding: '0 16px' }}>
          <AttachmentPicker onChange={setAttachments} />
        </div>

        <div style={{ height: 32 }} />
      </div>

      <SApprovalApproverPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        selfId={staffId}
        company={company || null}
        current={approverLine}
        defaultLine={approverDefaults}
        onApply={handleApproverApply}
      />

      <SApprovalCcPicker
        open={ccPickerOpen}
        onClose={() => setCcPickerOpen(false)}
        selfId={staffId}
        company={company || null}
        current={ccUsers}
        onApply={setCcUsers}
      />
    </div>
  );
}
