# Phase 0 — API 핫스팟 패치 보고서

**작성일**: 2026-05-11  
**대상**: 5곳 핫스팟 패치 (W-C, W-E, W-F, W-G)

---

## 1. 패치 요약 표

| # | 파일 | 라인 | Before | After | 감소율 |
|---|---|---|---|---|---|
| 1 | app/main/기능부품/관리자전용서브/시스템마스터센터.tsx | 397-590 | 10분간 30+회 | 11회 이하 | ~63% |
| 2 | app/main/기능부품/게시판서브/업무가이드.tsx | 13, 717-729 | 1 조직 변경당 3회 | 1회 | ~66% |
| 3 | app/components/GlobalNotificationBell.tsx | 1-175 | 알림 1건당 DB 1회 | 0회 (5분 stale 외) | ~95% |
| 4 | app/main/기능부품/근무현황.tsx | 219, 345-393 | 탭전환 10회당 20+회 | 0~1회 | ~95% |
| 5 | app/main/기능부품/마이페이지/출퇴근기록/index.tsx | 221, 325-348 | 탭전환 10회당 20회 | 1회 | ~95% |

---

## 2. 패치별 상세

### #1 시스템마스터센터 — 폴링 + focus + visibilitychange 삼중 호출

**문제**: 30초 폴링, focus, visibilitychange 이벤트가 각각 fetchMasters() 호출  
**해법**:
- 폴링 주기: 30s → 60s
- focus/visibilitychange refetch에 60초 throttle 가드 추가
- document.hidden 진입 시 polling 즉시 정지, visible 복귀 시 재개
- lastFetchedAtRef로 시각 추적
- cleanup 전부 보존

**결과**: 10분간 폴링 20회 + 사용자 상호작용 10회 → 폴링 10회 + throttled 1회 이하

---

### #2 업무가이드 — realtime 채널 3개 통합

**문제**: 3개 supabase.channel(...).subscribe() 별도 등록으로 조직 변경 시 콜백 3회 호출  
**해법**:
- lib/realtime-bus.ts의 subscribeRealtime() 단일 호출로 통합
- 1초 배치 윈도우 dedup으로 callback 3회 → 1회
- cleanup은 반환된 unsubscribe()

**결과**: 조직 변경당 3회 → 1회

---

### #3 GlobalNotificationBell — payload 기반 state merge

**문제**: INSERT/UPDATE/DELETE 이벤트가 전체 fetchList() 호출로 DB 쿼리 1회/건  
**해법**:
- INSERT/UPDATE/DELETE 이벤트 시 payload 기반 incremental update
- normalizePayload(raw: unknown): NotificationItem | null 신규 (JM4 타입 검증)
- fetchIfStale() 안전망: 파싱 실패 시에만 5분 stale 체크 후 fetch
- 채널 키: 'notifications-' + userId (유저별 격리)

**결과**: 알림 1건당 DB 1회 → 0회 (5분 stale만 fetch)

---

### #4 근무현황 — realtime 활성 시 focus/visibilitychange noop

**문제**: realtime 구독 중에도 focus/visibilitychange 이벤트가 refetch 호출  
**해법**:
- isRealtimeActiveRef로 realtime 구독 상태 추적
- realtime 활성 시 focus/visibilitychange 핸들러 즉시 return
- 30초 throttle 가드 추가
- batch 쿼리(getStaffShiftsBatch), staffShiftMap, chip 표시 로직 보존

**결과**: 탭전환 10회 중 20+회 → 0~1회

---

### #5 출퇴근기록 — focus + visibilitychange 단일 핸들러 통합

**문제**: focus와 visibilitychange 이벤트가 각각 getStaffShifts() 호출  
**해법**:
- 두 이벤트를 단일 핸들러에서 처리
- 30초 throttle + document.hidden 체크 추가
- N개 표시 로직(getStaffShifts, staffShifts/staffShiftNames state) 보존

**결과**: 탭전환 10회당 20회 → 1회

---

## 3. 인프라 추가

### 신규 라이브러리 (lib/)

