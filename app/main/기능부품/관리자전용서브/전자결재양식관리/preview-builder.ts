import { STORAGE_KEYS } from '@/lib/storage-keys';
import { DEFAULT_DESIGN } from './design-utils';
import type { PreviewRow, TemplatePreviewSpec } from './types';

export function readRuntimeCompanyLabel(user?: any) {
  if (user?.company) return String(user.company);

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEYS.USER);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.company) return String(parsed.company);
      }
    } catch {
      // ignore
    }
  }

  return DEFAULT_DESIGN.companyLabel || 'SY INC.';
}

export function buildPreviewIdentityRows(templateSlug: string | null): PreviewRow[] {
  const departmentBySlug: Record<string, string> = {
    leave: '외래팀',
    annual_plan: '총무팀',
    overtime: '수술팀',
    purchase: '1병동',
    repair_request: '검사팀',
    draft_business: '경영지원팀',
    cooperation: '원무팀',
    attendance_fix: '검사팀',
    resignation: '경영지원팀',
    payroll_slip: '인사팀',
    generic: '경영지원팀' };

  return [
    { label: '성명', value: '홍길동' },
    { label: '사번', value: 'KM-240101' },
    { label: '부서', value: departmentBySlug[templateSlug || 'generic'] || '경영지원팀' },
    { label: '직위', value: '대리' },
  ];
}

export function buildPreviewStatement(templateSlug: string | null, templateName: string) {
  switch (templateSlug) {
    case 'leave':
      return '아래와 같이 휴가를 신청하오니 허가하여 주시기 바랍니다.';
    case 'annual_plan':
      return '아래와 같이 연간 휴가 계획을 제출하오니 검토하여 주시기 바랍니다.';
    case 'overtime':
      return '아래와 같이 연장근무를 신청하오니 승인하여 주시기 바랍니다.';
    case 'purchase':
      return '아래와 같이 물품 구매를 신청하오니 검토하여 주시기 바랍니다.';
    case 'repair_request':
      return '아래와 같이 시설 보수를 요청하오니 확인하여 주시기 바랍니다.';
    case 'draft_business':
      return '아래와 같이 업무 기안을 상신하오니 결재하여 주시기 바랍니다.';
    case 'cooperation':
      return '아래와 같이 부서 협조를 요청하오니 검토하여 주시기 바랍니다.';
    case 'attendance_fix':
      return '아래와 같이 근태 정정을 신청하오니 확인하여 주시기 바랍니다.';
    case 'resignation':
      return '본인은 일신상의 사정으로 인하여 사직하고자 하오니 승인하여 주시기 바랍니다.';
    default:
      return `${templateName} 관련 내용을 아래와 같이 제출합니다.`;
  }
}

export function buildPreviewDetailRows(templateSlug: string | null): PreviewRow[] {
  switch (templateSlug) {
    case 'leave':
      return [
        { label: '휴가일시', value: '2026.03.18 09:00 ~ 2026.03.19 18:00' },
        { label: '휴가구분', value: '연차' },
        { label: '사유', value: '가족 일정으로 인한 개인 휴가 사용' },
      ];
    case 'annual_plan':
      return [
        { label: '계획기간', value: '2026년 3월 / 6월 / 10월' },
        { label: '예상일수', value: '총 8일' },
        { label: '비고', value: '부서 운영 일정 고려 후 최종 확정 예정' },
      ];
    case 'overtime':
      return [
        { label: '근무일시', value: '2026.03.12 18:00 ~ 21:00' },
        { label: '근무구분', value: '연장근무' },
        { label: '사유', value: '수술 일정 지연에 따른 마감 대응' },
      ];
    case 'purchase':
      return [
        { label: '품목', value: '멸균 거즈 / 20BOX' },
        { label: '수량', value: '20BOX' },
        { label: '사유', value: '병동 재고 보충 및 응급 사용 대비' },
      ];
    case 'repair_request':
      return [
        { label: '수리대상', value: 'MRI실 모니터 2번' },
        { label: '장애내용', value: '영상 출력 불안정 및 화면 깜빡임' },
        { label: '사유', value: '진료 중 장비 확인이 어려워 업무 지연 발생' },
      ];
    case 'draft_business':
      return [
        { label: '기안안건', value: '소모품 공급 계약 조건 조정' },
        { label: '시행시기', value: '2026년 4월 1일 예정' },
        { label: '사유', value: '운영비 절감 및 납기 안정성 확보 필요' },
      ];
    case 'cooperation':
      return [
        { label: '협조일시', value: '2026.03.18 08:30' },
        { label: '협조내용', value: '신규 접수 동선 안내 및 창구 인력 지원' },
        { label: '사유', value: '외래 내원 증가에 따른 현장 혼선 방지' },
      ];
    case 'attendance_fix':
      return [
        { label: '정정일시', value: '2026.03.12 08:21 출근' },
        { label: '정정구분', value: '출근 시간 정정' },
        { label: '사유', value: '모바일 출근 등록 누락' },
      ];
    case 'resignation':
      return [
        { label: '사직예정일', value: '2026.07.15' },
        { label: '사직사유', value: '개인 사정 (이직 및 리프레시)' },
        { label: '인수인계자', value: '이몽룡 대리' },
      ];
    default:
      return [
        { label: '문서항목', value: '기본 문서 항목 1' },
        { label: '상세내용', value: '조직 내 공유가 필요한 내용을 정리합니다.' },
        { label: '비고', value: '관련 부서 확인 후 최종 처리합니다.' },
      ];
  }
}

