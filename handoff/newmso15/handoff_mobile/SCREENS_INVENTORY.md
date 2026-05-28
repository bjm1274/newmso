# 화면 인벤토리 — 63개 화면 매트릭스

> PC `MSO_PC_Redesign_Live.html` 의 모든 메뉴/탭/모듈 ↔ 모바일 화면 1:1 매핑.

## 범례
- ✅ 완성 · 풀 커버
- 🟡 부분 (탭/기능 일부 누락)
- ❌ 없음
- 📱 모바일 전용 (PC에는 없음)

---

## 1. MyPage · 내정보 (5/5)

| PC 탭 | 모바일 컴포넌트 | 라우트 | 상태 |
|---|---|---|---|
| home | `SHome` | (홈 탭) | ✅ |
| attend | `SAttend` | `attend` | ✅ |
| todo | `STodo` | `todo` | ✅ |
| docs | `SDocs` | `docs` | ✅ |
| alert | `SAlert` | `alert` | ✅ |

---

## 2. Chat · 채팅 (3/3)

| PC | 모바일 | 라우트 |
|---|---|---|
| 채팅 목록 | `SChatList` | (채팅 탭) |
| 채팅방 | `SChatRoom` | `chatroom` |
| 새 대화 (모달) | `SFormChat` | `form-chat` |

---

## 3. Board · 게시판 (4/4)

| PC | 모바일 | 라우트 |
|---|---|---|
| 게시판 목록 (7카테고리) | `SBoard` | (게시판 탭) |
| 글 상세 | `SBoardDetail` | `board-detail` |
| 글 작성 (모달) | `SFormPost` | `form-post` |
| 카테고리 7개 (공지·자유·경조사·수술일정·MRI일정·업무공유·식단) | `SBoard` 내 칩바 | — |

---

## 4. Approval · 전자결재 (5/5 + 상세 1)

| PC 5뷰 | 모바일 | 라우트 |
|---|---|---|
| 결재함 (받은) | `SApproval` (inbox) | (결재 탭) |
| 진행중 | `SApproval` (progress) | (탭) |
| 완료 | `SApproval` (done) | (탭) |
| 기안함 | `SApprovalSent` | `approval-sent` |
| 참조 문서함 | `SApprovalRef` | `approval-ref` |
| 작성하기 | `SApprovalWrite` | `approval-write` |
| 양식 관리 | `SAdminForms` 재사용 | `admin-forms` |
| 결재 상세 | `SApprovalDetail` | `approval-detail` |

---

## 5. HR · 인사관리 (7/7)

| PC 서브 | 모바일 | 라우트 |
|---|---|---|
| 구성원 (명단·발령·교육) | `SHrMember` | `hr-member` |
| 근태 관리 (대시·근무표·달력 + AI·3교대 마법사) | `SHrAttend` | `hr-attend` |
| 연차·휴가 (잔여·월별·신청 + 소멸 알림) | `SHrLeave` | `hr-leave` |
| 근태이상 감지 (본인·팀) | `SHrAbnormal` | `hr-abnormal` |
| 급여 (모바일은 명세서만) | `SPayroll` | `payroll` |
| 복지 (경조사·검진·면허·기기점검) | `SHrWelfare` | `hr-welfare` |
| 계약·문서 (내문서·증명서·계약·제출) | `SHrDocs` | `hr-docs` |
| 구성원 등록 (모달) | `SFormMember` | `form-member` |
| 연차 신청 (모달) | `SFormLeave` | `form-leave` |

> 급여 워크센터 (PC 9탭) → 모바일은 명세서만. 정책 `MSO_Mobile_Phase3_Screens.md §4`.

---

## 6. Stock · 재고관리 (4/4)

| PC 서브 | 모바일 | 라우트 |
|---|---|---|
| 재고 현황 | `SStock` | `stock` |
| 입출고·발주 (5탭: 입출고·발주·거래처·명세서) | `SStockIO` | `stock-io` |
| 물품·자산 (물품·카테고리·자산·UDI) | `SStockItem` | `stock-item` |
| 분석·마감 (ABC·예측·실사·마감·소모품·AS/반품) | `SStockAnalyze` | `stock-analyze` |
| 물품 등록 (모달) | `SFormItem` | `form-item` |
| 자산 등록 (QR · 모달) | `SFormAsset` | `form-asset` |
| 발주 등록 (모달) | `SFormOrder` | `form-order` |

