const CLOSING_LINE_PATTERNS: RegExp[] = [
  // 회사/사용자 식별 라벨 (다양한 한국어 표기)
  /^회사\s*명\s*[:：]/,
  /^사업체\s*명\s*[:：]/,
  /^사업장\s*명\s*[:：]/,
  /^상\s*호\s*[:：]/,
  /^법인\s*명\s*[:：]/,
  /^사용자\s*명\s*[:：]/,
  /^사업\s*자\s*명\s*[:：]/,
  // 근로자 식별 라벨
  /^성\s*명\s*[:：]/,
  /^근로자\s*명\s*[:：]/,
  /^근로자\s*성\s*명\s*[:：]/,
  /^직원\s*명\s*[:：]/,
  // 주소
  /^주\s*소\s*[:：]/,
  /^소\s*재\s*지\s*[:：]/,
  /^사업장\s*주소\s*[:：]/,
  /^회사\s*주소\s*[:：]/,
  // 대표/직책
  /^대표\s*자\s*[:：]/,
  /^대표\s*자\s*명\s*[:：]/,
  /^대\s*표\s*[:：]/,
  /^대표\s*이사\s*[:：]/,
  /^대표\s*원장\s*[:：]/,
  /^원\s*장\s*[:：]/,
  /^이사\s*장\s*[:：]/,
  // 연락처
  /^연\s*락\s*처\s*[:：]/,
  /^전\s*화\s*[:：]/,
  /^전\s*화\s*번호\s*[:：]/,
  /^대표\s*전화\s*[:：]/,
  /^팩\s*스\s*[:：]/i,
  /^Fax\s*[:：]/i,
  // 사업자 번호
  /^사업자\s*등록\s*번호\s*[:：]/,
  /^사업자\s*번호\s*[:：]/,
  /^등록\s*번호\s*[:：]/,
  // 서명/날인
  /^서\s*명\s*또는\s*날인\s*[:：]?/,
  /^서\s*명\s*\/\s*날인\s*[:：]?/,
  // 수량자 `{3,}` 의 콤마가 공백으로 바뀐 일괄 치환 사고(8차 D04-002)로 `{3 }` 는
  // 수량자가 아니라 리터럴 "{3 }" 로 해석돼 밑줄 서명란을 한 번도 매칭하지 못했다.
  /^서\s*명\s*[:：]?\s*_{3,}/,
  /^날\s*인\s*[:：]?/,
  /^서명\s*\(인\)/,
  // 교부 확인 / 안내
  /^근로계약서\s*교부\s*확인\s*$/,
  /^계약서\s*교부\s*확인\s*$/,
  /^본인은\s*본\s*근로계약서/,
  /^본인은\s*본\s*계약서/,
  /^근로계약서를\s*교부\s*받았음/,
  /^본\s*근로계약서를\s*교부/,
  // 날짜
  /^계약\s*체결일\s*[:：]/,
  /^체\s*결\s*일\s*[:：]/,
  /^계약\s*일\s*[:：]/,
  /^발\s*효\s*일\s*[:：]/,
  // 인라인 사용자/근로자 서명 라인
  /^사용자\s*[:：].*\(인\s*\/\s*서명\)/,
  /^근로자\s*[:：].*\(인\s*\/\s*서명\)/,
  /^아래의\s*음영부분/,
  /^※/,
];

function isClosingLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^_{3,}$/.test(t)) return true;
  return CLOSING_LINE_PATTERNS.some((re) => re.test(t));
}

