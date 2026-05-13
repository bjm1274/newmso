import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';

const BUCKET = 'company-seals';
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 5 * 1024 * 1024;

function getAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new Error('Supabase server configuration is missing.');
  }
  return createClient(supabaseUrl, serviceKey);
}

function getExtension(fileName: string, mimeType: string) {
  const raw = fileName.split('.').pop()?.toLowerCase();
  if (raw && /^[a-z0-9]+$/.test(raw)) return raw;
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
}

function buildFilePath(company: string, fileName: string, mimeType: string) {
  const safeFolder = company.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'company';
  const ext = getExtension(fileName, mimeType);
  return `seals/${safeFolder}_${Date.now()}_${crypto.randomUUID()}.${ext}`;
}

export async function POST(request: Request) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session || !isAdminSession(session.user)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

    const supabase = getAdminClient();
    const filePath = buildFilePath(company, file.name, file.type);
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, Buffer.from(arrayBuffer), {
        contentType: file.type,
        upsert: true,
        cacheControl: '3600',
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || '직인 업로드에 실패했습니다.' },
        { status: 500 },
      );
    }

    const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      path: filePath,
      url: urlData.publicUrl,
    });
  } catch {
    return NextResponse.json(
      { error: '직인 업로드 중 오류가 발생했습니다.' },
      { status: 500 },
    );
  }
}
