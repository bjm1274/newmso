// MSO redesign — root app

const PLACEHOLDER_MENUS = {
  chat:     { label: '채팅',     hint: '메신저 · 1:1 / 채널 / 공지' },
  board:    { label: '게시판',   hint: '공지사항 · 자유게시판 · 경조사 · MRI 일정' },
  approval: { label: '전자결재', hint: '결재함 · 작성하기 · 결재양식 관리' },
  hr:       { label: '인사관리', hint: '구성원 · 근태 · 급여 · 복지 · 문서 (37개 화면)' },
  stock:    { label: '재고관리', hint: '재고현황 · 입출고 · 발주 · 자산 · 분석마감' },
  admin:    { label: '관리자',   hint: '경영대시보드 · 예산 · 회사관리 · 직원권한 · 감사센터' },
};

const Placeholder = ({ k }) => {
  const m = PLACEHOLDER_MENUS[k];
  return (
    <div className="main" style={{display:'grid', placeItems:'center', padding: 60}}>
      <div style={{textAlign:'center', maxWidth: 480}}>
        <div style={{
          width: 72, height: 72, borderRadius: 18, margin: '0 auto 18px',
          background: 'var(--accent-soft)', color: 'var(--accent)',
          display:'grid', placeItems:'center'
        }}>
          <Icon name="plusBox" size={32}/>
        </div>
        <div style={{fontSize: 20, fontWeight: 800, letterSpacing: '-0.025em'}}>{m.label} — 다음 차례입니다</div>
        <p style={{marginTop: 8, color: 'var(--z-500)', fontSize: 13}}>{m.hint}</p>
        <p style={{marginTop: 16, fontSize: 12, color: 'var(--z-400)'}}>이 메뉴의 대표 화면을 함께 보고 싶다고 알려주시면 바로 이어서 만들어 드립니다.</p>
      </div>
    </div>
  );
};

