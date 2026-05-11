# 인쇄 템플릿 계획

작성일: 2026-05-11  
범위: Phase 3 인쇄 필요 4종 + Phase 4 `--print-*` 토큰 활용

---

## 1. 개요

Phase 4 토큰 확장(`token_extension.md`)에서 `--print-*` 변수 4종이 추가되었다:
- `--print-foreground` — 인쇄 전경색 (항상 검정 `#000000`)
- `--print-background` — 인쇄 배경색 (항상 흰색 `#ffffff`)
- `--print-border` — 인쇄 경계선 (`#e5e7eb` 회색)
- `--print-muted` — 인쇄 보조 텍스트 (`#6b7280`)

`@media print { :root { ... } }` 블록이 `globals.css` 끝에 배치되어 라이트/다크 무관하게 인쇄 시 항상 흑백으로 강제된다.

공통 인쇄 클래스:
- `.no-print` — 인쇄 시 `display: none`
- `.print-only` — 화면에서 `display: none`, 인쇄 시 표시

---

## 2. 인쇄 화면 4종

### 2-1. 급여명세서 (Phase 3 그룹 ①)

**연결 컴포넌트**: `hr_payroll_workcenter` STEP 4 "출력" 단계  
**진입**: "명세서 인쇄" 버튼 → 전용 뷰 → `window.print()`

#### @media print 변형
```css
/* 숨김 */
.no-print: 사이드바, 탑바, 워크센터 스텝 네비게이터, 우측 시뮬레이터 패널, 버튼 그룹

/* 표시 전환 */
.print-only: 회사 로고, 직인란, 문서 번호, 발행일
```

#### 레이아웃 (A4 세로)
```
┌─────────────────────────────────────┐
│  [회사 로고]        [회사명 / 사업자번호]  │
│  급여명세서                            │
│  ─────────────────────────────────  │
│  성명: ___  부서: ___  직급: ___      │
│  지급월: ____-__                      │
│  ─────────────────────────────────  │
│  [지급 항목]        [공제 항목]         │
│  기본급      ___   소득세      ___     │
│  연장수당     ___   지방소득세   ___    │
│  ...                                │
│  ─────────────────────────────────  │
│  지급합계    ___   공제합계    ___     │
│  ─────────────────────────────────  │
│  실지급액: ___________________________│
│  ─────────────────────────────────  │
│         직인란      담당자 서명란       │
│         [직인]      _____________     │
└─────────────────────────────────────┘
```

#### CSS 토큰 적용
```css
@media print {
  .payslip-container {
    color: var(--print-foreground);
    background: var(--print-background);
    border-color: var(--print-border);
    font-size: 11pt;
    width: 210mm;
    margin: 0 auto;
  }
  .payslip-table th {
    background: var(--print-background) !important;
    color: var(--print-foreground);
    border-bottom: 1px solid var(--print-border);
  }
  .payslip-muted {
    color: var(--print-muted);
    font-size: 9pt;
  }
  /* 페이지 경계 제어 */
  .payslip-container { page-break-inside: avoid; }
}
```

#### 직인 처리
- 직인 이미지: `public/sy-logo.png` (반투명 PNG 오버레이)
- 위치: 우측 하단 서명란 위 `position: absolute` (인쇄 모드)
- 폴백: 빈 직인 테두리 박스 (이미지 로드 실패 시) — 현행 계약서 직인 폴백 패턴 동일

---

### 2-2. 퇴원심사 결과서 (Phase 3 그룹 ③)

**연결 컴포넌트**: `ops_discharge_review_detail` STEP 3 "결재" 완료 후  
**진입**: "결과서 출력" 버튼 → 전용 뷰 → `window.print()`

#### @media print 변형
```css
/* 숨김 */
.no-print: 목록 패널 (좌측), 스텝 진행바, AI 분석 입력 폼, 수정 버튼

/* 표시 전환 */
.print-only: 결재선 서명 이미지, 직인, 문서 발행일, QR 코드 (optional)
```

