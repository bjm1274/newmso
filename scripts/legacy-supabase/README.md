# scripts/legacy-supabase/

2026-06-19 기준 마이그레이션 완료. Supabase 탈퇴 후 이 폴더 스크립트는 실행 불가.
참고용 보관 폴더 — 필요 없으면 전체 삭제 가능.

## 대상 DB 주의 (2026-08-03 8차 전수조사 조치)

이 폴더의 스크립트들은 **구 DB `pchos-d1`** 을 겨누고 있다. 현행 운영 DB 는 `pchos-d1-v2` 다.

- `backfill-d1/wipe-d1.mjs` 는 봉인했다 (`scripts/_archived-guard.mjs`). 실행하면 즉시 거부한다.
- `backfill-d1/run.mjs` · `run-helpers.mjs` 의 `--db` 기본값을 없앴다.
  예전에는 기본값이 `pchos-d1` 이라, 인자를 빼먹으면 엉뚱한 DB 에 쓰면서도 조용히 성공했다.
- `backfill-d1/verify-*.mjs` 는 읽기 전용이지만 역시 구 DB 를 조회하므로 결과가 항상 비어 나온다.

**구 DB 이름을 `pchos-d1-v2` 로 바꿔 실행하지 말 것.** 지금 구 DB 를 가리키는 것이
사실상 안전망 역할을 하고 있고, 이름만 고치면 운영 데이터를 겨누는 살아 있는 도구가 된다.
