import { NextResponse } from 'next/server';
import { getD1Binding } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ error: 'No D1 binding' });

    // Test the exact UPDATE query to see the real error
    const testQuery = `
      UPDATE "employment_contracts" 
      SET "status" = '서명대기'
      WHERE "id" = '1f5497e1-50ee-413d-9758-4264634b44a5'
      RETURNING *;
    `;
    
    // Let's also check the schema
    const schema = await d1.prepare(`PRAGMA table_info(employment_contracts);`).all();

    return NextResponse.json({ schema: schema.results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message, stack: err.stack });
  }
}