#### 레이아웃 (A4 세로)
```
┌─────────────────────────────────────┐
│  [병원 로고]        퇴원심사 결과서     │
│  문서번호: DR-2026-XXXXX               │
│  ─────────────────────────────────  │
│  환자명    진료과    입원일    퇴원일   │
│  ───      ───      ───      ───     │
│  진단명:                              │
│  퇴원 사유:                           │
│  ─────────────────────────────────  │
│  확인 완료 항목 (체크리스트)            │
│  ☑ 항목1    ☑ 항목2    ☑ 항목3       │
│  ─────────────────────────────────  │
│  AI 분석 요약                         │
│  필수 누락 가능: ...                   │
│  권장 조치: ...                       │
│  ─────────────────────────────────  │
│  결재선                               │
│  담당   팀장   원장         [직인]     │
│  ___    ___    ___                  │
└─────────────────────────────────────┘
```

#### CSS 토큰 적용
```css
@media print {
  .discharge-result-container {
    color: var(--print-foreground);
    background: var(--print-background);
    font-size: 10.5pt;
    width: 210mm;
  }
  .discharge-checklist-item::before {
    content: "☑ ";
    color: var(--print-foreground);
  }
  .discharge-ai-summary {
    color: var(--print-muted);
    font-size: 9pt;
    border-left: 2px solid var(--print-border);
    padding-left: 8pt;
  }
}
```

#### 직인 처리
- STEP 3 결재 완료 시 결재자 정보 + 직인 PNG 오버레이
- 결재선 영역은 인쇄 전용 `.print-only` 섹션으로 별도 관리
- 직인 이미지 로드 실패 시: `[직인]` 텍스트 박스 폴백 (계약서 폴백 패턴 재사용)

---

### 2-3. 계약서 (인사관리 — 별도)

**연결 컴포넌트**: `app/main/기능부품/인사관리.tsx` 내 계약서 섹션  
**진입**: "계약서 인쇄" 버튼 → `window.print()`  
**현재 상태**: 직인 폴백 수정 이미 완료 (커밋 `389b5558`)

#### @media print 변형
```css
/* 숨김 */
.no-print: 메인 사이드바, 서브메뉴, 상단 탑바, 편집 버튼 그룹

/* 표시 전환 */
.print-only: 서명란 2개 (고용주 / 근로자), 직인 이미지
```

#### 레이아웃 (A4 세로 — 페이지 여러 장 허용)
```
┌─────────────────────────────────────┐  (1페이지)
│  근로계약서                           │
│  ─────────────────────────────────  │
│  1. 근로자 정보                       │
│     성명: ___  생년월일: ___           │
│  2. 계약 기간 / 업무 내용 / 근무 장소  │
│  ...                                │
│  (조항 나열)                          │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐  (마지막 페이지)
│  위 계약 내용에 동의합니다.             │
│  __년 __월 __일                      │
│  고용주: ________________  [직인]     │
│  근로자: ________________            │
└─────────────────────────────────────┘
```

#### CSS 토큰 적용
```css
@media print {
  .contract-page {
    color: var(--print-foreground);
    background: var(--print-background);
    font-family: "Noto Sans KR", serif;
    font-size: 11pt;
    line-height: 1.8;
    width: 210mm;
    padding: 25mm 20mm;
  }
  .contract-section-title {
    color: var(--print-foreground);
    font-weight: 700;
    border-bottom: 1px solid var(--print-border);
  }
  .contract-signature-area {
    margin-top: 20mm;
    display: flex;
    justify-content: space-between;
  }
  /* 조항 중간 잘림 방지 */
  .contract-clause { page-break-inside: avoid; }
}
```

---

### 2-4. 증명서 (재직증명 / 경력증명)

**연결 컴포넌트**: `app/main/기능부품/인사관리.tsx` 내 증명서 발급 모달  
**진입**: 증명서 모달 → "인쇄" 버튼 → `window.print()`

#### 증명서 종류별 변형
| 종류 | 필수 항목 | 비고 |
|---|---|---|
| 재직증명서 | 성명, 부서, 직위, 입사일, 발급 목적, 직인 | A4 1장 |
| 경력증명서 | 재직 기간, 담당 업무, 퇴직 사유, 직인 | A4 1장 |
| 근로소득원천징수영수증 | 연간 급여 요약, 국세청 양식 | A4 1장 |

