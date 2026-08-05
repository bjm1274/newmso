/**
 * 공통 파일 MIME 타입 유틸리티.
 *
 * 메신저 업로드 훅, 게시판 업로드, /api/chat/upload 라우트에서
 * 중복 정의되던 MIME 매핑을 단일 출처로 통합.
 */

export const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip' };

/**
 * 첨부로 허용하는 `application/*` MIME 화이트리스트.
 *
 * 예전에는 결재 첨부 라우트가 `ALLOWED_MIME_PREFIXES` 에 `'application/'` 을
 * 통째로 넣어 두고, 실행파일 3종(`x-msdownload`·`x-executable`·`x-sh`)만
 * 블랙리스트로 뺐다. 신고 MIME 만 보는 구조라 `application/x-msdos-program`,
 * `application/java-archive` 처럼 목록에 없는 이름을 쓰면 무엇이든 통과했다 —
 * 사실상 전 파일 허용이었다. 블랙리스트를 화이트리스트로 뒤집는다.
 */
export const ALLOWED_APPLICATION_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/rtf',
  'application/json',
  'application/xml',
  // 한글(HWP/HWPX) — 브라우저·OS 별로 보고 이름이 갈린다
  'application/haansofthwp',
  'application/x-hwp',
  'application/vnd.hancom.hwp',
  'application/vnd.hancom.hwpx',
  'application/hwp',
  // 브라우저가 확장자를 모르면(zip·hwp 등) octet-stream 으로 신고한다.
  // 이것까지 막으면 정상 첨부가 깨지므로 허용하되,
  // 아래 BLOCKED_UPLOAD_EXTENSIONS 로 실행 파일 확장자를 함께 거른다.
  'application/octet-stream',
]);

/**
 * 신고 MIME 과 무관하게 거부하는 확장자.
 *
 * MIME 은 클라이언트가 자유롭게 신고하는 값이라 화이트리스트만으로는
 * `.exe` 를 `application/octet-stream` 으로 신고하는 경우를 막지 못한다.
 */
export const BLOCKED_UPLOAD_EXTENSIONS: ReadonlySet<string> = new Set([
  'exe', 'com', 'bat', 'cmd', 'msi', 'msp', 'scr', 'pif', 'cpl', 'dll', 'sys',
  'jar', 'js', 'mjs', 'vbs', 'vbe', 'wsf', 'wsh', 'ps1', 'psm1', 'sh', 'bash',
  'app', 'apk', 'deb', 'rpm', 'dmg', 'lnk', 'reg', 'hta', 'jse',
]);

/** 파일명 확장자가 실행 파일 계열이면 true. */
export function hasBlockedUploadExtension(fileName: string): boolean {
  const ext = getFileNameExtension(fileName);
  return ext !== '' && BLOCKED_UPLOAD_EXTENSIONS.has(ext);
}

/**
 * File 객체에서 확장자를 추출 (소문자). 없으면 빈 문자열.
 * 클라이언트(브라우저) 환경에서 사용.
 */
export function getFileExtension(file: File): string {
  const rawName = String(file.name || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }
  return '';
}

/**
 * 파일명 문자열에서 확장자를 추출 (소문자). 없으면 빈 문자열.
 * 서버(Node) 환경에서 사용.
 */
export function getFileNameExtension(fileName: string): string {
  const rawName = String(fileName || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }
  return '';
}

/**
 * File 객체의 업로드용 Content-Type을 결정.
 * 브라우저가 잘못 보고한 MIME(image/jpg, image/pjpeg, image/x-png)을 정규화하고,
 * 미지정 시 확장자 매핑으로 보충.
 * 클라이언트(브라우저) 환경에서 사용.
 */
export function getUploadContentType(file: File): string {
  const rawMimeType = String(file.type || '').trim().toLowerCase();
  if (rawMimeType === 'image/jpg' || rawMimeType === 'image/pjpeg') return 'image/jpeg';
  if (rawMimeType === 'image/x-png') return 'image/png';
  if (rawMimeType && rawMimeType !== DEFAULT_CONTENT_TYPE) return rawMimeType;

  return MIME_BY_EXTENSION[getFileExtension(file)] || rawMimeType || DEFAULT_CONTENT_TYPE;
}

/**
 * 파일명 + MIME 문자열 기반 Content-Type 정규화.
 * route.ts 서버 환경에서 사용.
 */
