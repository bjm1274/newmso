/**
 * 저장소 콘텐츠 정책 — **앱 오리진에서 실행될 수 있는 형식**을 한곳에서 판정한다.
 *
 * 받는 쪽(업로드 5개 라우트)과 내보내는 쪽(`/api/storage/object`·`/api/download`)이
 * 같은 판정을 쓰게 하려고 여기로 모았다. 예전에는 판정 자체가 없었고, 나중에
 * 한쪽에만 넣으면 "진입점에 따라 다른 보안 정책" 이라는 이 저장소의 전형적
 * 실패를 반복한다.
 * (파일명·MIME 정규화 정본은 여전히 lib/upload-mime.ts 다. 실행 가능 형식 판정도
 *  최종적으로는 그쪽으로 합치는 것이 맞지만, 그 파일은 클라이언트 업로드 훅까지
 *  공유하므로 이번 범위에서는 건드리지 않았다.)
 *
 * 왜 필요한가:
 * 두 라우트 모두 R2 에 저장된 Content-Type 을 **앱 오리진(erp.pchos.kr)** 에서
 * 그대로 스트리밍한다(운영은 서명 URL 리다이렉트가 아니라 R2 바인딩 직통이다).
 * 저장 타입이 `text/html`·`image/svg+xml` 이면 그 응답은 앱 오리진의 **실행 가능한
 * 문서**가 되고, 모바일 게시판 '열기'(window.open)나 PC 의 이미지형 첨부
 * 앵커(`<a target="_blank">`)가 그것을 최상위 탭으로 연다 — 저장형 XSS 다.
 * 세션 쿠키는 httpOnly 라 탈취는 안 되지만, 동일 오리진 fetch 로 피해자 권한의
 * 결재 승인·인사/급여 API 를 그대로 호출할 수 있다.
 * `X-Content-Type-Options: nosniff` 는 스니핑만 막지 **선언된** text/html 의
 * 실행은 막지 못한다.
 *
 * 그래서 미리보기가 실제로 필요한 형식만 inline 으로 남기고, 나머지는
 * `application/octet-stream` + `Content-Disposition: attachment` 로 강제한다.
 * 미리보기 대상은 이미지(`<img>`)·동영상(`<video>`)·오디오·PDF·평문이며
 * 어느 것도 앱 오리진에서 스크립트를 실행하지 않는다.
 * SVG 는 이미지처럼 보이지만 `<script>` 를 담을 수 있어 프리픽스 허용에서 뺀다.
 */

const INLINE_SAFE_MIME_PREFIXES = ['image/', 'video/', 'audio/'];

const INLINE_SAFE_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'text/plain',
]);

const INLINE_BLOCKED_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/svg+xml',
  'image/svg',
]);

/**
 * 업로드 자체를 거절할 **실행 가능 웹 문서** 형식.
 *
 * 신고 MIME 은 클라이언트가 마음대로 정하므로 확장자도 함께 본다.
 * lib/upload-mime.ts 의 BLOCKED_UPLOAD_EXTENSIONS 는 실행파일(exe·vbs·…)만
 * 담고 있어 html·svg 가 빠져 있었다 — 결재 라우트의 화이트리스트
 * (`ALLOWED_MIME_PREFIXES` 에 `'text/'`, `'image/'` 프리픽스)도 `text/html` 과
 * `image/svg+xml` 을 그대로 통과시켰다.
 *
 * 범위를 여기까지만 좁힌 이유(운영 실측 2026-08-27):
 *  - board_posts·messages 첨부 전체에 html/htm/svg/xhtml 은 **0건** — 막아도
 *    막히는 정상 사용자가 없다.
 *  - 반대로 `.exe` 3건(게시판 IT 배포용 설치파일)·`.ai` 2건(채팅)은 실제로
 *    쓰이고 있어, 결재 라우트식 전면 화이트리스트를 게시판·채팅에 그대로
 *    옮기면 **지금 되는 업무가 막힌다.**
 *  - `.xml` 은 청구·EDI 로 쓰일 수 있어 업로드에서 막지 않는다. 서빙에서
 *    inline 대상이 아니므로(아래 화이트리스트에 없다) 앱 오리진에서 실행되지 않는다.
 */
