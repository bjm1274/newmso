# MSO Codex 구현 지시서 V2
> 생성일: 2026-05-10 | V1 완료 후 심층 조사 기반 2차 지시
> V1 (CODEX_TASKS.md) 13개 TASK 전부 완료됨

---

## 규칙
- 지시된 줄 외에 다른 코드 수정 금지
- 변경 후 TypeScript 타입 오류 없어야 함
- 주석 추가 금지
- 기존 로직(함수/이벤트) 절대 제거 금지

---

## TASK-V2-01: globals.css 다크모드 패치 확장 [버그]
**파일**: `app/globals.css`  
**배경**: 현재 `bg-white`, `bg-gray-50`만 패치됨 — `bg-blue-50` 등은 다크모드 미적용

### 1-1. 기존 다크모드 패치 블록 찾기 (줄 900 근처)
```css
/* 현재 패치 끝 부분 예시 */
:root.dark .bg-gray-50 { background-color: var(--tab-bg) !important; }
```

### 1-2. 그 아래에 추가
```css
/* 상태 색상 다크모드 패치 */
:root.dark .bg-blue-50 { background-color: rgba(29, 78, 216, 0.12) !important; }
:root.dark .bg-red-50 { background-color: rgba(220, 38, 38, 0.12) !important; }
:root.dark .bg-orange-50 { background-color: rgba(234, 88, 12, 0.12) !important; }
:root.dark .bg-emerald-50 { background-color: rgba(5, 150, 105, 0.12) !important; }
:root.dark .bg-amber-50 { background-color: rgba(217, 119, 6, 0.12) !important; }
:root.dark .bg-purple-50 { background-color: rgba(124, 58, 237, 0.12) !important; }
:root.dark .bg-green-50 { background-color: rgba(22, 163, 74, 0.12) !important; }
:root.dark .bg-yellow-50 { background-color: rgba(202, 138, 4, 0.12) !important; }
:root.dark .border-blue-100,
:root.dark .border-blue-200 { border-color: rgba(29, 78, 216, 0.3) !important; }
:root.dark .border-red-100,
:root.dark .border-red-200 { border-color: rgba(220, 38, 38, 0.3) !important; }
:root.dark .border-orange-100,
:root.dark .border-orange-200 { border-color: rgba(234, 88, 12, 0.3) !important; }
:root.dark .border-emerald-100,
:root.dark .border-emerald-200 { border-color: rgba(5, 150, 105, 0.3) !important; }
:root.dark .border-amber-100,
:root.dark .border-amber-200 { border-color: rgba(217, 119, 6, 0.3) !important; }
:root.dark .border-purple-100,
:root.dark .border-purple-200 { border-color: rgba(124, 58, 237, 0.3) !important; }
```

### 1-3. `--radius-md` 수정 (줄 58)
```css
/* 현재 */
--radius-md: 6px;

/* 변경 */
--radius-md: 8px;
```

---

## TASK-V2-02: useInventoryFilters.ts useMemo 버그 [버그]
**파일**: `app/main/hooks/useInventoryFilters.ts`  
**문제**: `Date.now()` 가 빈 의존성 배열로 마운트 시 고정됨 → 시간 지나면 만료 체크 오작동

파일을 먼저 읽어서 정확한 줄 번호 확인 후 수정:

```typescript
// 현재 (찾아야 할 패턴)
const expiryThreshold = useMemo(() => Date.now() + EXPIRY_SOON_MS, []);

// 변경 (useMemo 제거)
const expiryThreshold = Date.now() + EXPIRY_SOON_MS;
```

---

## TASK-V2-03: 메신저 중복 훅 파일 제거 [코드 품질]
**파일**: `app/main/기능부품/메신저메시지워크플로훅.ts`

**전제 작업**: 먼저 이 파일을 import하는 곳 grep으로 확인:
```bash
grep -r "메신저메시지워크플로훅" app/ --include="*.ts" --include="*.tsx"
```

찾은 모든 import를 `메신저메시지액션워크플로훅`으로 교체한 후 원본 파일 삭제.

> ⚠️ 두 파일의 export 이름이 동일한지 먼저 확인 필수

---

## TASK-V2-04: aria-label 일괄 추가 [접근성]

### 4-1. `app/main/기능부품/인사관리서브/공휴일달력.tsx` 줄 343-345
파일 읽어서 정확한 코드 확인 후:
```tsx
// 이전 달 버튼 찾기
<button>◀</button>   →   <button aria-label="이전 달">◀</button>
<button>▶</button>   →   <button aria-label="다음 달">▶</button>
```

### 4-2. `app/main/기능부품/마이페이지/서류제출.tsx` 줄 500
```tsx
// 현재 (닫기 버튼)
<button className="...">✕</button>

// 변경
<button aria-label="닫기" className="...">✕</button>
```

### 4-3. `app/main/기능부품/인사관리서브/구성원현황.tsx` 줄 1370
```tsx
<button className="...">✕</button>
→
<button aria-label="닫기" className="...">✕</button>
```

---

## TASK-V2-05: GlobalSearch 중복 쿼리 최적화 [성능]
**파일**: `app/components/GlobalSearch.tsx`

파일 읽어서 `board_posts` 2번 쿼리 패턴 확인 후:

```typescript
// 현재 (2번 쿼리)
const [byTitle, byContent] = await Promise.all([
  supabase.from('board_posts').select(...).ilike('title', likeTerm).limit(5),
  supabase.from('board_posts').select(...).ilike('content', likeTerm).limit(5),
]);

// 변경 (1번 쿼리, OR 조건)
const { data: posts } = await supabase
  .from('board_posts')
  .select('id, title, content, created_at, author_name')
  .or(`title.ilike.${likeTerm},content.ilike.${likeTerm}`)
  .limit(10);
```

