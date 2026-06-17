'use client';

/**
 * 양식필드 — 모바일 결재 양식별 구조화 필드 스키마 + 렌더러.
 *
 * PC 전용 양식(공문발송/비품구매/수리요청/보고서/업무협조/사직서/평가)은 각각
 * 고유 입력 필드를 가진다. 모바일은 13개 양식을 단일 일반기안폼(제목+내용)으로
 * 폴백 처리해 "필드 정합성"이 부족했다. 본 모듈은 슬러그별 필드 스키마를 선언하고,
 * 입력값으로 PC와 동일한 결재 본문(content) + meta_data를 생성한다.
 *
 * - 공문발송: PC buildOfficialDocumentApprovalContent + meta.official_doc_request 재사용
 *   → 승인 시 서버 syncOfficialDocumentLogFromApproval이 공문발송대장에 자동 반영(정합).
 * - 그 외: 구조화 값을 읽기 좋은 본문으로 합성 + meta.form_fields에 보존(PC 상세는 content 렌더).
 * - 스키마 없는 슬러그(사직 통보류 등 자유서식)는 일반기안폼 기본 동작(제목+내용) 유지.
 *
 * JM(파일당 500줄, 단일 책임), JM2(정적 스키마), JM4(any 금지, 유니온 타입),
 * JM6(label·input 연결, MSegRow aria)
 */

import { buildOfficialDocumentApprovalContent } from '@/lib/official-document-approval';
import { MField, MInput, MSegRow } from '../인사관리/form-helpers';

// ─────────────────────────────────────────────
// 타입
// ─────────────────────────────────────────────

export type FieldType = 'text' | 'date' | 'numeric' | 'decimal' | 'textarea' | 'select';

export type FieldDef = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  sub?: string;
  /** select 타입 옵션 (MSegRow) */
  options?: ReadonlyArray<{ id: string; label: string }>;
  /** date 타입 기본값을 오늘로 */
  defaultToday?: boolean;
};

export type SchemaCtx = {
  userName: string;
  userCompany: string;
  today: string;
};

export type FormSchema = {
  fields: FieldDef[];
  /** 결재 본문(content) 생성 */
  buildContent: (values: Record<string, string>, ctx: SchemaCtx) => string;
  /** meta_data에 병합할 추가 키 (서버/PC 정합) */
  buildMeta?: (values: Record<string, string>, ctx: SchemaCtx) => Record<string, unknown>;
  /** 결재 제목 자동 생성 (없으면 사용자 입력 제목 사용) */
  buildTitle?: (values: Record<string, string>, ctx: SchemaCtx) => string;
};

// ─────────────────────────────────────────────
// 공통 본문 합성 헬퍼
// ─────────────────────────────────────────────

/** [라벨: 값] 줄 목록 + 본문 블록을 읽기 좋은 텍스트로 합성 */
function composeContent(
  header: string,
  lines: Array<[string, string]>,
  blocks: Array<[string, string]> = [],
): string {
  const out: string[] = [header, ''];
  for (const [label, value] of lines) {
    out.push(`${label}: ${value || '-'}`);
  }
  for (const [label, value] of blocks) {
    out.push('', label, value || '-');
  }
  return out.join('\n');
}

/** 입력값을 form_fields(라벨→값) meta로 보존 */
function fieldsToMeta(schema: FormSchema, values: Record<string, string>): Record<string, unknown> {
  const map: Record<string, string> = {};
  for (const f of schema.fields) {
    const v = (values[f.key] ?? '').trim();
    if (v) map[f.label] = v;
  }
  return map;
}

// ─────────────────────────────────────────────
// 슬러그별 스키마
// ─────────────────────────────────────────────

