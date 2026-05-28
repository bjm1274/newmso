# MSO 모바일 표준 적용 — Claude Code 작업 지시서

> 이 문서 하나로 Claude Code가 모바일 표준(`MSO_Mobile_Improvement.html`)을 코드베이스에 일괄 적용합니다.
> **선행 자료**: `MSO_Mobile_Improvement.html` (§00 진단 → §12 변경사항) — 모든 결정의 근거.
> **저장소 기준**: `bjm1274/newmso@main` (46bdac3, 2026-05-14)
> Last updated: 2026-05-14

---

## 📌 모바일 전체 작업 3단계 — 본 문서의 위치

본 문서는 **1단계(기반)** 입니다. 2·3단계 문서는 본 작업 완료 후 착수.

| 단계 | 문서 | 범위 | 예상 기간 |
|---|---|---|---|
| **1. 기반 표준화** | **`MSO_Mobile_Implementation_Tasks.md` (이 문서)** | 토큰·헤더·셸·ResponsiveTable·BottomSheet·44px·320 회귀 | 3–4주 |
| 2. 화면군 재설계 | `MSO_Mobile_Phase3_Screens.md` | OP체크·근태·퇴원심사·급여·관리자·경영·업무공유 7개 화면군 | 5–6주 |
| 3. 모바일 고급 | `MSO_Mobile_Advanced.md` | PWA·오프라인큐·푸시·키보드/IME·카메라/이미지·제스처·퍼포먼스·접근성 | 3.5–4주 |

**총 12–14주**. 단계 건너뛰지 말 것 — 1단계 토큰이 안 깔리면 2단계 화면이 다시 망가지고, 2단계 화면이 안 잡히면 3단계 푸시가 deep link 할 곳이 없음.

---

## 0. 작업의 본질 — 무엇을 하는 일인지

**새 디자인을 만드는 일이 아닙니다.** 코드베이스에는 이미
- 토큰 (`--touch-target: 44px`, `--mobile-padding-x: 16px`, `--mobile-bottomtab-height` 등)
- 컴포넌트 (`BottomTab`, `BottomSheet`, `ResponsiveTable`, `PageHeader`, `RiskActionDialog`, `StatePanel`)

이 만들어져 있습니다. 다만 **실제 화면에 강제 적용되어 있지 않습니다.**

이 작업의 본질은 다음 4가지를 모든 화면에 강제하는 것입니다.
1. **글자 한 단 ↑** (body 13→15, 헤딩 14→16/17→19)
2. **터치 44px 강제** (모든 인터랙티브 요소)
3. **가로 레이아웃 해체** (사이드+서브+본문 → 바텀탭 + 드로어 + 단일 컬럼)
4. **표·다컬럼 폼 해체** (3+컬럼 표 → 카드, 3+컬럼 폼 → 1컬럼)

---

## 1. 사전 점검 (즉시, 질문 없이)

1. `MSO_Mobile_Improvement.html` 전체를 한 번 읽고 §00 진단의 4가지 깨짐 패턴을 머리에 넣을 것.
2. `app/globals.css` 의 `:root` 토큰 정의를 확인 — `--touch-target`, `--mobile-*`, `--safe-*`, `--radius-*`, `--shadow-*` 가 이미 존재함을 확인.
3. `app/components/` 디렉토리에서 다음 컴포넌트의 현재 시그니처 확인:
   - `BottomTab.tsx`, `BottomSheet.tsx`, `ResponsiveTable.tsx`
   - `PageHeader.tsx`, `ActionDialog.tsx`, `RiskActionDialog.tsx`, `StatePanel.tsx`
4. `app/main/page.tsx` 의 shell 구조 (`aside.app-subnav`, 사이드바, 하단 탭바) 확인.
5. `tests/e2e/` Playwright 설정에서 현재 커버되는 디바이스 폭 확인 (390/393/412 — 320 미커버).

이 다섯 가지가 끝나기 전에는 어떤 PR도 만들지 말 것.

---

## 2. 의사결정 필요 항목 (작업 시작 전 사용자에게 확인)

> 작업 시작 전 **반드시** 사용자에게 다음을 묻고 답변을 받은 뒤 진행할 것.

