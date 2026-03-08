import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { isAdminSession, readSessionFromRequest } from '@/lib/server-session';

export async function POST(req: Request) {
  const session = await readSessionFromRequest(req);
  if (!session || !isAdminSession(session.user)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { password } = await req.json();
  const resetHash = process.env.RESET_SECRET_HASH;
  if (!resetHash) {
    return NextResponse.json({ ok: false, error: 'RESET_SECRET_HASH 환경변수가 설정되지 않았습니다.' }, { status: 500 });
  }
  const ok = await bcrypt.compare(password, resetHash);
  return NextResponse.json({ ok });
}
