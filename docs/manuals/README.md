# NEWMSO 배포용 기능 설명서

이 문서는 `C:\Users\baek_\newmso` 원본 코드 기준으로 다시 정리한 배포용 설명서입니다.  
작성 기준일은 `2026-03-09`이며, 샌드박스나 시안이 아니라 현재 원본 프로그램 구조를 기준으로 정리했습니다.

## 문서 목록

- `00_system_overview_ko.md`
  전체 메뉴와 기능 구조를 설명하는 기준 문서
- `07_full_menu_catalog_ko.md`
  메인 메뉴, 서브메뉴, 내부 탭, 보조 탭까지 포함한 전체 메뉴 상세 설명서
- `menu_guides/README.md`
  메인 메뉴별로 분리한 상세 설명서 인덱스
- `01_employee_manual_ko.md`
  일반 사원 배포용 설명서
- `02_manager_manual_ko.md`
  팀장, 실장, 부장, 간호과장 등 부서장급 배포용 설명서
- `03_admin_manual_ko.md`
  관리자 운영용 설명서
- `04_master_manual_ko.md`
  최고권한 운영자용 설명서

## 권장 배포 기준

- 일반 직원 공지: `01_employee_manual_ko.md`
- 부서장 공지: `02_manager_manual_ko.md`
- 관리자 운영 안내: `03_admin_manual_ko.md`
- 최고권한 운영 기준: `04_master_manual_ko.md`
- 전체 기능 목록 또는 교육용 기준 문서: `00_system_overview_ko.md`
- 전체 메뉴 구조를 상세하게 설명하는 기준 문서: `07_full_menu_catalog_ko.md`

## PPT 자료

- `generated/NEWMSO_원본기준_화면설명서_1차.pptx`
  화면 중심 1차 안내서
- `generated/NEWMSO_전체메뉴_상세설명서_2차.pptx`
  메인 메뉴, 서브메뉴, 내부 탭 구조까지 정리한 전체 메뉴 상세 PPT
- `generated/NEWMSO_사원용_화면설명서.pptx`
  사원용 화면 설명서
- `generated/NEWMSO_부서장용_화면설명서.pptx`
  부서장용 화면 설명서
- `generated/NEWMSO_관리자용_화면설명서.pptx`
  관리자용 화면 설명서
- `generated/NEWMSO_마스터용_화면설명서.pptx`
  마스터용 화면 설명서

## 메뉴별 상세 설명서

- `menu_guides/09_mypage_menu_guide_ko.md`
  내정보 상세 설명서
- `menu_guides/10_extra_features_menu_guide_ko.md`
  추가기능 상세 설명서
- `menu_guides/11_chat_menu_guide_ko.md`
  채팅 상세 설명서
- `menu_guides/12_board_menu_guide_ko.md`
  게시판 상세 설명서
- `menu_guides/13_approval_menu_guide_ko.md`
  전자결재 상세 설명서
- `menu_guides/14_hr_menu_guide_ko.md`
  인사관리 상세 설명서
- `menu_guides/15_inventory_menu_guide_ko.md`
  재고관리 상세 설명서
- `menu_guides/16_admin_menu_guide_ko.md`
  관리자 상세 설명서
- `menu_guides/17_hr_staff_operations_guide_ko.md`
  인사관리 세부 설명서 1: 인력관리
- `menu_guides/18_hr_attendance_leave_guide_ko.md`
  인사관리 세부 설명서 2: 근태 · 휴가
- `menu_guides/19_hr_payroll_guide_ko.md`
  인사관리 세부 설명서 3: 급여
- `menu_guides/20_hr_welfare_documents_guide_ko.md`
  인사관리 세부 설명서 4: 복지 · 문서
- `menu_guides/21_approval_drafting_guide_ko.md`
  전자결재 세부 설명서 1: 작성하기
- `menu_guides/22_approval_review_guide_ko.md`
  전자결재 세부 설명서 2: 기안함 · 결재함 · 캘린더
- `menu_guides/23_approval_admin_tools_guide_ko.md`
  전자결재 세부 설명서 3: 양식빌더 · 서명관리 · 직인관리
- `menu_guides/24_hr_staff_directory_screen_guide_ko.md`
  인사관리 화면별 설명서 1: 구성원현황
- `menu_guides/25_hr_attendance_screen_guide_ko.md`
  인사관리 화면별 설명서 2: 근태
- `menu_guides/26_hr_payroll_screen_guide_ko.md`
  인사관리 화면별 설명서 3: 급여
- `menu_guides/27_hr_contract_screen_guide_ko.md`
  인사관리 화면별 설명서 4: 계약

## 이 문서를 읽을 때 주의할 점

- 실제 보이는 메뉴는 회사, 권한, 직책에 따라 달라질 수 있습니다.
- 현재 원본 UI에는 설계 의도보다 넓게 보이는 탭도 일부 있습니다. 이 문서에는 그런 현재 상태도 함께 반영했습니다.
- `조직도`는 현재 기본 사이드바 고정 메뉴라기보다 `추가기능`, 검색, 직접 이동에서 여는 화면에 가깝습니다.
- `관리자` 메뉴는 권한 설정상 보일 수 있어도, 실제 화면은 현재 코드 기준으로 MSO 권한 계정 중심으로 동작합니다.