- [ ] **BottomTab 도입 여부** — `MSO_Mobile_Improvement.html` §12 마지막 callout.
  - 선택지 A: 현 가로 스크롤 탭바 유지 + fade/affordance만 보강 (소규모, 1 PR)
  - 선택지 B: `BottomTab.tsx` 신규 도입 (중규모, 2–3 PR, main-v2와 통일)
  - 본 문서 §4 네비게이션 예시는 B 기준.
- [ ] **P0 토큰 PR 머지 후 시각 회귀 허용 범위** — 모든 화면 폰트/터치/패딩 변경. 머지 후 일부 화면이 잠시 어색해질 수 있음.
- [ ] **헤더 제거(§10 P0) 적용 화면 우선순위** — 게시판·관리자·인사 30+ 화면 중 어디부터?
- [ ] **모바일 회귀 기기 5종 확정** — iPhone SE / 13 / 15 Pro Max / Galaxy A / 태블릿 768.

---

## 3. 작업 순서 (의존성 그래프)

```
P0-1 토큰 오버라이드 (globals.css)        ─┐
       │                                   │
       ▼                                   │
P0-2 PageHeader 표준화 + 중복 H1 제거 ────┤
       │                                   │
       ▼                                   │
P0-3 BottomTab/서브메뉴 결정 반영 ─────────┤
                                           │
       ┌─ P1-1 ResponsiveTable 일괄 적용 ──┤
       │                                   │
       ├─ P1-2 BottomSheet fall-through ──┤
       │                                   │
       ├─ P1-3 44px 강제 + sticky 제출 ───┤
       │                                   │
       └─ P1-4 320px 회귀 테스트 ─────────┤
                                           │
              ┌─ P2-1 스탯 카드 표준화 ───┤
              ├─ P2-2 다컬럼 폼 → 1컬럼 ─┤
              └─ P2-3 이모지 → Lucide ───┤
                                           │
                     P3-1 근무표 데스크톱 안내 ─┘
```

**P0 3개가 끝나기 전에 P1 착수 금지.** P0가 베이스 토큰·헤더·셸을 정렬하기 전에 P1 화면별 작업을 하면 토큰 PR 머지 시 전부 재작업이 발생합니다.

---

## 4. P0 — 베이스 토큰·셸·헤더 (1–2주차)

### P0-1. 모바일 토큰 오버라이드 추가

**파일**: `app/globals.css`
**영향 화면**: 전체 90+
**예상 PR**: 1
**근거**: `MSO_Mobile_Improvement.html` §01 (DESIGN TOKENS)

**작업 내용**

`:root` 블록 아래에 다음 미디어쿼리 블록을 신규 추가합니다. 기존 데스크톱 토큰은 **건드리지 않습니다.**

```css
/* 모바일 표준 오버라이드 — MSO_Mobile_Improvement.html §01 기준 */
@media (max-width: 767px) {
  :root {
    /* Typography: 한 단 ↑ */
    --body-font-size: 15px;
    --body-line-height: 1.55;
    --caption-font-size: 12px;
    --section-title-font-size: 16px;
    --section-title-font-weight: 800;
    --page-header-font-size: 19px;
    --page-header-font-weight: 800;
    --stat-value-font-size: 22px;       /* PC 24 → 22 (2-col 그리드 fit) */
    --button-font-size: 14px;
    --button-font-weight: 700;
    --chip-font-size: 13px;
    --chip-font-weight: 700;

    /* Spacing & Touch — 모두 강제 */
    --touch-target: 44px;               /* WCAG 2.5.5 */
    --touch-target-sm: 40px;
    --mobile-padding-x: 16px;
    --mobile-section-gap: 20px;
    --mobile-card-gap: 10px;
    --mobile-bottomtab-height: calc(60px + env(safe-area-inset-bottom, 0px));
    --safe-pt: env(safe-area-inset-top, 0px);
    --safe-pb: max(8px, env(safe-area-inset-bottom, 0px));

    /* Radius / Shadow */
    --radius-lg: 12px;                  /* PC 8 → 12 */
    --radius-2xl: 16px;                 /* PC 12 → 16 (BottomSheet corner) */
    /* shadow-sm: 1-layer로 저감 (OLED dirty 방지) */
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.06);
  }

  /* 입력 필드는 이미 16px (iOS 줌 방지) — 유지 */
  /* body 클래스에 새 토큰 매핑 */
  body { font-size: var(--body-font-size); line-height: var(--body-line-height); }
  .section-title { font-size: var(--section-title-font-size); font-weight: var(--section-title-font-weight); }
  .page-header-title { font-size: var(--page-header-font-size); font-weight: var(--page-header-font-weight); }
  .stat-card-value { font-size: var(--stat-value-font-size); }
  .btn-premium-primary, .btn-premium-secondary, .btn-premium-ghost {
    font-size: var(--button-font-size); font-weight: var(--button-font-weight);
    min-height: var(--touch-target);
  }
  .tab-item, .erp-chip { font-size: var(--chip-font-size); font-weight: var(--chip-font-weight); }
  .caption-premium { font-size: var(--caption-font-size); }

  /* 모든 인터랙티브 요소에 44px 강제 */
  button, a[role="button"], [role="button"], .icon-btn,
  input[type="checkbox"] + label, input[type="radio"] + label {
    min-height: var(--touch-target);
  }

  /* 페이지 좌우 안전 여백 */
  .erp-page-pad { padding-left: var(--mobile-padding-x); padding-right: var(--mobile-padding-x); }
}
```

