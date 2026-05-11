# 푸시 알림 UX 재설계 계획

작성일: 2026-05-11  
근거: Phase 3 ⑧ BottomTab 알림 탭 통합 + JM3/JM5

---

## 1. 현황 분석

### 기존 구현 요약
- `public/sw.js` — 정적 자산 캐시 + FCM 백그라운드 메시지 + Web Share Target
- `public/firebase-messaging-sw.js` — FCM 전용 SW
- `public/push-notification-shared.js` — 공유 알림 로직 (800줄)
  - 카테고리별 딥링크 라우팅 (채팅/결재/게시판/재고/내정보)
  - IndexedDB 기반 retry 큐 (오프라인 → 온라인 복귀 시 재시도)
  - `self.navigator.setAppBadge()` — 앱 아이콘 뱃지
  - 채팅 알림 인라인 답장 (Notification Actions API)
- `app/api/notifications/` — 구독 등록/해제, 읽음 처리, 설정 조회

### 현행 알림 타입 (metadata.type)
| 타입 | 딥링크 대상 |
|---|---|
| `message`, `mention` | 채팅방 |
| `approval`, `electronic_approval` | 전자결재 |
| `board`, `notice` | 게시판 |
| `inventory` | 재고관리 |
| `payroll`, `hr`, `attendance` | 내정보 |
| `notification` | 알림 센터 |

---

## 2. 권한 요청 타이밍 전략 (JM3 graceful fallback)

### 원칙: 사용자 행동 직전 요청 (Permission Request Just-In-Time)

앱 진입 즉시 권한 요청 금지 — 거부율 70~80%, iOS에서 1회 거부 시 재요청 불가.

### 요청 트리거 시점

| 시점 | 조건 | 방법 |
|---|---|---|
| BottomTab "알림" 탭 첫 진입 | 권한 `default` 상태 | 인앱 사전 안내 카드 → 허용 버튼 → `Notification.requestPermission()` |
| 채팅방 첫 메시지 수신 | 권한 `default` | 채팅창 상단 배너: "채팅 알림을 받으려면 허용하세요" |
| 결재 요청 발송 | 권한 `default` | "결재자에게 알림이 갑니다. 나도 알림 받기?" 시트 |
| 앱 설치 완료 (PWA) | 권한 `default` | 설치 완료 토스트 하단: "알림도 설정하기" CTA |

### 권한 거부 시 폴백 (JM3)

```
권한 = granted  → FCM + Web Push 모두 활성화
권한 = denied   → 인앱 알림(폴링 or Supabase Realtime)으로 완전 대체
                   BottomTab 알림 탭에 미읽 배지 표시 (푸시 없이)
                   설정 화면에서 "알림 설정" → 브라우저 설정 안내 링크 표시
권한 = default  → 요청 전 인앱 안내 카드 표시 (위 트리거 시점)
```

---

## 3. 알림 카테고리 (4종) 및 사일런스 옵션

### 카테고리 정의

| 카테고리 | 포함 알림 타입 | 기본값 | 사일런스 가능 |
|---|---|---|---|
| **결재** | `approval`, `electronic_approval`, `roster_schedule_approval` | 켜짐 | 예 |
| **채팅** | `message`, `mention` | 켜짐 | 예 (시간대별 설정 가능) |
| **할일** | `todo`, `todo_reminder` | 켜짐 | 예 |
| **시스템** | `system`, `hr`, `payroll`, `attendance`, `notice` | 켜짐 | 아니오 (항상 수신) |

### 카테고리별 사일런스 설정 UX

**위치**: BottomTab "알림" 탭 → 상단 "알림 설정" 아이콘(기어)

```
[알림 설정]
├── 결재 알림        [ON/OFF 토글]
│   └── 결재 요청 / 승인 완료 / 반려
├── 채팅 알림        [ON/OFF 토글]
│   ├── 모든 메시지
│   ├── 멘션(@나)만
│   └── 방해금지 시간대: [22:00 ~ 07:00]  (토글)
├── 할일 알림        [ON/OFF 토글]
│   └── 마감 30분 전 / 1시간 전 / 당일 아침
└── 시스템 알림      [항상 ON - 변경 불가]
    └── 급여 지급, 인사 발령, 공지사항
```

