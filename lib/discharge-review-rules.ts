export type DischargeRuleStatus = 'ok' | 'review' | 'warning' | 'critical';

export interface DischargeRuleChecklistItem {
  key: string;
  label: string;
  status: DischargeRuleStatus;
  detail: string;
  basis: string;
}

export interface DischargeRuleIssue {
  key: string;
  category: 'missing' | 'overuse' | 'drg' | 'documentation' | 'quality';
  severity: Exclude<DischargeRuleStatus, 'ok'>;
  title: string;
  detail: string;
  basis: string;
}

export interface DischargeRuleSummary {
  critical: number;
  warning: number;
  review: number;
  missing: number;
  overuse: number;
}

export interface DischargeRuleAnalysis {
  checklist: DischargeRuleChecklistItem[];
  issues: DischargeRuleIssue[];
  summary: DischargeRuleSummary;
}

export interface DischargeRuleItemInput {
  id?: string;
  label?: string;
  code?: string;
  checked?: boolean;
}

export interface DischargeRuleInput {
  diagnosis?: string;
  surgeryName?: string;
  surgeryDate?: string;
  admissionDate?: string;
  dischargeDate?: string;
  dischargeType?: string;
  drgCode?: string;
  diseaseCodes?: string;
  chartData?: string;
  templateData?: string;
  allItems?: DischargeRuleItemInput[];
  checkedItems?: DischargeRuleItemInput[];
}

interface ParsedChartEntry {
  code: string;
  name: string;
  category: string;
  amount: number;
}

const QUALITY_CHECKLIST_BASIS =
  '보건복지부 건강보험요양급여비용의 내역 중 「의료의 질 향상을 위한 점검표」(PDF 825쪽)';

const DRG_CLASSIFICATION_BASIS =
  '보건복지부 질병군(DRG) 분류번호 결정요령 및 적용 제외/합병증 분류 기준 (PDF 869~878쪽)';

const PREOP_KEYWORDS = ['수술전', '수술 전', 'preop', 'pre-op', '검사', '마취'];
const ANESTHESIA_KEYWORDS = [
  '마취',
  'anesthesia',
  '전신마취',
  '부위마취',
  '국소마취',
  '척추마취',
];
const VITAL_KEYWORDS = [
  '혈압',
  'sbp',
  'dbp',
  '맥박',
  'pulse',
  '체온',
  'temperature',
  'v/s',
  'vital',
];
const UNSTABLE_KEYWORDS = [
  '저혈압',
  '고혈압',
  'sbp<85',
  'dbp<50',
  'dbp>110',
  'tachycardia',
  'bradycardia',
  '빈맥',
  '서맥',
  '38.3',
  '발열',
  '출혈',
  'bleeding',
  '감염',
  'infection',
];
const COMPLICATION_KEYWORDS = ['합병증', '부작용', '감염', 'infection'];
const COMPLICATION_TREATMENT_KEYWORDS = ['재수술', '처치', '배액', '절개', '수술', '시술', 'drainage'];
const INCIDENT_KEYWORDS = ['낙상', '수혈사고', '투약사고', '마취사고'];
const INFECTION_KEYWORDS = [
  '감염',
  'infection',
  '폐렴',
  '농성',
  '고름',
  'purulent',
  '농뇨',
  '배양',
  'culture',
  '균 분리',
  '안내염',
  'endophthalmitis',
];
const ABNORMAL_DISCHARGE_KEYWORDS = ['자의퇴원', '응급전원', '전원', '사망'];
const IMAGING_KEYWORDS = ['ct', 'mri', 'pet', '초음파', 'x-ray', 'xray', '촬영', '영상'];
const DRUG_KEYWORDS = ['주사', 'inj', 'injection', 'tablet', 'capsule', '약', '수액'];