**검수 기준**
- [ ] 위 블록을 적용 후 데스크톱(≥768px) 렌더 미변화 — `:root`는 그대로 두었으므로.
- [ ] 모바일에서 본문 폰트가 15px, 페이지 헤더 19px로 측정됨.
- [ ] DevTools에서 임의의 버튼·탭에 `min-height: 44px` 적용 확인.

---

### P0-2. 중복 페이지 헤더 제거 + PageHeader 표준화 (T-000)

**파일**: `app/components/PageHeader.tsx` + 전 게시판/관리자/인사 화면
**영향 화면**: 게시판·관리자·인사 30+
**예상 PR**: 5–8 (화면군별)
**근거**: `MSO_Mobile_Improvement.html` §08 (PAGE HEADER), `CLAUDE_TASKS_AUDIT.md` T-000

**원칙**: 사이드바·바텀탭이 이미 현재 메뉴를 표시하므로 **본문 H1에서 메뉴명 중복 제거**. `PageHeader`는 `breadcrumb / count / status / actions`만 노출.

**작업 단계**

1. `app/components/PageHeader.tsx` 의 현재 props 시그니처 확인. 다음을 보장:
   ```ts
   type PageHeaderProps = {
     breadcrumb?: string[];          // ['관리자', '회사/조직']
     count?: { value: number; label: string };
     status?: { tone: 'ok'|'warn'|'danger'; label: string };
     actions?: ReactNode;
     // ❌ title 필수 prop 금지 — 메뉴명은 중복
   };
   ```
2. 모바일 `min-height: var(--touch-target)` 적용.
3. 화면별 grep — 다음 메뉴 라벨이 H1으로 들어 있으면 제거 (2026-05-10 메뉴 라벨 갱신 반영, §12-2):
   - `휴가 기준/공휴일`, `급여 기준`, `근무표 규칙`, `문서보관 정책`, `결재 양식 관리`, `경조사 소식`
   - 그리고 기존 라벨도 함께 grep: `휴가 정책`, `급여 정책`, `근무표 정책`, `문서 정책`, `문서 양식`, `경조사`
4. 화면군별로 PR 분리 (게시판 → 관리자 → 인사).

**검수 기준**
- [ ] 한 화면에 메뉴명이 두 번 노출되는 케이스 0건.
- [ ] PageHeader가 모바일에서 44px 이상.
- [ ] 신규 라벨로 표시됨 (§12-2 매핑).

---

### P0-3. BottomTab 도입 (의사결정 후)

**선택지 A — 현 탭바 유지 + 보강** (1 PR)

**파일**: `app/main/기능부품/조직도서브/조직도측면창.tsx`, `app/main/page.tsx`

- 가로 스크롤 영역 우측 끝에 `linear-gradient` mask (fade affordance) 8–12px 추가.
- 활성 항목 `scrollIntoView({ inline: 'center' })` — **이미 적용됨** (§12-1).
- 320px 폭에서 탭 일부가 잘려도 fade로 "더 있다" 시각 힌트.