### Supabase 테이블 확장 (신규 컬럼)
`staff_members` 또는 별도 `notification_preferences` 테이블:
```sql
-- 신규 테이블 권장 (staff_members 비대화 방지)
CREATE TABLE notification_preferences (
  staff_id      TEXT PRIMARY KEY REFERENCES staff_members(id),
  approval_push BOOLEAN DEFAULT TRUE,
  chat_push     BOOLEAN DEFAULT TRUE,
  chat_mention_only BOOLEAN DEFAULT FALSE,
  chat_dnd_enabled  BOOLEAN DEFAULT FALSE,
  chat_dnd_start    TIME DEFAULT '22:00',
  chat_dnd_end      TIME DEFAULT '07:00',
  todo_push         BOOLEAN DEFAULT TRUE,
  todo_remind_min   INT DEFAULT 30,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. BottomTab 알림 탭 배지 +1 연동

### 흐름

```
1. SW push 수신 (sw.js → erpShowIncomingNotification)
   └─ self.navigator.setAppBadge()         (브라우저 앱 아이콘 뱃지)
   └─ erpBroadcastPreviewToVisibleClients() (인앱 토스트 + 알림 탭 배지 갱신)

2. 포그라운드: 앱이 열려있는 경우
   - SW → postMessage('erp-push-preview', payload)
   - React 컴포넌트: message 이벤트 수신 → 알림 탭 배지 state +1

3. 백그라운드: 앱이 닫혀있는 경우
   - Notification 클릭 → /main?open_menu=알림 딥링크
   - 마운트 시 Supabase에서 미읽 알림 카운트 조회 → 배지 초기화

4. 알림 읽음 처리
   - POST /api/notifications/mark-read → 배지 -1
   - "모두 읽음" → clearAppBadge() + 배지 0
