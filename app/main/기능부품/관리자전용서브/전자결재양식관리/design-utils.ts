import type { TemplateDesign, TemplateOption } from './types';

export const DEFAULT_LOGO_URL = '/logo.png';

export const DEFAULT_DESIGN: TemplateDesign = {
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
  sealImageUrl: '',
  sealLabel: 'SY INC. 직인',
  titleXPercent: 9,
  titleYPercent: 18,
  subtitleXPercent: 9,
  subtitleYPercent: 31,
  signXPercent: 73,
  signYPercent: 77,
};

export const builtinTemplates: TemplateOption[] = [
  { slug: 'leave', name: '연차/휴가', summary: '휴가 일정과 인수인계 내용을 정리하는 기본양식' },
  { slug: 'annual_plan', name: '연차계획서', summary: '연간 휴가 계획을 미리 공유하는 기본양식' },
  { slug: 'overtime', name: '연장근무', summary: '근무 시간과 보상 기준을 기록하는 기본양식' },
  { slug: 'purchase', name: '물품신청', summary: '품목과 수량, 용도를 정리하는 기본양식' },
  { slug: 'repair_request', name: '수리요청서', summary: '시설과 장비 이슈를 접수하는 기본양식' },
  { slug: 'draft_business', name: '업무기안', summary: '업무 보고와 결재안을 작성하는 기본양식' },
  { slug: 'cooperation', name: '업무협조', summary: '부서 간 협조 요청을 전달하는 기본양식' },
  { slug: 'generic', name: '증명서발급', summary: '재직·경력 등 각종 증명서 발급을 요청하는 기본양식' },
  { slug: 'attendance_fix', name: '출결정정', summary: '출퇴근 기록 정정 사유를 남기는 기본양식' },
  { slug: 'payroll_slip', name: '급여명세서', summary: '급여 문서 디자인에 쓰는 기본양식' },
];

export const BUILTIN_TEMPLATE_DEFAULTS: Record<string, TemplateDesign> = {
  leave: { title: '연차/휴가 신청서', primaryColor: '#0f766e', borderColor: '#d4e8e1', sealLabel: '휴가 확인' },
  annual_plan: { title: '연차 계획서', primaryColor: '#115e59', borderColor: '#d8ebe8', sealLabel: '계획 확인' },
  overtime: { title: '연장근무 신청서', primaryColor: '#9a3412', borderColor: '#f2d8c9', sealLabel: '연장 확인' },
  purchase: { title: '물품 신청서', primaryColor: '#b45309', borderColor: '#f4dec7', sealLabel: '구매 확인' },
  repair_request: { title: '수리 요청서', primaryColor: '#334155', borderColor: '#d8dee8', sealLabel: '수리 접수' },
  draft_business: { title: '업무 기안서', primaryColor: '#1d4ed8', borderColor: '#d7e3fb', sealLabel: '기안 확인' },
  cooperation: { title: '업무 협조 요청서', primaryColor: '#0f766e', borderColor: '#d0e7e2', sealLabel: '협조 확인' },
  generic: { title: '증명서 발급 신청서', primaryColor: '#0369a1', borderColor: '#d0e5f0', sealLabel: '증명서 확인' },
  attendance_fix: { title: '출결 정정 신청서', primaryColor: '#be123c', borderColor: '#f1cfd7', sealLabel: '정정 확인' },
  payroll_slip: { title: '급여 명세서', primaryColor: '#163b70', borderColor: '#d8e1ee', sealLabel: '급여 직인' },
};

export function alphaColor(hexColor: string | undefined, alpha: number) {
  if (!hexColor) return `rgba(21, 94, 239, ${alpha})`;
  const cleaned = hexColor.replace('#', '');
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((char) => `${char}${char}`)
          .join('')
      : cleaned;

  if (expanded.length !== 6) return `rgba(21, 94, 239, ${alpha})`;

  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveCompanyLabelValue(value: string | undefined, fallback: string) {
  const trimmed = String(value || '').trim();
  if (!trimmed || trimmed === DEFAULT_DESIGN.companyLabel) return fallback;
  return trimmed;
}

export function resolveSealLabelValue(value: string | undefined, companyLabel: string) {
  const trimmed = String(value || '').trim();
  const defaultSealLabel = `${DEFAULT_DESIGN.companyLabel} 직인`;
  if (!trimmed || trimmed === defaultSealLabel) return `${companyLabel} 직인`;
  return trimmed;
}

export function createDefaultDesignMap(companyLabelOverride?: string) {
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

export function mergeWithDefaultDesigns(
  stored: Record<string, any> | null | undefined,
  companyLabelOverride?: string,
) {
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
        merged.backgroundLogoOpacity ??
        defaults[slug]?.backgroundLogoOpacity ??
        DEFAULT_DESIGN.backgroundLogoOpacity,
      sealLabel: resolveSealLabelValue(merged.sealLabel || defaults[slug]?.sealLabel, companyLabel),
      showBackgroundLogo: merged.showBackgroundLogo ?? true,
      showSeal: merged.showSeal ?? true,
      showSignArea: merged.showSignArea ?? true,
    };
  });

  return nextDesigns;
}

export function resolveCurrentDesign(
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
      merged.backgroundLogoOpacity ??
      preset?.backgroundLogoOpacity ??
      DEFAULT_DESIGN.backgroundLogoOpacity,
    sealLabel: resolveSealLabelValue(merged.sealLabel || preset?.sealLabel, companyLabel),
    showBackgroundLogo: merged.showBackgroundLogo ?? true,
    showSeal: merged.showSeal ?? true,
    showSignArea: merged.showSignArea ?? true,
  } satisfies TemplateDesign;
}
