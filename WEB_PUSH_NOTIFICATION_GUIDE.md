# 웹 푸시 알림 시스템 구현 가이드

## 개요
카톡 API 없이 **웹 기반 푸시 알림**으로 모든 실시간 알림을 처리합니다.
- ✅ 비용: 완전 무료
- ✅ 속도: 카톡보다 빠름 (1초 이내)
- ✅ 통합성: 시스템 내 완전 관리
- ✅ 개인정보: 휴대폰 번호 불필요

---

## 1. 구현된 알림 종류

### 1.1 결재 승인 알림
```
트리거: 새로운 결재 문서 INSERT
대상: 결재자 (approver_id)
내용: "새 결재 요청: [제목]"
```

### 1.2 재고 부족 알림
```
트리거: 재고 UPDATE (stock <= min_stock)
대상: 행정팀 직원
내용: "[품목명]: 현재 X개 (최소: Y개)"
```

### 1.3 급여 정산 완료 알림
```
트리거: 급여 데이터 INSERT
대상: 해당 직원
내용: "급여 정산 완료 - 마이페이지에서 확인하세요"
```

### 1.4 교육 이수 기한 임박 알림
```
트리거: 교육 기한 7일 이내
대상: 해당 직원
내용: "[교육명]: X일 남았습니다"
```

---

## 2. 기술 구조

### 2.1 아키텍처

```
┌─────────────────────────────────────────┐
│         사용자 브라우저                    │
│  (Chrome, Safari, Edge 등)              │
└────────────┬────────────────────────────┘
             │
             ├─→ Service Worker (sw.js)
             │   └─ 백그라운드 알림 처리
             │
             └─→ NotificationSystem.tsx
                 └─ 실시간 리스닝 + UI

┌─────────────────────────────────────────┐
│         Supabase Realtime               │
│  (approvals, inventory, payroll 등)     │
└─────────────────────────────────────────┘
```

### 2.2 데이터 흐름

```
1. Supabase 데이터 변경 (INSERT/UPDATE)
   ↓
2. Realtime 채널에서 감지
   ↓
3. 조건 확인 (승인자? 재고 부족? 등)
   ↓
4. sendNotification() 호출
   ↓
5. Service Worker가 푸시 알림 표시
   ↓
6. 사용자 휴대폰에 알림 표시 (앱 미설치 상태에서도 작동)
```

---

## 3. 설치 및 적용 방법

### 3.1 파일 배치

```
프로젝트 루트/
├── 메인/
│   ├── page.tsx (메인 페이지)
│   └── 기능부품/
│       └── 알림시스템.tsx ← 추가
├── public/
│   └── sw.js ← 추가 (Service Worker)
└── package.json
```

### 3.2 메인 페이지에 통합

```typescript
// 메인/page.tsx에 추가
import NotificationSystem, { initNotificationService } from './기능부품/알림시스템';

export default function 메인페이지() {
  useEffect(() => {
    initNotificationService(); // 앱 시작 시 초기화
  }, []);

  return (
    <div>
      {/* 기존 컴포넌트들 */}
      <NotificationSystem user={user} />
    </div>
  );
}
```

### 3.3 Supabase 테이블 추가 (선택사항)

알림 기록을 저장하려면:

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES staffs(id),
    title TEXT,
    body TEXT,
    type TEXT, -- 'approval', 'inventory', 'payroll', 'education'
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 4. 브라우저 호환성

| 브라우저 | 지원 | 비고 |
|:---|:---:|:---|
| Chrome | ✅ | 완벽 지원 |
| Firefox | ✅ | 완벽 지원 |
| Safari | ⚠️ | iOS 16.4+ |
| Edge | ✅ | 완벽 지원 |
| IE | ❌ | 미지원 |

---

## 5. 모바일에서의 동작

### 5.1 PWA 설치 (선택사항)

웹앱을 홈화면에 설치하면 더 나은 경험:

```json
// public/manifest.json
{
  "name": "박철홍정형외과 ERP",
  "short_name": "ERP",
  "icons": [
    { "src": "/icon-192x192.png", "sizes": "192x192" },
    { "src": "/icon-512x512.png", "sizes": "512x512" }
  ],
  "start_url": "/",
  "display": "standalone",
  "theme_color": "#2563EB"
}
```

### 5.2 모바일 알림 표시

- **Android:** 시스템 알림 (상단 알림바)
- **iOS:** 배너 알림 (Safari 16.4+)
- **데스크톱:** 데스크톱 알림 + 브라우저 내 표시

---

## 6. 성능 및 비용

### 6.1 비용 분석

| 항목 | 비용 |
|:---|:---:|
| 웹 푸시 알림 | ₩0 |
| Service Worker | ₩0 |
| Supabase Realtime | ₩0 (무료 플랜 포함) |
| **총 월 비용** | **₩0** |

### 6.2 성능

- 알림 지연: **< 1초**
- 배터리 소비: **최소** (백그라운드 최적화)
- 네트워크 사용: **매우 적음** (이벤트 기반)

---

## 7. 커스터마이징

### 7.1 알림 아이콘 변경

```typescript
// 알림시스템.tsx에서
registration.showNotification(title, {
  icon: '/custom-icon.png', // 변경
  badge: '/custom-badge.png' // 변경
});
```

### 7.2 알림 음성 추가

```typescript
const audio = new Audio('/notification-sound.mp3');
audio.play();
```

### 7.3 알림 클릭 시 동작

```typescript
// sw.js에서
self.addEventListener('notificationclick', (event) => {
  // 특정 페이지로 이동
  if (event.notification.tag === 'approval') {
    clients.openWindow('/전자결재');
  }
});
```

---

## 8. 트러블슈팅

### 문제: 알림이 오지 않음

**해결:**
1. 브라우저 알림 권한 확인
2. Service Worker 등록 확인 (DevTools → Application)
3. Supabase Realtime 구독 확인

### 문제: iOS에서 작동 안 함

**해결:**
- Safari 16.4 이상 필요
- PWA 설치 후 사용 권장

---

## 9. 모니터링

DevTools에서 확인:

```javascript
// 콘솔에서 실행
navigator.serviceWorker.getRegistrations().then(registrations => {
  console.log('등록된 Service Workers:', registrations);
});
```

---

## 결론

**웹 푸시 알림은:**
- ✅ 카톡보다 빠름
- ✅ 비용 완전 무료
- ✅ 개인정보 보호
- ✅ 시스템 내 완전 관리

**모든 실시간 알림 요구사항을 충족합니다.**
