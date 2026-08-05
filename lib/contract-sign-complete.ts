/**
 * 근로계약서 전자서명 완료 처리 (PC 마이페이지 · 모바일 셸 공용)
 *
 * 예전에는 같은 코드가 두 화면에 각각 박혀 있었다. 그래서 한쪽만 고치면
 * 다른 플랫폼은 그대로 깨진 채 남는 구조였는데, 실제로 두 곳 모두 같은
 * 이유로 실패하고 있었다 — UPDATE 페이로드의 `receipt_signature_data` 와
 * `privacy_consent` 가 employment_contracts 에 없는 컬럼이었다.
 *
 * 두 컬럼은 schema.ts 에는 선언돼 있지만 introspection 산출물(0000)에도,
 * 이후 어떤 마이그레이션에도 없다. 그리고 /api/d1/mutate 의 미존재 컬럼
 * 제거는 **schema.ts 를 기준**으로 하므로, 선언만 돼 있는 이 컬럼들은
 * "존재하는 컬럼"으로 통과해 SQL 에 그대로 실렸다. 스키마 선행 정의가
 * 서버 방어를 무력화한 셈이다. (운영 D1 백업에는 수동 ALTER 흔적이 있어
 * 환경에 따라 있을 수도 없을 수도 있다.)
 *
 * 그래서 UPDATE 를 두 단계로 나눈다 — 필수 컬럼을 먼저 확정하고, 확장 컬럼은
 * 이어서 따로 시도한다. 어느 환경에서도 서명 완료 자체는 성립한다.
 */
import { db } from '@/lib/db-client';

/** 환경에 따라 없을 수 있는 확장 컬럼 */
const OPTIONAL_CONTRACT_COLUMNS = ['receipt_signature_data', 'privacy_consent'];

export type CompleteContractSigningInput = {
  contractId: string;
  staffId: string;
  staffName: string;
  companyName: string;
  contractText: string;
  signatureDataUrl: string;
  receiptSignatureData?: string | null;
  privacyConsent?: boolean | null;
  signedAt?: string;
};

/**
 * 계약서 본문을 문서보관함에 넣고 계약 상태를 '서명완료' 로 바꾼다.
 *
 * 보관함 저장이 먼저다 — 실패하면 계약 상태를 건드리지 않아 "서명됐다고
 * 표시되는데 사본이 없는" 상태를 만들지 않는다. 반대로 보관은 됐는데
 * UPDATE 가 실패하면 미완결 사본이 남으므로, 필수 UPDATE 가 확장 컬럼의
 * 존재 여부에 걸리지 않도록 단계를 나눈 것이 중요하다.
 *
 * @throws 저장 또는 상태 변경에 실패하면 사유를 담아 던진다.
 */
export async function completeContractSigning(input: CompleteContractSigningInput): Promise<void> {
  const signedAt = input.signedAt ?? new Date().toISOString();

  const { encryptContract } = await import('@/lib/contract-crypto');
  const encryptedContractText = await encryptContract(input.contractText);

  const { error: insertDocError } = await db.from('document_repository').insert({
    title: `${input.staffName} 근로계약서 (${new Date().toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })})`,
    category: '근로계약서',
    content: encryptedContractText,
    company_name: input.companyName || '전체',
    created_by: input.staffId,
    version: 1 });
  if (insertDocError) {
    throw new Error(`문서 보관함 저장 실패: ${insertDocError.message}`);
  }

  // 1단계: 서명 성립에 반드시 필요한 컬럼만. 여기가 실패하면 서명은 미완이다.
  const { error: updateError } = await db
    .from('employment_contracts')
    .update({
      status: '서명완료',
      signed_at: signedAt,
      signature_data: input.signatureDataUrl })
    .eq('id', input.contractId)
    .eq('staff_id', input.staffId);

  if (updateError) {
    throw new Error(`계약서 상태 업데이트 실패: ${updateError.message}`);
  }

  // 2단계: 환경에 따라 없을 수 있는 확장 컬럼. 실패해도 서명 완료는 뒤집지 않는다.
  //
  // 폴백(withMissingColumnsFallback)으로 한 번에 처리하지 않는 이유는, mutate 라우트가
  // 실패 사유를 "Failed query: UPDATE ..." 로만 돌려주고 원인(no such column)을 담지
  // 않기 때문이다. 그러면 **어떤 종류의 실패든** 컬럼 부재로 오인해 값을 조용히
  // 떨어뜨리게 된다. 단계를 나누면 필수 상태 변경이 확장 컬럼의 존재 여부에
  // 의존하지 않고, 확장 컬럼 실패는 로그로 드러난다.
  const optionalPayload: Record<string, unknown> = {};
  if (input.receiptSignatureData) optionalPayload.receipt_signature_data = input.receiptSignatureData;
  if (input.privacyConsent === true || input.privacyConsent === false) {
    optionalPayload.privacy_consent = input.privacyConsent ? 1 : 0;
  }
  if (Object.keys(optionalPayload).length === 0) return;

  const { error: optionalError } = await db
    .from('employment_contracts')
    .update(optionalPayload)
    .eq('id', input.contractId)
    .eq('staff_id', input.staffId);

  if (optionalError) {
    console.warn(
      `[contract-sign-complete] 확장 컬럼(${OPTIONAL_CONTRACT_COLUMNS.join(', ')}) 저장 실패 — 서명 완료는 유지됩니다:`,
      optionalError.message,
    );
  }
}
