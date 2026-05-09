# NEWMSO Figma 메뉴별 디자인 감사 보고서

- 작성일: 2026-05-09
- 대상: `newmso` Next.js 앱의 메인 메뉴, 하위 메뉴, 공통 셸, 주요 업무 화면
- 목적: Figma에서 디자인 시스템과 화면 개선안을 만들기 위한 메뉴별 세부 개선 보고서
- 조사 방식: 로컬 코드, 기존 감사 문서, 매뉴얼 스크린샷을 기준으로 메뉴 영역별 병렬 분석

## 0. 전제와 한계

이 세션에는 Figma 파일 컨텍스트에서 실행되는 `use_figma` 도구가 노출되어 있지 않았다. 따라서 Figma 캔버스를 직접 수정하거나 실제 Figma 노드를 읽지는 못했다.

대신 아래 산출물은 Figma에 바로 옮겨 설계할 수 있도록 페이지 구조, 토큰, 컴포넌트, 메뉴별 화면 개선 항목, 우선순위, 검증 기준을 정리한 설계 감사 보고서다.

## 1. 핵심 요약

### 최우선 개선 주제

1. 위험 작업 확인 UX 표준화
   - 현재 여러 고위험 작업이 `confirm()` 또는 `prompt()` 중심이다.
   - 인사 승인/반려, 퇴직 처리, 급여 확정, 계약 발송, 관리자 데이터 초기화, 권한 변경은 영향 범위가 크므로 Figma에서 공통 `RiskActionDialog` 패턴을 먼저 설계해야 한다.

2. 메뉴 정보 구조 재정리
   - 실제 코드의 메뉴 구조와 문서상 메뉴 구조가 일부 다르다.
   - 특히 재고관리와 관리자 메뉴는 숨김/레거시/실제 노출 메뉴가 섞여 있어 Figma IA 페이지에서 실제 사용자 노출 기준으로 다시 정리해야 한다.

3. 모바일 44px 터치 기준과 반응형 표준
   - 채팅 작성바, 알림 버튼, 테이블 액션, 가로 스크롤 하위 탭에서 터치 목표가 작거나 탐색성이 낮다.
   - 하위 메뉴, 데이터 테이블, 상세 승인/검토 화면의 모바일 전용 패턴이 필요하다.

4. 승인/권한/데이터 범위 설계
   - 전자결재 목록은 클라이언트에서 넓은 데이터를 받은 뒤 필터링하는 구조가 관찰된다.
   - 디자인 개선만으로 끝내지 말고 서버 스코프, 권한 빈 상태, 제한 상태, 감사 로그 상태를 함께 설계해야 한다.

5. 공통 컴포넌트 부족
   - `PageHeader`, `Button`, `DataTable`은 있으나 메뉴별 카드, 위험 모달, 상태 배지, 모바일 카드 리스트, 권한 상태, 빈 상태가 도메인마다 흩어져 있다.
   - Figma 컴포넌트 라이브러리에서 먼저 표준화해야 구현 품질도 안정된다.

## 2. 조사 기준

### 확인한 메인 메뉴

- 내정보
- 추가기능
- 채팅
- 게시판
- 전자결재
- 인사관리
- 재고관리
- 관리자

### 확인한 주요 자료

- `docs/manuals/07_full_menu_catalog_ko.md`
- `docs/메뉴_기능_점검.md`
- `docs/디자인_통일_현황.md`
- `docs/menu-performance-audit-2026-04-27.md`
- `docs/mobile-ux-audit-2026-04-29.md`
- `docs/qa-audit-2026-03-10.md`
- `tests/e2e/design-regression-check.desktop.spec.ts`
- `app/main/기능부품/조직도서브/조직도측면창.tsx`
- `app/main/page.tsx`
- `app/globals.css`
- `app/components/Button.tsx`
- `app/components/DataTable.tsx`
- `app/components/PageHeader.tsx`
- `app/main/기능부품/마이페이지/index.tsx`
- `app/main/기능부품/추가기능.tsx`
- `app/main/기능부품/인사관리.tsx`
- `app/main/기능부품/재고관리통합.tsx`
- `app/main/기능부품/전자결재.tsx`
- `app/main/기능부품/관리자전용.tsx`

### 확인한 스크린샷

- `docs/manuals/ppt_assets/raw/02_main_shell.png`
- `docs/manuals/ppt_assets/raw/04_chat.png`
- `docs/manuals/ppt_assets/raw/06_approval.png`
- `docs/manuals/ppt_assets/raw/07_hr.png`
- `docs/manuals/ppt_assets/raw/08_inventory.png`
- `docs/manuals/ppt_assets/raw/09_admin.png`

## 3. Figma 권장 파일 구조

### 페이지 구성

1. `00 Foundations`
   - 색상 변수
   - 간격 변수
   - 반경 변수
   - 그림자 변수
   - 타이포그래피
   - 상태 컬러

2. `01 App Shell`
   - 데스크톱 사이드바
   - 모바일 탭바
   - 하위 메뉴 레일
   - 그룹형 하위 메뉴
   - 반응형 레이아웃 그리드

