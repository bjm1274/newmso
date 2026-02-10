/**
 * 병원/의료기관 증명서 종류 (전자결재 양식신청 ↔ 인사관리 증명서 발급 공통)
 */
export const CERTIFICATE_TYPES = [
  { id: '재직증명서', label: '재직증명서', desc: '현재 재직 중임을 증명' },
  { id: '경력증명서', label: '경력증명서', desc: '근무 경력 및 직책 증명' },
  { id: '퇴직증명서', label: '퇴직증명서', desc: '퇴직 사실 증명' },
  { id: '급여인증서', label: '급여인증서', desc: '급여 지급 증명' },
  { id: '근무확인서', label: '근무확인서', desc: '근무 기간 및 부서 확인' },
  { id: '원천징수영수증', label: '원천징수영수증', desc: '근로소득 원천징수 증명' },
  { id: '소득금액증명원', label: '소득금액증명원', desc: '소득금액 증명 (대출 등)' },
] as const;

export type CertTypeId = typeof CERTIFICATE_TYPES[number]['id'];

export function getCertType(id: string) {
  return CERTIFICATE_TYPES.find((c) => c.id === id) ?? CERTIFICATE_TYPES[0];
}
