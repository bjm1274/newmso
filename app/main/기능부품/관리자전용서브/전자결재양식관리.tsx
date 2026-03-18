'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

type TemplateDesign = {
  title?: string;
  subtitle?: string;
  companyLabel?: string;
  primaryColor?: string;
  borderColor?: string;
  footerText?: string;
  showSignArea?: boolean;
  showBackgroundLogo?: boolean;
  backgroundLogoUrl?: string;
  backgroundLogoOpacity?: number;
  showSeal?: boolean;
  sealLabel?: string;
  titleXPercent?: number;
  titleYPercent?: number;
  subtitleXPercent?: number;
  subtitleYPercent?: number;
  signXPercent?: number;
  signYPercent?: number;
};

type FormTypeRow = {
  id: string;
  name: string;
  slug?: string;
  base_slug?: string | null;
  sort_order?: number | null;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
};

type TemplateOption = {
  slug: string;
  name: string;
  summary: string;
};

const DEFAULT_LOGO_URL = '/logo.png';
const LOCAL_APPROVAL_FORM_TYPES_KEY = 'erp_approval_form_types_custom';
const LOCAL_FORM_TEMPLATE_DESIGNS_KEY = 'erp_form_template_designs';

const builtinTemplates: TemplateOption[] = [
  { slug: 'leave', name: '연차/휴가', summary: '휴가 일정과 인수인계 내용을 정리하는 기본양식' },
  { slug: 'annual_plan', name: '연차계획서', summary: '연간 휴가 계획을 미리 공유하는 기본양식' },
  { slug: 'overtime', name: '연장근무', summary: '근무 시간과 보상 기준을 기록하는 기본양식' },
  { slug: 'purchase', name: '물품신청', summary: '품목과 수량, 용도를 정리하는 기본양식' },
  { slug: 'repair_request', name: '수리요청서', summary: '시설과 장비 이슈를 접수하는 기본양식' },
  { slug: 'draft_business', name: '업무기안', summary: '업무 보고와 결재안을 작성하는 기본양식' },
  { slug: 'cooperation', name: '업무협조', summary: '부서 간 협조 요청을 전달하는 기본양식' },
  { slug: 'generic', name: '양식신청', summary: '각종 문서 발급을 요청하는 기본양식' },
  { slug: 'attendance_fix', name: '출결정정', summary: '출퇴근 기록 정정 사유를 남기는 기본양식' },
  { slug: 'payroll_slip', name: '급여명세서', summary: '급여 문서 디자인에 쓰는 기본양식' },
];

const DEFAULT_DESIGN: TemplateDesign = {
  title: '전자결재 양식',
  subtitle: '브랜드 기본값이 반영된 프리미엄 결재 문서입니다.',
  companyLabel: 'SY INC.',
  primaryColor: '#163b70',
  borderColor: '#d8e1ee',
  footerText: '기본 서식을 기반으로 한 공식 결재 문서입니다.',
  showSignArea: true,
  showBackgroundLogo: true,
  backgroundLogoUrl: DEFAULT_LOGO_URL,
  backgroundLogoOpacity: 0.06,
  showSeal: true,
  sealLabel: 'SY INC. 직인',
  titleXPercent: 9,
  titleYPercent: 18,
  subtitleXPercent: 9,
  subtitleYPercent: 31,
  signXPercent: 73,
  signYPercent: 77,
};

const BUILTIN_TEMPLATE_DEFAULTS: Record<string, TemplateDesign> = {
  leave: { title: '연차/휴가 신청서', primaryColor: '#0f766e', borderColor: '#d4e8e1', sealLabel: '휴가 확인' },
  annual_plan: { title: '연차 계획서', primaryColor: '#115e59', borderColor: '#d8ebe8', sealLabel: '계획 확인' },
  overtime: { title: '연장근무 신청서', primaryColor: '#9a3412', borderColor: '#f2d8c9', sealLabel: '연장 확인' },
  purchase: { title: '물품 신청서', primaryColor: '#b45309', borderColor: '#f4dec7', sealLabel: '구매 확인' },
  repair_request: { title: '수리 요청서', primaryColor: '#334155', borderColor: '#d8dee8', sealLabel: '수리 접수' },
  draft_business: { title: '업무 기안서', primaryColor: '#1d4ed8', borderColor: '#d7e3fb', sealLabel: '기안 확인' },
  cooperation: { title: '업무 협조 요청서', primaryColor: '#0f766e', borderColor: '#d0e7e2', sealLabel: '협조 확인' },
  generic: { title: '양식 신청서', primaryColor: '#0369a1', borderColor: '#d0e5f0', sealLabel: '양식 확인' },
  attendance_fix: { title: '출결 정정 신청서', primaryColor: '#be123c', borderColor: '#f1cfd7', sealLabel: '정정 확인' },
  payroll_slip: { title: '급여 명세서', primaryColor: '#163b70', borderColor: '#d8e1ee', sealLabel: '급여 직인' },
};