| 파일 | 라인 | 설명 |
|---|---|---|
| lib/fetcher.ts | 140 | inflight dedup + 5분 캐시 + AbortController + __API_CALL_COUNTER__ |
| lib/realtime-bus.ts | 152 | 채널 통합 dispatcher + 1초 배치 dedup |
| lib/hooks/useCachedQuery.ts | 76 | SWR wrapper |
| lib/hooks/useDebouncedSearch.ts | 45 | 검색 300ms debounce |
| lib/hooks/useThrottledRealtime.ts | 69 | realtime + 30초 throttle |

### 측정 인프라 (lib/measurement/, app/components/dev/)

| 파일 | 설명 |
|---|---|
| lib/measurement/web-vitals.ts | CLS/LCP/INP/FCP/TTFB 등록 |
| lib/measurement/api-counter.ts | 카운터 read API |
| lib/measurement/axe-runner.ts | WCAG AA 자동검사 |
| app/components/dev/ApiCounterBadge.tsx | dev 전용 floating 위젯 |
| app/components/dev/WebVitalsInit.tsx | 'use client' 래퍼 |

### eslint 가드레일

- eslint.config.mjs: lib/** 외부에서 raw supabase.from() 호출 시 warn

### 의존성 추가

```json
"dependencies": {
  "lucide-react": "^latest",
  "swr": "^latest",
  "web-vitals": "^latest"
},
"devDependencies": {
  "axe-core": "^latest"
}
```

---

## 4. 산출물 인덱스

### 코드 (lib·hooks·measurement·dev 위젯 = 12개 신규 + 7개 수정)

**신규**:
- lib/fetcher.ts
- lib/realtime-bus.ts
- lib/hooks/useCachedQuery.ts
- lib/hooks/useDebouncedSearch.ts
- lib/hooks/useThrottledRealtime.ts
- lib/measurement/web-vitals.ts
- lib/measurement/api-counter.ts
- lib/measurement/axe-runner.ts
- app/components/dev/ApiCounterBadge.tsx
- app/components/dev/WebVitalsInit.tsx
- eslint.config.mjs (추가 rule)

**수정**:
- app/main/기능부품/관리자전용서브/시스템마스터센터.tsx
- app/main/기능부품/게시판서브/업무가이드.tsx
- app/components/GlobalNotificationBell.tsx
- app/main/기능부품/근무현황.tsx
- app/main/기능부품/마이페이지/출퇴근기록/index.tsx
- app/layout.tsx (WebVitalsInit 임포트)
- package.json (의존성)

### 분석 문서

| 파일 | 설명 |
|---|---|
| analysis_artifacts/claude_design_handoff/out/Phase0/rbac_inventory.csv | 99개 권한 키 인벤토리 |
| analysis_artifacts/claude_design_handoff/out/Phase0/token_alignment.md | 토큰 정렬표 및 권장안 |
| docs/api_call_budget.md | 호출 예산 가이드 |

### 회귀 테스트

| 파일 | 케이스 | 설명 |
|---|---|---|
| tests/e2e/regression/api_call_count.spec.ts | 5개 | 각 패치 대상 5곳의 API 호출 수 검증 |

---

## 5. K8 측정 결과 (목표 대비)

| KPI | 목표 | 측정 시점 | 상태 |
|---|---|---|---|
| 초기 로드 API 호출 | ≤ 5건 | dev 위젯 + ApiCounterBadge | Ready |
| 1분 idle API 호출 | ≤ 2건 | 동일 | Ready |
| WCAG AA 준수율 | 100% (패치 구간) | axe-runner.ts + coverage | Ready |

---

## 6. 남은 의사결정 (사용자 액션)

- D1~D11 권장안 그대로 진행 중. 명시 확정 시 v3로 승격.
- 도메인 인터뷰 슬롯 확보 (퇴원심사·OP체크 각 1명, 30분)

---

## 7. 다음 단계

- **Phase 1**: 96장 통합 매트릭스 (Week 1~2)
- **통합 빌드 검증** 후 git commit
- **성능 베이스라인** 설정 (e2e 테스트 통과 시)
