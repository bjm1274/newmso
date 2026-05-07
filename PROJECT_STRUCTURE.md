# MSO ERP 프로젝트 구조

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS v4 |
| 언어 | TypeScript |
| DB / Auth | Supabase (PostgreSQL, Realtime, Storage, Auth) |
| AI | OpenAI (채팅), Google Gemini (퇴원심사) |
| 배포 | Vercel |
| 푸시 알림 | Web Push (VAPID) |
| PWA | Service Worker, TWA (Android) |

## 디렉토리 구조

```
/
├── app/                          # Next.js App Router 루트
│   ├── api/                      # API 라우트
│   │   ├── admin/                # 관리자 전용 (연차부여, 팝업, 비밀번호, 시스템마스터 등)
│   │   ├── ai/                   # AI 채팅 (OpenAI)
│   │   ├── approvals/            # 전자결재 처리 (승인/반려, 첨부업로드)
│   │   ├── auth/                 # 인증 (마스터로그인, 비밀번호 검증)
│   │   ├── board/                # 게시판 첨부 업로드
│   │   ├── chart-ocr/            # 차트 OCR
│   │   ├── chat/                 # 메신저 첨부 업로드
│   │   ├── consultation/         # 수술상담
│   │   ├── cron/                 # 스케줄 작업 (연차만료, 자동보고, 백업, 푸시, 채팅보존 등)
│   │   ├── discharge-review/     # 퇴원심사 AI (Gemini)
│   │   ├── download/             # 파일 다운로드
│   │   ├── extract-invoice/      # 송장 OCR
│   │   ├── notifications/        # 알림 (읽음처리, 푸시구독, 자가테스트)
│   │   ├── payments/             # 결제 (가상계좌 입금, 웹훅)
│   │   ├── roster/               # 근무표 결재요청
│   │   ├── storage/              # 스토리지
│   │   ├── todos/                # 할일
│   │   └── weather/              # 날씨
│   ├── components/               # 전역 공용 컴포넌트
│   │   ├── ActionDialog.tsx      # 공용 확인/취소 다이얼로그
│   │   ├── AppLogo.tsx           # 앱 로고
│   │   ├── ErrorBoundary.tsx     # 에러 바운더리
│   │   ├── GlobalSearch.tsx      # 전역 검색
│   │   ├── OfflineStatusBanner.tsx     # 오프라인 상태 배너
│   │   ├── ProfilePhotoThumbnail.tsx   # 프로필 사진 썸네일
│   │   ├── PwaBootstrap.tsx      # PWA 초기화
│   │   ├── ThemeToggle.tsx       # 다크모드 토글
│   │   └── useActionDialog.tsx   # 다이얼로그 훅
│   ├── login/                    # 로그인 페이지
│   ├── share-target/             # PWA Share Target
│   ├── main/                     # 메인 앱 (인증 후 진입)
│   │   ├── page.tsx              # 메인 페이지 엔트리
│   │   ├── admin-menu-config.ts  # 관리자 메뉴 설정
│   │   ├── navigation-state.ts   # 네비게이션 상태 관리
│   │   ├── inventory-*.ts        # 재고 유틸리티 (5개 파일)
│   │   ├── hooks/                # 전역 커스텀 훅
│   │   │   ├── useERPData.ts     # ERP 데이터 페칭
│   │   │   ├── useERPSession.ts  # ERP 세션 관리
│   │   │   ├── useInventoryData.ts     # 재고 데이터
│   │   │   ├── useInventoryFilters.ts  # 재고 필터
│   │   │   ├── useNavigationIntent.ts  # 네비게이션 인텐트
│   │   │   ├── useStockModal.ts        # 재고 모달
│   │   │   └── useSupplyWorkflow.ts    # 납품 워크플로
│   │   ├── contexts/             # 전역 Context
│   │   │   ├── AppDataContext.tsx       # 앱 데이터 컨텍스트
│   │   │   ├── CompanyContext.tsx       # 회사 선택 컨텍스트
│   │   │   └── NavigationContext.tsx    # 네비게이션 컨텍스트
│   │   └── 기능부품/              # 핵심 UI 컴포넌트 (아래 상세)
│   ├── globals.css               # 전역 CSS (디자인 시스템 변수)
│   ├── layout.tsx                # 루트 레이아웃
│   └── page.tsx                  # 루트 페이지 (로그인 리다이렉트)
├── lib/                          # 공유 유틸리티 라이브러리 (아래 상세)
├── types/                        # 전역 TypeScript 타입 (index.ts)
├── public/                       # 정적 파일 (아이콘, SW, 로고)
├── supabase/                     # Supabase 설정
├── supabase_migrations/          # DB 마이그레이션
├── scripts/                      # 빌드/유틸리티 스크립트
├── tests/                        # 테스트
├── android-twa/                  # Android TWA 빌드
└── login/                        # 레거시 로그인 (참조용)
```

