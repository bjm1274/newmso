import { NextRequest, NextResponse } from 'next/server';
import {
  buildChatAttachmentObjectKey,
  createChatAttachmentUploadPlan,
} from '@/lib/object-storage';
import { readSessionFromRequest } from '@/lib/server-session';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = (await request.json().catch(() => ({}))) as {
      fileName?: string;
      mimeType?: string;
      fileSize?: number;
    };

    const rawFileName = String(payload.fileName || '').trim() || 'audio.m4a';
    const mimeType = String(payload.mimeType || 'audio/mp4');
    const fileSize = Number(payload.fileSize || 0);

    if (fileSize > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: '파일 크기는 100MB 이하여야 합니다.' },
        { status: 400 }
      );
    }

    const objectKey = buildChatAttachmentObjectKey(rawFileName, mimeType);
    const r2Plan = await createChatAttachmentUploadPlan(objectKey, mimeType);

    if (!r2Plan) {
      return NextResponse.json(
        { error: 'Cloudflare R2 스토리지가 설정되지 않았습니다.' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      success: true,
      provider: 'r2',
      bucket: r2Plan.bucket,
      path: r2Plan.path,
      signedUrl: r2Plan.signedUrl,
      fileName: rawFileName,
      url: r2Plan.url,
      headers: r2Plan.headers,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : '업로드 플랜 생성 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
