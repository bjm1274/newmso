/**
 * lib/measurement/web-vitals.ts
 * Web Vitals 측정 초기화 — K4 LCP 등 Core Web Vitals 수집 (JM2·JM3·JM4)
 *
 * - dev: console.log로 즉시 확인
 * - production: 미래 분석 엔드포인트 연동 stub
 */

import type { Metric } from 'web-vitals';

// ─────────────────────────────────────────────
// 내부 타입
// ─────────────────────────────────────────────

type RatingLabel = 'good' | 'needs-improvement' | 'poor';

interface VitalReport {
  name: string;
  value: number;
  rating: RatingLabel;
  delta: number;
  id: string;
  navigationType: string;
}

// ─────────────────────────────────────────────
// 보고 함수
// ─────────────────────────────────────────────

function toReport(metric: Metric): VitalReport {
  return {
    name: metric.name,
    value: metric.value,
    rating: metric.rating as RatingLabel,
    delta: metric.delta,
    id: metric.id,
    navigationType: metric.navigationType };
}

/**
 * 개발 환경 콘솔 출력.
 * 민감정보(사용자 ID, 이메일) 포함 금지 — URL만 포함 (JM5).
 */
function handleMetric(metric: Metric): void {
  const report = toReport(metric);

  if (process.env.NODE_ENV !== 'production') {
    const emoji =
      report.rating === 'good' ? '✅' : report.rating === 'needs-improvement' ? '⚠️' : '❌';
    console.log(
      `[WebVitals] ${emoji} ${report.name}: ${report.value.toFixed(1)}ms (${report.rating}) — ${report.navigationType}`,
    );
    return;
  }

  // production stub: 미래 analytics 엔드포인트 전송 지점
  // e.g. navigator.sendBeacon('/api/vitals', JSON.stringify(report));
  void report; // 미사용 경고 방지
}

// ─────────────────────────────────────────────
// 초기화 함수 (클라이언트에서 1회 호출)
// ─────────────────────────────────────────────

let initialized = false;

/**
 * Web Vitals 측정 등록. app/layout.tsx useEffect에서 1회 호출하세요.
 * 중복 호출 안전 (idempotent).
 * 에러는 console.warn으로만 처리 — 측정 실패가 앱을 깨면 안 됨 (JM3).
 */
export function initWebVitals(): void {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  import('web-vitals')
    .then(({ onCLS, onLCP, onINP, onFCP, onTTFB }) => {
      onCLS(handleMetric);
      onLCP(handleMetric);
      onINP(handleMetric);
      onFCP(handleMetric);
      onTTFB(handleMetric);
    })
    .catch((err: unknown) => {
      console.warn('[WebVitals] 초기화 실패:', err);
    });
}
