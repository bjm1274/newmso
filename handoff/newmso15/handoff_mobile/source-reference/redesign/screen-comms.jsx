// MSO redesign — 채팅 · 게시판 · 전자결재 (한 파일)
// 각 메뉴는 variant prop으로 2안 비교

// ═══════════════════════════════════════════════════════════════════
// 1. 채팅 (Chat)
// ═══════════════════════════════════════════════════════════════════

const CHAT_ROOMS = [
  { id:'notice', kind:'notice', name:'공지사항',          last:'[공지] 신규 메신저 출·퇴근 기능 활용 안내',  at:'5월 11일', unread: 0, pin:true,  members: 27 },
  { id:'mgmt',   kind:'group',  name:'SY INC. 경영지원',  last:'박유진: 이력서 받으세요',                     at:'09:24',    unread: 4, pin:true,  members: 4, avatar:'SY', tone:'amber' },
  { id:'park',   kind:'group',  name:'박철홍정형외과 전체', last:'김지오: 오늘 OP 일정 변경됐어요',              at:'08:51',    unread: 1, pin:false, members:14, avatar:'박', tone:'blue' },
  { id:'op',     kind:'group',  name:'수술팀1',            last:'op 체크 다시 해봤는데 오후 1시',              at:'어제',     unread: 2, pin:false, members: 6, avatar:'수', tone:'green' },
  { id:'ward1',  kind:'group',  name:'병동팀1',            last:'넵 알겠습니다',                                at:'어제',     unread: 0, pin:false, members: 5, avatar:'병', tone:'cyan' },
  { id:'kim',    kind:'direct', name:'김지오',             last:'두분이 같이 사무실로 오세요',                  at:'2일 전',   unread: 0, pin:false, role:'간호부장',     presence:'on'  },
  { id:'hong',   kind:'direct', name:'홍자비',             last:'둘 다 신한은행 통장 없어요',                   at:'2일 전',   unread: 0, pin:false, role:'경영지원팀',   presence:'on'  },
  { id:'lee',    kind:'direct', name:'이나림',             last:'부장님 어제 말씀 드린 외래…',                  at:'3일 전',   unread: 0, pin:false, role:'외래팀',       presence:'on'  },
  { id:'baek',   kind:'direct', name:'백민',               last:'3층 진료실 관리사 휴게실',                     at:'3일 전',   unread: 0, pin:false, role:'경영지원팀',   presence:'on'  },
  { id:'park2',  kind:'direct', name:'박유진',             last:'식당 근무표 5월.xlsx',                         at:'5월 8일',  unread: 0, pin:false, role:'경영지원팀',   presence:'off' },
  { id:'song',   kind:'direct', name:'송소현',             last:'일정 잡힌거 없습니다!',                        at:'5월 8일',  unread: 0, pin:false, role:'외래팀',       presence:'off' },
];

const ChatSidebar2 = ({ active, onPick, variant }) => {
  const [tab, setTab] = React.useState('chat');
  const [q, setQ]     = React.useState('');
  const pinned  = CHAT_ROOMS.filter(r => r.pin);
  const others  = CHAT_ROOMS.filter(r => !r.pin && r.name.includes(q));
  return (
    <aside className="sidebar2 chat-side">
      <div className="chat-side-head">
        <div className="chat-tabs">
          <button className={tab==='chat'?'on':''} onClick={()=>setTab('chat')}>채팅</button>
          <button className={tab==='org' ?'on':''} onClick={()=>setTab('org')}>조직도</button>
        </div>
        <div className="input-wrap" style={{flex: 1}}>
          <Icon name="search" size={13} className="ico"/>
          <input className="input" placeholder="이름·메시지 검색" value={q} onChange={e=>setQ(e.target.value)} style={{paddingLeft: 28, height: 30, fontSize: 12, minWidth: 0, width:'100%'}}/>
        </div>
      </div>
      <div className="chat-side-scroll">
        {pinned.length > 0 && <div className="chat-side-lbl">고정</div>}
        {pinned.map(r => <ChatRoomRow key={r.id} room={r} on={r.id===active} onPick={()=>onPick(r.id)} variant={variant}/>)}
        <div className="chat-side-lbl" style={{marginTop: 6}}>대화</div>
        {others.map(r => <ChatRoomRow key={r.id} room={r} on={r.id===active} onPick={()=>onPick(r.id)} variant={variant}/>)}
        <button className="chat-side-add">
          <Icon name="plus" size={13}/> 새 대화 시작
        </button>
      </div>
    </aside>
  );
};

const ChatRoomRow = ({ room, on, onPick, variant }) => {
  const initial = room.avatar || room.name.charAt(0);
  const tone = room.tone || (room.kind === 'notice' ? 'accent' : 'gray');
  return (
    <div className={'chat-room ' + (on?'on ':'') + (variant==='B'?'compact ':'')} onClick={onPick}>
      <div className={'chat-room-pic tone-'+tone}>
        {room.kind==='notice' ? <Icon name="bell" size={14}/> : initial}
        {room.presence && <span className={'chat-room-dot '+room.presence}/>}
      </div>
      <div className="chat-room-body">
        <div className="chat-room-top">
          <span className="chat-room-name">{room.name}</span>
          {room.kind==='group' && <span className="chat-room-cnt">{room.members}명</span>}
          <span className="chat-room-at">{room.at}</span>
        </div>
        <div className="chat-room-last">{room.last}</div>
      </div>
      {room.unread > 0 && <span className="chat-room-badge">{room.unread}</span>}
    </div>
  );
};

// 메시지 데이터
const CHAT_MSGS = {
  mgmt: [
    { who:'me',   name:'나',     ts:'09:18', body:'오늘 신규 입사자 이력서 받았어요. 공유드릴게요.' },
    { who:'them', name:'박유진', ts:'09:20', body:'이력서 받았습니다. 검토하고 면접 일정 잡을게요.', avatar:'박', tone:'pink' },
    { who:'them', name:'박유진', ts:'09:20', body:'금일 오후 1시 면접 가능하실까요?', avatar:'박', tone:'pink' },
    { who:'me',   name:'나',     ts:'09:22', body:'네 가능합니다. 회의실 잡아둘게요.' },
    { who:'system', body:'이지나 님이 대화방에 참여했습니다.' },
    { who:'them', name:'이지나', ts:'09:24', body:'안녕하세요! 잘 부탁드립니다.', avatar:'이', tone:'violet', reactions: [{e:'👍', n:3},{e:'🎉', n:2}] },
    { who:'me',   name:'나',     ts:'09:25', body:'환영합니다 👋 첫 출근일은 5월 15일로 잡았습니다.' },
  ]
};