3. `02 Components`
   - 버튼
   - 탭
   - 세그먼트 컨트롤
   - 카드
   - 테이블
   - 모바일 레코드 카드
   - 상태 배지
   - 위험 작업 모달
   - 권한/빈/오류/로딩 상태

4. `03 Menu Screens`
   - 메뉴별 주요 화면
   - 데스크톱 1440px
   - 태블릿 1024px
   - 모바일 390px

5. `04 Risk Flows`
   - 퇴직 처리
   - ESS 승인/반려
   - 급여 확정
   - 계약 발송
   - 전자결재 일괄 승인/반려
   - 권한 변경
   - 데이터 초기화

6. `05 QA Specs`
   - 터치 목표
   - 포커스 순서
   - 표 반응형 기준
   - 권한별 상태
   - 로딩/오류/빈 상태

## 4. Figma 토큰 제안

### 색상

현재 `app/globals.css` 기준으로 `--color-accent: #2563EB`와 상태 컬러가 이미 잡혀 있다. Figma 변수는 아래처럼 앱 토큰과 1:1로 맞추는 것이 좋다.

| Token | 값 | 용도 |
| --- | --- | --- |
| `color.accent` | `#2563EB` | 주요 액션, 선택 상태 |
| `color.accent.hover` | `#1D4ED8` | 주요 액션 hover |
| `color.accent.soft` | `#EFF6FF` | 선택 배경, 정보 배경 |
| `color.surface` | `#FFFFFF` | 카드/패널 |
| `color.surface.subtle` | `#F8FAFC` | 페이지 배경 |
| `color.border` | `#E2E8F0` | 기본 구분선 |
| `color.text` | `#0F172A` | 본문 주요 텍스트 |
| `color.text.muted` | `#64748B` | 보조 텍스트 |
| `color.success` | `#16A34A` | 완료/승인 |
| `color.warning` | `#F59E0B` | 주의/대기 |
| `color.danger` | `#DC2626` | 삭제/반려/초기화 |
| `color.info` | `#0284C7` | 정보/안내 |

### 반경

현재 앱에는 4, 6, 8, 10, 12px 계열이 섞여 있다. Figma에서는 아래 4단계로 줄이는 것을 권장한다.

| Token | 값 | 용도 |
| --- | --- | --- |
| `radius.sm` | `4px` | 입력, 작은 배지 |
| `radius.md` | `6px` | 버튼, 칩 |
| `radius.lg` | `8px` | 카드, 테이블 컨테이너 |
| `radius.xl` | `12px` | 모달, 드로어 |

### 간격과 크기

| Token | 값 | 용도 |
| --- | --- | --- |
| `space.1` | `4px` | 조밀한 내부 간격 |
| `space.2` | `8px` | 칩, 버튼 내부 |
| `space.3` | `12px` | 카드 내부 보조 간격 |
| `space.4` | `16px` | 기본 컴포넌트 간격 |
| `space.6` | `24px` | 섹션 간격 |
| `space.8` | `32px` | 페이지 블록 간격 |
| `size.touch.min` | `44px` | 모바일 최소 터치 목표 |
| `size.sidebar.desktop` | `72px` | 데스크톱 주 메뉴 |
| `size.subnav.desktop` | `192px` | 데스크톱 하위 메뉴 |

## 5. 우선순위 매트릭스

| 우선순위 | 항목 | 영향 메뉴 |
| --- | --- | --- |
| P0 | 위험 작업 확인 UX 표준화 | 인사관리, 급여, 계약, 관리자, 전자결재 |
| P0 | 권한/데이터 스코프 설계 | 전자결재, 관리자, 인사관리 |
| P1 | 메뉴 IA와 실제 노출 메뉴 정렬 | 재고관리, 관리자, 인사관리 |
| P1 | 모바일 하위 메뉴와 터치 목표 개선 | 전체 메뉴 |
| P1 | 결재/급여/계약의 진행 상태 시각화 | 전자결재, 인사관리 |
| P1 | 게시판/채팅 작성 흐름의 점진 공개 | 게시판, 채팅 |
| P1 | 알림 상태 모델 통합 | 알림, 채팅, 전자결재 |
| P2 | 데이터 테이블의 모바일 카드 전환 | 인사관리, 재고관리, 관리자, 전자결재 |
| P2 | 빈/권한/로딩/오류 상태 공통화 | 전체 메뉴 |
| P2 | 색상/아이콘/반경 사용 규칙 정리 | 전체 메뉴 |
| P3 | 문구, 툴팁, 보조 설명 정제 | 전체 메뉴 |

## 6. 공통 앱 셸과 내비게이션

### 현재 상태

앱은 좌측 72px 주 메뉴와 192px 하위 메뉴를 기준으로 구성되어 있다. 모바일에서는 하단에 가로 스크롤 탭바를 사용한다. 메인 메뉴는 `내정보`, `추가기능`, `채팅`, `게시판`, `전자결재`, `인사관리`, `재고관리`, `관리자`로 확인된다.

### 문제점

