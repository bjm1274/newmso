import { NextResponse } from 'next/server';
import { getD1Binding } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ error: 'No D1 binding' });

    // 1. Find duplicates
    const res = await d1.prepare(`
      SELECT staff_id, contract_type, COUNT(*) as cnt
      FROM employment_contracts
      GROUP BY staff_id, contract_type
      HAVING COUNT(*) > 1
    `).all();

    return NextResponse.json({ duplicates: res.results });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
