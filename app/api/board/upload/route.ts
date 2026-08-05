import { NextRequest, NextResponse } from 'next/server';
import { canAccessBoard } from '@/lib/access-control';
import {
  createChatAttachmentUploadPlan,
  uploadToR2 } from '@/lib/object-storage';
import {
  normalizeSessionUser,
  readSessionFromRequest,
  resolveLatestSessionUser } from '@/lib/server-session';


export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;
const MAX_VIDEO_SIZE_BYTES = 200 * 1024 * 1024;
// 이미지에는 상한이 아예 없었다(아래 validateUploadTarget 주석 참고). 다른 종류와
// 같은 상한을 적용해 "무제한" 만 닫는다 — 지금 통과하는 파일은 그대로 통과한다.
const MAX_IMAGE_SIZE_BYTES = 200 * 1024 * 1024;
const R2_BUCKET = 'pchos-files';
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const MIME_BY_EXTENSION: Record<string, string> = {
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

function guessFileExtension(fileName: string, mimeType: string): string {
  const rawName = String(fileName || '').trim();
  const lastDotIndex = rawName.lastIndexOf('.');
  if (lastDotIndex > -1 && lastDotIndex < rawName.length - 1) {
    return rawName.slice(lastDotIndex + 1).toLowerCase();
  }

  if (mimeType.includes('/')) {
    const guessed = mimeType.split('/')[1]?.toLowerCase();
    if (guessed) return guessed;
  }

  return 'bin';
}

function normalizeUploadMimeType(fileName: string, mimeType: string): string {
  const rawMimeType = String(mimeType || '').trim().toLowerCase();
  if (rawMimeType === 'image/jpg' || rawMimeType === 'image/pjpeg') return 'image/jpeg';
  if (rawMimeType === 'image/x-png') return 'image/png';
  if (rawMimeType && rawMimeType !== DEFAULT_CONTENT_TYPE) return rawMimeType;

  const ext = guessFileExtension(fileName, '');
  return MIME_BY_EXTENSION[ext] || rawMimeType || DEFAULT_CONTENT_TYPE;
}

function buildFallbackFileName(mimeType: string, ext: string): string {
  if (mimeType.startsWith('image/')) return `image.${ext}`;
  if (mimeType.startsWith('video/')) return `video.${ext}`;
  if (mimeType === 'application/pdf') return `document.${ext}`;
  return `attachment.${ext}`;
}

function normalizeUploadFileName(fileName: string, mimeType: string): string {
  const ext = guessFileExtension(fileName, mimeType);
  const rawName = String(fileName || '').trim() || buildFallbackFileName(mimeType, ext);
  const withoutPath = rawName.split(/[/\\]/).pop() || rawName;
  const sanitized = withoutPath
    .replace(/[\x00-\x1f<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return sanitized || buildFallbackFileName(mimeType, ext);
}

function buildSafeFilePath(fileName: string, mimeType: string): string {
  const ext = guessFileExtension(fileName, mimeType);
  const safeExt = /^[a-z0-9]+$/i.test(ext) ? ext.toLowerCase() : 'bin';
  return `board/${Date.now()}_${crypto.randomUUID()}.${safeExt}`;
}

function detectAttachmentType(fileName: string, mimeType: string): string {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';

  const ext = guessFileExtension(fileName, mimeType);
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
      throw new Error('이미지 크기는 200MB 이하여야 합니다.');
    }
    return;
  }

  if (mimeType.startsWith('video/')) {
    if (fileSize > MAX_VIDEO_SIZE_BYTES) {
      throw new Error('동영상 크기는 200MB 이하여야 합니다.');
    }
    return;
  }

  if (fileSize > MAX_FILE_SIZE_BYTES) {
    throw new Error('파일 크기는 200MB 이하여야 합니다.');
  }
}

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

    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > 209_715_200) {
      return NextResponse.json({ error: '파일 크기가 200MB를 초과합니다.' }, { status: 413 });
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
    const arrayBuffer = await file.arrayBuffer();
    validateKnownFileContentType(mimeType, arrayBuffer);

    const uploaded = await uploadToR2(R2_BUCKET, filePath, Buffer.from(arrayBuffer), mimeType);
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
