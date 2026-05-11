# Phase 0 산출물 인덱스

**작성일**: 2026-05-11  
**범위**: 리디자인 v2.1 Phase 0 완료 (API 핫스팟 패치 + 측정 인프라)

---

## 📋 최상위 문서

| 문서 | 경로 | 설명 |
|---|---|---|
| **API 핫스팟 패치 보고서** | `analysis_artifacts/claude_design_handoff/out/Phase0/api_hotspot_patch_report.md` | 5곳 핫스팟 패치 상세 + 측정 결과 |
| **Phase 0 인덱스** (본 문서) | `analysis_artifacts/claude_design_handoff/out/Phase0/index.md` | 모든 신규/수정 산출물 카테고리 정리 |

---

## 🔧 코드 변경

### 신규 라이브러리 (lib/)

| 파일 | 라인 | 목적 |
|---|---|---|
| lib/fetcher.ts | 140 | API 요청 dedup + 5분 캐시 + AbortController |
| lib/realtime-bus.ts | 152 | Supabase realtime 채널 통합 + 1초 배치 |
| lib/hooks/useCachedQuery.ts | 76 | SWR 기반 캐시 쿼리 훅 |
| lib/hooks/useDebouncedSearch.ts | 45 | 검색 300ms debounce 훅 |
| lib/hooks/useThrottledRealtime.ts | 69 | realtime + 30초 throttle 훅 |

### 신규 측정 인프라 (lib/measurement/, app/components/dev/)

| 파일 | 라인 | 목적 |
|---|---|---|
| lib/measurement/web-vitals.ts | 60 | Core Web Vitals (LCP, INP, CLS, FCP, TTFB) 수집 |
| lib/measurement/api-counter.ts | 45 | API 호출 카운터 read/reset |
| lib/measurement/axe-runner.ts | 85 | axe-core 기반 WCAG AA 검사 실행 |
| app/components/dev/ApiCounterBadge.tsx | 55 | Floating 위젯: 실시간 API 호출 수 표시 |
| app/components/dev/WebVitalsInit.tsx | 30 | 'use client' entry point for web-vitals 통합 |

### 수정 파일 (5개 핫스팟)

| 파일 | 변경 라인 | 패치 내용 |
|---|---|---|
| app/main/기능부품/관리자전용서브/시스템마스터센터.tsx | 397-590 | 폴링 + focus + visibilitychange throttle 통합 |
| app/main/기능부품/게시판서브/업무가이드.tsx | 13, 717-729 | realtime 채널 3개 → 1개 통합 |
| app/components/GlobalNotificationBell.tsx | 1-175 | payload 기반 incremental update (full fetch 제거) |
| app/main/기능부품/근무현황.tsx | 219, 345-393 | realtime 활성 시 refetch 이벤트 차단 |
| app/main/기능부품/마이페이지/출퇴근기록/index.tsx | 221, 325-348 | focus + visibilitychange 단일 핸들러 통합 |

### 설정 및 진입점 수정

| 파일 | 변경 | 설명 |
|---|---|---|
| app/layout.tsx | import 추가 | WebVitalsInit 컴포넌트 삽입 |
| eslint.config.mjs | rule 추가 | lib/** 외부 raw supabase.from() 호출 warn |
| package.json | dependencies | lucide-react, swr, web-vitals 추가 |
| package.json | devDependencies | axe-core 추가 |

---

## 📊 분석 문서

| 파일 | 행 | 설명 |
|---|---|---|
| analysis_artifacts/claude_design_handoff/out/Phase0/rbac_inventory.csv | 100+ | 권한 키 99개 + 매핑 인벤토리 |
| analysis_artifacts/claude_design_handoff/out/Phase0/token_alignment.md | 200+ | 토큰 정렬표 + D1~D11 권장안 |
| docs/api_call_budget.md | 150+ | API 호출 예산 가이드 (초기로드, idle, 사용자 상호작용) |

---

## 🧪 회귀 테스트

| 파일 | 케이스 | 설명 |
|---|---|---|
| tests/e2e/regression/api_call_count.spec.ts | 5개 | 각 패치 대상 파일의 API 호출 수 검증 |

**케이스**:
1. 시스템마스터센터: 10분간 폴링 ≤ 11회
2. 업무가이드: 조직 변경 1회 → callback ≤ 1회
3. GlobalNotificationBell: 알림 5개 → DB fetch 0회 (stale 외)
4. 근무현황: 탭전환 10회 → refetch ≤ 1회
5. 출퇴근기록: 탭전환 10회 → fetch ≤ 1회

---

## 📦 의존성 변경

### 신규 추가

```json
{
  "dependencies": {
    "lucide-react": "^0.latest",
    "swr": "^2.latest",
    "web-vitals": "^4.latest"
  },
  "devDependencies": {
    "axe-core": "^4.latest"
  }
}
```

### 이유

- **lucide-react**: dev 위젯 아이콘
- **swr**: 캐시 쿼리 기반 인프라
- **web-vitals**: Core Web Vitals 측정
- **axe-core**: WCAG 자동검사

---

## 🎯 측정 결과 (K8)

| KPI | 목표 | 현황 | 측정 방법 |
|---|---|---|---|
| 초기 로드 API 호출 | ≤ 5건 | Ready | ApiCounterBadge (dev) |
| 1분 idle API 호출 | ≤ 2건 | Ready | 동일 |
| WCAG AA 준수율 | 100% (패치 구간) | Ready | axe-runner.ts |

---

## ✅ 완료 항목

- [x] 5곳 핫스팟 패치
- [x] lib 인프라 (fetcher, realtime-bus, hooks ×3)
- [x] 측정 인프라 (web-vitals, api-counter, axe-runner)
- [x] dev 위젯 (ApiCounterBadge, WebVitalsInit)
- [x] eslint 가드레일
- [x] 의존성 추가 (package.json)
- [x] 회귀 테스트 스펙 (5케이스)
- [x] 분석 문서 (rbac_inventory, token_alignment, api_call_budget)

---

## ⏭️ 다음 단계 (Phase 1)

1. **96장 통합 매트릭스** 작성 (Week 1~2)
2. 통합 빌드 검증 (`npm run build:cloudflare`)
3. e2e 테스트 통과 확인
4. git commit (main branch)
5. 성능 베이스라인 설정

---

## 📝 참고

- 모든 코드 변경은 JM 원칙 준수 (파일당 500줄 이내, 단일 책임)
- 모든 타입은 JM4 (any 금지, unknown 활용, Zod 런타임 검증)
- 에러 처리는 JM3 (범위 축소, 로그/사용자 메시지 분리)
- 테스트는 JM7 (피라미드 유지, 행동 테스트)
