# MSO 통합 협업 및 다병원 운영 시스템 개발 계획서
## (MSO Enterprise Unified Hospital Operating Platform Specification & Architecture Plan)

---

## 📑 목차 (Table of Contents)

1. **시스템 개요 및 MSO 통합 철학 (System Overview & Philosophy)**
2. **시스템 전체 아키텍처 도면 (Overall Architecture Diagrams)**
   - 2.1 시스템 컨테이너 아키텍처 (System Container Diagram)
   - 2.2 듀얼 셸(PC / Mobile) 프론트엔드 구조도 (Dual-Shell Architecture)
   - 2.3 데이터 흐름도 (Data Flow Architecture)
3. **통합 데이터베이스 모델 및 ERD (Database Model & Core ERD)**
4. **도메인별 상세 기능 및 비즈니스 로직 (Domain Features & Logic)**
   - 4.1 MSO 전사 거버넌스 & 회사/조직 관리
   - 4.2 인사관리 워크센터 (HR Workcenter)
   - 4.3 전자결재 워크플로우 (Approval Engine)
   - 4.4 통합 게시판 & 수술/검사 캘린더 (Board & Schedule Engine)
   - 4.5 스마트 재고 및 의료자산 관리 (Inventory & Supply Chain)
   - 4.6 전사 실시간 메신저 & 알림 (Messenger & Notification Engine)
   - 4.7 추가기능 & Gemini AI 비서 (Extra Utilities & AI Engine)
   - 4.8 관리자 경영 분석 & 감사 센터 (Admin & Audit Center)
5. **보안, 권한 및 오프라인 동기화 로직 (Security, RBAC & Offline Sync)**
6. **향후 개발 및 고도화 로드맵 (Development Roadmap)**

---

## 1. 시스템 개요 및 MSO 통합 철학 (System Overview & Philosophy)

본 시스템은 **MSO(Management Service Organization, 병원경영지원회사)** 체계 아래 여러 병원·의원 및 관련 계열사들의 인사, 일정, 임상 지원, 물류, 결재, 커뮤니케이션을 **단일 통합 플랫폼(Single Unified Platform)**으로 일원화하여 운영 효율과 협업 시너지를 극대화하는 **차세대 병원 통합 운영 ERP**입니다.

### 🌟 핵심 기본 철학: "전사적 자원 및 데이터의 통합 공유 (Unified MSO Collaboration)"
1. **단일 테넌트 다기관 공유 모델 (Multi-Hospital Unified Sharing)**:
   - MSO 본사와 산하 각 병원은 격리된 사일로(Silo)가 아니라, 하나의 유기적인 연계 조직으로 동작합니다.
   - 의료진 파견, 환자 전원, 수술실/MRI 가동 현황, 비품/약품 재고, 전사 공지, 표준 업무 지침(SOP)을 전사적으로 실시간 공유합니다.
2. **PC & 모바일 완전 동기화 및 패리티 (Cross-Platform Parity)**:
   - 진료실·행정실의 PC 환경과 병동·수술실·이동 중의 모바일 환경에서 동일한 권한과 완결된 비즈니스 로직을 제공합니다.
3. **탄력적 오프라인 지원 및 고가용성 (Offline-First Resilience)**:
   - 네트워크 단절 상황에서도 조회 캐시 및 로컬 큐잉을 통해 진료 및 일정 확인에 차질이 없도록 설계되었습니다.

---

## 2. 시스템 전체 아키텍처 도면 (Overall Architecture Diagrams)

### 2.1 시스템 컨테이너 아키텍처 (System Container Diagram)

