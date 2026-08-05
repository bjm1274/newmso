import { NextRequest, NextResponse } from 'next/server';
import { createChatAttachmentUploadPlan } from '@/lib/object-storage';
import {
  normalizeSessionUser,
  readSessionFromRequest,
  resolveLatestSessionUser } from '@/lib/server-session';
// 8차 D12-011: `normalizeMime` 축약 사본 + 확장자 정제 인라인 사본을 lib/upload-mime 정본으로 교체.
// 사본은 확장자→MIME 보충이 없어 mimeType 미전송 시 항상 octet-stream 이었다.
// 신고 MIME 도 파일명도 모두 클라이언트가 정하는 값이라 신뢰 수준은 같고,
// 확장자 매핑 결과는 아래 ALLOWED_MIMES 화이트리스트를 그대로 통과해야 한다.
import { normalizeUploadMimeType, toSafeObjectKeyExtension } from '@/lib/upload-mime';

/**
 * POST /api/submission/upload
 *
 * 직원 서류 제출 presigned URL 발급 (본인만 허용).
 * JM3: MIME 비허용·파일 크기 초과·인증 실패 각각 명시.
 * JM5: session.user.id === 업로더(본인), 민감 의료 정보 로그 미포함.
 */

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB (서류 특성상 보수적)
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'application/pdf',
]);

const VALID_SUBMISSION_TYPES = new Set([
  '재직증명서',
  '경력증명서',
  '근로계약서',
  '급여명세서',
  '재직확인서',
  '기타',
]);

type SubmissionUploadRequest = {
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  submissionType?: string;
};

function buildFilePath(fileName: string, mime: string): string {
  return `submission/${Date.now()}_${crypto.randomUUID()}.${toSafeObjectKeyExtension(fileName, mime)}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await resolveLatestSessionUser(normalizeSessionUser(session.user));

    const body = (await request.json().catch(() => ({}))) as SubmissionUploadRequest;
    const rawFileName = String(body.fileName || '').trim();
    const mime = normalizeUploadMimeType(rawFileName, body.mimeType ?? '');
    const fileSize = Number(body.fileSize ?? 0);
    const submissionType = String(body.submissionType || '').trim();

    if (!rawFileName) {
      return NextResponse.json({ error: '파일명이 필요합니다.' }, { status: 400 });
    }
    if (submissionType && !VALID_SUBMISSION_TYPES.has(submissionType)) {
      return NextResponse.json(
        { error: `허용되지 않는 서류 종류입니다: ${submissionType}` },
        { status: 400 },
      );
    }
    if (!ALLOWED_MIMES.has(mime)) {
      return NextResponse.json(
        { error: `허용되지 않는 파일 형식입니다. 이미지(JPEG·PNG·WEBP·HEIC) 또는 PDF만 가능합니다.` },
        { status: 415 },
      );
    }
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: '파일 크기는 200MB 이하여야 합니다.' },
        { status: 413 },
      );
    }

    const filePath = buildFilePath(rawFileName, mime);
    const plan = await createChatAttachmentUploadPlan(filePath, mime);
    if (!plan) {
      return NextResponse.json(
        { error: 'Cloudflare R2 스토리지가 설정되지 않았습니다.' },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      signedUrl: plan.signedUrl,
      url: plan.url,
      headers: plan.headers,
      path: plan.path,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : '서류 제출 업로드 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
