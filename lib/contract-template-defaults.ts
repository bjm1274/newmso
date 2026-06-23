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
  { key: '{{probation_start}}', desc: '수습 시작일', category: '계약' },
  { key: '{{probation_end}}', desc: '수습 종료일', category: '계약' },
  { key: '{{probation_percent}}', desc: '수습 급여 적용률(%)', category: '계약' },
  { key: '{{contract_type}}', desc: '고용형태(정규직/계약직)', category: '계약' },
  { key: '{{today}}', desc: '오늘 날짜', category: '계약' },
  { key: '{{base_salary}}', desc: '기본급 (원)', category: '임금' },
  { key: '{{position_allowance}}', desc: '직책수당', category: '임금' },
  { key: '{{meal_allowance}}', desc: '식대', category: '임금' },
  { key: '{{vehicle_allowance}}', desc: '자가운전보조금', category: '임금' },
  { key: '{{childcare_allowance}}', desc: '보육수당', category: '임금' },
  { key: '{{research_allowance}}', desc: '연구활동비', category: '임금' },
  { key: '{{other_taxfree}}', desc: '기타 비과세', category: '임금' },
  { key: '{{agreed_overtime_allowance}}', desc: '연장근로수당(약정)', category: '임금' },
  { key: '{{agreed_night_allowance}}', desc: '야간근로수당(약정)', category: '임금' },
  { key: '{{night_duty_allowance}}', desc: '야간당직수당(비과세)', category: '임금' },
  { key: '{{total_monthly}}', desc: '월 급여 합계', category: '임금' },
  { key: '{{total_salary}}', desc: '월 급여 합계', category: '임금' },
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
  { key: '{{payday}}', desc: '급여 지급일', category: '근무' },
];

