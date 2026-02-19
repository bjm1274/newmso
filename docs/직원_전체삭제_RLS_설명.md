# 관리자 제외 전 직원 삭제가 안 될 때

## 1. 화면에서 확인할 것

- **관리자** → **초기화** 탭 → 보안 암호 입력 → **"👤 관리자 제외 전 직원 계정 및 데이터 삭제"** 버튼을 눌렀는지 확인하세요.
- 삭제 실패 시 이제 **에러 메시지**가 그대로 뜹니다. (예: `new row violates row-level security policy`)

## 2. Supabase RLS 때문에 삭제가 막힌 경우

`staff_members` 테이블에 **Row Level Security(RLS)** 가 켜져 있으면, 기본 설정에서는 **삭제(DELETE)** 가 거부될 수 있습니다.

### 해결: Supabase 대시보드에서 실행

1. [Supabase](https://supabase.com) 로그인 → 프로젝트 선택
2. **SQL Editor** → New query
3. 아래 중 **한 가지만** 선택해서 실행하세요.

### A) RLS가 켜져 있는 경우 – 삭제 정책 추가

```sql
-- 관리자가 아닌 직원만 삭제 허용 (앱에서 관리자 제외 삭제용)
CREATE POLICY "allow_delete_non_admin_staff"
ON public.staff_members
FOR DELETE
USING (role IS DISTINCT FROM 'admin');
```

### B) RLS를 쓰지 않는 경우 – 삭제 가능 여부 확인

```sql
-- RLS가 staff_members에 적용돼 있는지 확인
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'staff_members';
```

- `rowsecurity = false` 이면 RLS가 꺼져 있어서, 위 정책 없이도 삭제될 수 있습니다.
- `rowsecurity = true` 이면 **A)** 의 정책을 추가해야 삭제가 됩니다.

## 3. 삭제 후 화면이 안 바뀌는 경우

- 직원 삭제가 **성공**하면 이제 **"페이지를 새로고침합니다"** 알림 후 **자동 새로고침**됩니다.
- 그래도 인사관리 구성원이 그대로면 **한 번 더 F5(새로고침)** 해보세요.

## 4. 여전히 안 될 때

- 삭제 버튼을 눌렀을 때 뜨는 **에러 메시지 전체**를 복사해서 보관해 두세요.
- Supabase **Table Editor** → `staff_members` 에서 **직접 행을 삭제**해 보며, 그때도 에러가 나는지 확인하면 원인 파악에 도움이 됩니다.