| 우선순위 | 문제 |
| --- | --- |
| P1 | 72px 사이드바에서 아이콘과 10px 라벨만으로 메뉴를 구분해야 해 메뉴 수가 늘수록 인지 부담이 커진다. |
| P1 | 모바일 탭바에 모든 메뉴가 가로 스크롤로 노출되어 주요 메뉴와 보조 메뉴의 우선순위가 흐려진다. |
| P1 | 하위 메뉴가 모바일에서 그룹 정보를 잃고 평면 탭처럼 보인다. 관리자, 재고관리, 인사관리처럼 하위 메뉴가 많은 영역에서 특히 불리하다. |
| P2 | 로딩, 권한 없음, 빈 상태, 오류 상태가 공통 컴포넌트로 보이지 않는다. |
| P2 | `rounded-2xl`, Tailwind 색상, `erp-*` 클래스, 글로벌 토큰이 혼재되어 있다. |

### Figma 개선안

- 데스크톱 `DesktopSidebar`는 아이콘, 짧은 라벨, 선택 바, 알림 배지, 관리자 제한 상태를 포함한 컴포넌트로 설계한다.
- 모바일은 `핵심 4~5개 메뉴 + 더보기` 구조를 검토한다.
- 하위 메뉴는 `SubNavRail`, `GroupedSubNav`, `MobileSectionPicker` 세 가지 변형을 만든다.
- 하위 메뉴가 많은 메뉴는 모바일에서 상단 칩 나열 대신 바텀시트 또는 드롭다운으로 섹션을 먼저 선택하게 한다.
- `EmptyState`, `PermissionState`, `LoadingPanel`, `ErrorState`를 공통화한다.

### Figma 컴포넌트

- `AppShell`
- `DesktopSidebarItem`
- `MobileTabItem`
- `GroupedSubNav`
- `SubNavItem`
- `MobileSectionPicker`
- `PermissionState`
- `LoadingPanel`
- `ErrorState`
- `EmptyState`

## 7. 내정보

### 현재 상태

내정보 영역은 개인 프로필, 급여/증명서, 알림, 즐겨찾기, 개인 통계가 한 화면 상단에 밀집되는 구조다. 문서상 급여와 증명서는 분리된 메뉴처럼 보이지만 구현에서는 `급여·증명서` 단일 영역과 내부 세그먼트로 결합되어 있다.

### 문제점

| 우선순위 | 문제 |
| --- | --- |
| P1 | 문서의 메뉴 구조와 실제 구현 구조가 달라 Figma IA와 사용자 안내가 어긋날 수 있다. |
| P1 | 헤더, 탭, 즐겨찾기, 요약 카드가 상단에 몰려 첫 화면의 시각적 우선순위가 흐리다. |
| P2 | 재직/퇴직 상태별 접근 가능 탭을 처리하는 로직은 있으나 화면상 잠김/숨김/제한 상태 패턴이 충분히 명확하지 않다. |
| P2 | 프로필 카드, 지표 카드, 빠른 액션 카드의 형태가 메뉴별로 재사용 가능한 수준까지 정리되어 있지 않다. |

### Figma 개선안

- `MyPageHeader`에 사용자 이름, 직무, 소속, 재직 상태, 주요 액션을 통합한다.
- 급여와 증명서는 실제 구현에 맞춰 `급여·증명서` 상위 탭과 내부 세그먼트로 설계하거나, 제품 정책에 맞춰 메뉴를 다시 분리한다.
- 즐겨찾기는 첫 화면의 주 정보 뒤로 낮추고, 빠른 액션은 2~4개 핵심 작업만 노출한다.
- 퇴직자/재직자 권한 차이는 `RestrictedTab`, `LockedPanel`, `PermissionNotice`로 시각화한다.

### Figma 컴포넌트

- `MyPageHeader`
- `ProfileSummaryCard`
- `TaskStatCard`
- `QuickActionTile`
- `RestrictedTab`
- `DocumentRequestCard`
- `PayRecordCard`

## 8. 추가기능

### 현재 상태

추가기능은 여러 보조 기능과 외부 링크를 카드 그리드로 제공한다. 내부 기능 11개와 외부 링크 2개가 거의 같은 시각적 위계로 놓인다.

### 문제점

| 우선순위 | 문제 |
| --- | --- |
| P1 | 운영 보조 기능, 의료/현장 관련 기능, 외부 시스템 링크가 같은 카드 밀도로 섞여 있다. |
| P2 | 카드 높이와 6열 그리드가 조밀해 기능 설명, 상태, 권한 제한을 드러내기 어렵다. |
| P2 | 즐겨찾기 버튼이 hover 중심이면 모바일과 키보드 사용자에게 발견성이 떨어진다. |
| P3 | 권한 없음 상태가 제목 중심이라 사용자가 무엇을 할 수 있는지 알기 어렵다. |

### Figma 개선안

- 기능을 `운영 보조`, `의료/현장`, `외부 시스템` 그룹으로 나눈다.
- 내부 기능 카드는 제목, 짧은 설명, 상태 배지, 즐겨찾기, 최근 사용 여부를 포함한다.
- 외부 링크는 `ExternalLinkTile`로 분리해 새 창 이동임을 명확히 한다.
- 권한 없음 화면에는 사유, 요청 경로, 대체 가능한 메뉴를 제공한다.

### Figma 컴포넌트

