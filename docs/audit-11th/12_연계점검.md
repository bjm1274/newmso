# 11차 · 12 연계 재점검

메뉴 보고서가 모인 뒤 실제 호출 hop을 다시 탔다. “연동됨” 카피만 믿지 않음.

| 연계 | 판정 | 핵심 단절 |
|------|------|-----------|
| 출퇴근 → 근태 KPI → 결근 크론 → 급여 공제 | **의미 불일치** | KPI는 평일 무기록=결근. 크론은 근무표만. `ModAbsence`는 출퇴근이 아니라 기본급 하락 휴리스틱. 실제 공제는 `급여정산` + 영문 `attendances.status`. dual-write는 best-effort. |
| 연차 → 결재 → 원장 → 캘린더 → 인사 잔여 | **부분 연결** | 결재 type은 `연차/휴가`(휴가원 문자열 없음). 원장은 process-final에서 돈다. 캘린더는 **대기**도 휴가로 그림. ICS만 승인. 잔여는 `leave_ledger` 주기. |
| 급여 persist → 결재 인상 → 재무 → 알림 | **파이프라인 아님** | 인상은 transition이 `base_salary`만 갱신(`salary` KPI 낡음). process-final 라우트는 UI가 안 부름. 재무 payroll-link는 빈 배열. 급여일 크론은 푸시 없음·기본 off. |
| 채팅 → 푸시 → 알림센터 | **연결됨 + 구멍** | mutate enqueue + 즉시 dispatch + 클라 POST + 1/5분 크론. 앨범 마지막 미삽입 시 복구 불가. `flush=rest`는 코드에 없음. |
| 재고 stock-post ↔ 부서별재고 ↔ 매입원장 ↔ 마감 | **세 갈래** | 부서별재고 PC 스텁. 마감은 stock-post만. transfer/빈 company 우회. 재무는 purchase_orders를 안 읽음. |
| 결재 양식 → 계약 서명 → 서류제출 | **테이블이 다름** | forms=`approval_form_types`. 서명은 `employment_contracts`. `근로계약서`는 HR 16종 필수에 없음. |
| 권한 에디터 → 메뉴/extra/board | **UI OFF ≠ deny** | unset을 해제로 보여 주지만 admin은 unset=허용. |
| 로그인 ↔ 오프보딩 ↔ 미들웨어 | **층마다 다른 게이트** | 신규 퇴사 로그인은 막힘. start는 세션 유지. 미들웨어는 HMAC만. |