const ChatBubble = ({ m, variant }) => {
  if (m.who === 'system') return <div className="chat-system">{m.body}</div>;
  const mine = m.who === 'me';
  if (variant === 'B') {
    // 카카오톡 스타일 — 좌우 정렬 버블
    return (
      <div className={'chat-row '+(mine?'mine':'other')}>
        {!mine && <div className={'chat-bub-pic tone-'+(m.tone||'gray')}>{m.avatar||m.name?.charAt(0)}</div>}
        <div className="chat-bub-col">
          {!mine && <div className="chat-bub-name">{m.name}</div>}
          <div className="chat-bub-grp">
            {mine && <span className="chat-bub-ts">{m.ts}</span>}
            <div className={'chat-bub '+(mine?'mine':'other')}>
              <div className="chat-bub-body">{m.body}</div>
              {m.reactions && (
                <div className="chat-react">
                  {m.reactions.map((r,i)=> <span key={i} className="chat-react-chip">{r.e} {r.n}</span>)}
                </div>
              )}
            </div>
            {!mine && <span className="chat-bub-ts">{m.ts}</span>}
          </div>
        </div>
      </div>
    );
  }
  // A안 — Slack/Linear 스타일 (좌측 정렬, 아바타 + 이름 + 시간)
  return (
    <div className="chat-line">
      <div className={'chat-line-pic tone-'+(m.tone||(mine?'blue':'gray'))}>{m.avatar || (mine?'나':m.name?.charAt(0))}</div>
      <div className="chat-line-body">
        <div className="chat-line-head">
          <b>{mine?'나':m.name}</b>
          <span>{m.ts}</span>
        </div>
        <div className="chat-line-text">{m.body}</div>
        {m.reactions && (
          <div className="chat-react" style={{marginTop: 6}}>
            {m.reactions.map((r,i)=> <span key={i} className="chat-react-chip">{r.e} {r.n}</span>)}
            <button className="chat-react-add">+</button>
          </div>
        )}
      </div>
      <div className="chat-line-actions">
        <button title="이모지">😊</button>
        <button title="답글"><Icon name="chat" size={12}/></button>
        <button title="더보기"><Icon name="moreH" size={12}/></button>
      </div>
    </div>
  );
};

