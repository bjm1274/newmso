# MSO 모바일 고급 — PWA · 제스처 · 키보드 · 퍼포먼스 · 미디어

> `MSO_Mobile_Implementation_Tasks.md` (P0–P3) + `MSO_Mobile_Phase3_Screens.md` (7개 화면군) 완료 후 단계.
> "현장에서 진짜 쓸 수 있는 모바일 앱 경험"을 위한 마지막 레이어.
> Last updated: 2026-05-14

---

## 0. 우선순위 요약

| 영역 | 우선도 | 예상 PR | 본 문서 |
|---|---|---|---|
| ① PWA · 오프라인 큐 · 푸시 | 🔴 P1 | 4 | §1 |
| ② 키보드/IME/inputMode/autofill | 🔴 P1 | 2 | §2 |
| ③ 이미지·카메라·파일 업로드 | 🔴 P1 | 3 | §3 |
| ④ 제스처 (스와이프·롱프레스·햅틱) | 🟡 P2 | 2 | §4 |
| ⑤ 퍼포먼스 (번들·이미지·3G) | 🟡 P2 | 3 | §5 |
| ⑥ 접근성 (스크린리더·대비·포커스) | 🟡 P2 | 2 | §6 |
| ⑦ 모바일 네비게이션 히스토리 | 🟢 P3 | 1 | §7 |

🔴 P1은 Phase 3 완료 직후 즉시 착수. 🟡 P2는 P1과 병행 가능.

---

## 1. PWA · 오프라인 큐 · 푸시

### 1-1. PWA 기본 (Add to Home Screen)

**파일**
- `public/manifest.webmanifest` (신규)
- `app/icons/` — 192·512·maskable·favicon
- `app/layout.tsx` — `<link rel="manifest">`, `<meta name="theme-color">`