- `FeatureCard`
- `FeatureGroupHeader`
- `ExternalLinkTile`
- `FavoriteButton`
- `PermissionRequestPanel`

## 9. 채팅

### 현재 상태

채팅은 대화방 목록, 메시지 버블, 첨부 미리보기, 작성바, 읽음 확인 흐름으로 구성된다. 스크린샷상 기능 밀도는 충분하지만 모바일 터치와 미디어 로딩 안정성이 개선 포인트다.

### 문제점

| 우선순위 | 문제 |
| --- | --- |
| P1 | 작성바의 첨부 버튼과 전송 버튼이 모바일 44px 터치 기준보다 작다. |
| P1 | 이미지/첨부 미리보기의 고정 크기와 로딩 이후 레이아웃 변화가 최신 메시지 가림 문제를 만들 수 있다. |
| P2 | 대화방 목록에서 읽지 않음, 온라인, 고정, 숨김, 참여자 수 정보가 같은 줄에 몰린다. |
| P2 | 실패 전송, 재시도, 업로드 진행 상태가 공통 패턴으로 정리되어 있지 않다. |

### Figma 개선안

- 모바일 `ComposerBar`는 첨부, 입력, 전송의 최소 터치 영역을 44px로 잡는다.
- 첨부 미리보기는 업로드 전, 업로드 중, 실패, 완료 상태를 분리한다.
- 대화방 행은 아바타/상태, 제목/마지막 메시지, 메타/배지 3영역으로 고정한다.
- `PIN`, `HIDE` 같은 텍스트 배지는 아이콘과 툴팁으로 바꾸고 주요 상태만 텍스트로 남긴다.

### Figma 컴포넌트

- `ChatRoomRow`
- `MessageBubble`
- `AttachmentPreview`
- `ComposerBar`
- `UploadProgressChip`
- `RetryBanner`
- `ReadReceiptModal`

## 10. 게시판

### 현재 상태

게시판은 공지사항, 자유게시판, 경조사, 수술일정, MRI일정, 업무가이드 등 여러 성격의 콘텐츠를 포함한다. 글 작성 화면은 태그, 예약, 투표, 첨부, 일정 관련 설정이 함께 나타날 수 있다.

### 문제점

| 우선순위 | 문제 |
| --- | --- |
| P1 | 글 작성 화면에 선택 기능이 한 번에 노출되어 일반 글 작성과 고급 옵션의 복잡도가 같다. |
| P1 | 목록에서 상세를 열 때 데스크톱에서도 맥락이 끊기는 모달 중심 흐름이 된다. |
| P2 | 댓글 답글 대상, 로딩, 실패, 삭제/수정 액션의 시각적 피드백이 약하다. |
| P2 | 읽음 상태 모달은 이름 목록 중심이라 부서 필터, 검색, 미확인자 액션이 부족하다. |

### Figma 개선안

- 글 작성은 `기본 정보`, `옵션`, `첨부`, `일정/투표`로 점진 공개한다.
- 데스크톱은 목록과 상세를 함께 볼 수 있는 `BoardDetailSheet` 또는 split view를 설계한다.
- 댓글은 `CommentThread`로 답글 대상, 편집 상태, 실패 재시도, 삭제 확인을 포함한다.
- 읽음 상태는 부서 필터, 검색, 미확인자만 보기, 리마인드 액션을 제공한다.

### Figma 컴포넌트

- `BoardPostRow`
- `BoardDetailSheet`
- `PostComposer`
- `ComposerOptionSection`
- `AttachmentGrid`
- `CommentThread`
- `ReadStatusPanel`

## 11. 알림

### 현재 상태

알림은 헤더 드롭다운, 토스트, 전체 알림함이 서로 다른 위치에서 사용된다. 읽음 상태 표현이 `is_read`, `read_at` 등 다른 모델로 나타날 가능성이 있다.

### 문제점

| 우선순위 | 문제 |
| --- | --- |
| P1 | 읽음/안읽음 상태의 명명과 시각 규칙이 화면마다 달라질 수 있다. |
| P1 | 토스트, 헤더 드롭다운, 전체 알림함이 하나의 변형 체계로 묶여 있지 않다. |
| P2 | 모바일 알림함에서 필터, 탭, 일괄 작업이 한 줄에 몰리면 조작성이 떨어진다. |
| P3 | 일부 알림 액션 버튼은 40px 수준이라 모바일 기준 44px에 맞추는 것이 좋다. |

### Figma 개선안

- `Unread`, `Read`, `Archived`, `ActionRequired` 상태를 통합 정의한다.
- 알림 컴포넌트는 같은 데이터 구조에서 `Toast`, `DropdownItem`, `InboxRow`, `MobileCard`로 변형한다.
- 모바일 알림함은 필터를 상단 칩 또는 접이식 필터바로 만든다.
- 알림 배지는 색상만이 아니라 숫자, 라벨, aria 이름 기준을 함께 설계한다.

### Figma 컴포넌트

- `NotificationToast`
- `NotificationBell`
- `NotificationDropdown`
- `NotificationInboxRow`
- `NotificationMobileCard`
- `NotificationFilterBar`
- `UnreadBadge`