```mermaid
graph TB
    subgraph "Clients Layer"
        WEB_PC["🖥️ PC Web Browser (Chrome, Edge, Safari)"]
        WEB_MOB["📱 Mobile PWA / Browser (iOS Safari, Android Chrome)"]
        TWA_APP["📲 Android TWA App / Desktop App"]
    end

    subgraph "Edge / CDN Layer (Cloudflare)"
        CF_EDGE["🌐 Cloudflare Edge Network (SSL/TLS, CDN, WAF)"]
        CF_WORKER["⚡ Cloudflare Pages / Next.js Edge Runtime"]
    end

    subgraph "Next.js Full-Stack Application"
        SHELL_ROUTER["🔀 Shell Router (isMobile Detector)"]
        PC_SHELL["🖥️ PC Shell (Sidebar, Flyout, Workcenters)"]
        MOB_SHELL["📱 Mobile Shell (BottomTab, SlideView, Glassmorphism)"]
        
        API_LAYER["⚙️ API Routes Layer (/api/*)"]
        AUTH_SVC["🔐 Auth & Session Manager (Server Session Cookie)"]
        RBAC_SVC["🛡️ RBAC & Permission Resolver (access-control.ts)"]
        REALTIME_BUS["📡 Realtime Event Bus (Polling & Event Hub)"]
        OFFLINE_ENGINE["📦 Offline D1 / Upload Queue Engine"]
    end

    subgraph "Data Storage & Compute Layer"
        D1_DB[("🗄️ Cloudflare D1 Database (SQLite Distributed Engine)")]
        R2_STORAGE[("🪣 Cloudflare R2 / Object Storage (Files, Attachments, Images)")]
        GEMINI_AI["🤖 Google Gemini AI API (LLM Agent & Analysis)"]
    end

    WEB_PC --> CF_EDGE
    WEB_MOB --> CF_EDGE
    TWA_APP --> CF_EDGE
    CF_EDGE --> CF_WORKER
    CF_WORKER --> SHELL_ROUTER
    SHELL_ROUTER --> PC_SHELL
    SHELL_ROUTER --> MOB_SHELL
    
    PC_SHELL --> API_LAYER
    MOB_SHELL --> API_LAYER
    MOB_SHELL --> OFFLINE_ENGINE
    
    API_LAYER --> AUTH_SVC
    API_LAYER --> RBAC_SVC
    API_LAYER --> D1_DB
    API_LAYER --> R2_STORAGE
    API_LAYER --> GEMINI_AI
    API_LAYER --> REALTIME_BUS
```

---

### 2.2 듀얼 셸(PC / Mobile) 프론트엔드 구조도

```mermaid
graph LR
    subgraph "Root Page (app/main/page.tsx)"
        DEVICE_CHECK{"📱 useIsMobile()"}
    end

    subgraph "PC Frontend Architecture"
        DEVICE_CHECK -->|Desktop Screen| PC_MAIN["PC Main Layout"]
        PC_MAIN --> PC_NAV["Left Sidebar & Dynamic Flyout Navigation"]
        PC_NAV --> PC_HEADER["Top Header (User, Company Selector, Global Search)"]
        PC_NAV --> PC_VIEWS["Workcenter Views"]
        
        subgraph "PC Workcenters"
            PC_VIEWS --> W_MY["내정보 / 마이페이지"]
            PC_VIEWS --> W_HR["인사관리 워크센터 (급여/근태/계약/발령)"]
            PC_VIEWS --> W_APP["전자결재 워크센터 (기안/결재/문서)"]
            PC_VIEWS --> W_BRD["게시판 (공지/수술/MRI/가이드)"]
            PC_VIEWS --> W_STK["재고관리 워크센터 (현황/입출고/발주)"]
            PC_VIEWS --> W_CHT["메신저 (1:1/그룹/일정채팅)"]
            PC_VIEWS --> W_ADM["관리자 센터 (경영분석/감사/설정)"]
        end
    end

    subgraph "Mobile Frontend Architecture"
        DEVICE_CHECK -->|Mobile Screen| MOB_MAIN["MobileShell (.mso-mobile)"]
        MOB_MAIN --> MOB_HEADER["Glassmorphism MobileHeader (Back/Title/Action)"]
        MOB_MAIN --> MOB_TABS["MobileBottomTab (9개 탭 + 뱃지 동기화)"]
        MOB_MAIN --> MOB_PULL["Pull-to-Refresh & Touch Gestures"]
        
        subgraph "Mobile Tabs"
            MOB_TABS --> M_MY["내정보 / 홈 대시보드"]
            MOB_TABS --> M_NOTIF["알림 피드"]
            MOB_TABS --> M_CHAT["채팅방 & 메시징"]
            MOB_TABS --> M_BRD["게시판 (공지사항 기본 진입)"]
            MOB_TABS --> M_APP["전자결재 (간편 승인/반려)"]
            MOB_TABS --> M_HR["모바일 인사관리 (출퇴근/휴가/서명)"]
            MOB_TABS --> M_STK["모바일 재고 (바코드스캔/입출고)"]
            MOB_TABS --> M_EXTRA["추가기능 (AI/조직도/인계)"]
            MOB_TABS --> M_ADM["모바일 관리자"]
        end
    end
```

