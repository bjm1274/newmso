/**
 * 문서보관함 분류 SSOT
 *
 * 1) 시스템 자동 생성: 근로계약서 · 연차촉진 · 증명서(발급) · 제출서류
 * 2) 전자결재 양식: 물품신청 · 수리요청서 · 연차/휴가 · 업무기안 … (양식별 개별 분류)
 * 3) 수동 보관: 규정 · 기타
 *
 * 전자결재 양식 name/slug 은 approval-constants 의 BUILTIN_FORM_TYPE_DEFINITIONS 과 정합.
 */

export type DocRepoCategoryGroup = 'system' | 'approval' | 'manual';

export type DocRepoCategoryMeta = {
  id: string;
  label: string;
  hint: string;
  retention: string;
  security: '대외비' | '일반';
  immutable: boolean;
  group: DocRepoCategoryGroup;
};

export const DOC_REPO_GROUP_META: Record<
  DocRepoCategoryGroup,
  { id: DocRepoCategoryGroup; label: string; hint: string }
> = {
  system: {
    id: 'system',
    label: '시스템 문서',
    hint: '계약 서명·연차촉진·증명서 발급 등 시스템이 자동 보관',
  },
  approval: {
    id: 'approval',
    label: '전자결재',
    hint: '전자결재 완료·보관 문서를 양식별로 분류',
  },
  manual: {
    id: 'manual',
    label: '수동 보관',
    hint: '규정·기타 수동 등록',
  },
};

/** 전자결재 양식 slug → 문서보관 분류 id (결재 type/name 과 동일하게 맞춤) */
export const APPROVAL_SLUG_TO_CATEGORY: Record<string, string> = {
  leave: '연차/휴가',
  leave_request: '연차/휴가',
  annual_plan: '연차계획서',
  annual_leave_plan: '연차계획서',
  overtime: '연장근무',
  purchase: '물품신청',
  supplies: '물품신청',
  repair_request: '수리요청서',
  report: '보고서작성',
  draft_business: '업무기안',
  cooperation: '업무협조',
  official_document_dispatch: '공문발송',
  generic: '증명서발급',
  attendance_fix: '출결정정',
  resignation: '사직서',
  severance_extension_agreement: '금품청산 지급기일 연장 동의서',
  retirement_pledge: '퇴직 서약서',
  // 시스템 자동 촉진과 동일 폴더로 통합
  leave_promotion_notice: '연차촉진',
  probation_evaluation: '수습직원평가서',
  salary_increase_evaluation: '급여인상평가서',
  contract_end_notice: '계약종료 통보',
  dismissal_notice: '해고통보',
  disciplinary_attendance_request: '징계위원회 출석요구서',
  personnel_order: '인사명령',
  roster: '근무표',
};

/** 결재 type/name 별칭 → 정식 분류 */
const APPROVAL_TYPE_ALIASES: Record<string, string> = {
  '연차/휴가 신청': '연차/휴가',
  연차신청: '연차/휴가',
  휴가신청: '연차/휴가',
  연차사용계획서: '연차계획서',
  연장근무신청: '연장근무',
  '연장근무 신청': '연장근무',
  물품구매: '물품신청',
  '물품구매 신청': '물품신청',
  수리요청: '수리요청서',
  수리신청: '수리요청서',
  수리신청서: '수리요청서',
  출결정정신청: '출결정정',
  '출결정정 신청': '출결정정',
  양식신청: '증명서발급',
  증명서: '증명서발급',
  연차촉진통보서: '연차촉진',
  연차촉진동의서: '연차촉진',
};

function buildApprovalCategories(): DocRepoCategoryMeta[] {
  // slug 맵 기준 유니크 라벨 (연차촉진은 system 그룹에 있으므로 approval 목록에서 제외)
  const labels = new Set<string>();
  for (const cat of Object.values(APPROVAL_SLUG_TO_CATEGORY)) {
    if (cat === '연차촉진') continue;
    labels.add(cat);
  }
  // 인사명령·근무표 등 슬러그 외 type
  labels.add('인사명령');
  labels.add('근무표');

  return Array.from(labels)
    .sort((a, b) => a.localeCompare(b, 'ko'))
    .map((id) => ({
      id,
      label: id,
      hint: '전자결재 보관 원본',
      retention: '3년',
      security: '일반' as const,
      immutable: true,
      group: 'approval' as const,
    }));
}

