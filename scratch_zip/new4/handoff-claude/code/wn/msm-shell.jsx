// MSO 모바일 — 앱 셸 (하단 탭바 + 화면 라우터)
function MsmShell({ os = 'ios', topInset = 52, bottomInset = 30 }) {
  const { useState } = React;
  const [tab, setTab] = useState('mypage');
  const [sub, setSub] = useState(null); // 'share' | null

  // 홈(내정보) 빠른메뉴 → 탭/서브 이동
  const openFromQuick = (id) => {
    if (id === 'approval') setTab('approval');
    else if (id === 'stock') setTab('stock');
    else if (id === 'more') setTab('addon');
    else if (id === 'board') setTab('board');
    else if (['payslip', 'hr'].includes(id)) setTab('hr');
    else if (id === 'org') setTab('addon');
    else setTab('addon');
  };

  // PC 메뉴 순서: 알림 · 내정보 · 추가기능 · 채팅 · 게시판 · 전자결재 · 인사관리 · 재고관리 · 관리자
  const TABS = [
    { id: 'notif', lbl: '알림', icon: 'bell', dot: true },
    { id: 'mypage', lbl: '내정보', icon: 'user' },
    { id: 'addon', lbl: '추가기능', icon: 'grid' },
    { id: 'chat', lbl: '채팅', icon: 'chat', badge: 7 },
    { id: 'board', lbl: '게시판', icon: 'board', badge: 6 },
    { id: 'approval', lbl: '전자결재', icon: 'checkCircle', badge: 3 },
    { id: 'hr', lbl: '인사관리', icon: 'hr' },
    { id: 'stock', lbl: '재고관리', icon: 'package' },
    { id: 'admin', lbl: '관리자', icon: 'shield' },
  ];

  return (
    <div className="msm">
      {/* 탭 화면 */}
      {tab === 'notif' && <NotifScreen topInset={topInset} bottomInset={bottomInset} />}
      {tab === 'mypage' && <HomeScreen topInset={topInset} bottomInset={bottomInset} onNav={openFromQuick} />}
      {tab === 'addon' && <AddonScreen topInset={topInset} bottomInset={bottomInset} onOpen={() => {}} />}
      {tab === 'chat' && <ChatScreen topInset={topInset} bottomInset={bottomInset} />}
      {tab === 'board' && <BoardHomeScreen topInset={topInset} bottomInset={bottomInset} onOpenShare={() => setSub('share')} />}
      {tab === 'approval' && <ApprovalScreen topInset={topInset} bottomInset={bottomInset} />}
      {tab === 'hr' && <HrScreen topInset={topInset} bottomInset={bottomInset} />}
      {tab === 'stock' && <StockScreen topInset={topInset} bottomInset={bottomInset} />}
      {tab === 'admin' && <AdminScreen topInset={topInset} bottomInset={bottomInset} />}

      {/* 하단 탭바 — 가로 스크롤 */}
      <nav className="msm-tabbar" style={{ paddingBottom: bottomInset + 4 }}>
        {TABS.map(t => (
          <button key={t.id} className={'msm-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
            <span className="ic">
              <Icon name={t.icon} size={23} strokeWidth={tab === t.id ? 2.1 : 1.7} />
              {t.badge ? <span className="badge">{t.badge}</span> : null}
              {t.dot && tab !== t.id ? <span className="badge" style={{ minWidth: 8, height: 8, padding: 0, top: -1, right: -4 }} /> : null}
            </span>
            <span className="lbl">{t.lbl}</span>
          </button>
        ))}
      </nav>

      {/* 업무공유 (게시판 서브) — 풀스크린 */}
      <div className={'glm-screen' + (sub === 'share' ? ' open' : '')}>
        <GuideMobileApp os={os} topInset={topInset} bottomInset={bottomInset} onBack={() => setSub(null)} />
      </div>
    </div>
  );
}
window.MsmShell = MsmShell;
