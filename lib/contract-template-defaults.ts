'use client';

export type ContractTemplateVariable = {
  key: string;
  desc: string;
  category: string;
};

export const CONTRACT_TEMPLATE_VARIABLES: ContractTemplateVariable[] = [
  { key: '{{employee_name}}', desc: '직원 성명', category: '근로자' },
  { key: '{{employee_no}}', desc: '사번', category: '근로자' },
  { key: '{{department}}', desc: '부서', category: '근로자' },
  { key: '{{position}}', desc: '직위/직책', category: '근로자' },
  { key: '{{birth_date}}', desc: '생년월일', category: '근로자' },
  { key: '{{resident_no}}', desc: '주민등록번호', category: '근로자' },
  { key: '{{address}}', desc: '주소', category: '근로자' },
  { key: '{{employee_address}}', desc: '근로자 주소', category: '근로자' },
  { key: '{{phone}}', desc: '연락처', category: '근로자' },
  { key: '{{employee_phone}}', desc: '근로자 연락처', category: '근로자' },
  { key: '{{company_name}}', desc: '회사명', category: '사업자' },
  { key: '{{company_ceo}}', desc: '대표자명', category: '사업자' },
  { key: '{{representative_name}}', desc: '대표자명', category: '사업자' },
  { key: '{{company_business_no}}', desc: '사업자등록번호', category: '사업자' },
  { key: '{{company_business_number}}', desc: '사업자등록번호', category: '사업자' },
  { key: '{{company_address}}', desc: '회사 주소', category: '사업자' },
  { key: '{{company_phone}}', desc: '회사 연락처', category: '사업자' },
  { key: '{{join_date}}', desc: '입사일', category: '계약' },
  { key: '{{contract_start}}', desc: '계약 시작일', category: '계약' },
  { key: '{{contract_end}}', desc: '계약 종료일', category: '계약' },
  { key: '{{conditions_applied_at}}', desc: '근로조건 적용일', category: '계약' },
  { key: '{{probation_months}}', desc: '수습 기간(개월)', category: '계약' },
  { key: '{{contract_type}}', desc: '고용형태(정규직/계약직)', category: '계약' },
  { key: '{{today}}', desc: '오늘 날짜', category: '계약' },
  { key: '{{base_salary}}', desc: '기본급 (원)', category: '임금' },
  { key: '{{position_allowance}}', desc: '직책수당', category: '임금' },
  { key: '{{meal_allowance}}', desc: '식대', category: '임금' },
  { key: '{{vehicle_allowance}}', desc: '자가운전보조금', category: '임금' },
  { key: '{{childcare_allowance}}', desc: '보육수당', category: '임금' },
  { key: '{{research_allowance}}', desc: '연구활동비', category: '임금' },
  { key: '{{other_taxfree}}', desc: '기타 비과세', category: '임금' },
  { key: '{{total_monthly}}', desc: '월 급여 합계', category: '임금' },
  { key: '{{annual_salary}}', desc: '연봉', category: '임금' },
  { key: '{{hourly_wage}}', desc: '통상임금 시급', category: '임금' },
  { key: '{{monthly_work_hours}}', desc: '월 소정근로시간', category: '임금' },
  { key: '{{working_hours_per_week}}', desc: '주당 근로시간', category: '근무' },
  { key: '{{working_days_per_week}}', desc: '주당 근무일수', category: '근무' },
  { key: '{{working_days}}', desc: '근무 요일', category: '근무' },
  { key: '{{weekly_holiday}}', desc: '주휴일', category: '근무' },
  { key: '{{shift_start}}', desc: '출근 시간', category: '근무' },
  { key: '{{shift_end}}', desc: '퇴근 시간', category: '근무' },
  { key: '{{break_start}}', desc: '휴게 시작', category: '근무' },
  { key: '{{break_end}}', desc: '휴게 종료', category: '근무' },
  { key: '{{payment_day}}', desc: '급여 지급일', category: '근무' },
];

