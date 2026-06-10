import { NextRequest, NextResponse } from 'next/server';
import { createChatAttachmentUploadPlan } from '@/lib/object-storage';
import {
  normalizeSessionUser,
  readSessionFromRequest,
  resolveLatestSessionUser,
} from '@/lib/server-session';

/**
 * POST /api/approval/upload
 *
 * 결재 첨부 파일 업로드 presigned URL 발급.
 * JM3: 파일 크기·MIME 미허용·인증 실패 각각 명시.
 * JM5: 인증된 사용자만 발급 (결재 참여 여부는 RLS에서 검증).
 */

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 200 MB
const ALLOWED_MIME_PREFIXES = ['image/', 'application/pdf', 'text/', 'application/'];
const BLOCKED_MIMES = new Set([
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
]);

type ApprovalUploadRequest = {
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  approvalId?: string;
};

function normalizeMime(raw: string): string {
  const t = String(raw || '').trim().toLowerCase();
  if (t === 'image/jpg' || t === 'image/pjpeg') return 'image/jpeg';
  if (t === 'image/x-png') return 'image/png';
  return t || 'application/octet-stream';
}

function isAllowedMime(mime: string): boolean {
  if (BLOCKED_MIMES.has(mime)) return false;
  return ALLOWED_MIME_PREFIXES.some((prefix) => mime.startsWith(prefix));
}

function buildFilePath(fileName: string, mime: string): string {
  const ext = (() => {
    const dot = fileName.lastIndexOf('.');
    if (dot > -1) return fileName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '');
    const sub = mime.split('/')[1]?.toLowerCase() ?? 'bin';
    return sub || 'bin';
  })();
  const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : 'bin';
  return `approval/${Date.now()}_${crypto.randomUUID()}.${safeExt}`;
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
    const mime = normalizeMime(body.mimeType ?? '');
    const fileSize = Number(body.fileSize ?? 0);

    if (!rawFileName) {
      return NextResponse.json({ error: '파일명이 필요합니다.' }, { status: 400 });
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
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '결재 첨부 업로드 오류';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
