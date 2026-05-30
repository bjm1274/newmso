/**
 * 급여 이상치 — payroll_records 전월 대비 net_pay 급변동(±20% 이상).
 *
 * 소비처: app/main/기능부품/관리자워크센터/AuditWorkcenter/AuditPayrollOutlierTab.tsx
 *  - GET, 응답은 배열 또는 { rows: [...] } 모두 허용.
 *  - row shape: { id?, name, changePct(number, 음수=감소), reason }
 *
 * 권한: 세션 없으면 401, 관리자/시스템마스터 아니면 403.
 * 데이터: _shared.detectPayrollOutliers.
 *
 * JM3: 조회 실패 시 빈 rows — 소비처가 정적 fallback 유지.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getD1Binding, getD1Drizzle } from '@/lib/db';
import { detectPayrollOutliers, guardAuditAdmin } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await guardAuditAdmin(request);
  if (denied) return denied;

  try {
    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ rows: [] });
    const db = getD1Drizzle(d1);
    const rows = await detectPayrollOutliers(db);
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