function isMissingTableError(error: any, tableName = 'system_settings') {
  if (!error) return false;
  const code = String(error?.code || '');
  const message = String(error?.message || error?.details || '').toLowerCase();
  return code === 'PGRST205' || message.includes(tableName.toLowerCase());
}

function readLocal<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function slugFromName(name: string) {
  return name.replace(/\s+/g, '').replace(/[^\w가-힣a-zA-Z0-9-]/g, '') || 'custom';
}

function alphaColor(hexColor: string | undefined, alpha: number) {
  if (!hexColor) return `rgba(21, 94, 239, ${alpha})`;
  const cleaned = hexColor.replace('#', '');
  const expanded = cleaned.length === 3
    ? cleaned.split('').map((char) => `${char}${char}`).join('')
    : cleaned;

  if (expanded.length !== 6) return `rgba(21, 94, 239, ${alpha})`;

  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

type PreviewRow = {
  label: string;
  value: string;
};

function readRuntimeCompanyLabel(user?: any) {
  if (user?.company) return String(user.company);

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem('erp_user');
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

function resolveCompanyLabelValue(value: string | undefined, fallback: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === DEFAULT_DESIGN.companyLabel) return fallback;
  return trimmed;
}

function resolveSealLabelValue(value: string | undefined, companyLabel: string) {
  const trimmed = String(value || '').trim();
  const defaultSealLabel = `${DEFAULT_DESIGN.companyLabel} 직인`;
  if (!trimmed || trimmed === defaultSealLabel) return `${companyLabel} 직인`;
  return trimmed;
}

type TemplatePreviewSpec = {
  badge: string;
  intro: string;
  summary: string;
  metaRows: PreviewRow[];
  detailRows: PreviewRow[];
  footerNote: string;
};

function buildPreviewIdentityRows(templateSlug: string | null): PreviewRow[] {
  const departmentBySlug: Record<string, string> = {
    leave: '외래팀',
    annual_plan: '총무팀',
    overtime: '수술팀',
    purchase: '1병동',
    repair_request: '검사팀',
    draft_business: '경영지원팀',
    cooperation: '원무팀',
    attendance_fix: '검사팀',
    payroll_slip: '인사팀',
    generic: '경영지원팀',
  };

  return [
    { label: '성명', value: '홍길동' },
    { label: '사번', value: 'KM-240101' },
    { label: '부서', value: departmentBySlug[templateSlug || 'generic'] || '경영지원팀' },
    { label: '직위', value: '대리' },
  ];
}

function buildPreviewStatement(templateSlug: string | null, templateName: string) {
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
    default:
      return `${templateName} 관련 내용을 아래와 같이 제출합니다.`;
  }
}

function buildPreviewDetailRows(templateSlug: string | null): PreviewRow[] {
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
    default:
      return [
        { label: '문서항목', value: '기본 문서 항목 1' },
        { label: '상세내용', value: '조직 내 공유가 필요한 내용을 정리합니다.' },
        { label: '비고', value: '관련 부서 확인 후 최종 처리합니다.' },
      ];
  }
}

function buildPreviewDateLabel(templateSlug: string | null) {
  if (templateSlug === 'annual_plan') return '작성일자';
  return '신청일자';
}

function buildPreviewDocumentNumber(templateSlug: string | null) {
  const prefixBySlug: Record<string, string> = {
    leave: 'LV',
    annual_plan: 'AL',
    overtime: 'OT',
    purchase: 'PR',
    repair_request: 'RP',
    draft_business: 'DG',
    cooperation: 'CO',
    attendance_fix: 'AT',
    payroll_slip: 'PS',
    generic: 'DOC',
  };

  const prefix = prefixBySlug[templateSlug || 'generic'] || 'DOC';
  return `${prefix}-202603-000128`;
}

function buildTemplatePreviewSpec(templateSlug: string | null, templateName: string, templateSummary: string): TemplatePreviewSpec {
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
    footerNote: '전자결재 기본서식',
  };

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
        footerNote: '휴가 승인 문서',
      };
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
        footerNote: '연차 계획 공유',
      };
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
        footerNote: '근무시간 보상 문서',
      };
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
        footerNote: '구매 요청 문서',
      };
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
        footerNote: '시설 이슈 접수',
      };
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
        footerNote: '업무 기안 문서',
      };
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
        footerNote: '부서 협조 문서',
      };
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
        footerNote: '출결 정정 문서',
      };
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
        footerNote: '급여 명세 문서',
      };
    default:
      return genericSpec;
  }
}

