/**
 * 근로계약서 전자서명 완료 (서버 전용 경로) — D04-001
 *
 * 예전에는 이 처리가 통째로 브라우저에 있었다. 그래서 계약 본문 암호화도
 * 브라우저에서 시도했는데, `CONTRACT_ENCRYPTION_KEY` 는 `NEXT_PUBLIC_` 이 아니라
 * 브라우저 번들에 들어오지 않는다 — **암호화가 성공한 적이 한 번도 없었다.**
 * 게다가 키가 없으면 조용히 평문을 돌려주고 로그는 최초 1회 warn 뿐이라,
 * 서명 이미지·주소·연락처가 담긴 계약 본문이 계속 평문으로 저장돼 왔다.
 *
 * 키를 브라우저로 내리는 것은 답이 아니다 — 모든 사용자에게 복호화 키를
 * 배포하는 셈이라 암호화의 의미가 사라진다. 그래서 저장을 서버로 옮긴다.
 * 여기서는 서버 환경변수를 읽을 수 있으므로, 키를 설정하는 순간 실제로
 * 암호화가 켜진다.
 *
 * 키가 없을 때 저장을 실패시키지는 않는다. 지금 어느 환경에도 키가 없어서
 * 실패시키면 **모든 계약 서명이 즉시 불가능**해진다. 대신 평문으로 나간다는
 * 사실을 매번 error 로그로 남기고 응답에도 `encrypted: false` 로 알린다.
 *
 * 함께 옮긴 것:
 *   - 문서보관함 제목의 직원명·회사명을 클라이언트가 보낸 값이 아니라 **DB 에서**
 *     읽는다. 예전에는 화면이 넘긴 값을 그대로 제목에 박아 위조가 가능했다.
 *   - 본인 확인. 세션 사용자와 계약의 staff_id 가 다르면 거부한다. 예전에는
 *     범용 mutate 로 나가서 이 검사가 정책 레지스트리에만 의존했다.
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  getD1Binding,
  getD1Drizzle,
  document_repository as documentRepositoryTable,
  employment_contracts as employmentContractsTable,
  staff_members as staffMembersTable,
  and,
  eq,
  sql } from '@/lib/db';
import { tryEncryptContract } from '@/lib/contract-crypto';
import { userId } from '@/lib/d1-api-helpers';
import { normalizeSessionUser, readSessionFromRequest } from '@/lib/server-session';

export const dynamic = 'force-dynamic';

type SignCompleteRequest = {
  contractId?: string;
  contractText?: string;
  signatureDataUrl?: string;
  receiptSignatureData?: string | null;
  privacyConsent?: boolean | null;
};

export type SignCompleteResponse = {
  ok: true;
  /** 계약 본문이 실제로 암호화돼 저장됐는가. false 면 키가 없다는 뜻이다. */
  encrypted: boolean;
  /** 환경에 따라 없을 수 있는 확장 컬럼이 저장됐는가. */
  optionalColumnsSaved: boolean;
  signedAt: string;
};