const SYSTEM_CATEGORIES: DocRepoCategoryMeta[] = [
  {
    id: '근로계약서',
    label: '근로계약서',
    hint: '전자서명 완료 원본 (시스템 자동 보관)',
    retention: '퇴직 후 3년',
    security: '대외비',
    immutable: true,
    group: 'system',
  },
  {
    id: '연차촉진',
    label: '연차촉진',
    hint: '사용촉진 통보서 원본 (시스템 자동 보관)',
    retention: '3년',
    security: '일반',
    immutable: true,
    group: 'system',
  },
  {
    id: '증명서',
    label: '증명서',
    hint: '재직·경력 등 발급 완료본 (시스템)',
    retention: '3년',
    security: '일반',
    immutable: true,
    group: 'system',
  },
  {
    id: '제출서류',
    label: '제출서류',
    hint: '입사·인사 제출 스캔본',
    retention: '재직 중',
    security: '대외비',
    immutable: false,
    group: 'system',
  },
];

const MANUAL_CATEGORIES: DocRepoCategoryMeta[] = [
  {
    id: '규정',
    label: '규정',
    hint: '취업규칙·사규',
    retention: '영구',
    security: '일반',
    immutable: false,
    group: 'manual',
  },
  {
    id: '기타',
    label: '기타',
    hint: '미분류·기타 문서',
    retention: '영구',
    security: '일반',
    immutable: false,
    group: 'manual',
  },
];

export const DOC_REPO_CATEGORIES: readonly DocRepoCategoryMeta[] = [
  ...SYSTEM_CATEGORIES,
  ...buildApprovalCategories(),
  ...MANUAL_CATEGORIES,
];

const CATEGORY_SET = new Set(DOC_REPO_CATEGORIES.map((c) => c.id));

/** 과거 저장 별칭 → 정식 분류 */
const LEGACY_ALIASES: Record<string, string> = {
  계약서: '근로계약서',
  계약: '근로계약서',
  근로계약: '근로계약서',
  employment_contract: '근로계약서',
  contract: '근로계약서',
  연차사용촉진: '연차촉진',
  연차통보: '연차촉진',
  촉진통보: '연차촉진',
  회사규정: '규정',
  법인: '규정',
  인사: '규정',
  설명서: '규정',
  매뉴얼: '규정',
  각종서식: '기타',
  서식: '기타',
  양식: '기타', // 과거 일괄 '양식' 폴더 — 제목/본문으로 재분류 시도 후 폴백
  보고서: '보고서작성',
  증빙: '증명서',
  재무: '기타',
  인사발령서: '인사명령',
  인사발령: '인사명령',
};

/**
 * 보관 content 헤더의 "문서종류: …" 에서 분류 추출 (결재 자동보관 본문)
 */
export function extractCategoryFromArchiveContent(content?: string | null): string | null {
  const raw = String(content || '');
  const m = raw.match(/^문서종류:\s*(.+)$/m);
  if (!m?.[1]) return null;
  return normalizeDocCategory(m[1].trim(), null, { skipContent: true });
}

/**
 * 저장·표시용 분류 정규화.
 * @param options.skipContent 재귀 방지용
 */