const DRG_FAMILY_RULES = [
  {
    prefixes: ['C051', 'C052', 'C053', 'C054'],
    label: '안과계 수정체 수술',
    expectedKeywords: ['백내장', '수정체', '인공수정체', '유리체'],
  },
  {
    prefixes: ['D111'],
    label: '이비인후과계 편도/아데노이드 수술',
    expectedKeywords: ['편도', '아데노이드', '설편도'],
  },
  {
    prefixes: ['G081', 'G082', 'G083', 'G084'],
    label: '외과계 충수절제술',
    expectedKeywords: ['충수', 'append', '맹장'],
  },
  {
    prefixes: ['G095', 'G096', 'G097', 'G098'],
    label: '외과계 탈장수술',
    expectedKeywords: ['탈장', 'hernia', '허니아'],
  },
  {
    prefixes: ['G102', 'G104', 'G105', 'G106'],
    label: '외과계 항문수술',
    expectedKeywords: ['항문', '치핵', '치루', '직장'],
  },
  {
    prefixes: ['N041', 'N042', 'N045', 'N046', 'N047', 'N048'],
    label: '여성생식기계 수술',
    expectedKeywords: ['자궁', '난소', '부속기', '근종', 'hysterectomy'],
  },
  {
    prefixes: ['O016', 'O017'],
    label: '제왕절개분만',
    expectedKeywords: ['제왕절개', '분만', 'cesarean'],
  },
];

function normalize(value: unknown) {
  return String(value ?? '').trim().toLocaleLowerCase('ko-KR');
}

function hasAnyKeyword(haystack: string, keywords: string[]) {
  return keywords.some((keyword) => haystack.includes(normalize(keyword)));
}

function parseChartEntries(chartData?: string, allItems?: DischargeRuleItemInput[]): ParsedChartEntry[] {
  const entries: ParsedChartEntry[] = [];
  const lines = String(chartData ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const cols = line.split('\t');
    const code = String(cols[0] ?? '').trim();
    const name = String(cols[2] ?? cols[1] ?? '').trim();
    const category = String(cols[3] ?? '').trim();
    const amount = Number(String(cols[7] ?? cols[6] ?? '0').replace(/,/g, '')) || 0;
    if (name && name !== '#') {
      entries.push({ code, name, category, amount });
    }
  }

  for (const item of allItems ?? []) {
    const name = String(item.label ?? '').trim();
    if (!name) continue;
    entries.push({
      code: String(item.code ?? '').trim(),
      name,
      category: '',
      amount: 0,
    });
  }

  return entries;
}