export const FORM_SCHEMAS: Record<string, FormSchema> = {
  // 공문발송 — PC와 동일 meta(official_doc_request) + 본문 빌더 재사용
  official_document_dispatch: {
    fields: [
      { key: 'sent_date', label: '발송 예정일', type: 'date', defaultToday: true },
      { key: 'doc_number', label: '공문 번호', type: 'text', placeholder: '비우면 승인 시 자동 채번' },
      { key: 'recipient', label: '수신처', type: 'text', required: true, placeholder: '예: OO기관, 협력사, 관공서' },
      { key: 'manager', label: '담당자', type: 'text', placeholder: '담당자명 (비우면 본인)' },
      { key: 'company', label: '법인', type: 'text', placeholder: '법인명 (비우면 소속)' },
      { key: 'doc_title', label: '공문 제목', type: 'text', required: true, placeholder: '발송할 공문 제목' },
      { key: 'note', label: '발송 내용 / 비고', type: 'textarea', placeholder: '발송 목적·주요 내용·참고 사항' },
    ],
    buildContent: (v, ctx) =>
      buildOfficialDocumentApprovalContent({
        sent_date: (v.sent_date || ctx.today).slice(0, 10),
        doc_number: (v.doc_number || '').trim(),
        title: (v.doc_title || '').trim(),
        recipient: (v.recipient || '').trim(),
        manager: (v.manager || ctx.userName || '').trim(),
        is_received: false,
        note: (v.note || '').trim(),
        company: (v.company || ctx.userCompany || '').trim(),
      }),
    buildMeta: (v, ctx) => ({
      request_category: 'official_document_dispatch',
      official_doc_request: {
        sent_date: (v.sent_date || ctx.today).slice(0, 10),
        doc_number: (v.doc_number || '').trim(),
        title: (v.doc_title || '').trim(),
        recipient: (v.recipient || '').trim(),
        manager: (v.manager || ctx.userName || '').trim(),
        is_received: false,
        note: (v.note || '').trim(),
        company: (v.company || ctx.userCompany || '').trim(),
      },
    }),
    buildTitle: (v) => `[공문 발송 승인] ${(v.doc_title || '제목 미입력').trim()}`,
  },

  // 물품신청 / 비품구매
  purchase: {
    fields: [
      { key: 'item', label: '품목', type: 'text', required: true, placeholder: '구매할 품목명' },
      { key: 'qty', label: '수량', type: 'numeric', placeholder: '예: 10' },
      { key: 'amount', label: '예상 금액(원)', type: 'numeric', placeholder: '예: 150000' },
      { key: 'vendor', label: '거래처', type: 'text', placeholder: '예상 구매처(선택)' },
      { key: 'reason', label: '구매 사유', type: 'textarea', required: true, placeholder: '필요 사유·용도' },
    ],
    buildContent: (v) =>
      composeContent(
        '[물품 구매 신청]',
        [
          ['품목', v.item],
          ['수량', v.qty],
          ['예상 금액', v.amount ? `${Number(v.amount).toLocaleString('ko-KR')}원` : ''],
          ['거래처', v.vendor],
        ],
        [['구매 사유', v.reason]],
      ),
    buildMeta: (v) => ({ request_category: 'purchase', form_fields: fieldsToMeta(FORM_SCHEMAS.purchase, v) }),
    buildTitle: (v, ctx) => `${ctx.userName} 물품구매 신청${v.item ? ` - ${v.item}` : ''}`,
  },

  // 수리요청서
  repair_request: {
    fields: [
      { key: 'target', label: '대상 / 장비', type: 'text', required: true, placeholder: '수리 대상 장비·시설' },
      { key: 'location', label: '위치', type: 'text', placeholder: '설치 위치·부서' },
      { key: 'symptom', label: '증상 / 요청 내용', type: 'textarea', required: true, placeholder: '고장 증상·요청 사항' },
      { key: 'desired_date', label: '희망 처리일', type: 'date' },
    ],
    buildContent: (v) =>
      composeContent(
        '[수리 요청]',
        [
          ['대상/장비', v.target],
          ['위치', v.location],
          ['희망 처리일', v.desired_date],
        ],
        [['증상/요청 내용', v.symptom]],
      ),
    buildMeta: (v) => ({ request_category: 'repair_request', form_fields: fieldsToMeta(FORM_SCHEMAS.repair_request, v) }),
    buildTitle: (v, ctx) => `${ctx.userName} 수리요청${v.target ? ` - ${v.target}` : ''}`,
  },

  // 보고서작성
  report: {
    fields: [
      {
        key: 'kind',
        label: '보고 구분',
        type: 'select',
        options: [
          { id: '일일', label: '일일' },
          { id: '주간', label: '주간' },
          { id: '월간', label: '월간' },
          { id: '기타', label: '기타' },
        ],
      },
      { key: 'period', label: '보고 기간', type: 'text', placeholder: '예: 2026-06-01 ~ 06-07' },
      { key: 'body', label: '주요 내용', type: 'textarea', required: true, placeholder: '보고 핵심 내용' },
    ],
    buildContent: (v) =>
      composeContent(
        '[업무 보고]',
        [
          ['보고 구분', v.kind],
          ['보고 기간', v.period],
        ],
        [['주요 내용', v.body]],
      ),
    buildMeta: (v) => ({ request_category: 'report', form_fields: fieldsToMeta(FORM_SCHEMAS.report, v) }),
  },

  // 업무협조
  cooperation: {
    fields: [
      { key: 'dept', label: '협조 부서', type: 'text', required: true, placeholder: '협조 요청 부서' },
      { key: 'desired_date', label: '희망 완료일', type: 'date' },
      { key: 'body', label: '협조 내용', type: 'textarea', required: true, placeholder: '협조 요청 사항' },
    ],
    buildContent: (v) =>
      composeContent(
        '[업무 협조 요청]',
        [
          ['협조 부서', v.dept],
          ['희망 완료일', v.desired_date],
        ],
        [['협조 내용', v.body]],
      ),
    buildMeta: (v) => ({ request_category: 'cooperation', form_fields: fieldsToMeta(FORM_SCHEMAS.cooperation, v) }),
  },

  // 사직서
  resignation: {
    fields: [
      { key: 'resign_date', label: '퇴직 희망일', type: 'date', required: true, defaultToday: true },
      { key: 'reason', label: '사직 사유', type: 'textarea', required: true, placeholder: '사직 사유' },
    ],
    buildContent: (v) =>
      composeContent('[사직서]', [['퇴직 희망일', v.resign_date]], [['사직 사유', v.reason]]),
    buildMeta: (v) => ({ request_category: 'resignation', form_fields: fieldsToMeta(FORM_SCHEMAS.resignation, v) }),
    buildTitle: (v, ctx) => `${ctx.userName} 사직서`,
  },

  // 수습직원평가서
  probation_evaluation: {
    fields: [
      { key: 'target', label: '평가 대상자', type: 'text', required: true, placeholder: '평가 대상 직원명' },
      {
        key: 'result',
        label: '평가 결과',
        type: 'select',
        options: [
          { id: '정규전환', label: '정규전환' },
          { id: '연장', label: '연장' },
          { id: '부적합', label: '부적합' },
        ],
      },
      { key: 'opinion', label: '평가 의견', type: 'textarea', required: true, placeholder: '평가 사유·종합 의견' },
    ],
    buildContent: (v) =>
      composeContent(
        '[수습직원 평가]',
        [
          ['평가 대상자', v.target],
          ['평가 결과', v.result],
        ],
        [['평가 의견', v.opinion]],
      ),
    buildMeta: (v) => ({
      request_category: 'probation_evaluation',
      form_fields: fieldsToMeta(FORM_SCHEMAS.probation_evaluation, v),
    }),
    buildTitle: (v) => `수습직원 평가${v.target ? ` - ${v.target}` : ''}`,
  },

  // 급여인상평가서
  salary_increase_evaluation: {
    fields: [
      { key: 'target', label: '평가 대상자', type: 'text', required: true, placeholder: '평가 대상 직원명' },
      { key: 'current', label: '현재 급여(원)', type: 'numeric', placeholder: '예: 3000000' },
      { key: 'proposed', label: '제안 급여(원)', type: 'numeric', placeholder: '예: 3200000' },
      { key: 'opinion', label: '평가 의견', type: 'textarea', required: true, placeholder: '인상 사유·평가 의견' },
    ],
    buildContent: (v) =>
      composeContent(
        '[급여 인상 평가]',
        [
          ['평가 대상자', v.target],
          ['현재 급여', v.current ? `${Number(v.current).toLocaleString('ko-KR')}원` : ''],
          ['제안 급여', v.proposed ? `${Number(v.proposed).toLocaleString('ko-KR')}원` : ''],
        ],
        [['평가 의견', v.opinion]],
      ),
    buildMeta: (v) => ({
      request_category: 'salary_increase_evaluation',
      form_fields: fieldsToMeta(FORM_SCHEMAS.salary_increase_evaluation, v),
    }),
    buildTitle: (v) => `급여인상 평가${v.target ? ` - ${v.target}` : ''}`,
  },
};