**선택지 B — BottomTab 신규** (2–3 PR)

**파일**: `app/components/BottomTab.tsx` (이미 존재), `app/main/page.tsx`

- 5개 핵심 + 더보기 패턴. 핵심 메뉴: 홈 · 업무 · 내정보 · 알림 · 더보기.
- `app/main/page.tsx` shell에 `<BottomTab />` 마운트.
- `aside.app-subnav` 모바일 분기는 그대로 두고, 1차 메뉴 라우팅을 BottomTab으로 위임.
- `--mobile-bottomtab-height` 만큼 `main` 하단 padding 보장 (콘텐츠 가림 방지).

**검수 기준** (B 기준)
- [ ] iPhone SE (320×568)에서 BottomTab 5개 모두 가시.
- [ ] 페이지 스크롤 시에도 BottomTab fixed 유지, safe-area 대응.
- [ ] 메인 콘텐츠 마지막 요소가 BottomTab에 가리지 않음.

---

## 5. P1 — 컴포넌트 일괄 적용 (2–4주차)

### P1-1. ResponsiveTable 일괄 적용

**파일**: `app/components/ResponsiveTable.tsx` + 각 화면 list 컴포넌트
**영향 화면**: 표 보유 30+
**예상 PR**: 10+ (화면별 1)
**Figma 명명**: `ResponsiveRecordList` (§12-4)
**근거**: `MSO_Mobile_Improvement.html` §06 (TABLES → CARDS)

**원칙**: 3+ 컬럼 표는 모바일에서 **무조건** 카드. `ResponsiveTable`은 이미 자동 분기를 지원.

**대상 화면 (확정)**
- 게시판 목록 (공지사항, 경조사 소식 등)
- 근무현황 표
- MRI 일정
- 자격관리
- 직원 명단
- 급여대장 / 정산
- 재고 현황 / 입출고 이력
- OP체크 목록
- 결재함 목록

**컬럼 정리 규칙** (`ResponsiveTable.tsx` 시그니처)
```ts
columns: [
  { key: 'name', label: '이름', primary: true },    // 카드 헤딩
  { key: 'dept', label: '부서', showOnMobile: true }, // 카드 1행
  { key: 'date', label: '입사일', showOnMobile: true },// 카드 2행
  { key: 'id',   label: '사번' },                     // 데스크톱만
]
```
- `primary: true` 컬럼 정확히 1개.
- `showOnMobile` 추가 2–3개 (총 모바일 카드 노출 3–4 필드).
- 나머지는 데스크톱 전용.

**검수 기준**
- [ ] 모바일(<768)에서 표 → 카드 자동 분기.
- [ ] 카드 헤딩(primary) 1개, 보조 정보 2–3행.
- [ ] 가로 스크롤 발생 0건 (체크: `scrollWidth > clientWidth` 가 list 화면에서 false).

---

### P1-2. 모달 → BottomSheet fall-through

**파일**: `app/components/ActionDialog.tsx`, `app/components/RiskActionDialog.tsx`
**영향 화면**: 전체
**예상 PR**: 1
**근거**: `MSO_Mobile_Improvement.html` §07 (DIALOGS), §12-4 Figma 정렬

**작업 내용**

1. `ActionDialog` / `RiskActionDialog` 에 모바일 분기 prop 추가:
   ```ts
   type DialogProps = {
     // 기존 props...
     mobileVariant?: 'sheet' | 'modal'; // default: 'sheet'
   }
   ```
2. `useMediaQuery('(max-width: 767px)')` 또는 CSS-only 분기로, 모바일에서 `BottomSheet` 모드 렌더.
3. `BottomSheet.tsx` 는 이미 focus trap + ESC + 스크롤 잠금 보유 — 그대로 사용.
4. 위험 액션(`RiskActionDialog`)의 확인 버튼은 sheet 하단 sticky.

**검수 기준**
- [ ] 모바일에서 모달이 중앙에 뜨지 않고 하단 시트로 나옴.
- [ ] 시트 안 컨텐츠 스크롤 가능, 배경 스크롤 잠김.
- [ ] iOS에서 키보드가 올라와도 확인 버튼이 visualViewport 위로 유지.