---

### 2.3 데이터 흐름도 (Data Flow Architecture)

```mermaid
sequenceDiagram
    autonumber
    actor User as 사용자 (의료진/직원)
    participant UI as UI Layer (PC/Mobile Component)
    participant Cache as Local ViewCache / StarSet
    participant API as Next.js API Route Layer
    participant Auth as Session & Access Control
    participant DB as Cloudflare D1 Database
    participant R2 as Object Storage (R2)
    participant Bus as Realtime Event Hub

    User->>UI: 메뉴 선택 / 화면 진입 (예: 게시판 공지사항)
    UI->>Cache: 1차 로컬 캐시 즉시 렌더 (Stale-While-Revalidate)
    Cache-->>UI: 지난 렌더 데이터 즉각 표출 (깜빡임 방지)
    
    UI->>API: 비동기 데이터 요청 (POST /api/board/list 등)
    API->>Auth: 세션 쿠키 검증 & 사용자 권한 확인
    Auth-->>API: 인증 성공 (ErpUser / StaffMember)
    
    API->>DB: D1 SQL 쿼리 실행 (정규화 & 뷰 유틸 필터)
    DB-->>API: 최신 레코드 세트 반환
    API-->>UI: JSON 응답 반환
    
    UI->>Cache: 최신 데이터 캐시 갱신
    UI-->>User: 최신 UI 리렌더링 완료

    Note over User,UI: 글 작성 / 결재 승인 / 일정 등록 시
    User->>UI: 데이터 생성/변경 제출 (첨부파일 포함)
    opt 첨부파일 존재 시
        UI->>R2: 파일 직접 업로드 (Presigned URL / R2 Worker)
        R2-->>UI: 저장된 Object URL 반환
    end
    UI->>API: Mutation 요청 (insert / update)
    API->>DB: D1 트랜잭션 실행
    DB-->>API: 성공 완료
    API->>Bus: 변경 이벤트 발행 (Broadcast Notice / Chat Event)
    Bus-->>UI: 실시간 배치 알림 수신 및 화면 자동 갱신
    API-->>UI: 완료 토스트 및 화면 전환
```

---

## 3. 통합 데이터베이스 모델 및 ERD (Database Model & Core ERD)

