# MSO Codex 구현 지시서 V3
> 생성일: 2026-05-10 | V2 완료 후 심층 조사 기반 3차 지시
> 보조진단보고서_V3_2026-05-10.md 기반

---

## 규칙
- 지시된 줄 외에 다른 코드 수정 금지
- 변경 후 TypeScript 타입 오류 없어야 함
- 주석 추가 금지
- 기존 로직(함수/이벤트) 절대 제거 금지

---

## TASK-V3-01: date-utils.ts 타임존 이중 계산 버그 [버그]
**파일**: `app/utils/date-utils.ts`  
**문제**: `new Date()`는 이미 로컬 시간 → 거기에 9시간 추가 = 이중 오프셋

파일 읽어서 아래 패턴 찾기:

```typescript
// 현재 (찾아야 할 패턴)
const now = new Date();
const koreaTime = new Date(now.getTime() + 9 * 60 * 60 * 1000);
return koreaTime.toISOString().slice(0, 19);
```

```typescript
// 변경
const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
```

> ⚠️ 함수 반환 타입 `string`이면 유지. `getKoreaTime()` 또는 유사 이름 함수 내부에 있을 것.

---

## TASK-V3-02: 게시판.tsx Supabase Realtime cleanup [버그]
**파일**: `app/main/기능부품/게시판.tsx`

파일 읽어서 `supabase.channel(` 패턴 grep 후 cleanup 없는 useEffect 찾기:

```typescript
// 현재 (찾아야 할 패턴) — return 없는 useEffect
useEffect(() => {
  const channel = supabase.channel('...').on(...).subscribe();
  // ← return 없음
}, []);
```

```typescript
// 변경 — return cleanup 추가
useEffect(() => {
  const channel = supabase.channel('...').on(...).subscribe();
  return () => { supabase.removeChannel(channel); };
}, []);
```

구독이 여러 개면 각각 변수에 할당 후 모두 removeChannel 호출.

---

## TASK-V3-03: 업무가이드.tsx Supabase Realtime cleanup [버그]
**파일**: `app/main/기능부품/게시판서브/업무가이드.tsx`

파일 읽어서 `supabase.channel(` 찾기. 동일 채널에 여러 `.on()` 체이닝된 패턴:

```typescript
// 현재 — cleanup 없음
const channel = supabase.channel('guide-room')
  .on('postgres_changes', ...)
  .on('postgres_changes', ...)
  .on('postgres_changes', ...)
  .subscribe();
```

```typescript
// 변경 — useEffect return 추가
return () => { supabase.removeChannel(channel); };
```

---

## TASK-V3-04: next.config.ts 보안 헤더 추가 [보안]
**파일**: `next.config.ts`

파일 읽어서 현재 구조 확인 후 `headers` 함수 추가:

```typescript
// NextConfig 객체 내부에 추가
async headers() {
  return [
    {
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-XSS-Protection', value: '1; mode=block' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        {
          key: 'Strict-Transport-Security',
          value: 'max-age=63072000; includeSubDomains; preload',
        },
      ],
    },
  ];
},
```

---

## TASK-V3-05: app/error.tsx 신규 생성 [접근성]
**파일**: `app/error.tsx` (신규)

```tsx
'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-4">
      <h2 className="text-xl font-bold text-[var(--foreground)]">오류가 발생했습니다</h2>
      <p className="text-sm text-[var(--toss-gray-3)]">{error.message || '예기치 않은 오류입니다.'}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-semibold"
      >
        다시 시도
      </button>
    </div>
  );
}
```

---

## TASK-V3-06: app/main/error.tsx 신규 생성 [접근성]
**파일**: `app/main/error.tsx` (신규)

```tsx
'use client';

export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 p-8 gap-3">
      <h3 className="text-lg font-semibold text-[var(--foreground)]">페이지 로드 실패</h3>
      <p className="text-sm text-[var(--toss-gray-3)]">{error.message || '잠시 후 다시 시도해 주세요.'}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="px-4 py-2 bg-[var(--accent)] text-white rounded-[var(--radius-md)] text-sm font-semibold"
      >
        다시 시도
      </button>
    </div>
  );
}
```

---

## TASK-V3-07: OP체크 빈 catch 블록 처리 [코드 품질]
**파일**: `app/main/기능부품/OP체크.tsx`