// 본문에 등장할 일이 거의 없는 닫힘 블록 시작 후보(앵커).
// 이 패턴 중 가장 앞쪽 등장을 찾으면, 그 라인부터 텍스트 끝까지 한꺼번에 잘라낸다.
const ANCHOR_LINE_PATTERNS: RegExp[] = [
  /^회사\s*명\s*[:：]/,
  /^사업체\s*명\s*[:：]/,
  /^사업장\s*명\s*[:：]/,
  /^상\s*호\s*[:：]/,
  /^법인\s*명\s*[:：]/,
  /^사용자\s*명\s*[:：]/,
  /^근로계약서\s*교부\s*확인\s*$/,
  /^계약서\s*교부\s*확인\s*$/,
  /^본인은\s*본\s*근로계약서/,
  /^본인은\s*본\s*계약서/,
  /^근로계약서를\s*교부\s*받았음/,
  /^본\s*근로계약서를\s*교부/,
  /^아래의\s*음영부분/,
];

const CLOSING_TITLE_KEYWORDS = /교부|체결|기명|날인|상호\s*협의|서약/;
const ITEM_MARK_PATTERN = /^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫]|[1-9]\d?[.)]\s*|[가-하][).]\s*|[가-하]호)/;

// 마지막 조항 제목에 '교부/체결/기명/날인' 같은 키워드가 있으면 그 조항 본문은
// 항목 마크(①②/1./가)) 이후를 모두 닫힘 블록으로 간주하고 잘라낸다.
function findLastArticleClosingCutoff(lines: string[]): number {
  const articleLineRe = /^제\s*\d+\s*조\s*\[([^\]]+)\]/;
  let lastArticleLine = -1;
  let lastArticleTitle = '';
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const m = articleLineRe.exec(t);
    if (m) {
      lastArticleLine = i;
      lastArticleTitle = m[1];
    }
  }
  if (lastArticleLine < 0) return -1;
  if (!CLOSING_TITLE_KEYWORDS.test(lastArticleTitle)) return -1;

  let lastMarkLine = -1;
  for (let i = lastArticleLine + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (ITEM_MARK_PATTERN.test(t)) lastMarkLine = i;
  }
  if (lastMarkLine < 0) return -1;

  return lastMarkLine + 1;
}

export type StripClosingResult = {
  mainText: string;
  hasClosing: boolean;
};

export function stripContractClosingLines(text: string): StripClosingResult {
  if (!text) return { mainText: '', hasClosing: false };
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  const cutoffCandidates: number[] = [];

  // 1차: 마지막 조항 제목이 '교부/체결/날인' 류면 본문 마크 이후 컷오프.
  const articleCutoff = findLastArticleClosingCutoff(lines);
  if (articleCutoff > 0) cutoffCandidates.push(articleCutoff);

  // 2차: 회사/교부 안내 등 앵커 라인의 첫 등장 컷오프.
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    if (ANCHOR_LINE_PATTERNS.some((re) => re.test(t))) {
      cutoffCandidates.push(i);
      break;
    }
  }

  if (cutoffCandidates.length > 0) {
    let cutoff = Math.min(...cutoffCandidates);
    while (cutoff > 0 && !lines[cutoff - 1].trim()) cutoff--;
    return {
      mainText: lines.slice(0, cutoff).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd(),
      hasClosing: true };
  }

  // 3차 폴백: 마지막부터 역방향으로 닫힘 라인을 걷어낸다.
  let cutoff = lines.length;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) {
      cutoff = i;
      continue;
    }
    if (isClosingLine(t)) {
      cutoff = i;
      continue;
    }
    break;
  }

  return {
    mainText: lines.slice(0, cutoff).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd(),
    hasClosing: cutoff < lines.length };
}

export type ContractClosingData = {
  companyName: string;
  companyAddress?: string;
  companyCeo?: string;
  companyPhone?: string;
  companyBusinessNo?: string;
  sealUrl?: string | null;
  employeeName: string;
  employeeAddress?: string;
  employeePhone?: string;
  contractDate: string;
  signatureDataUrl?: string;
  /** 교부확인란에 자필로 작성된 '교부 받음' 이미지(dataURL). */
  receiptTraceDataUrl?: string;
};