const CONTRACT_TEMPLATE_BASE_UP_TO_ARTICLE_9 = `제1조 [담당업무 및 근무장소]
1. 근로자는 사업장 및 사용자가 지정한 장소에서 근무한다.
2. 근무장소: {{company_name}} 내 지정 장소
3. 담당업무: {{department}} / {{position}}
4. 사용자는 업무의 필요성에 의하여 근로자의 근무장소 및 부서 또는 종사업무를 변경할 수 있다.

제2조 [근무기간]
1. 근로기간: {{contract_start}} ~ {{contract_end}}
2. 근로조건 적용일: {{conditions_applied_at}}
3. 수습기간: 입사일로부터 {{probation_months}}개월간 수습기간을 두며, 수습기간 중 임금은 본봉의 90%를 적용한다.
4. 수습기간 종료 후 업무능력 및 근무태도에 따라 정규직 전환 여부를 결정한다.

제3조 [수습기간]
1. 근로자의 입사일부터 {{probation_months}}개월 동안 수습기간을 둘 수 있다.
2. 수습기간 중 사용자는 근로자의 업무능력, 근무태도 등을 평가하며, 수습기간 만료 후 정규직 전환 여부를 결정한다.
3. 수습기간 중 근로계약을 해지할 경우 사용자는 근로자에게 사전 통보하여야 한다.

사용자 : {{company_ceo}}(인/서명)    근로자 : {{employee_name}}(인/서명)

제4조 [근무시간 및 휴게]
1. 소정 근로시간: 주 {{working_hours_per_week}}시간, 주 {{working_days_per_week}}일 근무
2. 근무시간: {{shift_start}} ~ {{shift_end}}
3. 휴게시간: {{break_start}} ~ {{break_end}} (근무시간 중 부여)
4. 휴일: 매주 토요일·일요일, 법정공휴일 및 회사가 지정한 날
5. 정규 업무시간 외 근무가 필요한 경우 사용자와 근로자 간 사전 합의 후 실시한다.

사용자 : {{company_ceo}}(인/서명)    근로자 : {{employee_name}}(인/서명)

제5조 [임금 및 구성항목]
1. 임금 구성은 아래와 같다.

[임금 구성항목 예시]
구성항목  금액  산정기준
기본급  {{base_salary}}원  월 고정 지급
────

2. 월 급여 합계: {{total_monthly}}원
3. 연봉 합계: {{annual_salary}}원
4. 통상임금 시급: {{hourly_wage}}원 (월 {{monthly_work_hours}}시간 기준)
5. 급여 지급일: 매월 {{payment_day}}일 이내 지급한다. (휴일인 경우 전 영업일 지급)
6. 급여 지급 방법: 근로자 명의 통장으로 계좌이체로 지급한다.
   가) 연장근무수당: 통상시급의 1.5배
   나) 야간근로수당: 오후 22:00 ~ 오전 06:00 사이 근무수당은 통상시급의 0.5배 가산
   다) 휴일근로수당: 통상시급의 1.5배 (8시간 초과분 2.0배)
   라) 임금 조정은 매년 1회 이상 이루어지며 최저임금보다 낮아질 수 없다.

제6조 [휴일 및 휴가]
1. 주휴일: 매주 1회 이상 유급휴일을 부여하되, 취업규칙에 정한 날로 한다.
2. 연차유급휴가: 근로기준법 제60조에 따라 1년간 80% 이상 출근 시 15일의 유급휴가를 부여한다.
3. 최초 1년 미만 근무자에게는 1개월 개근 시 1일의 유급휴가를 부여한다.
4. 미사용 연차는 연차수당으로 보상한다.

□ 유급휴일 확인    □ 연차 확인    □ 기타 휴가 확인

사용자 : {{company_ceo}}(인/서명)    근로자 : {{employee_name}}(인/서명)

제7조 [퇴직금]
1. 근로자는 1년 이상 근무 시 퇴직금을 청구할 수 있다. (근로자퇴직급여보장법에 의거)
2. 사용자는 근로자퇴직급여보장법에 따라 퇴직급여제도를 설정하고 이를 성실히 이행한다.
3. 퇴직금은 계속 근로기간 1년에 대하여 30일분의 평균임금을 기준으로 산정한다.
4. 사용자는 근로자에게 적합한 근로환경을 제공하여야 한다.

제8조 [근로계약 해지 사유]
1. 근로자가 1개월 전 사전 서면으로 통보하여 퇴직하게 되는 경우
2. 재해로 인한 부재인 경우 문의 또는 비위사실이 발견되었을 경우
3. 업무수행능력이 현저히 떨어지는 경우 및 업무불성실한 의지가 보이지 않는 경우
4. 무단결근·지각·조퇴 등이 빈번하거나 근무태도가 심히 불량한 경우
5. 기타 취업규칙에 정하는 사유가 발생한 경우
6. 사회통념 상 근로관계를 계속할 수 없는 사유가 발생한 경우

제9조 [손해배상]
다음 각 호에 해당하는 경우에는 근로자는 사용자에게 손해를 배상하여야 한다.
1. 근로자가 고의 또는 과실로 사용자에게 손해를 끼친 경우
2. 근로자가 재직 중 또는 퇴사 후에도 회사, 관련 회사 및 업무상 관계자에 대한 기밀, 정보를 누설한 경우
3. 근로자가 회사에 근무 중 얻은 비밀 정보나 지식을 이용하여 회사 및 관련 회사에 손해를 끼친 경우
4. 회사의 사적 수리 전에 퇴사함으로써 회사에 손해를 끼친 경우`;