## 12. 전자결재

### 현재 상태

전자결재의 실제 주요 메뉴는 `기안함`, `결재함`, `참조 문서함`, `작성하기`다. 캘린더, 양식 빌더, 서명, 직인 관리 관련 파일은 존재하지만 메인 전자결재 하위 메뉴에 모두 연결되어 있지는 않다.

### 문제점

| 우선순위 | 문제 |
| --- | --- |
| P0 | 결재 목록 데이터가 클라이언트에서 넓게 조회된 뒤 사용자 조건으로 필터링되는 구조가 관찰된다. 권한 설계와 데이터 스코프가 디자인 요구사항에도 반영되어야 한다. |
| P1 | 목록에서 결재선, 현재 결재자, 지연 여부, 위임, 반려 사유가 충분히 요약되지 않는다. |
| P1 | 일괄 승인/반려 전에 문서 유형, 최종 결재 여부, 영향 범위를 확인하는 위험 확인 화면이 필요하다. |
| P1 | 작성하기 화면에서 문서 유형 선택과 양식 선택이 커질수록 탭 구조가 복잡해진다. |
| P1 | 결재선 편집에서 역할, 필수/선택, 순서, 참조, 템플릿 적용이 더 명확해야 한다. |
| P1 | 상세/출력 화면은 A4 미리보기와 승인 액션이 분리되어 모바일 검토가 어렵다. |
| P2 | 인쇄 화면의 직인/서명 표현이 실제 이미지 자산과 연결되는지 명확히 보여야 한다. |
| P2 | 캘린더와 양식 관리 기능은 존재하지만 메인 IA에서 발견성이 낮다. |

### Figma 개선안

- 목록 조회 전제부터 `내가 볼 수 있는 문서만 표시`하는 권한 상태를 디자인한다.
- `ApprovalProgressStepper`로 작성, 검토, 승인, 반려, 완료, 보류 상태를 한 줄로 요약한다.
- 일괄 승인/반려는 `BulkActionReviewDialog`를 통해 대상 수, 문서 유형, 최종 결재 포함 여부, 반려 사유 입력을 보여준다.
- 작성하기는 `DocumentTypePicker`에서 카테고리, 최근 사용, 즐겨찾기, 필수 첨부 여부를 선택하게 한다.
- 상세 화면은 `요약`, `문서 미리보기`, `결재선`, `이력`, `액션` 탭을 가진 드로어 또는 상세 페이지로 설계한다.
- 서명/직인 기능은 캔버스 작성, 업로드, 적용 위치, 인쇄 미리보기까지 한 흐름으로 연결한다.

### Figma 컴포넌트

- `ApprovalStatusBadge`
- `ApprovalProgressStepper`
- `ApprovalLineEditor`
- `ApproverTemplateMenu`
- `DocumentTypePicker`
- `ApprovalListTable`
- `ApprovalMobileCard`
- `ApprovalDetailSheet`
- `A4DocumentPreview`
- `BulkActionReviewDialog`
- `SignaturePad`
- `SealAssetCard`

### 우선 설계 화면

1. 작성하기
2. 결재함
3. 결재 상세/출력
4. 일괄 승인/반려
5. 모바일 상세 승인
6. 양식 관리
7. 서명/직인 관리

## 13. 인사관리

### 현재 상태

인사관리는 구성원, 인사변동, 입퇴사·교육센터, 근태, 급여, 경조사, 자격·안전센터, 계약, 문서센터 등 넓은 업무를 포함한다. 디렉터리, 근태, 휴가, 급여, 계약, 문서가 한 메뉴 아래 묶여 있어 정보량이 매우 많다.

### 문제점

| 우선순위 | 문제 |
| --- | --- |
| P0 | ESS 승인/반려, 퇴직 처리, 근무표 일괄 생성, 휴가 승인/반려, 급여 확정, 계약 발송 같은 고위험 작업이 기본 확인창 중심이다. |
| P1 | 워크스페이스, 좌측 메뉴, 내부 탭이 겹쳐 현재 위치를 파악하기 어렵다. |
| P1 | 구성원 프로필, 급여/보험 필드, ESS 변경 검토, 입퇴사 정보가 한 화면에 고밀도로 배치된다. |
| P1 | 근태는 대시보드, 스케줄, 캘린더, 휴가, 이상 징후, 생성 도구가 섞여 있다. |
| P1 | 급여는 탭 수가 많고 확정/마감/발송 같은 핵심 작업의 위험도가 화면 위계에 충분히 반영되지 않는다. |
| P1 | 계약 발송은 계약 데이터, 직원 급여/비과세 정보, 알림 발송에 영향을 주는데 버튼 수준의 확인만으로는 부족하다. |
| P2 | 복지, 자격, 안전, 문서 영역이 규정 준수 업무와 복지 업무를 같은 시각 언어로 다룬다. |
| P2 | 데스크톱 테이블과 모바일 카드의 정보량이 다르게 설계되어 같은 데이터를 비교하기 어렵다. |

### Figma 개선안