function getStayDays(admissionDate?: string, dischargeDate?: string) {
  if (!admissionDate || !dischargeDate) return 0;
  const admission = new Date(admissionDate);
  const discharge = new Date(dischargeDate);
  const diff = Math.ceil((discharge.getTime() - admission.getTime()) / 86400000);
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

function formatUncheckedItems(items: DischargeRuleItemInput[]) {
  return items
    .slice(0, 5)
    .map((item) => `[${item.code || '-'}] ${item.label || '-'}`)
    .join(', ');
}

export function analyzeDischargeReviewRules(input: DischargeRuleInput): DischargeRuleAnalysis {
  const entries = parseChartEntries(input.chartData, input.allItems);
  const mergedText = normalize(
    [
      input.chartData,
      input.templateData,
      input.diagnosis,
      input.surgeryName,
      input.diseaseCodes,
      entries.map((entry) => `${entry.code} ${entry.name} ${entry.category}`).join(' '),
    ].join('\n')
  );

  const stayDays = getStayDays(input.admissionDate, input.dischargeDate);
  const issues: DischargeRuleIssue[] = [];
  const checklist: DischargeRuleChecklistItem[] = [];

  const allItems = input.allItems ?? [];
  const uncheckedItems = allItems.filter((item) => !item.checked);
  if (uncheckedItems.length > 0) {
    issues.push({
      key: 'missing-unchecked-items',
      category: 'missing',
      severity: uncheckedItems.length >= 5 ? 'warning' : 'review',
      title: `체크되지 않은 심사항목 ${uncheckedItems.length}건`,
      detail: `${formatUncheckedItems(uncheckedItems)}${uncheckedItems.length > 5 ? ' 외 추가 항목' : ''}`,
      basis: '현재 퇴원심사 체크리스트 및 기본 템플릿 비교 결과',
    });
  }

  const surgeryContext = Boolean(input.surgeryName || input.surgeryDate || input.drgCode);
  const hasPreopEvidence = hasAnyKeyword(mergedText, PREOP_KEYWORDS);
  const hasAnesthesiaEvidence = hasAnyKeyword(mergedText, ANESTHESIA_KEYWORDS);
  checklist.push({
    key: 'preop-anesthesia',
    label: '수술 전 검사 및 마취 기록',
    status: surgeryContext
      ? hasPreopEvidence && hasAnesthesiaEvidence
        ? 'ok'
        : hasPreopEvidence || hasAnesthesiaEvidence
          ? 'review'
          : 'warning'
      : 'ok',
    detail: surgeryContext
      ? hasPreopEvidence && hasAnesthesiaEvidence
        ? '수술/DRG 문맥에서 수술 전 검사 및 마취 관련 표현이 확인됩니다.'
        : '수술 또는 DRG가 있으나 수술 전 검사/마취 근거가 부족합니다.'
      : '수술 관련 문맥이 없어 필수 확인 대상이 아닙니다.',
    basis: QUALITY_CHECKLIST_BASIS,
  });
  if (surgeryContext && (!hasPreopEvidence || !hasAnesthesiaEvidence)) {
    issues.push({
      key: 'missing-preop-anesthesia',
      category: 'documentation',
      severity: 'warning',
      title: '수술 전 검사 또는 마취 근거 부족',
      detail: '수술명/DRG 코드가 있으나 수술 전 검사 시행 여부나 마취 종류를 차트에서 충분히 확인하지 못했습니다.',
      basis: QUALITY_CHECKLIST_BASIS,
    });
  }

  const incidentHit = hasAnyKeyword(mergedText, INCIDENT_KEYWORDS);
  checklist.push({
    key: 'inpatient-incidents',
    label: '입원 중 사고',
    status: incidentHit ? 'warning' : 'review',
    detail: incidentHit
      ? '낙상/수혈사고/투약사고/마취사고 관련 표현이 감지되었습니다.'
      : '사고 관련 표현은 없지만 점검표 기준으로 별도 확인이 필요합니다.',
    basis: QUALITY_CHECKLIST_BASIS,
  });
  if (incidentHit) {
    issues.push({
      key: 'incident-risk',
      category: 'quality',
      severity: 'warning',
      title: '입원 중 사고 기록 확인 필요',
      detail: '차트에 낙상 또는 의료사고 관련 표현이 있어 퇴원 전 점검표와 후속 조치 기록을 확인해야 합니다.',
      basis: QUALITY_CHECKLIST_BASIS,
    });
  }

  const complicationHit = hasAnyKeyword(mergedText, COMPLICATION_KEYWORDS);
  const complicationTreatmentHit = hasAnyKeyword(mergedText, COMPLICATION_TREATMENT_KEYWORDS);
  const infectionHit = hasAnyKeyword(mergedText, INFECTION_KEYWORDS);
  checklist.push({
    key: 'infection-monitoring',
    label: '입원 중 감염증',
    status: infectionHit ? 'warning' : 'review',
    detail: infectionHit
      ? '입원 중 감염 또는 배양/농성 분비물 관련 표현이 감지되었습니다.'
      : '감염증 표현은 뚜렷하지 않지만, 발열 지속·배양 양성·농성 배액 여부를 별도로 확인하는 것이 좋습니다.',
    basis: QUALITY_CHECKLIST_BASIS,
  });
  if (infectionHit) {
    issues.push({
      key: 'infection-risk',
      category: 'quality',
      severity: 'warning',
      title: '입원 중 감염증 검토 필요',
      detail: '감염, 배양 양성, 농성 배액 또는 안내염 관련 표현이 있어 추가 치료 및 DRG 적용 적정성을 함께 확인해야 합니다.',
      basis: QUALITY_CHECKLIST_BASIS,
    });
  }
  checklist.push({
    key: 'complication-followup',
    label: '감염·합병증 및 후속 처치',
    status: complicationHit
      ? complicationTreatmentHit
        ? 'review'
        : 'warning'
      : 'ok',
    detail: complicationHit
      ? complicationTreatmentHit
        ? '합병증/감염 표현과 후속 처치 문맥이 함께 보입니다.'
        : '합병증/감염 표현은 있으나 후속 처치 근거가 부족합니다.'
      : '특이 합병증/감염 표현이 보이지 않습니다.',
    basis: QUALITY_CHECKLIST_BASIS,
  });
  if (complicationHit) {
    issues.push({
      key: 'complication-risk',
      category: 'quality',
      severity: complicationTreatmentHit ? 'review' : 'warning',
      title: '합병증 또는 감염 관련 확인 필요',
      detail: complicationTreatmentHit
        ? '합병증/감염 표현이 있어 DRG 합병증 분류 및 후속 처치 적정성을 확인해야 합니다.'
        : '합병증/감염 표현이 있으나 후속 처치 또는 처방 근거가 부족해 보입니다.',
      basis: `${QUALITY_CHECKLIST_BASIS}; ${DRG_CLASSIFICATION_BASIS}`,
    });
  }

  const normalizedDischargeType = normalize(input.dischargeType);
  const dischargeChecklistExcluded = stayDays > 30;
  const abnormalDischarge =
    normalizedDischargeType &&
    normalizedDischargeType !== '정상퇴원' &&
    normalizedDischargeType !== '정상';
  const hasAbnormalReason = hasAnyKeyword(mergedText, ABNORMAL_DISCHARGE_KEYWORDS);
  checklist.push({
    key: 'discharge-type',
    label: '퇴원 유형 및 사유',
    status: dischargeChecklistExcluded ? 'review' : abnormalDischarge ? (hasAbnormalReason ? 'review' : 'warning') : 'ok',
    detail: dischargeChecklistExcluded
      ? `입원기간 ${stayDays}일로 30일 초과 입원에 해당해 점검표 작성 제외 대상입니다.`
      : abnormalDischarge
      ? hasAbnormalReason
        ? `비정상 퇴원(${input.dischargeType}) 사유 표현이 차트에 일부 확인됩니다.`
        : `비정상 퇴원(${input.dischargeType})인데 관련 사유 표현이 충분하지 않습니다.`
      : '정상 퇴원으로 입력되어 있습니다.',
    basis: QUALITY_CHECKLIST_BASIS,
  });
  if (!dischargeChecklistExcluded && abnormalDischarge && !hasAbnormalReason) {
    issues.push({
      key: 'abnormal-discharge-reason',
      category: 'documentation',
      severity: 'warning',
      title: '비정상 퇴원 사유 근거 부족',
      detail: '자의퇴원/전원/사망 등 비정상 퇴원은 차트와 퇴원기록에 사유가 분명해야 합니다.',
      basis: QUALITY_CHECKLIST_BASIS,
    });
  }

  const hasVitals = hasAnyKeyword(mergedText, VITAL_KEYWORDS);
  const unstableVitals = hasAnyKeyword(mergedText, UNSTABLE_KEYWORDS);
  checklist.push({
    key: 'discharge-stability',
    label: '퇴원 전 12시간 안정성',
    status: dischargeChecklistExcluded
      ? 'review'
      : abnormalDischarge
      ? 'review'
      : unstableVitals
        ? 'critical'
        : hasVitals
          ? 'ok'
          : 'review',
    detail: dischargeChecklistExcluded
      ? `입원기간 ${stayDays}일로 30일 초과 입원에 해당해 퇴원 전 점검표 적용 대상에서 제외됩니다.`
      : abnormalDischarge
      ? '비정상 퇴원은 별도 사유와 전원/사망 맥락을 함께 확인해야 합니다.'
      : unstableVitals
        ? '퇴원 직전 활력징후 불안정 또는 출혈/감염 관련 표현이 감지됩니다.'
        : hasVitals
          ? '퇴원 전 활력징후 또는 안정성 관련 표현이 확인됩니다.'
          : '퇴원 전 12시간 활력징후 확인 근거가 차트에서 충분하지 않습니다.',
    basis: QUALITY_CHECKLIST_BASIS,
  });
  if (!dischargeChecklistExcluded && !abnormalDischarge && unstableVitals) {
    issues.push({
      key: 'unstable-before-discharge',
      category: 'quality',
      severity: 'critical',
      title: '정상 퇴원 전 불안정 소견 가능성',
      detail: '정상 퇴원인데 활력징후 불안정, 출혈, 감염 관련 표현이 있어 퇴원 적정성을 재확인해야 합니다.',
      basis: QUALITY_CHECKLIST_BASIS,
    });
  } else if (!dischargeChecklistExcluded && !abnormalDischarge && !hasVitals) {
    issues.push({
      key: 'missing-vitals-before-discharge',
      category: 'documentation',
      severity: 'review',
      title: '퇴원 전 활력징후 근거 확인 필요',
      detail: '정상 퇴원이라면 퇴원 전 12시간 이내 혈압, 맥박, 체온, 수술부위 상태를 점검하는 것이 좋습니다.',
      basis: QUALITY_CHECKLIST_BASIS,
    });
  }

  const drgCode = String(input.drgCode ?? '').trim().toUpperCase();
  const drgFamilyRule = DRG_FAMILY_RULES.find((rule) => rule.prefixes.some((prefix) => drgCode.startsWith(prefix)));
  const otherFamilyHits = DRG_FAMILY_RULES
    .filter((rule) => rule !== drgFamilyRule)
    .filter((rule) => hasAnyKeyword(mergedText, rule.expectedKeywords));
  checklist.push({
    key: 'drg-match',
    label: 'DRG 코드 적합성',
    status: drgCode
      ? drgFamilyRule
        ? hasAnyKeyword(mergedText, drgFamilyRule.expectedKeywords)
          ? otherFamilyHits.length > 0
            ? 'review'
            : 'ok'
          : 'warning'
        : 'review'
      : 'review',
    detail: !drgCode
      ? 'DRG 코드가 입력되지 않았습니다.'
      : drgFamilyRule
        ? hasAnyKeyword(mergedText, drgFamilyRule.expectedKeywords)
          ? otherFamilyHits.length > 0
            ? `입력 DRG(${drgCode}) 문맥은 보이나 다른 질병군 문맥(${otherFamilyHits.map((rule) => rule.label).join(', ')})도 함께 확인됩니다.`
            : `입력 DRG(${drgCode})와 관련 시술/진단 문맥이 확인됩니다.`
          : `입력 DRG(${drgCode})와 일치하는 시술/진단 문맥이 충분하지 않습니다.`
        : `입력 DRG(${drgCode})는 현재 기본 규칙 목록에 없습니다.`,
    basis: DRG_CLASSIFICATION_BASIS,
  });
  if (drgCode && drgFamilyRule && !hasAnyKeyword(mergedText, drgFamilyRule.expectedKeywords)) {
    issues.push({
      key: 'drg-mismatch',
      category: 'drg',
      severity: 'warning',
      title: `DRG ${drgCode}와 차트 문맥 불일치 가능성`,
      detail: `${drgFamilyRule.label}에 기대되는 시술/진단 표현이 차트에서 충분히 보이지 않습니다.`,
      basis: DRG_CLASSIFICATION_BASIS,
    });
  }
  if (drgCode && otherFamilyHits.length > 0) {
    issues.push({
      key: 'drg-exclusion-risk',
      category: 'drg',
      severity: 'review',
      title: 'DRG 적용 제외 또는 다른 범주 우선 적용 가능성',
      detail: `현재 DRG 외에 ${otherFamilyHits.map((rule) => rule.label).join(', ')} 관련 문맥이 같이 보여 우선순위 또는 제외 기준 확인이 필요합니다.`,
      basis: DRG_CLASSIFICATION_BASIS,
    });
  }

  const duplicateCounts = new Map<string, { label: string; count: number }>();
  for (const entry of entries) {
    const key = normalize(entry.code || entry.name);
    if (!key) continue;
    const existing = duplicateCounts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      duplicateCounts.set(key, { label: entry.name || entry.code, count: 1 });
    }
  }
  const repeatedEntries = Array.from(duplicateCounts.values()).filter((entry) => entry.count >= 3);
  const repeatedImaging = entries.filter((entry) => hasAnyKeyword(normalize(`${entry.name} ${entry.category}`), IMAGING_KEYWORDS));
  const repeatedDrugs = entries.filter((entry) => hasAnyKeyword(normalize(`${entry.name} ${entry.category}`), DRUG_KEYWORDS));
  if (repeatedEntries.length > 0) {
    issues.push({
      key: 'duplicate-orders',
      category: 'overuse',
      severity: stayDays <= 3 ? 'warning' : 'review',
      title: '반복 청구 또는 중복 처방 가능성',
      detail: repeatedEntries
        .slice(0, 5)
        .map((entry) => `${entry.label} ${entry.count}회`)
        .join(', '),
      basis: '차트 항목 중 동일 코드/명칭의 반복 빈도 기반 점검',
    });
  }
  if (stayDays > 0 && stayDays <= 3 && repeatedImaging.length >= 3) {
    issues.push({
      key: 'high-imaging-density',
      category: 'overuse',
      severity: 'review',
      title: '짧은 입원 대비 영상검사 다수',
      detail: `${stayDays}일 입원 중 영상검사 계열 항목이 ${repeatedImaging.length}건 감지되었습니다.`,
      basis: '차트 항목 기반 반복 검사 밀도 점검',
    });
  }
  if (stayDays > 0 && stayDays <= 3 && repeatedDrugs.length >= 6) {
    issues.push({
      key: 'high-drug-density',
      category: 'overuse',
      severity: 'review',
      title: '짧은 입원 대비 투약/주사 항목 다수',
      detail: `${stayDays}일 입원 중 약제/주사 계열 항목이 ${repeatedDrugs.length}건 감지되었습니다.`,
      basis: '차트 항목 기반 반복 투약 밀도 점검',
    });
  }

  const summary: DischargeRuleSummary = {
    critical: issues.filter((issue) => issue.severity === 'critical').length,
    warning: issues.filter((issue) => issue.severity === 'warning').length,
    review: issues.filter((issue) => issue.severity === 'review').length,
    missing: issues.filter((issue) => issue.category === 'missing').length,
    overuse: issues.filter((issue) => issue.category === 'overuse').length,
  };

  return { checklist, issues, summary };
}

export function formatDischargeRuleAnalysisForPrompt(analysis: DischargeRuleAnalysis) {
  const issueLines = analysis.issues.length
    ? analysis.issues
        .map((issue) => `- [${issue.severity.toUpperCase()}][${issue.category}] ${issue.title}: ${issue.detail} (근거: ${issue.basis})`)
        .join('\n')
    : '- 명확한 규정 경고는 아직 탐지되지 않았습니다.';

  const checklistLines = analysis.checklist
    .map((item) => `- [${item.status.toUpperCase()}] ${item.label}: ${item.detail} (근거: ${item.basis})`)
    .join('\n');

  return `규정 기반 사전점검 요약
- Critical ${analysis.summary.critical}건
- Warning ${analysis.summary.warning}건
- Review ${analysis.summary.review}건
- Missing ${analysis.summary.missing}건
- Overuse ${analysis.summary.overuse}건

체크리스트
${checklistLines}

주요 경고
${issueLines}`;
}