const App = () => {
  const [mode, setMode]               = React.useState('after');
  const [menu, setMenu]               = React.useState('mypage');
  const [mypageTab, setMypageTab]     = React.useState('home');
  const [addonFeature, setAddonFeat]  = React.useState('hub');
  const [chatRoom, setChatRoom]       = React.useState('mgmt');
  const [chatVariant, setChatVariant] = React.useState('B');
  const [board, setBoard]             = React.useState('notice');
  const [boardVariant, setBoardVariant] = React.useState('A');
  const [apView, setApView]           = React.useState('inbox');
  const [apVariant, setApVariant]     = React.useState('B');
  const [hrSub, setHrSub]             = React.useState('payroll');
  const [hrLayout, setHrLayout]       = React.useState('B');
  const [stockSub, setStockSub]       = React.useState('status');
  const [adminSub, setAdminSub]       = React.useState('exec');

  React.useEffect(() => {
    document.documentElement.setAttribute('data-mode', mode);
  }, [mode]);

  const noSidebar2 = menu === 'mypage';
  const menuLabel = PRIMARY_MENUS.find(p => p.id === menu)?.label;
  const subLabel = (
    menu === 'mypage' ? ({home:'내정보', attend:'출퇴근', todo:'할일', docs:'서류제출', alert:'알림'}[mypageTab]) :
    menu === 'addon'  ? (ADDON_MODULES.find(m => m.id === addonFeature)?.label) :
    menu === 'chat'   ? (CHAT_ROOMS.find(r => r.id === chatRoom)?.name) :
    menu === 'board'  ? (BOARD_CATEGORIES.find(b => b.id === board)?.label) :
    menu === 'approval' ? (APPROVAL_VIEWS.find(v => v.id === apView)?.label) :
    menu === 'hr' ? (HR_SUBMENUS[hrSub]?.label) :
    menu === 'stock' ? (STOCK_SUBMENUS[stockSub]?.label) :
    menu === 'admin' ? (ADMIN_SUBMENUS[adminSub]?.label) :
    null
  );

  let MainEl = null, NotesEl = null;
  if (menu === 'mypage') {
    MainEl = <MyPageScreen tab={mypageTab} setTab={setMypageTab}/>;
    NotesEl = <MyPageNotes tab={mypageTab}/>;
  } else if (menu === 'addon') {
    MainEl = <AddonScreen feature={addonFeature} setFeature={setAddonFeat}/>;
    NotesEl = <AddonNotes feature={addonFeature}/>;
  } else if (menu === 'chat') {
    MainEl = <ChatScreen variant={chatVariant} setVariant={setChatVariant} active={chatRoom}/>;
    NotesEl = <ChatNotes variant={chatVariant}/>;
  } else if (menu === 'board') {
    MainEl = <BoardScreen variant={boardVariant} setVariant={setBoardVariant} board={board}/>;
    NotesEl = <BoardNotes variant={boardVariant}/>;
  } else if (menu === 'approval') {
    MainEl = <ApprovalScreen variant={apVariant} setVariant={setApVariant} view={apView} onView={setApView}/>;
    NotesEl = <ApprovalNotes variant={apVariant} view={apView}/>;
  } else if (menu === 'hr') {
    MainEl = <HrScreen active={hrSub} layout={hrLayout} setLayout={setHrLayout}/>;
    NotesEl = <HrNotes active={hrSub} layout={hrLayout}/>;
  } else if (menu === 'stock') {
    MainEl = <StockScreen active={stockSub}/>;
    NotesEl = <StockNotes active={stockSub}/>;
  } else if (menu === 'admin') {
    MainEl = <AdminScreen active={adminSub}/>;
    NotesEl = <AdminNotes active={adminSub}/>;
  } else {
    MainEl = <Placeholder k={menu}/>;
    NotesEl = null;
  }

  return (
    <>
      <div className="preview-bar">
        <div className="pv-title"><span className="dot"/> MSO PC · 리디자인 라이브 프리뷰</div>
        <span className="pv-sub">메뉴 · {menuLabel}{subLabel ? ' › ' + subLabel : ''}</span>
        <div className="pv-spacer"/>
        <div className="seg">
          <button className={mode === 'before' ? 'on' : ''} onClick={() => setMode('before')}>BEFORE · 현재</button>
          <button className={mode === 'after'  ? 'on' : ''} onClick={() => setMode('after')}>AFTER · 개선안</button>
        </div>
        <div className="pv-meta">{mode === 'before' ? 'body 13 · H1 17 · btn 32' : 'body 14 · H1 22 · btn 36'}</div>
      </div>

      <div className="frame-wrap">
        <div className="frame-meta">
          <span className="tag accent">데스크톱 1440 × 820</span>
          <span className="tag">사이드바 72 {noSidebar2 ? '' : '+ 서브 ' + (menu==='chat' ? (mode==='before'?192:220) : (mode==='before'?128:147))}</span>
          <span className="tag">{mode === 'before' ? 'tokens: legacy' : 'tokens: PC v2'}</span>
        </div>
        <div className="frame">
          <div className="app" style={{
            gridTemplateColumns: noSidebar2
              ? '72px 1fr'
              : ('72px ' + (menu==='chat' ? (mode==='before'?192:220) : (mode==='before'?128:147)) + 'px 1fr')
          }}>
            <Sidebar1 active={menu} onPick={setMenu}/>
            {menu === 'addon' && <AddonSidebar2 feature={addonFeature} setFeature={setAddonFeat}/>}
            {menu === 'chat' && <ChatSidebar2 active={chatRoom} onPick={setChatRoom} variant={chatVariant}/>}
            {menu === 'board' && <BoardSidebar2 active={board} onPick={setBoard}/>}
            {menu === 'approval' && <ApprovalSidebar2 active={apView} onPick={setApView}/>}
            {menu === 'hr' && <HrSidebar2 active={hrSub} onPick={setHrSub} layout={hrLayout}/>}
            {menu === 'stock' && <StockSidebar2 active={stockSub} onPick={setStockSub}/>}
            {menu === 'admin' && <AdminSidebar2 active={adminSub} onPick={setAdminSub}/>}
            {!noSidebar2 && menu !== 'addon' && menu !== 'chat' && menu !== 'board' && menu !== 'approval' && menu !== 'hr' && menu !== 'stock' && menu !== 'admin' && (
              <aside className="sidebar2">
                <div className="s2-sub" style={{marginTop: 12}}>메뉴를 만드는 중입니다</div>
              </aside>
            )}
            {MainEl}
          </div>
        </div>

        {NotesEl}
      </div>
    </>
  );
};

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
