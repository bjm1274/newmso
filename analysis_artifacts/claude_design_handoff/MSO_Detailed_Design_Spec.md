# MSO 메뉴별 세부 디자인 변경 지시서

> 대상: `bjm1274/newmso` (branch: main)  
> 기준: 실제 컴포넌트 코드 분석 기반  
> 작성일: 2025-04-27

---

## 📁 목차

1. [내정보 (마이페이지)](#1-내정보-마이페이지)
2. [채팅 (메신저)](#2-채팅-메신저)
3. [게시판](#3-게시판)
4. [전자결재](#4-전자결재)
5. [인사관리](#5-인사관리)
6. [재고관리](#6-재고관리)
7. [관리자](#7-관리자)
8. [추가기능](#8-추가기능)
9. [공통 컴포넌트](#9-공통-컴포넌트)

---

## 1. 내정보 (마이페이지)

### 대상 파일
- `app/main/기능부품/마이페이지/index.tsx`
- `app/main/기능부품/마이페이지/프로필카드.tsx`
- `app/main/기능부품/마이페이지/역할별대시보드.tsx`
- `app/main/기능부품/마이페이지/마이페이지공통섹션.tsx`

---

### 1-1. 상단 헤더 & 탭바

**현재 상태**
```tsx
// index.tsx
<div className="flex flex-wrap items-center gap-2">
  <AppLogo size={32} />
  <h1 className="page-header-title">반갑습니다, {user?.name}님</h1>
</div>
// 탭바: 이모지 포함 (👤 ⏰ ✅ 📑 📤 🔔)
```

**변경 지시**
```
1. 인사말 h1 제거 — 중복 정보
2. 탭바의 이모지 → Lucide 아이콘으로 교체
   - 내 정보   → <User size={13} />
   - 출퇴근    → <Clock size={13} />
   - 할일      → <CheckSquare size={13} />
   - 급여·증명서 → <FileText size={13} />
   - 서류제출  → <Upload size={13} />
   - 알림      → <Bell size={13} />
3. 탭바 컨테이너 스타일 정리:
   - 현재: rounded-lg border bg-card p-0.5
   - 개선: 배경 bg-[var(--muted)] rounded-[10px] p-1 → 세그먼트 컨트롤처럼
   - 활성 탭: bg-[var(--card)] shadow-sm rounded-[8px] text-[var(--foreground)]
   - 비활성 탭: text-[var(--muted-foreground)]
4. "즐겨찾기 추가" 버튼:
   - border-dashed → 유지
   - 이모지 제거, <Star size={12} /> 아이콘으로 교체
   - 즐겨찾기 아이템 이모지도 Lucide 아이콘으로 교체
```

---

### 1-2. 프로필카드 (`프로필카드.tsx`)

**현재 상태**
```tsx
// 아바타 없을 때 fallback
<span className="text-5xl font-bold text-[var(--toss-gray-3)]">👤</span>

// 로그아웃 버튼
<span className="text-sm">🚪</span>
<span>시스템 안전 로그아웃</span>

// 저장 버튼
<span className="text-sm">💾</span>
<span>내 정보 저장</span>

// 섹션 헤더 (왼쪽 border 강조)
<h3 className="... border-l-4 border-[var(--accent)] pl-3">인사 관리 정보</h3>
<h3 className="... border-l-4 border-emerald-500 pl-3">나의 근태 · 연차</h3>
```

**변경 지시**
```
1. 아바타 fallback:
   - 이모지 👤 제거
   - 이니셜 텍스트로: user.name[0] 텍스트, background: accent/15, color: accent

2. 로그아웃 버튼:
   - 이모지 🚪 → <LogOut size={14} />
   - bg-[var(--accent)] → bg-[var(--danger)] (로그아웃은 파괴적 동작)
   - 텍스트: "시스템 안전 로그아웃" → "로그아웃"

3. 저장 버튼:
   - 이모지 💾 → <Save size={14} />

4. 섹션 헤더 (border-l-4):
   - border-l-4 패턴 제거 (디자인 안티패턴)
   - 대신: text-[10px] font-600 uppercase tracking-wider text-[var(--zinc-400)]
     으로 캡션 스타일 통일 (border 없이)

5. InfoItem 컴포넌트:
   - label: text-[11px] font-semibold uppercase tracking-wide → 유지
   - value: text-[15px] font-bold → text-[13px] font-600 (너무 큼)

6. 연차 진행바:
   - 현재: h-1.5 bg-primary rounded-full
   - 개선: h-2 rounded-full bg-[var(--accent)] 유지하되
     container를 bg-[var(--border)] 로 변경

7. ProfileChangeRequestHistory 상태 뱃지:
   - 현재: 각각 bg-emerald-50, bg-rose-50, bg-amber-50 (하드코딩)
   - 개선: globals.css의 .badge-green, .badge-red, .badge-yellow 클래스 사용
```

---

### 1-3. 역할별 대시보드 (`역할별대시보드.tsx`)

**변경 지시**
```
1. 각 stat 카드의 이모지 아이콘 → SVG 아이콘으로 전환
2. 카드 hover 효과: border-color → var(--accent) 전환 애니메이션 추가
3. 빈 상태(empty state): 이모지 제거, Icon 컴포넌트 사용
4. 카드 내부 수치: tabular-nums 클래스 적용
   - className에 "font-feature-settings: 'tnum'" 또는 tabular-nums 추가
```

---

## 2. 채팅 (메신저)

### 대상 파일
- `app/main/기능부품/메신저.tsx`
- `app/main/기능부품/메신저사이드바.tsx`
- `app/main/기능부품/메신저드로어.tsx`

---

### 2-1. 채팅방 목록 사이드바 (`메신저사이드바.tsx`)

**현재 상태**
```tsx
// 채팅방 아이템 — 이모지 기반 아바타
// 검색: input placeholder "채팅방 검색"
// 안읽음 뱃지: 별도 스타일
```

**변경 지시**
```
1. 채팅방 아바타:
   - 현재: 이모지 또는 텍스트 이니셜
   - 개선: 그룹채팅 → <Users size={14} /> 아이콘 + 배경
           1:1채팅 → 이니셜 텍스트 (name[0])
           공지방 → <Megaphone size={14} />

2. 검색바:
   - 현재: input 단독
   - 개선: 앞에 <Search size={13} color="muted" /> 아이콘 추가
     <div className="flex items-center gap-2 bg-[var(--muted)] rounded-[8px] px-3 py-2">
       <Search size={13} />
       <input ... className="bg-transparent border-none outline-none flex-1 text-[12px]" />
     </div>

3. 안읽음 뱃지:
   - 현재: 숫자만
   - 개선: 99 초과 시 "99+" 표시 (이미 구현됨 — 유지)
   - 뱃지 위치: 오른쪽 정렬, min-w-[18px] h-[18px]

4. 채팅방 목록 상단 헤더:
   - 타이틀 + 새채팅 버튼 구성
   - <Edit size={16} /> 버튼으로 새 채팅 시작
   - <Plus size={16} /> 버튼으로 그룹 생성

5. 활성 채팅방 배경:
   - 현재 없거나 미약함
   - 개선: bg-[var(--accent)]/8 border-l-2 border-[var(--accent)]
```

---

### 2-2. 메시지 입력창

**현재 상태**
```tsx
// 이모지 버튼, 파일첨부, 전송 버튼 존재
```

**변경 지시**
```
1. 입력창 컨테이너:
   - border-t 구분선 + padding 12px 16px
   - input: bg-[var(--muted)] rounded-[10px] border-none
   - focus: border 없이 ring-2 ring-[var(--accent)]/20

2. 아이콘 버튼들:
   - 이모지 버튼(😊) → <Smile size={18} /> (Lucide)
   - 파일 첨부 → <Paperclip size={18} />
   - 전송 버튼: 내용 있을 때 bg-[var(--accent)], 없을 때 bg-[var(--muted)]
     → <Send size={15} /> 아이콘

3. 메시지 버블:
   - 내 메시지: bg-[var(--accent)] text-white, border-radius: 12px 12px 4px 12px
   - 상대 메시지: bg-[var(--card)] border border-[var(--border)], border-radius: 12px 12px 12px 4px
   - 시간: text-[10px] text-[var(--muted-foreground)] 메시지 아래
```

---

### 2-3. 채팅 드로어/상세 (`메신저드로어.tsx`)

**변경 지시**
```
1. 드로어 헤더:
   - 채팅방 이름 + 멤버수 표시
   - X 버튼: <X size={18} />

2. 멤버 목록 아바타:
   - 이모지 제거 → 이니셜 아바타
   - 온라인 상태: 아바타 우하단 8px 녹색 dot

3. 미디어/파일 탭:
   - 그리드 레이아웃, rounded-[8px] overflow-hidden
```

---

## 3. 게시판

### 대상 파일
- `app/main/기능부품/게시판.tsx` (166KB — 대형 파일)

---

### 3-1. 게시물 목록

**변경 지시**
```
1. 목록 헤더:
   - 게시판 이름 + 글쓰기 버튼 (btn-premium-primary)
   - 필터/검색: input + <Search /> 아이콘 인라인 배치

2. 게시물 행:
   - 공지 뱃지: 이모지 제거 → .badge.badge-blue "공지"
   - 조회수: <Eye size={11} /> 아이콘 + 숫자
   - 좋아요: <Heart size={11} /> 아이콘 + 숫자
   - 첨부파일 있을 때: <Paperclip size={11} />

3. 빈 상태:
   - 이모지 제거 → .empty-state 클래스 활용
   - <LayoutGrid size={32} color="muted" /> 아이콘
   - 텍스트: "게시물이 없습니다"

4. 페이지네이션:
   - 현재 방식 유지하되 버튼 스타일 btn-premium-secondary 적용
```

---

### 3-2. 게시물 상세 / 에디터

**변경 지시**
```
1. 게시물 상세 헤더:
   - 제목 font-size: 18px font-weight: 700
   - 메타 정보(작성자/날짜/조회수): flex row, gap-3, text-[12px] text-muted

2. 댓글 영역:
   - 댓글 아바타: 이니셜 기반
   - 댓글 입력창: 메신저 입력창과 동일한 스타일 통일

3. 이모지 반응:
   - 현재 이모지 버튼들
   - 개선: 이모지 유지하되 버튼 스타일 정리 (border rounded-full px-2 py-1)
```

---

## 4. 전자결재

### 대상 파일
- `app/main/기능부품/전자결재.tsx` (또는 관련 서브 파일)
- `app/main/기능부품/관리자전용서브/전자결재양식관리.tsx`

---

### 4-1. 결재 목록

**변경 지시**
```
1. 상태 뱃지 통일:
   - "대기" → .badge.badge-yellow
   - "승인" → .badge.badge-green
   - "반려" → .badge.badge-red
   - "회수" → .badge.badge-gray
   이모지 제거, 텍스트만

2. 목록 테이블:
   - .data-table 클래스 적용
   - 행 hover: bg-[var(--muted)]
   - 체크박스: 일괄 처리용

3. 필터 탭:
   - "기안함 / 결재함 / 참조" 탭 → .tab-bar / .tab-item 클래스 적용
   - 활성: .tab-item.active (bg-accent white)

4. 결재선 시각화:
   - 현재: 이모지/텍스트 혼합
   - 개선:
     대기: 회색 원 + <Clock size={12} />
     승인: 녹색 원 + <Check size={12} />
     반려: 빨간 원 + <X size={12} />
```

---

### 4-2. 결재 작성 폼

**변경 지시**
```
1. 폼 레이아웃:
   - 좌측: 양식 선택 패널 (240px)
   - 우측: 작성 영역 (flex-1)
   - 구분선: border-r border-[var(--border)]

2. 양식 선택:
   - 카드 그리드 또는 목록
   - 선택 시: border-[var(--accent)] bg-[var(--accent-light)]

3. 결재선 선택:
   - 드래그 앤 드롭 UI 유지하되 아바타 이니셜화

4. 서명 패드 (`SignaturePad.tsx`):
   - 캔버스 border: 1px solid var(--border) rounded-[12px]
   - 배경: var(--muted)
   - 버튼: "초기화" → btn-premium-secondary, "서명 완료" → btn-premium-primary
```

---

## 5. 인사관리

### 대상 파일
- `app/main/기능부품/인사관리서브/` (하위 파일 다수)
- `app/main/기능부품/근무현황.tsx`

---

### 5-1. 구성원 목록

**변경 지시**
```
1. 직원 카드/행:
   - 아바타: 이모지 → 이니셜 아바타 (동일 패턴 적용)
   - 상태 뱃지: "재직" → .badge-green, "휴직" → .badge-yellow, "퇴직" → .badge-gray

2. 검색 & 필터:
   - 검색바: <Search size={13} /> 아이콘 인라인
   - 필터 버튼: <Filter size={13} /> 아이콘
   - 부서 필터: select 드롭다운 → .btn-premium-secondary 스타일

3. 목록 vs 카드 뷰 토글:
   - <LayoutGrid size={15} /> 카드뷰
   - <List size={15} /> 목록뷰
   - 토글 버튼 그룹: border rounded-[8px] overflow-hidden

4. 직원 상세 슬라이드오버:
   - 오른쪽에서 슬라이딩 패널
   - 헤더: 이름 + 직책 + 상태 뱃지
   - 섹션: 인사정보 / 근태 / 계약 / 문서
```

---

### 5-2. 근태 관리 (`근무현황.tsx`)

**변경 지시**
```
1. 상태 표시:
   - "정상출근" → 녹색 dot + 텍스트
   - "지각" → 주황 dot
   - "결근" → 빨간 dot
   - "휴가" → 파란 dot
   이모지 제거 후 색상 dot으로 통일

2. 캘린더 뷰:
   - 날짜 셀: 상태에 따라 배경색 미묘하게 차별화
   - 오늘: border-2 border-[var(--accent)]
   - 공휴일: text-[var(--danger)]

3. 요약 카드:
   - .stat-card 클래스 활용
   - 아이콘: <Clock />, <Calendar />, <TrendingDown /> 등 Lucide

4. 필터 기간 선택:
   - "이번 달 / 저번 달 / 직접 입력" → .tab-item 스타일 세그먼트
```

---

### 5-3. 급여 (`급여.tsx`)

**변경 지시**
```
1. 급여 테이블:
   - .data-table 클래스 적용
   - 금액 컬럼: tabular-nums font-semibold
   - 합계 행: font-bold border-t-2 border-[var(--border)]

2. 명세서 카드:
   - 카드 헤더: 직원명 + 기간
   - 수당/공제 항목: 두 컬럼 레이아웃
   - 실수령액: 강조 (text-[20px] font-bold color-accent)

3. 인쇄/다운로드 버튼:
   - <Download size={14} /> 아이콘 + "PDF 내보내기"
   - <Printer size={14} /> 아이콘 + "인쇄"
```

---

## 6. 재고관리

### 대상 파일
- `app/main/hooks/useInventoryData.ts`
- `app/main/hooks/useStockModal.ts`
- `app/main/inventory-utils.ts`
- 재고관리 관련 컴포넌트 파일들

---

### 6-1. 재고 현황 대시보드

**변경 지시**
```
1. 상단 요약 카드 4개:
   - .stat-card 클래스 사용
   - 아이콘 배경: color/15 투명도
   - 아이콘: <Package />, <AlertTriangle />, <TrendingUp />, <TrendingDown />
   - 이모지 완전 제거

2. 재고 목록 테이블:
   - .data-table 적용
   - 재고 상태 컬럼:
     "정상" → .badge-green
     "부족" → .badge-red
     "주의" → .badge-yellow
   - 수량: tabular-nums
   - 재고 부족 행: 전체 배경 bg-[var(--danger-light)] 옅게

3. 재고 바 시각화:
   - 현재 재고 / 최대 재고 비율 진행바
   - height: 4px, borderRadius: 2px
   - 70% 이상: bg-[var(--success)]
   - 30~70%: bg-[var(--warning)]
   - 30% 미만: bg-[var(--danger)]
```

---

### 6-2. 입출고 등록 모달

**변경 지시**
```
1. 모달 헤더:
   - 제목: "입고 등록" / "출고 등록"
   - X 버튼: icon-btn 클래스

2. 폼 레이아웃:
   - 두 컬럼 그리드 (md 이상)
   - label: text-[11px] font-600 uppercase tracking-wider
   - input: globals.css 기본 input 스타일 적용

3. QR/바코드 스캔 버튼:
   - <Scan size={16} /> 아이콘 (Lucide)
   - btn-premium-secondary 스타일

4. 저장/취소 버튼:
   - 저장: btn-premium-primary
   - 취소: btn-premium-secondary
   - 오른쪽 정렬 (justify-end)
```

---

### 6-3. 발주 화면

**변경 지시**
```
1. 발주 상태 흐름 (Status Flow):
   - "발주요청 → 승인대기 → 발주확정 → 납품완료"
   - Step indicator: 가로 진행 표시
   - 완료 단계: fill accent, 현재 단계: border accent, 미완료: border-gray

2. 납품확인서:
   - .card-premium 컨테이너
   - 서명 영역: SignaturePad 재사용
   - 출력 버튼: <Download size={14} />

3. 거래처 선택:
   - searchable 드롭다운
   - 거래처 카드: 이름 + 전화번호 + 담당자
```

---

## 7. 관리자

### 대상 파일
- `app/main/기능부품/관리자전용.tsx`
- `app/main/기능부품/관리자전용서브/경영대시보드.tsx`
- `app/main/기능부품/관리자전용서브/직원권한통합.tsx`
- `app/main/기능부품/관리자전용서브/데이터백업.tsx`

---

### 7-1. 경영 대시보드 (`경영대시보드.tsx`)

**현재 문제**
```tsx
// 이모지 기반 아이콘 (💰 ⚠️ 📉 🏝️)
// 배경 슬라이딩 이모지 (opacity-10)
// 하드코딩 색상 (slate-800, orange-500 등)
// 이모지 버튼 (✉️ 📄)
```

**변경 지시**
```
1. 상단 4개 지표 카드:
   이모지 → Lucide 아이콘으로 교체:
   - 💰 → <DollarSign />
   - ⚠️ → <AlertTriangle />
   - 📉 → <TrendingDown />
   - 🏝️ → <Calendar />

   배경 이모지 제거, 대신:
   <div style={{ background: `${color}/10`, borderRadius: 8 }}>
     <LucideIcon size={16} color={color} />
   </div>
   카드 우상단 배치

2. 차트 영역:
   - "위험 구간 탐지됨" 뱃지: 이모지 없이 .badge-red
   - "정상 궤도" 뱃지: .badge-green
   - 빈 데이터 상태: <BarChart2 size={32} /> + 안내 문구

3. 하단 배너 (slate-800):
   - SVG 배경 장식 제거 (복잡함)
   - bg-[var(--foreground)] 또는 bg-[var(--accent)] 로 변경
   - ✉️ → <Mail size={14} /> 아이콘

4. 버튼 스타일:
   - "리포트 출력" → btn-premium-secondary + <Download size={13} />
   - "설정 변경" → btn-premium-primary + <Settings size={13} />
```

---

### 7-2. 직원 권한 관리 (`직원권한통합.tsx`)

**변경 지시**
```
1. 권한 토글:
   - 현재: checkbox 또는 custom toggle
   - 개선: 일관된 toggle 스타일
     checked: bg-[var(--accent)]
     unchecked: bg-[var(--border)]
     width: 36px, height: 20px, knob: 16px

2. 권한 그룹 헤더:
   - 이모지 제거
   - Lucide 아이콘: <Shield />, <Eye />, <Settings /> 등

3. 직원 선택 드롭다운:
   - 이니셜 아바타 + 이름 + 부서
   - 검색 가능한 select

4. 저장 버튼:
   - btn-premium-primary 스타일 통일
```

---

### 7-3. 감사 로그 (`감사로그뷰어.tsx`, `접근감사로그.tsx`)

**변경 지시**
```
1. 로그 목록:
   - .data-table 클래스 적용
   - 액션 타입별 색상:
     "생성" → .badge-green
     "수정" → .badge-blue
     "삭제" → .badge-red
     "로그인" → .badge-gray

2. 시간 포맷:
   - 상대시간(방금, 1시간 전)과 절대시간 병기
   - 절대시간: text-[11px] text-[var(--muted-foreground)]

3. 필터:
   - 기간 필터 + 액션 타입 필터
   - 날짜 범위 선택기 → SmartDatePicker 재사용

4. 내보내기:
   - <Download size={14} /> + "CSV 내보내기" → btn-premium-secondary
```

---

### 7-4. 데이터 백업 (`데이터백업.tsx`)

**변경 지시**
```
1. 백업 상태 표시:
   - 마지막 백업 시간: text-[13px] + <Clock size={13} />
   - 성공: <CheckCircle size={16} color="#10b981" />
   - 실패: <AlertCircle size={16} color="#ef4444" />

2. 백업 목록:
   - .card-premium 카드 형태
   - 파일 크기: tabular-nums
   - 다운로드: <Download size={14} />
   - 삭제: <Trash2 size={14} color="danger" />

3. 백업 실행 버튼:
   - 큰 CTA: btn-premium-primary, 전체 너비
   - 로딩 중: spinner 표시 (spinner 클래스)
```

---

## 8. 추가기능

### 대상 파일
- `app/main/기능부품/ESL관리.tsx`
- `app/main/기능부품/OP체크.tsx`
- `app/main/기능부품/공유캘린더.tsx`
- `app/main/기능부품/근무표자동편성.tsx` (로스터)

---

### 8-1. 추가기능 그리드 진입점

**변경 지시**
```
1. 기능 카드 그리드:
   - 현재: 이모지 아이콘 카드
   - 개선:
     .card-premium 사용
     아이콘 컨테이너: 48×48px, borderRadius: 12px, background: accent/12
     <LucideIcon size={22} color={accent} />
     레이블: font-semibold text-[13px]
     설명: text-[11px] text-muted (1줄)

2. 카드 hover:
   - border-color → accent 전환
   - box-shadow: var(--shadow-sm) 추가

3. 카드 배치:
   - grid-cols: auto-fill, minmax(160px, 1fr)
   - gap: 12px
```

---

### 8-2. OP 체크 (`OP체크.tsx`)

**변경 지시**
```
1. 체크리스트 항목:
   - 체크박스: 커스텀 스타일
     checked: bg-accent border-accent <Check size={10} color="white" />
     unchecked: border border-[var(--border)] bg-white
   - 완료 항목: line-through text-muted

2. 진행률 표시:
   - 상단: "12/20 완료" 텍스트
   - 진행바: height 6px, bg-accent, rounded-full

3. 수술 정보 헤더:
   - 환자명, 수술명, 날짜 → 가로 배치
   - 구분: divider-v 사용

4. 버튼:
   - "완료" → btn-premium-primary
   - "저장" → btn-premium-secondary
```

---

### 8-3. 공유 캘린더 (`공유캘린더.tsx`)

**변경 지시**
```
1. 캘린더 헤더:
   - 월 이동: <ChevronLeft />, <ChevronRight />
   - 오늘 버튼: btn-premium-secondary "오늘"
   - 뷰 전환(월/주): 세그먼트 탭

2. 날짜 셀:
   - 오늘: border-2 border-accent rounded-full
   - 이벤트 dot: accent colored dots
   - 이벤트 3개 초과: "+N" 텍스트

3. 이벤트 유형 범례:
   - 이모지 제거 → colored dot (8px)
```

---

## 9. 공통 컴포넌트

### 대상 파일
- `app/components/GlobalSearch.tsx`
- `app/components/GlobalNotificationBell.tsx`
- `app/components/ActionDialog.tsx`
- `app/components/AppLogo.tsx`

---

### 9-1. 전역 검색 (`GlobalSearch.tsx`)

**변경 지시**
```
1. 트리거 버튼:
   - <Search size={16} /> + "검색..." 텍스트 + ⌘K 단축키 뱃지
   - 스타일: bg-muted rounded-[8px] px-3 py-2

2. 검색 모달:
   - backdrop-blur 오버레이
   - 결과 그룹: 섹션 헤더 (대문자, 작은 폰트)
   - 결과 항목: 아이콘 + 제목 + 메타
   - keyboard navigation 유지

3. 빈 결과:
   - <Search size={32} /> 아이콘
   - "검색 결과가 없습니다" 텍스트
```

---

### 9-2. 알림 벨 (`GlobalNotificationBell.tsx`)

**변경 지시**
```
1. 벨 아이콘:
   - 이모지 → <Bell size={18} /> Lucide
   - 미읽음 dot: 아이콘 우상단 8px 빨간 dot
   - 흔들림 애니메이션: globals.css animate-bell-shake 유지

2. 알림 드롭다운:
   - shadow-dropdown 클래스 사용
   - 알림 유형별 아이콘:
     채팅 → <MessageSquare size={14} />
     결재 → <FileCheck size={14} />
     경고 → <AlertTriangle size={14} />
   - 읽음/미읽음: 미읽음은 좌측 2px accent 선

3. 헤더:
   - "알림" 제목 + "모두 읽음" 버튼 (text 스타일, right-aligned)
```

---

### 9-3. Action Dialog (`ActionDialog.tsx`)

**변경 지시**
```
1. 다이얼로그 컨테이너:
   - backdrop: rgba(0,0,0,0.4) + blur(4px)
   - 패널: max-w-[400px] rounded-[16px] shadow-premium
   - 진입 애니메이션: animate-scale-in

2. 타이틀:
   - text-[16px] font-bold (현재 과도하게 클 수 있음)

3. 버튼 영역:
   - 취소: btn-premium-secondary
   - 확인: btn-premium-primary (danger tone일 경우 btn-premium-danger)
   - gap: 8px, justify-end

4. 입력 필드 (prompt):
   - globals.css 기본 input 스타일 적용
   - focus ring: accent 색상
```

---

### 9-4. AppLogo (`AppLogo.tsx`)

**변경 지시**
```
현재: SVG 기반 로고
개선:
- 마이페이지 헤더에서의 AppLogo 크기: size={28} 로 축소
- 사이드바 최상단 브랜드마크와 스타일 통일
  → SY 텍스트 + accent background 정사각 마크
```

---

## ⚡ 작업 순서 권장 (Claude Code용)

```
STEP 1: lucide-react 설치
  → npm install lucide-react

STEP 2: 이모지 일괄 교체 (전체 파일 스캔)
  → grep -r "text-[0-9]*xl" + 이모지 패턴 검색
  → 각 파일에서 emoji → Lucide import + JSX 교체

STEP 3: globals.css 클래스 적용 확대
  → .badge, .btn-premium-*, .data-table, .stat-card 적용 확대

STEP 4: 경영대시보드 리팩터
  → 하드코딩 색상 CSS 변수 교체
  → 이모지 아이콘 교체

STEP 5: 프로필카드 개선
  → 아바타 fallback
  → 로그아웃/저장 버튼 아이콘
  → InfoItem 폰트 사이즈 조정

STEP 6: 메신저 입력창 통일

STEP 7: 나머지 세부 개선
```

---

## 📎 참고 리소스

- **디자인 목업**: `newmso-redesign.html` (인터랙티브 프로토타입)
- **디자인 토큰**: `app/globals.css` (CSS 변수 완비)
- **Lucide React**: https://lucide.dev/icons
- **현재 아이콘 매핑**: 이 문서 섹션 1 참조