function createDefaultDesignMap(companyLabelOverride?: string) {
  return builtinTemplates.reduce<Record<string, TemplateDesign>>((acc, template) => {
    const preset = BUILTIN_TEMPLATE_DEFAULTS[template.slug] || {};
    const companyLabel = resolveCompanyLabelValue(
      preset.companyLabel,
      companyLabelOverride || DEFAULT_DESIGN.companyLabel || 'SY INC.',
    );

    acc[template.slug] = {
      ...DEFAULT_DESIGN,
      ...preset,
      title: preset.title || template.name,
      subtitle: preset.subtitle || template.summary,
      companyLabel,
      backgroundLogoUrl: DEFAULT_LOGO_URL,
      backgroundLogoOpacity: preset.backgroundLogoOpacity ?? DEFAULT_DESIGN.backgroundLogoOpacity,
      sealLabel: resolveSealLabelValue(preset.sealLabel, companyLabel),
    };

    return acc;
  }, {});
}

function mergeWithDefaultDesigns(stored: Record<string, any> | null | undefined, companyLabelOverride?: string) {
  const defaults = createDefaultDesignMap(companyLabelOverride);
  const nextDesigns: Record<string, TemplateDesign> = { ...defaults };

  Object.entries(stored || {}).forEach(([slug, value]) => {
    const patch = typeof value === 'object' && value ? value : {};
    const merged = {
      ...(defaults[slug] || DEFAULT_DESIGN),
      ...patch,
    } as TemplateDesign;

    const companyLabel = resolveCompanyLabelValue(
      merged.companyLabel,
      defaults[slug]?.companyLabel || companyLabelOverride || DEFAULT_DESIGN.companyLabel || 'SY INC.',
    );

    nextDesigns[slug] = {
      ...merged,
      companyLabel,
      backgroundLogoUrl: merged.backgroundLogoUrl || defaults[slug]?.backgroundLogoUrl || DEFAULT_LOGO_URL,
      backgroundLogoOpacity:
        merged.backgroundLogoOpacity
        ?? defaults[slug]?.backgroundLogoOpacity
        ?? DEFAULT_DESIGN.backgroundLogoOpacity,
      sealLabel: resolveSealLabelValue(merged.sealLabel || defaults[slug]?.sealLabel, companyLabel),
      showBackgroundLogo: merged.showBackgroundLogo ?? true,
      showSeal: merged.showSeal ?? true,
      showSignArea: merged.showSignArea ?? true,
    };
  });

  return nextDesigns;
}

function resolveCurrentDesign(
  selectedSlug: string | null,
  selectedName: string,
  designs: Record<string, TemplateDesign>,
  companyLabelOverride?: string,
) {
  const defaults = createDefaultDesignMap(companyLabelOverride);
  const preset = selectedSlug ? defaults[selectedSlug] : undefined;
  const saved = selectedSlug ? designs[selectedSlug] : undefined;
  const merged = {
    ...DEFAULT_DESIGN,
    ...(preset || {}),
    ...(saved || {}),
  };
  const companyLabel = resolveCompanyLabelValue(
    merged.companyLabel,
    preset?.companyLabel || companyLabelOverride || DEFAULT_DESIGN.companyLabel || 'SY INC.',
  );

  return {
    ...merged,
    title: merged.title || selectedName || DEFAULT_DESIGN.title,
    subtitle: merged.subtitle || preset?.subtitle || DEFAULT_DESIGN.subtitle,
    companyLabel,
    backgroundLogoUrl: merged.backgroundLogoUrl || preset?.backgroundLogoUrl || DEFAULT_LOGO_URL,
    backgroundLogoOpacity:
      merged.backgroundLogoOpacity
      ?? preset?.backgroundLogoOpacity
      ?? DEFAULT_DESIGN.backgroundLogoOpacity,
    sealLabel: resolveSealLabelValue(merged.sealLabel || preset?.sealLabel, companyLabel),
    showBackgroundLogo: merged.showBackgroundLogo ?? true,
    showSeal: merged.showSeal ?? true,
    showSignArea: merged.showSignArea ?? true,
  } satisfies TemplateDesign;
}

