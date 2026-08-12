import { NextRequest, NextResponse } from 'next/server';
import { canAccessBoard } from '@/lib/access-control';
import {
  createChatAttachmentUploadPlan,
  uploadToR2 } from '@/lib/object-storage';
import {
  normalizeSessionUser,
  readSessionFromRequest,
  resolveLatestSessionUser } from '@/lib/server-session';
import {
  DEFAULT_CONTENT_TYPE,
  guessUploadFileExtension,
  normalizeUploadFileName,
  normalizeUploadMimeType,
  toSafeObjectKeyExtension } from '@/lib/upload-mime';


import {
  MAX_FILE_SIZE_BYTES as SHARED_MAX_FILE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES as SHARED_MAX_VIDEO_SIZE_BYTES,
  MAX_FILE_SIZE_LABEL as SHARED_MAX_FILE_SIZE_LABEL,
  MAX_SERVER_RELAY_SIZE_BYTES,
  MAX_SERVER_RELAY_SIZE_LABEL as SHARED_MAX_SERVER_RELAY_SIZE_LABEL,
  MAX_VIDEO_SIZE_LABEL as SHARED_MAX_VIDEO_SIZE_LABEL } from '@/lib/upload-constants';
import {
  isRawUploadRequest,
  readRawUpload,
  readRawUploadMeta } from '@/lib/upload-raw-request';

export const dynamic = 'force-dynamic';

// 상한은 lib/upload-constants.ts 를 따른다. 예전에는 이 파일에 사본이 있어
// 클라이언트 안내 문구와 서버 검사가 따로 놀 수 있었다.
const MAX_FILE_SIZE_BYTES = SHARED_MAX_FILE_SIZE_BYTES;
const MAX_VIDEO_SIZE_BYTES = SHARED_MAX_VIDEO_SIZE_BYTES;
// 이미지에는 상한이 아예 없었다(아래 validateUploadTarget 주석 참고). 다른 종류와
// 같은 상한을 적용해 "무제한" 만 닫는다 — 지금 통과하는 파일은 그대로 통과한다.
const MAX_IMAGE_SIZE_BYTES = SHARED_MAX_FILE_SIZE_BYTES;
const R2_BUCKET = 'pchos-files';
// DEFAULT_CONTENT_TYPE·MIME_BY_EXTENSION·normalizeUploadMimeType 로컬 사본을 제거하고
// lib/upload-mime 정본을 쓴다(8차 D12-011). 사본은 정본과 17개 항목이 순서까지 같아
// 현재 동작 차이가 0 이었지만, 확장자를 추가할 때 게시판만 누락되는 구조였다.

type UploadPlanRequest = {
  boardType?: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
};

type UploadPlanResponse = {
  success: true;
  provider: 'r2';
  bucket: string;
  path: string;
  signedUrl: string;
  fileName: string;
  url: string;
  headers: Record<string, string>;
};

function buildSafeFilePath(fileName: string, mimeType: string): string {
  return `board/${Date.now()}_${crypto.randomUUID()}.${toSafeObjectKeyExtension(fileName, mimeType)}`;
}

function detectAttachmentType(fileName: string, mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';

  const ext = guessUploadFileExtension(fileName, mimeType);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'heic', 'heif'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'avi', 'wmv', 'webm', 'mkv', 'm4v'].includes(ext)) return 'video';
  return 'file';
}