export async function POST(request: NextRequest) {
  try {
    const session = await readSessionFromRequest(request);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const sessionUser = normalizeSessionUser(session.user);
    const actorId = userId(sessionUser);
    if (!actorId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as SignCompleteRequest;
    const contractId = String(body.contractId || '').trim();
    const contractText = String(body.contractText || '');
    const signatureDataUrl = String(body.signatureDataUrl || '');
    if (!contractId || !contractText || !signatureDataUrl) {
      return NextResponse.json(
        { error: 'contractId · contractText · signatureDataUrl 이 모두 필요합니다.' },
        { status: 400 },
      );
    }

    const d1 = await getD1Binding();
    if (!d1) {
      return NextResponse.json({ error: 'D1 binding not available' }, { status: 503 });
    }
    const db = getD1Drizzle(d1);

    // 본인 확인 — 남의 계약에 서명할 수 없다.
    const contractRows = await db
      .select({ id: employmentContractsTable.id, staff_id: employmentContractsTable.staff_id })
      .from(employmentContractsTable)
      .where(eq(employmentContractsTable.id, contractId))
      .limit(1);
    const contract = contractRows[0];
    if (!contract) {
      return NextResponse.json({ error: '계약서를 찾을 수 없습니다.' }, { status: 404 });
    }
    const ownerId = String(contract.staff_id ?? '').trim();
    if (!ownerId || ownerId !== String(sessionUser.id ?? '').trim()) {
      return NextResponse.json({ error: '본인의 계약서만 서명할 수 있습니다.' }, { status: 403 });
    }

    // 제목에 들어갈 이름·회사는 DB 에서 읽는다 (클라이언트 제출값 불신).
    const staffRows = await db
      .select({ name: staffMembersTable.name, company: staffMembersTable.company })
      .from(staffMembersTable)
      .where(eq(staffMembersTable.id, ownerId))
      .limit(1);
    const staffName = String(staffRows[0]?.name ?? '').trim() || '직원';
    const companyName = String(staffRows[0]?.company ?? '').trim() || '전체';

    const signedAt = new Date().toISOString();
    const dateLabel = new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

    const encryptAttempt = await tryEncryptContract(contractText);
    if (!encryptAttempt.encrypted) {
      console.error(
        `[contracts/sign-complete] 계약 본문이 평문으로 저장됩니다 (사유: ${encryptAttempt.reason}). `
        + 'CONTRACT_ENCRYPTION_KEY 를 설정하면 이 경로에서 즉시 암호화가 적용됩니다.',
      );
    }

    // 보관함 저장이 먼저다 — 실패하면 계약 상태를 건드리지 않아
    // "서명됐다고 표시되는데 사본이 없는" 상태를 만들지 않는다.
    // 보관함 id 를 계약 id 에서 결정적으로 만든다 — 같은 계약은 언제 몇 번을
    // 호출해도 같은 행 하나다.
    //
    // 예전에는 crypto.randomUUID() 라 멱등성이 없었다. 재시도·더블클릭·모바일과
    // PC 에서 각각 호출 같은 상황에서 같은 계약의 사본이 그만큼 늘어났다(9차 R06).
    // approval-<id> 를 쓰는 lib/approval-document-archive.ts 와 같은 규약이다.
    await db
      .insert(documentRepositoryTable)
      .values({
        id: `contract-${contractId}`,
        title: `${staffName} 근로계약서 (${dateLabel})`,
        category: '근로계약서',
        content: encryptAttempt.value,
        company_name: companyName,
        created_by: ownerId,
        version: 1 })
      .onConflictDoUpdate({
        target: documentRepositoryTable.id,
        set: {
          title: sql`excluded.title`,
          content: sql`excluded.content`,
          company_name: sql`excluded.company_name` } });

    // 1단계: 서명 성립에 반드시 필요한 컬럼만.
    await db
      .update(employmentContractsTable)
      .set({
        status: '서명완료',
        signed_at: signedAt,
        signature_data: signatureDataUrl })
      .where(and(
        eq(employmentContractsTable.id, contractId),
        eq(employmentContractsTable.staff_id, ownerId),
      ));

    // 2단계: 환경에 따라 없을 수 있는 확장 컬럼. 실패해도 서명 완료를 뒤집지 않는다.
    // (schema.ts 에는 선언돼 있지만 실 DB 에 없을 수 있다 — 8차 D04-005 참고)
    let optionalColumnsSaved = true;
    const optionalPayload: Record<string, unknown> = {};
    if (body.receiptSignatureData) optionalPayload.receipt_signature_data = body.receiptSignatureData;
    if (body.privacyConsent === true || body.privacyConsent === false) {
      optionalPayload.privacy_consent = body.privacyConsent ? 1 : 0;
    }
    if (Object.keys(optionalPayload).length > 0) {
      try {
        await db
          .update(employmentContractsTable)
          .set(optionalPayload)
          .where(and(
            eq(employmentContractsTable.id, contractId),
            eq(employmentContractsTable.staff_id, ownerId),
          ));
      } catch (optionalError) {
        optionalColumnsSaved = false;
        console.warn(
          '[contracts/sign-complete] 확장 컬럼 저장 실패 — 서명 완료는 유지됩니다:',
          optionalError instanceof Error ? optionalError.message : String(optionalError),
        );
      }
    }

    return NextResponse.json({
      ok: true,
      encrypted: encryptAttempt.encrypted,
      optionalColumnsSaved,
      signedAt } satisfies SignCompleteResponse);
  } catch (error) {
    console.error('[contracts/sign-complete] 서명 완료 처리 실패:', error);
    const message = error instanceof Error ? error.message : '서명 완료 처리에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
