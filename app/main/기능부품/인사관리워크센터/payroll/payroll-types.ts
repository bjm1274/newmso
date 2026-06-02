/**
 * 급여 워크센터 — 타입 정의
 * 13개 모듈 통합 + 대시보드 KPI/점검 구조
 *
 * JM4: any 금지, 모든 union/interface 명시
 */

// ─── 13 모듈 ID (union) ───────────────────────────────────
export type PayrollModuleId =
  | 'settlement'   // 1. 급여 정산
  | 'ledger'       // 2. 급여 대장
  | 'simulator'    // 3. 시뮬레이터
  | 'retirement'   // 4. 퇴직 정산
  | 'pension'      // 5. 퇴직연금
  | 'insurance'    // 6. 4대보험
  | 'withholding'  // 7. 원천징수
  | 'wagePeak'     // 8. 임금피크제
  | 'minWage'      // 9. 최저임금
  | 'taxFree'      // 10. 비과세
  | 'ordinary'     // 11. 통상임금
  | 'unpaid'       // 12. 미지급 수당
  | 'absence';     // 13. 무급결근

// ─── 점검 카드 톤 ─────────────────────────────────────────
export type AlertTone = 'danger' | 'warn' | 'info';

// ─── 모듈 메타 (대시보드 카드용) ─────────────────────────
export interface PayrollModuleMeta {
  id: PayrollModuleId;
  name: string;
  desc: string;
  badge?: string;
  tone?: AlertTone;
}

// ─── 진행 5단계 상태 (대시보드 실사용) ──────────────────────
export type SettlementStepState = 'done' | 'on' | 'pending';
