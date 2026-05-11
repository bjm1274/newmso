# MSO ERP — WCAG AA 접근성 체크리스트

> **버전**: v1.0 · 2026-05-11  
> **기준**: WCAG 2.1 Level AA  
> **범위**: MSO ERP 전 화면 (erp.pchos.kr)  
> **자동 검사 도구**: axe-core (`lib/measurement/axe-runner.ts`)  
> **검사 방법 표기**: 🤖 자동(axe) · 👁 수동 · 🧑 사용자 테스트

---

## 사용 방법

각 항목은 아래 형식으로 기록한다.

```
- [ ] 항목 설명  
      검사: 🤖/👁/🧑 | 기준: 통과 조건 설명
```

완료 시 `[ ]` → `[x]`로 변경. PR 머지 전 모든 항목 통과 필수.

---

## 1. 색·대비 (WCAG 1.4.3, 1.4.11)

> **본문 텍스트** 4.5:1 이상 · **큰 텍스트(18pt/14pt Bold)** 3:1 이상  
> **UI 컴포넌트·그래픽** 3:1 이상 (1.4.11)

- [ ] `--foreground` (#111827) on `--card` (#FFFFFF): 본문 대비 ≥ 4.5:1  
      검사: 🤖 axe color-contrast | 기준: contrast ratio ≥ 4.5

- [ ] `--muted-text` (#6B7280) on `--card`: 보조 텍스트 대비 ≥ 4.5:1  
      검사: 🤖 axe color-contrast | 기준: contrast ratio ≥ 4.5  
      ※ 현재 #6B7280 on #FFF ≈ 4.61:1 — 통과, 단 배경색 변경 시 재검사

- [ ] `--accent` (#2563EB) on `--card`: 링크·버튼 텍스트 대비 ≥ 4.5:1  
      검사: 🤖 axe color-contrast | 기준: contrast ratio ≥ 4.5

- [ ] 섹션 헤더(큰 텍스트 18px Bold+): 대비 ≥ 3:1  
      검사: 🤖 axe large-text | 기준: contrast ratio ≥ 3.0

- [ ] 버튼 테두리·입력 필드 border (`--border` #E5E7EB) on 배경: 대비 ≥ 3:1  
      검사: 🤖 axe 1.4.11 | 기준: UI component contrast ≥ 3.0

- [ ] `.badge-*` 각 색상 조합 대비 확인  
      검사: 👁 Chrome DevTools Accessibility Inspector | 기준: 해당 텍스트 크기 기준 준수

- [ ] 포커스 outline (`--accent` 3px): 배경 대비 ≥ 3:1  
      검사: 👁 Tab 키 이동 후 눈으로 확인 | 기준: outline이 배경과 명확히 구분

- [ ] 다크모드 전환 후 전체 대비 재확인  
      검사: 👁 OS 다크모드 토글 후 점검 | 기준: 라이트모드와 동일 기준

---

## 2. 키보드 접근성 (WCAG 2.1.1, 2.1.2, 2.4.3)

- [ ] Tab 키로 모든 인터랙티브 요소 순환 가능  
      검사: 👁 Tab 키만으로 전체 화면 탐색 | 기준: 포커스 막힘 없음

- [ ] Shift+Tab 역방향 이동 정상 동작  
      검사: 👁 Shift+Tab 순환 | 기준: 순서가 역전되며 이동

- [ ] Enter/Space: 버튼·링크 활성화  
      검사: 👁 키보드만으로 클릭 대체 | 기준: 마우스와 동일한 결과

- [ ] ESC: 모달·드롭다운·토스트 닫기  
      검사: 👁 모달 열고 ESC 누름 | 기준: 닫히고 트리거 버튼으로 포커스 복귀

- [ ] Arrow 키: Select·라디오그룹·탭 그룹 탐색  
      검사: 👁 키보드로 옵션 이동 | 기준: 방향키로 선택 항목 이동

- [ ] 포커스가 화면 밖 요소로 이동하지 않음  
      검사: 👁 Tab 순환 중 포커스 위치 확인 | 기준: 뷰포트 내 요소만 포커스

- [ ] 모달 포커스 트랩: 모달 열린 동안 배경 콘텐츠 포커스 불가  
      검사: 👁 모달 내 Tab 반복 | 기준: 모달 내에서만 순환

- [ ] 모달 닫힌 후 트리거 버튼으로 포커스 복귀  
      검사: 👁 모달 닫기 후 포커스 위치 확인 | 기준: 열기 버튼에 포커스 복귀

- [ ] Skip navigation 링크: 첫 Tab 시 "본문 바로가기" 표시  
      검사: 👁 빈 페이지에서 첫 Tab | 기준: skip link 표시 및 동작

- [ ] 포커스 가시성 (WCAG 2.4.7): 모든 포커스 요소에 `:focus-visible` outline  
      검사: 🤖 axe focus-visible | 기준: 3px solid --accent 또는 동등 이상

---

## 3. ARIA (WCAG 4.1.2)

- [ ] `role` 값이 유효한 ARIA role인지 확인  
      검사: 🤖 axe aria-roles | 기준: 오류 0건

- [ ] `aria-label` / `aria-labelledby`: 시각적 레이블 없는 요소에 적용  
      검사: 🤖 axe label | 기준: 모든 인터랙티브 요소에 접근 가능 이름 존재

- [ ] `aria-describedby`: 에러 메시지·추가 설명 연결  
      검사: 🤖 axe + 👁 | 기준: 폼 에러·힌트가 스크린 리더에 읽힘

- [ ] `aria-current`: 현재 페이지 사이드바 메뉴 항목  
      검사: 🤖 axe + 👁 | 기준: 현재 메뉴에 `aria-current="page"` 1개만 존재

- [ ] `aria-live="polite"`: 동적 콘텐츠 업데이트(토스트·카운트)  
      검사: 👁 스크린 리더(NVDA/VoiceOver) + 동적 변경 | 기준: 변경 시 자동 읽힘

- [ ] `aria-live="assertive"`: error 알림·중요 경고  
      검사: 👁 에러 발생 후 스크린 리더 반응 | 기준: 즉시 읽힘

- [ ] `aria-modal="true"`: 다이얼로그에 적용  
      검사: 🤖 axe aria-modal | 기준: 열린 dialog에 속성 존재

- [ ] `aria-expanded`: 드롭다운·아코디언 열림 상태  
      검사: 🤖 axe | 기준: 열림 true/닫힘 false 상태 반영

- [ ] `aria-busy="true"`: 스켈레톤 컨테이너 로딩 중  
      검사: 👁 로딩 시 DOM 확인 | 기준: 로딩 완료 후 false로 변경

- [ ] `aria-disabled` vs `disabled` 구분 사용  
      검사: 👁 | 기준: 포커스 유지 필요 시 aria-disabled, 완전 비활성 시 disabled

- [ ] `aria-hidden="true"`: 장식 아이콘·SVG에 적용  
      검사: 🤖 axe | 기준: 의미 없는 시각 요소가 스크린 리더에 읽히지 않음

---

## 4. 시맨틱 HTML (WCAG 1.3.1)

- [ ] `<button>`: 클릭 가능한 모든 액션 — `<div onClick>` 사용 금지  
      검사: 🤖 axe interactive-supports-focus | 기준: 0건 위반

- [ ] `<a href>`: 페이지 이동 링크 — 비동기 액션에 `<button>` 사용  
      검사: 🤖 axe + 👁 | 기준: a 태그에 href 속성 존재

- [ ] `<nav aria-label>`: 사이드바·서브메뉴 각각 레이블 구분  
      검사: 🤖 axe landmark | 기준: 동일 페이지 내 nav 2개 이상 시 aria-label 필수

- [ ] `<main>`: 페이지당 1개, 주요 콘텐츠 감싸기  
      검사: 🤖 axe landmark-main | 기준: main 1개만 존재

- [ ] `<aside>`: 사이드바·보조 정보  
      검사: 🤖 axe | 기준: complementary landmark 적절히 사용

- [ ] `<section aria-labelledby>`: 독립 영역마다 레이블  
      검사: 👁 DOM 확인 | 기준: 각 section에 heading 연결

- [ ] `<form>`: 폼 요소 그룹 감싸기  
      검사: 🤖 axe | 기준: submit 동작 있는 폼에 form 태그 사용

- [ ] `<fieldset>` + `<legend>`: 라디오·체크박스 그룹  
      검사: 🤖 axe group-label | 기준: 그룹당 legend 1개

- [ ] 제목 계층(`h1`→`h2`→`h3`) 건너뜀 없음  
      검사: 🤖 axe heading-order | 기준: 단계 건너뜀 0건

- [ ] 테이블: `<th scope>` + `<caption>` 필수  
      검사: 🤖 axe table | 기준: td에 대응 th 존재

---

## 5. 폼 접근성 (WCAG 1.3.1, 3.3.1, 3.3.2)

- [ ] 모든 입력 필드에 `<label for>` 연결  
      검사: 🤖 axe label | 기준: 0건 미연결

- [ ] placeholder는 label 대체 불가 — 별도 label 필수  
      검사: 👁 | 기준: label 없이 placeholder만 존재하는 필드 0건

- [ ] 에러 시 `aria-invalid="true"` + `aria-describedby` 연결  
      검사: 👁 에러 발생 후 DOM 속성 확인 | 기준: 스크린 리더가 에러 메시지 읽음

- [ ] 필수 입력 `required` 속성 + 레이블에 "(필수)" 또는 * 표시  
      검사: 🤖 axe + 👁 | 기준: 시각·비시각 모두 필수 여부 인지 가능

- [ ] 자동완성 힌트 `autocomplete` 적용  
      검사: 🤖 axe autocomplete | 기준: 이름·이메일·주소 필드에 적절한 값

- [ ] 에러 메시지는 필드 근처(아래/위)에 배치  
      검사: 👁 | 기준: 에러와 필드 간 거리 최소화, 순서 논리적

- [ ] Submit 전 유효성 오류 요약 또는 첫 오류 필드로 포커스 이동  
      검사: 👁 | 기준: 오류 시 사용자가 어디를 수정해야 하는지 즉시 인지

- [ ] 비밀번호 필드: `type="password"`, 보이기 토글 시 `aria-pressed` 반영  
      검사: 👁 | 기준: 토글 버튼 상태 스크린 리더에 전달

---

## 6. 동적 콘텐츠 (WCAG 4.1.3)

- [ ] `aria-live="polite"`: 필터·정렬 결과 업데이트  
      검사: 👁 스크린 리더 | 기준: 업데이트 후 새 항목 수 읽힘

- [ ] `aria-live="assertive"`: 에러 토스트·접속 차단 알림  
      검사: 👁 스크린 리더 | 기준: 다른 읽기 중단하고 즉시 읽힘

- [ ] 토스트 컨테이너: 항상 DOM에 존재 (콘텐츠만 동적 삽입)  
      검사: 👁 DOM 확인 | 기준: `aria-live` 컨테이너가 렌더링 전부터 존재

- [ ] 무한 스크롤: 새 항목 로드 후 스크린 리더 알림  
      검사: 👁 | 기준: "10개 더 로드됨" 등 status 메시지

- [ ] 실시간 업데이트(Supabase Realtime): 업데이트 알림 빈도 조절  
      검사: 👁 | 기준: 과도한 aria-live 발화로 혼란 없음 (디바운스 적용)

---

## 7. 모바일 접근성 (WCAG 2.5.5, 1.3.4)

- [ ] 터치 타깃 ≥ 44×44px: `var(--touch-target)` 사용  
      검사: 🤖 axe target-size | 기준: 0건 미만 크기

- [ ] 아이콘 전용 버튼: 주변 투명 패딩 포함 44px 확보  
      검사: 👁 DevTools 크기 확인 | 기준: 클릭 영역 44×44px 이상

- [ ] 핀치 줌 차단 없음: `user-scalable=no` 금지  
      검사: 👁 meta viewport 태그 확인 | 기준: 최대 배율 제한 없음

- [ ] 가로/세로 회전 모두 지원 (1.3.4)  
      검사: 👁 기기 회전 테스트 | 기준: 레이아웃 정상 표시, 기능 동일

- [ ] 바텀시트: 스와이프 닫기 + ESC 닫기 동시 지원  
      검사: 👁 | 기준: 터치·키보드 양쪽 닫기 가능

- [ ] 스크롤 컨테이너: `-webkit-overflow-scrolling: touch` 또는 동등  
      검사: 👁 실기기 스크롤 | 기준: 관성 스크롤 동작

---

## 8. 미디어·이미지 (WCAG 1.1.1)

- [ ] 의미 있는 `<img>`: `alt` 텍스트 — 내용을 설명  
      검사: 🤖 axe image-alt | 기준: alt 누락 0건

- [ ] 장식 `<img>`: `alt=""` (빈 문자열)  
      검사: 🤖 axe | 기준: 장식 이미지에 불필요한 alt 없음

- [ ] SVG 아이콘: `aria-hidden="true"` 또는 `<title>` + `role="img"`  
      검사: 🤖 axe | 기준: 의미 있는 SVG에 접근 가능 이름 존재

- [ ] 차트·그래프: 데이터 테이블 또는 텍스트 요약 대체본  
      검사: 👁 | 기준: 시각 정보가 없어도 데이터 접근 가능

- [ ] `<figure>` + `<figcaption>`: 이미지에 캡션 필요 시 사용  
      검사: 👁 | 기준: figcaption이 이미지 설명 제공

- [ ] 이미지 버튼: `aria-label` 또는 의미 있는 alt  
      검사: 🤖 axe | 기준: 버튼 목적이 스크린 리더에 전달

---

## 9. 모션·애니메이션 (WCAG 2.3.3)

- [ ] `prefers-reduced-motion` 미디어 쿼리 적용  
      검사: 👁 OS "모션 줄이기" 설정 후 확인 | 기준: 애니메이션 비활성화 또는 즉각 전환

- [ ] 스피너·스켈레톤: reduced-motion 시 정적 표시  
      검사: 👁 | 기준: `animation: none` 처리

- [ ] 자동 재생 콘텐츠 없음 (배너 슬라이더 등)  
      검사: 👁 | 기준: 사용자 조작 없이 자동 변환 없음

- [ ] 깜빡임: 초당 3회 이하 (2.3.1)  
      검사: 👁 | 기준: 빠른 깜빡임 0건

```css
/* globals.css 필수 포함 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 10. 다국어·언어 (WCAG 3.1.1, 3.1.2)

- [ ] `<html lang="ko">` 설정  
      검사: 🤖 axe html-lang | 기준: lang 속성 존재 및 유효한 값

- [ ] 외국어 단어 포함 시 `lang` 속성 인라인 지정  
      검사: 👁 | 기준: 영어 고유명사 등에 `lang="en"` 추가

- [ ] 로케일 날짜·숫자 형식: `Intl` API 사용  
      검사: 👁 코드 리뷰 | 기준: 하드코딩 형식 0건

---

## 자동 검사 명령

### axe-runner (Phase 0 산출물)

```typescript
// lib/measurement/axe-runner.ts
// runAxe() 함수를 호출하면 현재 페이지를 axe-core로 검사
import { runAxe } from '@/lib/measurement/axe-runner';

// 개발 환경에서만 실행
if (process.env.NODE_ENV === 'development') {
  runAxe().then(results => {
    console.group('[axe] 접근성 검사 결과');
    results.violations.forEach(v => {
      console.error(`[${v.impact}] ${v.description}`, v.nodes);
    });
    console.groupEnd();
  });
}
```

### dev 위젯에서 실행

개발 서버(`localhost:3000`)에서 우측 하단 `ApiCounterBadge` 클릭 시
자동으로 `runAxe()`가 실행되어 위반 항목이 콘솔에 출력된다.

### 수동 검사 도구

| 도구 | 용도 | 설치 |
|---|---|---|
| axe DevTools (Chrome 확장) | 자동 WCAG 검사 | Chrome Web Store |
| NVDA + Firefox | Windows 스크린 리더 검사 | nvaccess.org |
| VoiceOver + Safari | macOS/iOS 스크린 리더 | 기본 내장 |
| Chrome Lighthouse | 접근성 점수 측정 | DevTools 내장 |
| Colour Contrast Analyser | 색상 대비 측정 | paciellogroup.com |

### JM7 권장: 자동 검사 spec 파일

> 아래는 Vitest + axe-core로 페이지별 자동 검사 spec을 작성하는 권장 구조다.
> 실제 spec 파일은 후속 작업(Phase 5)에서 생성한다.

```typescript
// __tests__/a11y/page-axe.test.ts (후속 구현)
// import { axe } from 'jest-axe';
// 각 페이지 컴포넌트를 render()한 뒤 expect(results).toHaveNoViolations()
```

---

## 체크리스트 요약

| 카테고리 | 항목 수 | 자동(🤖) | 수동(👁) | 사용자(🧑) |
|---|---|---|---|---|
| 1. 색·대비 | 8 | 5 | 3 | 0 |
| 2. 키보드 | 10 | 2 | 8 | 0 |
| 3. ARIA | 11 | 7 | 4 | 0 |
| 4. 시맨틱 HTML | 10 | 7 | 3 | 0 |
| 5. 폼 | 8 | 3 | 5 | 0 |
| 6. 동적 콘텐츠 | 5 | 0 | 5 | 0 |
| 7. 모바일 | 6 | 1 | 5 | 0 |
| 8. 미디어·이미지 | 6 | 4 | 2 | 0 |
| 9. 모션 | 4 | 0 | 4 | 0 |
| 10. 다국어 | 3 | 1 | 2 | 0 |
| **합계** | **71** | **30** | **41** | **0** |

---

*이 체크리스트는 Phase 4 패턴 가이드와 함께 사용한다.*  
*자동 검사: `lib/measurement/axe-runner.ts` · dev 위젯 ApiCounterBadge 클릭*