---

### P1-3. 입력 타깃 44px 강제 + Sticky 제출 푸터

**파일**: `app/globals.css`, `app/components/StickyFormFooter.tsx` (신규)
**영향 화면**: 폼 화면 20+
**예상 PR**: 1 (베이스) + 화면별
**근거**: §01 토큰, §05 (FORMS)

**작업 내용**

1. `globals.css` 에서 `.btn-premium-*`, `.icon-btn` 모바일 `min-height: 44px` (P0-1에서 이미 추가).
2. `StickyFormFooter.tsx` 신규 (구조):
   ```tsx
   <footer className="sticky-form-footer">
     {/* fixed bottom, safe-area-pb, BottomTab 위 */}
     {/* 좌측: 보조 액션 (취소) · 우측: primary (저장/제출) */}
   </footer>
   ```
   - 위치: BottomTab이 있으면 그 위, 없으면 화면 하단.
   - `padding-bottom: var(--safe-pb)`.
3. 폼 화면별로 본문 끝에 `<StickyFormFooter>` 부착, 기존 인라인 저장 버튼은 제거.

**대상 폼 화면 예시**
- 계약서 자동생성, 시스템마스터, 직원권한, 공지등록, 전자결재 작성, 휴가 신청, 경조사 신청

---

### P1-4. 320px 폭 회귀 + scrollWidth 자동 탐지

**파일**: `tests/e2e/smoke.mobile.spec.ts`, `playwright.config.ts`
**영향**: 회귀(전체)
**예상 PR**: 1
**근거**: §10 P1, §12-3, 2026-04-29 audit 권장

**작업 내용**

1. `playwright.config.ts` projects 배열에 `mobile-320` 추가:
   ```ts
   { name: 'mobile-320', use: { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true } }
   ```
2. `smoke.mobile.spec.ts` 에 다음 spec 추가:
   ```ts
   test('대표 화면에서 가로 오버플로우 없음', async ({ page }) => {
     const screens = ['/main', '/main/홈', '/main/경영분석', /* … 12 대표 화면 */];
     for (const path of screens) {
       await page.goto(path);
       // body / main-shell / composer / 하단 탭 / 서브 메뉴
       const overflow = await page.$$eval(
         'body, .main-shell, .composer, .bottom-tab, .app-subnav',
         els => els.map(el => ({ tag: el.className, sw: el.scrollWidth, cw: el.clientWidth }))
                  .filter(x => x.sw > x.cw + 1)
       );
       expect(overflow, JSON.stringify(overflow)).toEqual([]);
     }
   });
   ```
3. 긴 한글 fixture 추가:
   - 메뉴명 16+자, 채팅방명 26+자, 파일명 64+자.
4. visualViewport 키보드 상태 가정 — composer 높이 vs BottomTab 충돌 spec.
5. Next.js Dev Tools overlay 회귀 환경에서 비활성화.

**대표 12 화면**: 마이페이지·홈·경영분석·근태·게시판 목록·게시판 상세·메신저·결재·관리자 목록·시스템마스터·OP체크·재고 현황.

**검수 기준**
- [ ] `pnpm test:e2e --project=mobile-320` 통과.
- [ ] 가로 오버플로우 0건.

---

## 6. P2 — 화면별 최적화 (4–6주차)

### P2-1. 스탯 카드 모바일 표준화

**파일**: `app/globals.css` + 경영분석/마이페이지/근태 화면
**영향**: 대시보드 10+
**예상 PR**: 2–3
**근거**: §02 (BOX STANDARDS), §01 stat-card-value 24→22

**규칙** (§02 AFTER 패턴)
- 패딩 14×16, radius 12.
- **라벨 위 / 숫자 아래** 순서로 변경.
- 그리드 모바일 2-col 강제.
- 변화율 칩(▲/▼ %) 추가 — `danger-soft / success-soft` 배경.

### P2-2. 다중 컬럼 폼 → 1컬럼 + 페어

**파일**: 각 화면 form 컴포넌트
**영향**: 폼 20+
**예상 PR**: 화면별
**근거**: §05 (FORMS)

