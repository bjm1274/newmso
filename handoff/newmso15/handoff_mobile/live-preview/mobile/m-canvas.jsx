// MSO 모바일 — 캔버스 앱 (디자인 캔버스에 iOS 프레임 13개 배치)
// 모든 화면 컴포넌트는 m-screens-1.jsx / m-screens-2.jsx 에서 window 로 노출됨.

const PHONE_W = 390;
const PHONE_H = 844;
// design_canvas artboard 가 컨테이너 자체 — 그 안에 IOSDevice 가 같은 폭으로 들어감.

// 각 화면 컴포넌트를 단일 iOS 프레임으로 감싸는 헬퍼
const Frame = ({ children, dark = false, tab, badges, onTab }) => (
  <div className={'mso-mobile' + (dark ? ' dark' : '')} style={{
    width: PHONE_W, height: PHONE_H,
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg)',
  }}>
    <div style={{flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column'}}>
      {children}
    </div>
    {tab && <MBottomTab active={tab} badges={badges || {}} onPick={onTab || (()=>{})}/>}
  </div>
);

// ─── 인터랙티브 데모: 하단 탭 5개 클릭하면 화면 전환 ─────────────────
const SUB_MAP = {
  'attend':           (nav, back) => <SAttend onBack={back}/>,
  'alert':            (nav, back) => <SAlert onBack={back}/>,
  'todo':             (nav, back) => <STodo onBack={back}/>,
  'docs':             (nav, back) => <SDocs onBack={back}/>,
  'chatroom':         (nav, back) => <SChatRoom onBack={back}/>,
  'board-detail':     (nav, back) => <SBoardDetail onBack={back}/>,
  'approval-detail':  (nav, back) => <SApprovalDetail onBack={back}/>,
  'approval-sent':    (nav, back) => <SApprovalSent onBack={back}/>,
  'approval-ref':     (nav, back) => <SApprovalRef onBack={back}/>,
  'approval-write':   (nav, back) => <SApprovalWrite onBack={back}/>,
  'payroll':          (nav, back) => <SPayroll onBack={back}/>,
  'stock':            (nav, back) => <SStock onBack={back} onOpen={nav}/>,
  'exec':             (nav, back) => <SExec onBack={back}/>,
  'addon':            (nav, back) => <SAddon onBack={back} onOpen={nav}/>,
  // HR
  'hr-member':        (nav, back) => <SHrMember onBack={back} onOpen={nav}/>,
  'hr-attend':        (nav, back) => <SHrAttend onBack={back}/>,
  'hr-leave':         (nav, back) => <SHrLeave onBack={back} onOpen={nav}/>,
  'hr-abnormal':      (nav, back) => <SHrAbnormal onBack={back}/>,
  'hr-welfare':       (nav, back) => <SHrWelfare onBack={back}/>,
  'hr-docs':          (nav, back) => <SHrDocs onBack={back}/>,
  // Stock
  'stock-io':         (nav, back) => <SStockIO onBack={back} onOpen={nav}/>,
  'stock-item':       (nav, back) => <SStockItem onBack={back} onOpen={nav}/>,
  'stock-analyze':    (nav, back) => <SStockAnalyze onBack={back}/>,
  // Admin
  'admin-master':     (nav, back) => <SAdminMaster onBack={back}/>,
  'admin-company':    (nav, back) => <SAdminCompany onBack={back}/>,
  'admin-roles':      (nav, back) => <SAdminRoles onBack={back}/>,
  'admin-ops':        (nav, back) => <SAdminOps onBack={back}/>,
  'admin-forms':      (nav, back) => <SAdminForms onBack={back}/>,
  'admin-audit':      (nav, back) => <SAdminAudit onBack={back}/>,
  // Addon details
  'op-board':         (nav, back) => <SOpCheck onBack={back} onOpen={()=>nav('op-detail')}/>,
  'op-detail':        (nav, back) => <SOpCheckDetail onBack={back}/>,
  'discharge':        (nav, back) => <SDischarge onBack={back} onOpen={()=>nav('discharge-detail')}/>,
  'discharge-detail': (nav, back) => <SDischargeDetail onBack={back}/>,
  'mri':              (nav, back) => <SMri onBack={back}/>,
  'share':            (nav, back) => <SShare onBack={back} onOpen={()=>nav('share-detail')}/>,
  'share-detail':     (nav, back) => <SShareDetail onBack={back}/>,
  'guide':            (nav, back) => <SGuide onBack={back}/>,
  // Addon modules (PC 12개와 1:1)
  'addon-org':        (nav, back) => <SAddonOrg onBack={back}/>,
  'addon-dept-inv':   (nav, back) => <SAddonDeptInv onBack={back}/>,
  'addon-worknow':    (nav, back) => <SAddonWorknow onBack={back}/>,
  'addon-handoff':    (nav, back) => <SAddonHandoff onBack={back}/>,
  'addon-eval':       (nav, back) => <SAddonEval onBack={back}/>,
  'addon-consult':    (nav, back) => <SAddonConsult onBack={back}/>,
  'addon-deposit':    (nav, back) => <SAddonDeposit onBack={back}/>,
  'addon-closing':    (nav, back) => <SAddonClosing onBack={back}/>,
  'addon-parking':    (nav, back) => <SAddonExternal onBack={back} kind="parking"/>,
  'addon-webfax':     (nav, back) => <SAddonExternal onBack={back} kind="webfax"/>,
  // legacy short routes (PC 와 다른 이름)
  'deposit':          (nav, back) => <SAddonDeposit onBack={back}/>,
  'closing':          (nav, back) => <SAddonClosing onBack={back}/>,
  'parking':          (nav, back) => <SAddonExternal onBack={back} kind="parking"/>,
  'webfax':           (nav, back) => <SAddonExternal onBack={back} kind="webfax"/>,
  // Addon — newly added (PC ADDON_MODULES 풀 커버)
  'org':              (nav, back) => <SAddonOrg onBack={back}/>,
  'dept-inventory':   (nav, back) => <SAddonDeptInv onBack={back}/>,
  'worknow':          (nav, back) => <SAddonWorknow onBack={back}/>,
  'handoff':          (nav, back) => <SAddonHandoff onBack={back}/>,
  'eval':             (nav, back) => <SAddonEval onBack={back}/>,
  'consult':          (nav, back) => <SAddonConsult onBack={back}/>,
  'deposit':          (nav, back) => <SAddonDeposit onBack={back}/>,
  'closing':          (nav, back) => <SAddonClosing onBack={back}/>,
  'parking':          (nav, back) => <SAddonExternal onBack={back} kind="parking"/>,
  'webfax':           (nav, back) => <SAddonExternal onBack={back} kind="webfax"/>,
  // Forms (등록/작성)
  'form-member':      (nav, back) => <SFormMember onBack={back}/>,
  'form-item':        (nav, back) => <SFormItem onBack={back}/>,
  'form-asset':       (nav, back) => <SFormAsset onBack={back}/>,
  'form-order':       (nav, back) => <SFormOrder onBack={back}/>,
  'form-leave':       (nav, back) => <SFormLeave onBack={back}/>,
  'form-post':        (nav, back) => <SFormPost onBack={back}/>,
  'form-chat':        (nav, back) => <SFormChat onBack={back}/>,
  // shortcuts
  'app':              (nav, back) => <SApproval onOpen={()=>nav('approval-detail')} onNav={nav}/>,
};

const InteractiveDemo = ({ dark }) => {
  const [tab, setTab] = React.useState('home');
  const [sub, setSub] = React.useState(null);
  let body;
  if (sub && SUB_MAP[sub]) body = SUB_MAP[sub](setSub, () => setSub(null));
  else if (tab === 'home')  body = <SHome onSub={setSub}/>;
  else if (tab === 'chat')  body = <SChatList onOpen={()=>setSub('chatroom')} onNav={setSub}/>;
  else if (tab === 'board') body = <SBoard onOpen={()=>setSub('board-detail')} onNav={setSub}/>;
  else if (tab === 'app')   body = <SApproval onOpen={()=>setSub('approval-detail')} onNav={setSub}/>;
  else if (tab === 'more')  body = <SMore onNav={setSub}/>;
  return (
    <Frame dark={dark} tab={sub ? null : tab} badges={{home:true, chat:true, app:true}} onTab={(t)=>{setSub(null); setTab(t);}}>
      {body}
    </Frame>
  );
};

// ─── DC 컨테이너 (디바이스 프레임을 폰 크기 컨테이너에 흩뿌리기) ────
const Phone = ({ children, dark }) => (
  <div style={{
    width: PHONE_W, height: PHONE_H,
    background: dark ? '#000' : '#fff',
    overflow: 'hidden',
    position: 'relative',
  }}>
    <div className={'mso-mobile' + (dark ? ' dark' : '')} style={{
      width:'100%', height:'100%', display:'flex', flexDirection:'column',
    }}>
      {children}
    </div>
  </div>
);

// ─── Tweaks (다크모드 + 강조색) ────────────────────────────────
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "dark": false,
  "accent": "#2563EB"
}/*EDITMODE-END*/;