const ACTIVE_CONTENT_MIME_TYPES: ReadonlySet<string> = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'image/svg',
]);

const ACTIVE_CONTENT_EXTENSIONS: ReadonlySet<string> = new Set([
  'html', 'htm', 'xhtml', 'xht', 'shtml', 'svg', 'svgz', 'mht', 'mhtml',
]);

/** 앱 오리진에서 스크립트가 실행될 수 있는 첨부(HTML·SVG 계열)인가. */
export function isActiveContentUpload(fileName: string, mimeType: string): boolean {
  const mime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  if (mime && ACTIVE_CONTENT_MIME_TYPES.has(mime)) return true;

  const name = String(fileName || '').trim();
  const lastDotIndex = name.lastIndexOf('.');
  const ext =
    lastDotIndex > -1 && lastDotIndex < name.length - 1
      ? name.slice(lastDotIndex + 1).toLowerCase()
      : '';
  return ext !== '' && ACTIVE_CONTENT_EXTENSIONS.has(ext);
}

/** 실행 가능 웹 문서 거절 시 사용자에게 보여 줄 문구. */
export const ACTIVE_CONTENT_UPLOAD_ERROR =
  '웹 문서(HTML·SVG) 형식은 첨부할 수 없습니다.';

/** 앱 오리진에서 그대로(inline) 내보내도 되는 Content-Type 인가. */
export function isInlineSafeContentType(rawContentType: string): boolean {
  const mime = String(rawContentType || '').split(';')[0].trim().toLowerCase();
  if (!mime) return false;
  if (INLINE_BLOCKED_MIME_TYPES.has(mime)) return false;
  if (INLINE_SAFE_MIME_TYPES.has(mime)) return true;
  return INLINE_SAFE_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

export function buildContentDispositionHeader(
  disposition: 'inline' | 'attachment',
  fileName: string,
): string {
  const normalized = String(fileName || '').trim() || 'download';
  const ascii = normalized.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(normalized);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * 응답 헤더 구성 — 바인딩 경로와 서명 URL 프록시 경로가 같은 정책을 쓰게 한다.
 * 예전에는 두 곳에 헤더 구성이 따로 있어 한쪽만 고치면 갈라졌다.
 */
export function buildObjectResponseHeaders(args: {
  storedContentType: string;
  cacheControl: string;
  download: boolean;
  fileName: string;
  contentLength?: string | null;
}): Record<string, string> {
  const inlineSafe = isInlineSafeContentType(args.storedContentType);
  const headers: Record<string, string> = {
    'Content-Type': inlineSafe ? args.storedContentType : 'application/octet-stream',
    'Cache-Control': args.cacheControl,
    'X-Content-Type-Options': 'nosniff' };
  if (args.contentLength) headers['Content-Length'] = args.contentLength;

  if (args.download || !inlineSafe) {
    // Content-Type 이 application/octet-stream + nosniff 이므로, 브라우저가
    // Content-Disposition 을 무시하더라도 문서로 렌더되지 않고 내려받기가 된다.
    // (CSP 를 추가로 얹을 수도 있으나, 다운로드 응답에서 CSP 가 어떻게 처리되는지는
    //  브라우저마다 갈려 운영 다운로드를 건드릴 위험이 있어 넣지 않았다.)
    headers['Content-Disposition'] = buildContentDispositionHeader('attachment', args.fileName);
  } else if (args.fileName) {
    // 모바일 게시판 '열기'는 download=1 없이 이 URL 을 새 탭으로 연다. 예전에는
    // Content-Disposition 이 아예 없어 브라우저가 URL 마지막 경로 조각인
    // 'object' 를 파일명으로 썼다(PC 는 같은 첨부를 원래 이름으로 받는다).
    // inline 은 유지한 채 이름만 실어 준다.
    headers['Content-Disposition'] = buildContentDispositionHeader('inline', args.fileName);
  }
  return headers;
}
