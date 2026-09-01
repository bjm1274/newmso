# 11차 · 06 전자결재

> 조사일: 2026-08-31 · 1차 조사(미검증).

함: 결재함 / 기안함 / 참조 문서함 / 작성하기. 최종 효과는 `/api/approvals/transition` → `process-final`.

## 조사 발견

### P0 후보
- **AP-01** `current_approver_id` / `approver_line`이 mutate로 쓰기 가능. 전환은 그 값을 최종 결재 판정에 사용 → 결재선 점프 후 process-final.
- **AP-02** HR(`erpCanManageCompany`)은 update 가드 앞단에서 true. `status:'승인'` 위조 후 process-final로 `base_salary` UPDATE.

### P1 후보
- **AP-03** `approval_history`에 approve 행이 없어 process-final이 `current_approver_id`/라인 마지막 id 폴백.
- **AP-04** 급여 금액·대상은 전부 meta. `type===''` + meta 마커면 여전히 급여 효과.
- **AP-05** 승인된 물품신청 `meta_data`가 계속 쓰여 수량 부풀리기.
- **AP-06** 비관리자 자기결재는 막힘. `sender_id===''` insert면 우회. 관리자는 자기결재 가능.
- **AP-07** 연차는 `type`이 연차/휴가일 때만 원장 반영. type 공란이면 승인만 되고 원장 무이동.
- **AP-08** 모바일 연차계획 meta가 PC `planDates`와 불일치. 연장근무 산출(480분 vs 근무조) 불일치. 병가/경조 종류 없음.

### P2
위임 날짜 없으면 always-on, 클라 위임 동기화가 로컬 거짓을 persist, 재처리 급여 API가 meta form_type을 봄, 모바일 임시저장 없음, 참조함 cc_departments 미사용, inbox가 자기 기안을 뺌.

닫힌 것: insert 시 이미 승인 상태, 전결 주석 스킵, 비관리자 정상 sender 자기결재.