- 인사관리 전체에 `WorkspaceSwitcher`를 도입해 `인사정보`, `근태/휴가`, `급여/계약`, `문서/안전`처럼 큰 작업 맥락을 먼저 구분한다.
- 구성원 상세는 `StaffProfileDrawer`에서 기본정보, 근로조건, 급여/보험, 문서, 이력 탭으로 정리한다.
- ESS 변경 요청은 변경 전/후, 요청자, 승인 영향 범위, 관련 문서 링크를 보여주는 `ESSDiffReviewModal`로 만든다.
- 근태는 `AttendanceModeTabs`, `StatusLegend`, `BulkEditBar`, `ViolationBanner`를 공통화한다.
- 급여는 `PayrollCommandCenter`와 `RunPayrollWizard`를 중심으로 산정, 검토, 확정, 발송, 마감 단계를 명확히 한다.
- 계약 발송 전에는 대상자, 계약 유형, 급여/비과세 변경, 알림 발송, 서명 기한을 `ContractSendReviewDialog`에서 요약한다.
- 위험 작업은 모두 `RiskActionDialog` 변형으로 통일한다.

### Figma 컴포넌트

- `WorkspaceSwitcher`
- `SubnavGroup`
- `NestedTabBar`
- `StaffProfileDrawer`
- `StaffFormStepper`
- `PayrollInsuranceFieldset`
- `ESSDiffReviewModal`
- `AttendanceModeTabs`
- `StickyDataGrid`
- `StatusLegend`
- `BulkEditBar`
- `ViolationBanner`
- `PayrollCommandCenter`
- `RunPayrollWizard`
- `PayrollAuditBanner`
- `CloseMonthLockPanel`
- `BulkSendConfirm`
- `ContractSendReviewDialog`
- `ContractPreviewSplitView`
- `AffectedDataSummary`
- `SignatureStatusBadge`

### 우선 설계 화면

1. 구성원 목록과 상세 드로어
2. ESS 승인/반려
3. 근태 캘린더와 일괄 편집
4. 휴가 승인
5. 급여 산정/확정
6. 계약 발송
7. 문서센터

## 14. 재고관리

### 현재 상태

재고관리는 실제 노출 메뉴와 숨김 메뉴가 나뉜다. 현재 주로 보이는 그룹은 `현황`, `등록`, `발주`, `자산`, `월마감`이며, 이력, 수요예측, 스캔, 재고실사, 이관, 납품확인서, UDI, 비품대여설정, 거래처, 카테고리, AS반품, 소모품통계, 내부서재고 등은 숨김 또는 레거시/딥링크 성격이 있다.

### 문제점

| 우선순위 | 문제 |
| --- | --- |
| P1 | 문서상 메뉴와 코드상 실제 노출 메뉴가 다르다. Figma 화면 목록을 만들 때 레거시와 실제 사용자 메뉴를 분리해야 한다. |
| P1 | 스캔, 실사, 이관, UDI, 납품확인서처럼 빈번할 수 있는 작업이 숨겨져 발견성이 낮다. |
| P1 | 입출고 등록 화면은 이모지와 색상 중심의 모드 선택이라 업무 의미와 상태가 명확히 구분되지 않는다. |
| P1 | 스캔 메뉴가 바코드/QR 입력에 가까운데 문서에는 명세서 OCR 자동 추출처럼 표현되어 혼선이 생긴다. |
| P2 | 재고현황 테이블은 최소 너비가 커서 모바일에서 카드형 레코드 전환이 필요하다. |
| P2 | 자동발주, 결재 연동 발주, 일반 구매발주가 하나의 흐름으로 섞여 단계 구분이 약하다. |
| P2 | UDI 보고, 재고실사, 이관은 선택 대상과 변경 결과를 미리 보여주는 요약 패턴이 필요하다. |
| P3 | 반경, 아이콘, 상태 색상이 화면별로 조금씩 달라질 가능성이 있다. |

### Figma 개선안

- 재고관리 IA를 `현황`, `입출고`, `발주`, `실사/이관`, `UDI/규정`, `기준정보`, `분석/마감`으로 재정렬한다.
- 실제 사용자에게 노출되는 메뉴와 레거시 딥링크는 Figma 페이지에서 별도 표기한다.
- 입출고 등록은 `SegmentedControl`로 입고, 출고, 조정, 반품을 구분하고 각 모드별 필수 필드를 다르게 보여준다.
- 스캔은 `바코드 입고`와 `명세서 자동추출`을 분리하거나 명칭을 실제 기능에 맞춘다.
- 재고 테이블은 데스크톱 `InventoryTable`, 모바일 `InventoryRecordCard`로 같은 데이터 우선순위를 공유한다.
- 발주는 `OrderStatusStepper`로 요청, 검토, 결재, 발주, 입고, 완료 단계를 보여준다.
- 실사/이관/UDI는 `StockChangePreview`와 `AffectedItemSummary`를 공통 사용한다.

### Figma 컴포넌트

- `InventoryKpiCard`
- `StatusFilterChip`
- `InventoryTable`
- `InventoryRecordCard`
- `InventoryModeSegment`
- `BarcodeScanPanel`
- `InvoiceExtractionPanel`
- `StockChangePreview`
- `AffectedItemSummary`
- `OrderStatusStepper`
- `UdiReportTargetBadge`
- `LegacyDeepLinkBadge`