const ChatScreen = ({ variant, setVariant, active = 'mgmt' }) => {
  const room = CHAT_ROOMS.find(r => r.id === active) || CHAT_ROOMS[1];
  const msgs = CHAT_MSGS[active] || CHAT_MSGS.mgmt;
  const [drawer, setDrawer] = React.useState(true);
  return (
    <div className="main"><div className="content">
      <div className="mod-pageheader chat-pageheader">
        <div className="row" style={{gap: 12, alignItems:'center', minWidth: 0, flex: 1}}>
          <div className={'chat-room-pic lg tone-'+(room.tone||'blue')}>
            {room.kind==='notice' ? <Icon name="bell" size={16}/> : (room.avatar || room.name.charAt(0))}
          </div>
          <div style={{minWidth: 0}}>
            <div className="chat-h-name">{room.name} {room.kind==='group' && <span className="chat-h-cnt">{room.members}명</span>}</div>
            <div className="chat-h-sub">
              <span className="chat-h-dot"/> 실시간 연결됨 · {room.kind==='direct' ? room.role : '공지 · 일반 채팅 가능'}
            </div>
          </div>
        </div>
        <div className="row" style={{gap: 8}}>
          <button className="btn sm" title="투표"><Icon name="badge" size={13}/></button>
          <button className="btn sm" title="결재 초안"><Icon name="approval" size={13}/></button>
          <button className="btn sm" title="아카이브"><Icon name="file" size={13}/></button>
          <button className={'btn sm '+(drawer?'on-toggle':'')} onClick={()=>setDrawer(!drawer)} title="드로어">
            <Icon name="users" size={13}/>
          </button>
        </div>
      </div>

      <div className={'chat-shell '+(drawer?'with-drawer':'')}>
        <div className="chat-thread">
          <div className="chat-jump-bar">
            <Chip tone="muted">📅 5월 11일 (월)</Chip>
            <span className="small" style={{marginLeft: 8}}>아래는 오늘 메시지입니다</span>
          </div>
          <div className={'chat-msgs '+(variant==='B'?'b':'a')}>
            {msgs.map((m, i) => <ChatBubble key={i} m={m} variant={variant}/>)}
          </div>
        </div>

        {drawer && (
          <aside className="chat-drawer">
            <div className="chat-drawer-head">
              <b>채팅방 정보</b>
              <button className="x" onClick={()=>setDrawer(false)}><Icon name="x" size={14}/></button>
            </div>
            <div className="chat-drawer-body">
              <div className="chat-drawer-sec">
                <div className="lbl">참여자 {room.members||1}</div>
                <div className="chat-mem-grid">
                  {['박','이','김','홍','+'].map((c,i) =>
                    <div key={i} className={'chat-mem tone-'+['pink','violet','blue','green','gray'][i]}>{c}</div>
                  )}
                </div>
              </div>
              <div className="chat-drawer-sec">
                <div className="lbl">고정 메시지</div>
                <div className="chat-pin">📌 신규 출퇴근 기능 안내 — 박유진 · 5월 4일</div>
              </div>
              <div className="chat-drawer-sec">
                <div className="lbl">미디어 · 파일 (12)</div>
                <div className="chat-media-grid">
                  {[1,2,3,4,5,6].map(i =>
                    <div key={i} className="chat-media" style={{background:`linear-gradient(135deg, hsl(${i*55} 60% 70%), hsl(${i*55+30} 60% 60%))`}}/>
                  )}
                </div>
                <button className="chat-media-all">전체 아카이브 열기 →</button>
              </div>
              <div className="chat-drawer-sec">
                <div className="lbl">알림</div>
                <div className="chat-drawer-row">
                  <span>방 알림</span>
                  <Chip tone="success">켜짐</Chip>
                </div>
                <div className="chat-drawer-row">
                  <span>키워드 필터</span>
                  <span className="small">3개</span>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      <div className="chat-composer">
        <div className="chat-comp-actions">
          <button title="첨부"><Icon name="plus" size={14}/></button>
          <button title="이모지">😊</button>
          <button title="투표">📊</button>
          <button title="멘션">@</button>
        </div>
        <div className="chat-comp-input">
          <textarea placeholder={'#'+room.name+'에 메시지 보내기 (@이름 멘션 가능)'} rows={1}/>
        </div>
        <button className="chat-comp-send"><Icon name="send" size={14}/></button>
      </div>
    </div></div>
  );
};

const ChatNotes = ({ variant }) => (
  <Notes
    kicker="§ 채팅 — 메신저"
    title="KakaoWork형 — 좌우 버블 + 시간 외곽"
    points={[
      '한국 메신저 관행에 맞춰 본인=우측 말풍선, 타인=좌측 말풍선. 본인 메신저엔 시간만 버블 바깥 좌측에 표기.',
      '3-pane shell: 사이드바2(방 목록) · 가운데(대화) · 우측 드로어(참여자·고정 메시지·미디어 아카이브·알림). 드로어는 toggle.',
      '상단 헤더는 방 정보(아바타·이름·인원·실시간 dot) + 우측 액션(투표·결재 초안·아카이브·드로어).',
      '하단 컴포저는 +(첨부)·이모지·투표·멘션 · 자라나는 textarea · 전송. Enter=전송, Shift+Enter=줄바꿈.',
      '사이드바2 상단 채팅/조직도 토글 + 검색 · 고정/대화 그룹 · 안 읽음 배지 · 새 대화 시작 dashed 버튼.',
      '날짜 점프 바(상단)에 현재 보고 있는 날짜 chip + 위로 스크롤 시 sticky.',
    ]}
  />
);

// ═══════════════════════════════════════════════════════════════════
// 2. 게시판 (Board)
// ═══════════════════════════════════════════════════════════════════

const BOARD_CATEGORIES = [
  { id:'notice',   label:'공지사항',     icon:'bell',     cnt: 4,  tone:'accent' },
  { id:'free',     label:'자유게시판',    icon:'chat',     cnt: 28, tone:'gray' },
  { id:'family',   label:'경조사 소식',   icon:'star',     cnt: 6,  tone:'pink' },
  { id:'opSched',  label:'수술 일정',     icon:'calendar', cnt: 12, tone:'success' },
  { id:'mri',      label:'MRI 일정',      icon:'calendar', cnt: 9,  tone:'violet' },
  { id:'share',    label:'업무공유',      icon:'fileText', cnt: 17, tone:'warn' },
  { id:'guide',    label:'업무 가이드',   icon:'fileText', cnt: 23, tone:'accent', kind:'guide' },
];

const BOARD_POSTS = [
  { id:1, cat:'notice', star:true,  title:'[공지] 신규 메신저 출·퇴근 기능 활용 및 선불출 제한 안내', author:'이재훈', dept:'경영지원팀',  date:'2026.5.4',  views:67,  likes:3, comments:5,  attach:false, tags:['공지','출퇴근'] },
  { id:2, cat:'notice', star:false, title:'유니폼 착용 및 세탁에 대한 권고 및 교육',                  author:'백민',   dept:'경영지원팀',  date:'2026.4.16', views:105, likes:0, comments:2,  attach:true,  tags:['교육'] },
  { id:3, cat:'notice', star:false, title:'물품 신청 및 관리 기준 엄격 적용 안내',                    author:'백민',   dept:'경영지원팀',  date:'2026.4.16', views:61,  likes:1, comments:0,  attach:false, tags:['행정','재고'] },
  { id:4, cat:'notice', star:true,  title:'일부 근무자 근무시간 변경',                                 author:'백민',   dept:'경영지원팀',  date:'2026.4.13', views:113, likes:2, comments:8,  attach:false, tags:['근태','중요'], badge:'중요' },
  { id:5, cat:'free',   star:false, title:'5월 2주차 식단표',                                          author:'박유진', dept:'경영지원팀',  date:'2026.5.11', views:17,  likes:0, comments:1,  attach:true,  tags:['식단'] },
  { id:6, cat:'free',   star:false, title:'5월 1주차 식단표',                                          author:'박유진', dept:'경영지원팀',  date:'2026.5.4',  views:44,  likes:0, comments:0,  attach:true,  tags:['식단'] },
  { id:7, cat:'free',   star:true,  title:'칭찬합니다.',                                               author:'홍자비', dept:'경영지원팀',  date:'2026.4.30', views:84,  likes:10,comments:7,  attach:false, tags:['칭찬'] },
  { id:8, cat:'free',   star:false, title:'4월 5주차 식단표',                                          author:'박유진', dept:'경영지원팀',  date:'2026.4.27', views:36,  likes:0, comments:0,  attach:true,  tags:['식단'] },
];

const BoardSidebar2 = ({ active, onPick }) => (
  <aside className="sidebar2">
    <div className="s2-scroll" style={{display:'grid', gap: 2, flex: 1, overflow:'auto'}}>
      <div className="s2-group-lbl" style={{marginTop: 4}}>게시판</div>
      {BOARD_CATEGORIES.filter(b=>b.kind!=='guide').map(b =>
        <div key={b.id} className={'s2-item board-item '+(b.id===active?'on':'')} onClick={()=>onPick(b.id)}>
          <Icon name={b.icon} size={14}/>
          <span style={{flex: 1}}>{b.label}</span>
          <span className="board-cnt">{b.cnt}</span>
        </div>
      )}
      <div className="s2-group-divider">참고</div>
      {BOARD_CATEGORIES.filter(b=>b.kind==='guide').map(b =>
        <div key={b.id} className={'s2-item board-item '+(b.id===active?'on':'')} onClick={()=>onPick(b.id)}>
          <Icon name={b.icon} size={14}/>
          <span style={{flex: 1}}>{b.label}</span>
          <span className="board-cnt">{b.cnt}</span>
        </div>
      )}
    </div>
  </aside>
);

const BoardScreen = ({ variant, setVariant, board = 'notice' }) => {
  // 업무공유 / 업무 가이드는 GuideLibrary 신규 화면으로 라우팅
  if ((board === 'share' || board === 'guide') && window.GuideLibraryScreen) {
    return <window.GuideLibraryScreen/>;
  }
  const cat = BOARD_CATEGORIES.find(c => c.id===board) || BOARD_CATEGORIES[0];
  const posts = BOARD_POSTS.filter(p => p.cat === board);
  return (
    <div className="main"><div className="content">
      <div className="mod-pageheader">
        <div className="row" style={{gap: 12, alignItems:'baseline'}}>
          <div>
            <div className="addon-h1">{cat.label}</div>
          </div>
        </div>
        <div className="row" style={{gap: 8}}>
          <div className="input-wrap">
            <Icon name="search" size={13} className="ico"/>
            <input className="input" placeholder="제목·작성자·태그 검색" style={{paddingLeft: 30}}/>
          </div>
          <Btn icon="filter">필터</Btn>
          <Btn variant="primary" icon="plus">새 게시물</Btn>
        </div>
      </div>

      {/* 태그·정렬 바 */}
      <div className="board-toolbar">
        <div className="board-tags">
          <button className="board-tag on">전체</button>
          <button className="board-tag">공지·중요</button>
          <button className="board-tag">교육</button>
          <button className="board-tag">행정</button>
          <button className="board-tag">근태</button>
          <button className="board-tag">재고</button>
        </div>
        <div className="row" style={{gap: 8}}>
          <select className="board-sort">
            <option>최신순</option>
            <option>조회 많은 순</option>
            <option>좋아요 많은 순</option>
            <option>댓글 많은 순</option>
          </select>
          <div className="seg" style={{padding: 2}}>
            <button className="on" style={{padding:'4px 10px', fontSize: 11}}>전체</button>
            <button style={{padding:'4px 10px', fontSize: 11}}>안 읽음</button>
            <button style={{padding:'4px 10px', fontSize: 11}}>즐겨찾기</button>
          </div>
        </div>
      </div>

      <BoardTableView posts={posts}/>
    </div></div>
  );
};

const BoardMoreMenu = ({ post, onToggleStar }) => {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);
  return (
    <div className="board-more-wrap" ref={ref}>
      <button className="board-more" onClick={() => setOpen(v => !v)} aria-haspopup="menu" aria-expanded={open}>
        <Icon name="moreH" size={14}/>
      </button>
      {open && (
        <div className="board-more-menu" role="menu">
          <button className="board-more-item" onClick={() => { onToggleStar && onToggleStar(post); setOpen(false); }}>
            <Icon name="star" size={13} color={post.star ? '#F59E0B' : '#A1A1AA'}/>
            <span>{post.star ? '별표 해제' : '별표 추가'}</span>
          </button>
          <button className="board-more-item" onClick={() => setOpen(false)}>
            <Icon name="bookmark" size={13} color="#A1A1AA"/>
            <span>북마크</span>
          </button>
          <div className="board-more-sep"/>
          <button className="board-more-item" onClick={() => setOpen(false)}>
            <Icon name="edit" size={13} color="#A1A1AA"/>
            <span>수정</span>
          </button>
          <button className="board-more-item" onClick={() => setOpen(false)}>
            <Icon name="send" size={13} color="#A1A1AA"/>
            <span>채팅으로 공유</span>
          </button>
          <button className="board-more-item danger" onClick={() => setOpen(false)}>
            <Icon name="x" size={13} color="#EF4444"/>
            <span>삭제</span>
          </button>
        </div>
      )}
    </div>
  );
};

const BoardTableView = ({ posts: initialPosts }) => {
  const [posts, setPosts] = React.useState(initialPosts);
  React.useEffect(() => { setPosts(initialPosts); }, [initialPosts]);
  const toggleStar = (post) => {
    setPosts(prev => prev.map(p => p.id === post.id ? { ...p, star: !p.star } : p));
  };
  return (
  <div className="card" style={{padding: 0, overflow:'hidden'}}>
    <table className="data-tbl board-tbl">
      <thead><tr>
        <th style={{width: 60}}>번호</th>
        <th>제목</th>
        <th style={{width: 140}}>작성자</th>
        <th style={{width: 100}}>등록일</th>
        <th style={{width: 60, textAlign:'right'}}>조회</th>
        <th style={{width: 60, textAlign:'right'}}>좋아요</th>
        <th style={{width: 40}}></th>
      </tr></thead>
      <tbody>
        {posts.map(p => (
          <tr key={p.id} className="board-tr">
            <td><span className="board-num">{p.id}</span></td>
            <td>
              <div className="row" style={{gap: 8, alignItems:'center'}}>
                {p.star && <Icon name="star" size={12} color="#F59E0B"/>}
                {p.badge && <Chip tone="danger">{p.badge}</Chip>}
                <span className="board-title">{p.title}</span>
                {p.attach && <Icon name="file" size={12} color="#A1A1AA"/>}
                {p.comments > 0 && <span className="board-cm">💬 {p.comments}</span>}
              </div>
              <div className="board-tags-row">
                {p.tags.map((t,i) => <span key={i} className="board-tag-mini">#{t}</span>)}
              </div>
            </td>
            <td>
              <div className="row" style={{gap: 8, alignItems:'center'}}>
                <div className="org-emp-pic" style={{width: 24, height: 24, fontSize: 10}}>{p.author.charAt(0)}</div>
                <div style={{minWidth: 0}}>
                  <div style={{fontSize: 12, fontWeight: 700}}>{p.author}</div>
                  <div className="small" style={{fontSize: 10}}>{p.dept}</div>
                </div>
              </div>
            </td>
            <td className="tnum"><span className="small">{p.date}</span></td>
            <td className="tnum" style={{textAlign:'right'}}>{p.views.toLocaleString()}</td>
            <td className="tnum" style={{textAlign:'right'}}>{p.likes>0 ? <span style={{color:'#EF4444'}}>♥ {p.likes}</span> : <span className="small">·</span>}</td>
            <td><BoardMoreMenu post={p} onToggleStar={toggleStar}/></td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
  );
};

const BoardCardView = ({ posts }) => (
  <div className="board-card-grid">
    {posts.map(p => (
      <div key={p.id} className="board-card">
        {p.badge && <div className="board-card-badge"><Chip tone="danger">{p.badge}</Chip></div>}
        <div className="board-card-cat">
          <span className="small">#{p.id}</span>
          <span className="small">·</span>
          <span className="small">{p.date}</span>
          {p.star && <Icon name="star" size={12} color="#F59E0B"/>}
        </div>
        <div className="board-card-title">{p.title}</div>
        <div className="board-card-tags">
          {p.tags.map((t,i) => <span key={i} className="board-tag-mini">#{t}</span>)}
        </div>
        <div className="board-card-foot">
          <div className="row" style={{gap: 6, alignItems:'center'}}>
            <div className="org-emp-pic" style={{width: 22, height: 22, fontSize: 10}}>{p.author.charAt(0)}</div>
            <span style={{fontSize: 11, fontWeight: 700}}>{p.author}</span>
            <span className="small" style={{fontSize: 10}}>· {p.dept}</span>
          </div>
          <div className="board-card-stats">
            {p.attach && <Icon name="file" size={11} color="#A1A1AA"/>}
            <span className="small">조회 {p.views}</span>
            {p.comments>0 && <span className="small">· 💬 {p.comments}</span>}
            {p.likes>0 && <span style={{color:'#EF4444', fontSize: 11, fontWeight: 800}}>♥ {p.likes}</span>}
          </div>
        </div>
      </div>
    ))}
  </div>
);

const BoardNotes = ({ variant }) => (
  <Notes
    kicker="§ 게시판"
    title="표 컴팩트 — 정보 밀도 우선"
    points={[
      '번호/제목+태그+첨부+댓글/작성자/날짜/조회/좋아요/⋯ — 한 줄에 모든 메타 확인. 별표는 ⋯ 메뉴 안으로 통합.',
      '별표(★)는 ⋯ more 메뉴에서 "별표 추가/해제" — 첫 컬럼을 비우고 제목 영역에 인라인 ★ 인디케이터로 표시. 행 클릭 동선 충돌 방지.',
      '카테고리는 사이드바2에 단일 리스트(공지/자유/경조사/수술·MRI 일정/업무공유) + 참고(업무 가이드 분리).',
      '게시판 위 툴바: 태그 필터 칩 + 정렬 select + 전체/안읽음/즐겨찾기 segmented.',
      '검색은 페이지헤더 우측에. 새 게시물은 primary 버튼.',
      '행 hover 시에만 인라인 액션(⋯ 메뉴) 노출. 활자는 클릭으로 댓글 모달 오픈.',
    ]}
  />
);

// ═══════════════════════════════════════════════════════════════════
// 3. 전자결재 (Approval)
// ═══════════════════════════════════════════════════════════════════

const APPROVAL_VIEWS = [
  { id:'inbox', label:'결재함',    icon:'approval' },
  { id:'sent',  label:'기안함',    icon:'send' },
  { id:'ref',   label:'참조 문서함', icon:'file' },
  { id:'write', label:'작성하기',  icon:'plus' },
  { id:'tpl',   label:'양식 관리',  icon:'fileText' },
];

const APPROVAL_DOCS = [
  { id:'2026-05-11-001', type:'연차·휴가', title:'연차 사용 신청 (5/20-21)',           applicant:'박유진', dept:'경영지원팀', stage: 2, total: 3, stages:['박유진','김지오','박철홍'], actions:['기안','승인',null], times:['5/11 09:24','5/11 13:08',null], status:'대기',   tone:'warn',    date:'2026.5.11 09:24', urgent:false },
  { id:'2026-05-10-009', type:'비품구매', title:'외래팀 의료기기 비품 신청 (PSA 1대)',  applicant:'이나림', dept:'외래팀',     stage: 1, total: 3, stages:['이나림','김지오','박철홍'], actions:['기안',null,null], times:['5/10 16:02',null,null], status:'대기',   tone:'warn',    date:'2026.5.10 16:02', urgent:true  },
  { id:'2026-05-10-003', type:'업무기안', title:'5월 OP 일정 공유 및 인계',               applicant:'김지오', dept:'간호부',     stage: 3, total: 3, stages:['김지오','박철홍','정해영'], actions:['기안','승인','승인'], times:['5/10 11:38','5/10 14:22','5/10 17:05'], status:'완료',   tone:'success', date:'2026.5.10 11:38', urgent:false },
  { id:'2026-05-09-007', type:'출결정정', title:'5/2(금) 8:30 출근 정정 요청',             applicant:'백민',   dept:'경영지원팀', stage: 1, total: 3, stages:['백민','박유진','박철홍'],   actions:['기안','반려',null], times:['5/9 14:11','5/9 16:48',null], status:'반려',   tone:'danger',  date:'2026.5.9 14:11',  urgent:false, rejectReason:'출근 적합 증빙자 명기 부탁' },
  { id:'2026-05-08-014', type:'수리요청', title:'2층 외래 데스크탑 PC 수리 요청',           applicant:'홍자비', dept:'경영지원팀', stage: 2, total: 3, stages:['홍자비','이재훈','박철홍'], actions:['기안','승인',null], times:['5/8 17:30','5/9 09:14',null], status:'대기',   tone:'warn',    date:'2026.5.8 17:30',  urgent:false },
  { id:'2026-05-08-002', type:'연차계획', title:'2026년 상반기 연차 계획서',               applicant:'송소현', dept:'외래팀',     stage: 3, total: 3, stages:['송소현','이나림','박철홍'], actions:['기안','승인','승인'], times:['5/8 09:00','5/8 11:32','5/8 15:50'], status:'완료',   tone:'success', date:'2026.5.8 09:00',  urgent:false },
];

const ApprovalSidebar2 = ({ active, onPick }) => (
  <aside className="sidebar2">
    <div className="s2-scroll" style={{display:'grid', gap: 2, flex: 1, overflow:'auto'}}>
      <div className="s2-group-lbl" style={{marginTop: 4}}>결재</div>
      {APPROVAL_VIEWS.map(v =>
        <div key={v.id} className={'s2-item board-item '+(v.id===active?'on':'')} onClick={()=>onPick(v.id)}>
          <Icon name={v.icon} size={14}/>
          <span style={{flex: 1}}>{v.label}</span>
          {v.id==='inbox' && <span className="board-cnt warn">2</span>}
          {v.id==='write' && <Icon name="chevR" size={12}/>}
        </div>
      )}
    </div>
    <div className="s2-foot">
      <div className="small" style={{padding: '0 6px', fontSize: 11}}>이번 달 처리 8건</div>
    </div>
  </aside>
);

const ApprovalScreen = ({ variant, setVariant, view = 'inbox', onView }) => {
  if (view === 'write') return <ApprovalCompose variant={variant} setVariant={setVariant}/>;
  return <ApprovalInbox variant={variant} setVariant={setVariant} view={view} onView={onView}/>;
};

const ApprovalInbox = ({ variant, setVariant, view, onView }) => {
  const [selected, setSelected] = React.useState(0);
  const docs = APPROVAL_DOCS;
  const stats = {
    wait: docs.filter(d=>d.status==='대기').length,
    ok:   docs.filter(d=>d.status==='완료').length,
    no:   docs.filter(d=>d.status==='반려').length,
  };
  return (
    <div className="main"><div className="content">
      <div className="mod-pageheader">
        <div>
          <div className="addon-h1">{view==='inbox'?'결재함':view==='sent'?'기안함':'참조 문서함'}</div>
        </div>
        <div className="row" style={{gap: 8}}>
          <div className="input-wrap">
            <Icon name="search" size={13} className="ico"/>
            <input className="input" placeholder="제목·기안자·문서번호" style={{paddingLeft: 30}}/>
          </div>
          <Btn variant="primary" icon="plus" onClick={()=>onView && onView('write')}>새 기안</Btn>
        </div>
      </div>

      {/* 통계 */}
      <div className="ap-stat-row">
        <div className="ap-stat tone-warn"><div className="ops-lbl">내 차례 (대기)</div><div className="ops-v">{stats.wait}<span className="ops-u">건</span></div></div>
        <div className="ap-stat tone-success"><div className="ops-lbl">이번 달 승인</div><div className="ops-v">{stats.ok}<span className="ops-u">건</span></div></div>
        <div className="ap-stat tone-danger"><div className="ops-lbl">반려</div><div className="ops-v">{stats.no}<span className="ops-u">건</span></div></div>
        <div className="ap-stat"><div className="ops-lbl">평균 결재 소요</div><div className="ops-v">14<span className="ops-u">시간</span></div></div>
      </div>

      <ApprovalInboxB docs={docs} selected={selected} setSelected={setSelected}/>
    </div></div>
  );
};

const ApprovalInboxA = ({ docs, selected, setSelected }) => {
  const d = docs[selected];
  return (
    <div className="ap-split">
      <div className="ap-list">
        <div className="ap-list-head">
          <div className="row" style={{gap: 6, flexWrap:'wrap'}}>
            <button className="todo-chip tone-accent on">전체<span className="cnt">{docs.length}</span></button>
            <button className="todo-chip tone-warn">대기<span className="cnt">{docs.filter(x=>x.status==='대기').length}</span></button>
            <button className="todo-chip tone-success">완료<span className="cnt">{docs.filter(x=>x.status==='완료').length}</span></button>
            <button className="todo-chip tone-danger">반려<span className="cnt">{docs.filter(x=>x.status==='반려').length}</span></button>
          </div>
        </div>
        <div className="ap-list-body">
          {docs.map((doc, i) => (
            <div key={doc.id} className={'ap-row '+(i===selected?'on':'')} onClick={()=>setSelected(i)}>
              <div className="ap-row-top">
                <Chip tone={doc.tone}>{doc.status}</Chip>
                <span className="ap-row-type">{doc.type}</span>
                {doc.urgent && <Chip tone="danger">긴급</Chip>}
                <span className="ap-row-date">{doc.date.split(' ')[0]}</span>
              </div>
              <div className="ap-row-title">{doc.title}</div>
              <div className="ap-row-meta">
                <div className="org-emp-pic" style={{width: 18, height: 18, fontSize: 9}}>{doc.applicant.charAt(0)}</div>
                <span>{doc.applicant}</span>
                <span className="small">· {doc.dept}</span>
                <span className="ap-stage">{doc.stage}/{doc.total}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ApprovalDetail doc={d}/>
    </div>
  );
};

const ApprovalInboxB = ({ docs, selected, setSelected }) => {
  const cols = [
    { id:'draft',   label:'기안 작성',    docs: [],                                       tone:'gray'    },
    { id:'wait',    label:'결재 대기',    docs: docs.filter(d=>d.status==='대기'),       tone:'warn'    },
    { id:'review',  label:'검토 중',      docs: [],                                       tone:'accent'  },
    { id:'done',    label:'완료',         docs: docs.filter(d=>d.status==='완료'),       tone:'success' },
    { id:'reject',  label:'반려',         docs: docs.filter(d=>d.status==='반려'),       tone:'danger'  },
  ];
  return (
    <div className="ap-board">
      {cols.map(c => (
        <div key={c.id} className="ap-col">
          <div className={'ap-col-head tone-'+c.tone}>
            <span className="ap-col-name">{c.label}</span>
            <span className="ap-col-cnt">{c.docs.length}</span>
          </div>
          <div className="ap-col-body">
            {c.docs.length === 0 ? (
              <div className="ap-col-empty">문서 없음</div>
            ) : c.docs.map(doc => (
              <div key={doc.id} className="ap-board-card">
                <div className="ap-row-type">{doc.type}</div>
                <div className="ap-board-title">{doc.title}</div>
                <div className="ap-row-meta">
                  <div className="org-emp-pic" style={{width: 18, height: 18, fontSize: 9}}>{doc.applicant.charAt(0)}</div>
                  <span>{doc.applicant}</span>
                  {doc.urgent && <Chip tone="danger">긴급</Chip>}
                </div>
                <div className="ap-board-stages">
                  {doc.stages.map((s,i) => (
                    <div key={i} className={'ap-board-stage '+(i<doc.stage?'done':i===doc.stage?'on':'')}>
                      {i<doc.stage ? <Icon name="check" size={9}/> : i+1}
                    </div>
                  ))}
                </div>
                <div className="ap-board-date small">{doc.date.split(' ')[0]}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const ApprovalDetail = ({ doc }) => (
  <div className="ap-detail">
    <div className="card">
      <div className="row" style={{gap: 8, alignItems:'baseline', marginBottom: 4}}>
        <Chip tone={doc.tone}>{doc.status}</Chip>
        <span className="ap-row-type">{doc.type}</span>
        {doc.urgent && <Chip tone="danger">긴급</Chip>}
        <span style={{marginLeft:'auto'}} className="small">{doc.id}</span>
      </div>
      <div className="ap-detail-title">{doc.title}</div>
      <div className="ap-detail-meta">
        <div><span className="lbl">기안자</span><span>{doc.applicant} · {doc.dept}</span></div>
        <div><span className="lbl">기안일</span><span>{doc.date}</span></div>
        <div><span className="lbl">문서번호</span><span className="tnum">{doc.id}</span></div>
      </div>

      <div className="ap-line">
        <div className="ap-line-lbl">결재선 ({doc.stage}/{doc.total})
          {doc.status==='반려' && doc.rejectReason && <span className="ap-line-reject">사유: {doc.rejectReason}</span>}
        </div>
        <div className="ap-line-row">
          {doc.stages.map((s, i) => {
            const action = doc.actions?.[i];
            const time   = doc.times?.[i];
            const firstNull = doc.actions ? doc.actions.indexOf(null) : -1;
            const isCurrent = i === firstNull && doc.status === '대기';
            const cls = action==='반려' ? 'rejected' : action ? 'done' : isCurrent ? 'on' : 'pending';
            const role = i===0?'기안자':i<doc.total-1?'검토':'전결';
            return (
            <React.Fragment key={i}>
              <div className={'ap-line-step '+cls}>
                <div className="ap-line-pic">{action==='반려' ? <Icon name="x" size={14}/> : action ? <Icon name="check" size={12}/> : isCurrent ? <Icon name="clock" size={12}/> : s.charAt(0)}</div>
                <div className="ap-line-name">{s}</div>
                <div className="ap-line-role">{role}</div>
                {action && time && (
                  <div className={'ap-line-when '+(action==='반려'?'danger':action==='기안'?'accent':'success')}>
                    <span className="ap-line-when-act">{action}</span>
                    <span className="ap-line-when-ts">{time}</span>
                  </div>
                )}
                {isCurrent && <div className="ap-line-when waiting"><span className="ap-line-when-act">대기 중</span><span className="ap-line-when-ts">5시간 경과</span></div>}
                {!action && !isCurrent && <div className="ap-line-when muted"><span className="ap-line-when-act">대기 예정</span></div>}
              </div>
              {i<doc.stages.length-1 && <div className={'ap-line-bar '+(doc.actions?.[i] && doc.actions?.[i]!=='반려' ? 'done':'')}/>}
            </React.Fragment>
          );})}
        </div>
      </div>

      <div className="ap-content">
        <div className="ap-content-lbl">신청 내용</div>
        <div className="ap-content-body">
          {doc.type === '연차·휴가' && '2026년 5월 20일(수) ~ 5월 21일(목) 2일간 연차 사용을 신청합니다.\n사유: 가족 행사 참석\n업무 인계: 박유진 책임 (5/22 출근 시 인계 보고)'}
          {doc.type === '비품구매' && '외래팀에서 사용 중인 PSA 1대 추가 구매 요청합니다.\n견적: 1,250,000원 / 거래처: 3M Korea\n사유: 외래 환자 수 증가로 인한 처치 대기 시간 증가'}
          {doc.type !== '연차·휴가' && doc.type !== '비품구매' && '본문 미리보기 (상세 내용은 첨부 문서 참조)'}
        </div>
      </div>

      {doc.status === '대기' && (
        <div className="ap-actions">
          <Btn variant="primary" icon="check">승인</Btn>
          <Btn>반려</Btn>
          <Btn>의견 작성</Btn>
          <div style={{flex: 1}}/>
          <Btn>다음 결재선 → 박철홍</Btn>
        </div>
      )}
    </div>
  </div>
);

const APPROVAL_TEMPLATES = [
  { group:'최근 작성', items:[{ id:'supplies', label:'물품신청', tag:'기본 양식', recent:true }] },
  { group:'근태·휴가', items:[
    { id:'annual',     label:'연차/휴가',       tag:'기본 양식' },
    { id:'plan',       label:'연차계획서',       tag:'기본 양식' },
    { id:'overtime',   label:'연장근무',         tag:'기본 양식' },
    { id:'correct',    label:'출결정정',         tag:'기본 양식' },
  ]},
  { group:'업무·지원', items:[
    { id:'repair',     label:'수리요청서',       tag:'기본 양식' },
    { id:'report',     label:'보고서 작성',      tag:'기본 양식' },
    { id:'draft',      label:'업무기안',         tag:'기본 양식' },
    { id:'cooperate',  label:'업무협조',         tag:'기본 양식' },
    { id:'official',   label:'공문발송',         tag:'기본 양식', warn:'권한 필요' },
  ]},
  { group:'양식·기타', items:[
    { id:'request',    label:'양식신청',         tag:'기본 양식' },
    { id:'promote',    label:'연차촉진통보서',    tag:'기본 양식' },
  ]},
];

// 물품신청 양식 데이터
const SUPPLY_CATEGORIES = ['의료소모품', '의료기기', '약품', '사무용품', '식자재', '청소용품', '기타'];

const SUPPLY_SUGGESTIONS = [
  { name:'라텍스 장갑 (S)',  cat:'의료소모품', avg: 6, unit:'BOX', last:'5월 8일', stock: 14 },
  { name:'생리식쥼라인 생리식쥼라인', cat:'의료소모품', avg: 3, unit:'EA',  last:'5월 4일', stock: 2  },
  { name:'알코솔 솔션 500ml', cat:'약품',     avg: 4, unit:'병', last:'4월 27일', stock: 5 },
  { name:'A4 복사지 백지 80g', cat:'사무용품', avg: 8, unit:'박', last:'4월 22일', stock: 3 },
  { name:'멘그루브 18cm',         cat:'의료소모품', avg: 12,unit:'EA', last:'4월 19일', stock: 0 },
  { name:'주사 바늘 23G',          cat:'의료소모품', avg: 5, unit:'BOX',last:'4월 16일', stock: 4 },
  { name:'클라이트 PB 섵 커피',cat:'식자재',   avg: 2, unit:'박', last:'4월 11일', stock: 1 },
  { name:'라벨프린터 지',  cat:'사무용품', avg: 3, unit:'박', last:'4월 8일',  stock: 6 },
];

const SuppliesForm = () => {
  const [statsOpen, setStatsOpen] = React.useState(true);
  const [items, setItems] = React.useState([
    { name:'라텍스 장갑 (S)', cat:'의료소모품', stock: 14, qty: 6, unit:'BOX', purpose:'5월 외래 대비' },
    { name:'멘그루브 18cm',      cat:'의료소모품', stock: 0,  qty: 12,unit:'EA',  purpose:'재고 소진' },
    { name:'',                                  cat:'', stock: null, qty: 1, unit:'EA', purpose:'' },
  ]);
  const [focusedIdx, setFocusedIdx] = React.useState(-1);
  const removeRow = (i) => setItems(items.filter((_,idx)=>idx!==i));
  const addRow    = () => setItems([...items, { name:'', cat:'', stock:null, qty:1, unit:'EA', purpose:'' }]);

  return (
    <div className="card supplies-card">
      <div className="card-row">
        <div className="row" style={{gap: 8, alignItems:'center'}}>
          <div className="ctitle" style={{whiteSpace:'nowrap'}}>본문 — 물품신청</div>
          <Chip tone="accent">기본 양식</Chip>
          <span className="sup-recent">최근 작성</span>
        </div>
        <div className="row" style={{gap: 6}}>
          <button className="sup-action" onClick={addRow}><Icon name="plus" size={12}/> 항목 추가</button>
          <button className={'sup-action '+(statsOpen?'on':'')} onClick={()=>setStatsOpen(!statsOpen)}>통계치 입력</button>
        </div>
      </div>

      {/* 컨텍스트 바 — 신청부서 재고 기준 */}
      <div className="sup-ctx">
        <div className="row" style={{gap: 8, alignItems:'center'}}>
          <span className="sup-ctx-dot"/>
          <span className="sup-ctx-lbl">신청부서</span>
          <select className="sup-ctx-select">
            <option>SY INC. 경영지원팀 재고 기준</option>
            <option>박철홍정형외과 외래팀 재고 기준</option>
            <option>박철홍정형외과 병동팀 재고 기준</option>
            <option>박철홍정형외과 수술팀 재고 기준</option>
          </select>
          <span className="small sup-ctx-help">선택한 부서의 재고를 기준으로 현재 재고가 자동 표시됩니다</span>
        </div>
        <div className="row" style={{gap: 6}}>
          <span className="sup-meta-chip">임시저장 13:15</span>
          <span className="sup-meta-chip warn">재고 0개 멘그루브</span>
        </div>
      </div>

      {/* 최근 신청 통계치 입력 (펼치기/접기) */}
      {statsOpen && (
        <div className="sup-stats">
          <div className="sup-stats-head">
            <div>
              <div className="sup-stats-title">최근 신청 통계치 입력</div>
              <div className="sup-stats-sub">최근 30일 추천 8개 — 클릭하면 아래 표에 바로 추가됩니다</div>
            </div>
            <button className="sup-stats-fold" onClick={()=>setStatsOpen(false)}>접기 <Icon name="chevD" size={12} style={{transform:'rotate(180deg)'}}/></button>
          </div>
          <div className="sup-stats-grid">
            {SUPPLY_SUGGESTIONS.map((s,i) => (
              <div key={i} className="sup-stats-card" onClick={()=>setItems([...items.slice(0,-1), { name:s.name, cat:s.cat, stock:s.stock, qty:s.avg, unit:s.unit, purpose:'' }, items[items.length-1]])}>
                <div className="sup-stats-cat">{s.cat}</div>
                <div className="sup-stats-name">{s.name}</div>
                <div className="sup-stats-foot">
                  <span className="sup-stats-qty">평균 <b>{s.avg}</b> {s.unit}</span>
                  <span className={'sup-stats-stock '+(s.stock===0?'danger':s.stock<=3?'warn':'')}>재고 {s.stock}</span>
                </div>
                <div className="sup-stats-last">{s.last}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 품목 표 */}
      <div className="sup-table-wrap">
        <table className="sup-table">
          <thead>
            <tr>
              <th style={{width: 28}}>#</th>
              <th style={{width: 130}}>품목구분 *</th>
              <th>물품명 *</th>
              <th style={{width: 100}}>현재 재고</th>
              <th style={{width: 130}}>신청 수량 *</th>
              <th>용도</th>
              <th style={{width: 36}}></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i} className={focusedIdx===i?'on':''}>
                <td className="sup-num">{i+1}</td>
                <td>
                  <select className="sup-input" value={it.cat} onChange={e=>{const c=[...items];c[i].cat=e.target.value;setItems(c);}}>
                    <option value="">선택</option>
                    {SUPPLY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td>
                  <div className="sup-name-wrap">
                    <input className="sup-input" placeholder="물품명을 입력하세요" value={it.name}
                      onFocus={()=>setFocusedIdx(i)}
                      onBlur={()=>setTimeout(()=>setFocusedIdx(-1), 150)}
                      onChange={e=>{const c=[...items];c[i].name=e.target.value;setItems(c);}}/>
                    {focusedIdx===i && !it.name && (
                      <div className="sup-auto">
                        <div className="sup-auto-head">자동완성 제안</div>
                        {SUPPLY_SUGGESTIONS.slice(0, 4).map((s, j) => (
                          <div key={j} className="sup-auto-row" onMouseDown={()=>{const c=[...items];c[i]={name:s.name,cat:s.cat,stock:s.stock,qty:s.avg,unit:s.unit,purpose:''};setItems(c);}}>
                            <div>
                              <div className="sup-auto-name">{s.name}</div>
                              <div className="sup-auto-meta">{s.cat} · 재고 {s.stock} {s.unit}</div>
                            </div>
                            <span className="sup-auto-add">+ 추가</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </td>
                <td>
                  <div className={'sup-stock '+(it.stock===0?'danger':it.stock!==null&&it.stock<=3?'warn':it.stock===null?'empty':'')}>
                    {it.stock===null ? '—' : `${it.stock} ${it.unit}`}
                  </div>
                </td>
                <td>
                  <div className="sup-qty">
                    <button className="sup-qty-btn" onClick={()=>{const c=[...items];c[i].qty=Math.max(1,c[i].qty-1);setItems(c);}}>−</button>
                    <input className="sup-qty-input" type="number" value={it.qty} onChange={e=>{const c=[...items];c[i].qty=Math.max(1,parseInt(e.target.value)||1);setItems(c);}}/>
                    <button className="sup-qty-btn" onClick={()=>{const c=[...items];c[i].qty=c[i].qty+1;setItems(c);}}>+</button>
                    <select className="sup-unit" value={it.unit} onChange={e=>{const c=[...items];c[i].unit=e.target.value;setItems(c);}}>
                      <option>EA</option><option>BOX</option><option>박</option><option>병</option><option>kg</option><option>L</option>
                    </select>
                  </div>
                </td>
                <td>
                  <input className="sup-input" placeholder="사용 용도" value={it.purpose}
                    onChange={e=>{const c=[...items];c[i].purpose=e.target.value;setItems(c);}}/>
                </td>
                <td>
                  <button className="sup-del" onClick={()=>removeRow(i)} title="삭제"><Icon name="x" size={12}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="sup-addrow" onClick={addRow}>
          <Icon name="plus" size={13}/> 품목 행 추가
        </button>
      </div>

      {/* 요약 수치 */}
      <div className="sup-summary">
        <div className="sup-sum-cell"><div className="lbl">신청 품목</div><div className="v">{items.filter(i=>i.name).length}<span className="u">개</span></div></div>
        <div className="sup-sum-cell"><div className="lbl">총 수량</div><div className="v">{items.filter(i=>i.name).reduce((a,b)=>a+b.qty,0)}<span className="u">개단위</span></div></div>
        <div className="sup-sum-cell"><div className="lbl">재고 0 품목</div><div className="v danger">{items.filter(i=>i.name&&i.stock===0).length}<span className="u">개</span></div></div>
        <div className="sup-sum-cell"><div className="lbl">예상 처리 소요</div><div className="v">14<span className="u">시간</span></div></div>
      </div>

      {/* 첨부 / 메모 */}
      <div className="sup-extra">
        <label className="sup-extra-block">
          <div className="lbl">기타 요청사항</div>
          <textarea className="op-textarea" rows={2} placeholder="상세한 요청사항이 있으면 적어주세요 (예: 긴급 발주 필요, 특정 그레이드 필요 등)"/>
        </label>
        <label className="sup-extra-block">
          <div className="lbl">첨부 사진 · 파일</div>
          <button className="op-add-row" style={{width:'100%'}}>
            <Icon name="plus" size={12}/>
            <span>사진을 드래그하거나 클릭하여 첨부</span>
            <span className="small" style={{marginLeft:'auto'}}>JPG·PNG 완 5MB</span>
          </button>
        </label>
      </div>
    </div>
  );
};

const ApprovalCompose = ({ variant, setVariant }) => {
  const [tpl, setTpl] = React.useState('supplies');
  // 양식 전체 평면 리스트 (드롭다운용)
  const allTpls = APPROVAL_TEMPLATES.flatMap(g => g.items.map(t => ({...t, group: g.group})));
  const currentTpl = allTpls.find(t => t.id === tpl) || allTpls[0];
  return (
    <div className="main"><div className="content">
      <div className="mod-pageheader">
        <div className="row" style={{gap: 10, alignItems:'center', flexWrap:'wrap'}}>
          <label className="ap-tpl-pick">
            <span className="lbl">양식</span>
            <select value={tpl} onChange={e=>setTpl(e.target.value)}>
              {APPROVAL_TEMPLATES.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.items.map(t => <option key={t.id} value={t.id}>{t.label}{t.warn?' · 권한 필요':''}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          {currentTpl?.recent && <Chip tone="accent">최근 작성</Chip>}
          {currentTpl?.warn && <Chip tone="warn">{currentTpl.warn}</Chip>}
          <span className="small" style={{color:'var(--z-500)'}}>{currentTpl?.group} · {currentTpl?.tag}</span>
        </div>
        <div className="row" style={{gap: 8}}>
          <Btn icon="file">임시저장</Btn>
          <Btn variant="primary" icon="send">결재 상신</Btn>
        </div>
      </div>

      <div className="ap-compose single">
        {/* 우측 본문 + 결재흐름 — 결재흐름을 상신 버튼 아래에 먼저 위치 */}
        <div className="ap-compose-right">
          <div className="card">
            <div className="card-row">
              <div className="ctitle">결재 흐름</div>
              <div className="row" style={{gap: 6}}>
                <Btn size="sm" icon="file">불러오기</Btn>
                <Btn size="sm">템플릿 저장</Btn>
              </div>
            </div>
            <div className="ap-line compose">
              <div className="ap-line-row">
                {[{n:'박유진',role:'기안자(나)',act:'기안',ts:'지금'},{n:'김지오',role:'검토',act:null,ts:null},{n:'박철홍',role:'전결',act:null,ts:null}].map((p, i) => (
                  <React.Fragment key={i}>
                    <div className={'ap-line-step '+(i===0?'me':'pending')}>
                      <div className="ap-line-pic">{p.n.charAt(0)}</div>
                      <div className="ap-line-name">{p.n}</div>
                      <div className="ap-line-role">{p.role}</div>
                      {p.act ? (
                        <div className="ap-line-when accent">
                          <span className="ap-line-when-act">{p.act}</span>
                          <span className="ap-line-when-ts">{p.ts}</span>
                        </div>
                      ) : (
                        <div className="ap-line-when muted"><span className="ap-line-when-act">상신 시 알림</span></div>
                      )}
                    </div>
                    {i<2 && <div className="ap-line-bar"/>}
                  </React.Fragment>
                ))}
                <button className="ap-line-add" title="결재자 추가"><Icon name="plus" size={14}/></button>
              </div>
            </div>
            <div className="ap-refs">
              <div className="lbl">참조자</div>
              <div className="row" style={{gap: 6, flexWrap:'wrap'}}>
                {['김이지','이나림','백민','임귀섭'].map(n => (
                  <span key={n} className="ap-ref-chip">참조 {n} <button>×</button></span>
                ))}
                <button className="ap-ref-add">+ 참조자 추가</button>
              </div>
            </div>
          </div>

          {tpl === 'supplies' ? <SuppliesForm/> : (
          <div className="card">
            <div className="card-row">
              <div className="ctitle">본문 — 연차/휴가</div>
              <Chip tone="accent">기본 양식</Chip>
            </div>
            <div className="ap-form">
              <label><div className="lbl">제목 *</div><input className="input" placeholder="예: 5월 20-21일 연차 사용 신청"/></label>
              <div className="row" style={{gap: 12}}>
                <label style={{flex: 1}}><div className="lbl">시작일 *</div><input className="input" type="date" defaultValue="2026-05-20"/></label>
                <label style={{flex: 1}}><div className="lbl">종료일 *</div><input className="input" type="date" defaultValue="2026-05-21"/></label>
                <label style={{flex: 1}}><div className="lbl">유형</div>
                  <select className="input"><option>연차</option><option>오전반차</option><option>오후반차</option><option>경조사</option></select>
                </label>
              </div>
              <label><div className="lbl">사유 *</div><textarea className="op-textarea" rows={4} placeholder="간단한 사유를 작성해주세요"/></label>
              <label><div className="lbl">업무 인계</div><textarea className="op-textarea" rows={2} placeholder="인계받을 직원과 인계 내용"/></label>
              <label><div className="lbl">첨부 파일</div>
                <button className="op-add-row" style={{width:'100%'}}>
                  <Icon name="plus" size={12}/>
                  <span>파일을 드래그하거나 클릭하여 첨부</span>
                </button>
              </label>
            </div>
          </div>
          )}
        </div>
      </div>
    </div></div>
  );
};

const ApprovalNotes = ({ variant, view }) => (
  <Notes
    kicker={'§ 전자결재 — ' + (view==='write'?'작성하기':view==='inbox'?'결재함':view==='sent'?'기안함':view==='ref'?'참조 문서함':'양식 관리')}
    title={
      view==='write' ? '기안 작성 — 양식 드롭다운 + 결재흐름 상단 + 본문' :
                       '워크플로 보드 — 기안/대기/검토/완료/반려 5단계 칸반'
    }
    points={
      view==='write' ? [
        '헤더의 드롭다운으로 양식 선택 → 좌측 카드 그리드 제거로 본문 공간 확보.',
        '결재 흐름 카드가 상단 — 결재 상신 전에 누가 설정되어있는지 먼저 의식.',
        '각 단계 카드에 시각·액션 라벨 (기안/승인/반려/대기 중/대기 예정) — 상신 전에는 "상신 시 알림" 미리보기.',
        '참조자는 chip 형태 + 자유 검색 추가.',
        '물품신청: 자동완성 + 최근 30일 추천 통계치 + 재고 컴텍스트 바 + 요약 4칸.',
      ] : [
        '5단계 칸반: 기안 작성 / 결재 대기 / 검토 중 / 완료 / 반려.',
        '각 카드: 유형 라벨 + 제목 + 기안자 + 긴급 칩 + 결재선 점 도트(완료=체크) + 날짜.',
        '단계 헤더에 카운트 표시. 빈 단계는 "문서 없음" 텍스트.',
        '관리자·결재자에게 유용한 전체 흐름 조망 뷰. 을 클릭하면 세부 보기.',
        '상단 4 KPI: 내 차례 대기 / 이번 달 승인 / 반려 / 평균 결재 소요(시간).',
      ]
    }
  />
);

// ═══════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════

Object.assign(window, {
  ChatSidebar2, ChatScreen, ChatNotes, CHAT_ROOMS,
  BoardSidebar2, BoardScreen, BoardNotes, BOARD_CATEGORIES,
  ApprovalSidebar2, ApprovalScreen, ApprovalNotes, APPROVAL_VIEWS,
});
