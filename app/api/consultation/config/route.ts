import { NextRequest, NextResponse } from 'next/server';
import { readSessionFromRequest } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    return NextResponse.json({ available: !!apiKey });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : '설정 조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
