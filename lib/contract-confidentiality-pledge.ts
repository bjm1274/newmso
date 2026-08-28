// 비밀유지 서약서의 본문(조항·문구) 단일 소스.
// 관리자 미리보기(React: 계약문서/비밀유지서약서.tsx)와 직원 서명 PDF(전자서명모달.tsx)가
// 동일한 내용을 사용하도록 여기서 공유한다. (마무리블록의 contract-template-closing 패턴과 동일)

export type ConfidentialityPledgeClause = { title: string; body: string };

export const CONFIDENTIALITY_PLEDGE_CLAUSES: ConfidentialityPledgeClause[] = [
  {
    title: '제1조 [비밀정보의 범위]',
    body: '본인이 재직 중 알게 된 회사의 환자·고객 정보, 경영·재무 전략, 영업 비밀, 인사 정보, 의료·업무 프로세스 및 기타 회사가 비밀로 관리하는 일체의 정보를 비밀정보로 한다.' },
  {
    title: '제2조 [비밀유지 의무]',
    body: '본인은 회사의 사전 서면 승인 없이 비밀정보를 제3자에게 누설·제공하거나 업무 외의 목적으로 이용하지 아니한다.' },
  {
    title: '제3조 [자료의 반환]',
    body: '본인은 퇴직하거나 회사가 요청하는 경우, 비밀정보가 포함된 모든 문서·전자파일·저장매체 및 그 사본을 즉시 반환하거나 폐기한다.' },
  {
    title: '제4조 [유지 기간 및 책임]',
    body: '본 서약의 효력은 재직 기간은 물론 퇴직 후 3년간 유지되며, 위반 시 관계 법령(의료법, 개인정보 보호법 등) 및 회사 규정에 따른 민·형사상 책임을 진다. 특히 환자의 의료정보 또는 민감 개인정보를 무단 열람·유출하는 행위는 의료법 및 개인정보 보호법 위반으로 회사의 징계와 별개로 관련 법령에 따라 형사 처벌을 받을 수 있음을 충분히 인지한다.' },
];

// 도입 문구는 회사명을 가운데 굵게 표기하므로 앞/뒤로 나눠 공유한다.
export const CONFIDENTIALITY_PLEDGE_INTRO_PREFIX = '본인(이하 ‘서약자’)은 ';
export const CONFIDENTIALITY_PLEDGE_INTRO_SUFFIX =
  '(이하 ‘회사’)에 근무함에 있어, 업무상 알게 되는 회사 및 고객의 정보를 보호할 책임이 있음을 충분히 인지하고 다음과 같이 서약합니다.';
export const CONFIDENTIALITY_PLEDGE_AFFIRMATION =
  '위 내용을 충분히 이해하였으며, 이를 성실히 준수할 것을 서약합니다.';

export type ConfidentialityPledgePrintData = {
  companyName: string;
  employeeName: string;
  contractDate: string;
  signatureDataUrl?: string;
};

function escapeHTML(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 직원 서명 PDF(전자서명모달)에서 사용하는 비밀유지 서약서 인쇄 HTML.
 * 관리자 미리보기(React 컴포넌트)와 동일한 조항/문구를 출력한다.
 * 계약서 본문(서명·직인) 아래에 붙이지 않고 별도 페이지(뒷장)로 출력되므로
 * 상단 구분선/여백 없이 페이지 상단부터 시작한다. 페이지 분리는 호출부의 .contract-page 래퍼가 담당한다.
 */
export function buildConfidentialityPledgePrintHTML(opts: ConfidentialityPledgePrintData): string {
  const { companyName, employeeName, contractDate, signatureDataUrl } = opts;

  const signatureHTML = signatureDataUrl
    ? `<img src="${escapeHTML(signatureDataUrl)}" alt="서명" style="height:32px;object-fit:contain;vertical-align:middle;margin-left:10px;mix-blend-mode:multiply;" />`
    : `<span style="display:inline-block;min-width:120px;border-bottom:2px solid #cbd5e1;height:16px;vertical-align:middle;margin-left:10px;"></span><span style="font-size:11px;color:#94a3b8;margin-left:6px;">(서명)</span>`;

  const clausesHTML = CONFIDENTIALITY_PLEDGE_CLAUSES.map(
    (clause) => `
        <div style="margin-bottom:14px;">
          <p style="font-size:13.5px;font-weight:800;color:#0f172a;margin:0 0 5px 0;">${escapeHTML(clause.title)}</p>
          <p style="font-size:12.5px;color:#334155;line-height:1.8;margin:0;padding-left:12px;border-left:2px solid #e2e8f0;">${escapeHTML(clause.body)}</p>
        </div>`,
  ).join('');

  return `
      <div style="padding:28px 40px 40px;font-family:Pretendard, -apple-system, 'Noto Sans KR', sans-serif;">
        <div style="text-align:center;margin-bottom:22px;">
          <h2 style="font-family:Pretendard, -apple-system, 'Noto Sans KR', sans-serif;font-size:20px;font-weight:900;letter-spacing:0.15em;color:#0f172a;margin:0;">비 밀 유 지 서 약 서</h2>
        </div>
        <p style="font-size:13px;color:#334155;line-height:1.9;margin:0 0 18px 0;">${escapeHTML(CONFIDENTIALITY_PLEDGE_INTRO_PREFIX)}<span style="font-weight:700;color:#0f172a;">${escapeHTML(companyName || '회사')}</span>${escapeHTML(CONFIDENTIALITY_PLEDGE_INTRO_SUFFIX)}</p>
        <div>${clausesHTML}
        </div>
        <p style="margin:24px 0 0 0;text-align:center;font-size:13px;font-weight:700;color:#0f172a;">${escapeHTML(CONFIDENTIALITY_PLEDGE_AFFIRMATION)}</p>
        <p style="margin:18px 0 0 0;text-align:center;font-size:13px;font-weight:700;color:#0f172a;">${escapeHTML(contractDate)}</p>
        <div style="margin-top:18px;text-align:right;">
          <span style="font-size:11px;font-weight:700;color:#64748b;margin-right:8px;">[서약자]</span>
          <span style="font-weight:700;color:#0f172a;font-size:14px;">${escapeHTML(employeeName)}</span>${signatureHTML}
        </div>
      </div>
  `;
}
