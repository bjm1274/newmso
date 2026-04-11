import { NextResponse } from 'next/server';

export async function GET() {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();

  if (!vapidPublicKey) {
    return NextResponse.json({ error: 'Push config is unavailable.' }, { status: 503 });
  }

  return NextResponse.json(
    { vapidPublicKey },
    { headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' } },
  );
}

export const revalidate = 86400;
