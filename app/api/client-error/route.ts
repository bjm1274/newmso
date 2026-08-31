import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.error('=== [CLIENT ERROR REPORTED] ===');
    console.error('Time:', new Date().toISOString());
    console.error('Error Message:', body.message);
    console.error('Error Stack:', body.stack);
    console.error('Component Stack:', body.componentStack);
    console.error('URL:', body.url);
    console.error('User Agent:', body.userAgent);
    console.error('===============================');
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