- 3+컬럼 그리드 폼을 모바일에서 1컬럼으로 reflow.
- 짝지을 수 있는 필드(시작/종료, 이름/사번)는 모바일에서도 1행에 2칸 (페어).
- 라벨은 인풋 위, 헬프 텍스트는 인풋 아래.

**대상**: 계약서 자동생성, 시스템마스터, 직원권한, 공지등록.

### P2-3. 이모지 → Lucide 일괄 교체 (T-006)

**파일**: `GlobalNotificationBell`, `조직도측면창`, `admin-menu-config`
**영향**: 네비/알림
**예상 PR**: 1–2

- 알림 8타입의 이모지를 Lucide 아이콘으로.
- 사이드바 메뉴 아이콘 통일.
- 플랫폼 동일 렌더 보장.

---

## 7. P3 — 백로그

### P3-1. 근무표 자동편성 — 모바일 진입 안내 (T-019)

**파일**: 근무표 위저드
**영향**: 근무표
**예상 PR**: 1

- 위저드 5단계는 데스크톱 전용 — 모바일 진입 시 다음 메시지 노출:
  > "근무표 자동편성은 데스크톱에서 열어주세요. 모바일에서는 결과 확인만 가능합니다."

---

## 8. 메뉴 라벨 매핑 (2026-05-10 적용분)

> §10 P0 헤더 제거 작업 시 **신규 라벨 기준으로 grep**. §12-2.

| 메뉴 경로 | 이전 라벨 | 현재 라벨 | 이유 |
|---|---|---|---|
| 관리자 › 회사/조직 | 휴가 정책 | **휴가 기준/공휴일** | 인사관리 운영 휴가 화면과 구분 |
| 관리자 › 회사/조직 | 급여 정책 | **급여 기준** | 세율/잠금 중심 명확화 |
| 관리자 › 회사/조직 | 근무표 정책 | **근무표 규칙** | 규칙/패턴 vs 월간 편성 |
| 관리자 › 회사/조직 | 문서 정책 | **문서보관 정책** | 인사관리 문서보관함과 구분 |
| 관리자 | 문서 양식 | **결재 양식 관리** | 전자결재 작성하기와 구분 |
| 게시판 | 경조사 | **경조사 소식** | 인사관리 경조사 지원과 구분 |

---

## 9. Figma ↔ Code 컴포넌트 명명 (§12-4)

구현 시 같은 이름을 사용해 디자인-코드 매핑 비용 제거.

| 본 문서 패턴 | Figma 명 | 코드 위치 |
|---|---|---|
| 가로 스크롤 칩 (패턴 B) | `GroupedSubNav / SubNavItem` | `app/main/page.tsx aside` |
| 더보기 시트 (패턴 C) | `MobileSectionPicker` | (신규) `MoreSubmenuSheet.tsx` |
| 표 → 카드 자동 분기 | `ResponsiveRecordList` | `app/components/ResponsiveTable.tsx` |
| 모달 → 바텀시트 | `RiskActionDialog / DangerActionDialog` | `RiskActionDialog.tsx` + `BottomSheet.tsx` |
| 스탯 카드 | `InventoryKpiCard / TaskStatCard` | (분산 — 통합 권장) |
| 리스트 카드 | `InventoryRecordCard / ChatRoomRow` | (분산) |
| 페이지 헤더 (컨텍스트형) | `PageContext (T-000)` | `app/components/PageHeader.tsx` |
| 빈/오류/권한 상태 | `EmptyState / ErrorState / PermissionState` | `app/components/StatePanel.tsx` |

---

## 10. 회귀·검수 절차

P0 토큰 PR 머지 후 **반드시** 다음 순서로 검증:

1. **a11y 자동 회귀** — `pnpm test:a11y` (T-018) 12 대표 화면.
2. **시각 회귀** — Playwright 스크린샷 회귀 spec, 5 기기 × 12 화면.
3. **가로 오버플로우 회귀** — P1-4 spec.
4. **수동 검증** — iPhone SE 1세대(320), iPhone 13, 15 Pro Max, Galaxy A, iPad 768.