```mermaid
erDiagram
    COMPANIES ||--o{ STAFF_MEMBERS : "소속 직원"
    COMPANIES ||--o{ BOARD_POSTS : "작성 게시글"
    COMPANIES ||--o{ APPROVALS : "문서 결재"
    COMPANIES ||--o{ INVENTORY : "재고 보유"
    
    STAFF_MEMBERS ||--o{ BOARD_POSTS : "작성자"
    STAFF_MEMBERS ||--o{ BOARD_POST_COMMENTS : "댓글 작성"
    STAFF_MEMBERS ||--o{ BOARD_POST_READS : "열람 이력"
    STAFF_MEMBERS ||--o{ BOARD_POST_LIKES : "좋아요"
    STAFF_MEMBERS ||--o{ ATTENDANCES : "근태 기록"
    STAFF_MEMBERS ||--o{ EMPLOYMENT_CONTRACTS : "근로계약서"
    STAFF_MEMBERS ||--o{ APPROVALS : "기안/결재선"
    STAFF_MEMBERS ||--o{ CHAT_MESSAGES : "메시지 발신"
    
    BOARD_POSTS ||--o{ BOARD_POST_COMMENTS : "댓글 목록"
    BOARD_POSTS ||--o{ BOARD_POST_READS : "읽음 현황"
    BOARD_POSTS ||--o{ BOARD_POST_LIKES : "좋아요 목록"
    
    CHAT_ROOMS ||--o{ CHAT_MESSAGES : "메시지 내역"
    APPROVALS ||--o{ APPROVAL_HISTORY : "결재 이력 로그"

    COMPANIES {
        string id PK "회사/병원 UUID"
        string name "병원/법인명"
        string type "MSO/병원/의원"
        string ceo_name "대표자명"
        string business_no "사업자등록번호"
        integer payment_day "급여지급일"
        string seal_url "법인인감 URL"
    }

    STAFF_MEMBERS {
        string id PK "직원 UUID / 사번"
        string company_id FK "소속 회사 UUID"
        string company "소속 병원명"
        string name "직원 성명"
        string department "부서/진료과"
        string position "직위/직책"
        string status "재직/휴직/퇴사"
        text permissions "JSONB 세부 권한 매트릭스"
        string hire_date "입사일"
    }

    BOARD_POSTS {
        string id PK "게시글 UUID"
        string company_id FK "병원 UUID"
        string board_type "공지사항/자유/경조사/수술일정/MRI일정/업무가이드"
        string title "게시글 제목 / 수술명"
        text content "본문 텍스트 / 차트번호"
        string author_id FK "작성자 사번"
        string author_name "작성자 성명"
        integer views "조회수"
        integer likes_count "좋아요 수"
        string status "게시중/중요/완료"
        string scheduled_publish_at "예약 발행 일시"
        string schedule_date "일정 날짜 (YYYY-MM-DD)"
        string schedule_time "일정 시간 (HH:MM)"
        string schedule_room "수술실/검사실 위치"
        string patient_name "환자명"
        integer surgery_fasting "금식 여부 (0/1)"
        integer surgery_inpatient "입원 여부 (0/1)"
        integer surgery_guardian "보호자 동반 (0/1)"
        integer surgery_caregiver "간병인 배치 (0/1)"
        integer surgery_transfusion "수혈 필요 (0/1)"
        integer mri_contrast_required "조영제 필요 (0/1)"
        text tags "태그 JSON 배열"
        text attachments "첨부파일 JSON 배열"
        text poll "투표/설문 JSONB"
        text poll_votes "투표결과 JSONB"
    }

    APPROVALS {
        string id PK "전자결재 문서 UUID"
        string doc_number "문서번호 (예: 2026-MSO-001)"
        string title "문서 제목"
        text content "기안 본문 내용"
        string status "대기/진행중/승인/반려/회수"
        string sender_id FK "기안자 ID"
        text approver_line "결재선 JSON 배열"
        text meta_data "양식별 세부 메타 JSON"
    }

    INVENTORY {
        string id PK "품목 UUID"
        string company_id FK "병원 UUID"
        string item_name "약품/소모품/기기명"
        string category "분류"
        integer quantity "현재고 수량"
        integer min_quantity "안전재고(ROP)"
        string expiry_date "유효기간"
    }
```

---

## 4. 도메인별 상세 기능 및 비즈니스 로직 (Domain Features & Logic)

### 4.1 MSO 전사 거버넌스 & 회사/조직 관리
- **다병원 조직 구조 통합 관리**:
  - MSO 본사 및 각 산하 의료기관의 부서, 직위, 진료과 체계를 일원화하여 관리합니다.
  - 전사 조직도 뷰어(`extra_조직도`)를 통해 전 병원 임직원의 연락처, 부서, 직책을 실시간 검색합니다.
- **법인 직인 및 서식 중앙 관리**:
  - 병원별 대표 직인(`company_seals`), 로고, 양식 서식을 등록하여 전자결재 및 제증명서 발급에 자동 날인합니다.

---

### 4.2 인사관리 워크센터 (HR Workcenter)

