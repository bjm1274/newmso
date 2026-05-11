# API 호출 예산 가이드 (MSO ERP)

> **Phase 0 — 8-6 API 과다호출 방지 트랙**
> 목표: SWR + 공용 fetcher 경유로 신규 코드의 중복 호출 제거

---

## 1. 페이지별 K8 호출 예산

| 페이지 / 기능          | 초기 렌더 (≤ N건) | 1분 idle (≤ N건) | 비고                       |
|----------------------|:-----------------:|:----------------:|--------------------------|
| 대시보드              | 5                 | 2                | 위젯별 useCachedQuery      |
| 인사 목록 (직원)      | 3                 | 1                | 검색 debounce 필수          |
| 급여 관리             | 4                 | 1                | realtime throttle 30s     |
| 근태/스케줄           | 5                 | 2                | 월별 TTL 10분              |
| 재고 관리             | 4                 | 2                | realtime throttle 30s     |
| 전자결재 목록         | 3                 | 1                | 탭 전환 revalidate=false   |
| 채팅 (메시지)         | 2                 | —                | realtime 전용, poll 금지   |
| 알림 센터             | 2                 | 1                | —                          |

> **측정**: 개발 환경에서 `globalThis.__API_CALL_COUNTER__`로 카운트 확인 가능.

---

## 2. 사용 예시

### 2-1. `useCachedQuery` — 기본 데이터 로딩

```tsx
import { useCachedQuery } from '@/lib/hooks/useCachedQuery';
import { supabase } from '@/lib/supabase';

function PayrollList({ companyId }: { companyId: string }) {
  const { data, isLoading, error } = useCachedQuery(
    companyId ? `payroll-list/${companyId}` : null,
    () =>
      supabase
        .from('payroll_records')
        .select('id, staff_id, amount, month')
        .eq('company_id', companyId)
        .then((r) => r.data ?? []),
    { ttl: 60_000 }, // 1분 캐시
  );

  if (isLoading) return <Spinner />;
  if (error) return <ErrorAlert message={error.message} />;
  return <Table rows={data} />;
}
```

### 2-2. `useDebouncedSearch` — 검색 입력 최적화

```tsx
import { useDebouncedSearch } from '@/lib/hooks/useDebouncedSearch';
import { useCachedQuery } from '@/lib/hooks/useCachedQuery';

function StaffSearch() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedSearch(query); // 300ms debounce

  const { data } = useCachedQuery(
    debouncedQuery.trim() ? `staff-search/${debouncedQuery}` : null,
    () => searchStaff(debouncedQuery),
    { ttl: 30_000 },
  );

  return (
    <>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <StaffList items={data} />
    </>
  );
}
```

### 2-3. `useThrottledRealtime` — 실시간 업데이트 + 30초 throttle

```tsx
import { useCachedQuery } from '@/lib/hooks/useCachedQuery';
import { useThrottledRealtime } from '@/lib/hooks/useThrottledRealtime';

function InventoryBoard({ warehouseId }: { warehouseId: string }) {
  const { data, mutate } = useCachedQuery(
    `inventory/${warehouseId}`,
    () => fetchInventory(warehouseId),
  );

  // INSERT/UPDATE/DELETE 발생해도 30초에 1번만 refetch
  useThrottledRealtime(
    `inventory/${warehouseId}`,
    [{ table: 'inventory_items', event: '*' }],
    mutate,
    30_000,
  );

  return <InventoryGrid items={data} />;
}
```

---

## 3. 신규 코드 작성 10원칙

1. **공용 fetcher 경유 필수**: `supabase.from()` 직접 호출 금지. `useCachedQuery` 또는 `fetcher()`를 거쳐야 한다.
2. **key 설계**: `페이지/리소스/id` 형식으로 명시적으로 작성. key가 같으면 캐시가 공유된다.
3. **key에 민감정보 금지**: 토큰·이메일·전화번호를 key에 포함하지 않는다 (JM5).
4. **조건부 fetch**: 필요한 파라미터가 없으면 key를 `null`로 전달해 불필요한 호출을 막는다.
5. **TTL 명시**: 데이터 특성에 맞는 TTL 설정. 목록=5분, 상세=1분, 실시간성=30초.
6. **revalidateOnFocus 기본 false**: 탭 전환마다 재호출하지 않는다. 명시적 mutate로만 갱신.
7. **검색 input은 반드시 debounce**: `useDebouncedSearch`를 거쳐 최소 300ms 후 쿼리 실행.
8. **Realtime은 throttle 적용**: `useThrottledRealtime`으로 30초 간격 제한. 폴링 방식 사용 금지.
9. **invalidateCache 활용**: 저장·수정 후 즉시 최신 데이터가 필요하면 `invalidateCache(key)`를 호출한다.
10. **호출 예산 준수**: 페이지 초기 렌더 ≤ 5건, 1분 idle ≤ 2건. `__API_CALL_COUNTER__`로 측정.

---

## 4. 캐시 키 네이밍 컨벤션

```
{도메인}/{리소스}[/{식별자}][?{파라미터}]

예시:
  payroll/list/company-123
  staff/search/홍길동
  inventory/items/warehouse-456
  approval/pending/dept-789
```

---

## 5. 단계적 마이그레이션

기존 코드는 즉시 마이그레이션하지 않는다. ESLint 경고(`warn`)를 확인하며 점진적으로 전환:

1. 신규 컴포넌트: 처음부터 `useCachedQuery` 사용
2. 빈번한 재렌더로 성능 문제가 확인된 기존 컴포넌트: 우선 마이그레이션
3. 안정적인 기존 컴포넌트: 다음 스프린트에서 일괄 마이그레이션