**대표 12 화면** (회귀 고정):
마이페이지 · 홈 · 경영분석 · 근태 · 게시판 목록 · 게시판 상세 · 메신저 · 결재 · 관리자 목록 · 시스템마스터 · OP체크 · 재고 현황.

---

## 11. PR 작성 규칙

- **PR 제목 prefix**: `[mobile-std]` — 본 작업 전용.
- **PR 본문 필수 항목**:
  - 적용한 표준 섹션 (예: `§01 토큰`, `§06 ResponsiveTable`)
  - 영향 화면 목록
  - Before / After 스크린샷 (모바일 390 기준 최소 1쌍)
  - 회귀 결과 (a11y · 시각 · scrollWidth)
- **머지 순서**: P0 토큰 → P0 헤더(화면군별) → P0 셸 → P1 컴포넌트 → P2 화면별.
- **충돌 방지**: P0 토큰 PR 머지 중에는 P1·P2 신규 PR 보류.

---

## 12. 이미 해결된 항목 (재작업 금지) — §12-1

다음은 **이미 처리됨**. 본 작업에서 다시 손대지 말 것.

- ✅ 채팅 첨부 이미지 로딩 후 최신 메시지 가림 (2026-04-29, `useChatTimelineScroll`, `MessengerAttachmentPanel`)
- ✅ 모바일 multiline 입력 → 전송 버튼 무반응 (2026-04-29, `메신저컴포저`, `메신저전송훅`)
- ✅ 서브메뉴 활성 항목 자동 정렬 — `scrollIntoView({inline:'center'})` (2026-04-29)
- ✅ 메뉴 라벨 6종 정리 (2026-05-10)
- ✅ 메신저 키보드 대응 (T-020)

---

## 13. 시작 명령 (사용자 → Claude Code)

> "`MSO_Mobile_Implementation_Tasks.md` 를 읽고 §1 사전 점검부터 시작해줘.
> §2 의사결정 항목에 대한 내 답변은 다음과 같다:
> - BottomTab: **선택지 B (도입)** / **A (보강만)**
> - 시각 회귀 허용 범위: ...
> - 헤더 제거 우선순위: 게시판 → 관리자 → 인사
> - 회귀 기기: iPhone SE / 13 / 15 PM / Galaxy A / iPad
>
> P0-1 토큰 오버라이드 PR부터 만들어줘. 머지 후 P0-2로 넘어가자."

---

## 14. 다음 단계 (본 문서 완료 후)

본 문서 P0–P3 머지가 끝나면 다음 순서로 진행:

1. **`MSO_Mobile_Phase3_Screens.md`** — 7개 화면군 모바일 전용 재설계.
   - § 공통 컴포넌트(PullToRefresh, DesktopOnlyNotice 등) → ① OP체크 → ③ 근태 → ⑦ 업무공유 → ⑥ 경영 → ② 퇴원심사 → ④ 급여 → ⑤ 관리자 순.
2. **`MSO_Mobile_Advanced.md`** — PWA·오프라인 큐·푸시·키보드/IME·카메라·제스처·퍼포먼스·접근성.
   - §1·§2·§3 (P1 묶음) 병렬 가능.

두 문서 모두 본 문서의 P0 토큰·셸·헤더가 깔린 상태를 가정합니다. 1단계 미완 상태로 2·3단계 착수 금지.

---

## 15. 참고 문서

- `MSO_Mobile_Improvement.html` — **본 작업의 정의서** (§00 진단 → §12 변경사항)
- `MSO_Master_Plan.html` — 96장 통합 4 Phase 로드맵
- `MSO_Claude_Code_Handoff.md` — 통합 리디자인 작업 지시서
- `MSO_Codebase_Audit_2026-05-12.html` — 코드베이스 감사
- `CLAUDE_TASKS_AUDIT.md` — T-000·T-005·T-006·T-016·T-018·T-019·T-020 원본 태스크
- `MSO_Design_Improvement.md` — §8 모바일 탭바
- `docs/mobile-ux-audit-2026-04-29.md`
- `docs/menu-duplicate-audit-2026-05-09.md`
- `docs/figma-menu-design-audit-2026-05-09.md`
- GitHub `bjm1274/newmso@main` (46bdac3, 2026-05-14)