```mermaid
graph TD
    subgraph "HR Life-Cycle Flow"
        HIRE["1. 채용 & 직원등록"] --> ONBOARD["2. 온보딩 체크리스트"]
        ONBOARD --> CONTRACT["3. 근로계약서 작성 & 전자서명"]
        CONTRACT --> ATTEND["4. 일일 근태 & 근무표 관리"]
        ATTEND --> LEAVE["5. 연차/휴가 산정 & 사용촉진"]
        LEAVE --> PAYROLL["6. 급여 계산 & 명세서 발급"]
        PAYROLL --> OFFBOARD["7. 퇴사 & 오프보딩 (증명서 발급)"]
    end
```

1. **온보딩 / 근로계약서 전자서명 (`lib/contract-sign-complete.ts`)**:
   - 신규 입사자 등록 시 근로계약서 자동 생성 및 모바일 서명 패드 모달(`ContractSignatureModal`) 호출.
   - 서명 완료 즉시 PDF/이미지 스냅샷 저장 및 인사담당자 자동 알림 발송.
2. **출퇴근 & 스마트 근태 관리 (`app/main/기능부품/인사관리워크센터/AttendWorkcenter`)**:
   - GPS 지오펜싱 및 병원 IP 대역 검증을 통한 출퇴근 체크 (`check_in_time`, `check_out_time`).
   - 3교대(Day, Evening, Night) 근무표 자동 생성 및 교대 스케줄 변경 관리.
   - 지각·조퇴·이상 근태 감지 및 정정 신청/승인 프로세스.
3. **연차/휴가 자동 산정 및 법정 연차사용촉진제도**:
   - 근로기준법 제60조/제61조 기반 회계연도/입사일 기준 연차 자동 계산.
   - 1차 촉진(소멸 6개월 전 잔여일수 통보), 2차 촉진(소멸 2개월 전 사용시기 지정 요청) 자동화.
4. **급여 관리 & 이상치 분석 (`app/main/기능부품/인사관리워크센터/payroll`)**:
   - 기본급, 제수당(연장/야간/휴일/직책), 식대/차량 비과세, 4대보험, 소득세 원천징수 자동 계산.
   - 급여 이상치(전월 대비 급격한 증감, 최저임금 미달 등) 사전 검증.
   - 직원별 모바일 급여명세서 비밀번호 보안 조회.

---

### 4.3 전자결재 워크플로우 (Approval Engine)

```mermaid
stateDiagram-v2
    [*] --> 작성중: 기안 양식 선택
    작성중 --> 대기: 기안 상신 (결재선 지정)
    대기 --> 진행중: 1차 결재자 접수
    진행중 --> 진행중: 다음 결재자 순차 승인
    진행중 --> 승인: 최종 결재자 승인 (문서번호 발번 & 직인 날인)
    진행중 --> 반려: 결재자 반려 (반려 사유 입력)
    대기 --> 회수: 기안자 회수
    승인 --> [*]
    반려 --> [*]
    회수 --> 작성중: 수정 후 재상신
```

- **다양한 표준 전자결재 서식**:
  - 휴가/연차신청서, 지출결의서, 물품구매신청서, 인사품의서, 시말서/사고보고서, 협조전 등.
- **다병원 간 협조전 결재**:
  - 타 병원 부서와의 업무 협조 및 MSO 본사 승인선이 연계된 결재 프로세스 지원.
- **모바일 간편 결재**:
  - 모바일 셸 결재 탭에서 터치 한 번으로 결재 문서 열람, 첨부파일 확인, 승인/반려 처리.

---

### 4.4 통합 게시판 & 수술/검사 캘린더 (Board & Schedule Engine)