export function normalizeDocCategory(
  raw?: string | null,
  title?: string | null,
  options?: { content?: string | null; skipContent?: boolean },
): string {
  const t = String(title || '').trim();
  const c = String(raw || '').trim();

  // 1) 제목 기반 시스템 문서 우선
  if (
    t.includes('연차유급휴가 사용촉진') ||
    t.includes('연차 유급휴가 사용촉진') ||
    t.includes('연차사용촉진') ||
    /^연차촉진/.test(t)
  ) {
    return '연차촉진';
  }
  if (
    (t.includes('근로계약서') || /^[가-힣]{2,4}\s+근로계약/.test(t)) &&
    !t.includes('위임') &&
    !t.includes('용역')
  ) {
    return '근로계약서';
  }

  // 2) 정식 id
  if (c && CATEGORY_SET.has(c)) return c;

  // 3) 별칭
  if (c && LEGACY_ALIASES[c]) {
    const mapped = LEGACY_ALIASES[c];
    // 과거 '양식' 일괄 저장 → content/title 로 세분 시도
    if (c === '양식' || mapped === '기타') {
      const fromContent =
        !options?.skipContent && options?.content
          ? extractCategoryFromArchiveContent(options.content)
          : null;
      if (fromContent && fromContent !== '기타') return fromContent;
      const fromTitle = inferApprovalCategoryFromTitle(t);
      if (fromTitle) return fromTitle;
    }
    if (mapped !== '기타' || !t) return mapped;
  }

  if (c && APPROVAL_TYPE_ALIASES[c]) return APPROVAL_TYPE_ALIASES[c];

  // 4) slug 형태
  if (c && APPROVAL_SLUG_TO_CATEGORY[c]) return APPROVAL_SLUG_TO_CATEGORY[c];

  // 5) content 헤더
  if (!options?.skipContent && options?.content) {
    const fromContent = extractCategoryFromArchiveContent(options.content);
    if (fromContent) return fromContent;
  }

  // 6) 부분 매칭 (시스템)
  if (c.includes('계약') && !c.includes('종료') && !c.includes('위임')) return '근로계약서';
  if (c.includes('연차촉진') || (c.includes('촉진') && c.includes('연차'))) return '연차촉진';
  if (c === '증명서' || (c.includes('증명') && !c.includes('발급'))) return '증명서';
  if (c.includes('제출') || c.includes('스캔') || c.includes('등본') || c.includes('면허')) {
    return '제출서류';
  }
  if (c.includes('규정') || c.includes('규칙')) return '규정';

  // 7) 제목으로 결재 양식 추정
  const fromTitle = inferApprovalCategoryFromTitle(t);
  if (fromTitle) return fromTitle;

  // 8) raw 가 알려진 결재 type 문자열이면 그대로(동적 양식 대비) — 단, 빈 값 제외
  if (c && c.length <= 40 && !c.includes('양식')) {
    // 너무 긴 값은 제목 오인 방지
    if (CATEGORY_SET.has(c)) return c;
    // 미등록 양식 type 도 폴더로 허용 (동적 카테고리)
    if (!/[<>{}]/.test(c) && !c.includes('\n')) return c;
  }

  return '기타';
}

function inferApprovalCategoryFromTitle(title: string): string | null {
  if (!title) return null;
  const rules: Array<[RegExp, string]> = [
    [/물품/, '물품신청'],
    [/수리/, '수리요청서'],
    [/연차\s*계획|사용계획/, '연차계획서'],
    [/연차|휴가/, '연차/휴가'],
    [/연장\s*근무/, '연장근무'],
    [/출결\s*정정/, '출결정정'],
    [/업무\s*기안/, '업무기안'],
    [/업무\s*협조/, '업무협조'],
    [/공문/, '공문발송'],
    [/보고서/, '보고서작성'],
    [/사직/, '사직서'],
    [/퇴직\s*서약/, '퇴직 서약서'],
    [/수습.*평가/, '수습직원평가서'],
    [/급여\s*인상/, '급여인상평가서'],
    [/계약\s*종료/, '계약종료 통보'],
    [/해고/, '해고통보'],
    [/징계/, '징계위원회 출석요구서'],
    [/인사\s*발령|인사\s*명령/, '인사명령'],
    [/근무표/, '근무표'],
    [/증명서\s*발급/, '증명서발급'],
  ];
  for (const [re, cat] of rules) {
    if (re.test(title)) return cat;
  }
  return null;
}

