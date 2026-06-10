import { NextResponse } from 'next/server';
import { getD1Binding } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const d1 = getD1Binding();
    const result = await d1.prepare("SELECT id, room_id, content, created_at FROM messages WHERE content LIKE '%패스해요%' OR content LIKE '%수습기간%' ORDER BY created_at DESC LIMIT 10").all();
    return NextResponse.json({ ok: true, data: result.results });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message });
  }
}