```mermaid
graph TD
    BOARD_ENTRY["게시판 진입 (Mobile / PC)"] --> DEFAULT_TAB["📢 공지사항 (기본 선택)"]
    
    BOARD_ENTRY --> T_NOTICE["공지사항 탭"]
    BOARD_ENTRY --> T_FREE["자유게시판 탭"]
    BOARD_ENTRY --> T_EVENT["경조사 소식 탭"]
    BOARD_ENTRY --> T_OP["수술일정 탭 (리스트 / 캘린더)"]
    BOARD_ENTRY --> T_MRI["MRI일정 탭 (리스트 / 캘린더)"]
    BOARD_ENTRY --> T_SHARE["업무가이드 탭 (SOP 매뉴얼)"]

    T_OP --> OP_DETAIL["수술 상세 (환자명, 차트, 수술실, 금식/입원/수혈)"]
    T_MRI --> MRI_DETAIL["MRI 상세 (환자명, 차트, 검사실, 조영제)"]
    OP_DETAIL --> CHAT_LINK["💬 관련 수술 채팅방 자동 생성/연결"]
    MRI_DETAIL --> CHAT_LINK
```

1. **기본 진입 및 칩바 정책**:
   - 모바일/PC 진입 시 **'공지사항' 탭이 기본 활성화**되어 가장 중요한 공지를 즉시 확인.
   - 상단 카테고리 칩바: `공지사항` | `자유게시판` | `경조사` | `수술일정` | `MRI일정` | `업무가이드`.
2. **수술 및 MRI 검사 일정 통합 관리 (`app/main/모바일/게시판/일정달력.tsx`)**:
   - **월간 42칸 캘린더 그리드 & 일자별 환자 리스트**: 날짜별 수술/검사 건수 및 환자명 즉시 파악.
   - **상세 정보 완결 표출**: 환자명, 차트번호, 수술실/검사실 위치, 시간, 수술/촬영 준비 상태(금식, 입원, 보호자 동반, 간병인, 수혈 필요, 조영제 필요)를 직관적인 칩 뱃지로 렌더링.
   - **사람 모형 부위별 템플릿 선택기 (`BoardBodyPickerModal`)**: 3D/2D 인체 해부 모형을 통해 수술/검사 부위를 직관적으로 선택하여 표준 진료명 입력 지원.
   - **원클릭 협진 채팅방 연동**: 수술/검사 카드에서 클릭 시 해당 환자 수술 전용 그룹 채팅방을 자동 개설하여 집도의, 마취의, 수술실 간호사, 병동 간호사 간 실시간 소통.
3. **공지사항 예약 발행 및 중요 공지 고정**:
   - 지정된 일시에 자동 발행되는 예약 공지 기능 및 최상단 고정(Pin) 지원.
   - 공지/경조사 등록 시 전사 채팅방 및 푸시 알림 자동 방송(`broadcastNoticeIfNeeded`).
4. **투표 및 상품 추첨 엔진 (`board-poll-prize.ts`)**:
   - 복수선택/익명투표 지원 및 투표 참여자 대상 실시간 공정 추첨 알고리즘 내장.
5. **익명 읽음 상태 추적 (`BoardReadStatus`)**:
   - 전사 직원의 공지 열람 여부를 실시간 추적하여 미열람자 대상 리마인드 지원.

---

### 4.5 스마트 재고 및 의료자산 관리 (Inventory & Supply Chain)
- **약품/소모품/의료기기 통합 재고 추적**:
  - 병원별, 부서별 현재고 수량, 입출고 이력, 안전재고(ROP) 기준 미달 시 자동 발주 알림.
- **바코드 / QR / UDI 스캔 (`app/main/모바일/재고`)**:
  - 모바일 카메라를 통한 의약품·의료기기 표준 UDI 바코드 스캔 입출고 처리.
- **유통기한 추적 및 선입선출(FIFO) 관리**:
  - 유효기간 임박 품목 사전 경고 및 병원 간 재고 이관(Transfer) 지원.

---

### 4.6 전사 실시간 메신저 & 알림 (Messenger & Notification Engine)
- **1:1 대화 및 부서/프로젝트 채널**:
  - 실시간 타이핑 상태 표시, 파일/이미지/비디오 전송, 메시지 검색.
