/**
 * 근로계약서 전자서명 완료 (PC 마이페이지 · 모바일 셸 공용 클라이언트 래퍼)
 *
 * 예전에는 같은 코드가 두 화면에 각각 박혀 있었고, 저장도 전부 브라우저에서
 * 했다. 그래서 두 가지가 동시에 깨져 있었다.
 *
 *   1) 계약 본문 암호화가 한 번도 동작하지 않았다. `CONTRACT_ENCRYPTION_KEY` 는
 *      `NEXT_PUBLIC_` 이 아니라 브라우저 번들에 들어오지 않는데, 키가 없으면
 *      조용히 평문을 돌려주는 폴백이 있어서 아무도 눈치채지 못했다.
 *   2) UPDATE 페이로드에 실 DB 에 없을 수 있는 컬럼이 섞여 서명 완료가 실패했다.
 *      문서보관함 insert 는 그 앞에서 성공하므로, 재시도할 때마다 "문서는
 *      보관됐는데 계약은 미서명" 인 사본이 쌓였다.
 *
 * 지금은 서버 라우트(`POST /api/contracts/sign-complete`)가 전부 처리한다.
 * 서버는 환경변수를 읽을 수 있으므로 키를 설정하는 순간 암호화가 켜지고,
 * 본인 확인과 제목에 들어갈 이름·회사도 DB 값으로 판정한다.
 * 이 파일은 화면 두 곳이 같은 계약으로 그 라우트를 부르게 하는 얇은 래퍼다.
 */

export type CompleteContractSigningInput = {
  contractId: string;
  staffId: string;
  /** @deprecated 서버가 DB 에서 읽는다. 호출부 호환을 위해 남겨 둔 값이다. */
  staffName?: string;
  /** @deprecated 서버가 DB 에서 읽는다. */
  companyName?: string;
  contractText: string;
  signatureDataUrl: string;
  receiptSignatureData?: string | null;
  privacyConsent?: boolean | null;
  /** @deprecated 기록 시각은 서버가 정한다. */
  signedAt?: string;
};

/**
 * 계약 본문을 문서보관함에 넣고 계약 상태를 '서명완료' 로 바꾼다.
 *
 * @throws 저장 또는 상태 변경에 실패하면 사유를 담아 던진다. 호출부는 이 예외를
 *         잡아 사용자에게 알리고, 서명 완료 후속 처리(체크리스트 등)를 멈춰야 한다.
 */
export async function completeContractSigning(input: CompleteContractSigningInput): Promise<void> {
  const res = await fetch('/api/contracts/sign-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contractId: input.contractId,
      contractText: input.contractText,
      signatureDataUrl: input.signatureDataUrl,
      receiptSignatureData: input.receiptSignatureData ?? null,
      privacyConsent: input.privacyConsent ?? null }) });

  if (!res.ok) {
    const detail = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(detail?.error || `계약서 서명 완료 처리에 실패했습니다. (HTTP ${res.status})`);
  }

  const json = (await res.json().catch(() => null)) as { encrypted?: boolean } | null;
  if (json?.encrypted === false) {
    // 서버도 같은 사실을 error 로 남긴다. 여기서도 남기는 이유는, 브라우저
    // 콘솔만 보는 상황에서도 "통제가 꺼져 있다" 는 것이 드러나야 하기 때문이다.
    console.error(
      '[contract-sign-complete] 계약 본문이 평문으로 저장되었습니다. '
      + 'CONTRACT_ENCRYPTION_KEY 가 서버에 설정되어 있지 않습니다.',
    );
  }
}
