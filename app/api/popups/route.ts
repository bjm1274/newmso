import { NextResponse } from 'next/server';
import { desc } from 'drizzle-orm';
import { getD1Binding, getD1Drizzle, popups as popupsTable, eq } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);

    const activePopups = await db
      .select()
      .from(popupsTable)
      .where(eq(popupsTable.is_active, 1))
      .orderBy(desc(popupsTable.priority), desc(popupsTable.created_at));

    const response = NextResponse.json(activePopups);
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const response = NextResponse.json({ error: message }, { status: 500 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  }
}

export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, apikey');
  return response;
}