---

## 7. Admin · 관리자 (7/7)

| PC 서브 | 모바일 | 라우트 |
|---|---|---|
| 경영 대시보드 (7개 → 통합 1) | `SExec` | `exec` |
| 시스템 마스터 (운영·이력·정합성·복구·필터·연차수정) | `SAdminMaster` | `admin-master` |
| 회사 관리 (정보·근무·카드·계약·휴가·급여·문서보관) | `SAdminCompany` | `admin-company` |
| 권한 관리 | `SAdminRoles` | `admin-roles` |
| 운영 설정 (일반·메시지 a/b/c·팝업·외부연동) | `SAdminOps` | `admin-ops` |
| 결재 양식 (14종) | `SAdminForms` | `admin-forms` |
| 감사·백업 (로그·이상·급여검사·DR) | `SAdminAudit` | `admin-audit` |

> 경영 대시보드 7개 (경영·재무·예산·통합보고서·손익·분석a/b) → 모바일 통합 1개. 정책 `§6`.

---

## 8. Addon · 추가기능 (12/12 — PC `ADDON_MODULES` 풀 매칭)

| PC 모듈 | 모바일 | 라우트 | 배지 |
|---|---|---|---|
| 조직도 | `SAddonOrg` | `addon-org` | — |
| 부서별 재고 | `SAddonDeptInv` | `addon-dept-inv` | — |
| 근무현황 | `SAddonWorknow` | `addon-worknow` | — |
| 인계노트 | `SAddonHandoff` | `addon-handoff` | — |
| 직원평가 | `SAddonEval` | `addon-eval` | — |
| 퇴원심사 | `SDischarge` + `SDischargeDetail` | `discharge` / `discharge-detail` | — |
| 수술상담 | `SAddonConsult` | `addon-consult` | — |
| OP체크 | `SOpCheck` + `SOpCheckDetail` | `op-board` / `op-detail` | — |
| 입금 실시간조회 | `SAddonDeposit` | `addon-deposit` | Chart 이관 |
| 마감보고 | `SAddonClosing` | `addon-closing` | Chart 이관 |
| 주차관제 | `SAddonExternal kind="parking"` | `addon-parking` | 외부연동 |
| 웹팩스 | `SAddonExternal kind="webfax"` | `addon-webfax` | 외부연동 |

### 추가기능 보조 화면 (PC `ADDON_MODULES` 외)
| 화면 | 컴포넌트 | 라우트 | 비고 |
|---|---|---|---|
| MRI 일정 | `SMri` | `mri` | 게시판/HR 보완 |
| 업무공유 목록 | `SShare` | `share` | 게시판 보완 |
| 업무공유 상세 | `SShareDetail` | `share-detail` | |
| 업무가이드 | `SGuide` | `guide` | |

---

## 9. More · 더보기 페이지 (📱 모바일 전용)

| 섹션 | 항목 | 라우트 |
|---|---|---|
| 개인 | 출퇴근·할일·서류제출·추가기능허브·알림설정 | — |
| 결재 5뷰 | 결재함·기안함·참조·작성·양식 | — |
| 인사관리 | HR 7서브 전체 | — |
| 재고관리 | Stock 4서브 전체 | — |
| 관리자 | Admin 7서브 전체 | — |
| 설정 | 앱 설정·FAQ·로그아웃 | — |

---

## 10. 인터랙티브 데모 (📱 모바일 전용)

캔버스 맨 위 — 실제 모바일 앱처럼 하단 탭 5개로 풀 라우팅. SUB_MAP의 모든 라우트 진입 가능.

---

## 합계

- **PC ↔ 모바일 매칭 화면: 56개**
- **모바일 전용 (More + 인터랙티브 데모): 2개**
- **등록·작성 모달: 7개**
- **총 63개 화면 + 1개 데모 = 64개 시연 가능한 뷰**
