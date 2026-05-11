# PWA 설정 계획

작성일: 2026-05-11  
근거: Phase 3 D2 권장안 (PWA), `public/` 기존 자산 활용

---

## 1. 현황 파악

### 기존 자산 (변경 없이 활용)
| 파일 | 용도 |
|---|---|
| `public/sw.js` | 정적 자산 캐시 + Web Share Target + FCM 백그라운드 메시지 처리 (stale-while-revalidate 내장) |
| `public/firebase-messaging-sw.js` | FCM 전용 SW — `sw.js`와 별개로 Firebase 초기화 |
| `public/push-notification-shared.js` | 두 SW가 공유하는 알림 로직 (800줄) |
| `public/icon-192x192.png` | 홈 화면 아이콘 (192×192) |
| `public/icon-512x512.png` | 스플래시 / 마스크 아이콘 (512×512) |
| `public/apple-touch-icon.png` | iOS 홈 화면 아이콘 |
| `public/sy-icon-192x192.png` | SY INC. 브랜드 아이콘 (멀티 테넌트 대응) |
| `public/sy-icon-512x512.png` | SY INC. 512px |
| `public/badge-72x72.png` | 푸시 알림 뱃지 |
| `public/sy-badge-72x72.png` | SY INC. 뱃지 |
| `public/.well-known/assetlinks.sample.json` | Android TWA 준비 (샘플) |

### manifest.json 상태
`app/manifest.json` — **파일 없음** (Glob 결과: No files found)  
`public/manifest.json` — **파일 없음** (없음 확인)  

→ **신규 작성 필요**: `public/manifest.json`

---

## 2. manifest.json 초안

```json
{
  "name": "MSO ERP",
  "short_name": "MSO ERP",
  "description": "병원 ERP 시스템 — 인사·급여·퇴원심사·채팅 통합 플랫폼",
  "start_url": "/main",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui", "browser"],
  "background_color": "#ffffff",
  "theme_color": "#2563EB",
  "orientation": "portrait-primary",
  "scope": "/",
  "lang": "ko",
  "dir": "ltr",
  "categories": ["business", "medical"],
  "icons": [
    {
      "src": "/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/apple-touch-icon.png",
      "sizes": "180x180",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/badge-72x72.png",
      "sizes": "72x72",
      "type": "image/png",
      "purpose": "monochrome"
    }
  ],
  "share_target": {
    "action": "/share-target",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "title": "title",
      "text": "text",
      "url": "url",
      "files": [
        {
          "name": "files",
          "accept": ["image/*", "video/*", "application/pdf", ".doc", ".docx", ".xls", ".xlsx"]
        }
      ]
    }
  },
  "shortcuts": [
    {
      "name": "채팅",
      "short_name": "채팅",
      "description": "업무 채팅방 바로가기",
      "url": "/main?open_menu=채팅",
      "icons": [{ "src": "/icon-192x192.png", "sizes": "192x192" }]
    },
    {
      "name": "전자결재",
      "short_name": "결재",
      "description": "결재함 바로가기",
      "url": "/main?open_menu=전자결재",
      "icons": [{ "src": "/icon-192x192.png", "sizes": "192x192" }]
    },
    {
      "name": "알림",
      "short_name": "알림",
      "description": "알림 센터 바로가기",
      "url": "/main?open_menu=알림",
      "icons": [{ "src": "/icon-192x192.png", "sizes": "192x192" }]
    }
  ],
  "protocol_handlers": [],
  "prefer_related_applications": false
}
```

### 주요 설정 근거
- `display: standalone` — 브라우저 주소창 숨기기 (앱처럼)
- `display_override` — 지원 브라우저에서 `standalone` 우선, 불지원 시 `browser` 폴백
- `start_url: /main` — 로그인 후 메인 화면 직접 진입 (로그인은 `/login`으로 리다이렉트)
- `theme_color: #2563EB` — `--accent` 값과 동일 (디자인 시스템 연동)
- `share_target` — 기존 `sw.js`의 Share Target POST 처리와 일치
- `shortcuts` — 홈 화면 아이콘 롱프레스 시 빠른 진입

---

## 3. HTML `<head>` 메타 태그 추가 위치

`app/layout.tsx` (또는 `app/(main)/layout.tsx`) 에 추가:

```tsx
// app/layout.tsx
<head>
  <link rel="manifest" href="/manifest.json" />
  <meta name="theme-color" content="#2563EB" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="default" />
  <meta name="apple-mobile-web-app-title" content="MSO ERP" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
  <link rel="apple-touch-icon" sizes="192x192" href="/icon-192x192.png" />
</head>
```

---

## 4. Service Worker 전략

