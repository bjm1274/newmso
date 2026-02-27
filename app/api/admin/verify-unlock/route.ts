import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

export async function POST(req: Request) {
  const { password } = await req.json();
  const resetHash = process.env.RESET_SECRET_HASH;
  if (!resetHash) {
    return NextResponse.json({ ok: false, error: 'RESET_SECRET_HASH 환경변수가 설정되지 않았습니다.' }, { status: 500 });
  }
  const ok = await bcrypt.compare(password, resetHash);
  return NextResponse.json({ ok });
}
