import { NextRequest, NextResponse } from 'next/server';
import { createChatAttachmentUploadPlan } from '@/lib/object-storage';
import {
  normalizeSessionUser,
  readSessionFromRequest,
  resolveLatestSessionUser } from '@/lib/server-session';
// SSOT size: @/lib/upload-constants
import { MAX_FILE_SIZE_BYTES } from '@/lib/upload-constants';
// 8차 D12-011: `normalizeMime`(축약 사본)·확장자 정제 인라인 사본을 lib/upload-mime 정본으로 교체.
// 축약 사본은 확장자→MIME 보충이 없어 클라이언트가 mimeType 을 비워 보내면 무조건
// application/octet-stream 이었다. 정본은 파일명 확장자로 보충한다(허용/차단 판정 결과는
// 두 경우 모두 화이트리스트에 걸려 동일 — 'report.pdf' 는 어느 쪽이든 통과).
import {
  ALLOWED_APPLICATION_MIME_TYPES,
  hasBlockedUploadExtension,
  normalizeUploadMimeType,
  toSafeObjectKeyExtension } from '@/lib/upload-mime';
import {
  ACTIVE_CONTENT_UPLOAD_ERROR,
  isActiveContentUpload } from '@/app/api/storage/object/content-policy';

/**
 * POST /api/approval/upload
 *
 * 결재 첨부 파일 업로드 presigned URL 발급.
 * JM3: 파일 크기·MIME 미허용·인증 실패 각각 명시.
 * JM5: 인증된 사용자만 발급 (결재 참여 여부는 RLS에서 검증).
 */

export const dynamic = 'force-dynamic';

// 예전에는 `ALLOWED_MIME_PREFIXES` 마지막 원소가 `'application/'` 이었다.
// 즉 application/* 전체가 허용이고 실행파일 3종만 블랙리스트로 빠지는 구조라,
// 목록에 없는 이름(application/x-msdos-program 등)으로 신고하면 무엇이든 통과했다.
// 화이트리스트(ALLOWED_APPLICATION_MIME_TYPES) + 확장자 블록으로 뒤집는다.
const ALLOWED_MIME_PREFIXES = ['image/', 'video/', 'audio/', 'text/'];

type ApprovalUploadRequest = {
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  approvalId?: string;
};

function isAllowedMime(mime: string): boolean {
  if (ALLOWED_APPLICATION_MIME_TYPES.has(mime)) return true;
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

/** R2 오브젝트 키에 쓸 수 있게 정제 — 경로 조작·구분자 제거. */
function safeKeySegment(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .slice(0, 64);
}

// 8차 D09-018.
// 예전에는 approvalId 가 요청 타입 선언에만 있고 본문에서 한 번도 읽히지 않았다.
// 클라이언트(오프라인 업로드 큐)는 그 값을 실어 보내면서 "서버가 문서에 연결해 준다"고
// 기대했지만 서버는 조용히 버렸고, 그래서 오프라인 첨부가 R2 에는 올라가는데 어느 결재
// 문서의 첨부인지 아무 데도 남지 않았다(D09-001 의 근인).
// 이 라우트는 presign 만 발급하므로 문서 meta 연결은 여전히 클라이언트 몫이지만,
// 최소한 오브젝트 키에 문서 id 를 새겨 사후 추적이 가능하게 한다. 값이 없으면 예전 경로 그대로.
function buildFilePath(fileName: string, mime: string, approvalId?: string): string {
  const ext = toSafeObjectKeyExtension(fileName, mime);
  const scope = safeKeySegment(approvalId ?? '');
  const prefix = scope ? `approval/${scope}` : 'approval';
  return `${prefix}/${Date.now()}_${crypto.randomUUID()}.${ext}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // 최신 사용자 정보 확인 (탈퇴/비활성 계정 차단)
    await resolveLatestSessionUser(normalizeSessionUser(session.user));

    const body = (await request.json().catch(() => ({}))) as ApprovalUploadRequest;
    const rawFileName = String(body.fileName || '').trim();
    const mime = normalizeUploadMimeType(rawFileName, body.mimeType ?? '');
    const fileSize = Number(body.fileSize ?? 0);

    if (!rawFileName) {
      return NextResponse.json({ error: '파일명이 필요합니다.' }, { status: 400 });
    }
    // 신고 MIME 은 클라이언트가 자유롭게 바꿀 수 있으므로 확장자도 함께 본다.
    if (hasBlockedUploadExtension(rawFileName)) {
      return NextResponse.json(
        { error: '실행 파일 형식은 첨부할 수 없습니다.' },
        { status: 415 },
      );
    }
    // 아래 화이트리스트는 `'text/'`·`'image/'` 프리픽스라 `text/html` 과
    // `image/svg+xml` 을 그대로 통과시켰다 — 그 첨부는 /api/storage/object 가
    // 앱 오리진에서 inline 으로 내보내 저장형 XSS 가 된다(계통 전체 결함이라
    // 게시판·채팅과 같은 판정을 쓴다).
    if (isActiveContentUpload(rawFileName, mime)) {
      return NextResponse.json({ error: ACTIVE_CONTENT_UPLOAD_ERROR }, { status: 415 });
    }
    if (!isAllowedMime(mime)) {
      return NextResponse.json(
        { error: `허용되지 않는 파일 형식입니다: ${mime}` },
        { status: 415 },
      );
    }
    if (fileSize > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: '파일 크기는 200MB 이하여야 합니다.' },
        { status: 413 },
      );
    }

    const filePath = buildFilePath(rawFileName, mime, body.approvalId);
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
    const message = err instanceof Error ? err.message : '결재 첨부 업로드 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