const CONTRACT_TEMPLATE_APPENDIX_FROM_ARTICLE_10 = `제10조 [개인정보의 수집·이용에 대한 동의]
1. 정보의 수집·이용 목적
   - 당사의 인적자원관리, 노동법률 자문사 제공, 세무 사무대행 제공, 정부지원금 신청
2. 개인정보의 항목
   - 성명, 주민번호, 가족사항
   - 주소, 이메일, 휴대전화번호 등 연락처
   - 학력, 근무경력
   - 기타 근로와 관련된 개인정보
3. 보유 및 이용기간
   - 근로관계가 유지되는 기간
4. 사용자는 취득한 개인정보를 수집한 목적 범위 내에서 적합하게 처리하고 그 목적 외의 용도로 사용하지 않는다.
5. 근로자는 수집되는 개인정보의 항목과 개인정보의 수집 및 이용에 대한 내용을 충분히 확인하고, 미동의 시 제한되거나 불이익이 발생할 수 있음을 이해한 상태에서 동의 여부를 표시한다.

□ 동의    □ 동의하지 않음

제11조 [기타근로조건]
1. 계약기간 중 승진 등 신분상의 변동이나 기타 사유로 인해 근로조건이 변경되는 경우에는 계약을 갱신하기로 한다.
2. 근로자는 사용자가 업무상 제공하는 물품을 퇴사 시 반환하여야 하며, 반환하지 않을 경우 구입가의 실비를 사용자에게 지급하는 것에 동의한다.

제12조 [준용 및 해석]
1. 본 계약서상에 명시되지 않은 사항은 취업규칙 및 관계법령에서 정한 바에 따른다.
2. 이 계약서의 해석을 달리하는 경우에는 사용자와 근로자가 상호 협의하는 바에 따르고, 협의가 원만히 이루어지지 않을 때에는 사용자의 해석에 의한다.

제13조 [근로계약서 교부]
1. 이상과 같이 자유의사로서 근로계약을 체결하기에 상호 성실히 이행할 것을 약속하며 본 계약서를 2부 작성하여, 각 1부씩 보관한다.

※ 아래의 음영부분을 자료로 기재합니다.
근로계약서를 교부 받았음을 확인합니다.    근로자 __________________ (서명)
{{today}}
사용자 : {{company_ceo}}(인/서명)    근로자 : {{employee_name}}(인/서명)`;

export const DEFAULT_CONTRACT_TEMPLATE = `${CONTRACT_TEMPLATE_BASE_UP_TO_ARTICLE_9}

${CONTRACT_TEMPLATE_APPENDIX_FROM_ARTICLE_10}`;

const normalizeTemplate = (content?: string | null) =>
  String(content || '')
    .replace(/\r\n/g, '\n')
    .trim();

const replaceFromArticle10 = (content: string) => {
  const article10Index = content.search(/제10조\s*\[/);
  if (article10Index < 0) {
    return `${content.trim()}\n\n${CONTRACT_TEMPLATE_APPENDIX_FROM_ARTICLE_10}`;
  }
  return `${content.slice(0, article10Index).trim()}\n\n${CONTRACT_TEMPLATE_APPENDIX_FROM_ARTICLE_10}`;
};

export const upgradeLegacyContractTemplate = (content?: string | null) => {
  const normalized = normalizeTemplate(content);
  if (!normalized) return DEFAULT_CONTRACT_TEMPLATE;

  if (!/제10조\s*\[/.test(normalized)) {
    return replaceFromArticle10(normalized);
  }

  if (
    normalized.includes('제10조 [재산보호 및 보험]') ||
    normalized.includes('제10조 [개인정보 동의]') ||
    (normalized.includes('제10조 [개인정보의 수집·이용에 대한 동의]') &&
      !normalized.includes('제13조 [근로계약서 교부]'))
  ) {
    return replaceFromArticle10(normalized);
  }

  return normalized;
};

export const hasInlineContractReceiptSection = (content?: string | null) =>
  /근로계약서를\s*교부\s*받았음을\s*확인합니다/.test(normalizeTemplate(content));