function validateUploadTarget(fileName: string, mimeType: string, fileSize: number): void {
  if (!fileName.trim()) {
    throw new Error('업로드할 파일 이름이 없습니다.');
  }

  // 예전에는 여기서 이미지가 무조건 early return 이었다. 그래서 image/* 로만 신고하면
  // 크기 검사를 통째로 건너뛰었고, 서명 URL 플랜 경로에서는 서버가 본문을 아예 보지
  // 않으므로 그 신고값이 유일한 방어였다 — 즉 이미지는 상한이 없었다.
  if (mimeType.startsWith('image/')) {
    if (fileSize > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(`이미지 크기는 ${SHARED_MAX_FILE_SIZE_LABEL} 이하여야 합니다.`);
    }
    return;
  }

  if (mimeType.startsWith('video/')) {
    if (fileSize > MAX_VIDEO_SIZE_BYTES) {
      throw new Error(`동영상 크기는 ${SHARED_MAX_VIDEO_SIZE_LABEL} 이하여야 합니다.`);
    }
    return;
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error(`파일 크기는 ${SHARED_MAX_FILE_SIZE_LABEL} 이하여야 합니다.`);
  }
}

/** detectBoardUploadMimeType 이 보는 최대 바이트 수 (WebP 판정이 12바이트를 쓴다). */
const MAGIC_BYTE_PREFIX_LENGTH = 12;

const MAGIC_BYTE_VERIFIED_MIME_TYPES = new Set([
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
]);

function detectBoardUploadMimeType(buffer: ArrayBuffer): string | null {
  const bytes = new Uint8Array(buffer.slice(0, 12));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) return 'image/webp';
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf';
  }
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    return 'video/mp4';
  }
  return null;
}

function validateKnownFileContentType(mimeType: string, buffer: ArrayBuffer): void {
  if (!MAGIC_BYTE_VERIFIED_MIME_TYPES.has(mimeType)) return;
  if (detectBoardUploadMimeType(buffer) !== mimeType) {
    throw new Error('파일 형식이 올바르지 않습니다.');
  }
}