const App = () => {
  const [tweaks, setTweaks] = React.useState(TWEAK_DEFAULTS);
  const [editMode, setEditMode] = React.useState(false);

  // tweaks listener
  React.useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setEditMode(true);
      else if (e.data?.type === '__deactivate_edit_mode') setEditMode(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const setTweak = (k, v) => {
    setTweaks(prev => {
      const next = typeof k === 'object' ? { ...prev, ...k } : { ...prev, [k]: v };
      window.parent.postMessage({ type: '__edit_mode_set_keys', edits: next }, '*');
      return next;
    });
  };

  // accent override
  React.useEffect(() => {
    document.documentElement.style.setProperty('--app-accent', tweaks.accent);
    // override the --accent token in mso-mobile via JS injected style
    let s = document.getElementById('__mobile-accent');
    if (!s) {
      s = document.createElement('style');
      s.id = '__mobile-accent';
      document.head.appendChild(s);
    }
    const a = tweaks.accent;
    // hex to rgb for tint
    const hex = a.replace('#','');
    const r = parseInt(hex.substring(0,2),16);
    const g = parseInt(hex.substring(2,4),16);
    const b = parseInt(hex.substring(4,6),16);
    s.textContent = `
      .mso-mobile { --accent: ${a}; --accent-soft: rgba(${r},${g},${b},0.12); --accent-tint: rgba(${r},${g},${b},0.16); }
      .mso-mobile.dark { --accent-soft: rgba(${r},${g},${b},0.22); --accent-tint: rgba(${r},${g},${b},0.28); }
    `;
  }, [tweaks.accent]);

  const dark = tweaks.dark;

  return (
    <>
      <DesignCanvas>
        <DCSection id="interactive" title="인터랙티브 데모"
          subtitle="하단 탭을 눌러 5개 메뉴 전환 · 카드를 누르면 하위 화면으로 진입 · 좌측 상단 ← 으로 복귀">
          <DCArtboard id="interactive-demo" label="실제 사용 흐름 (탭 + 드릴다운 13화면)" width={PHONE_W} height={PHONE_H}>
            <InteractiveDemo dark={dark}/>
          </DCArtboard>
        </DCSection>

        <DCSection id="mypage" title="내정보 · MyPage"
          subtitle="홈 · 출퇴근 · 할일 · 서류제출 · 알림 — PC 5개 탭 풀 커버">
          <DCArtboard id="m-home"   label="홈 · KPI 5 + 빠른 액션 8"        width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SHome onSub={()=>{}}/><MBottomTab active="home" badges={{home:true, chat:true, app:true}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-attend" label="출퇴근 체크인 · 큰 GPS 버튼"        width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAttend onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-todo"   label="할일 · 우선순위 칩 + 빠른 등록 + 체크" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><STodo onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-docs"   label="서류제출 · 진행률 도넛 + 미제출/완료" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SDocs onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-alert"  label="알림 · 필터 6개 + 카드 리스트"     width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAlert onBack={()=>{}}/></Phone>
          </DCArtboard>
        </DCSection>

        <DCSection id="chat" title="채팅 · Messenger"
          subtitle="현장 인수인계 · 결재 알림 · 그룹 채팅 — 모바일 사용 1위">
          <DCArtboard id="m-chat-list" label="채팅 목록 · 핀 + 멘션 + 안읽음" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SChatList onOpen={()=>{}}/><MBottomTab active="chat" badges={{home:true, chat:true, app:true}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-chat-room" label="채팅방 · 좌우 버블 + 컴포저"     width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SChatRoom onBack={()=>{}}/></Phone>
          </DCArtboard>
        </DCSection>

        <DCSection id="board" title="게시판 · Board"
          subtitle="공지 · 식단 · 수술일정 · 업무공유 — 6개 카테고리 통합">
          <DCArtboard id="m-board-list" label="게시판 목록 · 카드 + 카테고리 칩" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SBoard onOpen={()=>{}}/><MBottomTab active="board" badges={{home:true, chat:true, app:true}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-board-detail" label="공지 상세 · 본문 + 첨부 + 댓글" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SBoardDetail onBack={()=>{}}/></Phone>
          </DCArtboard>
        </DCSection>

        <DCSection id="approval" title="전자결재 · Approval (5뷰)"
          subtitle="결재함 · 기안함 · 참조 문서함 · 작성하기 · 양식 관리 (PC 5뷰 풀 커버)">
          <DCArtboard id="m-app-list" label="결재함 · 받은/진행/완료 + 5뷰 칩바" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SApproval onOpen={()=>{}} onNav={()=>{}}/><MBottomTab active="app" badges={{home:true, chat:true, app:true}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-app-detail" label="결재 상세 · 양식/결재선/코멘트 + sticky 액션" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SApprovalDetail onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-app-sent" label="기안함 · 내가 올린 결재 진행도" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SApprovalSent onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-app-ref" label="참조 문서함 · 미열람 강조" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SApprovalRef onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-app-write" label="결재 작성 · 양식 14종 그룹별 선택" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SApprovalWrite onBack={()=>{}}/></Phone>
          </DCArtboard>
        </DCSection>

        <DCSection id="more" title="More · 메뉴 드로어"
          subtitle="모바일 More 탭에서 인사·재고·관리자 17개 서브메뉴 전체 접근">
          <DCArtboard id="m-more" label="More · 메뉴 드로어 + 프로필 + 인사 7 · 재고 4 · 관리자 7" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SMore onNav={()=>{}}/><MBottomTab active="more" badges={{home:true, chat:true, app:true}}/></Phone>
          </DCArtboard>
        </DCSection>

        <DCSection id="hr" title="인사관리 · HR (7개 서브메뉴)"
          subtitle="구성원·근태·연차·근태이상·급여·복지·계약문서 — 모바일 사용 핵심군">
          <DCArtboard id="m-hr-member"   label="구성원 · 명단/인사발령/교육" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SHrMember onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-hr-attend"   label="근태 관리 · 대시보드/근무표/달력" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SHrAttend onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-hr-leave"    label="연차·휴가 · 잔여 hero + 월별 + 신청 내역" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SHrLeave onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-hr-abnormal" label="근태이상 감지 · 본인/팀 + 사유 입력" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SHrAbnormal onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-payroll"     label="급여명세서 · 실수령액 hero + 지급/공제" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SPayroll onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-hr-welfare"  label="복지 · 경조사/건강검진/면허/장비점검" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SHrWelfare onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-hr-docs"     label="계약·문서 · 내문서/증명서/계약/서류제출" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SHrDocs onBack={()=>{}}/></Phone>
          </DCArtboard>
        </DCSection>

        <DCSection id="stock" title="재고관리 · Stock (4개 서브메뉴)"
          subtitle="재고현황·입출고/발주·물품/자산·분석/마감">
          <DCArtboard id="m-stock"          label="재고 현황 · 부족 알람 + 안전재고 progress" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SStock onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-stock-io"       label="입출고·발주 · 거래 + 자동발주 + 거래처" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SStockIO onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-stock-item"     label="물품·자산 · QR 스캔 + 자산 카드" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SStockItem onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-stock-analyze"  label="분석·마감 · ABC/예측/실사/마감" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SStockAnalyze onBack={()=>{}}/></Phone>
          </DCArtboard>
        </DCSection>

        <DCSection id="admin" title="관리자 · Admin (7개 서브메뉴)"
          subtitle="경영지표·시스템마스터·회사관리·권한·운영·양식·감사 — 모바일은 조회/요약 위주">
          <DCArtboard id="m-exec"          label="경영지표 · KPI 4 + 매출 추이 + 부문 비중" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SExec onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-admin-master"  label="시스템 마스터 · KPI 6 + 잡/정합성/백업" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAdminMaster onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-admin-company" label="회사 관리 · 7-탭 (조회 only)" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAdminCompany onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-admin-roles"   label="권한 관리 · 역할 6개 카드 + 모듈 칩" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAdminRoles onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-admin-ops"     label="운영 설정 · 일반/메시지/팝업/외부연동" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAdminOps onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-admin-forms"   label="결재 양식 · 14종 카드 그리드" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAdminForms onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-admin-audit"   label="감사·백업 · 로그/이상/급여검사/DR" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAdminAudit onBack={()=>{}}/></Phone>
          </DCArtboard>
        </DCSection>

        <DCSection id="addon-pc12" title="추가기능 — PC ADDON_MODULES 풀 커버 (12개 + 외부 2)"
          subtitle="조직도·부서별 재고·근무현황·인계노트·직원평가·수술상담·입금 실시간조회·마감보고·주차관제·웹팩스">
          <DCArtboard id="m-org"            label="조직도 · 다중 병원 트리 + 근무중 표시" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonOrg onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-dept-inventory" label="부서별 재고 · 부서 칩 + 안전재고 progress" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonDeptInv onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-worknow"        label="실시간 근무현황 · 6 상태 카운트 + 좌측 컬러바" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonWorknow onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-handoff"        label="인계노트 · 가로 캘린더 + 공통/환자별 탭 + FAB" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonHandoff onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-eval"           label="직원평가 · 평가 대상 11명 리스트" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonEval onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-consult"        label="수술상담 · 음성분석 hero + 동의서 체크 3/6" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonConsult onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-deposit"        label="입금 실시간조회 · Chart 이관 안내 + KPI 4 + 거래" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonDeposit onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-closing"        label="마감보고 · 미제출 강조 + 마감 리스트" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonClosing onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-parking"        label="외부 시스템 안내 · 주차관제" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonExternal onBack={()=>{}} kind="parking"/></Phone>
          </DCArtboard>
          <DCArtboard id="m-webfax"         label="외부 시스템 안내 · 웹팩스" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonExternal onBack={()=>{}} kind="webfax"/></Phone>
          </DCArtboard>
        </DCSection>

        <DCSection id="addon-modules" title="추가기능 12개 모듈 (PC ADDON_MODULES 풀 커버)"
          subtitle="조직도 · 부서별 재고 · 근무현황 · 인계노트 · 직원평가 · 퇴원심사 · 수술상담 · OP체크 · 입금실시간 · 마감보고 · 주차관제 · 웹팩스">
          <DCArtboard id="m-addon-hub" label="허브 · 12개 모듈 그리드 + OP hero" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddon onBack={()=>{}} onOpen={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-addon-org" label="조직도 · 부서/카드/조직도 3-뷰" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonOrg onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-addon-deptinv" label="부서별 재고 · MSO/일반 발주 흐름 안내" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonDeptInv onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-addon-worknow" label="근무현황 · KPI 4 + 실시간 카드" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonWorknow onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-addon-handoff" label="인계노트 · 오늘/이번주 + 부서별" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonHandoff onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-addon-eval" label="직원평가 · 항목별 점수 + 코멘트" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonEval onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-addon-consult" label="수술상담 · 음성분석 + 전환율 hero" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonConsult onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-addon-deposit" label="입금 실시간조회 · 시간대 차트 + 카드 (Chart 이관)" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonDeposit onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-addon-closing" label="마감보고 · 일/주/월 + 체크리스트 6 (Chart 이관)" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonClosing onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-addon-parking" label="주차관제 · 외부연동 안내" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonExternal onBack={()=>{}} kind="parking"/></Phone>
          </DCArtboard>
          <DCArtboard id="m-addon-webfax" label="웹팩스 · 외부연동 안내" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SAddonExternal onBack={()=>{}} kind="webfax"/></Phone>
          </DCArtboard>
        </DCSection>

        <DCSection id="addon-old" title="추가기능 디테일 (기존 보조 화면)"
          subtitle="OP체크 보드·상세 · 퇴원심사 · MRI · 업무공유 · 업무가이드">
          <DCArtboard id="m-op-board" label="OP체크 · 실시간 보드 + 인라인 상태전환" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SOpCheck onBack={()=>{}} onOpen={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-op-detail" label="OP체크 상세 · 4단계 진행 + 체크리스트" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SOpCheckDetail onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-discharge" label="퇴원심사 · 4-필터 + 단계 칩" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SDischarge onBack={()=>{}} onOpen={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-discharge-detail" label="퇴원심사 상세 · 요약/진료기록/코멘트" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SDischargeDetail onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-mri" label="MRI 일정 · 촬영중 hero + 시간표" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SMri onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-share" label="업무공유 · 인수인계 카드 + FAB" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SShare onBack={()=>{}} onOpen={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-share-detail" label="업무공유 상세 · 본문 + 첨부 + 댓글 sticky" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SShareDetail onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-guide" label="업무가이드 · 카테고리 6 + HOT 가이드" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SGuide onBack={()=>{}}/></Phone>
          </DCArtboard>
        </DCSection>

        <DCSection id="forms" title="등록·작성 모달 화면 (7종)"
          subtitle="구성원·물품·자산(QR)·발주·연차·게시판·새 대화 — 모바일 친화 폼 패턴">
          <DCArtboard id="m-form-member" label="구성원 등록 · 3-step 위저드 (기본/계약/권한)" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SFormMember onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-form-item" label="물품 등록 · 사진 + QR 스캔 + 카테고리" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SFormItem onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-form-asset" label="자산 등록 · UDI QR 스캔 hero" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SFormAsset onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-form-order" label="발주 등록 · 거래처 + 품목 수량 + sticky 합계" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SFormOrder onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-form-leave" label="연차 신청 · 잔여 hero + 날짜 + 결재자" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SFormLeave onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-form-post" label="게시판 글 작성 · 카테고리 + 옵션 (고정·첨부·긴급)" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SFormPost onBack={()=>{}}/></Phone>
          </DCArtboard>
          <DCArtboard id="m-form-chat" label="새 대화 · 멤버 선택 + 조직도 + 채널 생성" width={PHONE_W} height={PHONE_H}>
            <Phone dark={dark}><SFormChat onBack={()=>{}}/></Phone>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      {editMode && (
        <div style={{
          position:'fixed', bottom:24, right:24, zIndex:1000,
          background:'#fff', borderRadius:14, padding:16,
          boxShadow:'0 12px 32px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.06)',
          width: 260, fontFamily: "'Pretendard', sans-serif",
        }}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12}}>
            <div style={{fontSize:13, fontWeight:800, letterSpacing:'-0.02em'}}>Tweaks</div>
            <button onClick={()=>{setEditMode(false); window.parent.postMessage({type:'__edit_mode_dismissed'},'*');}}
              style={{width:24, height:24, borderRadius:6, background:'#F4F4F5', border:0, cursor:'pointer', display:'grid', placeItems:'center', color:'#71717A'}}>✕</button>
          </div>
          <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #F4F4F5'}}>
            <span style={{fontSize:12, fontWeight:700}}>다크모드</span>
            <button onClick={()=>setTweak('dark', !tweaks.dark)} style={{
              width: 44, height: 24, borderRadius: 999,
              background: tweaks.dark ? '#2563EB' : '#E4E4E7',
              border:0, cursor:'pointer', position:'relative', transition:'.15s',
            }}>
              <span style={{
                position:'absolute', top:2, left: tweaks.dark ? 22 : 2,
                width:20, height:20, borderRadius:999, background:'#fff',
                boxShadow:'0 1px 3px rgba(0,0,0,0.2)', transition:'left .15s',
              }}/>
            </button>
          </div>
          <div style={{paddingTop:10}}>
            <div style={{fontSize:11, fontWeight:700, color:'#71717A', marginBottom:6}}>강조색</div>
            <div style={{display:'flex', gap:6}}>
              {['#2563EB','#7C3AED','#10B981','#EC4899','#F59E0B'].map(c => (
                <button key={c} onClick={()=>setTweak('accent', c)} style={{
                  width:34, height:34, borderRadius:8, background:c,
                  border: tweaks.accent === c ? '2px solid #18181B' : '2px solid transparent',
                  cursor:'pointer',
                }}/>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