## 기능부품 디렉토리 상세

`app/main/기능부품/`은 ERP의 모든 기능 모듈이 모인 핵심 디렉토리다.
루트 `main/` 레거시 트리는 2026-04-23 기준으로 제거되었고, 기능 경로 판단은 모두 `app/main/...`을 기준으로 한다.

### 메인 메뉴 컴포넌트 (루트 레벨)

| 파일 | 설명 |
|------|------|
| `메신저.tsx` | 실시간 메신저 메인 컴포넌트 |
| `게시판.tsx` | 게시판/업무가이드 메인 |
| `전자결재.tsx` | 전자결재 메인 |
| `인사관리.tsx` | 인사/급여 관리 메인 |
| `재고관리통합.tsx` | 재고관리 통합 뷰 (현황, UDI, 명세서, 발주, 스캔, 촬영, 등록) |
| `관리자전용.tsx` | 관리자 전용 메뉴 메인 |
| `추가기능.tsx` | 추가 기능 메뉴 메인 |
| `알림인박스.tsx` | 알림 인박스 메인 |

### 알림 시스템

| 파일 | 설명 |
|------|------|
| `알림센터.tsx` | 실시간 알림센터 패널 (조직도 측면창에 삽입) |
| `알림시스템.tsx` | 알림 발송/수신 시스템 |
| `알림토스트.tsx` | 토스트 알림 UI |
| `알림푸시.ts` | 웹 푸시 알림 로직 |
| `알림필터.ts` | 알림 필터링 유틸 |
| `알림설정.ts` | 알림 설정 관리 |
| `채팅알림배너.tsx` | 채팅 알림 배너 |

### 메신저 모듈 (40+ 파일)

`메신저*.ts/tsx` 파일들로 구성. 주요 파일:

| 파일 | 설명 |
|------|------|
| `메신저.tsx` | 메인 메신저 컴포넌트 |
| `메신저컴포저.tsx` | 메시지 입력 UI |
| `메신저사이드바.tsx` | 대화방 목록 사이드바 |
| `메신저드로어.tsx` | 모바일/협소 화면용 메신저 보조 패널 |
| `메신저타임라인.tsx` | 메시지/투표/앨범 타임라인 렌더링 |
| `메신저유틸.ts` | 공용 유틸리티/상수 |
| `메신저타입.ts` | 메신저 공용 타입 |
| `메신저공통.tsx` | 공용 UI 컴포넌트 |
| `메신저구독훅.ts` | Supabase Realtime 구독/Presence/Typing 동기화 |
| `메신저전송훅.ts` | 메시지 전송/재시도 워크플로 |

### 기타 독립 컴포넌트

| 파일 | 설명 |
|------|------|
| `OP체크.tsx` | OP(수술) 체크리스트 |
| `op-check-components.tsx` | OP체크 하위 컴포넌트 |
| `op-check-utils.ts` | OP체크 유틸리티 |
| `ESL관리.tsx` | ESL(전자가격표시기) 관리 |
| `근무현황.tsx` | 근무현황 대시보드 |
| `근무표자동편성.tsx` | 근무표 자동 편성 메인 |
| `수술상담.tsx` | 수술상담 기능 |
| `퇴원심사.tsx` | 퇴원심사 AI (Gemini) |
| `직원평가시스템.tsx` | 직원평가 시스템 |
| `마감보고.tsx` | 마감보고 기능 |
| `입금실시간조회.tsx` | 가상계좌 입금 실시간 조회 |
| `공유캘린더.tsx` | 공유 캘린더 |
| `캘린더동기화.tsx` | 캘린더 동기화 |
| `권한요청모달.tsx` | 권한 요청 모달 |

### 서브 디렉토리