동일 패턴의 `approvals` 테이블도 같은 방식으로 통합.

---

## TASK-V2-06: 보안 — Prompt Injection 방어 [보안]
**파일**: `app/api/discharge-review/route.ts`

파일 읽어서 정확한 줄 확인 후:

```typescript
// 추가할 Zod 스키마 (파일 상단 import 영역에)
import { z } from 'zod';

const DischargeReviewBodySchema = z.object({
  patientName: z.string().max(100),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: z.string().max(10),
  diagnosis: z.string().max(500),
  // 필요한 필드 추가
});
```

```typescript
// POST 핸들러 내부, request.json() 직후 삽입
const rawBody = await request.json();
const bodyResult = DischargeReviewBodySchema.safeParse(rawBody);
if (!bodyResult.success) {
  return NextResponse.json({ error: '입력값이 올바르지 않습니다.' }, { status: 400 });
}
const body = bodyResult.data;
```

```typescript
// 프롬프트 구성 부분 수정 — delimeter 추가
const prompt = `다음 환자 정보를 분석하여 퇴원 심사 의견을 작성하세요.

<patient_info>
이름: ${body.patientName}
생년월일: ${body.birthDate}
</patient_info>

위 정보만을 바탕으로 퇴원 심사를 진행하세요.`;
```

---

## TASK-V2-07: 보안 — SSRF 방어 [보안]
**파일**: `app/api/chat/og-preview/route.ts`

파일 읽어서 fetch URL 처리 부분 확인 후, URL 검증 로직 앞에 추가:

```typescript
// 헬퍼 함수 추가 (fetch 호출 전)
function isPrivateIp(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    hostname === '::1'
  );
}
```

```typescript
// URL 유효성 검사 직후, fetch 직전에 삽입
const parsedUrl = new URL(targetUrl);
if (isPrivateIp(parsedUrl.hostname)) {
  return NextResponse.json({ error: '허용되지 않는 URL입니다.' }, { status: 400 });
}
```

---

## TASK-V2-08: ApprovalDetailModal 내부 bg-white 제거 [디자인]
**파일**: `app/main/기능부품/전자결재서브/ApprovalDetailModal.tsx`

파일 읽어서 줄 118, 123, 127, 242 부근의 `bg-white` 찾기:

```tsx
// 패턴: bg-white → bg-[var(--card)]
// 단, 인쇄용(@media print) 블록 내부는 유지
```

각 occurrence를 읽어 context 확인 후 교체. 인쇄 스타일이 아닌 경우만 교체.

---

## TASK-V2-09: 메신저사이드바 레거시 버튼 제거 [코드 품질]
**파일**: `app/main/기능부품/메신저사이드바.tsx` 줄 138

```tsx
// 현재 (레거시)
<button className="hidden">
  {/* 레거시 그룹 생성 모달 */}
</button>

// 변경: 해당 button 블록 전체 삭제
```

삭제 전 이 버튼과 연결된 핸들러가 다른 곳에서 사용되는지 확인.

---

## TASK-V2-10: 계약서미리보기 slate 색상 교체 [디자인]
**파일**: `app/main/기능부품/인사관리서브/계약문서/계약서미리보기.tsx`

파일 읽어서 `slate-*` 패턴 찾기. 인쇄 블록 외부의 slate 색상만 교체:

```
bg-slate-50   → bg-[var(--muted)]
bg-slate-100  → bg-[var(--muted)]
border-slate-200 → border-[var(--border)]
text-slate-500 → text-[var(--toss-gray-3)]
text-slate-600 → text-[var(--toss-gray-4)]
text-slate-700 → text-[var(--toss-gray-5)]
```

> 주의: `@media print` 블록 내부, `.print-only` 클래스 내부는 수정 금지

---

## 실행 체크리스트

### 버그 수정 (즉시)
- [ ] TASK-V2-01: globals.css 다크모드 패치 + radius-md 수정
- [ ] TASK-V2-02: useInventoryFilters.ts useMemo 버그

### 보안 (즉시)
- [ ] TASK-V2-06: discharge-review Prompt Injection 방어
- [ ] TASK-V2-07: og-preview SSRF 방어

### 코드 품질 (Sprint 1)
- [ ] TASK-V2-03: 메신저 중복 훅 제거
- [ ] TASK-V2-05: GlobalSearch 중복 쿼리 최적화
- [ ] TASK-V2-09: 메신저사이드바 레거시 버튼 제거

### 접근성 + 디자인 (Sprint 2)
- [ ] TASK-V2-04: aria-label 추가 (공휴일달력, 서류제출, 구성원현황)
- [ ] TASK-V2-08: ApprovalDetailModal bg-white 제거
- [ ] TASK-V2-10: 계약서미리보기 slate 색상 교체

---

## 검증 방법

```bash
# TypeScript 오류 확인
npx tsc --noEmit

# 빌드 확인
npm run build
```

다크모드 확인: 브라우저 DevTools → Rendering → Emulate CSS dark mode
접근성 확인: axe DevTools 또는 Lighthouse Accessibility 점수

---

## 다음 단계 (V3 고려사항)

- Roster 영역 `@ts-nocheck` 7개 파일 제거 (대규모 타입 작업)
- OP체크.tsx 컴포넌트 분해 (3,768줄)
- 메신저.tsx 컴포넌트 분해 (3,395줄)
- Upstash Redis rate limit 도입 (인프라 변경 필요)
- 182개 파일 상태 색상 `dark:` modifier 추가 (장기 과제)