#### 레이아웃 (재직증명서 기준, A4 세로)
```
┌─────────────────────────────────────┐
│              재직증명서               │
│  ─────────────────────────────────  │
│  성    명: ______________________   │
│  생 년 월 일: ______________________│
│  소 속 부 서: ______________________│
│  직    위: ______________________   │
│  입 사 일 자: ______________________│
│  ─────────────────────────────────  │
│  위 사람은 현재 당사에 재직 중임을     │
│  증명합니다.                          │
│  ─────────────────────────────────  │
│  발급 목적: ______________________  │
│  발급 일자: ______________________  │
│  ─────────────────────────────────  │
│  [회사명]                   [직인]   │
│  대표자: ___________________         │
└─────────────────────────────────────┘
```

#### CSS 토큰 적용
```css
@media print {
  .certificate-container {
    color: var(--print-foreground);
    background: var(--print-background);
    font-size: 11pt;
    text-align: center;
    width: 210mm;
    padding: 30mm 20mm;
  }
  .certificate-title {
    font-size: 20pt;
    font-weight: 700;
    letter-spacing: 0.2em;
    border-bottom: 3px solid var(--print-foreground);
    padding-bottom: 8pt;
    margin-bottom: 24pt;
  }
  .certificate-field-row {
    display: flex;
    text-align: left;
    margin-bottom: 12pt;
    border-bottom: 1px solid var(--print-border);
    padding-bottom: 4pt;
  }
  .certificate-field-label {
    width: 120pt;
    color: var(--print-muted);
  }
  .certificate-seal-area {
    margin-top: 36pt;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 16pt;
  }
}
```

---

## 3. 공통 인쇄 유틸리티 클래스 (globals.css 확장)

```css
/* Phase 4 확장 — 인쇄 전용 유틸리티 */
@media print {
  /* 레이아웃 초기화 */
  .print-reset-layout {
    position: static !important;
    width: 100% !important;
    height: auto !important;
    overflow: visible !important;
  }

  /* A4 페이지 설정 */
  @page {
    size: A4 portrait;
    margin: 20mm;
  }

  /* 페이지 나누기 제어 */
  .print-break-before { page-break-before: always; }
  .print-break-after  { page-break-after: always; }
  .print-avoid-break  { page-break-inside: avoid; }

  /* 배경 강제 */
  .print-bg-white { background: var(--print-background) !important; }
  .print-text-black { color: var(--print-foreground) !important; }

  /* 직인 영역 */
  .print-seal-placeholder {
    display: inline-block;
    width: 60pt;
    height: 60pt;
    border: 2px solid var(--print-foreground);
    border-radius: 50%;
    text-align: center;
    line-height: 60pt;
    font-size: 9pt;
    color: var(--print-muted);
  }
}
```

---

## 4. 직인 처리 통합 전략

현행 계약서 직인 폴백 패턴(커밋 `389b5558`) 기준으로 4종 모두 통일:

```typescript
// 공용 유틸 함수 (새 파일 권장: app/utils/print-seal.ts)
export function renderSealOrPlaceholder(
  sealUrl: string | null,
  altText = '직인'
): React.ReactElement {
  if (sealUrl) {
    return (
      <img
        src={sealUrl}
        alt={altText}
        className="print-seal-img"
        onError={(e) => {
          // 이미지 로드 실패 시 플레이스홀더로 교체
          (e.currentTarget as HTMLElement).style.display = 'none';
          e.currentTarget.nextElementSibling?.classList.remove('hidden');
        }}
      />
    );
  }
  return <span className="print-seal-placeholder">{altText}</span>;
}
```

---

## 5. 검증 체크리스트

인쇄 전 각 화면에서 확인:

- [ ] 사이드바/탑바 `.no-print` 적용 확인
- [ ] 배경색 흰색(`--print-background`) 적용 확인
- [ ] 폰트 색상 검정(`--print-foreground`) 적용 확인
- [ ] A4 너비 210mm 기준 레이아웃 확인 (Chrome DevTools 인쇄 미리보기)
- [ ] 직인 이미지 로드 실패 시 폴백 박스 표시 확인
- [ ] 다크모드 상태에서 인쇄 시 흑백 출력 확인 (`@media print :root` 덮어쓰기)
- [ ] `page-break-inside: avoid` 조항 중간 잘림 없음 확인
