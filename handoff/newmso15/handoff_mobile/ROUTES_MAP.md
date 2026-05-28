# 라우팅 맵 — SUB_MAP 키 → 컴포넌트 → 파일

> `mobile/m-canvas.jsx` 의 `SUB_MAP` 객체를 기준으로 한 라우팅 표.
> setSub('키') 호출하면 해당 화면 진입. 뒤로가기는 setSub(null).

## 사용법

```jsx
// 화면 안에서 다른 화면으로 진입
<button onClick={() => onOpen('hr-leave')}>연차 신청</button>

// 또는 More 페이지처럼 onNav prop
<MListRow onClick={() => onNav('admin-forms')}/>
```

## 전체 라우트

| 라우트 키 | 컴포넌트 | 파일 | 진입 경로 (예시) |
|---|---|---|---|
| **MyPage** ||||
| `attend` | `SAttend` | `m-screens-1.jsx` | 홈 빠른액션, More |
| `alert` | `SAlert` | `m-screens-1.jsx` | 홈 헤더 ⨯ |
| `todo` | `STodo` | `m-screens-extras.jsx` | 홈 빠른액션, More |
| `docs` | `SDocs` | `m-screens-extras.jsx` | 홈 빠른액션, More |
| **Chat** ||||
| `chatroom` | `SChatRoom` | `m-screens-1.jsx` | 채팅 목록 클릭 |
| `form-chat` | `SFormChat` | `m-screens-forms.jsx` | 채팅 헤더 ✎ |
| **Board** ||||
| `board-detail` | `SBoardDetail` | `m-screens-1.jsx` | 게시판 카드 클릭 |
| `form-post` | `SFormPost` | `m-screens-forms.jsx` | 게시판 헤더 ✎ |
| **Approval** ||||
| `app` | `SApproval` | `m-screens-2.jsx` | 결재함 단축 |
| `approval-detail` | `SApprovalDetail` | `m-screens-2.jsx` | 결재 카드 클릭 |
| `approval-sent` | `SApprovalSent` | `m-screens-extras.jsx` | 결재 칩바, More |
| `approval-ref` | `SApprovalRef` | `m-screens-extras.jsx` | 결재 칩바, More |
| `approval-write` | `SApprovalWrite` | `m-screens-extras.jsx` | 결재 칩바, More, 헤더 ✎ |
| **HR (7)** ||||
| `hr-member` | `SHrMember` | `m-screens-hr.jsx` | More 인사관리 |
| `hr-attend` | `SHrAttend` | `m-screens-hr.jsx` | More |
| `hr-leave` | `SHrLeave` | `m-screens-hr.jsx` | 홈 빠른액션, More |
| `hr-abnormal` | `SHrAbnormal` | `m-screens-hr.jsx` | 홈 빠른액션, More |
| `payroll` | `SPayroll` | `m-screens-2.jsx` | 홈 빠른액션, More |
| `hr-welfare` | `SHrWelfare` | `m-screens-hr.jsx` | 홈 빠른액션, More |
| `hr-docs` | `SHrDocs` | `m-screens-hr.jsx` | More, 홈 빠른액션 |
| `form-member` | `SFormMember` | `m-screens-forms.jsx` | 구성원 헤더 + |
| `form-leave` | `SFormLeave` | `m-screens-forms.jsx` | 연차 sticky 버튼 |
| **Stock (4)** ||||
| `stock` | `SStock` | `m-screens-2.jsx` | More |
| `stock-io` | `SStockIO` | `m-screens-stock.jsx` | More |
| `stock-item` | `SStockItem` | `m-screens-stock.jsx` | More, 추가기능 자산 |
| `stock-analyze` | `SStockAnalyze` | `m-screens-stock.jsx` | More |
| `form-item` | `SFormItem` | `m-screens-forms.jsx` | 물품 헤더 + |
| `form-asset` | `SFormAsset` | `m-screens-forms.jsx` | 자산 탭 QR 카드 |
| `form-order` | `SFormOrder` | `m-screens-forms.jsx` | 재고 sticky 발주 |
| **Admin (7)** ||||
| `exec` | `SExec` | `m-screens-2.jsx` | More |
| `admin-master` | `SAdminMaster` | `m-screens-admin.jsx` | More |
| `admin-company` | `SAdminCompany` | `m-screens-admin.jsx` | More |
| `admin-roles` | `SAdminRoles` | `m-screens-admin.jsx` | More |
| `admin-ops` | `SAdminOps` | `m-screens-admin.jsx` | More |
| `admin-forms` | `SAdminForms` | `m-screens-admin.jsx` | More, 결재 칩바 |
| `admin-audit` | `SAdminAudit` | `m-screens-admin.jsx` | More |
| **Addon (12 PC + 4 보조)** ||||
| `addon` | `SAddon` | `m-screens-2.jsx` | More 개인 |
| `addon-org` | `SAddonOrg` | `m-screens-addon-modules.jsx` | Addon 허브 |
| `addon-dept-inv` | `SAddonDeptInv` | `m-screens-addon-modules.jsx` | Addon 허브 |
| `addon-worknow` | `SAddonWorknow` | `m-screens-addon-modules.jsx` | Addon 허브 |
| `addon-handoff` | `SAddonHandoff` | `m-screens-addon-modules.jsx` | Addon 허브 |
| `addon-eval` | `SAddonEval` | `m-screens-addon-modules.jsx` | Addon 허브 |
| `addon-consult` | `SAddonConsult` | `m-screens-addon-modules.jsx` | Addon 허브 |
| `addon-deposit` | `SAddonDeposit` | `m-screens-addon-modules.jsx` | Addon 허브 |
| `addon-closing` | `SAddonClosing` | `m-screens-addon-modules.jsx` | Addon 허브 |
| `addon-parking` | `SAddonExternal kind="parking"` | `m-screens-addon-modules.jsx` | Addon 허브 |
| `addon-webfax` | `SAddonExternal kind="webfax"` | `m-screens-addon-modules.jsx` | Addon 허브 |
| `op-board` | `SOpCheck` | `m-screens-addon-details.jsx` | Addon 허브 OP체크 |
| `op-detail` | `SOpCheckDetail` | `m-screens-addon-details.jsx` | OP보드 카드 |
| `discharge` | `SDischarge` | `m-screens-addon-details.jsx` | Addon 허브 퇴원심사 |
| `discharge-detail` | `SDischargeDetail` | `m-screens-addon-details.jsx` | 퇴원심사 카드 |
| `mri` | `SMri` | `m-screens-addon-details.jsx` | 별도 |
| `share` | `SShare` | `m-screens-addon-details.jsx` | 별도 |
| `share-detail` | `SShareDetail` | `m-screens-addon-details.jsx` | 업무공유 카드 |
| `guide` | `SGuide` | `m-screens-addon-details.jsx` | 별도 |

## 새 라우트 추가 시

```jsx
// 1. m-screens-XXX.jsx 파일 끝에 export
Object.assign(window, { SNewScreen });

// 2. m-canvas.jsx SUB_MAP 에 추가
const SUB_MAP = {
  ...
  'new-route': (nav, back) => <SNewScreen onBack={back} onOpen={nav}/>,
  ...
};

// 3. 진입점 컴포넌트에서 트리거
<button onClick={()=>onNav('new-route')}>새 화면 열기</button>

// 4. (선택) DCSection 안에 시연용 아트보드
<DCArtboard id="m-new" label="..." width={PHONE_W} height={PHONE_H}>
  <Phone dark={dark}><SNewScreen onBack={()=>{}}/></Phone>
</DCArtboard>
```