async function createSignedUploadPlan(payload: UploadPlanRequest): Promise<NextResponse> {
  const rawFileName = String(payload.fileName || '').trim();
  const mimeType = normalizeUploadMimeType(rawFileName, payload.mimeType || DEFAULT_CONTENT_TYPE);
  const fileName = normalizeUploadFileName(rawFileName, mimeType);
  const fileSize = Number(payload.fileSize || 0);

  // 서명 URL 플랜 경로에서 fileSize 는 클라이언트 신고값이고 서버는 본문을 보지 못한다.
  // 예전에는 이미지가 early return 이라 0·NaN·음수도 그대로 통과해 "신고를 안 하면
  // 무제한" 이 됐다. 최소한 신고 자체는 강제해, 상한 검사를 우회하려면 명시적으로
  // 거짓 값을 보내야 하도록 만든다(그 거짓은 아래 R2 실물 검증 과제로 남는다).
  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return NextResponse.json(
      { error: '업로드할 파일 크기(fileSize)가 필요합니다.' },
      { status: 400 },
    );
  }

  validateUploadTarget(fileName, mimeType, fileSize);

  const filePath = buildSafeFilePath(fileName, mimeType);
  const r2Plan = await createChatAttachmentUploadPlan(filePath, mimeType);
  if (!r2Plan) {
    return NextResponse.json(
      { error: 'Cloudflare R2 스토리지가 설정되지 않았습니다.' },
      { status: 503 },
    );
  }

  const response: UploadPlanResponse = {
    success: true,
    provider: 'r2',
    bucket: r2Plan.bucket,
    path: r2Plan.path,
    signedUrl: r2Plan.signedUrl,
    fileName,
    url: r2Plan.url,
    headers: r2Plan.headers };
  return NextResponse.json(response);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const latestUser = await resolveLatestSessionUser(normalizeSessionUser(session.user));
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const payload = (await request.json().catch(() => ({}))) as UploadPlanRequest;
      const boardType = String(payload.boardType || '').trim();

      if (!boardType) {
        return NextResponse.json({ error: 'boardType is required.' }, { status: 400 });
      }

      if (!canAccessBoard(latestUser, boardType, 'write')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }

      return await createSignedUploadPlan(payload);
    }

    // 본문이 이 워커를 통과하는 경로다. 상한은 첨부 상한(500MB)이 아니라
    // 우회 경로 상한을 따른다 — 예전에는 200MB 상수가 박혀 있으면서 오류 문구는
    // 첨부 상한을 말해, 거절 크기와 안내 문구가 서로 달랐다.
    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > MAX_SERVER_RELAY_SIZE_BYTES) {
      return NextResponse.json(
        { error: `앱 서버를 거쳐 올릴 수 있는 크기는 ${SHARED_MAX_SERVER_RELAY_SIZE_LABEL} 까지입니다.` },
        { status: 413 },
      );
    }

    // 본문을 그대로 실어 보내는 경로(application/octet-stream).
    // formData 파싱조차 파일 전체를 메모리에 올리므로, 큰 파일은 이쪽으로 받아
    // request.body 스트림을 R2 에 그대로 흘려보낸다.
    if (isRawUploadRequest(contentType)) {
      const boardType = readRawUploadMeta(request.headers, 'boardType');
      if (!boardType) {
        return NextResponse.json({ error: 'boardType is required.' }, { status: 400 });
      }
      if (!canAccessBoard(latestUser, boardType, 'write')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const raw = await readRawUpload(request, {
        contentLength,
        normalizeMimeType: normalizeUploadMimeType,
        normalizeFileName: normalizeUploadFileName,
        defaultContentType: DEFAULT_CONTENT_TYPE,
        validate: validateUploadTarget });
      if (!raw.ok) {
        return NextResponse.json({ error: raw.error }, { status: raw.status });
      }
      // 게시판만 추가로 매직바이트를 본다(채팅에는 이 검사가 없다).
      validateKnownFileContentType(raw.mimeType, raw.body);

      const rawPath = buildSafeFilePath(raw.fileName, raw.mimeType);
      const rawUploaded = await uploadToR2(R2_BUCKET, rawPath, raw.body, raw.mimeType);
      return NextResponse.json({
        success: true,
        provider: rawUploaded.provider,
        bucket: rawUploaded.bucket,
        path: rawUploaded.path,
        fileName: raw.fileName,
        type: detectAttachmentType(raw.fileName, raw.mimeType),
        url: rawUploaded.url });
    }

    const formData = await request.formData();
    const boardType = String(formData.get('boardType') || formData.get('boardId') || '').trim();
    const file = formData.get('file');

    if (!boardType) {
      return NextResponse.json({ error: 'boardType is required.' }, { status: 400 });
    }

    if (!canAccessBoard(latestUser, boardType, 'write')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }

    const rawFileName = String(file.name || '').trim();
    const mimeType = normalizeUploadMimeType(rawFileName, file.type || DEFAULT_CONTENT_TYPE);
    const normalizedFileName = normalizeUploadFileName(rawFileName, mimeType);
    validateUploadTarget(normalizedFileName, mimeType, file.size);

    const filePath = buildSafeFilePath(normalizedFileName, mimeType);
    // 파일 전체를 메모리에 올리지 않는다.
    //
    // 예전에는 `Buffer.from(await file.arrayBuffer())` 였다. formData 파싱본까지
    // 합쳐 파일 하나를 세 벌 들고 있었고, 77MB 짜리에서 워커 메모리 한도(128MB)를
    // 넘겨 요청이 통째로 죽었다 — 라우트가 응답을 못 내니 Cloudflare 가 5xx 를
    // 대신 돌려줬고, 화면에는 원인을 알 수 없는 HTTP 503 만 떴다.
    // 매직바이트 검사는 앞 12바이트만 있으면 된다.
    const headBuffer = await file.slice(0, MAGIC_BYTE_PREFIX_LENGTH).arrayBuffer();
    validateKnownFileContentType(mimeType, headBuffer);

    const uploaded = await uploadToR2(R2_BUCKET, filePath, file, mimeType);
    return NextResponse.json({
      success: true,
      provider: uploaded.provider,
      bucket: uploaded.bucket,
      path: uploaded.path,
      fileName: normalizedFileName,
      type: detectAttachmentType(normalizedFileName, mimeType),
      url: uploaded.url });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '게시판 첨부 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