function escapeHTML(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildClosingPrintHTML(opts: ContractClosingData): string {
  const {
    companyName,
    companyAddress,
    companyCeo,
    companyPhone,
    companyBusinessNo,
    sealUrl,
    employeeName,
    employeeAddress,
    employeePhone,
    contractDate,
    signatureDataUrl,
    receiptTraceDataUrl } = opts;

  // 직인은 실 이미지만 표시(원형 테두리 제거). 회사명 끝 글자에 살짝 겹쳐 위조 방지.
  const sealHTML = sealUrl
    ? `<img src="${escapeHTML(sealUrl)}" alt="직인" style="width:46px;height:46px;object-fit:contain;vertical-align:middle;margin-left:-14px;mix-blend-mode:multiply;position:relative;z-index:2;" />`
    : `<span style="display:inline-block;margin-left:8px;color:#c0392b;font-weight:bold;font-size:11px;">( 인 )</span>`;

  const signatureHTML = signatureDataUrl
    ? `<img src="${escapeHTML(signatureDataUrl)}" alt="서명" style="height:34px;object-fit:contain;vertical-align:middle;" />`
    : `<span style="display:inline-block;min-width:140px;border-bottom:1px solid #333;height:32px;vertical-align:bottom;"></span>`;

  // 교부확인: 자필로 작성된 이미지가 있으면 표시, 없으면 따라쓰기 안내 문구.
  const receiptHTML = receiptTraceDataUrl
    ? `<img src="${escapeHTML(receiptTraceDataUrl)}" alt="교부확인 자필" style="height:34px;object-fit:contain;vertical-align:middle;mix-blend-mode:multiply;" />`
    : `<div style="font-size:17px;font-weight:700;letter-spacing:0.3em;color:#cbd5e1;">교부 받음</div><div style="font-size:9px;color:#9ca3af;margin-top:2px;">위 글자를 따라 자필로 적어 주세요</div>`;

  const row = (label: string, value?: string, suffix = '') => {
    if (!value && !suffix) return '';
    return `<tr><td style="padding:5px 10px;background:#f3f4f6;color:#6b7280;font-weight:600;width:88px;white-space:nowrap;">${label}</td><td style="padding:5px 10px;color:#111827;">${escapeHTML(value ?? '')}${suffix}</td></tr>`;
  };

  return `
<div style="margin-top:20px;font-family:'Noto Sans KR', sans-serif;page-break-inside:avoid;break-inside:avoid;">
  <div style="text-align:center;margin-bottom:10px;">
    <p style="margin:0;font-size:13px;color:#6b7280;">계약 체결일: <span style="font-weight:700;color:#111827;">${escapeHTML(contractDate)}</span></p>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
    <div style="border:1px solid #d1d5db;border-radius:10px;overflow:hidden;">
      <div style="background:#1f2937;color:#fff;padding:8px 12px;font-weight:800;letter-spacing:0.18em;font-size:11px;text-align:center;">사 용 자</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        ${row('회사명', companyBusinessNo ? `${companyName ?? ''} (${companyBusinessNo})`.trim() : companyName)}
        ${row('소재지', companyAddress)}
        ${row('연락처', companyPhone)}
        ${row('대표자', companyCeo, sealHTML)}
      </table>
    </div>
    <div style="border:1px solid #bfdbfe;border-radius:10px;overflow:hidden;">
      <div style="background:#2563eb;color:#fff;padding:8px 12px;font-weight:800;letter-spacing:0.18em;font-size:11px;text-align:center;">근 로 자</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        ${row('성명', employeeName)}
        ${row('주소', employeeAddress)}
        ${row('연락처', employeePhone)}
        <tr><td style="padding:5px 10px;background:#eff6ff;color:#1d4ed8;font-weight:600;width:88px;white-space:nowrap;">서명</td><td style="padding:5px 10px;">${signatureHTML}</td></tr>
        <tr><td style="padding:5px 10px;background:#eff6ff;color:#1d4ed8;font-weight:600;width:88px;white-space:nowrap;vertical-align:middle;">교부확인</td><td style="padding:8px 10px;text-align:center;">${receiptHTML}</td></tr>
      </table>
    </div>
  </div>
</div>
`;
}