const CONTRACT_TEMPLATE_BASE_UP_TO_ARTICLE_9 = `제1조 [계약의 목적]
본 계약은 사용자와 근로자 간의 근로조건을 명확히 정함으로써 상호 신뢰와 협력을 바탕으로 성실히 근로관계를 유지하는 것을 목적으로 한다.

제2조 [근로계약기간 및 수습]
① 근로자는 {{join_date}}부터 기간의 정함이 없는 근로계약을 체결한 것으로 한다.
② 신규 입사자의 경우 입사일로부터 3개월간을 수습기간으로 둘 수 있다. 사용자는 수습기간 중 근무태도, 업무수행능력, 자질, 건강상태, 조직 적응도 등을 종합적으로 평가할 수 있다.
③ 수습기간 중 또는 수습기간 만료 시 근로자가 담당업무 수행에 부적합하다고 객관적으로 판단되는 경우, 사용자는 관계 법령 및 취업규칙에 따라 본채용을 거부하거나 근로계약을 종료할 수 있다.

제3조 [근무장소 및 담당업무]
① 근로자의 근무장소는 {{company_name}} 내 사용자가 지정하는 장소로 한다. 다만, 업무상 필요가 있는 경우 사용자는 근로자와 협의하여 근무장소를 변경할 수 있다.
② 근로자의 주된 담당업무는 사용자가 지정한 직무로 하며, 회사 운영상 필요한 범위 내에서 부수 업무를 수행할 수 있다.
③ 사용자는 경영상 필요, 인력 운영, 직무 적합성 등을 고려하여 근로자와 협의 후 담당업무를 변경할 수 있다.
④ 근로자가 담당업무 수행에 필요한 면허, 자격, 보수교육 또는 법정교육 대상자인 경우 이를 유지·이수하여야 하며, 면허·자격의 정지, 취소, 상실 등 변동이 발생한 경우 즉시 사용자에게 알려야 한다.

제4조 [근로시간, 근무일 및 휴게시간]
① 근로자의 소정근로시간은 주 40시간, 1일 8시간을 원칙으로 한다.
② 기본 근무시간은 다음과 같다.

시업시각: {{shift_start}}
종업시각: {{shift_end}}
휴게시간: {{break_start}} ~ {{break_end}}
③ 근무일은 매주 {{working_days}}로 하고, 주휴일은 매주 {{weekly_holiday}}로 한다.
④ 회사 운영 특성상 교대근무, 토요일 근무, 공휴일 근무, 당직 또는 근무표에 따른 근무가 필요한 경우, 근로자는 사용자가 사전에 공지한 근무표에 따라 근무한다.
⑤ 휴게시간은 근로시간 도중에 부여하며, 근로자는 이를 자유롭게 이용한다. 다만, 회사 운영상 필요가 있는 경우 근로자와 협의하여 휴게시간을 분할 또는 변경할 수 있다.

제5조 [연장·야간·휴일근로]
① 사용자는 업무상 필요한 경우 근로자와 합의하여 관계 법령이 정하는 범위 내에서 연장·야간·휴일근로를 실시할 수 있다.
② 연장·야간·휴일근로가 발생한 경우 사용자는 근로기준법 등 관계 법령에 따라 가산수당을 지급한다.
③ 야간근로는 오후 10시부터 다음 날 오전 6시 사이의 근로를 말한다.
④ 연장·야간·휴일근로는 사전 승인 또는 회사가 정한 절차에 따라 실시하는 것을 원칙으로 한다.

제6조 [임금 및 구성항목]
① 근로자의 임금은 월급제로 하며, 월 임금의 구성항목은 다음과 같다.

기본급: 금 {{base_salary}}원
식대: 금 {{meal_allowance}}원
직책수당: 금 {{position_allowance}}원
자가운전보조금: 금 {{vehicle_allowance}}원
보육수당: 금 {{childcare_allowance}}원
연구활동비: 금 {{research_allowance}}원
기타수당: 금 {{other_taxfree}}원
연장근로수당(약정): 금 {{agreed_overtime_allowance}}원
야간근로수당(약정): 금 {{agreed_night_allowance}}원
야간당직수당: 금 {{night_duty_allowance}}원
합계(비과세 포함): 금 {{total_salary}}원
② 임금은 매월 1일부터 말일까지 산정하여 익월 {{payday}}일 근로자 명의의 계좌로 지급한다. 지급일이 휴일인 경우에는 전일 또는 익영업일에 지급할 수 있다.
③ 중도 입사 또는 중도 퇴사 시 해당 월의 실제 근무일수 또는 회사가 정한 합리적인 기준에 따라 일할 계산하여 지급한다.
④ 법령에 따른 세금, 4대보험료, 기타 법정 공제금은 임금에서 공제할 수 있다.

제7조 [사회보험 및 퇴직급여]
① 사용자는 관계 법령에 따라 국민연금, 건강보험, 고용보험, 산재보험 등 사회보험 가입 절차를 이행한다.
② 퇴직급여는 근로자 퇴직급여 보장법 및 회사의 퇴직급여제도 또는 퇴직연금규약에 따른다.

제8조 [휴일 및 휴가]
① 사용자는 근로자에게 주 1회 유급 주휴일을 부여한다.
② 근로자의 날 및 관계 법령에서 정한 공휴일은 유급휴일로 한다. 다만, 교대제 또는 근무표상 비번일과 공휴일이 겹치는 경우에는 관계 법령 및 취업규칙에 따른다.
③ 연차유급휴가는 근로기준법에서 정하는 바에 따라 부여하며, 근로자는 회사 운영에 중대한 지장이 없는 범위에서 자유롭게 사용할 수 있다.
④ 연차휴가 신청, 승인, 사용촉진 등 세부 절차는 관계 법령 및 취업규칙에 따른다.
⑤ 회사는 경영상 또는 진료 업무상 필요한 경우, 근로자대표와의 서면 합의에 따라 법정 공휴일을 특정 근무일과 대체하여 유급휴일로 부여할 수 있으며, 이 경우 대체된 공휴일 근무에 대해서는 별도의 휴일근로 가산수당을 지급하지 아니한다.

제9조 [개인정보 및 비밀유지]
① 근로자는 재직 중은 물론 퇴직 후에도 업무상 알게 된 회사의 경영정보, 인사정보, 고객정보, 거래처 정보, 기술정보 등 비밀을 제3자에게 누설하거나 부당하게 이용해서는 안 된다.
② 근로자는 개인정보, EMR 정보 또는 업무상 취득한 정보 등을 업무 목적 범위 내에서만 열람·사용하여야 한다.
③ 근로자는 환자정보 또는 회사 내부정보를 무단 열람, 촬영, 저장, 복사, 출력, 반출, 전송하거나 SNS·메신저·개인 이메일 등에 게시 또는 공유해서는 안 된다.
④ 근로자는 본인에게 부여된 전산계정, 비밀번호, 출입카드 등을 제3자에게 대여·공유해서는 안 되며, 분실 또는 유출 우려가 있는 경우 즉시 사용자에게 알려야 한다.`;