파일 읽어서 아래 패턴 grep:
```bash
grep -n "} catch" app/main/기능부품/OP체크.tsx
```

빈 catch 블록 (내부에 코드 없거나 주석만 있는 경우) 찾아서 수정:

```typescript
// 현재 (빈 블록)
} catch {
}

// 변경
} catch (error) {
  console.error('[OP체크] 처리 실패:', error);
}
```

> 각 catch 위치의 context를 확인해 적절한 에러 메시지 포함.

---

## TASK-V3-08: tsconfig.json 엄격 옵션 추가 [코드 품질]
**파일**: `tsconfig.json`

파일 읽어서 `compilerOptions` 내부에 아래 옵션 추가 (이미 있는 경우 `true`로 변경):

```json
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true
```

> `noUncheckedIndexedAccess`는 파급 효과가 크므로 이번 배치에서 제외.

---

## TASK-V3-09: 게시판.tsx 무제한 로딩 → 페이지네이션 [성능]
**파일**: `app/main/기능부품/게시판.tsx`

파일 읽어서 board_posts 전체 select 패턴 찾기:

```typescript
// 현재 (한 번에 전체 로딩)
const { data } = await supabase
  .from('board_posts')
  .select('*')
  .order('created_at', { ascending: false });
```

```typescript
// 변경 — 페이지당 20건
const PAGE_SIZE = 20;
const { data, count } = await supabase
  .from('board_posts')
  .select('id, title, author_name, created_at, view_count, board_type', { count: 'exact' })
  .order('created_at', { ascending: false })
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
```

`page` 상태 변수 추가:
```typescript
const [page, setPage] = useState(0);
```

페이지 이동 버튼 (기존 테이블/리스트 아래에 추가):
```tsx
<div className="flex justify-center gap-2 p-4">
  <button
    type="button"
    disabled={page === 0}
    onClick={() => setPage(p => p - 1)}
    className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border disabled:opacity-40"
  >
    이전
  </button>
  <span className="px-3 py-1.5 text-sm text-[var(--toss-gray-3)]">
    {page + 1} / {Math.ceil((count ?? 0) / PAGE_SIZE)}
  </span>
  <button
    type="button"
    disabled={(page + 1) * PAGE_SIZE >= (count ?? 0)}
    onClick={() => setPage(p => p + 1)}
    className="px-3 py-1.5 text-sm rounded-[var(--radius-md)] border disabled:opacity-40"
  >
    다음
  </button>
</div>
```

---

## 실행 체크리스트

### 버그 수정 (즉시)
- [ ] TASK-V3-01: date-utils.ts 타임존 이중 계산 수정
- [ ] TASK-V3-02: 게시판.tsx Realtime cleanup
- [ ] TASK-V3-03: 업무가이드.tsx Realtime cleanup

### 보안 (즉시)
- [ ] TASK-V3-04: next.config.ts 보안 헤더 추가

### UX / 에러 처리 (1주 내)
- [ ] TASK-V3-05: app/error.tsx 신규 생성
- [ ] TASK-V3-06: app/main/error.tsx 신규 생성
- [ ] TASK-V3-07: OP체크 빈 catch 처리

### 코드 품질 (1주 내)
- [ ] TASK-V3-08: tsconfig 엄격 옵션 추가
- [ ] TASK-V3-09: 게시판 페이지네이션

---

## 검증 방법

```bash
# TypeScript 오류 확인
npx tsc --noEmit

# 빌드 확인
npm run build
```

보안 헤더 확인: `curl -I https://erp.pchos.kr` → X-Frame-Options 등 응답 헤더 확인  
Realtime 누수 확인: DevTools Network → WS 탭 → 컴포넌트 언마운트 후 연결 종료 확인

---

## 다음 단계 (V4 고려사항)

- 대형 컴포넌트 dynamic import (OP체크, 메신저, 게시판 — 측정 후 결정)
- `<img>` → next/Image 전환 22개 파일 (인쇄용 제외)
- 'use client' 분리 리팩터링 (서버/클라이언트 컴포넌트 구조 전환 — 대규모)
- tsconfig `noUncheckedIndexedAccess` 활성화 (파급 효과 큼, 별도 타입 수정 필요)
- 게시판 무한 스크롤로 개선 (페이지네이션 이후)