export function normalizeUploadMimeType(fileName: string, mimeType: string): string {
  const rawMimeType = String(mimeType || '').trim().toLowerCase();
  if (rawMimeType === 'image/jpg' || rawMimeType === 'image/pjpeg') return 'image/jpeg';
  if (rawMimeType === 'image/x-png') return 'image/png';
  if (rawMimeType && rawMimeType !== DEFAULT_CONTENT_TYPE) return rawMimeType;

  const ext = getFileNameExtension(fileName);
  return MIME_BY_EXTENSION[ext] || rawMimeType || DEFAULT_CONTENT_TYPE;
}

/**
 * 파일명(우선) 또는 신고 MIME 에서 저장용 확장자를 추정. 판정 불가면 'bin'.
 *
 * 8차 D07-013·D12-011: 같은 목적의 사본이 chat/board/approvals 세 라우트에 있었고
 * MIME 폴백 규칙이 갈라져 있었다.
 *  - board 판: `mimeType.split('/')[1]` 을 그대로 확장자로 썼다 →
 *    'application/octet-stream' 이면 확장자가 'octet-stream',
 *    Office MIME 이면 'vnd.openxmlformats-...' 같은 문자열이 나온다.
 *  - chat 판: image/video 는 서브타입, pdf·text/plain 은 실제 확장자로 매핑하고
 *    나머지는 'bin'.
 * 정본은 chat 판이다 — 파일명에 붙일 수 있는 문자열만 돌려주기 때문이다.
 * (board 판이 만든 쓰레기 확장자는 오브젝트 키 생성 시 `/^[a-z0-9]+$/` 로 걸러져
 *  'bin' 이 됐지만, 폴백 **파일명**에는 'attachment.octet-stream' 처럼 그대로 남았다.)
 */
export function guessUploadFileExtension(fileName: string, mimeType: string): string {
  const fromName = getFileNameExtension(fileName);
  if (fromName) return fromName;

  const mime = String(mimeType || '').trim().toLowerCase();
  if (mime.startsWith('image/')) return mime.split('/')[1] || 'png';
  if (mime.startsWith('video/')) return mime.split('/')[1] || 'mp4';
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'text/plain') return 'txt';
  return 'bin';
}

/** 파일명이 비었을 때 쓸 대체 이름. */
export function buildUploadFallbackFileName(mimeType: string, ext: string): string {
  const mime = String(mimeType || '');
  if (mime.startsWith('image/')) return `image.${ext}`;
  if (mime.startsWith('video/')) return `video.${ext}`;
  if (mime === 'application/pdf') return `document.${ext}`;
  return `attachment.${ext}`;
}

/**
 * 저장·표시용 파일명 정규화(경로 제거 + 파일시스템 금지문자 제거).
 *
 * 8차 D07-013: chat/approvals 사본의 문자클래스가 `[ -<>:"/\|?*]` 였다.
 * 리터럴 공백으로 시작해 `' '`(0x20)~`'<'`(0x3C) **범위**로 해석되는 바람에
 * 숫자·마침표·하이픈·괄호가 전부 공백으로 치환되고, 정작 막아야 할
 * 제어문자(0x00-0x1F)는 통과했다. node 실측:
 *   '결산 2026-07.pdf' → 손상판 '결산 pdf' / 정본 '결산 2026-07.pdf'
 *   'a\x01b.txt'      → 손상판 'a\x01b txt'(제어문자 잔존) / 정본 'a b.txt'
 * board/upload 만 `[\x00-\x1f…]` 로 올발랐고 그쪽을 정본으로 삼는다.
 */
export function normalizeUploadFileName(fileName: string, mimeType: string): string {
  const ext = guessUploadFileExtension(fileName, mimeType);
  const rawName = String(fileName || '').trim() || buildUploadFallbackFileName(mimeType, ext);
  const withoutPath = rawName.split(/[/\\]/).pop() || rawName;
  const sanitized = withoutPath
    .replace(/[\x00-\x1f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || buildUploadFallbackFileName(mimeType, ext);
}

/** R2 오브젝트 키 확장자로 쓸 수 있게 정제(영숫자만, 아니면 'bin'). */
export function toSafeObjectKeyExtension(fileName: string, mimeType: string): string {
  const ext = guessUploadFileExtension(fileName, mimeType);
  return /^[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : 'bin';
}
