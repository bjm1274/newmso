// MSO 모바일 — Screens (1) : 내정보 홈/체크인/알림, 채팅(목록/방), 게시판(목록/상세)
// React + MIcon/MChip/MBtn/MAvatar/MHeader/MBottomTab/MCard/MListRow 전역 사용

// ═══════════════════════════════════════════════════════════════
// 0. 내정보 — Home (프로필 카드 + KPI 리스트)
// ═══════════════════════════════════════════════════════════════
const SHome = ({ onSub }) => (
  <div className="m-screen">
    <div className="m-header">
      <div style={{flex:1}}>
        <div className="title">안녕하세요, 백정민님</div>
        <div className="sub">2026년 5월 11일 (월) · 박철홍정형외과</div>
      </div>
      <div className="actions">
        <button onClick={()=>onSub('alert')}>
          <MIcon name="bell" size={20}/>
          <span className="badge">3</span>
        </button>
        <button><MIcon name="qr" size={20}/></button>
      </div>
    </div>

    <div className="m-scroll" style={{paddingBottom: 24}}>
      {/* 프로필 카드 */}
      <div style={{padding:'16px 16px 0'}}>
        <div className="m-card" style={{padding: 16, display:'flex', gap:14, alignItems:'center'}}>
          <MAvatar tone="blue" size="lg">백</MAvatar>
          <div style={{flex:1, minWidth:0}}>
            <div style={{display:'flex', alignItems:'baseline', gap:8}}>
              <div style={{fontSize:17, fontWeight:800, letterSpacing:'-0.02em'}}>백정민</div>
              <div style={{fontSize:12, color:'var(--z-500)', fontWeight:600}}>이사</div>
            </div>
            <div style={{fontSize:12, color:'var(--z-500)', marginTop:2}}>경영지원팀 · 사번 2 · 입사 3년차</div>
            <div style={{display:'flex', gap:5, marginTop:8}}>
              <MChip tone="success" dot>재직중</MChip>
              <MChip>정규직</MChip>
            </div>
          </div>
        </div>
      </div>

      {/* 빠른 액션 6개 */}
      <div style={{padding:'14px 16px 0', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap: 8}}>
        {[
          { ic:'clock',    lbl:'출퇴근', tone:'accent',  onTap:()=>onSub('attend') },
          { ic:'check',    lbl:'할일',   tone:'',        onTap:()=>onSub('todo'), badge: 7 },
          { ic:'calendar', lbl:'연차',   tone:'success', onTap:()=>onSub('hr-leave') },
          { ic:'won',      lbl:'급여',   tone:'',        onTap:()=>onSub('payroll') },
          { ic:'fileText', lbl:'서류',   tone:'',        onTap:()=>onSub('docs'),    badge: 10 },
          { ic:'badge',    lbl:'증명서', tone:'',        onTap:()=>onSub('hr-docs') },
          { ic:'star',     lbl:'복지',   tone:'',        onTap:()=>onSub('hr-welfare') },
          { ic:'alertTri', lbl:'근태이상', tone:'warning', onTap:()=>onSub('hr-abnormal'), badge: 4 },
        ].map((q,i) => (
          <button key={i} onClick={q.onTap} style={{
            background:'var(--card)', border:'1px solid var(--border)',
            borderRadius: 14, padding:'12px 4px',
            display:'flex', flexDirection:'column', alignItems:'center', gap:5,
            position:'relative',
          }}>
            <div className={'ico-tile' + (q.tone ? ' tone-'+q.tone : '')} style={{
              width:32, height:32, borderRadius:9,
              background: q.tone === 'accent' ? 'var(--accent-soft)' : q.tone === 'success' ? 'var(--success-soft)' : q.tone === 'warning' ? 'var(--warning-soft)' : 'var(--z-100)',
              color:    q.tone === 'accent' ? 'var(--accent)' : q.tone === 'success' ? 'var(--success)' : q.tone === 'warning' ? 'var(--warning)' : 'var(--z-700)',
              display:'grid', placeItems:'center',
            }}>
              <MIcon name={q.ic} size={16}/>
            </div>
            <span style={{fontSize:11, fontWeight:700, color:'var(--z-700)'}}>{q.lbl}</span>
            {q.badge && (
              <span style={{position:'absolute', top:6, right:10,
                minWidth:14, height:14, padding:'0 4px',
                background:'var(--danger)', color:'#fff',
                borderRadius:999, fontSize:9, fontWeight:800,
                display:'grid', placeItems:'center', border:'2px solid var(--card)'
              }}>{q.badge}</span>
            )}
          </button>
        ))}
      </div>

      {/* 오늘 한눈에 */}
      <div className="m-section">
        <div className="m-section-h"><div className="lbl">오늘 한눈에</div></div>
        <div className="m-card flush">
          <MListRow icon="clock"    iconTone="accent"  label="오늘 근태"  sub="출근 전 · 09:00 시작" val="대기"/>
          <MListRow icon="approval" iconTone="warning" label="미결재"    sub="결재 대기중"     val="3" valUnit="건"/>
          <MListRow icon="chat"     iconTone="accent"  label="안 읽은 메시지" sub="채널 4 · DM 2"   val="12" valUnit="건"/>
          <MListRow icon="board"    iconTone=""        label="새 공지"   sub="중요 공지 1건 포함" val="2" valUnit="건"/>
        </div>
      </div>

      {/* 인사 / 근무 카드 (KPI) */}
      <div className="m-section">
        <div className="m-section-h"><div className="lbl">이번 달</div></div>
        <div className="m-card flush">
          <MListRow icon="calendar" label="이번 달 근태" sub="정상 1 · 지각 3 · 결근 0" val={<>1<span style={{fontSize:11,color:'var(--z-400)',fontWeight:700}}>/4일</span></>}/>
          <MListRow icon="badge"    label="연차 휴가"   sub="총 15일 중 사용 4일"  val="11" valUnit="일"/>
          <MListRow icon="won"      label="이번 달 급여" sub="실수령액 미확정"      val="—"/>
          <MListRow icon="fileText" label="증명서 보관함" sub="발급 3건"            val=""/>
        </div>
      </div>

      <div style={{padding:'18px 16px 4px', display:'flex', gap:8}}>
        <MBtn icon="out" block>로그아웃</MBtn>
        <MBtn icon="edit" block variant="primary">정보 수정</MBtn>
      </div>
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// 1. 내정보 — 출퇴근 체크인 (모바일 핵심)
// ═══════════════════════════════════════════════════════════════
const SAttend = ({ onBack }) => {
  const [state, setState] = React.useState('before'); // before / in / done
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="출퇴근 체크인" sub="박철홍정형외과 · 1F 데스크"
        actions={<button><MIcon name="moreV" size={20}/></button>}/>
      <div className="m-scroll" style={{paddingBottom: 24}}>
        {/* hero */}
        <div style={{padding:'24px 20px 8px', textAlign:'center'}}>
          <div style={{fontSize:12, color:'var(--z-500)', fontWeight:700}}>2026년 5월 11일 (월요일)</div>
          <div style={{fontSize:44, fontWeight:800, letterSpacing:'-0.04em', marginTop:6, color:'var(--z-900)', fontFeatureSettings:'"tnum"'}}>
            오전 <span style={{color:'var(--accent)'}}>09:14</span><span style={{fontSize:24, color:'var(--z-400)'}}>:32</span>
          </div>
          <div style={{display:'inline-flex', alignItems:'center', gap:8, marginTop:14,
            padding:'6px 12px', borderRadius:999, background:'var(--success-soft)', color:'var(--success)',
            fontSize:11, fontWeight:800, letterSpacing:'-0.005em'
          }}>
            <MIcon name="checkCircle" size={13}/>
            GPS 인증됨 · 병원 거리 38m
          </div>
        </div>

        {/* 큰 체크인 버튼 */}
        <div style={{padding:'18px 20px 6px'}}>
          <button
            onClick={()=>setState(state === 'before' ? 'in' : state === 'in' ? 'done' : 'before')}
            style={{
              width:'100%', aspectRatio:'1.6', borderRadius: 24,
              background: state === 'before' ? 'linear-gradient(135deg, #2563EB, #1D4ED8)' :
                          state === 'in'     ? 'linear-gradient(135deg, #F59E0B, #D97706)' :
                                               'linear-gradient(135deg, #10B981, #059669)',
              color:'#fff', border:0,
              boxShadow:'0 12px 24px rgba(37,99,235,0.25)',
              display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10,
            }}>
            <MIcon name="clock" size={48} strokeWidth={1.4}/>
            <div style={{fontSize:22, fontWeight:800, letterSpacing:'-0.02em'}}>
              {state === 'before' ? '출근하기' : state === 'in' ? '퇴근하기' : '오늘 근무 완료'}
            </div>
            <div style={{fontSize:11, fontWeight:600, opacity:0.85, letterSpacing:'-0.005em'}}>
              {state === 'done' ? '수고하셨습니다 · 8시간 32분 근무' : '탭하면 즉시 기록됩니다'}
            </div>
          </button>
        </div>

        {/* 보조 액션 */}
        <div style={{padding:'12px 20px 0', display:'flex', gap:8}}>
          <MBtn block icon="mapPin">외출 신청</MBtn>
          <MBtn block icon="paperclip">사유 첨부</MBtn>
        </div>

        {/* 오늘 기록 */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">오늘 기록</div><span className="more">전체 보기</span></div>
          <div className="m-card flush">
            {[
              { t:'09:14', l:'출근',     tone:'success', sub:'GPS 인증 · 1F 데스크' },
              { t:'12:00', l:'점심 외출', tone:'',        sub:'예정' },
              { t:'13:00', l:'복귀',     tone:'',        sub:'예정' },
              { t:'18:00', l:'퇴근',     tone:'',        sub:'예정' },
            ].map((r,i) => (
              <div key={i} className="m-list-row" style={{gridTemplateColumns:'52px 1fr auto'}}>
                <div className="m-tnum" style={{fontSize:13, fontWeight:800, color: r.tone === 'success' ? 'var(--success)' : 'var(--z-400)'}}>{r.t}</div>
                <div>
                  <div className="lbl">{r.l}</div>
                  <div className="sub">{r.sub}</div>
                </div>
                {r.tone === 'success'
                  ? <MChip tone="success">완료</MChip>
                  : <MChip>예정</MChip>}
              </div>
            ))}
          </div>
        </div>

        {/* 이번 주 KPI */}
        <div className="m-section">
          <div className="m-section-h"><div className="lbl">이번 주 요약</div></div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap: 8}}>
            {[
              { v:'32:10', l:'근무 합계' },
              { v:'1',     l:'지각' },
              { v:'0',     l:'결근' },
            ].map((k,i) => (
              <div key={i} className="m-card" style={{padding:'14px 12px'}}>
                <div className="m-tnum" style={{fontSize:22, fontWeight:800, letterSpacing:'-0.025em'}}>{k.v}</div>
                <div style={{fontSize:11, color:'var(--z-500)', fontWeight:700, marginTop:2}}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 2. 내정보 — 알림 목록
// ═══════════════════════════════════════════════════════════════
const SAlert = ({ onBack }) => {
  const [filter, setFilter] = React.useState('all');
  const FILTERS = [
    { id:'all',     label:'전체',     cnt:12 },
    { id:'app',     label:'결재',     cnt:3  },
    { id:'mention', label:'멘션',     cnt:2  },
    { id:'attend',  label:'근태',     cnt:4  },
    { id:'board',   label:'공지',     cnt:1  },
    { id:'salary',  label:'급여',     cnt:2  },
  ];
  const items = [
    { tone:'accent',  ic:'approval',   t:'결재 요청', n:'박유진 · 5월 11일 14:22',  body:'5월 휴가 신청 결재 부탁드립니다.', new:true, type:'app' },
    { tone:'danger',  ic:'alertTri',   t:'근태 이상', n:'시스템 · 5월 11일 09:21',  body:'지각 처리 — 사유를 입력해주세요.', new:true, type:'attend' },
    { tone:'accent',  ic:'chat',       t:'멘션',     n:'경영지원팀 · 14:24',         body:'@백정민 오후 회의록 공유 부탁드려요.', new:true, type:'mention' },
    { tone:'',        ic:'board',      t:'새 공지',  n:'이재훈 · 5월 4일',           body:'신규 메신저 출퇴근 기능 안내 ...', new:false, type:'board' },
    { tone:'success', ic:'won',        t:'급여 명세서', n:'시스템 · 5월 10일',       body:'2026년 4월 급여명세서가 발급되었습니다.', new:false, type:'salary' },
    { tone:'warning', ic:'approval',   t:'결재 24시간 초과', n:'시스템 · 5월 10일', body:'야간근무 신청 결재가 지연되고 있어요.', new:false, type:'app' },
    { tone:'accent',  ic:'approval',   t:'결재 완료', n:'홍자비 · 5월 9일',           body:'반려: 4월 야근수당 신청에 대한 답변이 있어요.', new:false, type:'app' },
  ];
  const filtered = filter === 'all' ? items : items.filter(i => i.type === filter);
  return (
    <div className="m-screen">
      <MHeader back={onBack} title="알림" sub={`안 읽음 ${items.filter(i=>i.new).length}건`}
        actions={<>
          <button><MIcon name="filter" size={20}/></button>
          <button><MIcon name="checkCircle" size={20}/></button>
        </>}/>
      <div className="m-chip-bar">
        {FILTERS.map(f => (
          <button key={f.id} className={filter === f.id ? 'on' : ''} onClick={()=>setFilter(f.id)}>
            {f.label}<span className="cnt">{f.cnt}</span>
          </button>
        ))}
      </div>
      <div className="m-scroll">
        <div style={{padding:'12px 16px'}}>
          <div className="m-card flush">
            {filtered.map((n, i) => (
              <div key={i} className="m-list-row" style={{position:'relative'}}>
                <div className={'ico-tile ' + (n.tone ? 'tone-'+n.tone : '')}>
                  <MIcon name={n.ic} size={18}/>
                </div>
                <div style={{minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <span style={{fontSize:14, fontWeight:800}}>{n.t}</span>
                    {n.new && <span style={{width:6, height:6, borderRadius:999, background:'var(--accent)'}}/>}
                  </div>
                  <div className="sub" style={{marginTop:2}}>{n.n}</div>
                  <div style={{fontSize:12, color:'var(--z-700)', marginTop:4, lineHeight:1.5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{n.body}</div>
                </div>
                <MIcon name="chevR" size={18} color="var(--z-400)"/>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 3. 채팅 — 목록
// ═══════════════════════════════════════════════════════════════
const SChatList = ({ onOpen, onNav }) => {
  const [tab, setTab] = React.useState('chat');
  const rooms = [
    { id:'mgmt',  pin:true,  tone:'blue',   name:'경영지원팀',     kind:'그룹 · 6명', last:'오후 회의록 공유 부탁드려요.', who:'이현우', ts:'14:24', unread: 3 },
    { id:'park',  pin:true,  tone:'violet', name:'박철홍 원장님',   kind:'1:1',     last:'그렇게 진행해주세요', who:'박철홍', ts:'13:08', unread: 1 },
    { id:'rad',   pin:false, tone:'green',  name:'영상의학팀',     kind:'그룹 · 4명', last:'@백정민 MRI 일정 확인 부탁', who:'김상민', ts:'어제',  unread: 2, mention:true },
    { id:'op',    pin:false, tone:'pink',   name:'OP실 알림',     kind:'채널',     last:'1번방 시술 시작 — 박원장',  who:'시스템', ts:'어제',  unread: 0 },
    { id:'inv',   pin:false, tone:'orange', name:'재고 알림',       kind:'채널',     last:'재고 부족 5개 항목',         who:'시스템', ts:'어제',  unread: 0 },
    { id:'notice',pin:false, tone:'gray',   name:'전사 공지',       kind:'공지',     last:'신규 메신저 출퇴근 기능 안내', who:'이재훈', ts:'5/4',   unread: 0 },
  ];
  const sorted = [...rooms].sort((a,b)=> (b.pin?1:0)-(a.pin?1:0));
  return (
    <div className="m-screen">
      <MHeader title="채팅" sub="실시간 연결됨" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button onClick={()=>onNav && onNav('form-chat')}><MIcon name="edit" size={20}/></button>
      </>}/>
      <div className="m-chip-bar">
        <button className={tab==='chat'?'on':''} onClick={()=>setTab('chat')}>채팅</button>
        <button className={tab==='org'?'on':''}  onClick={()=>setTab('org')}>조직도</button>
        <button>읽지않음 6</button>
        <button>그룹</button>
        <button>1:1</button>
        <button>채널</button>
      </div>
      <div className="m-scroll">
        <div style={{padding:'4px 0 8px'}}>
          {sorted.map((r,i) => (
            <div key={r.id} onClick={()=>onOpen(r.id)} style={{
              display:'grid', gridTemplateColumns:'52px 1fr auto', gap:12, alignItems:'center',
              padding:'12px 16px',
              borderBottom: i < sorted.length-1 ? '1px solid var(--border)' : 'none',
              background: 'var(--card)',
            }}>
              <MAvatar tone={r.tone}>{r.name.charAt(0)}</MAvatar>
              <div style={{minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  {r.pin && <MIcon name="pin" size={11} color="var(--z-400)"/>}
                  <span style={{fontSize:14, fontWeight:800, letterSpacing:'-0.012em'}}>{r.name}</span>
                  <span style={{fontSize:10, color:'var(--z-500)', fontWeight:600}}>{r.kind}</span>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:5, marginTop:4}}>
                  {r.mention && <span style={{fontSize:10, fontWeight:800, color:'var(--accent)'}}>@</span>}
                  <span style={{fontSize:12, color:'var(--z-600)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth: 200}}>
                    <b style={{color:'var(--z-700)'}}>{r.who}</b> {r.last}
                  </span>
                </div>
              </div>
              <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6}}>
                <span style={{fontSize:10, color:'var(--z-500)', fontWeight:600}}>{r.ts}</span>
                {r.unread > 0 && (
                  <span style={{
                    minWidth:18, height:18, padding:'0 5px',
                    background: r.mention ? 'var(--accent)' : 'var(--z-700)', color:'#fff',
                    borderRadius:999, fontSize:10, fontWeight:800,
                    display:'grid', placeItems:'center',
                  }}>{r.unread}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 4. 채팅 — 방
// ═══════════════════════════════════════════════════════════════
const SChatRoom = ({ onBack }) => {
  const msgs = [
    { who:'sys',  body:'5월 11일 (월요일)' },
    { who:'박유진', tone:'pink',   ts:'09:30', body:'다들 출근하셨나요? 오늘 박철홍 원장님 회의는 10시예요.' },
    { who:'이현우', tone:'blue',   ts:'09:32', body:'네 — 회의실 예약 완료했습니다.', reactions:[{e:'👍',n:2}] },
    { who:'me',                    ts:'09:35', body:'회의록 템플릿 공유드릴게요.' },
    { who:'me',                    ts:'09:36', body:'https://share.mso/doc/m-0511' },
    { who:'박유진', tone:'pink',   ts:'13:08', body:'점심 후 다시 모일까요?', reactions:[{e:'🙏',n:1}] },
    { who:'이현우', tone:'blue',   ts:'14:24', body:'@백정민 오전 회의록 공유 부탁드려요 — 박원장 결재 올려야 합니다.' },
    { who:'me',                    ts:'14:25', body:'네 곧 올릴게요 👍' },
  ];
  return (
    <div className="m-screen">
      <div className="m-header" style={{paddingBottom: 10}}>
        <button className="back" onClick={onBack}><MIcon name="chevL" size={22}/></button>
        <MAvatar tone="blue" size="sm">경</MAvatar>
        <div style={{flex:1, minWidth:0, marginLeft:4}}>
          <div className="title" style={{fontSize:15}}>경영지원팀</div>
          <div className="sub" style={{display:'flex', alignItems:'center', gap:5}}>
            <span style={{width:6, height:6, borderRadius:999, background:'var(--success)'}}/>
            6명 · 4명 온라인
          </div>
        </div>
        <div className="actions">
          <button><MIcon name="search" size={20}/></button>
          <button><MIcon name="moreV" size={20}/></button>
        </div>
      </div>

      <div className="m-scroll" style={{background:'var(--bg)', padding:'12px 12px 6px'}}>
        {msgs.map((m, i) => {
          if (m.who === 'sys') return (
            <div key={i} style={{textAlign:'center', margin:'10px 0'}}>
              <span style={{display:'inline-block', padding:'4px 12px', borderRadius:999, background:'var(--z-200)', fontSize:11, fontWeight:800, color:'var(--z-600)'}}>{m.body}</span>
            </div>
          );
          const mine = m.who === 'me';
          return (
            <div key={i} style={{display:'flex', gap:8, marginBottom:8, justifyContent: mine ? 'flex-end' : 'flex-start'}}>
              {!mine && <MAvatar tone={m.tone} size="sm">{m.who.charAt(0)}</MAvatar>}
              <div style={{maxWidth:'72%', display:'flex', flexDirection:'column', alignItems: mine ? 'flex-end' : 'flex-start'}}>
                {!mine && <div style={{fontSize:11, fontWeight:700, color:'var(--z-600)', marginBottom:3, padding:'0 4px'}}>{m.who}</div>}
                <div style={{display:'flex', alignItems:'flex-end', gap:6, flexDirection: mine ? 'row' : 'row'}}>
                  {mine && <span style={{fontSize:10, color:'var(--z-400)', fontWeight:600, whiteSpace:'nowrap'}}>{m.ts}</span>}
                  <div style={{
                    padding:'10px 14px', borderRadius: 16,
                    background: mine ? 'var(--accent)' : 'var(--card)',
                    color: mine ? '#fff' : 'var(--z-900)',
                    border: mine ? 0 : '1px solid var(--border)',
                    borderBottomRightRadius: mine ? 4 : 16,
                    borderBottomLeftRadius:  mine ? 16 : 4,
                    fontSize: 14, lineHeight: 1.5, fontWeight: 500,
                    wordBreak: 'break-word',
                  }}>{m.body}</div>
                  {!mine && <span style={{fontSize:10, color:'var(--z-400)', fontWeight:600, whiteSpace:'nowrap'}}>{m.ts}</span>}
                </div>
                {m.reactions && (
                  <div style={{display:'flex', gap:4, marginTop:4}}>
                    {m.reactions.map((r,j) => (
                      <span key={j} style={{
                        display:'inline-flex', alignItems:'center', gap:3,
                        padding:'2px 7px', borderRadius:999,
                        background:'var(--accent-tint)', color:'var(--accent)',
                        fontSize:11, fontWeight:700,
                      }}>{r.e} {r.n}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 컴포저 */}
      <div style={{background:'var(--card)', borderTop:'1px solid var(--border)', padding:'8px 12px 12px'}}>
        <div style={{
          display:'flex', alignItems:'center', gap:6,
          background:'var(--bg)', borderRadius: 22, padding:'4px 6px 4px 12px',
        }}>
          <button style={{width:32, height:32, display:'grid', placeItems:'center', color:'var(--z-500)'}}><MIcon name="plus" size={20}/></button>
          <input placeholder="#경영지원팀에 메시지 보내기" style={{flex:1, padding:'8px 4px', fontSize:14, fontFamily:'inherit'}}/>
          <button style={{width:32, height:32, display:'grid', placeItems:'center', color:'var(--z-500)'}}><MIcon name="smile" size={20}/></button>
          <button style={{width:36, height:36, borderRadius:'50%', background:'var(--accent)', color:'#fff', display:'grid', placeItems:'center'}}><MIcon name="send" size={16}/></button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 5. 게시판 — 목록
// ═══════════════════════════════════════════════════════════════
const SBoard = ({ onOpen, onNav }) => {
  const [cat, setCat] = React.useState('all');
  const CATS = [
    { id:'all',    label:'전체',     cnt: 24 },
    { id:'notice', label:'공지',     cnt: 4  },
    { id:'free',   label:'자유',     cnt: 8  },
    { id:'op',     label:'수술일정',  cnt: 6  },
    { id:'mri',    label:'MRI일정',  cnt: 3  },
    { id:'share',  label:'업무공유',  cnt: 3  },
  ];
  const posts = [
    { id:1, cat:'notice', star:true,  pin:true,  title:'[공지] 신규 메신저 출·퇴근 기능 활용 및 선불출 제한 안내', who:'이재훈', dept:'경영지원팀', ts:'5/4',  v:67, c:5, tags:['공지','출퇴근'] },
    { id:2, cat:'notice', star:false, pin:true,  title:'일부 근무자 근무시간 변경 안내', who:'백민', dept:'경영지원팀', ts:'4/13', v:113, c:8, badge:'중요', tags:['근태','중요'] },
    { id:3, cat:'free',   star:false, pin:false, title:'5월 2주차 식단표 — 채식 옵션 포함', who:'박유진', dept:'경영지원팀', ts:'5/11', v:17, c:1, tags:['식단'] },
    { id:4, cat:'free',   star:true,  pin:false, title:'칭찬합니다. — 5월 첫 주 친절 직원', who:'홍자비', dept:'경영지원팀', ts:'4/30', v:84, c:7, tags:['칭찬'] },
    { id:5, cat:'op',     star:false, pin:false, title:'5월 12일 수술 일정 (3건) — 박원장', who:'시스템', dept:'OP실', ts:'5/11', v:23, c:0, tags:['수술'] },
    { id:6, cat:'share',  star:false, pin:false, title:'환자 동의서 양식 업데이트 v2.1', who:'김상민', dept:'행정',  ts:'5/8',  v:51, c:3, tags:['양식','중요'] },
  ];
  const filtered = cat === 'all' ? posts : posts.filter(p => p.cat === cat);
  return (
    <div className="m-screen">
      <MHeader title="게시판" sub="박철홍정형외과" actions={<>
        <button><MIcon name="search" size={20}/></button>
        <button onClick={()=>onNav && onNav('form-post')}><MIcon name="edit" size={20}/></button>
      </>}/>
      <div className="m-chip-bar">
        {CATS.map(c => (
          <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={()=>setCat(c.id)}>
            {c.label}<span className="cnt">{c.cnt}</span>
          </button>
        ))}
      </div>
      <div className="m-scroll">
        <div style={{padding:'12px 16px', display:'flex', flexDirection:'column', gap:10}}>
          {filtered.map(p => (
            <div key={p.id} onClick={()=>onOpen(p.id)} className="m-card" style={{padding:'14px 16px'}}>
              <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:6}}>
                {p.pin && <MIcon name="pin" size={12} color="var(--accent)"/>}
                <MChip tone={p.cat === 'notice' ? 'accent' : p.cat === 'share' ? 'warning' : p.cat === 'op' ? 'success' : ''}>
                  {CATS.find(c=>c.id===p.cat)?.label || p.cat}
                </MChip>
                {p.badge && <MChip tone="danger">{p.badge}</MChip>}
                <div style={{flex:1}}/>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{p.ts}</span>
              </div>
              <div style={{fontSize:14, fontWeight:800, letterSpacing:'-0.018em', lineHeight:1.45, color:'var(--z-900)'}}>{p.title}</div>
              <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8, fontSize:11, color:'var(--z-500)', fontWeight:600}}>
                <MAvatar tone={['blue','pink','violet','orange','cyan'][p.id%5]} size="sm" style={{width:22, height:22}}>
                  {p.who.charAt(0)}
                </MAvatar>
                <b style={{color:'var(--z-700)'}}>{p.who}</b>
                <span style={{color:'var(--z-400)'}}>·</span>
                <span>{p.dept}</span>
                <div style={{flex:1}}/>
                <span style={{display:'inline-flex', alignItems:'center', gap:3}}>
                  <MIcon name="user" size={11}/>{p.v}
                </span>
                <span style={{display:'inline-flex', alignItems:'center', gap:3, color: p.c > 0 ? 'var(--accent)' : 'var(--z-500)'}}>
                  <MIcon name="chat" size={11}/>{p.c}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// 6. 게시판 — 상세
// ═══════════════════════════════════════════════════════════════
const SBoardDetail = ({ onBack }) => (
  <div className="m-screen">
    <MHeader back={onBack} title="공지사항" actions={<>
      <button><MIcon name="bookmark" size={20}/></button>
      <button><MIcon name="share" size={20}/></button>
      <button><MIcon name="moreV" size={20}/></button>
    </>}/>
    <div className="m-scroll">
      <div style={{padding:'16px 16px 0'}}>
        <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:10}}>
          <MChip tone="accent">공지</MChip>
          <MChip tone="danger">중요</MChip>
          <div style={{flex:1}}/>
          <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600, display:'inline-flex', gap:3, alignItems:'center'}}>
            <MIcon name="user" size={11}/>67
            <MIcon name="chat" size={11} style={{marginLeft:6}}/>5
          </span>
        </div>
        <h1 style={{fontSize:21, fontWeight:800, letterSpacing:'-0.028em', lineHeight:1.35}}>
          [공지] 신규 메신저 출·퇴근 기능 활용 및 선불출 제한 안내
        </h1>
        <div style={{display:'flex', alignItems:'center', gap:8, marginTop:14, paddingBottom:14, borderBottom:'1px solid var(--border)'}}>
          <MAvatar tone="blue" size="sm">이</MAvatar>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:800}}>이재훈 <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>· 경영지원팀 이사</span></div>
            <div style={{fontSize:11, color:'var(--z-500)', marginTop:1}}>2026년 5월 4일 오전 10:24 · 조회 67</div>
          </div>
        </div>

        <div style={{padding:'16px 0', fontSize:14, color:'var(--z-700)', lineHeight:1.75, fontWeight:500}}>
          <p>안녕하세요, 경영지원팀입니다.</p>
          <p style={{marginTop:12}}>5월 1일부터 메신저 내에서 출퇴근 체크인 기능이 새로 추가되었습니다. 기존 카드 태깅 방식과 병행 운영되며, 다음 사항을 안내드립니다.</p>
          <ul style={{marginTop:12, paddingLeft:18, display:'flex', flexDirection:'column', gap:6}}>
            <li>병원 GPS 인증 거리 100m 이내에서만 체크인 가능</li>
            <li>외출/복귀는 사유 첨부 필수 (점심시간 제외)</li>
            <li>야간 당직은 별도 메신저 채널에서 시작·종료 보고</li>
          </ul>
          <p style={{marginTop:12}}>또한 비품 선불출(미결재 임의 출고)에 대한 제한이 강화됩니다. 자세한 내용은 첨부 파일을 확인해주세요.</p>
        </div>

        {/* 첨부 */}
        <div className="m-card flush" style={{marginBottom:16}}>
          <div style={{padding:'12px 14px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--border)'}}>
            <div className="ico-tile tone-accent" style={{width:36, height:36, borderRadius:8, background:'var(--accent-soft)', color:'var(--accent)', display:'grid', placeItems:'center'}}>
              <MIcon name="fileText" size={18}/>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:13, fontWeight:700, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>출퇴근_운영지침_v3.pdf</div>
              <div style={{fontSize:11, color:'var(--z-500)', marginTop:1}}>248KB · PDF</div>
            </div>
            <MIcon name="download" size={18} color="var(--z-500)"/>
          </div>
        </div>

        {/* 댓글 */}
        <div className="m-section-h" style={{marginBottom:10}}><div className="lbl">댓글 5</div></div>
        {[
          { who:'박유진', tone:'pink',  ts:'5/4 11:20', body:'안내 감사합니다. GPS 인증 거리 100m면 주차장에서도 가능한가요?' },
          { who:'이재훈', tone:'blue',  ts:'5/4 11:35', body:'네, 병원 좌표 기준 반경 100m라 주차장 대부분 포함됩니다.', mine: false },
          { who:'홍자비', tone:'violet',ts:'5/4 13:08', body:'잘 받았습니다 👍' },
        ].map((c, i) => (
          <div key={i} style={{display:'flex', gap:10, marginBottom:14}}>
            <MAvatar tone={c.tone} size="sm">{c.who.charAt(0)}</MAvatar>
            <div style={{flex:1}}>
              <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                <b style={{fontSize:12, fontWeight:800}}>{c.who}</b>
                <span style={{fontSize:11, color:'var(--z-500)', fontWeight:600}}>{c.ts}</span>
              </div>
              <div style={{fontSize:13, color:'var(--z-800)', marginTop:3, lineHeight:1.55}}>{c.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
    {/* sticky 댓글 입력 */}
    <div className="m-sticky-foot">
      <div style={{flex:1, display:'flex', alignItems:'center', gap:6, background:'var(--bg)', borderRadius:22, padding:'4px 6px 4px 12px'}}>
        <input placeholder="댓글 입력" style={{flex:1, padding:'8px 0', fontSize:14, fontFamily:'inherit'}}/>
        <button style={{width:32, height:32, borderRadius:'50%', background:'var(--accent)', color:'#fff', display:'grid', placeItems:'center'}}><MIcon name="send" size={14}/></button>
      </div>
    </div>
  </div>
);

Object.assign(window, { SHome, SAttend, SAlert, SChatList, SChatRoom, SBoard, SBoardDetail });