### 우선 설계 화면

1. 재고현황
2. 입출고 등록
3. 구매/발주
4. 재고실사
5. 이관
6. UDI 보고
7. 분석/마감

## 15. 관리자

### 현재 상태

관리자는 경영분석, 회사관리, 직원권한, 운영설정, 문서양식, 엑셀등록, 데이터백업, 데이터초기화, 감사센터, 시스템마스터센터를 포함한다. 관리자 영역은 제품 설정, 권한, 데이터, 감사, 마스터 정보가 섞인 고권한 메뉴다.

### 문제점

| 우선순위 | 문제 |
| --- | --- |
| P0 | 데이터초기화에서 보안 잠금 해제 후 개별 초기화가 기본 확인창에 의존한다. 삭제 범위와 최근 백업 상태를 강하게 보여줘야 한다. |
| P0 | 직원권한 화면은 권한 변경, 복사, 비밀번호 초기화가 고밀도로 배치되어 영향 범위와 변경 차이를 놓치기 쉽다. |
| P1 | 문서의 관리자 메뉴 구조와 실제 코드 그룹 구조가 일부 다르다. 실제 그룹을 기준으로 Figma IA를 다시 잡아야 한다. |
| P1 | 운영설정, 문서양식, 시스템마스터센터는 설정 성격이 비슷하지만 위험도와 적용 범위가 다르다. |
| P2 | 감사센터와 백업/초기화의 관계가 화면상 명확히 이어지지 않는다. |

### Figma 개선안

- 관리자 첫 화면은 `운영 현황`, `권한/보안`, `데이터 관리`, `기준정보`, `감사` 그룹으로 재정리한다.
- 데이터초기화는 `SecurityUnlock`, `ImpactSummary`, `RecentBackupStatus`, `TypedConfirmation`, `FinalDangerAction` 5단계로 설계한다.
- 직원권한은 직원 선택, 권한 템플릿, 변경 전/후 diff, 영향 메뉴, 저장 전 리뷰로 나눈다.
- 비밀번호 초기화, 권한 복사, 권한 저장은 서로 다른 위험 액션으로 분리한다.
- 감사센터는 최근 위험 작업과 연결해 관리자 행동의 추적 가능성을 높인다.

### Figma 컴포넌트

- `AdminSectionCard`
- `PermissionMatrix`
- `PermissionDiffPanel`
- `RoleTemplatePicker`
- `SecurityUnlockPanel`
- `RecentBackupStatus`
- `DangerActionDialog`
- `TypedConfirmationField`
- `AuditEventTimeline`
- `SystemMasterTable`

### 우선 설계 화면

1. 직원권한
2. 데이터초기화
3. 데이터백업
4. 감사센터
5. 운영설정
6. 시스템마스터센터

## 16. 위험 작업 공통 패턴

다음 작업은 모두 같은 기본 구조의 `RiskActionDialog`로 통일하는 것을 권장한다.

| 메뉴 | 작업 | 필요한 확인 정보 |
| --- | --- | --- |
| 인사관리 | 퇴직 처리 | 대상자, 퇴직일, 근태/급여/계약 영향, 복구 가능 여부 |
| 인사관리 | ESS 승인/반려 | 변경 전/후, 요청자, 적용일, 관련 근로조건 |
| 인사관리 | 근무표 일괄 생성 | 대상 기간, 대상 직원 수, 기존 근무표 덮어쓰기 여부 |
| 인사관리 | 휴가 승인/반려 | 잔여 연차, 대체 근무, 급여 반영 여부 |
| 인사관리 | 급여 확정/마감 | 대상 월, 대상 직원 수, 미검토 항목, 재오픈 조건 |
| 인사관리 | 계약 발송 | 대상자, 계약 유형, 급여 정보 변경, 서명 기한, 알림 발송 |
| 전자결재 | 일괄 승인/반려 | 대상 문서 수, 문서 유형, 최종 결재 포함 여부, 반려 사유 |
| 관리자 | 권한 변경 | 변경 전/후 권한, 영향 메뉴, 대상자, 감사 기록 |
| 관리자 | 데이터 초기화 | 삭제 범위, 최근 백업, 복구 가능 여부, typed confirmation |
| 재고관리 | 재고 이관/조정 | 품목, 수량, 출발/도착 부서, 재고 부족 여부 |

### `RiskActionDialog` 구조

1. 작업명과 위험 수준
2. 대상 요약
3. 영향 범위
4. 변경 전/후 비교
5. 누락 또는 경고 항목
6. 선택적 사유 입력
7. typed confirmation 또는 2단계 확인
8. 실행 후 상태와 감사 로그 링크

## 17. 반응형 설계 기준

### 데스크톱

- 기준 폭: 1440px
- 주 메뉴 72px
- 하위 메뉴 192px
- 콘텐츠 최대 폭은 업무 화면마다 다르게 설정하되 테이블 화면은 충분한 가로 영역을 사용한다.
- 상세 검토 업무는 목록과 상세를 동시에 보는 split view를 우선 검토한다.

### 태블릿

