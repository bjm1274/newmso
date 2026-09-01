# 11차 · 08 재고관리

> 조사일: 2026-08-31 · 1차 조사(미검증). 워크센터 status/io/item/analyze.

## 조사 발견

### P0 후보
- **INV-01** `/api/d1/mutate`로 `inventory.quantity/stock` 직접 UPDATE. SSOT `postInventoryMovement`·로그·월마감 전부 우회. 컬럼 가드 없음.
- **INV-02** `stock-post` 마감 검사가 클라 `company`를 씀. 빈 회사이면 잠금 스킵.

### P1 후보
- **INV-03** `stock-transfer`는 월마감을 안 봄.
- **INV-04** 부서 빈 행은 부서 격리 스킵. `hr_*`가 전 부서 재고 쓰기.
- **INV-05** 모바일 자산등록이 qty=1을 mutate insert (로그/마감 없음).

### P2
모바일 마감 UI 읽기전용, PO receive가 세션 회사로 전기, tenant admin이 타사 슈퍼유저.

닫힌 것: stock-consume 410, stock-update는 movement 경유, skipClosingCheck는 admin만.
