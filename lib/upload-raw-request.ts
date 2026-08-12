/**
 * 앱 서버를 거치는 업로드의 "원본 본문" 형식.
 *
 * multipart/form-data 로 받으면 `request.formData()` 가 파일 전체를 메모리에
 * 올린다. 거기에 R2 로 넘기려고 다시 복사하면 파일 하나를 두세 벌 들게 되고,
 * 워커 메모리 한도(128MB)를 넘긴 요청은 응답을 내지 못한 채 죽는다. 그러면
 * Cloudflare 가 대신 5xx 를 돌려주고, 화면에는 원인을 알 수 없는 503 만 뜬다.
 *
 * 그래서 큰 파일은 본문을 그대로 싣고 메타데이터만 헤더로 보낸다. 라우트는
 * `request.body`(ReadableStream)를 R2 에 그대로 흘려보내므로 파일 크기와
 * 무관하게 메모리를 거의 쓰지 않는다.
 *
 * 파일명은 한글·공백이 흔하므로 헤더에 넣을 때 반드시 encodeURIComponent 한다
 * (헤더는 latin-1 만 안전하다).
 */

export const RAW_UPLOAD_CONTENT_TYPE = 'application/octet-stream';
export const RAW_UPLOAD_FILE_NAME_HEADER = 'x-upload-file-name';
export const RAW_UPLOAD_MIME_TYPE_HEADER = 'x-upload-mime-type';
export const RAW_UPLOAD_META_HEADER_PREFIX = 'x-upload-meta-';

export function buildRawUploadHeaders(
  fileName: string,
  mimeType: string,
  meta: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': RAW_UPLOAD_CONTENT_TYPE,
    [RAW_UPLOAD_FILE_NAME_HEADER]: encodeURIComponent(fileName),
    [RAW_UPLOAD_MIME_TYPE_HEADER]: encodeURIComponent(mimeType) };
  for (const [key, value] of Object.entries(meta)) {
    if (value === undefined || value === null || value === '') continue;
    headers[`${RAW_UPLOAD_META_HEADER_PREFIX}${key}`] = encodeURIComponent(String(value));
  }
  return headers;
}

function decodeHeader(value: string | null): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    // 인코딩이 깨진 헤더는 원문 그대로 쓴다 — 던지면 업로드 전체가 실패한다.
    return value;
  }
}

export function isRawUploadRequest(contentType: string): boolean {
  const normalized = String(contentType || '').toLowerCase();
  if (!normalized) return false;
  return !normalized.includes('multipart/form-data') && !normalized.includes('application/json');
}

export function readRawUploadMeta(headers: Headers, key: string): string {
  return decodeHeader(headers.get(`${RAW_UPLOAD_META_HEADER_PREFIX}${key}`));
}

export function readRawUploadFileName(headers: Headers): string {
  return decodeHeader(headers.get(RAW_UPLOAD_FILE_NAME_HEADER));
}

export function readRawUploadMimeType(headers: Headers): string {
  return decodeHeader(headers.get(RAW_UPLOAD_MIME_TYPE_HEADER));
}

/**
 * 원본 본문 업로드의 공통 처리.
 *
 * 게시판·채팅 두 라우트가 같은 흐름을 글자 단위로 반복하고 있었다(파일명·MIME
 * 정규화 → 상한 검사 → 본문 1회 복사 → R2 업로드). 다른 것은 버킷·객체키 규칙과
 * 응답에 board 용 `type` 이 붙는지뿐이라, 그 둘만 인자로 받고 나머지를 모은다.
 *
 * 본문은 `arrayBuffer()` 로 **한 번만** 복사한다. request.body(스트림)를 R2
 * 바인딩에 그대로 넘기면 put 이 던지고(OpenNext 를 거친 본문은 네이티브 스트림이
 * 아니다), formData 로 받으면 파싱본까지 겹쳐 워커 메모리 한도를 넘긴다.
 */
export async function readRawUpload(
  request: Request,
  options: {
    contentLength: number;
    normalizeMimeType: (fileName: string, mimeType: string) => string;
    normalizeFileName: (fileName: string, mimeType: string) => string;
    defaultContentType: string;
    validate: (fileName: string, mimeType: string, size: number) => void;
  },
): Promise<
  | { ok: true; fileName: string; mimeType: string; body: ArrayBuffer }
  | { ok: false; error: string; status: number }
> {
  if (!request.body) {
    return { ok: false, error: '업로드할 파일이 없습니다.', status: 400 };
  }

  const rawName = readRawUploadFileName(request.headers);
  const mimeType = options.normalizeMimeType(
    rawName,
    readRawUploadMimeType(request.headers) || options.defaultContentType,
  );
  const fileName = options.normalizeFileName(rawName, mimeType);

  try {
    options.validate(fileName, mimeType, options.contentLength);
  } catch (error) {
    const message = error instanceof Error ? error.message : '업로드할 수 없는 파일입니다.';
    return { ok: false, error: message, status: 400 };
  }

  return { ok: true, fileName, mimeType, body: await request.arrayBuffer() };
}