### 현행 sw.js 캐시 전략 분석
```
[정적 자산] — stale-while-revalidate
  - 대상: .js, .css, .woff2, .ttf, .png, .jpg, .svg, .ico, .webp
  - 캐시명: erp-static-v1
  - 동작: 캐시 히트 즉시 응답 + 백그라운드 갱신

[Share Target POST /share-target] — 처리 후 /main?... 리다이렉트

[기타 모든 요청] — pass-through (캐시 안 함)
```

### Phase 3 추가 권장 전략

| 경로 패턴 | 전략 | 캐시명 | 이유 |
|---|---|---|---|
| `/main` (네비게이션) | network-first, 오프라인 fallback | `erp-pages-v1` | 로그인 상태 의존, 항상 최신 데이터 필요 |
| `/login` (네비게이션) | network-first, 캐시 fallback | `erp-pages-v1` | 오프라인 시 "연결 필요" 안내 페이지 표시 |
| `/api/*` | network-only | — | 세션 의존 API — 절대 캐시 금지 |
| `/_next/static/*` | cache-first (변경 없음) | `erp-static-v1` | 해시 기반 파일명 → 영구 캐시 안전 |
| 외부 자산 (gstatic 등) | stale-while-revalidate | `erp-cdn-v1` | Firebase SDK JS |

### 오프라인 폴백 페이지
- `/offline.html` 정적 페이지 작성 필요 (간단한 "네트워크 연결을 확인해 주세요" 안내)
- activate 이벤트에서 미리 캐시에 저장

---

## 5. 앱 설치 프롬프트 UX

### 트리거 조건
- Android Chrome: `beforeinstallprompt` 이벤트 수신 시
- iOS Safari: 수동 안내 (Add to Home Screen 직접 유도)
- 표시 시점: **사용자가 앱을 3회 이상 방문한 후** (localStorage 카운터)
  - 앱 진입 즉시 표시 금지 — 거부율 높음

### 모바일 더보기 시트 진입점

Phase 3 ⑧ 채팅/내정보 통합의 바텀탭 "내정보" 탭 → 상단 더보기(···) → "앱으로 설치":

```
[내정보 화면 더보기 메뉴]
├── 프로필 수정
├── 알림 설정
├── 앱으로 설치  ← beforeinstallprompt 저장된 경우에만 표시
│                   iOS의 경우: "홈 화면에 추가하는 방법" 안내 시트
└── 로그아웃
```

### iOS 안내 시트 (iOS Safari 전용)
- `window.navigator.standalone`이 `false`이고 `userAgent`에 `iPhone/iPad` 포함 시 표시
- 바텀시트 내용: "Safari 하단 공유 버튼 → '홈 화면에 추가' 선택"
- iOS 16.4 미만에서는 푸시 알림 불가 명시

### 설치 성공 후 처리
```typescript
// 설치 완료 감지
window.addEventListener('appinstalled', () => {
  localStorage.setItem('pwa_installed', '1');
  // 인앱 토스트: "앱이 홈 화면에 추가되었습니다"
});
```

---

## 6. VAPID 푸시 연동 (신규 BottomTab 알림 탭)

현행 `/api/notifications/push-config` (GET, 24시간 캐시):
- VAPID 공개키 반환
- Phase 3 알림 탭 초기 진입 시 호출 → `PushManager.subscribe()` 실행
- 구독 결과를 `POST /api/notifications/push-subscription`으로 저장

BottomTab 알림 탭 배지 카운트 업데이트 흐름:
```
[SW push 수신]
  → self.navigator.setAppBadge()   (브라우저 앱 뱃지)
  → erpBroadcastPreviewToVisibleClients()  (인앱 토스트)
  → Supabase Realtime 구독  (알림 탭 숫자 배지 실시간 갱신)
```

---

## 7. 구현 우선순위

| 작업 | 우선순위 | 담당 파일 |
|---|---|---|
| `public/manifest.json` 작성 | 높음 | 이 문서의 초안 사용 |
| `app/layout.tsx` 메타 태그 추가 | 높음 | `<head>` 섹션 |
| `public/offline.html` 작성 | 중간 | 단순 안내 페이지 |
| sw.js 네비게이션 캐시 추가 | 중간 | `public/sw.js` |
| 설치 프롬프트 컴포넌트 | 낮음 | `app/components/PwaInstallPrompt.tsx` |

---

## 8. 호환성 주의

| 플랫폼 | 지원 | 제약 |
|---|---|---|
| Android Chrome 80+ | 완전 지원 | — |
| iOS Safari 16.4+ | 부분 지원 | 홈 화면 추가 필수, 푸시는 16.4 이상만 |
| iOS Safari 16.3 이하 | 오프라인 캐시만 | 푸시 알림 불가 |
| Samsung Internet | 완전 지원 | — |
| Desktop Chrome/Edge | 설치 가능 | 바로가기 3개 표시 |