- **스마트 알림 시스템 (`notification-api.ts`)**:
  - 결재 도착, 댓글 등록, 공지사항 발행, 수술 일정 변경 등 주요 이벤트를 배너 및 모바일 뱃지로 실시간 전달.

---

### 4.7 추가기능 & Gemini AI 비서 (Extra Utilities & AI Engine)
- **Gemini 의료/경영 AI 어시스턴트**:
  - 의무기록 요약, 병원 행정 지침 질의응답, 약품 정보 검색, 데이터 통계 질의 지원.
- **인계노트 (Shift Handover)**:
  - 교대 근무 간 환자 특이사항, 처치 지시사항, 주의사항을 인계장으로 기록 및 확인.
- **ESL(전자가격표시기/전자네임택) 연동**:
  - 병동 베드 네임택, 진료실 전자 명패와 시스템 데이터 실시간 연동.

---

### 4.8 관리자 경영 분석 & 감사 센터 (Admin & Audit Center)
- **경영 대시보드 (`ExecDashboard.tsx`)**:
  - MSO 산하 병원별 환자 내원 추이, 수술 건수, 진료과별 매출 지표, 인건비 비율 등 종합 KPI 시각화.
- **변조 방지 감사 로그 (`audit_logs`, `access_logs`)**:
  - 개인정보 및 환자 정보 열람, 주요 결재 문서 수정, 권한 변경 이력을 타임스탬프와 함께 위변조 불가능하게 영구 기록.

---

## 5. 보안, 권한 및 오프라인 동기화 로직 (Security, RBAC & Offline Sync)

### 5.1 세분화된 RBAC 권한 매트릭스 (`lib/access-control.ts`)
- `role === 'admin'` / `isPrivilegedUser(user)` (시스템 마스터): 전사 최고 관리 권한.
- 각 기능별 세부 권한 키 매핑:
  - 게시판: `board_{보드명}_read`, `board_{보드명}_write`
  - 전자결재: `approval_기안함`, `approval_결재함`, `approval_작성하기`
  - 인사관리: `hr_구성원`, `hr_근태`, `hr_급여`, `hr_연차휴가`, `hr_계약`
  - 재고관리: `inventory_현황`, `inventory_등록`, `inventory_발주`, `inventory_월마감`

### 5.2 오프라인 퍼스트 동기화 엔진 (`lib/offline-queue-d1.ts`, `lib/offline-upload-queue.ts`)
- 네트워크가 불안정한 수술실/지하 검사실에서도 읽기 캐시(`readViewCache`)를 통해 데이터 즉시 조회.
- 오프라인 상태에서 발생한 변경사항(글 작성, 결재, 첨부파일)은 IndexedDB 로컬 큐에 안전하게 보관된 후, 네트워크 복구 시 백그라운드 자동 Flush 실행.

---

## 6. 향후 개발 및 고도화 로드맵 (Development Roadmap)

| 단계 | 목표 및 마일스톤 | 상태 |
| :--- | :--- | :---: |
| **Phase 1** | 모바일/PC 듀얼 셸 아키텍처 및 코어 ERP 모듈 구축 | ✅ 완료 |
| **Phase 2** | 모바일 게시판 공지사항 기본 진입 및 수술/MRI 일정 상세 정보 완결 렌더링 | ✅ 완료 |
| **Phase 3** | 다병원 통합 협업 캘린더 및 부위별 수술 템플릿 모델링 | ✅ 완료 |
| **Phase 4** | MSO 다병원 통합 경영 분석 대시보드 및 지표 비교 엔진 고도화 | 🔄 진행중 |
| **Phase 5** | Gemini AI 기반 의무기록 초안 작성 및 이상근태/재고 자동 예측 연동 | 📋 예정 |
| **Phase 6** | EMR/PACS 원내 의료 정보 시스템과의 표준 HL7/FHIR 인터페이스 연계 | 📋 예정 |

---

*본 문서는 MSO 통합 시스템의 단일 신뢰 원천(SSOT, Single Source of Truth) 개발 계획서로서, 전 개발 및 운영 단계의 표준 아키텍처 가이드라인으로 활용됩니다.*
