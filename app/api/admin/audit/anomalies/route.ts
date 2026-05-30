/**
 * 이상 감지 — 최근 7일 audit_logs 비정상 패턴.
 *
 * 소비처: app/main/기능부품/관리자워크센터/AuditWorkcenter/AuditAnomalyTab.tsx
 *  - GET, 응답은 배열 또는 { rows: [...] } 모두 허용.
 *  - row shape: { id?, kind, who, count, when, tone('warn'|'danger'|'accent'), reason, recommend }
 *
 * 권한: 세션 없으면 401, 관리자/시스템마스터 아니면 403.
 * 데이터: _shared.detectAnomalies (단시간 다수 삭제/권한변경/심야 작업).
 *
 * JM3: 조회 실패 시 빈 rows — 소비처가 정적 fallback 유지.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getD1Binding, getD1Drizzle } from '@/lib/db';
import { detectAnomalies, guardAuditAdmin } from '../_shared';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await guardAuditAdmin(request);
  if (denied) return denied;

  try {
    const d1 = await getD1Binding();
    if (!d1) return NextResponse.json({ rows: [] });
    const db = getD1Drizzle(d1);
    const rows = await detectAnomalies(db);
    return NextResponse.json({ rows });
  } catch {
    return NextResponse.json({ rows: [] });
  }
}