export function getFormSchema(slug: string): FormSchema | null {
  return FORM_SCHEMAS[slug] ?? null;
}

/** 스키마 초기값 (date defaultToday 반영) */
export function initSchemaValues(schema: FormSchema, today: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of schema.fields) {
    out[f.key] = f.type === 'date' && f.defaultToday ? today : '';
  }
  return out;
}

/** 필수 필드 누락 여부 */
export function missingRequired(schema: FormSchema, values: Record<string, string>): boolean {
  return schema.fields.some((f) => f.required && (values[f.key] ?? '').trim() === '');
}

// ─────────────────────────────────────────────
// 렌더러
// ─────────────────────────────────────────────

export type StructuredFieldsProps = {
  schema: FormSchema;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  idPrefix: (key: string) => string;
};

export function StructuredFields({ schema, values, onChange, idPrefix }: StructuredFieldsProps) {
  return (
    <>
      {schema.fields.map((f) => {
        const id = idPrefix(f.key);
        const value = values[f.key] ?? '';
        if (f.type === 'textarea') {
          return (
            <MField key={f.key} label={f.label} required={f.required} htmlFor={id} sub={f.sub}>
              <textarea
                id={id}
                rows={4}
                value={value}
                onChange={(e) => onChange(f.key, e.target.value)}
                placeholder={f.placeholder}
                style={{
                  width: '100%',
                  padding: '8px 0',
                  fontSize: 14,
                  fontFamily: 'inherit',
                  resize: 'none',
                  color: 'var(--z-900)',
                }}
              />
            </MField>
          );
        }
        if (f.type === 'select' && f.options) {
          return (
            <MField key={f.key} label={f.label} required={f.required} sub={f.sub}>
              <MSegRow
                value={value || f.options[0]?.id || ''}
                onPick={(id2) => onChange(f.key, id2)}
                options={f.options}
                ariaLabel={f.label}
              />
            </MField>
          );
        }
        const kind = f.type === 'numeric' ? 'numeric' : f.type === 'decimal' ? 'decimal' : f.type === 'date' ? 'date' : 'text';
        return (
          <MField key={f.key} label={f.label} required={f.required} htmlFor={id} sub={f.sub}>
            <MInput
              id={id}
              value={value}
              onChange={(val) => onChange(f.key, val)}
              placeholder={f.placeholder}
              kind={kind}
              ariaLabel={f.label}
            />
          </MField>
        );
      })}
    </>
  );
}
