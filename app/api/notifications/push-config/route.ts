import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();

  if (!vapidPublicKey) {
    return NextResponse.json({ error: 'Push config is unavailable.' }, { status: 503 });
  }

  return NextResponse.json({
    vapidPublicKey,
  });
}
