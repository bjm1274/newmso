# 11차 · 02 추가기능

> 조사일: 2026-08-31 · 1차 조사(미검증). 확정은 13_검증게이트.

## 1. 카드 목록 vs 실제

PC `FEATURE_CARDS` 12 + `EXTERNAL_LINKS` 2. 모바일 허브는 여기에 게시판/캘린더 복제 타일(MRI·가이드·업무공유·공유캘린더)을 더 붙인다. Gemini/ESL은 모바일에서 “PC만” 토스트.

| 카드 | PC | 모바일 | 비고 |
|------|----|--------|------|
| Gemini비서 | 동작 (`/api/ai/chat`) | 토스트만 | extra 미설정 시 `menu_추가기능`이면 fail-open |
| 조직도 | 피라미드+출퇴근 | 부서 목록만 | `canAccessExtraFeature('조직도')` **항상 true** |
| 부서별재고 | **스텁** (로더 없음) | 실화면 | PC 카드가 죽은 길 |
| 근무현황 | 시프트+달력 | KPI만, company=전체 | |
| 인계노트 | 전량 select | company 컬럼 없음 | 환자 PHI 전사 |
| 직원평가 | extra면 폼, 서버 insert는 ADMIN_OR_MANAGER | company=전체 대상 | |
| 퇴원심사 | 생성 시 company_id 누락 | 상태변경 무가드 | PHI + Gemini 원문 |
| 수술상담 | Gemini analyze | 빠른기록 D1 | extra는 API만, D1은 ADMIN_ONLY |
| OP체크 | D1 직접 | 동일 | STRICT는 UI만, 데이터면 COMPANY_SCOPE_OR_NULL |
| 입금실시간조회 | 웹훅+수동등록 | 조회 | Chart 이관 배너인데 쓰기 유지 |
| 마감보고 | daily_closures 업서트 | 현금일치 가짜 칩 | admin 명시 거부 무시 |
| ESL관리 | BLE+인계노트 | PC만 | AES 키가 클라 번들 |
| 주차/웹팩스 | 하드코딩 http | env HTTPS | extra 키 없음 fail-open |

## 2. 조사 발견 (미검증)

### P0 후보
- **EX-01** 입금 웹훅: 세션만으로 POST 가능 + query `companyId`로 타사 입금 row 생성 (`virtual-account-webhook/route.ts:50-101`, 테스트 버튼이 토큰 없이 실upsert).
- **EX-02** 퇴원심사 `company_id` 미기록 → `COMPANY_SCOPE_OR_NULL`이 NULL 행을 전 회사 공개. 환자명·DOB·차트 원문 (`퇴원심사.tsx:267-278`, `policies.ts` discharge).
- **EX-03** 인계노트에 회사 컬럼 없음 + AUTHENTICATED select → 환자명·병상 전사 (`인계노트.tsx:255-259`, schema handover_notes).

### P1 후보
- **EX-04** PC 부서별재고 카드는 ExtraFeatureSubview 스텁. 로더 없음.
- **EX-05** 모바일 부서재고: 회사만 필터, 부서는 클라 `includes` — 빈 부서면 전사 재고.
- **EX-06** 조직도/근무현황 모바일 `company='전체'`. `staff_members.select=PUBLIC`. 타병원 명단.
- **EX-07** `extra_조직도:false`가 무시됨 (`access-control.ts:686`).
- **EX-08** `extra_마감보고` admin은 명시 false여도 통과.
- **EX-09** 주차/웹팩스 extra 키 없음. PC 주차 URL이 http 혼합콘텐츠.
- **EX-10** ESL AES-128 키가 `'use client'` 모듈에 상수. 인계노트 500건 무필터 로드 후 BLE 전송.
- **EX-11** Gemini `/api/ai/chat`는 extra 검사 없음. 클라 `systemInstruction` 수용. Firebase 공개키를 Gemini 키로 폴백하고 mock을 `ok:true`.
- **EX-12** 수술상담 음성+식별자를 Google Files API로. sessionStorage에 차트번호 12시간.
- **EX-13** OP체크 NULL company_id 행이 OR_NULL로 교차회사. 환자명을 채팅/알림으로 팬아웃.
- **EX-14** Chart 이관 예정 마감/입금이 여전히 `daily_closures` / 가상계좌 테이블에 씀.
- **EX-15** 정착 계좌 `1002-4939-3286` 클라 하드코딩.

### P2
모바일 부서재고 출고/발주 버튼 no-op, 허브 검색 no-op, ExtraFeatureSubview 자체 권한 재검사 없음, 인계 삭제 UI는 전원·서버는 SELF_ONLY, 직원평가 UI vs ADMIN_OR_MANAGER 불일치, 퇴원 규정이 localStorage, MRI 허브 화면이 board_posts 스키마와 불일치.

## 3. 연계로 넘길 것
부서재고↔재고 워크센터, 인계/ESL/퇴원 PHI↔권한, 입금↔재무, OP/수술상담↔알림, 조직도 extra 키↔관리자 권한 UI.