- 기준 폭: 1024px
- 하위 메뉴는 접이식 또는 상단 섹션 선택으로 전환한다.
- 테이블은 핵심 열을 유지하고 보조 열은 행 상세로 이동한다.

### 모바일

- 기준 폭: 390px
- 터치 목표 최소 44px
- 가로 스크롤 탭은 핵심 메뉴 4~5개 이하에서만 사용한다.
- 하위 메뉴가 많은 경우 바텀시트 또는 섹션 드롭다운을 사용한다.
- 테이블은 `RecordCard` 또는 `SummaryRow + DetailDrawer`로 전환한다.

## 18. 메뉴별 공통 컴포넌트 백로그

| 그룹 | 컴포넌트 | 우선순위 |
| --- | --- | --- |
| App Shell | `AppShell`, `DesktopSidebarItem`, `MobileTabItem`, `GroupedSubNav` | P1 |
| 상태 | `StatusBadge`, `PermissionState`, `EmptyState`, `LoadingPanel`, `ErrorState` | P1 |
| 데이터 | `DataTableToolbar`, `ResponsiveRecordList`, `DetailDrawer`, `FilterChips` | P1 |
| 위험 작업 | `RiskActionDialog`, `TypedConfirmationField`, `ImpactSummary` | P0 |
| 전자결재 | `ApprovalProgressStepper`, `ApprovalLineEditor`, `DocumentTypePicker` | P1 |
| 인사 | `StaffProfileDrawer`, `ESSDiffReviewModal`, `PayrollCommandCenter` | P0 |
| 재고 | `InventoryRecordCard`, `StockChangePreview`, `OrderStatusStepper` | P1 |
| 관리자 | `PermissionDiffPanel`, `RecentBackupStatus`, `AuditEventTimeline` | P0 |
| 채팅 | `ComposerBar`, `AttachmentPreview`, `RetryBanner` | P1 |
| 게시판 | `PostComposer`, `BoardDetailSheet`, `ReadStatusPanel` | P1 |
| 알림 | `NotificationToast`, `NotificationInboxRow`, `UnreadBadge` | P1 |

## 19. Figma 작업 순서 제안

### 1주차: Foundations와 공통 셸

- 색상, 반경, 간격, 상태 토큰 생성
- 데스크톱/모바일 App Shell 설계
- 하위 메뉴 패턴 3종 설계
- 빈/권한/로딩/오류 상태 설계
- 위험 작업 모달 기본형 설계

### 2주차: 고위험 업무 화면

- 관리자 데이터초기화
- 관리자 직원권한
- 인사 ESS 승인/반려
- 인사 급여 확정/마감
- 인사 계약 발송
- 전자결재 일괄 승인/반려

### 3주차: 업무 밀도 높은 화면

- 전자결재 작성하기/결재함/상세
- 인사 구성원/근태/휴가
- 재고현황/입출고/발주
- 게시판 작성/상세
- 채팅 목록/작성바
- 알림함

### 4주차: 모바일 변형과 QA

- 390px 모바일 주요 흐름
- 1024px 태블릿 주요 흐름
- 44px 터치 검증
- 테이블에서 카드 전환 검증
- 권한별 상태 검증
- 긴 텍스트와 배지 overflow 검증

## 20. 디자인 QA 체크리스트

- 모든 주요 액션 버튼의 모바일 터치 영역이 44px 이상인가?
- 색상만으로 상태를 구분하지 않고 텍스트/아이콘/라벨이 함께 있는가?
- 하위 메뉴가 6개를 넘는 화면에서 모바일 탐색 대안이 있는가?
- 테이블 화면은 모바일 카드 또는 상세 드로어 대안이 있는가?
- 삭제, 확정, 초기화, 반려, 발송 같은 작업은 영향 범위를 보여주는가?
- 권한 없음 상태에서 사용자가 왜 접근할 수 없는지 알 수 있는가?
- 로딩, 빈 상태, 오류 상태가 메뉴마다 같은 언어로 표현되는가?
- 실제 코드의 메뉴명과 Figma 화면명이 일치하는가?
- 숨김/레거시 메뉴가 사용자 노출 메뉴와 섞이지 않았는가?
- 인쇄/출력 화면은 실제 서명/직인 자산과 연결되는가?
- 알림 읽음 상태가 드롭다운, 토스트, 알림함에서 같은 규칙을 쓰는가?
- 급여/계약/권한 변경은 변경 전/후 비교가 있는가?

## 21. 결론

현재 NEWMSO는 기능 범위가 넓고 업무 밀도도 높다. 따라서 단순히 화면을 예쁘게 다듬는 것보다, Figma에서 먼저 `정보 구조`, `위험 작업`, `반응형 데이터 화면`, `권한 상태`, `공통 컴포넌트`를 표준화하는 것이 효과가 크다.

가장 먼저 설계해야 할 것은 관리자 데이터초기화, 직원권한, 인사 급여/계약, 전자결재 일괄 승인/반려처럼 실수 비용이 큰 화면이다. 이후 공통 셸과 메뉴별 컴포넌트를 정리하면 채팅, 게시판, 추가기능, 알림 같은 일상 사용 화면까지 같은 디자인 언어로 자연스럽게 정돈할 수 있다.
