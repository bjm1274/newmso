/**
 * 감사 워크센터 — 전자결재 결재함 백업/내려받기 API
 *
 * - GET: 전자결재 결재함 문서 목록 조회 (필터, 검색, 엄격한 테넌트 격리)
 * - POST: 전자결재 자료 파일(엑셀/JSON) 다운로드 감사 로그(audit_logs) 기록
 *
 * 테넌트 격리 및 보안 규칙:
 * - 미인증 사용자 401 차단
 * - 관리자 권한(isAdminSession) 또는 시스템마스터(isNamedSystemMasterAccount) 미보유 시 403 차단
 * - 일반 관리자는 반드시 본인 소속 회사(company_id / company)의 데이터만 조회 가능
 * - 타사 데이터의 교차 결합 및 노출 원천 차단
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  approvals as approvalsTable,
  audit_logs as auditLogsTable,
  desc,
  and,
  eq,
  or,
  like,
  gte,
  lte,
} from '@/lib/db';
import { readSessionFromRequest, isAdminSession } from '@/lib/server-session';
import { isNamedSystemMasterAccount } from '@/lib/system-master';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isMaster = isNamedSystemMasterAccount(session.user);
  const isAdmin = isAdminSession(session.user);

  if (!isAdmin && !isMaster) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ rows: [], total: 0 });
    }
    const db = getD1Drizzle(d1);

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status')?.trim();
    const typeParam = searchParams.get('type')?.trim();
    const searchParam = searchParams.get('search')?.trim();
    const startDateParam = searchParams.get('startDate')?.trim();
    const endDateParam = searchParams.get('endDate')?.trim();
    const companyParam = searchParams.get('company')?.trim();
    const limitParam = parseInt(searchParams.get('limit') || '1000', 10);
    const limit = Math.min(Math.max(limitParam, 1), 5000);

    const conditions: any[] = [];

    // ── 1. 테넌트 격리 (Tenant Isolation) ───────────────────
    if (!isMaster) {
      const userCompanyId = session.user.company_id ? String(session.user.company_id).trim() : '';
      const userCompanyName = session.user.company ? String(session.user.company).trim() : '';

      if (userCompanyId && userCompanyName) {
        conditions.push(
          or(
            eq(approvalsTable.company_id, userCompanyId),
            eq(approvalsTable.sender_company, userCompanyName)
          )
        );
      } else if (userCompanyId) {
        conditions.push(eq(approvalsTable.company_id, userCompanyId));
      } else if (userCompanyName) {
        conditions.push(eq(approvalsTable.sender_company, userCompanyName));
      } else {
        // 소속 회사를 알 수 없는 비마스터 계정은 보안상 데이터 반환 금지
        return NextResponse.json({ rows: [], total: 0 });
      }
    } else if (companyParam && companyParam !== '전체') {
      // 시스템 마스터가 특정 회사를 필터링한 경우
      conditions.push(
        or(
          eq(approvalsTable.company_id, companyParam),
          eq(approvalsTable.sender_company, companyParam)
        )
      );
    }

    // ── 2. 상태 필터 ───────────────────────────────────────
    if (statusParam && statusParam !== '전체') {
      conditions.push(eq(approvalsTable.status, statusParam));
    }

    // ── 3. 문서 양식(type) 필터 ─────────────────────────────
    if (typeParam && typeParam !== '전체') {
      conditions.push(
        or(
          eq(approvalsTable.type, typeParam),
          eq(approvalsTable.doc_type, typeParam)
        )
      );
    }

    // ── 4. 기안 일자 범위 필터 ──────────────────────────────
    if (startDateParam) {
      conditions.push(gte(approvalsTable.created_at, `${startDateParam} 00:00:00`));
    }
    if (endDateParam) {
      conditions.push(lte(approvalsTable.created_at, `${endDateParam} 23:59:59`));
    }

    // ── 5. 통합 검색어 (제목, 기안자명, 문서번호, 부서) ────────
    if (searchParam) {
      const pattern = `%${searchParam}%`;
      conditions.push(
        or(
          like(approvalsTable.title, pattern),
          like(approvalsTable.sender_name, pattern),
          like(approvalsTable.doc_number, pattern),
          like(approvalsTable.sender_department, pattern)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select({
        id: approvalsTable.id,
        doc_number: approvalsTable.doc_number,
        title: approvalsTable.title,
        content: approvalsTable.content,
        type: approvalsTable.type,
        doc_type: approvalsTable.doc_type,
        status: approvalsTable.status,
        sender_id: approvalsTable.sender_id,
        sender_name: approvalsTable.sender_name,
        sender_department: approvalsTable.sender_department,
        sender_company: approvalsTable.sender_company,
        company_id: approvalsTable.company_id,
        current_approver_id: approvalsTable.current_approver_id,
        approver_line: approvalsTable.approver_line,
        approval_line: approvalsTable.approval_line,
        meta_data: approvalsTable.meta_data,
        created_at: approvalsTable.created_at,
        updated_at: approvalsTable.updated_at,
      })
      .from(approvalsTable)
      .where(whereClause)
      .orderBy(desc(approvalsTable.created_at))
      .limit(limit);

    return NextResponse.json({
      rows,
      total: rows.length,
      tenantFilter: isMaster ? (companyParam || '전체') : (session.user.company || '본인 회사'),
    });
  } catch (error) {
    console.error('[/api/admin/audit/approvals GET error]:', error);
    return NextResponse.json({ rows: [], total: 0, error: 'Database query failed' }, { status: 500 });
  }
}

/**
 * POST: 엑셀/JSON 파일 내려받기 실행 시 감사 로그(audit_logs) 영구 기록
 */
export async function POST(request: NextRequest) {
  const session = await readSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const isMaster = isNamedSystemMasterAccount(session.user);
  const isAdmin = isAdminSession(session.user);

  if (!isAdmin && !isMaster) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const count = typeof body?.count === 'number' ? body.count : 0;
    const exportType = body?.exportType === 'json' ? 'JSON' : 'EXCEL';
    const filterDescription = String(body?.filterDescription || '').trim();

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ ok: false, error: 'D1 not available' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);

    const logId = `audit_appr_export_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nowIso = new Date().toISOString();

    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('cf-connecting-ip') || 'local';

    await db.insert(auditLogsTable).values({
      id: logId,
      user_id: session.user.id || 'unknown',
      user_name: session.user.name || '관리자',
      actor_name: session.user.name || '관리자',
      action: `APPROVAL_${exportType}_DOWNLOAD`,
      target_type: 'approvals',
      target_id: `${count}건`,
      details: JSON.stringify({
        exportType,
        count,
        filterDescription,
        userCompany: session.user.company || '',
        userRole: session.user.role || '',
        downloadedAt: nowIso,
      }),
      ip_address: clientIp,
      created_at: nowIso,
    });

    return NextResponse.json({ ok: true, logId });
  } catch (error) {
    console.error('[/api/admin/audit/approvals POST error]:', error);
    return NextResponse.json({ ok: false, error: 'Audit log creation failed' }, { status: 500 });
  }
}