const CONTRACT_TEMPLATE_APPENDIX_FROM_ARTICLE_10 = `제10조 [지식재산권 및 정보의 귀속]
① "근로자"가 재직 기간 중 업무와 관련하여 취득·작성·개발한 일체의 기술 정보, 경영 자료, 데이터, 소스코드, 고객 명단 및 서류 등은 "회사"의 영업비밀이자 독점적 소유로 한다.
② "근로자"가 직무 수행 과정에서 발명, 고안, 저작 또는 개발한 일체의 결과물 및 물품(이하 '직무발명 등')에 대한 지식재산권(특허, 실용신안, 디자인, 상표, 저작권 등)을 취득할 수 있는 권리는 "회사"에 승계되거나 귀속되는 것으로 한다.
③ 제2항의 직무발명 등에 대한 승계 및 보상에 관한 구체적인 사항은 「발명진흥법」 및 "회사"의 직무발명보상규정(또는 취업규칙)이 정하는 바에 따른다.

제11조 [개인정보의 수집·이용에 대한 동의]
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

제12조 [퇴직 및 인수인계]
① 근로자가 개인 사정으로 사직하고자 할 때에는 사직하고자 하는 날로부터 최소 1개월 전에 사직서를 제출하여 사용자의 승인을 얻어야 한다.
② 근로자는 사직서 제출 후 퇴직일 전까지 후임자에게 담당 업무를 성실히 인수인계하여야 하며, 인수인계가 완료될 때까지 신의성실의 원칙에 따라 근무하여야 한다.
③ 근로자가 고의 또는 중대한 과실로 인수인계 의무를 소홀히 하여 회사에 손해를 끼친 경우, 관련 법령에 따라 손해배상 책임을 질 수 있다.
④ 퇴직에 따른 임금 및 퇴직금 등 일체의 금품은 퇴직일로부터 14일 이내에 지급함을 원칙으로 하되, 정산 지연 등 특별한 사정이 있는 경우 당사자 합의 하에 다음 급여 지급일까지 지급 기일을 연장할 수 있다.

제13조 [기타근로조건]
1. 계약기간 중 승진 등 신분상의 변동이나 기타 사유로 인해 근로조건이 변경되는 경우에는 계약을 갱신하기로 한다.
2. 근로자는 사용자가 업무상 제공하는 물품을 퇴사 시 반환하여야 하며, 반환하지 않을 경우 구입가의 실비를 사용자에게 지급하는 것에 동의한다.
3. 사용자와 근로자는 직장 내 괴롭힘이 발생하지 않도록 상호 존중하는 근무환경을 조성하기 위해 노력한다. 직장 내 괴롭힘이 발생한 경우 피해 근로자는 사용자에게 신고할 수 있으며, 사용자는 근로기준법 제76조의2 및 제76조의3에 따라 지체 없이 조사·조치한다. 신고를 이유로 한 불이익 처우는 금지된다.
4. 해고, 징계 등 불이익 처분은 정당한 이유가 있어야 하며, 해고의 경우 근로기준법 제26조에 따라 30일 전에 예고하거나 30일분 이상의 통상임금을 지급한다.

제14조 [준용 및 해석]
1. 본 계약서상에 명시되지 않은 사항은 취업규칙 및 관계법령에서 정한 바에 따른다.
2. 이 계약서의 해석을 달리하는 경우에는 사용자와 근로자가 상호 협의하는 바에 따르고, 협의가 원만히 이루어지지 않을 때에는 근로기준법 및 관계 법령이 정하는 바에 따른다.

제15조 [근로계약서 교부]
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

  if (!normalized.includes('지식재산권 및 정보의 귀속')) {
    return replaceFromArticle10(normalized);
  }

  if (!/제10조\s*\[/.test(normalized)) {
    return replaceFromArticle10(normalized);
  }

  // 퇴직 및 인수인계 조항이 없거나 구형 14조 교부 형태인 경우 강제 업그레이드
  if (
    normalized.includes('제10조 [재산보호 및 보험]') ||
    normalized.includes('제10조 [개인정보 동의]') ||
    !normalized.includes('퇴직 및 인수인계') ||
    (normalized.includes('제10조 [개인정보의 수집·이용에 대한 동의]') &&
      !normalized.includes('제15조 [근로계약서 교부]'))
  ) {
    return replaceFromArticle10(normalized);
  }

  return normalized;
};

export const hasInlineContractReceiptSection = (content?: string | null) =>
  /근로계약서를\s*교부\s*받았음을\s*확인합니다/.test(normalizeTemplate(content));