| 디렉토리 | 설명 |
|-----------|------|
| `조직도서브/` | 조직도 렌더링, 측면창, 본문 라우팅 |
| `게시판서브/` | 게시판 분리 컴포넌트(`BoardComposer.tsx`, `BoardScheduleCalendar.tsx`, `BoardPostList.tsx`, `BoardBodyPartPickerModal.tsx`)와 데이터/상호작용 hook(`useBoardDataSource.ts`, `useBoardPostInteractions.ts`, `useBoardReadStatus.ts`, `useBoardPostSubmit.ts`, `useBoardPostActions.ts`, `useBoardScheduleApprovalRequest.ts`), 업무가이드(`업무가이드.tsx`, `guide-types.ts`, `guide-utils.ts`) |
| `전자결재서브/` | 결재 양식 컴포넌트 + 분리 유틸(`approval-constants.ts`, `approval-utils.ts`) |
| `인사관리서브/` | 급여, 근태, 연차, 인사기록 |
| `재고관리서브/` | 재고 상세, UDI, 발주, 스캔 |
| `관리자전용서브/` | 관리자 하위 기능 (시스템마스터, 팝업관리 등) |
| `마이페이지/` | 마이페이지 하위 컴포넌트 |
| `알림인박스/` | 알림인박스 하위 컴포넌트 |
| `인계노트/` | 인계노트 하위 컴포넌트 |
| `공통/` | 공용 UI + 브라우저 다운로드 유틸 (`SmartDatePicker`, `SmartMonthPicker`, `managed-download.ts`) |
| `roster/` | 근무표자동편성 분리 엔진/UI/타입 (`RosterReviewPanel.tsx`, `RosterWizardSetupStep.tsx`, `RosterWizardStaffStep.tsx`, `RosterWizardExceptionsStep.tsx`, `roster-wizard-types.ts`, `roster-extra-utils*.ts`, `roster-*.ts`) |

## 파일 네이밍 규칙

### 한국어 파일명 (기본)

대부분의 컴포넌트와 유틸리티는 한국어 파일명을 사용한다:

- **컴포넌트**: `메신저.tsx`, `게시판.tsx`, `전자결재.tsx`
- **훅**: `메신저실시간훅.ts`, `메신저상태훅.ts`
- **유틸리티**: `메신저유틸.ts`, `게시판공통.ts`
- **서브 디렉토리**: `조직도서브/`, `인사관리서브/`

규칙:
- 공백, 밑줄(`_`), 하이픈(`-`) 없이 한국어를 연결하여 작성
- 훅 파일은 `*훅.ts` 접미사 사용
- 유틸리티는 `*유틸.ts` 또는 `*공통.ts` 접미사 사용
- 서브 디렉토리는 `*서브/` 접미사 사용

### 영문 파일명 (예외)

다음 경우에 영문 파일명을 유지한다:

- **`roster/` 디렉토리**: 근무표 자동편성 엔진. PascalCase (`RosterReviewPanel.tsx`) 또는 kebab-case (`roster-generation-engine.ts`)
- **`op-check-*` 계열**: OP체크 관련 파일 (`op-check-components.tsx`, `op-check-utils.ts`). `OP체크.tsx`에서 import.
- **기능별 분리 유틸**: `게시판서브/guide-types.ts`, `게시판서브/guide-utils.ts`, `게시판서브/useBoardDataSource.ts`, `게시판서브/useBoardPostInteractions.ts`, `전자결재서브/approval-utils.ts`, `공통/managed-download.ts`처럼 영문 kebab-case를 사용
- **`app/components/`**: 전역 공용 컴포넌트. PascalCase (`ErrorBoundary.tsx`, `GlobalSearch.tsx`)
- **`lib/`**: 전체 영문 kebab-case (`access-control.ts`, `supabase.ts`)
- **`types/`**: 영문 (`index.ts`)

### 배럴 파일 패턴

이 프로젝트에서는 배럴 파일(index.ts re-export)을 거의 사용하지 않는다. 각 컴포넌트를 직접 경로로 import하는 것이 기본이며, 예외적으로 대형 파일을 쪼갠 뒤 진입점을 유지하기 위한 얇은 재-export 파일만 둔다:

```ts
// 직접 import (프로젝트 표준)
import NotificationCenter from '../알림센터';
import { someUtil } from '@/lib/notification-utils';

// dynamic import (코드 스플리팅)
const loadInventoryView = () => import('../재고관리통합');
const InventoryView = dynamic(loadInventoryView, { ssr: false });
```

대표적인 예외는 `근무표자동편성-engine.ts`와 `근무표자동편성-types.ts`로, 내부적으로는 `근무표자동편성-engine-*` 및 `roster/*` 분리 파일을 다시 묶어 기존 import 경로를 유지한다. 그 외에는 `types/index.ts`가 전역 타입 re-export 역할을 한다.

## lib/ 주요 모듈

`lib/` 디렉토리는 서버/클라이언트 공용 유틸리티 라이브러리다. 모두 영문 kebab-case를 사용한다.

