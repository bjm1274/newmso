/**
 * 간단한 HTML Sanitizer — 위험한 태그/속성을 제거하고 안전한 서식 태그만 유지합니다.
 * 외부 의존성 없이 정규식 기반으로 동작합니다.
 */

/** 콘텐츠와 함께 완전히 제거할 위험 태그 */
const DANGEROUS_TAGS_WITH_CONTENT = [
  'script', 'iframe', 'object', 'embed', 'applet',
  'form', 'link', 'meta', 'style', 'base',
  'noscript', 'template',
] as const;

/** 허용되는 안전 태그 목록 */
const SAFE_TAGS = new Set([
  'b', 'i', 'u', 'br', 'p', 'div', 'span',
  'table', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot',
  'caption', 'colgroup', 'col',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'strong', 'em', 'a', 'img', 'hr', 'pre', 'code',
  'blockquote', 'sub', 'sup',
]);

/** 허용되는 안전 속성 목록 */
const SAFE_ATTRS = new Set([
  'class', 'style', 'id',
  'colspan', 'rowspan', 'width', 'height',
  'align', 'valign', 'border',
  'cellpadding', 'cellspacing',
  'href', 'src', 'alt', 'title', 'target', 'rel',
]);

export function sanitizeHtml(dirty: string): string {
  let html = dirty;

  // 1) 위험 태그를 콘텐츠째 제거 (중첩 대응을 위해 반복)
  for (const tag of DANGEROUS_TAGS_WITH_CONTENT) {
    // 반복 제거로 중첩 <script><script>...</script></script> 처리
    let prev = '';
    while (prev !== html) {
      prev = html;
      html = html.replace(
        new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi'),
        '',
      );
    }
    // self-closing 또는 닫히지 않은 단독 태그 제거
    html = html.replace(new RegExp(`<${tag}[^>]*/?>`, 'gi'), '');
  }

  // 2) 허용되지 않은 태그 제거 (여는 태그/닫는 태그)
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*\/?>/gi, (match, tagName: string) => {
    if (SAFE_TAGS.has(tagName.toLowerCase())) {
      return match; // 허용 태그는 보존 (속성 정리는 아래에서)
    }
    return ''; // 비허용 태그 제거
  });

  // 3) 허용 태그 내에서 on* 이벤트 핸들러 속성 제거
  html = html.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/gi, (match, tagName: string, attrs: string) => {
    if (!SAFE_TAGS.has(tagName.toLowerCase())) return match;

    // on* 이벤트 속성 제거
    let cleanedAttrs = attrs.replace(
      /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi,
      '',
    );

    // 비허용 속성 제거
    cleanedAttrs = cleanedAttrs.replace(
      /\s+([a-zA-Z-]+)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/g,
      (attrMatch, attrName: string) => {
        const lowerAttr = attrName.toLowerCase();
        if (!SAFE_ATTRS.has(lowerAttr)) return '';
        return attrMatch;
      },
    );

    // href/src에서 javascript: 및 data: 프로토콜 제거
    cleanedAttrs = cleanedAttrs.replace(
      /(href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi,
      (attrMatch, attrName: string, dqVal?: string, sqVal?: string) => {
        const val = (dqVal ?? sqVal ?? '').trim().toLowerCase().replace(/\s+/g, '');
        if (val.startsWith('javascript:') || val.startsWith('data:')) {
          return '';
        }
        return attrMatch;
      },
    );

    return `<${tagName}${cleanedAttrs}>`;
  });

  // 4) HTML 주석 제거 (IE 조건부 주석 등 악용 방지)
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  return html;
}
