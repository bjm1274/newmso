import { NextResponse } from 'next/server';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';
import { buildR2AccessUrl, isR2ChatStorageEnabled, uploadToR2 } from '@/lib/object-storage';

const R2_BUCKET = 'pchos-files';
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

function getExtension(fileName: string, mimeType: string): string {
  const raw = fileName.split('.').pop()?.toLowerCase();
  if (raw && /^[a-z0-9]+$/.test(raw)) return raw;
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function buildObjectKey(company: string, fileName: string, mimeType: string): string {
  const safeFolder = company.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'company';
  const ext = getExtension(fileName, mimeType);
  return `seals/${safeFolder}_${Date.now()}_${crypto.randomUUID()}.${ext}`;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isAdminSession(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isR2ChatStorageEnabled()) {
      return NextResponse.json(
        { error: 'Cloudflare R2 스토리지가 설정되지 않았습니다.' },
        { status: 503 },
      );
    }

    const contentLength = Number(request.headers.get('content-length') || '0');
    if (contentLength > MAX_BYTES) {
      return NextResponse.json({ error: '직인 이미지는 5MB 이하여야 합니다.' }, { status: 413 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const company = String(formData.get('company') || '').trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '업로드할 파일이 없습니다.' }, { status: 400 });
    }
    if (!company) {
      return NextResponse.json({ error: '회사 정보가 누락되었습니다.' }, { status: 400 });
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'PNG, JPG, WEBP 이미지만 업로드할 수 있습니다.' },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: '직인 이미지는 5MB 이하여야 합니다.' }, { status: 413 });
    }

    const objectKey = buildObjectKey(company, file.name, file.type);
    const arrayBuffer = await file.arrayBuffer();

    const uploaded = await uploadToR2(R2_BUCKET, objectKey, Buffer.from(arrayBuffer), file.type);

    return NextResponse.json({
      success: true,
      path: uploaded.path,
      url: buildR2AccessUrl(R2_BUCKET, objectKey),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '직인 업로드 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