/**
 * 전자결재 문서 → 보관 분류 (양식별)
 */
export function resolveApprovalDocCategory(params: {
  type?: string | null;
  title?: string | null;
  formSlug?: string | null;
  formName?: string | null;
}): string {
  const type = String(params.type || '').trim();
  const title = String(params.title || '').trim();
  const formSlug = String(params.formSlug || '').trim();
  const formName = String(params.formName || '').trim();

  // 시스템 자동과 동일 폴더: 연차촉진
  if (
    type.includes('연차촉진') ||
    formSlug.includes('leave_promotion') ||
    formName.includes('연차촉진') ||
    title.includes('연차유급휴가 사용촉진') ||
    title.includes('연차사용촉진')
  ) {
    return '연차촉진';
  }

  if (formSlug && APPROVAL_SLUG_TO_CATEGORY[formSlug]) {
    return APPROVAL_SLUG_TO_CATEGORY[formSlug];
  }

  if (formName) {
    const n = normalizeDocCategory(formName, title);
    if (n !== '기타') return n;
    if (APPROVAL_TYPE_ALIASES[formName]) return APPROVAL_TYPE_ALIASES[formName];
  }

  if (type) {
    if (APPROVAL_TYPE_ALIASES[type]) return APPROVAL_TYPE_ALIASES[type];
    if (APPROVAL_SLUG_TO_CATEGORY[type]) return APPROVAL_SLUG_TO_CATEGORY[type];
    if (CATEGORY_SET.has(type)) return type;
    // 결재 type 이 곧 양식명인 경우가 많음
    const n = normalizeDocCategory(type, title);
    if (n !== '기타') return n;
    return type;
  }

  const fromTitle = inferApprovalCategoryFromTitle(title);
  if (fromTitle) return fromTitle;

  return '기타';
}

export function getDocCategoryMeta(id: string | null | undefined): DocRepoCategoryMeta {
  const normalized = normalizeDocCategory(id);
  const found = DOC_REPO_CATEGORIES.find((c) => c.id === normalized);
  if (found) return found;
  // 동적 결재 양식 폴더
  return {
    id: normalized,
    label: normalized,
    hint: '전자결재 보관',
    retention: '3년',
    security: '일반',
    immutable: true,
    group: normalized === '기타' || normalized === '규정' ? 'manual' : 'approval',
  };
}

export function getCategoriesByGroup(group: DocRepoCategoryGroup): DocRepoCategoryMeta[] {
  return DOC_REPO_CATEGORIES.filter((c) => c.group === group);
}

/** 목록에 실제 존재하는 id 까지 합쳐 폴더 구성 (동적 양식 대응) */
export function buildFolderCategories(presentIds: Iterable<string>): DocRepoCategoryMeta[] {
  const known = new Map(DOC_REPO_CATEGORIES.map((c) => [c.id, c]));
  const ordered: DocRepoCategoryMeta[] = [...DOC_REPO_CATEGORIES];
  for (const id of presentIds) {
    if (!id || known.has(id)) continue;
    const meta = getDocCategoryMeta(id);
    known.set(id, meta);
    ordered.push(meta);
  }
  return ordered;
}

export function extractRelatedStaffName(title?: string | null): string {
  const t = String(title || '').trim();
  if (!t) return '-';
  const dash = t.match(/[-–—]\s*([가-힣]{2,4})\s*$/);
  if (dash?.[1]) return dash[1];
  const contract = t.match(/^([가-힣]{2,4})\s+근로계약/);
  if (contract?.[1]) return contract[1];
  return '-';
}

export function isImmutableDocCategory(category?: string | null, title?: string | null): boolean {
  return getDocCategoryMeta(normalizeDocCategory(category, title)).immutable;
}

/** 하위 호환 — 예전 코드가 DOC_REPO_CATEGORY_IDS 를 참조할 수 있음 */
export const DOC_REPO_CATEGORY_IDS = DOC_REPO_CATEGORIES.map((c) => c.id);
export type DocRepoCategoryId = string;