**`manifest.webmanifest` 골격**
```json
{
  "name": "MSO",
  "short_name": "MSO",
  "start_url": "/main",
  "display": "standalone",
  "background_color": "#F8F8F9",
  "theme_color": "#2563EB",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**검수**
- iOS Safari "홈 화면에 추가" 동작.
- Android Chrome 설치 프롬프트 노출.
- 설치 후 standalone 모드에서 BottomTab/safe-area 정상.

### 1-2. Service Worker + 오프라인 큐

**파일**: `app/sw.ts` (또는 `next-pwa` 설정)
**시나리오**: 출퇴근 체크인·인수인계 댓글이 **오프라인에서도 큐**에 들어가고, 온라인 복귀 시 자동 전송.

**구현 접근**
1. `next-pwa` 또는 Next.js 14+ App Router의 SW 패턴.
2. Background Sync API 사용 (Android 지원, iOS 미지원 — fallback: 앱 재진입 시 큐 flush).
3. 큐 저장소: IndexedDB (`idb` 라이브러리 권장).

**큐 대상 (Phase 3와 매핑)**
- ③ 근태 체크인 — 출근/퇴근/외출/복귀
- ⑦ 업무공유 댓글
- ① OP체크 상태 전환 (단, 충돌 가능성 — 라스트라이트윈 정책 명시)

**산출 파일**
- `app/sw.ts`
- `app/lib/offlineQueue.ts` (IndexedDB 추상화)
- `app/hooks/useOfflineQueue.ts`

**검수**
- [ ] 비행기 모드에서 체크인 → 큐 추가 → 온라인 복귀 시 자동 전송.
- [ ] 큐 길이가 UI에 표시 (BottomTab 알림 점 등).

### 1-3. 푸시 알림

**파일**: `app/sw.ts`, 백엔드 (별도)
**범위**: 알림 8타입 중 모바일 푸시가 의미 있는 것만 — 결재 요청·OP체크 상태·인수인계 멘션.

**작업**
1. Web Push API + VAPID 키 발급.
2. 알림 권한 요청 UI — 최초 진입 직후가 아니라 **알림 페이지 진입 시점** (UX 모범).
3. `GlobalNotificationBell.tsx` 와 푸시 페이로드 통합.
4. iOS는 16.4+ Safari/standalone PWA에서만 지원 — 안내 필요.

**검수**
- [ ] 알림 권한 거부 시 in-app 알림으로 fallback.
- [ ] 푸시 탭 시 해당 화면으로 deep link.

### 1-4. 산출 (§1 종합)

- 4 PR: PWA manifest / SW + 오프라인 큐 / 푸시 / 통합 검수.

---

## 2. 키보드 · IME · inputMode · autofill

### 2-1. 입력 타입별 `inputMode` 강제

**파일**: `app/components/Input.tsx`, 각 폼 화면

| 데이터 | `type` | `inputMode` | `autocomplete` |
|---|---|---|---|
| 사번 | `text` | `numeric` | `off` |
| 전화번호 | `tel` | `tel` | `tel` |
| 이메일 | `email` | `email` | `email` |
| 금액 | `text` | `decimal` | `off` |
| 카드번호 | `text` | `numeric` | `cc-number` |
| 비밀번호 | `password` | (기본) | `current-password` 또는 `new-password` |
| OTP | `text` | `numeric` | `one-time-code` |
| 이름(한글) | `text` | `text` | `name` |

**작업**
1. `Input.tsx` 에 `kind` prop 추가 — 위 매핑을 자동 적용.
2. 전 폼 화면 grep — `<input type="text"`/`type="number"` 인풋에 `kind` 매핑.

### 2-2. 한글 IME 처리

**문제**: 한글 조합 중(`compositionupdate`)에 onChange가 너무 빠르게 발화 → 검색 자동완성/유효성 검사 깜빡임.

**해결**
- `useImeCompositionGuard.ts` 훅 신규:
  ```ts
  // isComposing 동안은 onChange 콜백 보류, compositionend 시 한 번에 전달
  ```
- 메신저 컴포저·검색·댓글 입력에 적용.

### 2-3. 키보드 위 sticky 요소 (visualViewport)

**훅**: `useVisualViewportOffset.ts` (§3 Phase3 §8-2에서 정의)

```ts
const offset = useVisualViewportOffset();
<div style={{ bottom: offset }}>
  {/* 키보드 올라오면 자동으로 키보드 위로 이동 */}