```

### React 컴포넌트 연동 (pseudo-code)

```typescript
// app/components/NotificationBadge.tsx
// SW로부터 메시지 수신 → 배지 카운트 갱신
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type === 'erp-push-preview') {
      setUnreadCount((prev) => prev + 1);
    }
    if (event.data?.type === 'erp-notification-read-sync') {
      setUnreadCount((prev) => Math.max(0, prev - 1));
    }
  };
  navigator.serviceWorker?.addEventListener('message', handleMessage);
  return () => navigator.serviceWorker?.removeEventListener('message', handleMessage);
}, []);
```

---

## 5. iOS PWA 푸시 한계 (명시)

### iOS 16.4 이상 (2023년 3월 이후 기기)
- **홈 화면에 추가(PWA)** 상태에서만 Web Push 지원
- Safari 브라우저 탭으로 접속 시 푸시 미지원
- FCM(Firebase Cloud Messaging)을 통한 푸시도 PWA 설치 필요
- 설치 방법: Safari → 공유 버튼 → "홈 화면에 추가"

### iOS 16.3 이하
- 웹 푸시 알림 전혀 불가 (브라우저/PWA 모두)
- 대응: Supabase Realtime 구독으로 인앱 알림만 제공
- 인앱 알림 뱃지 카운트는 정상 동작

### 검출 및 안내 로직

```typescript
function detectPushCapability() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const iosVersion = isIOS
    ? parseInt(ua.match(/OS (\d+)_/)?.[1] ?? '0', 10)
    : Infinity;
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (!isIOS) return 'full';
  if (iosVersion >= 17) return isStandalone ? 'full' : 'install-required';
  if (iosVersion === 16) return isStandalone ? 'ios164-check' : 'install-required';
  return 'unsupported'; // iOS 15 이하
}
```

| 결과 | 표시 메시지 |
|---|---|
| `full` | 정상 (안내 불필요) |
| `install-required` | "홈 화면에 추가하면 알림을 받을 수 있습니다" 배너 |
| `ios164-check` | "iOS 16.4 이상에서 홈 화면 추가 시 알림 지원" 안내 |
| `unsupported` | "이 기기에서는 알림을 받을 수 없습니다. 인앱 알림으로 확인해 주세요" |

---

## 6. 알림 카테고리별 서버 발송 필터링

크론 잡 (`/api/cron/chat-push-dispatch` 등) 에서 발송 시 `notification_preferences` 조회:

```typescript
// 의사 코드 — lib/push-dispatcher.ts
async function shouldSendPush(
  staffId: string,
  category: 'approval' | 'chat' | 'todo' | 'system'
): Promise<boolean> {
  if (category === 'system') return true; // 시스템 알림은 항상

  const pref = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('staff_id', staffId)
    .single();

  if (!pref.data) return true; // 설정 없으면 기본값(켜짐)

  if (category === 'chat') {
    // 방해금지 시간대 체크
    if (pref.data.chat_dnd_enabled) {
      const now = new Date();
      const hour = now.getHours();
      // dnd_start ~ dnd_end 범위면 false
      if (isInDndRange(hour, pref.data.chat_dnd_start, pref.data.chat_dnd_end)) {
        return false;
      }
    }
    return pref.data.chat_push;
  }

  return pref.data[`${category}_push`] ?? true;
}
```

---

## 7. 인앱 알림 (푸시 거부/불가 시 폴백)

JM3 원칙: 푸시 권한 거부 시 사용자는 알림을 **완전히 받지 못하는 것이 아니라** 인앱 알림으로 수신.

### 구현 방식
1. **Supabase Realtime** (`notifications` 테이블 변경 구독)
   - 앱이 열려 있는 동안 실시간으로 새 알림 수신
   - BottomTab 알림 탭 배지 갱신

2. **폴링 폴백** (Realtime 미지원 환경)
   - 30초 간격 `/api/notifications/unread-count` 폴링 (추가 API 필요)
   - 앱 포그라운드 진입 시 즉시 조회

3. **인앱 토스트** (채팅 알림 배너)
   - `app/main/기능부품/채팅알림배너.tsx` 기존 컴포넌트 활용
   - 푸시 알림 도착 시 SW → React postMessage → 토스트 표시 (이미 구현됨)

---

## 8. VAPID 토큰 보안 (JM5)

현행 `/api/notifications/push-config`:
- VAPID 공개키만 반환 (비밀키 노출 없음) ✓
- 24시간 캐시 (`Cache-Control: public, max-age=86400`) ✓
- 인증 불필요 (공개 정보) ✓

`push_subscriptions` 테이블:
- `endpoint`, `p256dh`, `auth` — 암호화된 공개 정보이므로 로그 출력 금지 ✓
- `fcm_token` — 내부 로그에도 마스킹 처리 권장 (`token.slice(0,8) + '...'`)
- `staff_id` — 서버사이드에서 세션 검증 후 바인딩 ✓
- 최대 10개 구독 초과 시 오래된 것 자동 정리 ✓

---

## 9. 구현 우선순위

| 작업 | 우선순위 | 연관 파일 |
|---|---|---|
| BottomTab 알림 탭 배지 SW 연동 | 높음 | `app/components/NotificationBadge.tsx` (신규) |
| 권한 요청 Just-In-Time 컴포넌트 | 높음 | `app/components/PushPermissionRequest.tsx` (신규) |
| iOS 푸시 한계 감지 + 안내 | 높음 | `app/utils/push-capability.ts` (신규) |
| `notification_preferences` 테이블 + API | 중간 | Supabase 마이그레이션 + `app/api/notifications/preferences/route.ts` |
| 카테고리별 사일런스 설정 UI | 중간 | `app/main/기능부품/알림시스템.tsx` 확장 |
| 방해금지 시간대 서버 필터링 | 낮음 | `lib/push-dispatcher.ts` |