export function buildPreviewDateLabel(templateSlug: string | null) {
  if (templateSlug === 'annual_plan') return '작성일자';
  return '신청일자';
}

export function buildPreviewDocumentNumber(templateSlug: string | null) {
  const prefixBySlug: Record<string, string> = {
    leave: 'LV',
    annual_plan: 'AL',
    overtime: 'OT',
    purchase: 'PR',
    repair_request: 'RP',
    draft_business: 'DG',
    cooperation: 'CO',
    attendance_fix: 'AT',
    resignation: 'RS',
    payroll_slip: 'PS',
    generic: 'DOC' };

  const prefix = prefixBySlug[templateSlug || 'generic'] || 'DOC';
  return `${prefix}-202603-000128`;
}

export function buildTemplatePreviewSpec(
  templateSlug: string | null,
  templateName: string,
  templateSummary: string,
): TemplatePreviewSpec {
  const fallbackSummary = templateSummary || '선택한 양식의 기본 문서 구성을 이 화면에서 바로 미리보기로 확인합니다.';

  const genericSpec: TemplatePreviewSpec = {
    badge: '기본 양식',
    intro: '문서 기본 미리보기',
    summary: fallbackSummary,
    metaRows: [
      { label: '신청자', value: '홍길동 / 경영지원팀' },
      { label: '작성일', value: '2026.03.13' },
      { label: '문서번호', value: 'DOC-2026-0313' },
      { label: '결재선', value: '팀장 > 부서장 > 관리자' },
    ],
    detailRows: [
      { label: '문서 제목', value: templateName || '기본 문서 양식' },
      { label: '핵심 내용', value: '선택한 양식의 주요 항목과 승인 포인트를 한 장에 정리합니다.' },
      { label: '공유 범위', value: '관련 부서와 결재자에게 즉시 공유됩니다.' },
      { label: '첨부 안내', value: '필요한 첨부 문서는 결재 전 단계에서 추가합니다.' },
    ],
    footerNote: '전자결재 기본서식' };

  switch (templateSlug) {
    case 'leave':
      return {
        badge: '휴가 신청',
        intro: '연차 · 휴가 기본양식',
        summary: '휴가 일정과 인수인계, 승인 흐름을 한 장으로 확인하는 문서형 기본양식입니다.',
        metaRows: [
          { label: '신청자', value: '홍길동 / 외래팀' },
          { label: '신청일', value: '2026.03.13' },
          { label: '휴가 구분', value: '연차' },
          { label: '승인 단계', value: '팀장 > 인사팀' },
        ],
        detailRows: [
          { label: '사용 기간', value: '2026.03.18 - 2026.03.19' },
          { label: '인수인계', value: '외래 접수 및 예약 문의는 김민지에게 전달합니다.' },
          { label: '비상 연락', value: '010-0000-0000' },
          { label: '확인 사항', value: '승인 즉시 관련 부서와 일정이 공유됩니다.' },
        ],
        footerNote: '휴가 승인 문서' };
    case 'annual_plan':
      return {
        badge: '연차 계획',
        intro: '연간 사용 계획 미리보기',
        summary: '연차 사용 계획을 미리 공유하고 월별 운영 공백을 조정하는 문서형 기본양식입니다.',
        metaRows: [
          { label: '대상자', value: '홍길동 / 총무팀' },
          { label: '계획 연도', value: '2026년' },
          { label: '작성일', value: '2026.01.05' },
          { label: '검토 라인', value: '팀장 > 인사팀' },
        ],
        detailRows: [
          { label: '상반기 계획', value: '3월 2일, 5월 1일, 6월 5일' },
          { label: '하반기 계획', value: '8월 3일, 10월 2일, 12월 24일' },
          { label: '대체 인력', value: '성수기 일정은 팀 내 선조정 후 사용합니다.' },
          { label: '운영 메모', value: '부서 운영상 변동 시 재기안 후 수정합니다.' },
        ],
        footerNote: '연차 계획 공유' };
    case 'overtime':
      return {
        badge: '연장 근무',
        intro: '근무시간 보상 신청',
        summary: '근무시간, 보상 기준, 승인 사유를 정리해 제출하는 문서형 기본양식입니다.',
        metaRows: [
          { label: '신청자', value: '홍길동 / 수술팀' },
          { label: '근무일', value: '2026.03.12' },
          { label: '연장 시간', value: '3시간' },
          { label: '보상 방식', value: '수당 지급' },
        ],
        detailRows: [
          { label: '업무 내용', value: '수술 지연으로 인한 회복실 마감 지원' },
          { label: '시작 · 종료', value: '18:00 - 21:00' },
          { label: '승인 포인트', value: '부서장 승인 후 급여 반영 대상으로 이관합니다.' },
          { label: '확인 메모', value: '연장근무 사유와 실제 근무시간을 함께 보관합니다.' },
        ],
        footerNote: '근무시간 보상 문서' };
    case 'purchase':
      return {
        badge: '물품 신청',
        intro: '구매 요청 기본양식',
        summary: '품목, 수량, 용도와 조달 우선순위를 정리하는 문서형 기본양식입니다.',
        metaRows: [
          { label: '요청 부서', value: '병동팀 1병동' },
          { label: '작성자', value: '홍길동' },
          { label: '요청일', value: '2026.03.13' },
          { label: '긴급 여부', value: '일반' },
        ],
        detailRows: [
          { label: '품목', value: '멸균 거즈 / 20BOX' },
          { label: '사용 목적', value: '주간 시술 및 응급 재고 보충' },
          { label: '예상 소진', value: '2주 내 사용 예정' },
          { label: '조달 메모', value: '기존 계약 공급처 단가 기준으로 확인합니다.' },
        ],
        footerNote: '구매 요청 문서' };
    case 'repair_request':
      return {
        badge: '수리 요청',
        intro: '시설 · 장비 이슈 접수',
        summary: '고장 증상과 요청 우선순위를 빠르게 공유하는 문서형 기본양식입니다.',
        metaRows: [
          { label: '접수 부서', value: '검사팀' },
          { label: '접수자', value: '홍길동' },
          { label: '발생일', value: '2026.03.13' },
          { label: '위치', value: 'MRI실' },
        ],
        detailRows: [
          { label: '대상 장비', value: '영상 출력 모니터 2번' },
          { label: '증상', value: '전원은 들어오나 화면 출력이 불안정합니다.' },
          { label: '긴급도', value: '당일 확인 필요' },
          { label: '처리 메모', value: '점검 후 수리 또는 교체 여부를 회신합니다.' },
        ],
        footerNote: '시설 이슈 접수' };
    case 'draft_business':
      return {
        badge: '업무 기안',
        intro: '업무 보고 · 결재 초안',
        summary: '업무 배경, 실행 계획, 결재 포인트를 문서형으로 정리하는 기본양식입니다.',
        metaRows: [
          { label: '기안 부서', value: '경영지원팀' },
          { label: '기안자', value: '홍길동' },
          { label: '기안일', value: '2026.03.13' },
          { label: '관련 부서', value: '총무팀, 재무팀' },
        ],
        detailRows: [
          { label: '배경', value: '분기 운영비 절감을 위한 계약 구조 조정' },
          { label: '주요 내용', value: '현 공급 계약 재정비 및 비용 비교 검토' },
          { label: '요청 사항', value: '예산 승인 및 일정 확정' },
          { label: '첨부 예정', value: '비교 견적서, 운영 현황표' },
        ],
        footerNote: '업무 기안 문서' };
    case 'cooperation':
      return {
        badge: '업무 협조',
        intro: '부서 간 협조 요청',
        summary: '필요 지원 내용과 일정, 책임 범위를 정리해 전달하는 문서형 기본양식입니다.',
        metaRows: [
          { label: '요청 부서', value: '원무팀' },
          { label: '협조 부서', value: '관리팀' },
          { label: '요청일', value: '2026.03.13' },
          { label: '희망 일정', value: '2026.03.18' },
        ],
        detailRows: [
          { label: '협조 내용', value: '신규 접수 창구 이전에 따른 동선 안내 설치' },
          { label: '필요 인원', value: '관리 2명' },
          { label: '우선순위', value: '개원 전 완료 필요' },
          { label: '공유 메모', value: '완료 후 원무팀과 현장 확인 예정' },
        ],
        footerNote: '부서 협조 문서' };
    case 'attendance_fix':
      return {
        badge: '출결 정정',
        intro: '출퇴근 기록 정정',
        summary: '누락 또는 오기재된 출결 정보를 사유와 함께 정정 신청하는 문서형 기본양식입니다.',
        metaRows: [
          { label: '신청자', value: '홍길동 / 검사팀' },
          { label: '대상일', value: '2026.03.12' },
          { label: '정정 구분', value: '출근시간 수정' },
          { label: '신청일', value: '2026.03.13' },
        ],
        detailRows: [
          { label: '기존 기록', value: '출근 누락' },
          { label: '정정 요청', value: '08:27 출근으로 수정' },
          { label: '사유', value: '단말기 오류로 체크인이 반영되지 않았습니다.' },
          { label: '확인 자료', value: 'CCTV 확인, 부서장 확인 후 승인' },
        ],
        footerNote: '출결 정정 문서' };
    case 'payroll_slip':
      return {
        badge: '급여 문서',
        intro: '월별 지급 내역 미리보기',
        summary: '월 급여, 수당, 공제, 실지급 정보를 보기 쉽게 정리한 문서형 기본양식입니다.',
        metaRows: [
          { label: '대상자', value: '홍길동 / 관리팀' },
          { label: '지급 월', value: '2026년 3월' },
          { label: '지급일', value: '2026.03.25' },
          { label: '문서번호', value: 'PAY-2026-0325' },
        ],
        detailRows: [
          { label: '기본급', value: '3,200,000원' },
          { label: '수당 합계', value: '420,000원' },
          { label: '공제 합계', value: '318,000원' },
          { label: '실지급액', value: '3,302,000원' },
        ],
        footerNote: '급여 명세 문서' };
    case 'resignation':
      return {
        badge: '사직서',
        intro: '사직서 기본양식',
        summary: '퇴사 의사를 밝히고 업무 인수인계 및 퇴직 예정일을 공유하는 문서형 기본양식입니다.',
        metaRows: [
          { label: '신청자', value: '홍길동 / 외래팀' },
          { label: '신청일', value: '2026.03.13' },
          { label: '구분', value: '의원면직' },
          { label: '승인 단계', value: '팀장 > 부서장 > 인사팀' },
        ],
        detailRows: [
          { label: '사직 예정일', value: '2026.04.13' },
          { label: '사직 사유', value: '개인 신상 및 이직 준비' },
          { label: '인수인계 계획', value: '담당 업무 매뉴얼 정리 및 인수인계 파일 전달' },
          { label: '확인 사항', value: '사직서가 승인되면 퇴사 처리가 진행됩니다.' },
        ],
        footerNote: '사직 승인 문서' };
    default:
      return genericSpec;
  }
}
