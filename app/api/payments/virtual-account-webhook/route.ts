import { NextRequest, NextResponse } from 'next/server';
import { readAuthorizedDepositUser } from '@/lib/server-deposit-access';
import { normalizeVirtualAccountWebhook } from '@/lib/virtual-account-deposits';
import {
  getD1Binding,
  getD1Drizzle,
  virtual_account_deposits as virtualAccountDepositsTable,
  eq } from '@/lib/db';
import { logD1BindingMissing } from '@/lib/db/mirror-metrics';


export const dynamic = 'force-dynamic';

async function authorizeWebhookRequest(request: NextRequest) {
  const expectedToken = process.env.VIRTUAL_ACCOUNT_WEBHOOK_TOKEN?.trim() || '';
  const url = new URL(request.url);
  const headerToken = request.headers.get('x-webhook-token')?.trim();
  const queryToken = url.searchParams.get('token')?.trim();

  // query string token 폴백은 기본 거부다.
  //
  // 예전에는 `headerToken || queryToken` 으로 무조건 받아 주고 console.warn 만 남겼다.
  // 토큰이 URL 에 실리면 CDN·리버스프록시·브라우저 리퍼러 로그에 평문으로 남는다 —
  // 즉 "경고를 찍는다"는 것 외에 아무 강제력이 없어 전환이 영원히 미뤄졌다.
  // 발신측 전환이 아직 안 끝난 상황에 대비해 탈출구만 환경변수로 남기고,
  // 그 경우에도 만료 안내를 로그로 남긴다.
  const allowQueryToken =
    String(process.env.VIRTUAL_ACCOUNT_WEBHOOK_ALLOW_QUERY_TOKEN ?? '').trim() === '1';
  if (queryToken && !headerToken) {
    if (allowQueryToken) {
      console.warn(
        '[virtual-account-webhook] DEPRECATED: query string token 을 한시 허용 중입니다. ' +
          '발신측을 x-webhook-token 헤더로 전환한 뒤 VIRTUAL_ACCOUNT_WEBHOOK_ALLOW_QUERY_TOKEN 을 제거하세요.',
      );
    } else {
      console.error(
        '[virtual-account-webhook] query string token 거부 — 발신측은 x-webhook-token 헤더를 사용해야 합니다.',
      );
    }
  }
  const providedToken = headerToken || (allowQueryToken ? queryToken : undefined);

  if (expectedToken && providedToken === expectedToken) {
    return {
      allowed: true,
      userCompanyId: null as string | null,
      response: null as NextResponse<unknown> | null };
  }

  const access = await readAuthorizedDepositUser(request);
  if (access.user) {
    return {
      allowed: true,
      userCompanyId: String(access.user.company_id || '').trim() || null,
      response: null as NextResponse<unknown> | null };
  }

  if (!expectedToken) {
    const response =
      access.status === 403
        ? NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
        : NextResponse.json(
            { error: 'VIRTUAL_ACCOUNT_WEBHOOK_TOKEN is not configured.' },
            { status: 503 }
          );
    return {
      allowed: false,
      userCompanyId: null as string | null,
      response };
  }

  const response = NextResponse.json(
    { error: access.status === 403 ? '권한이 없습니다.' : 'Unauthorized webhook request.' },
    { status: access.status ?? 401 }
  );
  return {
    allowed: false,
    userCompanyId: null as string | null,
    response };
}

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeWebhookRequest(request);
    if (!authorization.allowed) {
      return (
        authorization.response ||
        NextResponse.json({ error: 'Unauthorized webhook request.' }, { status: 401 })
      );
    }

    const rawText = await request.text();
    if (!rawText.trim()) {
      return NextResponse.json({ error: 'Webhook payload is empty.' }, { status: 400 });
    }

    const payload = JSON.parse(rawText) as unknown;
    const url = new URL(request.url);
    const normalized = normalizeVirtualAccountWebhook(payload, {
      companyId: url.searchParams.get('companyId') || authorization.userCompanyId,
      provider: url.searchParams.get('provider') });

    if (!normalized) {
      return NextResponse.json({ error: 'Unsupported webhook payload.' }, { status: 400 });
    }

    const now = new Date().toISOString();

    const d1 = await getD1Binding();
    if (!d1) {
      logD1BindingMissing({ label: 'virtual_account_webhook:upsert', backend: 'd1' });
      return NextResponse.json({ error: '웹훅 처리 중 오류가 발생했습니다.' }, { status: 500 });
    }
    const db = getD1Drizzle(d1);

    // dedupe_key 기준으로 기존 행 조회 후 UPDATE 또는 INSERT (D1은 onConflictDoUpdate)
    const existing = await db
      .select({ id: virtualAccountDepositsTable.id })
      .from(virtualAccountDepositsTable)
      .where(eq(virtualAccountDepositsTable.dedupe_key, normalized.dedupe_key))
      .limit(1);

    const rawPayloadStr =
      normalized.raw_payload !== undefined && normalized.raw_payload !== null
        ? JSON.stringify(normalized.raw_payload)
        : '{}';

    // drizzle 스키마가 amount: real() → number | null 이므로 명시적 변환
    const amountNum =
      normalized.amount !== null && normalized.amount !== undefined
        ? Number(normalized.amount)
        : null;

    // drizzle-safe 공통 필드 (spread 대신 명시적 매핑으로 타입 안정성 확보)
    const d1Fields = {
      company_id: normalized.company_id,
      provider: normalized.provider,
      dedupe_key: normalized.dedupe_key,
      provider_event_type: normalized.provider_event_type,
      provider_event_id: normalized.provider_event_id,
      order_id: normalized.order_id,
      order_name: normalized.order_name,
      payment_key: normalized.payment_key,
      transaction_key: normalized.transaction_key,
      method: normalized.method,
      deposit_status: normalized.deposit_status,
      match_status: normalized.match_status,
      amount: amountNum,
      currency: normalized.currency,
      depositor_name: normalized.depositor_name,
      customer_name: normalized.customer_name,
      patient_name: normalized.patient_name,
      patient_id: normalized.patient_id,
      transaction_label: normalized.transaction_label,
      bank_code: normalized.bank_code,
      bank_name: normalized.bank_name,
      account_number: normalized.account_number,
      due_date: normalized.due_date,
      deposited_at: normalized.deposited_at,
      matched_target_type: normalized.matched_target_type,
      matched_target_id: normalized.matched_target_id,
      matched_note: normalized.matched_note,
      raw_payload: rawPayloadStr };

    let depositId: string;
    if (existing.length > 0 && existing[0].id) {
      depositId = existing[0].id;
      await db
        .update(virtualAccountDepositsTable)
        .set({ ...d1Fields, updated_at: now })
        .where(eq(virtualAccountDepositsTable.id, depositId));
    } else {
      depositId = crypto.randomUUID();
      await db.insert(virtualAccountDepositsTable).values({
        id: depositId,
        ...d1Fields,
        created_at: now,
        updated_at: now });
    }

    return NextResponse.json({
      ok: true,
      depositId,
      dedupeKey: normalized.dedupe_key,
      depositStatus: normalized.deposit_status });
  } catch (error) {
    return NextResponse.json({ error: '웹훅 처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