async function persistDesigns(designs: Record<string, TemplateDesign>) {
  writeLocal(LOCAL_FORM_TEMPLATE_DESIGNS_KEY, designs);
  const result = await supabase
    .from('system_settings')
    .upsert(
      {
        key: 'form_template_designs',
        value: JSON.stringify(designs),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );

  if (isMissingTableError(result.error, 'system_settings')) {
    return { data: designs, error: null } as unknown as typeof result;
  }

  return result;
}

export default function ApprovalFormTypesManager({ user }: { user?: any }) {
  const [list, setList] = useState<FormTypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [designLoading, setDesignLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [addName, setAddName] = useState('');
  const [addSlug, setAddSlug] = useState('');
  const [addBaseSlug, setAddBaseSlug] = useState(builtinTemplates[0]?.slug || '');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(builtinTemplates[0]?.slug || null);
  const [selectedName, setSelectedName] = useState(builtinTemplates[0]?.name || '연차/휴가');
  const [designs, setDesigns] = useState<Record<string, TemplateDesign>>({});
  const designEditorRef = useRef<HTMLElement | null>(null);
  const currentCompanyLabel = useMemo(() => readRuntimeCompanyLabel(user), [user]);
  const selectedBaseTemplate = useMemo(
    () => builtinTemplates.find((template) => template.slug === addBaseSlug) ?? builtinTemplates[0],
    [addBaseSlug]
  );

  const customTemplates = useMemo(
    () =>
      list
        .filter((row) => row.is_active !== false)
        .filter((row) => !builtinTemplates.some((template) => template.slug === row.slug))
        .map((row) => ({
          slug: row.slug || row.id,
          name: row.name,
          summary: row.base_slug
            ? `${builtinTemplates.find((template) => template.slug === row.base_slug)?.name || '기본양식'} 기반 추가 양식`
            : '기본양식을 복제해서 만든 추가 양식',
        })),
    [list]
  );

  const combinedTemplates = useMemo(
    () => [...builtinTemplates, ...customTemplates],
    [customTemplates]
  );

  const selectedTemplate = useMemo(
    () => combinedTemplates.find((template) => template.slug === selectedSlug) ?? null,
    [combinedTemplates, selectedSlug]
  );

  const previewTemplateSlug = useMemo(() => {
    if (!selectedSlug) return 'generic';
    if (builtinTemplates.some((template) => template.slug === selectedSlug)) {
      return selectedSlug;
    }

    const customTemplate = list.find((row) => (row.slug || row.id) === selectedSlug);
    return customTemplate?.base_slug || 'generic';
  }, [list, selectedSlug]);

  const previewSpec = useMemo(
    () => buildTemplatePreviewSpec(
      previewTemplateSlug,
      selectedName,
      (builtinTemplates.find((template) => template.slug === previewTemplateSlug) ?? selectedTemplate)?.summary || ''
    ),
    [previewTemplateSlug, selectedName, selectedTemplate]
  );

  const previewDesign = useMemo(() => {
    const previewTemplateName =
      builtinTemplates.find((template) => template.slug === previewTemplateSlug)?.name || selectedName;

    return resolveCurrentDesign(previewTemplateSlug, previewTemplateName, {}, currentCompanyLabel);
  }, [currentCompanyLabel, previewTemplateSlug, selectedName]);

  const previewSourceName = useMemo(
    () => builtinTemplates.find((template) => template.slug === previewTemplateSlug)?.name || selectedName,
    [previewTemplateSlug, selectedName]
  );

  const previewIdentityRows = useMemo(
    () => buildPreviewIdentityRows(previewTemplateSlug),
    [previewTemplateSlug]
  );

  const previewStatement = useMemo(
    () => buildPreviewStatement(previewTemplateSlug, previewDesign.title || previewSourceName),
    [previewDesign.title, previewSourceName, previewTemplateSlug]
  );

  const previewDetailRows = useMemo(
    () => buildPreviewDetailRows(previewTemplateSlug),
    [previewTemplateSlug]
  );

  const previewDateLabel = useMemo(
    () => buildPreviewDateLabel(previewTemplateSlug),
    [previewTemplateSlug]
  );

  const previewDocumentNumber = useMemo(
    () => buildPreviewDocumentNumber(previewTemplateSlug),
    [previewTemplateSlug]
  );

  const syncListState = (next: FormTypeRow[]) => {
    writeLocal(LOCAL_APPROVAL_FORM_TYPES_KEY, next);
    setList(next);
  };

  useEffect(() => {
    const loadList = async () => {
      const localRows = readLocal<FormTypeRow[]>(LOCAL_APPROVAL_FORM_TYPES_KEY, []);

      try {
        const { data, error } = await supabase
          .from('approval_form_types')
          .select('*')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true });

        if (!error && Array.isArray(data)) {
          const map = new Map<string, FormTypeRow>();
          [...(data as FormTypeRow[]), ...localRows].forEach((row) => {
            const key = row.slug || row.id;
            if (!map.has(key)) {
              map.set(key, row);
            }
          });
          setList(Array.from(map.values()));
          return;
        }

        if (error && !isMissingTableError(error, 'approval_form_types')) {
          console.warn('approval_form_types load failed:', error);
        }
      } catch (error) {
        console.warn('approval_form_types load failed:', error);
      } finally {
        setLoading(false);
      }

      setList(localRows);
    };

    const loadSavedDesigns = async () => {
      try {
        const localDesigns = readLocal<Record<string, TemplateDesign>>(LOCAL_FORM_TEMPLATE_DESIGNS_KEY, {});
        const { data, error } = await supabase
          .from('system_settings')
          .select('value')
          .eq('key', 'form_template_designs')
          .maybeSingle();

        let parsed = localDesigns;
        if (!error && data?.value) {
          parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          writeLocal(LOCAL_FORM_TEMPLATE_DESIGNS_KEY, parsed);
        } else if (error && !isMissingTableError(error, 'system_settings')) {
          throw error;
        }

        setDesigns(mergeWithDefaultDesigns(parsed, currentCompanyLabel));
      } catch (error) {
        console.error(error);
        setDesigns(createDefaultDesignMap(currentCompanyLabel));
      } finally {
        setDesignLoading(false);
      }
    };

    void loadList();
    void loadSavedDesigns();
  }, [currentCompanyLabel]);

  useEffect(() => {
    if (!selectedSlug) return;
    const selectedTemplate = combinedTemplates.find((template) => template.slug === selectedSlug);
    if (selectedTemplate) {
      if (selectedTemplate.name !== selectedName) {
        setSelectedName(selectedTemplate.name);
      }
      return;
    }

    if (builtinTemplates[0]) {
      setSelectedSlug(builtinTemplates[0].slug);
      setSelectedName(builtinTemplates[0].name);
    }
  }, [combinedTemplates, selectedName, selectedSlug]);

  const handleSelectTemplate = (slug: string, name: string) => {
    setSelectedSlug(slug);
    setSelectedName(name);
    requestAnimationFrame(() => {
      designEditorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleAdd = async () => {
    const name = addName.trim();
    if (!name) return alert('양식 이름을 입력해 주세요.');

    const baseTemplate = builtinTemplates.find((template) => template.slug === addBaseSlug) ?? builtinTemplates[0];
    const slug = (addSlug.trim() || slugFromName(name)).slice(0, 50);

    if (builtinTemplates.some((template) => template.slug === slug || template.name === name)) {
      return alert('기본양식과 같은 이름이나 코드로는 추가할 수 없습니다.');
    }
    if (list.some((row) => row.slug === slug || row.name === name)) {
      return alert('같은 이름 또는 코드의 추가 양식이 이미 있습니다.');
    }

    const nextDesigns = {
      ...designs,
      [slug]: {
        ...resolveCurrentDesign(baseTemplate.slug, baseTemplate.name, designs),
        title: name,
      },
    };

    const { error: designError } = await persistDesigns(nextDesigns);
    if (designError) {
      return alert('기본양식 복제에 실패했습니다: ' + designError.message);
    }

    const nextRows = [
      ...list,
      {
        id: globalThis.crypto?.randomUUID?.() || `local-${Date.now()}`,
        name,
        slug,
        base_slug: baseTemplate.slug,
        sort_order: list.length,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    setDesigns(nextDesigns);
    syncListState(nextRows);
    setAddName('');
    setAddSlug('');
    setSelectedSlug(slug);
    setSelectedName(name);
  };

  const startEdit = (row: FormTypeRow) => {
    setEditingId(row.id);
    setEditName(row.name);
    setEditSlug(row.slug || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const name = editName.trim();
    if (!name) return alert('양식 이름을 입력해 주세요.');

    const slug = (editSlug.trim() || slugFromName(name)).slice(0, 50);
    const currentRow = list.find((row) => row.id === editingId);
    if (!currentRow) return;
    if (list.some((row) => row.id !== editingId && (row.slug === slug || row.name === name))) {
      return alert('같은 이름 또는 코드의 추가 양식이 이미 있습니다.');
    }

    const previousSlug = currentRow.slug || currentRow.id;
    if (previousSlug !== slug && designs[previousSlug]) {
      const nextDesigns = { ...designs, [slug]: { ...designs[previousSlug], title: name } };
      delete nextDesigns[previousSlug];
      const { error } = await persistDesigns(nextDesigns);
      if (error) {
        return alert('양식 디자인 이동에 실패했습니다: ' + error.message);
      }
      setDesigns(nextDesigns);
    }

    const nextRows = list.map((row) =>
      row.id === editingId ? { ...row, name, slug, updated_at: new Date().toISOString() } : row
    );
    syncListState(nextRows);
    setEditingId(null);

    if (selectedSlug === previousSlug || selectedSlug === slug) {
      setSelectedSlug(slug);
      setSelectedName(name);
    }
  };

  const toggleActive = (row: FormTypeRow) => {
    const nextRows = list.map((item) =>
      item.id === row.id ? { ...item, is_active: !row.is_active, updated_at: new Date().toISOString() } : item
    );
    syncListState(nextRows);
  };

  const handleDelete = async (row: FormTypeRow) => {
    if (!confirm('이 추가 양식을 삭제하시겠습니까?')) return;

    const key = row.slug || row.id;
    if (designs[key]) {
      const nextDesigns = { ...designs };
      delete nextDesigns[key];
      const { error } = await persistDesigns(nextDesigns);
      if (error) {
        return alert('양식 디자인 정리에 실패했습니다: ' + error.message);
      }
      setDesigns(nextDesigns);
    }

    syncListState(list.filter((item) => item.id !== row.id));

    if (selectedSlug === key) {
      setSelectedSlug(builtinTemplates[0]?.slug || null);
      setSelectedName(builtinTemplates[0]?.name || '');
    }
  };

  return (
    <div className="max-w-6xl space-y-5">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">기본양식 관리</h2>
        <p className="text-sm leading-6 text-[var(--toss-gray-3)]">
          예전처럼 양식빌더, 문서양식, 결재양식을 나누지 않고 기본양식을 기준으로 바로 보고 추가하도록 정리했습니다.
        </p>
      </div>

      <section ref={designEditorRef} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">기본양식</h3>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
              새 양식을 만들 때 기준이 되는 기본양식입니다.
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-[var(--muted)] px-4 py-2 text-xs font-semibold text-[var(--toss-gray-4)]">
            총 {builtinTemplates.length}개
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {builtinTemplates.map((template) => {
            const isBase = addBaseSlug === template.slug;
            const isSelected = selectedSlug === template.slug;

            return (
              <button
                key={template.slug}
                type="button"
                onClick={() => {
                  setAddBaseSlug(template.slug);
                  handleSelectTemplate(template.slug, template.name);
                }}
                className={`rounded-[var(--radius-xl)] border p-4 text-left transition-all ${
                  isBase || isSelected
                    ? 'border-blue-200 bg-[var(--toss-blue-light)]/70 shadow-sm'
                    : 'border-[var(--border)] hover:border-blue-100 hover:bg-[var(--muted)]/50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--foreground)]">{template.name}</p>
                    <p className="mt-2 text-xs leading-5 text-[var(--toss-gray-3)]">{template.summary}</p>
                  </div>
                  <span className={`rounded-[var(--radius-md)] px-2.5 py-1 text-[10px] font-semibold ${isBase ? 'bg-[var(--accent)] text-white' : 'bg-blue-50 text-blue-600'}`}>
                    {isBase ? '추가 기준' : '기본양식'}
                  </span>
                </div>
                {isSelected && (
                  <div className="mt-3 text-[11px] font-semibold text-[var(--accent)]">현재 수정 중</div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">기본양식 기반 양식 추가</h3>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
              선택한 기본양식을 복제해서 새 결재양식을 만들고, 아래에서 이어서 수정합니다.
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700">
            현재 기준: {selectedBaseTemplate?.name || '기본양식'}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">기준 기본양식</span>
            <select
              value={addBaseSlug}
              onChange={(e) => setAddBaseSlug(e.target.value)}
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            >
              {builtinTemplates.map((template) => (
                <option key={template.slug} value={template.slug}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>

          <label className="min-w-[220px] flex-[1.2]">
            <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">추가할 양식 이름</span>
            <input
              type="text"
              value={addName}
              onChange={(e) => {
                setAddName(e.target.value);
                if (!addSlug) setAddSlug(slugFromName(e.target.value));
              }}
              placeholder="예: 외부출장 신청서"
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <label className="min-w-[180px] flex-1">
            <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">양식 코드</span>
            <input
              type="text"
              value={addSlug}
              onChange={(e) => setAddSlug(e.target.value)}
              placeholder="자동 생성 또는 직접 입력"
              className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-200"
            />
          </label>

          <button
            type="button"
            onClick={handleAdd}
            className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            기본양식으로 추가
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] shadow-sm">
        <div className="border-b border-[var(--border)] px-4 py-4">
          <h3 className="text-base font-semibold text-[var(--foreground)]">기본양식 기반 추가 양식</h3>
          <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
            추가 양식은 모두 기본양식 복제본입니다.
          </p>
        </div>

        {loading ? (
          <div className="p-5 text-center text-sm text-[var(--toss-gray-3)]">양식을 불러오는 중입니다...</div>
        ) : list.length === 0 ? (
          <div className="p-5 text-center text-sm text-[var(--toss-gray-3)]">
            아직 추가된 양식이 없습니다. 위에서 기본양식을 선택해 새 양식을 추가해 주세요.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border)]">
            {list.map((row) => {
              const baseName = builtinTemplates.find((template) => template.slug === row.base_slug)?.name;

              return (
                <li key={row.id} className="px-4 py-4 hover:bg-[var(--muted)]/50">
                  {editingId === row.id ? (
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="min-w-[180px] flex-[1.2]">
                        <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">양식 이름</span>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 text-sm font-semibold"
                        />
                      </label>
                      <label className="min-w-[180px] flex-1">
                        <span className="mb-1 block text-[11px] font-bold text-[var(--toss-gray-3)]">양식 코드</span>
                        <input
                          value={editSlug}
                          onChange={(e) => setEditSlug(e.target.value)}
                          className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] px-3 py-2 text-sm font-semibold"
                        />
                      </label>
                      <button type="button" onClick={saveEdit} className="rounded-[var(--radius-lg)] bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white">
                        저장
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-[var(--radius-lg)] bg-[var(--toss-gray-2)] px-4 py-2 text-xs font-bold text-[var(--foreground)]">
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-[220px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-[var(--foreground)]">{row.name}</span>
                          <span className="text-xs text-[var(--toss-gray-3)]">{row.slug}</span>
                          {!row.is_active && (
                            <span className="rounded-[var(--radius-md)] bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-600">비활성</span>
                          )}
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[var(--toss-gray-3)]">
                          <span className="rounded-[var(--radius-md)] bg-[var(--muted)] px-2.5 py-1 font-semibold">
                            {baseName ? `${baseName} 기반` : '기본양식 기반'}
                          </span>
                          <span>디자인은 아래에서 이어서 수정할 수 있습니다.</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => handleSelectTemplate(row.slug || row.id, row.name)} className="rounded-[var(--radius-lg)] bg-[var(--muted)] px-3 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--toss-gray-2)]">
                          수정 열기
                        </button>
                        <button type="button" onClick={() => toggleActive(row)} className="rounded-[var(--radius-lg)] bg-[var(--muted)] px-3 py-2 text-xs font-bold text-[var(--foreground)] hover:bg-[var(--toss-gray-2)]">
                          {row.is_active === false ? '활성화' : '비활성'}
                        </button>
                        <button type="button" onClick={() => startEdit(row)} className="rounded-[var(--radius-lg)] bg-amber-100 px-3 py-2 text-xs font-bold text-amber-800">
                          이름/코드 수정
                        </button>
                        <button type="button" onClick={() => handleDelete(row)} className="rounded-[var(--radius-lg)] bg-red-50 px-3 py-2 text-xs font-bold text-red-600">
                          삭제
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section ref={designEditorRef} className="rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-[var(--foreground)]">기본양식 미리보기</h3>
            <p className="mt-1 text-sm text-[var(--toss-gray-3)]">
              문서 양식을 누르면 해당 양식의 기본 문서 이미지만 바로 확인합니다.
            </p>
          </div>
          {designLoading && <span className="text-xs font-semibold text-[var(--toss-gray-3)]">기본값 불러오는 중...</span>}
        </div>

        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--muted)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[var(--toss-gray-3)]">기본 문서 미리보기</p>
              <p className="mt-1 text-lg font-bold text-[var(--foreground)]">{selectedName}</p>
              <p className="mt-1 text-sm text-[var(--toss-gray-3)]">{previewSpec.summary}</p>
            </div>
            <div className="rounded-[var(--radius-md)] bg-[var(--card)] px-4 py-2 text-xs font-semibold text-[var(--toss-gray-4)]">
              기본값 기준 {previewSourceName}
            </div>
          </div>

          <div className="mt-5 flex min-h-[700px] items-center justify-center rounded-[var(--radius-xl)] border border-[var(--border)] bg-[#dde4e8] px-5 py-5">
            <div
              className="relative aspect-[210/297] w-full max-w-[430px] overflow-hidden bg-[var(--card)] shadow-[0_28px_70px_rgba(15,23,42,0.14)]"
              style={{
                border: `1px solid ${previewDesign.borderColor || '#d5dce4'}`,
                boxShadow: '0 28px 70px rgba(15,23,42,0.14), 0 0 0 1px rgba(255,255,255,0.85) inset',
              }}
            >
              <div className="absolute inset-0 bg-[linear-gradient(180deg,#ffffff_0%,#fdfefe_76%,#f5f8fa_100%)]" />
              {previewDesign.showBackgroundLogo !== false && previewDesign.backgroundLogoUrl && (
                <img
                  src={previewDesign.backgroundLogoUrl}
                  alt=""
                  className="absolute left-1/2 top-[50%] h-24 w-24 -translate-x-1/2 -translate-y-1/2 object-contain mix-blend-multiply"
                  style={{ opacity: previewDesign.backgroundLogoOpacity ?? 0.055 }}
                />
              )}

              <div className="relative z-10 flex h-full flex-col px-5 py-5 text-[#1f2937]">
                <div className="flex items-start gap-4">
                  <div
                    className="flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[var(--radius-lg)] bg-[var(--card)]"
                    style={{ border: `1px solid ${previewDesign.borderColor || '#d5dce4'}` }}
                  >
                    <img src="/logo.png" alt="" className="h-10 w-10 object-contain" />
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <h4 className="mt-1 text-[26px] font-black tracking-[-0.04em] text-[var(--foreground)]">
                      {previewDesign.title || previewSourceName}
                    </h4>
                  </div>
                </div>

                <div className="mt-4 h-[3px] w-full" style={{ backgroundColor: previewDesign.primaryColor || '#2d93a8' }} />

                <div className="mt-4 shrink-0 grid grid-cols-[74px_1fr] gap-3">
                  <div>
                    <div
                      className="overflow-hidden rounded bg-[#eef2f6]"
                      style={{ border: `1px solid ${previewDesign.borderColor || '#d5dce4'}` }}
                    >
                      <div className="flex aspect-[3/4] items-center justify-center text-[34px] font-black text-[var(--toss-gray-3)]">홍</div>
                    </div>
                    <p className="mt-1 text-center text-[8px] font-medium text-[var(--toss-gray-3)]">사진</p>
                  </div>

                  <div className="space-y-1 pt-0.5">
                    {previewIdentityRows.map((row, index) => (
                      <div
                        key={row.label}
                        className={`grid grid-cols-[42px_8px_1fr] gap-1.5 ${index < previewIdentityRows.length - 1 ? 'border-b pb-1.5' : ''}`}
                        style={{ borderColor: previewDesign.borderColor || '#d5dce4' }}
                      >
                        <span className="text-[9px] font-bold text-[var(--foreground)]">{row.label}</span>
                        <span className="text-[9px] font-bold text-[var(--foreground)]">:</span>
                        <span className="text-[9px] font-medium leading-[1.35] text-[var(--toss-gray-5)]">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-4 shrink-0 border-t pt-4 text-center" style={{ borderColor: previewDesign.borderColor || '#d5dce4' }}>
                  <p className="mx-auto max-w-[290px] text-[11px] leading-[1.75] text-[var(--toss-gray-5)]">
                    {previewStatement}
                  </p>
                </div>

                <div
                  className="mt-4 shrink-0 overflow-hidden bg-[var(--card)]"
                  style={{ borderTop: `2px solid ${previewDesign.primaryColor || '#2d93a8'}`, borderBottom: `2px solid ${previewDesign.primaryColor || '#2d93a8'}` }}
                >
                  {previewDetailRows.map((row, index) => (
                    <div
                      key={row.label}
                      className={`grid grid-cols-[74px_10px_1fr] gap-2 px-3 py-2.5 ${index < previewDetailRows.length - 1 ? 'border-b' : ''}`}
                      style={{ borderColor: previewDesign.borderColor || '#d5dce4' }}
                    >
                      <span className="text-[10px] font-bold text-[var(--foreground)]">{row.label}</span>
                      <span className="text-[10px] font-bold text-[var(--foreground)]">:</span>
                      <span className="text-[10px] font-medium leading-[1.65] text-[var(--toss-gray-5)]">{row.value}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-4 shrink-0 border-t pt-4 text-center" style={{ borderColor: previewDesign.borderColor || '#d5dce4' }}>
                  <div className="space-y-1 text-[10px] text-[var(--toss-gray-4)]">
                    <p>{previewDateLabel} 2026년 3월 13일</p>
                    <p>발급번호 {previewDocumentNumber}</p>
                  </div>
                  <div className="mt-4 flex justify-center">
                    <div className="relative inline-flex items-end pr-8">
                      <p className="text-[24px] font-black tracking-[-0.03em] text-[var(--foreground)]">
                        {previewDesign.companyLabel || 'SY INC.'}
                      </p>
                    </div>
                    {previewDesign.showSeal !== false && (
                      <div className="-ml-5 flex h-[66px] w-[66px] items-center justify-center rounded-full border-[3px] border-double border-[#b42318] bg-[var(--card)] text-center text-[10px] font-black leading-4 text-[#b42318] opacity-80">
                        회사
                        <br />
                        직인
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
