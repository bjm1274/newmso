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
        company: (v.company || ctx.userCompany || '').trim() }),
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
        company: (v.company || ctx.userCompany || '').trim() } }),
    buildTitle: (v) => `[공문 발송 승인] ${(v.doc_title || '제목 미입력').trim()}` },

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
    buildMeta: (v) => ({
      request_category: 'purchase',
      form_fields: fieldsToMeta(FORM_SCHEMAS.purchase, v),
      // 서버 final inventory_workflow / normalizeSupplyRequestItems 는
      // PC 물품신청 스키마(name/qty/unit/category/dept/purpose) 를 기대
      items: [
        {
          name: String(v.item || '').trim(),
          qty: Math.max(1, Number(v.qty) || 1),
          unit: 'EA' as const,
          category: '',
          dept: '',
          purpose: String(v.reason || '').trim(),
          // 모바일 입력 보조 필드(표시·감사용, normalizer 는 무시)
          estimated_amount: Number(v.amount) || 0,
          vendor: String(v.vendor || '').trim() || null,
        },
      ].filter((row) => row.name),
    }),
    buildTitle: (v, ctx) => `${ctx.userName} 물품신청${v.item ? ` - ${v.item}` : ''}` },

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
    buildTitle: (v, ctx) => `${ctx.userName} 수리요청${v.target ? ` - ${v.target}` : ''}` },

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
        ] },
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
    buildMeta: (v) => ({ request_category: 'report', form_fields: fieldsToMeta(FORM_SCHEMAS.report, v) }) },

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
    buildMeta: (v) => ({ request_category: 'cooperation', form_fields: fieldsToMeta(FORM_SCHEMAS.cooperation, v) }) },

  // 사직서
  resignation: {
    fields: [
      { key: 'resign_date', label: '사직 예정일', type: 'date', required: true, defaultToday: true },
      { key: 'handover_target', label: '인수인계자', type: 'text', placeholder: '인수인계 대상자 성명 입력' },
      {
        key: 'reason_select',
        label: '사직 사유',
        type: 'select',
        options: [
          { id: '개인 사정 (이직 및 충전)', label: '개인 사정 (이직 및 충전)' },
          { id: '개인 사정 (건강 문제)', label: '개인 사정 (건강 문제)' },
          { id: '개인 사정 (학업 및 커리어 개발)', label: '개인 사정 (학업 및 커리어 개발)' },
          { id: '기타 (직접 입력)', label: '기타 (직접 입력)' },
        ] },
      { key: 'reason', label: '상세 사유', type: 'textarea', required: true, placeholder: '상세 사직 사유 및 내용을 입력하세요.' },
    ],
    buildContent: (v, ctx) => {
      const finalReason = v.reason_select === '기타 (직접 입력)' ? v.reason : v.reason_select;
      const dateStr = v.resign_date ? `${v.resign_date}부` : '[사직예정일]부';
      const reasonStr = finalReason ? `(${finalReason})` : '';
      return `사 직 서\n\n성 명: ${ctx.userName}\n상기 본인은 개인 사정${reasonStr}으로 인하여 ${dateStr}로 사직하고자 하오니 승인하여 주시기 바랍니다.\n\n위 신청인: ${ctx.userName} (인)\n\n인수인계자: ${v.handover_target || '없음'}`;
    },
    buildMeta: (v) => ({
      request_category: 'resignation',
      resignDate: v.resign_date,
      handoverTarget: v.handover_target,
      resignReason: v.reason_select === '기타 (직접 입력)' ? v.reason : v.reason_select }),
    buildTitle: (v, ctx) => `사직서 (${ctx.userName})` },

  // 금품청산 지급기일 연장 동의서
  severance_extension_agreement: {
    fields: [
      { key: 'employee_reg_number', label: '주민등록번호', type: 'text', required: true, placeholder: '000000-0000000' },
      { key: 'employee_address', label: '주소', type: 'text', required: true, placeholder: '현재 주소를 입력하세요' },
      { key: 'employee_contact', label: '연락처', type: 'text', required: true, placeholder: '010-0000-0000' },
      { key: 'employee_resign_date', label: '퇴사일', type: 'date', required: true, defaultToday: true },
      { key: 'wage_payment_date', label: '임금 지급기일', type: 'date', required: true },
      { key: 'severance_payment_date', label: '퇴직금 지급기일', type: 'date', required: true },
      { key: 'other_payment_date', label: '기타 지급기일', type: 'date', required: true },
    ],
    buildContent: (v, ctx) =>
      `금품청산 지급기일 연장 동의서\n\n근로자 성명: ${ctx.userName}\n주민등록번호: ${v.employee_reg_number}\n주소: ${v.employee_address}\n연락처: ${v.employee_contact}\n퇴사일: ${v.employee_resign_date}\n\n상기 본인은 퇴직에 따른 임금 및 퇴직금 등 기타 금품의 지급기일을 아래와 같이 연장하는 것에 동의합니다.\n- 임금 지급기일: ${v.wage_payment_date}\n- 퇴직금 지급기일: ${v.severance_payment_date}\n- 기타 지급기일: ${v.other_payment_date}`,
    buildMeta: (v) => ({
      request_category: 'severance_extension_agreement',
      employeeRegNumber: v.employee_reg_number,
      employeeAddress: v.employee_address,
      employeeContact: v.employee_contact,
      employeeResignDate: v.employee_resign_date,
      wagePaymentDate: v.wage_payment_date,
      severancePaymentDate: v.severance_payment_date,
      otherPaymentDate: v.other_payment_date }),
    buildTitle: (v, ctx) => `금품청산 지급기일 연장 동의서 (${ctx.userName})` },

  // 퇴직 서약서
  retirement_pledge: {
    fields: [
      { key: 'pledge_resign_date', label: '사직 예정일', type: 'date', required: true, defaultToday: true },
      { key: 'pledge_period', label: '근로기간', type: 'text', required: true, placeholder: 'YYYY.MM.DD ~ YYYY.MM.DD' },
    ],
    buildContent: (v, ctx) =>
      `퇴직 서약서\n\n서약자 성명: ${ctx.userName}\n사직 예정일: ${v.pledge_resign_date}\n근로기간: ${v.pledge_period}\n\n본인은 퇴직함에 있어 재직 중 취득한 회사의 기술 정보 및 영업 비밀을 제3자에게 누설하지 않을 것이며, 회사의 명예와 이익에 위해가 되는 행위를 하지 않을 것을 서약합니다.`,
    buildMeta: (v) => ({
      request_category: 'retirement_pledge',
      pledgeResignDate: v.pledge_resign_date,
      pledgePeriod: v.pledge_period }),
    buildTitle: (v, ctx) => `퇴직 서약서 (${ctx.userName})` },

  // 증명서발급
  generic: {
    fields: [
      {
        key: 'form_id',
        label: '발급 증명서 선택',
        type: 'select',
        options: [
          { id: '재직증명서', label: '재직증명서' },
          { id: '경력증명서', label: '경력증명서' },
          { id: '퇴직증명서', label: '퇴직증명서' },
          { id: '급여인증서', label: '급여인증서' },
          { id: '원천징수영수증', label: '원천징수영수증' },
        ] },
      { key: 'purpose', label: '발급 용도', type: 'textarea', required: true, placeholder: '예: 금융기관 제출용, 관공서 제출용' },
      {
        key: 'urgency',
        label: '긴급도',
        type: 'select',
        options: [
          { id: '일반', label: '일반' },
          { id: '긴급', label: '긴급' },
          { id: '매우긴급', label: '매우긴급' },
        ] },
    ],
    buildContent: (v, ctx) =>
      `신청자: ${ctx.userName}\n대상자: ${ctx.userName}\n용도: ${v.purpose}\n긴급도: ${v.urgency}`,
    buildMeta: (v) => ({
      form_id: v.form_id,
      form_type: v.form_id,
      target_staff: null,
      purpose: v.purpose,
      urgency: v.urgency,
      auto_issue: true,
      cc_departments: ['행정팀'] }),
    buildTitle: (v, ctx) => `${v.form_id || '증명서'} 발급 신청 (${ctx.userName})` },

  // 업무기안
  draft_business: {
    fields: [
      {
        key: 'kind',
        label: '기안 성격',
        type: 'select',
        options: [
          { id: '일반 품의', label: '일반 품의' },
          { id: '예산 집행', label: '예산 집행' },
          { id: '제도 변경', label: '제도 변경' },
          { id: '기타', label: '기타' },
        ] },
      { key: 'body', label: '기안 내용', type: 'textarea', required: true, placeholder: '기안 목적 및 상세 내용을 입력하세요.' },
    ],
    buildContent: (v) =>
      `[업무 기안]\n기안 성격: ${v.kind}\n\n내용:\n${v.body}`,
    buildMeta: (v) => ({
      request_category: 'draft_business',
      orderCategory: v.kind }),
    buildTitle: (v, ctx) => `[업무기안] ${ctx.userName} - ${v.kind}` },

  // 계약종료 통보
  contract_end_notice: {
    fields: [
      { key: 'target_name', label: '대상자 성명', type: 'text', required: true, placeholder: '대상 직원명' },
      { key: 'end_date', label: '계약 종료일', type: 'date', required: true, defaultToday: true },
      { key: 'reason', label: '종료 사유', type: 'textarea', required: true, placeholder: '계약 종료 상세 사유' },
    ],
    buildContent: (v) =>
      `계약종료 통보서\n\n대상자: ${v.target_name}\n계약 종료일: ${v.end_date}\n\n상기 직원에 대하여 근로계약 기간이 만료됨에 따라 근로계약이 종료됨을 통보합니다.\n\n사유:\n${v.reason}`,
    buildMeta: (v) => ({
      request_category: 'contract_end_notice',
      targetStaffName: v.target_name,
      endDate: v.end_date }),
    buildTitle: (v) => `계약종료 통보 (${v.target_name || ''})` },

  // 해고통보
  dismissal_notice: {
    fields: [
      { key: 'target_name', label: '대상자 성명', type: 'text', required: true, placeholder: '대상 직원명' },
      { key: 'dismissal_date', label: '해고 예고일', type: 'date', required: true, defaultToday: true },
      { key: 'reason', label: '해고 사유', type: 'textarea', required: true, placeholder: '구체적 해고 사유' },
    ],
    buildContent: (v) =>
      `해고 통지서\n\n대상자: ${v.target_name}\n해고 예정일: ${v.dismissal_date}\n\n상기 직원의 근로 계약을 해지하며 이를 통지합니다.\n\n해고 사유:\n${v.reason}`,
    buildMeta: (v) => ({
      request_category: 'dismissal_notice',
      targetStaffName: v.target_name,
      dismissalDate: v.dismissal_date }),
    buildTitle: (v) => `해고통보서 (${v.target_name || ''})` },

  // 징계위원회 출석요구서
  disciplinary_attendance_request: {
    fields: [
      { key: 'target_name', label: '대상자 성명', type: 'text', required: true, placeholder: '대상 직원명' },
      { key: 'meeting_date', label: '회의 일시', type: 'text', required: true, placeholder: '예: 2026년 7월 5일 14:00' },
      { key: 'location', label: '회의 장소', type: 'text', required: true, placeholder: '예: 3층 소회의실' },
      { key: 'reason', label: '심의 안건 사유', type: 'textarea', required: true, placeholder: '출석 요구 사유 및 안건 내용' },
    ],
    buildContent: (v) =>
      `징계위원회 출석요구서\n\n대상자: ${v.target_name}\n회의 일시: ${v.meeting_date}\n회의 장소: ${v.location}\n\n상기 심의 안건과 관련하여 징계위원회를 개최하오니 출석하여 주시기 바랍니다.\n\n안건 사유:\n${v.reason}`,
    buildMeta: (v) => ({
      request_category: 'disciplinary_attendance_request',
      targetStaffName: v.target_name,
      meetingDate: v.meeting_date,
      location: v.location }),
    buildTitle: (v) => `징계위원회 출석요구서 (${v.target_name || ''})` },

  // 수습직원평가서
  probation_evaluation: {
    fields: [
      { key: 'target', label: '평가 대상자', type: 'text', required: true, placeholder: '평가 대상 직원명' },
      { key: 'join_date', label: '입사일', type: 'date', required: true, defaultToday: true },
      { key: 'period_start', label: '평가 시작일', type: 'date', required: true, defaultToday: true },
      { key: 'period_end', label: '평가 종료일', type: 'date', required: true },
      {
        key: 'result',
        label: '평가 결과 / 최종 판정',
        type: 'select',
        options: [
          { id: '정규직 임용 승인', label: '정규직 임용 승인' },
          { id: '수습기간 연장(1~3개월)', label: '수습기간 연장(1~3개월)' },
          { id: '채용 취소 및 근로 계약 종료', label: '채용 취소 및 근로 계약 종료' },
        ] },
      { key: 'opinion', label: '종합 평가 의견', type: 'textarea', required: true, placeholder: '피평가자의 강약점 및 직무 태도 평가' },
    ],
    buildContent: (v) =>
      composeContent(
        '[수습직원 평가]',
        [
          ['평가 대상자', v.target],
          ['입사일', v.join_date],
          ['평가 기간', `${v.period_start} ~ ${v.period_end}`],
          ['최종 판정', v.result],
        ],
        [['종합 평가 의견', v.opinion]],
      ),
    buildMeta: (v) => ({
      request_category: 'probation_evaluation',
      evaluationType: 'probation',
      targetStaffName: v.target,
      joinDate: v.join_date,
      periodStart: v.period_start,
      periodEnd: v.period_end,
      decision: v.result,
      review: v.opinion }),
    buildTitle: (v) => `[수습평가] ${v.target || ''} 수습직원 평가 보고` },

  // 급여인상평가서
  salary_increase_evaluation: {
    fields: [
      { key: 'target', label: '평가 대상자', type: 'text', required: true, placeholder: '평가 대상 직원명' },
      { key: 'current', label: '현재 급여(원)', type: 'numeric', required: true, placeholder: '예: 3000000' },
      { key: 'raise_percent', label: '인상율 (%)', type: 'decimal', required: true, placeholder: '예: 5.5' },
      { key: 'effective_month', label: '적용 예정 월', type: 'text', required: true, placeholder: '예: 2026-07' },
      { key: 'opinion', label: '심사 및 평가 의견', type: 'textarea', required: true, placeholder: '급여 인상 타당성 조서 및 평가 의견을 구체적으로 입력하세요.' },
    ],
    buildContent: (v) => {
      const cur = Number(v.current) || 0;
      const pct = Number(v.raise_percent) || 0;
      const proposed = Math.round(cur * (1 + pct / 100));
      return composeContent(
        '[급여 인상 평가]',
        [
          ['평가 대상자', v.target],
          ['현재 급여', `${cur.toLocaleString('ko-KR')}원`],
          ['인상 비율', `+${pct}%`],
          ['제안 급여', `${proposed.toLocaleString('ko-KR')}원`],
          ['적용 예정 월', v.effective_month],
        ],
        [['평가 의견', v.opinion]],
      );
    },
    buildMeta: (v) => {
      const cur = Number(v.current) || 0;
      const pct = Number(v.raise_percent) || 0;
      const proposed = Math.round(cur * (1 + pct / 100));
      return {
        request_category: 'salary_increase_evaluation',
        evaluationType: 'salary_increase',
        targetStaffName: v.target,
        currentSalary: cur,
        raisePercent: pct,
        newSalary: proposed,
        effectiveMonth: v.effective_month,
        review: v.opinion };
    },
    buildTitle: (v) => `[급여인상] ${v.target || ''} 급여 인상 심사 보고` } };

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
                  color: 'var(--z-900)' }}
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