### 인증/권한

| 파일 | 설명 |
|------|------|
| `supabase.ts` | 클라이언트 Supabase 인스턴스 |
| `supabase-admin.ts` | 서비스 롤 Supabase 인스턴스 |
| `server-session.ts` | 서버 세션 관리 |
| `access-control.ts` | 메뉴/기능 접근 권한 제어 |
| `admin-credentials.ts` | 관리자 인증 |
| `staff-identity.ts` | 직원 식별/정규화 |
| `staff-password.ts` | 비밀번호 관리 |

### 전자결재

| 파일 | 설명 |
|------|------|
| `approval-service.ts` | 결재 서비스 로직 |
| `approval-workflow.ts` | 결재 워크플로 |
| `server-approval-processing.ts` | 서버사이드 결재 처리 |
| `server-approval-transition.ts` | 결재 상태 전환 |

### 급여/인사

| 파일 | 설명 |
|------|------|
| `ordinary-wage.ts` | 통상임금 계산 |
| `severance-pay.ts` | 퇴직금 계산 |
| `social-insurance.ts` | 4대보험 |
| `withholding-tax-file.ts` | 원천징수 |
| `annual-leave-*.ts` | 연차 관리 (만료, 원장, 승진부여) |
| `hr-*.ts` | 인사 유틸리티 |

### 알림

| 파일 | 설명 |
|------|------|
| `notification-metadata.ts` | 알림 메타데이터/라벨 |
| `notification-utils.ts` | 알림 텍스트 변환, 시간 포매팅 |
| `web-push-cloudflare.ts` | 웹 푸시 발송 |
| `push-quiet-hours.ts` | 방해금지 시간 |

### 재고

| 파일 | 설명 |
|------|------|
| `inventory-query-columns.ts` | 재고 쿼리 컬럼 정의 |
| `company.ts` | 회사/법인 관리 |
| `companyOrder.ts` | 회사 발주 |

### 기타

| 파일 | 설명 |
|------|------|
| `sounds.ts` | 알림음 재생 |
| `toast.ts` | 토스트 알림 |
| `date-formatter.ts` | 날짜 포매팅 |
| `rate-limit.ts` | API 레이트 리밋 |
| `audit.ts` | 감사 로그 |
| `realtime-maintenance.ts` | Supabase Realtime 유지보수 |
| `ThemeContext.tsx` | 테마(다크모드) 컨텍스트 |
| `upload-file-validation.ts` | 파일 업로드 검증 |
| `object-storage.ts` | 오브젝트 스토리지 유틸 |
| `roster-*.ts` | 근무표 편성 유틸리티 (6개 파일) |
| `*-query-columns.ts` | 각 도메인별 Supabase 쿼리 컬럼 정의 |

## 아키텍처 패턴

### 메뉴 라우팅

`조직도서브/조직도본문.tsx`가 메인 메뉴 라우터 역할을 한다. 메뉴별 컴포넌트를 `next/dynamic`으로 lazy-load하여 코드 스플리팅한다.

```
조직도본문.tsx (라우터)
  ├── dynamic(() => import('../메신저'))
  ├── dynamic(() => import('../게시판'))
  ├── dynamic(() => import('../전자결재'))
  ├── dynamic(() => import('../인사관리'))
  ├── dynamic(() => import('../재고관리통합'))
  ├── dynamic(() => import('../관리자전용'))
  └── ...
```

### 상태 관리

- **Context API**: `AppDataContext`, `CompanyContext`, `NavigationContext`로 전역 상태 관리
- **Supabase Realtime**: 메신저, 알림 등 실시간 데이터 동기화
- **로컬 스토리지**: 네비게이션 상태, 채팅방 설정 등 사용자 프리퍼런스

### API 라우트 패턴

- 서버 전용 로직은 `app/api/` 라우트에서 처리
- `lib/server-*.ts` 파일에 서버사이드 비즈니스 로직 분리
- `lib/cron-auth.ts`로 크론 잡 인증
- `lib/*-query-columns.ts`로 Supabase 쿼리 셀렉트 컬럼을 중앙 관리

### 컴포넌트 구조

각 메인 메뉴는 다음 패턴을 따른다:
- `{메뉴}.tsx` -- 메인 컴포넌트 (탭 전환, 상태 관리)
- `{메뉴}서브/` -- 하위 탭별 컴포넌트
- `{메뉴}공통.ts` 또는 `{메뉴}유틸.ts` -- 공용 유틸리티/상수