</div>
```

**대상**
- 메신저 컴포저 (이미 적용 — §12-1)
- 댓글 입력 (⑦ 업무공유)
- StickyFormFooter

### 2-4. 검수

- [ ] 사번·전화번호 인풋이 모바일에서 숫자 키패드.
- [ ] 한글 조합 중 onChange로 인한 깜빡임 0.
- [ ] iOS Safari 키보드 올라와도 sticky 요소 가시.
- [ ] OTP 인풋이 SMS 자동입력과 연동.

---

## 3. 이미지 · 카메라 · 파일 업로드

### 3-1. 카메라 직접 촬영

**파일**: `app/components/CameraInput.tsx` (신규)
```tsx
<input type="file" accept="image/*" capture="environment" />
```
- `capture="environment"` — 후면 카메라 우선 (현장 사진).
- `capture="user"` — 전면 (프로필).

**용도**
- 인수인계 첨부, 환자 동의서 스캔, OP체크 사진 증빙.

### 3-2. 클라이언트 이미지 압축

**파일**: `app/lib/imageCompress.ts`
- 업로드 전 캔버스로 리사이즈 (장변 1920px, JPEG q=0.85).
- 3MB 초과 파일은 자동 압축.
- HEIC → JPEG 변환 (iOS) — `heic2any` 또는 서버 변환.

### 3-3. 업로드 진행률 · 재시도

- XHR/Fetch + `upload.onprogress`.
- 실패 시 자동 1회 재시도, 그 후 사용자에게 재시도 버튼.
- 오프라인 시 §1-2 큐로 분기.

### 3-4. 파일 미리보기

| 타입 | 미리보기 |
|---|---|
| 이미지 | 풀스크린 핀치 줌 (`PinchZoomImage.tsx`) |
| PDF | `PdfViewer.tsx` (Phase3 §8-1) |
| 비디오 | 인라인 `<video controls>` |
| 오피스 문서 | 다운로드만 (또는 Office Online 임베드) |
| 기타 | 파일 아이콘 + 다운로드 |

### 3-5. 산출

- `app/components/CameraInput.tsx`
- `app/lib/imageCompress.ts`
- `app/components/PinchZoomImage.tsx`
- 3 PR.

### 3-6. 검수

- [ ] 후면 카메라 직접 촬영 → 압축 → 업로드 완결.
- [ ] HEIC 파일 iOS에서 정상 업로드.
- [ ] 3G 시뮬레이션에서 업로드 진행률 표시.

---

## 4. 제스처 · 햅틱

### 4-1. 스와이프-삭제 (리스트 카드)

**컴포넌트**: `SwipeableCard.tsx`
- 좌 → 우 스와이프: 보조 액션 (보관·중요표시).
- 우 → 좌 스와이프: 위험 액션 (삭제) — 두 번째 탭으로 확인.
- React 18 + `framer-motion` 또는 `react-swipeable`.

**적용**
- 메신저 채팅방 목록 (보관·삭제)
- 알림 목록 (읽음·삭제)
- 결재함 (반려·승인 — 위험도 낮은 경우만)

### 4-2. 롱프레스

**훅**: `useLongPress.ts` (400ms 기본)
- 카드 롱프레스 → 컨텍스트 시트 (공유·복사·삭제·신고).
- iOS 텍스트 선택 충돌 방지 — `user-select: none` + `touch-callout: none`.

### 4-3. 햅틱 피드백

**유틸**: `app/lib/haptics.ts`
```ts
export const haptic = {
  light:  () => navigator.vibrate?.(10),
  medium: () => navigator.vibrate?.(20),
  heavy:  () => navigator.vibrate?.(40),
  success: () => navigator.vibrate?.([15, 30, 15]),
  warning: () => navigator.vibrate?.([10, 50, 10, 50]),
};
```

**적용 지점**
- OP체크 상태 전환 → `success`
- 위험 액션 확인 → `warning`
- 풀-투-리프레시 트리거 → `light`
- iOS는 `navigator.vibrate` 미지원 — try/catch로 무음 fallback.

### 4-4. 풀-투-리프레시

Phase3 §8-1 `PullToRefresh.tsx` 와 통합 — 본 절에서 햅틱·임계값만 정의.
- 임계값: 80px 이상 당기면 트리거.
- 임계 도달 시 `haptic.light()`.

### 4-5. 산출

- `SwipeableCard.tsx`, `useLongPress.ts`, `haptics.ts`
- 2 PR.

### 4-6. 검수

- [ ] 스와이프-삭제가 채팅방 목록에서 동작.
- [ ] 롱프레스가 텍스트 선택과 충돌 없음.
- [ ] 햅틱이 안드로이드에서 동작, iOS에서는 무음 fallback.

---

## 5. 퍼포먼스

### 5-1. 번들 사이즈 모니터링

- `next-bundle-analyzer` 도입.
- 모바일 진입 페이지(`/main`, `/main/홈`, `/main/근태`)의 initial JS **150KB gzipped 이하** 목표.
- 페이지별 dynamic import (각 화면군은 lazy load).

### 5-2. 이미지 최적화

- 모든 정적 이미지 `next/image` 사용 (WebP 자동, lazy load).
- 사용자 업로드 이미지는 §3-2 압축 + 서버 측 srcset 생성.
- 아이콘은 Lucide(SVG) 사용 — 이모지 PNG 사용 금지 (T-006).

### 5-3. 3G 시나리오 회귀

- Playwright `--throttle 3g` 또는 Chrome DevTools throttling.
- 대표 12 화면의 LCP **3.5초 이하** 목표.
- 첫 화면 위 fold는 SSR/RSC로 즉시 노출, 아래는 streaming.

### 5-4. 폰트

- Pretendard `font-display: swap`.
- 가변 폰트 사용 시 weight별 분할 로딩 금지 — 1개 woff2로.
- preload는 본문 weight 400/700만.

### 5-5. 검수

- [ ] Lighthouse 모바일 Performance 80+ (대표 12 화면 평균).
- [ ] LCP 3.5초 이하 (3G).
- [ ] CLS 0.1 이하.
- [ ] FID/INP 200ms 이하.

### 5-6. 산출

- `next.config.mjs` 번들 분석 옵션.
- `app/main/*/page.tsx` dynamic import.
- 3 PR.

---

## 6. 접근성

### 6-1. 스크린리더

- 모든 인터랙티브 요소 `aria-label` 강제 (특히 아이콘 버튼).
- BottomTab 활성 항목 `aria-current="page"`.
- BottomSheet 열림 시 focus trap + `role="dialog"` + `aria-labelledby`.
- 표 → 카드 분기 시 카드에도 행 의미 부여 (`role="row"` 또는 의미 있는 라벨).

### 6-2. 대비

- WCAG AA — 본문 4.5:1, 큰 텍스트 3:1.
- `--muted` 색 검증 — `#71717A` on `#F8F8F9` 약 4.6:1 (통과).
- accent 위 흰 텍스트, danger 위 흰 텍스트 검증.

### 6-3. 포커스 링

- 키보드 포커스 시 `outline: 2px solid var(--accent); outline-offset: 2px;` 강제.
- 모바일 터치 포커스는 숨기되 (`:focus:not(:focus-visible)`), 키보드는 표시.

### 6-4. 접근성 회귀

- `pnpm test:a11y` (T-018) — axe-core 자동 회귀.
- 대표 12 화면에서 critical/serious 0건 유지.

### 6-5. 산출

- `globals.css` focus-visible 룰.
- 각 컴포넌트 aria 보강.
- 2 PR.

---

## 7. 모바일 네비게이션 히스토리

### 7-1. 뒤로가기 정책

- 모달/시트 열림 → 안드로이드 뒤로가기 = 시트 닫기 (페이지 이동 X).
- `popstate` 리스너로 BottomSheet/Modal 자동 닫기.
- 라우터 push 대신 router.replace 사용 케이스 명시 (필터 변경 등).

### 7-2. 깊은 라우팅 진입 시 BottomTab 위치 복원

- `/main/근태/연차/신청내역/123` 진입 → 뒤로가기 시 BottomTab 활성 위치가 "내정보"로 복귀.

### 7-3. 산출 / 검수

- `app/hooks/useDismissOnBack.ts`
- [ ] 시트 열림 상태에서 안드로이드 뒤로가기 → 시트만 닫힘.
- [ ] iOS 스와이프 백 제스처 동작.

---

## 8. 진행 순서 (Phase 3 완료 이후)

```
P1 묶음 (병렬 가능, 2주):
  §1 PWA + 오프라인 큐
  §2 키보드/IME
  §3 카메라/이미지 업로드

P2 묶음 (1.5주):
  §4 제스처/햅틱
  §5 퍼포먼스
  §6 접근성

P3 (3일):
  §7 네비게이션 히스토리
```

총 **3.5–4주**. 전체 모바일 작업 (Tasks + Phase3 + Advanced) **약 12주**.

---

## 9. 시작 명령 (사용자 → Claude Code)

> "`MSO_Mobile_Advanced.md` §1 PWA·오프라인 큐부터 시작해줘.
> §1·§2·§3 은 병렬로 진행 가능 — 다른 PR로 분리해서.
> 푸시 알림은 백엔드 VAPID 키 발급되면 알려줄게."
